---
sidebar_position: 6
title: 任务队列准入
description: 为独立服务器调优 Worker 执行槽、服务器端队列预算和查询任务背压。
tags:
  - admission
  - operations
  - task-queues
  - bounded-growth
keywords:
  - 任务队列准入
  - 派发预算
  - 队列限制
  - 有界 Worker 队列
---

# 任务队列准入 {#task-queue-admission}

任务队列准入防止某个队列、租户或下游依赖占用整个 Worker 集群。Durable Workflow 在 Worker、服务器和查询任务层面提供准入控制：

- Worker 注册声明本地工作流和活动执行槽
- 服务器可以限制每个命名空间和队列的活动工作流与活动任务租约数
- 服务器可以限制每个命名空间和队列每分钟的工作流与活动任务派发数
- 服务器可以为多个队列共享的具名下游预算组限制每分钟派发数
- 查询任务使用有界待处理队列，使同步读取能够快速失败，避免无限增长

队列关联限流依赖、多个租户共享服务器，或运维人员需要证明工作流为何等待时，使用准入控制。

准入控制位于匹配契约之上。就绪工作如何被发现和租用，以及预算如何决定是否放行下一个任务，见[任务匹配与派发](/docs/polyglot/task-matching-dispatch)。

## 如何应用预算 {#how-the-budget-is-applied}

工作流和活动轮询从当前在命名空间与任务队列注册的 Worker 开始。每个 Worker 声明 `max_concurrent_workflow_tasks` 和 `max_concurrent_activity_tasks`；服务器汇总活动且未失联的 Worker，计算队列的已注册执行槽容量。

服务器端活动租约和派发速率上限是可选的。配置后，服务器在租用下一个工作流或活动任务前检查短期缓存锁。活动租约上限已满时，本次轮询不返回任务，不会超出执行中任务预算。每分钟派发上限已满时，轮询不返回任务，直到下一个分钟计数桶有容量。下游预算组将同样的每分钟派发规则应用于命名空间中共享 `dispatch_budget_group` 名称的所有队列。

查询任务不同：控制平面将临时查询任务入队，并等待 Worker 响应。`DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` 限制每个命名空间与任务队列的待处理查询任务数。队列已满时，新查询以 HTTP `429` 返回 `query_task_queue_full`。如果缓存存储无法提供修改查询任务队列所需的锁，查询以 HTTP `503` 返回 `query_task_queue_unavailable`。

## 重试负载与下游预算 {#retry-load-and-downstream-budgets}

**首次尝试和重试都会计入**队列、namespace 和预算组的调度上限。上限覆盖不同工作流中成功领取的活动任务尝试，而不只是重试。达到上限后任务等待，本身不会让活动失败。schedule-to-start、schedule-to-close 和工作流期限仍在计时，因此等待可能耗尽已配置的超时。

调度上限衡量每分钟尝试数，不衡量成功比例或下游健康，也不会打开熔断器。如果活动或 HTTP 客户端内部重试，一次领取可能产生多次 HTTP 请求，需另行限制。即使快速拒绝且没有访问下游，该次领取仍消耗预算。

例如，在 `production` namespace 中，让普通活动队列 `payments` 和 `refunds` 共享每分钟 20 次领取的 `payment-api` 预算。所有参与队列设置相同组上限；无关队列不加入。这是分钟时间桶上限，不是平滑速率，也不为任何队列保留份额：

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

将 Server 上限与有界活动尝试和退避结合。此 Python SDK 2.9.0 示例假设应用通过 `myapp.payments` 提供异步共享熔断器和支付客户端；在该客户端中限制 I/O，并使用稳定的下游幂等键。将 `charge` 注册到 `production` 中的 `payments` worker，将 `PaymentWorkflow` 注册到其工作流 worker：

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

应用熔断器打开时，在支付请求前抛出 `NonRetryableError`；普通可重试支付错误最多按所设退避执行三次尝试。原始超时可能在三次尝试前到期。业务需要时，工作流可以捕获最终活动错误；未捕获的最终错误可能结束工作流。工作流总期限需单独设置。

受保护的下游调用应使用**普通排队活动**。内联本地活动不会创建普通活动任务，因此活动的队列、namespace 和预算组调度上限不会计量它们。prepared 本地活动领取验证执行权限，不检查这项调度预算。嵌入式 Laravel 没有独立 Server 的 admission；请使用其部署控制。参见[本地活动](../features/local-activities.md)。

## Server 配置 {#server-configuration}

所有队列应采用同一上限时，设置全局上限：

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

队列上限保护单个任务队列。命名空间上限保护租户在该命名空间内所有任务队列的总量，适合租户能将工作拆分到多个队列、但仍共享一个下游配额的情况。预算组上限保护选定队列共同使用的具名下游依赖，无须限制命名空间中的每个队列。

特定队列或命名空间需要不同预算时，使用 `DW_TASK_QUEUE_ADMISSION_OVERRIDES`。键按以下顺序检查：`namespace:task_queue`、`namespace:*`、`task_queue`，最后是 `*`。

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

覆盖值还接受 `max_active_leases` 作为 `max_active_leases_per_queue` 的别名，以及 `budget_group` 作为 `dispatch_budget_group` 的别名。

缓存必须支持原子锁，才能实施服务器端活动租约上限、派发速率上限和查询任务准入。派发速率计数器是短期分钟计数桶，仅为配置了上限且实际租用任务的队列创建。多节点部署建议使用 Redis 缓存存储。

## Worker 执行槽注册 {#worker-slot-registration}

需要为 Python 工作流和活动处理器提供独立进程资源时，使用[独立 Worker 进程示例](https://python.durable-workflow.com/guides/separate-workers/)。通过选择注册的处理器列表区分角色。两个并发值都必须为正数；需要限制跨进程总量时，应用服务器上限。

Python Worker 通过 `Worker(...)` 提供本地信号量，并在注册时发送相同的值：

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

自定义 HTTP Worker 向 `POST /api/worker/register` 发送执行槽字段：

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

Worker 执行槽本身不是严格的租户预算。它们描述活动 Worker 当前能处理的工作量。需要即使增加 Worker 部署也仍然有效的队列级上限时，应添加服务器上限。

## 检查准入状态 {#inspect-admission}

调试时使用 CLI：

```bash
dw task-queue:list
dw task-queue:describe payments
dw task-queue:describe payments --json | jq '.admission'
```

服务器通过以下接口提供相同数据：

- `GET /api/task-queues`
- `GET /api/task-queues/{name}`

准入负载包含三部分：

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

## 状态参考 {#status-reference}

| 部分 | 状态 | 含义 |
|---------|--------|---------|
| 工作流／活动 | `accepting` | 活动 Worker 有可用执行槽，且没有服务器上限已满。 |
| 工作流／活动 | `throttled` | 可选的服务器端活动租约上限或每分钟派发上限已满。 |
| 工作流／活动 | `saturated` | 已注册的 Worker 执行槽全部已租用，即使未配置服务器上限也是如此。 |
| 工作流／活动 | `no_slots` | 活动 Worker 为该任务种类注册了零个执行槽。 |
| 工作流／活动 | `no_active_workers` | 没有活动且未失联的 Worker 正在轮询该队列。 |
| 工作流／活动 | `unavailable` | 配置的服务器上限需要缓存锁，但该锁不可用。 |
| 查询 | `accepting` | 待处理查询任务队列仍有容量。 |
| 查询 | `full` | 待处理查询任务已达到 `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE`；新查询返回 HTTP `429`。 |
| 查询 | `unavailable` | 查询任务队列无法取得缓存锁；新查询返回 HTTP `503`。 |

## 调优模式 {#tuning-pattern}

1. 首先根据进程能力设置 Worker 执行槽。CPU 密集的工作流任务并发通常低于 I/O 密集的活动任务。
2. 为需要限制所有 Worker 执行中任务总量的队列添加活动租约上限。
3. 当一个租户可创建多个队列、但仍需要整体执行中任务上限时，添加命名空间级活动租约上限。
4. 为需要保护受限外部 API、数据库连接池、租户或旧服务免受突发流量影响的队列添加每分钟派发上限，即使 Worker 有空闲执行槽也实施限制。
5. 多个队列共享一个下游依赖，而命名空间中无关队列应继续处理时，添加预算组派发上限。
6. 下游配额属于整个租户而非特定队列时，添加命名空间级派发上限。
7. 在负载下检查 `dw task-queue:describe <queue>`。`saturated` 表示需要增加 Worker 容量或减少工作流扇出；`throttled` 表示活动租约或派发速率上限正在发挥作用；`no_active_workers` 表示队列没有健康轮询方。
8. 查询任务容量应足够满足正常运维读取，同时应足够小，以便事故期间快速失败。查询任务溢出是背压，不是数据丢失。

## 相关指南 {#related-guides}

- [Server](/docs/polyglot/server)
- [CLI](/docs/polyglot/cli)
- [Python SDK](/docs/polyglot/python)
- [Worker 协议](/docs/polyglot/worker-protocol)
