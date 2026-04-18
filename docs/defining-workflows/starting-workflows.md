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

## Start Options

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(ImportOrderWorkflow::class, 'order-123');

$workflow->start(
    $orderId,
    StartOptions::withVisibility(
        businessKey: 'order-123',
        labels: [
            'tenant' => 'acme',
            'region' => 'us-east',
        ],
    )->withMemo([
        'customer' => [
            'id' => 42,
            'name' => 'Taylor',
        ],
        'source' => 'checkout',
    ]),
);
```

### Execution and Run Timeouts

`StartOptions` also supports execution-level and run-level timeouts:

```php
$workflow->start(
    $orderId,
    (new StartOptions())
        ->withExecutionTimeout(86400)  // 24 hours across all runs
        ->withRunTimeout(3600),        // 1 hour per individual run
);
```

**Execution timeout**: spans the entire workflow instance lifecycle, including retries and continue-as-new runs. Once the execution deadline passes, the engine will not schedule further workflow tasks.

**Run timeout**: applies to the current run only. It resets when a workflow continues as new.
