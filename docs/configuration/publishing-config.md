---
sidebar_position: 1
---

# Publishing Config

This will create a `workflows.php` configuration file in your `config` folder.

```bash
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="config"
```

## Workflow-task lease (v2) {#workflow-task-lease-v2}

Configure the embedded workflow-task lease with a positive integer number of seconds:

```env
DW_V2_WORKFLOW_TASK_LEASE_SECONDS=300
```

This maps to `workflows.v2.workflow_task_lease_seconds` in `config/workflows.php` and defaults to `300`. Claims and task renewals read the effective configuration. Zero does not disable the lease. Refresh cached configuration and restart long-running workers after changing deployment configuration.

Server uses `DW_WORKFLOW_TASK_TIMEOUT` instead and maps that value into the package setting. This recovery lease is separate from activity and workflow deadlines. See [Workflow-task lease](../features/timeouts.md#workflow-task-lease).

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

See the [Customization Matrix](./customization-matrix.md) for the frozen v2
support contract, including which overrides are safe as inherited subclasses,
which ones need explicit relation overrides, and how serializer, repository,
health, import, migration, and write-side behavior fit together.

## Payload Codec

v2 uses `avro` for new workflow payloads:

```php
'serializer' => 'avro',
```

- **`avro`** (default, required for new v2 workflows) — Apache Avro binary encoding. Compact on the wire and in storage, and faster to encode/decode for large payloads than the legacy PHP serializer.

If a published v1 config still sets `serializer`, final v2 keeps reading the value for `workflow:v2:doctor` diagnostics, but new v2 payloads still resolve to Avro.

### Legacy codecs (v1 migration only)

Two PHP-only codecs remain available for reading v1 history during migration:

- `workflow-serializer-y` — PHP `SerializableClosure` with byte-escape encoding (the v1 default).
- `workflow-serializer-base64` — PHP `SerializableClosure` with base64 encoding.

Setting `serializer` to a legacy codec will be flagged by `php artisan workflow:v2:doctor`. New v2 workflows still resolve to Avro; keep a legacy codec setting only while you are finishing or importing v1 runs that need PHP-native payload decoding.

The internal v1 import/drain reader recognizes legacy fully-qualified class names (for example, `Workflow\Serializers\Y::class`). They are not public v2 codec aliases and cannot be selected by a new v2 run or SDK.

## Compatibility Markers

The runtime can stamp each new run with a compatibility marker and let workers advertise which markers they can execute safely. This is the runtime fence that keeps long-lived runs on compatible builds during deliberate worker build rollouts.

Set the marker for new runs on the current build:

```env
DW_V2_CURRENT_COMPATIBILITY=build-2026-04
```

Optionally tell a worker to accept more than one marker during a rollout:

```env
DW_V2_SUPPORTED_COMPATIBILITIES=build-2026-04,build-2026-03
```

Tune how long one worker heartbeat snapshot stays visible in the database-backed fleet view:

```env
DW_V2_COMPATIBILITY_HEARTBEAT_TTL=30
```

Optionally scope that fleet view to one app or deployment namespace when several apps share the same workflow database:

```env
DW_V2_COMPATIBILITY_NAMESPACE=sample-app
```

The published `workflows.php` config maps those values here:

```php
'v2' => [
    'compatibility' => [
        'current' => env('DW_V2_CURRENT_COMPATIBILITY'),
        'supported' => env('DW_V2_SUPPORTED_COMPATIBILITIES'),
        'namespace' => env('DW_V2_COMPATIBILITY_NAMESPACE'),
        'heartbeat_ttl_seconds' => (int) env('DW_V2_COMPATIBILITY_HEARTBEAT_TTL', 30),
    ],
],
```

If `supported` is omitted, workers default to the single `current` marker. Older task and run-summary rows that were created before task-level compatibility markers existed are backfilled from their run marker during migration and again on the runtime claim or recovery path if needed. Tasks and runs that truly have no marker anywhere still remain claimable by any worker.

The `getVersion()` fallback prefers the run's start-time `workflow_definition_fingerprint` when a replay reaches a newly introduced branch point that does not have a typed `VersionMarkerRecorded` event yet. That lets a same-compatibility run keep the `DEFAULT_VERSION` branch when it clearly started on an older workflow definition. Older runs whose `WorkflowStarted` history predates the fingerprint snapshot still fall back to the start-time compatibility marker and occupied-sequence checks, so you should keep rotating `DW_V2_CURRENT_COMPATIBILITY` for deployment waves that introduce new versioned workflow code and temporarily list both the old and new markers in `DW_V2_SUPPORTED_COMPATIBILITIES` while the older worker cohort is draining.

Each queue worker also records a database-backed compatibility heartbeat snapshot during `Looping` and task handling. Waterline and the detail helpers expose both the local-build view (`compatibility_supported`, `compatibility_reason`) and the fleet view (`compatibility_namespace`, `compatibility_supported_in_fleet`, `compatibility_fleet_reason`, `compatibility_fleet`). When `DW_V2_COMPATIBILITY_NAMESPACE` is set, database-backed heartbeat rows must match that namespace, and each database snapshot reports its own `namespace` alongside `worker_id`, queue scope, supported markers, and `source = database`. During a rolling upgrade, that fleet view also reads the older cache heartbeat format from workers that have not restarted onto the new snapshot table yet; those legacy cache rows remain visible as rollout fallback even under a configured namespace, but they surface with `namespace = null` until the older workers restart onto the namespaced snapshot path. In other words, strict namespace isolation only becomes complete after every worker has restarted onto the database-backed heartbeat path. Transport-level recovery such as re-dispatching an overdue task or recreating a missing task no longer depends on the scanning worker being able to execute that task; only the eventual claim step stays compatibility-fenced.

When an open task already exists but neither the current build nor any active worker heartbeat snapshot advertises its marker, the run stays visible as waiting for a compatible worker instead of surfacing a false `repair_needed` state on that build.

## History Budgets

Waterline uses the run-summary projection to report how large a selected run's typed history has become. These thresholds control when the projection flips `continue_as_new_recommended`:

```env
DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD=10000
DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD=5242880
```

The published `workflows.php` config maps those values here:

```php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD', 10000),
        'continue_as_new_size_bytes_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD', 5242880),
    ],
],
```

Set either threshold to `0` to disable that side of the recommendation. The flag is advisory; use it to plan `continueAsNew()` boundaries before replay cost grows without changing the selected run's runtime behavior.

## Update Wait Policy

Completion-waiting update APIs such as `attemptUpdate()`, the webhook update routes, and Waterline's update controls wait only up to a bounded budget before they fall back to the still-accepted update lifecycle. Configure that default budget here:

```env
DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS=10
DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS=50
```

The published `workflows.php` config maps those values here:

```php
'v2' => [
    'update_wait' => [
        'completion_timeout_seconds' => (int) env('DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS', 10),
        'poll_interval_milliseconds' => (int) env('DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS', 50),
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
        'signing_key' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY'),
        'signing_key_id' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID'),
    ],
],
```

The redactor receives the current value plus context such as `path`, `category`, `workflow_instance_id`, `workflow_run_id`, and `workflow_type`. The export calls it for workflow argument/output payloads, history-event payloads, command payload/context, update payloads, task payloads, activity payloads, and failure message/file/trace diagnostics. The resulting bundle includes `redaction.applied`, `redaction.policy`, and `redaction.paths` so downstream tooling can tell which policy shaped the artifact.

Every export also includes an `integrity` block computed after redaction. The checksum uses `canonicalization = json-recursive-ksort-v1` and `checksum_algorithm = sha256`; when `signing_key` is configured, the same canonical payload is signed with `signature_algorithm = hmac-sha256` and the optional `signing_key_id` is reported as `key_id`. Keep the signing key outside the exported artifact and rotate the key id when downstream verifiers need to distinguish keys.

## Worker interceptors {#worker-interceptors}

Worker interceptors are available from the next Workflow package release.
Embedded Durable Workflow runs ordered worker interceptors around the workflow
tasks, activities, queries and update validations it executes in your
application's processes. Use them for audit logging, metric tags, tenant context or tracing that you want to
write once instead of in every workflow and activity. The hook shape matches the
[Python](../polyglot/python.md#worker-interceptors),
[PHP](../polyglot/php.md#worker-interceptors) and
[Rust](../polyglot/rust.md#worker-interceptors) SDK interceptors.

List interceptor classes under `workflows.v2.interceptors` in
`config/workflows.php`. They are resolved from the Laravel container, so
constructor injection works, and they run in the listed order; the first is the
outermost wrapper.

```php
'v2' => [
    // ...
    'interceptors' => [
        App\Workflows\AuditInterceptor::class,
    ],
],
```

Each interceptor implements `Workflow\V2\Interceptors\WorkerInterceptor`.
Extend `Workflow\V2\Interceptors\PassthroughWorkerInterceptor` to implement only
the hooks you need, and call `$next($context)` to continue the chain. This audit
interceptor logs each committed workflow task and every activity attempt:

```php
namespace App\Workflows;

use Illuminate\Support\Facades\DB;
use Psr\Log\LoggerInterface;
use Workflow\V2\Interceptors\ActivityInterceptorContext;
use Workflow\V2\Interceptors\PassthroughWorkerInterceptor;
use Workflow\V2\Interceptors\WorkflowTaskInterceptorContext;
use Workflow\V2\Interceptors\WorkflowTaskOutcome;

final class AuditInterceptor extends PassthroughWorkerInterceptor
{
    public function __construct(private readonly LoggerInterface $audit)
    {
    }

    public function executeWorkflowTask(WorkflowTaskInterceptorContext $context, callable $next): WorkflowTaskOutcome
    {
        $outcome = $next($context);
        // The task commits after the chain returns; log only once it has.
        DB::afterCommit(fn () => $this->audit->info('workflow task', [
            'workflow_id' => $context->workflowId,
            'run_id' => $context->runId,
            'attempt' => $context->workflowTaskAttempt,
            'recorded' => $outcome->historyEventTypes,
        ]));

        return $outcome;
    }

    public function executeActivity(ActivityInterceptorContext $context, callable $next): mixed
    {
        $this->audit->info('activity started', [
            'activity_type' => $context->activityType,
            'attempt' => $context->attemptNumber,
            'workflow_id' => $context->workflowId,
        ]);
        try {
            return $next($context);
        } finally {
            $this->audit->info('activity finished', ['activity_type' => $context->activityType]);
        }
    }
}
```

The container builds the configured interceptors for each task. Bind one as a
singleton when it must keep state between tasks.

| Hook | Context | `$next` returns |
| --- | --- | --- |
| `executeWorkflowTask($context, $next)` | `workerId`, `connection`, `taskQueue`, `namespace`, `task`, `taskId`, `workflowType`, `workflowId`, `runId`, `workflowTaskAttempt`, `historyLength`, `replaying` (also `replayState()`) | `WorkflowTaskOutcome` with `historyEventTypes`, `runStatus`, `nextTaskId` |
| `executeActivity($context, $next)` | `workerId`, `connection`, `taskQueue`, `namespace`, `task`, `activityType`, `activityClass`, `arguments`, `attemptNumber`, `taskId`, `activityExecutionId`, `activityAttemptId`, `workflowId`, `runId`, `local`, `activity` | the activity result |
| `executeQueryTask($context, $next)` | `workerId` (always null), `connection`, `taskQueue`, `namespace`, `task`, `queryName`, `workflowType`, `workflowId`, `runId`, `arguments`, `replayState()` (always `Replaying`) | the query result |
| `executeUpdateValidation($context, $next)` | `workerId` (always null), `connection`, `taskQueue`, `namespace`, `updateName`, `workflowType`, `workflowId`, `runId`, `arguments`, `replayState()` (always `Replaying`) | `UpdateValidationOutcome` with `approved`, `rejectionMessage`, `exceptionType`, `validationErrors` |

`task` is an array snapshot of the claimed task row, never the model itself.
`workerId` identifies the queue worker process by host and process ID. Queries
and update validations run in the calling process, so their `workerId` is null.

Workflow-task interceptors cannot change what a workflow records:

- `executeWorkflowTask` wraps the workflow task inside its database
  transaction, once per task attempt. `replaying` is `true` when earlier
  workflow tasks already recorded commands for the run. It is not a
  deduplication key: `historyEventTypes` lists only the events this task
  appended.
- `replayState()` gives the same answer as a
  `Workflow\V2\Enums\WorkflowReplayState`, the enum `Workflow::replayState()`
  uses; the interceptor's value is fixed for the task.
- Hook side effects run before the task commits and can repeat when an attempt
  is retried, so defer them with `DB::afterCommit()` or key them on `taskId` and
  `workflowTaskAttempt`.
- The engine commits the history the workflow code produced. The outcome is a
  read-only view; returning a different outcome, or passing a different context
  to `$next`, changes nothing.
- A failure from the workflow code reaches the engine unchanged, even if an
  interceptor catches it and returns normally.
- If an interceptor throws out of the chain, skips `$next` or calls it more than
  once, the task's transaction rolls back, so nothing is recorded. The task is
  released with `WorkflowTaskInterceptorFailed` as its last error and retried
  after the usual repair backoff. An outer interceptor may still catch an
  exception an inner interceptor threw after `$next` and let the task commit; a
  skipped or repeated `$next` always fails the task.
- Hooks run while the run and task rows are locked, so keep them short. They
  must not commit or roll back the surrounding transaction, and must not send
  commands such as signals to the run they are wrapping; a change to the run's
  recorded state fails the task on every attempt.
- Local activities run inside the workflow task, so a hook that keeps failing
  after `$next` makes each retry run those local activities again.

Update-validation interceptors wrap the replay and the validator call that run
before an update with an `#[UpdateValidator]` is accepted. Updates without a
validator don't run the hook. The hooks observe the decision; they cannot
change it:

- The engine acts on the validator's own outcome. Returning a different
  `UpdateValidationOutcome`, or passing different arguments to `$next`, changes
  nothing; the validator always receives the update's arguments.
- If a hook throws, skips `$next` or calls it more than once, the update is
  refused with `UpdateValidationFailedException` and nothing is recorded, so a
  hook can never let an update through unvalidated.
- The hook runs inside the update's admission transaction, while the run's rows
  are locked, so keep it short. Defer side effects with `DB::afterCommit()`;
  writes a hook makes commit or roll back with the admission. Hook code runs
  outside the workflow fiber, so it cannot schedule durable work for the run.

Activity and query interceptors may change arguments with
`$context->withArguments(...)` and may change the returned value, because an
activity result is recorded once and a query records nothing. Rewritten query
arguments are validated against the query contract again. Activity exceptions
pass through every interceptor unless one handles them, and then go through the
activity's normal retry policy. Activity interceptors wrap queued and local
activities; `local` tells them apart. Mocked activities in
`WorkflowStub::fake()` do not run interceptors.

When [embedded tracing](../monitoring.md#embedded-tracing) is enabled, the
built-in workflow and activity spans stay outermost, so interceptors run inside
the active span and can add attributes or child spans.

Interceptors wrap the queue jobs, local activities and queries this package
runs. Tasks handed to external SDK workers through the worker task bridges run
under that SDK's own interceptors. The worker bridge's `execute` route, which
runs a claimed workflow task in-process for a bridge caller, does not run
workflow-task interceptors. An entry in `workflows.v2.interceptors` that
cannot be resolved fails each path its own way: a queued workflow task is
released and retried, an activity attempt fails under its retry policy, and a
query throws to its caller. Check the list when you deploy. The
[embedded interceptor guide](https://github.com/durable-workflow/workflow/blob/main/docs/worker-interceptors.md)
has the full contract.
