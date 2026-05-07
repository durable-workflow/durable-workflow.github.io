---
sidebar_position: 22
title: Activity Execution Model
description: How Durable Workflow v2 dispatches activities, and how local activities, worker sessions, and sticky execution fit the v2 contract.
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

Every activity in v2 records an activity command on history, creates a durable activity task, and waits for a worker to complete that task. This page describes the ordinary queued-activity baseline, the current stance for local activities, the supported worker-session affinity primitive, and the supported sticky execution replay optimization.

:::caution Temporary stance page
This page is still the product stance while local activities do not have a published runtime contract. Worker sessions now have a positive feature contract at [Worker Sessions](/docs/2.0/features/worker-sessions), and sticky execution has one at [Sticky Execution](/docs/2.0/features/sticky-execution). After local activities also exist, this page should be deleted or reduced to the ordinary queued-activity baseline.
:::

## Temporary Replacement Gate

Keep this page only while it is the truthful public source for unsupported execution-model features. The replacement change is blocked until the remaining unsupported feature family has a workflow-owned runtime contract and positive public docs:

- `docs/features/local-activities.md`

When that doc exists, the cleanup must:

- remove or substantially rewrite the negative-support section below for local activities;
- cross-link the new feature doc to its runtime contract and from [Activities](/docs/2.0/defining-workflows/activities), [Workflow API](/docs/2.0/defining-workflows/workflow-api), and [Execution Guarantees and Idempotency](/docs/2.0/constraints/execution-guarantees);
- update `scripts/reference-docs-contract.json` so it pins the positive feature docs instead of requiring the negative headings on this page;
- update `scripts/discoverability-contract.json`, `sidebars.js`, and any explicit `scripts/check-llms-ai-surfaces.js` assertions so tracked searches, the docs index, `llms-2.0.txt`, and `llms-full-2.0.txt` point to supported feature docs instead of this temporary stance page;
- keep the ordinary queued-activity contract below if it remains the canonical baseline.

## Ordinary Queued Activities Are The Canonical Durable Contract

The v2 engine has one way to execute an activity:

1. Workflow code calls `activity(MyActivity::class, ...)`.
2. The workflow task records a `TaskScheduled` history event and returns the command to the engine.
3. The engine creates a durable activity task on the activity's configured connection and queue.
4. A worker process polls the queue, claims the task under a lease, runs `MyActivity::handle(...)`, and reports the outcome.
5. The engine records `TaskCompleted`, `TaskFailed`, or a retry event on the workflow's history, then resumes the workflow from its durable state.

Every activity attempt goes through the queue. There is no in-process shortcut that bypasses durable task scheduling. Same-worker affinity exists only when the workflow explicitly uses the worker-session contract. Ordinary activities remain independently schedulable tasks.

The practical consequences of this contract are:

- **Any worker with matching routing may handle any ordinary attempt.** The workflow and activity are typically hosted in separate worker fleets, and a retry of the same ordinary activity may land on a different process, host, or build.
- **Latency includes the queue.** Activity start latency is `schedule-to-start` + task runtime + outcome reporting. It is bounded by poller concurrency, queue depth, and the worker's processing rate — not by the workflow's process identity.
- **Replay does not re-execute side effects.** Activity output comes from recorded history, not from re-running `handle()`. If you need a value to appear on history without a full retryable activity (for example a UUID or the current time), use [`sideEffect(...)`](/docs/2.0/features/side-effects).
- **Idempotency is the activity author's responsibility.** Duplicate delivery, retries after lease expiry, and redelivery after worker failure are all first-class. Activities must be safe to run more than once with the same input. Use `activity_execution_id` as the default remote idempotency key and `activity_attempt_id` only when a downstream system needs per-attempt correlation. See [Execution Guarantees and Idempotency](/docs/2.0/constraints/execution-guarantees), [Activities](/docs/2.0/defining-workflows/activities), and [Failures and Recovery](/docs/2.0/failures-and-recovery).

## Choosing The Right Primitive

When authors ask for "local activities," they usually want one of three things: deterministic workflow logic, a one-shot recorded value, or a retryable side effect. v2 keeps those cases separate on purpose:

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

final class InvoiceWorkflow extends Workflow
{
    public function execute(string $customerId): array
    {
        $billingCycle = self::now()->format('Y-m');
        $requestId = self::sideEffect(fn () => (string) str()->uuid());
        $quote = activity(FetchQuoteActivity::class, $customerId, $billingCycle);

        return activity(CreateInvoiceActivity::class, $quote['id'], $requestId);
    }
}
```

- Put deterministic branching and calculations directly in workflow code.
- Use `sideEffect(...)` when you need a non-deterministic value recorded on history exactly once.
- Use an ordinary activity when the step touches external state, needs retries, or should survive worker loss independently of the current workflow task.
- Use [worker sessions](/docs/2.0/features/worker-sessions) when multiple durable activity steps must reuse process-local state, GPU memory, or filesystem-local resources on one worker lease.

## Local Activities Are Not A v2 Primitive

Some workflow systems expose a "local activity" primitive that runs in the workflow's worker process without crossing the task queue. Durable Workflow v2 does not ship that primitive.

The stance is explicit:

- **Ordinary activity support does not imply local activities.** Authors must not assume that a short activity will bypass the queue.
- **There is no API for local activities in v2.0.** Every `activity(...)` call schedules a durable task and waits for a worker to pick it up.
- **If this project adds a local-activities primitive in a future 2.0 release or later version, it will ship with an explicit contract.** That contract would have to define same-process execution, workflow-task heartbeating during the local call, shutdown and cancellation semantics, and the specific rules for bypassing normal queueing and routing. Until such a contract is published, no activity runs "locally."

What to use instead:

- For small deterministic computations, put the logic directly in workflow code — the result is recorded implicitly in the next command or implicitly through `sideEffect(...)`. Workflow code runs inside the workflow task and is fast.
- For short side effects that need to be captured on history exactly once, use [`sideEffect(...)`](/docs/2.0/features/side-effects). It records a value on history without creating a separate activity task.
- For actual side effects (HTTP calls, database writes, external APIs), schedule an ordinary activity. Tune `schedule_to_start_timeout`, poller concurrency, and worker count if latency matters; see [Activities](/docs/2.0/defining-workflows/activities), [Timeouts](/docs/2.0/features/timeouts), and [Operator Operating Envelope](/docs/2.0/operator-operating-envelope).

## Worker Sessions Have A Supported Affinity Contract

Worker sessions are the supported v2 activity-affinity primitive. They pin a sequence of activity attempts to one worker-session lease when a workload needs process-local state, GPU memory, or local filesystem affinity across multiple durable steps.

The contract is explicit:

- **Session creation is explicit and durable.** PHP workflows create a handle with `Workflow::workerSession()` or `Workflow\V2\workerSession()`. External workers can use the `worker_session` field on `schedule_activity` commands.
- **A session has one lease owner at a time.** The server creates, renews, expires, closes, or reacquires the lease through worker-protocol verbs and normal activity heartbeats.
- **Routing remains queue-based first.** Session options can name a queue, connection, and capability requirements such as `gpu:nvidia-l4`, `gpu:a100`, `fs:/mnt/models`, or `zone:us-east-1a`.
- **Worker failure is observable and recoverable.** Lease expiry and stale worker heartbeats mark sessions expired or orphaned. A capable worker may reacquire when `allow_reacquire_after_failure` permits it, and workflow authors must rebuild process-local state after reacquisition.

Use a worker session only when the workflow can tolerate rebuilding local state after worker failure. Prefer ordinary queued activities when each step is independent, and prefer one larger activity when the whole operation is one atomic side effect.

See [Worker Sessions](/docs/2.0/features/worker-sessions) for the API, lease lifecycle, admission controls, failure behavior, shutdown behavior, operator diagnostics, and authoring guidance.

```php
use Workflow\V2\Support\WorkerSessionOptions;
use Workflow\V2\Workflow;

$session = Workflow::workerSession(
    'gpu-render',
    new WorkerSessionOptions(queue: 'gpu-render', requirements: ['gpu:nvidia-l4']),
);

$thumbnail = $session->activity(RenderVideoThumbnailActivity::class, $videoId);
```

This routes work to a capable fleet and asks the server to hold a session lease for later in-session activity calls.

## Sticky Execution Has A Supported Replay Contract

Sticky execution has a supported v2 replay contract. It keeps a warm copy of a workflow's reconstructed state on the worker that most recently completed one of its workflow tasks, then uses `worker_id` affinity so the next workflow task can prefer that warm worker.

The feature contract is positive but intentionally scoped:

- **Sticky execution is an optimization only.** It exists to skip redundant replay, not to bind workflow code to a particular process.
- **Correctness always falls back to ordinary replay.** A sticky-cache miss, a worker restart, a routing change, drain, cache eviction, or deployment rollout causes the task to reconstruct state from durable history. Workflow code must remain replay-safe under that fallback.
- **Application authors must not rely on process-local state across workflow tasks.** In-memory variables outside workflow history do not survive a sticky-cache miss, and cannot be used as a substitute for signals, updates, side effects, or activity results.
- **Operators have controls and diagnostics.** Sticky execution publishes enablement, TTL, worker-cache capacity, hit-rate, miss-rate, forced-cold-replay, and capacity-pressure surfaces.

Workflow code that observes only what the engine records on history - inputs, activity outputs, signals, updates, side effects, search attributes, memo - behaves identically whether a task is served from a sticky cache or a cold replay. See [Sticky Execution](/docs/2.0/features/sticky-execution) for lifecycle, ownership, routing identity, fallback, deployment, controls, metrics, and replay-safe code guidance.

## When To Revisit This Stance

The 2.0 release ships with ordinary queued activities as the canonical durable contract. Worker sessions are supported for explicit activity affinity. Sticky execution is supported as a replay-cache optimization with ordinary replay as the correctness fallback. Local activities remain out of scope until they have their own published contract.

If a future version adds local activities, that primitive will ship with a published contract covering execution semantics, timeouts, cancellation, heartbeating, and failure detection. Until then, treat the local-activities section as the product's position: no local activities.

After local activities have positive docs, this page should stop carrying product-position disclaimers. Either delete it or reduce it to the canonical queued-activity baseline and cross-link to the supported feature docs.
