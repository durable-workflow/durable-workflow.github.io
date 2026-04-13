---
sidebar_position: 12
---

# Continue As New

The **Continue As New** pattern allows a running workflow to restart itself with new arguments.
This is useful when you need to:

* Prevent unbounded workflow history growth.
* Model iterative loops or recursive workflows.
* Split long-running workflows into smaller, manageable executions while preserving continuity.

## Using `continueAsNew`

To restart a workflow as new, call the helper function `continueAsNew(...)` from within the workflow’s `handle()` method. `continueAsNew()` is a first-class run transition.

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class CounterWorkflow extends Workflow
{
    public function handle(int $count = 0, int $max = 3)
    {
        $result = activity(CountActivity::class, $count);

        if ($count >= $max) {
            return [
                ‘count’ => $result,
                ‘workflow_id’ => $this->workflowId(),
                ‘run_id’ => $this->runId(),
            ];
        }

        return continueAsNew($count + 1, $max);
    }
}
```

In this example:

* The workflow executes an activity each iteration.
* If the maximum count has not been reached, it continues as new with incremented arguments.
* The final result is returned only when the loop completes.

When a workflow continues as new:

- `WorkflowStub::id()` stays on the same public workflow instance id for the whole chain
- `WorkflowStub::runId()` follows the newest run in the chain after `refresh()`
- the continued run closes with `status = completed` and `closed_reason = continued`
- the next run is created immediately with a fresh run id, a ready workflow task, and its own accepted `start` command with `source = workflow`
- Waterline exposes that chain through `parents` and `continuedWorkflows` lineage arrays on the run detail payload
- instance-targeted load, query, signal, update, repair, cancel, terminate, and Waterline current-run navigation resolve the newest durable run in that chain instead of trusting only the mutable `current_run_id` pointer
- if the continued run is also a child workflow, the new run carries forward the primary parent context in typed start history and the parent records a fresh `ChildRunStarted` for the same `child_call_id`, so parent resume, Waterline lineage, and current-child selection stay intact even if copied link rows or the child instance’s `current_run_id` later drift
- run summaries track `history_event_count`, `history_size_bytes`, and `continue_as_new_recommended`, so Waterline can flag long-lived runs once they cross the configured event-count or byte-size budget

Long-lived loops can shed history without inventing a new public workflow id every time the run rolls forward.

## History Budget

Workflow code can observe its current history length and a continue-as-new suggestion flag through explicit runtime context. This lets long-lived loops hand off deliberately before they hit history-budget cliffs.

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        if ($this->shouldContinueAsNew()) {
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```

### Available methods

| Method | Return type | Description |
| --- | --- | --- |
| `$this->historyLength()` | `int` | Number of history events in the current run |
| `$this->historySize()` | `int` | Total size of history events in bytes |
| `$this->shouldContinueAsNew()` | `bool` | `true` when the run exceeds the configured event count or byte size budget |

### Configuration

The continue-as-new recommendation thresholds are configurable:

```php
// config/workflows.php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => 10000,
        'continue_as_new_size_bytes_threshold' => 5242880, // 5 MB
    ],
],
```

`shouldContinueAsNew()` returns `true` when either threshold is crossed. Run summaries also track `history_event_count`, `history_size_bytes`, and `continue_as_new_recommended` so Waterline can flag long-lived runs in fleet views.

## Metadata Carry-Forward

When a workflow continues as new, the new run inherits the previous run's metadata automatically:

| Metadata | Carry-forward behavior |
| --- | --- |
| Search attributes | Full merged map carries forward, including mid-run upserts |
| Memo | Full merged map carries forward, including mid-run upserts |
| Visibility labels | Carried forward as-is (set once at start time) |
| Business key | Carried forward as-is |
| Compatibility marker | Carried forward so the new run targets the same worker build |
| Message cursor position | Carried forward so the new run knows which inbound messages (signals/updates) were already consumed |

The new run starts with the inherited metadata and can continue upserting search attributes and memo from there. This means a long-lived polling workflow can accumulate metadata across generations without losing state when it sheds history.

```php
use function Workflow\V2\{activity, continueAsNew, upsertMemo, upsertSearchAttributes};
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        upsertSearchAttributes(['iteration' => (string) $iteration, 'status' => 'polling']);
        upsertMemo(['last_result' => $result, 'iteration' => $iteration]);

        if ($this->shouldContinueAsNew()) {
            // The new run inherits all search attributes and memo
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```
