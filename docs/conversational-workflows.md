---
sidebar_position: 8
tags:
  - signals
  - queries
  - continue-as-new
  - sample-app
keywords:
  - conversational workflow
  - long-lived conversation
  - human approval
  - worker replacement
---

# Conversational Workflow Reference

This is one runnable reference for a long-lived conversation in the embedded
Laravel runtime. It combines features that have their own guides:
[signals](./features/signals.md) for ordered input,
[activities](./defining-workflows/activities.md) for model work,
[queries](./features/queries.md) for status, and
[continue-as-new](./features/continue-as-new.md) to bound history. Service-mode
workers use the same primitives through their
[SDK guides](./polyglot/deployment-modes.md).

The source is `ConversationWorkflow` in the
[sample app](./sample-app.md), under
[`app/Workflows/Conversation`](https://github.com/durable-workflow/sample-app/tree/main/app/Workflows/Conversation).
It uses a deterministic fake model, so it needs no AI provider account or
secrets. It is a reference for the durability pattern, not a production chatbot,
and it makes no latency or scale promises.

## Run it

With the sample app's queue worker running (`composer run dev`):

```bash
php artisan app:conversation \
  --message="Hello" \
  --message="Please refund my order" \
  --message="Thanks" \
  --turns-per-run=2
```

Without `--message`, the command asks for input. A message containing "refund"
makes the fake model propose an action, and the command asks for approval.
`--decision=decline` answers scripted approvals with a decline. Open
`/waterline` to inspect each run in the chain.

## How a turn works

```php
#[Signal('message', [['name' => 'text', 'type' => 'string']])]
#[Signal('decision', [
    ['name' => 'approved', 'type' => 'bool'],
    ['name' => 'reviewer', 'type' => 'string'],
])]
class ConversationWorkflow extends Workflow
{
    public function handle(array $state = [], int $turnsPerRun = 3, int $inactivitySeconds = 3600): array
    {
        $this->state = array_replace($this->state, $state);

        while (true) {
            if ($this->turnsThisRun >= $turnsPerRun) {
                return continueAsNew(
                    array_replace($this->state, ['generation' => $this->state['generation'] + 1]),
                    $turnsPerRun,
                    $inactivitySeconds,
                );
            }

            $text = await('message', $inactivitySeconds);

            // A null text is the inactivity timeout; "/end" finishes.
            // Otherwise one turn runs:
            //   activity(FakeModelActivity::class, ...) proposes a reply
            //   await('decision', ...) holds a proposed action for a reviewer
            //   activity(RecordReplyActivity::class, ...) stores the reply
        }
    }
}
```

1. Each `message` signal is one user input. The workflow applies accepted
   messages one turn at a time, in the order they were accepted.
2. The model call runs in an activity. Replay reuses the recorded result instead
   of calling the model again.
3. When the model proposes an action, the workflow waits for a `decision`
   signal. Only an approval runs `ApplyApprovedActionActivity`. A decline or a
   timeout records the reply and changes nothing.
4. `RecordReplyActivity` writes the reply to the application's
   `conversation_records` table under a reference built from the workflow ID and
   turn number. History stores only that reference.
5. The `status` query reports the phase (`waiting_for_input`, `thinking`,
   `awaiting_approval`, `applying_action`, `recording_reply`,
   `continuing_as_new` or `completed`), the generation, the turn count, any
   pending proposal and the latest reply reference. Read the reply text by that
   reference.

## What survives a lost worker

The sample's tests run the engine one task at a time and stop a worker at a
chosen point:

| Failure | What happens |
| --- | --- |
| A worker leases the task that applies a message, then dies | Nothing progresses until the lease expires. The repair pass then hands the same task to another worker, which applies the message once. |
| A worker dies while the model activity is running | After the lease expires, the activity is retried on another worker. The run records one completion for that activity, and the reply is recorded once. |
| The reply worker writes the row, then dies before reporting | The retry runs the activity again. Because the row is keyed by reference, one reply remains. |

Activities are at-least-once: a retry can repeat work that already happened
outside the engine. Durable history records each outcome once. Give every side
effect a stable key, as the reply and action references do, and pass the same
key to any external system. See
[execution guarantees](./constraints/execution-guarantees.md) and
[lease expiry and redelivery](./constraints/execution-guarantees.md#lease-expiry-and-redelivery).

## Bounding history

After `$turnsPerRun` turns the run continues as new. The next run receives only
the explicit state passed to `continueAsNew()`: the generation, the turn count,
a bounded summary and the latest reply reference. Other properties on the
workflow object are rebuilt by replay and are not copied.

Messages that were accepted but not yet applied move to the next run in their
original order. This applies to declared signals sent to the workflow instance.
A signal sent to one specific run is rejected if that run closes first. See
[signal acceptance and closure](./features/signals.md#acceptance-and-closure)
and [continue-as-new](./features/continue-as-new.md).

## What stays your responsibility

- **Payload storage.** The sample keeps reply text in an application table.
  Choose its retention, access control and backup, or use
  [external payload storage](./features/external-payload-storage.md).
- **Summarization.** The fake model keeps a fixed-length running summary. With a
  real model you decide what context crosses continue-as-new and how large it
  may grow.
- **Who may send input or approve.** The engine records the signal and its
  arguments. Authenticate and authorize senders and reviewers in your
  application before you send the signal; see
  [sender identity and authorization](./features/signals.md#sender-identity-and-authorization).
- **External effects.** The engine does not make an external call exactly-once.
  Use idempotency keys, as the approved-action activity does.
- **Retried signal sends.** If a signal send's response is lost, see
  [after an uncertain response](./features/signals.md#after-an-uncertain-response)
  before you send it again.

The sample stores replies through an activity and does not use message streams
from workflow code. In Workflow releases through 2.20.0, `outbox()->sendReference()`
and `inbox()->receive()` in workflow code are not replay-safe
([workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)); see
the warning in [message streams](./features/message-streams.md).

## Related guides

- [Signals](./features/signals.md) and [queries](./features/queries.md)
- [Continue-as-new](./features/continue-as-new.md)
- [Message streams](./features/message-streams.md)
- [Activities](./defining-workflows/activities.md) and
  [execution guarantees](./constraints/execution-guarantees.md)
- [Failures and recovery](./failures-and-recovery.md)
- [Sample app](./sample-app.md)
