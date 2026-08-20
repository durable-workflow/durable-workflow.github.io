---
sidebar_position: 7
---

# Side Effects

A side effect is a closure containing non-deterministic code. The closure is only executed once and the result is saved. It will not execute again if the workflow is retried. Instead, it will return the saved result. This makes the workflow deterministic because replaying the workflow will always return the same stored value rather than re-running the non-deterministic code.

```php
use function Workflow\V2\await;
use function Workflow\V2\sideEffect;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Workflow;

#[Signal('finish')]
class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        $token = sideEffect(fn () => random_int(1000, 9999));
        $finish = await('finish');

        return compact('token', 'finish');
    }
}
```

The workflow will only call `random_int()` once and save the result, even if the workflow later fails and is retried.

## When to use side effects

Use `sideEffect()` when you need a non-deterministic value that:

- is computed locally without external I/O (random numbers, UUIDs, timestamps)
- should never change once recorded, even across replays
- does not need retry semantics — the closure runs exactly once

```php
// Generate a correlation token for downstream systems.
$correlationId = sideEffect(fn () => (string) Str::uuid());

// Snapshot the current time for a business rule.
$decidedAt = sideEffect(fn () => now()->toIso8601String());
```

## When to use an activity instead

If the code can fail, talks to an external service, or needs retry/timeout semantics, use an [activity](../defining-workflows/activities.md) instead of a side effect:

| Scenario | Use |
|---|---|
| Generate a random token | `sideEffect()` |
| Read a config value at decision time | `sideEffect()` |
| Call an external API | `activity()` |
| Write to a database | `activity()` |
| Send an email or notification | `activity()` |
| Compute an expensive value that can throw | `activity()` |

The rule of thumb: if the closure can throw an exception that you would want to retry, it belongs in an activity.

## How it works

- each `sideEffect()` call appends a typed `SideEffectRecorded` history event with the workflow step sequence
- workflow replay and query replay both reuse that committed value instead of re-running the closure
- Waterline surfaces the side-effect snapshot as a typed history entry in the selected run timeline
- side effects are still for replay-safe snapshots only, not for work that can fail or that needs retry semantics

## Anti-patterns

**Do not call external services inside a side effect.** If the service call fails, the side effect will not be retried and the workflow will fail permanently:

```php
// BAD: HTTP calls can fail and side effects do not retry.
$price = sideEffect(fn () => Http::get('/api/price')->json('amount'));

// GOOD: Use an activity for external calls.
$price = activity(FetchPriceActivity::class);
```

**Do not put slow or blocking operations inside a side effect.** The closure runs on the workflow task thread. Long-running work delays the entire workflow task:

```php
// BAD: Expensive computation blocks the workflow task.
$hash = sideEffect(fn () => bcrypt($largePayload));

// GOOD: Offload heavy work to an activity.
$hash = activity(ComputeHashActivity::class, $largePayload);
```

**Do not rely on mutable external state.** The closure is executed exactly once. If you read a value that changes over time, the snapshot is frozen at the moment of first execution — not at replay time:

```php
// The cached value is whatever it was during the first execution.
// If the cache changes later, this workflow still sees the old value.
$setting = sideEffect(fn () => cache('feature.flag'));
```

This is by design — the snapshot is intentionally frozen for determinism. If you need a value that updates over the lifetime of the workflow, use a signal or an activity.

## Run this pattern

The elapsed-time workflow in the
[Sample App](/docs/2.0/sample-app) is the runnable reference for
keeping clock reads behind `sideEffect()`:

```bash
php artisan app:elapsed
```

`App\Workflows\Elapsed\ElapsedTimeWorkflow` records start and end
timestamps as integer values inside `sideEffect()` callbacks so the
recorded value survives Avro payload decoding on replay. The
Waterline run detail shows two `MarkerRecorded` events bracketing the
timer fire — that pair of markers is the on-disk evidence that the
clock reads stayed deterministic.
