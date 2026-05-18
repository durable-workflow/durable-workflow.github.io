---
sidebar_position: 24
title: Worker Sessions
description: Pin a sequence of durable activity attempts to one worker-session lease for GPU, filesystem, or process-local state affinity.
tags:
  - activities
  - workers
  - affinity
  - operations
keywords:
  - worker sessions
  - activity affinity
  - gpu workers
  - filesystem local workers
  - worker protocol sessions
---

# Worker Sessions

Worker sessions are the v2 activity-affinity primitive. Use them when several
durable activity steps must reuse process-local state, GPU memory, a mounted
filesystem, or another worker-local resource.

## Contract Summary

- A session has one lease owner at a time.
- The first admitted in-session activity creates or reacquires the lease.
- Activity heartbeats renew both the activity attempt lease and the session
  lease.
- `POST /api/worker/sessions`, `POST /api/worker/sessions/{sessionId}/heartbeat`,
  and `DELETE /api/worker/sessions/{sessionId}` expose explicit lifecycle
  verbs for external workers.
- Queue routing still runs first; worker-session admission runs after the
  worker is registered for the task queue.
- Worker registration `capabilities` must satisfy every session requirement.
- Expired and orphaned sessions are visible to operators and may be reacquired
  when the session allows failure recovery.

## Authoring API

PHP workflow authors create a session handle with `Workflow::workerSession()`
or `Workflow\V2\workerSession()` and schedule activities through that handle:

```php
use Workflow\V2\Support\WorkerSessionOptions;
use Workflow\V2\Workflow;

$session = Workflow::workerSession(
    'gpu-render',
    new WorkerSessionOptions(
        queue: 'gpu-activities',
        requirements: ['gpu:nvidia-l4'],
        leaseSeconds: 120,
        ttlSeconds: 1800,
        maxConcurrentActivities: 1,
    ),
);

$frames = $session->activity(RenderFramesActivity::class, $videoId);
$manifest = $session->activity(AssembleManifestActivity::class, $frames['path']);
```

The activity option snapshot stores the same contract under
`activity_options.worker_session`. External runtimes use the same JSON shape
on a `schedule_activity` workflow-task command under `worker_session`.

```json
{
  "type": "schedule_activity",
  "activity_type": "media.render-frames",
  "worker_session": {
    "session_id": "gpu-render",
    "queue": "gpu-activities",
    "requirements": ["gpu:nvidia-l4"],
    "lease_seconds": 120,
    "ttl_seconds": 1800,
    "max_concurrent_activities": 1,
    "create_if_missing": true,
    "allow_reacquire_after_failure": true
  }
}
```

## Lifecycle

Session creation is lazy. The matching layer creates or reacquires a session
when the first in-session activity task is admitted to a capable worker. A
worker may also create the session explicitly before polling by calling
`POST /api/worker/sessions`.

An active session ends when the holder closes it, the session lease expires,
the absolute TTL expires, or the holding worker is detected as failed. TTL
expiry and explicit close are terminal for that session id. Lease expiry and
orphan detection may be reacquired when `allow_reacquire_after_failure` is
true.

## Lease And Ownership

At most one worker owns a session lease at a time. The server admits
in-session activity tasks only when one of these is true:

- no session exists and `create_if_missing` is true;
- the active session is already owned by the polling worker;
- the session is expired, failed, or orphaned and reacquisition is allowed.

Session ownership does not replace the per-attempt activity lease. Each
activity attempt still has its own `activity_attempt_id`, lease owner,
heartbeat, completion, failure, timeout, and cancellation path.

## Admission And Routing

Worker sessions participate in normal queue routing. `WorkerSessionOptions`
may set `connection` and `queue`; per-call `ActivityOptions` can still
override them. The server enforces session-specific admission after normal
task-queue admission:

- worker registration `capabilities` must cover every session requirement;
- `max_concurrent_activities` caps leased activity attempts inside the
  session;
- `max_concurrent_worker_sessions` caps active session leases held by one
  worker registration.

Fleet-specific routing uses plain capability strings such as `gpu:nvidia-l4`,
`gpu:a100`, `fs:/mnt/models`, or `zone:us-east-1a`.

## Failure, Cancellation, And Shutdown

Activity heartbeats renew the activity attempt lease and the session lease.
Workers may also renew the session directly through the worker protocol. If
the session lease expires, the session becomes `expired`; if the holding
worker registration heartbeat is stale or missing, the session becomes
`orphaned`.

When the holding worker dies mid-sequence, in-flight activities keep ordinary
at-least-once behavior: their attempt leases expire, repair makes them
claimable again, and stale completion may be rejected. A capable worker may
reacquire the session when the contract allows it. Workflow authors must
expect process-local state to be rebuilt after reacquisition.

Workflow cancellation still propagates through activity heartbeat responses.
A session lease never authorizes an in-session activity to ignore
`cancel_requested`. Planned worker shutdown should close held sessions through
`DELETE /api/worker/sessions/{sessionId}` before stopping the process;
in-flight activities still finish, fail, cancel, or expire under their own
attempt leases.

## Visibility

Worker-protocol capabilities advertise `worker_session_verbs` and the
`worker_sessions` runtime contract through `GET /api/cluster/info` and every
worker-plane response. The machine-readable contract is published in
[`worker-sessions-runtime.schema.json`](/platform-protocol-specs/worker-sessions-runtime.schema.json)
and is indexed by the
[Platform Protocol Specs](/docs/platform-protocol-specs#worker_sessions_runtime)
catalog.

Operators can list active, closed, expired, failed, and orphaned sessions at
`GET /api/worker-sessions`. The detail surface includes session id, holder,
queue, requirements, lease expiry, TTL expiry, active activity count, and
failure reason. System operator metrics include counts for each session
status.

## Choosing Worker Sessions

Prefer ordinary queued activities when each step is independent. Prefer one
larger activity when the whole operation is one atomic side effect. Use a
worker session only when multiple durable activity steps must reuse a
worker-local resource and the workflow can tolerate rebuilding that resource
after worker failure.

See [Activity Execution Model](/docs/features/activity-execution-model)
for how worker sessions relate to ordinary queued activities, local
activities, and sticky execution.
