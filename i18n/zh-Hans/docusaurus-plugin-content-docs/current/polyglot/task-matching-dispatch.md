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
