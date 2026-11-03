---
sidebar_position: 12
---

# Events

Lifecycle events are dispatched at key stages of workflow and activity execution to notify your application of progress, completion, or failures. These are standard Laravel events — register listeners in your `EventServiceProvider` or with `Event::listen()`.

`WorkflowCancelled` and `WorkflowTerminated` wait for the transaction on the run's storage connection to commit. Rejected commands and rolled-back storage writes emit neither event. Other engine transaction and lifecycle-ordering gaps remain tracked in [workflow#893](https://github.com/durable-workflow/workflow/issues/893). A transaction on a separate application database does not make workflow storage writes atomic.

## Event Identity

Every V2 event carries durable identity fields:

| Field | Description |
|---|---|
| `instanceId` | The workflow instance ID (stable across continue-as-new). |
| `runId` | The specific execution run ID. |
| `workflowType` | The durable type key registered via `#[Type('...')]`. |
| `workflowClass` | The PHP class name of the workflow. |
| `committedAt` | ISO 8601 wall-clock timestamp captured when preparing the lifecycle notification. |

Activity events additionally include:

| Field | Description |
|---|---|
| `activityExecutionId` | The durable activity execution ID. |
| `activityType` | The durable type key of the activity. |
| `activityClass` | The PHP class name of the activity. |
| `sequence` | The position of the activity within the workflow execution. |
| `attemptNumber` | The attempt number (starts at 1). |

## Workflow Events

### WorkflowStarted

Dispatched when a workflow start is durably committed — meaning the first run has been created and the `WorkflowStarted` history event has been recorded.

```php
use Workflow\V2\Events\WorkflowStarted;

Event::listen(WorkflowStarted::class, function (WorkflowStarted $event) {
    Log::info('Workflow started', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'type' => $event->workflowType,
    ]);
});
```

This event also fires when a new run begins via continue-as-new.

### WorkflowCompleted

Dispatched when a workflow run completes successfully.

```php
use Workflow\V2\Events\WorkflowCompleted;

Event::listen(WorkflowCompleted::class, function (WorkflowCompleted $event) {
    Log::info('Workflow completed', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
    ]);
});
```

### WorkflowFailed

Dispatched when a workflow run fails terminally.

Run timeouts also dispatch `WorkflowFailed`. Expiry of a cooperative cancellation cleanup deadline dispatches `WorkflowCancelled` instead.

Additional fields:
- `exceptionClass`: The PHP exception class name.
- `message`: The exception message.

```php
use Workflow\V2\Events\WorkflowFailed;

Event::listen(WorkflowFailed::class, function (WorkflowFailed $event) {
    Log::error('Workflow failed', [
        'instance_id' => $event->instanceId,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

### WorkflowCancelled {#workflowcancelled}

Dispatched when immediate cancellation closes a run, or when cooperative cancellation closes it after cleanup completes or its deadline expires. A cancellation request alone does not dispatch this event.

In addition to the common identity fields:

| Field | Description |
|---|---|
| `reason` | The original cancellation command reason, or `null`. Cleanup completion and deadline messages do not replace it. |
| `closedAt` | The persisted run close time as a UTC ISO 8601 string. |

```php
use Workflow\V2\Events\WorkflowCancelled;

Event::listen(WorkflowCancelled::class, function (WorkflowCancelled $event) {
    Log::info('Workflow cancelled', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'reason' => $event->reason,
        'closed_at' => $event->closedAt,
    ]);
});
```

### WorkflowTerminated {#workflowterminated}

Dispatched when termination closes a run. It carries the same identity fields, `reason` and `closedAt`, using the termination command's reason. Termination does not execute workflow cleanup code.

```php
use Workflow\V2\Events\WorkflowTerminated;

Event::listen(WorkflowTerminated::class, function (WorkflowTerminated $event) {
    Log::info('Workflow terminated', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'reason' => $event->reason,
        'closed_at' => $event->closedAt,
    ]);
});
```

These are in-process Laravel notifications. A listener failure cannot undo a committed close. The events grant no authority to resume a closed run and do not guarantee durable delivery to an external system.

## Activity Events

### ActivityStarted

Dispatched when an activity task is claimed and execution begins.

```php
use Workflow\V2\Events\ActivityStarted;

Event::listen(ActivityStarted::class, function (ActivityStarted $event) {
    Log::info('Activity started', [
        'activity' => $event->activityType,
        'sequence' => $event->sequence,
        'attempt' => $event->attemptNumber,
    ]);
});
```

### ActivityCompleted

Dispatched when an activity completes successfully.

```php
use Workflow\V2\Events\ActivityCompleted;

Event::listen(ActivityCompleted::class, function (ActivityCompleted $event) {
    Log::info('Activity completed', [
        'activity' => $event->activityType,
        'execution_id' => $event->activityExecutionId,
    ]);
});
```

### ActivityFailed

Dispatched when an activity fails terminally (all retries exhausted or non-retryable exception). Retryable failures that will be retried do **not** trigger this event.

Additional fields:
- `exceptionClass`: The PHP exception class name.
- `message`: The exception message.

```php
use Workflow\V2\Events\ActivityFailed;

Event::listen(ActivityFailed::class, function (ActivityFailed $event) {
    Log::error('Activity failed', [
        'activity' => $event->activityType,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

## Failure Events

### FailureRecorded

Dispatched whenever a durable failure record is committed — for both workflow and activity terminal failures. This is the single hook for error-reporting integrations like Sentry or Bugsnag.

| Field | Description |
|---|---|
| `failureId` | The durable failure record ID. |
| `sourceKind` | `"workflow_run"` or `"activity_execution"`. |
| `sourceId` | The ID of the source (run ID or activity execution ID). |
| `exceptionClass` | The PHP exception class name. |
| `message` | The exception message. |

```php
use Workflow\V2\Events\FailureRecorded;

Event::listen(FailureRecorded::class, function (FailureRecorded $event) {
    // Report to Sentry, Bugsnag, etc.
    report(new \RuntimeException(
        "[{$event->sourceKind}] {$event->exceptionClass}: {$event->message}"
    ));
});
```

## Timestamp Semantics

The engine captures `committedAt` when preparing a lifecycle notification. It is a wall-clock timestamp, distinct from:

- **Workflow virtual time**: The logical time inside the workflow execution (used by timers).
- **Attempt time**: When a specific activity attempt started or finished.
- **Resume latency**: How long after a timer was due the workflow actually resumed.

For cancellation and termination, `closedAt` is the persisted run close timestamp in UTC. An enclosing storage transaction can commit later than when the event fields were captured. Record listener receipt time separately when measuring delivery latency.

## Lifecycle

A typical successful workflow lifecycle:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityCompleted
Workflow\V2\Events\WorkflowCompleted
```

A workflow lifecycle with a terminal activity failure:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityFailed
Workflow\V2\Events\FailureRecorded    (source: activity_execution)
Workflow\V2\Events\WorkflowFailed
Workflow\V2\Events\FailureRecorded    (source: workflow_run)
```

A cancelled run ends with:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\WorkflowCancelled
```

Cooperative cleanup can emit activity events between these two notifications.

A terminated run ends with:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\WorkflowTerminated
```

## Event Namespace

V2 events live in the `Workflow\V2\Events` namespace. If you are upgrading an existing app, see [Migration](../migration.md) for the V1 compatibility event mapping.
