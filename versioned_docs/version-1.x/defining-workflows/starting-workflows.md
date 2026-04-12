---
sidebar_position: 3
---

# Starting Workflows

To start a workflow, you must first create a workflow instance and then call the `start()` method on it. The workflow instance has several methods that can be used to interact with the workflow, such as `id()` to get the workflow's unique identifier, `status()` or `running()` to get the current status of the workflow, and `output()` to get the output data produced by the workflow.

```php
use Workflow\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start();
```

Once a workflow has been started, it will be executed asynchronously by a queue worker. The `start()` method returns immediately and does not block the current request.

You can obtain an instance of an existing workflow using its workflow ID.

```php
use Workflow\WorkflowStub;

$workflow = WorkflowStub::load($id);
```
