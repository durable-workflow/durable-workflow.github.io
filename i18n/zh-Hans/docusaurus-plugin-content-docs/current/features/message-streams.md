---
sidebar_position: 18
tags:
  - message-streams
  - workflows
  - continue-as-new
  - AI
keywords:
  - 消息流
  - 工作流收件箱
  - 工作流发件箱
  - MessageStream
  - 重复工作流消息
---

# 消息流 {#message-streams}

消息流是 v2 编写重复工作流消息的接口，适用于人工输入循环、助手回复、工作流之间的通知，以及其他必须在重放和 continue-as-new 后保留的有序消息。

本页介绍嵌入式 Laravel 的收件箱／发件箱 API。由 Server 管理的[工作流输出流](/docs/polyglot/workflow-streams/)在语义相符时复用流、偏移量、待处理数量、生命周期和错误等名称，但仅用于输出。它们不会为服务模式增加入站工作流消息或 continue-as-new 游标转移。

工作流作者应使用正式门面：

- `$this->inbox('stream-key')`
- `$this->outbox('stream-key')`
- `$this->messages('stream-key')`
- `Workflow\V2\MessageStream`

不要从应用工作流代码直接写入 `workflow_messages` 行或游标行。门面才是稳定契约；底层消息服务用于包／运行时集成。

:::warning Workflow 2.20.3 之前的消息流

工作流代码会在之后的每个工作流任务和每次查询时重放。在 Workflow 2.20.0 及更早的版本中，`outbox()->sendReference()` 每次重放都会写入新的出站消息和入站消息，而 `inbox()->receive()` 和 `receiveOne()` 在重放时可能返回不同的消息或不返回消息（[workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)）。Workflow 2.20.1 会记录发送和接收以供重放，并阻止查询写入或消费消息。
空接收和跨步骤保留的流还需要下文介绍的 2.20.3 重放修复。

- 早期版本重复写入的行不会被删除。请为每次逻辑发送提供稳定的 `idempotencyKey`，例如 `reply:{turn}`，并在消费由早期版本写入的流时按 `idempotency_key` 去重。早期版本在错误步骤下消费的消息仍保持已消费状态。
- 信号、更新和所有流共享同一个消息游标。在 2.20.2 及更早版本中，信号、
  更新或另一条流上的接收可能将游标移到待处理消息之后，从而隐藏这些消息
  （[workflow#1011](https://github.com/durable-workflow/workflow/issues/1011)）。
  对于这些版本中的信号顺序问题，请在消息之前发送信号，并且只在信号或条件
  表明有消息时才接收。

:::

## 流升级与回退 {#stream-upgrades}

在 Workflow 2.20.3 中，共享游标不再对 `receive()`、`receiveOne()`、`peek()`、
`pendingCount()` 或 `hasPending()` 隐藏待处理消息。接收仍遵守序号顺序和
批次大小限制。升级后，接收循环可能先返回以前被共享游标隐藏的较早待处理
消息，再返回较新的消息。

重放的接收返回原始步骤消费的内容。如果原始调用没有找到消息，重放时仍然
不返回消息。首次执行的更新处理器仍可以接收消息。保存在属性中的流现在按
当前工作流步骤记录接收，而不是按打开流时的步骤记录。旧版本按打开步骤
记录的接收仍可重放。

在将嵌入式应用回退到 2.20.3 之前的版本前，请使用新包写入的历史通过
[重放测试门槛](../testing.md#replay-before-deployment)。旧版本按打开步骤
查找保留流的接收，可能以不同方式重放这些运行。回退还会恢复共享游标、
空接收重放和 fake 任务处理精度问题。参阅
[该标签的兼容性说明](https://github.com/durable-workflow/workflow/blob/2.20.3/CHANGELOG.md#2203---2026-11-04)。

[workflow#1024](https://github.com/durable-workflow/workflow/issues/1024)
中的查询限制仍然存在：查询可能不返回更新处理器已接收的消息，因为它在
错误的步骤重放处理器。查询不会更改消息行。工作流自身的重放和完成后的
输出仍会返回处理器接收的内容。

## 接收消息 {#receiving-messages}

工作流只需检查待处理入站消息，不推进持久游标时，使用 `peek()`。准备消费消息并在历史中记录游标推进时，使用 `receive()` 或 `receiveOne()`。

```php
use Workflow\V2\Workflow;

final class ApprovalInboxWorkflow extends Workflow
{
    public function handle(): array
    {
        $pending = $this->inbox('approval.requests')->peek(limit: 10);

        if ($pending->isEmpty()) {
            return ['status' => 'waiting'];
        }

        $message = $this->inbox('approval.requests')->receiveOne();

        return [
            'status' => 'received',
            'payload_reference' => $message?->payload_reference,
            'correlation_id' => $message?->correlation_id,
        ];
    }
}
```

`peek()` 是只读操作。`receive()` 和 `receiveOne()` 将消息标记为已消费，并推进当前运行的持久消息游标。游标推进是历史事实，因此重放、Waterline 导出和 continue-as-new 交接都能确定哪些入站消息已消费。

## 发送引用 {#sending-references}

工作流需要发布有序出站消息时，使用 `outbox(...)->sendReference(...)`。消息表保存路由元数据和载荷引用；大型或由应用管理的内容保留在应用载荷存储中。

```php
use Workflow\V2\Workflow;

final class AssistantReplyWorkflow extends Workflow
{
    public function handle(string $targetWorkflowId, string $replyReference): array
    {
        $message = $this->outbox('ai.assistant')->sendReference(
            targetInstanceId: $targetWorkflowId,
            payloadReference: $replyReference,
            correlationId: $this->workflowId(),
            metadata: ['kind' => 'assistant_reply'],
        );

        return [
            'status' => 'sent',
            'stream' => $message->stream_key,
            'sequence' => $message->sequence,
        ];
    }
}
```

这样可保持工作流历史紧凑，消费者也可将载荷存储校验与持久消息顺序分开处理。

## 继续为新运行 {#continue-as-new}

消息流以实例为中心。工作流继续为新运行时，待处理的入站消息会转移到新运行，游标位置随之延续，已消费消息仍附着在原运行上，作为历史证据。Workflow 2.20.1 及之前的版本只转移游标：继续为新运行时仍待处理的消息会留在已关闭的运行上，新运行永远收不到这些消息（[workflow#1018](https://github.com/durable-workflow/workflow/issues/1018)，已在 2.20.2 中修复）。在这些版本中，请在调用 `continueAsNew()` 之前接收待处理消息，或将必须在交接后保留的输入作为[信号](./signals.md)发送：运行尚未应用的已接受信号会转移到新运行。

因此，长期运行的工作流可以释放历史，同时保留同一公开消息路由：

```php
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

final class HumanInputLoopWorkflow extends Workflow
{
    public function handle(int $iteration = 0): array
    {
        $message = $this->inbox('human.replies')->receiveOne();

        if ($message === null) {
            return ['status' => 'waiting', 'iteration' => $iteration];
        }

        if ($this->shouldContinueAsNew()) {
            return continueAsNew($iteration + 1);
        }

        return [
            'status' => 'processed',
            'iteration' => $iteration,
            'payload_reference' => $message->payload_reference,
        ];
    }
}
```

调用方继续通过工作流实例 ID 访问，无需知道当前哪个运行持有流游标。

## 编写规则 {#authoring-rules}

- 使用 `ai.assistant`、`human.replies` 或 `approval.requests` 等具有语义的流键，将其视为工作流公开契约的一部分。
- 检查使用 `peek()`，持久消费使用 `receive()` / `receiveOne()`。
- 出站消息使用 `sendReference()`；大型载荷存入应用载荷存储，并传递引用。
- 应用代码使用 `Workflow::inbox()`、`Workflow::outbox()` 和 `MessageStream`，不要将 `MessageService`、`WorkflowMessage` 或直接写游标行作为编写模式。
- 一次性外部事件使用[信号](./signals.md)。请求／返回式状态变更使用[更新](./updates.md)。重复有序消息需要游标语义时，使用消息流。

## 运行此模式 {#run-this-pattern}

[示例应用](/docs/sample-app)中的旅行助手工作流，是本页所述收件箱／发件箱形式的可运行参考：

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` 将大型助手载荷存入应用管理的 `ai_workflow_messages` 表，只在 `ai.assistant` 发件箱发布持久引用。回复通过 `receive` 更新进入对应收件箱流。结合本页阅读工作流类，可端到端查看与上述示例相同的 `inbox()` / `outbox()` / `sendReference()` 调用。
