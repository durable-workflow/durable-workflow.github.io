---
sidebar_position: 19
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

### Timeout outcome and cleanup

A workflow deadline closes the run with status `failed` and
`closed_reason = timed_out`. `WorkflowTimedOut` is the terminal history event.
The runtime records `WorkflowTimeoutException` as failure data. It does **not**
throw that exception into the workflow body or resume workflow code for cleanup.
Workflow `catch` and `finally` blocks and registered saga compensations do not
run when the engine enforces this deadline.

Cancelling an activity's durable execution does not undo an external side
effect or prove that its callback stopped. Use idempotent operations and
application-owned reconciliation for effects that may already have committed.

When cleanup must follow an application deadline, use a shorter durable timer
or timeout-backed wait that lets workflow code run
[compensation before closure](./sagas.md#deadline-driven-compensation).
Leave time for activity retries, worker scheduling and cleanup before either
the run or execution deadline. The engine timeout remains the final backstop.
A delayed worker can reach that backstop before compensation finishes.

The immediate `cancel()` and `terminate()` commands also close the run without
a workflow cleanup window. The separate cooperative `requestCancellation()`
operation can deliver bounded cleanup to a compatible worker while the run is
still active. A workflow timeout does not automatically become a cooperative
cancellation request, and a cancellation shield does not extend an execution
or run deadline. See [Cancel and Terminate](./cancel-and-terminate.md) and
[Cooperative Cancellation](../polyglot/cancellation.md).

## Workflow-task lease {#workflow-task-lease}

A workflow task is one worker turn that replays committed history and produces durable commands. It is not the entire workflow. Waiting on a durable timer, queued activity or signal does not hold one workflow task for the whole wait. A later task resumes the run.

| Deployment | Default seconds | Setting |
| --- | --- | --- |
| Embedded Laravel | `300` | `DW_V2_WORKFLOW_TASK_LEASE_SECONDS` |
| Server | `60` | `DW_WORKFLOW_TASK_TIMEOUT` |

The embedded setting maps to `workflows.v2.workflow_task_lease_seconds`. Server maps its own setting into that package key at boot, so use the Server setting on Server. This is runtime configuration, not a `StartOptions` or per-start activity timeout. See [Publishing Config](../configuration/publishing-config.md#workflow-task-lease-v2) and the [Server configuration reference](../polyglot/server-config-reference.md#worker-protocol-and-query-transport).

### Heartbeats and execution {#workflow-task-heartbeats}

Service-mode workers use task heartbeats to renew an in-progress workflow-task claim. Server validates the task, attempt and lease owner. An acknowledged renewal uses the effective lease duration, subject to applicable cancellation-cleanup bounds. It does not change the original run/execution deadlines or activity timeouts. Worker-registration heartbeats keep the registration fresh. A stale registration can invalidate a Server claim before the task lease expires. These heartbeats do not renew that task lease. A queued activity's heartbeat reports activity progress and does not replace a workflow-task renewal.

Synchronous embedded workflow code cannot periodically renew while blocked. Keep workflow code deterministic and short. Put long I/O or CPU work in activities. The lease is not a hard process or CPU execution limit.

Embedded local activities retain the hosting workflow task. Their `$this->heartbeat()` can also renew its lease while the original activity attempt and workflow-task claim remain valid.

### Lease expiry {#workflow-task-lease-expiry}

An expired, unfinished claim becomes eligible for recovery. Matching/watchdog or repair clears the expired claim and redispatches work so a compatible worker can replay committed history. Recovery requires running recovery processes, an available database and an eligible worker. Expiry does not kill the old process or guarantee immediate redelivery. On Server, an expired or replaced claim cannot submit new commands; a rejected renewal must be treated as lost authority.

Repair does not reopen a closed run, grant extra business retries or reset original deadlines. Activity `startToCloseTimeout` instead bounds one activity attempt under its recorded retry policy. Run and execution timeouts bound the workflow lifetime. Workflow-task renewal or replay does not extend them.

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
        heartbeatTimeout: 15,           // heartbeat well before this 15-second window expires
        maxAttempts: 3,
    ),
    $input,
);
```

In service mode, closing an activity attempt does not forcibly stop SDK application code. Python SDK 2.9.0 reports a refusal at the next heartbeat; code that never heartbeats can run until it returns, and a physical thread slot remains occupied until exit. See [Python heartbeat refusals and callback exit](../polyglot/python.md#heartbeat-refusals-and-callback-exit).

### Schedule-to-start timeout

The deadline is computed when the activity is scheduled. If no worker claims the activity before the deadline, the `TaskWatchdog` enforces the timeout. If retry attempts remain, a new activity task is scheduled with the snapped backoff and the schedule-to-start deadline is recomputed relative to the retry's available-at time — each retry gets a fresh window. If no `scheduleToStartTimeout` was configured, the deadline is cleared on retry. If all attempts are exhausted, a terminal `ActivityTimedOut` history event is recorded and the workflow is woken.

### Start-to-close timeout

The deadline is computed when a worker claims the activity task. Each retry gets a fresh start-to-close deadline. If the activity does not complete before the deadline, the current attempt is closed. If retry attempts remain, the execution returns to `Pending` with a reset schedule-to-start deadline (if configured) so the retried task is not immediately re-timed-out. If all attempts are exhausted, a terminal timeout is recorded.

### Schedule-to-close timeout

The deadline is computed once at scheduling time and never resets. When it expires, the activity is immediately failed as terminal — even if retry attempts remain, because the total allowed wall-clock time has passed. This is useful for bounding the overall cost of a flaky activity that might otherwise retry indefinitely within its per-attempt limits.

### Heartbeat timeout

For a queued activity, the first deadline starts when the runtime claims it, before task delivery and user code. Each accepted heartbeat sets the deadline to its recorded runtime timestamp plus the configured timeout. It does not add time to the previous deadline or start a fresh window when the caller receives the response. Leave room for delivery, bounded work, scheduling pauses, request latency and transport retries. Send heartbeats well before the window expires. An expired or replaced attempt cannot regain authority by sending a late heartbeat. If retry attempts remain, a new attempt is scheduled with a reset schedule-to-start deadline (if configured). Otherwise a terminal timeout is recorded.

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
