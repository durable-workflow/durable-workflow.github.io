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
Every v2 activity runs as a durable queued task. Durable Workflow 2.0 does not ship local activities or worker sessions. Sticky execution is a supported replay optimization, not a correctness contract. See [Activity Execution Model](/docs/2.0/features/activity-execution-model) and [Sticky Execution](/docs/2.0/features/sticky-execution) for the exact contract and recommended alternatives.
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

## Execution Contract

Every `activity(...)` call records an activity command on workflow history and
creates a durable queued task for a worker to claim. Durable Workflow v2 does
not expose a local-activity shortcut or a worker-session API, so any
compatible worker may execute a given attempt and a retry may land on a
different process or host.

If you need a replay-safe value without scheduling queued work, use
[`sideEffect(...)`](/docs/2.0/features/side-effects) instead. For the full
stance on ordinary queued activities, local activities, and worker sessions,
see [Activity Execution Model](/docs/2.0/features/activity-execution-model).
For sticky replay-cache behavior, see
[Sticky Execution](/docs/2.0/features/sticky-execution).

## Idempotency and Durable Identity

Activity execution is at-least-once. Retries, lease expiry, and redelivery can
cause the same logical activity to be observed more than once, so the side
effect or remote target must be safe to repeat.

Inside the activity, use the runtime's durable identifiers when you need
correlation or remote dedupe:

- `activityId()` identifies one logical activity execution across retries and
  is the default remote idempotency key.
- `attemptId()` identifies one concrete try of that execution.
- `attemptCount()` tells you which try is currently running.

Prefer `activityId()` when the remote system should treat retries as the same
logical request. Reach for `attemptId()` only when the remote system truly
needs to distinguish separate tries. If a worker finishes remote work, loses
its lease, and reports late, the engine may reject that late completion because
another worker already won the durable race, but the remote side effect may
still have happened.

See [Execution Guarantees and Idempotency](/docs/2.0/constraints/execution-guarantees),
[Heartbeats](/docs/2.0/features/heartbeats), and
[Failures and Recovery](/docs/2.0/failures-and-recovery) for the operational
model behind those identifiers.

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
