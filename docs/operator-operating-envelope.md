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
| `operator_metrics.backlog.unhealthy_tasks` | Durable tasks with dispatch failure, claim failure, overdue dispatch, or expired lease state. |
| `operator_metrics.backlog.repair_needed_runs` | Open runs that do not currently have a trusted durable resume path. |
| Queue backlog age / oldest ready task | The durable ready-to-dispatch lag for the oldest ready work. |
| Active vs stale pollers | Whether registered workers are still heartbeating for a queue. |
| Current leases | Which workflow or activity tasks are leased right now and whether the lease is expired. |

These facts describe durable workflow-task and activity-task traffic only.

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
build-id rollout.

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

## Benchmark envelope

Durable Workflow v2 publishes the dimensions you should benchmark for your own
environment. Record these baselines in staging or canary before production
traffic depends on them:

| Dimension | What to baseline | Source |
| --- | --- | --- |
| Projection health | Steady-state `needs_rebuild = 0`, rebuild duration after intentional drift, and stale/orphan cleanup time | `/waterline/api/v2/health`, `/waterline/api/stats`, `workflow:v2:rebuild-projections` |
| Queue pressure | Backlog age, oldest ready task age, runnable vs delayed task counts, stale poller count | Waterline dashboard stats and queue views |
| Schedule-to-start latency | Workflow and activity queue wait from enqueue to start | Worker SDK metrics |
| Timer fan-out wake-up behavior | Wake-signal propagation time and the lag between scheduled fire time and ready-task visibility during burst timers | Worker telemetry plus same-region wake coordination checks |
| Repair-loop sweep cost | Candidate counts, selected counts, max candidate age, max missing-run age, and scan-pressure behavior | `operator_metrics.repair.*` |
| History pressure | Event count, history size, and continue-as-new recommendation thresholds | `operator_metrics.history.*` |

These are benchmark dimensions rather than universal latency promises. Publish
your own acceptable ranges for the topology you operate.

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
