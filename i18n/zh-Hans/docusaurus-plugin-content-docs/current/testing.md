---
sidebar_position: 9
---

# 测试 {#testing}

## 部署或回滚前进行重放 {#replay-before-deployment}

为具有代表性的运行中和最近关闭的运行保存指定运行的导出文件。覆盖候选代码可能遇到的活动、重试、信号、更新、子工作流、定时器和版本标记路径，并保留所需的每一代 continue-as-new 运行。使用未经裁剪、原始载荷字节和编解码器均可用的历史。单靠导出标志不能证明完整性。请参阅[保留限制](./configuration/pruning-workflows.md)。

### 嵌入式 PHP {#embedded-php-replay}

从应用拥有的存储导出。将 `WORKFLOW_ID` 和 `RUN_ID` 设为所选实例和运行的准确标识：

```bash
php artisan workflow:v2:history-export "$WORKFLOW_ID" \
  --run-id="$RUN_ID" --output=replay-bundles/run.json
```

在候选应用制品内部运行验证，加载该制品的工作流类和配置。报告应放在导出包目录之外。使用隔离的 CI 环境，不提供能在生产环境产生外部副作用的凭据：

```bash
php artisan workflow:v2:replay-verify replay-bundles/run.json \
  --json --output=replay-one.json
php artisan workflow:v2:replay-simulate replay-bundles \
  --json --output=replay-report.json
```

非零退出码会阻止晋升；退出码为零仍可能需要审核。将以下批量报告检查保存为 `gate-replay.php`，并在 CI 中运行 `php gate-replay.php replay-report.json`：

```php
<?php
$report = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
$evidence = $report['evidence'] ?? [];
$count = $evidence['bundle_count'] ?? 0;
$allowed = ($report['promotion_decision'] ?? null) === 'safe_to_promote'
    && $count > 0
    && ($evidence['missing_bundle_count'] ?? 1) === 0
    && ($evidence['replay_checked_count'] ?? 0) === $count;
exit($allowed ? 0 : 1);
```

`--skip-replay` 只检查完整性。即使结果没有问题，也不能据此授权重放安全的晋升。通过仅覆盖已记录的路径和运行中历史的可见前缀，不覆盖未来分支、业务正确性或网络行为。回滚前，应使用旧制品测试新 Worker 已写入且旧制品可能接收的历史。同时保留单元测试和使用真实运行时的测试。

### 服务模式 SDK {#service-sdk-replay}

**PHP：** 使用 `DurableWorkflow\Worker\Replayer::replay()`，提供应用的编解码器、可调用对象、事件列表、原始输入、队列和记录的任务标识。让 `NonDeterministicWorkflow` 使测试失败，并断言预期命令和结果。请参阅 [PHP 重放测试](https://php.durable-workflow.com/build/testing/)。

**Python：** 对已注册的候选工作流使用 `Replayer.replay()` 或 `verify_replay()`，并断言预期结果。仅返回一个对象不代表断言通过。若事件中省略了输入，应提供原始解码后的 `start_input`：Core 导出将其存储在 `payloads.arguments` 中。保留记录的类型、ID 和编解码器。请参阅 [Python 重放 API](https://python.durable-workflow.com/sdk-reference/#replay-captured-histories)。`--simulate-bundles` 检查完整性，而不执行候选代码；当前与 schema 2 的兼容性由 [Python #173](https://github.com/durable-workflow/sdk-python/issues/173) 跟踪。不要通过改写版本或校验和来绕过拒绝。

**Rust：** SDK **4.5.0 或更新版本**提供 `testing::WorkflowEnvironment` 和 `WorkflowHistory`，用于无需 Server 的活动/工作流测试和自包含导出的重放。复用候选注册，保留原始输入/全部历史分页，并断言完成状态或预期的等待前缀。偏差返回类型化的 `Error::NonDeterministicReplay`，带有持久序列及预期/实际命令。新的 select 竞争和其他不支持的执行路径仍需集成测试。参见 [Rust 测试、确定性规则和重放示例](./polyglot/rust.md#offline-testing-and-replay)。

## 加快含延迟的测试 {#keeping-delay-tests-fast}

定时器延迟和持久重试退避使用整数秒。如果某个 SDK API 接受小数值并向上取整，
100 ms 就会变成 1 秒。因此，使用亚秒数值不能加快重试较多的测试。

在嵌入式测试中，使用 `WorkflowStub::fake()` 模拟活动结果，并将 Laravel 的测试时钟
向前推进配置的延迟时长。然后调用 `WorkflowStub::runReadyTasks()` 处理已到期任务。
保持尝试次数有限。测试专用的零秒退避可以验证次数有限的重试结果，无需等待真实时间。
请保留单独验证实际退避计划的测试。修改本地测试时钟不会推进远程 Server 的时钟。

## `Workflow\V2` {#workflowv2}

`Workflow\V2\WorkflowStub::fake()` 为受支持的 `V2` fake 功能提供确定性的内联测试路径。

- 就绪的工作流和活动任务内联执行，无需等待队列 Worker
- 嵌套子工作流在同一 fake 模式下作为真实的嵌套 `V2` 运行实例执行
- 活动 mock 仍会写入持久的 `activity_executions`、任务和历史行
- fake 路径绕过后端能力检查，因此测试中仍可使用 `sync`
- `WorkflowStub::assertDispatched()`、`assertDispatchedTimes()`、`assertNotDispatched()` 和 `assertNothingDispatched()` 覆盖 `V2` 活动分发
- `WorkflowStub::assertSignalSent()`、`assertSignalSentTimes()` 和 `assertSignalNotSent()` 覆盖通过 `WorkflowStub::signal()` 或 `signalWithStart()` 发送的 `V2` 信号
- `WorkflowStub::assertUpdateSent()`、`assertUpdateSentTimes()` 和 `assertUpdateNotSent()` 覆盖通过 `WorkflowStub::update()`、`attemptUpdate()` 或 `submitUpdate()` 发送的 `V2` 更新
- 延迟定时器任务在到期前始终是持久排队工作；推进时间后，`WorkflowStub::runReadyTasks()` 内联排空已到期任务

### 首次发布的测试范围 {#first-release-testing-scope}

以下内容**不属于**首次发布的 `V2` fake 功能，未来可能通过增量契约添加：

- 没有旧版 `resume()` 桥接的 `V2` 等价方法
- 没有专门的子工作流 mock 或分发断言辅助方法；子工作流在 fake 模式下作为真实嵌套 `V2` 运行实例执行，因此应测试其可观察输出，而不是 mock 它们
- 没有在一次 fake 执行期间按虚拟时间偏移注入信号或更新的延迟回调钩子；应在明确的信号/更新调用之间推进时间并调用 `WorkflowStub::runReadyTasks()`

`WorkflowStub::mock()` 在运行时落实此范围：传入 `Workflow` 子类会抛出 `LogicException`，其明确消息会引导你通过可观察输出测试子工作流。只有 `Activity` 类（以及未解析的字符串键）可以作为 mock 目标。

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        return [
            'result' => activity(MyActivity::class, 'Taylor'),
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

```php
use Workflow\V2\Testing\ActivityFakeContext;
use Workflow\V2\WorkflowStub;

public function testWorkflow(): void
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, function (ActivityFakeContext $context, string $name): string {
        $this->assertSame('Taylor', $name);
        $this->assertSame('my-workflow-id', $context->workflowId());

        return "Hello, {$name}!";
    });

    $workflow = WorkflowStub::make(MyWorkflow::class, 'my-workflow-id');
    $workflow->start();

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame('Hello, Taylor!', $workflow->output()['result']);

    WorkflowStub::assertDispatched(MyActivity::class, function (string $name): bool {
        return $name === 'Taylor';
    });
}
```

使用 `WorkflowStub::assertDispatched()`、`assertDispatchedTimes()`、`assertNotDispatched()` 和 `assertNothingDispatched()` 断言记录的 `V2` 活动分发。

对于使用定时器的工作流，先用 Laravel 时间移动辅助方法推进时间，再明确排空到期任务队列：

```php
use function Workflow\V2\timer;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

final class MyTimerWorkflow extends Workflow
{
    public function handle(): array
    {
        timer(60);

        return ['done' => true];
    }
}

public function testTimerWorkflow(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(MyTimerWorkflow::class, 'timer-workflow');
    $workflow->start();

    $this->travel(60)->seconds();

    WorkflowStub::runReadyTasks();

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame(['done' => true], $workflow->output());
}
```

`WorkflowStub::runReadyTasks()` 仅排空已经到期的任务。它不会快进实际时钟，也不会强制尚未到期的延迟定时器提前触发。

### 在 fake 模式下发送信号 {#sending-signals-in-fake-mode}

等待信号的工作流可以在 fake 模式下接收信号。调用 `$workflow->signal(...)` 时，引擎记录持久信号命令并创建工作流任务。Fake 模式下该任务内联执行，因此工作流同步恢复：

```php
use function Workflow\V2\activity;
use Workflow\V2\Attributes\Signal;
use function Workflow\V2\await;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

#[Signal('name-provided')]
final class ApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $name = await('name-provided');
        $greeting = activity(GreetingActivity::class, $name);

        return ['name' => $name, 'greeting' => $greeting];
    }
}

public function testSignalWorkflow(): void
{
    WorkflowStub::fake();
    WorkflowStub::mock(GreetingActivity::class, 'Hello, Taylor!');

    $workflow = WorkflowStub::make(ApprovalWorkflow::class, 'approval-1');
    $workflow->start();

    // Workflow suspends at await('name-provided')
    $this->assertSame('waiting', $workflow->refresh()->status());

    // Send the signal — resumes the workflow inline
    $workflow->signal('name-provided', 'Taylor');

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame('Taylor', $workflow->output()['name']);

    WorkflowStub::assertSignalSent('name-provided');
    WorkflowStub::assertSignalSentTimes('name-provided', 1);
    WorkflowStub::assertSignalNotSent('other-signal');
}
```

使用 `WorkflowStub::assertSignalSent()`、`assertSignalSentTimes()` 和 `assertSignalNotSent()` 验证测试期间发送了哪些信号。回调形式接收实例 ID 和信号参数：

```php
WorkflowStub::assertSignalSent(
    'name-provided',
    fn (string $instanceId, string $name): bool =>
        $instanceId === 'approval-1' && $name === 'Taylor'
);
```

### 在 fake 模式下发送更新 {#sending-updates-in-fake-mode}

Fake 模式下更新也内联应用。调用 `$workflow->attemptUpdate(...)` 或 `$workflow->update(...)` 时，引擎记录持久更新命令，创建应用该更新的工作流任务并内联执行：

```php
use Workflow\UpdateMethod;
use Workflow\V2\Attributes\Signal;
use function Workflow\V2\await;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

#[Signal('done')]
final class SettingsWorkflow extends Workflow
{
    private bool $enabled = false;

    public function handle(): array
    {
        await('done');

        return ['enabled' => $this->enabled];
    }

    #[UpdateMethod]
    public function toggle(bool $enabled): array
    {
        $this->enabled = $enabled;

        return ['enabled' => $this->enabled];
    }
}

public function testUpdateWorkflow(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(SettingsWorkflow::class, 'settings-1');
    $workflow->start();

    $this->assertSame('waiting', $workflow->refresh()->status());

    $result = $workflow->attemptUpdate('toggle', true);

    $this->assertTrue($result->accepted());

    WorkflowStub::assertUpdateSent('toggle');
    WorkflowStub::assertUpdateSentTimes('toggle', 1);
    WorkflowStub::assertUpdateNotSent('other-update');

    // Complete the workflow
    $workflow->signal('done');
    $this->assertTrue($workflow->refresh()->completed());
    $this->assertTrue($workflow->output()['enabled']);
}
```

使用 `WorkflowStub::assertUpdateSent()`、`assertUpdateSentTimes()` 和 `assertUpdateNotSent()` 验证测试期间发送了哪些更新。回调形式接收实例 ID 和更新参数：

```php
WorkflowStub::assertUpdateSent(
    'toggle',
    fn (string $instanceId, bool $enabled): bool =>
        $instanceId === 'settings-1' && $enabled === true
);
```

### 测试启动结果与重复启动策略 {#testing-start-outcomes-and-duplicate-start-policy}

使用 `attemptStart()` 验证重复启动行为，无需抛出异常。`StartResult` 提供类型化结果辅助方法：

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

public function testRejectDuplicateStart(): void
{
    WorkflowStub::fake();
    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

    $first = $workflow->start('Taylor');
    $this->assertTrue($first->startedNew());

    $second = WorkflowStub::load('order-123');
    $duplicate = $second->attemptStart('Taylor');

    $this->assertTrue($duplicate->rejected());
    $this->assertTrue($duplicate->rejectedDuplicate());
    $this->assertSame('instance_already_started', $duplicate->rejectionReason());
}
```

要测试返回现有活跃实例的策略，传入 `StartOptions::returnExistingActive()`：

```php
public function testReturnExistingActiveStart(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(MySignalWorkflow::class, 'order-123');
    $workflow->start();

    $this->assertSame('waiting', $workflow->refresh()->status());

    $second = WorkflowStub::load('order-123');
    $result = $second->attemptStart(StartOptions::returnExistingActive());

    $this->assertTrue($result->accepted());
    $this->assertTrue($result->returnedExistingActive());
    $this->assertSame($workflow->runId(), $result->runId());
}
```

两种策略都会记录持久命令和历史事件，因此也可以断言 `WorkflowCommand` 和 `WorkflowHistoryEvent` 行，作更深入的验证。

### 测试历史预算 {#testing-history-budget}

`HistoryBudget` 字段（`history_event_count`、`history_size_bytes`、`continue_as_new_recommended`）通过运行摘要投影公开，并可由 `RunDetailView` 获取。工作流代码中，`Workflow` 基类以 `$this->historyLength()`、`$this->historySize()` 和 `$this->shouldContinueAsNew()` 公开这些值：

```php
use Workflow\V2\Workflow;

final class LongRunningWorkflow extends Workflow
{
    public function handle(): void
    {
        while (true) {
            // ... process work ...

            if ($this->shouldContinueAsNew()) {
                Workflow::continueAsNew($this->carryForwardState());
            }
        }
    }
}
```

测试历史预算阈值时，将阈值调低并验证建议：

```php
public function testHistoryBudgetRecommendsContinueAsNew(): void
{
    config()->set('workflows.v2.history_budget.continue_as_new_event_threshold', 5);

    WorkflowStub::fake();

    // Run a workflow that produces enough history events to trip the threshold
    $workflow = WorkflowStub::make(ManyActivitiesWorkflow::class, 'budget-test');
    $workflow->start();

    $summary = $workflow->summary();
    $this->assertTrue($summary->continue_as_new_recommended);
}
```

## 旧版 `Workflow\WorkflowStub` {#legacy-workflowworkflowstub}

:::warning 旧版 v1

本节示例使用 v1 运行时（`Workflow\Workflow`、`use function Workflow\activity`、带 `yield` 的生成器风格 `execute()`、`Workflow\Models\StoredWorkflow`）。这些模式仅用于迁移期间仍测试 v1 工作流的测试。新测试应像上文一样，使用 `Workflow\V2\WorkflowStub::fake()`、`Workflow\V2\Workflow` 和直线式 `handle()` 方法。

:::

### 工作流 {#workflows}

可以在测试环境中同步执行工作流，mock 活动和子工作流，在不运行实际实现的情况下定义预期行为和输出。

```
use function Workflow\activity;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        $result = yield activity(MyActivity::class);

        return $result;
    }
}
```

先调用 `WorkflowStub::fake()`，再 mock 活动，即可测试上述工作流。

```
public function testWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyWorkflow::class);
    $workflow->start();

    $this->assertSame($workflow->output(), 'result');
}
```

也可以向 ` WorkflowStub::mock()` 传入回调，代替结果值。

工作流 `$context` 及当前活动的全部参数都会传给回调。

```
public function testWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, function ($context) {
        return 'result';
    });

    $workflow = WorkflowStub::make(MyWorkflow::class);
    $workflow->start();

    $this->assertSame($workflow->output(), 'result');
}
```

可以使用 `assertDispatched`、`assertNotDispatched` 和 `assertNothingDispatched` 方法断言分发了哪些活动或子工作流：

```
WorkflowStub::assertDispatched(MyActivity::class);

// Assert the activity was dispatched twice...
WorkflowStub::assertDispatched(MyActivity::class, 2);

WorkflowStub::assertNotDispatched(MyActivity::class);

WorkflowStub::assertNothingDispatched();
```

可以向 `assertDispatched` 或 `assertNotDispatched` 传入闭包，断言分发的活动或子工作流满足给定“真值测试”。活动或子工作流参数会传给回调。

```
WorkflowStub::assertDispatched(TestOtherActivity::class, function ($string) {
    return $string === 'other';
});
```

### 跳过时间 {#skipping-time}

通过 `$this->travel()` 或 `$this->travelTo()` 调整系统时间，可以模拟依赖时间的工作流，从而测试超时、延迟和其他时间敏感逻辑。

```
use function Workflow\{activity, timer};
use Workflow\Workflow;

class MyTimerWorkflow extends Workflow
{
    public function execute()
    {
        yield timer(60);

        $result = yield activity(MyActivity::class);

        return $result;
    }
}
```

上述工作流在执行活动前等待 60 秒。使用 `$this->travel()` 和 `$workflow->resume()` 可在旧版运行时中跳过这段等待。

```
public function testTimeTravelWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyTimerWorkflow::class);
    $workflow->start();

    $this->travel(120)->seconds();

    $workflow->resume();

    $this->assertSame($workflow->output(), 'result');
}
```

`$this->travel()` 和 `$this->travelTo()` 辅助方法底层使用 `Carbon::setTestNow()`。

### 活动 {#activities}

测试活动与测试 Laravel job 类似：手动创建活动，然后调用 `handle()` 方法。

```
$workflow = WorkflowStub::make(MyWorkflow::class);

$activity = new MyActivity(0, now()->toDateTimeString(), StoredWorkflow::findOrFail($workflow->id()));

$result = $activity->handle();
```

注意，旧版活动仍通过运行时 `handle()` job 方法执行。`Workflow\V2` 中，用户定义的工作流和活动代码同样位于 `handle()` 中。

