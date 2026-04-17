---
slug: microservice-communication-with-laravel-workflow
title: "Microservice Communication with Workflow"
authors:
  name: Richard
  title: Core Team
  url: https://github.com/rmcdaniel
  image_url: https://github.com/rmcdaniel.png
tags: [microservices, workflow, communication, distributed-systems]
---

In the evolving landscape of microservices, communication has always been a focal point. Microservices can interact in various ways, be it through HTTP/REST calls, using messaging protocols like RabbitMQ or Kafka, or even employing more recent technologies like gRPC. Yet, regardless of the communication method, the goal remains the same: seamless, efficient, and robust interactions. Today, we’ll explore how Workflow can fit into this picture and optimize the communication between microservices in a unique way.

## The Challenge

In a microservices architecture, decoupling is the name of the game. You want each service to have a single responsibility, to be maintainable, and to be independently deployable. Yet, in the world of workflows, this becomes challenging. How do you split a workflow from its activity and yet ensure they communicate seamlessly?

## Workflow to the Rescue!

[Workflow](https://github.com/durable-workflow/workflow) handles the discovery and orchestration for you! With a shared database and queue connection, you can have your workflow in one Laravel app and its activity logic in another.

### Defining Workflows and Activities

#### 1. Create a workflow.
```php
use function Workflow\activity;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute($name)
    {
        $result = yield activity(MyActivity::class, $name);
        return $result;
    }
}
```

#### 2. Create an activity.
```php
use Workflow\Activity;

class MyActivity extends Activity
{
    public function execute($name)
    {
        return "Hello, {$name}!";
    }
}
```

#### 3. Run the workflow.
```php
use Workflow\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start('world');
while ($workflow->running());
$workflow->output();
// Output: 'Hello, world!'
```

The workflow will manage the activity and handle any failures, retries, etc. Think of workflows like job chaining on steroids because you can have conditional logic, loops, return a result that can be used in the next activity, and write everything in typical PHP code that is failure tolerant.

## Balancing Shared and Dedicated Resources

When working with microservices, it’s common for each service to have its dedicated resources, such as databases, caches, and queues. However, to facilitate communication between workflows and activities across services, a shared connection (like a database or queue) becomes essential. This shared connection acts as a bridge for data and task exchanges while ensuring:

1. **Isolation**: Dedicated resources prevent cascading failures.
2. **Performance**: Each service can be optimized independently.
3. **Security**: Isolation limits potential attack vectors.

## Step-By-Step Integration

#### 1. Install `laravel-workflow` in all microservices.
Follow the [installation guide](https://durable-workflow.com/docs/installation/).

#### 2. Create a shared database/redis connection in all microservices.
```php
// config/database.php
'connections' => [
    'shared' => [
        'driver' => 'mysql',
        'host' => env('SHARED_DB_HOST', '127.0.0.1'),
        'database' => env('SHARED_DB_DATABASE', 'forge'),
        'username' => env('SHARED_DB_USERNAME', 'forge'),
        'password' => env('SHARED_DB_PASSWORD', ''),
    ],
],
```

#### 3. Configure a shared queue connection.
```php
// config/queue.php
'connections' => [
    'shared' => [
        'driver' => 'redis',
        'connection' => 'shared',
        'queue' => env('SHARED_REDIS_QUEUE', 'default'),
    ],
],
```

#### 4. Ensure only one microservice publishes Workflow migrations.
Update the migration to use the shared database connection.
```php
// database/migrations/..._create_workflows_table.php
class CreateWorkflowsTable extends Migration
{
    protected $connection = 'shared';
}
```

#### 5. Extend workflow models in each microservice to use the shared connection.
```php
// app/Models/StoredWorkflow.php
namespace App\Models;

use Workflow\Models\StoredWorkflow as BaseStoredWorkflow;

class StoredWorkflow extends BaseStoredWorkflow
{
    protected $connection = 'shared';
}
```

#### 6. Publish Workflow config and update it with shared models.
```sh
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="config"
```

#### 7. Set workflows and activities to use the shared queue.
```php
// app/Workflows/MyWorkflow.php
class MyWorkflow extends Workflow
{
    public $connection = 'shared';
    public $queue = 'workflow';
}
```
```php
// app/Workflows/MyActivity.php
class MyActivity extends Activity
{
    public $connection = 'shared';
    public $queue = 'activity';
}
```

#### 8. Ensure microservices define empty counterparts for workflow and activity classes.
#### In the workflow microservice:
```php
class MyWorkflow extends Workflow
{
    public $connection = 'shared';
    public $queue = 'workflow';

    public function execute($name)
    {
        yield activity(MyActivity::class, $name);
    }
}
class MyActivity extends Activity
{
    public $connection = 'shared';
    public $queue = 'activity';
}
```

#### In the activity microservice:
```php
class MyWorkflow extends Workflow
{
    public $connection = 'shared';
    public $queue = 'workflow';
}
class MyActivity extends Activity
{
    public $connection = 'shared';
    public $queue = 'activity';

    public function execute($name)
    {
        return "Hello, {$name}!";
    }
}
```

#### 9. Ensure all microservices have the same `APP_KEY` in their `.env` file.
This is crucial for proper job serialization across services.

#### 10. Run queue workers in each microservice.
```sh
php artisan queue:work shared --queue=workflow
php artisan queue:work shared --queue=activity
```

## Conclusion
By following the steps above, you can ensure seamless interactions between microservices while maintaining modularity and scalability. Workflow takes care of the discovery and orchestration for you. 🚀

Thanks for reading!

