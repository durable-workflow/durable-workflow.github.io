---
sidebar_position: 18
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

This page describes the embedded Laravel inbox/outbox API. Server-owned
[Workflow Streams](/docs/polyglot/workflow-streams/) reuse names such as
stream, offset, pending count, lifecycle, and error where their semantics
match, but they are output-only. They do not add inbound workflow messaging or
continue-as-new cursor transfer to service mode.

Workflow authors should use the first-class facade:

- `$this->inbox('stream-key')`
- `$this->outbox('stream-key')`
- `$this->messages('stream-key')`
- `Workflow\V2\MessageStream`

Do not write `workflow_messages` rows or cursor rows directly from application
workflow code. The facade is the stable contract; lower-level message services
exist for package/runtime integration.

:::warning Message streams in Workflow 2.20.0 and earlier

Workflow code replays on every later workflow task and on every query. In
Workflow releases through 2.20.0, `outbox()->sendReference()` writes a new
outbound and inbound message on each replay, and `inbox()->receive()` and
`receiveOne()` can return a different message, or none, on replay
([workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)).
Workflow 2.20.1 fixes this: a replay returns what the original call sent or
received, and a query never writes or consumes a message.

- Rows that earlier releases duplicated are not removed. Give each logical
  send a stable `idempotencyKey`, such as `reply:{turn}`, and deduplicate by
  `idempotency_key` when consuming a stream that an earlier release wrote.
  Messages that an earlier release consumed under the wrong step stay
  consumed.
- In every release, signals and all streams share one message cursor, so a
  signal delivered after a pending stream message hides that message
  ([workflow#1011](https://github.com/durable-workflow/workflow/issues/1011)).
  Receive only after a signal or condition says a message is there, and send
  that signal before the message.

:::

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
inbound messages move to the continued run, the cursor position carries
forward, and consumed messages remain attached to the original run as
historical evidence. Workflow 2.20.1 and earlier moved only the cursor:
messages still pending when the run continued as new stayed on the closed run,
and the continued run never received them
([workflow#1018](https://github.com/durable-workflow/workflow/issues/1018),
fixed in 2.20.2). On those releases, receive pending messages before you call
`continueAsNew()`, or send input that must survive the handoff as a
[signal](./signals.md): accepted signals that the run has not applied move to
the continued run.

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
[Sample App](/docs/sample-app) is the runnable reference for the
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
