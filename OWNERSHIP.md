# Documentation Ownership

This file maps documentation sections to the repositories and plans that own the underlying behavior. Use this to identify which repo to change when fixing inaccuracies or adding features.

## Ownership Legend

- **workflow** → `durable-workflow/workflow` (v2 branch)
- **server** → `durable-workflow/server` (main branch)
- **cli** → `durable-workflow/cli` (main branch)
- **sdk-python** → `durable-workflow/sdk-python` (main branch)
- **waterline** → `durable-workflow/waterline` (v2 branch)
- **sample-app** → `durable-workflow/sample-app` (main branch)
- **docs** → `durable-workflow/durable-workflow.github.io` (main branch)

## Page-to-Repo Mapping

### Getting Started

| Page | Owner | Notes |
|------|-------|-------|
| `introduction.md` | **docs** | Overview, no code owner |
| `installation.md` | **workflow** | PHP package install, Laravel integration |
| `how-it-works.md` | **workflow** | Engine internals, history replay, task ownership |
| `migration.md` | **workflow** | v1→v2 migration guide |

### Defining Workflows

| Page | Owner | Notes |
|------|-------|-------|
| `defining-workflows/workflows.md` | **workflow** | Workflow class definition, lifecycle |
| `defining-workflows/activities.md` | **workflow** | Activity definition, execution |
| `defining-workflows/starting-workflows.md` | **workflow** | Start API, dispatch patterns |
| `defining-workflows/workflow-id.md` | **workflow** | ID semantics, duplicate policy |
| `defining-workflows/workflow-status.md` | **workflow** | Status values, lifecycle states |
| `defining-workflows/passing-data.md` | **workflow** | Input, result, serialization |

### Features

| Page | Owner | Notes |
|------|-------|-------|
| `features/signals.md` | **workflow** | Signal definition, dispatch, handlers |
| `features/queries.md` | **workflow** | Query definition, dispatch, handlers |
| `features/timers.md` | **workflow** | Timer API, scheduling |
| `features/side-effects.md` | **workflow** | Non-deterministic values |
| `features/versioning.md` | **workflow** | Version markers, code evolution |
| `features/child-workflows.md` | **workflow** | Parent-child orchestration |
| `features/continue-as-new.md` | **workflow** | History truncation, long-running workflows |
| `features/sagas.md` | **workflow** | Compensation patterns |
| `features/events.md` | **workflow** | Event hooks, lifecycle listeners |
| `features/heartbeats.md` | **workflow** | Activity heartbeats, progress reporting |
| `features/timeouts.md` | **workflow** | Execution, run, activity timeouts |
| `features/cancel-and-terminate.md` | **workflow** | Cancellation requests, forced termination |
| `features/concurrency.md` | **workflow** | Parallel activities, race patterns |
| `features/webhooks.md` | **workflow** | Webhook triggers |
| `features/schedules.md` | **workflow** | Cron schedules, recurring workflows |
| `features/search-attributes.md` | **workflow** | Searchable metadata, indexing |
| `features/memo.md` | **workflow** | Workflow metadata |
| `features/signal+timer.md` | **workflow** | await/awaitWithTimeout patterns |

### Configuration

| Page | Owner | Notes |
|------|-------|-------|
| `configuration/options.md` | **workflow** | Package configuration reference |
| `configuration/database-connection.md` | **workflow** | Database requirements, multi-connection |
| `configuration/publishing-config.md` | **workflow** | Config file publishing |
| `configuration/pruning-workflows.md` | **workflow** | Retention, cleanup |
| `configuration/ensuring-same-server.md` | **workflow** | Development config |
| `configuration/microservices.md` | **workflow** | Multi-service orchestration |

### Constraints

| Page | Owner | Notes |
|------|-------|-------|
| `constraints/overview.md` | **workflow** | Constraint philosophy |
| `constraints/workflow-constraints.md` | **workflow** | Workflow code rules |
| `constraints/activity-constraints.md` | **workflow** | Activity code rules |
| `constraints/structural-limits.md` | **workflow** | History size, event limits |
| `constraints/constraints-summary.md` | **workflow** | Quick reference |

### Testing & Operations

| Page | Owner | Notes |
|------|-------|-------|
| `testing.md` | **workflow** | Testing strategies, test helpers |
| `failures-and-recovery.md` | **workflow** | Failure handling, retries, recovery |
| `monitoring.md` | **waterline** | Waterline UI, observability |
| `sample-app.md` | **sample-app** | Sample application reference |
| `contribute-a-sample.md` | **sample-app** | Contribution contract for new samples |

### Polyglot

| Page | Owner | Notes |
|------|-------|-------|
| `polyglot/cli.mdx` | **cli** | CLI installation and usage |
| `polyglot/server.md` | **server** | Standalone server deployment and configuration |
| `polyglot/python.md` | **sdk-python** | Python SDK installation, usage |
| `polyglot/worker-protocol.md` | **server** | HTTP worker protocol specification |

### Meta

| Page | Owner | Notes |
|------|-------|-------|
| `sponsors.md` | **docs** | Sponsorship info |
| `support.md` | **docs** | Support channels |

## Plan References

- **Workflow package plan**: workflows/features live in `workflow` v2 branch
- **Server plan**: server setup, worker protocol in `server` main branch
- **CLI plan**: CLI docs track `cli` main branch
- **Python SDK plan**: tracked in the central SDK roadmap
- **Waterline plan**: monitoring/observability features track `waterline` v2 branch
- **Docs plan**: tracked in the docs-site roadmap

## How to Use This Map

### Fixing inaccurate docs

1. Find the page in the table above
2. Check the owner repo
3. Read the corresponding source code to understand current behavior
4. Update the docs to match
5. If the behavior should change, file an issue in the owner repo

### Adding feature documentation

1. Identify which repo implements the feature
2. Find related docs pages in the table
3. Add documentation near related content
4. Update this ownership map if creating a new page

### Reporting docs issues

When filing `docs-feedback` issues, reference the owner repo so the issue can be routed to the right team.

## Drift Detection

To audit for content drift:

1. For each page, check the "last modified" date
2. Compare against recent commits in the owner repo
3. If owner repo has significant changes since last docs update, flag for review
4. Create tracking issues for confirmed drift

Last ownership audit: 2026-04-15
