---
sidebar_position: 5
title: Worker 兼容性与路由
description: 提升新启动、检查兼容 Worker 缺失时，保留原始运行的构建固定关系。
tags: [worker-protocol, compatibility, operations, rollouts]
keywords: [Worker 兼容性, 构建发布, 兼容性标记, 构建路由, 回滚]
---

# Worker 兼容性与路由

兼容性是一项路由契约。改变新工作流使用的构建时，仍需保留能够回放已有历史的 Worker。排空不会把原有运行转移到其他构建。

## 两个相关身份 {#two-related-identities}

- **构建 ID** 是独立 Server 群组注册的 `build_id`，范围为命名空间和任务队列。提升、排空和恢复都作用于该群组。
- **兼容性标记** 记录在持久工作中。嵌入式 PHP 使用 `DW_V2_CURRENT_COMPATIBILITY` 和 `DW_V2_SUPPORTED_COMPATIBILITIES`；独立 Worker 的构建 ID 提供对应的路由身份。

将身份视为不透明字符串。看起来更新的名称不能证明回放兼容性，也不授权修改已有运行的固定关系。

## 哪些内容会固定 {#what-gets-pinned}

独立 Server 首先按显式提升选择新启动的固定构建，然后使用单一活跃群组的回退规则。选择有歧义时，运行可能不固定构建。参见[选择顺序](/docs/polyglot/worker-build-id-rollout#canary-a-new-build)。

工作流任务和活动继承运行的兼容性。任务重试、租约过期和重新投递都会保留它。重试运行、子工作流和 continue-as-new 也继承原始固定关系。提升只影响后续新实例，不会把延续链迁移到新构建。

## 路由如何工作 {#how-routing-works}

### poll 阶段的范围收窄 {#poll-time-narrowing}

Worker 请求命名空间、队列和兼容构建群组。poll 选择避免提供不兼容任务，但不是最终权限边界。

### 领取阶段的检查 {#claim-time-enforcement}

领取会检查任务的原始兼容性和 Worker 身份。其他构建缺失时，不兼容 Worker 仍不能取得租约。租约到期也不会扩大兼容范围。

## 运营者应配置什么 {#what-operators-should-configure}

嵌入式 PHP 应设置当前及显式支持的兼容系列：

```bash
DW_V2_CURRENT_COMPATIBILITY=orders-2026-04-28
DW_V2_SUPPORTED_COMPATIBILITIES=orders-2026-04-28,orders-2026-04-21
```

第一个值固定新的嵌入式运行，第二个允许领取对应系列的任务。只有在明确验证过兼容策略后才使用 `*`。独立 Worker 应注册稳定的 `build_id`，并使用 Server 的提升和生命周期控制。在可兼容回放的重新构建间保持系列不变；更换标签不会使不兼容代码变得可安全回放。

## 安全发布流程 {#safe-rollout-pattern}

1. 部署并检查新群组的命名空间、队列、支持类型和新鲜注册，同时保持旧群组可用。
2. 显式提升后续新启动应使用的构建。Worker 数量并不定义百分比分流。
3. 为已有固定运行保留兼容容量，包括等待定时器、信号、活动或子工作流的被动运行。
4. 只有在确实要停止该群组领取新任务时才排空。若过早排空导致工作停滞，恢复群组及原始兼容构建。
5. 回滚新启动时，恢复已知正常群组并提升它，然后回滚问题部署。已有固定关系保持不变。

待处理工作流任务为零并不能证明安全退役。只要固定运行或继承链可能需要，就保留构建产物和恢复途径。[Server #519](https://github.com/durable-workflow/server/issues/519)跟踪独立的保护式退役能力，本清单并未交付该能力。

## 兼容 Worker 缺失的明确状态 {#explicit-missing-worker-state}

应同时检查[按群组统计的待处理任务](/docs/polyglot/worker-build-id-rollout#pending-workflow-tasks-by-cohort)、新鲜／排空／过期注册和原始固定关系。`no_compatible_worker` 表示非 null 构建存在待处理工作流工作，却没有活跃兼容 Worker。它不统计活动队列或所有被动固定运行。缺失字段、失败请求或过期心跳不等于空集群或零积压。增加无关 Worker 前，先恢复对应构建，或检查其队列、命名空间和类型声明。

## 与构建 ID 发布的关系 {#how-this-relates-to-build-id-rollouts}

发布状态描述已注册容量及新启动／生命周期意图；兼容性决定具体原始任务能否被领取。两者应结合使用。排空和回滚都不会改写持久兼容性，也不能证明构建可以删除。

## 相关参考 {#related-references}

- [命名空间、认证与 Worker 注册](/docs/polyglot/namespace-auth-workers)
- [Worker 构建 ID 发布](/docs/polyglot/worker-build-id-rollout)
- [Server 配置参考](/docs/polyglot/server-config-reference)
- [运营边界](/docs/operator-operating-envelope)
