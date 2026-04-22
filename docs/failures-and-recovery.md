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

## Related Guides

- [Monitoring](./monitoring.md) explains where Waterline, history export,
  worker logs, and runtime telemetry surface the failure facts described here.
