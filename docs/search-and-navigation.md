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
| `PHP`, `workflow authoring`, `API reference` | [Workflow Authoring API Reference](./defining-workflows/workflow-authoring-reference.md) | [Workflows](./defining-workflows/workflows.md), [Message Streams](./features/message-streams.md) |
| `workflow stuck`, `failed activity`, `retry exhausted` | [Failures and Recovery](./failures-and-recovery.md) | [Monitoring](./monitoring.md) |
| `Waterline`, `workflow dashboard`, `history export` | [Monitoring](./monitoring.md) | [AI-Assisted Development](./ai-assisted-development.md) |
| `actionability`, `diagnostic_only`, `repair_state` | [Monitoring](./monitoring.md) | [Failures and Recovery](./failures-and-recovery.md) |
| `CLI`, `dw command`, `json output` | [CLI](./polyglot/cli.mdx) | [CLI Command Reference](./polyglot/cli-reference.md), [CLI five-minute operator quickstart](./polyglot/cli.mdx#five-minute-operator-quickstart) |
| `Python`, `SDK`, `polyglot` | [Python SDK](./polyglot/python.md) | [CLI and Python Parity](./polyglot/cli-python-parity.md) |
| `server mode`, `HTTP API`, `control plane` | [Server](./polyglot/server.md) | [Embedded to Server Migration](./polyglot/embedded-to-server.md) |
| `namespace`, `auth`, `worker registration` | [Namespace, Auth, And Worker Registration](./polyglot/namespace-auth-workers.md) | [Server API Reference](./polyglot/server-api-reference.md), [Worker Protocol](./polyglot/worker-protocol.md) |
| `worker protocol`, `external worker`, `heartbeats` | [Worker Protocol](./polyglot/worker-protocol.md) | [External Execution Surface](./polyglot/external-execution.md) |
| `task queue`, `rate limit`, `admission` | [Task Queue Admission](./polyglot/task-queue-admission.md) | [Monitoring](./monitoring.md) |
| `MCP`, `AI client`, `llms.txt` | [MCP Workflow Surface](./mcp-workflows.md) | [AI-Assisted Development](./ai-assisted-development.md), [Sample App](./sample-app.md) |
| `agent loop`, `AI debugging`, `structured diagnosis` | [Agent Operating Loop](./agent-operating-loop.md) | [AI-Assisted Development](./ai-assisted-development.md) |
| `agent tooling`, `machine-readable operations`, `MCP diagnostics` | [Agent Tooling Contract](./agent-tooling-contract.md) | [Agent Operating Loop](./agent-operating-loop.md), [CLI and Python Parity](./polyglot/cli-python-parity.md) |
| `signals`, `updates`, `queries` | [Signals](./features/signals.md) | [Updates](./features/updates.md), [Queries](./features/queries.md) |
| `timers`, `wait`, `sleep`, `condition` | [Timers](./features/timers.md) | [Condition Waits](./features/condition-waits.md), [Timeouts](./features/timeouts.md) |
| `history size`, `continue as new`, `compaction` | [Continue As New](./features/continue-as-new.md) | [Support Boundaries](./support.md) |

## Zero-Result Watchlist

Track adjacent terms that users may type before the docs have a matching page
title. Each phrase below is pinned in the build-time discoverability contract so
future edits cannot silently drop the route.

| Search phrase | Start here | Then use | Source | Last reviewed | Action |
| --- | --- | --- | --- | --- | --- |
| `cron`, `schedule`, `recurring jobs` | [Schedules](./features/schedules.md) | [Timers](./features/timers.md) | docs Phase 3 zero-result watchlist | 2026-04-22 | Keep mapped until schedule docs rank for cron and recurring jobs. |
| `worker logs`, `trace id`, `metrics` | [Monitoring](./monitoring.md) | [AI-Assisted Development](./ai-assisted-development.md) | docs Phase 3 zero-result watchlist | 2026-04-22 | Keep mapped until monitoring docs rank for logs, traces, and metrics. |
| `payload codec`, `PHP serialization` | [Passing Data](./defining-workflows/passing-data.md) | [Server](./polyglot/server.md) | docs Phase 3 zero-result watchlist | 2026-04-22 | Keep mapped until payload and codec searches land on passing-data guidance. |
| `upgrade embedded app`, `server cutover` | [Embedded to Server Migration](./polyglot/embedded-to-server.md) | [Server](./polyglot/server.md) | docs Phase 3 zero-result watchlist | 2026-04-22 | Keep mapped until migration and cutover searches land on the embedded-to-server guide. |
| `Helm`, `high availability`, `rolling upgrade` | [Self-Hosting Deployments](./deployment.md) | [Support Boundaries](./support.md) | docs Phase 3 zero-result watchlist | 2026-04-22 | Keep mapped until unsupported topology searches land on the deployment support matrix. |
| `webhook bridge`, `external handler`, `bridge adapter` | [External Execution Surface](./polyglot/external-execution.md) | [Webhooks](./features/webhooks.md) | docs Phase 3 zero-result watchlist | 2026-04-22 | Keep mapped until bridge and handler searches land on the external execution contract. |
| `dispatch budget group`, `downstream quota`, `rate limit` | [Task Queue Admission](./polyglot/task-queue-admission.md) | [Monitoring](./monitoring.md) | docs Phase 3 zero-result watchlist | 2026-04-22 | Keep mapped until downstream quota searches land on task queue admission. |

## Task Indexes

- [Topics](./topics.md) groups docs by authoring, operations, control-plane,
  external execution, reliability, and AI automation work.
- [CLI Command Reference](./polyglot/cli-reference.md) is the command lookup
  page for scripts, CI, and agents.
- [Namespace, Auth, And Worker Registration](./polyglot/namespace-auth-workers.md)
  is the request-authority reference for server namespaces, role-scoped
  credentials, and worker registration.
- [AI-Assisted Development](./ai-assisted-development.md) lists the v2 LLM
  manifests, MCP tools, CLI contracts, Waterline facts, and SDK surfaces that
  automation should use instead of guessing from screenshots.
- [Agent Operating Loop](./agent-operating-loop.md) gives AI clients the
  concrete order for discovering workflows, making changes, running structured
  commands, diagnosing failures, and reporting facts.
- [Agent Tooling Contract](./agent-tooling-contract.md) defines the
  machine-operable contract shared by MCP tools, CLI JSON, server diagnostics,
  Waterline exports, and SDK parity fixtures.
- [MCP Workflow Surface](./mcp-workflows.md) defines the sample-app MCP
  endpoint, workflow tool contract, no-credential smoke keys, and report shape.
- Topic tags expose cross-page trails for [migration](/docs/2.0/tags/migration),
  [observability](/docs/2.0/tags/observability), [timers](/docs/2.0/tags/timers),
  [operations](/docs/2.0/tags/operations), [task queues](/docs/2.0/tags/task-queues),
  and [message streams](/docs/2.0/tags/message-streams).

## Search Feedback

When a common query fails to land on the right page, add it to the
discoverability contract in `scripts/discoverability-contract.json` with the
expected target page. The build checks that each tracked query points to a real
v2 doc and that the target document contains the search language or its listed
aliases.

Zero-result watchlist entries also carry a source, review date, and action.
That keeps ambiguous searches such as Helm, bridge adapters, and downstream
quota tied to an owner decision instead of becoming stale prose on this page.
