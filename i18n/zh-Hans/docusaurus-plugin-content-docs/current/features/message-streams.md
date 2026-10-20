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

消息流以实例为中心。工作流继续为新运行时，待处理入站消息和游标位置转移到新运行。已消费消息仍附着在原运行上，作为历史证据。

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
