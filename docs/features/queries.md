---
sidebar_position: 2
---

import QuerySimulator from '@site/src/components/QuerySimulator';

# Queries

Queries allow you to retrieve information about the current state of a workflow without affecting its execution. This is useful for monitoring and debugging purposes.

## Replay-Safe Query Methods

Queries replay committed history for the current selected run and then invoke the annotated method on the hydrated workflow object. They do not apply accepted-but-not-yet-applied signal or update commands implicitly.

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;
use function Workflow\V2\awaitSignal;

final class ApprovalWorkflow extends Workflow
{
    private string $stage = 'booting';

    public function handle(): void
    {
        $this->stage = 'waiting-for-approval';

        awaitSignal('approved-by');

        $this->stage = 'approved';
    }

    #[QueryMethod('current-stage')]
    public function currentStage(): string
    {
        return $this->stage;
    }

    #[QueryMethod('starts-with')]
    public function startsWith(string $prefix): bool
    {
        return str_starts_with($this->stage, $prefix);
    }
}
```

Address the current run through the public instance id:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->currentStage(); // "waiting-for-approval"
$workflow->query('starts-with', 'waiting'); // true
$workflow->queryWithArguments('starts-with', ['prefix' => 'waiting']); // true
```

When you want to pin one historical or selected run explicitly, query through `loadRun($runId)` instead:

```php
$selectedRun = WorkflowStub::loadRun($runId);

$selectedRun->currentStage();
```

Query behavior:

- query arguments are forwarded to the annotated method instead of being silently dropped
- query methods can declare a durable public target name through `#[QueryMethod('public-name')]`, and string-targeted query APIs resolve either that durable name or the PHP method name
- the runtime snapshots `declared_queries` plus ordered `declared_query_contracts` onto typed `WorkflowStarted` history, so later Waterline detail and operator clients can keep using the selected run's public query surface without reflecting live code every time
- selected-run detail exposes normalized `declared_query_targets` plus `can_query` / `query_blocked_reason`, so Waterline can keep every declared query target visible while still distinguishing runs whose query surface is durably declared but not currently replayable
- queries observe committed history only
- `getVersion()` reuses committed `VersionMarkerRecorded` history, so query replay follows the same versioned branch the selected run already committed
- completed activity and timer outcomes are replayed from typed history first. For activities, once a step has typed open activity history, query replay waits for `ActivityCompleted` or `ActivityFailed` and does not accept a drifted terminal `activity_executions` row; `ActivityCancelled` is the typed stop observation for cancelled or terminated in-flight activity work, and mutable activity rows are fallback only for older preview runs that have no typed activity history for that step.
- child completions and child failures are replayed from the parent run's typed `ChildRun*` history. Terminal child history or mutable child rows may enrich lineage and diagnostics after the parent-side event exists, but they do not make a missing parent child step replayable; query replay blocks with `history_shape_mismatch` when a `child()` step has no parent typed child history.
- handled activity failures now restore their typed durable exception payload when that payload exists, so query replay can keep the original exception class and custom properties instead of degrading everything to a generic runtime error
- accepted-but-not-applied signals remain visible in command history, but query replay does not treat them as applied state
- accepted-but-not-yet-applied updates submitted with `submitUpdate()` or `submitUpdateWithArguments()` remain visible in command and update history, but query replay does not treat them as applied state until the workflow worker records `UpdateApplied`
- completed update commands are replayed from committed `UpdateApplied` history before the query method runs
- failed update commands stay visible in command history and failure views, but they do not mutate replayed workflow state
- instance-targeted `load($instanceId)` queries the newest durable run for that instance after refresh, even if the mutable current-run pointer drifted or is temporarily null
- run-targeted `loadRun($runId)` queries the selected run, even after continue-as-new created a newer current run

To define a query method on a workflow, use the `QueryMethod` annotation. The optional string argument lets you freeze a public durable query name that survives PHP method renames:

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[QueryMethod('is-ready')]
    public function getReady(): bool
    {
        return $this->ready;
    }
}
```

To query a workflow, call the method on the workflow instance. The query method will return the data from the workflow.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->getReady();
$sameReady = $workflow->query('is-ready');
```

Use `queryWithArguments()` when your caller already has one positional list or a named parameter map:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->queryWithArguments('starts-with', [
    'prefix' => 'wait',
]);
```

Waterline uses the selected-run query contract surface. The dashboard exposes `declared_query_targets[*]` alongside signals and updates, but only shows query execution when `can_query = true`. The selected-run or current-run query operator posts JSON `arguments` to `/waterline/api/instances/{instanceId}/queries/{query}` or `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}`. Query execution still requires a loadable workflow definition because the selected run must be replayed before the query method can run; when durable query targets exist but that definition is unavailable, selected-run detail reports `can_query = false` with `query_blocked_reason = workflow_definition_unavailable`, and query POSTs return HTTP `409 Conflict` with `blocked_reason = workflow_definition_unavailable`. If the run only has an incomplete snapshot and the current build can no longer finish backfilling it, detail reports `declared_contract_source = unavailable`; surviving query targets remain visible as compatibility-only metadata, but named query arguments still reject with `422` until a compatible build persists the missing contract.

The public webhook bridge exposes that same replay-safe query surface outside Waterline:

```text
POST /webhooks/instances/{instanceId}/queries/{query}
POST /webhooks/instances/{instanceId}/runs/{runId}/queries/{query}
```

Those webhook routes accept the same JSON `arguments` field as Waterline, return a typed JSON `result` on success, and use the same error shape for invalid arguments (`422` with `validation_errors`) and replay blocks (`409` with `blocked_reason`). When the current workflow definition is still loadable, callers may address the query by either its durable `#[QueryMethod('public-name')]` target or the underlying PHP method name; successful HTTP responses normalize `query_name` back to the durable public target so external callers do not harden on method-renaming details.

<QuerySimulator />

**Important:** Querying a workflow does not advance its execution, unlike signals.

# Updates

Updates allow you to retrieve information about the current state of a workflow and mutate the workflow state at the same time. They are essentially both a query and a signal combined into one.

## Explicit Update Commands

Each accepted update:

- records a durable `update` command row
- records one first-class `workflow_updates` row linked to that command, returns its `update_id` through the typed `UpdateResult`, and lets callers re-read that same lifecycle later through `inspectUpdate($updateId)`
- appends typed `UpdateAccepted` history as soon as the command is accepted
- appends typed `UpdateApplied` and `UpdateCompleted` history entries when the update body actually runs
- applies the update body under the run lock against replayed workflow state on the workflow worker, with `attemptUpdate*` waiting on that durable worker-applied lifecycle and `submitUpdate*` returning as soon as the command is durably accepted
- returns either the raw update result or a typed `UpdateResult` wrapper, depending on which API you call
- uses the declared durable update name in command history and webhook routing; if you declare `#[UpdateMethod('mark-approved')]`, Waterline and webhook payloads expose `mark-approved` instead of the PHP method name
- snaps the ordered parameter contract into durable run metadata so webhook intake and Waterline can validate or explain the public callable shape without reflecting live code every time
- is rejected against historical selected runs and already-closed runs instead of silently mutating the current run
- rejects undeclared update method names as `rejected_unknown_update` with `rejection_reason = unknown_update`, using the run's durably snapped command contract when the typed `WorkflowStarted` payload already carries it
- rejects array-shaped but contract-invalid webhook or string-targeted update arguments as `rejected_invalid_arguments` with machine-readable `validation_errors` before the update body runs
- rejects a durably declared target as `rejected_workflow_definition_unavailable` with `rejection_reason = workflow_definition_unavailable` when the selected run's workflow definition cannot be replayed
- does not let updates leapfrog earlier accepted signals: when the selected run already has one pending, the runtime rejects the later update as `rejected_pending_signal` until the queued workflow task applies that signal and advances durable `command_sequence` order

When the selected target run exists but the update is rejected before application, the runtime still records the rejected command row, writes a rejected `workflow_updates` row for that lifecycle, and appends one typed `UpdateRejected` history entry for that run. That keeps command history, Waterline update detail, and webhook-visible command identity aligned without letting rejected updates mutate replayed workflow state.

Like queries, updates replay committed history first. Unlike queries, updates are allowed to mutate replay-safe workflow state and return a value. If an earlier accepted signal is still pending on the selected run, the update rejects instead of inline-draining that signal on the caller path; retry the update after the workflow worker applies the signal.

To define an update method on a workflow, use the `UpdateMethod` annotation. The optional string argument lets you freeze a public durable name that survives PHP method renames:

```php
use Workflow\UpdateMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[UpdateMethod('mark-ready')]
    public function updateReady(bool $ready): bool
    {
        $this->ready = $ready;

        return $this->ready;
    }
}
```

Call the update method directly when you want the raw return value:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->updateReady(true);
```

That direct PHP call still uses the method name. The durable command target remains `mark-ready`.

Use `attemptUpdate()` when you want the durable command outcome as well. Pass the durable update name there:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptUpdate('mark-ready', true);

$result->commandId();       // Durable update command id
$result->updateId();        // Durable update lifecycle id
$result->updateStatus();    // "accepted", "completed", "failed", or "rejected"
$result->updateName();      // Durable update name
$result->commandSequence(); // Durable command order within the selected run
$result->workflowSequence(); // Workflow step that applied the update, if any
$result->instanceId();      // Public workflow instance id
$result->runId();           // Selected run id
$result->workflowType();    // Durable workflow type key
$result->accepted();        // true or false
$result->completed();       // true when the update body ran successfully
$result->failed();          // true when the update body threw
$result->acceptedAt();      // Carbon timestamp when the lifecycle was accepted
$result->appliedAt();       // Carbon timestamp once the worker applied the update
$result->rejectedAt();      // Carbon timestamp when the lifecycle rejected
$result->closedAt();        // Carbon timestamp once the lifecycle closed
$result->waitFor();         // "completed" or "accepted"
$result->waitTimedOut();    // true when the completion wait budget expired
$result->waitTimeoutSeconds(); // configured or per-call completion wait budget
$result->outcome();         // "update_completed", "update_failed", or a rejected outcome
$result->result();          // Raw update return value when completed
$result->failureMessage();  // Failure message when the update body threw
```

`attemptUpdate()` records the accepted update first, then waits for the workflow worker to apply it and close the durable `workflow_updates` row before it returns the completed or failed `UpdateResult`. That wait is time-bounded: it uses `workflows.v2.update_wait.completion_timeout_seconds` by default, and if the worker still has not closed the update when that budget expires, `attemptUpdate()` returns the still-accepted lifecycle with `waitFor() === 'completed'`, `waitTimedOut() === true`, and `updateStatus() === 'accepted'`.

Use `withUpdateWaitTimeout()` when one call needs a different completion budget:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123')
    ->withUpdateWaitTimeout(5);

$result = $workflow->attemptUpdate('mark-ready', true);
```

Use `attemptUpdateWithArguments()` when your caller already has one explicit positional list or a named parameter map:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptUpdateWithArguments('mark-ready', [
    'ready' => true,
]);
```

Named maps are validated against the durably snapped update contract and then normalized into declaration order before the command is recorded as accepted.

Use `submitUpdate()` or `submitUpdateWithArguments()` when the caller only needs durable acceptance and wants the workflow worker to apply the update later:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$accepted = $workflow->submitUpdate('mark-ready', true);

$accepted->accepted();     // true
$accepted->completed();    // false
$accepted->outcome();      // null until the worker applies the update
$accepted->updateStatus(); // "accepted"
$accepted->result();       // null until the worker records UpdateCompleted
```

That accepted-only path records the command row, the `workflow_updates` row, and `UpdateAccepted` history, then schedules or re-dispatches a workflow task. Until that task runs, `inspectUpdate()` and selected-run detail show the update with `status = accepted`, `outcome = null`, `workflow_sequence = null`, `accepted_at` set, and `applied_at`, `rejected_at`, plus `closed_at` still null, and queries still observe the pre-update state. Selected-run summaries also surface that pending lifecycle as `wait_kind = update`, with `open_wait_id = update:{update_id}` and `resume_source_kind = workflow_update`, so Waterline shows the accepted update as the current wait instead of falling back to the older underlying signal, child, or timer wait while the worker still owes the update application. The workflow task created for that application carries `workflow_wait_kind = update`, `workflow_update_id`, `workflow_command_id`, the open wait id, and the `workflow_update` resume source; repair recreates the same payload if the task row disappears. A workflow task only counts as the accepted update's backing transport when that task carries matching update or command provenance, or when it is an older unscoped workflow task from an earlier period; an unrelated signal, child, condition, or generic task does not make the update wait healthy. If that accepted lifecycle loses its backing workflow task, the selected run flips to `liveness_state = repair_needed` while keeping the update wait itself open, so repair can recreate transport without losing the durable update identity. Once the worker applies the update, the lifecycle moves to `completed` or `failed`, `workflow_sequence` is filled from the workflow step that applied it, and `UpdateApplied` plus `UpdateCompleted` history become the replay authority. Failed updates stay non-replayable for workflow state, but selected-run detail and Waterline rebuild the failed status, failure id, message, and exception-resolution metadata from typed `UpdateCompleted` history keyed by `update_id` before trusting mutable update, command, or failure rows. The completion-waiting `attemptUpdate*` APIs use that same durable worker path; they no longer execute the update body inline inside `WorkflowStub`, and they fall back to this same accepted lifecycle when their configured completion wait budget expires.

Use `inspectUpdate()` when you already have an `update_id` and want to read the stored lifecycle later without waiting again:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$accepted = $workflow->submitUpdate('mark-ready', true);

$latest = $workflow->inspectUpdate($accepted->updateId());

$latest->updateStatus(); // "accepted"
$latest->waitFor(); // "status"
$latest->acceptedAt(); // CarbonInterface
$latest->closedAt(); // null until the lifecycle closes
```

`inspectUpdate()` does not wait for workflow execution. It reloads the stored durable lifecycle and returns the current `UpdateResult` for the stub's scope. `load($instanceId)` can inspect any update lifecycle for that workflow instance, while `loadSelection($instanceId, $runId)` and `loadRun($runId)` restrict lookup to the selected run.

Update rules:

- instance-targeted `load($instanceId)` updates the current run for that instance
- that instance-targeted current-run selection resolves the newest durable run in the instance chain instead of trusting only the mutable current-run pointer
- direct PHP method calls such as `$workflow->updateReady(true)` are convenience sugar over that same durable command, but string-targeted APIs such as `attemptUpdate()` use the declared durable update name
- run-targeted `loadRun($runId)` rejects with `rejected_not_current` once that selected run is historical
- closed runs reject with `rejected_not_active`
- failed update bodies do not close the workflow run; they are recorded as update-scoped failures instead
- submitted updates that fail on the workflow worker are recorded as update-scoped failures, close the update lifecycle as `failed`, and leave the workflow run open for the next replay task
- queries replay completed updates, but rejected or failed updates remain non-replayable command and history facts only

Selected-run detail also exposes `updates_scope = selected_run` plus one `updates[*]` row per durable update lifecycle, including `id`, `command_id`, `command_sequence`, `workflow_sequence`, `name`, `status`, `outcome`, `rejection_reason`, `failure_id`, `failure_message`, `exception_type`, `exception_class`, `exception_resolved_class`, `exception_resolution_source`, `exception_resolution_error`, `exception_replay_blocked`, `accepted_at`, `applied_at`, `rejected_at`, `closed_at`, and an optional typed `result`. Waterline uses that read model for its dedicated Updates table. The row is keyed by `updates[*].id` / `update_id`, so `updates[*].command_id` can be null when command provenance is unavailable; the older command list still exposes `commands[*].update_id`, `commands[*].update_status`, `commands[*].failure_id`, and `commands[*].failure_message` as the compatibility bridge back to the originating command when that command row exists.
