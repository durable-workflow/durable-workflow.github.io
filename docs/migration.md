---
sidebar_position: 3
---

# Migrating from v1 to v2

This guide covers the key changes when upgrading from Durable Workflow v1 to v2.

## Namespace change

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

## Entry method

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

## Activity calls

v2 replaces `ActivityStub::make()` and `yield` with direct function helpers:

```php
// v1
$result = yield ActivityStub::make(MyActivity::class, $arg1, $arg2);

// v2
use function Workflow\V2\activity;

$result = activity(MyActivity::class, $arg1, $arg2);
```

Activities now have durable identity. Each scheduled activity gets an `activity_executions` row with a stable execution id, and each concrete attempt gets an `activity_attempts` row with typed history.

## Workflow identity

v2 splits identity into instance id and run id:

- `id()` — the public workflow instance id (same across continue-as-new)
- `runId()` — the id of the current run

In v1, these were the same concept.

## Signals

v2 uses named signal waits instead of `#[SignalMethod]` attribute-based mutators:

```php
// v1
#[SignalMethod]
public function approve()
{
    $this->approved = true;
}

// v2
use function Workflow\V2\awaitSignal;

$approved = awaitSignal('approve');
```

Named signals support `awaitSignal('name')` for blocking waits and `signal()` / `attemptSignal()` for external input. Cancellation and termination are not modeled as signals — they remain explicit runtime commands.

## Queries

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

## Timers and side effects

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

## Timeouts

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

## Database migrations

v2 adds new tables and columns. The package auto-loads its migrations, so after updating:

```bash
composer update durable-workflow/workflow
php artisan migrate
```

The 2.0.0 release includes 19 clean base table migrations. If you previously published migration files, you may need to publish the new ones or switch to auto-loaded migrations.

## Backend capability check

v2 validates that your queue, database, and cache drivers meet its requirements. Run the doctor command after upgrading:

```bash
php artisan workflow:v2:doctor --strict
```

## Configuration

v2 introduces several new configuration options. See the [Configuration](/docs/2.0/configuration/options/) section for details on:

- Durable type aliases
- Task repair policy
- Backend capability checks
- Projection rebuilds
- History budgets and export redaction

## Waterline

Waterline (the monitoring UI) has been updated for v2 with:

- Run detail views showing timeout durations and deadlines
- Activity attempt tracking with durable ids
- Updated workflow status displays

## Continue-as-new

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

### Waterline visibility

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
