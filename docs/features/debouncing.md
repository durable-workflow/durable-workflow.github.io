---
title: Debounce and coalesce revisions
description: Use durable signal waits to refresh one entity after a quiet period.
---

# Debounce and coalesce revisions {#debouncing-and-coalescing}

## Wait for a quiet period {#quiet-window}

Use one stable workflow ID per entity. Keep the largest positive revision and refresh to that version. This pattern intentionally skips intermediate revisions. Use it for a latest-state refresh. Keep operations such as individual payments in a separate flow that processes every request.

Each signal opens a fresh timeout-backed wait. A result of `null` ends the quiet period. The recorded waits and timers drive replay.

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

Register the workflow type so a fresh worker or successor can resolve the same definition.

```php
config(['workflows.v2.types.workflows' => [
    'docs.entity-debounce' => EntityDebounce::class,
]]);
```

## Admit changes atomically {#embedded-intake}

```php
use Workflow\V2\WorkflowStub;

$entity = 'customer-42';
$revision = 1;
$receipt = WorkflowStub::make(EntityDebounce::class, 'refresh:'.$entity)
    ->signalWithStart('changed', [$revision], $entity);
```

The receipt confirms durable admission. An activity can still be pending. Embedded `signalWithStart` starts an absent instance, signals its active run, or creates a fresh run after closure. Ordinary start policies leave a closed instance closed.

## Keep pending changes and bound history {#pending-input-and-continuation}

A signal received while the activity runs remains pending for the next wait. The next batch gets its own quiet period. The running activity continues. Keep the applied revision and any consumed pending revision in continuation arguments. Instance-targeted pending signals for declared handlers can carry into the successor. A run-targeted command stays fenced to its selected run.

Measure history under a representative burst. `SignalReceived`, `SignalApplied`, waits, timers and activity execution each add events. A continuous burst can grow history before any quiet period ends. Bound admitted input and choose a rollover threshold with headroom. Continue-as-new preserves the execution deadline.

The demo activity returns only its selected revision. For a real effect, use an idempotency key such as `(entity, revision)` in the target system. A retried activity can send the same request again even when signal admission was deduplicated.
