---
sidebar_position: 14
title: Operator Operating Envelope
description: The operator-facing contract for Durable Workflow v2 health, queue state, rebuilds, exports, archives, and deployment topology.
tags:
  - operations
  - observability
  - Waterline
keywords:
  - operating envelope
  - workflow v2 health
  - rebuild projections
  - history export
  - archive verification
  - queue health
  - high availability
---

# Operator Operating Envelope

This guide defines the operator-facing contract for Durable Workflow v2.
Use it to decide which diagnostics block rollouts, which ones are advisory,
which queue facts belong to Waterline versus worker telemetry, how to verify
rebuild and export workflows, and which deployment shapes are part of the
documented operating envelope.

## Source-of-truth surfaces

Use these surfaces together:

| Surface | Use it for | Contract class |
| --- | --- | --- |
| `php artisan workflow:v2:doctor --strict` | Backend capability gating before v2 traffic or upgrades | Blocking |
| `GET /waterline/api/v2/health` | Current engine-source readiness plus blocking vs advisory v2 health checks | Blocking when `status = error`, advisory when `status = warning` |
| `GET /waterline/api/stats` | Durable fleet totals, backlog counters, repair-loop facts, projection drift counts, worker compatibility summaries | Advisory and benchmarking |
| `php artisan workflow:v2:rebuild-projections ...` | Previewing and repairing projection drift | Maintenance |
| `php artisan workflow:v2:backfill-command-contracts ...` | Previewing and backfilling legacy command-contract snapshots | Maintenance |
| `php artisan workflow:v2:history-export ...` and Waterline history-export routes | Replay, archive handoff, and incident artifacts | Verification |
| Waterline archive actions and control-plane `archive()` | Lifecycle state transitions for closed runs | Lifecycle |
| Worker SDK metrics, traces, and logs | Schedule-to-start latency, poll success, sticky-cache behavior, and custom application telemetry | Runtime telemetry |

The durable-state operator contract lives in Waterline and the workflow package.
Worker telemetry remains the source of truth for latency and process-level
behavior inside your workers.

## Supported topologies

Durable Workflow v2 supports these operator shapes:

| Topology | Supported operator contract | Primary failure domains | Recovery and failover expectation |
| --- | --- | --- | --- |
| Embedded Laravel, single node | Waterline, control-plane routes, health, rebuild, export, and archive all run from one app process against one durable database and one cache store. | The Laravel app process, the durable database, and the cache store on one host. | Treat host or database loss as a full service interruption. Restore durable state first, bring one app node back to readiness, then verify worker registration before resuming traffic. |
| Embedded Laravel, small same-region cluster | Use one shared database, one shared cache backend for wake-signal coordination, identical workflow compatibility/config across nodes, and keep active nodes in the same datacenter or region so queue wake-up and timer wake-up latency stay bounded. | Shared database, shared cache/wake coordination, load balancer routing, and the singleton scheduler or maintenance role. | One app-node loss should reduce capacity, not correctness. Database or Redis failure still blocks the fleet. Scheduler failover and upgrades remain explicit operator procedures rather than automatic HA promises. |
| Standalone server distribution | Use the [Self-Hosting Deployments](./deployment.md) guide for the server-specific deployment matrix, then apply the same health, stats, export, archive, and queue-health distinctions described here. | Shared database, shared Redis, API container set, independently scaled workers, and the single scheduler or maintenance runner. | API containers are replaceable; the database, Redis, and singleton scheduler path define recovery order. Restore persistence first, then verify `/api/ready`, `/api/cluster/info`, and worker registration before shifting traffic back. |

Publish the restore order, backup cadence, expected failover lag, and any
region-pinned behavior in the runbook for the topology you operate. The product
contract tells you which facts to measure; your deployment contract records the
recovery timing, manual steps, and failure domains you accept.

### Failure-domain checklist by supported shape

Use the topology table above as the quick summary, then write your runbook
against these more explicit loss models:

- **Embedded Laravel, single node**: One application process owns the control
  plane, matching, projection, scheduler, and execution roles together. Losing
  that process is a full service interruption for durable commands, workflow
  progress, schedule firing, and operator reads until the same app returns to
  readiness against intact durable storage.
- **Embedded Laravel, small same-region cluster**: Losing one ordinary app node
  should remove only a share of HTTP and worker capacity while the remaining
  nodes keep claiming work from the shared durable store. Treat the shared
  database, the shared cache-backed wake path, and whichever node currently
  owns the singleton scheduler or maintenance duty as the main correctness
  boundaries for the fleet.
- **Standalone server distribution**: Losing one `server_http_node` should stop
  ingress and control-plane commands only on that node; healthy worker nodes
  can still finish leased work and other API nodes can keep serving traffic.
  Losing one `worker_node` should raise backlog, queue age, or compatibility
  warnings only for the affected `(connection, queue, compatibility)` scopes.
  Losing the `scheduler_node` should pause new schedule fires and maintenance
  sweeps without invalidating already running workflows. Database or Redis loss
  is still a fleet-level outage until readiness, topology identity, and worker
  registration recover.

If your deployment depends on different assumptions, treat that topology as a
separate runbook with its own validated contract instead of assuming the
self-serve guidance still applies unchanged.

### Published recovery packet by topology

The supported topologies above are only production-ready when the deployment
runbook publishes the matching recovery packet alongside them:

| Topology | Publish these operator-owned facts |
| --- | --- |
| Embedded Laravel, single node | Backup schedule for the database, cache-preservation expectations, the exact app revision and env/config snapshot used for restore, the maximum accepted restore lag, and the latest successful restore rehearsal evidence. |
| Embedded Laravel, small same-region cluster | Everything from the single-node packet, plus which node or process currently owns scheduler or maintenance duty, the expected impact of losing one ordinary node versus losing the shared database or cache backend, and the failover steps required to restore queue wake coordination. |
| Standalone server distribution | Database and Redis backup cadence, pinned server image or digest, auth-material location, the expected failover behavior for `server_http_node`, `worker_node`, and `scheduler_node`, the latest `/api/ready` plus `/api/cluster/info` restore verification evidence, and the latest worker re-registration proof after restore. |

If that packet is missing, stale, or untested, treat the topology as
development-grade regardless of how many nodes are currently running.

### Verify live topology identity before trusting the baseline

For standalone-server and split-role deployments, confirm the node identity
that the product itself reports before you interpret queue, scheduler, or role
failure signals. `GET /api/cluster/info` is the source of truth for that
identity:

| Field | Use it for |
| --- | --- |
| `topology.current_shape` | Confirms whether the node is currently advertising `embedded`, `standalone_server`, or `split_control_execution`. |
| `topology.current_roles` | Confirms the logical roles actually hosted by this node. |
| `topology.supported_shapes` | Confirms which deployment shapes the current server build publicly supports. |
| `topology.shape_assignments` | Maps each supported shape to its documented process-class role bundles so you can compare the current role bundle against the supported topology. |

Use those fields as the first topology-drift check during rollouts:

- In the self-serve standalone-server shape, API nodes should continue to
  report the `api_ingress`, `control_plane`, `matching`, and
  `history_projection` role bundle; scheduler nodes should report `scheduler`;
  worker nodes should report `execution_plane`.
- In the split-role shape, verify that each node's `current_roles` match one of
  the documented role bundles under `shape_assignments` before you interpret
  backlog or scheduler lag as a worker problem.
- If `current_roles` drift from the deployment plan,
  treat queue and failover baselines as suspect until the node identity is
  corrected.

Embedded installs do not publish `/api/cluster/info`. For the package-local
topology view, run `php artisan workflow:v2:doctor --json` and inspect the
`topology` object. It publishes the same role-topology schema and includes the
embedded app's `current_shape`, `current_process_class`, `current_roles`,
`execution_mode`, and nested `matching_role` summary.

## Blocking and advisory diagnostics

Durable Workflow v2 separates blocking diagnostics from advisory diagnostics.

| Severity | Meaning | Typical operator action |
| --- | --- | --- |
| Blocking | The current configuration or readiness state is not safe to trust for v2 traffic | Stop rollout, fix the prerequisite, rerun verification |
| Advisory | The surface remains readable, but some derived facts need rebuild, backfill, or manual review before you rely on them | Keep serving traffic when appropriate, then repair the named surface |
| Healthy | No current issue was found in that surface | Continue normal operation |

Apply that rule to the shipped surfaces:

- `workflow:v2:doctor --strict` blocks when backend capability issues have
  `error` severity. Examples include an unsupported queue driver in queue mode
  or a cache store without locks. Informational queue diagnostics in poll mode
  remain advisory.
- `GET /waterline/api/v2/health` returns:
  - `status = ok` when the v2 operator surface is ready and the current checks
    are aligned.
  - `status = warning` when the surface remains readable but specific facts
    need rebuild, backfill, or repair before you trust them fully.
  - `status = error` with HTTP `503` when the engine-source bridge is not ready
    or a blocking capability problem makes the v2 surface unavailable.
- `GET /waterline/api/stats` publishes durable operator facts. Treat those JSON
  fields as operator diagnostics for dashboards and scripts, not as a metrics
  scrape endpoint.

## Correctness vs acceleration checks

Every v2 health check carries a `category` of either `correctness` or
`acceleration`, and the snapshot publishes a per-category rollup so operators
can answer two separate questions without re-aggregating the check list.

- **Correctness checks** describe whether durable ready-task discovery,
  projection freshness, command-contract backfill, history retention, worker
  compatibility, and backend capabilities are intact. A correctness check in
  `status = error` means safe task pickup or operator-trusted state is at
  risk; rollouts should stop until it clears.
- **Acceleration checks** describe whether optional wake-signal propagation
  is keeping up. The durable pollers are the correctness path, so an
  acceleration check in `status = warning` means cross-node wake-up latency
  may be higher than steady state but no task is stranded.

Each entry under `checks` carries its `category`, and the snapshot adds a
`categories` rollup so dashboards can summarize both questions at a glance:

```json
{
  "status": "warning",
  "categories": {
    "correctness": {"status": "ok", "check_count": 8},
    "acceleration": {"status": "warning", "check_count": 1}
  }
}
```

Treat a degraded `acceleration` rollup as acceleration-only: investigate
cache or wake backend health, but do not block traffic that depends only on
durable ready-task discovery. A degraded `correctness` rollup is the
blocking signal. The `long_poll_wake_acceleration` check is the canonical
acceleration entry and never escalates above `warning`; every other check
is a correctness entry.

## Queue-health semantics

Queue health is split between durable queue state and worker/runtime telemetry.

### Durable queue facts

Use Waterline dashboard stats and queue views for durable task state:

| Fact | Meaning |
| --- | --- |
| `operator_metrics.backlog.runnable_tasks` | Durable tasks that are ready to be claimed now. |
| `operator_metrics.backlog.delayed_tasks` | Durable tasks that exist but are still waiting for `available_at`. |
| `operator_metrics.backlog.leased_tasks` | Durable tasks currently claimed by a worker. |
| `operator_metrics.backlog.tasks_added_last_minute` | Distinct durable task rows created in the trailing 60 seconds. Treat this as durable queue inflow, not as a transport-attempt counter. |
| `operator_metrics.backlog.tasks_dispatched_last_minute` | Distinct durable task rows whose latest successful `last_dispatched_at` landed in the trailing 60 seconds. Compare it with `tasks_added_last_minute` to tell whether durable inflow is outrunning dispatch. |
| `operator_metrics.starts.pending_runs`, `operator_metrics.starts.pending_commands`, `operator_metrics.starts.ready_tasks`, `operator_metrics.starts.oldest_pending_start_at`, `operator_metrics.starts.max_pending_ms` | Durable workflow-start backlog. Use these facts to distinguish starts that have been accepted but have not yet become active workflow-task work from ordinary worker-side queue lag. |
| `operator_metrics.tasks.oldest_ready_due_at`, `operator_metrics.tasks.max_ready_due_age_ms` | The oldest currently actionable task and its ready-to-dispatch age. This is the machine-readable backlog-latency pair behind "oldest ready task". |
| `operator_metrics.tasks.dispatch_overdue`, `operator_metrics.tasks.oldest_dispatch_overdue_since`, `operator_metrics.tasks.max_dispatch_overdue_age_ms` | Ready durable tasks that still have no successful dispatch wake plus the age of the stalest example. Use these facts to spot degraded notifier acceleration without confusing it for ordinary queue growth. |
| `operator_metrics.backlog.unhealthy_tasks` | Durable tasks with dispatch failure, claim failure, overdue dispatch, or expired lease state. |
| `operator_metrics.backlog.repair_needed_runs` | Open runs that do not currently have a trusted durable resume path. |
| `operator_metrics.tasks.oldest_lease_expired_at`, `operator_metrics.tasks.max_lease_expired_age_ms` | The oldest expired lease and its age. Use this pair as the primary stuck-lease and duplicate-risk age indicator. |
| `operator_metrics.backlog.oldest_compatibility_blocked_started_at`, `operator_metrics.backlog.max_compatibility_blocked_age_ms` | The oldest mixed-build routing block and its age. Use this when work is preserved but no compatible worker is currently eligible to claim it. |
| Active vs stale pollers | Whether registered workers are still heartbeating for a queue. |
| Current leases | Which workflow or activity tasks are leased right now and whether the lease is expired. |

These facts describe durable workflow-task and activity-task traffic only.

When you need queue-local drill-down instead of fleet totals, use the server
task-queue visibility routes for backlog age, poller state, current leases,
and admission budgets. Those routes do not currently expose per-queue
`stats.tasks_added_last_minute` or `stats.tasks_dispatched_last_minute`; use
the fleet-level `operator_metrics.backlog.*` pair above to compare durable
inflow with dispatch, then use queue-local routes to see which queue is
building backlog or has no available worker capacity.

Waterline's `GET /waterline/api/v2/health` surface publishes the same queue
drill-down under `queue_visibility.*` for the configured namespace. Treat these
field families as the typed queue-health contract:

| Field family | Meaning |
| --- | --- |
| `queue_visibility.available`, `queue_visibility.reason` | Whether Waterline can currently produce queue-local visibility for the configured namespace, and why not when it cannot. |
| `queue_visibility.task_queues[].stats.approximate_backlog_count`, `queue_visibility.task_queues[].stats.approximate_backlog_age` | Queue-local backlog count and oldest durable backlog age. |
| `queue_visibility.task_queues[].stats.tasks_added_last_minute`, `queue_visibility.task_queues[].stats.tasks_dispatched_last_minute` | Per-queue durable inflow versus dispatch over the trailing 60 seconds. Use these when one hot queue is hidden inside healthy fleet totals. |
| `queue_visibility.task_queues[].stats.pollers.active_count`, `queue_visibility.task_queues[].stats.pollers.stale_count`, `queue_visibility.task_queues[].stats.pollers.stale_after_seconds` | Healthy versus stale pollers on that queue and the stale-heartbeat threshold the snapshot used. |
| `queue_visibility.task_queues[].stats.workflow_tasks.*`, `queue_visibility.task_queues[].stats.activity_tasks.*` | Queue-local ready, leased, and expired-lease counts split by workflow-task versus activity-task traffic. |
| `queue_visibility.task_queues[].repair.candidates`, `dispatch_failed`, `expired_leases`, `dispatch_overdue` | Queue-local repair pressure: durable tasks that already need repair, are dispatch-failed, hold expired leases, or are overdue for redispatch. |
| `queue_visibility.task_queues[].repair.oldest_dispatch_failed_at`, `max_dispatch_failed_age_ms`, `oldest_lease_expired_at`, `max_lease_expired_age_ms`, `oldest_dispatch_overdue_since`, `max_dispatch_overdue_age_ms` | Queue-local age signals for the stalest dispatch failure, expired lease, and dispatch-overdue durable task. |

`coordination_alerts[]` on the same `GET /waterline/api/v2/health` payload is
the operator roll-up for those queue-local facts plus the health-check list.
Use it as the page-ready summary for warnings and errors, then drill into the
matching `queue_visibility` or `checks` entries for evidence.

Treat the queue-local admission status as the first-class slot and poller
signal for that queue. `saturated` means live workers are present but every
registered slot is already leased. `throttled` means a server-side lease or
dispatch cap is intentionally holding new work. `no_slots` means workers are
registered but exposed zero capacity for that task kind. `no_active_workers`
means the queue has no healthy poller at all, and `unavailable` means a
configured lock-backed admission guard cannot currently prove safety.

Use `operator_metrics.starts.*` when new workflow starts appear stuck even
though steady-state queue lag looks normal. Those facts separate control-plane
start admission and first-task creation debt from downstream worker pickup.

### Poller pressure and admission budgets

Use task-queue detail routes or `dw task-queue:describe` when queue flow is
degrading and you need to separate "not enough worker capacity" from
"intentional server throttling" or "no live poller at all":

| Queue status | Meaning | Treat it as |
| --- | --- | --- |
| `accepting` | Workers still have available slots and no server cap is full. | Healthy baseline. |
| `saturated` | All registered worker slots are currently leased. | Worker-capacity pressure. |
| `throttled` | A server-side active-lease or dispatch-rate cap is intentionally holding the queue back. | Advisory unless the cap is unexpected or the backlog keeps growing beyond the published baseline. |
| `no_slots` | Active workers are registered, but none advertise slots for that task kind. | Blocking for that queue. |
| `no_active_workers` | No healthy poller is currently serving the queue. | Blocking for that queue. |
| `unavailable` | The queue cannot acquire the lock needed for its configured admission path. | Blocking until the admission dependency recovers. |

Use these statuses with the queue-flow facts together:

- `tasks_added_last_minute > tasks_dispatched_last_minute` plus `saturated`
  means durable inflow is outrunning worker capacity.
- The same rate imbalance plus `throttled` means the queue is being held back
  by an explicit server cap and should be judged against that cap's intended
  contract, not against unrestricted throughput.
- A rising oldest-ready age plus `no_active_workers` or stale pollers means the
  queue has lost healthy claimers and should be treated as a routing outage for
  that scope.

### Matching-role deployment shape

Use `operator_metrics.matching_role.*` when you need to confirm which
matching/dispatch contract the current node is actually serving:

| Fact | Meaning |
| --- | --- |
| `operator_metrics.matching_role.queue_wake_enabled` | Whether this node still runs the in-worker broad-poll wake path on queue-worker loop events. |
| `operator_metrics.matching_role.shape` | `in_worker` when the node still owns that wake path, `dedicated` when the wake/repair sweep is expected to run under a separate `workflow:v2:repair-pass --loop` process. |
| `operator_metrics.matching_role.task_dispatch_mode` | The dispatch mode this node is using for ready tasks: `queue` or `poll`. |
| `operator_metrics.matching_role.partition_primitives` | The frozen routing axes, in order: `connection`, `queue`, `compatibility`, `namespace`. |
| `operator_metrics.matching_role.backpressure_model` | The durable admission boundary the engine enforces. Current v2 reports `lease_ownership`. |

These fields are node-local, not fleet-wide. In a mixed-shape rollout, read
the snapshot from each node or pod you are cutting over so you can confirm the
matching role moved where you intended before you interpret backlog or poller
changes as worker health.

### Worker and SDK telemetry

Use worker metrics, traces, and logs for:

- Workflow and activity `schedule_to_start` latency
- Poll success rate and sync/eager-dispatch behavior
- Sticky-cache size and eviction behavior
- Worker CPU, memory, thread, and event-loop pressure
- Custom application metrics emitted from activities or worker code

Synchronous queries, live-debug tooling, and other non-durable control-plane
calls should be labeled separately in your dashboards. They do not count as
durable task backlog and they do not change Waterline repair counters.

## Worker compatibility and rollout health

`operator_metrics.workers` publishes the compatibility facts that determine
whether the active worker fleet can safely handle the required workflow
contract:

| Fact | Meaning |
| --- | --- |
| `operator_metrics.workers.required_compatibility` | Compatibility markers a worker must advertise to be eligible for work in the namespace. |
| `operator_metrics.workers.active_workers` | Count of distinct live workers seen through compatibility heartbeat. |
| `operator_metrics.workers.active_worker_scopes` | Count of `(connection, queue)` scopes covered by those workers. |
| `operator_metrics.workers.active_workers_supporting_required` | Workers whose advertised compatibility covers the required markers. |
| `operator_metrics.workers.fleet` | Per-scope list of every active worker with `worker_id`, `connection`, `queue`, advertised `supported` markers, a `supports_required` flag, the heartbeat `source` (`database` or `cache`), and `recorded_at`. |

Use the summary counts to detect mixed-fleet states where some workers
cannot safely claim the required work, and drill into `fleet` to identify
exactly which `(connection, queue)` scope is missing coverage. The Waterline
operator dashboard renders the same fleet list under its worker
compatibility panel so operators do not need to query the metric surface by
hand.

When `active_workers_supporting_required` reaches zero for a namespace,
Waterline surfaces a `no_compatible_worker_for_task` run diagnostic on
affected runs so the gap is visible on the run-detail view as well as the
metric surface. The companion `worker_compatibility` health check fires as
`warning` under `correctness` in the same condition, which flips the
`correctness` category rollup to `warning` so the fleet gap is visible at
a glance and not buried inside the check list.

See [Rolling Out Worker Builds With Build IDs](./polyglot/worker-build-id-rollout.md)
for the drain/resume flow that coordinates with these facts during a
build-id rollout, and
[Worker Compatibility and Routing](./polyglot/worker-compatibility-routing.md)
for the pinning contract behind those diagnostics.

## Alert semantics

Alert thresholds are deployment-specific. Publish your own numeric baselines
for queue age, repair lag, worker coverage, and restore timing, then alert when
the contract below stays breached longer than one normal repair or watchdog
window for the topology you operate.

| Alert family | Source | Treat as | Escalate when | Operator response |
| --- | --- | --- | --- | --- |
| Blocking readiness | `workflow:v2:doctor --strict`, `GET /waterline/api/v2/health` | Blocking | `doctor --strict` returns an error or the health endpoint returns `status = error` / HTTP `503` | Stop rollout or traffic shift, fix the blocking prerequisite, then rerun readiness and compatibility checks. |
| Compatible-worker coverage | `operator_metrics.workers.*`, `worker_compatibility` health check, run diagnostic `no_compatible_worker_for_task` | Blocking | `active_workers_supporting_required = 0` for a namespace or required `(connection, queue)` scope | Drain incompatible workers, register compatible workers, and confirm the `correctness` rollup clears before trusting new claims. |
| Durable queue lag | Waterline queue views, `operator_metrics.backlog.*`, worker `schedule_to_start` telemetry | Blocking when sustained; advisory when brief | The oldest ready-task age or schedule-to-start latency stays above the published topology baseline while compatible workers are available | Add worker capacity, inspect task-queue admission limits, and verify the scheduler or matching path is still making forward progress. |
| Poller pressure and admission saturation | Task-queue detail routes, `dw task-queue:describe`, queue `status`, stale pollers, and queue-local add/dispatch rates | Blocking for `no_active_workers`, `no_slots`, or `unavailable`; advisory for intentional `throttled` states | One queue stays `saturated` while its oldest-ready age and add-vs-dispatch gap keep growing, or any queue flips to `no_active_workers`, `no_slots`, or `unavailable` outside a planned maintenance window | Add worker slots, restore the missing poller cohort, or confirm the server-side cap and lock dependency are behaving as designed before you scale blindly. |
| Workflow-start backlog | `operator_metrics.starts.*`, control-plane start telemetry, worker `schedule_to_start` telemetry for first workflow tasks | Blocking when sustained; advisory when brief | `pending_commands`, `ready_tasks`, or `max_pending_ms` stay above the published topology baseline while compatible workers and queue capacity are available | Inspect the start boundary end to end: confirm start commands are turning into durable tasks, verify matching or dispatch is creating the first task promptly, and separate start-path debt from general worker lag before scaling. |
| Projection drift and repair debt | `run_summary_projection` / `selected_run_projections` health checks, `operator_metrics.repair.*` | Advisory | Drift warnings persist past one planned rebuild window or the max candidate age keeps climbing | Run the rebuild or repair previews, execute the repair, then verify the warning clears and stale ages return to baseline. |
| Retry or failure storm | `operator_metrics.backlog.unhealthy_tasks`, durable run diagnostics, worker error telemetry | Advisory, escalating to blocking if it prevents durable progress | Dispatch-failed, claim-failed, expired-lease, or retry-exhaustion facts climb above the topology baseline and stay elevated | Inspect the failing task family, compare worker telemetry with durable error facts, and decide whether to drain traffic or isolate the affected queue. |
| Wake acceleration degradation | `long_poll_wake_acceleration` health check and the `acceleration` category rollup | Advisory | The acceleration warning persists after cache or notifier maintenance windows | Investigate cache or wake propagation health. Do not treat this as a correctness outage unless the `correctness` rollup also degrades. |

The goal is to page on durable contract risk, not on every transient signal.
Queue and worker alerts should only become blocking when they threaten the
operator contract for the topology you actually run.

## Rebuild, repair, and restore expectations

Use these checks in order when the operator surface reports drift:

1. Check `GET /waterline/api/v2/health`.
   - `run_summary_projection` and `selected_run_projections` warnings mean
     Waterline can still answer, but some list or detail facts need rebuild.
   - `command_contract_snapshots` warnings mean some legacy runs still need
     WorkflowStarted contract backfill before operators can trust declared
     signal, update, or query forms.
   - `durable_resume_paths` warnings mean open runs need repair before you rely
     on their projected next resume source.
2. Preview projection work with:

   ```bash
   php artisan workflow:v2:rebuild-projections --needs-rebuild --dry-run
   ```

3. Rebuild the affected projections:

   ```bash
   php artisan workflow:v2:rebuild-projections --needs-rebuild
   ```

4. Preview command-contract backfill work with:

   ```bash
   php artisan workflow:v2:backfill-command-contracts --dry-run
   ```

5. Backfill command contracts when the current workflow class is still
   available:

   ```bash
   php artisan workflow:v2:backfill-command-contracts
   ```

6. Use `--prune-stale` only after your retention workflow has intentionally
   removed durable rows and you want to delete projection rows whose durable run
   or history row no longer exists.

`operator_metrics.repair.*` publishes the repair-loop sweep footprint. Use the
candidate counts, selected counts, maximum candidate age, and scan-limit
pressure to decide whether repair work is comfortably within your baseline or
needs capacity investigation.

## Export and archive verification

History export and archive serve different purposes:

- **History export** creates a replay/debug/archive artifact.
- **Archive** marks a closed run as archived so it leaves active fleet views.
- **Prune** removes projection or durable rows after retention has definitely
  expired.

Use this verification sequence:

1. Export the selected run:

   ```bash
   php artisan workflow:v2:history-export <workflow-instance-id> --run-id=<workflow-run-id> --output=storage/app/workflow-history/run.json --pretty
   ```

2. Verify the bundle includes the expected run id, schema version, and any
   configured redaction metadata.
3. Archive the closed run only after the export artifact is stored where your
   runbook expects it.
4. Keep archived-but-not-pruned runs available for incident review.
5. Prune durable rows through your retention job, then rebuild/prune projections
   with `workflow:v2:rebuild-projections --prune-stale`.

For Waterline users, the matching history-export and archive routes are listed
in the [Waterline Operator API Reference](./waterline-operator-api.md).

## Backup, restore, and disaster-recovery contract

Backup, restore, and disaster recovery are part of the operating envelope, not
an optional private runbook. For every supported topology, publish and rehearse
these facts:

1. The durable backup set: database backup, server or app image reference,
   runtime env file or config set, auth material location, and the exact
   topology or restore notes needed to reattach workers.
2. The recovery targets: maximum accepted restore lag, expected failover lag,
   and who is allowed to declare traffic safe again.
3. The restore order: restore durable persistence first, then cache, then
   bootstrap or migrations, then the singleton scheduler or maintenance role,
   then API readiness, then worker registration.
4. The verification pass: `/api/ready` or `/waterline/api/v2/health`,
   `/api/cluster/info` where applicable, one representative worker
   registration, and one representative history export from restored state.
5. The repair pass after restore: rebuild projections, backfill command
   contracts if needed, and confirm queue, compatibility, and repair metrics
   return to baseline before you call the environment healthy.

Do not imply automatic multi-region or hands-free HA behavior unless your
published topology contract actually proves it. For the documented self-serve
topologies, recovery is deliberate operator work with explicit checkpoints.

Treat restore rehearsal cadence as part of the public operating contract too.
At minimum, rehearse the documented restore sequence:

- before the first production rollout for a topology
- after any change to the backup mechanism, schema/bootstrap path, auth model,
  or deployment topology
- on a regular recurring cadence that is published in the same runbook as the
  backup schedule

If you cannot produce the latest successful rehearsal date, elapsed restore
time, and verification evidence, then backup and DR remain an unproven claim
for that topology.

## Benchmark envelope

Durable Workflow v2 publishes the dimensions you should benchmark for your own
environment. Record these baselines in staging or canary before production
traffic depends on them:

| Dimension | What to baseline | Source |
| --- | --- | --- |
| Projection health | Steady-state `needs_rebuild = 0`, rebuild duration after intentional drift, and stale/orphan cleanup time | `/waterline/api/v2/health`, `/waterline/api/stats`, `workflow:v2:rebuild-projections` |
| Queue pressure | Backlog age, oldest ready task age, runnable vs delayed task counts, task add vs dispatch rate, dispatch-overdue age, stale poller count, and queue admission status (`accepting`, `saturated`, `throttled`, `no_slots`, `no_active_workers`) | Waterline dashboard stats and queue views plus `operator_metrics.backlog.*` / `operator_metrics.tasks.*` |
| Workflow-start latency | Accepted start commands waiting for first-task creation, oldest pending-start age, and first-task pickup after admission | `operator_metrics.starts.*` plus worker `schedule_to_start` telemetry |
| Schedule-to-start latency | Workflow and activity queue wait from enqueue to start | Worker SDK metrics |
| Timer fan-out wake-up behavior | Wake-signal propagation time and the lag between scheduled fire time and ready-task visibility during burst timers | Worker telemetry plus same-region wake coordination checks |
| Repair-loop sweep cost | Candidate counts, selected counts, max candidate age, max missing-run age, and scan-pressure behavior | `operator_metrics.repair.*` |
| History pressure | Event count, history size, and continue-as-new recommendation thresholds | `operator_metrics.history.*` |

These are benchmark dimensions rather than universal latency promises. Publish
your own acceptable ranges for the topology you operate.

## Long-soak evidence

Benchmark snapshots are not enough on their own. Before you call a topology
trusted for sustained traffic, keep a long-soak evidence packet that shows the
system stayed inside its declared envelope over time.

Include at least:

- workload shape: topology, server image or app revision, worker build ids,
  queue layout, cache backend, database backend, and the representative mix of
  workflow starts, timer load, activities, queries, and exports
- soak window: start and end time, plus enough duration to cover at least one
  normal repair window, one retention or archive pass if applicable, and one
  representative business-cycle traffic swing for that environment
- durable queue stability: backlog age, ready-task age, start backlog age, task
  add versus dispatch rate, and stale-poller counts staying within the
  published baseline for the topology
- correctness stability: no sustained `status = error` from
  `GET /waterline/api/v2/health`, no unexplained growth in
  `operator_metrics.repair.*`, and no persistent compatibility gaps in
  `operator_metrics.workers.*`
- process and cache stability: worker memory, CPU, event-loop or thread
  pressure, and cache/cardinality growth staying bounded rather than climbing
  monotonically under steady load
- recovery evidence: the latest successful backup timestamp, latest restore
  rehearsal timestamp, elapsed restore time, and the verification commands that
  proved the restored environment was ready

Store the packet where the same operators can retrieve the deployment runbook.
If a topology claims published benchmark numbers, alert semantics, or recovery
timing without a matching soak packet, treat those numbers as provisional
rather than trusted operating-envelope evidence.

## End-to-end operator checklist

Use this checklist after upgrades and before trusting a new environment:

1. Run `php artisan workflow:v2:doctor --strict`.
2. Check `GET /waterline/api/v2/health` and confirm whether the state is
   `ok`, `warning`, or `error`.
3. Read `GET /waterline/api/stats` for backlog, repair, history, command
   contract, worker compatibility, and projection drift facts.
4. Run projection rebuild or command-contract backfill previews when health
   reports drift.
5. Export one representative run and verify the archive/replay artifact path.
6. Confirm archived runs leave active fleet views while durable rows remain
   available until retention cleanup.
7. Rehearse the restore or failover sequence recorded in your deployment
   runbook and verify the measured lag matches the published expectation for
   your topology.

## Related Guides

- [Monitoring](./monitoring.md)
- [Waterline Operator API Reference](./waterline-operator-api.md)
- [Pruning Workflows](./configuration/pruning-workflows.md)
- [Self-Hosting Deployments](./deployment.md)
