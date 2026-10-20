---
sidebar_position: 6
title: Task Matching and Dispatch
description: Understand how Durable Workflow turns ready durable tasks into worker assignments, from long-poll wakeups to dedicated matching-role deployments.
tags:
  - worker-protocol
  - task-queues
  - operations
  - dispatch
keywords:
  - task matching
  - task dispatch
  - matching role
  - ready task discovery
  - queue wake
---

# Task Matching and Dispatch

Use this guide when you need to reason about how Durable Workflow finds ready
work, assigns it to compatible workers, and scales that assignment path beyond
"every node polls everything." This is the contract behind workflow-task polls,
activity-task polls, queue wake behavior, and dedicated matching-role
deployments.

The core idea is that Durable Workflow separates two concerns:

- durable history and task state stay in the database
- task matching decides which live worker gets the next eligible task

That separation matters even before you introduce a separate matching service.
It lets operators talk about ready-task discovery, queue ownership, lease
churn, and backpressure as one explicit role instead of as incidental side
effects of every worker process.

## What the matching role does

The matching role is responsible for:

- discovering ready workflow and activity tasks
- narrowing the eligible set by namespace, connection, queue, and
  compatibility family
- surfacing tasks to one worker at a time
- converting a successful claim into a lease with expiry
- preserving the same task when a claim fails, a lease expires, or a worker
  disappears
- making wake and backlog state visible to operators

Matching does not replace durable history, workflow replay, or task execution.
It decides who gets a chance to execute next.

## Deployment shapes

Durable Workflow supports three practical shapes today:

### In-worker matching

This is the default shape. Worker processes long-poll for ready work and use
claim-time fencing to ensure only one worker owns a task lease at a time.

Use this when:

- you run a single node or a small fleet
- queue pressure is moderate
- you do not need a dedicated matching daemon yet

### In-server HTTP matching

In standalone-server deployments, external workers reach the same matching
contract through the worker protocol:

- `POST /api/worker/workflow-tasks/poll`
- `POST /api/worker/activity-tasks/poll`

The server becomes the network entrypoint for the same ready-task discovery,
claim, heartbeat, and completion flow.

### Dedicated matching-role deployment

Larger fleets can concentrate broad ready-task discovery into a dedicated
matching-role process. The documented operator shape today is:

```bash
php artisan workflow:v2:repair-pass --loop
```

Run that daemon in a dedicated process and set
`DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` on execution-only nodes so they stop doing
the broad queue-worker wake on every loop tick.

Use this shape when:

- execution nodes should focus on replay and activity execution
- broad independent polling is creating unnecessary contention
- operators want an explicit place to own ready-task discovery and sweep
  cadence

The dedicated role changes where matching happens, not the worker-protocol
contract. Poll, claim, lease, and redelivery semantics stay the same.

## Ready-task discovery

The matching role looks for durable tasks that are actually ready to run now:

- the task kind matches the poller (`workflow` or `activity`)
- the task is in `ready` state
- the task's `available_at` has arrived
- namespace, queue, connection, and compatibility filters still match
- activity polls also require a matching advertised activity type

Long-poll wakeups are an acceleration path, not the correctness path. If the
wake signal is delayed or missing, the task still becomes visible through
durable polling. A wake failure should raise latency, not strand work.

## Claim, lease, and backpressure

Matching only offers an opportunity. Ownership starts when one worker
successfully claims the task and receives a lease.

That lease gives Durable Workflow its backpressure behavior:

- one worker owns the task until the lease is renewed, completed, released, or
  expired
- a failed or stale worker does not permanently trap the task
- redelivery is normal and must be handled as part of at-least-once execution
- incompatible workers do not steal the lease; they get an explicit rejection

Because work is lease-based, queue pressure shows up as backlog, stale leases,
or repeated redelivery instead of as hidden in-memory loss.

## Queue partitioning

The main partitioning primitives are:

- **namespace** for tenant or environment boundaries
- **connection** and **queue** for work-routing boundaries
- **compatibility family** for compatibility-marker routing safety
- **activity type filters** for workers that only execute selected activities

Use separate queues when you want stronger isolation, independent worker pools,
or different downstream budgets. Use compatibility families when the same
queue must stay live across a rollout or rollback without letting in-flight
work drift to incompatible executors.

## Recorded activity queues {#recorded-activity-queues}

An activity's resolved connection and queue are stored when it is scheduled. A change to an activity class, `ActivityOptions`, PHP SDK activity options or Python `schedule_activity(..., queue=...)` affects newly scheduled activities. Existing executions keep their recorded queue through retries and repair. A worker registering on a new queue does not move old work. Existing workflow runs keep their own workflow queue too.

### Change routing with an overlap window {#change-recorded-routing}

1. Start workers for the new queue in the correct namespace. Verify their activity types, positive activity slots and build compatibility. Keep the old workflow and activity pools available.
2. Deploy the new routing for new work. Preserve compatible code for existing runs and respect their build pins. A new queue is not a migration of recorded executions.
3. Inspect affected runs and both queues. Account for pending and leased activities, future retry availability, passive open runs, children and continuation chains that still need old workers. A zero ready-task count does not cover these dependencies.
4. Retire old workers only after you have accounted for those dependencies and stopped new work from creating them. Current snapshots are not an atomic retirement guard. If you cannot establish this, keep the old pool available. [Server #519](https://github.com/durable-workflow/server/issues/519) owns the guarded inventory and retirement capability.

### Inspect and recover stranded work {#recorded-queue-diagnostics}

Use an operator credential and the same namespace as the affected run. Set the origin, namespace, old queue and selected workflow/run IDs explicitly:

```bash
curl -fsS "$DW_SERVER_URL/api/task-queues/$OLD_QUEUE" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "X-Namespace: $DW_NAMESPACE"
curl -fsS "$DW_SERVER_URL/api/workflows/$WORKFLOW_ID/runs/$RUN_ID/debug" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "X-Namespace: $DW_NAMESPACE"
```

If server admission is available and not throttled, queue visibility reports `admission.activity_tasks.status: no_active_workers` when no active, non-stale worker is registered on that queue. The run debug response includes `pending_activities[].queue`, `activity_task_queues` and findings such as `pending_activity_queue_without_active_pollers`. If workers are present but do not advertise the required activity type, look for `pending_activity_type_unsupported`. Registration alone does not prove a worker is making progress.

The debug response is a bounded run snapshot, not a complete queue inventory. It includes at most 25 pending activities. Queue counters and empty snapshots cannot prove that concurrent or future work has no dependency on the old pool.

Restore a compatible worker on the **recorded** queue, with the required activity type and available slots, before its deadlines expire. Repair or restarting a worker does not change that queue or extend the original total deadline. If the work is no longer wanted, deliberately cancel the affected run and reconcile any external effects. Do not edit stored queue fields as a migration procedure.

A finite schedule-to-start timeout can expire while an activity waits for a worker. Schedule-to-close bounds the whole activity execution, including retry delays. These bounds apply only when configured. Deadline enforcement does not move the activity to a live queue, and an already terminal timeout is not revived by restoring workers. See [activity and workflow timeouts](../features/timeouts.md).

## Wake signals and dedicated sweeps

Wake signals shorten the time between "task became ready" and "a poller noticed
it." They are not the durable source of truth.

In the default shape, queue workers can emit wake signals as part of their
normal loop. In a dedicated matching-role deployment, execution-only nodes
disable that broad wake path and the matching daemon owns the sweep cadence
instead.

Treat these as tuning levers:

- `DW_V2_MATCHING_ROLE_QUEUE_WAKE` controls whether execution nodes perform the
  in-worker wake
- `DW_WAKE_SIGNAL_TTL_SECONDS` controls how long wake markers remain visible
- long-poll timeout settings control how long pollers stay parked waiting for
  work

## What operators should watch

Use these surfaces together:

- `GET /api/cluster/info` for the per-node role topology:
  `current_shape`, `current_process_class`, current roles, and the full
  `matching_role` contract: `queue_wake_enabled`, deployment `shape`,
  `wake_owner`, `task_dispatch_mode`, frozen `partition_primitives`, and the
  current `backpressure_model`
- task-queue visibility for ready depth, active slots, and throttling
- worker fleet visibility for active vs stale pollers on each queue
- `dw system:operator-metrics --json` or `/api/system/operator-metrics` for
  the same node-local `matching_role` contract beside live backlog, repair,
  worker, and health counters from the responding process
- health and Waterline diagnostics for unhealthy tasks, stale leases, and
  compatible-worker gaps
- rolling-upgrade checks when an overlap window is live and matching must
  block unsafe claims

If the oldest ready-task age grows while compatible workers are available, the
matching path is not making forward progress quickly enough. If ready tasks are
preserved but no compatible worker can claim them, that is a compatibility
problem, not a matching-loss problem.

## When to introduce a dedicated matching role

Move from default in-worker matching to a dedicated matching-role shape when:

- broad polling is creating visible database or cache contention
- execution nodes should stop paying the overhead of ready-task sweeps
- queue fairness and dispatch ownership need to be reasoned about as one
  explicit subsystem
- operators want a distinct process to scale, supervise, and debug for
  ready-task discovery

Stay on the default shape when the current fleet is small and the main need is
clear rollout and compatibility behavior rather than a new topology.

## Related references

- [Worker Protocol](/docs/polyglot/worker-protocol) for poll, heartbeat,
  complete, and fail verbs
- [Task Queue Admission](/docs/polyglot/task-queue-admission) for slot,
  lease, and dispatch budgets on top of matching
- [Rolling Upgrades](/docs/rolling-upgrades) for rollout procedure when
  matching and compatibility are both in play
- [Server Config Reference](/docs/polyglot/server-config-reference) for
  `DW_V2_MATCHING_ROLE_QUEUE_WAKE`, poll timing, and wake-signal settings
