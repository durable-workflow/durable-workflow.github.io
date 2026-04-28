---
sidebar_position: 2
title: Activities
description: Define activity classes for non-deterministic side effects, retries, routing, and per-call options.
tags:
  - authoring
  - activities
  - retries
keywords:
  - durable workflow activity class
  - activity options
  - non deterministic side effects
---

# Activities

An activity is a unit of work that performs a specific task or operation (e.g. making an API request, processing data, sending an email) and can be executed by a workflow.

:::note Durable Execution Contract
Every v2 activity runs as a durable queued task. Durable Workflow 2.0 does not ship local activities or worker sessions, and sticky execution is a replay optimization rather than a correctness contract. See [Activity Execution Model](/docs/2.0/features/activity-execution-model) for the exact stance and the recommended alternatives.
:::

You may use the `make:activity` artisan command to create a new activity:

```php
php artisan make:activity MyActivity
```

It is defined by extending the `Activity` class and implementing the `handle()` method.

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

## Per-Call Overrides

Routing and retries default to the activity class's own `$connection`, `$queue`, `$tries`, and `backoff()` properties. When a single call needs to override those — for example, routing one call to a higher-priority queue or giving it more retry attempts — pass an `ActivityOptions` instance:

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    MyActivity::class,
    new ActivityOptions(queue: 'high-priority', maxAttempts: 5),
    'Taylor',
);
```

See [Activity options](/docs/2.0/configuration/options#activity-options) for the full list of fields, including timeouts and heartbeats.
