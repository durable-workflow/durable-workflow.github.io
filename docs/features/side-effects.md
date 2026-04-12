---
sidebar_position: 5
---

# Side Effects

A side effect is a closure containing non-deterministic code. The closure is only executed once and the result is saved. It will not execute again if the workflow is retried. Instead, it will return the saved result. This makes the workflow deterministic because replaying the workflow will always return the same stored value rather than re-running the non-deterministic code.

```php
use function Workflow\V2\awaitSignal;
use function Workflow\V2\sideEffect;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Workflow;

#[Signal('finish')]
class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        $token = sideEffect(fn () => random_int(1000, 9999));
        $finish = awaitSignal('finish');

        return compact('token', 'finish');
    }
}
```

The workflow will only call `random_int()` once and save the result, even if the workflow later fails and is retried.

**Important:** The code inside a side effect should never fail because it will not be retried. Code that can possibly fail and therefore need to be retried should be moved to an activity instead.

## How It Works

- each `sideEffect()` call appends a typed `SideEffectRecorded` history event with the workflow step sequence
- workflow replay and query replay both reuse that committed value instead of re-running the closure
- Waterline surfaces the side-effect snapshot as a typed history entry in the selected run timeline
- side effects are still for replay-safe snapshots only, not for work that can fail or that needs retry semantics
