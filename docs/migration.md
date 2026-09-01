---
sidebar_position: 13
title: Migrating to 2.0
description: Upgrade an existing Laravel Workflow v1 application to Durable Workflow v2.
tags:
  - migration
  - upgrade
  - v2
keywords:
  - migrate to Durable Workflow v2
  - Laravel Workflow upgrade
  - v2 schema migration
  - workflow v1 to v2
---

# Migrating to 2.0

This guide covers the key changes when upgrading an existing Laravel v1 application to v2.
First choose whether Laravel will keep owning the runtime or connect to Cloud or
a self-hosted Server through the PHP SDK in the
[Laravel adoption and runtime transition guide](/docs/laravel-adoption/).
This page then provides the detailed v1-to-v2 embedded package procedure.

## Upgrade procedure

### Before upgrading

**1. Inventory every v1 execution store**

v1 execution state is not necessarily confined to the workflow database. In
addition to the workflow rows and history, Laravel queue jobs can be ready,
delayed, or reserved in Redis, a queue database, SQS, or another queue
backend. Record all of the following before changing code:

- the workflow storage connection and the actual v1 model/table mappings
- every queue connection and queue name used by v1 workflows and activities,
  including per-workflow or per-activity overrides
- the queue backend's database, key prefix, region, account, and other routing
  settings needed to restore the same queues
- the secret-manager reference and immutable version that retrieve the exact
  `APP_KEY`, plus any cache store used for v1 unique-job locks

Do not copy the `APP_KEY` value, secret-manager recovery credentials, database
credentials, or queue-provider credentials into this inventory. Encrypted jobs
and serialized workflow arguments require the original key, but the recovery
manifest should contain only its secret-manager reference and version. Keep the
credentials that can retrieve that key separately access-controlled from the
SQL and queue backups.

The default v1 tables are `workflows`, `workflow_logs`, `workflow_signals`,
`workflow_timers`, `workflow_exceptions`, and `workflow_relationships`.
Published `config/workflows.php` files may replace the
`stored_workflow_model`, `stored_workflow_log_model`,
`stored_workflow_signal_model`, `stored_workflow_timer_model`, or
`stored_workflow_exception_model`. A replacement model may also override its
Eloquent `$table`; `workflow_relationships_table` separately controls the
relationship table. Back up the tables and storage connection resolved by
those configured models, not only the default names.

**2. Choose a rollback boundary and quiesce v1 work**

Prevent new workflow starts and signals while taking the recovery cut. Pause
schedulers and stop every worker that can consume the inventoried queues after
its current job reaches a boundary. For example:

```bash
# Horizon
php artisan horizon:pause

# Supervisor or systemd (use the names from your deployment)
sudo supervisorctl stop <your-worker-group>:*
sudo systemctl stop laravel-worker
```

`php artisan queue:restart` alone is not a quiesce operation when Supervisor,
systemd, Kubernetes, or another process manager immediately starts a
replacement worker. Confirm that no consumer can reserve another job before
capturing state.

Choose and record one of these policies:

- **Drain v1:** block new v1 work, leave v1 workers running until
  `php artisan workflow:v1:list` (when available) or an equivalent query of the
  configured stored-workflow table reports no nonterminal workflows, then stop
  the workers and confirm the relevant queues have no ready, delayed, or
  reserved v1 jobs. SQL-only rollback can cover these terminal v1 workflows.
- **Preserve in-flight v1:** stop workers at job boundaries and take an
  application-consistent snapshot of both SQL and every durable queue backend.
  The queue snapshot must include ready, delayed, and reserved work and must be
  from the same recovery cut as SQL. Wait for a reserved job to finish before
  the cut unless the backend documents how to restore its message and lease
  safely.
- **Accept in-flight loss:** if the backend cannot provide a restorable queue
  cut, record the affected workflow IDs and explicitly accept that
  queue-dependent nonterminal executions cannot be recovered by this rollback.
  Exclude an eligible `pending` row from that disposition only after proving
  the Watchdog path below, and exclude a genuine signal-only wait only after
  testing its retained ingress. Do not present any other SQL row as recoverable
  work.

A signal-only wait may legitimately have no queued job if its external signal
ingress remains available after rollback. Activity retries and timers are
queue-backed: a `workflow_timers` row or a waiting `workflows` row does not
recreate a missing delayed job.

Supported v1.0.77 also starts its enabled-by-default `Workflow\Watchdog` from
the queue worker loop. The Watchdog can find a `pending` workflow whose
`updated_at` is at least five minutes old and whose serialized `arguments` are
present, then redispatch that workflow to its recorded connection and queue.
This is a bounded, pending-only wake path, not a replacement for queue backup.
You may rely on it only after staging evidence shows the restored v1 worker
loop dispatching the Watchdog, the Watchdog redispatching an eligible stale
`pending` row, and that workflow advancing on the expected queue. It does not
recreate activity retries or timer jobs and does not recover `waiting` or
`running` rows. Those states still need their preserved queue job or a valid
external signal path where the workflow is genuinely waiting for a signal.

**3. Back up the rollback recovery set**

Create a full database backup before upgrading:

```bash
# MySQL/MariaDB
mysqldump -u root -p your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# PostgreSQL
pg_dump -U postgres your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# Laravel backup package (if installed)
php artisan backup:run --only-db
```

Then preserve queue state according to the backend:

- **Database queue:** include the queue tables and their connection in the same
  recovery cut. They may be outside the workflow database.
- **Redis queue:** use a restorable Redis snapshot or backup that includes the
  exact queue database/prefix and its ready, delayed, and reserved keys. If the
  same Redis database holds unique-job locks needed by the cut, preserve those
  keys too. Prefer a dedicated queue database or instance; restoring a shared
  Redis snapshot can rewind unrelated application data.
- **SQS or another managed queue:** use a provider-supported, point-in-time
  message restore only if it preserves available, delayed, and in-flight
  messages consistently. SQS does not provide an arbitrary queue snapshot for
  this procedure, so drain v1 work or classify the remaining queue-dependent
  v1 work as unrecoverable. The only SQL-only exceptions are a proven
  Watchdog-eligible `pending` row and a tested signal-only wait.

Store the SQL backup, queue backup, non-secret inventory, and recovery timestamp
together. That recovery manifest may name the `APP_KEY` secret-manager
reference and version, but must not contain the key or any credentials that can
retrieve it. Keep secret-manager, database, queue-provider, and backup recovery
credentials separately access-controlled. Restoring SQL from one cut and queue
state from another is not a supported in-flight rollback.

**4. Test in staging first**

**Do not upgrade production without testing in staging.** The upgrade includes:

- Database schema changes (the v2 durable kernel adds new tables; the
  exact count is whatever `php artisan migrate` applies, and a future
  squashed migration may consolidate the per-feature files)
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
composer require %%artifact.workflowComposerPackage%%
```

The maintained Composer package is `durable-workflow/workflow` for both v1 and
v2; this command changes its version constraint to the current public v2
artifact pin. The old `laravel-workflow/laravel-workflow` name is only a
compatibility alias for dependency graphs created before the package rename.
Use the maintained name for new requirements and rollback. The current public
artifact pin names the stable 2.0 package. Use
`durable-workflow/workflow:^2.0` when you want Composer to accept compatible
2.x updates automatically.

**2. Run database migrations**

```bash
php artisan migrate
```

v2 adds the durable-kernel tables that back the v2 feature contract. The
current per-feature migrations create:

- Core: `workflow_instances`, `workflow_runs`, `workflow_history_events`, `workflow_tasks`, `workflow_commands`
- Activity: `activity_executions`, `activity_attempts`
- Features: `workflow_updates`, `workflow_signal_records`, `workflow_run_waits`, `workflow_run_timeline_entries`, `workflow_run_lineage_entries`, `workflow_schedules`, `workflow_schedule_history_events`
- Observability: `workflow_run_summaries`, `workflow_failures`, `workflow_links`, `worker_compatibility_heartbeats`
- Timers: `workflow_run_timers`, `workflow_run_timer_entries`
- Search / memo / message / child: `workflow_search_attributes`, `workflow_memos`, `workflow_messages`, `workflow_child_calls`
- Service catalog: `workflow_service_endpoints`, `workflow_services`, `workflow_service_operations`, `workflow_service_calls`

A future squashed migration may consolidate these into fewer files
without changing the durable contract. The supported way to know what
your database actually has is to run `php artisan migrate:status` after
the upgrade.

The default v1 tables (`workflows`, `workflow_logs`, `workflow_signals`,
`workflow_timers`, `workflow_exceptions`, and `workflow_relationships`) are
preserved for finish-on-v1 execution. If the configured v1 models override
their tables or storage connection, those configured tables are the v1 source
of truth instead.

**3. Update configuration (if needed)**

v2 configuration is backward compatible. If you published `config/workflow.php` in v1, it will continue to work. New v2 options include:

- `durable_types` — type aliases for language-agnostic workflow references
- `task_repair_policy` — how to handle stuck tasks
- `backend_capability_check` — strict vs. permissive validation
- `projection_rebuild` — history rebuild strategies
- `history_budget` — event count limits for continue-as-new

These have sensible defaults. Only configure them if you need non-default behavior. See [Configuration](/docs/configuration/options/) for details.

**Payload codec default changed to `avro`.** v1 defaulted to the PHP-only `Workflow\Serializers\Y::class`; v2 defaults to the language-neutral `avro` codec so Python, Go, and TypeScript workers can decode payloads without a shared PHP runtime. `avro` is the only supported codec for new v2 workflows. New v2 workflows you start will be tagged with `payload_codec = "avro"`.

If you have a published `config/workflows.php` from v1 with `'serializer' => Workflow\Serializers\Y::class`, v2 still reads that value so migration diagnostics can flag it, but new v2 workflow payloads resolve to Avro. Run `php artisan workflow:v2:doctor` after upgrading — it will flag a legacy codec setting as a v1 drain/import concern.

To accept the v2 default explicitly, leave `serializer` unset, or pin it:

```php
// config/workflows.php — v2 default (language-neutral, compact binary)
'serializer' => 'avro',
```

Keep a legacy codec (`'workflow-serializer-y'` or `'workflow-serializer-base64'`) only if you need to finish draining v1 runs that share PHP-native values between a server and PHP-only workers. Legacy class names (`Workflow\Serializers\Y::class`, etc.) are still accepted as aliases for decoding v1 runs.

**Custom serializer classes from v1 are unsupported in v2.** The public v2 registry resolves only `avro`. The legacy `workflow-serializer-y` and `workflow-serializer-base64` readers are confined to the internal v1 import/drain path and cannot be selected for a new v2 run or SDK payload. If you had a custom serializer, drain v1 runs before upgrading or re-encode historical payloads into `avro` — the custom class is not consulted. `php artisan workflow:v2:doctor` flags any other `workflows.serializer` value as migration debt; new-run codec omission resolves to `avro`.

**Custom model subclasses are supported only when they keep the package's column and key contract.** The frozen support matrix in
[Customization Matrix](/docs/configuration/customization-matrix/) is
authoritative: subclassing the v2 instance, run, task, history-event,
projection, schedule, activity, failure, link, message, memo, search-attribute,
and child-call models is supported when the subclass keeps the package
table names, primary keys, and foreign keys. Custom table names with
custom foreign-key column names are out of contract. Waterline reads the
v2 projections through the
`Workflow\V2\Contracts\OperatorObservabilityRepository` contract, so a
schema-compatible subclass does not require a Waterline change.

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

If any check fails, see [Backend Requirements](/docs/installation/#requirements) for driver prerequisites.

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
- Method errors: v2 workflow or activity classes that still need to rename their entry method to `handle()`
- Queue driver errors: using `sync` driver in queue mode (not supported); in poll mode (`workflows.v2.task_dispatch_mode=poll`) the queue is unused for task delivery and `sync` is acceptable

**5. Verify Waterline observability**

Open Waterline (default: `/waterline`) and verify:

- v1 workflows (if any) appear with their original data
- v2 workflows appear with full run/history/activity detail
- No errors in Waterline rendering

### Rollback procedure

Rollback is a recovery-set operation. Restoring the workflow SQL database alone
does not restore in-flight v1 execution when its Laravel queue state lives in
Redis, SQS, another database, or another external backend.

If the upgrade fails in production, roll back only to the policy and recovery
cut selected before the upgrade:

**1. Quiesce application ingress, schedulers, and queue workers**

Use the same stop procedure as the pre-upgrade cut. Confirm that no worker can
reserve a job and no request can start or signal a workflow while state is
being restored.

**2. Validate the recovery set**

- A SQL-only recovery set is supported only when the selected cut has no
  nonterminal v1 execution that depends on preserved queued work. An eligible
  stale `pending` row may instead use the proven v1.0.77 Watchdog path described
  above, and a genuine signal-only wait may use a tested external signal
  ingress. Do not extend either exception to other states.
- An in-flight recovery set must contain SQL plus restorable ready, delayed,
  and reserved queue state from the same cut for retries, timers, activities,
  and `waiting` or `running` work. Signal-only waits must retain a working
  signal ingress; timer waits must retain their delayed queue jobs.
- If neither condition holds, stop here. Fix forward, reconcile the recorded
  workflows manually, or proceed under the previously documented acceptance
  that the affected executions are unrecoverable.

**3. Restore the database backup**

```bash
# MySQL/MariaDB
mysql -u root -p your_database < backup-v1-YYYYMMDD-HHMMSS.sql

# PostgreSQL
psql -U postgres -d your_database < backup-v1-YYYYMMDD-HHMMSS.sql
```

Restore every configured custom v1 model table and the
`workflow_relationships_table`, even when they live on another connection.

**4. Restore the queue recovery cut, when required**

Keep consumers stopped. Follow the queue provider's restore procedure and
restore the exact connections, queues, prefixes, ready jobs, delayed jobs, and
reserved jobs captured with SQL. Restore required unique-job lock state when
it was part of the recovery cut. Do not substitute an empty queue with the
same name: it cannot wake restored retries, timers, or `waiting`/`running`
work. An empty but writable queue is sufficient only for an eligible `pending`
row after you prove that the v1.0.77 Watchdog bootstraps and redispatches it.

**5. Revert the Composer dependency**

```bash
composer require durable-workflow/workflow:^1.0 --with-all-dependencies
```

`durable-workflow/workflow` is the maintained package name for both supported
v1 releases and v2. `laravel-workflow/laravel-workflow` is only a legacy alias
declared by the maintained package for compatibility with older dependency
graphs; do not use it in rollback requirements.

Retrieve the exact `APP_KEY` through the inventoried secret-manager reference
and version, using the separately controlled recovery credentials. Restore it
together with the workflow storage connection, queue connections, queue names,
Redis prefixes, and custom model configuration before starting a consumer.
Encrypted jobs and serialized model references depend on that configuration
matching the recovery cut.

**6. Restart queue workers and reopen ingress**

```bash
# Use the start command for your worker system, for example:
sudo supervisorctl start <your-worker-group>:*
sudo systemctl start laravel-worker
php artisan horizon:continue
```

**7. Verify v1 execution reachability**

Waterline visibility proves that a row was restored; it does not prove that a
worker can resume it. Complete this checklist before declaring rollback
successful:

- [ ] `composer show durable-workflow/workflow` reports the intended v1
  release and workers loaded that code.
- [ ] The actual configured v1 tables and `workflow_relationships_table` are
  present on the expected storage connections.
- [ ] Every nonterminal row in the configured stored-workflow table
  (`workflows` by default) is classified by its next wake path: a
  ready/delayed/reserved queue job, a preserved timer job, or a tested external
  signal ingress. An eligible `pending` row may instead cite the proven
  v1.0.77 Watchdog redispatch evidence below.
- [ ] Queue-provider inspection confirms that each queue-backed retry, timer,
  activity, and `waiting` or `running` workflow wake identified above exists on
  the recorded connection and queue. A SQL timer row by itself does not satisfy
  this check, and the Watchdog is not a substitute for these jobs.
- [ ] If a restored `pending` row has no preserved workflow job, a v1.0.77
  worker loop is observed enqueueing the Watchdog; after the row is stale for
  the five-minute bound, the Watchdog enqueues that workflow on its recorded
  connection and queue and the row advances. Without that end-to-end proof,
  treat the row as stranded even if Waterline displays it.
- [ ] No restored retry, timer, `waiting`, or `running` row lacks its required
  runnable queue job or a usable external signal path for a genuine signal
  wait. Treat such a row as stranded; pending-only Watchdog evidence does not
  make it recoverable.
- [ ] A restored retry or timer advances past its pre-cut marker, and a
  controlled signal-wait can enqueue and consume its signal wake.
- [ ] A new v1 canary workflow completes, and logs contain no missing-job,
  decryption, model-table, connection, or queue-routing errors.

With default tables, this query is a starting inventory; substitute the table
resolved by your configured stored-workflow model when it is customized:

```sql
SELECT id, class, status
FROM workflows
WHERE status NOT IN ('completed', 'failed', 'cancelled');
```

**Important rollback notes:**

- Rollback discards any v2 workflows started after upgrade (they exist only in v2 tables)
- SQL-only rollback restores v1 workflow records, not external queue messages
- In-flight v1 execution is supported only when SQL and durable queue state are
  restored from one application-consistent recovery cut, or when a documented
  signal-only wait retains a usable ingress. The additional SQL-only exception
  is an eligible stale `pending` row with proven v1.0.77 Watchdog redispatch;
  it does not cover retries, timers, or `waiting`/`running` work
- Replaying a pre-upgrade recovery cut can repeat external side effects; review
  application idempotency before restoring queued activity work
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

v2 workflows and activities use `handle()` as the entry method. Rename v1 `execute()` methods to `handle()` as part of the v2 code migration:

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

Do not leave `execute()` as the entry method on a v2 workflow or activity — the runtime rejects it.

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

The 2.0.0 release includes clean base table migrations. The normal path is to
let Laravel auto-load the package migrations and run `php artisan migrate`.

If you previously published Durable Workflow migrations into your application,
choose one migration source and keep it current:

- **Auto-loaded package migrations**: remove old published Durable Workflow
  migration files from `database/migrations` and run `php artisan migrate`.
- **Published migrations**: publish the current set before migrating:

  ```bash
  php artisan vendor:publish \
    --provider="Workflow\Providers\WorkflowServiceProvider" \
    --tag=migrations \
    --force

  php artisan migrate
  ```

Do not keep stale published files while also relying on newly auto-loaded
package files; that can leave your app missing newer v2 tables or repair
migrations.

If you customized migration files, diff your local copies against the package's
`src/migrations` directory during each upgrade. Keep the table names, columns,
indexes, and nullable/default contracts schema-compatible with the package
models. A customized install that routes workflow tables to a non-default
connection should publish the migrations, set the migration `$connection`, and
then continue carrying forward every new package migration in timestamp order.

For pre-release v2 adopters, `workflow_run_summaries.memo` is repaired
idempotently if an older published summary-table migration created
`workflow_run_summaries` without that column. Fresh installs already create the
column in the base summary-table migration.

### Backend capability check

v2 validates that your queue, database, and cache drivers meet its requirements. Run the doctor command after upgrading:

```bash
php artisan workflow:v2:doctor --strict
```

### Configuration

v2 introduces several new configuration options. See the [Configuration](/docs/configuration/options/) section for details on:

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

1. **v1 data is preserved** — The default `workflows`, `workflow_logs`, `workflow_signals`, `workflow_timers`, `workflow_exceptions`, and `workflow_relationships` tables remain intact; configured v1 model/table overrides remain authoritative
2. **v1 workflows complete using v1 engine** — In-flight v1 workflows continue executing using the v1 replay engine until they reach a terminal state
3. **v2 workflows use v2 engine** — All workflows started after upgrade use the v2 schema (`workflow_instances`, `workflow_runs`, `workflow_history_events`, etc.)
4. **Waterline shows both** — The monitoring UI displays v1 and v2 workflows side-by-side

Finish-on-v1 also depends on the Laravel queue backend. Retain every v1 queue
connection and queue until its workflows are terminal. Database rows preserve
history and status; they do not reconstruct lost ready, delayed, or reserved
jobs from an external backend. The v1.0.77 Watchdog can redispatch an eligible
stale `pending` workflow from SQL, but that bounded recovery path does not
recreate retries, timers, or `waiting`/`running` work.

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
