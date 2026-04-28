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
- **compatibility family** for mixed-version routing safety
- **activity type filters** for workers that only execute selected activities

Use separate queues when you want stronger isolation, independent worker pools,
or different downstream budgets. Use compatibility families when the same
queue must stay live across a rollout or rollback without letting in-flight
work drift to incompatible executors.

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

- task-queue visibility for ready depth, active slots, and throttling
- worker fleet visibility for active vs stale pollers on each queue
- health and Waterline diagnostics for unhealthy tasks, stale leases, and
  compatible-worker gaps
- rolling-upgrade checks when mixed versions are live and matching must block
  unsafe claims

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

- [Worker Protocol](/docs/2.0/polyglot/worker-protocol) for poll, heartbeat,
  complete, and fail verbs
- [Task Queue Admission](/docs/2.0/polyglot/task-queue-admission) for slot,
  lease, and dispatch budgets on top of matching
- [Rolling Upgrades](/docs/2.0/rolling-upgrades) for rollout procedure when
  matching and compatibility are both in play
- [Server Config Reference](/docs/2.0/polyglot/server-config-reference) for
  `DW_V2_MATCHING_ROLE_QUEUE_WAKE`, poll timing, and wake-signal settings
