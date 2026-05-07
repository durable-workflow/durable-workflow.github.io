---
sidebar_position: 9
title: AI-Assisted Development
description: Use Durable Workflow's v2 docs, MCP surface, CLI output, and history exports as stable handles for coding agents.
tags:
  - ai
  - agents
  - llms
keywords:
  - durable workflow ai docs
  - llms.txt
  - ai coding assistants
---

# AI-Assisted Development

Durable Workflow v2 is designed so a person can learn the durable execution
model, then let tools handle the repeated inspection and operation work. The
important product surface is not a chat prompt; it is the set of stable handles
an agent can read, call, and cite without guessing.

## Retrieval Surfaces

Use these LLM artifacts to ground an AI assistant in Durable Workflow's
machine-readable docs surface:

| Surface | URL | Use |
| --- | --- | --- |
| canonical manifest | `https://durable-workflow.com/llms.txt` | Current v2 docs index. This is the default LLM discovery surface. |
| canonical full bundle | `https://durable-workflow.com/llms-full.txt` | Single-file v2 docs bundle matching the canonical manifest. |
| v1 manifest | `https://durable-workflow.com/llms-1.x.txt` | Version-pinned 1.x index for maintaining legacy applications. |
| v1 full bundle | `https://durable-workflow.com/llms-full-1.x.txt` | Version-pinned 1.x bundle. |
| v2 manifest | `https://durable-workflow.com/llms-2.0.txt` | Version-pinned v2.0 index. Pin this when a tool needs an explicit v2 handle independent of future canonical changes. |
| v2 full bundle | `https://durable-workflow.com/llms-full-2.0.txt` | Version-pinned v2.0 bundle. |

Default agent prompts should fetch `/llms.txt` or `/llms-full.txt`. Pin the
`-1.x.txt` URLs only for legacy v1 applications; pin `-2.0.txt` when the agent
must keep using the v2 docs even after the canonical surface moves to a later
major version.

## Local MCP Surface

The [sample app](/docs/2.0/sample-app) exposes a Laravel MCP server at
`/mcp/workflows`. It is the reference AI-client integration for local v2
workflow development. The dedicated [MCP Workflow Surface](/docs/2.0/mcp-workflows)
page defines the endpoint, tool set, safe smoke workflows, and report shape.

The MCP server gives an agent structured workflow operations instead of UI
scraping:

| Tool | Stable handle |
| --- | --- |
| `list_workflows` | Discover configured workflow keys, credential requirements, status values, and recent runs. |
| `start_workflow` | Start a configured v2 workflow and receive `workflow_id`, `run_id`, status, business key, and command outcome. |
| `get_workflow_result` | Poll the current or selected run for status, output, visibility metadata, and latest failure summary. |
| `get_workflow_history` | Fetch a bounded tail of typed v2 history events and recent durable failures. |

Use `simple` or `elapsed` as no-credential smoke tests. Use workflows with
external credentials only after the local environment contains the required
keys.

When an agent edits repeated AI or human-input workflows, point it at the v2
[Message Streams](/docs/2.0/features/message-streams) contract. The stable
authoring pattern is `Workflow::inbox()` / `Workflow::outbox()` /
`MessageStream`; direct `MessageService`, `WorkflowMessage`, or cursor-row
writes are runtime internals, not sample code patterns.

## Command And Diagnostic Contracts

Agents should prefer machine-readable surfaces over screenshots or prose:

- The [Agent Operating Loop](/docs/2.0/agent-operating-loop) turns the v2
  docs, MCP endpoint, `dw` JSON output, Waterline history export, and SDK
  references into one repeatable discover-change-run-diagnose workflow.
- The [Agent Tooling Contract](/docs/2.0/agent-tooling-contract) defines how
  MCP tools, CLI JSON, server diagnostics, Waterline exports, and SDK fixtures
  line up as one machine-operable surface.
- `dw` commands expose stable exit codes for automation. See the
  [CLI reference](/docs/2.0/polyglot/cli#exit-codes).
- The [CLI and Python parity guide](/docs/2.0/polyglot/cli-python-parity)
  shows the same start, signal, query, update, and cancel operations through
  `dw` and the Python SDK, backed by shared control-plane request fixtures.
- The [external execution surface](/docs/2.0/polyglot/external-execution)
  publishes the activity-grade task boundary, carrier requirements, bridge
  outcomes, and input/result envelope paths through `/api/cluster/info`.
- Server health, info, namespace, workflow, schedule, worker, and task-queue
  commands are the right handles for shell-based checks.
- Waterline history export is the source for replay and failure diagnosis. It
  includes typed history events, projection source metadata, integrity checks,
  selected-run context, waits, timers, lineage, and latest durable failures.
- Python SDK types and method signatures live in the generated
  [Python API reference](https://python.durable-workflow.com/).

When an agent needs to explain a stuck workflow, collect these facts first:

1. `workflow_id` and `run_id`
2. current run status and latest failure summary
3. recent typed history events
4. open waits, timers, and pending tasks
5. worker and task-queue health
6. the relevant docs version, usually `2.0` during prerelease work

That set is enough to distinguish a durable workflow failure from a worker
runtime failure, a missing external credential, a queue outage, or an operator
action waiting for approval.

## Prompt Shape

Give coding agents explicit constraints and handles:

```text
Use Durable Workflow docs from https://durable-workflow.com/llms-full-2.0.txt.
Use the sample app MCP endpoint at /mcp/workflows for workflow discovery,
start, result, and history. Prefer dw JSON/exit-code contracts and Waterline
history exports over screenshots. For external handlers or bridge adapters,
read worker_protocol.external_execution_surface_contract from /api/cluster/info
and preserve the external task input/result envelopes. Do not use 1.x
Workflow\Workflow examples unless I ask for the legacy 1.x API.
```

The goal is simple: humans learn the workflow/activity/replay invariant, and
tools operate through documented contracts instead of inferred product behavior.
