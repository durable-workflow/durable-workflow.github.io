---
sidebar_position: 5
---

# Side Effects

A side effect is a closure containing non-deterministic code. The closure is only executed once and the result is saved. It will not execute again if the workflow is retried. Instead, it will return the saved result. This makes the workflow deterministic because replaying the workflow will always return the same stored value rather than re-running the non-deterministic code.

```php
use function Workflow\{sideEffect, timer};
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        $seconds = yield sideEffect(fn () => random_int(60, 120));

        yield timer($seconds);
    }
}
```

The workflow will only call `random_int()` once and save the result, even if the workflow later fails and is retried.

**Important:** The code inside a side effect should never fail because it will not be retried. Code that can possibly fail and therefore need to be retried should be moved to an activity instead.

## Signals and Control Flow

Signals are applied before the workflow continues execution. That means a signal-mutated variable can break replays unless the control flow decision is recorded deterministically.

Use `sideEffect()` to snapshot any signal-driven branch decision:

```php
use function Workflow\{activity, sideEffect};
use Exception;
use Workflow\SignalMethod;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    private bool $cancelled = false;

    #[SignalMethod]
    public function cancel()
    {
        $this->cancelled = true;
    }

    public function execute()
    {
        while (true) {
            yield activity(MyActivity::class);

            if (yield sideEffect(fn () => $this->cancelled)) {
                throw new Exception('Workflow cancelled by signal.');
            }
        }
    }
```

This keeps control flow replay-safe and avoids non-deterministic branching during signal handling.
