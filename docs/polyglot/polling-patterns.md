---
title: Polling external state
description: Choose bounded retries, heartbeating activities or durable timer loops, and account for their history costs.
---

# Polling external state {#polling-external-state}

Poll an external job in an activity, never by making network requests in workflow code. Choose where the wait belongs before choosing its interval.

## Choose the waiting boundary {#choose-the-waiting-boundary}

| Pattern | Worker use | Durable history and control |
| --- | --- | --- |
| Retry one activity until ready | An activity slot during each attempt; released during retry backoff | Each attempt and retry adds history. Workflow code does not resume between attempts, so it cannot inspect a history budget or continue as new then. |
| One long activity with heartbeats | Holds its activity slot throughout the wait | Each accepted heartbeat adds a history event. Use finite activity deadlines and a bounded downstream request timeout; heartbeats do not extend the whole execution deadline. |
| Activity check followed by a durable timer | Releases activity slots between checks | Each check adds activity events and each interval adds timer events. Workflow code can decide whether to stop, compensate or continue as new between checks. |
| A dedicated polling child workflow | The child uses the slots required by its chosen pattern | Moves polling history into the child; adds child start/resolution events to the parent. It does not make the child history or execution free. Choose the parent-close policy explicitly. |
| Submit once, then receive a callback signal | Releases the activity slot after submission; the workflow waits durably | Submission, signal admission/application and any deadline-backed wait add history. Requires authenticated correlation and application duplicate handling. |

Use short, retry-safe checks. A callback blocked in a downstream request cannot become responsive merely because its workflow has a timer or cancellation policy.

## Bound retries and history {#bound-retries-and-history}

Retries are opt-in: PHP activities default to one attempt. For example, configure `maxAttempts: 3`, `backoff: [5, 30]`, `startToCloseTimeout: 10` and `scheduleToCloseTimeout: 90` for three remote attempts with finite delays and original total time. Python's matching retry policy is `ActivityRetryPolicy(max_attempts=3, backoff_seconds=[5, 30])`, with separate attempt/total timeout options. A successful “not ready” return is not a failure and does not trigger a retry. See [failures and recovery](../failures-and-recovery.md).

Retries are suitable when not-ready is an explicit retryable outcome and workflow code need not run between checks. Do not use unlimited retries as an invisible polling loop. Local-activity retry-delay parity is tracked in [the retry contract issue](https://github.com/durable-workflow/.github/issues/219); the examples here use remote activities.

## Roll over deliberately {#roll-over-deliberately}

This runnable demonstration checks once per run, waits, and carries a finite remaining-check count into the next run. Replace only the activity's synthetic status lookup with a real bounded request. The example returns the final status even when the check limit is reached; callers must inspect `ready`.

### Embedded PHP {#embedded-php}

```php
use Workflow\V2\Activity;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;
use function Workflow\V2\activity;
use function Workflow\V2\timer;
use function Workflow\V2\continueAsNew;

final class CheckDemoStatus extends Activity
{
    public function handle(int $remaining): array
    {
        return ['ready' => $remaining <= 1];
    }
}

final class PollDemo extends Workflow
{
    public function handle(int $remaining = 2, int $intervalSeconds = 30): array
    {
        $status = activity(CheckDemoStatus::class, new ActivityOptions(
            maxAttempts: 1, startToCloseTimeout: 10, scheduleToCloseTimeout: 15,
        ), $remaining);
        if ($status['ready'] || $remaining <= 1) {
            return $status;
        }
        timer($intervalSeconds);
        return continueAsNew($remaining - 1, $intervalSeconds);
    }
}
```

Start it through the normal [embedded workflow setup](../installation.md), with finite run and execution timeouts.

### Python service worker {#python-service-worker}

```python
from durable_workflow import activity, workflow
from durable_workflow.workflow import ActivityRetryPolicy

@activity.defn(name="poll-demo.status")
async def check_status(remaining):
    return {"ready": remaining <= 1}

@workflow.defn(name="poll-demo")
class PollDemo:
    def run(self, ctx, remaining=2, interval_seconds=30):
        result = yield ctx.schedule_activity(
            "poll-demo.status", [remaining],
            retry_policy=ActivityRetryPolicy(max_attempts=1, backoff_seconds=[1]),
            start_to_close_timeout=10, schedule_to_close_timeout=15,
        )
        if result["ready"] or remaining <= 1:
            return result
        yield ctx.sleep(interval_seconds)
        return ctx.continue_as_new(remaining - 1, interval_seconds)
```

Register `PollDemo` and `check_status` in the same [Python worker](./python.md), then start with arguments `[2, 30]` and finite execution/run timeouts. Observe the current workflow instance to follow its successor; a run-specific handle still selects its original run.

The two examples were exercised on published Server **2.9.7 / Core 2.7.2**, with normally installed Python **2.6.1** and test input `[2, 1]`. Both completed two real checks across two runs. Continue-as-new resets run history, adds run/link overhead and preserves the original execution deadline. It does not provide an unlimited lifetime.

Use relative durable waits here. Python's advancing clock and replay-stable history-budget reads remain separate [clock](https://github.com/durable-workflow/.github/issues/215) and [budget](https://github.com/durable-workflow/workflow/issues/859) work. This recipe does not branch on `ctx.now()` or recomputed history length. Do not treat `DW_MAX_HISTORY_EVENTS` as an enforced automatic rollover: [Server #504](https://github.com/durable-workflow/server/issues/504) tracks that gap.

## Interrupt and reconcile {#interrupt-and-reconcile}

For a signal-driven stop, [select a signal against the pending wait](../features/concurrency.md) and explicitly cancel the losing operation according to its supported cancellation policy. Selection alone does not cancel losers. A request to stop an activity does not prove that an external side effect never happened: use idempotency keys and reconcile before compensating or restarting work. Immediate cancellation, termination and hard workflow timeout do not execute workflow compensation; use the supported [cooperative cancellation](./cancellation.md) path when cleanup must run.

## Inspect the actual history {#inspect-the-actual-history}

The published Python service-mode measurements above recorded:

| Completed case | Canonical history events |
| --- | --- |
| One remote activity succeeding on attempt three | 10 total: 1 scheduled, 3 started, 2 retry-scheduled, 1 completed, plus 3 run lifecycle events |
| One activity with two accepted heartbeats | 8 total: 3 activity events, 2 heartbeat events, plus 3 lifecycle events |
| Two successful checks separated by one timer | 11 total: 6 activity events, 2 timer events, plus 3 lifecycle events |

The rollover example recorded **8 + 5** events across its Python runs and **8 + 6** across PHP runs; PHP also records `StartAccepted` for the successor. These are measured operation/run costs, not universal event totals, billing units or performance results. Other commands, failures, cancellation and runtime admission metadata can add events. Inspect each run's history, retained attempt policy and original deadlines rather than estimating growth from loop iterations alone. Exact observations and unsuccessful fixture records are retained in [the qualification receipt](https://github.com/durable-workflow/durable-workflow.github.io/issues/283#issuecomment-6288504564).
