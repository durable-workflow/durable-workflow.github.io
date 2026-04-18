---
sidebar_position: 3
---

# Updates

Updates allow you to retrieve information about the current state of a workflow and mutate the workflow state at the same time. They are essentially both a query and a signal combined into one.

## Explicit Update Commands

Each accepted update:

- Is a request/response call against a running workflow. `attemptUpdate*()` waits for the handler to finish; `submitUpdate*()` returns as soon as the command is durably accepted and exposes `inspectUpdate($updateId)` to poll later.
- Uses the declared durable update name in command history and webhook routing — `#[UpdateMethod('mark-approved')]` keeps the public callable name stable across PHP method renames.
- Rejects against historical or already-closed runs rather than silently mutating the current run.
- Rejects undeclared method names as `rejected_unknown_update` and contract-invalid arguments as `rejected_invalid_arguments` (with machine-readable `validation_errors`) before the handler runs.

Like queries, updates replay committed history first. Unlike queries, updates are allowed to mutate replay-safe workflow state and return a value.

To define an update method on a workflow, use the `UpdateMethod` annotation. The optional string argument lets you freeze a public durable name that survives PHP method renames:

```php
use Workflow\UpdateMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[UpdateMethod('mark-ready')]
    public function updateReady(bool $ready): bool
    {
        $this->ready = $ready;

        return $this->ready;
    }
}
```

Call the update method directly when you want the raw return value:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->updateReady(true);
```

That direct PHP call still uses the method name. The durable command target remains `mark-ready`.

Use `attemptUpdate()` when you want the durable command outcome as well. Pass the durable update name there:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptUpdate('mark-ready', true);

$result->accepted();        // true
$result->completed();       // true when the update body ran successfully
$result->updateStatus();    // "accepted", "completed", "failed", or "rejected"
$result->updateId();        // Durable update lifecycle id
$result->result();          // Raw update return value when completed
$result->failureMessage();  // Failure message when the update body threw
```

`attemptUpdate()` records the accepted update first, then waits for the workflow worker to apply it and close the update lifecycle before returning. The wait is time-bounded by `workflows.v2.update_wait.completion_timeout_seconds`; if the worker has not closed the update when the budget expires, `attemptUpdate()` returns the accepted lifecycle with `waitTimedOut() === true` and `updateStatus() === 'accepted'`.

Use `withUpdateWaitTimeout()` when one call needs a different completion budget:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123')
    ->withUpdateWaitTimeout(5);

$result = $workflow->attemptUpdate('mark-ready', true);
```

Use `attemptUpdateWithArguments()` when the caller already has a positional list or named parameter map:

```php
$result = $workflow->attemptUpdateWithArguments('mark-ready', [
    'ready' => true,
]);
```

Named maps are validated against the durably snapped update contract and normalized into declaration order before acceptance.

Use `submitUpdate()` or `submitUpdateWithArguments()` when the caller only needs durable acceptance and is fine with the workflow worker applying the update later:

```php
$accepted = $workflow->submitUpdate('mark-ready', true);

$accepted->accepted();     // true
$accepted->completed();    // false
$accepted->updateStatus(); // "accepted"
$accepted->result();       // null until the worker records UpdateCompleted
```

Use `inspectUpdate()` when you already have an `update_id` and want to read the stored lifecycle later without waiting again:

```php
$latest = $workflow->inspectUpdate($accepted->updateId());

$latest->updateStatus(); // "accepted"
$latest->closedAt();     // null until the lifecycle closes
```

`inspectUpdate()` does not wait for workflow execution. It reloads the stored durable lifecycle and returns the current `UpdateResult`.

Update rules:

- `load($instanceId)` updates the newest durable run for that instance (including after continue-as-new).
- `loadRun($runId)` rejects with `rejected_not_current` once that selected run is historical.
- Closed runs reject with `rejected_not_active`.
- Failed update bodies do not close the workflow run; they are recorded as update-scoped failures and leave the run open for the next replay task.
- Queries replay completed updates, but rejected or failed updates remain non-replayable command and history facts only.
