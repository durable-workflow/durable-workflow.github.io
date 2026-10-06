---
title: Cooperative cancellation
description: Request bounded cleanup across a workflow, its children and its activities.
---

# Cooperative cancellation

Server 2.5.0 adds cooperative cancellation through protocol 1.20. It requires
workers that explicitly enable cooperation. Check runtime
discovery and the SDK's capability support before using it.

## Request cleanup

Use `requestCancellation()` in the PHP SDK, `request_cancellation()` in Python
or Rust, or the Server's `request-cancellation` route. The run stays active while
workflow code handles the request and performs cleanup. Successful cleanup ends
the run as `Cancelled`.

```http
POST /api/workflows/{workflowId}/runs/{runId}/request-cancellation
X-Durable-Workflow-Control-Plane-Version: 2
Authorization: Bearer <operator-token>
X-Namespace: <namespace>
Content-Type: application/json

{"reason":"Order withdrawn","cleanup_timeout_seconds":30}
```

The selected run must still be current. A first accepted request returns HTTP
202. A duplicate returns HTTP 200 with the original request identity and deadline.
Changing the timeout on a duplicate does not extend the cleanup budget.

The immutable cancellation context exposes the request and root IDs, reason,
requester, source, original request time, deadline and ordered lineage. Workflow
code receives it at the recorded delivery boundary. Earlier completed calls
replay normally. The deterministic `deadline()` and `remaining()` helpers let
cleanup make the same decisions after a restart.

Existing `cancel()` closes a run immediately and does not resume workflow
cleanup. `terminate()` also closes it immediately, with a `Terminated` outcome.

## Choose operation policies

| Policy | Child workflow | Remote activity | Local activity |
| --- | --- | --- | --- |
| TryCancel | Request child cleanup and continue parent cleanup | Request callback stop and continue workflow cleanup | Stop the supervised callback and continue cleanup |
| WaitCancellationCompleted | Wait for the child's recorded terminal outcome | Wait for the original callback's durable stop receipt | Join the original callback's durable stop receipt |
| Abandon | Leave the child independent | Leave the activity independent under its original finite total timeout | Rejected before admission |

Parent closure has a separate policy. `RequestCancellation` sends a cooperative
request with the original cancellation lineage and bounded deadline.
`RequestCancel` retains its legacy immediate cancellation behavior.

Each cooperating child inherits the root request identity and cleanup budget.
A child can receive a narrower deadline, but cannot enlarge that budget. An
abandoned operation has an independent lifetime and is outside that cleanup
join.

## Supervision and recovery

Cooperative workers observe cancellation independently of application activity
heartbeats. PHP uses supervised callback processes. Python supervises async and
synchronous callbacks. Rust supervises async callback futures. Detached work and
downstream services need their own cancellation and idempotency behavior.

Cleanup can use a cancellation shield to perform durable activities, timers and
child calls. The shield preserves the original deadline. If a worker dies,
a replacement replays the same delivery boundary and completed cleanup calls
before resuming. Expiry or termination revokes remaining execution authority.

An old activity attempt cannot publish a result after it is fenced. Already
accepted external side effects still need application idempotency or
reconciliation.

## Inspect the cascade

Run diagnostics expose `cancellation_cascade`, including the root request,
participating runs, activity attempts, policies, stop receipts, deadlines and
cleanup outcomes. The CLI and Waterline present the same view.

The lifecycle distinguishes `requested`, `delivered`, `cleaning_up`, `cancelled`,
`deadline_expired` and `terminated`. An incomplete view identifies what cannot
be verified rather than treating a missing receipt as proof of success.

A request against an incompatible active worker claim returns an explicit
capability refusal without recording a partial cancellation. Upgrading a
registration does not upgrade a claim that was already issued.

## Release boundary

Whole-run requests, child and activity policies, bounded shielded cleanup,
recovery and cascade inspection form the supported release. Independently
cancellable operation scopes remain a disabled source preview and are marked
experimental in the protocol reference.

See the [worker protocol specification](/platform-protocol-specs/worker-protocol-api.openapi.yaml)
for exact request, receipt and capability shapes. Language-specific authoring
guides live on the [PHP](https://php.durable-workflow.com/),
[Python](https://python.durable-workflow.com/) and
[Rust](https://rust.durable-workflow.com/) SDK sites.
