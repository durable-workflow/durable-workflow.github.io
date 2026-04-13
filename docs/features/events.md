---
sidebar_position: 10
---

# Events

Lifecycle events are dispatched at key stages of workflow and activity execution to notify your application of progress, completion, or failures. These are standard Laravel events — register listeners in your `EventServiceProvider` or with `Event::listen()`.

All V2 lifecycle events are dispatched **after the durable state is committed** to the database. This means listeners only observe events backed by committed truth — if a transaction rolls back, no event is dispatched.

## Event Identity

Every V2 event carries durable identity fields:

| Field | Description |
|---|---|
| `instanceId` | The workflow instance ID (stable across continue-as-new). |
| `runId` | The specific execution run ID. |
| `workflowType` | The durable type key registered via `#[Type('...')]`. |
| `workflowClass` | The PHP class name of the workflow. |
| `committedAt` | ISO 8601 timestamp of when the durable record was committed (wall-clock commit time). |

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

The `committedAt` field on all events represents **commit time** — the wall-clock time at which the durable record (history event or failure record) was written to the database. This is distinct from:

- **Workflow virtual time**: The logical time inside the workflow execution (used by timers).
- **Attempt time**: When a specific activity attempt started or finished.
- **Resume latency**: How long after a timer was due the workflow actually resumed.

Commit time is the most useful timestamp for external integrations because it reflects when the state became durable and observable.

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

## V1 Compatibility Events

V2 workflows also dispatch the legacy V1 event classes alongside V2 events. This means apps migrating from V1 to V2 continue to receive the events they already listen for — no listener changes required.

The following V1 events are dispatched automatically whenever their V2 counterpart fires:

| V2 Event | V1 Compatibility Event |
|---|---|
| `Workflow\V2\Events\WorkflowStarted` | `Workflow\Events\WorkflowStarted` |
| `Workflow\V2\Events\WorkflowCompleted` | `Workflow\Events\WorkflowCompleted` |
| `Workflow\V2\Events\WorkflowFailed` | `Workflow\Events\WorkflowFailed` |
| `Workflow\V2\Events\ActivityStarted` | `Workflow\Events\ActivityStarted` |
| `Workflow\V2\Events\ActivityCompleted` | `Workflow\Events\ActivityCompleted` |
| `Workflow\V2\Events\ActivityFailed` | `Workflow\Events\ActivityFailed` |

V1 events use the V1 field names (`workflowId`, `class`, `activityId`, `index`, `output`) mapped from V2 durable identity:

- `workflowId` is the V2 `instanceId`
- `activityId` is the V2 `activityExecutionId`
- `index` is the V2 `sequence`
- `output` carries the exception class and message for failure events, or an empty string for completion events
- `arguments` is always `'[]'` (V2 does not expose serialized arguments in lifecycle events)

### StateChanged

The V1 `Workflow\Events\StateChanged` event is also dispatched as a compatibility adapter over V2 run-status transitions. It fires when a workflow starts (`null` → `WorkflowRunningStatus`), completes (`WorkflowRunningStatus` → `WorkflowCompletedStatus`), or fails (`WorkflowRunningStatus` → `WorkflowFailedStatus`).

```php
use Workflow\Events\StateChanged;

Event::listen(StateChanged::class, function (StateChanged $event) {
    // $event->initialState — the previous state (null for start)
    // $event->finalState  — the new state
    // $event->model       — the WorkflowRun model
    // $event->field       — 'status'
});
```

The `model` on a V2-dispatched `StateChanged` is the `WorkflowRun` Eloquent model, not the V1 stored workflow model. Listeners that access `$event->model->id` will get the run ID rather than the V1 stored workflow ID.

:::tip New V2 listeners
For new code, prefer the V2 events in `Workflow\V2\Events` — they carry richer durable identity (instance ID, run ID, workflow type, committed-at timestamp). The V1 compatibility events are provided for migration convenience.
:::

## Event Namespace

V2 events live in the `Workflow\V2\Events` namespace. Legacy V1 events in `Workflow\Events` are dispatched alongside V2 events as compatibility adapters, so existing V1 listeners continue to work without changes.
