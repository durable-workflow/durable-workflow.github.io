---
sidebar_position: 6
title: 工作流 API
sidebar_label: 工作流 API
description: 工作流 API 参考。
tags:
  - reference
  - workflows
  - api
keywords:
  - 工作流 API
---

# 工作流 API {#workflow-api}

本页提供完整参考。更易阅读的介绍请见各功能页面。

- [工作流](./workflows.md)：工作流类的结构和确定性编排模型。
- [活动](./activities.md)：副作用、重试和路由。
- [本地活动](../features/local-activities.md)：具有活动历史和重试语义的短时同进程活动工作。
- [信号](../features/signals.md)、[更新](../features/updates.md)和[查询](../features/queries.md)：工作流对外契约。
- [定时器](../features/timers.md)、[条件等待](../features/condition-waits.md)和[继续为新运行](../features/continue-as-new.md)：长期运行的控制流。
- [消息流](../features/message-streams.md)：具有游标语义的重复有序消息。

## AI 详细参考 {#more-info-for-ai}

大多数读者可以跳过下面的折叠内容。需要准确签名、返回契约、面向机器操作的说明，或集中查看完整 API 时再展开。

<details id="workflow-api-details">
<summary><b>AI 详细参考</b></summary>

**工作流基础对象**

```php
use Workflow\V2\Workflow;

abstract class Workflow
{
    public ?string $connection = null;
    public ?string $queue = null;

    public function workflowId(): string;
    public function runId(): string;
    public function lastChild(): ?ChildWorkflowHandle;
    public function children(): array;
    public function historyLength(): int;
    public function historySize(): int;
    public function shouldContinueAsNew(): bool;
}
```

| 成员 | 使用场景 | 返回契约 |
| --- | --- | --- |
| `workflowId()` | 工作流需要稳定的公开实例 ID。 | 实例 ID 字符串，跨 continue-as-new 保持不变。 |
| `runId()` | 工作流需要当前执行的运行 ID。 | 所选执行的运行 ID 字符串。 |
| `lastChild()` | 工作流需要向最近启动的子工作流发送信号。 | `ChildWorkflowHandle` 或 `null`。 |
| `children()` | 工作流需要当前重放序列可见的子工作流句柄。 | `ChildWorkflowHandle` 列表。 |
| `historyLength()` | 工作流需要基于数量的历史预算指标。 | 当前历史事件数。 |
| `historySize()` | 工作流需要基于字节的历史预算指标。 | 持久化历史大小的近似字节数。 |
| `shouldContinueAsNew()` | 工作流应在历史成本变高前轮换运行。 | 配置的历史预算建议轮换时为 `true`。 |

## 持久命令 {#durable-commands}

静态门面委托给 `Workflow\V2` 命名空间中的辅助函数。以下两种形式等价：

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

$resultFromFacade = Workflow::activity(SendReceipt::class, $orderId);
$resultFromHelper = activity(SendReceipt::class, $orderId);
```

<span id="durable-command-surface"></span>

| 门面 | 辅助函数 | 签名 | 持久效果 |
| --- | --- | --- | --- |
| `Workflow::activity()` | `activity()` | `activity(string $activity, mixed ...$arguments): mixed` | 调度活动并等待结果。 |
| `Workflow::executeActivity()` | `activity()` | `executeActivity(string $activity, mixed ...$arguments): mixed` | `activity()` 的别名。 |
| `Workflow::localActivity()` | `localActivity()` | `localActivity(string $activity, mixed ...$arguments): mixed` | 在当前工作流 Worker 进程中运行短时活动，并记录带 `execution_mode=local` 的活动历史。 |
| `Workflow::executeLocalActivity()` | `localActivity()` | `executeLocalActivity(string $activity, mixed ...$arguments): mixed` | `localActivity()` 的别名。 |
| `Workflow::child()` | `child()` | `child(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | 启动子工作流并等待结果。传入 `ChildWorkflowOptions` 作为第一个参数，可设置父级关闭策略（默认 `ParentClosePolicy::Abandon`）或覆盖子工作流路由。 |
| `Workflow::executeChildWorkflow()` | `child()` | `executeChildWorkflow(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | `child()` 的别名。 |
| `Workflow::async()` | `async()` | `async(callable $callback): mixed` | 将可调用对象作为自动生成的子工作流运行。 |
| `Workflow::all()` | `all()` | `all(iterable $calls): mixed` | 等待并发调用，并按迭代顺序返回结果。 |
| `Workflow::parallel()` | `all()` | `parallel(iterable $calls): mixed` | `all()` 的别名。 |
| `Workflow::select()` | `select()` | `select(iterable $calls): SelectionResult` | 启动独立持久调用，返回第一个已提交的胜出结果及每个成员的稳定句柄。 |
| `Workflow::await()` | `await()` | `await(callable\|string $condition, int\|string\|CarbonInterval\|null $timeout = null, ?string $conditionKey = null): mixed` | 等待具名信号或可安全重放的条件。 |
| `Workflow::awaitWithTimeout()` | `await()` | `awaitWithTimeout(int\|string\|CarbonInterval $timeout, callable\|string $condition, ?string $conditionKey = null): mixed` | 以显式超时等待信号或条件。 |
| `Workflow::awaitSignal()` | `await()` | `awaitSignal(string $name): mixed` | 等待具名信号。 |
| `Workflow::timer()` | `timer()` | `timer(int\|string\|CarbonInterval $duration): mixed` | 暂停，直到持久时间推进。 |
| `Workflow::sideEffect()` | `sideEffect()` | `sideEffect(callable $callback): mixed` | 将非确定性结果记录到历史中并重放该结果。 |
| `Workflow::uuid4()` | `uuid4()` | `uuid4(): mixed` | 生成重放稳定的 UUIDv4。 |
| `Workflow::uuid7()` | `uuid7()` | `uuid7(): mixed` | 生成重放稳定的 UUIDv7。 |
| `Workflow::continueAsNew()` | `continueAsNew()` | `continueAsNew(mixed ...$arguments): mixed` | 结束当前运行，并为同一实例启动新运行。 |
| `Workflow::getVersion()` | `getVersion()` | `getVersion(string $changeId, int $minSupported = WorkflowStub::DEFAULT_VERSION, int $maxSupported = 1): mixed` | 协商可安全重放的工作流代码版本。 |
| `Workflow::patched()` | `patched()` | `patched(string $changeId): mixed` | 返回运行是否经过具名补丁标记。 |
| `Workflow::deprecatePatch()` | `deprecatePatch()` | `deprecatePatch(string $changeId): mixed` | 移除旧代码后仍保留补丁标记。 |
| `Workflow::upsertMemo()` | `upsertMemo()` | `upsertMemo(array $entries): void` | 更新未索引的运行元数据。 |
| `Workflow::upsertSearchAttributes()` | `upsertSearchAttributes()` | `upsertSearchAttributes(array $attributes): void` | 更新已索引、运维可见的元数据。 |
| `Workflow::now()` | `now()` | `now(): CarbonInterface` | 读取确定性的工作流时间。 |

`activity()` 和 `executeActivity()` 调度持久队列活动任务。`localActivity()` 和 `executeLocalActivity()` 在当前工作流 Worker 进程中运行，并记录带本地标记的普通活动历史。不应使用活动重试、超时、心跳或取消语义的可安全重放快照，请使用 `sideEffect()`。多个普通活动步骤需要受支持的 Worker 会话亲和性契约时，使用 `Workflow::workerSession()` 或 `Workflow\V2\workerSession()`。完整执行契约见[活动执行模型](/docs/features/activity-execution-model)、[本地活动](/docs/features/local-activities)和 [Worker 会话](/docs/features/worker-sessions)。

**定时器辅助函数**

定时器辅助函数是 `timer()` 和 `Workflow::timer()` 的简写：

```php
use Workflow\V2\Workflow;

Workflow::seconds(30);
Workflow::minutes(5);
Workflow::hours(2);
Workflow::days(1);
Workflow::weeks(1);
Workflow::months(1);
Workflow::years(1);
```

| 辅助函数 | 等价调用 |
| --- | --- |
| `seconds(int $seconds)` | `timer($seconds)` |
| `minutes(int $minutes)` | `timer($minutes * 60)` |
| `hours(int $hours)` | `timer($hours * 3600)` |
| `days(int $days)` | `timer($days * 86400)` |
| `weeks(int $weeks)` | `timer($weeks * 604800)` |
| `months(int $months)` | `timer("{$months} months")` |
| `years(int $years)` | `timer("{$years} years")` |

时长来自配置或工作流输入时，使用显式 `timer()` 调用。希望源码直接表达固定业务等待时，使用定时器辅助函数。

**消息流**

从工作流实例打开持久消息流：

```php
use Workflow\V2\MessageStream;
use Workflow\V2\Workflow;

final class AssistantWorkflow extends Workflow
{
    public function handle(string $targetWorkflowId): array
    {
        $message = $this->inbox('ai.user')->receiveOne();

        if ($message === null) {
            return ['status' => 'waiting'];
        }

        $reply = $this->outbox('ai.assistant')->sendReference(
            targetInstanceId: $targetWorkflowId,
            payloadReference: 'app://payloads/reply-123',
            correlationId: $this->workflowId(),
            idempotencyKey: 'reply-123',
            metadata: ['kind' => 'assistant_reply'],
        );

        return [
            'status' => 'sent',
            'stream' => $reply->stream_key,
            'sequence' => $reply->sequence,
        ];
    }
}
```

| 方法 | 签名 | 契约 |
| --- | --- | --- |
| `$this->messages()` | `messages(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | 打开流以读取或发送。 |
| `$this->inbox()` | `inbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | 用于入站消息编写代码的别名。 |
| `$this->outbox()` | `outbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | 用于出站消息编写代码的别名。 |
| `MessageStream::key()` | `key(): string` | 返回流键。 |
| `MessageStream::cursor()` | `cursor(): int` | 返回本次运行的持久游标位置。 |
| `MessageStream::hasPending()` | `hasPending(): bool` | 返回流中是否有未消费消息。 |
| `MessageStream::pendingCount()` | `pendingCount(): int` | 返回流中未消费消息数。 |
| `MessageStream::peek()` | `peek(int $limit = 100): Collection` | 读取待处理消息，不消费它们。 |
| `MessageStream::receive()` | `receive(int $limit = 1, ?int $consumedBySequence = null): Collection` | 读取并消费消息，记录游标推进。 |
| `MessageStream::receiveOne()` | `receiveOne(?int $consumedBySequence = null): ?WorkflowMessage` | 读取并消费一条消息。 |
| `MessageStream::sendReference()` | `sendReference(string $targetInstanceId, ?string $payloadReference = null, MessageChannel\|string $channel = MessageChannel::WorkflowMessage, ?string $correlationId = null, ?string $idempotencyKey = null, array $metadata = [], ?DateTimeInterface $expiresAt = null): WorkflowMessage` | 向另一个工作流实例发送有序的载荷引用消息。 |

具有游标语义的重复有序消息使用消息流。一次性外部事件使用[信号](../features/signals.md)，请求／返回式状态变更使用[更新](../features/updates.md)。

**特性与公开契约**

```php
use Workflow\QueryMethod;
use Workflow\UpdateMethod;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string', 'allows_null' => false],
])]
final class OrderApprovalWorkflow extends Workflow
{
    private string $stage = 'waiting';

    public function handle(): void
    {
        $this->stage = Workflow::awaitSignal('approved-by');
    }

    #[QueryMethod('current-stage')]
    public function currentStage(): string
    {
        return $this->stage;
    }

    #[UpdateMethod('mark-ready')]
    public function markReady(): string
    {
        return $this->stage = 'ready';
    }
}
```

| 特性 | 目标 | 稳定契约 |
| --- | --- | --- |
| `#[Type('type-key')]` | 工作流或活动类 | 声明语言无关的持久类型键。 |
| `#[Signal('signal-name', [...])]` | 工作流类，可重复声明 | 声明接受的信号名及可选的有序参数契约。 |
| `#[QueryMethod('query-name')]` | 工作流方法 | 声明可安全重放的查询名。省略名称则使用 PHP 方法名。 |
| `#[UpdateMethod('update-name')]` | 工作流方法 | 声明可安全重放的更新名。省略名称则使用 PHP 方法名。 |

信号、查询和更新是公开的工作流契约。优先使用显式名称，避免 PHP 方法重命名破坏 API。

**故障接口**

除非命令在执行前被拒绝，否则编写 API 的故障都是持久工作流故障：

| 接口 | 典型故障 | 运维含义 |
| --- | --- | --- |
| `activity()` | 活动抛出异常、超时或用尽重试策略。 | 运行记录活动故障历史，并遵循工作流错误处理。 |
| `child()` | 子工作流失败、取消、终止或超时。 | 父工作流在等待的命令处观察到子工作流故障结果。 |
| `await()` | 条件或信号满足前已超时。 | 等待根据所选 await 形式返回或失败。 |
| `timer()` | 规范化后的时长输入无效。 | 编写代码时应传入正时长或显式零时长等待。 |
| `continueAsNew()` | 无法创建新运行。 | 当前运行仍是该转换失败的证据所在。 |
| `upsertSearchAttributes()` | 属性键、数量或总大小超出限制。 | 运行在无效索引元数据持久化前失败。 |
| `MessageStream::receive()` | 没有可用的正数工作流历史序列。 | 接收必须发生在工作流执行中，不能从服务代码直接接收。 |
| `MessageStream::sendReference()` | 载荷引用、路由或存储契约在下游无效。 | 消息顺序与载荷存储完整性保持独立。 |

载荷和历史限制见[结构限制](../constraints/structural-limits.md)。PHP 工作流代码之外的命令拒绝响应见 [Server API 参考](../polyglot/server-api-reference.md)。

**确定性规则**

工作流代码必须可安全重放。将不可逆或非确定性工作放在持久命令之后：

```php
use Workflow\V2\Workflow;

final class DeterministicWorkflow extends Workflow
{
    public function handle(): array
    {
        $workflowTime = Workflow::now();
        $stableId = Workflow::uuid7();
        $remoteQuote = Workflow::activity(FetchQuote::class);

        return [
            'time' => $workflowTime->toIso8601String(),
            'id' => $stableId,
            'quote' => $remoteQuote,
        ];
    }
}
```

- 工作流分支使用 `Workflow::now()`，而非系统时钟。
- 使用 `Workflow::uuid4()` 或 `Workflow::uuid7()`，而非直接使用随机来源。
- 将网络调用、文件系统写入、邮件发送和外部副作用放入活动。
- 只有值必须捕获到历史中，且副作用本身不是业务操作时，才使用 `Workflow::sideEffect()`。
- 使用 `Workflow::getVersion()`、`Workflow::patched()` 和 `Workflow::deprecatePatch()` 演进工作流代码，避免破坏重放。

</details>
