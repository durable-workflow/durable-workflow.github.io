---
sidebar_position: 26
title: Portable Worker Affinity
description: Negotiate local activities, worker sessions, and sticky execution safely across PHP, Python, and Rust service workers.
tags:
  - workers
  - activities
  - replay
  - polyglot
---

# Portable Worker Affinity

Local activities, worker sessions, and sticky execution share one portability
rule: a service worker must declare each feature as supported or explicitly
refused. Protocol version `1.18` is the floor for these declarations. The
server rejects a flat routing capability unless the worker's structured
manifest marks the same feature as supported.

## SDK support

| SDK worker | Local activities | Worker sessions | Sticky execution |
| --- | --- | --- | --- |
| PHP | Supported | Supported | Supported |
| Python | Explicitly refused | Explicitly refused | Explicitly refused |
| Rust | Explicitly refused | Explicitly refused | Explicitly refused |

An explicit refusal is safe interoperability, not partial execution. The
worker remains usable for its ordinary workflow and activity capabilities and
is never routed work that depends on the refused contract.

## Local activity recording

PHP service workers run a local activity inside the workflow worker. The
workflow-task completion contains the arguments, attempt outcomes, retry and
timeout settings, heartbeat progress, and terminal result or failure. The
server records that sequence atomically as normal activity history marked
`execution_mode=local`.

Replay consumes the recorded terminal activity event. It does not invoke the
local handler again. The synchronous PHP handler is not preempted: cancellation
and elapsed heartbeat, per-attempt, and total timeouts are observed before an
attempt, when the handler calls `ActivityContext::heartbeat()`, or after the
handler returns. A handler that neither returns nor heartbeats cannot be
interrupted by these cooperative controls, so local activities must remain
short and divide blocking work with safe heartbeat boundaries.

## Worker session lifecycle

The PHP SDK exposes typed session options and create, use, renew, and close
operations. Options include requirements, queue, lease duration, total TTL,
maximum concurrent activities, and reacquisition policy. A worker closes the
sessions it holds during graceful shutdown.

If a holder disappears, its lease and concurrency reservation expire. A new
holder may reacquire the session when requirements match, but it must rebuild
worker-local resources before the first activity uses them. Session identity
never makes process memory durable.

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

See [Local Activities](/docs/features/local-activities),
[Worker Sessions](/docs/features/worker-sessions), and
[Sticky Execution](/docs/features/sticky-execution) for the individual
contracts.
