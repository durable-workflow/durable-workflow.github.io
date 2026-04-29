---
sidebar_position: 3.5
title: Execution Guarantees and Idempotency
description: The public v2 contract for replay, retries, lease expiry, redelivery, and the default idempotency surfaces.
tags:
  - constraints
  - idempotency
  - retries
  - replay
keywords:
  - execution guarantees
  - idempotency
  - replay
  - redelivery
  - lease expiry
  - at least once
  - exactly once
---

# Execution Guarantees and Idempotency

Durable Workflow v2 draws a hard line between **workflow replay** and
**activity execution**:

- Workflow code is replayed from committed history and must be deterministic.
- Activity code performs side effects and is **at-least-once**.
- The durable history layer records committed workflow and activity outcomes
  exactly once for a given durable identifier, even when transport delivered
  work more than once.

Those guarantees are what let the engine survive worker restarts, lease
expiry, queue redelivery, and rolling deploys without losing the run's place.

## Replay Is Not Retry

Workflow tasks rebuild state by replaying committed history and then deciding
what to do next. Replay re-invokes the workflow body, but it does **not**
re-run activities, re-send signals, or repeat side effects that were already
recorded on history.

That is why workflow authoring code must stay deterministic. Use workflow-safe
helpers such as [`Workflow::now()`](../defining-workflows/workflow-api.md),
[`sideEffect(...)`](../features/side-effects.md), queries, updates, activity
results, memos, and search attributes when you need to cross the durable
boundary.

## Activity Execution Is At-Least-Once

Activities are the side-effecting part of the system, so the contract is
different:

- An activity attempt can be claimed more than once.
- Lease expiry can cause redelivery to another worker.
- A worker can finish external work, lose its lease, and still report late.
- A retry schedules a new durable attempt for the same logical activity
  execution.

Duplicate observation is therefore **first-class behavior, not a bug
condition**. The application author must make the activity body or the remote
system it calls safe to repeat.

See [Activity Constraints](./activity-constraints.md) for authoring guidance
and [Failures and Recovery](../failures-and-recovery.md) for operator-facing
recovery behavior.

## What Is Exactly Once

Durable Workflow does **not** promise that a worker process sees side-effecting
work only once. It does promise that committed durable facts are authoritative
and do not duplicate for the same durable identifier.

In practice that means:

- A committed workflow decision is persisted once in typed history for the
  durable command or step id it represents.
- A committed terminal outcome for one activity attempt is persisted once for
  that `activity_attempt_id`.
- Replay reads those committed facts back and rebuilds workflow state from
  them instead of re-running external work.

That split is the core mental model:

- **Transport and workers are at-least-once.**
- **Committed durable history is exactly-once per durable identifier.**

## Lease Expiry and Redelivery

Lease expiry is a normal distributed-systems recovery path:

- A claimed task carries a lease owner and expiry time.
- If the lease expires before the worker reports progress or completion, the
  task becomes eligible for redelivery.
- A different worker may then claim the same logical work.

Redelivery does not mean the engine forgot what already committed. It means
the engine is recovering from uncertainty at the worker or transport layer.

When you see duplicate execution symptoms, ask two questions separately:

1. Did the side effect happen more than once?
2. Did the durable state record more than one committed outcome for the same
   durable identifier?

The first question is solved with idempotent activity design. The second is
the engine contract.

## Default Idempotency Surfaces

These identifiers are the stable places to dedupe work:

| Surface | What it identifies | Typical use |
| --- | --- | --- |
| `workflow_instance_id` | One public workflow instance | Duplicate-start handling and business-level run identity |
| `workflow_run_id` | One specific durable run | Pinning one selected run for queries, export, or diagnostics |
| `workflow_command_id` | One mutating external command | Client-side request retry dedupe |
| `activity_execution_id` | One logical activity execution across retries | Default remote idempotency key for external side effects |
| `activity_attempt_id` | One concrete attempt of that activity | Correlation when a remote system must distinguish separate tries |
| `schedule_id` | One schedule definition | Dedupe around schedule ownership and trigger identity |
| message-stream `idempotencyKey` | One retried logical message send | Prevent duplicate message ingestion when a sender retries |

When in doubt, use `activity_execution_id` as the default idempotency key for
an external operation. Reach for `activity_attempt_id` only when the external
target truly needs every retry attempt to be distinguishable.

```php
use Workflow\V2\Activity;

final class ChargeCard extends Activity
{
    public function handle(array $payload): string
    {
        return app(PaymentGateway::class)->charge(
            $payload,
            idempotencyKey: $this->activityId(),
            attemptCorrelation: $this->attemptId(),
        );
    }
}
```

## What Developers Must Make Idempotent

You do **not** need to make workflow replay itself idempotent. The framework
handles replay by rebuilding state from committed history.

You **do** need to make external effects safe to repeat, including:

- payment or billing calls
- emails, texts, and webhooks
- writes to another database or service
- file creation or upload
- any command that creates or mutates state outside the workflow history

Common approaches:

- Pass the remote API an idempotency key.
- Write to a deterministic target resource such as a known object key.
- Use an upsert or transaction keyed by a durable identifier.
- Make the action naturally repeatable so the second call is a no-op.

## Operator Guidance

When diagnosing a run in Waterline, the CLI, or server logs:

- Treat duplicate activity observation after lease expiry as expected until the
  durable attempt outcome shows otherwise.
- Treat late completion or failure reports as a race the engine resolves, not
  as proof that the remote side effect never happened.
- Treat workflow-task replay as recovery, not as workflow-level retry.
- Treat missing compatible workers, stuck leases, or repeated repair as
  operational signals that need investigation, not as a reason to assume the
  workflow body should re-run side effects.

The most important operator distinction is between **transport uncertainty**
and **durable outcome**. Durable Workflow surfaces both so you can tell the
difference.

## Related Guides

- [Overview](./overview.md) introduces the workflow/activity split.
- [Workflow Constraints](./workflow-constraints.md) covers deterministic
  authoring rules.
- [Activity Constraints](./activity-constraints.md) covers side-effect safety
  and idempotency techniques.
- [Failures and Recovery](../failures-and-recovery.md) covers retries,
  timeout enforcement, and repair.
- [Activity Execution Model](../features/activity-execution-model.md) explains
  why ordinary queued activities are the canonical durable contract.
