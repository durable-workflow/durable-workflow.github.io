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
Ordinary v2 activities run as durable queued tasks. Local activities are an
explicit same-process primitive for short activity work that still records
durable activity history. Worker sessions are available when multiple durable
activity steps need one worker lease, and sticky execution is a supported
replay optimization, not a correctness contract. See [Activity Execution Model](/docs/features/activity-execution-model),
[Local Activities](/docs/features/local-activities), [Worker Sessions](/docs/features/worker-sessions),
and [Sticky Execution](/docs/features/sticky-execution) for the exact
contracts.
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
creates a durable queued task for a worker to claim. Ordinary activities may
be claimed by any compatible worker, while [worker sessions](/docs/features/worker-sessions)
can pin a sequence of activity attempts to one worker-session lease when the
workflow explicitly opts into that contract.

If you need a replay-safe value without scheduling queued work, use
[`sideEffect(...)`](/docs/features/side-effects) instead. If you need a
short retryable same-process activity with timeout, heartbeat, and activity
history semantics, use [Local Activities](/docs/features/local-activities).
For the full placement model, see [Activity Execution Model](/docs/features/activity-execution-model).
For sticky replay-cache behavior, see
[Sticky Execution](/docs/features/sticky-execution).

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

See [Execution Guarantees and Idempotency](/docs/constraints/execution-guarantees),
[Heartbeats](/docs/features/heartbeats), and
[Failures and Recovery](/docs/failures-and-recovery) for the operational
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

See [Activity options](/docs/configuration/options#activityoptions) for the full list of fields, including timeouts and heartbeats.

## Local Activity Calls

Use `localActivity(...)` when a short idempotent side effect should run inside
the current workflow worker process but still needs activity retry, timeout,
heartbeat, cancellation, and history semantics:

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

Local activities reject `connection`, `queue`, worker-session routing, and
schedule-to-start options because they do not create ordinary activity tasks.
See [Local Activities](/docs/features/local-activities) for the complete
contract.
