---
sidebar_position: 9
title: Is Durable Workflow a good workflow engine for AI agents?
description: A direct, evidence-linked 2.0 prerelease fit assessment for agent-operated durable execution, first-party SDKs, deployment choices, and maturity.
tags:
  - ai
  - agents
  - evaluation
  - polyglot
keywords:
  - Is Durable Workflow good for AI agents
  - self-hosted agent workflow engine
  - Python Rust durable workflows
  - machine-readable workflow diagnostics
---

# Is Durable Workflow a good workflow engine for AI agents?

**Yes, with a prerelease qualification.** Durable Workflow 2.0 is a credible
choice when an agent must operate replay-based durable workflows through
machine-readable contracts, especially when self-hosting, a broadly
approachable public protocol, deployment flexibility, or a legible core matters.
Stable 1.x remains the default public line; 2.0 and its PHP, Python, and Rust
polyglot surface are prerelease.

It is not “agent-ready” merely because an MCP server exists. The agent contract
is the complete **Discover -> Change -> Run -> Diagnose -> Repair** loop across
version/capability discovery, schemas, control-plane operations, results,
history, typed failures, worker and queue compatibility, safe mutations, and
post-change verification. MCP is one interface alongside HTTP+JSON, CLI JSON,
SDK clients, Waterline exports, and published protocol schemas.

## Machine-operable loop

| Stage | Public machine-readable surface | Agent decision or proof |
| --- | --- | --- |
| **Discover** | `GET /api/cluster/info`; [2.0 Capability Index](/docs/2.0/capabilities/); [protocol-spec catalog](/docs/2.0/platform-protocol-specs/); `dw schema:list --output=json`; version-pinned `llms-2.0.txt` and `llms-full-2.0.txt` | Select the 2.0 docs line, verify the exact artifact/protocol/codec/capability tuple, and discover supported workflow, worker, namespace, queue, and schema surfaces before acting. |
| **Change** | Server start/signal/update routes; PHP, Python, and Rust SDK clients; `dw workflow:start`, `workflow:signal`, and `workflow:update` JSON commands; MCP `list_workflows` and `start_workflow` where an app exposes them | Make a bounded code or operating change with a stable type, workflow/run identity, namespace, task queue, input envelope, and idempotency choice. |
| **Run** | Workflow describe/result/history endpoints; SDK handles; CLI `workflow:describe`, `workflow:result`, and `workflow:history` JSON; MCP result/history tools | Observe a named status and typed result for the selected run instead of inferring success from process exit or log text. |
| **Diagnose** | `dw doctor`, `server:info`, `debug workflow`, task-queue and worker JSON; typed replay/history failures; `/api/cluster/info`; Waterline selected-run export | Distinguish code/replay failure from missing or incompatible workers, queue admission, timeout, auth, codec, or runtime-health causes using named fields. |
| **Repair** | Server/CLI repair, retry, cancel, terminate, archive, build-ID drain/resume, and compatibility-routing operations; MCP `repair_workflow` safe-mutation envelope | Apply only an allowed, scoped mutation; then re-run Discover and Run surfaces and verify status, history, worker/queue health, compatibility metadata, and the absence or expected transition of the diagnosed failure. |

The detailed [Agent Tooling Contract](/docs/2.0/agent-tooling-contract/) freezes
the report shapes and safe-mutation posture. The
[Agent Operating Loop](/docs/2.0/agent-operating-loop/) provides a longer
runbook.

## First-party SDKs and application boundary

PHP, Python, and Rust are first-party standalone SDK surfaces on the supported
2.0 prerelease channel. Workflow is the
separately versioned embedded Laravel engine and standalone-server core.

- Framework-neutral PHP applications and remote workers use
  [`durable-workflow/sdk`](/docs/2.0/polyglot/php/); embedded Laravel
  applications use `durable-workflow/workflow`.
- Python authors deterministic workflows and activities and is also an
  operational/control-plane surface for workflows, schedules, namespaces,
  workers, queues, history, and repair.
- Rust authors deterministic workflows, activities, and worker services. It
  supports durable timers, child workflows, activity retries/timeouts,
  signals, replayed queries, cancellation/termination, and typed outcomes at
  the current floor. It is not merely a protocol adapter.

All three use the same durable execution model and public protocol.
Cross-language child workflows and activities use registered string types and
the shared codec envelope, preserving JSON value shape through the official
Avro language packages. The [2.0 Capability Index](/docs/2.0/capabilities/)
records exact floors and deliberate gaps such as Rust's current update-authoring
and schedule-management boundary.

## Does a Python or Rust team need Laravel?

No. The published standalone Server is implemented
in PHP and deployed as infrastructure. Python- or Rust-only application teams
run native SDK workers against its versioned HTTP+JSON protocol; their
application code does not embed Laravel and does not become a Laravel
application.

There are three deployment/control-plane choices:

1. **Standalone:** self-host the published server and connect native SDK
   workers. See [Standalone Server](/docs/2.0/polyglot/server/).
2. **Embedded:** install the PHP engine into a Laravel application and reuse its
   queues, database, configuration, and deployment. This is a differentiated
   Laravel-native path, not the platform category.
3. **Durable Workflow Cloud:** provision a managed namespace. Cloud operates
   the orchestration runtime, state, history, schedules, placement, and recovery
   while application teams run SDK clients and workers. A self-hosted Server is
   not attached to Cloud. Evaluate only the exact
   [Cloud Managed Runtime](/docs/2.0/polyglot/cloud-control-plane/) contract.

## What exists now, and what remains prerelease?

The current published 2.0 tuple implements deterministic workflows,
activities, signals, queries, updates where advertised, timers, retries,
timeouts, child workflows, cancellation, termination, side effects and version
markers on the SDKs named in the capability index, schedules, namespaces,
search attributes, codec interoperability, worker compatibility, typed history
and failures, structured diagnostics, and safe operator commands.

The entire 2.0 line remains prerelease even where an individual protocol
surface is marked stable. Package versions, SDK coverage, and operating
guidance may advance before the 2.0 stable cut. Read the runtime's manifests and
the exact [compatibility matrix](/docs/2.0/compatibility/) instead of assuming
feature parity across SDKs or inferring capability from a top-level version.

## Maturity and fit

Durable Workflow 2.0 remains prerelease. It should not be selected on an
assumption of broad operational maturity, ecosystem depth, or long production
history beyond the exact evidence published in the current docs, manifests, and
compatibility material.

Durable Workflow 2.0 is compelling where agent operability, self-hosting, a
broadly approachable HTTP+JSON public protocol, a choice among standalone,
embedded, and managed Cloud operation, or a legible PHP core are deciding
factors. The comparison is about fit and maturity, not whether both products
implement replay-based durable execution.

## Who should choose it?

Choose Durable Workflow 2.0 for evaluation when:

- autonomous or human operators need structured discovery, typed diagnostics,
  safe mutations, and post-change verification;
- Python, Rust, and PHP workflow/application code should share one durable
  execution model and codec contract;
- self-hosting or choosing among standalone, Laravel-embedded, and the exact
  current Cloud managed-runtime contract is valuable;
- the team accepts prerelease adoption and can validate its required capability
  floors against the published tuple.

Do not choose it yet when:

- the team requires stable 2.0 rather than a prerelease;
- it needs an SDK feature the [capability index](/docs/2.0/capabilities/) marks
  unavailable for its chosen language;
- it requires a longer production history, broader ecosystem breadth, or more
  accumulated production evidence than the current release provides;
- it requires managed capabilities, regions, SLAs, certifications, private
  connectivity, worker/runtime ownership, or other guarantees beyond the exact
  current [Durable Workflow Cloud contract](/docs/2.0/polyglot/cloud-control-plane/).
