---
sidebar_position: 2
---

# Activities

An activity is a unit of work that performs a specific task or operation (e.g. making an API request, processing data, sending an email) and can be executed by a workflow.

## Scaffolding

You may use the `make:activity` artisan command to generate a new activity:

```php
php artisan make:activity MyActivity
```

The generated activity extends `Workflow\V2\Activity`:

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle()
    {
        // Perform some work...
        return $result;
    }
}
```

`handle()` is the canonical activity entry method. Existing activities that still implement `execute()` continue to load through a compatibility path for older code, but new activities should use `handle()` only.

Do not mix `handle()` and `execute()` across an activity inheritance chain. The runtime rejects that hierarchy before it can schedule a durable activity execution.

## Retry Attempts

`Workflow\V2\Activity` defaults to one attempt. Set `$tries` and `backoff()` when an activity should retry before the workflow receives the exception.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public int $tries = 3;

    public function backoff(): array
    {
        return [5, 30];
    }
}
```

When the workflow schedules an activity, it snapshots the retry policy onto the durable `activity_executions.retry_policy` field and into the typed `ActivityScheduled` history payload. Later retries read that snapshot, so a code deploy that changes `$tries` or `backoff()` does not change the retry budget for an already scheduled execution.

Each try has a durable `activity_attempts` row for runtime leasing and heartbeat state, and each start, heartbeat, retry, completion, failure, or cancellation also records typed activity history. Waterline and history exports rebuild historical attempt detail from that typed history first. When a retryable failure happens before the snapped retry budget is exhausted, the current attempt is closed as `failed`, a typed `ActivityRetryScheduled` history event is recorded with the same retry-policy snapshot, and a new activity task is scheduled for the snapped backoff time.

Inside activities, `activityId()` is the durable activity execution id and the default idempotency key to send to external APIs. `attemptId()` identifies one concrete try and should be used only when the remote system needs per-attempt correlation rather than execution-level dedupe.

## Per-Call Activity Options

By default, activity routing and retry policy come from the activity class properties (`$connection`, `$queue`, `$tries`, `backoff()`). When you need to override those on a per-call basis, pass an `ActivityOptions` instance as the first argument after the activity class:

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    MyActivity::class,
    new ActivityOptions(
        connection: 'sqs',
        queue: 'high-priority',
        maxAttempts: 5,
        backoff: [1, 5, 15],
    ),
    'Taylor',
);
```

The same pattern works with `startActivity()` for async activity calls:

```php
use function Workflow\V2\startActivity;
use Workflow\V2\Support\ActivityOptions;

$handle = startActivity(
    MyActivity::class,
    new ActivityOptions(queue: 'batch'),
    $name,
);
```

### Available options

| Option | Type | Description |
| --- | --- | --- |
| `connection` | `string` | Queue connection override |
| `queue` | `string` | Queue name override |
| `maxAttempts` | `int` | Override the activity class `$tries` |
| `backoff` | `int\|list<int>` | Override the activity class `backoff()` |
| `startToCloseTimeout` | `int` | Seconds from activity start to required completion |
| `scheduleToStartTimeout` | `int` | Seconds from scheduling to first claim |

### Resolution order

Per-call options take highest priority, then activity class properties, then the parent workflow run's routing:

1. `ActivityOptions` values (if provided)
2. Activity class `$connection`, `$queue`, `$tries`, `backoff()` properties
3. Parent workflow run's `connection` and `queue`
4. Laravel queue config defaults

### Snapshot durability

When the workflow schedules an activity, the per-call options are snapped onto the durable `activity_executions.activity_options` field and the retry policy (including any overrides) onto `activity_executions.retry_policy`. Later retries, heartbeats, and completions read from those snapshots. A code deploy that changes `ActivityOptions` values at the call site does not change the retry budget or routing for an already-scheduled execution.
