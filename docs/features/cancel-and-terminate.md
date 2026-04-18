---
sidebar_position: 16
---

# Cancel and Terminate

Cancel and terminate are first-class durable commands that close a running workflow. Both are recorded in command history, appear in typed history events, and surface in Waterline.

The key difference: **cancel** is a request that the workflow observe and gracefully close, while **terminate** is a direct terminal closure that does not schedule further workflow code.

## Cancel

Cancel requests that a running workflow close gracefully. Cancel immediately transitions the run to `cancelled` and records durable history.

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

When a cancel command is accepted:

1. A durable `cancel` command is recorded with accepted outcome.
2. `CancelRequested` history is appended to the run.
3. All open tasks (workflow, activity, timer) are marked cancelled.
4. All open activity executions are closed as cancelled, with `ActivityCancelled` history recorded for each.
5. All pending timers are cancelled, with `TimerCancelled` history recorded for each.
6. The run status transitions to `cancelled` with `closed_reason = cancelled`.
7. A `WorkflowFailure` row is created with `failure_category = cancelled` and `propagation_kind = cancelled`.
8. `WorkflowCancelled` history is appended with the `failure_id` and `failure_category`.
9. If this run is a child workflow, the parent receives a resume task so it can observe the child cancellation.
10. The run summary projection is updated.

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
| Workflow observes the command | Yes (future cancellation scopes) | No |
| Open activities cancelled | Yes | Yes |
| Open timers cancelled | Yes | Yes |
| Reason metadata | Yes | Yes |
| Durable command history | Yes | Yes |
| Parent receives child outcome | Yes | Yes |
| Failure row recorded | Yes (`cancelled`) | Yes (`terminated`) |
| Status bucket | `failed` | `failed` |
| Closed reason | `cancelled` | `terminated` |
