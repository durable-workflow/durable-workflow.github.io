---
sidebar_position: 11
title: 故障与恢复
description: 诊断活动失败、不可重试异常、运行超时、取消清理和恢复操作。
tags:
  - failures
  - recovery
  - operations
keywords:
  - 工作流故障
  - 不可重试异常
  - 工作流恢复
---

# 故障与恢复 {#failures-and-recovery}

排查故障之前，请记住核心执行契约：

- 工作流任务通过重放已提交历史恢复。
- 活动执行遵循至少一次语义，可能被多次观察。
- 租约过期和重新投递是正常恢复路径，不能据此判断上一个 Worker 没有执行副作用。

需要了解重试、重新投递和持久结果的精确语义时，先阅读[执行保证与幂等性](./constraints/execution-guarantees.md)。

## 处理异常 {#handling-exceptions}

活动抛出异常后，工作流通常要等到 `$tries` 次尝试全部用尽才会收到异常。系统按照活动的重试策略继续尝试。希望失败后立即把异常传给工作流时，将 `$tries` 设置为 1。

```php
use Exception;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public int $tries = 1;

    public function handle(): void
    {
        throw new Exception();
    }
}
```

```php
use Exception;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        try {
            $result = activity(MyActivity::class);
        } catch (Exception) {
            // handle the exception here
        }
    }
}
```

## 不可重试异常 {#non-retryable-exceptions}

有些异常不应重试，称为不可重试异常。活动抛出这类异常时，引擎立即将活动标记为失败，停止重试。

```php
use Workflow\V2\Activity;
use Workflow\Exceptions\NonRetryableException;

class MyNonRetryableActivity extends Activity
{
    public function handle(): void
    {
        throw new NonRetryableException('This is a non-retryable error');
    }
}
```

## 恢复流程 {#recovery-process}

修复失败活动的一般流程：

1. 查看失败活动的日志，找到报错或异常。
2. 确定错误来源并修复代码。
3. 将修复部署到队列运行的服务器。
4. 重启或滚动更新相关 Worker，使它们加载新代码并安全重新认领工作。
5. 等待活动重试，或等待修复与重新投递将持久任务交给健康 Worker。
6. 在 Waterline、历史导出或 Server API 中确认持久结果。单条 Worker 日志不能作为最终依据。
7. 如果活动仍失败，继续排查并重复上述流程。

只要活动仍有重试机会，工作流就可以保持运行状态。修复失败活动后，工作流可继续执行并完成。工作流进入 `failed` 状态，表示活动尝试次数已用尽且异常未被处理。

## 工作流超时执行 {#workflow-timeout-enforcement}

设置 `StartOptions::withExecutionTimeout()` 或 `StartOptions::withRunTimeout()` 时，引擎会在工作流运行上记录截止时间。执行截止时间跨越整个逻辑工作流，包括 continue-as-new 产生的运行。单次运行的截止时间则在新运行开始时重置。

引擎启动工作流任务时，如果截止时间已过，立即关闭该运行：

- 用类型化历史事件 `ActivityCancelled`、`TimerCancelled` 取消所有未结束的活动执行、定时器和待处理任务。
- 记录一行 `WorkflowFailure`，其中 `failure_category = timeout`，`propagation_kind = timeout`。
- 记录 `WorkflowTimedOut` 历史事件，`timeout_kind` 为 `execution_timeout` 或 `run_timeout`。
- 运行状态变为 `failed`，`closed_reason = timed_out`。
- 通知等待这个超时子工作流的父工作流。

后台任务 watchdog 也会扫描截止时间已过、没有开放工作流任务的非终态运行，例如正在等待活动或定时器的运行。找到后，它会创建工作流任务，让执行器在下一轮检测并执行超时关闭。

Waterline 在异常表的专用 **Category** 列和时间线失败详情中显示 `failure_category`。历史导出的 `failures[*]` 数组也包含该字段。最终 v2 在记录失败时写入此分类，无法分类的已导入 v1 行仍作为未分类诊断可见。

## 活动重试 {#activity-retries}

`Workflow\V2\Activity` 默认 `$tries = 1`。除非活动主动配置更多尝试，否则失败会立即传回工作流。

```php
use RuntimeException;
use Workflow\V2\Activity;

class ChargeCard extends Activity
{
    public int $tries = 3;

    public function backoff(): array
    {
        return [5, 30];
    }

    public function handle(): string
    {
        throw new RuntimeException('temporary gateway failure');
    }
}
```

可重试活动在尝试次数用尽前抛出异常时，引擎会将当前 `activity_attempts` 行作为运行时状态关闭，把 `activity_executions` 行恢复为 `pending`，为失败尝试记录类型化 `ActivityRetryScheduled` 历史事件，并创建新的持久活动任务。新任务的 `available_at` 按 `backoff()` 策略设置。工作流继续等待同一活动执行，直到最后一次可重试尝试失败，才收到异常。

重试任务的载荷记录 `retry_of_task_id`、`retry_after_attempt_id`、`retry_after_attempt` 和 `retry_backoff_seconds`，让 Waterline 能解释任务的调度原因。所选运行详情优先从类型化活动历史重建 `activities[*].attempts` 中的失败尝试，在时间线显示 `ActivityRetryScheduled`，并通过 `operator_metrics.activities.retrying`、`operator_metrics.activities.failed_attempts` 和 `operator_metrics.backlog.retrying_activities` 报告重试统计。

`Workflow\Exceptions\NonRetryableExceptionContract` 会立即中止重试策略。抛出不可重试异常会使活动执行立即失败，并将异常传回工作流。

### 活动执行标识与幂等性 {#activity-execution-identity-and-idempotency}

同一逻辑活动被多次观察的原因包括重试、租约过期、Worker 丢失、完成报告延迟和重新投递。这些情况可能产生另一次尝试，或同一持久活动执行的过期完成报告。

- `activity_execution_id` 标识跨重试和重新投递的逻辑活动。将它作为远程副作用的默认幂等键。
- `activity_attempt_id` 标识该逻辑活动的一次具体尝试。只有下游系统必须区分尝试时才使用它。
- 被替代尝试迟到的完成或失败报告属于正常的过期尝试行为，不能据此判断引擎重复提交了同一次尝试。

租约过期后遇到迟到的完成报告时：

- 以 Waterline、历史导出或 Server API 确定哪次尝试赢得了持久结果的提交权。
- 不要因为迟到的完成报告被拒绝，就认定远程副作用没有发生。
- 强制手动重试或修复之前，先通过幂等键检查外部系统。

最安全的默认做法，是让远程副作用以 `activity_execution_id` 保持幂等，再用持久结果判断引擎是否接受了具体尝试的报告。

### 不可重试失败标记 {#non-retryable-failure-markers}

活动或工作流抛出实现 `Workflow\Exceptions\NonRetryableExceptionContract` 的异常时，机制在 `WorkflowFailure` 行和类型化历史事件载荷（`ActivityFailed`、`WorkflowFailed`、`UpdateCompleted`）中记录 `non_retryable = true`。这个持久标记告诉运维人员、外部 Worker 和工具：失败是永久性的，重复相同操作不会成功。

标记贯穿所有可见性接口：

- **失败行：** `workflow_failures.non_retryable` 布尔列。
- **历史事件：** 类型化事件载荷中的 `non_retryable` 字段。
- **失败快照：** `FailureSnapshots::forRun()` 包含 `non_retryable`。
- **运行详情：** 异常数组包含 `non_retryable`。
- **时间线：** 失败详情元数据包含 `non_retryable`。
- **历史导出：** `failures[*]` 数组包含 `non_retryable`。
- **Waterline：** 异常表和时间线的失败类别旁显示“不可重试”徽章。
- **外部 Worker 桥接：** `complete()` 命令载荷接受 `non_retryable`，使外部工作流 Worker 无需宿主进程解析异常类即可报告不可重试失败。

未实现这个契约的失败，`non_retryable` 默认为 `false`。最终 v2 在失败时记录此持久标记。如果运维人员或 SDK 需要区分永久失败和可重试失败，应在失败发生前声明契约。

```php
use Workflow\Exceptions\NonRetryableExceptionContract;

class PaymentDeclinedException extends \RuntimeException implements NonRetryableExceptionContract
{
    // This failure will be marked as non-retryable in the durable record.
}
```

## 工作流级重试 {#workflow-level-retry}

Durable Workflow v2 不支持自动工作流级重试。工作流运行因未处理异常、结构限制或超时失败后，即进入终态。引擎不会自动为同一个工作流实例启动新运行。

这样设计的原因如下：

- **活动已有重试。** 可配置的 `$tries`、`backoff()` 和不可重试异常，以合适的粒度处理临时故障。
- **工作流重放负责恢复。** 工作流任务遇到数据库错误、Worker 崩溃等临时基础设施故障时，持久任务系统重新派发任务，重放从已提交历史恢复，无需新运行。
- **Continue-as-new 支持长期运行的工作流。** 需要新状态或历史压缩时，工作流通过 `continueAsNew()` 显式开始新运行。
- **修复处理停滞的运行。** `repair()` 命令和 Worker 循环的自动修复恢复持久任务传输丢失的运行。

应用需要工作流级重试语义时，应在代码中显式建模：

```php
use function Workflow\V2\activity;
use Throwable;
use Workflow\V2\Workflow;

class RetryableWorkflow extends Workflow
{
    public function handle(string $orderId): void
    {
        try {
            activity(ProcessOrderActivity::class, $orderId);
        } catch (Throwable $e) {
            // Record the failure, then start a new workflow
            // for retry-at-workflow-level scenarios.
            activity(NotifyFailureActivity::class, $orderId, $e->getMessage());
        }
    }
}
```

## 相关指南 {#related-guides}

- [执行保证与幂等性](./constraints/execution-guarantees.md)介绍影响本页所有恢复路径的重放、重试、租约过期和重新投递契约。
- [监控](./monitoring.md)说明 Waterline、历史导出、Worker 日志和运行时遥测如何展示这些失败信息。

