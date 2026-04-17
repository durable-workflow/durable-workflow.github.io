---
sidebar_position: 3
---

# Migrating to 2.0

This guide covers the key changes when upgrading to Durable Workflow 2.0.

## Architecture note

**The standalone server, CLI, and Python SDK are v2-only components.** They did not exist in v1. This means:

- **PHP package upgrade**: Existing Laravel applications using v1 embedded execution upgrade to v2 embedded execution
- **Server/CLI adoption**: If you want to use the standalone server or CLI, these are new v2-only capabilities (no v1→v2 migration path, just adoption)
- **No server/CLI version skew**: Since server and CLI didn't exist in v1, all server/CLI instances are v2

This guide focuses on upgrading Laravel applications from v1 to v2 embedded execution. For server/CLI/Python SDK setup, see their respective installation guides.

## Upgrade procedure

### Before upgrading

**1. Back up your database**

Create a full database backup before upgrading:

```bash
# MySQL/MariaDB
mysqldump -u root -p your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# PostgreSQL
pg_dump -U postgres your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# Laravel backup package (if installed)
php artisan backup:run --only-db
```

Store the backup in a safe location. You will need it if you need to roll back.

**2. Test in staging first**

**Do not upgrade production without testing in staging.** The upgrade includes:

- Database schema changes (24 new tables)
- Namespace changes requiring code updates
- Queue worker restart (brief interruption)
- Backend capability validation

**Staging test checklist:**

- [ ] Deploy v2 code to staging environment
- [ ] Run migrations against staging database
- [ ] Restart queue workers
- [ ] Run `php artisan workflow:v2:doctor --strict`
- [ ] Start a new v2 workflow and verify it completes
- [ ] Verify v1 workflows (if any) still complete
- [ ] Check Waterline shows both v1 and v2 workflows
- [ ] Run your application's test suite
- [ ] Verify no errors in logs

Only proceed to production after staging validation passes.

### Upgrade steps

**1. Update composer dependency**

```bash
composer require durable-workflow/workflow:^2.0@alpha
```

This upgrades the package from `laravel-workflow/laravel-workflow` (v1) to `durable-workflow/workflow` (v2). The `@alpha` stability flag is required until 2.0.0 is tagged stable on Packagist — drop it once the stable release is published.

**2. Run database migrations**

```bash
php artisan migrate
```

v2 adds 24 new tables:

- Core: `workflow_instances`, `workflow_runs`, `workflow_history_events`, `workflow_tasks`, `workflow_commands`
- Activity: `activity_executions`, `activity_attempts`
- Features: `workflow_updates`, `workflow_signal_records`, `workflow_run_waits`, `workflow_run_timeline_entries`, `workflow_run_lineage_entries`, `workflow_schedules`, `workflow_schedule_history_events`
- Observability: `workflow_run_summaries`, `workflow_failures`, `workflow_links`, `worker_compatibility_heartbeats`
- Timers: `workflow_run_timers`, `workflow_run_timer_entries`
- Search / memo / message / child: `workflow_search_attributes`, `workflow_memos`, `workflow_messages`, `workflow_child_calls`

v1 tables (`workflows`, `workflow_logs`, `workflow_signals`, `workflow_timers`, `workflow_exceptions`) are preserved for finish-on-v1 execution.

**3. Update configuration (if needed)**

v2 configuration is backward compatible. If you published `config/workflow.php` in v1, it will continue to work. New v2 options include:

- `durable_types` — type aliases for language-agnostic workflow references
- `task_repair_policy` — how to handle stuck tasks
- `backend_capability_check` — strict vs. permissive validation
- `projection_rebuild` — history rebuild strategies
- `history_budget` — event count limits for continue-as-new

These have sensible defaults. Only configure them if you need non-default behavior. See [Configuration](/docs/2.0/configuration/options/) for details.

**Payload codec default changed to `avro`.** v1 defaulted to the PHP-only `Workflow\Serializers\Y::class`; v2 defaults to the language-neutral `avro` codec so Python, Go, and TypeScript workers can decode payloads without a shared PHP runtime. The complementary `json` codec is also language-neutral and is the recommended choice when you want human-readable payloads in storage and history exports. New v2 workflows you start will be tagged with `payload_codec = "avro"` unless you explicitly set `workflows.serializer`.

If you have a published `config/workflows.php` from v1 with `'serializer' => Workflow\Serializers\Y::class`, your existing setting is honored and keeps working for both v1 replay and new v2 workflows. But new v2 workflows written under that legacy codec **cannot be decoded by non-PHP workers**. Run `php artisan workflow:v2:doctor` after upgrading — it will flag a legacy codec setting with a polyglot-compatibility warning.

To accept the v2 default explicitly, leave `serializer` unset, or pin it:

```php
// config/workflows.php — v2 default (language-neutral, compact binary)
'serializer' => 'avro',

// or, for human-readable payloads in storage and exports
'serializer' => 'json',
```

Keep a legacy codec (`'workflow-serializer-y'` or `'workflow-serializer-base64'`) only if you need to start new workflows that share PHP-native values between a server and PHP-only workers. Legacy class names (`Workflow\Serializers\Y::class`, etc.) are still accepted as aliases for decoding v1 runs.

**Environment variables:**

v2 does not introduce new required environment variables. Existing `QUEUE_CONNECTION`, `CACHE_DRIVER`, and `DB_CONNECTION` continue to work.

**4. Restart queue workers**

Queue workers must be restarted to load v2 code:

```bash
# If using Laravel queue workers
php artisan queue:restart

# If using Supervisor
sudo supervisorctl restart <your-worker-group>:*

# If using systemd
sudo systemctl restart laravel-worker

# If using Horizon
php artisan horizon:terminate
```

Workers will:
1. Finish their current job
2. Exit gracefully
3. Restart with v2 code loaded

**Workers must restart before processing v2 workflows.** v1 workflows can complete with old or new workers (finish-on-v1 compatibility).

### After upgrading

**1. Verify backend capability**

```bash
php artisan workflow:v2:doctor --strict
```

Expected output:

```
✓ Database driver supports required features
✓ Queue driver supports required features
✓ Cache driver supports locks
✓ All backend capabilities present
```

If any check fails, see [Backend Requirements](/docs/2.0/installation/#requirements) for driver prerequisites.

**2. Verify v2 workflows start successfully**

Start a test workflow using v2 API:

```php
use Workflow\V2\WorkflowStub;
use Workflow\V2\StartOptions;

$workflow = WorkflowStub::make(TestWorkflow::class, 'test-upgrade');
$result = $workflow->start(['test' => true], new StartOptions());
$runId = $result->runId();
```

`WorkflowStub::start()` returns a `StartResult` object. Pull the run id off it
with `runId()` before comparing against database rows — treating the return
value as a scalar string will silently compare an object against a column.

Check that:

- Workflow appears in Waterline
- `workflow_instances` table has a row with matching `instance_id` (`$workflow->id()`)
- `workflow_runs` table has a row with matching `run_id` (`$result->runId()`)
- Workflow completes or progresses as expected

**3. Check v1 workflows (if any)**

If you have in-flight v1 workflows:

```bash
php artisan workflow:v1:list
```

Verify they continue to progress. v1 workflows should complete on the v1 engine without errors.

**4. Monitor logs for errors**

Watch application logs for workflow-related errors:

```bash
tail -f storage/logs/laravel.log | grep -i workflow
```

Common issues:

- Namespace errors: code still using `Workflow\Workflow` instead of `Workflow\V2\Workflow`
- Method errors: code still using `execute()` without `handle()` fallback
- Queue driver errors: using `sync` driver (not supported)

**5. Verify Waterline observability**

Open Waterline (default: `/waterline`) and verify:

- v1 workflows (if any) appear with their original data
- v2 workflows appear with full run/history/activity detail
- No errors in Waterline rendering

### Rollback procedure

If the upgrade fails in production, roll back:

**1. Stop queue workers**

```bash
php artisan queue:restart  # or appropriate restart command for your worker system
```

**2. Restore database backup**

```bash
# MySQL/MariaDB
mysql -u root -p your_database < backup-v1-YYYYMMDD-HHMMSS.sql

# PostgreSQL
psql -U postgres -d your_database < backup-v1-YYYYMMDD-HHMMSS.sql
```

**3. Revert composer dependency**

```bash
composer require laravel-workflow/laravel-workflow:^1.0
```

**4. Restart queue workers**

```bash
php artisan queue:restart  # or appropriate restart command
```

**5. Verify v1 operation**

- Check that v1 workflows appear in Waterline
- Start a test v1 workflow to verify functionality
- Monitor logs for errors

**Important rollback notes:**

- Rollback discards any v2 workflows started after upgrade (they exist only in v2 tables)
- Rollback restores v1 workflows to their pre-upgrade state
- If you must preserve v2 workflows started during the upgrade window, do not restore the database — instead fix the upgrade issue forward

## Code changes

The sections below detail the code-level changes needed when migrating from v1 to v2 APIs.

### Namespace change

All v2 classes live under `Workflow\V2`. Update your imports:

```php
// v1
use Workflow\Workflow;
use Workflow\Activity;
use Workflow\WorkflowStub;

// v2
use Workflow\V2\Workflow;
use Workflow\V2\Activity;
use Workflow\V2\WorkflowStub;
```

### Entry method

v2 workflows and activities use `handle()` as the entry method. If your v1 code uses `execute()`, it will still work through a compatibility path, but new code should use `handle()`:

```php
// v1
class MyWorkflow extends Workflow
{
    public function execute($input)
    {
        $result = yield ActivityStub::make(MyActivity::class, $input);
        return $result;
    }
}

// v2
use function Workflow\V2\activity;

class MyWorkflow extends Workflow
{
    public function handle($input)
    {
        return activity(MyActivity::class, $input);
    }
}
```

Do not mix `handle()` and `execute()` in the same inheritance chain — the runtime rejects this.

### Activity calls

v2 replaces `ActivityStub::make()` and `yield` with direct function helpers:

```php
// v1
$result = yield ActivityStub::make(MyActivity::class, $arg1, $arg2);

// v2
use function Workflow\V2\activity;

$result = activity(MyActivity::class, $arg1, $arg2);
```

Activities now have durable identity. Each scheduled activity gets an `activity_executions` row with a stable execution id, and each concrete attempt gets an `activity_attempts` row with typed history.

### Workflow identity

v2 splits identity into instance id and run id:

- `id()` — the public workflow instance id (same across continue-as-new)
- `runId()` — the id of the current run

In v1, these were the same concept.

### Signals

v2 uses named signal waits instead of `#[SignalMethod]` attribute-based mutators:

```php
// v1
#[SignalMethod]
public function approve()
{
    $this->approved = true;
}

// v2
use function Workflow\V2\await;

$approved = await('approve');
```

Named signals support `await('name')` for blocking workflow-code waits and `signal()` / `attemptSignal()` for external input. Cancellation and termination are not modeled as signals — they remain explicit runtime commands.

### Queries

v2 uses replay-safe query methods instead of reading workflow properties directly:

```php
// v1
#[QueryMethod]
public function getStatus(): string
{
    return $this->status;
}

// v2
use function Workflow\V2\query;

// Queries are defined as named, replay-safe accessors
```

### Timers and side effects

The function-based helpers replace the v1 static methods:

```php
// v1
yield Timer::make(60);
$value = yield SideEffect::make(fn() => random_int(1, 100));

// v2
use function Workflow\V2\timer;
use function Workflow\V2\sideEffect;

timer(60);
$value = sideEffect(fn() => random_int(1, 100));
```

### Timeouts

v2 adds workflow-level timeouts through `StartOptions`:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

$workflow->start(
    $orderId,
    StartOptions::rejectDuplicate()
        ->withExecutionTimeout(7200)   // 2 hours across all runs
        ->withRunTimeout(3600),        // 1 hour per run
);
```

- **Execution timeout** spans the entire instance, including continue-as-new transitions.
- **Run timeout** applies to a single run and resets on continue-as-new.

### Database migrations

v2 adds new tables and columns. The package auto-loads its migrations, so after updating:

```bash
composer update durable-workflow/workflow
php artisan migrate
```

The 2.0.0 release includes 24 clean base table migrations. If you previously published migration files, you may need to publish the new ones or switch to auto-loaded migrations.

### Backend capability check

v2 validates that your queue, database, and cache drivers meet its requirements. Run the doctor command after upgrading:

```bash
php artisan workflow:v2:doctor --strict
```

### Configuration

v2 introduces several new configuration options. See the [Configuration](/docs/2.0/configuration/options/) section for details on:

- Durable type aliases
- Task repair policy
- Backend capability checks
- Projection rebuilds
- History budgets and export redaction

### Waterline

Waterline (the monitoring UI) has been updated for v2 with:

- Run detail views showing timeout durations and deadlines
- Activity attempt tracking with durable ids
- Updated workflow status displays

### Continue-as-new

v2 adds history budgets that can automatically trigger continue-as-new when the event count exceeds a threshold. Metadata (memo, search attributes, timeouts) is carried forward across transitions.

## Existing workflows

### Finish-on-v1 strategy

**Workflows started under v1 will continue to execute through v1 compatibility paths.** New workflows started after upgrading will use v2 semantics. You do not need to migrate running workflow instances.

When you upgrade to 2.0:

1. **v1 data is preserved** — The `stored_workflows`, `workflow_logs`, `workflow_signals`, `workflow_timers`, and `workflow_exceptions` tables remain intact
2. **v1 workflows complete using v1 engine** — In-flight v1 workflows continue executing using the v1 replay engine until they reach a terminal state
3. **v2 workflows use v2 engine** — All workflows started after upgrade use the v2 schema (`workflow_instances`, `workflow_runs`, `workflow_history_events`, etc.)
4. **Waterline shows both** — The monitoring UI displays v1 and v2 workflows side-by-side

### Tracking v1 workflow completion

To see which v1 workflows are still active after upgrading:

```bash
php artisan workflow:v1:list
```

This command lists all v1 workflows that have not yet reached a terminal state (completed, failed, cancelled). Use it to track v1 workflow completion over time.

Sample output:

```
+--------------------------------------+---------------------+-----------+------------+
| ID                                   | Class               | Status    | Created    |
+--------------------------------------+---------------------+-----------+------------+
| 01J1234567890ABCDEFGHIJK             | App\OrderWorkflow   | running   | 2 days ago |
| 01J9876543210ZYXWVUTSRQP             | App\InvoiceWorkflow | pending   | 1 day ago  |
+--------------------------------------+---------------------+-----------+------------+
```

#### Waterline visibility

After upgrading to 2.0, Waterline automatically shows workflows from both engines:

- **v1 workflows** appear with their original `StoredWorkflow` data (class, status, logs, signals, exceptions)
- **v2 workflows** appear with full v2 detail (runs, history events, timers, activities, search attributes)

No configuration is needed — Waterline reads from both table sets and presents a unified view.

### When to clean up v1 tables

Once all v1 workflows have completed (confirmed by `workflow:v1:list` showing zero active workflows), you may optionally drop the v1 tables:

```sql
DROP TABLE IF EXISTS workflow_relationships;
DROP TABLE IF EXISTS workflow_exceptions;
DROP TABLE IF EXISTS workflow_timers;
DROP TABLE IF EXISTS workflow_signals;
DROP TABLE IF EXISTS workflow_logs;
DROP TABLE IF EXISTS workflows;
```

**Important:** Do not drop these tables while any v1 workflows remain active. Doing so will cause v1 replay to fail and leave workflows stuck.

### Why finish-on-v1?

The finish-on-v1 strategy avoids forcing a data migration at upgrade time. v1 and v2 use fundamentally different storage models:

- **v1** stores workflow state as a denormalized `workflows` row with related logs, signals, and timers
- **v2** stores workflow state as event-sourced history with projections (`workflow_instances`, `workflow_runs`, `workflow_history_events`)

Converting in-flight v1 workflows to v2 history would require reconstructing event sequences from v1 logs, which risks data loss and replay inconsistencies. The finish-on-v1 approach lets v1 workflows complete safely on their original engine while new work moves to v2 immediately.
