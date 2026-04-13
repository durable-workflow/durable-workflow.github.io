---
sidebar_position: 5
---

# Microservices
Workflows can span across multiple Laravel applications. For instance, a workflow might exist in one microservice while its corresponding activity resides in another.

To enable seamless communication between Laravel applications, set up a shared database and queue connection across all microservices.

All microservices must have identical `APP_KEY` values in their `.env` files for proper serialization and deserialization from the queue.

Below is a guide on configuring a shared MySQL database and Redis connection:

```php
// config/database.php

'connections' => [
    'shared' => [
        'driver' => 'mysql',
        'url' => env('SHARED_DB_URL'),
        'host' => env('SHARED_DB_HOST', '127.0.0.1'),
        'port' => env('SHARED_DB_PORT', '3306'),
        'database' => env('SHARED_DB_DATABASE', 'laravel'),
        'username' => env('SHARED_DB_USERNAME', 'root'),
        'password' => env('SHARED_DB_PASSWORD', ''),
        'unix_socket' => env('SHARED_DB_SOCKET', ''),
        'charset' => env('SHARED_DB_CHARSET', 'utf8mb4'),
        'collation' => env('SHARED_DB_COLLATION', 'utf8mb4_unicode_ci'),
        'prefix' => '',
        'prefix_indexes' => true,
        'strict' => true,
        'engine' => null,
        'options' => extension_loaded('pdo_mysql') ? array_filter([
            PDO::MYSQL_ATTR_SSL_CA => env('SHARED_MYSQL_ATTR_SSL_CA'),
        ]) : [],
    ],
],

'redis' => [
    'shared' => [
        'url' => env('SHARED_REDIS_URL'),
        'host' => env('SHARED_REDIS_HOST', '127.0.0.1'),
        'username' => env('SHARED_REDIS_USERNAME'),
        'password' => env('SHARED_REDIS_PASSWORD'),
        'port' => env('SHARED_REDIS_PORT', '6379'),
        'database' => env('SHARED_REDIS_DB', '0'),
    ],
],
```

```php
// config/queue.php

'connections' => [
    'shared' => [
        'driver' => 'redis',
        'connection' => env('SHARED_REDIS_QUEUE_CONNECTION', 'default'),
        'queue' => env('SHARED_REDIS_QUEUE', 'default'),
        'retry_after' => (int) env('SHARED_REDIS_QUEUE_RETRY_AFTER', 90),
        'block_for' => null,
        'after_commit' => false,
    ],
],
```

For consistency in the workflow database schema across services, designate only one microservice to run the workflow migrations. The package now auto-loads those migrations, so that service can usually just run `php artisan migrate` against the shared database.

If you intentionally need local editable copies of the migration classes, publish them first and then modify them to use the shared database connection:

```php
// database/migrations/2022_01_01_000000_create_workflows_table.php

final class CreateWorkflowsTable extends Migration
{
    protected $connection = 'shared';
```

In each microservice, extend the workflow models to use the shared connection:

```php
// app\Models\StoredWorkflow.php

class StoredWorkflow extends BaseStoredWorkflow
{
    protected $connection = 'shared';
```

Publish the workflow config file and update it to use your custom models.

Update your workflow and activity classes to use the shared queue connection. Assign unique queue names to each microservice for differentiation:

```php
// App: workflow microservice

use function Workflow\activity;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public $connection = 'shared';
    public $queue = 'workflow';

    public function execute($name)
    {
        $result = yield activity(MyActivity::class, $name);
        return $result;
    }
}
```

```php
// App: activity microservice

use Workflow\Activity;

class MyActivity extends Activity
{
    public $connection = 'shared';
    public $queue = 'activity';

    public function execute($name)
    {
        return "Hello, {$name}!";
    }
}
```

It's crucial to maintain empty duplicate classes in every microservice, ensuring they share the same namespace and class name. This precaution avoids potential exceptions due to class discrepancies:

```php
// App: workflow microservice

use Workflow\Activity;

class MyActivity extends Activity
{
    public $connection = 'shared';
    public $queue = 'activity';
}
```

```php
// App: activity microservice

use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public $connection = 'shared';
    public $queue = 'workflow';
}
```

Note: The workflow code should exclusively reside in the workflow microservice, and the activity code should only be found in the activity microservice. The code isn't duplicated; identical class structures are merely maintained across all microservices.

To run queue workers in each microservice, use the shared connection and the respective queue names:

```bash
php artisan queue:work shared --queue=workflow
php artisan queue:work shared --queue=activity
```

In this setup, the workflow queue worker runs in the workflow microservice, while the activity queue worker runs in the activity microservice.

## Activity Boundary

The default activity path runs through PHP queue workers, but activity work is anchored by durable ids instead of queue-serialized workflow state. Each scheduled activity has an `activity_executions` row, one or more `activity_attempts` rows, and typed activity history. Selected-run detail and history exports use that typed history as the portable audit/display source for attempts, with mutable rows acting as runtime state and older-preview fallback. The execution id returned by `Workflow\V2\Activity::activityId()` is the default idempotency key for outbound remote work, while `attemptId()` identifies one concrete try.

The runtime also snapshots the activity retry policy when the activity is scheduled. `retry_policy.max_attempts` and `retry_policy.backoff_seconds` are stored on the activity execution, copied into `ActivityScheduled` and `ActivityRetryScheduled` history snapshots, exposed in Waterline activity detail, and included in history exports. That keeps retry behavior stable for an already scheduled activity even if another service deploys a new PHP class with different `$tries` or `backoff()` values.

The activity-task worker bridge is exposed through the `Workflow\V2\Contracts\ActivityTaskBridge` contract, registered as a singleton in the container. This lets a standalone server or external adapter poll for ready activity tasks, claim a task by id, heartbeat by attempt id, then complete or fail that attempt without loading the PHP activity class.

The bridge is resolved from the container:

```php
use Workflow\V2\Contracts\ActivityTaskBridge;

$bridge = app(ActivityTaskBridge::class);
```

A static convenience class `Workflow\V2\ActivityTaskBridge` delegates to the same container-resolved singleton:

```php
use Workflow\V2\ActivityTaskBridge;

// These two are equivalent:
$claim = ActivityTaskBridge::claim($taskId, 'payments-worker-1');
$claim = app(\Workflow\V2\Contracts\ActivityTaskBridge::class)->claim($taskId, 'payments-worker-1');
```

New consumers should resolve the contract interface directly.

### Polling for ready tasks

`poll()` returns ready activity tasks matching optional connection, queue, and compatibility filters. Each result includes the task id, workflow run id, instance id, activity execution id, activity type, queue, connection, compatibility marker, and availability time:

```php
$tasks = $bridge->poll('redis', 'default', limit: 10);

foreach ($tasks as $taskSummary) {
    // $taskSummary['task_id'], $taskSummary['activity_type'], etc.
}
```

Pass `null` for connection, queue, or compatibility to match all ready activity tasks regardless of that dimension. To filter by build id or compatibility marker, pass the marker as the fourth argument:

```php
// Only return tasks matching a specific build/compatibility marker
$tasks = $bridge->poll(null, null, limit: 10, compatibility: 'build-2024-04-12');
```

### Claiming a task

`claimStatus()` claims a specific activity task and returns a structured result with claim details or a rejection reason. `claim()` returns the claim payload on success or `null` on failure:

```php
$claim = $bridge->claim($taskId, 'payments-worker-1');

if ($claim !== null) {
    // $claim['task_id'], $claim['activity_execution_id'],
    // $claim['activity_attempt_id'], $claim['attempt_number'],
    // $claim['arguments'], $claim['payload_codec'], $claim['retry_policy']
}
```

Claim checks include task existence, task type, task status, run status, backend capability validation, and compatibility marker matching. On success the task transitions to `leased` with a lease expiry.

### Completing or failing an attempt

`complete()` records a successful activity result. `fail()` records a failure. Both accept the `activity_attempt_id` from the claim:

```php
$bridge->complete($claim['activity_attempt_id'], ['confirmation' => 'captured']);

// Failures accept a Throwable, message string, or structured payload:
$bridge->fail($claim['activity_attempt_id'], 'Gateway timeout');
$bridge->fail($claim['activity_attempt_id'], [
    'type' => 'payments.gateway-timeout',
    'class' => RuntimeException::class,
    'message' => 'Gateway timeout',
]);
```

If `type` maps to a current throwable class under `workflows.v2.types.exceptions`, replay resolves that durable alias before falling back to the recorded PHP class. Older failure payloads without `type` can use `workflows.v2.types.exception_class_aliases` as a PHP-class refactor bridge, but new integrations should send durable exception types so replay is not coupled to a historical FQCN. If an adapter reports a failure that later cannot be resolved through one of those contracts, replay blocks with `UnresolvedWorkflowFailureException` instead of delivering a generic catchable exception to workflow code; Waterline marks that failure as `exception_replay_blocked` until the mapping is corrected. Bridge claims and the default PHP activity job use the same backend/compatibility checks, task lease creation, durable attempt row, and typed `ActivityStarted` history path. The bridge also writes the same typed `ActivityCompleted`, `ActivityFailed`, `ActivityRetryScheduled`, or `ActivityCancelled` history as the default PHP activity job, uses the snapped retry policy for retry decisions, ignores late results from stale attempts, dispatches the next workflow or retry task after the outcome commits, and gives selected-run/export attempt views their history-first rebuild source.

### Heartbeat and status

`heartbeat()` extends the lease on a claimed activity task and returns liveness, cancellation, and lease metadata. `status()` returns the same shape without renewing the lease:

```php
$hb = $bridge->heartbeat($claim['activity_attempt_id']);

if (! $hb['can_continue']) {
    // Check $hb['cancel_requested'] and $hb['reason']
    // Reasons include 'run_cancelled', 'run_terminated', 'activity_cancelled', etc.
    return;
}

// Heartbeat with optional progress payload:
$hb = $bridge->heartbeat($claim['activity_attempt_id'], [
    'current' => 50,
    'total' => 100,
    'message' => 'Processing records',
]);
```

The structured response includes `can_continue`, `cancel_requested`, `reason`, `heartbeat_recorded`, run/activity/attempt/task status fields, lease owner, lease expiry, and last heartbeat timestamp. When a cancel or terminate command has already closed the run, `heartbeat()` returns `can_continue = false`, `cancel_requested = true`, and a reason such as `run_cancelled` or `run_terminated`; it also closes the still-running attempt lease, records `ActivityCancelled` if the stop was not already in history, and makes a later `complete()` or `fail()` call ignored as a stale attempt. Waterline surfaces the same observation fields on selected-run activity attempts as `can_continue`, `cancel_requested`, and `stop_reason`.

### Contract and customization

The default implementation is `Workflow\V2\Support\DefaultActivityTaskBridge`. Apps that need custom claim, lease, or execution behavior can bind their own implementation of `Workflow\V2\Contracts\ActivityTaskBridge` in the container.

### HTTP routes

The same bridge is also exposed through `Workflow\V2\Webhooks::routes(...)` as authenticated HTTP/JSON routes for known durable task and attempt ids:

```text
GET  /webhooks/activity-tasks/poll
POST /webhooks/activity-tasks/{taskId}/claim
GET  /webhooks/activity-attempts/{attemptId}
POST /webhooks/activity-attempts/{attemptId}/heartbeat
POST /webhooks/activity-attempts/{attemptId}/complete
POST /webhooks/activity-attempts/{attemptId}/fail
```

The poll route accepts optional `connection`, `queue`, `limit` (1–100, default 10), `compatibility`, and `namespace` query parameters. It returns the same task summary list as the PHP `poll()` method, wrapped in a `{"tasks": [...]}` envelope. A standalone server uses this route to discover ready activity tasks before claiming them by id.

That HTTP surface is still the same first bridge, not a complete hosted cross-language worker service. It does not yet provide long-poll claim loops or service-level routing. Namespace scoping is supported at the package level through `poll()` and visibility filters; the HTTP poll routes accept a `namespace` query parameter. External workers should integrate through durable task ids, execution ids, attempt ids, codec-tagged payloads, heartbeats, completion or failure records, and late-result handling. They should not depend on mirroring placeholder PHP classes or sharing queue-serialized PHP payloads as the protocol boundary.

## Workflow Task Boundary

A workflow-task worker bridge is exposed through the `Workflow\V2\Contracts\WorkflowTaskBridge` contract, registered as a singleton in the container. This bridge lets a standalone server or external adapter poll for ready workflow tasks, claim a task by id, retrieve the full replay/history payload, execute the task in-process using the package executor, or record failure, all without reimplementing `RunWorkflowTask` internals.

The bridge is resolved from the container:

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;

$bridge = app(WorkflowTaskBridge::class);
```

### Polling for ready tasks

`poll()` returns ready workflow tasks matching optional connection, queue, and compatibility filters. Each result includes the task id, workflow run id, instance id, workflow type, queue, connection, compatibility marker, and availability time:

```php
$tasks = $bridge->poll('redis', 'default', limit: 10);

foreach ($tasks as $taskSummary) {
    // $taskSummary['task_id'], $taskSummary['workflow_type'], etc.
}
```

Pass `null` for connection, queue, or compatibility to match all ready workflow tasks regardless of that dimension. To filter by build id or compatibility marker, pass the marker as the fourth argument:

```php
// Only return tasks matching a specific build/compatibility marker
$tasks = $bridge->poll(null, null, limit: 10, compatibility: 'build-2024-04-12');
```

### Claiming a task

`claimStatus()` claims a specific workflow task and returns a structured result with claim details or a rejection reason. `claim()` returns the claim payload on success or `null` on failure:

```php
$claim = $bridge->claim($taskId, 'server-worker-1');

if ($claim !== null) {
    // $claim['task_id'], $claim['workflow_run_id'], $claim['lease_owner'], etc.
}
```

Claim checks include task existence, task type, task status, run status, backend capability validation, and compatibility marker matching. On success the task transitions to `leased` with a 5-minute lease.

### History payload for replay

`historyPayload()` returns the full history event list, run metadata, and serialized arguments for a claimed task. An external worker or standalone server uses this payload to replay the workflow:

```php
$history = $bridge->historyPayload($taskId);

if ($history !== null) {
    // $history['workflow_type'], $history['payload_codec'], $history['arguments']
    // $history['history_events'] — ordered array of typed history event records
}
```

Each history event includes `id`, `sequence`, `event_type`, `payload`, `workflow_task_id`, `workflow_command_id`, and `recorded_at`.

### In-process execution

`execute()` claims and executes a workflow task in-process using the package's `WorkflowExecutor`. This is the recommended path when the caller has the package installed and wants the same execution semantics as the default `RunWorkflowTask` queue job:

```php
$result = $bridge->execute($taskId);

if ($result['executed']) {
    // $result['run_status'] — current run status after execution
    // $result['next_task_id'] — next task to dispatch, or null if the run completed/failed
}
```

The execute path handles claiming, terminal-run detection, executor invocation, failure recording, and summary projection.

### Recording failure

`fail()` records a workflow task failure from an external worker. Use this when the worker encountered an infrastructure or replay error:

```php
$result = $bridge->fail($taskId, 'Worker crashed during replay');

// Also accepts Throwable or array payloads:
$result = $bridge->fail($taskId, new RuntimeException('Replay timeout'));
$result = $bridge->fail($taskId, ['message' => 'History too large']);
```

### Heartbeat

`heartbeat()` extends the lease on a claimed workflow task. The response includes renewal status, updated lease expiry, run status, and task status:

```php
$hb = $bridge->heartbeat($taskId);

if (! $hb['renewed']) {
    // Check $hb['reason'] — 'run_closed', 'task_not_leased', etc.
}
```

### External completion

`complete()` applies the result of an external worker that replayed the workflow task outside the package. The caller passes a list of commands produced by replay. Commands fall into two categories:

**Non-terminal commands** (zero or more, processed in order):

| Type | Fields | Effect |
|------|--------|--------|
| `schedule_activity` | `activity_type` (required), `arguments`, `connection`, `queue` | Creates an `ActivityExecution` and a ready activity task |
| `start_timer` | `delay_seconds` (required) | Creates a `WorkflowTimer` and a ready timer task |
| `start_child_workflow` | `workflow_type` (required), `arguments`, `connection`, `queue` | Creates a child workflow instance, run, link, and ready workflow task |

**Terminal commands** (at most one):

| Type | Fields | Effect |
|------|--------|--------|
| `complete_workflow` | `result` (optional serialized string) | Marks the run as completed |
| `fail_workflow` | `message` (required), `exception_class`, `exception_type` | Marks the run as failed with a failure record |
| `continue_as_new` | `arguments` (optional serialized string), `workflow_type` (optional) | Closes the current run as continued and starts a new run in the same instance |

At least one recognized command must be present. When only non-terminal commands are provided, the run transitions to `waiting` and the workflow task is marked completed. When a terminal command is included, non-terminal commands are applied first, then the terminal command closes the run.

```php
// Schedule activities and wait
$result = $bridge->complete($taskId, [
    ['type' => 'schedule_activity', 'activity_type' => 'send-email', 'arguments' => json_encode(['user@example.com'])],
    ['type' => 'start_timer', 'delay_seconds' => 300],
]);
// $result['run_status'] === 'waiting'

// Workflow completed successfully
$result = $bridge->complete($taskId, [
    ['type' => 'complete_workflow', 'result' => json_encode('Hello, Taylor')],
]);

// Workflow failed
$result = $bridge->complete($taskId, [
    [
        'type' => 'fail_workflow',
        'message' => 'Determinism violation at sequence 5',
        'exception_class' => 'RuntimeException',
    ],
]);

// Start a child workflow and continue as new
$result = $bridge->complete($taskId, [
    ['type' => 'start_child_workflow', 'workflow_type' => 'cleanup-workflow'],
    ['type' => 'continue_as_new', 'arguments' => json_encode(['next-batch'])],
]);

if ($result['completed']) {
    // $result['run_status'] — 'waiting', 'completed', 'failed', etc.
}
```

The task must be in `leased` status and the run must be non-terminal. On success, `complete()` records typed history events, creates durable task and entity records for each command, dispatches parent resume tasks for child workflows, and projects the run summary.

The response includes a `created_task_ids` array listing every task created by the non-terminal commands and any continue-as-new workflow task. A server or external adapter can use these ids to claim newly created tasks directly without an extra poll round-trip:

```php
$result = $bridge->complete($taskId, [
    ['type' => 'schedule_activity', 'activity_type' => 'send-email', 'arguments' => '...'],
    ['type' => 'start_timer', 'delay_seconds' => 300],
]);

// $result['created_task_ids'] — e.g. ['01JT...activity', '01JT...timer']
// Each id can be passed directly to the corresponding bridge's claim() method.
```

Tasks created by `complete()` are committed in the same transaction and are immediately visible to subsequent `poll()` calls on any bridge. The 1-second availability ceiling in both `WorkflowTaskBridge::poll()` and `ActivityTaskBridge::poll()` guarantees that same-tick ready tasks are reliably surfaced across all supported backends, including SQLite.

Serialized values (`result`, `arguments`) should match the run's `payload_codec`. The `activity_type` and `workflow_type` fields are registered type keys. When `connection` or `queue` are omitted from `schedule_activity` or `start_child_workflow`, they default to the parent run's values.

### Contract and customization

The default implementation is `Workflow\V2\Support\DefaultWorkflowTaskBridge`. Apps that need custom claim, lease, or execution behavior can bind their own implementation of `Workflow\V2\Contracts\WorkflowTaskBridge` in the container.

The workflow task bridge uses the same backend/compatibility checks, task lease semantics, and summary projection as the default `RunWorkflowTask` queue job. It supports namespace filtering through the `namespace` parameter on `poll()`. It does not yet provide long-poll discovery.

### HTTP routes

The workflow task bridge is also exposed through `Workflow\V2\Webhooks::routes(...)` as authenticated HTTP/JSON routes for known durable task ids:

```text
GET  /webhooks/workflow-tasks/poll
POST /webhooks/workflow-tasks/{taskId}/claim
GET  /webhooks/workflow-tasks/{taskId}/history
POST /webhooks/workflow-tasks/{taskId}/execute
POST /webhooks/workflow-tasks/{taskId}/complete
POST /webhooks/workflow-tasks/{taskId}/fail
POST /webhooks/workflow-tasks/{taskId}/heartbeat
```

**Poll** discovers ready workflow tasks. Accepts optional `connection`, `queue`, `limit` (1–100, default 10), `compatibility`, and `namespace` query parameters. Returns `{"tasks": [...]}` with the same task summary shape as the PHP `poll()` method.

**Claim** creates a lease on a ready workflow task. Pass an optional `lease_owner` string in the request body. Returns the claim payload on success or a rejection reason on failure:

```bash
curl -X POST /webhooks/workflow-tasks/{taskId}/claim \
  -H 'Content-Type: application/json' \
  -d '{"lease_owner": "server-worker-1"}'
```

**History** returns the full typed history event list, run metadata, and serialized arguments for a task. An external worker uses this payload to replay the workflow outside the package:

```bash
curl /webhooks/workflow-tasks/{taskId}/history
```

**Execute** claims and executes a workflow task in-process using the package executor. This is the recommended HTTP path when the caller has the package installed:

```bash
curl -X POST /webhooks/workflow-tasks/{taskId}/execute
```

**Complete** applies replay results from an external worker. The request body must include a `commands` array. Each command is an object with a `type` field. Non-terminal types (`schedule_activity`, `start_timer`, `start_child_workflow`) may appear zero or more times. At most one terminal type (`complete_workflow`, `fail_workflow`, `continue_as_new`) is allowed:

```bash
curl -X POST /webhooks/workflow-tasks/{taskId}/complete \
  -H 'Content-Type: application/json' \
  -d '{"commands": [{"type": "complete_workflow", "result": "serialized-value"}]}'
```

**Fail** records a workflow task failure from an external worker. The request body must include a `failure` field as a string or object:

```bash
curl -X POST /webhooks/workflow-tasks/{taskId}/fail \
  -H 'Content-Type: application/json' \
  -d '{"failure": "Worker crashed during replay"}'
```

**Heartbeat** extends the lease on a claimed workflow task:

```bash
curl -X POST /webhooks/workflow-tasks/{taskId}/heartbeat
```

Like the activity task HTTP surface, these routes are the same first bridge exposed over HTTP, not a complete hosted worker service. They do not yet provide long-poll claim loops, namespaces, or service-level routing.

## Control Plane

A control-plane contract is exposed through `Workflow\V2\Contracts\WorkflowControlPlane`, registered as a singleton in the container. This contract lets a standalone server or external adapter start, signal, query, update, cancel, terminate, repair, and archive workflows using **durable type keys** instead of requiring local PHP class resolution.

This is the key difference from `WorkflowStub::make()` and `WorkflowStub::load()`: the control plane accepts workflow type strings and instance ids directly, so a server process that does not have the workflow PHP classes installed can still drive the full workflow lifecycle. Workers that do have the classes pick up the actual replay work through the task bridges.

The control plane is resolved from the container:

```php
use Workflow\V2\Contracts\WorkflowControlPlane;

$controlPlane = app(WorkflowControlPlane::class);
```

### Starting a workflow

`start()` creates a workflow instance, first run, and a ready workflow task. When the workflow class is locally resolvable through the type registry, the full command contract snapshot, definition fingerprint, and class-derived routing are applied. When the class is not locally available, the instance is created with the type key and explicit routing from options; the command contract is deferred to the worker that claims the first task.

Durable type keys may contain dots for namespacing (e.g. `billing.invoice-sync`, `tests.external-greeting-workflow`). The type registry matches flat key names, not nested config paths, so dotted keys work without special escaping in the `workflows.v2.types.workflows` config array.

```php
$result = $controlPlane->start('order-processing', 'order-12345', [
    'arguments' => json_encode(['item_count' => 3]),
    'connection' => 'redis',
    'queue' => 'workflows',
    'business_key' => 'order-12345',
    'labels' => ['team' => 'payments'],
    'memo' => ['description' => 'Process order #12345'],
]);

if ($result['started']) {
    // $result['workflow_instance_id'], $result['workflow_run_id'], $result['task_id']
}
```

Options:
- `arguments` — codec-tagged serialized arguments (string)
- `connection` — queue connection override
- `queue` — queue name override
- `namespace` — execution namespace for multi-namespace isolation (falls back to `WORKFLOW_V2_NAMESPACE` config)
- `business_key` — caller-supplied business key
- `labels` — visibility labels for fleet search
- `memo` — non-indexed metadata
- `duplicate_start_policy` — `'reject_duplicate'` (default) or `'return_existing_active'`

The returned array includes `started` (bool), `workflow_instance_id`, `workflow_run_id`, `workflow_type`, `outcome`, `task_id`, and `reason` (on rejection).

### Signaling a workflow

`signal()` sends a named signal to an existing workflow instance. The signal name and arguments are validated against the durable command contract recorded in history, so this works without local class resolution as long as the run has a snapped contract:

```php
$result = $controlPlane->signal('order-12345', 'addItem', [
    'arguments' => ['SKU-789'],
]);

if ($result['accepted']) {
    // Signal was accepted and recorded
}
```

### Querying a workflow

`query()` executes a named query against a workflow instance. Query requires replaying the workflow, which needs the workflow class to be locally resolvable. When the class is unavailable, the result indicates the query cannot be served:

```php
$result = $controlPlane->query('order-12345', 'getTotal');

if ($result['success']) {
    // $result['result'] contains the query return value
}
```

### Updating a workflow

`update()` submits a named update to a workflow instance. The update is recorded as an accepted command and returns immediately without waiting for the update to finish applying:

```php
$result = $controlPlane->update('order-12345', 'setShippingAddress', [
    'arguments' => ['123 Main St'],
]);

if ($result['accepted']) {
    // $result['update_id'] can be used to poll for completion
}
```

### Cancelling and terminating

`cancel()` requests graceful cancellation; `terminate()` forces immediate termination:

```php
$result = $controlPlane->cancel('order-12345', [
    'reason' => 'Customer requested cancellation',
]);

$result = $controlPlane->terminate('order-12345', [
    'reason' => 'Fraud detected',
]);
```

Both return `accepted` (bool), `workflow_instance_id`, `workflow_command_id`, and `reason` (on rejection). Rejection reasons include `instance_not_found`, `instance_not_started`, and `run_not_active`.

### Repairing a workflow

`repair()` requests a repair of the current workflow run. Repair re-projects the run summary, detects liveness issues, and creates a new workflow task when the run is in a repairable state. Only open runs on the current instance may be repaired:

```php
$result = $controlPlane->repair('order-12345');

if ($result['accepted']) {
    // Repair was accepted and a new task was created
}
```

Rejection reasons include `instance_not_found`, `instance_not_started`, and `run_not_active` (run is already closed).

### Archiving a workflow

`archive()` marks a terminal workflow run as archived. Archived runs are excluded from active fleet views and may be eligible for cold storage or cleanup. Only closed (completed, failed, cancelled, terminated) runs may be archived:

```php
$result = $controlPlane->archive('order-12345', [
    'reason' => 'Retention period expired',
]);

if ($result['accepted']) {
    // Run is now archived
}
```

Archiving an already-archived run returns `accepted` with an `archive_not_needed` outcome. Rejection reasons include `instance_not_found`, `instance_not_started`, and `run_not_closed`.

### Describing a workflow

`describe()` returns the current state of a workflow instance without loading the full Waterline detail view. This is the recommended path for server APIs, CLI tools, and operator dashboards that need workflow state without the overhead of the full projection tree:

```php
$result = $controlPlane->describe('order-12345');

if ($result['found']) {
    // Instance metadata
    $result['workflow_instance_id'];  // 'order-12345'
    $result['workflow_type'];         // 'order-processing'
    $result['namespace'];             // 'production' or null
    $result['business_key'];          // 'order-12345'
    $result['run_count'];             // 1

    // Current run state
    $result['run']['workflow_run_id'];  // ULID
    $result['run']['run_number'];       // 1
    $result['run']['is_current_run'];   // true
    $result['run']['status'];           // 'running'
    $result['run']['status_bucket'];    // 'running'
    $result['run']['compatibility'];    // 'build-a'
    $result['run']['connection'];       // 'redis'
    $result['run']['queue'];            // 'workflows'
    $result['run']['wait_kind'];        // null or 'signal', 'timer', etc.
    $result['run']['wait_reason'];      // null or human-readable wait description

    // Action availability
    $result['actions']['can_signal'];    // true
    $result['actions']['can_query'];     // true (false for remote-only workflows)
    $result['actions']['can_update'];    // true (false for remote-only or non-current runs)
    $result['actions']['can_cancel'];    // true
    $result['actions']['can_terminate']; // true
    $result['actions']['can_repair'];    // true (false for closed runs or non-current runs)
    $result['actions']['can_archive'];   // false (true only for terminal runs not yet archived)
}
```

To describe a specific run instead of the current run, pass `run_id` in options:

```php
$result = $controlPlane->describe('order-12345', [
    'run_id' => $specificRunId,
]);
```

Action availability reflects whether the operation can succeed right now: closed runs cannot accept commands, remote-only workflows cannot serve queries or updates locally, non-current runs cannot receive signals, updates, cancellations, terminations, or repairs, and only terminal runs that have not already been archived are eligible for archival.

### Contract and customization

The default implementation is `Workflow\V2\Support\DefaultWorkflowControlPlane`. Apps that need custom start, routing, or command behavior can bind their own implementation of `Workflow\V2\Contracts\WorkflowControlPlane` in the container.

The control plane uses `CommandContext::controlPlane()` as the command source for audit and tracing. All operations return plain arrays suitable for HTTP/JSON serialization. Queue dispatch after start is a delivery hint; the durable task is already persisted and will be picked up by the next poll cycle even if dispatch fails.

### HTTP route

The control-plane start operation is also exposed as an authenticated HTTP/JSON route through `Workflow\V2\Webhooks::routes(...)`:

```text
POST /webhooks/control-plane/start
```

The request body accepts `workflow_type` (required), `instance_id`, `arguments`, `connection`, `queue`, `business_key`, `labels`, `memo`, and `duplicate_start_policy`. See the [webhooks documentation](../features/webhooks.md#control-plane-start-webhook) for the full HTTP contract and response matrix.
