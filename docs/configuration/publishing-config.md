---
sidebar_position: 1
---

# Publishing Config

This will create a `workflows.php` configuration file in your `config` folder.

```bash
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="config"
```

## Changing Workflows Folder

By default, the `make` commands will write to the `app/Workflows` folder.

```php
php artisan make:workflow MyWorkflow
php artisan make:activity MyActivity
```

This can be changed by updating the `workflows_folder` setting.

```php
'workflows_folder' => 'Workflows',
```

## Using Custom Models (Legacy v1)

:::note Legacy

These `stored_workflow_*` keys configure the v1 `Workflow\Models\StoredWorkflow*` classes. Workflow v2 uses the durable model overrides below — `instance_model`, `run_model`, `task_model`, and so on. Keep the v1 keys only if you are still running v1 workflows during migration.

:::

In the published `workflows.php` config file you can update the v1 model classes to use your own subclasses.

```php
'stored_workflow_model' => App\Models\StoredWorkflow::class,

'stored_workflow_exception_model' => App\Models\StoredWorkflowException::class,

'stored_workflow_log_model' => App\Models\StoredWorkflowLog::class,

'stored_workflow_signal_model' => App\Models\StoredWorkflowSignal::class,

'stored_workflow_timer_model' => App\Models\StoredWorkflowTimer::class,
```

## Using Model Overrides (v2)

The runtime also exposes model overrides for the durable instance, run, task, history, and projection tables:

```php
'v2' => [
    'instance_model' => App\Models\WorkflowInstance::class,
    'run_model' => App\Models\WorkflowRun::class,
    'task_model' => App\Models\WorkflowTask::class,
    'history_event_model' => App\Models\WorkflowHistoryEvent::class,
    'run_summary_model' => App\Models\WorkflowRunSummary::class,
    'run_wait_model' => App\Models\WorkflowRunWait::class,
    'run_timeline_entry_model' => App\Models\WorkflowTimelineEntry::class,
    'run_timer_entry_model' => App\Models\WorkflowRunTimerEntry::class,
    'run_lineage_entry_model' => App\Models\WorkflowRunLineageEntry::class,
],
```

Those overrides are not limited to reads or projection rebuilds. `WorkflowStub::make()`, `load()`, `loadSelection()`, instance reservation, run selection, and workflow-task execution all use the configured `instance_model`, `run_model`, and `task_model`, and Waterline detail plus history export read through the same configured classes. One app-level override therefore governs both the core runtime path and operator-facing reads.

Keep custom subclasses schema-compatible with the built-in models. If a subclass also changes table names or other Eloquent conventions that the package models normally infer, override the affected relations on that subclass as well so `currentRun()`, `runs()`, and similar lookups stay aligned with your custom schema.

## Changing Serializer

This setting allows you to optionally use the Base64 serializer instead of Y (kind of like yEnc encoding where it only gets rid of null bytes). If you change this it will only affect new workflows and old workflows will revert to whatever they were encoded with to ensure compatibility.

The default serializer setting in `workflows.php` is:

```php
'serializer' => Workflow\Serializers\Y::class,
```

To use Base64 instead, update it to:

```php
'serializer' => Workflow\Serializers\Base64::class,
```

## Compatibility Markers

The runtime can stamp each new run with a compatibility marker and let workers advertise which markers they can execute safely. This is the runtime fence that keeps long-lived runs on compatible builds during mixed-fleet deployments.

Set the marker for new runs on the current build:

```env
WORKFLOW_V2_CURRENT_COMPATIBILITY=build-2026-04
```

Optionally tell a worker to accept more than one marker during a rollout:

```env
WORKFLOW_V2_SUPPORTED_COMPATIBILITIES=build-2026-04,build-2026-03
```

Tune how long one worker heartbeat snapshot stays visible in the database-backed fleet view:

```env
WORKFLOW_V2_COMPATIBILITY_HEARTBEAT_TTL=30
```

Optionally scope that fleet view to one app or deployment namespace when several apps share the same workflow database:

```env
WORKFLOW_V2_COMPATIBILITY_NAMESPACE=sample-app
```

The published `workflows.php` config maps those values here:

```php
'v2' => [
    'compatibility' => [
        'current' => env('WORKFLOW_V2_CURRENT_COMPATIBILITY'),
        'supported' => env('WORKFLOW_V2_SUPPORTED_COMPATIBILITIES'),
        'namespace' => env('WORKFLOW_V2_COMPATIBILITY_NAMESPACE'),
        'heartbeat_ttl_seconds' => (int) env('WORKFLOW_V2_COMPATIBILITY_HEARTBEAT_TTL', 30),
    ],
],
```

If `supported` is omitted, workers default to the single `current` marker. Older task and run-summary rows that were created before task-level compatibility markers existed are backfilled from their run marker during migration and again on the runtime claim or recovery path if needed. Tasks and runs that truly have no marker anywhere still remain claimable by any worker.

The `getVersion()` fallback prefers the run's start-time `workflow_definition_fingerprint` when a replay reaches a newly introduced branch point that does not have a typed `VersionMarkerRecorded` event yet. That lets a same-compatibility run keep the `DEFAULT_VERSION` branch when it clearly started on an older workflow definition. Older runs whose `WorkflowStarted` history predates the fingerprint snapshot still fall back to the start-time compatibility marker and occupied-sequence checks, so you should keep rotating `WORKFLOW_V2_CURRENT_COMPATIBILITY` for deployment waves that introduce new versioned workflow code and temporarily list both the old and new markers in `WORKFLOW_V2_SUPPORTED_COMPATIBILITIES` while the mixed fleet is draining.

Each queue worker also records a database-backed compatibility heartbeat snapshot during `Looping` and task handling. Waterline and the detail helpers expose both the local-build view (`compatibility_supported`, `compatibility_reason`) and the fleet view (`compatibility_namespace`, `compatibility_supported_in_fleet`, `compatibility_fleet_reason`, `compatibility_fleet`). When `WORKFLOW_V2_COMPATIBILITY_NAMESPACE` is set, database-backed heartbeat rows must match that namespace, and each database snapshot reports its own `namespace` alongside `worker_id`, queue scope, supported markers, and `source = database`. During a rolling upgrade, that fleet view also reads the older cache heartbeat format from workers that have not restarted onto the new snapshot table yet; those legacy cache rows remain visible as rollout fallback even under a configured namespace, but they surface with `namespace = null` until the older workers restart onto the namespaced snapshot path. In other words, strict namespace isolation only becomes complete after the mixed fleet has restarted onto the database-backed heartbeat path. Transport-level recovery such as re-dispatching an overdue task or recreating a missing task no longer depends on the scanning worker being able to execute that task; only the eventual claim step stays compatibility-fenced.

When an open task already exists but neither the current build nor any active worker heartbeat snapshot advertises its marker, the run stays visible as waiting for a compatible worker instead of surfacing a false `repair_needed` state on that build.

## History Budgets

Waterline uses the run-summary projection to report how large a selected run's typed history has become. These thresholds control when the projection flips `continue_as_new_recommended`:

```env
WORKFLOW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD=10000
WORKFLOW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD=5242880
```

The published `workflows.php` config maps those values here:

```php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => (int) env('WORKFLOW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD', 10000),
        'continue_as_new_size_bytes_threshold' => (int) env('WORKFLOW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD', 5242880),
    ],
],
```

Set either threshold to `0` to disable that side of the recommendation. The flag is advisory; use it to plan `continueAsNew()` boundaries before replay cost grows without changing the selected run's runtime behavior.

## Update Wait Policy

Completion-waiting update APIs such as `attemptUpdate()`, the webhook update routes, and Waterline's update controls wait only up to a bounded budget before they fall back to the still-accepted update lifecycle. Configure that default budget here:

```env
WORKFLOW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS=10
WORKFLOW_V2_UPDATE_WAIT_POLL_INTERVAL_MS=50
```

The published `workflows.php` config maps those values here:

```php
'v2' => [
    'update_wait' => [
        'completion_timeout_seconds' => (int) env('WORKFLOW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS', 10),
        'poll_interval_milliseconds' => (int) env('WORKFLOW_V2_UPDATE_WAIT_POLL_INTERVAL_MS', 50),
    ],
],
```

`completion_timeout_seconds` controls how long `attemptUpdate*` and HTTP completion waits try to get a worker-applied result before they return an accepted lifecycle instead of blocking indefinitely. `poll_interval_milliseconds` only tunes how often the caller checks that durable update row while waiting; it does not change worker execution order or replay behavior. Waterline's operator metrics expose the active `update_wait` values next to the repair policy so operators can see the effective default without opening config files.

## History Export Redaction

History exports include stored workflow, command, activity, update, task, and failure data by design, because replay-debug and archive handoff need durable facts. If those artifacts can leave a protected environment, configure a redactor before exposing the export endpoint or CLI output broadly.

Create a redactor that implements `Workflow\V2\Contracts\HistoryExportRedactor`:

```php
namespace App\Support;

use Workflow\V2\Contracts\HistoryExportRedactor;

final class WorkflowHistoryExportRedactor implements HistoryExportRedactor
{
    public function redact(mixed $value, array $context): mixed
    {
        return [
            'redacted' => true,
            'path' => $context['path'],
        ];
    }
}
```

Then register it in `config/workflows.php`:

```php
'v2' => [
    'history_export' => [
        'redactor' => App\Support\WorkflowHistoryExportRedactor::class,
        'signing_key' => env('WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY'),
        'signing_key_id' => env('WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY_ID'),
    ],
],
```

The redactor receives the current value plus context such as `path`, `category`, `workflow_instance_id`, `workflow_run_id`, and `workflow_type`. The export calls it for workflow argument/output payloads, history-event payloads, command payload/context, update payloads, task payloads, activity payloads, and failure message/file/trace diagnostics. The resulting bundle includes `redaction.applied`, `redaction.policy`, and `redaction.paths` so downstream tooling can tell which policy shaped the artifact.

Every export also includes an `integrity` block computed after redaction. The checksum uses `canonicalization = json-recursive-ksort-v1` and `checksum_algorithm = sha256`; when `signing_key` is configured, the same canonical payload is signed with `signature_algorithm = hmac-sha256` and the optional `signing_key_id` is reported as `key_id`. Keep the signing key outside the exported artifact and rotate the key id when downstream verifiers need to distinguish keys.
