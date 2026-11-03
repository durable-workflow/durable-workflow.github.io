---
sidebar_position: 12
---

# 事件 {#events}

生命周期事件在工作流和活动执行的关键阶段派发，向应用通知进度、完成或故障。这些是标准 Laravel 事件，可在 `EventServiceProvider` 中或通过 `Event::listen()` 注册监听器。

`WorkflowCancelled` 和 `WorkflowTerminated` 会等待运行所用存储连接上的事务提交。被拒绝的命令和已回滚的存储写入均不会派发这两种事件。引擎事务及生命周期事件顺序的其他问题仍由 [workflow#893](https://github.com/durable-workflow/workflow/issues/893) 跟踪。应用在另一数据库上开启的事务不会使工作流存储写入具有原子性。

## 事件标识 {#event-identity}

每个 v2 事件都携带持久标识字段：

| 字段 | 说明 |
|---|---|
| `instanceId` | 工作流实例 ID，跨 continue-as-new 保持稳定。 |
| `runId` | 具体执行的运行 ID。 |
| `workflowType` | 通过 `#[Type('...')]` 注册的持久类型键。 |
| `workflowClass` | 工作流的 PHP 类名。 |
| `committedAt` | 准备生命周期通知时记录的系统时钟时间戳，格式为 ISO 8601。 |

活动事件还包括：

| 字段 | 说明 |
|---|---|
| `activityExecutionId` | 持久活动执行 ID。 |
| `activityType` | 活动的持久类型键。 |
| `activityClass` | 活动的 PHP 类名。 |
| `sequence` | 活动在工作流执行中的位置。 |
| `attemptNumber` | 尝试序号，从 1 开始。 |

## 工作流事件 {#workflow-events}

### WorkflowStarted {#workflowstarted}

工作流启动被持久提交时派发，即首个运行已创建并记录了 `WorkflowStarted` 历史事件。

```php
use Workflow\V2\Events\WorkflowStarted;

Event::listen(WorkflowStarted::class, function (WorkflowStarted $event) {
    Log::info('Workflow started', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'type' => $event->workflowType,
    ]);
});
```

通过 continue-as-new 开始新运行时，也会触发此事件。

### WorkflowCompleted {#workflowcompleted}

工作流运行成功完成时派发。

```php
use Workflow\V2\Events\WorkflowCompleted;

Event::listen(WorkflowCompleted::class, function (WorkflowCompleted $event) {
    Log::info('Workflow completed', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
    ]);
});
```

### WorkflowFailed {#workflowfailed}

工作流运行发生终态失败时派发。

运行超时也会派发 `WorkflowFailed`。协作取消的清理期限到期时则派发 `WorkflowCancelled`。

附加字段：

- `exceptionClass`：PHP 异常类名。
- `message`：异常消息。

```php
use Workflow\V2\Events\WorkflowFailed;

Event::listen(WorkflowFailed::class, function (WorkflowFailed $event) {
    Log::error('Workflow failed', [
        'instance_id' => $event->instanceId,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

### WorkflowCancelled {#workflowcancelled}

立即取消关闭运行时，或协作取消在清理完成或清理期限到期后关闭运行时派发。仅发出取消请求不会派发此事件。

除通用标识字段外，还包括：

| 字段 | 说明 |
|---|---|
| `reason` | 取消命令的原始原因，或 `null`。清理完成或期限到期的消息不会覆盖它。 |
| `closedAt` | 已持久保存的运行关闭时间，表示为 UTC ISO 8601 字符串。 |

```php
use Workflow\V2\Events\WorkflowCancelled;

Event::listen(WorkflowCancelled::class, function (WorkflowCancelled $event) {
    Log::info('Workflow cancelled', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'reason' => $event->reason,
        'closed_at' => $event->closedAt,
    ]);
});
```

### WorkflowTerminated {#workflowterminated}

终止操作关闭运行时派发。它携带相同的标识字段、`reason` 和 `closedAt`，原因取自终止命令。终止操作不执行工作流清理代码。

```php
use Workflow\V2\Events\WorkflowTerminated;

Event::listen(WorkflowTerminated::class, function (WorkflowTerminated $event) {
    Log::info('Workflow terminated', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'reason' => $event->reason,
        'closed_at' => $event->closedAt,
    ]);
});
```

这些是在进程内派发的 Laravel 通知。监听器失败无法撤销已提交的关闭操作。这些事件不授予恢复已关闭运行的权限，也不保证向外部系统持久投递。

## 活动事件 {#activity-events}

### ActivityStarted {#activitystarted}

活动任务被认领并开始执行时派发。

```php
use Workflow\V2\Events\ActivityStarted;

Event::listen(ActivityStarted::class, function (ActivityStarted $event) {
    Log::info('Activity started', [
        'activity' => $event->activityType,
        'sequence' => $event->sequence,
        'attempt' => $event->attemptNumber,
    ]);
});
```

### ActivityCompleted {#activitycompleted}

活动成功完成时派发。

```php
use Workflow\V2\Events\ActivityCompleted;

Event::listen(ActivityCompleted::class, function (ActivityCompleted $event) {
    Log::info('Activity completed', [
        'activity' => $event->activityType,
        'execution_id' => $event->activityExecutionId,
    ]);
});
```

### ActivityFailed {#activityfailed}

活动发生终态失败，即用尽所有重试或发生不可重试异常时派发。后续仍会重试的可重试故障**不会**触发此事件。

附加字段：

- `exceptionClass`：PHP 异常类名。
- `message`：异常消息。

```php
use Workflow\V2\Events\ActivityFailed;

Event::listen(ActivityFailed::class, function (ActivityFailed $event) {
    Log::error('Activity failed', [
        'activity' => $event->activityType,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

## 故障事件 {#failure-events}

### FailureRecorded {#failurerecorded}

每当持久故障记录提交时派发，包括工作流和活动的终态失败。这是 Sentry 或 Bugsnag 等错误报告集成的统一钩子。

| 字段 | 说明 |
|---|---|
| `failureId` | 持久故障记录 ID。 |
| `sourceKind` | `"workflow_run"` 或 `"activity_execution"`。 |
| `sourceId` | 来源的 ID，即运行 ID 或活动执行 ID。 |
| `exceptionClass` | PHP 异常类名。 |
| `message` | 异常消息。 |

```php
use Workflow\V2\Events\FailureRecorded;

Event::listen(FailureRecorded::class, function (FailureRecorded $event) {
    // Report to Sentry, Bugsnag, etc.
    report(new \RuntimeException(
        "[{$event->sourceKind}] {$event->exceptionClass}: {$event->message}"
    ));
});
```

## 时间戳语义 {#timestamp-semantics}

引擎在准备生命周期通知时记录 `committedAt`。这是系统时钟时间戳，与以下时间不同：

- **工作流虚拟时间**：工作流执行内部的逻辑时间，供定时器使用。
- **尝试时间**：某次具体活动尝试开始或结束的时间。
- **恢复延迟**：定时器到期至工作流实际恢复之间的时长。

对于取消和终止，`closedAt` 是以 UTC 表示的、已持久保存的运行关闭时间戳。外层存储事务可能在事件字段记录之后才提交。测量投递延迟时，应单独记录监听器接收时间。

## 生命周期 {#lifecycle}

典型的成功工作流生命周期：

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityCompleted
Workflow\V2\Events\WorkflowCompleted
```

存在活动终态失败的工作流生命周期：

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityFailed
Workflow\V2\Events\FailureRecorded    (source: activity_execution)
Workflow\V2\Events\WorkflowFailed
Workflow\V2\Events\FailureRecorded    (source: workflow_run)
```

被取消的运行以以下事件结束：

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\WorkflowCancelled
```

协作清理可以在这两条通知之间派发活动事件。

被终止的运行以以下事件结束：

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\WorkflowTerminated
```

## 事件命名空间 {#event-namespace}

v2 事件位于 `Workflow\V2\Events` 命名空间。升级已有应用时，v1 兼容事件映射见[迁移](../migration.md)。
