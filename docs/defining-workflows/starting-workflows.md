---
sidebar_position: 3
---

# Starting Workflows

To start a workflow, create a workflow instance and then call the `start()` method on it.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start();
```

Once a workflow has been started, it will be executed asynchronously by a queue worker. The `start()` method returns immediately and does not block the current request.

Pass arguments to the workflow's `handle()` method through `start()`:

```php
$workflow->start($orderId);
```

You can attach visibility labels, a business key, memo, or timeouts through `StartOptions`. See [Start Options](/docs/2.0/configuration/options#start-options) when you need them.
