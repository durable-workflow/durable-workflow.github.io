---
sidebar_position: 6
---

# Workflow ID

## Instance IDs and Run IDs

When starting a workflow, `id()` is the public workflow instance id and `runId()` is the currently selected run.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);

$instanceId = $workflow->id();

$workflow->start();

$runId = $workflow->runId();
```

Use the instance id when you want the stable public handle for the workflow. Use the run id when you need to inspect one concrete execution.

## Accessing IDs Inside Activities and Workflows

Inside an activity:

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(): void
    {
        $instanceId = $this->workflowId();
        $runId = $this->runId();
    }
}
```

Inside a workflow, `$this->workflowId()` returns the instance id and `$this->runId()` returns the selected run id for the currently executing run.
