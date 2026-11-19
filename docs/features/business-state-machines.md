---
sidebar_position: 12
title: Business State Machines
description: Experimental transition protocol for shared business states, integration-specific policy profiles, nested child machines and retained compensation in embedded Laravel workflows.
---

# Business State Machines

:::warning Experimental

The `Workflow\V2\StateMachine` API, and the retained compensation-scope API and
confirmed child start (`Workflow::startChild()`) it uses, are experimental. They
ship experimentally from Workflow 2.29.0, are not covered by the package's
stability guarantees, and may change in a minor release. They are an
`experimental` surface under the
[stability levels](../compatibility.md#stability-levels).

The examples on this page are repository source examples with synthetic
providers. They are not installed-package or real-provider qualification.
Nothing on this page implies:

- migration of an in-flight execution to a new definition, profile, rule or
  handler version;
- recursive or shared child machines;
- guarantees for any real payment, carrier or warehouse provider;
- that the business state-machine feature is complete or has a stable release.

:::

This guide covers the optional business transition protocol for embedded Laravel
workflows using `Workflow\V2\Workflow`. It is built from existing primitives:
activities, child workflows, durable waits, replay and [Saga](sagas.md)
compensation. Existing workflows and `Workflow\States\StateMachine` are
unchanged.

## When to use it

Use the protocol when business states have one shared meaning but the way to
reach them differs between integrations:

- **Shared machine meanings.** One `MachineDefinition` declares the state
  meanings, transition identities, a mandatory invariant and named child slots.
- **Integration-specific policies.** Each `PolicyProfile` chooses its edges,
  handler versions and named conditions within that definition. One integration
  can require an external operation before a transition; another can already
  supply the evidence and skip the work.
- **Nested child machines.** An Order can host a Shipment machine while it is in
  a declared state. The binding keeps the child's original identity across
  retries, state changes and worker restarts.
- **Protected business decisions.** The new business state is committed through
  an application-owned boundary that checks the expected state, revision and
  accepted cancellation.
- **Retained compensation.** Obligations can outlive the run that created them
  through retained compensation scopes.

If one workflow with a saga is enough, use [Sagas](sagas.md) and
[Child Workflows](child-workflows.md) directly.

## The transition contract

Every transition handler implements the same four methods, whatever the machine
or integration:

```php
interface TransitionStep
{
    public function canTransition(TransitionContext $context): bool;
    public function canExecute(TransitionContext $context): bool;
    public function execute(TransitionContext $context): ExecutionReceipt;
    public function compensate(TransitionContext $context, ExecutionReference $originalExecution): void;
}
```

- `canTransition()` answers whether the target is already reached. It is a pure
  projection of the recorded target assessment.
- `canExecute()` answers whether the work is permitted. It is a pure projection
  of the recorded permission assessment.
- `execute()` orchestrates recorded activities or durable waits and returns an
  `ExecutionReceipt`. The receipt acknowledges the work; it does not establish
  readiness to commit.
- `compensate()` receives the original `ExecutionReference`. Return only after
  the required effects, or their absence, are verified. Unknown or pending work
  must wait or fail explicitly, never return successfully.

Extend `AssessedTransitionStep` to implement the two guards directly from the
recorded snapshot. The runner rejects a custom guard that contradicts the
recorded assessment.

## How the runner executes a transition

`TransitionRunner::run()` takes the workflow, the pinned profile, the original
`ExecutionReference`, the event, a `TransitionRuntime` and a closed handler
registry. It then:

1. Selects the unique edge for the event and source state. No candidate returns
   `Unavailable`; several return `Ambiguous`.
2. Requests a recorded `before` snapshot and, when the profile has a
   definition, checks its shared invariant. An unsatisfied invariant returns
   `Blocked`; an unknown one returns `Unknown`.
3. Checks the target guard. A satisfied target skips the work but still goes
   through the protected commit; skipping does not adopt ownership of external
   effects that already exist. An unknown target returns `Unknown`.
4. Returns `Pending` when the edge declares no work. Otherwise it checks the
   execution guard and records live admission. A refusal returns `Blocked`; an
   unknown answer returns `Unknown`.
5. Registers the original step's compensation with native Saga, then calls
   `execute()`.
6. Requests a fresh `after` snapshot and checks the invariant and target again.
   A stale source state or revision returns `Conflict`, an unsatisfied result
   `Pending` and an unknown one `Unknown`. A satisfied target proceeds to the
   protected commit.
7. Commits through the runtime, which reports `Committed`, `Conflict` or
   `CancellationRequested`.

`TransitionStatus` values are processing outcomes, not your business state
catalogue. The runner never retries a whole transition and never compensates a
blocked transition by itself. The application decides whether to wait, retry,
reconcile or compensate. A result is not permission to close the owning
workflow: keep it open while forward work or compensation obligations remain.

`ActivityTransitionRuntime` implements `TransitionRuntime` with three
application activities (snapshot, admission and commit) and an optional
`MachineDefinition`. It uses ordinary activity history and adds no worker
command or history event. In the configured Order/Shipment example, every
transition goes through the same runner call:

```php
return (new TransitionRunner())->run(
    $this->workflow,
    $this->profile,
    $execution,
    Catalogue::transition($this->profile, $key)->event,
    new ActivityTransitionRuntime(
        SnapshotActivity::class,
        AdmissionActivity::class,
        CommitActivity::class,
        $this->profile->definition
    ),
    $handlers
);
```

The three activity classes are application code, not package classes.

## Definitions, profiles and versions

A `MachineDefinition` holds what every integration shares. The example's
version-two definition declares four states, the transition identities, an
invariant rule and the Shipment child slot:

```php
return new MachineDefinition(
    $machine,
    '2',
    [
        new MachineState('received', 'Business input accepted; completion has not been committed.'),
        new MachineState('working', 'Original work admitted; business completion remains pending.'),
        new MachineState('completed', 'The original execution has verified its required business outcome.'),
        new MachineState('cancelled', 'Original compensation verified and business cancellation committed.'),
    ],
    $machine === 'orders' ? ['begin', 'finish', 'cancel', 'reconcile'] : ['deliver'],
    self::fact('model_consistent'),
    $machine === 'orders' ? [
        new ChildSlot('shipment', ['received', 'working'], 'shipments', '2', 'completed'),
    ] : []
);
```

`PolicyProfile::forDefinition()` attaches an integration's
`TransitionDefinition` edges and named conditions to that definition. A profile
cannot add an undeclared state or transition identity, and named profile
conditions cannot replace the shared invariant.

Versioning follows these rules:

- **Fingerprints.** The definition fingerprint covers state meanings, the
  invariant and slot declarations. The profile fingerprint covers the
  definition and profile metadata, the graph, condition structures, handler
  versions and any limits. Neither hashes PHP implementations.
- **Pinned executions.** An `ExecutionReference` pins the scope, business
  subject, execution ID, policy fingerprint, expected source state and revision.
  Record the selected fingerprint before work starts and supply it again on
  replay. Never compute it from the newest configuration when resuming.
- **New executions only.** A new definition or profile version is selected for
  new executions. Rewriting a running subject's assignment changes its
  fingerprint, and the original execution then refuses. There is no in-flight
  migration API.
- **Retained implementations.** Keep old definitions, rules, handlers and
  authorization versions deployed while their executions or retained obligations
  remain recoverable. Handlers come from a closed type/version registry keyed by
  `TransitionDefinition::handlerKey()`. Stored data cannot select a PHP class,
  and a missing handler fails before any application I/O.

See [Versioning](versioning.md) for the general rules of changing workflow code.

## Rules, conditions and recorded facts

Configuration selects conditions; rule implementations stay trusted application
code. A `RuleRegistry` built in trusted bootstrap maps a rule type and version to a `ConditionRule` object. A
`RuleReference` pins the type, version and parameters, and
`ConditionDefinition::rule()`, `all()`, `any()` and `not()` combine those leaves.
A condition has at most 64 nodes.

Decisions have three values: `Verdict::Satisfied`, `Verdict::Unsatisfied` and
`Verdict::Unknown`. For `all()`, an unsatisfied child makes the group
unsatisfied; otherwise an unknown child makes it unknown. For `any()`, a
satisfied child makes the group satisfied; otherwise an unknown child makes it
unknown. Negating unknown stays unknown.

Facts are collected only in the recorded snapshot activity. The example's
`AssessmentStore` records the facts with evidence references and evaluates the
profile's target and permission conditions:

```php
$facts = new RecordedFacts($id, $values, array_combine(array_keys($values), array_map(
    static fn (string $name): string => 'recorded-fact:' . $id . ':' . $name,
    array_keys($values)
)));
$registry = Catalogue::registry();
$target = $registry->evaluateCondition($profile->condition($transition->key . '.target'), $facts);
$permission = $registry->evaluateCondition($profile->condition($transition->key . '.permission'), $facts);
```

When the profile has a definition, the same activity evaluates
`MachineDefinition::assess()` and returns
`MachineAssessment::fromEvaluation()` as the snapshot's `machineAssessment`.
Retain the complete `ConditionEvaluation::toArray()` explanation with the
snapshot. A missing assessment, a changed definition or a changed condition
refuses before work. A recorded assessment is host evidence, not authorization:
the protected commit must still check live authority, revision and cancellation.

## Deterministic replay

The protocol relies on recorded history, so the usual
[workflow constraints](../constraints/workflow-constraints.md) apply strictly:

- Guards and rules perform no I/O. They do not read the database,
  configuration, a provider or the container.
- Live reads happen inside the snapshot activity. On replay, completed
  activities return their recorded results; rules are not re-evaluated against
  live data.
- An `after` snapshot must use a different snapshot ID and freshly collected
  facts. `SnapshotPhase` separates `before`, `after` and `compensation`
  evidence, so one phase cannot stand in for another.
- `execute()` and `compensate()` call activities. Wrap a synchronous provider
  or application handler in an activity; calling it directly from workflow code
  can repeat its effects during replay.
- Admission records authority and permission only. It must not perform the
  forward business effect before Saga registration.
- Use `TransitionResult::toArray()` across workflow and history boundaries.
  Application domain objects stay behind your step and runtime adapters.

## Protected business commits

The commit activity is the application's business authority. It must:

1. Bind the decision ID to its scope, subject, policy, transition and content.
   An exact duplicate returns the recorded result; reusing the ID for other
   content refuses.
2. Re-check live authority, the expected source state and revision, and any
   accepted cancellation under the application's authoritative lock.
3. Atomically record the business state, the decision and any publication
   intent when they share a store.
4. After a lost acknowledgement, look up or retry that exact decision instead of
   repeating effects.

It returns a `CommitResult` with `committed`, `conflict` or
`cancellation_requested`. The last status means accepted cancellation prevented
this commit. It does not mean that compensation finished or that the business
entity is cancelled. No distributed transaction is implied between the
application store and Durable Workflow.

## Child machines bound to parent states

A `ChildSlot` in the parent definition names the slot, its hosting states, the
child machine and definition version, and the required business outcome.
`MachineDefinition::assertBinding()` checks a binding against that declaration.
It performs no lookup, authorization or admission.

A `BindingIdentity` pins the original parent execution, namespace, parent
instance and run, slot, **generation**, hosting state, child workflow type, child
policy fingerprint, required outcome, input fingerprint and child options. The
generation identifies one state entry. Requests for an old generation never
redirect to a newer child after the parent changes or re-enters a state.

Starting and awaiting a child are separate transitions:

- **Start.** The parent reserves and admits the child, records the exact
  binding, and only then commits the hosting state. If the binding is already
  recorded, the step reuses it instead of starting again. With retained scopes,
  `DurableScope::reserveChild()` returns a `ChildReservation`, and
  `ChildReservation::start()` uses the confirmed native child start.
  `ChildReservationStore::close()` later returns either the admitted
  `ChildBinding` or a permanent `NeverAdmittedChild`.
- **Await.** A later transition observes that same admission. It creates neither
  a second child nor a second compensation owner.

The example's shared step shows both transitions:

```php
if ($key === 'begin') {
    $childScope = Ownership::childScope($execution);
    $reservation = $this->scope->reserveChild(
        $execution->executionId . '.shipment',
        $childScope,
        Ownership::binding(
            $execution,
            $this->initialization['rootRun'],
            $this->initialization['integration'],
            $this->initialization['version']
        )
    );
    $existing = Workflow::activity(BoundaryActivity::class, 'binding', [
        'reservation' => $reservation->toArray(),
    ]);
    if ($existing === null) {
        $reservation->start(
            $execution->subject,
            $this->initialization['rootRun'],
            $execution->toArray(),
            $childScope->toArray()
        );
        $existing = Workflow::activity(BoundaryActivity::class, 'record-start', [
            'reservation' => $reservation->toArray(),
        ]);
    }
    $binding = ChildBinding::fromArray($existing);
    $operations[] = 'child:' . $binding->admission->childRunId;
} elseif ($key === 'finish') {
    $value = Workflow::activity(BoundaryActivity::class, 'active-binding', []);
    $binding = ChildBinding::fromArray($value);
    $outcome = StartedChildWorkflow::fromArray($binding->admission->toArray())->await();
    Workflow::activity(BoundaryActivity::class, 'outcome', [
        'binding' => $value,
        'outcome' => $outcome,
    ]);
} elseif ($key !== 'deliver') {
    throw new LogicException('A proof-only transition must not dispatch work.');
}
```

Without a reservation, `Workflow::startChild()` returns a `StartedChildWorkflow`
receipt that a later step can `await()`. The parent must verify the child's
business outcome; technical child completion, an accepted signal or a timeout is
not enough. `Workflow::startChild()` is embedded-only; worker-protocol
execution refuses it.

## Compensation and retained scopes

The runner registers the original step with native Saga before `execute()` can
suspend or fail. The callback captures the original execution and step, not the
receipt. During compensation, the runner requests a fresh `compensation`
snapshot and calls `compensate()` with the original execution. Use the default
sequential compensation.

A run-local Saga callback ends with its run. Retained compensation scopes
(`Workflow\V2\Compensation`, also experimental) keep each obligation in a
durable ledger, so it can be compensated after the originating run closes. The
engine repository's
[compensation scopes guide](https://github.com/durable-workflow/workflow/blob/main/docs/compensation-scopes.md)
describes that API. In the examples, every external effect is registered as an
`Obligation` through `DurableScope::execute()` before it is dispatched, and a
child scope is verified before earlier parent effects are undone. The step's
own compensation then verifies only its original obligations:

```php
public function compensate(TransitionContext $context, ExecutionReference $originalExecution): void
{
    Workflow::activity(RequestScopeActivity::class, $this->identity->toArray(), $this->principal);
    // Scope callbacks registered within execute() run first. Check only this step's original subset:
    // verifying the whole scope here would block earlier steps before their callbacks can run.
    Workflow::activity(BoundaryActivity::class, 'verify-step', [
        'execution' => $originalExecution->toArray(),
        'key' => $context->transition->key,
    ]);
}
```

Business cancellation is a separate decision. In the examples, a proof-only
transition commits `cancelled` only after the retained scope verifies. A
technical cancellation, a queued recovery request or failed compensation does
not establish it. The current retained graph has one parent/child level, at most
16 children and 256 obligations per scope. Root and child forward ownership do
not transfer to continue-as-new or redrive successors, and retention release
stays explicit.

## Budgets and explicit outcomes

Trusted configuration can bound a machine:

- `DefinitionLimits` (`states`, `transitions`, `childSlots`, `ruleNodes`) is
  passed to `MachineDefinition` as `limits:`. Each bound profile also checks its
  expanded source edges and total condition nodes.
- `ExecutionLimits` (`commands`, `historyEvents`, `historyBytes`, `groupDepth`)
  is attached with `PolicyProfile::withLimits()` or the `limits:` argument of
  `PolicyProfile::forDefinition()`. The command budget covers every durable
  suspension inside `TransitionRunner`, up to 4,096 commands and 64 group levels.
  History values are admission thresholds measured with
  `Workflow::historyBudgetAtStep()` before each command, not absolute ceilings.

Both limits enter their fingerprints. Omitting them keeps earlier fingerprints;
adding or changing a budget requires an explicitly selected version for new
executions.

A budget reached during execution returns `TransitionStatus::Blocked` with the
reason `state_machine_<dimension>_limit_exceeded`. An invalid definition raises
`ResourceLimitExceeded` with the dimension, observed count and limit before any
handler runs. Neither outcome means that cancellation succeeded or that an
earlier external effect did not happen. `Workflow::compensate()` runs outside
the forward budgets.

## Diagnostics

- `TransitionResult::toArray()` returns the execution, status, reason,
  assessment and transition key.
- `ConditionEvaluation::toArray()` keeps the structure fingerprint, snapshot ID,
  rule versions, reasons, evidence references and missing facts.
- `MachineAssessment::toArray()` records the invariant decision bound to the
  definition and snapshot.
- `ResourceLimitExceeded` exposes `dimension`, `observed` and `limit`.
- `ScopeRecovery::describe()` reports the state of a retained scope, including
  when a fresh authorized cancellation request is needed.

## Runnable examples

The examples live in the workflow repository and run against its development
dependencies and test database. They use their own disposable application
tables, not package migrations.

| Example | What it demonstrates |
| --- | --- |
| [Configured Order and Shipment](https://github.com/durable-workflow/workflow/blob/main/examples/configured-state-machines/README.md) | Two integration profiles, `prepare` and `imported`, with the same states and one shared step. Preparation hosts Shipment in `working`; import hosts it in `received`. A proof-only `reconcile` edge skips work when evidence exists. Version two adds shared definitions for new subjects while version one stays pinned. Includes child reservation, retained compensation and cancellation finalization. |
| [Provider-backed Order, Payment and Shipment](https://github.com/durable-workflow/workflow/blob/main/examples/provider-state-machines/README.md) | Three machines on the same protocol against a synthetic provider journal. Recipes cover reservation-first and payment-first checkout, refund outcomes, authorization and capture after stock or delivery, bank, COD, advance-and-balance and subscription funding, Cart leases, unit money, partial stock, returns, exchanges, carrier incidents and worker-loss recovery. |
| [SQL business decisions](https://github.com/durable-workflow/workflow/blob/main/examples/business-state-machines/README.md) | An application-owned protected commit with SQL fencing for cancellation, revision conflicts, authority revocation, publication intent and lost acknowledgements, plus native nested Order and Shipment compensation. |

Run the configured example's tests from the workflow repository:

```shell
vendor/bin/phpunit tests/Feature/V2/V2ConfiguredStateMachineExampleTest.php
```

All three use synthetic or same-database providers. They do not qualify a real
carrier, payment provider or warehouse, an installed package upgrade, or
in-flight migration. A real integration must supply its own idempotency,
fencing and reconciliation of uncertain results.

The engine repository's
[business state-machine reference](https://github.com/durable-workflow/workflow/blob/main/docs/business-state-machines.md)
documents the complete contract, including the activity payload shapes. Delivery
status is tracked in
[durable-workflow/workflow#1069](https://github.com/durable-workflow/workflow/issues/1069).
