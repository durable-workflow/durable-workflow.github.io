---
sidebar_position: 11
title: Failures and Recovery
description: Diagnose activity failures, non-retryable exceptions, run timeouts, cancellation cleanup, and recovery actions.
tags:
  - failures
  - recovery
  - operations
keywords:
  - workflow failures
  - non retryable exception
  - workflow recovery
---

# Failures and Recovery

Before you triage a failure, keep the core execution contract in mind:

- workflow tasks recover by replaying committed history
- activity execution is at-least-once and may be observed more than once
- lease expiry and redelivery are normal recovery paths, not proof that the
  previous worker never executed the side effect

Read [Execution Guarantees and Idempotency](./constraints/execution-guarantees.md)
first when you need the precise semantics behind retries, redelivery, and
durable outcomes.

## Handling Exceptions

`Workflow\V2\Activity` defaults to `$tries = 1`: one attempt, with no automatic retry after an exception. The first activity failure is sent back to the workflow. Workflow code can catch it, as below; if the exception is not handled, the run fails and becomes terminal.

Retries are opt-in. Set `$tries` above `1` to allow more attempts, or `0` for unlimited attempts, and choose a `backoff()` policy. A retryable failure is delivered to workflow code only after the configured attempt or timeout budget is exhausted. A non-retryable failure bypasses the remaining retries.

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

First inspect the selected run's durable status and activity retry policy. With the default single attempt, an uncaught activity failure has already made the run terminal. Deploying a fix or calling `repair()` does not reopen that failed run.

Fixing code while the original run waits is possible only while the activity still has an eligible retry. Configure `$tries` above `1`, or `0` for unlimited attempts, with `backoff()` before the activity is scheduled. Optionally set `ActivityOptions::$scheduleToCloseTimeout` to bound the total activity duration across retries; workflow deadlines still apply. See [Retries](./configuration/options.md#retries), [Backoff](./configuration/options.md#backoff), and [ActivityOptions](./configuration/options.md#activityoptions). The retry policy is snapshotted when the activity is scheduled, so a later deployment does not extend an existing activity's attempt or timeout budget.

For a run that is still waiting on a retryable activity:

1. Check the logs for the activity that is failing and look for any errors or exceptions that are being thrown.
2. Identify the source of the error and fix it in the code.
3. Deploy the fix to the server where the queue is running.
4. Restart or roll the relevant workers so they pick up the new code and can safely reclaim work.
5. Let the next eligible retry run on a healthy worker. Repair/redelivery can recover lost task transport; it does not grant another business retry after the activity or run has closed.
6. Verify the durable outcome in Waterline, history export, or the server API instead of assuming that one worker log line is the authority.
7. If the activity continues to fail, check the remaining attempt and time budgets before repeating the process.

A run with an eligible activity retry remains waiting and can continue after the corrected code succeeds, provided its original budgets have not expired. This does not guarantee that every failing workflow can be fixed in place: an unhandled final activity failure, a workflow-code failure, a structural limit, or a workflow timeout can make the run terminal.

For a terminal failed run, preserve its history and reconcile any external side effects before deciding whether the application should start a new workflow. Use application idempotency for repeated business operations. If an uncaught activity failure ended the run, check whether you can [redrive](#redrive) it after the fix is deployed. Redrive continues in a new run that reuses the completed activity results. There is no automatic workflow-level retry or terminal-run reopening; see [Workflow-Level Retry](#workflow-level-retry).

## Redrive a Failed Run {#redrive}

Redrive continues a failed run in a new run of the same workflow instance. The new run reuses the recorded results of the activities that completed before the failure and schedules the failed activity again. Use it after you fix the cause of an activity failure, so that completed work such as a payment or an email is not repeated.

The failed run stays closed and unchanged. The new run, called the successor, gets the next run number and becomes the instance's current run. Its `continued_from_run_id` names the failed run, and its `WorkflowStarted` event records `recovery_kind: redrive` and `resume_step_sequence`, the step where execution resumes.

This section describes redrive in Workflow 2.18.0 and later. Earlier Workflow releases, and redrive in the native Server, accept fewer runs and reuse only activity results. See [Earlier releases and the native Server](#redrive-earlier-releases).

The successor replays workflow code from the start:

- Each activity call that completed in the failed run returns its recorded result. The activity does not run again.
- A side effect or version marker before the failed step is reused in step order. The side effect does not run again, and a version check returns the recorded version.
- A `timer()` that fired before the failed step is recorded in the successor as already fired. The successor does not wait for it again.
- The failed activity call is scheduled as a new activity execution, using the retry policy in the workflow code. Its attempts start again.
- Everything after the failed step runs as it would in a new run.
- Memos and search attributes set when the run started carry over to the successor, as they do for continue-as-new.
- The successor keeps the failed run's execution deadline. Its run timeout starts again at the redrive.
- Each reused activity result, side effect, version marker and fired timer carries `reused_from_run_id` and `reused_recorded_at`.
- In embedded mode, `Workflow::now()` in the successor starts at the failed run's start time. Replay uses `reused_recorded_at`, so `Workflow::now()` after a reused step equals the time in the failed run. A step reused by a second redrive keeps the time it first ran.

### Request a redrive {#request-a-redrive}

In embedded mode, resolve the `Workflow\V2\Contracts\WorkflowControlPlane` contract from the Laravel container and call `redrive()` with the workflow instance id and the failed run id:

```php
use Workflow\V2\Contracts\WorkflowControlPlane;

$result = app(WorkflowControlPlane::class)->redrive($instanceId, $failedRunId, [
    'request_id' => 'incident-42',
]);

if ($result['accepted']) {
    $successorRunId = $result['workflow_run_id'];
} else {
    $reason = $result['reason'];
}
```

In service mode, send `POST /api/workflows/{workflowId}/runs/{runId}/redrive` with an optional `request_id` in the body. The clients wrap the same route:

| Surface | Call |
| --- | --- |
| CLI | `dw workflow:redrive <workflow-id> <run-id> --request-id <id>` |
| PHP SDK | `Client::redriveWorkflow($workflowId, $failedRunId, $requestId)` |
| Python SDK | `await client.redrive_workflow(workflow_id, failed_run_id, request_id=...)` or `await handle.redrive()` |
| Rust SDK | `client.redrive_workflow_run(workflow_id, failed_run_id, request_id)` or `handle.redrive(request_id)` |

An accepted redrive returns the successor's run id and `resume_step_sequence`. A refused redrive returns a `reason` and changes nothing. Redriving a run that was already redriven returns the existing successor instead of creating another one. Pass a `request_id` so that a retried request is safe. A `request_id` already used for another redrive of the same instance is refused with `request_id_already_used`.

Service workers report a workflow definition fingerprint, and redrive compares it with the fingerprint recorded when the run started. In the Rust SDK, call `Worker::set_workflow_definition_sources()` for each workflow you want to redrive. A workflow registered without source identity still runs, but redrive refuses it.

### When a failed run can be redriven {#redrive-eligibility}

Redrive accepts a failed run when all of these are true:

- The run is the instance's current run.
- The run failed because an activity failure reached workflow code and was not caught. A run that failed in workflow code, on a structural limit or on a workflow timeout is refused.
- Every step before the failed activity is a completed activity, a side effect, a version marker or a `timer()` that fired. Activity and side effect results must be stored inline. A result held in external payload storage is refused.
- The workflow definition matches the fingerprint recorded when the run started. If the fix changes workflow code, redrive refuses the run.
- The execution deadline has not passed.
- Workflow code did not upsert a memo or search attribute. The run has no parent workflow, no child workflows and no local activities, and its input is stored inline.

A refusal names the first rule that failed:

| Reason | Meaning |
| --- | --- |
| `run_not_failed` | The run is not in the `failed` state. |
| `source_run_not_current` | A newer run of the instance exists. |
| `unrecorded_failure_boundary` | The run did not fail on an activity failure that escaped workflow code. A run that failed in workflow code returns this reason. |
| `unsupported_history` | The history before the failure contains a step that redrive cannot reuse, such as a signal, an update, a child workflow or a cancelled timer. |
| `unsupported_local_activity` | The history contains a local activity. |
| `unsupported_timer` | The history contains a condition or signal timeout, a cancellation cleanup timer, or a timer inside a cancellation scope or parallel group. |
| `incomplete_timer_step` | A timer step does not have both its scheduled and fired events. |
| `invalid_step_sequence` | A side effect, version marker or timer does not have a valid step number. |
| `duplicate_step_sequence` | Two side effects, version markers or timers share one step number. |
| `external_activity_result_not_supported` | A completed activity result is stored in external payload storage. |
| `external_side_effect_result_not_supported` | A side effect result is stored in external payload storage. |
| `missing_activity_result`, `unavailable_activity_result` | A completed activity result is missing or cannot be decoded. |
| `unsupported_visibility_metadata` | Workflow code upserted a memo or search attribute. |
| `unsupported_source_metadata` | The run was started as a child of another workflow. |
| `unsupported_source_link_or_payload` | The run is linked as a child of another workflow, or its input is in external payload storage. |
| `execution_deadline_elapsed` | The execution deadline has passed. |
| `workflow_definition_unavailable_or_changed` | The definition fingerprint is missing or differs from the one recorded at start. |
| `request_id_already_used` | The `request_id` was already used for another redrive of the instance. |
| `invalid_request_id` | The `request_id` is longer than 191 characters. |
| `run_not_found`, `instance_not_found` | The run or instance does not exist in the namespace. |

The remaining reasons report a history that does not have the expected shape: `invalid_history`, `events_after_failure`, `duplicate_start`, `missing_start`, `unexpected_start`, `missing_terminal_history`, `invalid_activity_sequence`, `activity_sequence_gap`, `missing_activity_type`, `activity_type_mismatch`, `duplicate_activity_completion`, `incomplete_activity_prefix` and `invalid_failed_step`. Export the run's history and inspect it before you decide how to recover.

When redrive refuses a run, preserve its history, reconcile external side effects and decide whether the application should start a new workflow.

### Check whether a run can be redriven {#redrive-check}

In Workflow 2.18.0 and later, run detail reports `can_redrive` and `redrive_blocked_reason`. Waterline's selected-run detail reads these fields. `WorkflowControlPlane::describe()` reports the same fields under `actions`. They come from the same check `redrive()` applies, so you can see whether a run can be redriven, and why not, before you request it.

A run that is not failed reports `run_not_failed`. A run that was already redriven reports `already_redriven`. For a service-mode run, the report only checks that a fingerprint was recorded. `redrive()` still compares it with the worker's fingerprint.

### Earlier releases and the native Server {#redrive-earlier-releases}

Workflow releases before 2.18.0 accept a narrower set of runs. Every step before the failed activity must be a completed activity. A side effect, version marker or timer in that history is refused with `unsupported_history`, and any memo or search attribute is refused with `unsupported_visibility_metadata`. Run detail and `describe()` do not report `can_redrive` or `redrive_blocked_reason`.

Redrive in the native Server still applies these earlier rules. Native Server support for the Workflow 2.18.0 rules is tracked in [server#980](https://github.com/durable-workflow/server/issues/980).

## Service Entry Refusal and Recovery {#service-entry-recovery}

**Released support.** Server 2.9.9 and PHP SDK 2.5.4, Python SDK 2.6.2 and Rust SDK 3.5.6 introduced the entry safeguards and routing/recovery behavior below. These are minimum feature versions; install current stable releases for security fixes.

An entry mismatch is a deployment/replay refusal before application workflow code runs, not an activity retry or a terminal business failure. The worker reports `failure_reason = workflow_entry_arguments_mismatch`, and the Server retains the failed workflow task with `replay_blocked = true` instead of automatically creating another attempt. Its generic `replay_blocked_reason` is `worker_reported_replay_failure`. The run remains nonterminal, with its recorded input, history and deadlines intact. This differs from an exception thrown by a successfully entered workflow body, which can still fail the run.

Recover only after checking the actual durable state:

1. Inspect the selected run with `GET /api/workflows/{workflowId}/runs/{runId}/debug`. Confirm `latest_workflow_task_failure.reason` is `workflow_entry_arguments_mismatch` and that the original run is still open. A terminal run is not reopened by this procedure.
2. Deploy code that accepts the recorded positional arguments or typed input. Preserve the original workflow/run id, namespace, queue, build compatibility, history and deadlines. Never edit stored input or substitute new DTO defaults.
3. Confirm an eligible worker is available using [definition routing](./polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution). Repair does not create a worker or prove replay compatibility.
4. Use `POST /api/workflows/{workflowId}/runs/{runId}/repair` with the normal authorized operator credential and namespace. The selected-run route refuses a historical target instead of silently repairing a newer run. PHP also exposes `Client::repairWorkflow($workflowId, $runId)`; Python's `repair_workflow(workflow_id)` targets the current instance, and Rust has no equivalent repair convenience method.
5. Verify the same original resumes with its recorded input and history prefix, then records its expected outcome once. An elapsed original deadline still applies. If the replacement remains incompatible, inspect the new refusal rather than repeatedly issuing repair.

Older Server releases may store the SDK's specific reason without classifying it as a replay block, so reporting the failure alone does not establish the no-automatic-retry contract. Use the qualified runtime/SDK combination. See [Versioning](./features/versioning.md#service-sdk-entry-safeguard) for language boundaries and [Workflow Commands](./polyglot/server-api-reference.md#workflow-commands) for the authenticated selected-run routes.

## Workflow Timeout Enforcement

When `StartOptions::withExecutionTimeout()` or `StartOptions::withRunTimeout()` is set, the engine records a deadline on the workflow run. The execution deadline spans the entire logical workflow (including continue-as-new runs), while the run deadline resets with each new run.

If a deadline has passed when the engine starts a workflow task, the run is closed immediately:

- All open activity executions, timers, and outstanding tasks are cancelled with typed history events (`ActivityCancelled`, `TimerCancelled`).
- A `WorkflowFailure` row is recorded with `failure_category = timeout` and `propagation_kind = timeout`.
- A `WorkflowTimedOut` history event is recorded with `timeout_kind` set to `execution_timeout` or `run_timeout`.
- The run status becomes `failed` with `closed_reason = timed_out`.
- Parent workflows waiting on the timed-out child are notified.

The background task watchdog also scans for non-terminal runs with expired deadlines that have no open workflow task (for example, a run waiting on an activity or timer when the deadline passes). When it finds one, it creates a workflow task so the executor can detect and enforce the timeout on the next pass.

Waterline surfaces `failure_category` in the exceptions table as a dedicated **Category** column and in timeline failure detail entries. History exports include `failure_category` in the `failures[*]` array. Final v2 writes this classification when the failure is recorded; imported v1 rows that cannot be classified remain visible as unclassified diagnostics.

## Activity Retries

For a shared attempt budget across workflows and queues, combine authored retry limits with [Server admission and an application breaker](./polyglot/task-queue-admission.md#retry-load-and-downstream-budgets). First attempts and retries both consume the cap; local/embedded execution has different boundaries.

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

From workflow code, bound the total activity time, including queue waits and backoff:

```php
use Workflow\V2\Support\ActivityOptions;
use function Workflow\V2\activity;

$result = activity(ChargeCard::class, new ActivityOptions(
    scheduleToCloseTimeout: 120,
));
```

Together these settings permit at most three attempts, with backoffs of 5 and 30 seconds, under the original 120-second schedule-to-close deadline. An earlier workflow deadline still applies. Enable retries only for operations that can safely be repeated, using idempotency guards for external effects.

When a retryable activity throws before `$tries` is exhausted, the engine closes the current `activity_attempts` row as runtime state, returns the `activity_executions` row to `pending`, records a typed `ActivityRetryScheduled` history event for the failed try, and creates a new durable activity task with `available_at` set from the `backoff()` policy. The workflow stays waiting on that same activity execution and is not resumed with the exception until the final retryable attempt fails.

The retry task records `retry_of_task_id`, `retry_after_attempt_id`, `retry_after_attempt`, and `retry_backoff_seconds` in its payload so Waterline can explain why the task is scheduled. Selected-run detail rebuilds the failed attempt in `activities[*].attempts` from typed activity history first, shows `ActivityRetryScheduled` in the timeline, and reports retrying activity counts through `operator_metrics.activities.retrying`, `operator_metrics.activities.failed_attempts`, and `operator_metrics.backlog.retrying_activities`.

`Workflow\Exceptions\NonRetryableExceptionContract` still short-circuits the retry policy: throwing a non-retryable exception fails the activity execution immediately and resumes the workflow with the exception.

### Retry delay resolution

Activity `backoff()` values are integer seconds. Durable retry intervals have
whole-second resolution. Do not use a fractional value such as `0.1` to request
a 100 ms retry. SDK APIs that generate intervals from fractional values round
them up to the next second. The Python and Rust SDK references describe their
accepted parameter types and conversions.

A retry becomes eligible after its delay, but queue latency and worker load can
make the next attempt start later. For fast tests, use
[controlled time or bounded zero-delay fixtures](./testing.md#keeping-delay-tests-fast).

### Activity execution identity and idempotency

Retry is not the only reason the same logical activity can be observed more than once. Lease expiry, worker loss, delayed completion reporting, and redelivery can all produce another attempt or a stale completion report for the same durable activity execution.

- `activity_execution_id` identifies the logical activity across retries and redelivery. Use it as the default idempotency key for remote side effects.
- `activity_attempt_id` identifies one specific try of that logical activity. Use it only when a downstream system must distinguish separate attempts.
- A late completion or failure report from a superseded attempt is normal stale-attempt behavior, not proof that the engine committed the same attempt twice.

When operators investigate a late completion after lease expiry:

- trust Waterline, history export, or the server API for which attempt won the
  durable race
- do not assume a rejected late completion means the remote side effect did not
  happen
- check the external system by its idempotency key before forcing manual retry
  or repair

The safest default is to make the remote side effect idempotent under
`activity_execution_id`, then let the durable outcome tell you whether the
engine accepted the report for that specific attempt.

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

For failures that do not implement the contract, `non_retryable` is `false` by default. Final v2 records that durable marker at failure time, so declare the contract before the failure is written when operators or SDKs need to distinguish permanent failures from retryable ones.

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
- **Redrive is an explicit operator action.** [Redrive](#redrive) continues a failed run in a new run only when you request it, and it reuses completed activity results.

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

## PHP service-mode failure report limits {#php-failure-report-limits}

PHP SDK **3.5.0 or newer** bounds outgoing service-mode failure reports to 62 KiB UTF-8 messages, 128 KiB stacks, 64 KiB combined optional metadata and a 1 MiB complete encoded body, including markers. Lower known transport limits apply. The [PHP reporting guide](./polyglot/php.md#bounded-failure-reports) explains configuration, omission diagnostics, preserved retry semantics and local first-execution/cold-replay equality. These are SDK-specific reporting bounds; embedded recording and Core summary storage retain their separate contracts.

## Python service-mode failure report limits {#python-failure-report-limits}

Python SDK **2.11.0 or newer** bounds outgoing service-mode failure reports to 62 KiB UTF-8 messages, 128 KiB stacks, 64 KiB combined optional metadata and a 1 MiB complete encoded body, including markers. Lower known transport limits apply. The [Python reporting guide](./polyglot/python.md#bounded-failure-reports) explains configuration, omission diagnostics, preserved retry semantics and the same local observation during first execution and cold replay. These limits apply to SDK reporting. Embedded recording and Core summary storage retain their separate contracts.

## Rust service-mode failure report limits {#rust-failure-report-limits}

For service-mode workers actually running Rust SDK **4.10.1 or newer**, outgoing failure messages are at most 62 KiB UTF-8 including marker, stacks 128 KiB where supported, combined serialized optional metadata 64 KiB, and the full encoded body 1 MiB or a lower known transport cap. Original type, retry decision and claim identity stay intact; impossible mandatory envelopes refuse explicitly. The [Rust reporting guide](./polyglot/rust.md#bounded-failure-reports) explains omission markers, whole Avro details and local-result boundaries. These limits do not qualify old SDKs, embedded mode or the separate Core summary-storage correction.

## Related Guides

- [Execution Guarantees and Idempotency](./constraints/execution-guarantees.md)
  explains the replay, retry, lease-expiry, and redelivery contract that shapes
  every recovery path on this page.
- [Monitoring](./monitoring.md) explains where Waterline, history export,
  worker logs, and runtime telemetry surface the failure facts described here.
