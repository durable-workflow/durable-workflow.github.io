---
sidebar_position: 2
title: 2.0 Capability Index
description: Authoritative Durable Workflow 2.0 prerelease capability, first-party SDK, protocol, and exact public artifact floor index.
tags:
  - capabilities
  - compatibility
  - polyglot
  - prerelease
keywords:
  - Durable Workflow 2.0 capabilities
  - PHP Python Rust SDK
  - workflow engine feature matrix
  - exact feature floors
---

# Durable Workflow 2.0 Capability Index

This is the authoritative capability index for the explicit 2.0 prerelease
docs line. Stable 1.x remains the default public documentation and release
line. Every evidence link on this page is an explicit `/docs/2.0/` page; no
unversioned or 1.x page establishes a 2.0 claim.

## Current installable floor

“Floor” on this page means the minimum member of the current installable public
artifact tuple for which the indexed claim is made. It is not an assertion that
every feature first appeared in that release.

| Surface | Exact current floor | Role in this index |
| --- | --- | --- |
| CLI | `%%artifact.cliVersion%%` | Machine-readable operator and diagnostic client. |
| PHP SDK | `%%artifact.phpSdkVersion%%` | Framework-neutral `durable-workflow/sdk` client and remote workflow/activity worker for the standalone server. |
| Embedded Laravel engine | `%%artifact.workflowVersion%%` | `durable-workflow/workflow` authoring runtime, persistence engine, queues, replay, and server-hosted core. |
| Python SDK | `%%artifact.pythonSdkVersion%%` | First-party deterministic workflow/activity SDK plus operational and control-plane client. Requires Python 3.10 or newer. |
| Rust SDK | `%%artifact.rustSdkVersion%%` | First-party deterministic workflow/activity SDK, worker service, and control-plane client. Requires Rust 1.86 or newer. |
| Server | `%%artifact.serverVersion%%` | PHP-implemented, language-neutral runtime for the v2 control-plane and worker protocols. |
| Waterline | `%%artifact.waterlineVersion%%` | Embedded-runtime observability and selected-run history export. |

PHP, Python, and Rust are the three first-party standalone SDK languages. They share
stable string type names, one durable command/history model, control plane
version `2`, worker protocol major `1`, and the public payload envelope. Rust is
a workflow SDK: it runs deterministic workflow code, activities, and worker
services, not only raw protocol calls. The framework-neutral PHP SDK is
versioned independently from the embedded Laravel engine. Python combines workflow authoring with
namespace, schedule, worker, queue, history, repair, and other operational
client surfaces.

The current server advertises worker protocol `1.13`. Python uses its declared
`1.1` baseline, while Rust uses `1.2` and requires the additive `1.8` query-task
surface for replayed queries. Runtime discovery, not a server patch-number
guess, decides whether a client may connect. See
[Version Compatibility](/docs/2.0/compatibility/).

## Capability and SDK floors

“Platform” means the standalone/embedded durable model exposes the capability.
The SDK column deliberately records differences; a blank or limited SDK is not
implied to have parity.

| Capability | Current 2.0 contract and first-party floor | Explicit 2.0 evidence |
| --- | --- | --- |
| Workflows | Remote PHP `%%artifact.phpSdkVersion%%`, Python `%%artifact.pythonSdkVersion%%`, and Rust `%%artifact.rustSdkVersion%%` workers author deterministic workflows; embedded Laravel authoring uses `%%artifact.workflowVersion%%`. | [Workflow authoring](/docs/2.0/defining-workflows/workflows/), [PHP SDK](/docs/2.0/polyglot/php/), [Python SDK](/docs/2.0/polyglot/python/), [Rust SDK](/docs/2.0/polyglot/rust/) |
| Activities and services | The embedded engine and all three standalone SDKs author activities. Rust workflows and activities run in first-party worker services; Python and PHP also expose first-party control/service clients. | [Activities](/docs/2.0/defining-workflows/activities/), [PHP SDK](/docs/2.0/polyglot/php/), [Activity execution](/docs/2.0/features/activity-execution-model/), [External execution](/docs/2.0/polyglot/external-execution/) |
| Signals | Durable, asynchronous mutation is available to PHP, Python, and Rust workflow surfaces at their current floors. | [Signals](/docs/2.0/features/signals/), [Python SDK](/docs/2.0/polyglot/python/), [Rust SDK](/docs/2.0/polyglot/rust/) |
| Queries | Read-only replay queries are supported. PHP, Python `%%artifact.pythonSdkVersion%%`, and Rust `%%artifact.rustSdkVersion%%` expose query handlers/clients; Rust replayed query tasks require worker protocol `1.8` or newer. | [Queries](/docs/2.0/features/queries/), [Python SDK](/docs/2.0/polyglot/python/), [Rust SDK](/docs/2.0/polyglot/rust/) |
| Updates | The runtime records accepted durable updates. PHP and Python `%%artifact.pythonSdkVersion%%` author update handlers; synchronous Python pre-accept validators remain capability-discovery-gated. Rust `%%artifact.rustSdkVersion%%` does not claim update authoring. | [Updates](/docs/2.0/features/updates/), [Python SDK](/docs/2.0/polyglot/python/) |
| Timers | Server-backed durable timers replay in PHP, Python `%%artifact.pythonSdkVersion%%`, and Rust `%%artifact.rustSdkVersion%%`. | [Timers](/docs/2.0/features/timers/), [Rust SDK](/docs/2.0/polyglot/rust/) |
| Retries | Durable activity retry policy is recorded with the command. PHP, Python, and Rust expose activity retry options at the current floors. | [Failures and recovery](/docs/2.0/failures-and-recovery/), [Python SDK](/docs/2.0/polyglot/python/), [Rust SDK](/docs/2.0/polyglot/rust/) |
| Timeouts | Activity and workflow timeout families are server-enforced. Rust `%%artifact.rustSdkVersion%%` includes activity options and workflow execution/run start deadlines. | [Timeouts](/docs/2.0/features/timeouts/), [Rust SDK](/docs/2.0/polyglot/rust/) |
| Child workflows | PHP, Python, and Rust start and await durable children. Cross-language type identity is a stable string and child payloads use the shared envelope. | [Child workflows](/docs/2.0/features/child-workflows/), [Python SDK](/docs/2.0/polyglot/python/) |
| Cancellation | Cooperative cancellation is a durable lifecycle command with selected-run safety and typed outcomes. PHP, Python, and Rust clients expose it. | [Cancel and terminate](/docs/2.0/features/cancel-and-terminate/), [Rust SDK](/docs/2.0/polyglot/rust/) |
| Termination | Forced termination is separate from cancellation and is exposed through server, CLI, PHP, Python, and Rust control surfaces. | [Cancel and terminate](/docs/2.0/features/cancel-and-terminate/), [Server API](/docs/2.0/polyglot/server-api-reference/) |
| Side effects | PHP, Python, and Rust `%%artifact.rustSdkVersion%%` record non-deterministic values exactly once and decode the recorded value on replay. | [Side effects](/docs/2.0/features/side-effects/), [Python SDK](/docs/2.0/polyglot/python/), [Rust SDK](/docs/2.0/polyglot/rust/) |
| Version markers | PHP, Python, and Rust `%%artifact.rustSdkVersion%%` expose durable version markers for compatible code evolution. | [Versioning](/docs/2.0/features/versioning/), [Python SDK](/docs/2.0/polyglot/python/), [Rust SDK](/docs/2.0/polyglot/rust/) |
| Deterministic replay | PHP, Python, and Rust workflow workers reconstruct decisions from durable history and report typed non-determinism rather than re-running external work. | [Execution guarantees](/docs/2.0/constraints/execution-guarantees/), [Platform conformance](/docs/2.0/platform-conformance/), [Rust SDK](/docs/2.0/polyglot/rust/) |
| Schedules | Server `%%artifact.serverVersion%%` owns durable schedules; PHP, Python `%%artifact.pythonSdkVersion%%`, and CLI `%%artifact.cliVersion%%` expose schedule operations. Rust `%%artifact.rustSdkVersion%%` does not claim a schedule-management API. | [Schedules](/docs/2.0/features/schedules/), [CLI reference](/docs/2.0/polyglot/cli-reference/), [Python SDK](/docs/2.0/polyglot/python/) |
| Namespaces | The standalone server is namespace-scoped. PHP/Python clients and CLI manage namespaces; Rust workers/clients target a namespace but do not claim namespace administration at the current floor. | [Namespace, auth, and workers](/docs/2.0/polyglot/namespace-auth-workers/), [Server API](/docs/2.0/polyglot/server-api-reference/) |
| Search attributes | Server `%%artifact.serverVersion%%` indexes typed search attributes. PHP and Python expose authoring/control surfaces; CLI and operator APIs expose structured discovery and filtering. | [Search attributes](/docs/2.0/features/search-attributes/), [Python SDK](/docs/2.0/polyglot/python/) |
| Worker compatibility | SDKs register runtime, SDK version, build ID, supported types, protocol version, and capacity; the server publishes accepted versions and routing facts. | [Compatibility](/docs/2.0/compatibility/), [Worker compatibility and routing](/docs/2.0/polyglot/worker-compatibility-routing/) |
| Codec interoperability | PHP, Python, and Rust use the public `codec` + `blob` envelope. The Avro implementation uses official `apache/avro`, `avro`, and `apache-avro` language packages. Cross-language child/activity inputs and results retain JSON value shape through the generic wrapper. | [Passing data](/docs/2.0/defining-workflows/passing-data/), [Worker protocol](/docs/2.0/polyglot/worker-protocol/), [Rust SDK](/docs/2.0/polyglot/rust/) |
| Diagnostics | Server and CLI publish version, protocol, worker, task-queue, replay, history, typed failure, and repair facts as JSON; Waterline exports selected-run durable evidence. | [Monitoring](/docs/2.0/monitoring/), [CLI reference](/docs/2.0/polyglot/cli-reference/), [Waterline operator API](/docs/2.0/waterline-operator-api/) |
| Agent tooling | Discover -> Change -> Run -> Diagnose -> Repair is available through public manifests, schemas, HTTP operations, CLI JSON, SDK clients, typed history/diagnostics, and safe mutations. MCP is one optional interface, not the definition. | [Agent tooling contract](/docs/2.0/agent-tooling-contract/), [Agent operating loop](/docs/2.0/agent-operating-loop/) |

## Payload interoperability boundary

Cross-language workflow and activity calls do not pass serialized PHP objects,
Python pickles, or Rust implementation types. They pass registered string type
names and a public payload envelope. With `avro`, each first-party SDK uses the
official language implementation and the same generic wrapper; decoded maps,
lists, strings, numbers, booleans, and nulls preserve their value shape. A
language-specific class is reconstructed only inside its owning SDK.

That contract applies to workflow input and result, child workflows, activity
input and result, signals, queries, updates, and external execution. Deployments
must still verify the codecs advertised by `GET /api/cluster/info` before
admitting a worker.

## Release and maturity boundary

The platform contracts indexed here are public, but the product line remains
2.0 prerelease and the installable package versions above can advance before
the stable cut. Stable 1.x is still the default public line.
Use the [AI-agent evaluator](/docs/2.0/ai-agent-workflow-engine/) for a concise
fit decision.
