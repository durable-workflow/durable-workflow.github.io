---
sidebar_position: 2.6
title: Search and Navigation
description: Map common Durable Workflow v2 search terms to the right docs page, topic, and operator surface.
tags:
  - discoverability
  - search
  - reference
keywords:
  - durable workflow search
  - workflow stuck
  - activity retries
  - task queues
  - waterline
  - llms.txt
  - mcp workflows
---

# Search and Navigation

Use this page when a search term is close to the problem, but not the exact
page title. Durable Workflow v2 docs are organized by task; this page maps
common phrases to the smallest useful guide.

## Common Searches

| Search phrase | Start here | Then use |
| --- | --- | --- |
| `quickstart`, `install`, `first workflow` | [Getting Started](./getting-started.md) | [Sample App](./sample-app.md) |
| `workflow stuck`, `failed activity`, `retry exhausted` | [Failures and Recovery](./failures-and-recovery.md) | [Monitoring](./monitoring.md) |
| `Waterline`, `workflow dashboard`, `history export` | [Monitoring](./monitoring.md) | [AI-Assisted Development](./ai-assisted-development.md) |
| `actionability`, `diagnostic_only`, `repair_state` | [Monitoring](./monitoring.md) | [Failures and Recovery](./failures-and-recovery.md) |
| `CLI`, `dw command`, `json output` | [CLI](./polyglot/cli.mdx) | [CLI Command Reference](./polyglot/cli-reference.md) |
| `Python`, `SDK`, `polyglot` | [Python SDK](./polyglot/python.md) | [CLI and Python Parity](./polyglot/cli-python-parity.md) |
| `server mode`, `HTTP API`, `control plane` | [Server](./polyglot/server.md) | [Embedded to Server Migration](./polyglot/embedded-to-server.md) |
| `worker protocol`, `external worker`, `heartbeats` | [Worker Protocol](./polyglot/worker-protocol.md) | [External Execution Surface](./polyglot/external-execution.md) |
| `task queue`, `rate limit`, `admission` | [Task Queue Admission](./polyglot/task-queue-admission.md) | [Monitoring](./monitoring.md) |
| `MCP`, `AI client`, `llms.txt` | [MCP Workflow Surface](./mcp-workflows.md) | [AI-Assisted Development](./ai-assisted-development.md), [Sample App](./sample-app.md) |
| `agent loop`, `AI debugging`, `structured diagnosis` | [Agent Operating Loop](./agent-operating-loop.md) | [AI-Assisted Development](./ai-assisted-development.md) |
| `signals`, `updates`, `queries` | [Signals](./features/signals.md) | [Updates](./features/updates.md), [Queries](./features/queries.md) |
| `timers`, `wait`, `sleep`, `condition` | [Timers](./features/timers.md) | [Condition Waits](./features/condition-waits.md), [Timeouts](./features/timeouts.md) |
| `history size`, `continue as new`, `compaction` | [Continue As New](./features/continue-as-new.md) | [Support Boundaries](./support.md) |

## Zero-Result Watchlist

Track adjacent terms that users may type before the docs have a matching page
title. Each phrase below is pinned in the build-time discoverability contract so
future edits cannot silently drop the route.

| Search phrase | Start here | Then use |
| --- | --- | --- |
| `cron`, `schedule`, `recurring jobs` | [Schedules](./features/schedules.md) | [Timers](./features/timers.md) |
| `worker logs`, `trace id`, `metrics` | [Monitoring](./monitoring.md) | [AI-Assisted Development](./ai-assisted-development.md) |
| `payload codec`, `PHP serialization` | [Passing Data](./defining-workflows/passing-data.md) | [Server](./polyglot/server.md) |
| `upgrade embedded app`, `server cutover` | [Embedded to Server Migration](./polyglot/embedded-to-server.md) | [Server](./polyglot/server.md) |

## Task Indexes

- [Topics](./topics.md) groups docs by authoring, operations, control-plane,
  external execution, reliability, and AI automation work.
- [CLI Command Reference](./polyglot/cli-reference.md) is the command lookup
  page for scripts, CI, and agents.
- [AI-Assisted Development](./ai-assisted-development.md) lists the v2 LLM
  manifests, MCP tools, CLI contracts, Waterline facts, and SDK surfaces that
  automation should use instead of guessing from screenshots.
- [Agent Operating Loop](./agent-operating-loop.md) gives AI clients the
  concrete order for discovering workflows, making changes, running structured
  commands, diagnosing failures, and reporting facts.
- [MCP Workflow Surface](./mcp-workflows.md) defines the sample-app MCP
  endpoint, workflow tool contract, no-credential smoke keys, and report shape.

## Search Feedback

When a common query fails to land on the right page, add it to the
discoverability contract in `scripts/discoverability-contract.json` with the
expected target page. The build checks that each tracked query points to a real
v2 doc and that the target document contains the search language or its listed
aliases.
