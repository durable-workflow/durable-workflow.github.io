---
sidebar_position: 22
title: Activity Execution Model
description: How Durable Workflow v2 dispatches activities, and the temporary replacement gate for local activities, worker sessions, and sticky execution.
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

Every activity in v2 runs the same way: the workflow records an activity command on its history, the engine enqueues a durable activity task, and a worker polls that task off the queue and executes it. This page describes the execution contract that ordinary activities rely on and the product's current stance on three optimizations that appear in other systems — local activities, worker sessions, and sticky execution.

:::caution Temporary stance page
This page is the current product stance while local activities, worker sessions, and sticky execution do not have published runtime contracts. After those features exist, this page must be deleted or reduced to the ordinary queued-activity baseline, and feature discovery must point to the positive feature docs instead of this stance page.
:::

## Temporary Replacement Gate

Keep this page only while it is the truthful public source for unsupported execution-model features. The replacement change is blocked until all three feature families have workflow-owned runtime contracts and positive public docs:

- `docs/features/local-activities.md`
- `docs/features/worker-sessions.md`
- `docs/features/sticky-execution.md`

When those docs exist, the cleanup must:

- remove or substantially rewrite the negative-support sections below for local activities, worker sessions, and sticky execution;
- cross-link the new feature docs to their runtime contracts and from [Activities](/docs/2.0/defining-workflows/activities), [Workflow API](/docs/2.0/defining-workflows/workflow-api), and [Execution Guarantees and Idempotency](/docs/2.0/constraints/execution-guarantees);
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

Every activity attempt goes through the queue. There is no in-process shortcut that bypasses durable task scheduling, and there is no same-worker affinity that the workflow author can rely on for correctness. This is the canonical durable contract for v2.0.

The practical consequences of this contract are:

- **Any worker with matching routing may handle any attempt.** The workflow and activity are typically hosted in separate worker fleets, and a retry of the same activity may land on a different process, host, or build.
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

## Worker Sessions Are Not A v2 Primitive

Other workflow systems expose "worker sessions" that pin a sequence of activities to a single worker process for things like shared local state, GPU memory, or a local filesystem. Durable Workflow v2 does not ship that primitive either.

The stance is explicit:

- **Dedicated queues, priority queues, and sticky caches do not imply worker sessions.** Dedicated or priority queues route work to a class of workers, not to a specific process. Sticky caches optimize replay, not activity placement.
- **There is no session-creation API in v2.0.** Activities cannot opt into a multi-activity lease that binds them to the same worker for correctness.
- **If worker sessions ship in a future 2.0 release or later version, they will require explicit contracts.** Those contracts would need to cover session creation timeouts, concurrency limits, failure-detection for the holding worker, session lifetime, and the behavior when the session's worker dies mid-sequence. Until such contracts are published, activities remain independently schedulable tasks.

What to use instead:

- For work that truly needs shared state, package the entire multi-step operation as a single activity. That activity owns its own process-local resources from start to finish.
- For work that should stay on a particular fleet (for example GPU workers, or workers with filesystem access to a staging area), route it with dedicated connections and queues. See [Microservices](/docs/2.0/configuration/microservices) and the routing fields in [Activity Options](/docs/2.0/configuration/options#activity-options).
- For pipelines of independent steps, sequence ordinary activities in the workflow body. The workflow's history is the coordination surface, not a worker-local session.

```php
use Workflow\V2\Support\ActivityOptions;
use function Workflow\V2\activity;

$thumbnail = activity(
    RenderVideoThumbnailActivity::class,
    new ActivityOptions(connection: 'redis-media', queue: 'gpu-render'),
    $videoId,
);
```

This routes work to a fleet with the right capabilities without promising that the next activity attempt will reuse the same process or host.

## Sticky Execution Is A Replay Optimization, Not A Correctness Feature

"Sticky execution" means keeping a warm copy of a workflow's reconstructed state on the worker that most recently executed one of its tasks, so the next workflow task can skip part of the replay. When a workflow runs continuously on the same worker, sticky execution reduces replay cost.

The contract for sticky execution in Durable Workflow v2 is narrow:

- **Sticky execution, if it is used, is an optimization only.** It exists to skip redundant replay, not to bind workflow code to a particular process.
- **Correctness always falls back to ordinary replay.** Any workflow task may run on any worker. A sticky-cache miss, a worker restart, a routing change, or a deployment rollout causes the next task to run on a fresh worker and reconstruct state from durable history. Workflow code must remain replay-safe under that fallback.
- **Application authors must not rely on process-local state across workflow tasks.** In-memory variables outside workflow history do not survive a sticky-cache miss, and cannot be used as a substitute for signals, updates, side effects, or activity results.

Workflow code that observes only what the engine records on history — inputs, activity outputs, signals, updates, side effects, search attributes, memo — behaves identically whether a task is served from a sticky cache or a cold replay. That is the contract the v2 engine guarantees.

## When To Revisit This Stance

The 2.0 release ships with ordinary queued activities as the canonical durable contract. Local activities and worker sessions are explicitly out of scope for 2.0, and sticky execution is scoped as a replay-cache optimization with ordinary replay as the correctness fallback.

If a future version adds any of these primitives, it will ship with a published contract covering execution semantics, timeouts, cancellation, heartbeating, and failure detection. Until then, treat these sections as the product's position: no local activities, no worker sessions, and no sticky-execution behavior that a workflow author can rely on for correctness.

After all three primitives have positive docs, this page should stop carrying those product-position disclaimers. Either delete it or reduce it to the canonical queued-activity baseline and cross-link to the supported feature docs.
