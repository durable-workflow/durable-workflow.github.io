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

`Workflow\V2\Activity` 默认使用 `$tries = 1`：只尝试一次，抛出异常后不会自动重试。活动的第一次失败就会传回工作流。工作流代码可以像下面的示例一样捕获异常；如果没有处理，运行会失败并进入终态。

重试需要显式配置。将 `$tries` 设为大于 `1` 的值可允许多次尝试，设为 `0` 可允许无限次尝试，并选择 `backoff()` 策略。可重试的失败只会在配置的尝试次数或时间预算耗尽后传给工作流代码。不可重试的失败会跳过剩余重试。

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

先检查所选运行的持久状态和活动重试策略。使用默认单次尝试时，未处理的活动失败已经使运行进入终态。部署修复或调用 `repair()` 不会重新打开这个已失败的运行。

只有活动仍有有效重试机会时，才能在原运行等待期间修复代码。必须在调度活动之前，将 `$tries` 设为大于 `1` 的值，或设为 `0` 以允许无限次尝试，并配置 `backoff()`。也可以用 `ActivityOptions::$scheduleToCloseTimeout` 限制活动所有重试的总时长；工作流期限仍然适用。参见[重试](./configuration/options.md#retries)、[退避](./configuration/options.md#backoff)和 [ActivityOptions](./configuration/options.md#activityoptions)。活动被调度时会保存重试策略快照，因此后续部署不会延长已有活动的尝试次数或时间预算。

对于仍在等待可重试活动的运行：

1. 查看失败活动的日志，找到报错或异常。
2. 确定错误来源并修复代码。
3. 将修复部署到队列 Worker 所在的环境。
4. 重启或滚动替换相关 Worker，使它们加载新代码并安全认领工作。
5. 让健康 Worker 执行下一次有效尝试。修复或重新投递可以恢复丢失的任务输送，但不会在活动或运行关闭后授予额外的业务重试。
6. 在 Waterline、历史导出或 Server API 中确认持久结果。单条 Worker 日志不能作为最终依据。
7. 如果活动仍失败，在重复流程前检查剩余尝试次数和时间预算。

仍有有效活动重试机会的运行会保持等待；如果原始预算尚未过期，修正后的代码成功后就可以继续执行。这并不保证所有失败的工作流都能原地修复：未处理的最后一次活动失败、工作流代码失败、结构限制或工作流超时都可能使运行进入终态。

对于失败终态的运行，应保留历史并核对所有外部副作用，再决定应用是否应启动新工作流。重复业务操作需要应用层幂等性。系统不会自动重试整个工作流，也不会重新打开终态运行；参见[工作流级重试](#workflow-level-retry)。

## 服务模式入口拒绝与恢复 {#service-entry-recovery}

**已发布支持。** Server 2.9.9 以及 PHP SDK 2.5.4、Python SDK 2.6.2 和 Rust SDK 3.5.6 引入了下述入口保护、路由和恢复行为。这些是相应功能的最低支持版本；请安装当前稳定版本以获取安全修复。

入口不匹配是在应用工作流代码执行前发生的部署或重放拒绝，不是活动重试，也不是终态业务失败。Worker 报告 `failure_reason = workflow_entry_arguments_mismatch`，Server 保留失败的工作流任务并设置 `replay_blocked = true`，而不是自动创建下一次尝试。通用的 `replay_blocked_reason` 是 `worker_reported_replay_failure`。运行仍处于非终态，已记录的输入、历史和截止时间保持不变。这与成功进入工作流方法体后抛出异常不同，后者仍可能导致整个运行失败。

请先检查实际持久状态，再进行恢复：

1. 使用 `GET /api/workflows/{workflowId}/runs/{runId}/debug` 检查选定运行。确认 `latest_workflow_task_failure.reason` 为 `workflow_entry_arguments_mismatch`，且原运行仍未关闭。此流程不会重新打开终态运行。
2. 部署能够接受已记录位置参数或类型化输入的代码。保留原工作流 ID、运行 ID、命名空间、队列、构建兼容性、历史和截止时间。绝不要编辑存储的输入，也不要用 DTO 默认值替换它。
3. 通过[定义路由](./polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution)确认有符合条件的 Worker 可用。修复操作不会创建 Worker，也不能证明重放兼容性。
4. 使用通常的已授权操作员凭据和命名空间调用 `POST /api/workflows/{workflowId}/runs/{runId}/repair`。指定运行的路由会拒绝以历史运行为目标的请求，而不是默默修复较新的运行。PHP 还提供 `Client::repairWorkflow($workflowId, $runId)`；Python 的 `repair_workflow(workflow_id)` 面向当前实例，Rust 则没有对应的修复便捷方法。
5. 确认同一个原运行使用已记录的输入和历史前缀继续执行，然后只记录一次预期结果。即使原截止时间已经过去，它仍然有效。如果替换代码仍不兼容，请检查新的拒绝原因，不要反复发起修复。

较旧的 Server 可能保存 SDK 的具体原因，却不将其归类为重放阻塞，因此仅报告失败并不能确立“不自动重试”的契约。请使用经过验证的运行时与 SDK 组合。各语言边界见[版本管理](./features/versioning.md#service-sdk-entry-safeguard)，需要认证的指定运行路由见[工作流命令](./polyglot/server-api-reference.md#workflow-commands)。

## 工作流超时执行 {#workflow-timeout-enforcement}

设置 `StartOptions::withExecutionTimeout()` 或 `StartOptions::withRunTimeout()` 时，引擎会在工作流运行上记录截止时间。执行截止时间跨越整个逻辑工作流，包括 continue-as-new 产生的运行。单次运行的截止时间则在新运行开始时重置。

引擎启动工作流任务时，如果截止时间已过，立即关闭该运行：

- 用类型化历史事件 `ActivityCancelled`、`TimerCancelled` 取消所有未结束的活动执行、定时器和待处理任务。
- 记录一行 `WorkflowFailure`，其中 `failure_category = timeout`，`propagation_kind = timeout`。
- 记录 `WorkflowTimedOut` 历史事件，`timeout_kind` 为 `execution_timeout` 或 `run_timeout`。
- 运行状态变为 `failed`，`closed_reason = timed_out`。
- 通知等待这个超时子工作流的父工作流。

后台任务 watchdog 也会扫描截止时间已过、没有开放工作流任务的非终态运行，例如正在等待活动或定时器的运行。找到后，它会创建工作流任务，让执行器在下一轮检测并执行超时关闭。

Waterline 在异常表的专用**类别（Category）**列和时间线失败详情中显示 `failure_category`。历史导出的 `failures[*]` 数组也包含该字段。最终 v2 在记录失败时写入此分类，无法分类的已导入 v1 行仍作为未分类诊断可见。

## 活动重试 {#activity-retries}

要在多个工作流和队列之间共享尝试预算，请将重试限制与 [Server admission 和应用熔断器](./polyglot/task-queue-admission.md#retry-load-and-downstream-budgets)结合。首次尝试和重试都计入上限；本地及嵌入式执行具有不同边界。

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

在工作流代码中，为活动设置总时限，其中包括排队和重试间的等待时间：

```php
use Workflow\V2\Support\ActivityOptions;
use function Workflow\V2\activity;

$result = activity(ChargeCard::class, new ActivityOptions(
    scheduleToCloseTimeout: 120,
));
```

这些设置共同允许最多三次尝试，重试前分别等待 5 秒和 30 秒，并受最初的 120 秒 schedule-to-close 截止时间约束。如果工作流的截止时间更早，该期限仍然有效。只为可以安全重复的操作启用重试，并使用幂等性检查保护外部副作用。

可重试活动在尝试次数用尽前抛出异常时，引擎会将当前 `activity_attempts` 行作为运行时状态关闭，把 `activity_executions` 行恢复为 `pending`，为失败尝试记录类型化 `ActivityRetryScheduled` 历史事件，并创建新的持久活动任务。新任务的 `available_at` 按 `backoff()` 策略设置。工作流继续等待同一活动执行，直到最后一次可重试尝试失败，才收到异常。

重试任务的载荷记录 `retry_of_task_id`、`retry_after_attempt_id`、`retry_after_attempt` 和 `retry_backoff_seconds`，让 Waterline 能解释任务的调度原因。所选运行详情优先从类型化活动历史重建 `activities[*].attempts` 中的失败尝试，在时间线显示 `ActivityRetryScheduled`，并通过 `operator_metrics.activities.retrying`、`operator_metrics.activities.failed_attempts` 和 `operator_metrics.backlog.retrying_activities` 报告重试统计。

`Workflow\Exceptions\NonRetryableExceptionContract` 会立即中止重试策略。抛出不可重试异常会使活动执行立即失败，并将异常传回工作流。

### 重试延迟分辨率 {#retry-delay-resolution}

活动的 `backoff()` 值以整数秒表示。持久重试间隔的分辨率为 1 秒。请勿使用 `0.1`
这样的数值来请求 100 ms 后重试。接受小数值并据此生成间隔的 SDK API 会向上取整到
下一整秒。Python 和 Rust SDK 参考文档说明了支持的参数类型及转换规则。

延迟结束后，下一次尝试才可以开始，但队列延迟和 Worker 负载可能使其更晚执行。要加快
测试，请使用[受控时间或次数有限的零延迟用例](./testing.md#keeping-delay-tests-fast)。

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

活动或工作流抛出实现 `Workflow\Exceptions\NonRetryableExceptionContract` 的异常时，引擎在 `WorkflowFailure` 行和类型化历史事件载荷（`ActivityFailed`、`WorkflowFailed`、`UpdateCompleted`）中记录 `non_retryable = true`。这个持久标记告诉运维人员、外部 Worker 和工具：失败是永久性的，重复相同操作不会成功。

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

## PHP 服务模式失败报告上限 {#php-failure-report-limits}

PHP SDK **3.5.0 或更新版本**将服务模式下发出的失败报告限制为：UTF-8 消息 62 KiB、堆栈 128 KiB、可选元数据合计 64 KiB，以及包含标记的完整编码请求体 1 MiB。已知传输上限更低时，以较低值为准。[PHP 报告指南](./polyglot/php.md#bounded-failure-reports)说明了配置、省略诊断信息、保留的重试语义，以及本地首次执行与冷重放的一致性。这些是 SDK 报告的边界。嵌入式记录和 Core 摘要存储遵循各自独立的契约。

## Python 服务模式失败报告上限 {#python-failure-report-limits}

Python SDK **2.11.0 或更新版本**将服务模式下发出的失败报告限制为：UTF-8 消息 62 KiB、堆栈 128 KiB、可选元数据合计 64 KiB，以及包含标记的完整编码请求体 1 MiB。已知传输上限更低时，以较低值为准。[Python 报告指南](./polyglot/python.md#bounded-failure-reports)说明了配置、省略诊断信息、保留的重试语义，以及本地首次执行与冷重放的一致性。这些是 SDK 报告的边界。嵌入式记录和 Core 摘要存储遵循各自独立的契约。

## Rust 服务模式失败报告上限 {#rust-failure-report-limits}

实际运行 Rust SDK **4.10.1 或更新版本**的服务 worker，其发出 UTF-8 message 含标记最多62 KiB，受支持 stack 为128 KiB，可选 metadata 合计序列化结果为64 KiB，完整编码 body 为1 MiB或已知更低传输上限。type、retry 决定和 claim 标识保持不变；必需 envelope 无法容纳时显式拒绝。[Rust 报告指南](./polyglot/rust.md#bounded-failure-reports)说明省略标记、完整 Avro details 和本地结果边界。这不构成对旧 SDK、embedded mode 或独立 Core summary 存储修复的验证。

## 相关指南 {#related-guides}

- [执行保证与幂等性](./constraints/execution-guarantees.md)介绍影响本页所有恢复路径的重放、重试、租约过期和重新投递契约。
- [监控](./monitoring.md)说明 Waterline、历史导出、Worker 日志和运行时遥测如何展示这些失败信息。
