---
sidebar_position: 9.1
title: Agent Operating Loop
description: Give AI agents a stable v2 workflow for discovering, changing, running, and diagnosing Durable Workflow applications.
tags:
  - ai
  - agents
  - mcp
  - operations
keywords:
  - durable workflow agent loop
  - ai workflow debugging
  - mcp workflows
  - waterline history export
  - dw json output
---

# Agent Operating Loop

Durable Workflow v2 is easiest for agents to use when every step has a stable
handle. The loop below starts with the same invariant a human learns, then
switches to machine-readable contracts for discovery, execution, diagnosis, and
repair.

## 1. Pin The Docs Version

For current v2 work, the canonical bundle is the default:

```text
https://durable-workflow.com/llms-full.txt
```

Pin the v2 version-specific bundle when you want the URL itself to keep meaning
v2.0 across a future major bump:

```text
https://durable-workflow.com/llms-full-2.0.txt
```

Use the explicit 1.x pin when you want the URL itself to keep meaning 1.x
across a future major bump:

```text
https://durable-workflow.com/llms-full-1.x.txt
```

## 2. Discover The Local Workflow Surface

Start in the sample app's MCP endpoint when it is available:

```text
/mcp/workflows
```

See [MCP Workflow Surface](./mcp-workflows.md) for the reference tool contract,
safe smoke workflow keys, and agent report shape.

Call `list_workflows` first. The response tells the agent which workflows are
exposed, what credentials they need, which arguments they accept, and which
recent runs already exist. Use `simple` or `elapsed` for no-credential smoke
tests before touching examples that require external API keys.

If MCP is not available, use the CLI and server contracts instead:

```bash
dw server:info --output=json
dw workflow:list --output=json
dw task-queue:list --output=json
```

Those commands provide protocol versions, namespace context, workflow
visibility, and task-queue health without requiring UI scraping.

## 3. Make The Smallest Change

When editing workflow code, preserve the durable boundary:

- keep orchestration decisions in workflow methods
- put I/O, randomness, network calls, and external credentials in activities
- use signals, updates, queries, timers, and message streams instead of ad hoc
  tables or queue jobs
- keep repeated human or AI input on the
  [Message Streams](./features/message-streams.md) contract

That boundary matters more than the language surface. PHP workflow classes,
`dw`, the Python SDK, and external workers should all describe the same control
plane operations.

## 4. Run Through Structured Handles

Use the most specific handle available for the task:

| Task | Preferred handle |
| --- | --- |
| Start a local sample workflow | `start_workflow` through `/mcp/workflows` |
| Start or command a server workflow | `dw workflow:start`, `dw workflow:signal`, `dw workflow:update`, or SDK equivalents |
| Check compatibility | `dw server:info --output=json` and `/api/cluster/info` |
| Inspect queue health | `dw task-queue:describe <queue> --output=json` |
| Compare CLI and Python behavior | [CLI and Python Parity](./polyglot/cli-python-parity.md) |
| Implement a non-PHP worker | [Worker Protocol](./polyglot/worker-protocol.md) |
| Implement an external handler | [External Execution Surface](./polyglot/external-execution.md) |

Prefer JSON or JSONL outputs for agent loops. Terminal tables are for humans.

## 5. Diagnose Before Repairing

Collect facts before changing code or replaying commands:

```bash
dw doctor --output=json
dw server:info --output=json
dw debug workflow <workflow-id> --output=json
dw workflow:history <workflow-id> <run-id> --output=json
```

If Waterline is available, export the selected run history. The export includes
typed history events, selected-run context, waits, timers, lineage, projection
source metadata, integrity checks, and durable failures. Those facts let an
agent distinguish a workflow bug from an unavailable worker, missing
credential, task-queue outage, incompatible client, or pending operator action.

## 6. Report With Contracts

Agent reports should cite stable facts, not screenshots:

- docs version and LLM bundle used
- workflow id, run id, namespace, and task queue
- command or MCP tool called
- JSON status, exit code, or named failure reason
- recent typed history events and latest durable failure
- compatibility or protocol version from `server:info` or `/api/cluster/info`

That report shape is portable across local sample apps, standalone server
deployments, Python workers, and future client SDKs.

## Related Pages

- [AI-Assisted Development](./ai-assisted-development.md)
- [Agent Tooling Contract](./agent-tooling-contract.md)
- [MCP Workflow Surface](./mcp-workflows.md)
- [Sample App](./sample-app.md)
- [CLI Command Reference](./polyglot/cli-reference.md)
- [Worker Protocol](./polyglot/worker-protocol.md)
- [External Execution Surface](./polyglot/external-execution.md)
