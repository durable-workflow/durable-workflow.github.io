---
sidebar_position: 11
---

# Failures and Recovery

## Handling Exceptions

When an activity throws an exception, the workflow won't immediately be informed. Instead, it waits until the number of `$tries` has been exhausted. The system will keep retrying the activity based on its retry policy. If you want the exception to be immediately sent to the workflow upon a failure, you can set the number of `$tries` to 1.

```php
use Exception;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public int $tries = 1;

    public function handle(): void
    {
        throw new Exception();
    }
}
```

```php
use Exception;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        try {
            $result = activity(MyActivity::class);
        } catch (Exception) {
            // handle the exception here
        }
    }
}
```

## Non-retryable Exceptions

In certain cases, you may encounter exceptions that should not be retried. These are referred to as non-retryable exceptions. When an activity throws a non-retryable exception, the workflow will immediately mark the activity as failed and stop retrying.

```php
use Workflow\V2\Activity;
use Workflow\Exceptions\NonRetryableException;

class MyNonRetryableActivity extends Activity
{
    public function handle(): void
    {
        throw new NonRetryableException('This is a non-retryable error');
    }
}
```

## Recovery Process

The general process to fix a failing activity is:

1. Check the logs for the activity that is failing and look for any errors or exceptions that are being thrown.
2. Identify the source of the error and fix it in the code.
3. Deploy the fix to the server where the queue is running.
4. Restart the queue worker to pick up the new code.
5. Wait for the activity to automatically retry and ensure that it is now completing successfully without errors.
6. If the activity continues to fail, repeat the process until the issue is resolved.

This allows you to keep the workflow in a running status even while an activity is failing. After you fix the failing activity, the workflow will finish in a completed status. A workflow with a failed status means that all activity `$tries` have been exhausted and the exception wasn't handled.

## Failure Taxonomy

Every failure recorded by the engine carries a `failure_category` that classifies the nature of the failure. This taxonomy is available in failure rows, typed history events, Waterline timeline entries, history exports, and the run detail exceptions table.

| Category | Value | Description |
|---|---|---|
| Application | `application` | Business logic exception thrown by workflow or activity code. This is the default for terminal workflow failures and failed updates. |
| Activity | `activity` | Terminal activity failure propagated to the workflow after retries are exhausted. |
| Child Workflow | `child_workflow` | Terminal child workflow failure propagated to the parent workflow. |
| Cancelled | `cancelled` | Failure resulting from an explicit cancellation command. |
| Terminated | `terminated` | Failure resulting from an explicit termination command. |
| Timeout | `timeout` | Failure caused by a timeout expiration — enforced by the engine when a workflow execution or run deadline passes. |
| Task Failure | `task_failure` | Workflow-task execution failure such as replay errors, determinism violations, or invalid command shapes. |
| Internal | `internal` | Server or infrastructure failure (database, queue, worker crash). |
| Structural Limit | `structural_limit` | Failure caused by exceeding a structural limit (payload size, pending fan-out count, command batch size, metadata size, history transaction size). See [Structural Limits](./constraints/structural-limits.md). |

The category is determined automatically when the failure is recorded:

- Activity failures use `activity` when the exception exhausts the retry policy.
- Child workflow failures use `child_workflow` when the child run terminates with a failure.
- Cancelled and terminated workflows create a dedicated `WorkflowFailure` row with `propagation_kind = cancelled` or `terminated` and `failure_category = cancelled` or `terminated` respectively. The `WorkflowCancelled` or `WorkflowTerminated` history event carries the `failure_id` and `failure_category` so failure snapshots, run detail, and history exports link directly to the failure record. Child run cancellation and termination events (`ChildRunCancelled`, `ChildRunTerminated`) also carry the child's `failure_category` when the child failure row exists.
- Terminal workflow failures and failed update handlers inspect the throwable to refine the category:
  - Determinism violations (`UnsupportedWorkflowYieldException`, `StraightLineWorkflowRequiredException`) classify as `task_failure`.
  - Infrastructure exceptions (database/PDO errors, queue max-attempts exceeded) classify as `internal`.
  - Timeout-indicating exceptions (messages containing "timed out", "timeout exceeded", "execution deadline", or "run deadline") classify as `timeout`.
  - Structural-limit exceptions (`StructuralLimitExceededException`) classify as `structural_limit`. The history event also carries `structural_limit_kind`, `structural_limit_value`, and `structural_limit_configured` metadata.
  - All other business-logic exceptions default to `application`.
- External worker failures (submitted through the workflow task bridge HTTP protocol) use the same classification rules based on the exception class name and message strings, even though the original throwable is not available in the host process.

### Task Failures vs Execution Failures

The engine distinguishes between two kinds of workflow-task problems:

**Terminal task failures** — determinism violations that cannot be recovered without a code change. When the executor encounters an `UnsupportedWorkflowYieldException` or `StraightLineWorkflowRequiredException`, the run fails terminally with `failure_category = task_failure`. A `WorkflowFailure` row is created, a `WorkflowFailed` history event is recorded, and the run closes with `status = failed`. These failures represent workflow code that violates the replay contract and must be fixed before the workflow can succeed.

**Replay-blocked task failures** — non-terminal replay problems where the run stays open and repairable. When the executor encounters an `UnresolvedWorkflowFailureException` (failure class cannot be restored), `ConditionWaitDefinitionMismatchException` (condition wait fingerprint changed), or `HistoryEventShapeMismatchException` (history shape incompatible with current code), the engine marks the workflow task as failed with diagnostic metadata in the task payload (`replay_blocked = true`, `replay_blocked_reason`) but does **not** create a `WorkflowFailure` row or close the run. The run remains open and can resume after the underlying issue is corrected (e.g., registering a durable exception type, deploying compatible code) and the run is repaired.

**Infrastructure task failures** — transient errors outside the executor (database errors during task claim, worker crashes during task execution). These mark the workflow task as failed with `last_error` on the task row but do not create a `WorkflowFailure` record. The durable task system re-dispatches the task, and replay resumes from committed history.

Waterline surfaces all three through the `WorkflowTaskProblem` badge system:
- `replay_blocked` (dark badge) — the run has a replay-blocked task failure
- `active` (warning badge) — the run has missing, retried, or transport-unhealthy task work
- `history` (secondary badge) — the run previously needed task repair or replay recovery

### Workflow Timeout Enforcement

When `StartOptions::withExecutionTimeout()` or `StartOptions::withRunTimeout()` is set, the engine records a deadline on the workflow run. The execution deadline spans the entire logical workflow (including continue-as-new runs), while the run deadline resets with each new run.

If a deadline has passed when the engine starts a workflow task, the run is closed immediately:

- All open activity executions, timers, and outstanding tasks are cancelled with typed history events (`ActivityCancelled`, `TimerCancelled`).
- A `WorkflowFailure` row is recorded with `failure_category = timeout` and `propagation_kind = timeout`.
- A `WorkflowTimedOut` history event is recorded with `timeout_kind` set to `execution_timeout` or `run_timeout`.
- The run status becomes `failed` with `closed_reason = timed_out`.
- Parent workflows waiting on the timed-out child are notified.

The background task watchdog also scans for non-terminal runs with expired deadlines that have no open workflow task (for example, a run waiting on an activity or timer when the deadline passes). When it finds one, it creates a workflow task so the executor can detect and enforce the timeout on the next pass.

Waterline surfaces `failure_category` in the exceptions table as a dedicated **Category** column and in timeline failure detail entries. History exports include `failure_category` in the `failures[*]` array. Older failure rows that predate this classification have `failure_category = null` and are treated as unclassified in projections.

To backfill `failure_category` and `non_retryable` on older failure rows:

```bash
# Preview what would be updated
php artisan workflow:v2:backfill-failure-categories --dry-run

# Backfill all unclassified failures
php artisan workflow:v2:backfill-failure-categories

# Scope to a specific run or instance
php artisan workflow:v2:backfill-failure-categories --run-id=01HXYZ...
php artisan workflow:v2:backfill-failure-categories --instance-id=order-123

# JSON output for scripting
php artisan workflow:v2:backfill-failure-categories --json
```

## Activity Retries

`Workflow\V2\Activity` defaults to `$tries = 1`, so an activity failure is sent back to the workflow immediately unless the activity opts into retry attempts.

```php
use RuntimeException;
use Workflow\V2\Activity;

class ChargeCard extends Activity
{
    public int $tries = 3;

    public function backoff(): array
    {
        return [5, 30];
    }

    public function handle(): string
    {
        throw new RuntimeException('temporary gateway failure');
    }
}
```

When a retryable activity throws before `$tries` is exhausted, the engine closes the current `activity_attempts` row as runtime state, returns the `activity_executions` row to `pending`, records a typed `ActivityRetryScheduled` history event for the failed try, and creates a new durable activity task with `available_at` set from the `backoff()` policy. The workflow stays waiting on that same activity execution and is not resumed with the exception until the final retryable attempt fails.

The retry task records `retry_of_task_id`, `retry_after_attempt_id`, `retry_after_attempt`, and `retry_backoff_seconds` in its payload so Waterline can explain why the task is scheduled. Selected-run detail rebuilds the failed attempt in `activities[*].attempts` from typed activity history first, shows `ActivityRetryScheduled` in the timeline, and reports retrying activity counts through `operator_metrics.activities.retrying`, `operator_metrics.activities.failed_attempts`, and `operator_metrics.backlog.retrying_activities`.

`Workflow\Exceptions\NonRetryableExceptionContract` still short-circuits the retry policy: throwing a non-retryable exception fails the activity execution immediately and resumes the workflow with the exception.

### Non-retryable failure markers

When an activity or workflow throws an exception that implements `Workflow\Exceptions\NonRetryableExceptionContract`, the engine records a `non_retryable = true` flag on the `WorkflowFailure` row and in the typed history event payload (`ActivityFailed`, `WorkflowFailed`, `UpdateCompleted`). This durable marker communicates to operators, external workers, and tooling that the failure is permanent — retrying the same operation will not succeed.

The flag flows through the full visibility stack:

- **Failure rows**: `workflow_failures.non_retryable` boolean column.
- **History events**: `non_retryable` field in the typed event payload.
- **Failure snapshots**: `non_retryable` included in `FailureSnapshots::forRun()`.
- **Run detail view**: `non_retryable` in the exceptions array.
- **Timeline entries**: `non_retryable` in failure detail metadata.
- **History exports**: `non_retryable` in the `failures[*]` array.
- **Waterline**: a "non-retryable" badge next to the failure category in the exceptions table and timeline.
- **External worker bridge**: the `complete()` command payload accepts `non_retryable` so external workflow workers can report non-retryable failures without requiring the host process to resolve the throwable class.

For failures that do not implement the contract, `non_retryable` is `false` by default. The `php artisan workflow:v2:backfill-failure-categories` command can detect and backfill the flag for older failure rows whose recorded exception class implements `NonRetryableExceptionContract` in the current codebase.

```php
use Workflow\Exceptions\NonRetryableExceptionContract;

class PaymentDeclinedException extends \RuntimeException implements NonRetryableExceptionContract
{
    // This failure will be marked as non-retryable in the durable record.
}
```

## Workflow-Level Retry

Durable Workflow v2 does **not** support automatic workflow-level retry. When a workflow run fails — whether from an unhandled exception, a structural limit, or a timeout — the run is terminal. The engine does not automatically start a new run of the same workflow instance.

This is an intentional design choice:

- **Activities already have retry.** Activity retry policies with configurable `$tries`, `backoff()`, and non-retryable exceptions handle transient failures at the right granularity.
- **Workflow replay is the recovery primitive.** If a workflow task encounters a transient infrastructure failure (database error, worker crash), the durable task system re-dispatches the task, and replay resumes from committed history — no new run needed.
- **Continue-as-new handles long-lived workflows.** Workflows that need fresh state or history compaction use `continueAsNew()` as an explicit workflow-level restart.
- **Repair handles stuck runs.** The `repair()` command and automatic worker-loop repair recover runs where durable task transport was lost.

If your application needs workflow-level retry semantics, model them explicitly:

```php
use function Workflow\V2\activity;
use Throwable;
use Workflow\V2\Workflow;

class RetryableWorkflow extends Workflow
{
    public function handle(string $orderId): void
    {
        try {
            activity(ProcessOrderActivity::class, $orderId);
        } catch (Throwable $e) {
            // Record the failure, then start a new workflow
            // for retry-at-workflow-level scenarios.
            activity(NotifyFailureActivity::class, $orderId, $e->getMessage());
        }
    }
}
```

## Reset (Reserved)

The `reset` operation is reserved for a future release. Reset is distinct from `repair`:

- **Repair** recreates missing durable transport (task rows, execution rows) so a stuck run can resume from its committed history. It does not discard any recorded progress.
- **Reset** would discard committed progress beyond a chosen history point and re-execute the workflow from that earlier state. This requires careful handling of already-started activities, child workflows, and timers.

Until reset ships, the supported recovery path for a workflow that has made incorrect progress is: fix the underlying issue, deploy the corrected code, and let replay or repair resume the run. For terminal runs, start a new workflow instance with the corrected logic.

## Task Recovery

The engine separates workflow truth from queue delivery. Durable task rows stay authoritative even if a queue publish is missed or a worker dies after leasing a task.

The engine also records richer typed failure payloads for activity, child, workflow, and failed update facts. When that payload is present, query replay, workflow resume, and Waterline-compatible run detail rebuild the exception class, durable exception alias, message, code, file, line, trace, and declared custom properties from typed history first. If the throwable class is registered under `workflows.v2.types.exceptions`, the engine records the alias as `exception_type` on failure history and as `type` inside the failure payload; replay resolves that alias before falling back to the recorded PHP class, so class moves can preserve workflow `catch` semantics. For older failures that have a recorded PHP class but no durable `type`, `workflows.v2.types.exception_class_aliases` can map that recorded legacy class to the current throwable class. Final v2 no longer includes a failure-type backfill command, so preview-era failures that must replay through durable `exception_type` after class moves should be normalized on a compatible build before the clean-slate upgrade. Selected-run detail, timeline entries, and history exports expose `exception_resolved_class`, `exception_resolution_source`, `exception_resolution_error`, and `exception_replay_blocked` so operators can see how replay will restore the failure. If neither the durable alias, class-alias bridge, nor recorded class resolves cleanly, query replay raises `UnresolvedWorkflowFailureException` and workflow workers leave the run open with the replay task failed instead of injecting a generic catchable exception into user workflow code. A configured durable alias that points at a non-throwable class reports `exception_resolution_source = misconfigured`; a loadable class that cannot be safely restored for replay, such as an abstract throwable, reports `exception_resolution_source = unrestorable`. Both states set `exception_replay_blocked = true`, mark the failed workflow task as `transport_state = replay_blocked`, and can be retried with repair after the mapping is corrected. Multiple failure snapshots remain ordered by committed history sequence when present, then by failure timestamp and id, so selected-run detail and history export keep replay-blocked failure diagnostics stable even when more than one failure is visible. This applies to parent-side `ChildRunFailed` replay as well as activity failure replay: an unmapped historical child throwable is not delivered to a broad `catch (RuntimeException)` block until the mapping is corrected and the run is repaired. Failed update bodies are different because they are non-replayable command facts and do not mutate replayed workflow state; Waterline still rebuilds `updates[*]` failed status, failure id, failure message, and exception-resolution fields from typed `UpdateCompleted` history keyed by durable `update_id`, so command-row, update-row, or failure-row drift cannot hide the real update failure. When a workflow catches a failed activity or child and continues, the worker now appends a typed `FailureHandled` history event only after the exception is actually caught, so handled disposition is durable history rather than only a mutable `workflow_failures.handled` flag. That same history-backed path now also keeps selected-run `exception_count`, compatibility `exceptions[*]`, update failure detail, timeline failure detail, and history-export `failures[*]` populated even if mutable update or failure rows later drift or disappear. That richer payload is exposed through the compatibility `exceptions[*].exception` field, while the existing top-level `exceptions[*].code` field remains the source-snippet preview for the legacy Waterline UI. Older runs that only recorded the coarser failure rows still fall back to the compatibility shape.

In practice that means:

- ordinary queue workers run a light recovery sweep during Laravel's `Looping` event
- that loop also records a database-backed compatibility heartbeat snapshot so run detail can distinguish "this build cannot claim it" from "no active worker heartbeat can claim it"; during mixed-fleet upgrades the same fleet view also reads the older cache heartbeat format until those workers restart, and each visible snapshot reports `source = database` or `source = cache`; when a compatibility namespace is configured, those legacy cache snapshots stay visible as rollout fallback with `namespace = null` until the old workers restart onto the durable heartbeat path
- `last_dispatched_at` now means the most recent confirmed queue handoff for that durable task, not merely that the engine tried to publish it
- failed queue handoffs are recorded on the durable task row via `last_dispatch_attempt_at` and `last_dispatch_error`, so Waterline can show transport failures without pretending the task was published successfully
- the engine refuses to publish a durable task to an unsupported backend connection, including the `sync` queue driver, before the queue dispatcher can run it inline; that refusal is recorded through the same dispatch-failure fields and repair projection as a failed queue handoff
- the engine also refuses to claim a ready workflow, activity, or timer task when the task's snapped backend capability check fails; that refusal records `last_claim_failed_at` and `last_claim_error`, leaves the task ready and unleased, and prevents workflow replay, activity execution, or timer-fire history from being written by an unsupported worker
- a ready workflow, activity, or timer task whose dispatch is overdue is re-dispatched from the existing durable task row even if the scanning worker does not advertise that task's marker; the compatibility fence still applies later when a worker actually tries to claim the task
- a leased workflow, activity, or timer task whose lease expires is moved back to `ready` and dispatched again from that same durable task row without requiring the recovery worker to be able to execute it itself
- when an activity task is claimed again after recovery, the execution's durable `attempt_count` advances, a new current-attempt id plus `activity_attempts` row is recorded for Waterline and history, the older attempt is closed as `expired`, and any late outcome from that expired lease is ignored instead of overwriting the newer attempt
- when a retryable activity fails before `$tries` is exhausted, the failed attempt closes as `failed`, the execution returns to `pending`, and the next durable activity task is scheduled with the activity's `backoff()` delay instead of waking the workflow with a terminal `ActivityFailed` event
- if the mutable `activity_executions` row for a pending activity disappears before the activity starts, manual repair and the worker-loop repair path restore that execution from typed `ActivityScheduled` history, preserving the activity execution id, workflow sequence, activity type, arguments, routing, attempt count, and snapped retry policy before recreating the missing activity task
- if typed history proves that an activity is open, a drifted terminal `activity_executions` row does not resume workflow or query replay by itself. The run still needs committed `ActivityCompleted` or `ActivityFailed` history before the activity can resolve; `ActivityCancelled` is recorded as the typed stop observation when cancellation or termination closes in-flight activity work.
- if an older grouped activity or child row has `parallel_group_path` only on `activity_executions` or `workflow_links`, run `php artisan workflow:v2:backfill-parallel-group-metadata --dry-run` to inspect the compatible typed history rows, then run the command without `--dry-run` before relying on replay, query, export, or Waterline projection for that barrier identity. The command stamps the path onto matching typed activity and child history events and rebuilds selected-run projections for changed runs.
- if that delayed retry task row is lost before it runs, manual repair and the worker-loop repair path rebuild the replacement activity task from the latest typed `ActivityRetryScheduled` history for that execution, preserving `retry_available_at`, `retry_of_task_id`, `retry_after_attempt_id`, `retry_after_attempt`, `retry_backoff_seconds`, `max_attempts`, and the snapped `retry_policy` instead of making the retry available immediately
- if a pending pure timer or timeout-backed condition wait loses its live `workflow_timers` row and matching timer task, manual repair and the worker-loop repair path rebuild both from typed `TimerScheduled` history, preserving the original timer id, deadline, sequence, and condition-wait timeout identity
- if a ready timer task survives but its live timer row is gone, the timer worker restores that row from typed history before it records `TimerFired`, so the run can still resume from the original durable timer identity
- if only a terminal mutable timer row exists and no typed timer history can prove that timer step, replay stays blocked and operator detail reports `terminal_timer_row_without_typed_history`; the row status remains visible for diagnostics, but it is not treated as a durable timer outcome
- the upgrade path also normalizes older already-started activity executions that predate `activity_attempts` into one latest-known durable attempt row plus `current_attempt_id`, and heartbeat or repair will self-heal any remaining missing row before they update it; that upgrade path restores the latest attempt identity, not every older closed attempt that an earlier release never stored
- a run that is already projected as `repair_needed` with no open workflow, child-resolution workflow, accepted-update, accepted-signal, pending-activity, or timer task row gets that missing durable task recreated automatically on the worker loop without requiring the scanning worker to advertise the run marker; pending-activity repair can restore a missing mutable execution row from typed activity history first
- when the selected run has no open semantic wait and no open workflow task row, Waterline still exposes a synthetic `tasks[*]` diagnostic row with `type = workflow`, `status = missing`, `transport_state = missing`, and `task_missing = true`, so the same repairable no-resume-source invariant is visible before manual or worker-loop repair recreates the workflow task
- the Waterline health endpoint reports repair-needed summaries through the `durable_resume_paths` check even when `task_transport` is otherwise healthy, because a missing durable next-resume source can be proven from the run-summary projection without an unhealthy task row to count
- when a parent has already recorded `ChildRunCompleted`, `ChildRunFailed`, `ChildRunCancelled`, or `ChildRunTerminated` but the parent resume workflow task row is gone, Waterline keeps the run projected as `wait_kind = child` with `resume_source_kind = child_workflow_run`, adds a synthetic missing workflow task row carrying `workflow_wait_kind = child`, `child_call_id`, and `child_workflow_run_id`, and repair recreates the same child-resolution workflow task
- when the recreated workflow task belongs to an accepted update, its task payload carries `workflow_wait_kind = update`, `workflow_update_id`, `workflow_command_id`, the open wait id, and the `workflow_update` resume source so Waterline can show the repaired task as update transport instead of a generic selected-run task
- accepted update repair requires that same update or command identity when deciding whether an existing workflow task backs the wait; an open workflow task for a signal, child result, condition timeout, or other resume source no longer hides missing update transport
- when the recreated workflow task belongs to an accepted signal, its task payload carries `workflow_wait_kind = signal`, `workflow_signal_id` when the lifecycle row exists, `workflow_command_id` as the older-row fallback, the open wait id, and the signal or command resume source so Waterline can show the repaired task as signal transport instead of a generic selected-run task
- when repair targets an older accepted signal or update that still lacks its `workflow_signals` or `workflow_updates` lifecycle row, the repair path backfills that row from the accepted command plus typed history before it recreates the workflow task, so the repaired task immediately switches to durable `workflow_signal` or `workflow_update` ids instead of staying on command fallback
- the repaired task increments `repair_count`, and Waterline surfaces the state with `liveness_state = repair_needed` plus task-level fields such as `transport_state`, `dispatch_failed`, `dispatch_overdue`, or `lease_expired`
- manual `repair()` remains available for operator-driven recovery, cold-start or low-traffic cases where no worker loop has repaired the run yet, and mixed-fleet cases where the current process can record the repair command even if a different compatible worker will eventually claim the recreated task
- when an existing ready or expired task is blocked only by compatibility, Waterline surfaces `*_task_waiting_for_compatible_worker` only when neither the current build nor any active heartbeat snapshot advertises the effective marker, and the Repair control stays hidden because the durable transport state is already healthy

The engine is intentionally conservative around in-flight activities:

- a missing task for a `pending` activity execution is repairable, because the activity has not started yet
- a `running` activity execution with no open task row is surfaced as `liveness_state = activity_running_without_task` only when typed activity history still authoritatively says that execution is in flight
- in that typed-history-backed state `repair()` returns `repair_not_needed` and Waterline hides the Repair control so the engine does not restart user code that may still be executing on another worker
- older open activity, timer, and child waits that only survive as mutable rows or links without typed history are projected as diagnostic-only with `history_authority = mutable_open_fallback`, `diagnostic_only = true`, `liveness_state = workflow_replay_blocked`, and `repair_blocked_reason = unsupported_history`; those rows stay visible for incident review but are not treated as durable repair targets

Manual repair still returns `repair_not_needed` for healthy external waits such as `wait_kind = signal`, and for unsupported diagnostic-only mutable fallback rows, because neither case names a missing or stranded durable task to recreate.
After a signal is durably received, that external wait is no longer open and the accepted signal application becomes the selected resume obligation until `SignalApplied` is recorded. If the workflow task row is lost before application, the run stays projected as `wait_kind = signal`, `open_wait_id = signal-application:{signal_id}` when the lifecycle row exists, and `resume_source_kind = workflow_signal` with `liveness_state = repair_needed`; repair recreates the workflow task with the same signal target identity.
Accepted updates follow the same durable transport rule: while the update is accepted but not yet applied, `wait_kind = update` remains the selected-run wait, and a lost backing workflow task is repairable through the webhook, PHP, Waterline, or worker-loop repair path.
Child resolution follows that same transport rule after the parent has recorded its own `ChildRun*` event. While the child itself is still active, the parent has a healthy external child wait and repair is not needed. After the parent-side child-resolution event exists, the parent resume workflow task is the durable transport, so a lost task row is repairable from the typed child history rather than from the mutable child run row.

The worker-loop repair policy is configurable under `workflows.v2.task_repair`. The defaults are `redispatch_after_seconds = 3`, `loop_throttle_seconds = 5`, `scan_limit = 25`, and `failure_backoff_max_seconds = 60`. The matching environment variables are `WORKFLOW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS`, `WORKFLOW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS`, `WORKFLOW_V2_TASK_REPAIR_SCAN_LIMIT`, and `WORKFLOW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS`. Each pass selects existing-task candidates and missing-task runs with the `scope_fair_round_robin` strategy across `connection`, `queue`, and `compatibility`, so one hot scope cannot starve the other queue or worker scopes that also need repair. The first dispatch failure can be retried immediately, but repeated dispatch or claim failures set `workflow_tasks.repair_available_at` with an exponential backoff based on `repair_count`; until that timestamp arrives, the task remains visibly unhealthy but does not consume a repair-candidate slot. Waterline's v2 operator metrics echo the active values in `operator_metrics.repair_policy`, plus `operator_metrics.repair.selected_*` counts, so dashboards and alerts can interpret `dispatch_overdue`, `unhealthy_tasks`, `repair_backoff`, and repair backlog pressure against the same thresholds the worker loop is using.

When you need that same repair sweep on demand, run:

```bash
php artisan workflow:v2:repair-pass
```

The command executes one repair pass immediately using the same candidate selection, scan limit, and backoff policy as the worker loop. By default it bypasses the loop throttle so operators can force a repair sweep during low traffic, after a deploy, or while validating a fix. Add `--run-id=...` to limit the pass to one or more selected runs, `--instance-id=...` to limit it to a single workflow instance, `--respect-throttle` when you want the command to skip work instead of overlapping with a loop that already owns the throttle window, and `--json` for CI or scripted operator tooling.

That on-demand pass uses the same typed reconstruction rules as the worker loop: parent child-resolution workflow tasks are rebuilt from the parent's committed `ChildRun*` history, and delayed activity-retry tasks are rebuilt from `ActivityRetryScheduled` history with the original retry deadline and retry metadata intact.

Selected repair and command-contract backfill failures go through the normal application exception pipeline in both paths: the background repair/watchdog loop calls `report()` for existing-task repair failures, missing-task reconstruction failures, and command-contract backfill failures, and `php artisan workflow:v2:repair-pass` exits non-zero whenever any of those selected failures occur, including the `--json` path.

For replay-debug and incident review, the engine can export a selected run as a versioned history bundle without scraping raw workflow tables. Use `WorkflowStub::historyExport()` in application code, `Workflow\V2\Support\HistoryExport::forRun($run)` inside tooling, or Waterline's `GET /waterline/api/instances/{instanceId}/runs/{runId}/history-export` endpoint. The bundle includes the ordered typed history, command audit rows, scheduler tasks, activities, activity attempts, timers, failures, lineage links, compatibility marker, payload codec, and stored argument/output payloads. Exported activities, activity attempts, and timers are rebuilt from typed activity and timer history first, with mutable `activity_executions`, `activity_attempts`, and `workflow_run_timers` rows used only as compatibility fallback or enrichment for older data. Row-only terminal activity and timer fallbacks export as unsupported diagnostics, including `history_authority`, `history_unsupported_reason`, `history_event_types`, and `row_status`, rather than as durable results or timer fires. If `workflows.v2.history_export.redactor` is configured, the export calls that `Workflow\V2\Contracts\HistoryExportRedactor` for workflow payloads, history-event payloads, command payload/context, update payloads, task payloads, activity payloads, and failure message/file/trace diagnostics before returning the bundle. The bundle reports whether redaction ran through `redaction.applied`, names the policy in `redaction.policy`, and lists each redacted slot in `redaction.paths`. After redaction, the export adds an `integrity` block with the canonicalization contract and a SHA-256 checksum; configure `workflows.v2.history_export.signing_key` and optional `signing_key_id` when downstream systems need an HMAC-SHA256 signature for artifact verification. Closed runs set `history_complete = true`; running or waiting runs are point-in-time snapshots for debugging, not final archive artifacts.
