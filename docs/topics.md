---
sidebar_position: 2.5
title: Topics
description: Find Durable Workflow v2 docs by task, operator concern, or integration surface.
tags:
  - discoverability
  - reference
  - operations
keywords:
  - durable workflow topics
  - workflow docs by task
  - operator docs
  - v2 reference
---

# Topics

Use this page when you know the task or operator concern, but not the package or
page name. Durable Workflow v2 has several product surfaces: the Laravel
workflow engine, the standalone server, the CLI, the Python SDK, Waterline, and
the sample app. The links below group those surfaces by job.

## Start Or Author Workflows

- [Getting Started](./getting-started.md) - install v2 and run the first workflow.
- [Workflows](./defining-workflows/workflows.md) - define a workflow class.
- [Activities](./defining-workflows/activities.md) - move non-deterministic work out of replay.
- [Starting Workflows](./defining-workflows/starting-workflows.md) - start runs through the Laravel API.
- [Workflow Authoring API Reference](./defining-workflows/workflow-authoring-reference.md) - look up exact v2 PHP facade signatures, message-stream methods, and replay rules.
- [Message Streams](./features/message-streams.md) - receive repeated messages through `inbox()` and publish ordered replies through `outbox()`.

## Run And Operate

- [Search and Navigation](./search-and-navigation.md) - map common query phrases to the smallest useful guide.
- [Self-Hosting Deployments](./deployment.md) - deploy the runtime and its dependencies.
- [Monitoring](./monitoring.md) - choose between Waterline durable state and runtime telemetry.
- [Version Compatibility](./compatibility.md) - understand which protocol manifests and component versions are compatible.
- [Failures and Recovery](./failures-and-recovery.md) - recover failed, stuck, or interrupted work.
- [Support Boundaries](./support.md) - know which behaviors are product contracts.

## Control Plane And Polyglot

- [Server](./polyglot/server.md) - use the standalone HTTP control plane.
- [Server API Reference](./polyglot/server-api-reference.md) - call exact HTTP control-plane and worker-plane routes.
- [Namespace, Auth, And Worker Registration](./polyglot/namespace-auth-workers.md) - align namespace headers, role-scoped credentials, and worker registration.
- [Embedded to Server Migration](./polyglot/embedded-to-server.md) - move from Laravel-embedded execution to server mode.
- [CLI](./polyglot/cli.mdx) - install and configure `dw`.
- [CLI Command Reference](./polyglot/cli-reference.md) - script exact command shapes and output modes.
- [Python SDK](./polyglot/python.md) - start, observe, signal, and run workers from Python.
- [CLI and Python Parity](./polyglot/cli-python-parity.md) - compare the same control-plane operations across clients.

## External Execution And Ingress

- [External Execution Surface](./polyglot/external-execution.md) - use bounded external workers, bridge adapters, and AI-operable handlers.
- [Worker Protocol](./polyglot/worker-protocol.md) - implement polling, leasing, heartbeats, and task results.
- [Task Queue Admission](./polyglot/task-queue-admission.md) - keep worker queues bounded and observable.
- [Webhooks](./features/webhooks.md) - receive HTTP ingress and control-plane commands.
- [Sample App](./sample-app.md) - see a Laravel consumer app wired to current v2 patterns.

## Reliability Patterns

- [Signals](./features/signals.md), [Updates](./features/updates.md), and [Queries](./features/queries.md) - choose the right command type.
- [Timers](./features/timers.md), [Condition Waits](./features/condition-waits.md), and [Timeouts](./features/timeouts.md) - wait without holding a process.
- [Continue As New](./features/continue-as-new.md) - keep history bounded while preserving run handoff semantics.
- [Sagas](./features/sagas.md) - compensate partially completed work.
- [Cancel and Terminate](./features/cancel-and-terminate.md) - stop workflows intentionally and inspect the outcome.

## AI And Automation

- [AI-Assisted Development](./ai-assisted-development.md) - use stable contracts for code generation and agents.
- [Agent Operating Loop](./agent-operating-loop.md) - give agents a repeatable discover, change, run, diagnose, and report loop.
- [MCP Workflow Surface](./mcp-workflows.md) - expose sample-app workflows to AI clients through structured tools.
- [Agent Tooling Contract](./agent-tooling-contract.md) - align MCP tools, CLI JSON, server diagnostics, Waterline exports, and SDK fixtures.
- [External Execution Surface](./polyglot/external-execution.md) - expose machine-readable task and result envelopes.
- [CLI and Python Parity](./polyglot/cli-python-parity.md) - share request fixtures across automation surfaces.
