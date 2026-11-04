---
sidebar_position: 8
tags:
  - signals
  - queries
  - continue-as-new
  - sample-app
keywords:
  - 对话式工作流
  - 长期对话
  - 人工审批
  - Worker 替换
---

# 对话式工作流参考 {#conversational-workflow-reference}

本页是嵌入式 Laravel 运行时中长期对话的一个可运行参考。它组合了几项各有独立指南的功能：用[信号](./features/signals.md)传递有序输入，用[活动](./defining-workflows/activities.md)执行模型工作，用[查询](./features/queries.md)获取状态，用[继续为新运行](./features/continue-as-new.md)限制历史规模。服务模式 Worker 通过各自的 [SDK 指南](./polyglot/deployment-modes.md)使用相同的基础原语。示例应用还在 PHP SDK Worker 上运行这个对话；参见[在 PHP 服务模式 Worker 上运行对话](https://github.com/durable-workflow/sample-app#conversation-on-a-php-service-mode-worker)（`php artisan app:service-mode-conversation`）。

源码是[示例应用](./sample-app.md)中位于 [`app/Workflows/Conversation`](https://github.com/durable-workflow/sample-app/tree/main/app/Workflows/Conversation) 的 `ConversationWorkflow`。它使用确定性的模拟模型，因此无需 AI 提供商账号或密钥。它是持久性模式的参考，不是生产级聊天机器人，也不作任何延迟或规模承诺。

## 运行 {#run-it}

在示例应用的队列 Worker 运行时（`composer run dev`）执行：

```bash
php artisan app:conversation \
  --message="Hello" \
  --message="Please refund my order" \
  --message="Thanks" \
  --turns-per-run=2
```

不带 `--message` 时，命令会请求输入。包含 “refund” 的消息会让模拟模型提议一个操作，命令随后请求审批。`--decision=decline` 以拒绝答复脚本化的审批。打开 `/waterline` 可检查链中的每个运行。对话在一小时内没有收到消息后结束；如果审批人在五分钟内未对提议作出决定，则不做任何更改。

## 一轮对话如何执行 {#how-a-turn-works}

```php
#[Signal('message', [['name' => 'text', 'type' => 'string']])]
#[Signal('decision', [
    ['name' => 'proposalId', 'type' => 'string'],
    ['name' => 'approved', 'type' => 'bool'],
    ['name' => 'reviewer', 'type' => 'string'],
])]
class ConversationWorkflow extends Workflow
{
    public function handle(
        array $state = [],
        int $turnsPerRun = 3,
        string $inactivityTimeout = '1 hour',
        string $approvalTimeout = '5 minutes',
    ): array {
        $this->state = array_replace($this->state, $state);

        while (true) {
            if ($this->turnsThisRun >= $turnsPerRun) {
                return continueAsNew(
                    array_replace($this->state, ['generation' => $this->state['generation'] + 1]),
                    $turnsPerRun,
                    $inactivityTimeout,
                    $approvalTimeout,
                );
            }

            $text = await('message', $inactivityTimeout);

            // A null text is the inactivity timeout; "/end" finishes.
            // Otherwise one turn runs:
            //   activity(FakeModelActivity::class, ...) proposes a reply
            //   uuid4() records an ID for a proposed action (replay-safe)
            //   await('decision', ...) waits up to $approvalTimeout for a decision naming that ID
            //   activity(RecordReplyActivity::class, ...) stores the reply
        }
    }
}
```

1. 每个 `message` 信号是一条用户输入。工作流按消息被接受的顺序，每轮应用一条已接受的消息。
2. 模型调用在活动中执行。重放复用已记录的结果，而不会再次调用模型。
3. 模型提议操作时，工作流用 `uuid4()` 为该提议生成 ID。`uuid4()` 会把该值记录到历史中，因此重放时返回相同的 ID。随后工作流最多等待 `$approvalTimeout`（独立于不活动超时）来接收携带该 ID 的 `decision` 信号；`status` 查询会报告这个 ID。信号按名称缓冲，因此针对其他提议的决定（过早发送、重复发送或在响应不确定后重试）会被忽略，而不会应用到下一个提议，也不会延长截止时间。只有批准当前待处理的提议才会运行 `ApplyApprovedActionActivity`。拒绝或超时会记录回复，不做任何更改。
4. `RecordReplyActivity` 将回复写入应用的 `conversation_records` 表，存储在由工作流 ID 和轮次编号构成的引用下。历史只存储该引用。
5. `status` 查询报告阶段（`waiting_for_input`、`thinking`、`awaiting_approval`、`applying_action`、`recording_reply`、`continuing_as_new` 或 `completed`）、代次、轮次计数、任何待处理的提议以及最新回复引用。通过该引用读取回复文本。

## Worker 丢失后哪些状态得以保留 {#what-survives-a-lost-worker}

示例的测试每次只让引擎执行一个任务，并在选定位置停止 Worker：

| 故障 | 结果 |
| --- | --- |
| Worker 租用应用某条消息的任务后崩溃 | 租约过期前不会有任何进展。随后修复扫描将同一任务交给另一个 Worker，由它将该消息应用一次。 |
| 模型活动运行期间 Worker 崩溃 | 租约过期后，该活动在另一个 Worker 上重试。运行为该活动记录一次完成，回复也只记录一次。 |
| 回复 Worker 写入行后、报告前崩溃 | 重试会再次运行该活动。由于该行以引用为键，最终只保留一条回复。 |

活动遵循至少一次语义：重试可能重复已在引擎外部发生的工作。持久历史对每个结果只记录一次。请像回复引用和操作引用那样，为每个副作用提供稳定的键，并将同一个键传给任何外部系统。参见[执行保证](./constraints/execution-guarantees.md)和[租约过期与重新投递](./constraints/execution-guarantees.md#lease-expiry-and-redelivery)。

## 限制历史规模 {#bounding-history}

经过 `$turnsPerRun` 轮后，运行会继续为新运行。下一个运行只接收显式传给 `continueAsNew()` 的状态：代次、轮次计数、有界摘要和最新回复引用。工作流对象上的其他属性通过重放重建，不会被复制。

已接受但尚未应用的消息会按原始顺序移到下一个运行。这适用于发送给工作流实例的已声明信号。发送给某个具体运行的信号，如果该运行先关闭，则会被拒绝。参见[信号接受与关闭](./features/signals.md#acceptance-and-closure)和[继续为新运行](./features/continue-as-new.md)。

## 仍需自行负责的事项 {#what-stays-your-responsibility}

- **载荷存储。** 示例将回复文本保存在应用表中。请自行决定其保留期限、访问控制和备份，或使用[外部负载存储](./features/external-payload-storage.md)。
- **摘要。** 模拟模型维护固定长度的滚动摘要。使用真实模型时，需要自行决定哪些上下文跨越继续为新运行传递，以及它可以增长到多大。
- **谁可以发送输入或审批。** 引擎记录信号及其参数。请在发送信号前，在应用中对发送方和审批人进行身份验证和授权；参见[发送方身份与授权](./features/signals.md#sender-identity-and-authorization)。
- **外部效果。** 引擎不会让外部调用恰好执行一次。请像已批准操作活动那样使用幂等键。
- **重试的信号发送。** 如果某次信号发送的响应丢失，再次发送前请参见[响应不确定之后](./features/signals.md#after-an-uncertain-response)。

示例通过活动存储回复，不在工作流代码中使用消息流。在 Workflow 2.20.0 及更早的版本中，工作流代码里的 `outbox()->sendReference()` 和 `inbox()->receive()` 不可安全重放（[workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)）；参见[消息流](./features/message-streams.md)中的警告。

## 相关指南 {#related-guides}

- [信号](./features/signals.md)和[查询](./features/queries.md)
- [继续为新运行](./features/continue-as-new.md)
- [消息流](./features/message-streams.md)
- [活动](./defining-workflows/activities.md)和[执行保证](./constraints/execution-guarantees.md)
- [故障与恢复](./failures-and-recovery.md)
- [示例应用](./sample-app.md)
