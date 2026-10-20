---
title: Polling external state
description: Choose bounded polling or callback signals, place the durable wait in workflow code, and account for history costs.
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
| Submit and return, then receive a callback signal | Releases the activity slot after submission; the workflow waits durably | Submission, signal admission/application and any deadline-backed wait add history. Requires authenticated correlation and application duplicate handling. |

Use short, retry-safe checks. A callback blocked in a downstream request cannot become responsive merely because its workflow has a timer or cancellation policy.

## Callback and signal completion {#callback-and-signal-completion}

When the external system can notify you, submit its job in a short activity and return the acknowledgement. Let the **workflow** wait for a declared signal or replayed condition with a finite deadline. Do not keep an activity, HTTP response or SSE connection open until the job finishes.

Choose the workflow instance id and store the correlation between the authenticated external operation, namespace, **public workflow instance id** and declared signal name before starting the workflow. Its activity may submit the job as soon as start commits. A run id identifies only one run and is not a stable callback address across continue-as-new. Authenticate the callback and check that stored mapping before forwarding it; do not trust routing or identity fields supplied by an arbitrary request.

### Embedded PHP callback {#embedded-php-callback}

Configure `services.jobs.url` for your provider and `services.jobs.callback_url` for your authenticated application adapter. Adapt the illustrated `/jobs` request to the provider's API: it must acknowledge submission quickly and return `job_id`. Implement provider-specific authentication and a bounded request. The operation key is useful only if that provider actually honors it for deduplication.

```php
use Illuminate\Support\Facades\Http;
use Workflow\V2\Activity;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;
use function Workflow\V2\activity;
use function Workflow\V2\await;

#[Type('external.submit')]
final class SubmitExternalJob extends Activity
{
    public function handle(string $workflowId, string $operationId): array
    {
        return Http::connectTimeout(2)->timeout(5)
            ->withHeaders(['Idempotency-Key' => $operationId])
            ->post(config('services.jobs.url').'/jobs', [
                'workflow_id' => $workflowId,
                'operation_id' => $operationId,
                'signal' => 'job-completed',
                'callback_url' => config('services.jobs.callback_url'),
            ])->throw()->json();
    }
}

#[Type('external-completion')]
#[Signal('job-completed', [
    ['name' => 'operationId', 'type' => 'string'],
    ['name' => 'result', 'type' => 'array'],
])]
final class ExternalCompletion extends Workflow
{
    public function handle(string $operationId): array
    {
        $job = activity(SubmitExternalJob::class, new ActivityOptions(
            maxAttempts: 1, startToCloseTimeout: 10, scheduleToCloseTimeout: 15,
        ), $this->workflowId(), $operationId);

        $received = await('job-completed', timeout: 10);
        if ($received === null) {
            return ['status' => 'timed_out', 'job_id' => $job['job_id']];
        }
        if ($received[0] !== $operationId) {
            return ['status' => 'unexpected_operation'];
        }
        return ['status' => 'completed', 'result' => $received[1]];
    }
}
```

Start with a caller-selected instance id and finite run/execution timeouts. Register `ExternalCompletion` with [authenticated webhooks](../features/webhooks.md); the application's callback adapter can forward validated input to its instance-targeted signal route:

```bash
curl -fsS -X POST "$APP_URL/webhooks/instances/external-job-42/signals/job-completed" \
  -H "Authorization: $WEBHOOK_TOKEN" -H 'Content-Type: application/json' \
  -d '{"arguments":["op-42",{"value":42}]}'
```

This is the embedded webhook's `arguments` format, not the Server's payload envelope. The provider should call your authenticated application adapter, not receive your Server operator or worker credentials.

### Python callback and condition {#python-callback-and-condition}

The activity below performs only the bounded submission. Configure `JOB_API_URL`, `JOB_CALLBACK_URL` and provider authentication in the activity environment. Register both definitions in the [Python worker](./python.md). Pass the caller's known workflow instance id explicitly; this example does not invent a workflow-context id accessor.

```python
import os
import httpx
from durable_workflow import activity, workflow
from durable_workflow.workflow import ActivityRetryPolicy

@activity.defn(name="external.submit")
async def submit_external_job(workflow_id, operation_id):
    async with httpx.AsyncClient(timeout=5.0) as provider:
        response = await provider.post(
            os.environ["JOB_API_URL"] + "/jobs",
            headers={"Idempotency-Key": operation_id},
            json={"workflow_id": workflow_id, "operation_id": operation_id,
                  "signal": "job-completed",
                  "callback_url": os.environ["JOB_CALLBACK_URL"]},
        )
        response.raise_for_status()
        return response.json()

@workflow.defn(name="external-completion")
class ExternalCompletion:
    def __init__(self):
        self.results = {}

    @workflow.signal("job-completed")
    def completed(self, operation_id: str, result: dict):
        self.results.setdefault(operation_id, result)

    def run(self, ctx, workflow_id, operation_id):
        job = yield ctx.schedule_activity(
            "external.submit", [workflow_id, operation_id],
            retry_policy=ActivityRetryPolicy(max_attempts=1, backoff_seconds=[1]),
            start_to_close_timeout=10, schedule_to_close_timeout=15,
        )
        ready = yield ctx.wait_condition(
            lambda: operation_id in self.results,
            key="external.completed", timeout=10,
        )
        if not ready:
            return {"status": "timed_out", "job_id": job["job_id"]}
        return {"status": "completed", "result": self.results[operation_id]}
```

Choose the instance id and persist the operation's namespace/instance/signal mapping **before calling start**. The workflow's activity can begin as soon as the start commits. The application then starts that instance with finite budgets:

```python
handle = await client.start_workflow(
    workflow_type="external-completion", task_queue="external-jobs",
    workflow_id="external-job-42", input=["external-job-42", "op-42"],
    execution_timeout_seconds=60, run_timeout_seconds=30,
)
```

After authenticating the provider and resolving its stored operation mapping, the callback adapter uses a Client in that **same namespace**:

```python
await client.signal_workflow(
    "external-job-42", "job-completed", args=["op-42", {"value": 42}],
)
```

This calls the Server's `POST /api/workflows/{workflowId}/signal/{signalName}` and uses the SDK's normal Avro envelope. A successful signal call confirms admission, not that workflow code processed the callback; inspect the workflow result or retained signal status when acknowledgement matters.

### Early, continued and late callbacks {#early-continued-and-late-callbacks}

- Declare the signal before starting the run. A callback arriving before its wait is retained and consumed in durable order; Python reconstructs handler state during replay. A later registration cannot rewrite an old run's declarations.
- Instance-targeted callbacks follow continue-as-new; explicitly run-targeted calls remain fenced to that run. On compatible Core 2.7.0+ runtimes, eligible received instance signals retain original identity and order across handoff. State from **already applied** callbacks must be carried in continuation input when the application still needs it.
- A callback after terminal closure is explicitly refused. On the published Server, Python exposes `SignalFailed.reason == "run_not_active"` with status409. An accepted but unapplied signal can instead retain a rejected closure disposition; the old acceptance receipt is not erased. See [signal acceptance and closure](../features/signals.md#acceptance-and-closure).
- A wait deadline does not cancel the external job. Reconcile its outcome or request provider cancellation through an activity. A late result may need an application recovery decision; do not silently start replacement work.

### Duplicate delivery and streaming limits {#duplicate-delivery-and-streaming-limits}

Providers retry callbacks, and a network error can occur after signal admission. Persist your application operation/event key and exact intent, deduplicate at the callback boundary and in business processing, and retain unresolved deliveries for reconciliation. The Python handler keeps the first result per operation in this run; it is not a cross-run or once-only admission guarantee. Do not mark an uncertain forward as processed merely because the request was sent. [Shared #216](https://github.com/durable-workflow/.github/issues/216) still owns safe signal retries and retained admission identity. A provider idempotency header or one activity attempt does not by itself guarantee once-only external effects.

Start the workflow before this recipe submits work. Service `start(use-existing)` followed by `signal` is **two operations**, with a closure race; atomic service intake remains [shared #222](https://github.com/durable-workflow/.github/issues/222). Embedded `signalWithStart` is a separate atomic API. The debounce request [Website #280](https://github.com/durable-workflow/durable-workflow.github.io/issues/280) was superseded by that product requirement, not completed by this callback recipe.

An HTTP/SSE socket held inside an activity is not durable: worker/process loss ends it, it occupies an activity slot, and reconnecting can replay or miss external events. Submission and callbacks still add activity, signal and wait history; this is not a free or unlimited execution. For durable **workflow output**, use [Workflow Streams](./workflow-streams.md) and their persisted sequence/cursor contract rather than treating a transport connection as storage.

The PHP and Python code above was exercised on published **Server 2.9.7 / Core 2.7.2**, with normally installed **Python SDK 2.6.1**. Separate PostgreSQL 17.11 controls covered early and waiting callbacks, late refusal, and continue-as-new with a callback while the Python worker was absent followed by a cold reader. Embedded controls used the real webhook route. This is recipe evidence, not all-database, provider-authentication, graceful-shutdown or native-runtime qualification. [The qualification record](https://github.com/durable-workflow/durable-workflow.github.io/issues/321#issuecomment-6292485315) preserves the unsuccessful originals separately.

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
