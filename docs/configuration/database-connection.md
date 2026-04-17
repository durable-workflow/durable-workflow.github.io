---
sidebar_position: 4
---

# Database Connection

Here is an overview of the steps needed to customize the database connection used for the workflow v2 durable models. This is *only* required if you want to use a different database connection than the default connection you specified for your Laravel application.

1. Create classes in your app models directory that extend the base v2 model classes
2. Set the desired `$connection` option in each class
3. Publish the workflow config file
4. Update the `workflows.v2` model bindings to point at your custom classes

## Extending V2 Workflow Models

In `app\Models\V2\WorkflowInstance.php` put this.

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'mysql';
}
```

Repeat the pattern for each durable v2 model you need to re-route — at minimum:

- `Workflow\V2\Models\WorkflowRun`
- `Workflow\V2\Models\WorkflowHistoryEvent`
- `Workflow\V2\Models\WorkflowTask`
- `Workflow\V2\Models\WorkflowCommand`
- `Workflow\V2\Models\WorkflowLink`
- `Workflow\V2\Models\ActivityExecution`
- `Workflow\V2\Models\ActivityAttempt`
- `Workflow\V2\Models\WorkflowTimer`
- `Workflow\V2\Models\WorkflowFailure`
- `Workflow\V2\Models\WorkflowRunSummary`
- `Workflow\V2\Models\WorkflowSchedule`
- `Workflow\V2\Models\WorkflowScheduleHistoryEvent`

Each subclass should declare `protected $connection = 'mysql';` (or whichever connection name you defined in `config/database.php`).

## Registering Custom Models

Publish the workflow config file and update the `workflows.v2.*_model` bindings to point at your custom classes:

```php
// config/workflows.php

'v2' => [
    'instance_model' => App\Models\V2\WorkflowInstance::class,
    'run_model' => App\Models\V2\WorkflowRun::class,
    'history_event_model' => App\Models\V2\WorkflowHistoryEvent::class,
    'task_model' => App\Models\V2\WorkflowTask::class,
    'command_model' => App\Models\V2\WorkflowCommand::class,
    // ...
],
```

The package resolves models through `Workflow\V2\Support\ConfiguredV2Models`, so any relation or query that hits a v2 model will transparently pick up the configured connection.

## Migrations

Workflow migrations are auto-loaded from the package (`WorkflowServiceProvider::loadMigrationsFrom`) and run against the default database connection. When you route the v2 tables at a non-default connection, publish the migrations with `php artisan vendor:publish --tag=migrations` and set `protected $connection = 'mysql';` on each published migration class so `php artisan migrate` runs them against the correct database.
