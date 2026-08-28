---
sidebar_position: 22
title: Activity Execution Model
description: How ordinary queued activities, local activities, worker sessions, and sticky execution fit together in Durable Workflow v2.
tags:
  - activities
  - workers
  - execution
keywords:
  - activity execution model
  - local activities
  - worker sessions
  - sticky execution
  - durable task dispatch
  - queued activities
---

# Activity Execution Model

For service-worker support and fail-closed capability negotiation across PHP,
Python, and Rust, see [Portable Worker Affinity](/docs/2.0/features/portable-worker-affinity).

Durable Workflow v2 now has explicit primitives for the common activity
placement choices:

- ordinary queued activities for durable, independently leased work;
- [local activities](/docs/2.0/features/local-activities) for short
  same-process activity work that still records activity history;
- [worker sessions](/docs/2.0/features/worker-sessions) for durable activity
  affinity across multiple queued activity steps;
- [sticky execution](/docs/2.0/features/sticky-execution) for workflow replay
  cache affinity, with ordinary replay as the correctness fallback.

## Ordinary Queued Activities

`activity(...)` and `Workflow::activity(...)` are ordinary queued activities.
They remain the default activity primitive.

1. Workflow code calls `activity(MyActivity::class, ...)`.
2. The workflow task records `ActivityScheduled` and creates a durable activity
   task on the configured connection and queue.
3. A compatible worker claims that activity task under a lease.
4. The worker runs the activity class and reports completion, failure,
   cancellation, heartbeat, or timeout.
5. The engine records the activity outcome on workflow history and resumes the
   workflow from durable state.

Ordinary activity attempts may run on any compatible worker. A retry may land
on a different process, host, or build. Activity code must be idempotent across
duplicate delivery, retries after lease expiry, and late completion races. Use
`activity_execution_id` as the default remote idempotency key and
`activity_attempt_id` only when a downstream system needs per-attempt
correlation.

```php
use function Workflow\V2\activity;

$quote = activity(FetchQuoteActivity::class, $customerId);
$invoice = activity(CreateInvoiceActivity::class, $quote['id']);
```

## Local Activities

`localActivity(...)`, `Workflow::localActivity(...)`, and
`Workflow::executeLocalActivity(...)` run an activity class inside the workflow
worker process that is currently executing the workflow task. They do not
create an ordinary activity task.

Local activities still record normal activity history:

- `ActivityScheduled`
- `ActivityStarted`
- `ActivityHeartbeatRecorded`
- `ActivityRetryScheduled`
- `ActivityCompleted`
- `ActivityFailed`
- `ActivityCancelled`
- `ActivityTimedOut`

Each local activity event carries `execution_mode=local` and
`local_activity=true`, and the activity execution snapshot stores
`activity_options.execution_mode=local`. Activity heartbeats renew the owning
workflow task lease while the local attempt runs.

Use local activities for short, idempotent side effects that need activity
retry, timeout, heartbeat, cancellation, and visibility semantics but do not
need queue routing or an independent activity worker fleet. See
[Local Activities](/docs/2.0/features/local-activities) for the API,
timeouts, retry, shutdown, cold-replay, routing, and metrics contract.

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

## Worker Sessions

Worker sessions pin a sequence of ordinary queued activity attempts to one
worker-session lease. Use them when multiple durable steps must reuse
worker-local resources such as GPU memory, a mounted filesystem, or a loaded
model.

Worker sessions do not make an activity local. Each in-session activity is
still a durable activity task with its own lease, heartbeat, timeout, retry,
and terminal history. The session adds explicit affinity and admission rules on
top of normal queue routing.

See [Worker Sessions](/docs/2.0/features/worker-sessions) for the session API,
lease lifecycle, routing, failure handling, shutdown behavior, and operator
diagnostics.

## Sticky Execution

Sticky execution is a workflow-task replay optimization. A worker may keep a
warm process-local replay cache after completing a workflow task, and matching
may prefer that worker for the next workflow task for the same run.

Sticky execution does not make workflow progress process-local. Correctness
always falls back to ordinary cold replay from durable history after cache
misses, worker restart, drain, rollout, or eviction. Workflow code must not
rely on in-memory state outside history.

See [Sticky Execution](/docs/2.0/features/sticky-execution) for the sticky
cache lifecycle, routing identity, fallback rules, deployment controls, and
metrics.

## Choosing The Right Primitive

Use workflow code directly for deterministic branching and calculations.

Use [`sideEffect(...)`](/docs/2.0/features/side-effects) for a replay-safe
snapshot of a non-deterministic value that does not need activity retry,
timeout, heartbeat, or cancellation semantics.

Use [local activities](/docs/2.0/features/local-activities) for short,
retryable, same-process side effects that should be visible as activity
attempts but should not enter normal task matching.

Use ordinary [activities](/docs/2.0/defining-workflows/activities) for remote
calls, slow I/O, CPU-heavy work, queue backpressure, dedicated worker fleets,
or work that should continue through a separately leased activity task.

Use [worker sessions](/docs/2.0/features/worker-sessions) when multiple
ordinary activity steps need explicit worker-local affinity.
