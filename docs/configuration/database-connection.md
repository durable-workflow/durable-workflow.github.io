---
sidebar_position: 4
---

# Database Connection

Workflow uses your application's default Laravel database connection unless you
select another connection for its durable storage.

To move workflow storage to a connection defined in `config/database.php`, set
its name in your environment:

```dotenv
DW_STORAGE_CONNECTION=workflows
```

Workflow models, transactions, row locks and after-commit callbacks use that
connection. Keep all durable workflow tables on the same Laravel connection.
Configure queue transport separately through Laravel's queue configuration.

You can also select the connection through custom model classes as described
below. The configured V2 `run_model` supplies the storage connection for V2
metadata without an explicit model connection. Keep explicit model connections
consistent with it. `DW_STORAGE_CONNECTION` takes precedence over model
connection properties.

For the full v2 override contract, including table-swapped subclasses,
serializer rules, repository replacement, health diagnostics, and migration
expectations, see the [Customization Matrix](./customization-matrix.md).

## Custom Model Connections

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

If you move beyond schema-compatible subclasses and change the inferred foreign
key of your custom `instance_model`, the package now validates that the
`runs()`, `commands()`, and `updates()` relations were overridden explicitly at
boot.

## Migrations

Workflow migrations are auto-loaded from the package and honor
`DW_STORAGE_CONNECTION`. Application migrations keep their own configured
connections.

When using custom model connections without `DW_STORAGE_CONNECTION`, give
their published workflow migrations the same `$connection`. Laravel's
`--database` option can also select the target when running only those workflow
migrations. Keep application migrations on the application connection.

## Transaction Boundaries

When application data and workflow storage use the same Laravel connection,
starting a workflow inside a transaction joins that transaction. A rollback
removes the workflow writes made inside it. The engine publishes workflow tasks
to the queue and emits lifecycle events after the outermost storage transaction
commits. A rollback discards those callbacks.

For example, with `DW_STORAGE_CONNECTION=workflows`:

```php
use App\Workflows\OrderWorkflow;
use Illuminate\Support\Facades\DB;
use Workflow\V2\WorkflowStub;

DB::connection('workflows')->transaction(function () {
    WorkflowStub::make(OrderWorkflow::class, 'order-123')->start('order-123');
});
```

Any application models whose changes must commit atomically with this start
must also use the `workflows` connection.

Transactions on different Laravel connections commit independently, even when
the connection names point at the same physical database. An application
transaction on the default connection cannot roll back a workflow that already
committed on another storage connection. Place changes requiring atomicity on
the same connection and include them in that connection's transaction.

After-commit publication protects the workflow storage boundary. A separate
database or message broker used by the queue has its own transaction and
delivery behavior.
