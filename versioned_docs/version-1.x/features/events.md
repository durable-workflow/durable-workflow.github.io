---
sidebar_position: 10
---

# Events

Events are dispatched at various stages of workflow and activity execution to notify of progress, completion, or failures. These events can be used for logging, metrics collection, or any custom application logic.

## Workflow Events

### WorkflowStarted

Triggered when a workflow starts its execution.

Attributes:
- `workflowId`: Unique identifier for the workflow.
- `class`: Class name of the workflow.
- `arguments`: Arguments passed to the workflow.
- `timestamp`: Timestamp of when the workflow started.

### WorkflowCompleted

Triggered when a workflow successfully completes.

Attributes:
- `workflowId`: Unique identifier for the workflow.
- `output`: The result returned by the workflow.
- `timestamp`: Timestamp of when the workflow completed.

### WorkflowFailed

Triggered when a workflow fails during its execution.

Attributes:
- `workflowId`: Unique identifier for the workflow.
- `output`: Error message or exception details.
- `timestamp`: Timestamp of when the workflow failed.

## Activity Events

### ActivityStarted

Triggered when an activity starts its execution.

Attributes:
- `workflowId`: The ID of the parent workflow.
- `activityId`: Unique identifier for the activity.
- `class`: Class name of the activity.
- `index`: The position of the activity within the workflow.
- `arguments`: Arguments passed to the activity.
- `timestamp`: Timestamp of when the activity started.

### ActivityCompleted

Triggered when an activity successfully completes.

Attributes:
- `workflowId`: The ID of the parent workflow.
- `activityId`: Unique identifier for the activity.
- `output`: The result returned by the activity.
- `timestamp`: Timestamp of when the activity completed.

### ActivityFailed

Triggered when an activity fails during execution.

Attributes:
- `workflowId`: The ID of the parent workflow.
- `activityId`: Unique identifier for the activity.
- `output`: Error message or exception details.
- `timestamp`: Timestamp of when the activity failed.

## Lifecycle

This is a typical workflow lifecycle:

```
Workflow\Events\WorkflowStarted
Workflow\Events\ActivityStarted
Workflow\Events\ActivityCompleted
Workflow\Events\WorkflowCompleted
```

This is a workflow lifecycle with a failed activity that recovers:

```
Workflow\Events\WorkflowStarted
Workflow\Events\ActivityStarted
Workflow\Events\ActivityFailed
Workflow\Events\ActivityStarted
Workflow\Events\ActivityCompleted
Workflow\Events\WorkflowCompleted
```
