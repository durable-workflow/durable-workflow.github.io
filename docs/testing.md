---
sidebar_position: 8
---

# Testing

## `Workflow\V2`

`Workflow\V2\WorkflowStub::fake()` provides a deterministic inline test path for the supported `V2` fake surface.

- ready workflow and activity tasks execute inline instead of waiting for a queue worker
- nested child workflows execute as real nested `V2` runs under that same fake mode
- activity mocks still write durable `activity_executions`, task, and history rows
- backend capability checks are bypassed for the fake path, so `sync` remains usable in tests
- `WorkflowStub::assertDispatched()`, `assertDispatchedTimes()`, `assertNotDispatched()`, and `assertNothingDispatched()` cover `V2` activity dispatches
- `WorkflowStub::assertSignalSent()`, `assertSignalSentTimes()`, and `assertSignalNotSent()` cover `V2` signals sent through `WorkflowStub::signal()` or `signalWithStart()`
- `WorkflowStub::assertUpdateSent()`, `assertUpdateSentTimes()`, and `assertUpdateNotSent()` cover `V2` updates sent through `WorkflowStub::update()`, `attemptUpdate()`, or `submitUpdate()`
- delayed timer tasks stay durable queued work until they become due; after you advance time, `WorkflowStub::runReadyTasks()` drains already-due tasks inline

### First-release testing scope

The following are **not** part of the first-release `V2` fake surface and may be added as future additive contracts:

- there is no `V2` equivalent of the legacy `resume()` bridge
- there is no dedicated child-workflow mock or dispatch-assert helper — child workflows execute as real nested `V2` runs under fake mode, so test them through their observable output rather than mocking
- there is no delayed-callback hook for injecting signals or updates at virtual time offsets during a single fake execution — advance time and call `WorkflowStub::runReadyTasks()` between explicit signal/update calls instead

`WorkflowStub::mock()` enforces this scope at runtime: passing a `Workflow` subclass throws a `LogicException` with a clear message directing you to test child workflows through their observable output instead. Only `Activity` classes (and unresolved string keys) are accepted as mock targets.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        return [
            'result' => activity(MyActivity::class, 'Taylor'),
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

```php
use Workflow\V2\Testing\ActivityFakeContext;
use Workflow\V2\WorkflowStub;

public function testWorkflow(): void
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, function (ActivityFakeContext $context, string $name): string {
        $this->assertSame('Taylor', $name);
        $this->assertSame('my-workflow-id', $context->workflowId());

        return "Hello, {$name}!";
    });

    $workflow = WorkflowStub::make(MyWorkflow::class, 'my-workflow-id');
    $workflow->start();

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame('Hello, Taylor!', $workflow->output()['result']);

    WorkflowStub::assertDispatched(MyActivity::class, function (string $name): bool {
        return $name === 'Taylor';
    });
}
```

Use `WorkflowStub::assertDispatched()`, `assertDispatchedTimes()`, `assertNotDispatched()`, and `assertNothingDispatched()` to assert the recorded `V2` activity dispatches.

For timer-backed workflows, advance time with Laravel's travel helpers and then drain the due task queue explicitly:

```php
use function Workflow\V2\timer;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

final class MyTimerWorkflow extends Workflow
{
    public function handle(): array
    {
        timer(60);

        return ['done' => true];
    }
}

public function testTimerWorkflow(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(MyTimerWorkflow::class, 'timer-workflow');
    $workflow->start();

    $this->travel(60)->seconds();

    WorkflowStub::runReadyTasks();

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame(['done' => true], $workflow->output());
}
```

`WorkflowStub::runReadyTasks()` only drains tasks that are already due. It does not fast-forward wall clock time or force future-delayed timers to fire early.

### Sending Signals in Fake Mode

Signal-waiting workflows can receive signals in fake mode. When you call `$workflow->signal(...)`, the engine records the durable signal command and creates a workflow task. In fake mode that task executes inline, so the workflow resumes synchronously:

```php
use function Workflow\V2\activity;
use Workflow\V2\Attributes\Signal;
use function Workflow\V2\awaitSignal;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

#[Signal('name-provided')]
final class ApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $name = awaitSignal('name-provided');
        $greeting = activity(GreetingActivity::class, $name);

        return ['name' => $name, 'greeting' => $greeting];
    }
}

public function testSignalWorkflow(): void
{
    WorkflowStub::fake();
    WorkflowStub::mock(GreetingActivity::class, 'Hello, Taylor!');

    $workflow = WorkflowStub::make(ApprovalWorkflow::class, 'approval-1');
    $workflow->start();

    // Workflow suspends at awaitSignal()
    $this->assertSame('waiting', $workflow->refresh()->status());

    // Send the signal — resumes the workflow inline
    $workflow->signal('name-provided', 'Taylor');

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame('Taylor', $workflow->output()['name']);

    WorkflowStub::assertSignalSent('name-provided');
    WorkflowStub::assertSignalSentTimes('name-provided', 1);
    WorkflowStub::assertSignalNotSent('other-signal');
}
```

Use `WorkflowStub::assertSignalSent()`, `assertSignalSentTimes()`, and `assertSignalNotSent()` to verify which signals were sent during the test. The callback form receives the instance id and signal arguments:

```php
WorkflowStub::assertSignalSent(
    'name-provided',
    fn (string $instanceId, string $name): bool =>
        $instanceId === 'approval-1' && $name === 'Taylor'
);
```

### Sending Updates in Fake Mode

Updates also apply inline in fake mode. When you call `$workflow->attemptUpdate(...)` or `$workflow->update(...)`, the engine records the durable update command, creates a workflow task that applies the update, and executes it inline:

```php
use Workflow\UpdateMethod;
use Workflow\V2\Attributes\Signal;
use function Workflow\V2\awaitSignal;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

#[Signal('done')]
final class SettingsWorkflow extends Workflow
{
    private bool $enabled = false;

    public function handle(): array
    {
        awaitSignal('done');

        return ['enabled' => $this->enabled];
    }

    #[UpdateMethod]
    public function toggle(bool $enabled): array
    {
        $this->enabled = $enabled;

        return ['enabled' => $this->enabled];
    }
}

public function testUpdateWorkflow(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(SettingsWorkflow::class, 'settings-1');
    $workflow->start();

    $this->assertSame('waiting', $workflow->refresh()->status());

    $result = $workflow->attemptUpdate('toggle', true);

    $this->assertTrue($result->accepted());

    WorkflowStub::assertUpdateSent('toggle');
    WorkflowStub::assertUpdateSentTimes('toggle', 1);
    WorkflowStub::assertUpdateNotSent('other-update');

    // Complete the workflow
    $workflow->signal('done');
    $this->assertTrue($workflow->refresh()->completed());
    $this->assertTrue($workflow->output()['enabled']);
}
```

Use `WorkflowStub::assertUpdateSent()`, `assertUpdateSentTimes()`, and `assertUpdateNotSent()` to verify which updates were sent during the test. The callback form receives the instance id and update arguments:

```php
WorkflowStub::assertUpdateSent(
    'toggle',
    fn (string $instanceId, bool $enabled): bool =>
        $instanceId === 'settings-1' && $enabled === true
);
```

## Legacy `Workflow\WorkflowStub`

### Workflows

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

### Skipping Time

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

The above workflow waits 60 seconds before executing the activity. Using `$this->travel()` and `$workflow->resume()` allows us to skip this waiting period in the legacy runtime.

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

### Activities

Testing activities is similar to testing Laravel jobs. You manually create the activity and then call the `handle()` method.

```
$workflow = WorkflowStub::make(MyWorkflow::class);

$activity = new MyActivity(0, now()->toDateTimeString(), StoredWorkflow::findOrFail($workflow->id()));

$result = $activity->handle();
```

Notice that legacy activities still execute through the runtime `handle()` job method. In `Workflow\V2`, user-defined workflow and activity code also lives in `handle()`.
