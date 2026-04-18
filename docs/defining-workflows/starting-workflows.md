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

You can obtain an instance of an existing workflow using its workflow ID.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load($id);
```

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

- **Execution timeout** spans the entire workflow instance lifecycle, including retries and continue-as-new runs. Once the execution deadline passes, the engine will not schedule further workflow tasks.
- **Run timeout** applies to the current run only. It resets when a workflow continues as new.

Both timeouts must be at least 1 second. Pass `null` (the default) to leave the timeout unlimited.

## Attempt Start

If you want the durable start-command identity or a non-throwing duplicate-start outcome, use `attemptStart()`:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

$result = $workflow->attemptStart(['order' => 123]);

$result->commandId(); // Durable start command id
$result->commandSequence(); // Durable command order within that run
$result->instanceId();
$result->runId();
$result->workflowType(); // Durable workflow type key for the accepted or rejected command
$result->status(); // "accepted" or "rejected"
$result->accepted(); // true or false
$result->rejectionReason(); // null or machine-readable reason
```

Today `start()` still throws a `LogicException` for a duplicate start attempt, but the rejected start command is persisted before the exception is raised. `attemptStart()` lets you inspect that outcome directly through `outcome()`, which currently returns one of:

- `started_new`
- `returned_existing_active`
- `rejected_duplicate`

When you reuse the same caller-supplied instance id from a new request:

```php
$first = WorkflowStub::make(MyWorkflow::class, 'order-123');
$first->attemptStart('Taylor');

$second = WorkflowStub::make(MyWorkflow::class, 'order-123');
$duplicate = $second->attemptStart('Jordan');

$duplicate->accepted(); // false
$duplicate->rejectionReason(); // "instance_already_started"
$duplicate->runId() === $first->runId(); // true
```

If you want duplicate starts for an active run to reuse the current run instead of rejecting, pass `StartOptions::returnExistingActive()`:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

$first = $workflow->attemptStart('Taylor');
$second = $workflow->attemptStart('Jordan', StartOptions::returnExistingActive());

$first->outcome(); // "started_new"
$second->outcome(); // "returned_existing_active"
$second->accepted(); // true
$second->runId() === $first->runId(); // true
```

This reuse behavior only applies while the current run is still active. If the instance has already been started and the current run cannot be reused by this slice, the start outcome remains `rejected_duplicate`.

If the caller-supplied instance id is blank, contains unsupported characters, or is longer than 191 characters, `WorkflowStub::make()` fails immediately with a `LogicException` instead of falling through the duplicate-start path.

Within one run, accepted and rejected commands also carry a durable `commandSequence()`. That gives a stable operator-facing order for command history, and it is the order the engine uses when it applies buffered signal commands for that run.
