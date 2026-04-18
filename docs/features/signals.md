---
sidebar_position: 1
---

import SignalSimulator from '@site/src/components/SignalSimulator';

# Signals

Signals allow you to trigger events in a workflow from outside the workflow. This can be useful for reacting to external events, enabling *human-in-the-loop* interventions, or for signaling the completion of an external task.

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

## Message Stream Cursor

Signals and updates are durably ordered within an instance-level message stream. Every accepted signal or update command receives a monotonically increasing `message_sequence` from the instance, independent of the per-run `command_sequence`. Each run tracks a `message_cursor_position` that records how far through the instance message stream it has consumed.

Key properties:

- **Instance-scoped ordering:** `message_sequence` provides a total order across all signals and updates for the instance's entire lifetime, not just one run.
- **Durable cursor:** Each run's `message_cursor_position` is persisted in the database, not held in-memory. History events of type `MessageCursorAdvanced` record every cursor advancement with the stream key, previous position, and new position.
- **Continue-as-new handoff:** When a workflow continues as new, the new run inherits the closing run's `message_cursor_position`. This means the continued run knows exactly which messages were already consumed and will not reprocess them.
- **Idempotent advancement:** Advancing the cursor to the same or a prior position is a no-op, making replay safe.

The cursor is automatically managed by the engine during signal application and update application. Workflow authors do not need to interact with it directly.

## Condition Waits

`await($condition, $conditionKey = null)` provides replay-safe condition waits. Use it when the predicate depends only on workflow state that was already derived from durable inputs such as updates, activity results, or child results. If you want one named external signal value directly, call `await('name')`.

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
