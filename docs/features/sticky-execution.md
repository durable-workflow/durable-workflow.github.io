---
sidebar_position: 25
title: Sticky Execution
description: Use sticky workflow-task routing as a supported v2 replay optimization with cold replay as the correctness fallback.
tags:
  - sticky-execution
  - replay
  - operations
keywords:
  - sticky execution
  - sticky replay cache
  - cold replay fallback
  - worker_id routing
  - sticky cache diagnostics
---

# Sticky Execution

Sticky execution is a supported Durable Workflow v2 replay optimization. A
worker can keep a warm, process-local workflow cache after it completes a
workflow task, and matching can prefer that worker for the next workflow task
for the same run.

Sticky execution is not a correctness feature. Workflow progress is still
committed only through durable history, and ordinary cold replay from history
is always valid. Workflow code must not rely on process-local state for
correctness.

## Contract Summary

Sticky execution has four guarantees:

- Sticky caches are owned by worker processes, not by the server or database.
- Sticky routing uses the worker protocol `worker_id` as the routing identity.
- Sticky affinity is advisory and expires; cold replay is the mandatory
  fallback for cache misses, worker restart, drain, rollout, or eviction.
- Operators have named controls and diagnostics for enablement, TTL, capacity,
  hit rate, miss rate, forced cold replay, and capacity pressure.

The durable affinity fields are `sticky_worker_id` and `sticky_until` on runs
and workflow tasks. The workflow-task diagnostic fields are
`sticky_replay_mode` and `sticky_claimed_at`.

## Sticky-Cache Lifecycle

A sticky cache is a local worker data structure containing replayed workflow
state for one or more runs. When a sticky-capable worker completes a workflow
task, the server may record that worker as the run's sticky owner until
`sticky_until`. Follow-up workflow tasks inherit that affinity when they are
created.

The worker owns cache contents and eviction policy. A worker may evict cached
runs when it reaches capacity, begins draining, restarts, changes build,
detects unsafe cached state, or chooses to free memory. The server never treats
cache contents as durable state.

If a worker receives a sticky-routed task but no longer has a valid cache entry,
the worker must perform cold replay from durable history. The task lease remains
the only authority for committing workflow progress.

## Routing Identity

The routing identity is the worker protocol `worker_id`. Workers opt into
sticky routing by registering with sticky cache enabled and by continuing to
heartbeat as active workers on the task queue.

Matching follows these rules:

- A task with active affinity for the polling worker is preferred.
- A task with no active affinity can be claimed by any compatible worker.
- A task with active affinity for another live sticky worker is held for that
  owner until `sticky_until` expires or the owner becomes unavailable.
- A task with expired affinity, stale-owner affinity, or disabled sticky
  execution can be claimed normally and cold replayed.

Sticky routing does not bypass compatibility, queue, namespace, or lease
checks. It only changes ready-task preference while ordinary replay remains the
fallback.

## Fallback Semantics

Cold replay is mandatory fallback. It happens when:

- sticky execution is disabled.
- the worker did not register sticky-cache support.
- the task has no active `sticky_worker_id` and `sticky_until`.
- the sticky owner is stale, missing, draining, restarted, or rolled out.
- the sticky owner evicted the run.
- the polling worker is not the sticky owner after the affinity expired.

The replay-mode diagnostics are:

- `sticky_hit_expected` - the sticky owner claimed the task before expiry.
- `cold_replay` - no sticky affinity applied.
- `forced_cold_replay` - affinity existed, but the task must be replayed cold.

`forced_cold_replay` is not a correctness failure. It means sticky execution
did not deliver its intended replay-speed benefit for that task.

## Deployment, Drain, and Rollout

Sticky execution follows the worker lifecycle. During drain, a worker should
stop claiming new workflow tasks while completing, heartbeating, failing, or
letting existing leases expire under the normal lease contract. Once the worker
is stale or no longer active, other compatible workers can claim its sticky
tasks after the affinity expires and cold replay them.

Replacement workers do not inherit process-local caches. A rollout can
therefore increase `forced_cold_replay` until new workers warm their own
caches. Use unique `worker_id` values per worker process or restart so
operator diagnostics can distinguish an old cache owner from a new process.

Build-id compatibility and workflow-definition fingerprinting still decide
whether a worker may execute a workflow task. Sticky execution is never a way to
route incompatible code to a run.

## Operator Controls

Sticky execution is controlled by workflow/runtime configuration and worker
capabilities, not by standalone server-image environment variables. The
workflow package configuration exposes the enablement flag and affinity TTL:

```php
'workflows' => [
    'v2' => [
        'sticky_execution' => [
            'enabled' => true,
            'ttl_seconds' => 300,
        ],
    ],
],
```

Worker cache capacity is advertised by each worker at registration and on
heartbeat. Disable sticky routing in runtime configuration, or run workers
without sticky-cache support, without changing workflow semantics. Existing
runs continue by ordinary cold replay.

## Worker Protocol Fields

Sticky-capable workers advertise support at registration:

```json
{
  "worker_id": "orders-worker-01",
  "task_queue": "orders",
  "runtime": "python",
  "sticky_cache_enabled": true,
  "sticky_cache_capacity": 100
}
```

Workers report cache diagnostics on heartbeat:

```json
{
  "worker_id": "orders-worker-01",
  "sticky_cache": {
    "enabled": true,
    "capacity": 100,
    "size": 72,
    "hit_count": 940,
    "miss_count": 31,
    "forced_cold_replay_count": 8,
    "eviction_count": 15
  }
}
```

Workflow-task poll responses include `task.sticky_execution` with the
`sticky_worker_id`, `sticky_until`, `replay_mode`, and `cache_directive`.
Workers should treat `resume_if_present` as permission to use a valid warm
cache and should cold replay if the cache entry is absent or invalid.

## Metrics and Diagnostics

Operator metrics include:

- `sticky_execution.active_sticky_runs`
- `sticky_execution.ready_sticky_tasks`
- `sticky_execution.leased_sticky_tasks`
- `sticky_execution.hit_expected_last_minute`
- `sticky_execution.miss_last_minute`
- `sticky_execution.forced_cold_replay_last_minute`
- `sticky_execution.cold_replay_last_minute`
- `sticky_execution.hit_rate_last_minute`
- `sticky_execution.miss_rate_last_minute`
- `sticky_execution.capacity_pressure_tasks`

The standalone server also reports worker cache capacity, cache size, cache hit
count, cache miss count, forced cold replay count, cache eviction count, and
capacity-pressure worker count under `sticky_execution_workers`.

Use these diagnostics this way:

- Low hit rate with healthy workers usually means the TTL is too short, workers
  are being replaced often, or cache capacity is too small.
- High miss rate or high forced cold replay means correctness is protected, but
  sticky execution is not improving replay cost.
- Capacity pressure means workers are near or above their reported sticky-cache
  capacity and may evict warm runs.

## Replay-Safe Code

Workflow code must behave identically under sticky and cold-replay execution.
Only durable history is safe for workflow decisions: workflow inputs, activity
results, timers, signals, updates, side effects, version markers, memo, and
search attributes.

Do not rely on mutable globals, local files, open sockets, object identity,
random values, wall-clock reads, or any other process-local state for
correctness. Sticky execution may preserve those values by accident on one
task, then lose them on a cache miss, worker restart, rollout, or eviction.

Use [`sideEffect(...)`](/docs/features/side-effects) for non-deterministic
values that must be recorded once, and use ordinary activities for external
side effects. See
[Execution Guarantees and Idempotency](/docs/constraints/execution-guarantees)
for the replay and durable-history contract.
