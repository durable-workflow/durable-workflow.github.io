---
sidebar_position: 2
---

# Activities

An activity is a unit of work that performs a specific task or operation (e.g. making an API request, processing data, sending an email) and can be executed by a workflow.

## Scaffolding

You may use the `make:activity` artisan command to create a new activity:

```php
php artisan make:activity MyActivity
```

The created activity extends `Workflow\V2\Activity`:

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

Inside activities, `activityId()` is the durable activity execution id and the default idempotency key to send to external APIs. The `attemptId()` identifies one concrete try and should be used only when the remote system needs per-attempt correlation rather than execution-level dedupe.

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

The same pattern works with closures inside `all()` for parallel activity calls:

```php
use function Workflow\V2\all;
use Workflow\V2\Support\ActivityOptions;

$results = all([
    fn () => activity(
        MyActivity::class,
        new ActivityOptions(queue: 'batch'),
        $name,
    ),
]);
```

### Available options

| Option | Type | Description |
| --- | --- | --- |
| `connection` | `string` | Queue connection override |
| `queue` | `string` | Queue name override |
| `maxAttempts` | `int` | Override the activity class `$tries` |
| `backoff` | `int\|list<int>` | Override the activity class `backoff()` |
| `startToCloseTimeout` | `int` | Seconds from activity start to required completion (per attempt) |
| `scheduleToStartTimeout` | `int` | Seconds from scheduling to first claim |
| `scheduleToCloseTimeout` | `int` | Total wall-clock seconds from scheduling to completion across all retries |
| `heartbeatTimeout` | `int` | Seconds between heartbeats before the activity is considered unresponsive |

### Resolution order

Per-call options take highest priority, then activity class properties, then the parent workflow run's routing:

1. `ActivityOptions` values (if provided)
2. Activity class `$connection`, `$queue`, `$tries`, `backoff()` properties
3. Parent workflow run's `connection` and `queue`
4. Laravel queue config defaults
