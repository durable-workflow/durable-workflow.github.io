---
sidebar_position: 9
---

# Child Workflows

The current `Workflow\V2` slice supports durable child workflows through straight-line `child()` calls and through `all([...])` fan-in barriers that can be child-only, mixed with activities, or nested inside larger `all([...])` groups. Together, these give a parent workflow a durable way to schedule one or more sub-workflows and wait for their outcomes without keeping the parent process alive.

A child run is still a normal workflow run with its own workflow instance id and run id. What makes it a child is the durable linkage back to the parent run plus one stable parent-issued `child_call_id` for that invocation.

```php
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(string $name): array
    {
        $child = child(ChildWorkflow::class, $name);

        return [
            'parent_workflow_id' => $this->workflowId(),
            'parent_run_id' => $this->runId(),
            'child' => $child,
        ];
    }
}
```

## Current Behavior

- Import the helper with `use function Workflow\V2\child;` and call `child(ChildWorkflow::class, ...)`. The call suspends the parent, creates a durable child run, and returns the child's result when the child closes.
- A failed child throws an exception in the parent; a successful child returns its output. Cancellation and termination surface as distinct exception types.
- `$this->child()` returns the most recent child handle; `$this->children()` returns every child handle in workflow-step order. Handles expose `id()`, `runId()`, `callId()`, and signal helpers such as `signal()` and `signalWithArguments()`.
- If a child uses `continueAsNew()`, the parent transparently follows the newest run — `runId()` moves forward while `id()` stays stable.
- `all()` can combine `fn () => child(...)` and `fn () => activity(...)` closures into one barrier; the parent wakes on the first child failure but waits for every successful branch to close before resuming.

## Parallel Child Barrier

Import the helpers with `use function Workflow\V2\all;` and `use function Workflow\V2\child;` when you want one parent step to wait on several child workflows together.

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $children = all([
            fn () => child(FirstChildWorkflow::class),
            fn () => child(SecondChildWorkflow::class),
        ]);

        return $children;
    }
}
```

That child-only form is still useful when every parallel member is a child workflow:

- it waits for the whole child group as one parent step
- it preserves the original array order in the returned results
- it throws the selected non-successful child closure back into the parent workflow body using the same earliest-close-time, lowest-index tie break

If you need to combine child workflows with activities in the same fan-in step, use one mixed `all([...])` barrier instead. The child waits and activity waits share the same `parallel_group_id`, and Waterline labels that shared barrier as `parallel_group_kind = mixed`. If one mixed or child-only subgroup sits inside a larger `all([...])`, the innermost group still drives `parallel_group_id` while `parallel_group_path` preserves the full outer-to-inner path.

## Identity Contract

- `child()->id()` and Waterline `target_name` refer to the child workflow instance id, which stays stable across that child instance's run chain.
- `child_call_id` refers to the parent-issued invocation itself, which stays stable even if the child later uses `continueAsNew()`.
- `resume_source_id`, `child_workflow_run_id`, and selected-run routes refer to one concrete child run in that invocation chain.

## Child Handles

Once the parent has durably reached a child step, the workflow can inspect that invocation through a `ChildWorkflowHandle`.

```php
use Workflow\UpdateMethod;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle()
    {
        return child(ApprovalWorkflow::class);
    }

    #[UpdateMethod('approve-child')]
    public function approveChild(string $approvedBy): void
    {
        $this->child()?->signal('approved-by', $approvedBy);
    }
}
```

- `$this->child()` returns the latest visible child handle or `null`.
- `$this->children()` returns every visible handle in workflow-step order.
- During `all([fn () => child(...)])` barriers, those handles appear in the same step order as the child calls inside the barrier, and `$this->child()` returns the last visible one.
- A handle's `runId()` follows the newest parent-recorded `ChildRunStarted` in that child invocation chain, so a parent waiting on a child that used `continueAsNew()` still sees the latest child run id without losing the original `callId()`.

## Handle Availability

Child handles are history-backed, not speculative:

- Before the parent has durably reached a child step, `$this->child()` returns `null` and `$this->children()` returns an empty list.
- Once the parent has recorded child scheduling or child-start history for that step, the handle becomes visible to queries, updates, and later workflow replay.
- Query replay never dispatches child signals from recorded updates; it only restores the in-memory state implied by committed history.

## Waterline Visibility

When the parent is blocked on a child, Waterline shows it as a child wait rather than as a separate task type. That means:

- the parent run summary reports `wait_kind = child` and `liveness_state = waiting_for_child`
- `waits` includes `kind = child`, the stable `child_call_id`, the child workflow instance id in `target_name`, and the child run id in `resume_source_id`
- when several child waits are open at once, detail also exposes `open_wait_count`
- child waits created by one child-only or mixed `all([...])` barrier share `parallel_group_id` and expose `parallel_group_kind`, `parallel_group_base_sequence`, `parallel_group_size`, and `parallel_group_index`
- nested child waits also expose `parallel_group_path`, ordered from the outermost enclosing barrier to the innermost one
- `timeline` includes typed child events such as `ChildWorkflowScheduled`, `ChildRunStarted`, `ChildRunCompleted`, and `ChildRunFailed`, with the same stable `child_call_id`
- open child waits and lineage now prefer the parent's typed `ChildWorkflowScheduled` / `ChildRunStarted` history, keep one logical child entry per stable `child_call_id`, and follow the newest parent-recorded child run even if copied `workflow_links` rows disappear or the child instance's mutable `current_run_id` drifts after history has already been committed
- once the parent has recorded a typed child-resolution event, selected-run detail keeps that child wait resolved from parent history even if the mutable child run row later drifts; child terminal history or legacy link data can enrich lineage and diagnostics, but cannot replace missing parent typed child step history for replay
- once that typed child-resolution event exists, selected-run lineage and history export also keep the child workflow type, class, run number, status bucket, and closed reason from parent history instead of re-reading the mutable child run row for those resolved-child fields
- if a terminal child row or link exists but the parent has no typed `ChildWorkflowScheduled`, `ChildRunStarted`, `ChildRunCompleted`, `ChildRunFailed`, `ChildRunCancelled`, or `ChildRunTerminated` history for that child step, worker and query replay block with `history_shape_mismatch` and recorded events `no typed history`; Waterline marks the selected child wait `status = unsupported`, exposes `history_authority = unsupported_terminal_without_history` and `history_unsupported_reason = terminal_child_link_without_typed_parent_history`, and surfaces child identity from the blocked task or lineage fallback when available
- if that parent resume workflow task row is lost after the child-resolution event, selected-run detail stays `repair_needed`, exposes a synthetic missing workflow task with `workflow_wait_kind = child`, `child_call_id`, and `child_workflow_run_id`, and manual `repair()`, `workflow:v2:repair-pass`, or worker-loop repair recreates the same child-resolution task from typed parent history
- lineage arrays expose the durable parent/child relationship alongside continue-as-new links, and child-workflow entries now carry the same `child_call_id`

## Parent-Close Policy

When a parent workflow closes — whether by completing, failing, timing out, being cancelled, or being terminated — each open child workflow is affected according to its **parent-close policy**. The policy is set per child call and controls what happens to that child when the parent run exits.

| Policy | Value | Behavior |
|---|---|---|
| Abandon | `abandon` | The child continues running independently. This is the default. |
| Request Cancel | `request_cancel` | A cancel command is sent to the child when the parent closes. |
| Terminate | `terminate` | A terminate command is sent to the child when the parent closes. |

### Default policy

A `child()` call that does not pass a `ChildWorkflowOptions` always runs under `ParentClosePolicy::Abandon`. The source-compatible helpers — `Workflow\V2\child()`, `Workflow\V2\Workflow::child()`, and `Workflow\V2\Workflow::executeChildWorkflow()` — all construct the default options when the first argument is not a `ChildWorkflowOptions`, which sets `parentClosePolicy` to `ParentClosePolicy::Abandon`. The same default applies to every `child()` closure inside an `all([...])` barrier that omits an options argument. Override the default by passing an explicit `ChildWorkflowOptions` as shown below.

### Setting the policy

Pass a `ChildWorkflowOptions` as the first argument to `child()`:

```php
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $options = new ChildWorkflowOptions(
            parentClosePolicy: ParentClosePolicy::RequestCancel,
        );

        return child(ChildWorkflow::class, $options, 'argument1');
    }
}
```

The same pattern works with closures inside `all()` for parallel barriers:

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;

$cancelOptions = new ChildWorkflowOptions(
    parentClosePolicy: ParentClosePolicy::RequestCancel,
);

$results = all([
    fn () => child(FirstChild::class, $cancelOptions),
    fn () => child(SecondChild::class, $cancelOptions, 'arg'),
]);
```

### How it works

- The policy is recorded on the `workflow_links` row (`parent_close_policy`) and in the `ChildWorkflowScheduled` history event payload.
- When the parent run closes for any reason, the engine queries open child links with a non-abandon policy and sends the appropriate command (cancel or terminate) to each open child.
- If the child has already closed by the time the policy is enforced, no action is taken — the command is silently skipped.
- Policy enforcement is best-effort: if a child command is rejected (e.g. the child is already terminal), the parent's closure is not affected. When enforcement succeeds, a `ParentClosePolicyApplied` history event is recorded on the parent run. When enforcement fails, a `ParentClosePolicyFailed` history event is recorded instead, so operators can distinguish successful enforcement from silent failures.
- Continue-as-new does **not** trigger parent-close policy, because the workflow instance remains active under a new run.

### Parent disposition matrix

Parent-close policy fires on every terminal parent disposition, and stays inert for runs that are still live or handed off to a continued run. The engine's behavior is the same for every disposition that marks the parent terminal — the policy is applied to any non-abandon, still-open child link.

| Parent disposition | Policy enforced? | Notes |
|---|---|---|
| Completed | Yes | Fires after `WorkflowCompleted` is recorded. A straight-line `child()` call always waits for the child, so a natural completion normally has no open children; the enforcer is still called as a safety pass. |
| Failed | Yes | Fires after `WorkflowFailed` is recorded for any terminal workflow-task failure. |
| Timed out | Yes | Fires after `WorkflowTimedOut` is recorded for run-timeout and execution-timeout closures. |
| Cancelled | Yes | Fires after the accepted `CancelRequested` command closes the parent run. |
| Terminated | Yes | Fires after the accepted `TerminateRequested` command closes the parent run. |
| Continue-as-new | No | The workflow instance stays active under the new run, so existing child links are re-pointed at the continued run with their original policy preserved. |
| Reset | Not currently applicable | The v2 runtime does not expose a standalone reset command or reset terminal disposition. A future reset or repair operation that closes or replaces a parent run must define whether child ownership transfers; if the old run becomes terminal, it must apply parent-close policy before it stops owning open children. |

### When to use each policy

**Abandon** (default) is correct when children represent independent work that should complete regardless of the parent's fate — for example, a notification workflow or a cleanup task that must finish.

**Request Cancel** is correct when children should receive a graceful shutdown signal. The child can handle the cancellation and run compensation logic before closing.

**Terminate** is correct when children must stop immediately. Use this for children that are purely auxiliary to the parent and have no independent value after the parent closes.

### Waterline visibility

Waterline shows the `parent_close_policy` in:

- the child link entry on the parent run's lineage view
- the `ChildWorkflowScheduled` timeline entry payload
- the child's `CancelRequested` or `TerminateRequested` history event when policy enforcement fires, with a reason that names the parent closure

## Current Limitations

The current surface does not include:

- built-in bounded-concurrency helpers beyond the current `all([fn () => child(...)])`, `all([fn () => activity(...)])`, and mixed `all([fn () => child(...), fn () => activity(...)])` barriers

In other words, durable child handles are supported for already-reached child steps, but it does not yet include higher-level launch-handle or bounded-concurrency APIs beyond today's `child(...)` and `all([...])` surface.

## Run this pattern

The microservice coordination workflow in the
[Sample App](/docs/sample-app) is the runnable reference for
parent–child orchestration across application boundaries:

```bash
php artisan app:microservice
```

`App\Workflows\Microservice\MicroserviceWorkflow` runs the parent on
the main Laravel app and dispatches child work to the bundled
microservice worker. Open Waterline while the run is in flight to see
the child links populated under the parent run, with the close policy
visible on the lineage view exactly as this page describes.
