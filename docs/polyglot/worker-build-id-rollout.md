---
sidebar_position: 7
title: Worker Build-Id Rollout
description: Inspect worker cohorts, select the build for new starts, and preserve capacity for runs pinned to older builds.
tags: [worker-protocol, operations, rollouts, build-ids, task-queues]
keywords: [worker build id rollout, drain worker build, rollback worker build, canary workers, unversioned to versioned cutover]
---

# Worker Build-Id Rollout

## Replay before changing builds {#replay-before-changing-builds}

Before promoting a candidate, replay representative open and recently closed histories against its exact application code. Before rollback, replay histories written by the newer build against the older artifact. Follow the [replay testing gate](../testing.md#replay-before-deployment); a compatible routing cohort or successful integrity check alone does not prove replay compatibility.

Use this guide to inspect worker cohorts, choose the build for new workflow
starts, and keep compatible workers available for existing runs. Promotion
changes new-start selection. Draining stops new claims by the selected cohort.
Neither operation migrates existing runs or proves that a build can be deleted;
[guarded retirement](#retire-a-build-or-queue) makes that decision.

Read [Worker Compatibility and Routing](/docs/polyglot/worker-compatibility-routing)
for the identity carried by workflow tasks, activities, retries, children and
continue-as-new. A cohort is scoped to `(namespace, task_queue, build_id)`.
Registrations without a `build_id` belong to the unversioned, `null` cohort.

## Rollout State The Server Records {#rollout-state-the-server-records}

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

## Inspect The Rollout {#inspect-the-rollout}

Read the exact namespace and queue before changing capacity:

```bash
curl -fsS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders-critical/build-ids" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

```bash
dw task-queue:build-ids orders-critical --namespace orders-prod --json
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
the last required cohort to zero; use [guarded retirement](#retire-a-build-or-queue).

[Server #534](https://github.com/durable-workflow/server/issues/534) tracks the
separate scrape/scale-to-zero capability. There is no documented built-in
KEDA/HPA trigger here.

## First Cutover: Unversioned To Versioned {#first-cutover-unversioned-to-versioned}

1. Start the new workers with a stable build id and verify their namespace,
   queue, workflow types and fresh heartbeats.
2. Inspect both cohorts and the original runs. Do not infer compatibility from
   a newer build name or a worker count.
3. Explicitly promote the new build when new starts should select it:

   ```bash
   dw task-queue:promote orders-critical --namespace orders-prod --build-id orders-v2
   ```

4. Keep compatible workers for existing histories. Promotion does not assign
   the new pin to old runs, and draining is not a migration.
5. Retire the old build with [guarded retirement](#retire-a-build-or-queue)
   once its inventory is empty. Empty task counts and zero worker registrations
   are not that proof. Keep the build artifact while any run can need it.

## Canary A New Build {#canary-a-new-build}

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

## Move a chain at its next continuation {#move-a-chain-at-its-next-continuation}

With a Server and SDK that negotiate `continue_as_new_target_build` on worker
protocol 1.21, opt into the promoted build at a continue-as-new boundary. The
successor starts a fresh history with the arguments you pass it. Use this option
when the promoted build can decode and accept those arguments. Plain
continue-as-new keeps the predecessor's build pin.

Server selects the durable promotion for the successor's exact namespace, queue
and workflow type when it closes the predecessor. The destination can be scaled
to zero if Server already has durable evidence that the build serves that type.
If no promotion is eligible, Server refuses admission and leaves the current run
open. The worker reports `promoted_build_unavailable` through the workflow task's
normal retry path. Waterline shows the refusal and any scheduled retry. A
successful transition records both build pins in the linked runs' histories.

Keep old-build workers available while open runs still need that build. Each
chain moves when its own opted-in continuation commits. Open child runs keep
their own build pins.

## Drain An Older Build {#drain-an-older-build}

Draining prevents that cohort's workflow, activity and query polls from claiming
new work. It does not move those tasks to another build. A poll from a draining
worker returns HTTP409 with `poll_status: "draining"` and
`reason: "worker_draining"`. Existing leases retain their original authority.

```bash
dw task-queue:drain orders-critical --namespace orders-prod --build-id orders-v1
```

Do not issue this just because the new build can claim its own work. Existing
old-build runs may remain waiting after the drain. To recover an early drain,
resume the cohort and restore workers with the required original build:

```bash
dw task-queue:resume orders-critical --namespace orders-prod --build-id orders-v1
```

Draining or stopping every worker is not proof that the build artifact is safe
to remove. Drain remains the emergency stop: it refuses the build's polls
immediately, whether or not work is still pinned to it. Use
[guarded retirement](#retire-a-build-or-queue) to decide removal.

## Retire A Build Or Queue {#retire-a-build-or-queue}

Native Server 3.14.0 and later answer whether a build or queue can be removed
safely, and refuse to retire it while any live dependency remains. Require
`capabilities.worker_build_retirement` to be exactly `true` on
`GET /api/cluster/info`; published PHP Server does not serve these routes. Use
an operator or admin token and the namespace, like the other build-id routes.

| Intent | HTTP endpoint |
| --- | --- |
| Inspect one build | `GET /api/deployments/{namespace}/{taskQueue}@{buildId}/retirement` (`@unversioned` for the unversioned cohort) |
| Retire one build | `POST /api/deployments/{namespace}/{taskQueue}@{buildId}/retire` |
| Inspect every cohort on a queue | `GET /api/task-queues/{taskQueue}/retirement` |
| Retire a queue | `POST /api/task-queues/{taskQueue}/retire` |

1. Promote the replacement build and keep the old build's workers running.
   They finish the runs still pinned to it, delayed retries, timers and
   continued chains.
2. Inspect the old build until `retirable` is `true`:

   ```bash
   dw task-queue:retirement orders-critical --namespace orders-prod --build-id orders-v1 --json
   ```

   Each blocker gives its exact `count`, up to 20 sample identities and a
   `recovery` action: let the work finish, or cancel or terminate the runs you
   choose to abandon.
3. Retire it, optionally bound to the inspected
   `observation.inventory_revision`:

   ```bash
   dw task-queue:retire orders-critical --namespace orders-prod --build-id orders-v1 \
     --expected-revision "$INVENTORY_REVISION"
   ```

4. Stop the old build's processes only after the retire succeeds.

Without `--build-id` or `--unversioned`, both commands act on every cohort on
the queue. These commands need CLI 2.12.0 or later; with an earlier
CLI, call the HTTP routes directly.

The inventory counts open runs pinned to the build (including waiting,
continued and child runs), ready, leased and delayed tasks (activity retries
and timers not yet due), open activities, pending update validations and, for a
queue, schedules that start runs on it. An open run with no recorded task queue
makes the inventory `incomplete`, and retirement is unavailable.

Inspection is a preview. The retire action counts again inside the same
serialized transition that starts, retries and task creation take, and writes
only when nothing remains. A refused retire answers HTTP409 and changes
nothing; follow `expected_resolution` and inspect again.

| `reason` | Meaning |
| --- | --- |
| `unknown_deployment`, `unknown_task_queue` | No worker registered and no rollout was recorded for the target. |
| `selected_for_new_starts` | New starts on the queue still select this build. Promote the replacement first. |
| `inventory_incomplete` | Unattributed open runs exist. Missing inventory is never permission to retire. |
| `live_dependencies` | At least one blocker has a nonzero count. |
| `inventory_changed` | The `expected_inventory_revision` no longer matches. |

A successful retire returns HTTP200 with `outcome: "retired"`, `retired_at` and
`retired_by`. The build's rollout intent becomes the terminal `drained` state:
it is never selected for new starts, cannot be promoted or resumed through the
deployment lifecycle, and its workers stay draining. When every cohort on a
queue is retired and no active worker remains, new starts there are refused
with `task_queue_draining` and `routing_status: "retired"` until a new active
cohort registers. Run pins, activity queues, history and deadlines are
unchanged.

To recover, `dw task-queue:resume` (`POST /api/task-queues/{taskQueue}/build-ids/resume`)
sets a retired build back to `active`; retirement guaranteed it had no work at
that time.

## Roll Back A Bad Build {#roll-back-a-bad-build}

Restore known-good workers, resume their cohort if necessary, and promote that
build for future starts. Then use the deployment rollback action for the bad
build. Rollback does not rewrite existing run pins or deliver their remaining
work to a different build. Preserve compatible workers for those runs or make
an explicit application recovery decision.

Retries, children and plain continue-as-new inherit the original compatibility
pin. Use a stable build identity for replay-compatible deployments. Long-lived
chains can [opt into the promoted build](#move-a-chain-at-its-next-continuation)
when they continue. Keep stored compatibility fields intact during recovery.

## Endpoints And Commands Reference {#endpoints-and-commands-reference}

| Intent | HTTP endpoint | CLI | Python SDK method |
| --- | --- | --- | --- |
| Inspect cohorts | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| Promote for new starts | `POST /api/task-queues/{taskQueue}/build-ids/promote` | `dw task-queue:promote` | `Client.promote_task_queue_build_id` |
| Drain | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| Resume | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |
| Inspect retirement | `GET /api/task-queues/{taskQueue}/retirement`, `GET /api/deployments/{name}/retirement` | `dw task-queue:retirement` | — |
| Retire | `POST /api/task-queues/{taskQueue}/retire`, `POST /api/deployments/{name}/retire` | `dw task-queue:retire` | — |

The promote, drain and resume routes accept `{"build_id":"orders-v2"}` or
`{"build_id":null}` for the unversioned cohort. The retire routes take an
optional `{"expected_inventory_revision":"..."}` body. CLI mutation commands use
`--build-id` or `--unversioned`, never both.

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

## Related References {#related-references}

- [Worker Compatibility and Routing](/docs/polyglot/worker-compatibility-routing)
- [Namespace, Auth, And Worker Registration](/docs/polyglot/namespace-auth-workers)
- [Task Queue Admission](/docs/polyglot/task-queue-admission)
- [Rolling Upgrades](/docs/rolling-upgrades)
- [Server API Reference](/docs/polyglot/server-api-reference)
- [CLI Command Reference](/docs/polyglot/cli-reference)
