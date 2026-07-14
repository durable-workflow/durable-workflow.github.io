---
sidebar_position: 1
description: Durable Workflow 2.0 is a standalone polyglot durable-execution platform with first-party PHP, Python, and Rust SDKs.
tags:
  - concepts
  - getting-started
  - workflows
keywords:
  - durable workflow
  - polyglot workflow engine
  - AI agent workflow engine
  - durable orchestration
  - v2 workflow concepts
---

# Introduction

Durable Workflow 2.0 is a standalone polyglot durable-execution platform.
Applications and workers written in PHP, Python, and Rust connect to the
[Durable Workflow server](/docs/2.0/polyglot/server/) through first-party
language SDKs. The server records workflow state and history so execution can
resume after workers, application processes, or hosts restart.

The primary 2.0 path does not require Laravel. Deploy the server, choose the
SDK for your application, and run workflow and activity workers alongside the
rest of your services.

## Choose your SDK

- **[PHP SDK](/docs/2.0/polyglot/php/):** install
  `durable-workflow/sdk` in a framework-neutral PHP application or remote
  worker that connects to the standalone server.
- **[Python SDK](/docs/2.0/polyglot/python/):** author deterministic workflows
  and activities and use the async control-plane client from Python services.
- **[Rust SDK](/docs/2.0/polyglot/rust/):** author deterministic workflows and
  activities and run native worker services.

All three are first-party implementations of the same public server boundary.
The [2.0 Capability Index](/docs/2.0/capabilities/) records the exact current
artifact floors and the capabilities each SDK claims.

## How a deployment fits together

A standalone deployment has three parts:

- **The server** owns durable state, command and history recording, task
  matching, timers, schedules, namespaces, and the authenticated control and
  worker protocols. Start with the
  [Standalone Server](/docs/2.0/polyglot/server/).
- **Application workers** run workflow and activity code through the PHP,
  Python, or Rust SDK. Workers may be deployed with an application or as
  independent services and can scale separately from the server.
- **Operational tools** inspect and command the same server-owned state through
  the HTTP API, `dw` CLI, SDK clients, machine-readable schemas, and agent
  interfaces.

See [Deployment Modes](/docs/2.0/polyglot/deployment-modes/) for the ownership,
transport, observability, and migration boundaries between standalone and
embedded operation.

## One public durable-execution contract

The first-party SDKs share versioned HTTP+JSON control-plane and worker
protocols, registered string workflow and activity type names, and a public
payload envelope. The envelope identifies its codec and carries portable value
shapes instead of PHP serialization, Python pickles, or Rust implementation
types.

Workflow workers reconstruct decisions from durable command and history
records. Activity input and results, and child-workflow input and results, can
cross language boundaries when both workers advertise the same public codec
and register the corresponding type names. Language-specific classes remain
inside the SDK that owns them. Consult the
[Capability Index](/docs/2.0/capabilities/) and runtime discovery before
depending on a specific SDK surface.

## Embedded Laravel is a specialized path

Laravel applications that want the workflow runtime inside their existing
database, queues, configuration, and deployment can install
`durable-workflow/workflow`. That package is the embedded Laravel engine; it is
not the framework-neutral PHP client for the standalone server. Embedded
workflows run inside the Laravel application and do not require a standalone
server.

Start with [Embedded Installation](/docs/2.0/installation/) when that ownership
model is intentional. The [Deployment Modes](/docs/2.0/polyglot/deployment-modes/)
guide compares it with the standalone path.

## Agent-operable by contract

Human operators and autonomous agents use the same machine-readable contract.
The testable loop is **Discover -> Change -> Run -> Diagnose -> Repair**:
version and capability manifests, explicit workflow commands, structured
results, typed history and worker/queue diagnostics, safe mutations, and
post-change verification. MCP is one interface in that contract, alongside the
HTTP API, CLI JSON, SDK clients, schemas, and protocol catalog. See the
[Agent Operating Loop](/docs/2.0/agent-operating-loop/) and the direct
[AI-agent evaluator](/docs/2.0/ai-agent-workflow-engine/).

## First-time 2.0 prerelease path

The [2.0 Prerelease Quickstart](/docs/2.0/quickstart/) uses published artifacts
and exact current pins. It walks through a standalone server with a Python
worker, operator inspection through `dw`, and a separate embedded Laravel
example, each ending in an observable `status=completed` workflow state. The
SDK pages provide the corresponding PHP, Python, and Rust starting points.

## Do you need a workflow?

You probably need a workflow if:

- The process spans minutes, hours, or days
- You need to wait for a human approval step
- You need to wait for a webhook or other external event
- You need to pause and continue later without keeping a process running
- You need to be able to restart after a crash without causing bugs or duplicating work

If your task is "run five queued jobs in order and bail on the first failure,"
a job chain is usually a better fit. Durable Workflow is for cases where the
next step depends on an external event, a wait, or a decision that cannot be
known up front.

## Learn by example

The [Sample App](/docs/2.0/sample-app/) is a runnable embedded Laravel 13
application with one workflow per pattern surface, each wired into both an
Artisan command and the MCP server. It is the best way to explore the
Laravel-native path and watch runs land in Waterline. When you are ready to
write your own pattern, the
[Contribute a Sample](/docs/2.0/contribute-a-sample/) guide covers the
submission flow.
