---
sidebar_position: 3.5
tags:
  - message-streams
  - workflows
  - continue-as-new
  - AI
keywords:
  - message streams
  - Workflow inbox
  - Workflow outbox
  - MessageStream
  - repeated workflow messages
---

# Message Streams

Message streams are the v2 authoring surface for repeated workflow messages:
human input loops, assistant replies, workflow-to-workflow notifications, and
other ordered messages that must survive replay and continue-as-new.

Workflow authors should use the first-class facade:

- `$this->inbox('stream-key')`
- `$this->outbox('stream-key')`
- `$this->messages('stream-key')`
- `Workflow\V2\MessageStream`

Do not write `workflow_messages` rows or cursor rows directly from application
workflow code. The facade is the stable contract; lower-level message services
exist for package/runtime integration.

## Receiving Messages

Use `peek()` when a workflow needs to inspect pending inbound messages without
advancing its durable cursor. Use `receive()` or `receiveOne()` when the
workflow is ready to consume messages and record cursor advancement in history.

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

`peek()` is read-only. `receive()` and `receiveOne()` mark messages consumed and
advance the durable message cursor for the current run. Cursor advancement is a
history fact, so replay, Waterline exports, and continue-as-new handoff can all
reason about which inbound messages were already consumed.

## Sending References

Use `outbox(...)->sendReference(...)` when a workflow needs to publish an
ordered outbound message. The message table stores routing metadata and a
payload reference; large or application-owned content stays in the app's
payload store.

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

This keeps the workflow history small and lets consumers validate the payload
store separately from durable message ordering.

## Continue-As-New

Message streams are instance-first. When a workflow continues as new, pending
inbound messages and the cursor position are transferred to the continued run.
Consumed messages remain attached to the original run as historical evidence.

That means a long-lived workflow can shed history and keep the same public
message route:

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

The caller keeps addressing the workflow instance id. It does not need to know
which run currently owns the stream cursor.

## Authoring Rules

- Use semantic stream keys such as `ai.assistant`, `human.replies`, or
  `approval.requests`; treat them as part of the workflow's public contract.
- Use `peek()` for inspection and `receive()` / `receiveOne()` for durable
  consumption.
- Use `sendReference()` for outbound messages; store large payloads in an
  application payload store and pass a reference.
- Keep application code on `Workflow::inbox()`, `Workflow::outbox()`, and
  `MessageStream`; do not depend on `MessageService`, `WorkflowMessage`, or
  cursor-row writes as the authoring pattern.
- For one-shot external events, use [Signals](./signals.md). For request/return
  state changes, use [Updates](./updates.md). Use message streams when repeated
  ordered messages need cursor semantics.

## Run this pattern

The travel-agent workflow in the
[Sample App](/docs/2.0/sample-app) is the runnable reference for the
inbox/outbox shape this page describes:

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` stores large assistant payloads in the
app-owned `ai_workflow_messages` table and publishes only a durable
reference on the `ai.assistant` outbox. Replies arrive through the
matching inbox stream via the `receive` update. Read the workflow class
next to this page to see the same `inbox()` / `outbox()` /
`sendReference()` calls the snippets above use, end to end.
