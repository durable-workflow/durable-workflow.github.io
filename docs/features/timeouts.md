---
sidebar_position: 17
---

# Timeouts

Workflow-level timeouts let you bound how long a workflow is allowed to run. There are two timeout scopes:

- **Execution timeout** — caps the total wall-clock time across all runs of a workflow instance, including continue-as-new transitions. The deadline is computed once at start and carried forward unchanged.
- **Run timeout** — caps a single run. The deadline is recomputed each time a new run begins (including continue-as-new).

Both are optional and can be combined.

## Configuration

Timeouts are configured through `StartOptions` when starting a workflow:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

$workflow->start(
    $orderId,
    StartOptions::rejectDuplicate()
        ->withExecutionTimeout(7200)   // 2 hours across all runs
        ->withRunTimeout(3600),        // 1 hour per run
);
```

### Execution timeout

The execution timeout spans the entire workflow instance. If the workflow uses continue-as-new, the deadline stays the same across every run in the chain.

```php
StartOptions::rejectDuplicate()->withExecutionTimeout(86400); // 24 hours
```

The timeout value is stored on the `WorkflowInstance` model and the computed deadline is snapped on every `WorkflowRun`.

### Run timeout

The run timeout applies to a single run. When a workflow continues as new, the new run gets a fresh deadline computed from the current time plus the configured run timeout.

```php
StartOptions::rejectDuplicate()->withRunTimeout(1800); // 30 minutes per run
```

### Validation

Timeout values must be at least 1 second. Passing zero or a negative value throws a `LogicException`:

```php
// Throws LogicException: "Workflow v2 execution timeout must be at least 1 second."
StartOptions::rejectDuplicate()->withExecutionTimeout(0);
```

### Control plane

Timeouts can also be set when starting a workflow through the control plane:

```php
$controlPlane->start('my-app.order-workflow', 'order-123', [
    'execution_timeout_seconds' => 7200,
    'run_timeout_seconds' => 3600,
]);
```

The `describe` response includes timeout and deadline fields:

```php
$description = $controlPlane->describe('order-123');

$description['execution_timeout_seconds']; // 7200
$description['run']['run_timeout_seconds']; // 3600
$description['run']['execution_deadline_at']; // ISO 8601 timestamp
$description['run']['run_deadline_at'];       // ISO 8601 timestamp
```

### Waterline

When timeouts are configured, the run detail view in Waterline displays the timeout durations and their computed deadlines.

### History

The `WorkflowStarted` history event payload includes timeout and deadline fields when configured:

```json
{
    "execution_timeout_seconds": 7200,
    "run_timeout_seconds": 3600,
    "execution_deadline_at": "2026-04-12T14:00:00+00:00",
    "run_deadline_at": "2026-04-12T13:00:00+00:00"
}
```

### Continue-as-new

When a workflow continues as new:

- The **execution deadline** is carried forward unchanged from the previous run.
- The **run timeout** value is carried forward, but the **run deadline** is recomputed from the current time.

This means the execution timeout always measures from the original start, while each new run gets its own fresh run-timeout window.

### What is not yet covered

The following are planned but not yet implemented:

- Task-level timeouts (schedule-to-start, start-to-close, schedule-to-close, heartbeat)
- Automatic timeout enforcement (firing `WorkflowTimedOut` events and terminating the run when a deadline passes)
- Retry policies at the workflow level
- Typed structural-limit failures for payload size, history size, and pending fan-out
