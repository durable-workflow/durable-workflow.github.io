---
sidebar_position: 2
---

# Options

There are various options available when defining your workflows and activities. These options include the number of times a workflow or activity may be attempted before it fails, the connection and queue, and the maximum number of seconds it is allowed to run.

```php
use Workflow\Activity;

class MyActivity extends Activity
{
    public $connection = 'default';
    public $queue = 'default';

    public $tries = 0;
    public $timeout = 0;

    public function backoff()
    {
        return [1, 2, 5, 10, 15, 30, 60, 120];
    }
}
```

## WorkflowOptions

You can also set queue options at workflow start time using `WorkflowOptions`.

```php
use Workflow\WorkflowOptions;
use Workflow\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);

$workflow->start(
    'arg1',
    WorkflowOptions::set([
        'connection' => 'redis',
        'queue' => 'critical',
    ])
);

// OR

$workflow->start('arg1', new WorkflowOptions('redis', 'critical'));
```

`WorkflowOptions` are consumed by the workflow engine and are not passed as arguments to your workflow `execute()` method.

These options are persisted with the workflow and used for subsequent workflow/activity dispatching (including replay and continue-as-new behavior).

## Connection

The `$connection` setting is used to specify which queue connection the workflow or activity should be sent to. By default, the `$connection` value is not set which will use the default connection. This can be overridden by setting the `$connection` property on the workflow or activity class.

## Queue

The `$queue` setting is used to specify which queue the workflow or activity should be added to. By default, the `$queue` value is not set which uses the default queue for the specified connection. This can be overridden by setting the `$queue` property on the workflow or activity class.

## Retries

The `$tries` setting is used to control the number of retries an activity is attempted before it is considered failed. By default, the `$tries` value is set to 0 which means it will be retried forever. This can be overridden by setting the `$tries` property on the activity class.

## Timeout

The `$timeout` setting is used to control the maximum number of seconds an activity is allowed to run before it is killed. By default, the `$timeout` value is set to 0 seconds which means it can run forever. This can be overridden by setting the `$timeout` property on the activity class.

## Backoff

The `backoff` method returns an array of integers corresponding to the current attempt. The default `backoff` method decays exponentially to 2 minutes. This can be overridden by implementing the `backoff` method on the activity class.
