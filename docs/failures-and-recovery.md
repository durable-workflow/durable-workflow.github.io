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

For a terminal failed run, preserve its history and reconcile any external side effects before deciding whether the application should start a new workflow. Use application idempotency for repeated business operations. There is no automatic workflow-level retry or terminal-run reopening; see [Workflow-Level Retry](#workflow-level-retry).

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
