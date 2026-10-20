---
sidebar_position: 5
title: Worker 兼容性与路由
description: 将执行中的工作固定到兼容执行器，并明确展示发布缺口，保障 Worker 构建发布安全。
tags:
  - worker-protocol
  - compatibility
  - operations
  - rollouts
keywords:
  - Worker 兼容性
  - Worker 构建发布
  - 兼容性标记
  - 构建 ID 路由
  - 回滚 Worker
---

# Worker 兼容性与路由 {#worker-compatibility-and-routing}

需要部署新的 Worker 构建、对单个任务队列进行金丝雀发布、回滚有问题的构建，或在 Worker 构建发布期间保持长时间运行的工作流存活时，请使用本指南。Durable Workflow v2 将 Worker 兼容性视为路由契约，而不是非正式的部署约定。

核心规则很简单：在某个兼容族下启动的运行，必须持续分配给能够安全重放并执行该运行的 Worker。系统必须把“没有可用的兼容 Worker”显示为明确的运维状态，不能悄悄把任务交给其他构建。

## 两种相关标识 {#two-related-identities}

Durable Workflow 提供两种相关但不同的发布标识：

- **构建 ID** 是独立 Server 面向运维人员的群组标识。它是 Worker 注册的 `build_id` 值，也是任务队列发布 API 排空或恢复的对象。
- **兼容性标记** 是执行中工作的路由标识。在嵌入式和 Server 托管的 PHP Worker 中，它来自 `DW_V2_CURRENT_COMPATIBILITY` 和 `DW_V2_SUPPORTED_COMPATIBILITIES`。在独立 Server 中，构建 ID 群组是运维人员检查和控制这些兼容 Worker 组的方式。

将两个值都视为不透明字符串，例如 `orders-2026-04-28` 或 `api-v3`。Durable Workflow 不解析语义化版本、不比较日期，也不猜测哪个字符串更新。

## 固定的对象 {#what-gets-pinned}

兼容性附着于持久工作流工作，而不仅是活动的 Worker 进程。

- **工作流启动**会在新运行上记录当前兼容族。
- **工作流任务**继承该兼容族，在重试、租约过期和重新派发时保留它。
- **活动任务**继承与父运行相同的兼容族。
- **重试运行**保留来源运行的兼容族。
- **继续为新运行**保留当前运行的兼容族。
- **子工作流**继承父运行的兼容族。

因此，长时间运行的工作流不会仅因部署变化而转到另一执行器族。新构建影响新启动的运行，除非你有意排空旧群组并转移流量。

## 路由如何工作 {#how-routing-works}

兼容性检查在多个层面执行。

### 轮询时缩小范围 {#poll-time-narrowing}

Worker 按任务队列及兼容性/构建群组缩小请求范围，使 Server 或嵌入式引擎能够先避开明显不兼容的任务。

这是效率提示，不是最终的安全边界。

### 认领时强制检查 {#claim-time-enforcement}

认领时的强制检查是正确性边界。如果 Worker 无法安全运行某任务，Durable Workflow 会以明确的兼容性原因拒绝认领，不会悄悄转移所有权。

进行影响兼容性的部署时，应依赖以下契约：

- 不会悄悄扩大任务的可执行范围，将其交给不兼容的 Worker
- 租约过期和重新交付保留原始兼容族
- 缺少兼容 Worker 是可观察状态，不是未定义行为

## 运维人员应配置什么 {#what-operators-should-configure}

对于能够安全重放同一批执行中工作流的构建，请使用稳定、易读的兼容族。

嵌入式或 Server 托管的 PHP Worker 配置如下：

```bash
DW_V2_CURRENT_COMPATIBILITY=orders-2026-04-28
DW_V2_SUPPORTED_COMPATIBILITIES=orders-2026-04-28,orders-2026-04-21
```

`DW_V2_CURRENT_COMPATIBILITY` 指定新运行固定到的兼容族。`DW_V2_SUPPORTED_COMPATIBILITIES` 指定发布或回滚期间此 Worker 仍可认领的兼容族。仅在单构建集群或范围很小的测试环境中使用 `*`，不要用它掩盖不明确的发布策略。

独立 Server 的 Worker 应注册稳定的 `build_id`，并通过构建 ID 发布 API 有意排空或恢复群组。

## 安全发布模式 {#safe-rollout-pattern}

对影响兼容性的 Worker 变更，采用以下顺序：

1. 使用新的构建 ID 或兼容性标记启动新 Worker 群组。
2. 在确认新群组能够认领工作前，保持旧群组运行。
3. 排空旧群组，使其停止接收新任务，但仍可完成或释放已租用的任务。
4. 观察兼容性和任务队列界面，直到不再需要旧群组。
5. 仅在需要回滚时恢复旧群组。

重放兼容的重新构建应保持兼容族稳定。只有当新 Worker 不应再认领旧兼容族创建的任务时，才更改它。

## 明确的缺失 Worker 状态 {#explicit-missing-worker-state}

当没有 Worker 能满足所需兼容族时，Durable Workflow 必须明确显示：

- Worker 集群摘要显示所需兼容性未被覆盖
- 任务队列及发布界面显示哪些构建群组仍活动、正在排空、已失联或已消失
- 工作流诊断指出运行正在等待兼容 Worker
- 运维健康及指标将兼容性阻塞的工作作为具名状况暴露

这是部分发布或未完成回滚期间的预期信号。应把它当作需要修复的真实运维状况，而不是随机的短暂现象。

## 与构建 ID 发布的关系 {#how-this-relates-to-build-id-rollouts}

构建 ID 发布状态与兼容性路由解决不同问题：

- **构建 ID 发布**告诉运维人员哪些 Worker 群组存活，并允许他们有意排空或恢复群组。
- **兼容性路由**决定某个执行中任务是否可以在某个 Worker 上运行。

通常两者一起使用。构建 ID 群组告诉你有哪些可用执行器；兼容性路由确保长时间运行的工作只分配到兼容群组。

## 相关参考 {#related-references}

- [命名空间、认证与 Worker 注册](/docs/polyglot/namespace-auth-workers)：Worker 注册载荷，包括 `build_id`
- [Worker 构建 ID 发布](/docs/polyglot/worker-build-id-rollout)：单个任务队列的排空/恢复生命周期
- [Server 配置参考](/docs/polyglot/server-config-reference)：`DW_V2_CURRENT_COMPATIBILITY`、`DW_V2_SUPPORTED_COMPATIBILITIES` 及相关配置
- [运维操作边界](/docs/operator-operating-envelope)：展示兼容性缺口的健康、指标及运行诊断
