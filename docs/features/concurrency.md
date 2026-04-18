---
sidebar_position: 10
---

import ConcurrencySimulator from '@site/src/components/ConcurrencySimulator';

# Concurrency

Parallel barriers suspend as one durable workflow step through `all([...])`. Build them with closures such as `fn () => activity(...)` and `fn () => child(...)` so the runtime can see the full barrier tree before the workflow suspends. Results come back in the original nested array shape.

## Series

This example will execute 3 activities in series, waiting for the completion of each activity before continuing to the next one.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return [
            activity(MyActivity1::class),
            activity(MyActivity2::class),
            activity(MyActivity3::class),
        ];
    }
}
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyActivity1', duration: 1500 },
    { name: 'MyActivity2', duration: 2000 },
    { name: 'MyActivity3', duration: 1200 },
  ]}
  mode="series"
  title="Series Execution Simulator"
/>

## Parallel

This example will execute 3 activities in parallel, waiting for the completion of all activities and collecting the results.

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return all([
            fn () => activity(MyActivity1::class),
            fn () => activity(MyActivity2::class),
            fn () => activity(MyActivity3::class),
        ]);
    }
}
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyActivity1', duration: 2000 },
    { name: 'MyActivity2', duration: 1500 },
    { name: 'MyActivity3', duration: 2500 },
  ]}
  mode="parallel"
  title="Parallel Execution Simulator"
/>

The main difference between the serial example and the parallel execution example is where suspension happens. In the serial example, each `activity()` call suspends and resumes the workflow directly. In the parallel example, the closures describe the whole barrier first and `all()` suspends once for the whole group, so every member can run in parallel before the workflow resumes.

## Nested Barriers

Nested `all([...])` groups let one workflow step express a tree of durable fan-out and fan-in work. The runtime schedules every activity or child workflow as a durable leaf sequence, records the leaf's full `parallel_group_path`, waits until every enclosing barrier can make progress, and then rebuilds the original nested result shape before resuming the workflow body. During replay, an activity or child leaf from an `all([...])` step must still match that recorded group path; typed leaf history that has no group metadata is treated as incompatible older preview history instead of being guessed into the current barrier.

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

final class NestedWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => activity(BuildSummary::class),
            fn () => all([
                fn () => activity(BuildInvoice::class),
                fn () => activity(BuildShipment::class),
            ]),
        ]);
    }
}
```

In that example, Waterline exposes three open leaf waits, not one synthetic "nested" wait. The first leaf belongs only to the outer barrier, while the second and third leaves expose a two-entry `parallel_group_path` so operators can see both the outer group and the inner subgroup that is still open.

## Async Callback

`async(...)` runs a serializable callback as a durable child workflow with the system type `durable-workflow.async`. Async callbacks use the same straight-line-only helper contract as named v2 workflows, so `activity()`, `await()`, `timer()`, `sideEffect()`, and the other single-step helpers suspend directly inside the callback body without forcing `yield`.

```php
use function Workflow\V2\{activity, async};
use Workflow\V2\Workflow;

final class CustomerWorkflow extends Workflow
{
    public function handle(string $customerId): array
    {
        $profile = async(static function () use ($customerId): array {
            $customer = activity(LoadCustomer::class, $customerId);

            return [
                'customer' => $customer,
                'score' => activity(ScoreCustomer::class, $customer['id']),
            ];
        });

        return ['profile' => $profile];
    }
}
```

The parent run sees the callback as a child wait, so command history, lineage, and Waterline detail use the same `child_call_id`, child run id, and child outcome history as an explicit `child(...)` call. The callback is serialized with Laravel's serializable-closure support, so keep it app-local and deployment-local. Use a named `child(SomeWorkflow::class, ...)` call when the work needs a stable public workflow type for cross-service routing or long-lived code evolution. `async(...)` callbacks are now straight-line only in v2, so call helpers like `activity()`, `child()`, `await()`, `timer()`, and `all([...])` directly without `yield`.

## Mixed Activity + Child Barriers

The same `all()` helper can also fan in a mixed group of activities and child workflows. Results still come back in the original array order, successful members still wait for the rest of the group, and the first failed member still wakes the parent immediately.

When more than one barrier member has already closed unsuccessfully by the time the parent replays, the parent receives the failure with the earliest recorded close time. If two failures have the same recorded time, the lower barrier leaf index wins, so workflow resume and query replay select the same exception. Later sibling failures do not replace the exception that has already been thrown into the parent step.

```php
use function Workflow\V2\{all, activity, child};
use Workflow\V2\Workflow;

final class OrderWorkflow extends Workflow
{
    public function handle(): array
    {
        [$charge, $shipment] = all([
            fn () => activity(ChargeCustomer::class),
            fn () => child(ShipOrderWorkflow::class),
        ]);

        return compact('charge', 'shipment');
    }
}
```

## Current Limits

The current concurrency surface does not yet include:

- launch handles that can be started and awaited separately from `all([...])` barriers or `async(...)`
- built-in bounded-concurrency helpers beyond explicit nested `all([...])` groups

## Child Workflows in Parallel

Child workflows can also run in their own `all([...])` barrier. It works the same way as parallel activity execution, but for child workflows: the parent fans out several child runs durably and resumes only when the whole child barrier can make progress.

```php
use function Workflow\V2\{all, child};
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => child(MyChild1::class),
            fn () => child(MyChild2::class),
            fn () => child(MyChild3::class),
        ]);
    }
}
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyChild1', duration: 2200 },
    { name: 'MyChild2', duration: 1800 },
    { name: 'MyChild3', duration: 2500 },
  ]}
  mode="parallel"
  title="Child Workflows in Parallel Simulator"
/>

This makes it easy to build hierarchical parallelism into your workflows, including nested child-only or mixed child-plus-activity groups when one parent step needs more than one fan-in layer.
