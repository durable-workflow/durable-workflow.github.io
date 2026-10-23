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

## 命名空间请求准入 {#namespace-request-admission}

以下契约针对已发布的 **PHP Server 2.11.0**。请检查实际镜像及[版本化配置参考](./server-config-reference.md#additional-published-php-controls)。HTTP 预算独立于 worker slot、任务派发、保持中的轮询和持久状态配额。预算属于通过 `Durable-Workflow-Namespace` 或 `DW_DEFAULT_NAMESPACE` 解析出的请求命名空间，即使管理路径指向另一个命名空间也是如此。

经过认证并到达命名空间准入的请求，会在下列控制和管理路由族及其子路径上计数：`/api/namespaces`, `/api/storage`, `/api/workflows`, `/api/activities`, `/api/bridge-adapters`, `/api/workers`, `/api/worker-sessions`, `/api/task-queues`, `/api/deployments`, `/api/schedules`, `/api/search-attributes`, `/api/service-endpoints`, `/api/service-catalog`。复数形式的 `/api/workers` 管理请求也计数。

单数形式 `/api/worker/*` 的注册、轮询及结果上报不使用此 HTTP 预算。health/readiness、`/api/cluster/info`、管理员 `/api/system/*`、运行时凭据和外部 payload 传输也在此 gate 之外，但各自的认证、容量和存储检查仍有效。更早被认证、协议或命名空间解析拒绝的请求不会到达此计数器。

速率按 Server 时钟的固定分钟桶计算，不是平滑速率或滚动窗口。预算 N 可能在边界前接受 N 个请求、边界后再接受 N 个。后续失败仍计数；速率准入先于并发检查，所以并发拒绝也可能消耗分钟预算。并发 slot 一直保持到请求结束并清理释放，不计算运行中的工作流数量。

多个 API 副本须使用同一共享 Redis store/key prefix、同步时钟和一致的已加载配置。增加副本不会扩大共享预算。本地文件缓存只协调具有兼容写权限的进程，不是多节点基准配置。每节点的 worker/query 保持轮询上限是独立控制。[环境变更后应重启相关角色](./server-config-reference.md#how-changes-take-effect)。

```dotenv
DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE=100
DW_NAMESPACE_MAX_CONCURRENT_REQUESTS=8
DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE=150
DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS=10
DW_NAMESPACE_ADMISSION_OVERRIDES='{"payments":{"max_requests_per_minute":200,"max_concurrent_requests":12},"reports":{"max_requests_per_minute":40,"max_concurrent_requests":3}}'
```

对已有命名空间，示例使 `payments` 的有效值为每分钟150个、并发10个，`reports` 为40/3，其他为100/8。覆盖值可提高或降低默认值，但150/10硬上限仍有效。此配置不创建命名空间，也不预留吞吐量。

这些 HTTP 控制未设置时不增加对应限制，但单独设置硬上限仍可限制。null 覆盖值退回默认值。值必须是正整数，0无效。PHP 实现上限为每分钟10000000个请求、并发1024个，与实际 HTTP pool 容量无关。已发布 PHP2.11.0 会将格式错误的 `DW_NAMESPACE_ADMISSION_OVERRIDES` JSON 静默当成空覆盖表，退回全局默认值。部署前应验证 JSON；全局默认值和硬上限都未设置时，预期的命名空间上限会丢失。这一[已确认产品缺陷](https://github.com/durable-workflow/durable-workflow.github.io/issues/335#issuecomment-6369150521)不会由文档更新修复。

| 原因 | HTTP | 重试提示（秒） |
| --- | --- | --- |
| `namespace_request_rate_exhausted` | `429` | 距下一分钟，1〜60 |
| `namespace_request_concurrency_exhausted` | `429` | 1 |
| `namespace_request_admission_unavailable` | `503` | 1 |

JSON `retry_after_seconds` 与 `Retry-After` 头一致。已配置协调不可用或数值上限无效时，以503拒绝。普通请求耗尽后仍可读取命名空间管理员指标；`dw_namespace_request_admission_rejections` 报告有限的原因集合。调用方应使用有限重试/backoff 并保持幂等；传输结果不确定不意味着可以自动重发写请求。另见[超时预算](../deployment.md#worker-long-poll-timeout-budgets)。

## 命名空间持久状态配额 {#namespace-durable-state}

`DW_NAMESPACE_DURABLE_LIMITS` 设置保留行数默认限制，`DW_NAMESPACE_DURABLE_OVERRIDES` 按命名空间覆盖，`DW_NAMESPACE_DURABLE_HARD_LIMITS` 增加不可绕过的硬上限。空对象不增加限制。覆盖值可提高或降低默认值，null 退回默认值。与 HTTP 准入不同，持久配额0有效，会阻止新分配。此例中已有 `payments` 可持有250个开放 run，其他命名空间为100，硬上限为500。

```dotenv
DW_NAMESPACE_DURABLE_LIMITS='{"max_open_workflow_runs":100,"max_open_workflow_run_waits":200,"max_pending_workflow_timers":200}'
DW_NAMESPACE_DURABLE_HARD_LIMITS='{"max_open_workflow_runs":500}'
DW_NAMESPACE_DURABLE_OVERRIDES='{"payments":{"max_open_workflow_runs":250}}'
```

对下列资源使用 `max_<resource>` 字段。行计入自身所属命名空间，或关联工作流/run 的命名空间。保留总数与开放/待处理子集各有独立限制。执行时在命名空间行上串行化变更，以数据库权威计数为准。

| 资源 | 计数范围 |
| --- | --- |
| `workflow_instances`, `workflow_runs` | 所有保留的工作流实例/run 行，包括终态 run。 |
| `open_workflow_runs` | 状态为 `pending`、`running` 或 `waiting` 的 run。 |
| `workflow_history_events`, `workflow_commands`, `workflow_tasks` | 保留的历史、命令和工作流任务行。 |
| `pending_workflow_tasks` | 队列中状态为 `ready` 的工作流任务行；活动租约另有准入控制。 |
| `workflow_timers`, `pending_workflow_timers` | 所有保留 timer，及其中 `pending` 子集。 |
| `workflow_run_waits`, `open_workflow_run_waits` | 所有保留 run wait，及其中 `open` 子集。 |
| `schedules`, `schedule_history_events`, `worker_registrations` | 保留的 schedule、schedule history 和 worker 注册行；过期注册在删除前仍计数。 |
| `workflow_streams`, `workflow_stream_items` | 持久和入站 stream 行及其 item 行。 |

等待子工作流或服务调用的父工作流仍占用自身命名空间的开放 run。子工作流增加自己的 run；同一命名空间应规划两个开放 run 及其 wait/timer。创建工作流的服务操作会在该工作流命名空间消耗行；对已有 run 的 signal/update 不会自动创建第二个 run。服务调用边界和外部 payload 配额是独立控制。

耗尽时返回429 `namespace_<resource>_exhausted`。应读取 `retryable`：部分配额不可重试且不提供等待提示；可重试持久拒绝提示60秒，但不保证届时有容量。无法评估已配置配额时返回503 `namespace_durable_state_quota_unavailable`，提示1秒。保留行数压力可能需要 retention 或容量/配置变更，而不是紧密重试循环。

读取管理员指标时，用请求头选择命名空间。`dw_namespace_durable_state_usage` 及 JSON 字段 `limits`、`usage`、`remaining`、`configuration_status`、`measurement_status` 显示该范围；命名空间是请求范围，而非无界指标标签。测量不可用不表示使用量为0或容量无限。另见[完整配置参考](./server-config-reference.md#namespace-durable-controls)。

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
