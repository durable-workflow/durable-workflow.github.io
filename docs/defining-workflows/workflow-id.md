---
sidebar_position: 6
---

# Workflow ID

## Instance IDs and Run IDs

When starting a workflow, `id()` is the public workflow instance id and `runId()` is the currently selected run.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);

$id = $workflow->id();

$workflow->start();

$runId = $workflow->runId();
```

Use the id when you want the stable public handle for the workflow. Use the run id when you need to inspect one concrete execution.

## User-defined Instance IDs

When starting a workflow you may optionally specify the id. User-defined ids must be URL-safe strings up to 191 characters using only letters, numbers, `.`, `_`, `-`, and `:`.

```php
$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');
```

Later when you want to reference the workflow, you can load it with your custom id.

```php
$workflow = WorkflowStub::load('order-123');
```

## Accessing IDs Inside Activities and Workflows

Inside an activity:

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(): void
    {
        $id = $this->workflowId();
        $runId = $this->runId();
    }
}
```

Inside a workflow, `$this->workflowId()` returns the instance id and `$this->runId()` returns the selected run id for the currently executing run.
