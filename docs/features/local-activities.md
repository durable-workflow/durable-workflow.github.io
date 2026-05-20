---
sidebar_position: 23
title: Local Activities
description: Run short activity work inside the current workflow worker process while preserving durable activity history, retries, timeouts, and visibility.
tags:
  - activities
  - workers
  - execution
keywords:
  - local activities
  - localActivity
  - executeLocalActivity
  - same process activity
  - workflow task heartbeat
---

# Local Activities

Local activities are the v2 primitive for short activity work that should run
inside the workflow worker process currently executing the workflow task. They
preserve activity retry, timeout, heartbeat, cancellation, history, and
operator visibility semantics, but they bypass ordinary activity-task queueing.

Use local activities when the work is low-latency, idempotent, and appropriate
for the workflow worker itself. Use ordinary queued activities when the work
needs independent worker scaling, queue routing, long execution, or a separate
activity-task lease.

## Contract Summary

- `localActivity(...)` and `Workflow::localActivity(...)` execute the activity
  class in the same process as the current workflow task.
- The runtime creates an `activity_executions` row and normal activity history
  events marked with `execution_mode=local` and `local_activity=true`.
- No ordinary `TaskType::Activity` task is created, so `connection`, `queue`,
  worker-session, and schedule-to-start routing options are rejected.
- The local attempt owns the workflow task lease. Activity `heartbeat()` renews
  that workflow task lease and records `ActivityHeartbeatRecorded`.
- Retries are durable workflow tasks with backoff, not hidden loop retries.
- Cold replay reads committed activity history. If a started local attempt has
  no terminal event after worker loss, the next attempt records
  `retry_reason=cold_replay`.
- Run detail, history export, timelines, and operator metrics expose local
  attempts separately from ordinary queued attempts.

## Authoring API

Use the namespaced helper:

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(
        maxAttempts: 3,
        startToCloseTimeout: 10,
        scheduleToCloseTimeout: 30,
        heartbeatTimeout: 5,
    ),
    $orderId,
);
```

Or use the static workflow facade:

```php
use Workflow\V2\Workflow;

$receipt = Workflow::localActivity(SendReceiptActivity::class, $orderId);
$receipt = Workflow::executeLocalActivity(SendReceiptActivity::class, $orderId);
```

`LocalActivityOptions` accepts retry and timeout fields:

- `maxAttempts`
- `backoff`
- `startToCloseTimeout`
- `scheduleToCloseTimeout`
- `heartbeatTimeout`
- `nonRetryableErrorTypes`

It rejects `connection`, `queue`, worker-session routing, and
`scheduleToStartTimeout` because a local activity does not enter normal task
matching.

## Execution And History

When workflow replay reaches a local activity, the current workflow task:

1. creates the activity execution with `activity_options.execution_mode=local`;
2. records `ActivityScheduled` and `ActivityStarted` with the local marker;
3. instantiates and runs the activity class in the workflow worker process;
4. records `ActivityCompleted`, `ActivityFailed`, `ActivityTimedOut`, or
   `ActivityCancelled`;
5. resumes workflow code from the recorded activity event.

Replay does not rerun a completed local activity. Query replay and cold replay
read the same activity history events that ordinary activities use.

## Heartbeats

A local activity does not own an activity task lease. It owns the workflow task
lease that is currently executing the workflow. At attempt start, the runtime
renews the workflow task lease. When activity code calls `$this->heartbeat()`,
the runtime records progress, updates the activity attempt, and renews the
workflow task lease.

Long-running local activities must heartbeat often enough to keep both the
local activity heartbeat timeout and the workflow task lease healthy:

```php
use Workflow\V2\Activity;

final class PollShortJobActivity extends Activity
{
    public function handle(string $jobId): array
    {
        $state = $this->fetch($jobId);

        $this->heartbeat([
            'message' => 'Polling remote job',
            'job_id' => $jobId,
            'state' => $state['status'],
        ]);

        return $state;
    }
}
```

## Timeouts And Retries

`startToCloseTimeout` limits one attempt. `scheduleToCloseTimeout` limits the
whole local execution across retries. `heartbeatTimeout` limits the gap between
recorded local activity heartbeats.

When a retryable failure or timeout occurs, the runtime records
`ActivityRetryScheduled` and creates a workflow task that becomes available
after the retry backoff. That retry task replays workflow history, reaches the
same local activity sequence, and starts the next local attempt.

Each local attempt is a new `activity_attempts` row. A retry records
`retry_reason` as `failure`, `timeout`, or `cold_replay`.

## Cancellation And Worker Loss

Cancellation is cooperative. A local activity observes cancellation at
heartbeat, timeout enforcement, and attempt-completion boundaries. A cancelled
local attempt records `ActivityCancelled` with the local marker.

If a worker exits before committing a terminal local activity event, the
workflow task lease expires and normal task repair reclaims the workflow task.
Cold replay then reads committed history. If history contains a started local
attempt without a terminal event, the runtime schedules a retry with
`retry_reason=cold_replay`.

## Visibility

Operators can distinguish local activities everywhere activity state is
reported:

- history payloads include `execution_mode=local` and `local_activity=true`;
- `activity_executions.activity_options.execution_mode` is `local`;
- run detail and history export include `execution_mode` and `local_activity`;
- operator metrics expose `activities.local`, `activities.local_open`,
  `activities.local_attempts`, and queued-vs-local activity counters.

The runtime manifest is published at
`worker_protocol.server_capabilities.local_activities` in
`GET /api/cluster/info`. The machine-readable contract is
[`local-activity-runtime.schema.json`](/platform-protocol-specs/local-activity-runtime.schema.json)
and is indexed by the
[Platform Protocol Specs](/docs/platform-protocol-specs#local_activity_runtime)
catalog.

The event names remain normal activity event names so timelines and replay
tools preserve ordering without a parallel event family.

## Choosing The Right Primitive

Use a local activity for short, retryable, idempotent side effects that are
best executed by the workflow worker process and do not need queue routing.

Use an ordinary [activity](/docs/defining-workflows/activities) for remote
calls, slow I/O, CPU-heavy work, dedicated worker fleets, backpressure, or
work that should keep making progress through a separately leased activity
task after workflow worker loss.

Use [worker sessions](/docs/features/worker-sessions) when multiple
ordinary activity steps must reuse worker-local resources such as GPU memory
or a mounted filesystem.

Use [`sideEffect(...)`](/docs/features/side-effects) only for replay-safe
snapshots that do not need activity retry, timeout, heartbeat, or cancellation
semantics.
