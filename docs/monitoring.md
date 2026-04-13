---
sidebar_position: 11
---

# Monitoring

## Waterline

[Waterline](https://github.com/durable-workflow/waterline) is a separate UI that works nicely alongside Horizon. Think of Waterline as being to workflows what Horizon is to queues.

The Waterline bridge supports both the legacy workflow tables and the v2 run-summary bridge.

Use the default auto-detection mode when you want Waterline to switch onto the v2 bridge as soon as the workflow package's full v2 operator surface is installed:

```env
WATERLINE_ENGINE_SOURCE=auto
```

Pin the legacy engine during a mixed-fleet rollout or while you intentionally keep Waterline on the v1 tables:

```env
WATERLINE_ENGINE_SOURCE=v1
```

Pin the v2 bridge when you want Waterline to require the v2 operator surface and fail clearly if the required tables or configured models are missing or unreadable:

```env
WATERLINE_ENGINE_SOURCE=v2
```

`/waterline/api/stats` now includes an `engine_source` object that reports the configured mode, the resolved mode, whether Waterline is actively using v2, any surfaced readiness issues, and the required-table inspection results. When `engine_source=v2` is pinned but the v2 operator surface is incomplete, Waterline list/detail/export/saved-view/stats routes return HTTP `503` with that same `engine_source` payload instead of silently falling back to v1. Instance-scoped `/waterline/api/instances/...` routes remain v2-only; when Waterline is pinned to `v1` or `auto` falls back to v1, those routes return `404` because the legacy bridge does not expose the public instance-id contract.

Waterline reads v2 selected-run detail, history-export payloads, dashboard stats, and operator metrics through `Workflow\V2\Contracts\OperatorObservabilityRepository`. The workflow package binds a default implementation that returns the built-in v2 operator contract, and applications can replace that binding when they need to front Waterline with an app-owned repository, tenancy scope, authorization policy, or cached projection layer.

With `v2` enabled, the existing Waterline list, detail, and dashboard routes keep their current endpoint shapes while adding v2-specific fields such as:

- `instance_id`
- `selected_run_id`
- `run_id`
- `current_run_id`
- `current_run_source`
- `current_run_status`
- `current_run_status_bucket`
- `workflow_type`
- `declared_entry_method`
- `declared_entry_mode`
- `declared_entry_declaring_class`
- `compatibility`
- `compatibility_supported`
- `compatibility_reason`
- `is_current_run`
- `engine_source`
- `status_bucket`
- `is_terminal`
- `archived_at`
- `archive_command_id`
- `archive_reason`
- `sort_timestamp`
- `sort_key`
- `closed_reason`
- `wait_kind`
- `wait_reason`
- `wait_started_at`
- `wait_deadline_at`
- `open_wait_id`
- `resume_source_kind`
- `resume_source_id`
- `next_task_at`
- `next_task_id`
- `next_task_type`
- `next_task_status`
- `next_task_lease_expires_at`
- `liveness_state`
- `liveness_reason`
- `repair_blocked_reason`
- `repair_attention`
- `repair_blocked`
- `task_problem`
- `task_problem_badge`
- `exception_count`
- `exceptions_count`
- `can_issue_terminal_commands`
- `can_archive`
- `archive_blocked_reason`
- `can_repair`
- `read_only_reason`
- `run_navigation`
- `activities_scope`
- `commands_scope`
- `signals_scope`
- `updates_scope`
- `waits_scope`
- `tasks_scope`
- `timeline_scope`
- `lineage_scope`
- `waits`
- `tasks`
- `signals`
- `updates`
- `parents`
- `continuedWorkflows`
- `timeline`
- `timeline[*].entry_kind`
- `timeline[*].source_kind`
- `timeline[*].source_id`
- `timeline[*].workflow_sequence`
- `timeline[*].signal_id`
- `timeline[*].signal_wait_id`
- `timeline[*].child_call_id`
- `timeline[*].version_change_id`
- `timeline[*].version`
- `timeline[*].version_min_supported`
- `timeline[*].version_max_supported`
- command-level source metadata such as `commands[*].source`, `commands[*].caller_label`, `commands[*].auth_status`, `commands[*].request_path`, `commands[*].request_fingerprint`, the accepted payload preview under `commands[*].payload`, its codec under `commands[*].payload_codec`, the caller-requested run under `commands[*].requested_run_id`, the engine-resolved run under `commands[*].resolved_run_id`, workflow-originated context under `commands[*].context.workflow`, and compound-intake linkage under `commands[*].context.intake` with `mode` plus `group_id`; request-ingress metadata stays flattened onto the command row rather than leaking the full raw request blob through `commands[*].context`
- signal lifecycle detail such as `signals[*].id`, `signals[*].command_id`, `signals[*].command_sequence`, `signals[*].workflow_sequence`, `signals[*].name`, `signals[*].signal_wait_id`, `signals[*].status`, `signals[*].outcome`, `signals[*].rejection_reason`, `signals[*].validation_errors`, `signals[*].received_at`, `signals[*].closed_at`, and the compatibility bridge fields `commands[*].signal_id`, `commands[*].signal_status`, and `commands[*].signal_wait_id`
- update lifecycle detail such as `updates[*].id`, `updates[*].command_id`, `updates[*].command_sequence`, `updates[*].workflow_sequence`, `updates[*].name`, `updates[*].status`, `updates[*].outcome`, `updates[*].rejection_reason`, `updates[*].failure_id`, `updates[*].failure_message`, `updates[*].exception_type`, `updates[*].exception_class`, `updates[*].exception_resolved_class`, `updates[*].exception_resolution_source`, `updates[*].exception_resolution_error`, `updates[*].exception_replay_blocked`, `updates[*].accepted_at`, `updates[*].closed_at`, and the compatibility bridge fields `commands[*].update_id`, `commands[*].update_status`, `commands[*].failure_id`, plus `commands[*].failure_message`; accepted-only submitted updates keep `updates[*].status = accepted`, `updates[*].outcome = null`, and `updates[*].workflow_sequence = null` until the workflow worker applies or fails the update, and failed update rows prefer typed `UpdateCompleted` failure history keyed by durable `update_id` over mutable update, command, or failure rows. When old or repaired data no longer has command provenance, Waterline can still show the `updates[*]` lifecycle row, with `updates[*].command_id = null` if no command id is recoverable.
- when an older preview run already has typed signal/update history but predates `workflow_signal_records` or `workflow_updates`, run `php artisan workflow:v2:backfill-command-lifecycles --dry-run` and then the same command without `--dry-run` to create the missing lifecycle row and stamp its `signal_id` or `update_id` back onto the typed history before Waterline detail, export, or operator actions depend on those stable lifecycle ids after a mixed-era upgrade
- task-level compatibility metadata such as `tasks[*].compatibility`, `tasks[*].compatibility_supported`, and `tasks[*].compatibility_reason`, with older preview tasks inheriting the selected run's marker when their own task row predates task-level compatibility storage
- task-level transport metadata such as `tasks[*].transport_state`, `tasks[*].task_missing`, `tasks[*].synthetic`, `tasks[*].expected_task_id`, `tasks[*].dispatch_failed`, `tasks[*].dispatch_overdue`, `tasks[*].claim_failed`, `tasks[*].last_dispatch_attempt_at`, `tasks[*].last_dispatched_at`, `tasks[*].last_dispatch_error`, `tasks[*].last_claim_failed_at`, and `tasks[*].last_claim_error`
- child-resolution workflow task metadata such as `tasks[*].workflow_wait_kind = child`, `tasks[*].workflow_open_wait_id`, `tasks[*].workflow_resume_source_kind`, `tasks[*].workflow_resume_source_id`, `tasks[*].workflow_sequence`, `tasks[*].child_call_id`, and `tasks[*].child_workflow_run_id`

Activity detail rows expose `activity_type`, `idempotency_key`, `attempt_count`, `attempt_id`, `retry_policy`, `started_at`, `last_heartbeat_at`, `closed_at`, and an `attempts` list with one row per durable activity try. That attempt list rebuilds from typed `ActivityStarted`, `ActivityHeartbeatRecorded`, `ActivityRetryScheduled`, `ActivityCompleted`, `ActivityFailed`, and `ActivityCancelled` history first, so task ids, worker lease owners, heartbeat timestamps, lease expiry, cancellation, and close status remain visible if mutable `activity_attempts` or task rows drift or disappear. The retry policy is snapped when the activity is scheduled, so Waterline can explain the retry budget that applied to the selected execution even if the PHP activity class later changes. Timeline entries include related activity, timer, child, command, task, failure, and version-marker metadata when available. The entry identity fields (`entry_kind`, `source_kind`, and `source_id`) name the durable source row for that history point, while the entry's primary command, task, activity, timer, child, and failure state is assembled from the recorded event payload first so earlier `ActivityScheduled`, `ActivityStarted`, `ActivityHeartbeatRecorded`, `ActivityCancelled`, `TimerScheduled`, `UpdateAccepted`, `UpdateApplied`, `ActivityFailed`, `WorkflowFailed`, signal-application points, and `VersionMarkerRecorded` entries do not silently inherit later mutable row state.

Calling `Workflow\V2\Activity::heartbeat()` writes that `last_heartbeat_at` value onto the currently claimed durable activity-attempt row, mirrors it onto the live activity execution, renews the leased activity task plus the selected run's `next_task_lease_expires_at`, and appends an `ActivityHeartbeatRecorded` history point. Waterline uses that history point as the display authority for historical attempt heartbeat detail. Late heartbeats from a reclaimed older attempt are ignored before they can mutate the newer current attempt.

The upgrade path also backfills older already-started activity executions that predate durable `activity_attempts` into one latest-known attempt row plus `current_attempt_id`. That keeps Waterline's top-level `attempt_id`, `attempt_count`, `last_heartbeat_at`, and `attempts[*]` fields stable across mixed-era preview data, while being explicit that earlier previews did not durably record every older closed attempt separately.

The v2 bridge reads run summaries, typed workflow history, timer waits, failure projections, command history, and activity executions only as a compatibility fallback when older preview runs predate the richer activity payloads. The implemented slices currently cover:

- start with distinct instance and run ids
- durable start command ids with `started_new`, `returned_existing_active`, and `rejected_duplicate` outcomes
- activity scheduling, completion, failure, cancellation, and handled failure continuation
- activity heartbeats that persist `last_heartbeat_at` for the current attempt row, renew the leased activity task, and append typed `ActivityHeartbeatRecorded` history
- timer scheduling, firing, and timer-backed wait visibility in Waterline
- child workflow scheduling, durable parent/child linkage, parent waits while a child run is active, parent-side typed child-resolution history, parent resume on child completion or failure, child-resolution workflow-task repair, and child wait/timeline visibility in Waterline
- named signal waits, accepted signal commands, and signal-applied history visibility in Waterline
- accepted-only submitted updates with worker-applied lifecycle visibility in Waterline
- typed side-effect history visibility in Waterline timelines
- typed version-marker history visibility in Waterline timelines
- continue-as-new lineage with stable instance ids and distinct run ids
- liveness-driven `repair()` commands that recreate the missing durable workflow, child-resolution workflow, accepted-update, accepted-signal, activity, or timer task for runs marked `repair_needed`
- explicit cancel and terminate commands, including `cancelled` and `terminated` terminal run states
- explicit archive commands for closed selected runs, including archived metadata, typed archive history, and `archive_not_needed` handling for already archived runs
- durable next-task and liveness projection data for open activity, timer, workflow-task, and signal-wait states
- typed event-history visibility sourced from durable `workflow_history_events`
- run-summary history budget fields for `history_event_count`, `history_size_bytes`, and `continue_as_new_recommended`
- history-first timeline snapshots for command, task, activity, timer, child, and failure detail, including activity started, heartbeat, and closed timestamps plus timer delay, deadline, fired, and cancelled timestamps, with live row enrichment retained only for remaining compatibility fields
- operator metrics derived from durable run summaries, workflow tasks, activity executions, activity attempts, start commands, and worker compatibility heartbeats for archive counts, backlog, activity retry pressure, start latency, repair, compatibility-blocked, history-budget, and active-worker dashboard signals
- versioned selected-run history exports for replay debugging and offline inspection

In the v2 bridge:

- list routes are still run-centric, with each row keyed by run id while also exposing `instance_id`
- list routes now sort by the durable run-summary contract (`sort_timestamp` descending, then run id) instead of inferring recency from raw ids or Waterline's legacy `workflow_sort_column` setting
- list rows expose both `sort_timestamp` and an opaque `sort_key`; that key encodes the same `sort_timestamp` plus run-id tie-breaker contract that Waterline applies server-side, so polling and page-1 refresh can detect newer rows without assuming numeric or lexicographically ordered ids
- list and detail payloads expose the stable `workflow_type` alongside the stored class name
- detail routes expose run metadata, `closed_reason`, archive metadata (`archived_at`, `archive_command_id`, and `archive_reason`), selected-run `waits` and `tasks` collections, activity and timer compatibility logs, dedicated `activities`, `signals`, and `updates` collections, `exceptions` compatibility rows, chart data, command history, `repair_blocked_reason`, `repair_attention`, `repair_blocked`, `task_problem`, `task_problem_badge`, `can_issue_terminal_commands`, `can_cancel`, `cancel_blocked_reason`, `can_terminate`, `terminate_blocked_reason`, `can_archive`, `archive_blocked_reason`, `can_query`, `query_blocked_reason`, `can_signal`, `signal_blocked_reason`, `can_update`, `update_blocked_reason`, `can_repair`, `read_only_reason`, and the workflow-definition drift fields `workflow_definition_fingerprint`, `workflow_definition_current_fingerprint`, and `workflow_definition_matches_current`
- list and detail payloads also expose the durable `repair_attention` flag plus `repair_blocked` metadata, which turns badge-visible repair blockers such as `unsupported_history` and `waiting_for_compatible_worker` into a searchable bridge without forcing Waterline or saved views to hard-code specific reason codes
- list and detail payloads also expose the durable `task_problem` flag plus `task_problem_badge`, which summarizes replay-blocked workflow tasks, missing workflow-task resume transport, and repeated workflow-task dispatch or claim trouble into a searchable operator-facing badge without promoting older diagnostic-only waits into a repairable resume source
- selected-run `commands`, `signals`, and `updates` now also expose task-linkage fields `current_task_id`, `current_task_status`, `task_transport_state`, `task_ids`, and `task_missing`, so Waterline can show both the currently open backing workflow task and any historically proven durable task ids for the same accepted command lifecycle
- detail routes expose `history_event_count`, `history_size_bytes`, `history_event_threshold`, `history_size_bytes_threshold`, and `continue_as_new_recommended`, so Waterline can warn about runs approaching the configured continue-as-new budget without replaying the workflow or scanning history in the browser
- selected-run `activities`, compatibility `logs`, activity-backed `chartData`, open activity waits, task labels, and run-summary activity liveness now prefer typed `ActivityScheduled`, `ActivityStarted`, `ActivityHeartbeatRecorded`, `ActivityRetryScheduled`, `ActivityCompleted`, `ActivityFailed`, and `ActivityCancelled` snapshots recorded in history, with live `activity_executions` and `activity_attempts` rows kept only as fallback or enrichment for older preview runs; that means Waterline keeps the latest durable attempt count, attempt id, execution-level idempotency key, snapped retry policy, per-attempt task id, worker lease owner, lease expiry, heartbeat state, bounded heartbeat progress, retry-scheduled state, cancellation state, and heartbeat or cancellation timeline points aligned with the currently claimed activity try instead of inheriting stale attempt data from drifted execution, attempt, or task rows. `ActivityHeartbeatRecorded` progress is intentionally compact: selected-run detail and history export expose it as `last_heartbeat_progress` on the activity plus the latest attempt, while the timeline heartbeat entry keeps the same normalized payload for incident breadcrumbs. History export now reuses that same mixed-era activity view for status, unsupported-history diagnostics, synthetic current-attempt visibility, and `diagnostic_only`, so selected-run detail and exported bundles no longer disagree about row-only terminal or open-row fallback activity evidence. For grouped activities, `parallel_group_path` is replay-authoritative only when the typed activity history carries it; older preview rows that have the path only on `activity_executions` should be normalized with `php artisan workflow:v2:backfill-parallel-group-metadata` before replay, query, export, or Waterline projection depends on that barrier identity. Any terminal mutable activity row with no typed activity history is surfaced as unsupported instead of completed, failed, or cancelled: activity and wait rows expose `history_authority = unsupported_terminal_without_history`, `history_unsupported_reason = terminal_activity_row_without_typed_history`, and the mutable status as `row_status`, while mutable result and close timestamp stay hidden from the durable detail contract. The legacy `logs[*]` and `chartData[*]` compatibility arrays now echo that same `history_authority`, `history_unsupported_reason`, and `diagnostic_only` metadata instead of flattening older-row evidence into an apparently normal activity result.
- detail routes now also expose `open_wait_id` plus `resume_source_kind` / `resume_source_id`, so Waterline can name the exact current selected-run wait row or workflow task that the run is blocked on without inferring it from freeform `wait_reason` text
- condition wait rows now include `condition_definition_fingerprint` when the predicate source was available at record time, and replay-blocked workflow tasks include both recorded and current predicate fingerprints when a same-key predicate drift blocks replay
- detail routes now also expose `open_wait_count`, so Waterline can render multi-wait barriers honestly when more than one selected-run wait is open and no single `open_wait_id` should be treated as the whole story
- detail routes also expose `declared_signals`, `declared_signal_contracts`, `declared_updates`, `declared_update_contracts`, `declared_contract_source`, `declared_contract_backfill_needed`, and `declared_contract_backfill_available`, so Waterline can show the selected run's declared command contract alongside current mutability flags, explain whether it came from durable start history, a remaining live-definition fallback, or an unavailable contract, and tell operators whether the current build can still normalize that preview-era snapshot; older preview runs with a usable but incomplete `WorkflowStarted` event can now auto-backfill on the first compatible query, signal, update, selected-run detail, or history-export touch while the current class is loadable, and the background repair/watchdog loop now drains loadable untouched runs in throttled batches as well. Once that cleanup becomes impossible the selected run reports `declared_contract_source = unavailable` even if some target names or parameter fragments still remain visible as compatibility-only evidence
- detail routes also expose the selected run's durably snapped `workflow_definition_fingerprint`, the currently loadable class fingerprint under `workflow_definition_current_fingerprint`, and `workflow_definition_matches_current`, so Waterline can explain when a long-lived run started on a different definition than the one the current build can load before a new `VersionMarkerRecorded` event exists
- detail routes also expose replay-safety diagnostics as `workflow_determinism_status`, `workflow_determinism_source`, and `workflow_determinism_findings`; when the selected run's snapped `workflow_definition_fingerprint` still matches the current loadable class, Waterline renders live-definition findings for obvious workflow-code calls to live database, cache, request/auth context, HTTP, wall-clock, or random sources, and when the fingerprint has drifted it instead returns `workflow_determinism_source = definition_drift` with one warning explaining that current-source findings are no longer authoritative for that run
- detail routes also expose the selected run's `compatibility` marker plus read-time local `compatibility_supported` / `compatibility_reason` fields, the configured `compatibility_namespace`, and fleet `compatibility_supported_in_fleet` / `compatibility_fleet_reason` fields so mixed-fleet operators can distinguish "this build cannot claim it" from "no active worker heartbeat currently advertises that marker"
- selected-run detail now also exposes `compatibility_fleet`, a durable-first list of the active worker heartbeat snapshots in scope. Current workers contribute database-backed snapshots; mixed-fleet reads can also surface the older cache heartbeat format until those workers restart onto the new path. Each row carries `worker_id`, `namespace`, `host`, `process_id`, `connection`, `queue`, `supported`, `supports_required`, `recorded_at`, `expires_at`, and `source`, which is what the current Waterline detail UI uses to show who is actually advertising the marker and whether that row came from the durable table or the legacy cache bridge. When `compatibility_namespace` is non-null, database-backed rows must match that namespace; older cache snapshots still remain visible as rollout fallback, but they surface with `namespace = null` until the older workers restart, so full namespace isolation is only strict once the mixed fleet has moved onto the durable heartbeat path.
- detail routes also expose `parents` and `continuedWorkflows` lineage arrays plus `lineage_projection_source` for parent/child and continue-as-new navigation without relying on legacy relationship pivots
- child-workflow lineage entries in those arrays also expose `child_call_id`, so one parent-issued child invocation stays identifiable even if the child later continues as new
- those lineage arrays now prefer typed child and continue-as-new history, using `workflow_links` only as a compatibility fallback for older preview rows or missing history
- selected-run detail reports `lineage_projection_source = workflow_run_lineage_entries` when Waterline is reading an already-synced lineage projection row set, and `workflow_run_lineage_entries_rebuilt` when the detail read had to recreate missing or stale lineage rows on the fly
- child-workflow lineage entries are deduped by stable `child_call_id`, so one child invocation stays one logical Waterline row even when that child uses `continueAsNew()` and spans several child runs
- `continuedWorkflows` is the child-side lineage array in the current payload shape, so parent runs surface child workflow links there and child runs surface their inverse links in `parents`
- detail routes also expose a `timeline` collection with ordered typed history entries, including event `type`, `kind`, `entry_kind`, `source_kind`, `source_id`, `summary`, `recorded_at`, the workflow step `workflow_sequence`, and related command, activity, timer, child, task, failure, and version metadata when available; side-effect snapshots appear there as typed `SideEffectRecorded` points, and versioning branch points appear there as typed `VersionMarkerRecorded` points with `version_change_id`, `version`, `version_min_supported`, and `version_max_supported` when that marker was durably committed for the selected run
- Waterline also exposes the selected run as a versioned history-export bundle at `GET /waterline/api/instances/{instanceId}/runs/{runId}/history-export`; the legacy run-key bridge remains available at `GET /waterline/api/flows/{runId}/history-export`. The detail screen links to that selected-run export as "Export History", and the app can generate the same artifact from the CLI with `php artisan workflow:v2:history-export {instanceId} --run-id={runId} --output=storage/app/workflow-history/order-123.json --pretty` or `php artisan workflow:v2:history-export {runId} --run --pretty`. The response uses `schema = durable-workflow.v2.history-export` and `schema_version = 1`, includes a per-run `dedupe_key`, and carries ordered `history_events`, export-level selected-run projection metadata under `selected_run`, selected-run scoped `waits` and `timeline`, `commands`, `signals`, `updates`, `tasks`, `activities[*].idempotency_key`, `activities[*].retry_policy`, `activities[*].attempts`, `activities[*].history_authority`, `activities[*].history_event_types`, `activities[*].history_unsupported_reason`, `activities[*].row_status`, `timers[*].history_authority`, `timers[*].diagnostic_only`, `timers[*].history_event_types`, `timers[*].history_unsupported_reason`, `timers[*].row_status`, `failures`, lineage `links`, and archive metadata when the run has been marked archived. The lineage `links` block also exposes `projection_source`, and `selected_run` exposes `waits_projection_source`, `timeline_projection_source`, `timers_projection_source`, and `lineage_projection_source`, so offline replay or debug tooling can tell whether the export came from already-synced selected-run projection rows or from a same-contract on-read rebuild. Activity, activity-attempt, and timer sections use the same history-first snapshots as selected-run detail, so exports retain durable activity identity, retry policy, latest attempt id, per-attempt task id and worker metadata, raw stored activity payloads, timer ids, deadlines, fired timestamps, and cancelled timestamps even if the mutable activity, attempt, task, or timer rows later drift or disappear. Timer snapshots follow one explicit field contract across detail and export: `status` is the authoritative selected-run timer state, `source_status` is the status value reported by that authority, and `row_status` is only the current mutable `workflow_timers.status` diagnostic when a row still exists. A completed, failed, or cancelled activity row without typed activity history exports as `status = unsupported` with `history_authority = unsupported_terminal_without_history`, `history_unsupported_reason = terminal_activity_row_without_typed_history`, and no mutable result or close timestamp. A fired or cancelled timer row without typed timer history exports as `status = unsupported`, `diagnostic_only = true`, `history_authority = unsupported_terminal_without_history`, `history_unsupported_reason = terminal_timer_row_without_typed_history`, no mutable fired timestamp, and the mutable terminal state only as `row_status`. It also includes `payloads.codec` plus the stored argument and output payloads so offline replay/debug tools can decode them with the same codec boundary the run used. When `workflows.v2.history_export.redactor` points at a `Workflow\V2\Contracts\HistoryExportRedactor` or callable, Waterline and CLI exports run that policy over payload and failure-diagnostic slots before returning the bundle and expose `redaction.applied`, `redaction.policy`, and `redaction.paths` in the same response. Each bundle carries an `integrity` block computed after redaction: `canonicalization = json-recursive-ksort-v1`, `checksum_algorithm = sha256`, and a SHA-256 `checksum`; configure `workflows.v2.history_export.signing_key` and optionally `signing_key_id` to add `signature_algorithm = hmac-sha256`, `signature`, and `key_id` for downstream artifact verification. Terminal runs set `history_complete = true`; open runs are point-in-time snapshots and should not be treated as final archive artifacts.
- selected-run `exception_count`, compatibility `exceptions[*]`, timeline `failure`, and history-export `failures[*]` now prefer typed failure history, including parent-side `ChildRunFailed` events and `FailureHandled` events recorded after a workflow actually catches a thrown activity or child failure. Waterline-compatible detail and export views keep the durable `exception_type` alias, exception class, resolved replay class, resolution source, message, code, file, line, trace frames, declared custom properties, child-failure `source_kind = child_workflow_run` metadata, and handled disposition even if the mutable failure row later drifts or disappears. When selected-run detail or history export can only recover a failure from an older `workflow_failures` row, that exception/failure payload now carries `history_authority = failure_row_fallback` and `diagnostic_only = true`, so operators can see that the replay metadata is compatibility-only rather than typed failure history. The `workflow:v2:backfill-failure-types` command also normalizes older `FailureHandled` timeline markers, so handled entries render the same durable exception alias after cleanup. Multiple failure snapshots are ordered by committed history sequence when present, then by failure timestamp and id, and that order is preserved in selected-run detail and history exports. Resolution source is one of `exception_type`, `class_alias`, `recorded_class`, `unresolved`, `misconfigured`, or `unrestorable`, with `exception_resolution_error` populated for invalid mappings or unrestorable throwable classes. When the source is `unresolved`, `misconfigured`, or `unrestorable`, `exception_replay_blocked = true`; query replay raises `UnresolvedWorkflowFailureException`, and worker replay leaves the run open with a failed task until the mapping is corrected and the run is repaired.
- each supported wait row describes one selected-run resume source with `kind`, `status`, `source_status`, `resume_source_kind`, and either task metadata or `external_only = true`; current kinds include `activity`, `timer`, `child`, `signal`, `condition`, and `update`. For timer waits specifically, `status` is the coarse operator wait state derived from the authoritative timer snapshot (`open`, `resolved`, `cancelled`, or `unsupported`), `source_status` keeps the authoritative timer status value (`pending`, `fired`, or `cancelled`), and `row_status` stays reserved for mutable timer-row diagnostics. Unsupported older terminal activity, timer, and child diagnostics instead set `diagnostic_only = true`, keep `history_authority`, `history_unsupported_reason`, and mutable `row_status`, and omit `resume_source_kind` / `resume_source_id` because they are not durable resume paths
- accepted update lifecycles now also appear as `kind = update` waits with `update_id`, `open_wait_id = update:{update_id}`, and `resume_source_kind = workflow_update`; when the worker still owes that application, Waterline shows the accepted update as the current wait even if the underlying workflow is otherwise parked on a longer-lived signal, child, or timer wait
- write-side update commands accept only `wait_for = accepted` or `wait_for = completed`; omitting `wait_for` keeps the `completed` default, while `wait_for = status` is reserved for update lookup responses such as `GET .../updates/{updateId}` and `WorkflowStub::inspectUpdate()`
- child wait rows also expose `child_call_id`, which is the stable parent-issued child invocation id rather than the mutable current child run id; when the parent has already recorded child-resolution history and an open parent workflow task is applying that result, the wait row is task-backed by that workflow task
- when the selected run currently has one open wait, `open_wait_id` names that exact wait row; when the selected run is instead sitting on an open workflow task, `open_wait_id` becomes `workflow-task:{taskId}` and `resume_source_kind = workflow_task`
- signal wait rows also expose `signal_wait_id` and, once a signal is received or applied on new v2 rows, `signal_id`, so repeated waits for the same `target_name` remain distinguishable without inferring identity from FIFO name matching alone
- condition waits expose `condition_wait_id`; when the workflow supplied an optional condition key, they also expose `condition_key` and mirror it into `target_name` as the stable operator label for that predicate
- timeout-backed condition waits also expose `timeout_seconds` while keeping the wait itself as `kind = condition` instead of splitting it into a separate synthetic timer wait; their timer task and timer detail carry the same `condition_key` when one was recorded
- timeout-backed condition waits rebuild their `deadline_at`, `resume_source_kind`, and `resume_source_id` from typed `ConditionWait*` plus condition-timeout `TimerScheduled` history first, and cancelled timeout timers rebuild from typed `TimerCancelled` history, so selected-run detail survives missing or drifted live timer rows without losing the timeout transport identity or final cancelled status. After a timeout is scheduled in typed history, Waterline keeps the wait pending until matching `TimerFired` history exists; a live timer row that drifted to `fired` does not change the wait by itself.
- after a timeout-backed condition wait records `TimerFired`, selected-run detail keeps the wait open with `source_status = timeout_fired` until a workflow task applies `ConditionWaitTimedOut`; if that workflow task is missing, the synthetic task row uses `type = workflow`, `workflow_wait_kind = condition`, the original `condition_wait_id`, `timer_id`, and the timer resume source
- resolved signal waits also carry the snapped `command_sequence`, `command_status`, and `command_outcome` from typed history, so Waterline can still explain which accepted signal satisfied that wait even if the mutable command row later drifts or disappears
- `task_backed = true` now means the wait still has an open durable backing task in `ready` or `leased` state
- for accepted update waits, `task_backed = true` also requires that open workflow task to carry matching `workflow_update_id`, `workflow_command_id`, `open_wait_id`, or `workflow_update` resume-source provenance; unrelated signal, child, condition, or other workflow tasks do not satisfy the update wait
- `task_backed = false` on an open timer wait or on an open `pending` activity wait means the run still has the durable wait source row but has lost the matching open task, which is the operator-facing condition behind `liveness_state = repair_needed`; older open mutable rows with `history_authority = mutable_open_fallback` are different, because those waits are diagnostic-only and do not count as durable repair candidates
- when `task_backed = false` but `task_id`, `task_type`, and `task_status` are still populated, Waterline is showing historical or stale task metadata for that wait rather than a healthy current backing task
- when an open repairable wait has lost its open task row, selected-run `tasks` now also includes a synthetic diagnostic row with `status = missing`, `transport_state = missing`, `task_missing = true`, and the same activity, timer, update, signal, child-resolution, retry, condition-wait, or command identity that repair will use to recreate transport; if typed retry history named the lost retry task, that value appears as `expected_task_id`
- when a non-terminal selected run has no open semantic wait and no open workflow task row, selected-run `tasks` includes a generic synthetic workflow row with `id = missing:workflow:{run_id}`, `status = missing`, and `transport_state = missing`, making the no-durable-resume-source invariant visible in the same task table as other transport loss
- timeout-backed condition waits are intentionally both `external_only = true` and task-backed, because either an external durable input can satisfy the predicate first or the timeout timer task can resume the run later
- a `running` activity wait with `task_backed = false` is surfaced instead as `liveness_state = activity_running_without_task` only when typed activity history still authoritatively says that activity is in flight, which keeps the run observable but intentionally suppresses Repair to avoid duplicating in-flight work
- active child waits are intentionally not task-backed because the durable resume source is the child run chain itself, not a separate child task row on the parent; once the parent records `ChildRunCompleted`, `ChildRunFailed`, `ChildRunCancelled`, or `ChildRunTerminated`, the parent resume workflow task becomes the task-backed transport for applying that child result
- `wait_kind = child` with `liveness_state = waiting_for_child` is a healthy durable wait while the parent is blocked on an active child run
- `wait_kind = child` with `liveness_state = repair_needed` means the parent has already committed child-resolution history, but the workflow task that should apply that result is missing; selected-run detail keeps `open_wait_id = child:{child_call_id}`, `resume_source_kind = child_workflow_run`, and a synthetic missing task row with `workflow_wait_kind = child`, `child_call_id`, and `child_workflow_run_id`
- waits opened by one `all([...])` barrier expose `parallel_group_kind`, `parallel_group_id`, `parallel_group_base_sequence`, `parallel_group_size`, and `parallel_group_index`; Waterline uses that metadata plus `open_wait_count` to show several open waits as one fan-in barrier, with `parallel_group_kind = mixed` and `parallel-calls:*` ids when the same barrier combines child workflows and activities
- when one open wait belongs to nested `all([...])` barriers, those top-level `parallel_group_*` fields describe the innermost enclosing group and `parallel_group_path` preserves the full outer-to-inner barrier path for operator displays and compatibility bridges
- for those grouped waits, any failed activity or failed/cancelled/terminated child still wakes the parent immediately, while successful member closures do not create a parent workflow task until the last successful member in the group closes
- if that child uses `continueAsNew()`, the selected-run wait and lineage surfaces follow the newest parent-recorded `ChildRunStarted` for that `child_call_id` instead of pinning the parent to the original child run id or trusting only the child instance's mutable current-run pointer
- while a parent run is still waiting on a child, selected-run detail now keeps that child wait open from the parent's own `ChildWorkflowScheduled` / `ChildRunStarted` history even if the mutable child run row drifts to a terminal state before the parent commits its corresponding `ChildRun*` resolution event
- child lineage links may still carry preview-era `parallel_group_path` diagnostics for grouped child waits, but Waterline and child-closure transport treat that barrier identity as authoritative only after matching typed `ChildWorkflowScheduled`, `ChildRunStarted`, or `ChildRun*` resolution history carries the path; use `php artisan workflow:v2:backfill-parallel-group-metadata` to normalize compatible older link rows first
- once a parent run records `ChildRunCompleted`, `ChildRunFailed`, `ChildRunCancelled`, or `ChildRunTerminated`, selected-run detail keeps that child wait resolved from parent history even if the mutable child run row later drifts; child terminal history and legacy link rows remain diagnostic or lineage enrichment, but they do not replace missing parent typed child step history for replay
- if a yielded child step only has a terminal child row or link and no parent typed child history, worker and query replay block with `history_shape_mismatch` and recorded events `no typed history`; Waterline reports `liveness_state = workflow_replay_blocked`, marks the selected child wait `status = unsupported`, exposes `history_authority = unsupported_terminal_without_history` and `history_unsupported_reason = terminal_child_link_without_typed_parent_history`, preserves child identity through `target_name`, `child_call_id`, and `child_workflow_run_id` when available, and omits `resume_source_kind` / `resume_source_id` because that wait is diagnostic-only
- if an open activity, timer, or child wait only survives as older mutable state with no typed history, Waterline still lists that wait with `status = open`, `history_authority = mutable_open_fallback`, and `diagnostic_only = true`, but the selected run clears top-level `wait_kind`, `open_wait_id`, and `resume_source_*`, projects `liveness_state = workflow_replay_blocked`, and sets `repair_blocked_reason = unsupported_history` plus `repair_attention = true` because that mutable row or link is observability-only rather than a durable resume source
- `wait_kind = signal` with `liveness_state = waiting_for_signal` is a healthy external wait, not a repair condition
- `wait_kind = update` means the selected run has already accepted a durable update lifecycle that the workflow worker still needs to apply; if the matching backing workflow task drifts away, selected-run detail keeps the update wait open and flips `liveness_state = repair_needed` so operators repair the missing transport instead of mistaking the run for a healthy signal, child, or timer wait. New, reused, and repaired update workflow tasks expose `workflow_update_id`, `workflow_command_id`, `workflow_wait_kind = update`, the open wait id, and the `workflow_update` resume source in the selected-run task detail.
- `wait_kind = signal` with `liveness_state = repair_needed` means a signal has already been durably received but the workflow task that should apply it is missing; selected-run detail keeps `open_wait_id = signal-application:{signal_id}` when the lifecycle row exists, `resume_source_kind = workflow_signal`, and new or repaired signal workflow tasks expose `workflow_signal_id`, `workflow_command_id`, `workflow_wait_kind = signal`, the open wait id, and the signal resume source.
- if a preview-era accepted signal or update still only has command plus typed-history evidence, selected-run detail may briefly show the command-based fallback identity; once repair or `workflow:v2:backfill-command-lifecycles` normalizes that lifecycle row, the same selected run switches to durable `workflow_signal` or `workflow_update` ids without changing the underlying accepted command sequence.
- `wait_kind = condition` with `liveness_state = waiting_for_condition` is a healthy predicate wait; if it also has `resume_source_kind = timer`, Waterline is showing a timeout-backed condition wait whose timer task is only the timeout transport, and that timeout identity now comes from typed condition-wait plus timer-schedule history rather than from the live timer row alone. If the timeout already fired but the workflow has not applied it, the same condition wait moves to `liveness_state = repair_needed` when the resume workflow task is missing.
- `liveness_state = workflow_replay_blocked` means either a workflow task reached a deterministic replay guard before committing new history or the selected run only has unsupported diagnostic state instead of a durable typed resume path. For keyed condition waits, selected-run task detail exposes `transport_state = replay_blocked`, `replay_blocked_reason = condition_wait_definition_mismatch`, the workflow sequence, the recorded condition key, and the key yielded by the current build. If replay finds a different typed step already recorded at that sequence, the task uses `replay_blocked_reason = history_shape_mismatch` plus `replay_blocked_expected_history_shape` and `replay_blocked_recorded_event_types`; this applies to activity, child-workflow, pure timer, signal-wait, side-effect, version-marker, continue-as-new, and `all([...])` leaf sequences, not only condition waits. When there is no replay-blocked task and the selected waits instead expose `history_authority = mutable_open_fallback` or `unsupported_terminal_without_history`, the run is blocked on unsupported history and Waterline hides Repair with `repair_blocked_reason = unsupported_history` plus `repair_attention = true` instead of synthesizing a new durable task from those mutable rows.
- after a `SignalReceived` history event, that external wait is resolved; the selected run should then surface either the backing workflow task state with signal-application payload metadata or the accepted-signal application repair state until worker recovery or manual repair restores the missing workflow task
- accepted and rejected signal commands also surface in the dedicated selected-run `signals` table, backed by `workflow_signal_records` on new runs and by command/history fallback only until `php artisan workflow:v2:backfill-command-lifecycles` normalizes older preview rows into that same lifecycle contract
- when several same-name signals are accepted before a later wait opens, command sequence remains authoritative for ordering; Waterline shows the per-step `sequence`, the matching wait row's snapped `command_sequence`, and the matching `SignalReceived`, `SignalWaitOpened`, and `SignalApplied` entries now share the same durable `signal_wait_id` for that accepted command
- when an earlier accepted signal has already been received for the selected run but is not yet applied, Waterline keeps `can_signal = true` and flips `can_update = false` with `update_blocked_reason = earlier_signal_pending`; the runtime no longer drains that workflow task inline on the update caller path
- when the selected run already has an open ready task or an expired leased task but neither the current build nor any active worker heartbeat snapshot advertises that task's effective compatibility marker, the run surfaces `*_task_waiting_for_compatible_worker` instead of `repair_needed`, and `can_repair` stays `false`
- in that compatibility-blocked case, selected-run detail now also sets `repair_blocked_reason = waiting_for_compatible_worker` plus `repair_attention = true` instead of leaving operators to infer it from `liveness_state` alone
- `liveness_state = repair_needed` means the selected current run either lost its durable next-resume task or still has one whose last actionable transport state is unhealthy, such as `dispatch_failed`, `dispatch_overdue`, or an expired lease, so Waterline can surface a Repair action for it
- command history exposes the durable start outcome alongside command status and rejection reason
- command history also exposes a stable per-run `sequence` for each accepted or rejected command
- older preview runs that still had `command_sequence = null` are backfilled into that same per-run order before later commands are recorded, so Waterline keeps one durable command timeline even while a preview deployment is being upgraded
- command history also exposes `target_name` for named commands such as v2 signals and aliased v2 updates, while accepted repair commands surface `repair_dispatched` or `repair_not_needed`
- command history now also exposes `payload_available`, `payload_codec`, and `payload`, so Waterline can inspect the durable accepted input for start, signal, update, and repair commands without scraping raw engine rows
- command history also exposes `validation_errors` for rejected signal or update commands, so Waterline can show contract mismatches such as missing required arguments, unknown named arguments, type mismatches, or nullability violations without replaying the workflow class
- selected-run update detail now also exposes one row per durable update lifecycle, so Waterline no longer has to reconstruct update state entirely from command plus timeline joins
- when a workflow declares `#[UpdateMethod('public-name')]`, `declared_updates`, `declared_update_contracts`, command `target_name`, and timeline `update_name` all use that durable alias instead of the PHP method name
- rejected signal and update commands keep their typed `rejection_reason`, so Waterline can distinguish `unknown_signal`, `unknown_update`, `earlier_signal_pending`, `workflow_definition_unavailable`, and run-state rejection without replay
- rejected updates on an existing selected run also append typed `UpdateRejected` timeline entries, so Waterline's timeline and command table agree on the rejected target, sequence, outcome, and rejection reason, including `rejected_workflow_definition_unavailable` when the target is durably declared but the workflow definition cannot be replayed
- command history now also exposes durable command-ingress metadata so Waterline can tell whether a command came from PHP, a public webhook, the Waterline operator UI, or another workflow run; workflow-originated start commands carry the parent instance id, parent run id, workflow step, and any inherited `child_call_id` in `commands[*].context.workflow`
- cancel and terminate commands now carry an optional `commands[*].reason` field with the caller- or operator-provided reason string; the same reason is persisted in both the `CancelRequested`/`TerminateRequested` and `WorkflowCancelled`/`WorkflowTerminated` typed history events so audit trails, history exports, and offline analysis can distinguish user-driven, policy-driven, and operator-driven interruption without replaying the command payload
- the detail lookup can resolve either a selected run id or the public instance id of the current run
- that instance-scoped detail and operator lookup resolves the current run from typed continue-as-new lineage first and falls back to durable run ordering only when no lineage evidence exists, instead of trusting only `workflow_instances.current_run_id`
- detail and history-export payloads expose that resolution path as `current_run_source`, currently `continue_as_new_lineage` or `run_order_fallback`
- historical-run detail payloads also expose the current active run pointer so the UI can navigate back to the active execution quickly
- Waterline operator commands now use canonical instance-scoped routes for current-run actions while still recording accepted and rejected outcomes as durable v2 command records; the current detail screen uses normalized `declared_signal_targets` and `declared_update_targets` arrays plus `declared_contract_source` to drive operator-facing Signal and Update forms instead of inventing target names from live PHP reflection, while the older `declared_signals`, `declared_signal_contracts`, `declared_updates`, and `declared_update_contracts` fields remain available as compatibility metadata; selected-run detail also exposes `declared_entry_method`, `declared_entry_mode`, and `declared_entry_declaring_class` so operators can tell whether the run was started from the canonical `handle()` contract or the legacy `execute()` compatibility path. Those normalized target arrays stay present even when the selected run reports `declared_contract_source = unavailable`, so partial legacy snapshots can remain observable without being treated as authoritative
- mutable detail views are limited to the current selected run while it is still open; historical runs and closed current runs are read-only
- dashboard stats are served by `OperatorObservabilityRepository::dashboardSummary()` and derived from the run-summary projection, including total runs, recent run starts, max wait, max duration, and max exceptions. This keeps the dashboard endpoint on the same replaceable operator-observability boundary as selected-run detail, history export, and the deeper `operator_metrics` payload.
- dashboard stats now also include `engine_source` plus `operator_metrics`. `engine_source` reports `configured`, `resolved`, `uses_v2`, `v2_operator_surface_available`, a stable readiness `status`, an operator-facing `message`, any surfaced `issues`, and the inspected `required_tables` list. `operator_metrics` remains the v2-only object with `generated_at`, `runs`, `tasks`, `activities`, `backlog`, `repair`, `starts`, `history`, `projections`, `command_contracts`, `workers`, `backend`, `update_wait`, and `repair_policy` groups. `runs` counts total, current, running, completed, failed, cancelled, terminated, archived, `repair_needed`, `claim_failed`, and `compatibility_blocked` selected-run summaries. `tasks` counts open, ready, due-ready, delayed, leased, dispatch-failed, claim-failed, dispatch-overdue, lease-expired, and unhealthy durable workflow tasks. `activities` counts open, pending, running, retrying, failed attempts, and max attempt count from durable activity executions and attempts. `backlog` mirrors the operator-actionable counts as `runnable_tasks`, `delayed_tasks`, `leased_tasks`, `retrying_activities`, `unhealthy_tasks`, `repair_needed_runs`, `claim_failed_runs`, and `compatibility_blocked_runs`. `repair` exposes the worker-loop candidate pressure as `existing_task_candidates`, `missing_task_candidates`, `total_candidates`, `scan_limit`, `scan_strategy = scope_fair_round_robin`, selected existing-task and missing-run counts for the next pass, per-phase scan-limit flags, `scan_pressure`, oldest-candidate timestamps, max candidate ages, and per-scope rows grouped by `connection`, `queue`, and `compatibility` so operators can tell whether repair sweeps are keeping up, which queue scope is consuming the repair budget, and whether each scope was selected or limited by the fair scan. Tasks with repeated dispatch or claim failures keep their failure counts visible, expose `repair_available_at` in selected-run task detail, and are omitted from `repair` candidate counts until that timestamp arrives. `starts` exposes pending start runs, accepted pending start commands, due first workflow tasks, the oldest pending start timestamp, and `max_pending_ms` so dashboards can track workflow-start latency without reading queue internals. `history` exposes `continue_as_new_recommended_runs`, `max_event_count`, `max_size_bytes`, `event_threshold`, and `size_bytes_threshold` from run summaries. `projections.run_summaries` exposes durable run count, summary count, missing summary count, stale summary count, orphaned summary count, rebuild-needed count, and oldest/newest summary update timestamps so operators can tell when list and dashboard views need a rebuild. `projections.run_waits` exposes wait projection row count, projected-run count, canonical wait-run count, projected canonical wait-run count, missing wait-run count, stale projected wait-run count, summaries with current open waits, missing current open-wait rows, rebuild-needed count, and oldest/newest wait update timestamps. `projections.run_timeline_entries` exposes history-event count, timeline row count, projected-run count, canonical history-run count, projected canonical history-run count, missing history-run count, stale projected history-run count, missing history-event rows, orphaned timeline rows, rebuild-needed count, and oldest/newest timeline update timestamps. `projections.run_timer_entries` exposes timer row count, projected-run count, canonical timer-run count, projected canonical timer-run count, missing timer-run count, stale projected timer-run count, `legacy_schema_runs`, `legacy_schema_rows`, orphaned timer rows, rebuild-needed count, and oldest/newest timer update timestamps, so dashboards can tell whether timer rebuild pressure is ordinary drift or still coming from `schema_version = 0` rows. `projections.run_lineage_entries` exposes lineage row count, projected-run count, canonical lineage-run count, projected canonical lineage-run count, missing lineage-run count, stale projected lineage-run count, orphaned lineage rows, rebuild-needed count, and oldest/newest lineage update timestamps. `command_contracts` exposes `backfill_needed_runs`, `backfill_available_runs`, and `backfill_unavailable_runs`, so the dashboard can show how many selected runs still need preview-era query, signal, or update contracts durably normalized and whether the current build can do that work. Background repair/watchdog passes now clear loadable untouched runs in throttled batches, and compatible selected-run detail and history-export reads still clear one run at a time; use `php artisan workflow:v2:repair-pass` to force an immediate batch, `php artisan workflow:v2:backfill-command-contracts --dry-run` and then the same command without `--dry-run` to batch-normalize or clean up before a class move, and `php artisan workflow:v2:rebuild-projections --needs-rebuild --prune-stale` when that cleanup should run alongside selected-run projection repair. `--needs-rebuild` uses the same canonical wait, timeline, timer, and lineage projector comparisons that selected-run detail and history export use, so stale selected-run payload drift is repaired even when the row set is still present. `workers` exposes `compatibility_namespace`, `required_compatibility`, `active_workers`, `active_worker_scopes`, and `active_workers_supporting_required` from the database-backed compatibility heartbeat snapshots plus the mixed-fleet cache fallback. `backend` exposes the same database, queue, and cache capability snapshot returned by `php artisan workflow:v2:doctor --json`, including blocking `issues` such as `queue_sync_unsupported`; Waterline renders this snapshot and any claim-failed task/run counts on the v2 operator dashboard so backend problems are visible before opening a selected run. `update_wait` exposes the active `completion_timeout_seconds` and `poll_interval_milliseconds` values used by completion-waiting update calls before they fall back to an accepted lifecycle. `repair_policy` exposes the active `redispatch_after_seconds`, `loop_throttle_seconds`, `scan_limit`, `scan_strategy`, `failure_backoff_max_seconds`, and `failure_backoff_strategy` values used by worker-loop repair and dispatch-overdue metrics.

For on-demand operations, `php artisan workflow:v2:repair-pass` runs one immediate sweep with that same repair policy and emits the selected-candidate and repaired-task counts directly. The default command path bypasses the loop throttle so operators can force a repair pass after a deploy or during incident response; add `--respect-throttle` if the command should skip work when the background loop already owns the throttle window, or `--json` when dashboards and scripts want the raw report. The command now exits non-zero when any selected existing-task repair, missing-task reconstruction, or command-contract backfill fails, so alerting and deployment tooling can treat those operator-visible failures as actionable instead of parsing stderr heuristically.
- Waterline exposes `GET /waterline/api/v2/health` as the v2 health-check endpoint behind the same Waterline route middleware and authorization gate as the dashboard API. It now includes `engine_source` at the top level and prepends an `engine_source` check ahead of the deeper v2 checks. If Waterline is not actively using v2, because `engine_source=auto` fell back to v1, `engine_source=v1` is pinned, or `engine_source=v2` is pinned but incomplete, the endpoint returns HTTP `503` with the readiness payload instead of pretending the v2 bridge is healthy. Once v2 is active, it returns the same operator metrics plus a `checks` array for `backend_capabilities`, `run_summary_projection`, `selected_run_projections`, `task_transport`, `durable_resume_paths`, `command_contract_snapshots`, and `worker_compatibility`; hard backend capability errors return HTTP `503`, while projection, task, durable-resume-path, remaining preview-era command-contract normalization pressure, and worker-compatibility issues are returned as warnings so a web health check does not fail just because repairable work exists.
- failed, cancelled, and terminated runs expose the same closed-at and duration semantics as completed runs
- v2 list/detail payloads now also expose `is_terminal`, so Waterline and other operator clients can tell at a glance whether a selected run is closed without inferring that only from the raw `status`
- v2 list/detail payloads also expose `business_key` and `visibility_labels`, copied from the start metadata onto the durable run-summary projection and selected-run detail
- `cancelled` and `terminated` still map into `status_bucket = failed` as the compatibility bridge, but current Waterline builds now use the raw `status` to expose dedicated `failed`, `cancelled`, and `terminated` list views instead of collapsing every non-completed terminal state into one screen
- the activity table stays activity-only, but it now exposes the execution-level idempotency key, snapped retry policy, attempt count, separate started, heartbeat, and closed timestamps, one `attempts[*]` row per try rebuilt from typed activity history first, and prefers typed activity history snapshots over live `activity_executions` or `activity_attempts` rows for status and identity, so timer waits stay visible in the timeline without also showing up as fake activities and completed, cancelled, and currently running activity detail survive mutable-row drift. If typed history only proves that an activity was scheduled, started, heartbeated, or retry-scheduled, Waterline keeps that activity open even when the mutable execution row says it later closed. Those older open-row fallbacks now carry `history_authority = mutable_open_fallback` plus `diagnostic_only = true`, so operators can keep the breadcrumb without mistaking it for a durable resume source. Terminal activity result and close time require typed `ActivityCompleted`, `ActivityFailed`, or `ActivityCancelled` history. If only a completed, failed, or cancelled terminal mutable activity row exists, Waterline shows `status = unsupported` with the unsupported history reason, sets `diagnostic_only = true`, and keeps the mutable status as `row_status` for diagnostics. Each attempt row also exposes `can_continue`, `cancel_requested`, and `stop_reason`, matching the `ActivityTaskBridge::heartbeatStatus()` contract external activity workers use to observe cancellation or stale-attempt stop conditions
- timeout tasks created by `awaitWithTimeout()` also surface `condition_wait_id` on the selected-run `tasks` collection, so Waterline can label them as condition-timeout transport instead of as generic unrelated timers

Route examples:

```text
GET  /waterline/api/instances/order-123
GET  /waterline/api/instances/order-123/history-export
GET  /waterline/api/instances/order-123/runs/01J10000000000000000000021
GET  /waterline/api/instances/order-123/runs/01J10000000000000000000021/history-export
POST /waterline/api/instances/order-123/signals/name-provided
POST /waterline/api/instances/order-123/updates/mark-approved
POST /waterline/api/instances/order-123/cancel
POST /waterline/api/instances/order-123/repair
POST /waterline/api/instances/order-123/terminate
POST /waterline/api/instances/order-123/archive
POST /waterline/api/instances/order-123/runs/01J10000000000000000000021/signals/name-provided
POST /waterline/api/instances/order-123/runs/01J10000000000000000000021/updates/mark-approved
POST /waterline/api/instances/order-123/runs/01J10000000000000000000021/cancel
POST /waterline/api/instances/order-123/runs/01J10000000000000000000021/repair
POST /waterline/api/instances/order-123/runs/01J10000000000000000000021/terminate
POST /waterline/api/instances/order-123/runs/01J10000000000000000000021/archive
POST /waterline/api/instances/order-123/runs/01J10000000000000000000021/queries/current-stage
GET  /waterline/flows/instances/order-123/runs/01J10000000000000000000021
GET  /waterline/api/flows/01J10000000000000000000021
GET  /waterline/api/flows/01J10000000000000000000021/history-export
GET  /waterline/api/flows/order-123
GET  /waterline/api/v2/health
POST /waterline/api/flows/order-123/queries/current-stage
POST /waterline/api/flows/order-123/signals/name-provided
POST /waterline/api/flows/order-123/updates/mark-approved
POST /waterline/api/flows/order-123/archive
```

The canonical Waterline detail route is now instance-scoped with an explicit selected run. `GET /waterline/api/instances/{instanceId}` resolves the instance's current run, while `GET /waterline/api/instances/{instanceId}/runs/{runId}` pins one concrete selected run inside that instance. `GET /waterline/api/instances/{instanceId}/history-export` now exports the same current run that the instance detail route resolves, so current-run detail and current-run export stay aligned under continue-as-new lineage and current-run-pointer drift. Historical exports remain explicitly run-scoped under `/waterline/api/instances/{instanceId}/runs/{runId}/history-export`. Waterline now exposes both instance-targeted current-run operator routes and explicit selected-run operator routes under the same `/instances/{instanceId}` prefix. The legacy `/waterline/api/flows/{id}` lookup and `/waterline/api/flows/{id}/{command}` operator routes still work as compatibility bridges for either a run id or the public instance id of the current run, and the legacy bucket preview routes hydrate through the same selected-run payload before redirecting to the canonical detail route.

For list screens, the current Waterline build now exposes:

- `/waterline/api/flows/running` for open runs in the running bucket
- `/waterline/api/flows/completed` for raw `status = completed`
- `/waterline/api/flows/failed` for raw `status = failed`
- `/waterline/api/flows/cancelled` for raw `status = cancelled`
- `/waterline/api/flows/terminated` for raw `status = terminated`

The last three are all terminal views. `cancelled` and `terminated` still carry `status_bucket = failed` in each row for compatibility, but the list routing no longer forces operator-driven closures to share the exact same screen as actual failures.

Those list routes also accept exact-match filters for `instance_id`, `run_id`, `namespace`, `workflow_type`, `business_key`, `compatibility`, `declared_entry_mode`, `declared_contract_source`, `declared_contract_backfill_needed`, `declared_contract_backfill_available`, `connection`, `queue`, `status`, `status_bucket`, `closed_reason`, `wait_kind`, `liveness_state`, `repair_blocked_reason`, `repair_attention`, `task_problem`, `is_current_run`, `continue_as_new_recommended`, `archived`, and `is_terminal`. Visibility labels can be filtered with either `label[key]=value` or `labels[key]=value`, and search attributes with `search_attribute[key]=value` or `search_attributes[key]=value`, for example:

```text
GET /waterline/api/flows/running?declared_entry_mode=compatibility&declared_contract_source=live_definition&declared_contract_backfill_needed=true&repair_blocked_reason=unsupported_history&workflow_type=billing.invoice-sync&instance_id=order-123&label[tenant]=acme&search_attribute[priority]=high
```

Selected-run detail and history export also return `memo`, but `memo` is intentionally not part of the list-filter contract, run-summary projection, or saved-view matching. Use `business_key`, `visibility_labels`, and `search_attributes` for searchable fleet metadata, and use `memo` for returned-only per-run context.

That searchable-versus-returned-only boundary is now machine-readable too: `visibility_filters.definition.indexed_metadata` describes the exact-match searchable metadata that Waterline can persist in saved views today (including `business_key`, `labels`, and `search_attributes`), while `visibility_filters.definition.detail_metadata` calls out returned-only metadata such as `memo` that stays visible on selected-run detail and history export but never participates in list filtering or saved-view matching.

Each list response now also echoes the resolved filter contract under `visibility_filters`:

- `version`: the current workflow visibility filter contract version. Current builds emit `5` and still support saved views written against versions `1` through `5`. Versions `1` and `2` are deprecated but remain loadable; updating a deprecated saved view rewrites it onto the current version
- `minimum_supported_version`: the oldest filter version the current build will accept
- `deprecated_versions`: filter versions that are still loadable but should be migrated to the current version
- `reserved_view_id_prefix`: the ID prefix reserved for system views (currently `system:`); custom views must not use this prefix
- `bucket`: the list bucket that was queried
- `definition`: the exact-match field and label contract the current build understands, including field labels, editor input types, bounded-field option catalogs, query-parameter names, ordering, field help text, label-editor metadata such as the accepted key pattern and placeholder, plus `indexed_metadata` and `detail_metadata` entries that distinguish searchable saved-view-compatible operator metadata from returned-only detail metadata
- `applied`: the merged filters after Waterline resolves any saved view and overlays the current query string
- `saved_view`: the resolved saved-view payload when the request used `?view=...`

Waterline v2 saved views persist those same exact-match filters server-side:

```text
GET  /waterline/api/saved-views?bucket=running
POST /waterline/api/saved-views
PUT  /waterline/api/saved-views/{viewId}
DELETE /waterline/api/saved-views/{viewId}
GET  /waterline/api/flows/running?view=01J20000000000000000000000
```

A saved view records `name`, `bucket`, `scope`, `shared`, `filter_version`, and normalized `filters` using the workflow v2 visibility filter contract. `GET /waterline/api/saved-views?bucket=...` now also returns `filter_definition`, `supported_filter_versions`, and `version_evolution` so operator clients can render the same current field contract they save against, inspect deprecation status, and understand upgrade policy, even if no custom views exist yet. Each saved-view payload echoes `filter_version_supported`, `filter_version_deprecated`, `filter_version_status`, `filter_version_message`, `current_filter_version`, `minimum_supported_filter_version`, and `supported_filter_versions`, so mixed-era rows are inspectable before an operator applies or updates them. When `filter_version_deprecated` is `true`, the saved view is still loadable but should be updated to the current version; the `filter_version_message` explains the recommended action. When a selected custom view's `filter_version` is not supported by the current build, Waterline still returns the saved-view payload but marks `visibility_filters.saved_view_applied = false` and echoes the warning under `visibility_filters.saved_view_warning`; the list falls back to any direct query-string filters instead of silently pretending the outdated saved filters still applied. Updating that saved view rewrites it onto the current filter contract version. Current Waterline builds consume the shared definition plus the list route's echoed `visibility_filters.definition` to render the list-screen filter editor instead of keeping a separate hard-coded field schema in the browser, including select controls for bounded fields such as `status`, `status_bucket`, `closed_reason`, `wait_kind`, `repair_blocked_reason`, `declared_entry_mode`, and `declared_contract_source` plus booleans such as `repair_attention`, `task_problem`, `is_current_run`, `continue_as_new_recommended`, `declared_contract_backfill_needed`, and `declared_contract_backfill_available`. The same echoed definition now also exposes searchable `business_key`, `labels`, and `search_attributes` metadata separately from returned-only `memo`, so Waterline can tell operators exactly which visibility metadata is indexed and saved-view-compatible before they try to save or share a view. The `repair_blocked_reason` option catalog now also carries the operator-facing description, severity tone, and `badge_visible` hint that Waterline uses for repair-triage badges, and `repair_attention` turns that same badge-visible subset into one durable/searchable saved-view filter, so the browser no longer has to keep its own reason map or hard-code a list of actionable reason codes. Current list rows use the same command-contract fields for fast triage badges such as compatibility-entry, contract-pending, contract-blocked, workflow-task-problem, and repair-blocked states before an operator opens selected-run detail. `WATERLINE_SAVED_VIEW_SCOPE` partitions saved views by app, environment, tenant, or operator namespace when several installs share one database. Waterline also returns system defaults such as `system:running`, `system:running-task-problems`, and `system:running-repair-blocked`; the repair-blocked view applies `repair_attention = true`, while the task-problems view applies `task_problem = true`, so operators can keep stable fleet views for badge-visible repair blockers and for selected runs with replay-blocked, missing, or repeatedly unhealthy workflow-task transport. Custom views are stored in the `waterline_saved_views` table, and the list screen can now save, update, and delete those custom views while showing the currently applied filter badges. Saving or updating a custom view now persists the effective applied filter set after any selected saved-view overlay, so operators do not accidentally drop the saved portion of the current view when refining or renaming it. Because `repair_attention`, `repair_blocked_reason`, `task_problem`, `declared_entry_mode`, and the command-contract backfill booleans are part of that same contract, operators can save repeatable views for repair-blocked drift, `unsupported_history`, workflow-task problem triage, compatibility-entry runs, loadable command-contract cleanup, or blocked command-contract normalization without rebuilding those filters by hand each time. Extra query filters on a saved-view URL refine the saved view for that request.

Query, Signal, and Update now sit on that same operator surface. Waterline shows Query only when `can_query = true` and the selected run exposes at least one `declared_query_targets[*].name`; unlike the mutating controls, that read-only query action can still stay available on historical or already-closed selected runs too. When durable query targets exist but selected-run detail reports `can_query = false`, Waterline keeps the declared targets visible but hides query execution, with `query_blocked_reason` explaining why. It shows Signal only when `can_signal = true` and the selected run exposes at least one `declared_signal_targets[*].name`. It shows Update only when `can_update = true` and the selected run exposes at least one `declared_update_targets[*].name`. The UI also shows `declared_contract_source`, `declared_contract_backfill_needed`, and `declared_contract_backfill_available` so operators can tell whether those targets came from durable `WorkflowStarted` history, a live-definition fallback, or no currently authoritative contract, and whether the current build can still normalize the preview-era snapshot. Compatible selected-run detail and history-export reads now persist loadable preview-era command-contract snapshots automatically, alongside the existing compatible query, signal, and update intake paths, and background repair/watchdog passes now keep draining loadable untouched runs in throttled batches. For untouched runs, use `php artisan workflow:v2:repair-pass` to force the next batch immediately, `php artisan workflow:v2:rebuild-projections --needs-rebuild --prune-stale` to sweep loadable preview-era command contracts alongside selected-run projection drift, or `php artisan workflow:v2:backfill-command-contracts --dry-run` and then the same command without `--dry-run` for a targeted contract-only pass before relying on them after refactors or class moves. When `declared_contract_backfill_needed = true` but `declared_contract_backfill_available = false`, the current build can still surface any remaining target names or parameter fragments, but that state is compatibility-only until a durable snapshot is persisted. Named query arguments and named JSON/object signal or update payloads reject when the missing durable contract is required, and query or update execution still blocks when replay needs an unavailable workflow definition. Each normalized target row carries the durable public target `name`, a `parameters` array when the run snapped a contract for that target, and `has_contract` so operator clients can distinguish contract-backed targets from bare declared names without hiding the latter. When a contract exists, Waterline now seeds the operator JSON editor from declared defaults plus type-aware primitive placeholders instead of filling every required scalar slot with `null`; rejected commands still surface durable `validation_errors`.

Query, signal, and update requests use an explicit JSON `arguments` field on the Waterline operator routes:

- query routes accept either a JSON object of named arguments or a JSON array of positional arguments, then return the query result as a serialized payload instead of recording a durable command row; when durable query targets exist but the workflow definition cannot be replayed, those POSTs now return HTTP `409 Conflict` with `blocked_reason = workflow_definition_unavailable`
- signal routes accept either a JSON array of positional arguments or any other single JSON value, which Waterline forwards as one durable signal payload
- signal routes also accept a JSON object of named arguments when the selected run exposes a matching declared signal contract; rejected signal commands surface machine-readable `validation_errors`, including declared type mismatches and nullability violations
- update routes accept either a JSON object of named arguments or a JSON array of positional arguments, and rejected requests surface machine-readable `validation_errors`, including declared type mismatches and nullability violations
- update routes also accept `wait_for = accepted` and `wait_timeout_seconds`; Waterline exposes that as a "Return after" control plus an optional completion-wait timeout so operators can either queue an update immediately or wait briefly for the worker before the UI falls back to the accepted lifecycle

Cancel and terminate still target the current run only. If you address a historical run directly through the canonical selected-run route or a legacy compatibility route for one of those current-run-only actions, Waterline rejects the command instead of forwarding it to that older run. Archive is intentionally selected-run scoped: it can mark any closed selected run in the instance as archived, including a closed historical run, while open runs reject with `rejected_run_not_closed` and already archived runs accept as `archive_not_needed`. Waterline shows the Repair control only when `can_repair` is `true` for the currently selected run. It shows Cancel and Terminate only when `can_cancel` or `can_terminate` are `true`, and Archive only when `can_archive` is `true`; `can_issue_terminal_commands` remains the coarse compatibility bridge when older clients still expect one shared terminal-action flag.

Current-run detail payload example:

```json
{
  "id": "01J10000000000000000000021",
  "instance_id": "order-123",
  "business_key": "order-123",
  "visibility_labels": {
    "tenant": "acme",
    "region": "us-east"
  },
  "memo": {
    "customer": {
      "id": 42,
      "name": "Taylor"
    },
    "source": "checkout"
  },
  "selected_run_id": "01J10000000000000000000021",
  "run_id": "01J10000000000000000000021",
  "is_current_run": true,
  "current_run_id": "01J10000000000000000000021",
  "current_run_source": "run_order_fallback",
  "current_run_status": "waiting",
  "current_run_status_bucket": "running",
  "run_navigation": [
    {
      "instance_id": "order-123",
      "run_id": "01J10000000000000000000021",
      "run_number": 1,
      "is_current_run": true,
      "is_selected_run": true,
      "status": "waiting",
      "status_bucket": "running"
    }
  ],
  "status": "waiting",
  "status_bucket": "running",
  "closed_reason": null,
  "archived_at": null,
  "archive_command_id": null,
  "archive_reason": null,
  "can_issue_terminal_commands": true,
  "can_cancel": true,
  "cancel_blocked_reason": null,
  "can_terminate": true,
  "terminate_blocked_reason": null,
  "can_archive": false,
  "archive_blocked_reason": "run_not_closed",
  "can_query": true,
  "query_blocked_reason": null,
  "can_signal": true,
  "signal_blocked_reason": null,
  "can_update": true,
  "update_blocked_reason": null,
  "can_repair": false,
  "repair_blocked_reason": "repair_not_needed",
  "read_only_reason": null,
  "open_wait_id": "timer:01J10000000000000000000031",
  "resume_source_kind": "timer",
  "resume_source_id": "01J10000000000000000000031",
  "waits_scope": "selected_run",
  "tasks_scope": "selected_run",
  "waits": [
    {
      "id": "timer:01J10000000000000000000031",
      "kind": "timer",
      "status": "open",
      "source_status": "pending",
      "summary": "Waiting for timer.",
      "task_backed": true,
      "external_only": false,
      "resume_source_kind": "timer",
      "resume_source_id": "01J10000000000000000000031",
      "task_id": "01J10000000000000000000041",
      "task_type": "timer",
      "task_status": "ready"
    }
  ],
  "tasks": [
    {
      "id": "01J10000000000000000000041",
      "type": "timer",
      "status": "ready",
      "summary": "Timer for 60 seconds task ready.",
      "is_open": true,
      "timer_id": "01J10000000000000000000031",
      "timer_sequence": 1
    }
  ],
  "timeline": [
    {
      "sequence": 1,
      "type": "StartAccepted",
      "kind": "command",
      "entry_kind": "point",
      "source_kind": "workflow_command",
      "source_id": "01J10000000000000000000011",
      "summary": "Start accepted as started_new.",
      "command_sequence": 1
    },
    {
      "sequence": 2,
      "type": "WorkflowStarted",
      "kind": "workflow",
      "entry_kind": "point",
      "source_kind": "workflow_run",
      "source_id": "01J10000000000000000000021",
      "summary": "Workflow run started."
    },
    {
      "sequence": 3,
      "type": "TimerScheduled",
      "kind": "timer",
      "entry_kind": "point",
      "source_kind": "timer",
      "source_id": "01J10000000000000000000031",
      "summary": "Scheduled timer for 60 seconds.",
      "timer": {
        "id": "01J10000000000000000000031",
        "status": "pending"
      }
    }
  ]
}
```

`run_navigation` is ordered by run number for the selected instance. Waterline uses it to render stable continue-as-new navigation without inferring routes from legacy bucket names or from one-hop lineage arrays alone.

Waterline still returns compatibility `logs` and `chartData` fields for the current Vue client, but those no longer need to be the only observability surface for v2 runs. They now echo activity-level `history_authority`, `history_unsupported_reason`, and `diagnostic_only` metadata when an older mutable row is the only surviving evidence, so compatibility consumers can keep the breadcrumb without treating it as typed durable history. The `timeline` collection is ordered by durable history sequence and is the better source when you need to explain exactly what the engine accepted, scheduled, completed, cancelled, terminated, or archived for one selected run.
The timeline is now projected into `workflow_run_timeline_entries` during the same projection pass that updates run summaries and waits. Selected-run detail reports `timeline_projection_source = workflow_run_timeline_entries` when Waterline is reading an already-synced projection row set, and `workflow_run_timeline_entries_rebuilt` when the detail read had to recreate missing or stale timeline rows before returning them. Fleet metrics report missing history-run coverage, stale projected timeline payloads, and missing history-event rows under `operator_metrics.projections.run_timeline_entries.*`.
The timeline's primary identity and status fields are history-first snapshots, not a live join against today's mutable side tables. For example, an `ActivityScheduled` entry stays `pending`, an `ActivityStarted` and `ActivityHeartbeatRecorded` entry stays `running`, a `TimerScheduled` entry stays `pending`, `UpdateAccepted` and `UpdateApplied` do not inherit the later completion outcome, `VersionMarkerRecorded` keeps the originally committed branch choice and supported range, typed failure entries keep the failure payload that was recorded at that point in history even if later mutable rows drift, and `FailureHandled` marks the later point where workflow code caught the failure and continued. If a mixed-era replay stayed on `WorkflowStub::DEFAULT_VERSION` because the selected run predates the marker and no typed marker was ever committed, Waterline does not invent a synthetic timeline entry for that fallback; use the run's compatibility marker and deployment wave as the operator context instead.
When several run-scoped commands exist, the dedicated `commands` list is ordered by durable command sequence instead of timestamp ties, and Waterline now shows that per-run sequence directly in the commands table alongside a payload viewer backed by the durable command row. Command-related timeline entries surface the same `command_sequence`, and their nested `command` snapshot keeps the event-era payload preview, public workflow command context, plus `requested_run_id` and `resolved_run_id`, so operators can correlate accepted signals with the order they were later applied and still see which current run superseded a rejected historical-run command even if the mutable command row later drifts.
Compound start-time intake is now grouped separately under `linked_intakes_scope = selected_run` and `linked_intakes[*]`. Each grouped row is keyed by the durable `workflow_commands.context.intake.group_id`, names the `mode`, reports `source = workflow_commands.context.intake`, carries `start_command_*`, `primary_command_*`, and the ordered nested `commands[*]` snapshots, and marks `complete = false` plus `missing_expected_command_types` when a recognized mode is only partially present. The current release recognizes `signal_with_start` as a `start` plus `signal` compound intake; future modes can still publish the same grouped shape with their own `mode` and ordered command list. Older preview rows that only preserved `commands[*].context.intake.mode` without the durable `group_id` are omitted from `linked_intakes`, so the grouped contract never invents a linked identity that the command rows did not actually store.
Those same selected-run `commands`, `signals`, and `updates` rows now carry a small task-link bridge for operator triage. `current_task_id` and `current_task_status` name the currently open durable workflow task, if one still exists, that transports or applies that accepted command lifecycle. `task_ids` keeps the set of known durable task ids proven either by current selected-run task payloads or by typed history, so a row can still point back to the task that handled it even after that task has closed and disappeared from the open-task surface. `task_transport_state` mirrors the current task's transport state when there is one and falls back to `missing` when the lifecycle is repairable but the backing task row is gone. `task_missing = true` means the command, signal, or update is durably accepted yet currently has no open backing task; for preview-era accepted signals or updates that still only have command-plus-history evidence, the same rows may temporarily point at the command-linked fallback task identity until repair or `php artisan workflow:v2:backfill-command-lifecycles` normalizes the lifecycle row.
The dedicated `waits` and `tasks` arrays are also selected-run scoped. `waits` tells you what the run is waiting on now or what resume source resolved earlier in the same run. Current rebuilds persist those rows in `workflow_run_waits`; selected-run detail reports `waits_projection_source = workflow_run_waits` when Waterline is reading an already-synced wait projection row set, and `workflow_run_waits_rebuilt` when the detail read had to recreate missing or stale wait rows before returning them. Fleet metrics report canonical wait-run coverage, stale projected wait payloads, and current open waits missing from that projection under `operator_metrics.projections.run_waits.*`. That rebuilt path still derives waits from typed history even if the current run summary has no open wait, so resolved child, activity, timer, signal, update, and condition waits do not disappear behind a stale summary. Unsupported older terminal activity, timer, and child fallbacks remain visible there as diagnostics, but they now set `diagnostic_only = true` and omit `resume_source_kind` / `resume_source_id` so Waterline does not imply a durable resume path that typed history never proved. `tasks` tells you which durable worker tasks exist for that run and also includes synthetic `transport_state = missing` rows when typed history, wait state, or the no-resume-source invariant proves that repairable task transport disappeared. Together they let operators tell the difference between a healthy external signal wait, a signal that was already received but lost its workflow task, a healthy task-backed timer or activity wait, a repair-needed wait whose task row has disappeared, a pending activity whose execution row and task can be restored from typed history, a non-terminal run with no durable resume source, and an open wait that only has stale historical task rows left behind. For repeated same-name signals, the wait row `sequence` and `signal_wait_id` tell you exactly which opened wait you are looking at.
Selected-run `timers` are projected separately into `workflow_run_timer_entries` during that same rebuild pass. Detail reports `timers_projection_source = workflow_run_timer_entries` when Waterline is reading an already-synced timer projection row set, and `workflow_run_timer_entries_rebuilt` when the detail read had to recreate missing or stale timer rows before returning them. When that rebuild happens, detail and history export also surface `timers_projection_rebuild_reasons`, currently `missing_projection`, `stale_projection`, and `legacy_schema`, so operators can tell whether the read repaired an absent row set, a drifted payload, or an older `schema_version = 0` row contract. Fleet metrics report timer coverage and drift under `operator_metrics.projections.run_timer_entries.*`, including `runs_with_timers`, `missing_runs_with_timers`, `stale_projected_runs`, `legacy_schema_runs`, `legacy_schema_rows`, and `orphaned`. Timer projection rows now carry an explicit stored `schema_version`: `1` is the current row contract, and `0` is the legacy bridge for older rows that were written before `row_status` was stored explicitly. Waterline treats those legacy rows as rebuild-required instead of silently trusting them forever, so selected-run detail, history export, or `php artisan workflow:v2:rebuild-projections --needs-rebuild` rewrites them onto the current schema before the timer projection is reported as aligned. The timer rows keep timer-specific diagnostics such as `timer_kind`, timeout-backed `condition_wait_id` / `condition_key`, `history_authority`, and `history_unsupported_reason` on a rebuildable selected-run surface instead of forcing operators back to mutable timer rows or compatibility logs.
The selected-run lineage arrays are projected into `workflow_run_lineage_entries` during that same rebuild pass. Selected-run detail reports `lineage_projection_source = workflow_run_lineage_entries` when Waterline is reading an already-synced lineage projection row set, and `workflow_run_lineage_entries_rebuilt` when the detail read had to recreate missing or stale lineage rows before returning them. Fleet metrics report canonical lineage-run coverage plus stale projected lineage payloads under `operator_metrics.projections.run_lineage_entries.*`. That rebuilt path derives parent, child, and continue-as-new relationships from typed history first and only uses `workflow_links` as a compatibility bridge for older preview rows. When a lineage entry only survives through that mutable compatibility bridge, the row now carries `history_authority = mutable_open_fallback` and `diagnostic_only = true`, so Waterline keeps the relation visible without implying that the identity or timestamp came from durable typed lineage history.
When replay blocks because committed history no longer matches the current workflow definition, task rows use `transport_state = replay_blocked`. A parallel `all([...])` arity or nesting mismatch uses `replay_blocked_reason = history_shape_mismatch` with `replay_blocked_expected_history_shape = parallel all barrier matching current topology`, so Waterline can distinguish a barrier-shape rollout problem from ordinary queue transport loss. The same replay-blocked shape is used when typed activity or child leaf events exist for an `all([...])` step but lack `parallel_group_path` metadata, because the engine cannot safely infer which current barrier those older events belonged to. Activity execution and child link rows may carry older preview paths for diagnostics, but runtime reads, history export, and Waterline projections do not infer grouped activity or child barrier identity from those mutable rows; run `php artisan workflow:v2:backfill-parallel-group-metadata` first when those rows are the only surviving source for the path.
For pure timers, those same selected-run wait and task rows now rebuild `timer_id`, `timer_sequence`, and `deadline_at` from typed `TimerScheduled` and `TimerFired` history first, so a drifted or deleted `workflow_timers` row does not erase the operator-facing wait identity. Timeout-backed condition waits use that fired timer history as the resume source for applying the condition timeout; a mutable timer row marked fired without the matching typed `TimerFired` event remains a pending timeout transport. A pure timer row marked fired with no typed timer history blocks replay as `history_shape_mismatch` and Waterline reports recorded events as `no typed history` instead of treating the row as a durable timer result. Selected-run timer and wait detail mark that row-only terminal fallback with `status = unsupported`, `diagnostic_only = true`, `history_authority = unsupported_terminal_without_history`, `history_unsupported_reason = terminal_timer_row_without_typed_history`, `row_status` set to the mutable row state, and no `resume_source_kind` / `resume_source_id`. Once `TimerFired` exists, repair restores the missing workflow task that records `ConditionWaitTimedOut` instead of recreating a timer task that would fire the same deadline again.
Task rows also expose transport-health fields such as `transport_state`, `task_missing`, `synthetic`, `expected_task_id`, `dispatch_failed`, `dispatch_overdue`, `claim_failed`, `last_dispatch_attempt_at`, `last_dispatched_at`, `last_dispatch_error`, `last_claim_failed_at`, `last_claim_error`, and `lease_expired`, so Waterline can tell the difference between a missing task, a ready task whose last publish failed, a ready task an unsupported worker could not claim, a stale ready task that needs re-dispatch, and a leased task whose worker lease expired.
`last_dispatched_at` now means the most recent confirmed queue handoff for that durable task. If the engine tried to publish the task but the queue handoff failed, Waterline leaves `last_dispatched_at` unchanged and instead records the failed attempt in `last_dispatch_attempt_at` plus `last_dispatch_error`.
When the worker-claim backend capability gate rejects a task, Waterline leaves the task ready and shows `transport_state = claim_failed` with the claim failure timestamp and reason. No workflow replay, activity execution, activity-attempt row, timer-fire history, or lease is written for that rejected claim.
When an accepted update satisfies a condition wait while a ready unscoped workflow task already exists, the runtime republishes that existing durable task rather than creating a duplicate task row and annotates it with the update wait provenance. Seeing the same workflow task id with refreshed dispatch metadata after such an update is normal. If the only open workflow task belongs to another resume source, Waterline keeps the update wait repair-needed instead of borrowing that unrelated task.
Task rows now also expose `compatibility`, `compatibility_supported`, `compatibility_reason`, `compatibility_supported_in_fleet`, and `compatibility_fleet_reason`. When a task row predates task-level compatibility storage, Waterline reads the selected run's marker as the effective task marker until the migration or runtime claim path backfills the task row itself. The local pair tells you whether the current build can claim that marker. The fleet pair tells you whether any active worker heartbeat snapshot in the selected run's configured namespace and queue scope currently advertises it. When a task is ready on the current run, or its old lease has expired, but neither view advertises a compatible claimer, Waterline leaves the durable task state alone and reports that the task is waiting for a compatible worker instead of pretending the task vanished or inviting an unsafe Repair.
Child workflows use that same detail surface. On the parent run, Waterline shows the active child in `waits` with `kind = child`, the stable `child_call_id`, the current child run in `resume_source_id`, the durable lineage link in `continuedWorkflows`, and typed child events in `timeline`. If the child continues as new, those parent-facing surfaces keep the same `child_call_id` while following the child instance's newest durable run even if copied link rows or the child instance's mutable `current_run_id` drift. Once the parent records a typed child-resolution event, the resolved child wait stays resolved from that parent history even if the mutable child row later drifts, and the parent resume workflow task carries `workflow_wait_kind = child`, `child_call_id`, `child_workflow_run_id`, and the `child_workflow_run` resume source. If that workflow task row is lost before the parent applies the result, the selected run remains `repair_needed` from typed parent history and `tasks` includes a synthetic missing child-resolution row with the same identity fields. On the child run, the inverse parent link is visible in `parents`. Compatibility-only lineage rows now say so explicitly through `history_authority` and `diagnostic_only`, and the selected-run history export uses that same projected lineage payload for `links.parents` and `links.children` instead of doing separate live-link enrichment on export.

Child-wait detail example:

```json
{
  "wait_kind": "child",
  "wait_reason": "Waiting for child workflow billing-child",
  "liveness_state": "waiting_for_child",
  "waits": [
    {
      "kind": "child",
      "status": "open",
      "child_call_id": "01JCHILDCALL0000000000001",
      "target_name": "child-instance-123",
      "target_type": "billing-child",
      "task_backed": false,
      "external_only": false,
      "resume_source_kind": "child_workflow_run",
      "resume_source_id": "01JCHILDRUN0000000000001"
    }
  ],
  "continuedWorkflows": [
    {
      "link_type": "child_workflow",
      "child_call_id": "01JCHILDCALL0000000000001",
      "child_workflow_id": "child-instance-123",
      "child_workflow_run_id": "01JCHILDRUN0000000000001"
    }
  ],
  "timeline": [
    {
      "type": "ChildWorkflowScheduled",
      "kind": "child",
      "child_call_id": "01JCHILDCALL0000000000001",
      "summary": "Scheduled child workflow billing-child."
    },
    {
      "type": "ChildRunStarted",
      "kind": "child",
      "child_call_id": "01JCHILDCALL0000000000001",
      "summary": "Child workflow billing-child started."
    }
  ]
}
```

Missing child-resolution task example:

```json
{
  "wait_kind": "child",
  "wait_reason": "Waiting to apply child workflow billing-child result",
  "liveness_state": "repair_needed",
  "open_wait_id": "child:01JCHILDCALL0000000000001",
  "resume_source_kind": "child_workflow_run",
  "resume_source_id": "01JCHILDRUN0000000000001",
  "tasks": [
    {
      "id": "missing:workflow:child:01JCHILDCALL0000000000001",
      "type": "workflow",
      "status": "missing",
      "transport_state": "missing",
      "task_missing": true,
      "synthetic": true,
      "workflow_wait_kind": "child",
      "workflow_open_wait_id": "child:01JCHILDCALL0000000000001",
      "workflow_resume_source_kind": "child_workflow_run",
      "workflow_resume_source_id": "01JCHILDRUN0000000000001",
      "child_call_id": "01JCHILDCALL0000000000001",
      "child_workflow_run_id": "01JCHILDRUN0000000000001"
    }
  ]
}
```

Signal-wait detail example:

```json
{
  "wait_kind": "signal",
  "wait_reason": "Waiting for signal approved-by",
  "liveness_state": "waiting_for_signal",
  "waits": [
    {
      "kind": "signal",
      "status": "open",
      "target_name": "approved-by",
      "task_backed": false,
      "external_only": true,
      "resume_source_kind": "signal"
    }
  ],
  "timeline": [
    {
      "type": "SignalWaitOpened",
      "kind": "signal",
      "signal_name": "approved-by",
      "summary": "Waiting for signal approved-by."
    }
  ]
}
```

Once Waterline records `SignalReceived`, the external signal wait is resolved. The selected run should either show the backing workflow task if one still exists, or keep `wait_kind = signal` with `open_wait_id = signal-application:{signal_id}`, `resume_source_kind = workflow_signal`, and `liveness_state = repair_needed` if the signal was accepted but the workflow task row is gone before `SignalApplied`.

Historical-run detail payload example:

```json
{
  "id": "01J10000000000000000000020",
  "instance_id": "order-123",
  "selected_run_id": "01J10000000000000000000020",
  "run_id": "01J10000000000000000000020",
  "is_current_run": false,
  "current_run_id": "01J10000000000000000000021",
  "current_run_source": "continue_as_new_lineage",
  "current_run_status": "waiting",
  "current_run_status_bucket": "running",
  "status": "completed",
  "status_bucket": "completed",
  "closed_reason": "continued",
  "can_issue_terminal_commands": false,
  "can_repair": false,
  "read_only_reason": "Selected run is historical. Issue commands against the current active run.",
  "continuedWorkflows": [
    {
      "link_type": "continue_as_new",
      "child_workflow_run_id": "01J10000000000000000000021",
      "status": "waiting",
      "status_bucket": "running"
    }
  ]
}
```

Closed current-run detail payload example:

```json
{
  "id": "01J10000000000000000000021",
  "instance_id": "order-123",
  "run_id": "01J10000000000000000000021",
  "is_current_run": true,
  "status": "cancelled",
  "status_bucket": "failed",
  "is_terminal": true,
  "can_issue_terminal_commands": false,
  "can_repair": false,
  "read_only_reason": "Run is closed."
}
```

Repair-needed detail payload example:

```json
{
  "id": "01J10000000000000000000021",
  "instance_id": "order-123",
  "status": "waiting",
  "wait_kind": "timer",
  "liveness_state": "repair_needed",
  "liveness_reason": "Timer 01J10000000000000000000031 is pending without an open timer task.",
  "waits": [
    {
      "kind": "timer",
      "status": "open",
      "task_backed": false,
      "task_id": null,
      "task_type": null,
      "task_status": null
    }
  ],
  "can_issue_terminal_commands": true,
  "can_repair": true,
  "read_only_reason": null
}
```

Accepted repair command response:

```json
{
  "outcome": "repair_dispatched",
  "workflow_id": "order-123",
  "run_id": "01J10000000000000000000021",
  "command_id": "01J40000000000000000000022",
  "workflow_type": "workflow.timer",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Ordinary queue workers also run the same recovery rules automatically. If a run has a ready task whose dispatch is overdue, a workflow, activity, or timer task whose lease has expired, or a `repair_needed` run summary with no open workflow, child-resolution workflow, accepted-update, accepted-signal, condition-timeout workflow, pending-activity, or timer task row, the worker loop reuses or recreates the durable task, increments `repair_count`, and re-dispatches it without duplicating in-flight running activities. Each pass selects repair candidates scope-fair across `connection`, `queue`, and `compatibility`, then caps existing-task and missing-run work separately at `scan_limit`. When the missing task is a pending activity whose mutable execution row also disappeared, repair restores that execution from typed `ActivityScheduled` history before creating the replacement task. When the missing task is a delayed retry, the replacement is rebuilt from the latest typed `ActivityRetryScheduled` history so Waterline keeps showing the original retry deadline and retry metadata.
Accepted update and accepted signal application waits follow that same automatic path: if the apply-task row disappears after `UpdateAccepted` or `SignalReceived`, the worker loop recreates a ready workflow task with the same `workflow_wait_kind`, `workflow_update_id` or `workflow_signal_id`, `workflow_command_id`, open-wait id, and resume-source metadata that manual `repair()` would restore.
After repair or automatic worker recovery restores that durable workflow, child-resolution workflow, accepted-update, accepted-signal, condition-timeout workflow, activity, or timer task, run detail should move from `repair_needed` back to the healthy task-backed liveness state (`workflow_task_ready`, `activity_task_ready`, or `timer_scheduled`) instead of continuing to show repair-needed.

If a run is already waiting on a named signal, already has a healthy durable ready or leased task, is already inside a typed-history-backed `running` activity with no task row, or only has older diagnostic-only mutable activity, timer, or child state, `repair()` is accepted as `repair_not_needed` instead of inventing a new task.

Accepted repair commands also appear in the run timeline as `RepairRequested` entries. When repair restored a task, the timeline entry includes that task id and type so operators can see which durable resume source was repaired.

Accepted terminal command response:

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J10000000000000000000021",
  "command_id": "01J40000000000000000000021",
  "workflow_type": "workflow.timer",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Historical-run rejection response:

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J10000000000000000000020",
  "requested_run_id": "01J10000000000000000000020",
  "resolved_run_id": "01J10000000000000000000021",
  "command_id": "01J40000000000000000000020",
  "target_scope": "run",
  "workflow_type": "workflow.timer",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

For current-run-only commands, that historical-run response is now a durable engine command outcome created through either Waterline's canonical selected-run operator route or the legacy compatibility operator route. `run_id` and `requested_run_id` preserve the historical selected run that the operator addressed, while `resolved_run_id` points at the current run that callers should use next. The public webhook routes expose the same `target_scope = run` rejection payload when you address a historical run directly for those actions. Archive is the exception: it is selected-run scoped and may accept a historical run once that run is closed.

For the canonical Waterline operator routes:

- `POST /waterline/api/instances/{instanceId}/signals/{signal}` returns `200` when the current run accepts that signal command
- `POST /waterline/api/instances/{instanceId}/updates/{update}` returns `200` when the current run accepts and the workflow worker completes that update command before the response returns, or `202` when the request body uses `wait_for = accepted` or the configured/per-request completion wait budget expires first; timed-out completion waits return `update_status = accepted`, `wait_for = completed`, `wait_timed_out = true`, and `wait_timeout_seconds`, and write requests reject any `wait_for` other than `accepted` or `completed` with `422`
- `POST /waterline/api/instances/{instanceId}/repair` returns `200` with `repair_dispatched` or `repair_not_needed` when the current run accepts the repair command
- `POST /waterline/api/instances/{instanceId}/cancel` returns `200` when the current run is closed as `cancelled`
- `POST /waterline/api/instances/{instanceId}/terminate` returns `200` when the current run is closed as `terminated`
- `POST /waterline/api/instances/{instanceId}/archive` returns `200` with `archived` or `archive_not_needed` when the instance's current run is closed and accepts the archive command
- all six endpoints return `404` when `{instanceId}` resolves to no instance or to an instance without a current run
- all six endpoints return `409` when the underlying v2 command is rejected

For the canonical selected-run operator routes:

- `POST /waterline/api/instances/{instanceId}/runs/{runId}/signals/{signal}` returns `200` when that selected run is still current and accepts the signal command
- `POST /waterline/api/instances/{instanceId}/runs/{runId}/updates/{update}` returns `200` when that selected run is still current and the workflow worker completes the accepted update before the response returns, or `202` when the request body uses `wait_for = accepted` or the completion wait budget expires first; write requests reject any `wait_for` other than `accepted` or `completed` with `422`
- `POST /waterline/api/instances/{instanceId}/runs/{runId}/repair` returns `200` with `repair_dispatched` or `repair_not_needed` when that selected run is still current and accepts the repair command
- `POST /waterline/api/instances/{instanceId}/runs/{runId}/cancel` returns `200` when that selected run is still current and closes as `cancelled`
- `POST /waterline/api/instances/{instanceId}/runs/{runId}/terminate` returns `200` when that selected run is still current and closes as `terminated`
- `POST /waterline/api/instances/{instanceId}/runs/{runId}/archive` returns `200` with `archived` or `archive_not_needed` when that selected run is closed, including closed historical runs in the same instance
- all six endpoints return `404` when `{instanceId}` or `{runId}` does not resolve to that instance-selection pair
- the current-run-only endpoints return `409` with `target_scope = run` when the selected run is historical or otherwise rejected; archive returns `409` when the selected run is still open or the underlying archive command is otherwise rejected

For the current Waterline compatibility routes:

- `POST /waterline/api/flows/{id}/signals/{signal}` returns `200` when the selected current run accepts the signal command
- `POST /waterline/api/flows/{id}/updates/{update}` returns `200` when the selected current run accepts and the workflow worker completes the update before the response returns, or `202` when the request body uses `wait_for = accepted` or the completion wait budget expires first; write requests reject any `wait_for` other than `accepted` or `completed` with `422`
- `POST /waterline/api/flows/{id}/repair` returns `200` with `repair_dispatched` or `repair_not_needed` when the selected current run accepts the repair command
- `POST /waterline/api/flows/{id}/cancel` returns `200` when the current run is closed as `cancelled`
- `POST /waterline/api/flows/{id}/terminate` returns `200` when the current run is closed as `terminated`
- `POST /waterline/api/flows/{id}/archive` returns `200` with `archived` or `archive_not_needed` when `{id}` resolves to a closed selected run or to an instance whose current run is closed
- all six endpoints return `404` when `{id}` resolves to neither a run nor an instance with a current run
- the current-run-only endpoints return `409` when the selected run is historical or when the underlying v2 command is rejected; archive returns `409` when the selected run is still open or the underlying archive command is otherwise rejected
- `/waterline/api/flows/failed`, `/waterline/api/flows/cancelled`, and `/waterline/api/flows/terminated` now split terminal list screens by raw run `status`; cancelled and terminated rows still carry `status_bucket = failed` as the compatibility bridge

### Dashboard View

![waterline_dashboard](https://github.com/user-attachments/assets/5688a234-4c02-4d5e-84d4-5f40b5fa27c5)

### Workflow View

![workflow](https://github.com/user-attachments/assets/da685466-7747-4c2f-ae10-300041381d51)

Refer to https://github.com/durable-workflow/waterline for installation and configuration instructions.
