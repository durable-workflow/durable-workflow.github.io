---
sidebar_position: 2
title: "幂等性与确定性"
sidebar_label: 幂等性与确定性
description: 在 Durable Workflow 2.0 中，确定性确保编排可安全重放，幂等性确保重试活动的副作用安全。
slug: /constraints/idempotent-vs-deterministic
canonical_path: /docs/constraints/idempotent-vs-deterministic/
image: /img/idempotent-vs-deterministic.png
tags:
  - constraints
  - determinism
  - idempotency
  - replay
keywords:
  - 幂等与确定
  - 幂等性与确定性
  - 确定性与幂等性
  - 确定性工作流
  - 幂等活动
---

# 幂等工作流与确定性工作流：有何区别？ {#idempotent-vs-deterministic-workflows-whats-the-difference}

**确定性行为在输入和历史相同时作出相同的决策。幂等行为无论执行一次还是多次，都会产生相同的预期效果。** 确定性使单次执行可预测；幂等性使重复执行安全。具备其中一种属性并不意味着具备另一种。

| 问题 | 确定性 | 幂等性 |
| --- | --- | --- |
| 什么保持不变？ | 基于相同输入和历史作出的决策 | 调用一次或多次后的预期外部效果 |
| Durable Workflow 为何需要它？ | 重放必须重建相同的工作流路径 | 重试和重新投递不得产生重复副作用 |
| 应用在哪一层？ | 工作流和编排代码 | 活动及其调用的系统 |
| 是否禁止 IO 或随机性？ | 是，在重放的工作流代码内禁止，除非记录了结果 | 否，活动可以使用 IO、时间或随机性，同时让效果可安全重复 |

## 两种属性相互独立 {#the-properties-are-independent}

### 确定但不幂等 {#deterministic-but-not-idempotent}

考虑一个递增计数器的操作：

```text
increment(counter):
    counter.value = counter.value + 1
```

初始计数值相同时，该操作始终进行相同的计算，因此它具有确定性。但它不具有幂等性：调用两次会递增两次，调用一次只会递增一次。

### 幂等但不确定 {#idempotent-but-not-deterministic}

再考虑一个将订单设为已知状态的活动，它在联系服务时采用随机退避：

```text
archive(order_id):
    wait(random_backoff())
    PUT /orders/{order_id}/status {"status": "archived"}
```

内部尝试的时机和次数可能不同，因此该实现不具有确定性。但操作仍可具有幂等性：成功调用一次或多次后，订单都处于已归档状态。响应、延迟和内部路径无需完全相同；需要相同的是预期的外部效果。

## 工作流代码为何必须具有确定性 {#why-workflow-code-must-be-deterministic}

Durable Workflow 通过重放已提交的历史重建编排状态。工作流输入和历史相同时，工作流代码必须按相同顺序安排相同的活动、定时器和等待。在工作流主体内读取系统时钟、使用随机值、实时查询数据库或读取网络响应，都可能在重放时选择不同的分支，使新决策与历史不一致。

将这些操作移入活动，或使用会把值记录到历史中的工作流辅助函数。这样，重放会返回已记录的活动或副作用结果，无需再次执行外部操作。确定性并不要求每次活动调用都给出永远相同的答案，而是要求重放的编排作出的决策与已记录历史一致。

编写规则见[工作流约束](./workflow-constraints.md)，重放模型见[工作原理](../how-it-works.md)。

Rust 的 `HashMap`、时钟、随机数和 future 顺序规则，参见[持久替代方式](../polyglot/rust.md#rust-determinism-rules)。Rust SDK 4.5.0 新增[无需 Server 的活动/工作流测试和已记录历史重放](../polyglot/rust.md#offline-testing-and-replay)；对于文档列出的执行限制，仍应保留集成测试。

## 活动和副作用为何必须具有幂等性 {#why-activities-and-side-effects-must-be-idempotent}

活动跨越持久边界，访问数据库、支付 API、邮件服务商、对象存储和其他系统。超时、重试、Worker 故障或租约过期后，活动可能被再次投递。Worker 甚至可能完成外部变更后，在 Durable Workflow 收到其报告前发生故障。

设计活动的预期效果，使再次尝试也安全：

- 向远程 API 发送稳定的幂等键
- 按持久的业务标识或执行标识进行 upsert
- 写入名称确定的对象或资源
- 使用设置值或删除已知资源等天然幂等的操作

幂等键不会使活动代码具有确定性，也不会阻止另一次尝试启动。它使外部系统能够识别多次尝试代表的是同一逻辑操作。

重试、重新投递和持久历史的契约见[活动约束](./activity-constraints.md)、[活动执行模型](../features/activity-execution-model.md)和[执行保证与幂等性](./execution-guarantees.md)。

## 所有 SDK 共享同一边界 {#one-boundary-across-every-sdk}

无论 Worker 使用 PHP、Python 还是 Rust 编写，都遵循相同设计：

1. 保持编排可安全重放：输入和历史相同时，发出相同的持久命令。
2. 将网络调用、时钟、随机性和可变外部状态置于活动边界之后。
3. 为每个有副作用的活动提供稳定标识，让目标系统能够去重。

语言语法可以不同，确定性与幂等性的边界保持一致。
