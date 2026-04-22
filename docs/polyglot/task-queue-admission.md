---
sidebar_position: 6
title: Task Queue Admission
description: Tune worker slots, server-side queue budgets, and query-task backpressure for the standalone server.
tags:
  - admission
  - operations
  - task-queues
  - bounded-growth
keywords:
  - task queue admission
  - dispatch budget
  - queue limits
  - bounded worker queues
---

# Task Queue Admission

Task queue admission keeps one queue, tenant, or downstream dependency from consuming the whole worker fleet. Durable Workflow exposes admission in three layers:

- worker registrations advertise local workflow and activity slots
- the server can cap active workflow and activity leases per namespace and queue
- the server can cap workflow and activity dispatches per minute per namespace and queue
- the server can cap dispatches per minute for named downstream budget groups shared by several queues
- query tasks have a bounded pending queue so synchronous reads fail fast instead of growing without limit

Use admission controls when a queue is tied to a rate-limited dependency, tenants share the same server, or operators need to prove why a workflow is waiting.

## How The Budget Is Applied

Workflow and activity polling starts with the workers that are currently registered for a namespace and task queue. Each worker advertises `max_concurrent_workflow_tasks` and `max_concurrent_activity_tasks`; the server sums active, non-stale workers to calculate the queue's registered slot capacity.

Server-side active lease and dispatch-rate caps are optional. When configured, the server checks a short-lived cache lock before leasing the next workflow or activity task. If the active lease cap is full, polling returns no task for that poll instead of exceeding the in-flight budget. If the per-minute dispatch cap is full, polling returns no task until the next minute bucket has capacity. Downstream budget groups apply the same per-minute dispatch behavior across every queue in the namespace that shares a `dispatch_budget_group` name.

Query tasks are different: the control plane enqueues an ephemeral query task and waits for a worker response. `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` caps how many pending query tasks can exist for each namespace and task queue. When the queue is full, new queries return `query_task_queue_full` with HTTP `429`. If the cache store cannot provide the lock needed to mutate the query-task queue, queries return `query_task_queue_unavailable` with HTTP `503`.

## Server Configuration

Set global caps when every queue should share the same ceiling:

```bash
DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE=25
DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE=100
DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE=500
DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE=2000
DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE=600
DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE=1200
DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE=12000
DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE=24000
DW_QUERY_TASK_MAX_PENDING_PER_QUEUE=1024
```

Queue caps protect one task queue. Namespace caps protect the tenant-wide total across every task queue in the namespace, which is useful when a tenant can shard work across many queues but still shares one downstream quota. Budget-group caps protect a named downstream dependency across selected queues without throttling every queue in the namespace.

Use `DW_TASK_QUEUE_ADMISSION_OVERRIDES` when specific queues or namespaces need different budgets. Keys are checked in this order: `namespace:task_queue`, `namespace:*`, `task_queue`, then `*`.

```bash
DW_TASK_QUEUE_ADMISSION_OVERRIDES='{
  "production:payments": {
    "workflow_tasks": {
      "max_active_leases_per_queue": 8,
      "max_dispatches_per_minute": 120,
      "dispatch_budget_group": "downstream-openai",
      "max_dispatches_per_minute_per_budget_group": 600
    },
    "activity_tasks": {
      "max_active_leases_per_queue": 12,
      "max_dispatches_per_minute": 240
    }
  },
  "production:*": {
    "workflow_tasks": {
      "max_active_leases_per_namespace": 300,
      "max_dispatches_per_minute_per_namespace": 6000
    },
    "activity_tasks": {
      "max_active_leases_per_namespace": 1200,
      "max_dispatches_per_minute_per_namespace": 12000
    }
  },
  "email": {
    "activity_tasks": {
      "max_active_leases_per_queue": 4,
      "max_dispatches_per_minute": 60,
      "dispatch_budget_group": "downstream-sendgrid",
      "max_dispatches_per_minute_per_budget_group": 300
    }
  },
  "*": {
    "workflow_tasks": { "max_active_leases_per_queue": 50 }
  }
}'
```

The override value also accepts `max_active_leases` as an alias for `max_active_leases_per_queue` and `budget_group` as an alias for `dispatch_budget_group`.

Cache must support atomic locks for server-side active lease caps, dispatch-rate caps, and query-task admission. Dispatch-rate counters are short-lived minute buckets created only for capped queues that actually lease tasks. Redis is the recommended cache store for multi-node deployments.

## Worker Slot Registration

Python workers expose local semaphores through `Worker(...)` and send the same values during registration:

```python
worker = Worker(
    client,
    task_queue="payments",
    workflows=[PaymentWorkflow],
    activities=[charge_card, send_receipt],
    max_concurrent_workflow_tasks=8,
    max_concurrent_activity_tasks=12,
)
```

For custom HTTP workers, send the slot fields to `POST /api/worker/register`:

```json
{
  "worker_id": "payments-python-1",
  "task_queue": "payments",
  "runtime": "python",
  "supported_workflow_types": ["payments.PaymentWorkflow"],
  "supported_activity_types": ["payments.charge_card", "payments.send_receipt"],
  "max_concurrent_workflow_tasks": 8,
  "max_concurrent_activity_tasks": 12
}
```

Worker slots are not a hard tenant budget by themselves. They describe what active workers can currently process. Add server caps when you need a queue-wide ceiling that still holds if more workers are deployed.

## Inspect Admission

Use the CLI when debugging:

```bash
dw task-queue:list
dw task-queue:describe payments
dw task-queue:describe payments --json | jq '.admission'
```

The server exposes the same data through:

- `GET /api/task-queues`
- `GET /api/task-queues/{name}`

An admission payload has three sections:

```json
{
  "workflow_tasks": {
    "status": "throttled",
    "active_worker_count": 3,
    "configured_slot_count": 24,
    "leased_count": 8,
    "ready_count": 5,
    "available_slot_count": 16,
    "server_max_active_leases_per_queue": 8,
    "server_active_lease_count": 8,
    "server_remaining_active_lease_capacity": 0,
    "server_max_active_leases_per_namespace": 300,
    "server_namespace_active_lease_count": 149,
    "server_remaining_namespace_active_lease_capacity": 151,
    "server_max_dispatches_per_minute": 120,
    "server_dispatch_count_this_minute": 120,
    "server_remaining_dispatch_capacity": 0,
    "server_max_dispatches_per_minute_per_namespace": 6000,
    "server_namespace_dispatch_count_this_minute": 3520,
    "server_remaining_namespace_dispatch_capacity": 2480,
    "server_dispatch_budget_group": "downstream-openai",
    "server_max_dispatches_per_minute_per_budget_group": 600,
    "server_budget_group_dispatch_count_this_minute": 600,
    "server_remaining_budget_group_dispatch_capacity": 0,
    "server_lock_required": true,
    "server_lock_supported": true,
    "budget_source": "worker_registration.max_concurrent_workflow_tasks",
    "server_budget_source": "server.admission.queue_overrides"
  },
  "activity_tasks": {
    "status": "accepting",
    "configured_slot_count": 36,
    "server_max_active_leases_per_queue": 12,
    "server_remaining_active_lease_capacity": 4,
    "server_max_dispatches_per_minute": 240,
    "server_remaining_dispatch_capacity": 197
  },
  "query_tasks": {
    "status": "accepting",
    "max_pending_per_queue": 1024,
    "approximate_pending_count": 7,
    "remaining_pending_capacity": 1017,
    "lock_supported": true,
    "budget_source": "server.query_tasks.max_pending_per_queue"
  }
}
```

## Status Reference

| Section | Status | Meaning |
|---------|--------|---------|
| Workflow/activity | `accepting` | Active workers have available slots and no server cap is full. |
| Workflow/activity | `throttled` | The optional server-side active lease cap or dispatch-per-minute cap is full. |
| Workflow/activity | `saturated` | Registered worker slots are all leased, even if no server cap is configured. |
| Workflow/activity | `no_slots` | Active workers registered zero slots for that task kind. |
| Workflow/activity | `no_active_workers` | No active, non-stale worker is polling that queue. |
| Workflow/activity | `unavailable` | A configured server cap needs a cache lock, but the lock is unavailable. |
| Query | `accepting` | The pending query-task queue has remaining capacity. |
| Query | `full` | Pending query tasks reached `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE`; new queries return HTTP `429`. |
| Query | `unavailable` | The query-task queue cannot acquire its cache lock; new queries return HTTP `503`. |

## Tuning Pattern

1. Start with worker slots sized to the process: CPU-bound workflow tasks are usually lower than I/O-heavy activity tasks.
2. Add active lease caps for queues that need an in-flight ceiling across all workers.
3. Add namespace-wide active lease caps when one tenant can create many queues but still needs a total in-flight ceiling.
4. Add dispatch-per-minute caps for queues that protect a rate-limited external API, database pool, tenant, or legacy service from bursts even when workers have free slots.
5. Add budget-group dispatch caps when several queues share one downstream dependency but unrelated queues in the namespace should keep flowing.
6. Add namespace-wide dispatch caps when the downstream quota is tenant-wide rather than queue-specific.
7. Inspect `dw task-queue:describe <queue>` during load. `saturated` means add worker capacity or lower workflow fan-out. `throttled` means an active lease or dispatch-rate cap is doing its job. `no_active_workers` means the queue has no healthy poller.
8. Keep query-task capacity large enough for normal operator reads, but low enough to fail fast during incidents. Query-task overflow is backpressure, not data loss.

## Related Guides

- [Server](/docs/2.0/polyglot/server)
- [CLI](/docs/2.0/polyglot/cli)
- [Python SDK](/docs/2.0/polyglot/python)
- [Worker Protocol](/docs/2.0/polyglot/worker-protocol)
