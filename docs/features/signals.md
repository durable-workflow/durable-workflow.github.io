---
sidebar_position: 1
---

import SignalSimulator from '@site/src/components/SignalSimulator';

# Signals

Signals allow you to trigger events in a workflow from outside the workflow. This can be useful for reacting to external events, enabling *human-in-the-loop* interventions, or for signaling the completion of an external task.

## Named Signal Waits

A workflow calls `awaitSignal('signal-name')` directly. The next accepted signal command with that name resumes the run and returns a deterministic value to the suspended workflow.

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\awaitSignal;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string'],
])]
final class OrderApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $approvedBy = awaitSignal('approved-by');

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

- each external signal name should be declared up front with a repeatable `#[Signal('signal-name')]` class attribute
- a signal declaration may also include an optional ordered parameter contract, for example `#[Signal('approved-by', [['name' => 'approvedBy', 'type' => 'string']])]`
- signal commands target the public workflow instance id, not a run id
- instance-targeted signal intake resolves the newest durable run for that instance, so continue-as-new chains keep the same public signal route even if the mutable current-run pointer drifts
- an accepted or rejected signal records a durable command row, and new runs also get one first-class `workflow_signal_records` lifecycle row linked back to that command
- the run's declared signal and update contracts are snapped into the typed `WorkflowStarted` payload as `declared_signals`, `declared_signal_contracts`, `declared_updates`, and `declared_update_contracts`
- each named wait gets its own durable `signal_wait_id`, and buffered same-name signals keep that same id across `SignalReceived`, `SignalWaitOpened`, and `SignalApplied`
- selected-run detail exposes those lifecycle rows as `signals[*]`, with `id`, `command_id`, `command_sequence`, `workflow_sequence`, `signal_wait_id`, status, outcome, validation errors, and stored arguments
- when a declared signal contract exists, PHP, webhook, and Waterline signal intake all accept either positional arguments or a JSON or associative object of named arguments, and invalid requests reject as `rejected_invalid_arguments` with machine-readable `validation_errors` for missing arguments, unknown arguments, declared type mismatches, or nullability violations
- when a signal has no declared parameter contract, `awaitSignal('approved-by')` still receives `true` when no arguments were sent, the single argument when one value was sent, or the full argument array when multiple values were sent; `attemptSignalWithArguments('name', ['key' => 'value'])` keeps treating that associative array as one payload value instead of guessing named arguments
- before a signal is accepted, Waterline projects the run as `wait_kind = signal` and `liveness_state = waiting_for_signal`, which means it is waiting healthily for external input rather than needing repair
- once a signal command is durably accepted, that external signal wait is resolved; Waterline should then show either the backing workflow task with `workflow_wait_kind = signal`, `workflow_signal_id`, `workflow_command_id`, the open wait id, and the `workflow_signal` resume source, or, if that task disappeared before `SignalApplied`, `repair_needed` with `wait_kind = signal`, `open_wait_id = signal-application:{signal_id}` when the lifecycle row exists, and the same metadata on the repaired task
- repeated waits with the same signal name stay distinguishable in Waterline and the typed timeline through both the workflow step `sequence` and the durable `signal_wait_id`
- resolved signal waits also keep the accepted command's snapped `command_sequence`, status, outcome, and signal lifecycle id in typed history, so operator detail stays stable even if the mutable command row later drifts
- if several same-name signal commands are accepted before the workflow reaches the later wait, durable command sequence remains the source of truth for ordering, while the accepted command's `signal_wait_id` stays stable even if that later wait opens afterward
- `attemptRepair()` on that healthy signal wait returns `repair_not_needed`, because the durable satisfier is already the named signal itself
- unknown signal names reject as `rejected_unknown_signal` with `rejection_reason = unknown_signal`
- rejected signal commands otherwise return `rejected_not_started` when the instance has no current run, `rejected_not_active` when the current run is already closed, and `rejected_invalid_arguments` with `rejection_reason = invalid_signal_arguments` when the durable signal contract rejects the payload before the command is accepted, including declared type or nullability mismatches

## Condition Waits

`await($condition, $conditionKey = null)` provides replay-safe condition waits. Use it when the predicate depends only on workflow state that was already derived from durable inputs such as updates, activity results, or child results. If you want one named external signal value directly, prefer `awaitSignal('name')`.

Condition waits are driven by an update method instead of signal mutators:

```php
use Workflow\UpdateMethod;
use function Workflow\V2\await;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('approval-workflow')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): void
    {
        await(fn () => $this->ready, 'approval.ready');
    }

    #[UpdateMethod]
    public function setReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

The optional condition key is a stable, URL-safe operator label for the wait. Waterline exposes it as `condition_key` and `target_name`, and replay validates the previously recorded key before resolving the wait so a later deployment cannot accidentally reuse the same workflow step for a different predicate. Adding a key to a wait that was already recorded without one is also a compatibility change; old unkeyed history reports the recorded key as `none` and blocks replay until a compatible build is deployed. Replay also blocks when that workflow sequence already recorded a different typed step shape, such as a pure timer, because condition-wait history cannot be appended over an incompatible committed event. If a worker sees a recorded key, predicate fingerprint, or step shape that no longer matches the current wait, the run stays open with `liveness_state = workflow_replay_blocked` and the workflow task is marked `replay_blocked`; repair retries that task after the compatible build is back.

<SignalSimulator />

**Important:** The `await()` function should only be used in a workflow, not an activity.
