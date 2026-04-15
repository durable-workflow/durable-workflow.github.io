---
sidebar_position: 2
---

# Options

There are various options available when defining your workflows and activities. These options include the number of times a workflow or activity may be attempted before it fails, the connection and queue, and the maximum number of seconds it is allowed to run.

```php
use Workflow\Activity;

class MyActivity extends Activity
{
    public $connection = 'default';
    public $queue = 'default';

    public $tries = 0;
    public $timeout = 0;

    public function backoff()
    {
        return [1, 2, 5, 10, 15, 30, 60, 120];
    }
}
```

## WorkflowOptions

You can also set queue options at workflow start time using `WorkflowOptions`.

```php
use Workflow\WorkflowOptions;
use Workflow\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);

$workflow->start(
    'arg1',
    WorkflowOptions::set([
        'connection' => 'redis',
        'queue' => 'critical',
    ])
);

// OR

$workflow->start('arg1', new WorkflowOptions('redis', 'critical'));
```

`WorkflowOptions` are consumed by the workflow engine and are not passed as arguments to your workflow `execute()` method.

These options are persisted with the workflow and used for subsequent workflow/activity dispatching (including replay and continue-as-new behavior).

## Connection

The `$connection` setting is used to specify which queue connection the workflow or activity should be sent to. By default, the `$connection` value is not set which will use the default connection. This can be overridden by setting the `$connection` property on the workflow or activity class.

## Queue

The `$queue` setting is used to specify which queue the workflow or activity should be added to. By default, the `$queue` value is not set which uses the default queue for the specified connection. This can be overridden by setting the `$queue` property on the workflow or activity class.

## Retries

The `$tries` setting is used to control the number of retries an activity is attempted before it is considered failed. By default, the `$tries` value is set to 0 which means it will be retried forever. This can be overridden by setting the `$tries` property on the activity class.

## Timeout

The `$timeout` setting is used to control the maximum number of seconds an activity is allowed to run before it is killed. By default, the `$timeout` value is set to 0 seconds which means it can run forever. This can be overridden by setting the `$timeout` property on the activity class.

## Backoff

The `backoff` method returns an array of integers corresponding to the current attempt. The default `backoff` method decays exponentially to 2 minutes. This can be overridden by implementing the `backoff` method on the activity class.

## Namespace

Workflows can be scoped to a namespace for multi-namespace isolation. When a namespace is configured, it is persisted on every workflow instance, run, task, and run-summary projection created through the control plane. Task bridge polling and Waterline visibility filters can then restrict results to a single namespace.

Namespace names must contain only lowercase alphanumeric characters, dots, underscores, and hyphens (matching `[a-z0-9._-]+`, max 128 characters). Mixed-case input is normalized to lowercase automatically.

Set the default namespace via environment variable:

```env
WORKFLOW_V2_NAMESPACE=production
```

Or in `config/workflows.php`:

```php
'v2' => [
    'namespace' => env('WORKFLOW_V2_NAMESPACE'),
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

For older failures that were recorded before an exception alias existed, `workflows.v2.types.exception_class_aliases` can map the recorded legacy exception FQCN to the current throwable class. Durable `exceptions` type aliases still win first. The class-alias map is only a refactor bridge for already-recorded payloads with no durable `type`; new workflows should use durable exception type aliases so history is independent from PHP class names.

After configuring both maps, normalize older rows that can be mapped unambiguously:

```bash
php artisan workflow:v2:backfill-failure-types --dry-run
php artisan workflow:v2:backfill-failure-types
```

Use `--strict` in CI or release checks when any unresolved legacy failure row should fail the command. The backfill only stamps `exception_type` onto typed failure history events that are missing it and whose recorded class or class alias resolves to exactly one configured durable exception type.

If a replayed failure cannot be resolved through the durable `exceptions` map, the class-alias map, or the recorded class, the engine does not fall back to a generic runtime exception inside workflow code. Query replay raises `UnresolvedWorkflowFailureException`, Waterline marks the failure with `exception_replay_blocked = true`, and a worker task that hits the same gap is left failed while the run stays open. Fix the mapping and repair the run rather than relying on broad `catch (RuntimeException)` blocks to handle renamed historical failures.

### Boot-Time Type Key Validation

The engine validates configured type maps at boot. The service provider checks for two kinds of conflict in the `workflows` and `activities` type registries before the application serves requests or processes tasks:

**Duplicate class mapping.** If the same class appears as the target of multiple type keys, the engine throws a `LogicException` at boot. Each workflow or activity class must map to exactly one canonical type key so that `TypeRegistry::for()` always returns a deterministic result.

```php
// This will fail at boot:
'workflows' => [
    'billing.sync' => App\Workflows\InvoiceSyncWorkflow::class,
    'invoices.sync' => App\Workflows\InvoiceSyncWorkflow::class, // same class, second key
],
```

**Attribute conflict.** If a class has a `#[Type('...')]` attribute and is also registered in config under a different key, the engine throws a `LogicException` at boot. The attribute and config key must agree so that runtime resolution and type-key lookup stay consistent.

```php
// If InvoiceSyncWorkflow has #[Type('billing.invoice-sync')]:
'workflows' => [
    'invoices.sync' => App\Workflows\InvoiceSyncWorkflow::class, // disagrees with attribute
],
```

Fix the conflict by using the same key in both places or removing one registration source.

## Task Repair Policy

The worker loop can repair durable task delivery when a ready task was not published, when a lease expires, or when a run is already projected as `repair_needed` without an open task row.

Configure the worker-loop repair policy in `config/workflows.php`:

```php
'v2' => [
    'task_repair' => [
        'redispatch_after_seconds' => (int) env('WORKFLOW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS', 3),
        'loop_throttle_seconds' => (int) env('WORKFLOW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS', 5),
        'scan_limit' => (int) env('WORKFLOW_V2_TASK_REPAIR_SCAN_LIMIT', 25),
        'failure_backoff_max_seconds' => (int) env('WORKFLOW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS', 60),
    ],
],
```

`redispatch_after_seconds` controls when a ready task with no recent successful queue handoff becomes dispatch-overdue. A ready task whose first publish failed is repair-eligible immediately, while a claim-failed task becomes eligible after the same redispatch window. Repeated dispatch or claim failures write `workflow_tasks.repair_available_at` and use exponential backoff based on `repair_count`, capped by `failure_backoff_max_seconds`, so a broken queue or unsupported backend cannot consume every repair pass. `loop_throttle_seconds` controls how often each worker loop runs the recovery sweep. `scan_limit` caps how many existing-task candidates and how many missing-task run candidates one sweep examines. Within each phase, candidates are selected with `scope_fair_round_robin` across `connection`, `queue`, and `compatibility`, so a hot scope does not consume the whole pass before other scopes get a repair slot.

Waterline exposes the active values in `operator_metrics.repair_policy`, including `scan_strategy`, `failure_backoff_max_seconds`, and `failure_backoff_strategy`, so operators can read `dispatch_overdue` and `unhealthy_tasks` against the same thresholds the worker loop uses. Selected-run task detail also exposes `repair_available_at` and reports `transport_state = repair_backoff` while a failed task is waiting for its next repair window. Waterline also exposes `operator_metrics.repair` with `existing_task_candidates`, `missing_task_candidates`, `total_candidates`, `scan_limit`, `scan_strategy`, selected-per-pass counts, `scan_pressure`, oldest-candidate age fields, and a `scopes` array grouped by `connection`, `queue`, and `compatibility`.

Use `php artisan workflow:v2:repair-pass` to run one operator-triggered sweep with that same policy. The command bypasses `loop_throttle_seconds` by default so you can force a sweep after deploying a queue fix or while validating recovery in a low-traffic app. Add `--run-id=...` to target one or more selected runs, `--instance-id=...` to limit the pass to one workflow instance, `--respect-throttle` when the command should behave like the worker loop and skip work if another sweep already owns the throttle window, or `--json` when deployment tooling needs the candidate and repair counts directly.

Use `operator_metrics.repair.scopes[*]` when a shared workflow database has several queues or worker fleets. Each scope reports its existing-task candidates, missing-task run candidates, total candidates, selected task/run candidates for the next pass, oldest task age, oldest missing-run age, and whether that scope is affected by the global scan limit on the current snapshot. Treat `scan_pressure = true`, a hot scope with steadily growing candidate age, or a scope that never drains as a signal to increase `scan_limit`, add workers for that queue, or fix the underlying queue/backend issue before the repair backlog ages out of sight.

## Task Dispatch Mode

By default, the engine pushes every ready task onto the Laravel queue so that `queue:work` processes pick them up. In a standalone server deployment where no workflow or activity PHP classes are registered locally, set `task_dispatch_mode` to `poll` so that tasks are only persisted as ready rows and left for external workers to discover through the task bridges.

```env
WORKFLOW_V2_TASK_DISPATCH_MODE=poll
```

Or in `config/workflows.php`:

```php
'v2' => [
    'task_dispatch_mode' => env('WORKFLOW_V2_TASK_DISPATCH_MODE', 'queue'),
    // ...
],
```

| Mode | Behavior |
|------|----------|
| `queue` (default) | Tasks are dispatched to the Laravel queue via `Bus::dispatch()`. Internal `queue:work` processes claim and execute them. |
| `poll` | Tasks stay in `ready` status without a queue job. External workers discover them through `WorkflowTaskBridge::poll()` and `ActivityTaskBridge::poll()`. |

In poll mode, `TaskDispatcher` records a successful dispatch timestamp so the task repair sweep does not treat the task as stuck, but no queue job is created. The task row is the sole delivery mechanism; external workers poll, claim, execute (or replay and complete), and the engine advances the workflow.

Use poll mode when:
- The standalone server hosts the durable database but no workflow PHP classes.
- External workers (in another Laravel app or a language-neutral worker) handle replay.
- You want to avoid the internal `queue:work` process touching workflow or activity tasks.

Embedded deployments where the same Laravel app contains both the workflow classes and the queue worker should keep the default `queue` mode.

## Backend Capability Check

Use the doctor command to check the configured runtime substrate before deploying workers:

```bash
php artisan workflow:v2:doctor --strict
```

The command reports the database connection and driver, queue connection and driver, cache store and lock support, plus any blocking issues. `--strict` returns a non-zero exit code when a required capability is missing. `--json` emits the same backend snapshot that Waterline exposes under `operator_metrics.backend`, so deployment checks and dashboards can share one contract.

Waterline also exposes `GET /waterline/api/v2/health` for HTTP health checks. That endpoint uses the normal Waterline route middleware and authorization gate, then wraps the backend capability snapshot with projection, task-transport, durable-resume-path, and worker-compatibility checks. The payload includes `engine_source` and an `engine_source` check so health probes can see the active engine bridge status. When a backend capability error is blocking the active bridge, the endpoint returns HTTP `503`; projection rebuild needs, unhealthy task transport, repair-needed runs with no healthy next-resume path, and missing compatible worker heartbeats are reported as warnings with HTTP `200`.

Task dispatch and worker claim use the same capability contract against the task's snapped queue connection. If a task points at an unsupported connection, such as `sync`, the engine records a durable dispatch failure instead of publishing the job, or a durable claim failure before the worker leases the task. In both cases the engine leaves user workflow/activity/timer code unexecuted until the backend configuration is fixed.

## Projection Rebuild

Use the projection rebuild command when older data, manual maintenance, or a failed deploy leaves `workflow_run_summaries` behind the durable run tables:

```bash
php artisan workflow:v2:rebuild-projections --missing --prune-stale
```

The command rebuilds the run-summary projection used by Waterline list and dashboard views, the `workflow_run_waits` projection used by selected-run wait detail, the `workflow_run_timeline_entries` projection used by selected-run history detail, the `workflow_run_timer_entries` projection used by selected-run timer detail, and the `workflow_run_lineage_entries` projection used by selected-run parent/child and continue-as-new detail. Use `--run-id=...` or `--instance-id=...` to scope a repair, `--missing` to skip summaries that already exist, `--prune-stale` to remove summaries whose run row no longer exists, `--dry-run` to inspect the affected rows first, and `--json` for deployment checks. `--needs-rebuild` also treats legacy timer projection rows with `workflow_run_timer_entries.schema_version = 0` as stale, so the rebuild pass upgrades older pre-`row_status` timer snapshots onto the current stored schema before Waterline detail or history export reports them as aligned. `--needs-rebuild` also detects schema-outdated run summaries — rows whose `projection_schema_version` is `NULL` or lower than the current build's projector schema version. This covers the mixed-fleet upgrade case where older workers projected summaries without newer derived fields such as `namespace`, `search_attributes`, or `liveness_state`. After deploying a new package version across all workers, run `workflow:v2:rebuild-projections --needs-rebuild` to bring all schema-outdated summaries to the current projector schema. Re-projection is idempotent: running it on an already-current row produces the same output. If the app overrides `workflows.v2.run_model`, `workflows.v2.run_summary_model`, `workflows.v2.run_wait_model`, `workflows.v2.run_timeline_entry_model`, `workflows.v2.run_timer_entry_model`, or `workflows.v2.run_lineage_entry_model`, the command uses those same configured models so the repair target matches Waterline's `operator_metrics.projections.run_summaries` health signal and selected-run detail payloads. The same support boundary applies on the core runtime path and reads too: `WorkflowStub` reservation/load/start plus workflow-task execution, current-run resolution, selected-run detail, Waterline detail, and history export honor the configured `instance_model`, `run_model`, `task_model`, `history_event_model`, and projection-model classes instead of silently falling back to the package defaults.

## Parallel Group Metadata Backfill

Use the parallel group metadata backfill when older grouped activity or child rows have `parallel_group_path` on mutable side tables but the matching typed history event does not:

```bash
php artisan workflow:v2:backfill-parallel-group-metadata --dry-run
php artisan workflow:v2:backfill-parallel-group-metadata
```

Scope the cleanup with `--run-id=...` or `--instance-id=...`, use `--dry-run` to inspect affected activity and child history events first, and use `--json` for deployment checks. The command writes compatible side-row paths into the matching typed activity and child history payloads, then rebuilds selected-run projections for changed runs. It uses the configured v2 run, history, activity execution, child link, summary, wait, and timeline-entry models, so apps that override v2 storage models repair the same records used by replay, query, Waterline detail, and history export.
