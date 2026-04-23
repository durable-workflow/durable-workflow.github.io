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

Passing in models works similarly to `SerializesModels`.

```php
use App\Models\User;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(User $user)
    {
        return activity(MyActivity::class, $user->name);
    }
}
```

When an Eloquent model is passed to a workflow or activity, only its `ModelIdentifier` is serialized. This reduces the size of the payload, ensuring that your workflows remain efficient and performant.

```
object(ModelIdentifier) {
    id: 42,
    class: "App\Models\User",
    relations: [],
    connection: "mysql"
}
```

When the workflow or activity runs, it will retrieve the complete model instance, including any loaded relationships, from the database. If you wish to prevent extra database calls during the execution of a workflow or activity, consider converting the model to an array before passing it.

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

