---
sidebar_position: 16
---

# Cancel and Terminate

This guide covers the embedded Laravel `Workflow\V2\WorkflowStub` API. For
service-mode clients and workers, use the
[PHP SDK guide](https://php.durable-workflow.com/),
[Python cancellation reference](https://python.durable-workflow.com/reference/errors/#durable_workflow.errors.ActivityCancelled), or
[Rust lifecycle API](https://rust.durable-workflow.com/durable_workflow/struct.Client.html#method.cancel_workflow).

Cancel and terminate are first-class durable commands that close a running workflow. Both are recorded in command history, appear in typed history events, and surface in Waterline.

In the current embedded API, both commands close the run immediately. **Cancel**
records a `cancelled` outcome; **terminate** records a `terminated` outcome.
Neither command schedules cleanup inside the closed workflow. If your
application needs durable compensation first, signal the workflow to run that
cleanup before closing it.

## Cancel

Cancel immediately transitions the run to `cancelled` and records durable history.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->cancel();

$result->accepted();   // true
$result->outcome();    // "cancelled"
$result->commandId();  // Durable command id
$result->reason();     // null (no reason provided)
```

### Cancel with reason

You can provide a structured reason to distinguish user-driven, policy-driven, and operator-driven cancellation in audit trails, command history, and Waterline.

```php
$result = $workflow->cancel('Customer requested cancellation');

$result->reason(); // "Customer requested cancellation"
```

The reason is persisted on the durable command record and in both the `CancelRequested` and `WorkflowCancelled` typed history events, so it survives replay, export, and offline analysis.

### What cancel does

When a cancel command is accepted, the engine closes any open activity executions and pending timers, transitions the run to `cancelled`, and resumes a parent workflow waiting on the cancelled child so it can observe the outcome.

### Cancel is rejected when

- The instance has not started yet: `rejection_reason = instance_not_started`
- The current run is already closed: `rejection_reason = run_not_active`
- A run-targeted cancel addresses a historical (non-current) run: `rejection_reason = selected_run_not_current`

## Terminate

Terminate immediately closes a running workflow without scheduling further workflow code. Use terminate when graceful cleanup is not needed or when a workflow is stuck.

```php
$result = $workflow->terminate();

$result->accepted();   // true
$result->outcome();    // "terminated"
```

### Terminate with reason

```php
$result = $workflow->terminate('Operator emergency shutdown');

$result->reason(); // "Operator emergency shutdown"
```

### What terminate does

Terminate follows the same transactional steps as cancel, but:

- Records `TerminateRequested` and `WorkflowTerminated` history events instead.
- Creates the `WorkflowFailure` row with `failure_category = terminated` and `propagation_kind = terminated`.
- Sets `closed_reason = terminated` on the run.
- Does not schedule any further workflow-code execution.

### Terminate is rejected when

Same rejection conditions as cancel.

## Run-targeted commands

Both cancel and terminate can target a specific run instead of the instance's current run.

```php
$selectedRun = WorkflowStub::loadRun($runId);
$result = $selectedRun->attemptCancel('Draining old run');

$result->targetScope(); // "run"
```

Run-targeted commands reject with `selected_run_not_current` when the addressed run is no longer the instance's current run. The response includes `requested_run_id` (the run the caller addressed) and `resolved_run_id` (the current run that should be used next).

## Non-throwing API

Use `attemptCancel()` and `attemptTerminate()` when you want to handle rejection without exceptions:

```php
$result = $workflow->attemptCancel('Duplicate order');

if ($result->rejected()) {
    $result->rejectionReason(); // e.g. "run_not_active"
}
```

`cancel()` and `terminate()` throw `LogicException` on rejection.

## Webhooks

Cancel and terminate are available through webhook routes:

```text
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

Pass the reason in the request body:

```json
{
  "reason": "Operator: duplicate order"
}
```

The response includes the command outcome, the public instance id, and the reason:

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J10000000000000000000021",
  "reason": "Operator: duplicate order",
  "command_id": "01J40000000000000000000021",
  "command_status": "accepted"
}
```

## Cancellation is not an error you catch by accident

Cancellation is an explicit lifecycle outcome, not an unexpected application
error. The embedded package's
`Workflow\V2\Exceptions\WorkflowCancelledException` extends `\Error`, not
`\Exception`. A `catch (\Exception $e)` block will not catch it; a
`catch (\Throwable $t)` block will.

When reading a cancelled workflow's result, catch the exception by name if you
need to distinguish cancellation from other failures. Catching a result-side
exception does not reopen the cancelled run or schedule cleanup inside it.

## Waterline

Waterline exposes cancel and terminate as operator actions on the selected-run detail view. The detail payload includes `can_cancel` and `can_terminate` flags driven from durable state.

The command history view shows each cancel or terminate command with its reason, caller identity, and outcome. The `commands[*].reason` field carries the operator- or caller-provided reason when one was supplied.

## Status mapping

Both `cancelled` and `terminated` runs land in the `failed` status bucket for list routing. The raw `status` and `closed_reason` fields distinguish them:

| Status | Status bucket | Closed reason |
| --- | --- | --- |
| `cancelled` | `failed` | `cancelled` |
| `terminated` | `failed` | `terminated` |

## Typed history

A cancelled run produces this history sequence:

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
CancelRequested       <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowCancelled     <- failure_id, failure_category, reason when supplied
```

A terminated run produces:

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
TerminateRequested    <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowTerminated    <- failure_id, failure_category, reason when supplied
```

## Cancel vs. terminate

| | Cancel | Terminate |
| --- | --- | --- |
| Further workflow code is scheduled | No | No |
| Open activities cancelled | Yes | Yes |
| Open timers cancelled | Yes | Yes |
| Reason metadata | Yes | Yes |
| Durable command history | Yes | Yes |
| Parent receives child outcome | Yes | Yes |
| Failure row recorded | Yes (`cancelled`) | Yes (`terminated`) |
| Status bucket | `failed` | `failed` |
| Closed reason | `cancelled` | `terminated` |
