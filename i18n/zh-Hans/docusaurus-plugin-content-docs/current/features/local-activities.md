---
sidebar_position: 23
title: 本地活动
description: 在当前工作流 Worker 进程中运行短时活动，保留持久活动历史、重试、超时和可见性。
tags:
  - activities
  - workers
  - execution
keywords:
  - 本地活动
  - localActivity
  - executeLocalActivity
  - 同进程活动
  - 工作流任务心跳
---

# 本地活动 {#local-activities}

本地活动是 v2 的短时活动工作原语，在当前执行工作流任务的 Worker 进程内运行。它保留活动重试、超时、心跳、取消、历史和运维可见性语义，但绕过普通活动任务入队。

工作延迟低、具有幂等性且适合由工作流 Worker 自身执行时，使用本地活动。需要独立 Worker 扩缩容、队列路由、长时间执行或独立活动任务租约时，使用普通队列活动。

## 契约概要 {#contract-summary}

- `localActivity(...)` 和 `Workflow::localActivity(...)` 在与当前工作流任务相同的进程内执行活动类。
- 运行时创建 `activity_executions` 行及带有 `execution_mode=local` 和 `local_activity=true` 标记的普通活动历史事件。
- 不创建普通 `TaskType::Activity` 任务，因此拒绝 `connection`、`queue`、Worker 会话和 schedule-to-start 路由选项。
- 本地尝试持有工作流任务租约。活动 `heartbeat()` 续租该工作流任务并记录 `ActivityHeartbeatRecorded`。
- 重试是带退避的持久工作流任务，不是隐藏的循环重试。
- 冷重放读取已提交活动历史。Worker 丢失后，已开始的本地尝试若没有终态事件，下一次尝试会记录 `retry_reason=cold_replay`。
- 运行详情、历史导出、时间线和运维指标会将本地尝试与普通队列尝试分开展示。

## 编写 API {#authoring-api}

使用命名空间辅助函数：

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(
        maxAttempts: 3,
        startToCloseTimeout: 10,
        scheduleToCloseTimeout: 30,
        heartbeatTimeout: 5,
    ),
    $orderId,
);
```

或使用工作流静态门面：

```php
use Workflow\V2\Workflow;

$receipt = Workflow::localActivity(SendReceiptActivity::class, $orderId);
$receipt = Workflow::executeLocalActivity(SendReceiptActivity::class, $orderId);
```

`LocalActivityOptions` 接受重试和超时字段：

- `maxAttempts`
- `backoff`
- `startToCloseTimeout`
- `scheduleToCloseTimeout`
- `heartbeatTimeout`
- `nonRetryableErrorTypes`

本地活动不进入普通任务匹配，因此拒绝 `connection`、`queue`、Worker 会话路由和 `scheduleToStartTimeout`。

## 执行与历史 {#execution-and-history}

工作流重放到达本地活动时，当前工作流任务会：

1. 创建带 `activity_options.execution_mode=local` 的活动执行；
2. 记录带本地标记的 `ActivityScheduled` 和 `ActivityStarted`；
3. 在工作流 Worker 进程中实例化并运行活动类；
4. 记录 `ActivityCompleted`、`ActivityFailed`、`ActivityTimedOut` 或 `ActivityCancelled`；
5. 从已记录的活动事件恢复工作流代码。

重放不重新运行已完成的本地活动。查询重放和冷重放读取与普通活动相同的活动历史事件。

## 心跳 {#heartbeats}

本地活动不持有活动任务租约，而是持有当前执行工作流的工作流任务租约。尝试开始时，运行时续租工作流任务。活动代码调用 `$this->heartbeat()` 时，运行时记录进度、更新活动尝试，并续租工作流任务。

长时间运行的本地活动必须足够频繁地发送心跳，同时满足本地活动心跳超时和工作流任务租约的要求：

```php
use Workflow\V2\Activity;

final class PollShortJobActivity extends Activity
{
    public function handle(string $jobId): array
    {
        $state = $this->fetch($jobId);

        $this->heartbeat([
            'message' => 'Polling remote job',
            'job_id' => $jobId,
            'state' => $state['status'],
        ]);

        return $state;
    }
}
```

## 超时与重试 {#timeouts-and-retries}

`startToCloseTimeout` 限制单次尝试。`scheduleToCloseTimeout` 限制跨重试的整个本地执行。`heartbeatTimeout` 限制已记录本地活动心跳之间的间隔。

发生可重试故障或超时时，运行时记录 `ActivityRetryScheduled`，并创建在重试退避后可用的工作流任务。该重试任务重放工作流历史，到达同一本地活动序列，并开始下一次本地尝试。

每次本地尝试都是新的 `activity_attempts` 行。重试将 `retry_reason` 记录为 `failure`、`timeout` 或 `cold_replay`。

## 取消与 Worker 丢失 {#cancellation-and-worker-loss}

取消采用协作方式。本地活动在心跳、超时检查和尝试完成边界观察取消。已取消的本地尝试记录带本地标记的 `ActivityCancelled`。

Worker 在提交本地活动终态事件前退出时，工作流任务租约会过期，普通任务修复重新认领工作流任务。冷重放随后读取已提交历史。如果历史包含已开始但没有终态事件的本地尝试，运行时以 `retry_reason=cold_replay` 调度重试。

## 可见性 {#visibility}

运维人员可在所有报告活动状态的位置区分本地活动：

- 历史载荷包含 `execution_mode=local` 和 `local_activity=true`；
- `activity_executions.activity_options.execution_mode` 为 `local`；
- 运行详情和历史导出包含 `execution_mode` 和 `local_activity`；
- 运维指标提供 `activities.local`、`activities.local_open`、`activities.local_attempts` 及队列活动与本地活动的计数。

运行时清单发布在 `GET /api/cluster/info` 的 `worker_protocol.server_capabilities.local_activities`。机器可读契约为 [`local-activity-runtime.schema.json`](/platform-protocol-specs/local-activity-runtime.schema.json)，并在[平台协议规范](/docs/platform-protocol-specs#local-activity-runtime-notes)目录中建立索引。

事件名仍使用普通活动事件名称，使时间线和重放工具保持顺序，无需另建事件系列。

## 选择合适的原语 {#choosing-the-right-primitive}

短时、可重试、幂等的副作用最适合由工作流 Worker 进程执行，且不需要队列路由时，使用本地活动。

远程调用、缓慢 I/O、CPU 密集工作、专用 Worker 集群、背压，或工作流 Worker 丢失后仍应通过独立租约活动任务继续推进的工作，使用普通[活动](/docs/defining-workflows/activities)。

多个普通活动步骤必须复用 GPU 内存或挂载文件系统等 Worker 本地资源时，使用 [Worker 会话](/docs/features/worker-sessions)。

只有不需要活动重试、超时、心跳或取消语义的可安全重放快照，才使用 [`sideEffect(...)`](/docs/features/side-effects)。
