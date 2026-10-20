---
draft: true
---

# Debouncing and coalescing

This is prepared embedded source, not a published complete service-mode recipe.
The service atomic-intake prerequisite is linked from Website issue #280.
Translate the final embedded and service guides into every offered language
when that capability is qualified. Do not publish this draft as completion of
the service requirement.

## Wait for a quiet window {#quiet-window}

Use a stable workflow instance ID for one entity. This example coalesces
strictly positive, increasing entity revision numbers by keeping the maximum.
It intentionally skips intermediate revisions. It is suitable for refreshing
an entity to its latest state, not for dropping individual payments or other
operations that each require execution.

Each received signal begins a fresh timeout-backed wait. This creates ordinary
durable waits and timers. It does not reset an already recorded timer, delay
the workflow's start, or compare a worker's wall clock with a replay clock.

```php
use Workflow\V2\Activity;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, await, continueAsNew};

#[Type('docs.entity-debounce')]
#[Signal('changed', [
    ['name' => 'revision', 'type' => 'int', 'allows_null' => false],
])]
final class EntityDebounce extends Workflow
{
    public function handle(
        string $entity,
        int $pending = 0,
        int $applied = 0,
        int $batches = 0,
    ): mixed {
        while (true) {
            if ($pending <= $applied) {
                $pending = max($applied, await('changed'));
            }

            while (($next = await('changed', timeout: 1)) !== null) {
                $pending = max($pending, $next);
            }

            if ($pending <= $applied) {
                continue;
            }

            activity(ApplyRevision::class, $entity, $pending);
            $applied = $pending;

            if (++$batches >= 2) {
                return continueAsNew($entity, 0, $applied, 0);
            }
        }
    }
}

#[Type('docs.apply-revision')]
final class ApplyRevision extends Activity
{
    public function handle(string $entity, int $revision): array
    {
        return ['entity' => $entity, 'revision' => $revision];
    }
}
```

The activity only returns the selected revision so the example has no external
effect. Put real reads and effects in the activity, with an application-owned
idempotency key such as the entity and revision. A repeated activity attempt
can repeat an external request. Signal command deduplication alone would not
make that effect once-only.

Register the durable type map in the embedded application. Keep these same
types available to every cold worker and successor run:

```php
config(['workflows.v2.types.workflows' => [
    'docs.entity-debounce' => EntityDebounce::class,
]]);
```

## Atomic embedded intake {#embedded-intake}

```php
use Workflow\V2\WorkflowStub;

$entity = 'customer-42';
$revision = 1;
$receipt = WorkflowStub::make(EntityDebounce::class, 'refresh:'.$entity)
    ->signalWithStart('changed', [$revision], $entity);
```

The receipt reports durable admission. It does not report an activity effect.
The embedded operation atomically starts a run or signals the active run. Its
explicit signal-with-start path can create a fresh run after terminal closure.
Ordinary `start()` and its return-existing policy do not reopen a closed
instance. Do not substitute two separate operations for this atomic boundary.
An unknown network outcome is not a rejected or successful receipt.

## Inputs during work and continuation {#pending-input-and-continuation}

A signal received while the activity runs stays durable until the next signal
wait consumes it. The new batch then waits for its own quiet window. This does
not cancel the running activity or undo its effects.

The example continues after two completed batches to make the boundary easy to
exercise. Preserve the applied revision and any already consumed pending state
in continuation arguments. Core's declared, instance-targeted pending signals
transfer with their original identities and arguments. The accepted signal in
the leased-task continuation control was applied once on the successor. An
explicit run-targeted signal stays fenced to its selected run.

Choose a finite batch bound for the application's history budget. Continuous
input can prevent a quiet window and grow history before a batch completes.
Bound admitted bursts and payloads and monitor history pressure. Do not promise
this loop can consume an unbounded burst within one run. Continue-as-new does
not reset the logical execution deadline or copy arbitrary local state.

## History cost {#history-cost}

An accepted signal adds a `SignalReceived` event even when the same application
revision was sent before. Consuming it adds `SignalApplied` and advances the
message cursor. Each opened signal wait has `SignalWaitOpened`; a parked quiet
wait also records `TimerScheduled`, followed by `TimerCancelled` when a signal
wins or `TimerFired` when the quiet period wins. Buffered signals can resolve
without scheduling another timer. Activities, start and continuation add their
own events. Do not budget only the final activity or assume one event per
signal.

The source qualification uses the named published artifact tuple and original
race controls recorded on the owning product issue. It does not qualify
service-mode atomic intake or once-only external effects. Safe signal retries
remain tracked in [shared #216](https://github.com/durable-workflow/.github/issues/216).
