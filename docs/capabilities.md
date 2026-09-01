---
sidebar_position: 2
title: 2.0 Capability Index
description: Durable Workflow 2.0 service-mode SDK, embedded runtime, protocol, and capability index.
tags:
  - capabilities
  - compatibility
  - polyglot
keywords:
  - Durable Workflow 2.0 capabilities
  - PHP Python Rust SDK
  - workflow engine feature matrix
  - exact feature floors
---

# Durable Workflow 2.0 Capability Index

This is the capability index for the stable Durable Workflow 2.0 release line.

## Supported installable channel

Exact artifact identities belong to package registries and release metadata,
not this capability summary.

| Surface | Supported channel | Role in this index |
| --- | --- | --- |
| CLI | 2.0 stable | Machine-readable operator and diagnostic client. |
| PHP SDK | 2.0 stable | First-party service-mode `durable-workflow/sdk` client and remote workflow/activity worker for a Cloud namespace runtime or self-hosted Server. |
| Embedded Laravel engine | 2.0 stable | Separate in-application `durable-workflow/workflow` deployment mode with its own authoring runtime, persistence engine, queues, and replay. |
| Python SDK | 2.0 stable | First-party service-mode deterministic workflow/activity SDK plus operational and control-plane client for a Cloud namespace runtime or self-hosted Server. Requires Python 3.10 or newer. |
| Rust SDK | 2.0 stable | First-party service-mode deterministic workflow/activity SDK, worker service, and control-plane client for a Cloud namespace runtime or self-hosted Server. Requires Rust 1.86 or newer. |
| Server | 2.0 stable | Self-hosted, PHP-implemented language-neutral runtime for the v2 control-plane and worker protocols. |
| Waterline | 2.0 stable | Cloud includes Managed Waterline; self-hosted operators separately deploy the service image against a Server namespace; embedded Laravel installs the Composer package and reads application-owned state in process. |

PHP, Python, and Rust are the three first-party service-mode SDK languages.
Each can target a provisioned Durable Workflow Cloud namespace runtime or a
self-hosted Server where runtime discovery reports the published capability.
They share stable string type names, one durable command/history model, control
plane version `2`, worker protocol major `1`, and the public payload envelope.
Rust is a workflow SDK: it runs deterministic workflow code, activities, and
worker services, not only raw protocol calls. Python combines workflow
authoring with namespace, schedule, worker, queue, history, repair, and other
operational client surfaces.

Embedded Laravel remains a separate in-application PHP deployment mode; it is
not required for PHP service-mode clients or workers. The framework-neutral PHP
SDK is versioned independently from the embedded Laravel engine.

Use [Deployment Modes](/docs/polyglot/deployment-modes/) to choose the
ownership boundary, then continue with
[Cloud Managed Runtime](/docs/polyglot/cloud-control-plane/) or the
[self-hosted Server](/docs/polyglot/server/). The capability evidence below
applies only where the selected runtime advertises the required contract.

The current self-hosted Server floor advertises worker protocol `1.13`. Python
uses its declared `1.1` baseline, while Rust uses `1.2` and requires the
additive `1.8` query-task surface for replayed queries. Runtime discovery, not a
Server patch-number guess, decides whether a client may connect. See
[Version Compatibility](/docs/compatibility/).

## Capability and SDK floors

“Service mode” means either Cloud or a self-hosted Server owns the remote
runtime. “Embedded” means a Laravel application owns the runtime in process.
The SDK column deliberately records differences; a blank or limited SDK is not
implied to have parity.

| Capability | Current 2.0 contract and first-party floor | Explicit 2.0 evidence |
| --- | --- | --- |
| Workflows | Remote PHP, Python, and Rust workers author deterministic workflows; embedded Laravel authoring uses the Workflow package. | [Workflow authoring](/docs/defining-workflows/workflows/), [PHP SDK](/docs/polyglot/php/), [Python SDK](/docs/polyglot/python/), [Rust SDK](/docs/polyglot/rust/) |
| Activities and services | The embedded engine and all three service-mode SDKs author activities. Rust workflows and activities run in first-party worker services; Python and PHP also expose first-party control/service clients. | [Activities](/docs/defining-workflows/activities/), [PHP SDK](/docs/polyglot/php/), [Activity execution](/docs/features/activity-execution-model/), [External execution](/docs/polyglot/external-execution/) |
| Signals | Durable, asynchronous mutation is available to PHP, Python, and Rust workflow surfaces at their current floors. | [Signals](/docs/features/signals/), [Python SDK](/docs/polyglot/python/), [Rust SDK](/docs/polyglot/rust/) |
| Queries | Read-only replay queries are supported. PHP, Python, and Rust expose query handlers/clients; Rust replayed query tasks require worker protocol `1.8` or newer. | [Queries](/docs/features/queries/), [Python SDK](/docs/polyglot/python/), [Rust SDK](/docs/polyglot/rust/) |
| Updates | PHP, Python, and Rust expose client and worker-handler update surfaces. Python declared validators use synchronous pre-accept validation when Server discovery advertises that exact contract: acceptance follows approval, while rejection, worker loss, timeout, and fenced completion fail explicitly. PHP and Rust do not expose validator authoring and declare no validators. | [Updates](/docs/features/updates/), [Python SDK](/docs/polyglot/python/), [Rust SDK](/docs/polyglot/rust/#workflow-updates) |
| Timers | Service-runtime-backed durable timers replay in PHP, Python, and Rust. | [Timers](/docs/features/timers/), [Rust SDK](/docs/polyglot/rust/) |
| Retries | Durable activity retry policy is recorded with the command. PHP, Python, and Rust expose activity retry options at the current floors. | [Failures and recovery](/docs/failures-and-recovery/), [Python SDK](/docs/polyglot/python/), [Rust SDK](/docs/polyglot/rust/) |
| Timeouts | Service-mode runtimes in Cloud and self-hosted Server enforce activity and workflow timeout families. Rust includes activity options and workflow execution/run start deadlines. | [Timeouts](/docs/features/timeouts/), [Rust SDK](/docs/polyglot/rust/) |
| Child workflows | PHP, Python, and Rust start and await durable children. Cross-language type identity is a stable string and child payloads use the shared envelope. | [Child workflows](/docs/features/child-workflows/), [Python SDK](/docs/polyglot/python/) |
| Deterministic parallel composition | PHP `all()`/`parallel()`, Python nested list-yield, and Rust `WorkflowContext::parallel()`/`join()` schedule activity, child-workflow, timer, mixed, and nested groups through ordinary commands. All three publish the shared group identity/path metadata and restore results in nested input order. | [Concurrency](/docs/features/concurrency/), [Python SDK](/docs/polyglot/python/#fan-out), [Rust SDK](/docs/polyglot/rust/#deterministic-parallel-groups) |
| <span id="durable-first-completion-selection-capability">Durable first-completion selection</span> | Embedded PHP and the PHP, Python, and Rust service SDKs start independent activity, child-workflow, timer, external-input wait, and nested-group members. One winner is persisted with stable member identity; non-winners continue and retain await/cancel handles. | [Concurrency](/docs/features/concurrency/#first-completion-selection), [Python SDK](/docs/polyglot/python/#first-completion-selection), [Rust SDK](/docs/polyglot/rust/#durable-first-completion-selection) |
| Saga compensation | PHP's Saga helpers, Python `WorkflowContext.saga()`, and Rust `WorkflowContext::saga()` register durable compensations after forward success and unwind sequentially in reverse order by default. Python and Rust stop at the first compensation failure and preserve the initiating plus compensation failures; PHP additionally exposes opt-in parallel and continue-on-error policies. | [Sagas](/docs/features/sagas/), [Python SDK](/docs/polyglot/python/#saga-compensation), [Rust SDK](/docs/polyglot/rust/#saga-compensation) |
| Cancellation | Cooperative cancellation is a durable lifecycle command with selected-run safety and typed outcomes. PHP, Python, and Rust clients expose it. | [Cancel and terminate](/docs/features/cancel-and-terminate/), [Rust SDK](/docs/polyglot/rust/) |
| Termination | Forced termination is separate from cancellation and is exposed through Cloud and self-hosted Server service runtimes, CLI, PHP, Python, and Rust control surfaces. | [Cancel and terminate](/docs/features/cancel-and-terminate/), [Server API](/docs/polyglot/server-api-reference/) |
| Side effects | PHP, Python, and Rust record non-deterministic values exactly once and decode the recorded value on replay. | [Side effects](/docs/features/side-effects/), [Python SDK](/docs/polyglot/python/), [Rust SDK](/docs/polyglot/rust/) |
| Workflow Streams | PHP, Python, and Rust expose typed list, describe, offset subscription/resume, append, close, and error operations for Server-owned run-scoped output streams. All three author replay-safe emits from a durable command identity. Python resolves external payloads with its configured storage driver; PHP and Rust preserve opaque references. | [Workflow Streams](/docs/polyglot/workflow-streams/), [exact SDK matrix](/workflow-stream-capabilities.json), [runtime scenarios](/platform-conformance/workflow-stream-runtime-scenarios.json) |
| Version markers | PHP, Python, and Rust expose durable version markers for compatible code evolution. | [Versioning](/docs/features/versioning/), [Python SDK](/docs/polyglot/python/), [Rust SDK](/docs/polyglot/rust/) |
| Deterministic replay | PHP, Python, and Rust workflow workers reconstruct decisions from durable history and report typed non-determinism rather than re-running external work. | [Execution guarantees](/docs/constraints/execution-guarantees/), [Platform conformance](/docs/platform-conformance/), [Rust SDK](/docs/polyglot/rust/) |
| Schedules | Cloud and self-hosted Server service runtimes own durable schedules. PHP, Python, and CLI expose schedule operations. Rust does not claim a schedule-management API. | [Schedules](/docs/features/schedules/), [CLI reference](/docs/polyglot/cli-reference/), [Python SDK](/docs/polyglot/python/) |
| Namespaces | Service-mode runtimes are namespace-scoped. PHP/Python clients and CLI manage namespaces where the selected runtime exposes that operation; Rust workers/clients target a namespace but do not claim namespace administration at the current floor. | [Namespace, auth, and workers](/docs/polyglot/namespace-auth-workers/), [Server API](/docs/polyglot/server-api-reference/) |
| Search attributes | Cloud and self-hosted Server service runtimes index typed search attributes. PHP and Python expose authoring/control surfaces; CLI and operator APIs expose structured discovery and filtering. | [Search attributes](/docs/features/search-attributes/), [Python SDK](/docs/polyglot/python/) |
| Worker compatibility | SDKs register runtime, SDK version, build ID, supported types, protocol version, and capacity; the server publishes accepted versions and routing facts. | [Compatibility](/docs/compatibility/), [Worker compatibility and routing](/docs/polyglot/worker-compatibility-routing/) |
| Codec interoperability | PHP, Python, and Rust use the public `codec` + `blob` envelope and one fixed recursive Avro Value schema. Named branches preserve integers versus doubles, text versus bytes, booleans versus integers, and lists versus maps. | [Avro Value protocol](/docs/polyglot/avro-value-protocol/), [Worker protocol](/docs/polyglot/worker-protocol/), [Rust SDK](/docs/polyglot/rust/) |
| Diagnostics | Service runtimes and CLI publish version, protocol, worker, task-queue, replay, history, typed failure, and repair facts as JSON. Managed Waterline, a separately deployed self-hosted service, or the embedded package presents evidence from its owning runtime. | [Monitoring](/docs/monitoring/), [CLI reference](/docs/polyglot/cli-reference/), [Waterline operator API](/docs/waterline-operator-api/) |
| Agent tooling | Discover -> Change -> Run -> Diagnose -> Repair is available through public manifests, schemas, HTTP operations, CLI JSON, SDK clients, typed history/diagnostics, and safe mutations. MCP is one optional interface, not the definition. | [Agent tooling contract](/docs/agent-tooling-contract/), [Agent operating loop](/docs/agent-operating-loop/) |

## Payload interoperability boundary

Cross-language workflow and activity calls do not pass serialized PHP objects,
Python pickles, or Rust implementation types. They pass registered string type
names and a public payload envelope. With `avro`, each first-party SDK uses the
official language implementation and the same fixed Value schema; decoded
maps, lists, strings, bytes, integers, doubles, booleans, and nulls preserve
their primitive type. A
language-specific class is reconstructed only inside its owning SDK.

That contract applies to workflow input and result, child workflows, activity
input and result, signals, queries, updates, and external execution. Deployments
must still verify the codecs advertised by `GET /api/cluster/info` before
admitting a worker.

## Release and maturity boundary

The platform contracts indexed here are the stable 2.0 product surface.
Use the [AI-agent evaluator](/docs/ai-agent-workflow-engine/) for a concise
fit decision.
