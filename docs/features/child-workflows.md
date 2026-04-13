---
sidebar_position: 7
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

- Import the helper with `use function Workflow\V2\child;`.
- Calling `child(ChildWorkflow::class, ...)` creates a durable child workflow instance, a child run, typed parent-side child history, and a `child_workflow` lineage projection for Waterline and compatibility surfaces.
- The child run records its own accepted `start` command with `source = workflow`, so Waterline can show which parent instance, parent run, workflow step, and `child_call_id` created it.
- When the child closes, the parent records a typed child-resolution history event such as `ChildRunCompleted`, `ChildRunFailed`, `ChildRunCancelled`, or `ChildRunTerminated`, and that parent-side history is the replay source for the child outcome before the parent resume workflow task is created.
- While the child run is `pending`, `running`, or `waiting`, the parent run stays open and projects `wait_kind = child`.
- When the child completes, the runtime creates a new parent workflow task carrying `workflow_wait_kind = child`, `child_call_id`, `child_workflow_run_id`, and the `child_workflow_run` resume source, then replay resumes the parent with the child output.
- When the child fails, the runtime also resumes the parent, but `child(...)` throws an exception derived from the parent-side `ChildRunFailed` history instead of returning a value.
- If the parent catches that exception and continues, the parent run records `FailureHandled`; selected-run `exception_count`, `exceptions[*]`, timeline failure metadata, and history exports keep the child failure visible from typed history even if the child run's mutable failure row later drifts or disappears.
- If the historical child throwable cannot be resolved through `workflows.v2.types.exceptions`, `workflows.v2.types.exception_class_aliases`, or the recorded class, query and worker replay block with `UnresolvedWorkflowFailureException` instead of delivering a generic catchable exception to broad parent catch blocks.
- If the child uses `continueAsNew()`, the parent records another typed `ChildRunStarted` for the same `child_call_id` and follows that newest parent-recorded child run rather than freezing on the original child run id or trusting only the child instance's mutable `current_run_id`.
- `Workflow\V2\Workflow` now exposes `$this->child()` for the latest visible child handle and `$this->children()` for every visible child handle in workflow-step order.
- `Workflow\V2\ChildWorkflowHandle` exposes `id()` / `instanceId()`, `runId()`, and `callId()`, so parent code can distinguish the stable child instance id, the currently selected child run id, and the stable parent-issued `child_call_id`.
- Parent workflows can signal the current child through that handle with `signal()`, `signalWithArguments()`, or method-call sugar such as `$this->child()?->approvedBy('Taylor')`.
- Query replay keeps those handles read-only, while inline update application can still use the handle to emit a real child signal exactly once.
- Waterline exposes that relationship in detail views through lineage (`parents` / `continuedWorkflows`), child wait rows in `waits`, and typed child entries in `timeline`.
- `Workflow\V2\all()` can group child workflows by themselves or alongside `activity(...)` calls from the same parent step when you build the barrier with `startChild()` and `startActivity()`.
- Child-only `all([...startChild(...)])` barriers, nested `parallel([...])` child groups, and mixed `startChild(...)` plus `startActivity(...)` barriers return results in the original nested array shape once every member of the group completes successfully.
- In any barrier that includes children, the parent wakes immediately on the first failed, cancelled, or terminated child, but successful child closures do not wake the parent until the last successful member in every enclosing group closes.
- If several barrier members have already closed unsuccessfully by the time the parent replays, the parent-visible failure is selected by earliest recorded close time and then by the lower barrier leaf index for exact timestamp ties.
- Once that selected child close has already been thrown into the parent step, later sibling closures stay sibling history only; they do not replace the chosen throwable or reopen the parent run.

## Parallel Child Barrier

Import the helpers with `use function Workflow\V2\all;` and `use function Workflow\V2\startChild;` when you want one parent step to wait on several child workflows together.

```php
use function Workflow\V2\all;
use function Workflow\V2\startChild;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $children = all([
            startChild(FirstChildWorkflow::class),
            startChild(SecondChildWorkflow::class),
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
- During `all([...startChild(...)])` barriers, those handles appear in the same step order as the child calls inside the barrier, and `$this->child()` returns the last visible one.
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

### Setting the policy

Pass a `ChildWorkflowOptions` as the first argument to `child()` or `startChild()`:

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

The same pattern works with `startChild()` for parallel barriers:

```php
use function Workflow\V2\all;
use function Workflow\V2\startChild;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;

$cancelOptions = new ChildWorkflowOptions(
    parentClosePolicy: ParentClosePolicy::RequestCancel,
);

$results = all([
    startChild(FirstChild::class, $cancelOptions),
    startChild(SecondChild::class, $cancelOptions, 'arg'),
]);
```

### How it works

- The policy is recorded on the `workflow_links` row (`parent_close_policy`) and in the `ChildWorkflowScheduled` history event payload.
- When the parent run closes for any reason, the engine queries open child links with a non-abandon policy and sends the appropriate command (cancel or terminate) to each open child.
- If the child has already closed by the time the policy is enforced, no action is taken — the command is silently skipped.
- Policy enforcement is best-effort: if a child command is rejected (e.g. the child is already terminal), the parent's closure is not affected.
- Continue-as-new does **not** trigger parent-close policy, because the workflow instance remains active under a new run.

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

- built-in bounded-concurrency helpers beyond the current `all([...startChild(...)])`, `all([...startActivity(...)])`, and mixed `all([...startChild(...), startActivity(...)])` barriers

In other words, durable child handles are supported for already-reached child steps, but it does not yet include higher-level launch-handle or bounded-concurrency APIs beyond today's `child(...)`, `startChild()`, and `all([...])` surface.
