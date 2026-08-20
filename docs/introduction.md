---
sidebar_position: 1
description: Choose Durable Workflow Cloud, a self-hosted 2.0 Server, or embedded Laravel, then complete a first workflow with a first-party SDK.
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

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Introduction

Durable Workflow 2.0 keeps workflow state and history outside short-lived
application processes so PHP, Python, and Rust workers can resume safely after
a restart. If this is your first visit, take the
[2.0 Prerelease Quickstart](/docs/2.0/quickstart/) first: it gets one workflow
to `completed` before you enter the reference-heavy
[Capability Index](/docs/2.0/capabilities/).

## Choose a deployment model

### Service mode

Applications use a remote durable runtime through first-party SDKs. Choose who
operates that runtime:

- **[Durable Workflow Cloud](/docs/2.0/polyglot/cloud-control-plane/)** is the
  managed choice. Durable Workflow operates orchestration, persistence, and
  Managed Waterline; your team runs SDK clients and workers against its
  provisioned namespace. **Cloud users do not install or run Durable Workflow
  Server or a separate Waterline service.**
- **[Self-hosted Server](/docs/2.0/polyglot/server/)** gives your team the same
  service boundary while you deploy, secure, scale, back up, and upgrade the
  runtime. Waterline observation is a separate service you may deploy against
  the Server-owned namespace.

Both choices expose the same versioned HTTP+JSON control plane, worker
protocol, namespace model, and language-neutral payload envelope. See
[Deployment Modes](/docs/2.0/polyglot/deployment-modes/) for their ownership
boundaries.

### Embedded Laravel

Embedded mode is a separate deployment model for a Laravel application that
wants workflow state, queues, configuration, and operator tooling inside its
own infrastructure. It installs `durable-workflow/workflow` and does not
connect to Cloud or require a separate Server. The embedded Waterline package
reads that application-owned state in process.

Start with [Embedded Installation](/docs/2.0/installation/) only when that
in-application ownership model is intentional.

Laravel teams coming from stable v1—or reconsidering an existing 2.0 embedded
deployment—should use the
[Laravel adoption and runtime transition guide](/docs/2.0/laravel-adoption/)
to compare the executable embedded and PHP SDK paths before changing traffic.

## Choose a service-mode SDK

- **[PHP SDK](/docs/2.0/polyglot/php/):** install `durable-workflow/sdk` in a
  framework-neutral PHP application or remote worker.
- **[Python SDK](/docs/2.0/polyglot/python/):** author deterministic workflows
  and activities and use the async control-plane client. The
  <PythonPackageReleaseLink authority="qualified">compatibility-qualified Python
  release</PythonPackageReleaseLink> is selected by the same machine-readable
  tuple as the Server quickstart.
- **[Rust SDK](/docs/2.0/polyglot/rust/):** author deterministic workflows and
  activities and run native worker services.

All three are first-party implementations of the same public service boundary.
The [Client and Worker Capabilities](/docs/2.0/polyglot/cli-python-parity/)
guide makes supported and intentionally different client and worker surfaces
explicit.

## Your first completed workflow

The [Quickstart](/docs/2.0/quickstart/) states the goal, runtime choice,
prerequisites, time, and expected outcome up front. It keeps PHP, Python, and
Rust equally available while showing one runnable language path at a time.
Use the local self-hosted path for a source-free published-artifact exercise,
or use the Cloud onboarding values for a managed namespace without running
Server.

## How service mode fits together

A service-mode deployment has three parts:

- **The runtime** owns durable state, command and history recording, task
  matching, timers, schedules, namespaces, and authenticated protocols. Cloud
  operates it for managed namespaces; your team operates it when self-hosting.
- **Application workers** run workflow and activity code through the PHP,
  Python, or Rust SDK. They can deploy with an application or as independent
  services and scale separately from the runtime.
- **Clients and operational tools** start, inspect, and command the same
  runtime-owned state through SDK clients, the `dw` CLI, HTTP APIs,
  machine-readable schemas, Waterline, and agent interfaces.

## One public durable-execution contract

The first-party SDKs share registered string workflow and activity type names
and a public payload envelope. The envelope identifies its codec and carries
portable values instead of PHP serialization, Python pickles, or Rust
implementation types.

Workflow workers reconstruct decisions from durable command and history
records. Activity and child-workflow input and results can cross language
boundaries when workers advertise the same public codec and register matching
type names. Consult the [Capability Index](/docs/2.0/capabilities/) and runtime
discovery before depending on a specific SDK surface.

## Learn from the matching examples

- **Service mode and polyglot:** use the
  [Quickstart](/docs/2.0/quickstart/) and the PHP, Python, or Rust SDK guide.
- **Embedded Laravel:** use the [Sample App](/docs/2.0/sample-app/) gallery to
  explore Laravel-native workflow patterns and Waterline evidence.

The embedded gallery is not a universal starting point for Cloud or
self-hosted service-mode readers.

## Agent-operable by contract

Human operators and autonomous agents use the same machine-readable contract.
The testable loop is **Discover -> Change -> Run -> Diagnose -> Repair**:
version and capability manifests, explicit workflow commands, structured
results, typed history and worker/queue diagnostics, safe mutations, and
post-change verification. See the
[Agent Operating Loop](/docs/2.0/agent-operating-loop/) and the direct
[AI-agent evaluator](/docs/2.0/ai-agent-workflow-engine/).

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
