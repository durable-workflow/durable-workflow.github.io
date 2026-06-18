---
sidebar_position: 9.2
title: MCP Workflow Surface
description: Use the sample app MCP server as the reference AI-client workflow surface for discovery, starts, diagnosis, repair, results, and history.
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

The reference server exposes six workflow tools:

| Tool | Use |
| --- | --- |
| `list_workflows` | Discover configured workflow keys, descriptions, credential requirements, v2 statuses, and recent runs. |
| `start_workflow` | Start a configured workflow and return `workflow_id`, `run_id`, status, business key, and command outcome. |
| `get_workflow_result` | Poll the current or selected run for status, output, visibility metadata, and latest failure summary. |
| `get_workflow_history` | Fetch a bounded tail of typed v2 history events and recent durable failures. |
| `diagnose_workflow` | Classify a selected run with structured facts, root cause, remediation, and next actions. |
| `repair_workflow` | Request the built-in v2 repair command and return a structured accepted, refused, or not-needed mutation result. |

Call `list_workflows` before any start. It is the agent's compatibility check:
the response tells the client which workflow keys exist and whether a workflow
can run in the current environment.

Discovery envelopes use the normative schema id
`durable-workflow.v2.mcp-discovery`. Agents can use it to recognize the
published tool list shape, parameter schemas, discovery hints, and
`payload_preview_limit_bytes` semantics before calling a tool.

## Tool Input Contract

The MCP tool schemas intentionally use Durable Workflow terms instead of
Laravel internals. Keep these fields stable when extending the sample app
server:

| Tool | Stable inputs |
| --- | --- |
| `list_workflows` | `show_recent`, `limit`, and optional `status` for recent-run discovery. |
| `start_workflow` | `workflow`, ordered `arguments`, optional `instance_id`, `business_key`, `visibility_labels`, `memo`, `search_attributes`, and `duplicate_start_policy`. |
| `get_workflow_result` | `workflow_id`, optional `run_id`, `include_recent_history`, and `history_limit`. |
| `get_workflow_history` | `workflow_id` or `run_id`, `limit`, and `include_payloads`. |
| `diagnose_workflow` | `workflow_id` or `run_id`, plus optional `history_limit`. |
| `repair_workflow` | `workflow_id` or `run_id`. |

Prefer `arguments` over the legacy `args` input for new agents. `arguments`
maps directly to the workflow `handle()` argument order, while `args` exists
only for older object-shaped callers.

Use caller-supplied `instance_id` only when an agent needs idempotency. Pair it
with `duplicate_start_policy=return_existing_active` when a repeated smoke run
should attach to the active workflow instead of failing as a duplicate.

## Tool Result Contract

Tool-result envelopes use the normative schema id
`durable-workflow.v2.mcp-tool-results`. Agents can use it to parse result
status, payload preview truncation, error fields, root-cause and remediation
objects, safe-mutation envelopes, and schema/version markers.

Agents should treat the following result fields as the durable handles for
cross-tool correlation:

| Tool | Stable result fields |
| --- | --- |
| `list_workflows` | `available_workflows`, `allow_fqcn`, `workflow_id_kind`, `run_id_kind`, `status_values`, and optional `recent_workflows`. |
| `start_workflow` | `workflow_id`, `run_id`, `workflow`, `workflow_class`, `workflow_type`, `status`, `running`, `business_key`, `duplicate_start_policy`, and `command`. |
| `get_workflow_result` | `found`, `workflow_id`, `run_id`, `current_run_id`, `current_run_is_selected`, `status`, `running`, `output`, `error`, visibility metadata, and timestamps. |
| `get_workflow_history` | `found`, `workflow_id`, `run_id`, `current_run_id`, `status`, `history_event_count`, `returned_event_count`, `events_are_most_recent`, `payloads_included`, `events`, and `failures`. |
| `diagnose_workflow` | `found`, `workflow_id`, `run_id`, `diagnosis`, `facts`, `latest_failure`, `recent_history`, `root_cause`, `remediation`, and `next_actions`. |
| `repair_workflow` | `found`, `workflow_id`, `run_id`, `accepted`, `status`, `mutation`, `command`, `remediation`, and `next_actions`. |

History payload previews are intentionally bounded. When `include_payloads` is
true, each event preview reports `payload_preview_limit_bytes`, `size_bytes`,
`preview_bytes`, and `truncated` so an agent can cite whether it saw the full
payload or only a preview.

## Failure And Remediation Taxonomy

`diagnose_workflow` is the machine-readable root-cause surface. Its
`root_cause` object uses the schema id
`durable-workflow.v2.agent-root-cause` and includes:

- `category`, such as `activity_failure`, `workflow_failure`,
  `task_repair_attention`, `waiting_for_signal`, `history_growth_attention`,
  `in_progress`, or `none`
- `source.kind` and `source.id` for the workflow, activity, wait, task queue,
  or history family that produced the classification
- `retryable`, `severity`, and `actionable`
- failure details such as `failure_category`, `exception_class`, and `handled`
  when a durable failure row exists

The companion `remediation` object uses the schema id
`durable-workflow.v2.agent-remediation`. It includes
`classification`, a short `summary`, `automatic_repair.tool`, and
`automatic_repair.allowed`, plus `next_actions` entries for the supported
follow-up commands. Agents should call `repair_workflow` only when
`automatic_repair.allowed` is true. Other classifications tell the agent to
wait, send expected input through the documented workflow command surface,
inspect history, change workflow or activity code, or plan Continue-As-New.

`repair_workflow` returns a `durable-workflow.v2.safe-mutation` envelope. The
`mutation.applied` field says whether a repair command was accepted, while
`command.outcome` distinguishes `repair_dispatched`, `repair_not_needed`, and
structured refusals such as a terminal or non-current run.

## Safe Agent Loop

Use no-credential workflows first:

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "diagnose_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "repair_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
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
- `root_cause.category` and `remediation.classification`
- whether `remediation.automatic_repair.allowed` was true before a repair
  mutation was attempted
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
