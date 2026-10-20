---
sidebar_position: 2
title: 活动
description: 定义活动类，处理非确定性副作用、重试、路由和逐调用选项。
tags:
  - authoring
  - activities
  - retries
keywords:
  - 持久工作流活动类
  - 活动选项
  - 非确定性副作用
---

# 活动 {#activities}

活动是执行特定任务或操作的工作单元，例如发起 API 请求、处理数据或发送邮件，可由工作流执行。

:::note 持久执行契约
普通 v2 活动作为持久队列任务运行。本地活动是显式的同进程原语，适用于短时活动工作，仍会记录持久活动历史。多个持久活动步骤需要同一 Worker 租约时，可使用 Worker 会话。粘性执行是受支持的重放优化，不是正确性契约。准确契约见[活动执行模型](/docs/features/activity-execution-model)、[本地活动](/docs/features/local-activities)、[Worker 会话](/docs/features/worker-sessions)和[粘性执行](/docs/features/sticky-execution)。
:::

可使用 Artisan 命令 `make:activity` 创建新活动：

```php
php artisan make:activity MyActivity --v2
```

继承 `Activity` 类并实现 `handle()` 方法来定义活动。

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle()
    {
        // Perform some work...
        return $result;
    }
}
```

## 执行契约 {#execution-contract}

每次 `activity(...)` 调用都会在工作流历史中记录活动命令，并创建供 Worker 认领的持久队列任务。普通活动可由任何兼容 Worker 认领；工作流显式选择 [Worker 会话](/docs/features/worker-sessions)契约时，可将一系列活动尝试固定到同一 Worker 会话租约。

如果只需要可安全重放的值，无需调度队列工作，请使用 [`sideEffect(...)`](/docs/features/side-effects)。如果需要短时、可重试且具有超时、心跳和活动历史语义的同进程活动，请使用[本地活动](/docs/features/local-activities)。完整的放置模型见[活动执行模型](/docs/features/activity-execution-model)，粘性重放缓存行为见[粘性执行](/docs/features/sticky-execution)。

## 幂等性与持久标识 {#idempotency-and-durable-identity}

活动执行遵循至少一次语义。重试、租约过期和重新投递可能使同一逻辑活动被观察多次，因此副作用或远程目标必须可安全重复执行。

活动内部需要关联标识或远程去重时，请使用运行时的持久标识：

- `activityId()` 标识跨重试的同一次逻辑活动执行，是默认的远程幂等键。
- `attemptId()` 标识该执行的一次具体尝试。
- `attemptCount()` 表示当前正在运行第几次尝试。

远程系统应将重试视为同一逻辑请求时，优先使用 `activityId()`。只有远程系统确实需要区分不同尝试时，才使用 `attemptId()`。如果 Worker 完成远程工作、丢失租约后迟报结果，引擎可能因为其他 Worker 已提交胜出的持久结果而拒绝迟到的完成报告，但远程副作用可能已经发生。

这些标识背后的运维模型见[执行保证与幂等性](/docs/constraints/execution-guarantees)、[心跳](/docs/features/heartbeats)和[故障与恢复](/docs/failures-and-recovery)。

## 逐调用覆盖 {#per-call-overrides}

路由和重试默认使用活动类自身的 `$connection`、`$queue`、`$tries` 和 `backoff()` 设置。单次调用需要覆盖这些设置时，例如将一次调用路由到高优先级队列或增加重试次数，请传入 `ActivityOptions` 实例：

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    MyActivity::class,
    new ActivityOptions(queue: 'high-priority', maxAttempts: 5),
    'Taylor',
);
```

包含超时和心跳在内的完整字段列表见[活动选项](/docs/configuration/options#activityoptions)。

## 本地活动调用 {#local-activity-calls}

短时幂等副作用需要在当前工作流 Worker 进程内运行，同时仍需活动重试、超时、心跳、取消和历史语义时，使用 `localActivity(...)`：

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

本地活动不创建普通活动任务，因此会拒绝 `connection`、`queue`、Worker 会话路由和 schedule-to-start 选项。完整契约见[本地活动](/docs/features/local-activities)。
