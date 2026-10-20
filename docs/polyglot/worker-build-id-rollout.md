---
sidebar_position: 7
title: Worker Build-Id Rollout
description: Inspect worker cohorts, select the build for new starts, and preserve capacity for runs pinned to older builds.
tags: [worker-protocol, operations, rollouts, build-ids, task-queues]
keywords: [worker build id rollout, drain worker build, rollback worker build, canary workers, unversioned to versioned cutover]
---

# Worker Build-Id Rollout

Use this guide to inspect worker cohorts, choose the build for new workflow
starts, and keep compatible workers available for existing runs. Promotion
changes new-start selection. Draining stops new claims by the selected cohort.
Neither operation migrates existing runs or proves that a build can be deleted.

Read [Worker Compatibility and Routing](/docs/polyglot/worker-compatibility-routing)
for the identity carried by workflow tasks, activities, retries, children and
continue-as-new. A cohort is scoped to `(namespace, task_queue, build_id)`.
Registrations without a `build_id` belong to the unversioned, `null` cohort.

## Rollout State The Server Records

| Field | Meaning |
| --- | --- |
| `build_id` | Registered build identity; `null` is the unversioned cohort. |
| `rollout_status` | `active`, `active_with_draining`, `draining`, `stale_only`, or `no_workers`. |
| `drain_intent`, `drained_at` | Persistent operator drain intent and its first timestamp. Repeating a drain does not move the timestamp. |
| `promoted_at`, `rolled_back_at` | Persisted promotion and rollback timestamps. |
| `new_start_selected` | This cohort is the selected explicit promotion. A false value does not rule out the single-cohort fallback described below. |
| `active_worker_count` | Fresh, non-draining registrations. This is not a count of free task slots or proof that every workflow type is covered. |
| `draining_worker_count` | Fresh registrations marked draining, which cannot claim new tasks. They do not necessarily hold a lease. |
| `stale_worker_count` | Registrations whose heartbeat is older than `stale_after_seconds`. |
| `total_worker_count` | Active, draining and stale registrations combined. |
| `runtimes`, `sdk_versions` | Runtime and SDK strings observed in registrations. |
| `last_heartbeat_at`, `first_seen_at` | Registration freshness and age, not proof that a build has no remaining runs. |
| `pending_workflow_tasks` | Workflow-task counts and their diagnosis, described below. |

Drain intent survives worker restarts, missing workers and stale heartbeats.
Resume explicitly clears it. A missing worker is not implicitly resumed.

## Inspect The Rollout

Read the exact namespace and queue before changing capacity:

```bash
curl -fsS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders-critical/build-ids" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

```bash
dw task-queue:build-ids orders-critical --json
```

```python
from durable_workflow import Client

async with Client("https://durable-workflow.example", token=operator_token,
                  namespace="orders-prod") as client:
    rollout = await client.list_task_queue_build_ids("orders-critical")
    for cohort in rollout.build_ids:
        print(cohort.build_id, cohort.rollout_status, cohort.total_worker_count)
```

The HTTP snapshot is the reference for additive fields that an older SDK's
response model may not expose.

## Pending Workflow Tasks By Cohort {#pending-workflow-tasks-by-cohort}

`pending_workflow_tasks` counts only workflow tasks on this namespace and queue,
grouped by effective task compatibility, falling back to the run's compatibility.
It is not an activity backlog, number of open runs, throughput or process load.

| Nested field | Interpretation |
| --- | --- |
| `ready_count` | Workflow-task rows in `ready` state. |
| `leased_count` | Workflow-task rows in `leased` state. |
| `total_count` | `ready_count + leased_count`. |
| `status` | `idle` for zero tasks; otherwise `pending`, or `no_compatible_worker` for a non-null build with no active worker. |
| `operator_visible_signal`, `message` | Diagnosis when compatible workers are missing; otherwise these can be null. |

The unversioned cohort does not receive that build-specific missing-worker
diagnosis. Do not treat a missing field, failed request or stale observation as
zero. Re-read the snapshot and check worker heartbeats and type declarations.

For example, an old build can have two ready tasks and one leased task while a
new build has zero pending tasks. A queue total of three does not tell you
which fleet needs capacity. If the old build has zero active workers, restore
compatible old-build capacity or deliberately resume it when its drain intent
was accidental. Adding new-build workers does not consume work pinned to the old
build. If only stale registrations remain, investigate lost processes or
heartbeats before counting them as available capacity.

Reduce a cohort conservatively only after checking its own task counts, fresh
workers, declared workflow types, available slots and drain intent. Keep enough
compatible capacity for leased work and future work from existing runs. A run
waiting on a signal, timer, activity or child can have no pending workflow task
now and still require the old build later. Activities can use other recorded
queues. This endpoint does not establish safe retirement or authority to scale
the last required cohort to zero.

[Server #519](https://github.com/durable-workflow/server/issues/519) tracks a
guarded retirement decision. [Server #534](https://github.com/durable-workflow/server/issues/534)
tracks the separate scrape/scale-to-zero capability. These are not delivered by
this checklist, and there is no documented built-in KEDA/HPA trigger here.

## First Cutover: Unversioned To Versioned

1. Start the new workers with a stable build id and verify their namespace,
   queue, workflow types and fresh heartbeats.
2. Inspect both cohorts and the original runs. Do not infer compatibility from
   a newer build name or a worker count.
3. Explicitly promote the new build when new starts should select it:

   ```bash
   dw task-queue:promote orders-critical --build-id orders-v2
   ```

4. Keep compatible workers for existing histories. Promotion does not assign
   the new pin to old runs, and draining is not a migration.
5. Retire old capacity only when its remaining dependencies have been resolved
   independently. Empty task counts and zero worker registrations are not that
   proof. Keep the build artifact and recovery path while any run can need it.

## Canary A New Build

The Server does not provide a percentage ramp between build cohorts. For new
starts it selects the most recently promoted cohort that is neither draining
nor rolled back. Without such a promotion, it falls back to the only active
cohort advertising the requested workflow type, then the only active cohort on
the queue. Otherwise the run starts unpinned. Several active cohorts serving
the same type with no promotion therefore do not imply a weighted split.

Adding workers changes available capacity, not the promoted new-start policy.
For an isolated canary, choose a separate queue and explicitly route selected
application starts there. Keep old-build workers for old pinned runs when
promoting the new build on the original queue.

## Drain An Older Build

Draining prevents that cohort's workflow, activity and query polls from claiming
new work. It does not move those tasks to another build. A poll from a draining
worker returns HTTP409 with `poll_status: "draining"` and
`reason: "worker_draining"`. Existing leases retain their original authority.

```bash
dw task-queue:drain orders-critical --build-id orders-v1
```

Do not issue this just because the new build can claim its own work. Existing
old-build runs may remain waiting after the drain. To recover an early drain,
resume the cohort and restore workers with the required original build:

```bash
dw task-queue:resume orders-critical --build-id orders-v1
```

Draining or stopping every worker is not proof that the build artifact is safe
to remove. There is no guarded retirement decision in this snapshot.

## Roll Back A Bad Build

Restore known-good workers, resume their cohort if necessary, and promote that
build for future starts. Then use the deployment rollback action for the bad
build. Rollback does not rewrite existing run pins or deliver their remaining
work to a different build. Preserve compatible workers for those runs or make
an explicit application recovery decision.

Retries, children and continue-as-new inherit the original compatibility pin.
An indefinitely continued chain does not migrate to the newly promoted build.
Use a stable build identity for replay-compatible deployments, or finish the
old chain and start a genuinely new instance under the new-start policy. Do
not edit stored compatibility fields to force a migration.

## Endpoints And Commands Reference

| Intent | HTTP endpoint | CLI | Python SDK method |
| --- | --- | --- | --- |
| Inspect cohorts | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| Promote for new starts | `POST /api/task-queues/{taskQueue}/build-ids/promote` | `dw task-queue:promote` | `Client.promote_task_queue_build_id` |
| Drain | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| Resume | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |

These mutation routes accept `{"build_id":"orders-v2"}` or `{"build_id":null}`
for the unversioned cohort. CLI mutation commands use `--build-id` or
`--unversioned`, never both.

For the complete lifecycle, use `GET /api/deployments` and
`POST /api/deployments/{name}/{promote,drain,resume,rollback}`. Use the returned
name, such as `orders-prod/orders-critical@orders-v2`, with its original namespace.
On the published Apache path, preserve the name's slash separator: encoding the
entire compound name can produce an Apache HTML404 before the API is reached.
Refused lifecycle actions return HTTP409 with a typed `reason` and `blockages`
array. Inspect `expected_resolution`; a refusal is not a successful promotion.
The separate [Server #521](https://github.com/durable-workflow/server/issues/521)
tracks the incomplete current OpenAPI mirror, not a new runtime implementation
or a change to frozen schemas.

## Related References

- [Worker Compatibility and Routing](/docs/polyglot/worker-compatibility-routing)
- [Namespace, Auth, And Worker Registration](/docs/polyglot/namespace-auth-workers)
- [Task Queue Admission](/docs/polyglot/task-queue-admission)
- [Rolling Upgrades](/docs/rolling-upgrades)
- [Server API Reference](/docs/polyglot/server-api-reference)
- [CLI Command Reference](/docs/polyglot/cli-reference)
