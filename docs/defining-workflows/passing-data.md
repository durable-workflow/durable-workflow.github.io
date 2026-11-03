---
sidebar_position: 4
---

# Passing Data

You can pass data into a workflow via the `start()` method.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start('world');
```

Arguments are passed to the workflow's `handle()` method.

Similarly, you can pass data into an activity via the `activity()` helper function.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle($name)
    {
        return activity(MyActivity::class, $name);
    }
}
```

Arguments are passed to the activity's `handle()` method.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle($name)
    {
        return "Hello, {$name}!";
    }
}
```

import PassingDataSimulator from '@site/src/components/PassingDataSimulator';

<PassingDataSimulator />

In general, you should only pass small amounts of data in this manner. Rather than passing large amounts of data, you should write the data to the database, cache or file system. Then pass the key or file path to the workflow and activities. The activities can then use the key or file path to read the data.

When the application genuinely needs to carry large bytes through history — documents, media blobs, serialized exports — enable [External Payload Storage](../features/external-payload-storage.md) on the namespace. The runtime offloads over-threshold payloads to a configured object store and records a verifiable reference envelope in history, keeping replay integrity while staying under the [`payload_size_bytes` structural limit](../constraints/structural-limits.md#payload-size).

## Output

Once the workflow has completed, you can retrieve the output using the `output()` method.

```php
$workflow->output();
=> 'Hello, world!'
```

## Models

V2 payloads use a portable value format, so an Eloquent model can't be a workflow or activity argument or result. Pass the model's key and load the model inside the activity that uses it.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(int $userId)
    {
        return activity(MyActivity::class, $userId);
    }
}
```

```php
use App\Models\User;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(int $userId)
    {
        $user = User::findOrFail($userId);

        return "Hello, {$user->name}!";
    }
}
```

Load models in activities, not in workflow code. Workflow code is replayed, and a database query can return different rows on a later replay.

Passing a model to `start()` throws an `InvalidArgumentException`. Passing a model to `activity()` fails the workflow run. Both errors name the model class:

```
unsupported_value_type: Eloquent model App\Models\User cannot cross a V2 payload boundary. Pass its key and load the model inside the activity.
```

The same rule applies to Eloquent collections. Pass an array of keys instead. If the activity needs only a few attributes, pass them as an array.

In v1, workflows and activities received models through `SerializesModels`, which stored a model identifier and reloaded the model when the job ran. V2 doesn't do this.

## Dependency Injection

In addition to passing data, you are able to type-hint dependencies on the workflow or activity `handle()` methods. The Laravel service container will automatically inject those dependencies.

```php
use Illuminate\Contracts\Foundation\Application;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(Application $app)
    {
        if ($app->runningInConsole()) {
            // ...
        }
    }
}
```

Dependency injection does not relax workflow determinism. A workflow may
type-hint stable services such as the Laravel application container or
configuration readers, but injected dependencies that do work still need the
right durable boundary. Put external I/O, database access, service calls, or
other work that can fail or should retry in `activity(...)` or
`localActivity(...)`. Use `sideEffect()` only for a one-time replay-safe value
snapshot that should be frozen in history, such as a wall-clock read, generated
randomness, or a config value captured at decision time.
