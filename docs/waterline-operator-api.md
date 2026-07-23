---
sidebar_position: 13
title: Waterline Operator API Reference
description: Typed Waterline API contracts for dashboard lists, selected-run detail, history export, schedules, saved views, preferences, and operator actions.
tags:
  - Waterline
  - observability
  - API
  - reference
keywords:
  - Waterline API reference
  - selected-run detail
  - history export
  - actionability contract
  - workflow operator actions
---

# Waterline Operator API Reference

Waterline is the durable-state operator surface for both embedded Laravel and
standalone-server deployments. The UI uses the same HTTP+JSON API documented
here, so scripts, dashboards, and agents can read durable workflow facts
without scraping HTML.

Use this reference when you need typed operator evidence: selected-run detail,
history export, actionability, command affordances, saved views, preferences,
and schedule visibility. Use [Monitoring](./monitoring.md) for the conceptual
split between Waterline durable state and worker/runtime telemetry.

## Installation

Install Waterline in the same embedded Laravel application that installs the
workflow package:

```bash
composer require \
  %%artifact.waterlineComposerPackage%% \
  %%artifact.workflowComposerPackage%% \
  %%artifact.phpSdkComposerPackage%%
php artisan waterline:install
```

The pins include the Composer prerelease stability suffixes for the current
public artifact tuple while Waterline, Workflow, and the PHP SDK are on the
2.0 prerelease channel. Composer stability flags are root-only, so a
default-stable Laravel app must either require all three prerelease packages
explicitly as shown above or set an equivalent root stability policy before
installing Waterline. After upgrading Waterline, publish the current assets:

```bash
composer update durable-workflow/waterline
php artisan waterline:publish
```

For the self-contained service image and its connection, authentication, and
persistence inputs, use [Monitoring](./monitoring.md#waterline-service).

## Deployment Boundary

Waterline has two backend adapters:

- Embedded mode runs inside the Laravel host and reads the workflow package's
  durable state in process.
- Service mode runs the published Waterline image and reads one standalone
  server namespace through `durable-workflow/sdk` and the server's public API.

Both adapters expose the Waterline routes documented on this page. Service
mode translates those routes to the corresponding server contracts:

| Waterline route family | Standalone-server contract used by service mode |
| --- | --- |
| `GET /waterline/api/v2/health` | Server health, worker registration, and task-queue visibility. |
| `GET /waterline/api/stats` | The namespace-scoped operator dashboard and metrics snapshot. |
| Flow lists, selected-run detail, and history export | Workflow list, detail, runs, history, and diagnostics from the [Server API Reference](./polyglot/server-api-reference.md). |
| Signal, update, query, cancel, terminate, repair, and archive actions | The matching server workflow command and repair contracts. |
| Routes under `/waterline/api/v2/schedules` | The server schedule list, detail, history, and mutation contracts. |

The server API, CLI, and SDK surfaces remain available directly when
Waterline is deployed. Do not assume cross-mode or cross-namespace visibility:
runs stay readable and actionable from their owning runtime and namespace.
[Deployment Modes](./polyglot/deployment-modes.md) defines that shared product
boundary.

## Base Path And Scope

Waterline mounts under the Laravel app's configured Waterline base path. The
examples below use `/waterline`; if your app publishes Waterline under a
different prefix, keep the `/api/...` suffixes the same.

When `WATERLINE_NAMESPACE` is configured, every list, detail, schedule, and
operator-action route is namespace scoped. Cross-namespace reads and commands
return not-found semantics instead of leaking another namespace's workflow
state.

```bash
curl -sS "$APP_URL/waterline/api/instances/order-1001" \
  -H "Accept: application/json" | jq '.status, .run_id, .actionability'
```

## Authentication

Every Waterline UI and JSON API controller passes through Waterline's access
check. In embedded mode, the Laravel host defines that check and decides which
guards, route middleware, gates, policies, SSO/OIDC/SAML sessions,
directory-backed groups, service tokens, and rate limits apply.

The current JSON operator API group excludes Laravel's CSRF middleware so a
host can apply a session or service-token boundary consistently to both reads
and commands. The host remains responsible for authenticating those requests
and for documenting any browser-session CSRF protections it adds around the
API.

The self-contained service image has no host-application users. Put it behind
an authenticating reverse proxy or on a private interface before setting
`WATERLINE_ALLOW_UNAUTHENTICATED=true`; that setting delegates the Waterline
front-door check to the surrounding deployment. Separately,
`WATERLINE_SERVER_TOKEN` authenticates Waterline's PHP SDK calls to the
standalone server. Never expose that server credential to the browser.

`WATERLINE_ACCESS_MODE=read_only` blocks mutating Waterline routes locally.
`operator` enables them, but the connected server still applies its own token
role and namespace authorization. See
[Monitoring](./monitoring.md#waterline-service) for the deployment example and
the two authentication boundaries.

## Dashboard And Health

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/waterline/api/stats` | Dashboard totals, backlog counters, repair policy, operator metrics, and fleet trend data. |
| `GET` | `/waterline/api/v2/health` | Waterline package/runtime health and v2 data-source readiness. |

`/waterline/api/stats` is the dashboard's summary surface. Treat
`operator_metrics` as Waterline-owned JSON diagnostics, not as a Prometheus
scrape surface. Use worker SDK metrics for runtime latency and custom
application telemetry.

The [Operator Operating Envelope](./operator-operating-envelope.md) defines how
to interpret those diagnostics during rollouts and incident response. In
particular:

| Field family | Meaning |
| --- | --- |
| `operator_metrics.backlog.*` | Durable runnable, delayed, leased, unhealthy, repair-needed, claim-failed, and compatibility-blocked work counts, plus the fleet-level `tasks_added_last_minute` and `tasks_dispatched_last_minute` queue-flow facts. |
| `operator_metrics.matching_role.*` | The node-local matching/dispatch contract for the process serving the request: `queue_wake_enabled`, deployment `shape`, `task_dispatch_mode`, frozen `partition_primitives`, and current `backpressure_model`. |
| `operator_metrics.repair.*` | Repair-loop sweep footprint, including selected candidates, candidate age, and scan pressure. |
| `operator_metrics.projections.*` | Projection-drift counts for run summaries, waits, timelines, timers, and lineage. |
| `operator_metrics.command_contracts.*` | Legacy WorkflowStarted contract snapshots that still need backfill. |
| `operator_metrics.history.*` | History-size and event-count pressure plus continue-as-new recommendations. |
| `queue_visibility.available`, `queue_visibility.reason` | Whether namespace-scoped queue visibility is available on this host app, and the reason when it is not. |
| `queue_visibility.task_queues[].stats.*` | Queue-local backlog, backlog age, poller counts, workflow/activity ready-versus-leased counts, and per-queue `tasks_added_last_minute` / `tasks_dispatched_last_minute` flow facts. |
| `queue_visibility.task_queues[].repair.*` | Queue-local repair pressure, including candidates, dispatch failures, expired leases, dispatch-overdue counts, and the oldest age for each condition. |
| `coordination_alerts[]` | Roll-up warnings and errors derived from the health checks plus queue-visibility risks such as backlog without pollers, stale pollers, or aged repair candidates. |
| `checks[]`, `categories.*` | Blocking versus advisory v2 health checks, with per-check `category = correctness | acceleration` and the category rollups Waterline uses on the workers surface. |
| `engine_source`, `readiness_contract` | Whether Waterline is actively using the v2 operator bridge and which readiness contract governs that state. |

The queue-flow fields answer a specific operator question: is durable queue
input arriving faster than the system is dispatching it? `tasks_added_last_minute`
counts distinct durable task rows created in the trailing 60 seconds, and
`tasks_dispatched_last_minute` counts distinct durable task rows whose latest
successful dispatch landed in that same window.

Use the queue-flow totals with the server task-queue visibility routes rather
than by themselves. Waterline tells you whether durable inflow is outrunning
dispatch, while `/api/task-queues` and `/api/task-queues/{taskQueue}` tell you
whether the hot queue is `saturated`, intentionally `throttled`,
`no_active_workers`, or otherwise short on healthy pollers or slots.

`GET /waterline/api/v2/health` exposes the same queue-local evidence without
leaving the Waterline surface. Scripts and dashboards that need one namespace's
current queue posture should read `queue_visibility.task_queues[]` for
per-queue stats and `coordination_alerts[]` for the summary of which queue or
health-check condition currently needs operator attention.

The `matching_role` fields answer a different question: which matching shape is
this node currently serving? `shape` distinguishes `in_worker` from
`dedicated`, `partition_primitives` freezes the routing axes as
`connection`/`queue`/`compatibility`/`namespace`, and `backpressure_model`
currently reports `lease_ownership`. Treat that block as process-local. During
mixed-shape rollouts, compare it across nodes before assuming backlog or poll
differences mean worker trouble.

`GET /waterline/api/v2/health` uses the same distinction: `error` is blocking,
`warning` is advisory, and `ok` means the current v2 operator bridge is ready.

## List Views

List views are bucketed by durable status:

| Method | Path | Bucket |
| --- | --- | --- |
| `GET` | `/waterline/api/flows/running` | Open or actively blocked runs. |
| `GET` | `/waterline/api/flows/completed` | Runs closed successfully, including continued runs with `closed_reason = continued`. |
| `GET` | `/waterline/api/flows/failed` | Failed runs. |
| `GET` | `/waterline/api/flows/cancelled` | Cancelled runs. |
| `GET` | `/waterline/api/flows/terminated` | Terminated runs. |

List rows are compact operator summaries. Stable fields include workflow
identity (`id`, `instance_id`, `run_id`, `workflow_type`), state (`status`,
`closed_reason`, `archived_at`), timing, `history_event_count`,
`history_size_bytes`, `continue_as_new_recommended`, and repair/actionability
badges such as `repair_blocked`.

## Selected-Run Detail

Waterline has two addressing modes:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}` | Current selected run for a workflow instance. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}` | Explicit selected run. |
| `GET` | `/waterline/api/flows/{id}` | Legacy/detail lookup by Waterline row or run id. |

Selected-run detail is the authoritative JSON contract for operator screens.
It contains durable state and derived diagnostics for:

| Field family | Meaning |
| --- | --- |
| `activities`, `timers`, `waits`, `children` | Current and historical wait state rebuilt from typed history first. |
| `signals`, `updates`, `declared_signals`, `declared_updates`, `declared_queries` | Command lifecycle rows plus loadable workflow contract targets. |
| `timeline` | Ordered durable events and diagnostic entries. |
| `exceptions`, `logs` | Failure facts and replay/debug context. |
| `can_signal`, `can_update`, `can_query`, `can_cancel`, `can_terminate`, `can_archive` | UI and automation affordances for the selected run. |
| `actionability` | Versioned repair and evidence contract described below. |

Automation should prefer selected-run detail over visual screenshots. A
screenshot can show what an operator saw; selected-run detail explains why a
workflow can or cannot be repaired, queried, cancelled, archived, or replayed.

## History Export

History exports are replay/debug bundles. They intentionally include stored
workflow, command, activity, update, task, failure, and history payloads so a
developer can reproduce or archive the selected run.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/history-export` | Export the current selected run for an instance. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/history-export` | Export an explicit run. |
| `GET` | `/waterline/api/flows/{id}/history-export` | Legacy/detail export by Waterline row or run id. |

If an export can leave a protected environment, configure the workflow
history-export redactor first. Downstream tools should preserve the export's
`redaction` metadata so reviewers can tell which policy shaped the artifact.

## Actionability Contract

Waterline annotates list rows, selected-run detail responses, timeline entries,
and history exports with the versioned actionability contract:

```json
{
  "actionability_contract": {
    "schema": "waterline.actionability",
    "version": 1
  }
}
```

The contract identifier is `actionability_contract.schema = waterline.actionability`
with `actionability_contract.version = 1`.

Run-level `actionability` answers whether the selected run can be repaired:

| Field | Meaning |
| --- | --- |
| `repair_state` | One of `repairable`, `blocked`, `not_needed`, or `unknown`. |
| `repairable` | Boolean shorthand for `repair_state = repairable`. |
| `blocked_reason` | Stable reason code when `repair_state = blocked`. |
| `status_bucket` | The Waterline bucket that shaped the run-level decision. |
| `closed_reason` | Durable close reason when the run is closed. |
| `task_problem` | Whether Waterline saw a task-level problem on the run. |
| `diagnostic_only_evidence` | True when at least one row is informative but not a resume source. |

Evidence rows under `activities`, `waits`, `timers`, `exceptions`, `logs`, and
timeline/export entries can include their own `actionability` block:

| Field | Meaning |
| --- | --- |
| `state` | `actionable` when the row is a valid repair source, otherwise `diagnostic_only`. |
| `repair_source` | True only for rows backed by a repairable source authority. |
| `diagnostic_only` | True when the row must not be used as a resume source. |
| `history_authority` | Source authority such as `typed_history`, `mutable_open_fallback`, `failure_row_fallback`, or `unsupported_terminal_without_history`. |
| `history_unsupported_reason` | Stable reason code for unsupported fallback history. |

Agents and scripts must gate repair/resume decisions on
`actionability.repair_state`, `actionability.repairable`, and row-level
`actionability.repair_source`. A row with `diagnostic_only = true` is evidence,
not permission to replay or resume.

## Operator Actions

Waterline actions are durable commands issued through the selected-run contract.
Instance routes target the current run; run routes reject stale or wrong-run
targets explicitly.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/waterline/api/instances/{instanceId}/queries/{query}` | Execute a declared query against the current run. |
| `POST` | `/waterline/api/instances/{instanceId}/signals/{signal}` | Send a signal to the current run. |
| `POST` | `/waterline/api/instances/{instanceId}/updates/{update}` | Submit an update to the current run. |
| `POST` | `/waterline/api/instances/{instanceId}/repair` | Dispatch a repair pass for the current run when actionability allows it. |
| `POST` | `/waterline/api/instances/{instanceId}/cancel` | Request cancellation for the current run. |
| `POST` | `/waterline/api/instances/{instanceId}/terminate` | Terminate the current run. |
| `POST` | `/waterline/api/instances/{instanceId}/archive` | Archive the selected closed run. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}` | Execute a query against an explicit selected run. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/signals/{signal}` | Send a signal only if the selected run is current. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{update}` | Submit an update only if the selected run is current. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/repair` | Repair an explicit selected run. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/cancel` | Cancel only if the selected run is current. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/terminate` | Terminate only if the selected run is current. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/archive` | Archive the selected closed run. |

Signals, updates, and queries accept JSON `arguments`. Invalid arguments return
field-level validation failures. Replay blocks return `409 Conflict` with a
stable reason such as `workflow_definition_unavailable` instead of attempting
best-effort execution.

## Update Inspection

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/updates/{updateId}` | Inspect an update lifecycle row for the current run. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{updateId}` | Inspect an update lifecycle row for an explicit run. |
| `GET` | `/waterline/api/flows/{id}/updates/{updateId}` | Legacy/detail update lookup. |

Use update inspection when a UI or agent needs to explain whether an update is
accepted, applied, completed, rejected, timed out while waiting, or blocked by
replay compatibility.

## Schedules

Waterline schedule routes are v2 visibility and operator-action routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/waterline/api/v2/schedules` | List schedules visible in the current namespace. |
| `GET` | `/waterline/api/v2/schedules/{scheduleId}` | Describe one schedule. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/pause` | Pause future fires. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/resume` | Resume a paused schedule. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/trigger` | Trigger an immediate fire. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/backfill` | Backfill a time window. |
| `DELETE` | `/waterline/api/v2/schedules/{scheduleId}` | Delete a schedule. |

Schedule responses expose action, status, next fire, recent fire history,
overlap policy, note, memo, and search attributes for operator review.

## Saved Views And Preferences

Saved views and preferences are UI-owned operator configuration, not workflow
history. They are still useful for stable runbooks because they let teams share
the exact filters and table layout used during an incident.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/waterline/api/saved-views` | List saved operator views. |
| `POST` | `/waterline/api/saved-views` | Create a saved view. |
| `GET` | `/waterline/api/saved-views/{view}` | Read one saved view. |
| `PUT` | `/waterline/api/saved-views/{view}` | Update a saved view. |
| `DELETE` | `/waterline/api/saved-views/{view}` | Delete a saved view. |
| `GET` | `/waterline/api/preferences/{surface}` | Read UI preferences for one surface. |
| `PUT` | `/waterline/api/preferences/{surface}` | Update UI preferences for one surface. |

Do not treat saved-view names or preference payloads as durable workflow facts.
For evidence, cite selected-run detail or history export.

## Error Contract

Waterline uses ordinary HTTP status codes and JSON error details:

| Status | Meaning |
| --- | --- |
| `400` | Malformed request or unsupported action payload. |
| `404` | Workflow instance, run, update, schedule, saved view, or preference surface was not found in the current namespace. |
| `409` | The selected run cannot execute the action, often because it is historical, closed, replay-blocked, or definition-unavailable. |
| `422` | Validation failed; response includes field-level errors. |
| `500` | Unexpected application failure. |

Automation should branch on status plus stable fields such as `blocked_reason`,
`query_blocked_reason`, `outcome`, `reason`, and `actionability` values. Do
not parse toast text or button labels as the contract.

## See Also

- [Monitoring](./monitoring.md)
- [Failures and Recovery](./failures-and-recovery.md)
- [Queries](./features/queries.md)
- [Cancel and Terminate](./features/cancel-and-terminate.md)
- [Agent Tooling Contract](./agent-tooling-contract.md)
