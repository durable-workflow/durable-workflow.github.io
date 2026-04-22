---
sidebar_position: 9.2
title: MCP Workflow Surface
description: Use the sample app MCP server as the reference AI-client workflow surface for discovery, starts, results, and history.
tags:
  - ai
  - agents
  - mcp
  - sample-app
keywords:
  - durable workflow mcp
  - mcp workflow tools
  - sample app mcp server
  - ai client workflow discovery
---

# MCP Workflow Surface

The sample app exposes the reference Durable Workflow v2 MCP server at:

```text
/mcp/workflows
```

Use it when an AI client needs to inspect or operate a local workflow app
without scraping Waterline or guessing Laravel internals. The endpoint is a
structured development surface: it names the workflows the app chooses to
expose, describes credential requirements, starts runs, polls results, and
returns bounded history facts.

## Server Contract

The sample app registers the server from `routes/ai.php` and configures exposed
workflow keys in `config/workflow_mcp.php`. Treat that configuration as the
public allow-list for AI clients. A workflow is MCP-operable only when it is
listed there with enough metadata for a client to decide whether it can run the
workflow safely.

Each configured workflow should describe:

- a stable workflow key
- the workflow class behind that key
- required arguments and optional arguments
- credential requirements
- whether it is safe for no-credential local smoke tests
- output and history expectations that an agent can cite

Keep secrets out of tool descriptions. Say that a workflow requires a
credential, but do not include the credential value or account-specific details.

## Tools

The reference server exposes four workflow tools:

| Tool | Use |
| --- | --- |
| `list_workflows` | Discover configured workflow keys, descriptions, credential requirements, v2 statuses, and recent runs. |
| `start_workflow` | Start a configured workflow and return `workflow_id`, `run_id`, status, business key, and command outcome. |
| `get_workflow_result` | Poll the current or selected run for status, output, visibility metadata, and latest failure summary. |
| `get_workflow_history` | Fetch a bounded tail of typed v2 history events and recent durable failures. |

Call `list_workflows` before any start. It is the agent's compatibility check:
the response tells the client which workflow keys exist and whether a workflow
can run in the current environment.

## Safe Agent Loop

Use no-credential workflows first:

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

The `simple` and `elapsed` workflow keys are the preferred smoke surfaces. Use
credentialed examples only after `list_workflows` reports the requirement and
the local environment has the needed keys.

## Report Shape

An AI client should report MCP results with stable facts:

- docs version used, usually `2.0` during prerelease work
- MCP endpoint and tool name
- workflow key, `workflow_id`, and `run_id`
- status and latest failure summary
- bounded history event names and timestamps
- whether the run used a no-credential smoke workflow or a credentialed example

Those facts line up with the CLI, Python SDK, and Waterline history-export
surfaces, so a human can reproduce the same run from another client.

## Related Pages

- [AI-Assisted Development](./ai-assisted-development.md)
- [Agent Operating Loop](./agent-operating-loop.md)
- [Agent Tooling Contract](./agent-tooling-contract.md)
- [Sample App](./sample-app.md)
- [CLI and Python Parity](./polyglot/cli-python-parity.md)
- [Message Streams](./features/message-streams.md)
