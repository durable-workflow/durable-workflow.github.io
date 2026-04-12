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

To restart a workflow as new, call the helper function `continueAsNew(...)` from within the workflow’s `execute()` method.

```php
use function Workflow\{activity, continueAsNew};
use Workflow\Workflow;

class CounterWorkflow extends Workflow
{
    public function execute(int $count = 0, int $max = 3)
    {
        $result = yield activity(CountActivity::class, $count);

        if ($count >= $max) {
            return 'workflow_' . $result;
        }

        return yield continueAsNew($count + 1, $max);
    }
}
```

In this example:

* The workflow executes an activity each iteration.
* If the maximum count has not been reached, it continues as new with incremented arguments.
* The final result is returned only when the loop completes.
