---
sidebar_position: 6
title: Workflow API
sidebar_label: Workflow API
description: Workflow API reference.
tags:
  - reference
  - workflows
  - api
keywords:
  - workflow API
---

# Workflow API

This page is the complete reference. For an easier to read version, please look at the individual feature page.

- [Workflows](./workflows.md) for the workflow class shape and deterministic
  orchestration model.
- [Activities](./activities.md) for side effects, retries, and routing.
- [Signals](../features/signals.md), [Updates](../features/updates.md), and
  [Queries](../features/queries.md) for workflow-facing contracts.
- [Timers](../features/timers.md),
  [Condition Waits](../features/condition-waits.md), and
  [Continue As New](../features/continue-as-new.md) for long-running control
  flow.
- [Message Streams](../features/message-streams.md) for repeated ordered
  messages with cursor semantics.

## More Info for AI

Most readers can skip the disclosure below. Open it when you need exact
signatures, return contracts, machine-operable notes, or the full API
surface in one place.

<details>
<summary><b>More Info for AI</b></summary>

**Base workflow object**

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

| Member | Use when | Return contract |
| --- | --- | --- |
| `workflowId()` | The workflow needs its stable public instance id. | Instance id string, unchanged across continue-as-new. |
| `runId()` | The workflow needs the currently executing run id. | Run id string for the selected execution. |
| `lastChild()` | The workflow needs to signal the most recently spawned child. | `ChildWorkflowHandle` or `null`. |
| `children()` | The workflow needs handles for children visible to the current replay sequence. | List of `ChildWorkflowHandle`. |
| `historyLength()` | The workflow needs a count-based history budget signal. | Current history event count. |
| `historySize()` | The workflow needs a byte-based history budget signal. | Approximate persisted history size in bytes. |
| `shouldContinueAsNew()` | The workflow should rotate before history becomes expensive. | `true` when configured history budgets recommend rotation. |

**Durable commands**

The static facade delegates to namespaced helpers in `Workflow\V2`. The two
forms are equivalent:

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

$resultFromFacade = Workflow::activity(SendReceipt::class, $orderId);
$resultFromHelper = activity(SendReceipt::class, $orderId);
```

| Facade | Helper | Signature | Durable effect |
| --- | --- | --- | --- |
| `Workflow::activity()` | `activity()` | `activity(string $activity, mixed ...$arguments): mixed` | Schedules an activity and waits for its result. |
| `Workflow::executeActivity()` | `activity()` | `executeActivity(string $activity, mixed ...$arguments): mixed` | Alias for `activity()`. |
| `Workflow::child()` | `child()` | `child(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | Starts a child workflow and waits for its result. Pass a `ChildWorkflowOptions` as the first argument to set the parent-close policy (default `ParentClosePolicy::Abandon`) or override child routing. |
| `Workflow::executeChildWorkflow()` | `child()` | `executeChildWorkflow(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | Alias for `child()`. |
| `Workflow::async()` | `async()` | `async(callable $callback): mixed` | Runs a callable as an auto-generated child workflow. |
| `Workflow::all()` | `all()` | `all(iterable $calls): mixed` | Waits for concurrent calls and returns results in iteration order. |
| `Workflow::parallel()` | `all()` | `parallel(iterable $calls): mixed` | Alias for `all()`. |
| `Workflow::await()` | `await()` | `await(callable|string $condition, int|string|CarbonInterval|null $timeout = null, ?string $conditionKey = null): mixed` | Waits for a named signal or replay-safe condition. |
| `Workflow::awaitWithTimeout()` | `await()` | `awaitWithTimeout(int|string|CarbonInterval $timeout, callable|string $condition, ?string $conditionKey = null): mixed` | Waits for a signal or condition with an explicit timeout. |
| `Workflow::awaitSignal()` | `await()` | `awaitSignal(string $name): mixed` | Waits for a named signal. |
| `Workflow::timer()` | `timer()` | `timer(int|string|CarbonInterval $duration): mixed` | Suspends until durable time advances. |
| `Workflow::sideEffect()` | `sideEffect()` | `sideEffect(callable $callback): mixed` | Records a non-deterministic result in history and replays it. |
| `Workflow::uuid4()` | `uuid4()` | `uuid4(): mixed` | Generates a replay-stable UUIDv4. |
| `Workflow::uuid7()` | `uuid7()` | `uuid7(): mixed` | Generates a replay-stable UUIDv7. |
| `Workflow::continueAsNew()` | `continueAsNew()` | `continueAsNew(mixed ...$arguments): mixed` | Ends the current run and starts a new run for the same instance. |
| `Workflow::getVersion()` | `getVersion()` | `getVersion(string $changeId, int $minSupported = WorkflowStub::DEFAULT_VERSION, int $maxSupported = 1): mixed` | Negotiates a replay-safe workflow-code version. |
| `Workflow::patched()` | `patched()` | `patched(string $changeId): mixed` | Returns whether the run crossed a named patch marker. |
| `Workflow::deprecatePatch()` | `deprecatePatch()` | `deprecatePatch(string $changeId): mixed` | Keeps a patch marker alive after old code is removed. |
| `Workflow::upsertMemo()` | `upsertMemo()` | `upsertMemo(array $entries): void` | Updates non-indexed run metadata. |
| `Workflow::upsertSearchAttributes()` | `upsertSearchAttributes()` | `upsertSearchAttributes(array $attributes): void` | Updates indexed operator-visible metadata. |
| `Workflow::now()` | `now()` | `now(): CarbonInterface` | Reads deterministic workflow time. |

`activity()` and `executeActivity()` always schedule durable queued activity
tasks. Durable Workflow v2 does not have a local-activity primitive; use
`sideEffect()` for replay-safe snapshots that should not cross the queue.
Use `Workflow::workerSession()` or `Workflow\V2\workerSession()` when multiple
activity steps need the supported worker-session affinity contract. See
[Activity Execution Model](/docs/2.0/features/activity-execution-model) and
[Worker Sessions](/docs/2.0/features/worker-sessions) for the full execution
contract.

**Timer helpers**

Timer helpers are shorthand for `timer()` and `Workflow::timer()`:

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

| Helper | Equivalent |
| --- | --- |
| `seconds(int $seconds)` | `timer($seconds)` |
| `minutes(int $minutes)` | `timer($minutes * 60)` |
| `hours(int $hours)` | `timer($hours * 3600)` |
| `days(int $days)` | `timer($days * 86400)` |
| `weeks(int $weeks)` | `timer($weeks * 604800)` |
| `months(int $months)` | `timer("{$months} months")` |
| `years(int $years)` | `timer("{$years} years")` |

Use explicit `timer()` calls when the duration comes from configuration or
workflow input. Use timer helpers when the source code should read as a fixed
business wait.

**Message streams**

Open durable message streams from the workflow instance:

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

| Method | Signature | Contract |
| --- | --- | --- |
| `$this->messages()` | `messages(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Opens the stream for reading or sending. |
| `$this->inbox()` | `inbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Alias for inbound authoring code. |
| `$this->outbox()` | `outbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Alias for outbound authoring code. |
| `MessageStream::key()` | `key(): string` | Returns the stream key. |
| `MessageStream::cursor()` | `cursor(): int` | Returns the durable cursor position for this run. |
| `MessageStream::hasPending()` | `hasPending(): bool` | Returns whether unconsumed messages exist on the stream. |
| `MessageStream::pendingCount()` | `pendingCount(): int` | Returns the number of unconsumed messages on the stream. |
| `MessageStream::peek()` | `peek(int $limit = 100): Collection` | Reads pending messages without consuming them. |
| `MessageStream::receive()` | `receive(int $limit = 1, ?int $consumedBySequence = null): Collection` | Reads and consumes messages, recording cursor advancement. |
| `MessageStream::receiveOne()` | `receiveOne(?int $consumedBySequence = null): ?WorkflowMessage` | Reads and consumes one message. |
| `MessageStream::sendReference()` | `sendReference(string $targetInstanceId, ?string $payloadReference = null, MessageChannel|string $channel = MessageChannel::WorkflowMessage, ?string $correlationId = null, ?string $idempotencyKey = null, array $metadata = [], ?DateTimeInterface $expiresAt = null): WorkflowMessage` | Sends an ordered payload-reference message to another workflow instance. |

Use message streams for repeated ordered messages with cursor semantics. Use
[Signals](../features/signals.md) for one-shot external events and
[Updates](../features/updates.md) for request/return mutations.

**Attributes and public contracts**

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

| Attribute | Target | Stable contract |
| --- | --- | --- |
| `#[Type('type-key')]` | Workflow or activity class | Declares the language-neutral durable type key. |
| `#[Signal('signal-name', [...])]` | Workflow class, repeatable | Declares accepted signal names and optional ordered parameter contracts. |
| `#[QueryMethod('query-name')]` | Workflow method | Declares a replay-safe query name. Omit the name to use the PHP method name. |
| `#[UpdateMethod('update-name')]` | Workflow method | Declares a replay-safe update name. Omit the name to use the PHP method name. |

Signals, queries, and updates are public workflow contracts. Prefer explicit
names so PHP method renames do not become API breaks.

**Failure surface**

Authoring API failures are durable workflow failures unless the command is
rejected before execution:

| Surface | Typical failure | Operator meaning |
| --- | --- | --- |
| `activity()` | Activity throws, times out, or exhausts retry policy. | The run records activity failure history and follows workflow error handling. |
| `child()` | Child workflow fails, cancels, terminates, or times out. | The parent observes a child failure outcome at the waiting command. |
| `await()` | Timeout elapses before the condition or signal is satisfied. | The wait returns or fails according to the selected await form. |
| `timer()` | Invalid duration input after normalization. | Authoring code should pass positive durations or explicit zero-duration waits. |
| `continueAsNew()` | New run cannot be created. | Current run remains the evidence point for the failed transition. |
| `upsertSearchAttributes()` | Attribute key, count, or total size exceeds limits. | The run fails before invalid indexed metadata is persisted. |
| `MessageStream::receive()` | No positive workflow history sequence is available. | Receive must occur from workflow execution, not direct service code. |
| `MessageStream::sendReference()` | Payload reference, route, or storage contract is invalid downstream. | Message ordering remains separate from payload-store integrity. |

For payload and history limits, see [Structural Limits](../constraints/structural-limits.md).
For command rejection responses outside PHP workflow code, see
[Server API Reference](../polyglot/server-api-reference.md).

**Determinism rules**

Workflow code must be replay-safe. Keep irreversible or non-deterministic work
behind durable commands:

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

- Use `Workflow::now()` instead of wall-clock time in workflow branches.
- Use `Workflow::uuid4()` or `Workflow::uuid7()` instead of direct randomness.
- Put network calls, filesystem writes, email sends, and external side effects
  in activities.
- Use `Workflow::sideEffect()` only when the value must be captured in history
  and the side effect itself is not the business action.
- Use `Workflow::getVersion()`, `Workflow::patched()`, and
  `Workflow::deprecatePatch()` to evolve workflow code without breaking replay.

</details>
