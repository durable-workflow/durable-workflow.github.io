---
sidebar_position: 19
---

# 超时 {#timeouts}

工作流级超时限制工作流允许运行的时间，分为两种范围：

- **执行超时**：限制整个工作流实例所有运行的总挂钟时间，包括 continue-as-new 转换。截止时间在启动时计算一次，并保持不变。
- **单次运行超时**：限制一次运行。每次新运行开始时重新计算截止时间，包括 continue-as-new。

两者都可选，也可同时使用。

## 配置 {#configuration}

启动工作流时通过 `StartOptions` 配置超时：

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

$workflow->start(
    $orderId,
    StartOptions::rejectDuplicate()
        ->withExecutionTimeout(7200)   // 2 hours across all runs
        ->withRunTimeout(3600),        // 1 hour per run
);
```

### 执行超时 {#execution-timeout}

执行超时覆盖整个工作流实例。工作流使用 continue-as-new 时，链中所有运行的截止时间保持相同。

```php
StartOptions::rejectDuplicate()->withExecutionTimeout(86400); // 24 hours
```

超时值保存在 `WorkflowInstance` 模型上，计算出的截止时间会快照到每个 `WorkflowRun`。

### 单次运行超时 {#run-timeout}

单次运行超时只作用于一次运行。工作流继续为新运行时，会以当前时间加上已配置的运行超时来计算新截止时间。

```php
StartOptions::rejectDuplicate()->withRunTimeout(1800); // 30 minutes per run
```

### 验证 {#validation}

超时值必须至少为 1 秒。传入零或负值会抛出 `LogicException`：

```php
// Throws LogicException: "Workflow v2 execution timeout must be at least 1 second."
StartOptions::rejectDuplicate()->withExecutionTimeout(0);
```

### 控制平面 {#control-plane}

通过控制平面启动工作流时也可设置超时：

```php
$controlPlane->start('my-app.order-workflow', 'order-123', [
    'execution_timeout_seconds' => 7200,
    'run_timeout_seconds' => 3600,
]);
```

`describe` 响应包含超时与截止时间字段：

```php
$description = $controlPlane->describe('order-123');

$description['execution_timeout_seconds']; // 7200
$description['run']['run_timeout_seconds']; // 3600
$description['run']['execution_deadline_at']; // ISO 8601 timestamp
$description['run']['run_deadline_at'];       // ISO 8601 timestamp
```

### Waterline {#waterline}

配置超时后，Waterline 运行详情会显示超时时长及其计算出的截止时间。

### 历史 {#history}

配置后，`WorkflowStarted` 历史事件载荷包含超时和截止时间字段：

```json
{
    "execution_timeout_seconds": 7200,
    "run_timeout_seconds": 3600,
    "execution_deadline_at": "2026-04-12T14:00:00+00:00",
    "run_deadline_at": "2026-04-12T13:00:00+00:00"
}
```

### Continue-as-new {#continue-as-new}

工作流继续为新运行时：

- **执行截止时间**从前一次运行原样继承。
- **单次运行超时**值会继承，但**运行截止时间**根据当前时间重新计算。

因此，执行超时始终从最初启动时计时，而每个新运行都有新的单次运行超时窗口。

## 执行方式 {#enforcement}

工作流级超时在两个位置执行：

1. **工作流任务开始时**：每个任务执行工作流前检查 `deadlineExpired()`。如果超过截止时间，立即将运行置为超时。
2. **TaskWatchdog 扫描时**：watchdog 扫描已超过执行或运行截止时间、但没有开放工作流任务的非终态运行。发现后，它创建并分派一个截止时间已过的工作流任务，在下次执行时触发超时。

超时触发时，引擎会：

- 取消当前任务以外所有开放任务（活动、定时器、工作流）
- 取消所有开放的活动执行，并记录 `ActivityCancelled` 历史事件
- 取消所有待触发定时器，并记录 `TimerCancelled` 历史事件
- 记录 `failure_category = timeout` 且包含 `WorkflowTimeoutException` 的 `WorkflowFailure`
- 记录终态 `WorkflowTimedOut` 历史事件，其中 `timeout_kind` 为 `execution_timeout` 或 `run_timeout`
- 对开放的子工作流应用父关闭策略
- 如果这是子运行，通知父工作流

失败行将 `Workflow\V2\Exceptions\WorkflowTimeoutException` 保存为异常类，并携带 `timeout_kind` 与截止时间戳，供程序检查。

### 超时结果与清理 {#timeout-outcome-and-cleanup}

工作流到达截止时间后，以 `failed` 状态和 `closed_reason = timed_out` 关闭。终态历史事件为 `WorkflowTimedOut`。运行时将 `WorkflowTimeoutException` 记录为失败数据，**不会**将异常抛入工作流主体，也不会为清理而恢复工作流代码。因此，引擎强制执行截止时间时，工作流的 `catch`、`finally` 和已注册的 saga 补偿都不会运行。

取消活动的持久化执行并不会撤销外部副作用，也不能证明回调已停止。对于可能已提交的效果，应使用幂等操作与应用负责的核对恢复。

如果应用截止时间到达后必须清理，请使用更短的持久定时器或带超时的等待，让工作流代码在[关闭前执行补偿](./sagas.md#deadline-driven-compensation)。在运行或执行截止时间之前，为活动重试、Worker 调度和清理预留时间。引擎超时仍是最终兜底，Worker 延迟可能使补偿尚未完成就触及该上限。

立即执行的 `cancel()` 和 `terminate()` 也会关闭运行，不提供工作流清理窗口。独立的协作式 `requestCancellation()` 可在运行仍活动时，由兼容 Worker 执行有界清理。工作流超时不会自动转为协作式取消请求，取消屏蔽也不会延长执行或运行截止时间。参阅[取消与终止](./cancel-and-terminate.md)及[协作式取消](../polyglot/cancellation.md)。

## 工作流任务租约 {#workflow-task-lease}

工作流任务是Worker的一轮处理：重放已提交的历史，并生成持久化命令。它不是整个工作流。等待持久定时器、排队活动或信号时，不会在整个等待期间一直持有同一个工作流任务；后续任务会恢复运行。

| 部署方式 | 默认秒数 | 设置 |
| --- | --- | --- |
| 嵌入式Laravel | `300` | `DW_V2_WORKFLOW_TASK_LEASE_SECONDS` |
| Server | `60` | `DW_WORKFLOW_TASK_TIMEOUT` |

嵌入式设置映射到 `workflows.v2.workflow_task_lease_seconds`。Server在启动时将自己的设置映射到这个包配置键，因此在Server上应使用Server设置。这是运行时配置，不是 `StartOptions` 选项或每次启动时的活动超时。参阅[发布配置](../configuration/publishing-config.md#workflow-task-lease-v2)和[Server配置参考](../polyglot/server-config-reference.md#worker-protocol-and-query-transport)。

### 心跳与执行 {#workflow-task-heartbeats}

服务模式Worker通过任务心跳续订正在执行的工作流任务所有权。Server验证任务、尝试编号及租约所有者。确认成功的续订采用当前有效的租约时长，并遵守适用的取消清理边界。它不会修改原始运行期限、执行期限或活动超时。Worker注册心跳保持注册信息的时效性。注册过期可能导致Server上的任务所有权在任务租约到期前就失效。这种心跳不会续订该任务租约。排队活动的心跳报告活动进度，同样不能替代工作流任务续租。

同步执行的嵌入式工作流代码在阻塞时无法定期续租。请保持代码具有确定性且简短，将耗时I/O或CPU工作放到活动中。租约不是强制终止进程或CPU执行的时间限制。

嵌入式本地活动会保留承载它的工作流任务。只要原始活动尝试和工作流任务所有权仍然有效，其 `$this->heartbeat()` 也可以续订该任务租约。

### 租约到期 {#workflow-task-lease-expiry}

到期且未完成的任务所有权会成为可恢复对象。Matching/watchdog或repair清除到期所有权并重新派发工作，使兼容Worker能够重放已提交的历史。恢复需要运行中的恢复进程、可用数据库及符合条件的Worker。到期不会终止旧进程，也不保证立即重新投递。在Server上，到期或已被替换的所有权无法提交新命令；续租被拒绝应视为失去执行权限。

Repair不会重新打开已关闭的运行，不会授予额外的业务重试，也不会重置原始期限。相比之下，活动的 `startToCloseTimeout` 按已记录的重试策略限制一次活动尝试。运行超时和执行超时限制工作流的生命周期，工作流任务续租或重放不会延长它们。

## 活动超时 {#activity-timeouts}

活动超时限制单个活动执行的时长，共有四种范围：

- **调度到开始**：限制调度到 Worker 首次领取之间的时间。在活动为 `Pending` 时执行。
- **开始到关闭**：限制 Worker 领取到必须完成之间的时间。每次重试都会重置。
- **调度到关闭**：限制从调度到完成、跨所有重试的总挂钟时间。这始终导致终态，因为总体截止时间已过，重试也无济于事。
- **心跳**：限制相邻心跳的间隔。调用 `$this->heartbeat()` 的长时间活动必须在配置间隔内发送心跳，否则被视为无响应。

这些设置都可选且可组合。在调用活动时通过 `ActivityOptions` 配置：

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    LongRunningActivity::class,
    new ActivityOptions(
        scheduleToStartTimeout: 30,     // must be claimed within 30s
        startToCloseTimeout: 300,       // each attempt has 5 minutes
        scheduleToCloseTimeout: 600,    // total 10 minutes across all retries
        heartbeatTimeout: 15,           // heartbeat well before this 15-second window expires
        maxAttempts: 3,
    ),
    $input,
);
```

### 调度到开始超时 {#schedule-to-start-timeout}

截止时间在活动被调度时计算。若没有 Worker 在期限前领取，`TaskWatchdog` 执行超时。如果还可重试，则使用已快照的退避调度新活动任务，并相对于重试的可用时间重新计算调度到开始截止时间，每次重试都有新窗口。若未配置 `scheduleToStartTimeout`，重试时会清除此截止时间。所有尝试用尽后，记录终态 `ActivityTimedOut` 历史事件并唤醒工作流。

### 开始到关闭超时 {#start-to-close-timeout}

Worker 领取活动任务时计算截止时间，每次重试都有新的开始到关闭截止时间。活动未按时完成时，关闭当前尝试。若还可重试，执行回到 `Pending`，并重置已配置的调度到开始截止时间，避免重试任务立即再次超时。所有尝试用尽后记录终态超时。

### 调度到关闭超时 {#schedule-to-close-timeout}

截止时间只在调度时计算一次，永不重置。到期时即使还有剩余重试，也会立即将活动置为终态失败，因为总允许时间已过。这可以限制不稳定活动的整体成本，避免它在每次尝试的限制内无限重试。

### 心跳超时 {#heartbeat-timeout}

对于排队活动，第一个截止时间从运行时领取时开始，早于任务交付和用户代码执行。每个被接受的心跳都将截止时间设为运行时记录的该次心跳时间加上配置的超时。它不会在前一个截止时间上累加时长，也不会在调用方收到响应时重新开始计时。请为交付、有界工作、执行暂停、请求延迟和传输重试预留余量。在窗口到期前留足时间发送心跳。已过期或被替换的尝试不能通过迟到的心跳恢复权限。若仍可重试，则调度新尝试，并重置已配置的调度到开始截止时间。否则记录终态超时。

```php
use Workflow\V2\Activity;

class LongRunningActivity extends Activity
{
    public function handle($input)
    {
        foreach ($items as $item) {
            $this->heartbeat(['processed' => $count]);
            // ... process item ...
        }
    }
}
```

### 执行方式 {#enforcement-1}

`TaskWatchdog` 在每轮 Worker 循环执行活动超时。它扫描截止时间列已过期的执行，并委托 `ActivityTimeoutEnforcer` 处理。每次执行会记录：

- 终态 `ActivityTimedOut` 历史事件，`timeout_kind` 为 `schedule_to_start`、`start_to_close`、`schedule_to_close` 或 `heartbeat`
- `failure_category = timeout` 且 `propagation_kind = timeout` 的 `WorkflowFailure` 行
- 唤醒父工作流以观察失败的工作流恢复任务

Waterline 活动详情显示包含所有已配置超时类型的重试策略。时间线在活动超时事件消息中显示超时类型。

### 尚未覆盖的内容 {#what-is-not-yet-covered}

以下功能在计划中，但尚未实现：

- 工作流级重试策略

### 结构限制 {#structural-limits}

引擎对载荷大小、待处理扇出数量和元数据大小上限执行带类型的结构限制失败。完整限制契约、配置和失败分类见[结构限制](../constraints/structural-limits.md)。
