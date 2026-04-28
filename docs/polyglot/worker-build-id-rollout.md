---
sidebar_position: 7
title: Worker Build-Id Rollout
description: Roll out, canary, drain, and roll back worker builds without stranding executions using build-id rollout state on the standalone server.
tags:
  - worker-protocol
  - operations
  - rollouts
  - build-ids
  - task-queues
keywords:
  - worker build id rollout
  - drain worker build
  - rollback worker build
  - canary workers
  - unversioned to versioned cutover
---

# Worker Build-Id Rollout

Use this reference when you cut over from unversioned workers to build-tagged
workers, canary a new build onto a task queue, drain an older build before
decommissioning it, or roll a bad build back. The server records operator
intent alongside the live worker rows so the next poll, CLI describe, or
`list_task_queue_build_ids` call reflects the rollout state honestly even if
the old workers disappear before their backlog drains.

This guide is about cohort control, not the whole routing contract. Read
[Worker Compatibility and Routing](/docs/2.0/polyglot/worker-compatibility-routing)
for the rule that in-flight work must stay pinned to compatible executors and
that "no compatible worker is available" is explicit operator state.

The Durable Workflow server expresses a rollout on one task queue as a set of
**build-id cohorts**. A cohort groups every worker registration that reported
the same `build_id` when it called `POST /api/worker/register`. Workers that
omit `build_id` form the **unversioned cohort**, which is the pre-rollout
default and the one you migrate away from on the first cutover.

## Rollout State The Server Records

Each `(namespace, task_queue, build_id)` cohort carries the aggregated worker
state (active, draining, stale, total counts) plus operator intent:

| Field | Purpose |
| --- | --- |
| `build_id` | The registered build identity. `null` identifies the unversioned cohort. |
| `rollout_status` | Aggregate view of what the cohort will do with new tasks: `active`, `active_with_draining`, `draining`, `stale_only`, or `no_workers`. |
| `drain_intent` | Operator intent for the cohort: `active` or `draining`. |
| `drained_at` | When the cohort was first marked draining. Absent while the cohort is active. Repeated drain calls do not shift this timestamp. |
| `active_worker_count` | Live workers currently accepting new tasks. |
| `draining_worker_count` | Live workers that still hold in-flight tasks but no longer claim new work. |
| `stale_worker_count` | Workers whose last heartbeat is older than the stale cutoff. |
| `total_worker_count` | Sum of the three cohort populations. |
| `runtimes`, `sdk_versions` | Distinct runtime and SDK version strings observed across the cohort. |
| `last_heartbeat_at`, `first_seen_at` | Cohort-wide heartbeat window, useful for confirming quiet cohorts before deleting them. |

`drain_intent` is persistent: resuming a cohort, stopping every worker, or
letting the cohort go stale does not silently flip it back to `active`. Only
an explicit `POST .../build-ids/resume` clears `drain_intent` and `drained_at`.
This keeps `rollout_status` honest even after a cohort has no live workers.

## Inspect The Rollout

Before draining or deleting a build, confirm which cohorts are still
reachable on the queue:

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders-critical/build-ids" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

The same snapshot is available from the operator CLI and the Python SDK:

```bash
dw task-queue:build-ids orders-critical --json
```

```python
from durable_workflow import Client

async with Client("https://durable-workflow.example", token=operator_token) as client:
    rollout = await client.list_task_queue_build_ids("orders-critical")
    for cohort in rollout.build_ids:
        print(cohort.build_id, cohort.rollout_status, cohort.total_worker_count)
```

## First Cutover: Unversioned To Versioned

A queue that has always been served by unversioned workers reports a single
`build_id: null` cohort with `rollout_status: "active"`. The first cutover
introduces a new build-tagged cohort alongside it.

1. Deploy the new worker fleet with a stable `build_id` (for example,
   `orders-worker-2026-04-22`) registered through
   `POST /api/worker/register`.
2. Confirm both cohorts are active:
   ```bash
   dw task-queue:build-ids orders-critical --json
   ```
   You should see `null` and the new `build_id` each reporting
   `rollout_status: "active"` and non-zero `active_worker_count`.
3. Start the drain on the unversioned cohort once the new workers are
   handling work:
   ```bash
   dw task-queue:drain orders-critical --unversioned
   ```
   `drain_intent` flips to `draining` for the unversioned cohort. Workers
   that are still running process their in-flight tasks but stop claiming
   new ones. Future worker registrations or heartbeats that arrive without
   a `build_id` land as draining too.
4. Wait until `active_worker_count` and `draining_worker_count` are both
   zero for the unversioned cohort. The cohort stays listed with
   `drain_intent: "draining"` so you can confirm the cutover is permanent.

## Canary A New Build

A canary is a second build that takes a small fraction of traffic while the
primary build keeps serving. Use a separate `build_id` for the canary so each
cohort's state is individually inspectable.

1. Deploy the canary workers with `build_id: orders-worker-2026-04-22-canary`.
2. Inspect `list_task_queue_build_ids` to confirm both cohorts report
   `rollout_status: "active"` with the expected worker counts.
3. Promote by starting more workers on the new `build_id` and reducing the
   primary's worker count, or demote the canary by draining it:
   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22-canary
   ```

The server does not control the task split across cohorts. Operators size
the cohort populations and rely on polling distribution to weight traffic.
Build-id rollout state exists so operators can confirm which cohorts can still
claim work and trigger a clean handoff when one cohort is ready to stop.

## Drain An Older Build

Draining keeps already-leased tasks on the older build while new tasks go to
other active cohorts on the queue:

```bash
dw task-queue:drain orders-critical --build-id orders-worker-2026-04-21-z9
```

The server stamps `drain_intent: "draining"` on the cohort and marks every
worker registered under that `build_id` as draining on its next heartbeat.
The call is idempotent: rerunning it does not reset `drained_at`, so you can
safely retry it from automation.

Once a worker row is marked `draining`, the workflow-task, activity-task, and
query-task poll routes stop leasing new work to that worker. Polls fail with
HTTP `409`, `poll_status: "draining"`, and `reason: "worker_draining"` until
the cohort is resumed.

Monitor the drain by polling `list_task_queue_build_ids` and watching
`active_worker_count` and `draining_worker_count` fall to zero. At that point
the cohort shows `rollout_status: "draining"` with zero worker counts, meaning
no live workers remain and operator intent still records "drained". That is
the safe moment to stop the worker processes and delete the build artifact.

## Roll Back A Bad Build

Rollback is the reverse flow: resume a previously drained cohort, route new
traffic back to it, and drain the bad build.

1. Resume the known-good cohort:
   ```bash
   dw task-queue:resume orders-critical --build-id orders-worker-2026-04-21-z9
   ```
   The server clears `drain_intent`, wipes `drained_at`, and flips any
   worker rows that are still heartbeating in under that `build_id` back to
   `active` immediately so the read endpoint stops reporting draining state.
2. Drain the bad cohort:
   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22
   ```
3. Scale the known-good build back up or redeploy it if workers have
   already been stopped. Workers registering under its `build_id` pick up
   the cleared drain intent and land as `active`.

Resume is also idempotent. Rerunning it against an already-active cohort
is a no-op, so automated rollback flows can issue it safely.

## Endpoints And Commands Reference

| Intent | HTTP endpoint | CLI | Python SDK method |
| --- | --- | --- | --- |
| Inspect cohort state | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| Mark a cohort as draining | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| Resume a previously drained cohort | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |

Drain and resume both take a JSON body of `{"build_id": "..."}`, or
`{"build_id": null}` for the unversioned cohort. The CLI expresses the
unversioned cohort with `--unversioned` and any other build with
`--build-id <value>`; combining the two fails fast.

## Related References

- [Namespace, Auth, And Worker Registration](/docs/2.0/polyglot/namespace-auth-workers)
  for the `POST /api/worker/register` call that stamps `build_id` on every
  worker.
- [Task Queue Admission](/docs/2.0/polyglot/task-queue-admission) for the
  worker-slot and dispatch budgets that apply alongside rollout state.
- [Server API Reference](/docs/2.0/polyglot/server-api-reference) for the
  full list of control-plane routes and their required roles and protocol
  headers.
- [CLI Command Reference](/docs/2.0/polyglot/cli-reference) for the argument
  and flag shape of every `dw task-queue:*` subcommand.
