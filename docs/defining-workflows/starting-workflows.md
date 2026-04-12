---
sidebar_position: 3
---

# Starting Workflows

To start a workflow, create a workflow instance and then call the `start()` method on it. The `start()` method splits public instance identity from run identity.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);

$instanceId = $workflow->id(); // Public workflow instance id

$workflow->start();

$runId = $workflow->runId(); // Active run id after start is accepted
```

Once a workflow has been started, it will be executed asynchronously by a queue worker. The `start()` method returns immediately and does not block the current request.

You can obtain an instance of an existing workflow using its workflow ID.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load($id);
```

## Instance and Run Identity

- `id()` is the stable public workflow instance id.
- Caller-supplied instance ids must currently be non-empty URL-safe strings up to 191 characters using only letters, numbers, `.`, `_`, `-`, and `:`.
- `runId()` is the current run id for that instance.
- `load($instanceId)` keeps the stub instance-centric, while `loadRun($runId)` selects one concrete run explicitly.
- `make()` durably reserves the public workflow instance id immediately, before the first start command is accepted.
- `status()` returns `reserved` while that durable reservation exists but no run has started yet.
- `make(MyWorkflow::class, 'order-123')` creates or reloads the same durable reservation through the public instance id itself, so repeated callers can address one logical workflow instance without creating duplicate rows.
- `start()` accepts the first start command, creates the first run, records typed `StartAccepted` and `WorkflowStarted` history events, and schedules the initial workflow task.
- `start()` can also receive `StartOptions::withVisibility(...)->withMemo(...)` as its final argument to attach operator-facing `business_key`, exact-match string `visibility_labels`, and returned-only `memo` metadata. `business_key` and `visibility_labels` flow into the instance, run, run summary, typed start history, selected-run detail, and history export. `memo` flows into the instance, run, typed start history, selected-run detail, and history export, and it is carried into later `continueAsNew()` runs.
- `summary()` returns the current run summary projection when one exists.
- `refresh()` reloads the current instance and resolves the newest durable run for that instance from storage.
- `continueAsNew()` keeps that same instance id but advances `runId()` to the newest run after `refresh()`.
- `completed()`, `failed()`, `cancelled()`, and `terminated()` are convenience helpers for terminal run states.
- Instance-targeted `load($instanceId)` and current-run commands resolve the newest durable run in the instance chain instead of trusting only the mutable current-run pointer, so continue-as-new chains stay addressable even if that column drifts.

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

Visibility labels are exact-match strings for operator filtering in Waterline, not a high-volume analytics payload. Label keys use letters, numbers, `.`, `_`, `-`, and `:`, up to 64 characters. Label values and `business_key` are non-empty strings up to 191 characters.

`memo` is JSON-like metadata for selected-run detail and history export, not a list-filter or run-summary search field. Top-level and nested memo object keys must be non-empty strings up to 64 characters, and memo values may be scalars, `null`, arrays, or nested objects.

## Workflow Type

The durable `workflow_type` for that instance comes from either:

- a `#[Type('...')]` attribute on the workflow class, or
- a config registration under `workflows.v2.types.workflows`

Example config registration when you do not want to annotate the class directly:

```php
// config/workflows.php
'v2' => [
    'types' => [
        'workflows' => [
            'billing.invoice-sync' => App\Workflows\InvoiceSyncWorkflow::class,
        ],
        'activities' => [
            'payments.capture' => App\Activities\CapturePaymentActivity::class,
        ],
    ],
],
```

That same config map is also the fallback path when a worker needs to resolve a stored durable type after a PHP class rename. Keep the durable type key stable, update the map to the new class, and the runtime can continue loading the run without rewriting the public instance id.

When that fallback is used on a reserved start or on `continueAsNew()`, the newly written run is now normalized onto the resolved class before it is stored. That means the next run's `workflow_class` and snapped signal or update contract no longer stay stuck on the stale PHP FQCN once the durable type key has been remapped.

## Cancellation and Termination

The same stub can close an in-flight run explicitly:

```php
$workflow = WorkflowStub::load($instanceId);

$workflow->cancel();    // marks the current run as cancelled
$workflow->terminate(); // marks the current run as terminated
```

Both methods target the current run for that instance, return a typed command result, and persist durable command history before the run summary is updated. If the command cannot be applied, `cancel()` and `terminate()` throw a `LogicException`.

Use `attemptCancel()` or `attemptTerminate()` when you want the outcome without an exception:

```php
$workflow = WorkflowStub::load($instanceId);

$result = $workflow->attemptCancel();
// or $result = $workflow->attemptTerminate();

$result->commandId();       // Durable terminal command id
$result->commandSequence(); // Durable command order within the selected run
$result->instanceId();      // Public workflow instance id
$result->runId();           // Current run id, or null if the instance never started
$result->requestedRunId();  // Explicitly selected run id, or null for instance-targeted commands
$result->resolvedRunId();   // Run the engine actually resolved for this command
$result->targetScope();     // "instance" or "run"
$result->workflowType();    // Durable workflow type key for the targeted instance
$result->status();          // "accepted" or "rejected"
$result->accepted();        // true or false
$result->outcome();         // "cancelled", "terminated", "rejected_not_started", "rejected_not_active", or "rejected_not_current"
$result->rejectionReason(); // null, "instance_not_started", "run_not_active", or "selected_run_not_current"
```

If you want to target one selected run explicitly, load it by run id:

```php
$selectedRun = WorkflowStub::loadRun($runId);

$selectedRun->currentRunId(); // current run for the instance
$selectedRun->currentRunIsSelected(); // whether this selected run is still current

$result = $selectedRun->attemptCancel();
```

That run-targeted command stays durable even when the selected run is historical. In that case the engine rejects it with `targetScope() === 'run'`, `outcome() === 'rejected_not_current'`, and `rejectionReason() === 'selected_run_not_current'`, while `requestedRunId()` keeps the rejected historical run and `resolvedRunId()` points at the current run that should be addressed next.

## Webhook Routes

The same engine-level commands are exposed to external callers through webhook routes:

```text
POST /webhooks/instances/{workflowId}/runs/{runId}/updates/{update}
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
POST /webhooks/instances/{workflowId}/updates/{update}
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
```

The instance routes expect the public instance id and always resolve the current active run at apply time. The run routes expect both the public instance id and one selected run id. Accepted update, cancel, and terminate webhook calls return HTTP `200`. Rejected update, cancel, and terminate webhook calls usually return HTTP `409` with the same `outcome` and `rejection_reason` values shown above, while unknown update methods return HTTP `404` with `outcome = rejected_unknown_update`.
The JSON field names are `workflow_type`, `command_status`, `target_scope`, `requested_run_id`, and `resolved_run_id`, which correspond to `workflowType()`, `status()`, `targetScope()`, `requestedRunId()`, and `resolvedRunId()` on the PHP command result. Run-targeted webhook calls return `target_scope = run` and reject historical selections with `outcome = rejected_not_current` plus `rejection_reason = selected_run_not_current`, keeping the rejected run in `requested_run_id` and the current run in `resolved_run_id`.

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
