---
sidebar_position: 6
title: 任务匹配与派发
description: 了解 Durable Workflow 如何将就绪的持久任务分配给 Worker，从长轮询唤醒到专用匹配角色部署。
tags:
  - worker-protocol
  - task-queues
  - operations
  - dispatch
keywords:
  - 任务匹配
  - 任务派发
  - 匹配角色
  - 就绪任务发现
  - 队列唤醒
---

# 任务匹配与派发 {#task-matching-and-dispatch}

本指南解释 Durable Workflow 如何发现就绪工作、将其分配给兼容 Worker，以及如何扩展这条分配路径，避免每个节点都轮询所有内容。工作流任务轮询、活动任务轮询、队列唤醒行为和专用匹配角色部署都遵循此契约。

核心思想是将两项职责分开：

- 持久历史和任务状态保留在数据库中
- 任务匹配决定由哪个在线 Worker 获得下一个符合条件的任务

即使尚未引入独立匹配服务，这种划分也有价值。运维人员可以将就绪任务发现、队列归属、租约频繁变动和背压视为一个明确角色的职责，而非各个 Worker 进程附带产生的行为。

## 匹配角色的职责 {#what-the-matching-role-does}

匹配角色负责：

- 发现就绪的工作流和活动任务
- 按命名空间、连接、队列和兼容族缩小符合条件的任务集合
- 一次向一个 Worker 提供任务
- 将成功认领转换为有过期时间的租约
- 在认领失败、租约过期或 Worker 消失时保留同一个任务
- 向运维人员展示唤醒和积压状态

匹配不替代持久历史、工作流重放或任务执行。它决定谁获得下一次执行机会。

## 部署形态 {#deployment-shapes}

Durable Workflow 目前支持三种实际部署形态：

### Worker 内匹配 {#in-worker-matching}

这是默认形态。Worker 进程通过长轮询获取就绪工作，并使用认领时的隔离保护，确保一次只有一个 Worker 持有任务租约。

适用于：

- 单节点或小型 Worker 集群
- 队列压力适中
- 暂时不需要专用匹配守护进程

### Server 内 HTTP 匹配 {#in-server-http-matching}

在独立 Server 部署中，外部 Worker 通过 Worker 协议使用相同的匹配契约：

- `POST /api/worker/workflow-tasks/poll`
- `POST /api/worker/activity-tasks/poll`

服务器成为相同就绪任务发现、认领、心跳和完成流程的网络入口。

### 专用匹配角色部署 {#dedicated-matching-role-deployment}

较大的 Worker 集群可以将大范围就绪任务发现集中到专用匹配角色进程。目前文档规定的操作方式是：

```bash
php artisan workflow:v2:repair-pass --loop
```

在专用进程中运行该守护进程，并在仅执行任务的节点上设置 `DW_V2_MATCHING_ROLE_QUEUE_WAKE=0`，使其不再在每次循环时执行大范围队列 Worker 唤醒。

适用于：

- 执行节点需要专注于重放和活动执行
- 各节点独立进行大范围轮询导致不必要的争用
- 运维人员需要明确由谁负责就绪任务发现和扫描频率

专用角色改变匹配发生的位置，不改变 Worker 协议契约。轮询、认领、租约和重新投递语义保持一致。

## 就绪任务发现 {#ready-task-discovery}

匹配角色寻找当前真正可以运行的持久任务：

- 任务种类与轮询方匹配，为 `workflow` 或 `activity`
- 任务处于 `ready` 状态
- 任务的 `available_at` 时间已到
- 命名空间、队列、连接和兼容性过滤条件仍然匹配
- 活动轮询还要求 Worker 声明支持匹配的活动类型

长轮询唤醒是加速路径，正确性由持久轮询保证。如果唤醒信号延迟或缺失，持久轮询仍能发现任务。唤醒失败应只增加延迟，不应使工作搁置。

## 认领、租约与背压 {#claim-lease-and-backpressure}

匹配只提供执行机会。只有 Worker 成功认领任务并获得租约后，才开始拥有该任务。

租约为 Durable Workflow 提供以下背压行为：

- 一个 Worker 持有任务，直到租约续期、任务完成、释放或租约过期
- 失败或失联的 Worker 不会永久困住任务
- 重新投递是正常行为，必须按至少一次执行的一部分处理
- 不兼容的 Worker 无法夺取租约，而是收到明确拒绝

由于工作基于租约，队列压力会表现为积压、过期租约或反复重新投递，不会隐藏为内存中的任务丢失。

## 队列分区 {#queue-partitioning}

主要分区基础如下：

- **命名空间**界定租户或环境边界
- **连接**和**队列**界定工作路由边界
- **兼容族**保障兼容性标记路由安全
- **活动类型过滤器**适用于仅执行指定活动的 Worker

需要更强隔离、独立 Worker 池或不同下游预算时，使用不同队列。同一队列需要在发布或回滚期间保持可用，同时避免执行中的工作转移到不兼容执行器时，使用兼容族。

## 已记录的活动队列 {#recorded-activity-queues}

活动解析后的连接和队列在调度时保存。修改活动类、`ActivityOptions`、PHP SDK 活动选项或 Python 的 `schedule_activity(..., queue=...)`，只影响新调度的活动。现有执行在重试和修复时仍保留已记录的队列。工作器注册到新队列不会移动旧任务。现有工作流运行也保留自己的工作流队列。

### 在重叠运行窗口内切换路由 {#change-recorded-routing}

1. 在正确的命名空间中启动新队列的工作器。确认其活动类型、正数的活动槽位和构建兼容性。保留旧的工作流池和活动池。
2. 为新任务部署新路由。为现有运行保留兼容代码，并遵守其固定构建。新队列并不等于迁移已记录的执行。
3. 检查受影响的运行和两个队列。核实待处理及已租用的活动、未来可重试的任务、被动等待的未结束运行、子工作流，以及仍依赖旧工作器的延续链。就绪任务数为零并不能涵盖这些依赖。
4. 只有在核实依赖且阻止新任务继续创建这些依赖后，才能退役旧工作器。当前快照不是原子的退役保护。如果无法确认，就应继续保留旧池。[Server #519](https://github.com/durable-workflow/server/issues/519) 负责带保护的依赖清单与退役能力。

### 检查并恢复滞留任务 {#recorded-queue-diagnostics}

使用操作员凭据和受影响运行所在的命名空间。显式设置源站、命名空间、旧队列及选定的工作流 ID 和运行 ID：

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

当服务端准入可用且未被节流，并且队列上没有活跃且未过期的工作器注册时，队列可见性返回 `admission.activity_tasks.status: no_active_workers`。运行调试响应包含 `pending_activities[].queue`、`activity_task_queues`，以及 `pending_activity_queue_without_active_pollers` 等诊断。如果存在工作器但未声明所需的活动类型，请检查 `pending_activity_type_unsupported`。仅有注册不能证明工作器正在推进任务。

调试响应只是单个运行的有限快照，并非完整的队列清单，最多包含 25 个待处理活动。队列计数和空快照无法证明并发或未来任务不再依赖旧池。

在期限到达前，将具有所需活动类型和可用槽位的兼容工作器恢复到**已记录**的队列。修复任务或重启工作器不会改变该队列，也不会延长原始总期限。如果不再需要这项工作，应明确取消相应运行，并核对外部影响。不要通过编辑已存储的队列字段来执行迁移。

有限的 schedule-to-start 超时可能在活动等待工作器期间到期。Schedule-to-close 限制整个活动执行，包括重试等待时间。这些限制只在配置后生效。执行期限不会将活动迁移到可用队列；恢复工作器也不会复活已因超时进入终态的活动。请参阅[活动和工作流超时](../features/timeouts.md)。

## 唤醒信号与专用扫描 {#wake-signals-and-dedicated-sweeps}

唤醒信号缩短任务就绪到轮询方发现任务之间的时间。它不是持久事实的权威来源。

默认形态中，队列 Worker 可以在正常循环内发出唤醒信号。专用匹配角色部署中，仅执行任务的节点禁用大范围唤醒路径，由匹配守护进程负责扫描频率。

以下配置用于调优：

- `DW_V2_MATCHING_ROLE_QUEUE_WAKE` 控制执行节点是否在 Worker 内执行唤醒
- `DW_WAKE_SIGNAL_TTL_SECONDS` 控制唤醒标记保持可见的时间
- 长轮询超时设置控制轮询方暂停等待工作的时长

## 运维人员应观察什么 {#what-operators-should-watch}

结合使用以下接口：

- `GET /api/cluster/info` 提供各节点角色拓扑：`current_shape`、`current_process_class`、当前角色，以及完整的 `matching_role` 契约，包括 `queue_wake_enabled`、部署 `shape`、`wake_owner`、`task_dispatch_mode`、固定的 `partition_primitives` 和当前 `backpressure_model`
- 任务队列可见性提供就绪深度、活动执行槽和限流状态
- Worker 集群可见性显示每个队列中活动与失联的轮询方
- `dw system:operator-metrics --json` 或 `/api/system/operator-metrics` 提供相同的节点本地 `matching_role` 契约，以及响应进程的实时积压、修复、Worker 和健康计数器
- 健康与 Waterline 诊断显示异常任务、过期租约和兼容 Worker 缺口
- 滚动升级重叠窗口期间，匹配必须阻止不安全的认领，此时应观察滚动升级检查

兼容 Worker 可用时，如果最早就绪任务的等待时间持续增长，说明匹配路径推进不够快。如果就绪任务仍被保留，但没有兼容 Worker 可以认领，则属于兼容性问题，而非匹配导致任务丢失。

## 何时引入专用匹配角色 {#when-to-introduce-a-dedicated-matching-role}

以下情况适合从默认的 Worker 内匹配改为专用匹配角色：

- 大范围轮询造成可观察的数据库或缓存争用
- 执行节点需要停止承担就绪任务扫描的开销
- 需要把队列公平性和派发职责作为一个明确子系统来分析
- 运维人员希望使用独立进程扩容、监督和调试就绪任务发现

当前 Worker 集群较小，主要需求是明确发布与兼容性行为时，保留默认形态，无需引入新拓扑。

## 相关参考 {#related-references}

- [Worker 协议](/docs/polyglot/worker-protocol)：轮询、心跳、完成和失败操作
- [任务队列准入](/docs/polyglot/task-queue-admission)：匹配之上的执行槽、租约和派发预算
- [滚动升级](/docs/rolling-upgrades)：同时涉及匹配与兼容性时的发布流程
- [Server 配置参考](/docs/polyglot/server-config-reference)：`DW_V2_MATCHING_ROLE_QUEUE_WAKE`、轮询时序和唤醒信号设置
