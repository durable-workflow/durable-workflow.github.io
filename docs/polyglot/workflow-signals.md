---
title: Signal-with-start and workflow signals
description: Start or reuse a workflow and signal it in one operation, and signal another workflow durably from workflow code, with the PHP, Python and Rust SDKs.
---

# Signal-with-start and workflow signals {#signal-with-start-and-workflow-signals}

Native Server 3.15.0 adds two signal operations:

- **Signal-with-start** is a client call. One request starts the workflow or
  reuses its open run, and records one signal on that run, in one Server
  transaction.
- **Signal another workflow** is a workflow command. Workflow code signals
  another workflow in its namespace. The request and its outcome are recorded
  once in the sender's history, and replay never sends the signal again.

## Requirements {#requirements}

| Runtime | Signal-with-start | Signal another workflow |
| --- | --- | --- |
| Native Server | 3.15.0 or later, advertised as `capabilities.signal_with_start` | 3.15.0 or later, advertised as the `signal_external_workflow` worker command |
| PHP SDK | 3.22.0 or later: `Client::signalWithStart()` | 3.22.0 or later: `WorkflowContext::signalExternalWorkflow()` |
| Python SDK | 2.20.0 or later: `Client.signal_with_start()` | 2.20.0 or later: `ctx.signal_external_workflow()` |
| Rust SDK | 4.21.0 or later: `Client::signal_with_start()` | 4.21.0 or later: `ctx.signal_external_workflow()` |
| Embedded PHP (Laravel) | `WorkflowStub::signalWithStart()`, see the [signals guide](../features/signals.md#signal-with-start) | Workflow 2.35.0 or later (experimental): `signalExternalWorkflow()`, see the [signals guide](../features/signals.md#signal-another-workflow) |

Published PHP Server 2.x supports neither operation. The SDKs check the
connected Server before sending. Against an older Server a client call raises
`ServerCapabilityUnavailable` (PHP), `RuntimeCapabilityUnsupported` (Python)
or `Error::SignalWithStartUnavailable` (Rust), and nothing is sent. A worker
refuses a new signal command with `signal_external_workflow_unavailable` before
it submits anything, so the workflow task does not complete and the run is not
failed.

## Signal-with-start {#signal-with-start}

Use signal-with-start when a caller addresses one entity and must not lose the
event between a separate start and signal. A separate
`start(use-existing)` followed by `signal` is two operations: the run can close
in between, and the signal is then refused. Signal-with-start has no gap.

- **No run.** A new run starts with this call's input and deadlines. The
  receipt's `start_outcome` is `started_new`.
- **An open run**, including the newest run after continue-as-new. The signal
  joins it, and `start_outcome` is `returned_existing_active`. The run keeps
  its input, deadlines and history. A `fail` duplicate policy refuses it with
  `instance_already_started` instead.
- **A closed run.** Refused with `run_not_active`, unless the closed-run policy
  is `start_new_run`. That starts a fresh run after the closed one, and the
  receipt names the closed run in `closed_run_id`. The closed run keeps its
  outcome.

The workflow type must be the instance's type, and the task queue must be the
open run's queue. Otherwise the Server refuses with `workflow_type_conflict` or
`task_queue_conflict`. Nothing is written for any refusal.

The request ID is the signal's [command key](./server-api-reference.md#command-keys).
Each SDK generates one per call when you omit it. Save your own key when a
retry must survive a process restart. A retry with the same key, signal name,
arguments and workflow type returns the original receipt with
`retained: true`, even after the run closed or continued, and starts nothing.

```php
use DurableWorkflow\Exception\SignalWithStartFailed;

try {
    $receipt = $client->signalWithStart(
        'orders.entity',      // workflow type
        'order-42',           // workflow ID
        'orders',             // task queue
        'changed',            // signal name
        [2],                  // signal arguments
        input: ['order-42'],  // input for a run this call starts
        requestId: 'order-42-revision-2',
    );
    $receipt['start_outcome']; // "started_new" or "returned_existing_active"
} catch (SignalWithStartFailed $failed) {
    $failed->reason(); // For example "run_not_active". Nothing was written.
}
```

```python
from durable_workflow.errors import SignalWithStartFailed

try:
    receipt = await client.signal_with_start(
        "order-42",
        "changed",
        workflow_type="orders.entity",
        task_queue="orders",
        input=["order-42"],
        signal_args=[2],
        request_id="order-42-revision-2",
    )
    receipt["start_outcome"]  # "started_new" or "returned_existing_active"
except SignalWithStartFailed as failed:
    failed.reason  # For example "run_not_active". Nothing was written.
```

```rust
use durable_workflow::{json, SignalWithStartOptions};

match client
    .signal_with_start(
        "orders.entity",
        "orders",
        "order-42",
        "changed",
        json!(["order-42"]),
        json!([2]),
        SignalWithStartOptions::new().request_id("order-42-revision-2"),
    )
    .await
{
    Ok(receipt) => println!("{}", receipt["start_outcome"]),
    // For example Some("run_not_active"). Nothing was written.
    Err(error) => println!("{:?}", error.signal_with_start_refusal()),
}
```

Pass `closedRunPolicy: 'start_new_run'` (PHP), `closed_run_policy="start_new_run"`
(Python) or `ClosedRunPolicy::StartNewRun` (Rust) to start a fresh run after a
closed one. Signal-with-start admits the signal once. The work the signal
triggers still needs its own idempotency.

## Signal another workflow {#signal-another-workflow}

Workflow code signals another workflow in its namespace by workflow ID. Without
a run ID the signal goes to the target's current run; with one, only to that
run. The signal is a workflow command, not an activity:

- The completion that carries it records `ExternalSignalRequested` in the
  sender's history, admits the signal on the target and records exactly one
  outcome, `ExternalSignalDelivered` or `ExternalSignalFailed`, at the same
  sequence, all in one Server transaction.
- On the target it is an ordinary signal: the same `SignalReceived` event and
  signal record as any other signal, attributed to the sending run. Its
  command key on the target is `workflow-signal:<sender run ID>:<sequence>`.
  Callers cannot use that prefix: a signal or signal-with-start whose request
  ID starts with `workflow-signal:` is refused with 422 and
  `reason: "request_id_reserved"`.
- Replay reads the recorded outcome and never sends again. A different target,
  run, signal name or arguments at that point in the workflow fails replay as
  nondeterministic.

An undelivered signal is a returned value, not an exception. Workflow code
decides what to do with it.

| Outcome | Reason | When |
| --- | --- | --- |
| `delivered` | none | The target run admitted the signal. |
| `target_not_found` | `instance_not_found` | No workflow with that ID exists in this namespace. |
| `target_not_found` | `run_not_found` | The run ID names no run of that workflow. |
| `target_closed` | `run_not_active` | The target run has closed. |
| `target_closed` | `historical_run` | The run ID names a run that continue-as-new has replaced. |
| `rejected` | `unknown_signal`, `invalid_signal_arguments`, `structural_limit_exceeded` | The target refused the signal, as it would refuse an HTTP signal. |
| `rejected` | `runtime_reserved_signal` | The name is reserved for the runtime's message stream. |
| `rejected` | `self_target` | The target is the sender's own workflow. |
| `rejected` | `request_id_conflict` | The command key was already used for a different signal. |

The SDKs check the signal name in workflow code before anything is recorded.
It must not be blank, must not contain a control character (a byte below
`0x20`, or `0x7f`), and is at most 191 characters and 255 bytes. The target
workflow ID is 1 to 191 characters. A refused name raises `InvalidSignalName`
(PHP and Python) or returns `Error::InvalidExternalSignal` (Rust), and no
command is sent.

```php
use DurableWorkflow\Attribute\Workflow;
use DurableWorkflow\Worker\WorkflowContext;

final class ApproverWorkflow
{
    #[Workflow('orders.approver')]
    public function run(WorkflowContext $context, string $orderId): array
    {
        $result = $context->signalExternalWorkflow($orderId, 'approve', ['Ada']);

        if (! $result->delivered()) {
            // target_not_found, target_closed or rejected, with a reason
            return ['skipped' => $result->outcome->value, 'reason' => $result->reason];
        }

        return ['delivered_to' => $result->targetRunId];
    }
}
```

A started child's handle has the same command: `$child->signal('approve', ['Ada'])`.

```python
from durable_workflow import workflow


@workflow.defn(name="orders.approver")
class Approver:
    def run(self, ctx: workflow.WorkflowContext, order_id: str):
        result = yield ctx.signal_external_workflow(order_id, "approve", ["Ada"])
        if not result.delivered:
            # target_not_found, target_closed or rejected, with a reason
            return {"skipped": result.outcome, "reason": result.reason}
        return {"delivered_to": result.target_run_id}
```

```rust
use durable_workflow::{json, ExternalSignalOutcome};

worker.register_workflow("orders.approver", |ctx, input| async move {
    let order_id = input[0].as_str().unwrap_or_default().to_owned();
    let result = ctx
        .signal_external_workflow(order_id, "approve", json!(["Ada"]))
        .await?;
    match result.outcome {
        ExternalSignalOutcome::Delivered => Ok(json!({"delivered_to": result.target_run_id})),
        // target_not_found, target_closed or rejected, with a reason
        _ => Ok(json!({"skipped": result.outcome.as_str(), "reason": result.reason})),
    }
});
```

Add `.run_id(run_id)` in Rust, `run_id=` in Python or `runId:` in PHP to signal
only one run of the target.

Run the command on its own. It cannot be a member of a parallel group or a
durable selection. A worker that holds a workflow task can signal any workflow
in that task's namespace without the operator role an HTTP signal needs. Put a
workflow that other workflows' code must not signal in a separate namespace.

## Timed condition ordering {#timed-condition-order}

With Native Server 3.27.0 or later, a compatible worker and ordered wait authoring enabled, a timed condition can use signals and successfully applied updates received before its original `TimerFired` event. This holds even if the worker evaluates the condition after the timer fires. Receipt order decides which eligible state satisfies the predicate first. A named signal uses the same timer boundary.

Use [PHP SDK 3.29.0](https://github.com/durable-workflow/sdk-php/releases/tag/3.29.0), [Python SDK 2.23.1](https://github.com/durable-workflow/sdk-python/releases/tag/2.23.1) or [Rust SDK 4.24.0](https://github.com/durable-workflow/sdk-rust/releases/tag/4.24.0) or later for ordered signal effects. Ordered update effects require support from the worker handling the update. The Python and Rust releases above support them for successfully applied updates.

In a supported `select()`, the condition wins against a child workflow if that first qualifying state precedes the child’s completion or failure in history. Replay uses the recorded outcome once the wait resolves.

Ordered wait authoring starts disabled. For self-hosted Server, follow the [rollout and rollback runbook](https://github.com/durable-workflow/server/blob/3.27.0/rust/README.md#rolling-out-durable-input-ordering-for-timed-waits) before enabling it.

## When an activity is still needed {#when-an-activity-is-still-needed}

Use an activity that calls the client when the workflow command does not fit:

- **Signal-with-start from workflow code.** There is no workflow command for
  signal-with-start. Call the client's signal-with-start from an activity, and
  derive its request ID from stable workflow data, such as the workflow ID and
  a business key, so that every activity retry sends the same key and the
  Server admits the signal once.
- **Another namespace.** Signals stay within the namespace. Use a
  [cross-namespace service call](./service-operations.md) instead.
- **An older Server.** Before native Server 3.15.0, workflow code can only
  signal through an activity. Give that signal a stable request ID as well, so
  an activity retry does not record a second signal.

An activity runs at least once, so the stable request ID is what keeps a retry
from sending a second signal. The signal command records its outcome in history
with no activity task.
