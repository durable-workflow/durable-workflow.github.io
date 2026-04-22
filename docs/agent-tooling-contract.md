---
sidebar_position: 9.3
title: Agent Tooling Contract
description: Treat MCP tools, CLI JSON, server diagnostics, Waterline exports, and SDK fixtures as one machine-operable Durable Workflow v2 contract.
tags:
  - ai
  - agents
  - mcp
  - operations
keywords:
  - durable workflow agent tooling
  - ai tooling contract
  - mcp workflow diagnostics
  - machine readable workflow operations
---

# Agent Tooling Contract

Durable Workflow v2 keeps AI-assisted development boring by exposing product
facts through stable contracts. A tool should not infer workflow state from
HTML, parse logs as the source of truth, or guess which SDK behavior matches a
CLI command. It should read the docs version, discover the local surface, call
documented operations, and report named facts.

This page defines the contract shape that future MCP tools, local agents,
scripts, and SDKs should preserve.

## Contract Layers

| Layer | Stable handle | Contract expectation |
| --- | --- | --- |
| Docs retrieval | `llms-2.0.txt` and `llms-full-2.0.txt` | Agents pin the v2 docs bundle during prerelease work and cite the source page used. |
| Local discovery | `/mcp/workflows` `list_workflows` | The app-owned MCP allow-list names exposed workflow keys, required credentials, expected arguments, and smoke-test suitability. |
| Workflow operations | MCP `start_workflow`, `get_workflow_result`, `get_workflow_history`; `dw` JSON commands; SDK clients | Every client reports workflow id, run id, namespace, task queue, command status, and named failure fields without scraping a UI. |
| Server diagnostics | `/api/cluster/info`, `dw server:info --output=json`, `dw doctor --output=json`, `dw debug workflow --output=json` | Compatibility, protocol, task-queue, worker, and stuck-run facts are machine-readable and bounded. |
| Durable evidence | Waterline selected-run detail and history export | Replay, waits, timers, lineage, projection source, integrity checks, durable failures, and operator actionability come from typed state. |
| Cross-language parity | CLI/Python request fixtures and SDK tests | Shared control-plane operations keep their request shape aligned across languages. |

Each layer should be usable on its own. Together, they give an agent enough
context to make a small change, prove it, and explain the result.

## MCP Tool Design

New MCP tools should expose Durable Workflow concepts directly:

- Use product nouns such as workflow, run, task queue, schedule, history,
  failure, worker, namespace, and compatibility.
- Return stable identifiers and named status fields instead of prose-only
  summaries.
- Include bounded arrays and previews for history, failures, and payloads so a
  client can inspect them without downloading an unbounded trace.
- Separate discovery from mutation. A client should be able to ask what exists
  and what credentials are required before starting or commanding a workflow.
- Mark no-credential smoke workflows explicitly so agents can test local wiring
  without touching external services.
- Never include secret values, customer-specific hostnames, or account-specific
  credentials in tool descriptions or result metadata.

The sample app's `/mcp/workflows` endpoint is the reference local workflow
surface. Future project-specific MCP servers should keep the same posture:
configuration owns the allow-list, tools operate only the listed workflows, and
results cite durable workflow facts that a human can reproduce through `dw`,
Waterline, or an SDK.

## Command And SDK Parity

Automation should be able to move between clients without semantic drift:

| Operation family | Required parity signal |
| --- | --- |
| start, signal, update, query, cancel, terminate | CLI and SDK request bodies match the documented control-plane shape. |
| history, describe, list, result | Responses preserve stable identifiers, status names, timestamps, and failure fields. |
| task queues and workers | Capacity, leases, slots, compatibility, and worker ids remain structured facts. |
| external execution | Input and result envelopes stay language-neutral and carry named bridge outcomes. |

When adding a CLI command, SDK method, or MCP tool for a control-plane action,
prefer a shared fixture or documented JSON example that another client can
assert against. Human-friendly tables can exist, but JSON or JSONL is the
automation contract.

## Diagnosis Report Shape

When a tool explains a failed or stuck run, the report should include:

- docs version and source page used
- command, SDK method, or MCP tool called
- workflow id, run id, namespace, and task queue
- current status and latest durable failure summary
- recent typed history event names
- pending waits, timers, tasks, or external activity leases
- worker and task-queue compatibility facts when available
- named exit code, HTTP status, validation error, or blocked reason

That shape keeps reports portable across local Laravel apps, standalone server
deployments, Python workers, and future SDKs.

## Guardrails For Agents

Give agents permission to automate ceremony, not to bypass the durable model:

- Keep workflow orchestration deterministic.
- Put I/O, randomness, external API calls, and credentials in activities or
  external handlers.
- Use signals, updates, queries, schedules, timers, and message streams instead
  of ad hoc state tables for workflow control.
- Treat Waterline history export as evidence, not as a mutation API.
- Treat route lists, database internals, and framework-specific model rows as
  implementation details unless the public docs explicitly name them.

The invariant remains human-readable: workflows record durable decisions,
activities perform fallible work, and replay must be able to explain what
happened. The tooling contract gives agents stable handles for the rest.

## Related Pages

- [AI-Assisted Development](./ai-assisted-development.md)
- [Agent Operating Loop](./agent-operating-loop.md)
- [MCP Workflow Surface](./mcp-workflows.md)
- [CLI and Python Parity](./polyglot/cli-python-parity.md)
- [Server HTTP API Reference](./polyglot/server-api-reference.md)
- [Monitoring](./monitoring.md)
