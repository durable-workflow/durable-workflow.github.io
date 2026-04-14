---
sidebar_position: 18
---

# Schedules

Schedules let you start workflow runs on a recurring basis using cron expressions. Each schedule is a named, durable entity that the engine evaluates on every tick to determine whether a new run should be triggered.

## Creating a schedule

Use `ScheduleManager::create()` to define a named schedule:

```php
use Workflow\V2\Enums\ScheduleOverlapPolicy;
use Workflow\V2\Support\ScheduleManager;

$schedule = ScheduleManager::create(
    scheduleId: 'daily-invoice-sync',
    workflowClass: InvoiceSyncWorkflow::class,
    cronExpression: '0 2 * * *',
    arguments: ['nightly'],
    timezone: 'America/New_York',
    overlapPolicy: ScheduleOverlapPolicy::Skip,
    labels: ['team' => 'billing'],
    memo: ['origin' => 'scheduled'],
    searchAttributes: ['tenant_id' => '42'],
    notes: 'Runs every night at 2 AM ET.',
);
```

The `scheduleId` is a unique, user-chosen identifier for the schedule. Each triggered run gets a deterministic workflow instance ID derived from the schedule ID and trigger timestamp.

### Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `scheduleId` | `string` | required | Unique identifier for the schedule |
| `workflowClass` | `string` | required | The workflow class to start |
| `cronExpression` | `string` | required | Standard cron expression (5 fields) |
| `arguments` | `array` | `[]` | Arguments passed to the workflow's `handle()` method |
| `timezone` | `string` | `'UTC'` | Timezone for evaluating the cron expression |
| `overlapPolicy` | `ScheduleOverlapPolicy` | `Skip` | What to do when the previous run is still active |
| `labels` | `array` | `[]` | Visibility labels applied to each triggered run |
| `memo` | `array` | `[]` | Memo fields applied to each triggered run |
| `searchAttributes` | `array` | `[]` | Search attributes applied to each triggered run |
| `jitterSeconds` | `int` | `0` | Maximum random delay in seconds added to each fire time (thundering-herd mitigation) |
| `maxRuns` | `int\|null` | `null` | Maximum number of runs before auto-deleting the schedule |
| `connection` | `string\|null` | `null` | Queue connection for triggered runs (overrides the workflow class default) |
| `queue` | `string\|null` | `null` | Queue name for triggered runs (overrides the workflow class default) |
| `notes` | `string\|null` | `null` | Free-form operator notes |

## Overlap policies

When a schedule fires and the previous run is still active, the overlap policy controls behavior:

| Policy | Behavior |
|---|---|
| `Skip` | Do not start a new run (default) |
| `BufferOne` | Buffer one pending trigger; skip further triggers until the buffer is drained. On the next `tick()` after the active run completes, the buffered trigger fires automatically. |
| `AllowAll` | Start the new run regardless of the previous run's state |
| `CancelOther` | Cancel the previous run, then start the new run |
| `TerminateOther` | Terminate the previous run, then start the new run |

## Managing schedules

### Pause and resume

```php
ScheduleManager::pause($schedule);

// The schedule will not trigger while paused.

ScheduleManager::resume($schedule);
// next_run_at is recalculated from now.
```

### Update

```php
ScheduleManager::update(
    $schedule,
    cronExpression: '30 3 * * *',
    timezone: 'America/Chicago',
    overlapPolicy: ScheduleOverlapPolicy::AllowAll,
    notes: 'Moved to 3:30 AM CT.',
);
```

Updating the cron expression or timezone recalculates `next_run_at`.

### Delete

```php
ScheduleManager::delete($schedule);
```

Deleting is soft — the row remains with status `deleted` and a `deleted_at` timestamp. A deleted schedule cannot be paused, resumed, updated, or triggered.

### Describe

```php
$description = ScheduleManager::describe($schedule);

$description->scheduleId;      // 'daily-invoice-sync'
$description->status;          // ScheduleStatus::Active
$description->cronExpression;  // '0 2 * * *'
$description->totalRuns;       // 47
$description->nextRunAt;       // DateTimeInterface
$description->toArray();       // full array representation
```

### Find by schedule ID

```php
$schedule = ScheduleManager::findByScheduleId('daily-invoice-sync');
```

## Triggering schedules

### Manual trigger

```php
$instanceId = ScheduleManager::trigger($schedule);
```

This immediately evaluates the overlap policy and, if allowed, starts a new workflow run. Returns the instance ID of the started workflow, or `null` if the trigger was skipped.

### Tick (evaluate all due schedules)

```php
$results = ScheduleManager::tick();

// Returns: [['schedule_id' => '...', 'instance_id' => '...|null'], ...]
```

`tick()` finds all active schedules whose `next_run_at` is in the past and triggers them in order. After each trigger, `next_run_at` advances to the next cron occurrence.

### Artisan command

Run a single tick from the command line:

```bash
php artisan workflow:v2:schedule-tick
php artisan workflow:v2:schedule-tick --json
```

To evaluate schedules continuously, call this command from Laravel's task scheduler:

```php
// app/Console/Kernel.php
$schedule->command('workflow:v2:schedule-tick')->everyMinute();
```

## Max runs

When `maxRuns` is set, the schedule tracks `remaining_actions`. After the last allowed trigger, the schedule is automatically soft-deleted.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'one-shot-retry',
    workflowClass: RetryWorkflow::class,
    cronExpression: '*/5 * * * *',
    maxRuns: 3,
);

// After 3 triggers, the schedule status becomes 'deleted'.
```

## Backfill

Backfill triggers workflows for past cron occurrences that were missed (e.g., after a schedule was paused, a deployment outage, or late creation):

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
);

// Returns: [['schedule_id' => '...', 'instance_id' => '...|null', 'cron_time' => '...'], ...]
```

Each missed cron occurrence is triggered sequentially. The schedule's overlap policy applies to each occurrence, or you can override it:

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
    overlapPolicyOverride: ScheduleOverlapPolicy::AllowAll,
);
```

Backfill respects `maxRuns` — if the schedule's remaining actions are exhausted mid-backfill, the operation stops and the schedule is auto-deleted.

Backfill instance IDs are deterministic: `schedule:{scheduleId}:backfill:{timestamp}`.

## Queue routing

When `connection` or `queue` is set on a schedule, triggered workflows dispatch to that connection and queue instead of the workflow class default:

```php
$schedule = ScheduleManager::create(
    scheduleId: 'priority-sync',
    workflowClass: InvoiceSyncWorkflow::class,
    cronExpression: '0 * * * *',
    connection: 'redis',
    queue: 'high-priority',
);

// Every triggered run dispatches to redis/high-priority,
// regardless of InvoiceSyncWorkflow's default routing.
```

The routing precedence is: schedule fields → workflow class defaults → global queue config.

## Jitter

When multiple schedules share the same cron expression, they all fire at the exact same instant, creating a thundering-herd spike. The `jitterSeconds` parameter spreads triggers across a random window to smooth the load.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'hourly-report',
    workflowClass: ReportWorkflow::class,
    cronExpression: '0 * * * *',
    jitterSeconds: 300, // fire within 0–300 seconds after the top of the hour
);
```

When `jitterSeconds` is set, each computed `next_fire_at` is offset by a random value between 0 and `jitterSeconds` (inclusive). The jitter is re-rolled every time the next fire time is calculated — after a trigger, after a resume, or after an update.

Jitter applies only to the tick-evaluation fire time stored in the database. Backfill enumeration always uses canonical (unjittered) cron times so that backfilled occurrences land on exact cron boundaries.

Setting `jitterSeconds` to `0` (the default) disables jitter entirely — fire times are exact cron matches.

## History event types

When a schedule triggers a workflow, a `ScheduleTriggered` history event is recorded on the started workflow run. This provides lineage from the schedule to the workflow:

```php
// The event payload includes:
// - schedule_id: the schedule's user-facing identifier
// - schedule_ulid: the schedule's internal ULID
// - cron_expression, timezone, overlap_policy
// - trigger_number: which trigger this was (1-indexed)
// - occurrence_time: the cron occurrence time (backfill only)
```

The full set of schedule event types in the history enum:

- `ScheduleCreated` — schedule was created
- `SchedulePaused` — schedule was paused
- `ScheduleResumed` — schedule was resumed
- `ScheduleUpdated` — schedule cron, timezone, or policy was changed
- `ScheduleTriggered` — a workflow run was started from the schedule
- `ScheduleDeleted` — schedule was soft-deleted
- `ScheduleTriggerSkipped` — a trigger was skipped due to overlap policy or exhausted actions

`ScheduleTriggered` is the only event currently recorded on workflow history. The others are reserved for future schedule-level audit logging.

## Skip tracking

When a trigger is skipped (due to overlap policy, non-triggerable status, or exhausted actions), the schedule tracks the skip:

- `last_skip_reason` — why the most recent trigger was skipped (e.g., `overlap_policy_skip`, `status_not_triggerable`, `remaining_actions_exhausted`)
- `last_skipped_at` — when the skip occurred
- `skipped_trigger_count` — cumulative number of skipped triggers

These fields are included in `ScheduleManager::describe()` and the Waterline schedule detail API.

## Database

The schedule table (`workflow_schedules`) is created by migration `2026_04_14_000157`. The model class is configurable via `workflows.v2.schedule_model`.

If your deployment runs package migrations alongside application migrations (e.g., the standalone server), migration 157 detects a pre-existing `workflow_schedules` table and handles it gracefully: if the table already matches the package schema it is left as-is; if it was created by an earlier shim migration with a different schema, it is replaced.
