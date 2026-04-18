---
sidebar_position: 6
---

# Condition Waits

`await($condition, $conditionKey = null)` provides replay-safe condition waits. Use it when the predicate depends only on workflow state that was already derived from durable inputs such as updates, activity results, or child results. If you want one named external signal value directly, call `await('name')` — see [Signals](./signals.md).

Condition waits are driven by an update method instead of signal mutators:

```php
use Workflow\UpdateMethod;
use function Workflow\V2\await;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('approval-workflow')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): void
    {
        await(fn () => $this->ready, 'approval.ready');
    }

    #[UpdateMethod]
    public function setReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

The optional condition key is a stable, URL-safe operator label for the wait. Replay validates the previously recorded key so a later deployment cannot accidentally reuse the same workflow step for a different predicate — see [Versioning](./versioning.md) for how to evolve a workflow safely across deployments.

For a condition wait with a timeout, see [Signal + Timer](./signal+timer.md).

**Important:** `await()` should only be used in a workflow, not an activity.
