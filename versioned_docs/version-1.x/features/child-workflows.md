---
sidebar_position: 7
---

# Child Workflows

It's often necessary to break down complex processes into smaller, more manageable units. Child workflows provide a way to encapsulate a sub-process within a parent workflow. This allows you to create hierarchical and modular structures for your workflows, making them more organized and maintainable.

A child workflow is just like any other workflow. The only difference is how it's invoked within the parent workflow, using `child()`.

```php
use function Workflow\child;
use Workflow\Workflow;

class ParentWorkflow extends Workflow
{
    public function execute()
    {
        $result = yield child(ChildWorkflow::class);
    }
}
```

## Signaling Child Workflows

Parent workflows can signal their child workflows to coordinate behavior or pass data. To signal a child safely without corrupting the parent's execution context, use the `$this->child()` or `$this->children()` methods.

### Getting a Child Handle

The `$this->child()` method returns a `ChildWorkflowHandle` for the most recently created child workflow:

```php
use function Workflow\child;
use Workflow\Workflow;

class ParentWorkflow extends Workflow
{
    public function execute()
    {
        $child = child(ChildWorkflow::class);

        $childHandle = $this->child();

        $childHandle->process('approved');

        $result = yield $child;

        return $result;
    }
}
```

### Multiple Children

Use the `$this->children()` method to get handles for all child workflows created by the parent:

```php
use function Workflow\{all, child};
use Workflow\Workflow;

class ParentWorkflow extends Workflow
{
    public function execute()
    {
        $child1 = child(ChildWorkflow::class, 'first');
        $child2 = child(ChildWorkflow::class, 'second');
        $child3 = child(ChildWorkflow::class, 'third');

        $childHandles = $this->children();

        foreach ($childHandles as $childHandle) {
            $childHandle->process('approved');
        }

        $results = yield all([$child1, $child2, $child3]);

        return $results;
    }
}
```

The `$this->children()` method returns children in reverse chronological order (most recently created first).

### Forwarding Signals to Children

You can forward external signals to child workflows by combining signal methods with child handles:

```php
use function Workflow\{await, child};
use Workflow\SignalMethod;
use Workflow\Workflow;

class ParentWorkflow extends Workflow
{
    private bool $processed = false;
    private ?string $status = null;

    #[SignalMethod]
    public function process(string $status)
    {
        $this->processed = true;
        $this->status = $status;
    }

    public function execute()
    {
        $child = child(ChildWorkflow::class);

        $childHandle = $this->child();

        yield await(fn () => $this->processed);

        $childHandle->process($this->status);

        $result = yield $child;

        return $result;
    }
}
```

**Important:** Always call `$this->child()` or `$this->children()` in the `execute()` method. Never call these methods in signal methods or query methods, as this violates determinism during workflow replay.

### Getting Child Workflow IDs

You can access the child workflow ID using the `id()` method on the child handle. This allows you to store the ID for external systems to signal the child directly.

```php
use function Workflow\{activity, child};
use Workflow\Workflow;

class ParentWorkflow extends Workflow
{    
    public function execute()
    {
        $child = child(ChildWorkflow::class);
        yield activity(StoreWorkflowIdActivity::class, $this->child()->id());
        yield $child;
    }
}
```

or

```php
use function Workflow\{await, child};
use Workflow\QueryMethod;
use Workflow\Workflow;

class ParentWorkflow extends Workflow
{
    private ?int $childId = null;

    #[QueryMethod]
    public function childId(): ?int
    {
        return $this->childId;
    }

    public function execute()
    {
        $child = child(ChildWorkflow::class);
        $childHandle = $this->child();
        yield await(fn () => !is_null($childHandle));
        $this->childId = $childHandle->id();
        yield $child;
    }
}
```

**Important:** When using query methods in the same workflow with child handles, you must first await for the child handle to be available. Query methods like `$workflow->childId()` may return `null` if you query the parent workflow before the child handle has finished being awaited.

Then you can interact with the child workflow directly.

```php
$workflow = WorkflowStub::load($workflowId);
if ($childId = $workflow->childId()) {
    WorkflowStub::load($childId)->process('approved');
}
```

## Async Activities

Rather than creating a child workflow, you can pass a callback to `async()` and it will be executed in the context of a separate workflow.

```php
use Workflow\Workflow;
use function Workflow\{activity, async};

class AsyncWorkflow extends Workflow
{
    public function execute()
    {
        [$result, $otherResult] = yield async(function () {
            $result = yield activity(Activity::class);
            $otherResult = yield activity(OtherActivity::class, 'other');
            return [$result, $otherResult];
        });
    }
}
```
