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

## Enforcement

Workflow-level timeouts are enforced at two points:

1. **At workflow task start** — every workflow task checks `deadlineExpired()` before executing the workflow. If the deadline has passed, the run is immediately timed out.
2. **By the TaskWatchdog** — the watchdog scans for non-terminal runs whose execution or run deadline has passed but that have no open workflow task. When found, it creates a deadline-expired workflow task and dispatches it, which triggers the timeout on the next task execution.

When a timeout fires, the engine:

- Cancels all open tasks (activity, timer, workflow) except the current one
- Cancels all open activity executions with `ActivityCancelled` history events
- Cancels all pending timers with `TimerCancelled` history events
- Records a `WorkflowFailure` with `failure_category = timeout` and a `WorkflowTimeoutException`
- Records a terminal `WorkflowTimedOut` history event with `timeout_kind` set to `execution_timeout` or `run_timeout`
- Applies parent-close policy to any open child workflows
- Notifies parent workflows if this was a child run

The failure row stores `Workflow\V2\Exceptions\WorkflowTimeoutException` as the exception class, carrying the `timeout_kind` and the deadline timestamp for programmatic inspection.

## Activity timeouts

Activity timeouts let you bound how long individual activity executions are allowed to take. There are four activity timeout scopes:

- **Schedule-to-start** — caps the time from scheduling to the first worker claim. Enforced while the activity is `Pending`.
- **Start-to-close** — caps the time from when a worker claims the activity to when it must complete. Resets on each retry attempt.
- **Schedule-to-close** — caps the total wall-clock time from scheduling to completion across all retry attempts. This is always terminal — retrying would not help because the overall deadline has passed.
- **Heartbeat** — caps the time between heartbeats. For long-running activities that call `$this->heartbeat()`, the engine requires a heartbeat within the configured interval or the activity is considered unresponsive.

All are optional and can be combined. Configure them through `ActivityOptions` when calling an activity:

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    LongRunningActivity::class,
    new ActivityOptions(
        scheduleToStartTimeout: 30,     // must be claimed within 30s
        startToCloseTimeout: 300,       // each attempt has 5 minutes
        scheduleToCloseTimeout: 600,    // total 10 minutes across all retries
        heartbeatTimeout: 15,           // must heartbeat every 15 seconds
        maxAttempts: 3,
    ),
    $input,
);
```

### Schedule-to-start timeout

The deadline is computed when the activity is scheduled. If no worker claims the activity before the deadline, the `TaskWatchdog` enforces the timeout. If retry attempts remain, a new activity task is scheduled with the snapped backoff and the schedule-to-start deadline is recomputed relative to the retry's available-at time — each retry gets a fresh window. If no `scheduleToStartTimeout` was configured, the deadline is cleared on retry. If all attempts are exhausted, a terminal `ActivityTimedOut` history event is recorded and the workflow is woken.

### Start-to-close timeout

The deadline is computed when a worker claims the activity task. Each retry gets a fresh start-to-close deadline. If the activity does not complete before the deadline, the current attempt is closed. If retry attempts remain, the execution returns to `Pending` with a reset schedule-to-start deadline (if configured) so the retried task is not immediately re-timed-out. If all attempts are exhausted, a terminal timeout is recorded.

### Schedule-to-close timeout

The deadline is computed once at scheduling time and never resets. When it expires, the activity is immediately failed as terminal — even if retry attempts remain, because the total allowed wall-clock time has passed. This is useful for bounding the overall cost of a flaky activity that might otherwise retry indefinitely within its per-attempt limits.

### Heartbeat timeout

The initial deadline is computed when a worker claims the activity task. Each successful `$this->heartbeat()` call extends the deadline by the configured interval. If the activity does not call `heartbeat()` before the deadline expires, the engine assumes the worker is unresponsive. If retry attempts remain, a new attempt is scheduled with a reset schedule-to-start deadline (if configured); otherwise a terminal timeout is recorded.

```php
use Workflow\V2\Activity;

class LongRunningActivity extends Activity
{
    public function handle($input)
    {
        foreach ($items as $item) {
            $this->heartbeat(['processed' => $count]);
            // ... process item ...
        }
    }
}
```

### Enforcement

Activity timeouts are enforced by the `TaskWatchdog` on each worker-loop pass. The watchdog scans for executions whose deadline columns have passed and delegates to `ActivityTimeoutEnforcer`. Each enforcement records:

- A terminal `ActivityTimedOut` history event with `timeout_kind` set to `schedule_to_start`, `start_to_close`, `schedule_to_close`, or `heartbeat`
- A `WorkflowFailure` row with `failure_category = timeout` and `propagation_kind = timeout`
- A workflow resume task to wake the parent workflow so it can observe the failure

Waterline displays the retry policy including all configured timeout types in the activity detail view. The timeline shows the timeout kind in the activity timed-out event message.

### What is not yet covered

The following are planned but not yet implemented:

- Retry policies at the workflow level

### Structural limits

Typed structural-limit failures for payload size, pending fan-out counts, and metadata size ceilings are enforced by the engine. See [Structural Limits](../constraints/structural-limits.md) for the full limit contract, configuration, and failure taxonomy.
