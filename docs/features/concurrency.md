---
sidebar_position: 10
---

import ConcurrencySimulator from '@site/src/components/ConcurrencySimulator';

# Concurrency

Parallel barriers describe the complete durable group before suspension. PHP
uses `all([...])` or `parallel([...])`, Python yields a list, and Rust awaits
`WorkflowContext::parallel(...)` or `join(...)`. Every SDK emits ordinary
activity, child-workflow, or timer commands with the same group identity/path
metadata; no separate parallel wire command exists. Results come back in the
original nested input shape.

Use a selection group when progress depends on the first completed member
instead of the whole barrier. Selection is also durable: it starts every member,
records one winner, and leaves every non-winner running until workflow code
awaits or explicitly cancels it.

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

## First-completion selection

`select([...])` starts independent activities, child workflows, timers, signal
waits, condition waits, or nested ordinary barriers and resumes when one member
commits an eligible result or typed failure. Give members stable application
keys when later code needs to distinguish or revisit them.
Member keys have one portable domain across runtimes: a non-empty string or a
non-negative integer.

The following coordinator starts its deadline at the same durable step as the
resolver. Input processing and resolver progress cannot reset or postpone that
deadline:

```php
use function Workflow\V2\{activity, await, select, timer};
use Workflow\V2\Workflow;

final class ResolveInRealTime extends Workflow
{
    public function handle(string $requestId): array
    {
        $selected = select([
            'resolved' => fn () => activity(ResolveRequest::class, $requestId),
            'manual' => fn () => await('resolution.received'),
            'deadline' => fn () => timer('2 seconds'),
        ]);

        if ($selected->key === 'deadline') {
            $selected->handles['resolved']->cancel();

            return ['status' => 'timed_out'];
        }

        // The deadline is not cancelled just because another member won.
        $selected->handles['deadline']->cancel();

        return [
            'status' => 'resolved',
            'source' => $selected->key,
            'value' => $selected->result(),
        ];
    }
}
```

The result contains the stable member key and index, operation kind and durable
identity, result or typed failure, the winner handle, and a handle for every
member. A non-winning handle can be awaited later with `await()` or cancelled
with `cancel()`. Selection never implicitly discards or cancels a sibling.
`cancel()` is a void/unit request and never reports whether cancellation won.
`SelectionOperationCancelled` history is the outcome authority. If completion
commits first, the runtime writes no cancellation marker, replay advances past
the cancel call only after a committed workflow-task boundary, successor
command, or workflow terminal event proves the no-op committed. Query replay
stops at an in-flight cancel instead of exposing speculative state after it.
Awaiting the handle after the committed no-op returns the earlier completion.

The runtime records the first eligible resolution while holding the parent-run
commit lock. Cold restart, persisted-history reload, query replay, and later
loser completions therefore reuse the recorded winner instead of racing local
language futures or reinterpreting history order. Exact duplicate delivery is
idempotent. Concurrent inputs are ordered by their committed durable history;
an input that arrives while an activity runs is visible on the next workflow
task, and a late or duplicate input cannot replace an already recorded winner.

Service-mode SDKs expose the same lifecycle in their language model: Python
uses `yield ctx.select({...})`, PHP uses `$ctx->select([...])`, and Rust awaits
`ctx.select_keyed(...)`. See the [PHP service-mode example](/docs/2.0/polyglot/php/#run-a-remote-php-worker)
and the language pages for exact handle methods.

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

### Python nested list-yield

```python
results = yield [
    ctx.schedule_activity("build-summary", []),
    [
        ctx.start_child_workflow("build-invoice", []),
        ctx.start_timer(1),
    ],
]
summary, (invoice, _) = results
```

### Rust nested join

```rust
use durable_workflow::{json, ChildWorkflowOptions, ParallelOperation};
use std::time::Duration;

let results = ctx.join(vec![
    ParallelOperation::activity("build-summary", json!([])),
    ParallelOperation::group(vec![
        ParallelOperation::child_workflow(
            "build-invoice",
            ChildWorkflowOptions::new("document-workers"),
            json!([]),
        ),
        ParallelOperation::timer(Duration::from_secs(1)),
    ]),
]).await?;
```

For all three SDKs, the outer group size counts durable leaves, not list nodes.
Each nested leaf carries an outer-to-inner `parallel_group_path`; every path
entry preserves the same durable workflow position. The group schedules all
leaves before it suspends, then assembles successful values by input position.
Worker restart and completed-history replay rebuild the same group identity.
Exact duplicate terminal delivery is ignored, and a late sibling completion
can enrich partial diagnostics without changing the failed member already
selected by the SDK's deterministic policy.

Python throws the typed leaf failure at the list-yield expression. Rust wraps
the typed cause in `Error::ParallelFailed` together with the failed member path,
full group path, and already completed siblings. PHP raises the typed leaf
failure from `all()` and retains the barrier's durable group metadata in
history and operator views.

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
