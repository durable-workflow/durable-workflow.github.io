---
sidebar_position: 14
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

- The instance id stays stable across the chain; `WorkflowStub::runId()` moves forward to the newest run.
- The continued run closes as `completed` / `continued` and the next run starts immediately with a fresh run id.
- Signals, queries, updates, and operator commands always resolve the newest durable run for that instance — callers do not need to track run ids across continue-as-new boundaries.

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
