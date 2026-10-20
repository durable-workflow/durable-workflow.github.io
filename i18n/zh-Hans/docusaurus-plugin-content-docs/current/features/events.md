---
sidebar_position: 12
---

# 事件 {#events}

生命周期事件在工作流和活动执行的关键阶段派发，向应用通知进度、完成或故障。这些是标准 Laravel 事件，可在 `EventServiceProvider` 中或通过 `Event::listen()` 注册监听器。

所有 v2 生命周期事件均在**持久状态提交到数据库之后**派发。监听器只能观察由已提交事实支持的事件；事务回滚时不会派发事件。

## 事件标识 {#event-identity}

每个 v2 事件都携带持久标识字段：

| 字段 | 说明 |
|---|---|
| `instanceId` | 工作流实例 ID，跨 continue-as-new 保持稳定。 |
| `runId` | 具体执行的运行 ID。 |
| `workflowType` | 通过 `#[Type('...')]` 注册的持久类型键。 |
| `workflowClass` | 工作流的 PHP 类名。 |
| `committedAt` | 持久记录提交时的 ISO 8601 时间戳，即系统时钟提交时间。 |

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

所有事件的 `committedAt` 表示**提交时间**，即持久记录（历史事件或故障记录）写入数据库时的系统时钟时间。它不同于：

- **工作流虚拟时间**：工作流执行内部的逻辑时间，供定时器使用。
- **尝试时间**：某次具体活动尝试开始或结束的时间。
- **恢复延迟**：定时器到期至工作流实际恢复之间的时长。

提交时间最适合外部集成，因为它反映状态何时变为持久且可观察。

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

## 事件命名空间 {#event-namespace}

v2 事件位于 `Workflow\V2\Events` 命名空间。升级已有应用时，v1 兼容事件映射见[迁移](../migration.md)。
