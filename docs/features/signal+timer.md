---
sidebar_position: 4
---

# Signal + Timer

`Workflow\V2` supports both `await($condition, timeout: $seconds, conditionKey: $key)` for timeout-backed condition waits and `await('signal-name', timeout: $seconds)` for timeout-backed named signal waits.

Use it when the workflow should continue as soon as some durable replayed state becomes true, but should also unblock after a deadline if that state never changes.

```php
use Workflow\UpdateMethod;
use function Workflow\V2\await;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

use function Workflow\V2\minutes;

#[Type('approval-with-timeout')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): string
    {
        $approved = await(fn () => $this->ready, timeout: minutes(5), conditionKey: 'approval.ready');

        return $approved ? 'approved' : 'timed out';
    }

    #[UpdateMethod]
    public function markReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

import SignalTimerSimulator from '@site/src/components/SignalTimerSimulator';

<SignalTimerSimulator />

`await()` with a `timeout:` parameter works like this:

- The predicate must depend only on replayed durable inputs (activity results, update mutations, child-workflow results). Non-durable state will not wake the wait.
- The optional condition key is a stable operator label for the wait. Replay validates the key against prior history so a redeployment cannot silently reuse the same workflow step for a different predicate.
- If the predicate becomes true before the timer fires, `await()` returns `true`.
- If the deadline wins first, `await()` returns `false`.

Timer sugar helpers are available for readable timeout values: `seconds()`, `minutes()`, `hours()`, `days()`, `weeks()`, `months()`, `years()`.

To change the predicate durably from application code, call the declared update:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('approval-with-timeout');

$workflow->markReady();
```

The return value is `true` when the condition becomes true before the timeout task fires and `false` when the timeout wins.

For named signals, `await('name', timeout: minutes(5))` returns the signal payload when the signal arrives and `null` when the timeout wins. `null` is reserved for timeout: no-argument signals resolve to `true`, one argument resolves to that value, and multiple arguments resolve to an array. `Workflow\V2` does not use legacy `#[SignalMethod]` mutator methods to flip workflow state.
