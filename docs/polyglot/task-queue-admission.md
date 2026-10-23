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

Admission sits on top of the matching contract. Read
[Task Matching and Dispatch](/docs/polyglot/task-matching-dispatch) for
how ready work is discovered and leased before these budgets decide whether the
next task is allowed through.

## How The Budget Is Applied

Workflow and activity polling starts with the workers that are currently registered for a namespace and task queue. Each worker advertises `max_concurrent_workflow_tasks` and `max_concurrent_activity_tasks`; the server sums active, non-stale workers to calculate the queue's registered slot capacity.

Server-side active lease and dispatch-rate caps are optional. When configured, the server checks a short-lived cache lock before leasing the next workflow or activity task. If the active lease cap is full, polling returns no task for that poll instead of exceeding the in-flight budget. If the per-minute dispatch cap is full, polling returns no task until the next minute bucket has capacity. Downstream budget groups apply the same per-minute dispatch behavior across every queue in the namespace that shares a `dispatch_budget_group` name.

Query tasks are different: the control plane enqueues an ephemeral query task and waits for a worker response. `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` caps how many pending query tasks can exist for each namespace and task queue. When the queue is full, new queries return `query_task_queue_full` with HTTP `429`. If the cache store cannot provide the lock needed to mutate the query-task queue, queries return `query_task_queue_unavailable` with HTTP `503`.

## Retry load and downstream budgets {#retry-load-and-downstream-budgets}

**First attempts and retries both count** against queue, namespace and budget-group dispatch caps. The cap is a budget for successfully claimed activity-task attempts across workflows, not just retries. A full cap leaves eligible work waiting; it does not itself fail the activity. Schedule-to-start and schedule-to-close clocks keep running, as do workflow deadlines, so waiting can exhaust an authored timeout.

A dispatch cap measures attempts per minute, not success ratio or downstream health. It does not open a circuit breaker. One claim may make several HTTP calls if your activity or HTTP client retries internally; bound those calls separately. A fast-failed attempt also consumes a claim even when it never contacts the downstream.

For example, in namespace `production`, let the ordinary `payments` and `refunds` activity queues share one `payment-api` budget of 20 claims per minute. Set the same group cap on every participating queue; unrelated queues do not join the group. This is a minute-bucket ceiling, not a smooth rate or a reserved share for either queue:

```bash
DW_TASK_QUEUE_ADMISSION_OVERRIDES='{
  "production:payments": {
    "activity_tasks": {
      "dispatch_budget_group": "payment-api",
      "max_dispatches_per_minute_per_budget_group": 20
    }
  },
  "production:refunds": {
    "activity_tasks": {
      "dispatch_budget_group": "payment-api",
      "max_dispatches_per_minute_per_budget_group": 20
    }
  }
}'
```

Combine the Server cap with bounded activity attempts and backoff. This Python SDK 2.9.0 example assumes your application supplies an asynchronous shared breaker and payment client through `myapp.payments`; configure bounded I/O and stable downstream idempotency in that client. Register `charge` on the `payments` worker in `production`, and register `PaymentWorkflow` on its workflow worker:

```python
from durable_workflow import NonRetryableError, activity, workflow
from myapp.payments import breaker, payment_api

@activity.defn(name="payments.charge")
async def charge(order):
    if await breaker.is_open("payment-api"):
        raise NonRetryableError("payment-api breaker is open")
    return await payment_api.charge(order, idempotency_key=order["id"])

@workflow.defn(name="payments.order")
class PaymentWorkflow:
    def run(self, ctx, order):
        return (yield ctx.schedule_activity(
            "payments.charge", [order], queue="payments",
            retry_policy={"max_attempts": 3, "backoff_seconds": [2, 5]},
            start_to_close_timeout=10,
            schedule_to_start_timeout=30,
            schedule_to_close_timeout=90,
        ))
```

An open application breaker raises `NonRetryableError` before the payment call; ordinary retryable payment failures may use at most three attempts with the authored backoff. The original timeout budgets can expire before all three attempts occur. Workflow code can catch the final activity failure when business logic requires it; an uncaught final failure can close the workflow. Choose an overall workflow deadline separately.

Keep protected downstream calls in **ordinary queued activities**. Inline local activities create no ordinary activity task, so queue, namespace and budget-group activity dispatch caps do not meter them. A prepared local-activity claim validates execution authority, not this dispatch budget. Embedded Laravel mode has no standalone Server admission; use its own deployment controls. See [local activities](../features/local-activities.md).

## Namespace request admission {#namespace-request-admission}

The following contract is for published **PHP Server 2.11.0**. Check your actual image and the [versioned configuration reference](./server-config-reference.md#additional-published-php-controls). Namespace HTTP budgets are separate from worker slots, task dispatch, held worker polls and durable-state quotas. The HTTP budget belongs to the request namespace resolved from `Durable-Workflow-Namespace` or `DW_DEFAULT_NAMESPACE`, including namespace-management requests whose path names another namespace.

Authenticated requests that reach namespace admission count on these control and management route families, including their descendants: `/api/namespaces`, `/api/storage`, `/api/workflows`, `/api/activities`, `/api/bridge-adapters`, `/api/workers`, `/api/worker-sessions`, `/api/task-queues`, `/api/deployments`, `/api/schedules`, `/api/search-attributes`, `/api/service-endpoints`, `/api/service-catalog`. Plural `/api/workers` management requests count.

Singular `/api/worker/*` registration, polling and outcome routes do not use this HTTP budget. Health/readiness, `/api/cluster/info`, admin `/api/system/*`, runtime credentials and external-payload transport also stay outside this gate; their own authentication, capacity and storage checks still apply. Requests refused earlier by authentication, protocol or namespace resolution never reach this counter.

Rate admission uses fixed server-clock minute buckets, not a smooth or rolling rate. A budget of N can admit N requests just before a boundary and another N just after it. Requests that fail later still count; rate admission happens before the concurrency check, so a concurrency refusal can consume minute budget. A concurrency slot remains held until the request finishes and cleanup releases it; it does not count running workflows.

Across API replicas, use the same shared Redis store/key prefix, synchronized clocks and consistent loaded configuration. The shared namespace budget is not multiplied by adding replicas. A local file cache only coordinates processes with compatible writable access to its files; it is not the multi-node baseline. Per-node held worker/query-poll caps remain separate. [Restart affected roles after environment changes](./server-config-reference.md#how-changes-take-effect).

```dotenv
DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE=100
DW_NAMESPACE_MAX_CONCURRENT_REQUESTS=8
DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE=150
DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS=10
DW_NAMESPACE_ADMISSION_OVERRIDES='{"payments":{"max_requests_per_minute":200,"max_concurrent_requests":12},"reports":{"max_requests_per_minute":40,"max_concurrent_requests":3}}'
```

For existing namespaces, this example resolves `payments` to 150 requests/minute and 10 concurrent requests, `reports` to 40/3, and other namespaces to 100/8. Overrides can raise or lower defaults, but the 150/10 hard caps still apply. This configuration does not create namespaces or reserve throughput.

For these HTTP controls, unset means no corresponding configured limit; a hard cap alone can still impose a limit. A null override falls back to the default. Values must be positive integers: zero is invalid. PHP implementation ceilings are 10000000 requests/minute and 1024 concurrent requests, independent of the actual HTTP pool capacity. Published PHP 2.11.0 silently treats malformed `DW_NAMESPACE_ADMISSION_OVERRIDES` JSON as an empty override map, falling back to global defaults. Validate the JSON before deployment; if the defaults and hard caps are unset, the intended namespace cap is lost. This [confirmed product gap](https://github.com/durable-workflow/durable-workflow.github.io/issues/335#issuecomment-6369150521) remains separate from the documentation update.

| Reason | HTTP | Retry hint in seconds |
| --- | --- | --- |
| `namespace_request_rate_exhausted` | `429` | Until the next minute, 1–60 |
| `namespace_request_concurrency_exhausted` | `429` | 1 |
| `namespace_request_admission_unavailable` | `503` | 1 |

The JSON `retry_after_seconds` and `Retry-After` header agree. Unavailable configured coordination or invalid numeric limits fails closed with 503. Inspect namespace-scoped admin metrics even when ordinary requests are exhausted; `dw_namespace_request_admission_rejections` reports the finite reasons. Apply bounded caller retry/backoff policy and preserve idempotency; an uncertain transport outcome is not permission to resubmit a write automatically. See [timeout budgets](../deployment.md#worker-long-poll-timeout-budgets).

## Namespace durable-state quotas {#namespace-durable-state}

`DW_NAMESPACE_DURABLE_LIMITS` sets default retained-row limits, `DW_NAMESPACE_DURABLE_OVERRIDES` changes them per namespace, and `DW_NAMESPACE_DURABLE_HARD_LIMITS` adds non-bypassable ceilings. Empty objects add no limits. Overrides can raise or lower defaults; null falls back to the default. Unlike HTTP admission, a durable limit of zero is valid and prevents new allocations. In this example, existing `payments` can hold 250 open runs, other namespaces 100, under a 500 hard ceiling.

```dotenv
DW_NAMESPACE_DURABLE_LIMITS='{"max_open_workflow_runs":100,"max_open_workflow_run_waits":200,"max_pending_workflow_timers":200}'
DW_NAMESPACE_DURABLE_HARD_LIMITS='{"max_open_workflow_runs":500}'
DW_NAMESPACE_DURABLE_OVERRIDES='{"payments":{"max_open_workflow_runs":250}}'
```

Use `max_<resource>` fields for the resources below. Counts belong to the namespace owning each row, or its linked workflow/run. Total retained rows and open/pending subsets are independent limits. Enforcement uses database-authoritative counts while serializing mutations on the namespace row.

| Resource | What counts |
| --- | --- |
| `workflow_instances`, `workflow_runs` | All retained workflow instance/run rows, including terminal runs. |
| `open_workflow_runs` | Runs with `pending`, `running` or `waiting` status. |
| `workflow_history_events`, `workflow_commands`, `workflow_tasks` | Retained history, command and workflow-task rows. |
| `pending_workflow_tasks` | Queued workflow-task rows with `ready` status; active leases have separate admission controls. |
| `workflow_timers`, `pending_workflow_timers` | All retained timers, and the `pending` subset respectively. |
| `workflow_run_waits`, `open_workflow_run_waits` | All retained run waits, and the `open` subset respectively. |
| `schedules`, `schedule_history_events`, `worker_registrations` | Retained schedules, schedule history and worker-registration rows; stale registrations count until removed. |
| `workflow_streams`, `workflow_stream_items` | Durable and inbound stream rows, and their item rows. |

A parent waiting for a child or service call still consumes an open run in its own namespace. A child adds its own run; in the same namespace, plan for both open runs and their waits/timers. A service operation that creates a workflow consumes rows in that workflow’s namespace; signal/update operations on an existing run do not automatically create a second run. Service-call boundary and external-payload quotas are separate controls.

Exhaustion returns 429 `namespace_<resource>_exhausted`. Read `retryable`: some quotas are nonretryable and provide no retry hint; retryable durable refusals advertise 60 seconds, without promising capacity then. Failure to evaluate a configured quota returns 503 `namespace_durable_state_quota_unavailable` with a one-second hint. Retained-row pressure may require retention or a capacity/configuration change, not a tight retry loop.

Select the namespace with the request header when reading admin metrics. `dw_namespace_durable_state_usage` and the JSON `limits`, `usage`, `remaining`, `configuration_status` and `measurement_status` expose that scope; namespace is request scope rather than an unbounded metric label. Unavailable measurements are not zero usage or unlimited capacity. See the [complete configuration reference](./server-config-reference.md#namespace-durable-controls).

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

To give Python workflow and activity handlers independent process resources,
use the [separate worker processes example](https://python.durable-workflow.com/guides/separate-workers/).
Choose the registered handler lists to separate roles. Keep both concurrency
values positive, and apply server caps when the total across processes must be
bounded.

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

- [Server](/docs/polyglot/server)
- [CLI](/docs/polyglot/cli)
- [Python SDK](/docs/polyglot/python)
- [Worker Protocol](/docs/polyglot/worker-protocol)
