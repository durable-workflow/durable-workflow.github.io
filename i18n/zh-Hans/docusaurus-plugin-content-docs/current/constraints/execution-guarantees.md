---
sidebar_position: 3.5
title: 执行保证与幂等性
description: v2 关于重放、重试、租约过期、重新投递和默认幂等标识的公开契约。
tags:
  - constraints
  - idempotency
  - retries
  - replay
keywords:
  - 执行保证
  - 幂等性
  - 重放
  - 重新投递
  - 租约过期
  - 至少一次
  - 恰好一次
---

# 执行保证与幂等性 {#execution-guarantees-and-idempotency}

Durable Workflow v2 为**工作流重放**和**活动执行**规定不同的语义：

- 工作流代码从已提交的历史重放，必须保持确定性。
- 活动代码执行副作用，遵循**至少一次**语义。
- 即使传输层多次投递工作，持久历史层也只为同一持久标识记录一次已提交的工作流或活动结果。

这些保证让引擎能够在 Worker 重启、租约过期、队列重新投递和滚动部署后，保留运行进度。

## 重放不是重试 {#replay-is-not-retry}

工作流任务通过重放已提交的历史重建状态，再决定下一步。重放会重新调用工作流方法，但**不会**重新执行活动、再次发送信号，或重复已经记录在历史中的副作用。

因此，工作流代码必须保持确定性。需要跨越持久边界时，使用工作流安全的工具，例如 [`Workflow::now()`](../defining-workflows/workflow-api.md)、[`sideEffect(...)`](../features/side-effects.md)、查询、更新、活动结果、memo 和搜索属性。

## 活动执行遵循至少一次语义 {#activity-execution-is-at-least-once}

活动负责执行副作用，其契约如下：

- 一次活动尝试可能被多次认领。
- 租约过期可能导致任务被重新投递给另一个 Worker。
- Worker 可能完成外部操作后丢失租约，随后才提交报告。
- 重试会为同一逻辑活动执行安排新的持久尝试。

重复观察是系统预期的行为。应用作者必须让活动方法或它调用的远程系统能够安全重复执行。

编写规则见[活动约束](./activity-constraints.md)，面向运维的恢复行为见[故障与恢复](../failures-and-recovery.md)。

## 哪些操作保证恰好一次 {#what-is-exactly-once}

Durable Workflow 不保证 Worker 进程只看到一次有副作用的工作。它保证已提交的持久事实具有权威性，同一持久标识不会产生重复记录。

具体而言：

- 已提交的工作流决策，在类型化历史中按相应持久命令或步骤 ID 保存一次。
- 一次活动尝试已提交的终态结果，按 `activity_attempt_id` 保存一次。
- 重放读取这些已提交的事实来重建工作流状态，不重新执行外部操作。

可以用以下两条理解整个模型：

- **传输与 Worker 遵循至少一次语义。**
- **已提交的持久历史对同一持久标识保证恰好一次。**

## 租约过期与重新投递 {#lease-expiry-and-redelivery}

租约过期是分布式系统正常的恢复路径：

- 已认领的任务包含租约持有者和过期时间。
- 如果 Worker 报告进度或完成前租约已过期，任务就可以被重新投递。
- 另一个 Worker 随后可以认领同一逻辑工作。

重新投递表示引擎正在从 Worker 或传输层的不确定状态中恢复。已提交的事实仍然有效。

遇到重复执行的迹象时，分别检查两个问题：

1. 外部副作用是否发生了多次？
2. 同一持久标识是否记录了多个已提交结果？

第一个问题需要通过幂等活动设计解决。第二个问题由引擎的契约保证。

## 默认幂等标识 {#default-idempotency-surfaces}

以下标识提供稳定的去重依据：

| 标识 | 标识的对象 | 常见用途 |
| --- | --- | --- |
| `workflow_instance_id` | 一个公开的工作流实例 | 处理重复启动，以及业务层的工作流标识 |
| `workflow_run_id` | 一次具体的持久运行 | 为查询、导出或诊断固定所选运行 |
| `workflow_command_id` | 一个修改状态的外部命令 | 客户端重试请求时去重 |
| `activity_execution_id` | 跨重试的同一逻辑活动执行 | 外部副作用的默认远程幂等键 |
| `activity_attempt_id` | 该活动的一次具体尝试 | 远程系统必须区分尝试时的关联标识 |
| `schedule_id` | 一项调度定义 | 调度归属和触发标识去重 |
| 消息流 `idempotencyKey` | 重试发送的同一逻辑消息 | 发送方重试时避免重复接收消息 |

默认使用 `activity_execution_id` 作为外部操作的幂等键。只有外部目标确实需要区分每次重试时，才使用 `activity_attempt_id`。

```php
use Workflow\V2\Activity;

final class ChargeCard extends Activity
{
    public function handle(array $payload): string
    {
        return app(PaymentGateway::class)->charge(
            $payload,
            idempotencyKey: $this->activityId(),
            attemptCorrelation: $this->attemptId(),
        );
    }
}
```

## 开发者需要保证哪些操作幂等 {#what-developers-must-make-idempotent}

框架从已提交历史重建状态，负责工作流重放。

应用需要让外部副作用能够安全重复执行，包括：

- 支付或计费调用
- 邮件、短信和 Webhook
- 写入其他数据库或服务
- 文件创建或上传
- 任何在工作流历史之外创建或修改状态的命令

常见做法：

- 向远程 API 传入幂等键。
- 写入确定的目标资源，例如已知的对象键。
- 使用以持久标识为键的 upsert 或事务。
- 使操作本身可重复执行，第二次调用不产生新的效果。

## 运维指导 {#operator-guidance}

在 Waterline、CLI 或 Server 日志中诊断运行时：

- 租约过期后重复观察活动是预期情况，应查看持久尝试结果确认实际状态。
- 迟到的完成或失败报告是引擎需要解决的竞争，不能据此判断外部副作用没有发生。
- 工作流任务重放是恢复机制。
- 缺少兼容 Worker、租约停滞或反复修复都是需要调查的运维信号，不能据此认定工作流应重新执行外部副作用。

运维人员需要区分**传输层的不确定性**与**持久结果**。Durable Workflow 展示这两类信息，帮助你作出判断。

## 相关指南 {#related-guides}

- [约束概览](./overview.md)介绍工作流与活动的职责划分。
- [工作流约束](./workflow-constraints.md)介绍确定性编写规则。
- [活动约束](./activity-constraints.md)介绍副作用安全和幂等技术。
- [故障与恢复](../failures-and-recovery.md)介绍重试、超时执行和修复。
- [活动执行模型](../features/activity-execution-model.md)说明队列活动、本地活动、Worker 会话和粘性执行如何协作。
- [本地活动](../features/local-activities.md)介绍同进程活动尝试、工作流任务心跳、重试和冷重放。
- [粘性执行](../features/sticky-execution.md)介绍重放缓存，以及冷重放为何始终是正确性的后备路径。
