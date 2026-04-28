---
sidebar_position: 15
title: Rolling Upgrades
description: Run a self-serve rolling upgrade across Durable Workflow server API nodes, workers, and the scheduler without stopping live traffic.
tags:
  - operations
  - upgrades
  - rollouts
  - rollback
keywords:
  - rolling upgrade
  - mixed-version safety
  - worker drain
  - schema fencing
  - readiness contract
  - rollback workflow
---

# Rolling Upgrades

Run a rolling upgrade when you want to replace API nodes, workers, or the
scheduler without taking the deployment offline. This contract covers the
small clustered shape from the [self-hosting deployments](/docs/2.0/deployment)
guide: two or three API nodes behind a load balancer, shared external MySQL
or PostgreSQL, shared Redis, independently scaled workers, and exactly one
scheduler or maintenance runner.

A rolling upgrade is supported when every guarantee on this page holds.
Outside that envelope, use the documented stop-the-world flow in the
deployment guide instead.

## What rolling upgrade means here

A **rolling upgrade** replaces processes one at a time, draining each one
before stopping it, while the rest of the fleet keeps serving traffic. The
result is zero downtime for the deployment as a whole and a bounded
mixed-version window where old and new processes coexist.

The contract distinguishes four roles, each with its own rollout posture:

- **API nodes**: stateless server processes serving HTTP traffic.
- **Workers**: SDK processes that poll the worker plane and execute
  activity and workflow tasks.
- **Scheduler / maintenance runner**: the singleton process that fires
  schedules and drives activity-timeout and history retention.
- **Bootstrap**: the one-shot process that runs database migrations and
  default-namespace seeding.

API nodes and workers roll independently. The scheduler is a singleton —
you stop the old one before starting the new one, but the rest of the
deployment keeps serving traffic across that gap.

## Compatible version-skew rules

The rolling-upgrade window is the time during which more than one server
image, workflow package version, or worker SDK version is live. The
window must satisfy every rule in this section.

### Server image and workflow package

- **Adjacent versions only.** During a rolling upgrade, every API node
  and worker must run a server image whose workflow package version is
  the same major version as the cluster's previous package and within
  one minor version of every other live process. Skipping a major
  version requires a stop-the-world upgrade.
- **Forward-additive migrations.** Every Durable Workflow v2 schema
  change is additive within a major version. New nodes must not require
  a column or table that has not been migrated in. Old nodes must not
  break when a new column they do not read is present. The
  [migration order rules](#schemabootstrap-ordering) below enforce this.
- **Adjacent control-plane and worker-protocol versions.** Every node
  publishes its supported `control_plane.version` and
  `worker_protocol.version` ranges from `GET /api/cluster/info`. During
  a rolling upgrade, the new image's supported range must overlap with
  every live old node's supported range. Discover the range before the
  rollout, and abort if it does not overlap.

### Worker SDK and build identity

- **Workers tag every build.** Every worker that may participate in a
  rolling upgrade must register through `POST /api/worker/register`
  with a stable `build_id`. The unversioned cohort
  (`build_id: null`) is the pre-rollout default; the
  [worker build-id rollout guide](/docs/2.0/polyglot/worker-build-id-rollout)
  explains the first cutover.
- **Workflow definition fingerprints stay pinned.** Server images
  carrying `DW_V2_PIN_TO_RECORDED_FINGERPRINT=true` (the default) keep
  in-flight runs pinned to the workflow definition fingerprint
  recorded at `WorkflowStarted`. A new worker that ships a different
  fingerprint for the same workflow refuses to claim those runs until
  they finish.
- **Mixed-build admission posture.** Choose the
  [`DW_V2_FLEET_VALIDATION_MODE`](/docs/2.0/polyglot/server-config-reference)
  posture before you start. `warn` lets the rollout proceed even when
  the required compatibility marker has no live worker;  `fail` blocks
  dispatch and fails the readiness contract closed during that window.
  Production rollouts that require a clean cutover should be on `fail`.

## Schema/bootstrap ordering

Schema changes ride a single bootstrap pass. Order matters.

1. **Run bootstrap first, exactly once.** Run `php artisan
   server:bootstrap --force` (or the published-image equivalent) from
   one container before starting any new API node, worker, or
   scheduler. Bootstrap runs `migrate` plus default-namespace seeding;
   it adopts any workflow package migrations whose tables already
   exist on the connection.
2. **New schema must be backwards-compatible with old code.** Every v2
   migration in this release path is additive (new tables, new
   columns, new indexes). Old API nodes and workers continue running
   against the new schema.
3. **Do not start new code before bootstrap completes.** Roll the new
   server image only after bootstrap exits successfully. New API nodes
   and workers may rely on the freshly migrated tables, and starting
   them before bootstrap finishes is the most common cause of a 5xx
   surge during the cutover.
4. **Bootstrap is idempotent.** Re-running it is safe. If bootstrap
   fails partway, fix the underlying error and re-run; the migration
   ledger picks up where it left off, and the namespace seed is a
   no-op when the row exists.

A migration that lands on one server before another MUST NOT corrupt
the readiness surface. If you discover a non-additive change during
planning, take a stop-the-world upgrade window for that release and
return to rolling upgrades on the next one.

## Drain and admission while mixed versions are live

Three admission surfaces enforce mixed-version safety automatically:

- **Boot-time admission.** Every server process loads
  `BackendCapabilities`, `LongPollCacheValidator`, `WorkflowModeGuard`,
  and the readiness contract at boot. A process whose backend or
  cache cannot satisfy the v2 contract refuses to mark itself ready.
- **Worker compatibility.** When
  `DW_V2_FLEET_VALIDATION_MODE=fail` and no live worker advertises the
  required compatibility marker for a task's connection and queue
  scope, the matching role blocks dispatch and the
  `worker_compatibility` health check escalates from `warning` to
  `error`. Tasks stay ready and visible — they are never dropped — and
  the readiness contract returns 503 on that node so the load balancer
  takes it out of rotation.
- **Routing safety.** A ready task whose required compatibility has no
  live worker is preserved and counted under the
  `compatibility_blocked_runs` backlog metric. Routing safety never
  silently escalates to task loss; the at-least-once execution
  guarantee still applies after a routing drain.

To keep the mixed-version window short on the worker side, drain old
worker cohorts as new workers come online. Use the
[worker build-id rollout](/docs/2.0/polyglot/worker-build-id-rollout)
flow:

```bash
dw task-queue:drain orders-critical --build-id orders-worker-2026-04-21-z9
```

The cohort's `drain_intent` flips to `draining`. Workers under that
build keep finishing in-flight work but stop claiming new tasks. Wait
for the cohort's `active_worker_count` and `draining_worker_count` to
reach zero before stopping the old worker processes.

The scheduler does not run a long-lived task queue, so it does not need
a worker drain. Stop the old scheduler container, run bootstrap if it
has not run yet, and start the new one. The window between the two is
bounded by how long it takes the new container to come up; schedule
firing resumes from the persisted state on next tick.

If the rollout also introduces a dedicated matching-role deployment, make that
topology change explicit instead of assuming every execution node will keep
doing broad ready-task sweeps. See
[Task Matching and Dispatch](/docs/2.0/polyglot/task-matching-dispatch) for
the documented `workflow:v2:repair-pass --loop` plus
`DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` shape.

## Readiness and cutover

Use the readiness contract — not just the liveness probe — to decide
when traffic flows to a node.

- `GET /api/health` proves the process is serving HTTP.
- `GET /api/ready` proves the process can use its configured runtime
  dependencies, including migrations, default namespace, and (under
  `DW_V2_FLEET_VALIDATION_MODE=fail`) the worker-compatibility
  admission check.
- `GET /api/cluster/info` proves an authenticated client can discover
  build identity, control-plane protocol, worker protocol, payload
  codecs, and server capabilities.
- `POST /api/worker/register` proves workers can authenticate into the
  expected namespace and task queue.

Cutover sequence for one API node:

1. Take the node out of the load balancer rotation. The simplest path
   is to fail the load balancer's readiness probe by stopping the new
   image's pre-start hook before bringing the new container up.
2. Drain in-flight HTTP requests. Most clients retry on connection
   reset; long-running connections (worker long-polls) reconnect
   against the rest of the fleet.
3. Stop the old container, start the new one.
4. Wait for `GET /api/ready` to return 200 and for
   `GET /api/cluster/info` to advertise the new build identity.
5. Return the node to rotation.

Repeat one node at a time. Do not roll the next node until the
previous one is back in rotation and serving traffic cleanly.

For workers, the cutover is per-cohort:

1. Bring the new worker cohort online with a new `build_id`.
2. Confirm both cohorts report `rollout_status: "active"` and non-zero
   `active_worker_count` from `dw task-queue:build-ids <queue> --json`.
3. Drain the old cohort with `dw task-queue:drain`.
4. Wait until the old cohort's `active_worker_count` and
   `draining_worker_count` reach zero.
5. Stop the old worker processes.

## Rollback

Every step is reversible. Plan for rollback before you start.

- **Bootstrap rollback.** v2 migrations are reversible by the standard
  Laravel `down()` path. A rollback that reverts a migration the new
  image relies on requires stopping every new node first; otherwise
  the new code observes a missing column and the readiness contract
  returns 503 on those nodes. Most rollbacks do not need to reverse
  migrations because schema changes are additive.
- **API node rollback.** Stop the new container, restart the old one
  on the same node. Take the node out of rotation while it boots and
  return it once `GET /api/ready` is green. Repeat for any other
  upgraded API nodes. Old code keeps reading the new schema cleanly
  because the schema change was additive.
- **Worker rollback.** Resume the previously drained cohort, drain
  the bad cohort, and scale the known-good build back up:

  ```bash
  dw task-queue:resume orders-critical --build-id orders-worker-2026-04-21-z9
  dw task-queue:drain  orders-critical --build-id orders-worker-2026-04-22
  ```

  Resume clears `drain_intent` and `drained_at`, and any worker
  heartbeating under the resumed `build_id` flips back to `active` on
  the next poll. Both calls are idempotent.

If the rollout exposed a non-additive schema problem, take a
stop-the-world upgrade window to roll back, run the corrective
migrations, and re-plan.

## Operator verification

Verify each phase of the rollout from operator surfaces, not from logs.

| Question | Surface |
| --- | --- |
| Is bootstrap finished? | `php artisan server:bootstrap --force` exit code 0; `migrate:status` shows every migration ran. |
| Is the new node ready? | `GET /api/ready` returns 200; `GET /api/cluster/info` reports the new build. |
| Is mixed-build admission healthy? | `GET /api/system/operator-metrics` `workers.fleet`, `workers.active_workers`, and `workers.active_workers_supporting_required` agree on a non-zero supporter count for every required compatibility marker. |
| Is the worker drain progressing? | `dw task-queue:build-ids <queue> --json` shows `active_worker_count` and `draining_worker_count` falling for the draining cohort. |
| Is routing safe? | `GET /api/system/operator-metrics` `backlog.compatibility_blocked_runs` and `backlog.max_compatibility_blocked_age_ms` stay near zero; the `worker_compatibility` health check is not in `error`. |
| Is the scheduler caught up? | `GET /api/system/operator-metrics` `schedules.missed` is zero and `schedules.oldest_overdue_at` is null. |
| Are stuck runs piling up? | `GET /api/system/operator-metrics` `runs.repair_needed` and `runs.max_repair_needed_age_ms` stay near their pre-rollout baseline. |

The same signals are rendered on the Waterline operator dashboard and
on `dw system:operator-metrics`, so operators may pick whichever surface
matches their existing workflow.

## Failure modes and what to do

| Symptom | Likely cause | Action |
| --- | --- | --- |
| New API node fails `GET /api/ready` after start | Bootstrap did not finish, or `DW_V2_FLEET_VALIDATION_MODE=fail` and no compatible worker is live yet | Rerun bootstrap; bring a compatible worker cohort online before adding the API node back to rotation. |
| `worker_compatibility` health check escalates to `error` mid-rollout | The required compatibility marker has no live supporting worker | Bring more workers under a supporting `build_id` online; resume a previously drained cohort if rollback is the right call. |
| `backlog.compatibility_blocked_runs` climbs and `max_compatibility_blocked_age_ms` grows | Tasks are queued for a marker no live worker supports | Same as above; tasks are preserved and will redispatch automatically once a compatible worker heartbeats. |
| `dw task-queue:drain` returns success but workers keep claiming tasks | The worker process did not heartbeat after the drain | Wait one heartbeat cycle; if the cohort stays active, restart the worker process so it picks up the drain intent. |
| Schedule fires stop after a scheduler restart | Old and new scheduler are both stopped | Start the new scheduler container; verify `schedules.missed` returns to zero on next operator-metrics scrape. |

If a symptom is not on this list, treat the rollout as failed: stop
adding new processes, drain whatever new cohorts you started, and
restore the previous build before debugging further.

## Related references

- [Self-Hosting Deployments](/docs/2.0/deployment) for the deployment
  shapes this contract assumes.
- [Worker Build-Id Rollout](/docs/2.0/polyglot/worker-build-id-rollout)
  for the per-cohort drain and resume calls.
- [Operator Operating Envelope](/docs/2.0/operator-operating-envelope)
  for the diagnostic, queue, and rebuild contract that operators read
  alongside the rollout signals.
- [Server Config Reference](/docs/2.0/polyglot/server-config-reference)
  for the rollout-safety environment variables (`DW_V2_FLEET_VALIDATION_MODE`,
  `DW_V2_PIN_TO_RECORDED_FINGERPRINT`, `DW_V2_GUARDRAILS_BOOT`,
  `DW_V2_CACHE_VALIDATION_MODE`, `DW_V2_MULTI_NODE`,
  `DW_V2_VALIDATE_CACHE_BACKEND`, `DW_V2_TASK_REPAIR_*`).
- [Server API Reference](/docs/2.0/polyglot/server-api-reference) for
  the readiness, cluster info, and operator-metrics endpoints used to
  verify each phase of the rollout.
