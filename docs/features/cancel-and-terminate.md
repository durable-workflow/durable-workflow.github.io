---
sidebar_position: 16
---

# Cancel and Terminate

Cancel and terminate are first-class durable commands that close a running workflow. Both are recorded in command history, appear in typed history events, and surface in Waterline.

The key difference: **cancel** is a request that the workflow observe and gracefully close, while **terminate** is a direct terminal closure that does not schedule further workflow code.

This page is part of the explicit 2.0 prerelease docs line. Stable 1.x remains
the default public docs line.

## Published Rust lifecycle boundary

The public
[workflow-lifecycle scenario manifest](https://durable-workflow.github.io/platform-conformance/workflow-lifecycle-scenarios.json)
defines the released lifecycle evidence contract. Current validation uses
server `%%artifact.serverVersion%%` with the crates.io `durable-workflow`
crate `%%artifact.rustSdkVersion%%` from the synchronized product train.

At that boundary, cancellation and termination must produce typed terminal
outcomes with workflow and run identity. Run-scoped commands must preserve
selected-run safety and reject a historical run with a typed stable reason.
Activity cancellation must be visible through heartbeat state; a late
completion must be refused after the run closes; and a worker restart during
pending cancellation must not reclaim the cancelled activity.

The exact-crate shard records Cargo registry provenance for both
`durable-workflow` and the official `apache-avro` crate used by the SDK's Avro
payload envelope. It does not substitute a custom codec or local product
source for the published payload implementation. See the
[Rust SDK lifecycle API](/docs/2.0/polyglot/rust#cancel-terminate-and-handle-terminal-outcomes)
for the selected-run commands and typed outcome variants.

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

Cancellation is a control-plane outcome, not a bug. An activity or workflow that is cancelled did not fail — the caller (or an operator, or a parent workflow) asked for it to stop. To keep that signal from being swallowed by a generic catch-all, the SDKs put the cancellation exception classes **outside** the normal error hierarchy:

- **Python SDK** — `WorkflowCancelled` and `ActivityCancelled` inherit from `BaseException`, not `Exception`. A bare `except Exception:` block in an activity or result handler will **not** catch them. Catch them by name when you want to distinguish cancellation from failure:

  ```python
  from durable_workflow import ActivityCancelled

  @activity.defn(name="long_task")
  async def long_task(items: list) -> dict:
      ctx = activity.context()
      try:
          for i, item in enumerate(items):
              await process(item)
              await ctx.heartbeat({"progress": i + 1})
          return {"done": True}
      except ActivityCancelled:
          await cleanup_partial_state()
          raise  # re-raise so the worker reports cancelled, not completed
  ```

- **PHP (workflow package)** — `Workflow\V2\Exceptions\WorkflowCancelledException` extends `\Error`, not `\Exception`. A `catch (\Exception $e)` block will not catch it; use `catch (\Throwable $t)` or catch the class by name.

This intentionally mirrors how `asyncio.CancelledError`, `KeyboardInterrupt`, and `\Error` behave in their respective standard libraries: cancellation propagates unless you handle it on purpose. If you need to run cleanup on cancellation, catch it explicitly and re-raise — don't rely on a catch-all.

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
