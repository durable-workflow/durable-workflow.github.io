---
sidebar_position: 6
---

# Workflow ID

When starting a workflow you can obtain the id like this.

```php
use Workflow\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflowId = $workflow->id();
```

In addition, inside of an activity, `$this->workflowId()` returns the id of the current workflow. This can be useful for activities that need to store data about the workflow that is executing them. For example, an activity may use the workflow id to store information in a database or cache so that it can be accessed by other activities in the same workflow.


```php
use Illuminate\Support\Facades\Cache;
use Workflow\Activity;

class MyActivity extends Activity
{
    public function execute()
    {
        $workflowId = $this->workflowId();

        Cache::put("workflow:{$workflowId}:data", 'some data');
    }
}
```

This ID can also be used to signal or query the workflow later. For example, if you want to send a notification email with a link to view the current state of the workflow, you can include the `$workflowId` in the email and use it to generate a signed URL.
