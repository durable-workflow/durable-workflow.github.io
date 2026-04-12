---
sidebar_position: 8
---

# Testing

## Workflows

You can execute workflows synchronously in your test environment and mock activities and child workflows to define expected behaviors and outputs without running the actual implementations.

```
use function Workflow\activity;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        $result = yield activity(MyActivity::class);

        return $result;
    }
}
```

The above workflow can be tested by first calling `WorkflowStub::fake()` and then mocking the activity.

```
public function testWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyWorkflow::class);
    $workflow->start();

    $this->assertSame($workflow->output(), 'result');
}
```

You can also provide a callback instead of a result value to ` WorkflowStub::mock()`.

The workflow `$context` along with any arguments for the current activity will also be passed to the callback.

```
public function testWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, function ($context) {
        return 'result';
    });

    $workflow = WorkflowStub::make(MyWorkflow::class);
    $workflow->start();

    $this->assertSame($workflow->output(), 'result');
}
```

You can assert which activities or child workflows were dispatched by using the `assertDispatched`, `assertNotDispatched`, and `assertNothingDispatched` methods:

```
WorkflowStub::assertDispatched(MyActivity::class);

// Assert the activity was dispatched twice...
WorkflowStub::assertDispatched(MyActivity::class, 2);

WorkflowStub::assertNotDispatched(MyActivity::class);

WorkflowStub::assertNothingDispatched();
```

You may pass a closure to the `assertDispatched` or `assertNotDispatched` methods in order to assert that an activity or child workflow was dispatched that passes a given "truth test". The arguments for the activity or child workflow will be passed to the callback.

```
WorkflowStub::assertDispatched(TestOtherActivity::class, function ($string) {
    return $string === 'other';
});
```

## Skipping Time

By manipulating the system time with `$this->travel()` or `$this->travelTo()`, you can simulate time-dependent workflows. This strategy allows you to test timeouts, delays, and other time-sensitive logic within your workflows.

```
use function Workflow\{activity, timer};
use Workflow\Workflow;

class MyTimerWorkflow extends Workflow
{
    public function execute()
    {
        yield timer(60);

        $result = yield activity(MyActivity::class);

        return $result;
    }
}
```

The above workflow waits 60 seconds before executing the activity. Using `$this->travel()` and `$workflow->resume()` allows us to skip this waiting period.

```
public function testTimeTravelWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyTimerWorkflow::class);
    $workflow->start();

    $this->travel(120)->seconds();

    $workflow->resume();

    $this->assertSame($workflow->output(), 'result');
}
```

The helpers `$this->travel()` and `$this->travelTo()` methods use `Carbon:setTestNow()` under the hood.

## Activities

Testing activities is similar to testing Laravel jobs. You manually create the activity and then call the `handle()` method.

```
$workflow = WorkflowStub::make(MyWorkflow::class);

$activity = new MyActivity(0, now()->toDateTimeString(), StoredWorkflow::findOrFail($workflow->id()));

$result = $activity->handle();
```

Notice that we call the `handle()` method and not the `execute()` method.
