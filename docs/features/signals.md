---
sidebar_position: 1
title: Signals
description: Send typed external commands into running workflows and understand signal validation, routing, and waits.
tags:
  - commands
  - signals
  - human-in-the-loop
keywords:
  - workflow signals
  - signal command
  - human in the loop workflow
---

import SignalSimulator from '@site/src/components/SignalSimulator';

# Signals

Signals allow you to trigger events in a workflow from outside the workflow. This can be useful for reacting to external events, enabling *human-in-the-loop* interventions, or for signaling the completion of an external task. For repeated ordered inputs with durable cursor advancement, use [Message Streams](./message-streams.md).

## Namespace boundary {#namespace-boundary}

An ordinary signal targets a workflow in the client's namespace. A child
handle also retains its original namespace. Use a
[service operation](./service-operations.md) for an operation published in
another namespace; changing a workflow id or queue is not cross-namespace
authority.

## Acceptance and closure

`signal_received` confirms durable acceptance. It does not confirm that workflow
code processed the signal. Inspect the signal's retained status and history when
the business operation needs confirmation.

With Core 2.7.0 or a compatible Server, eligible signals accepted during a remote
workflow task get a delivery turn before successful closure. Received signals
addressed to the instance and declared by its command contract carry across [continue-as-new](./continue-as-new.md)
with their original identity, arguments and ordering. A signal addressed to a
specific run never moves to another run.

Runs without a durable signal declaration do not gain one from a worker's
later registration. If the runtime cannot establish delivery, the accepted
signal closes with the explicit rejected disposition below.

If a run closes without applying a signal, its status becomes `rejected` with
`run_closed_before_signal_applied`, a closed timestamp and a `SignalRejected`
history event. This includes an unused buffered signal at ordinary completion
and signals that cannot be applied before failure, cancellation or timeout.
The earlier acceptance receipt remains valid. Use an [update](./updates.md) when
the caller needs a retained processing result, rather than an acceptance alone.

Before upgrading a writer to Core 2.7.0, drain and upgrade every embedded or
direct-database reader, including Waterline when it reads the same database.
Older readers cannot decode `SignalRejected`; do not leave them running against
the new writer or roll back a reader after that event has been stored.

## Named Signal Waits

A workflow calls `await('signal-name')` directly. The next accepted signal command with that name resumes the run and returns a deterministic value to the suspended workflow.

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string'],
])]
final class OrderApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $approvedBy = await('approved-by');

        return [
            'approved_by' => $approvedBy,
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

Trigger the signal from PHP by addressing the public instance id:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptSignalWithArguments('approved-by', [
    'approvedBy' => 'Taylor',
]);

$result->accepted();    // true
$result->outcome();     // "signal_received"
$result->commandId();   // Durable signal-command id
$result->instanceId();  // "order-123"
```

Signal behavior:

- Declare each external signal name up front with a repeatable `#[Signal('signal-name')]` class attribute. Optionally include an ordered parameter contract.
- Signal commands target the public workflow instance id — not a run id — so continue-as-new chains keep the same public signal route.
- With a parameter contract, intake rejects invalid payloads as `rejected_invalid_arguments` with machine-readable `validation_errors`.
- Without a contract, `await('name')` returns `true` when no arguments were sent, the single argument when one was sent, or the full argument array when several were sent.
- Unknown signal names reject as `rejected_unknown_signal`; signals against a closed or unstarted instance reject as `rejected_not_active` or `rejected_not_started`.

## Start and signal in one operation {#signal-with-start}

`signalWithStart()` starts the workflow or reuses its open run, and records the
signal on that run, in one transaction. A separate `start()` followed by
`signal()` leaves a gap in which the run can close and the signal is refused:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$result = WorkflowStub::make(OrderApprovalWorkflow::class, 'order-123')
    ->signalWithStart('approved-by', ['approvedBy' => 'Taylor'], StartOptions::returnExistingActive());

$result->startOutcome(); // "started_new" or "returned_existing_active"
```

When the current run has closed, embedded signal-with-start starts a new run
after it, and the closed run keeps its outcome. Service-mode clients use the
Server's signal-with-start, which needs native Server 3.15.0 or later and
refuses a closed run unless the caller asks for a new one. See [signal-with-start](/docs/polyglot/workflow-signals#signal-with-start)
for the PHP, Python and Rust SDK calls.

## Signal another workflow {#signal-another-workflow}

:::note Pending release
Durable signal-external for embedded workflows is in
[Workflow #1247](https://github.com/durable-workflow/workflow/pull/1247) and has not been released. Its API is
experimental.
:::

Workflow code can signal another workflow in its namespace with
`signalExternalWorkflow()`. This workflow records the request once and waits.
After that commits, the runtime admits the signal on the target and records
the outcome in this workflow's history, retrying database conflicts instead of
failing either workflow. Replay returns the recorded outcome without sending
again:

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\signalExternalWorkflow;

#[Type('order-approver')]
final class OrderApproverWorkflow extends Workflow
{
    public function handle(string $orderId): array
    {
        $result = signalExternalWorkflow($orderId, 'approved-by', ['Taylor']);

        if (! $result->delivered()) {
            // target_not_found, target_closed or rejected, with a reason
            return ['skipped' => $result->outcome->value, 'reason' => $result->reason];
        }

        return ['delivered_to' => $result->targetRunId];
    }
}
```

- A missing, closed or refusing target is a returned `ExternalSignalResult`,
  not an exception. The outcomes and reasons match the Server's, listed in the
  [service-mode guide](/docs/polyglot/workflow-signals#signal-another-workflow).
- Pass a run ID as the fourth argument to signal only that run. A child's
  handle has `signalDurably()`, for example
  `$this->lastChild()->signalDurably('approved-by', 'Taylor')`. The handle's
  `signal()` still sends directly, outside the parent's history, and can send
  again when the parent replays.
- On the target it is an ordinary signal attributed to the sending run, keyed
  `workflow-signal:<sender run id>:<sequence>`. Applications cannot use that
  request-ID prefix.
- The signal name follows the Server's rules (not blank, no control
  characters, at most 191 characters and 255 bytes). A refused name throws
  `InvalidExternalSignalException` in workflow code before anything is
  recorded.
- Changing the target, run, signal name or arguments at a recorded step blocks
  replay as a history shape mismatch.

Signals stay within the namespace. Use a
[service operation](./service-operations.md) to reach another namespace. Use an
activity when you need signal-with-start from workflow code, and give it a
stable request ID so that a retried activity does not signal twice.

## Evolve a signal payload {#evolve-a-signal-payload}

Use one declared map argument for an application payload that needs compatible
additions. This example keeps `schema_version: 1` for an optional, informational
`note`. An old sender omits it; a newer reader uses `null`. An older reader can
ignore it without changing the approval decision. Do not use an ignored field
for a change that must affect authorization or business behavior.

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('map-approval')]
#[Signal('reviewed', [
    ['name' => 'payload', 'type' => 'array', 'allows_null' => false],
])]
final class MapApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $payload = await('reviewed');
        if (! is_array($payload) || array_is_list($payload)
            || ($payload['schema_version'] ?? null) !== 1) {
            return ['status' => 'rejected_payload', 'reason' => 'unsupported_shape_or_version'];
        }
        if (! in_array($payload['decision'] ?? null, ['approved', 'rejected'], true)) {
            return ['status' => 'rejected_payload', 'reason' => 'invalid_decision'];
        }
        $note = $payload['note'] ?? null;
        if ($note !== null && ! is_string($note)) {
            return ['status' => 'rejected_payload', 'reason' => 'invalid_note'];
        }

        return ['status' => 'processed', 'decision' => $payload['decision'], 'note' => $note];
    }
}
```

Both senders use the same declared `payload` parameter:

```php
use Workflow\V2\WorkflowStub;

$oldPayload = ['schema_version' => 1, 'decision' => 'approved'];
$newPayload = [...$oldPayload, 'note' => 'review λ'];

$receipt = WorkflowStub::load('review-123')->attemptSignalWithArguments(
    'reviewed',
    ['payload' => $newPayload], // An old sender passes $oldPayload here.
);
```

The declaration checks the outer argument. A scalar in place of `payload`
rejects at admission. Its `array` type does not validate nested fields or
distinguish a PHP list from a string-keyed map. The workflow checks those
application rules before doing business work. An unsupported version or invalid
`note` can therefore be durably admitted, then produce `rejected_payload` as the
workflow result. That result is separate from the `signal_received` receipt.

Keep required fields and their meanings stable. Define whether missing and
explicit `null` mean the same thing; they do for `note` here. Preserve old
decoders for recorded values. A breaking shape or meaning needs a new
application version and an explicit compatibility plan, not just another
optional field.

A run keeps the signal declarations and defaults recorded when it started.
Changing a current handler signature or default does not rewrite that contract.
Adding another top-level signal argument is different from adding a key inside
the existing map. Do not assume that an old run accepts it or adopts the new
default. New runs can record a new declaration while old runs retain theirs.

This application format is separate from the fixed
[Avro Value wire schema](/docs/polyglot/avro-value-protocol). Service-mode PHP,
Python and Rust clients encode supported map/list/scalar values through their
SDKs. A Python dataclass, PHP domain object or Rust struct needs the relevant
explicit value adapter; an application version field is not a schema registry.
See the [SDK references](/docs/sdk-neutrality) for the service-mode APIs.

Payload compatibility also does not authorize a changed workflow definition to
claim an existing run. Keep the required compatible worker/build available.
Server 2.9.7's source-fingerprint restriction is tracked separately in
[Server #518](https://github.com/durable-workflow/server/issues/518). This recipe
does not bypass it or promise that a current handler replaces the old run's code.
Use [workflow versioning](./versioning.md) for replay-safe code changes within
the runtime's supported routing contract.

The same recorded-value boundary applies to activity arguments and results:
retries and replay can encounter older shapes. Keep their adapters compatible
with those values rather than rewriting history or relying on current model
defaults.

## After an uncertain response {#after-an-uncertain-response}

A timeout or lost response can happen after a signal has been durably admitted.
A later closed-run or not-found response describes that later request; it does
not establish whether the original signal was applied. A status check before
sending also leaves a gap in which the workflow can close or continue as new.

Keep the original namespace, workflow identity, signal name, arguments and
application operation key when investigating an uncertain delivery. Do not
start a replacement workflow merely because the retry was refused.

### Retry with the same command key {#retry-with-the-same-command-key}

A command key makes the retry itself safe. Choose one key for each logical
signal, such as `approve-order-123`, and save it with your operation record
before you send. With Workflow 2.18.0 or later, attach it with
`withRequestId()`. After a lost response, send the same signal again with the
same key, name, arguments and target:

```php
use Workflow\V2\WorkflowStub;

$result = WorkflowStub::load('order-123')
    ->withRequestId('approve-order-123')
    ->attemptSignalWithArguments('approved-by', ['approvedBy' => 'Taylor']);

if ($result->requestIdConflict()) {
    // The key already names a different signal. Nothing was recorded.
    $retainedCommandId = $result->conflict()['retained_command_id'];
} elseif ($result->retained() && ! $result->intentVerified()) {
    // A legacy receipt: the original admission, not proof that this retry matches it.
} else {
    $result->commandId(); // The same signal command on every matching retry.
}
```

- A retry with the same key, signal name, typed arguments and explicit run
  target returns the original receipt and records nothing. `retained()` is
  true. This also works after the run closed or continued as new, for as long
  as the original command is retained.
- The same key with a different name, arguments or run target is refused:
  `requestIdConflict()` is true and `outcome()` is
  `rejected_request_id_conflict`. `conflict()` names the retained command and
  the parts that differ. Nothing is recorded, and the key keeps its original
  receipt. Send the original input to read that receipt, or use a new key for
  new input.
- A receipt admitted before Workflow recorded command intent reads back with
  `retained()` true and `intentVerified()` false. That is the original
  admission, not proof that this retry's arguments match it. Check its
  identities before treating it as your signal.
- Keys are 1 to 255 Unicode characters and are compared exactly, without case
  folding or normalization. An empty, oversized or invalid UTF-8 key throws
  `InvalidCommandRequestIdException` before admission. A signal sent without a
  key is always a new signal.

Before upgrading, apply Workflow's `intent_digest` migration, then drain and
upgrade every embedded database writer together. Older releases do not compare
intent: a repeated signal key records a second signal there.

Service-mode clients send the key as the body `request_id`. Native Server
3.9.2 and later apply the same rules and add a `request_id_ambiguous` refusal
for some legacy keys. See
[signal and update command keys](/docs/polyglot/server-api-reference#command-keys)
for the HTTP contract and the PHP, Python, Rust and CLI calls.

A command key admits the signal once. It does not make the activities that the
signal triggers run exactly once. See
[recovering an uncertain command](./updates.md#recover-after-an-uncertain-response)
for retained update inspection and application-owned reconciliation.

## Sender identity and authorization

`approvedBy` is application data. The string `Taylor` in the example is not
proof of an authenticated sender. A `#[Signal]` contract validates the signal
name and arguments; your Laravel application must authenticate the caller and
authorize the operation before admitting the signal.

For example, an approval endpoint can use the authenticated user and an order
policy. This application defines an `Order` model with stored
`workflow_instance_id` and `workflow_namespace` fields, and registers an
`approve` policy that checks the user's access to that order. The endpoint
does not take the actor or workflow routing values from the request body:

```php
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Workflow\V2\CommandContext;
use Workflow\V2\WorkflowStub;

Route::post('/orders/{order}/approve', function (Request $request, Order $order) {
    $user = $request->user();
    Gate::forUser($user)->authorize('approve', $order);

    $actorId = (string) $user->getAuthIdentifier();
    $context = CommandContext::phpApi()->withPrincipal('user', $actorId);

    $result = WorkflowStub::load(
        $order->workflow_instance_id,
        $order->workflow_namespace,
    )->withCommandContext($context)->attemptSignalWithArguments('approved-by', [
        'approvedBy' => $actorId,
    ]);

    return response()->json([
        'accepted' => $result->accepted(),
        'outcome' => $result->outcome(),
        'command_id' => $result->commandId(),
    ], $result->accepted() ? 202 : 409);
})->middleware('auth');
```

The policy check happens before loading or signaling the workflow. Every
approval entry point must enforce the same application policy, including any
webhook or administrative endpoint that can send this signal. Inside the
workflow, `await('approved-by')` receives the recorded argument; it does not
return an authenticated-sender object or perform another permission check.

The command's audit identity is separate from that argument.
`withCommandContext()` records the context on the `WorkflowCommand` identified
by `commandId()`. Its `context.principal` and `principalType()`, `principalId()`
and `principalLabel()` accessors support host-side audit inspection; linked
history and operator views can display the recorded command attribution.
Missing attribution does not establish a sender identity.

`CommandContext::withPrincipal()` records what trusted host code supplies. It
does not authenticate a user or authorize a signal. Keep that context outside
caller-controlled input, and do not use a live HTTP session or a database
lookup of current permissions inside deterministic workflow replay.

Service-mode SDK calls use the Server's HTTP authorization boundary instead
of this embedded route. See
[Signal authorization and attribution](/docs/polyglot/namespace-auth-workers#signal-authorization-and-attribution)
for credentials, trusted gateways and audit identity.

<SignalSimulator />

**Important:** The `await()` function should only be used in a workflow, not an activity.

For condition waits — waiting until a predicate over durable state becomes true — see [Condition Waits](./condition-waits.md). For a timeout-backed `await`, see [Signal + Timer](./signal+timer.md). For repeated inbox/outbox flows, see [Message Streams](./message-streams.md).

## Run this pattern

The webhook-started workflow in the
[Sample App](/docs/sample-app) is the runnable reference for the
named-signal-wait pattern on this page:

```bash
php artisan app:webhook
```

`App\Workflows\Webhooks\WebhookWorkflow` starts from an HTTP webhook
ingress and parks on `await('ready')` until the matching signal lands.
Open Waterline while it is parked and you will see the
`SignalReceived` event materialize the moment the signal
is accepted.
