---
sidebar_position: 1
---

# Overview

Workflows and activities live on opposite sides of the durable boundary and carry different constraints. Workflow code is **replayed**; activity code is **retried**. Those are not the same operation, and the rules flow from that split.

- **Workflow authoring code must be deterministic.** The engine replays history to rebuild a workflow's state whenever it resumes — on another worker, after a restart, after a deployment, or during a long-running execution. Replay re-invokes the workflow body, not activities, so the workflow must produce the same decisions in the same order every time it sees the same history. Wall-clock reads, live cache reads, random numbers, network calls, and other sources of change are prohibited inside the workflow body; use [`Workflow::now()`](../defining-workflows/workflow-api.md), [`sideEffect(...)`](../features/side-effects.md), activities, and similar helpers to cross the durable boundary.

- **Activity code must be idempotent.** Activity attempts are **at-least-once**. Retries, lease expiry, and redelivery can all cause the same logical work to be observed more than once, and that is first-class behavior — not a bug condition. The framework records at most one terminal outcome per attempt at the durable state layer, but an activity body may start executing more than once before the engine sees the winning report. Treat repeat observation as normal and use an idempotency key, a deterministic target resource, or a naturally idempotent operation when the external side effect must not duplicate.

- **Event sourcing persists history, not rerun side effects.** The engine writes each durable step — activity completion, timer fired, signal received, side effect recorded — as a typed history event. Replay reads that history and hands cached results back to the workflow body; it does not re-dispatch activities, timers, or signals. Durable state events for a given identifier are exactly-once at the history layer even when the transport behind them delivered work more than once.

Together, determinism and idempotency let the engine resume workflows that span deployments, worker restarts, and distributed retries without losing place and without duplicating external side effects the application has already made safe to repeat.

See [Workflow Constraints](./workflow-constraints.md) for the specific authoring rules that keep replay deterministic, and [Activity Constraints](./activity-constraints.md) for the idempotency guidance that keeps at-least-once activity execution safe.
