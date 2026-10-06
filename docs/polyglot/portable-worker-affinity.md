---
sidebar_position: 26
title: Portable Worker Affinity
description: Service-mode worker-affinity support and limitations for PHP, Python, and Rust SDKs.
tags:
  - workers
  - activities
  - replay
  - polyglot
---

# Portable Worker Affinity

Service workers implement the features listed below through Server's worker
protocol. SDK versions and worker configuration determine what is available.

Local activities, worker sessions, and sticky execution share one portability
rule: a service worker must declare each feature as supported or explicitly
refused. Protocol version `1.18` is the floor for these declarations. The
server rejects a flat routing capability unless the worker's structured
manifest marks the same feature as supported.

## SDK support

| SDK worker | Local activities | Worker sessions | Sticky execution |
| --- | --- | --- | --- |
| PHP | Supported | Supported | Supported |
| Python | Supported since 2.2.0 | Supported since 2.3.0 | Not supported |
| Rust | Supported since 3.1.0 with `Worker::local_activities(true)` | Supported since 3.2.0 with `Worker::worker_sessions(true)` | Not supported |

Workers advertise only the capabilities implemented and enabled for their
profile. Rust local activities and sessions require explicit opt-in. Older Rust
versions refuse capabilities they do not implement. Python and Rust continue
to refuse sticky execution. Ordinary workflows and queued
activities use complete durable-history replay without these optimizations.

## Local activity recording

PHP, Python and opted-in Rust workers run a local activity inside the workflow worker. The
workflow-task completion contains the arguments, attempt outcomes, retry and
timeout settings, heartbeat progress, and terminal result or failure. The
server records that sequence atomically as normal activity history marked
`execution_mode=local`.

Replay consumes the recorded terminal activity event. It does not invoke the
local handler again. A worker lost before Server commits completion can execute
the handler again, so external effects must be idempotent.

Ordinary PHP workers execute the synchronous handler
inline. Cancellation and elapsed heartbeat, per-attempt, and total timeouts
are observed before an attempt, at `ActivityContext::heartbeat()`, or after the
handler returns. These handlers must remain short and divide blocking work
with safe heartbeat boundaries.

Python and Rust async callbacks must yield to their language runtime.
Rust renews the exact workflow-task lease independently of application
heartbeats, drops the callback on timeout, lost authority or worker shutdown,
and records bounded attempt and heartbeat reports. See the
[Rust local activity example](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs)
and [API reference](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html).

PHP workers that enable [cooperative cancellation](/docs/polyglot/cancellation)
use protocol 1.20 and supervised callback processes for prepared local activities.
Rust inline local execution uses a separate ordinary worker profile and cannot
be combined with prepared cooperative local supervision. Blocking callbacks
need process supervision to guarantee physical stop.

## Worker session lifecycle

The PHP, Python and Rust SDKs expose typed session options and create, use, renew, and close
operations. Options include requirements, queue, lease duration, total TTL,
maximum concurrent activities, and reacquisition policy. A worker closes the
sessions it holds during graceful shutdown.

If a holder disappears, its lease and concurrency reservation expire. A new
holder may reacquire the session when requirements match, but it must rebuild
worker-local resources before the first activity uses them. Session identity
never makes process memory durable.

Reacquisition preserves the session's original absolute TTL. Renewal extends
holder authority without extending that TTL. Use Server 2.5.1 or newer for
original TTL preservation and recorded session routing during cold replay.
See the [Rust session example](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs)
and [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html).

## Sticky execution and cold replay

The PHP cache is bounded and keyed by the exact workflow ID, run ID, and worker
build ID. It reports `hit`, `miss`, `eviction`, and `forced_cold_replay`.
Expiry, eviction, worker replacement, holder loss, or a build mismatch discards
the optimization and replays complete durable history.

Sticky routing is an affinity optimization. A forced cold replay is diagnostic
evidence that the optimization was unavailable; it is not a workflow
correctness failure. Workflow code must remain deterministic with an empty
cache.

## Safe defaults and rolling fleets

Ordinary workflows require no session or sticky configuration. Mixed-version
fleets fail closed at the protocol floor: the server checks the negotiated
version, the flat capability, the structured manifest, and exact sticky cache
identity before accepting feature-specific completion data.

The published [cross-SDK scenario manifest](/platform-conformance/portable-worker-affinity-runtime-scenarios.json)
covers manifest truth, local-activity replay, session holder loss and
reacquisition, sticky hits and eviction, worker replacement, forced cold
replay, and zero-configuration workflows.

For embedded Laravel implementations, see
[Local Activities](/docs/features/local-activities),
[Worker Sessions](/docs/features/worker-sessions), and
[Sticky Execution](/docs/features/sticky-execution). Those APIs belong to the
workflow package. Use the corresponding SDK's API for service workers.
