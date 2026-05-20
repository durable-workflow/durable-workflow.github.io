---
sidebar_position: 8
---

# Heartbeats

Heartbeats let a long-running activity report that its current attempt is still alive.

`heartbeat()` updates the currently claimed `activity_attempts` row, mirrors the latest heartbeat onto the live activity execution, renews that activity task's lease, and appends a typed `ActivityHeartbeatRecorded` history event for the current attempt. Waterline selected-run detail and history exports rebuild attempt status, task id, worker, heartbeat, lease, cancellation, and close timestamps from typed `ActivityStarted`, `ActivityHeartbeatRecorded`, `ActivityRetryScheduled`, `ActivityCompleted`, `ActivityFailed`, and `ActivityCancelled` history first, with mutable attempt rows kept as fallback or enrichment for older data.

```php
use Workflow\V2\Activity;

final class PollRemoteJob extends Activity
{
    public function handle(string $jobId): array
    {
        do {
            sleep(1);

            $status = RemoteService::status($jobId);

            $this->heartbeat([
                'message' => 'Polling remote job',
                'current' => $status['completed'] ?? null,
                'total' => $status['total'] ?? null,
                'unit' => 'steps',
                'details' => [
                    'remote_state' => $status['state'] ?? 'running',
                ],
            ]);
        } while ($status['state'] === 'running');

        return $status;
    }
}
```

Inside the activity, `activityId()`, `attemptId()`, and `attemptCount()` expose the durable execution and current-attempt identity if you need correlation keys for external work. Use `activityId()` as the default remote idempotency key; use `attemptId()` only for systems that need to distinguish separate tries of the same durable activity execution.

Polyglot workers can heartbeat via the HTTP worker bridge without constructing the PHP activity class — see the [worker protocol](/docs/polyglot/worker-protocol) for the endpoints.

## Progress Snapshots

Both `Activity::heartbeat()` and `ActivityTaskBridge::heartbeat()` accept an optional bounded progress snapshot:

- `message`
  - non-empty string up to 280 characters
- `current`
  - non-negative integer or float
- `total`
  - non-negative integer or float
- `unit`
  - non-empty string up to 64 characters
- `details`
  - flat map of up to 20 `key => scalar|null` entries, where keys match `[A-Za-z0-9_.:-]{1,64}`

Use that payload for operator-facing progress like `"Downloading chunk"` or `2 / 5 chunks`, not for large logs or arbitrary nested state. Waterline selected-run detail, the timeline heartbeat entry, and history export surface it back as `last_heartbeat_progress` on the activity and current attempt, while the raw typed `ActivityHeartbeatRecorded` history event keeps the same normalized payload under `progress`.

## Durable Attempt Tracking

The runtime records one first-class durable row per activity attempt, including attempt number, status, started time, latest heartbeat, lease expiry, and close time. It also records typed attempt history as activities start, heartbeat, retry, complete, fail, or cancel, so historical attempt detail survives if mutable attempt or task rows drift later. Each successful heartbeat from the currently claimed attempt records a compact `ActivityHeartbeatRecorded` timeline point with the activity execution id, activity attempt id, heartbeat timestamp, lease expiry, and event-era activity snapshot. If a cancel or terminate command closes the run, the bridge records `ActivityCancelled` when the worker observes the stop and rejects later completion or failure as stale instead of turning cancellation into a result.

Heartbeats are operational liveness signals. Because every accepted heartbeat is durable history, keep the interval meaningful for your timeout and recovery needs rather than using it as a high-volume progress log, and keep the optional progress snapshot compact enough for operator diagnostics instead of treating it like a streaming event feed.
