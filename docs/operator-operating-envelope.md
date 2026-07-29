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

The deployment and recovery procedures here apply to embedded Laravel and
self-hosted Server. Durable Workflow Cloud is a separate managed service: Cloud
owns runtime persistence, placement, backup, restore, and failover, while
customers operate SDK clients and workers through the namespace runtime URL.
Do not use this guide to attach a Server to Cloud; use the
[Cloud Managed Runtime](/docs/2.0/polyglot/cloud-control-plane) guide for that
customer boundary.

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

The durable-state operator contract lives in the runtime that owns each run.
Waterline projects that contract either from the embedded workflow package or
from a standalone server through the PHP SDK. Worker telemetry remains the
source of truth for latency and process-level behavior inside your workers.

### Surface mapping by deployment shape

The Waterline routes in the table above are available from both Waterline
deployment shapes. Embedded mode reads the Laravel host's durable state in
process. Service mode runs the published Waterline image and reads one
standalone-server namespace through the PHP SDK. The authenticated server API
and `dw` CLI remain available directly with or without Waterline:

| Operator question | Waterline (embedded or service mode) | Standalone-server native surface |
| --- | --- | --- |
| Engine-source readiness and blocking vs advisory health | `GET /waterline/api/v2/health` | `GET /api/system/health` (admin auth, control-plane v2); `dw server:health` for liveness and `dw server:info` for the topology, protocol, and rollout-safety summary |
| Durable fleet totals, backlog, repair, worker compatibility, projection drift | `GET /waterline/api/stats` | `GET /api/system/operator-metrics` and `dw system:operator-metrics` |
| Selected-run detail and history export | `GET /waterline/api/instances/...` and `/waterline/api/.../history-export` | `GET /api/workflows/{workflowId}`, `/runs/{runId}`, and `/runs/{runId}/history/export` (see the [Server API Reference](./polyglot/server-api-reference.md)) |
| Operator commands (cancel, terminate, repair, archive, signal/update/query) | `POST /waterline/api/instances/.../{cancel\|terminate\|repair\|archive}` and signal/update/query routes | `POST /api/workflows/{workflowId}/{cancel\|terminate\|repair\|archive}` and `POST /api/system/repair/pass` |
| Topology and node-identity discovery | Embedded: `php artisan workflow:v2:doctor --json` (`topology` object); service: use the connected server's native surface | `GET /api/cluster/info`, `GET /api/health`, `GET /api/ready` (or `dw server:info`) |

The field families and contract names below stay the same regardless of
which surface you read them through. A Waterline deployment is scoped to its
configured runtime and namespace; it does not combine embedded and
server-managed runs.

## Dated 2.0 evidence snapshot

This snapshot separates behavior that has been measured on released artifacts
from procedures that the product supports but each operator must rehearse in
their own environment. A passing row applies only to the named artifact tuple
and topology; it is not a blanket claim for later releases, different
substrates, or larger deployments.

The proof rows use these exact release tuples:

| Tuple | CLI | PHP SDK | Python SDK | Rust SDK | Server | Waterline | Workflow |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | `2.0.0-rc.1` | `2.0.0-rc.1` | `2.0.0-rc.1` | `2.0.0-rc.1` | `2.0.0-rc.2` | `2.0.0-rc.1` | `2.0.0-rc.1` |
| B | `2.0.0-rc.5` | `2.0.0-rc.5` | `2.0.0-rc.6` | `2.0.0-rc.6` | `2.0.0-rc.8` | `2.0.0-rc.8` | `2.0.0-rc.6` |

The current proof inventory is:

| Proof and date (UTC) | Tuple | What the proof directly measured | Boundary |
| --- | --- | --- | --- |
| Single-region failover rehearsal, 2026-07-28 | A | Cross-node terminal completion, loss of one API node, MySQL interruption and recovery, Redis interruption and database-poll fallback, worker lease loss and reclaim, and singleton scheduler restart. The result recorded passing loss and duplicate assertions for every phase. | Two API nodes behind one shared endpoint, one MySQL instance, one Redis acceleration layer, one queue worker, and one scheduler/maintenance runner in one region. The database and Redis events were container interruptions, not managed-provider promotion tests. |
| Timer restart matrix, 2026-07-28 | A | Sleeping workflows completed after worker restart and server restart, with one timer schedule and fire per run and no duplicate replay command. | Durable timer and replay recovery on the published-server test topology; not arbitrary process state or external side-effect recovery. |
| Activity runtime matrix, 2026-07-29 | B | Worker-restart result recovery, retry and timeout behavior, heartbeat and cancellation observation, durable terminal result recording, and idempotent completion handling across the required published-artifact cells. | Activity-level engine behavior. Applications still own idempotency for external side effects. |
| Workflow lifecycle matrix, 2026-07-29 | B | Terminal completion and failure states, duplicate-start and workflow-id reuse policy, timeout and retry behavior, history continuity, and duplicate side-effect prevention across the required PHP, Python, Rust, CLI, API, history, and Waterline cells. | Lifecycle correctness for the exercised scenarios; not an availability or throughput benchmark. |

The first tuple is still the latest direct proof for the complete failover
matrix. Later activity and lifecycle results do not silently upgrade that
failover result to their newer tuple. Use the
[Compatibility contract](./compatibility.md) for the currently recommended
install tuple, and rerun the
[exact-artifact rehearsal](./deployment.md#run-the-exact-artifact-rehearsal)
before making a failover claim for a different release.

### Measured guarantee vs supported procedure

| Failure or outcome | Directly proven by the dated evidence | Supported operator procedure | Not established by this evidence |
| --- | --- | --- | --- |
| One API-node loss | The failover rehearsal killed one of two API nodes, reached the surviving node through the shared endpoint, preserved acknowledged state, and completed the run. | Remove failed nodes with `/api/ready`, retry interrupted client requests, then verify topology and worker registration before returning traffic. | Whole-fleet loss, availability-zone isolation, or arbitrary network partition behavior. |
| Database interruption | Both API nodes became not ready, durable state survived the interruption, a replacement worker reclaimed the task after lease expiry, the run completed, and a duplicate completion was refused. | Restore the writable database first, wait for readiness, fence the stale task owner, verify one representative run, then resume traffic. Managed-service promotion needs provider-native fencing, RPO, and elapsed-time evidence in the recovery packet. | Managed database promotion, acknowledged-write behavior during split brain, or an RPO/RTO beyond the measured local interruption. |
| Redis interruption | Readiness reported acceleration degradation while database-backed polling preserved durable state; replaying the same poll request did not create a duplicate lease; readiness recovered after Redis returned. | Keep Redis as an acceleration layer, tolerate warning readiness, restore it after durable persistence, and verify poll-discovery latency returns to the deployment baseline. | Redis dual-primary behavior, cache behavior across a network partition, or provider promotion timing. |
| Worker restart or loss | The failover proof reclaimed and completed a leased workflow after worker loss; the newer activity matrix proved durable result recovery after worker restart and idempotent completion handling. | Let leases expire or drain workers, start a compatible replacement, verify registration and queue pickup, and keep external effects idempotent. | Recovery of process-local state that was not stored durably or exactly-once external side effects. |
| Server or scheduler restart | The timer matrix completed sleeping workflows after a server restart without duplicate timer commands. The failover proof also preserved progress through one API-node loss and one singleton scheduler restart. | Restore persistence, bring server roles back to readiness, confirm exactly one scheduler/maintenance runner, then verify worker registration and one representative completion. | Simultaneous loss of every server and persistence node, multi-region failover, or duplicate schedulers as a steady-state topology. |
| Duplicate delivery | Database-recovery and worker-loss phases each recorded one logical completion and rejected the duplicate completion with HTTP `409`; Redis degradation replayed the original lease without issuing a duplicate. The activity matrix separately passed its idempotent-completion cell. | Use stable request and task identities, honor stale-attempt refusals, and make activity side effects idempotent. | A universal exactly-once delivery or side-effect guarantee outside the durable engine boundary. |
| Terminal completion | Cross-node, API-loss, database-recovery, and worker-loss workflows all reached terminal `completed` state; the newer lifecycle matrix passed completion, failure, cancellation, termination, timeout, and retry cells. | Verify the selected run and its history/export evidence before archiving or declaring recovery complete. | Completion of workload shapes, integrations, or failure combinations that were not exercised. |

### Largest current load cell

The largest configured server load cell starts **1,000 workflows** with start
concurrency **8** while also running **8** concurrent polling workers for 120
seconds. It requires at least a 98% workflow-start completion ratio and checks
endpoint availability, cache-key drainage, sample coverage, and bounded
resource ceilings.

Treat this as a short **correctness smoke**, not a sustained production-scale
benchmark. It does not establish a universal throughput, latency, memory, or
maximum-concurrency promise. Establish those values with the benchmark and
long-soak packet for the exact topology, worker mix, database, cache, and
release you intend to operate.

### Explicitly out of scope

The 2.0 evidence claim does not cover:

- network partitions
- deliberate clock drift
- multi-region operation
- split-brain behavior

Those experiments are not release prerequisites for 2.0. They are prerequisites
only for making the corresponding partition, clock-skew, multi-region, or
split-brain claim. The supported 2.0 release envelope remains the published
topology plus its recovery packet and the behavior measured for the exact
artifact tuple; unsupported chaos scenarios should not be presented as
evidence that the documented single-region procedures are unusable.

## Supported topologies

Durable Workflow v2 supports these operator shapes. The shape names in the
first column match the `topology.current_shape` values published by
`/api/cluster/info` and the [Server Role Topology](./polyglot/server-role-topology.md)
manifest, so the operator contract here lines up with the discovery contract
your automation already reads.

| Operator shape (`topology.current_shape`) | Supported operator contract | Primary failure domains | Recovery and failover expectation |
| --- | --- | --- | --- |
| `embedded`, single node | Waterline, control-plane routes, health, rebuild, export, and archive all run from one app process against one durable database and one cache store. | The Laravel app process, the durable database, and the cache store on one host. | Treat host or database loss as a full service interruption. Restore durable state first, bring one app node back to readiness, then verify worker registration before resuming traffic. |
| `embedded`, small same-region cluster | Use one shared database, one shared cache backend for wake-signal coordination, identical workflow compatibility/config across nodes, and keep active nodes in the same datacenter or region so queue wake-up and timer wake-up latency stay bounded. | Shared database, shared cache/wake coordination, load balancer routing, and the singleton scheduler or maintenance role. | One app-node loss should reduce capacity, not correctness. Database loss blocks durable traffic; Redis-only loss degrades wake acceleration and reports a readiness warning while database polling preserves durable correctness. Scheduler failover and upgrades remain explicit operator procedures rather than automatic HA promises. |
| `standalone_server` distribution | Use the [Self-Hosting Deployments](./deployment.md) guide for the server-specific deployment matrix, then apply the same health, stats, export, archive, and queue-health distinctions through the native `/api/system/...` and `/api/workflows/...` routes or a separately deployed Waterline service (see the surface mapping above). | Shared database, shared Redis, API container set, independently scaled workers, the optional Waterline observer, and the single scheduler or maintenance runner. | API containers are replaceable server process nodes, and the Waterline container is a replaceable observer of server-owned state. The database, Redis, and singleton scheduler path define recovery order. Restore persistence first, then verify `/api/ready`, `/api/cluster/info`, and worker registration before shifting traffic back. |
| `split_control_execution` | Same product contract as `standalone_server`, with each role isolated into its own process class (`ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node`). The same operator-metrics, health, and command surfaces apply per-node; route admin reads to the node that hosts the role you are interrogating. | Each role runs as its own process class, so the failure-domain checklist in [Server Role Topology](./polyglot/server-role-topology.md) governs which subsystem fails first. The shared database, Redis, and singleton scheduler election remain fleet-wide failure domains. | Recovery follows the same order as `standalone_server`, but verify `topology.current_shape`, `topology.current_process_class`, and `topology.current_roles` per node before declaring the deployment ready. Hosted routes return `503 topology_role_unavailable` when sent to the wrong node class. |

`split_control_execution` is not a separate engine or product. It is the same
operator contract as `standalone_server` with the role-specific process classes
named in `topology.shape_assignments`. Treat the rest of this guide as
shape-agnostic for those two server shapes unless a section calls out a
specific role. [Server Role Topology](./polyglot/server-role-topology.md)
holds the role vocabulary, authority boundaries, and migration path.

Waterline service mode is an observer deployment, not another server topology.
Adding or removing it does not change `topology.current_shape`, server-native
API or CLI availability, or the runtime that owns a run.

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
- **Standalone server distribution (`standalone_server`)**: Losing one
  `server_http_node` should stop ingress and control-plane commands only on
  that node; healthy worker nodes can still finish leased work and other API
  nodes can keep serving traffic. Losing one `worker_node` should raise
  backlog, queue age, or compatibility warnings only for the affected
  `(connection, queue, compatibility)` scopes. Losing the `scheduler_node`
  should pause new schedule fires and maintenance sweeps without invalidating
  already running workflows. Database loss is a fleet-level outage. Redis-only
  loss keeps durable database polling available, reports
  `long_poll_wake_acceleration` as degraded, and increases discovery latency
  until Redis reconnects.
- **Split-role server distribution (`split_control_execution`)**: Each role
  runs as its own process class — `ingress_node`, `control_plane_node`,
  `scheduler_node`, `matching_node`, and `execution_node`. Losing any one
  process class only degrades the role it owns: ingress loss stops external
  HTTP traffic at the edge, control-plane loss makes operator commands fail
  fast while leased work continues, matching loss falls back to direct
  ready-task discovery, scheduler loss pauses schedule fires and records
  missed runs, and execution loss accumulates ready tasks without losing
  durable state. Database loss remains a fleet-wide outage. Redis-only loss is
  an acceleration-layer degradation with the same database-poll fallback and
  warning readiness behavior as the `standalone_server` shape.

If your deployment depends on different assumptions, treat that topology as a
separate runbook with its own validated contract instead of assuming the
self-serve guidance still applies unchanged.

### Published recovery packet by topology

The supported topologies above are only production-ready when the deployment
runbook publishes the matching recovery packet alongside them:

| Topology | Publish these operator-owned facts |
| --- | --- |
| `embedded`, single node | Backup schedule for the database, cache-preservation expectations, the exact app revision and env/config snapshot used for restore, the maximum accepted restore lag, and the latest successful restore rehearsal evidence. |
| `embedded`, small same-region cluster | Everything from the single-node packet, plus which node or process currently owns scheduler or maintenance duty, the expected impact of losing one ordinary node versus losing the shared database or cache backend, and the failover steps required to restore queue wake coordination. |
| `standalone_server` distribution | Database and Redis backup cadence, pinned server image or digest, auth-material location, the expected failover behavior for `server_http_node`, `worker_node`, and `scheduler_node`, the latest `/api/ready` plus `/api/cluster/info` restore verification evidence, and the latest worker re-registration proof after restore. |
| `split_control_execution` distribution | Everything from the `standalone_server` packet, plus the per-process-class scaling and failure expectations for `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, and `execution_node`, and the routing rules clients use when a hosted route returns `503 topology_role_unavailable` from the wrong node class. |

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
| `operator_metrics.backlog.oldest_compatibility_blocked_started_at`, `operator_metrics.backlog.max_compatibility_blocked_age_ms` | The oldest compatibility routing block and its age. Use this when work is preserved but no compatible worker is currently eligible to claim it. |
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

Use the summary counts to detect rollout states where some workers cannot
safely claim the required work, and drill into `fleet` to identify
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
published topology contract actually proves it. For the documented self-hosted
topologies — including the active/passive multi-region contract in the
[self-hosting guide](/docs/2.0/deployment#activepassive-multi-region) —
recovery and regional failover are deliberate operator work with explicit
checkpoints, not automatic product behavior. Hosted Cloud multi-region
replication v1 is scoped separately in the
[Cloud managed-runtime contract](/docs/2.0/polyglot/cloud-control-plane). Cloud
operates replication, failover, and failback behind one stable namespace
runtime URL; customers do not switch deployment identifiers or endpoints.
Active/active writes remain outside that managed-service contract.

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
