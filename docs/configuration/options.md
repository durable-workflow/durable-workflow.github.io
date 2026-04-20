---
sidebar_position: 2
---

# Options

There are various options available when defining your workflows and activities. These options include the number of times a workflow or activity may be attempted before it fails, the connection and queue, and the maximum number of seconds it is allowed to run.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public ?string $connection = 'default';
    public ?string $queue = 'default';

    public int $tries = 3;

    public function backoff(): array
    {
        return [1, 2, 5, 10, 15, 30, 60, 120];
    }
}
```

The `$connection` and `$queue` properties on `Workflow\V2\Workflow` and `Workflow\V2\Activity` are declared as `public ?string` and default to `null`. Subclass overrides must keep the nullable type so PHP's invariant public-property typing rules accept the redeclaration. Use `null` when you want to inherit the application's default connection or queue instead of hard-coding a value.

Activity timeouts are not configured through a class property. Use [`ActivityOptions`](#activityoptions) per-call (for example `startToCloseTimeout`) or the activity retry policy snapshot taken at schedule time. See also [Task Repair Policy](#task-repair-policy) for worker-loop timing settings.

## StartOptions

`Workflow\V2\StartOptions` carries visibility, deduplication, and execution timeout configuration at workflow start time. It does not select a queue — queue routing is driven by the workflow and activity class `$connection` and `$queue` properties plus per-call `ActivityOptions`.

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;
use Workflow\V2\Enums\DuplicateStartPolicy;

$workflow = WorkflowStub::make(MyWorkflow::class);

$workflow->start(
    'arg1',
    new StartOptions(
        duplicateStartPolicy: DuplicateStartPolicy::ReturnExistingActive,
        businessKey: 'order-12345',
        labels: ['tenant' => 'acme'],
        executionTimeoutSeconds: 3600,
    ),
);
```

`StartOptions` are consumed by the workflow engine and are not passed as arguments to your workflow `handle()` method. They are persisted with the workflow and used for subsequent workflow/activity dispatching (including replay and continue-as-new behavior).

## ActivityOptions

`Workflow\V2\Support\ActivityOptions` provides per-call overrides for routing, retries, and timeouts when invoking an activity, without requiring changes to the activity class itself:

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    ChargeCard::class,
    new ActivityOptions(
        connection: 'redis',
        queue: 'critical',
        maxAttempts: 5,
        startToCloseTimeout: 30,
    ),
    $orderId,
);
```

## Connection

The `$connection` setting is used to specify which queue connection the workflow or activity should be sent to. By default, the `$connection` value is not set which will use the default connection. This can be overridden by setting the `$connection` property on the workflow or activity class.

## Queue

The `$queue` setting is used to specify which queue the workflow or activity should be added to. By default, the `$queue` value is not set which uses the default queue for the specified connection. This can be overridden by setting the `$queue` property on the workflow or activity class.

## Retries

The `$tries` setting is used to control the total number of attempts for an activity before it is considered failed. By default, `$tries` is `1` (a single attempt, no automatic retries). Set `$tries` to a value greater than `1` to allow retries, or set it to `0` to retry forever. This can be overridden per call through `ActivityOptions::$maxAttempts`.

## Timeout

The v2 `Activity` base class has no `$timeout` class property. Configure activity timeouts per call through [`ActivityOptions`](#activityoptions) using `startToCloseTimeout`, `scheduleToStartTimeout`, `scheduleToCloseTimeout`, or `heartbeatTimeout`. The runtime snapshots the resulting retry policy onto the activity execution when it is scheduled, so the timeout is stable for an already scheduled attempt even if a later deploy changes the activity class or options. Worker-loop level dispatch timing is controlled through [Task Repair Policy](#task-repair-policy).

## Backoff

The `backoff` method returns an array of integers corresponding to the current attempt. The default `backoff` method decays exponentially to 2 minutes. This can be overridden by implementing the `backoff` method on the activity class.

## Namespace

Workflows can be scoped to a namespace for multi-namespace isolation. When a namespace is configured, it is persisted on every workflow instance, run, task, and run-summary projection created through the control plane. Task bridge polling and Waterline visibility filters can then restrict results to a single namespace.

Namespace names must contain only lowercase alphanumeric characters, dots, underscores, and hyphens (matching `[a-z0-9._-]+`, max 128 characters). Mixed-case input is normalized to lowercase automatically.

Set the default namespace via environment variable:

```env
DW_V2_NAMESPACE=production
```

Or in `config/workflows.php`:

```php
'v2' => [
    'namespace' => env('DW_V2_NAMESPACE'),
    // ...
],
```

The control plane also accepts a per-call namespace override in the `start()` options:

```php
$controlPlane->start('order-processing', 'order-12345', [
    'namespace' => 'staging',
    // ...
]);
```

When no namespace is configured and none is passed explicitly, instances have a `null` namespace and are visible to all consumers.

### Waterline namespace scoping

When Waterline is deployed against a shared database with multiple namespaces, set `WATERLINE_NAMESPACE` to restrict all list views to one namespace:

```env
WATERLINE_NAMESPACE=production
```

This injects a namespace filter into every visibility query so Waterline only shows workflows belonging to the configured namespace. When set, Waterline also scopes all command operations (cancel, signal, terminate, update, repair, archive, and queries) to the configured namespace — a command targeting an instance or run that belongs to a different namespace will return a 404 instead of executing.

### Command namespace scoping

`WorkflowStub::load()`, `loadSelection()`, and `loadRun()` accept an optional `namespace` parameter:

```php
use Workflow\V2\WorkflowStub;

// Load only if the instance belongs to the given namespace
$stub = WorkflowStub::load('order-12345', namespace: 'production');

// Load a specific run, scoped to namespace
$stub = WorkflowStub::loadRun($runId, namespace: 'production');

// Load a specific selection, scoped to namespace
$stub = WorkflowStub::loadSelection('order-12345', $runId, namespace: 'production');
```

When `namespace` is `null` (the default), loading is unscoped and works against all namespaces — this preserves backward compatibility. When a namespace is provided, the query filters by namespace at the database level and throws `ModelNotFoundException` if the workflow does not exist in that namespace.

The control plane command methods (`signal`, `cancel`, `terminate`, `update`, `repair`, `archive`) also accept `namespace` in their options array:

```php
$controlPlane->cancel('order-12345', [
    'namespace' => 'production',
]);
```

### Task bridge namespace filtering

Both the workflow and activity task bridges accept an optional `namespace` parameter on `poll()`:

```php
$tasks = $bridge->poll('redis', 'default', limit: 10, namespace: 'production');
```

When omitted, `poll()` returns tasks from all namespaces (backward-compatible with pre-namespace installations).

## Durable Type Aliases

Durable type keys for workflows and activities are stored when you register them under `workflows.v2.types`. Failure payloads can use the same pattern for exception classes:

```php
'v2' => [
    'types' => [
        'workflows' => [
            'billing.invoice-sync' => App\Workflows\InvoiceSyncWorkflow::class,
        ],
        'activities' => [
            'payments.capture' => App\Activities\CapturePaymentActivity::class,
        ],
        'exceptions' => [
            'billing.invoice-declined' => App\Exceptions\InvoiceDeclined::class,
        ],
        'exception_class_aliases' => [
            App\Exceptions\LegacyInvoiceDeclined::class => App\Exceptions\InvoiceDeclined::class,
        ],
    ],
],
```

When an activity, update, child, or workflow failure is recorded with an exception alias, the engine stores that alias in typed history as `exception_type` and inside the failure payload as `type`. Replay resolves the alias before falling back to the recorded PHP class, so a later class move can keep workflow `catch` semantics stable as long as the alias still points at the current throwable class.

For imported v1 failures that were recorded before an exception alias existed, `workflows.v2.types.exception_class_aliases` can map the recorded legacy exception FQCN to the current throwable class. Durable `exceptions` type aliases still win first. The class-alias map is only a refactor bridge for already-recorded payloads with no durable `type`; new workflows should use durable exception type aliases so history is independent from PHP class names.

Final v2 writes durable exception aliases when the failure is recorded, so configure stable aliases before recording failures whose throwable classes may move later.

If a replayed failure cannot be resolved through the durable `exceptions` map, the class-alias map, or the recorded class, the engine does not fall back to a generic runtime exception inside workflow code. Query replay raises `UnresolvedWorkflowFailureException`, Waterline marks the failure with `exception_replay_blocked = true`, and a worker task that hits the same gap is left failed while the run stays open. Fix the mapping and repair the run rather than relying on broad `catch (RuntimeException)` blocks to handle renamed historical failures.
