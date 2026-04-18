---
sidebar_position: 5
---

# Microservices

Workflows can span multiple Laravel applications. One app defines workflows, another defines activities. Both share a database and queue, each running its own `queue:work` process.

## Shared Database and Queue

Point both apps at the same database and Redis queue:

```php
// config/database.php — add to both apps

'connections' => [
    'shared' => [
        'driver' => 'mysql',
        'host' => env('SHARED_DB_HOST', '127.0.0.1'),
        'port' => env('SHARED_DB_PORT', '3306'),
        'database' => env('SHARED_DB_DATABASE', 'workflows'),
        'username' => env('SHARED_DB_USERNAME', 'root'),
        'password' => env('SHARED_DB_PASSWORD', ''),
        'charset' => 'utf8mb4',
        'collation' => 'utf8mb4_unicode_ci',
        'prefix' => '',
    ],
],
```

```php
// config/queue.php — add to both apps

'connections' => [
    'shared' => [
        'driver' => 'redis',
        'connection' => env('SHARED_REDIS_QUEUE_CONNECTION', 'default'),
        'queue' => env('SHARED_REDIS_QUEUE', 'default'),
        'retry_after' => 90,
        'block_for' => null,
        'after_commit' => false,
    ],
],
```

Run migrations from one app only:

```bash
php artisan migrate
```

If the apps use a different database connection than `default`, see [Database Connection](./database-connection.md) for how to point the v2 models at the shared connection.

## Defining Workflows and Activities

Register type keys so the engine can route tasks by name:

```php
// App A (workflow service) — config/workflows.php

'v2' => [
    'types' => [
        'workflows' => [
            'order-processing' => App\Workflows\OrderWorkflow::class,
        ],
        'activities' => [],
    ],
],
```

```php
// App B (activity service) — config/workflows.php

'v2' => [
    'types' => [
        'workflows' => [],
        'activities' => [
            'charge-payment' => App\Activities\ChargePaymentActivity::class,
        ],
    ],
],
```

The workflow schedules the activity by type key:

```php
// App A — app/Workflows/OrderWorkflow.php

use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class OrderWorkflow extends Workflow
{
    public ?string $connection = 'shared';
    public ?string $queue = 'workflows';

    public function handle(int $orderId): array
    {
        $charge = activity('charge-payment', $orderId);
        return ['order' => $orderId, 'charge' => $charge];
    }
}
```

```php
// App B — app/Activities/ChargePaymentActivity.php

use Workflow\V2\Activity;

class ChargePaymentActivity extends Activity
{
    public ?string $connection = 'shared';
    public ?string $queue = 'activities';

    public function handle(int $orderId): string
    {
        return "charged-{$orderId}";
    }
}
```

## Running Workers

Each app runs a queue worker on its own queue:

```bash
# App A
php artisan queue:work shared --queue=workflows

# App B
php artisan queue:work shared --queue=activities
```

App A's worker replays workflows and schedules activity tasks. App B's worker picks up those activity tasks, executes them, and returns results. The engine handles the handoff through the shared database.

## Activity Task Bridge

The `ActivityTaskBridge` contract lets an app poll for, claim, and complete activity tasks.

```php
use Workflow\V2\Contracts\ActivityTaskBridge;

$bridge = app(ActivityTaskBridge::class);
```

### Poll, claim, complete

```php
// Find ready activity tasks
$tasks = $bridge->poll('shared', 'activities', limit: 10);

// Claim a task (5-minute lease)
$claim = $bridge->claim($taskId, 'worker-1');
// $claim['activity_type'], $claim['arguments'], $claim['payload_codec']

// Complete with a result
$bridge->complete($claim['activity_attempt_id'], ['confirmation' => 'captured']);

// Or fail
$bridge->fail($claim['activity_attempt_id'], 'Gateway timeout');
```

### Heartbeat

Long-running activities extend their lease and check for cancellation:

```php
$hb = $bridge->heartbeat($claim['activity_attempt_id']);

if (! $hb['can_continue']) {
    // Run was cancelled or terminated — stop work
    return;
}
```

### HTTP routes

The bridge is also available as HTTP endpoints through `Workflow\V2\Webhooks::routes(...)`:

```
GET  /webhooks/activity-tasks/poll
POST /webhooks/activity-tasks/{taskId}/claim
POST /webhooks/activity-attempts/{attemptId}/heartbeat
POST /webhooks/activity-attempts/{attemptId}/complete
POST /webhooks/activity-attempts/{attemptId}/fail
```

## Workflow Task Bridge

The `WorkflowTaskBridge` contract lets an app poll for, claim, replay, and complete workflow tasks.

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;

$bridge = app(WorkflowTaskBridge::class);
```

### Poll and claim

```php
$tasks = $bridge->poll('shared', 'workflows', limit: 10);
$claim = $bridge->claim($taskId, 'worker-1');
```

### Execute in-process

The recommended path when the app has the workflow package and classes:

```php
$result = $bridge->execute($taskId);
// $result['run_status'], $result['next_task_id']
```

### External completion

When replay happens outside the package, submit commands directly:

```php
use Workflow\Serializers\Serializer;

$result = $bridge->complete($taskId, [
    [
        'type' => 'schedule_activity',
        'activity_type' => 'send-email',
        'arguments' => Serializer::serializeWithCodec('avro', ['user@example.com']),
    ],
]);

// Terminal command
$result = $bridge->complete($taskId, [
    [
        'type' => 'complete_workflow',
        'result' => Serializer::serializeWithCodec('avro', ['done' => true]),
    ],
]);
```

Commands:

| Type | Fields | Terminal |
|------|--------|---------|
| `schedule_activity` | `activity_type`, `arguments`, `connection`, `queue` | No |
| `start_timer` | `delay_seconds` | No |
| `start_child_workflow` | `workflow_type`, `arguments`, `connection`, `queue` | No |
| `complete_workflow` | `result` | Yes |
| `fail_workflow` | `message` | Yes |
| `continue_as_new` | `arguments`, `workflow_type` | Yes |

### HTTP routes

```
GET  /webhooks/workflow-tasks/poll
POST /webhooks/workflow-tasks/{taskId}/claim
GET  /webhooks/workflow-tasks/{taskId}/history
POST /webhooks/workflow-tasks/{taskId}/execute
POST /webhooks/workflow-tasks/{taskId}/complete
POST /webhooks/workflow-tasks/{taskId}/fail
POST /webhooks/workflow-tasks/{taskId}/heartbeat
```

## Control Plane

The `WorkflowControlPlane` contract starts, signals, queries, updates, cancels, and terminates workflows using type keys.

```php
use Workflow\V2\Contracts\WorkflowControlPlane;

$cp = app(WorkflowControlPlane::class);
```

### Start

```php
$result = $cp->start('order-processing', 'order-12345', [
    'arguments' => Serializer::serializeWithCodec('avro', ['item_count' => 3]),
    'connection' => 'shared',
    'queue' => 'workflows',
]);
// $result['workflow_instance_id'], $result['workflow_run_id']
```

### Signal, query, update

```php
$cp->signal('order-12345', 'addItem', ['arguments' => ['SKU-789']]);

$result = $cp->query('order-12345', 'getTotal');

$result = $cp->update('order-12345', 'setAddress', ['arguments' => ['123 Main St']]);
```

### Cancel, terminate, repair, archive

```php
$cp->cancel('order-12345', ['reason' => 'Customer request']);
$cp->terminate('order-12345', ['reason' => 'Fraud detected']);
$cp->repair('order-12345');
$cp->archive('order-12345');
```

### Describe

```php
$result = $cp->describe('order-12345');
// $result['status'], $result['run'], $result['actions']
```

### HTTP route

```
POST /webhooks/control-plane/start
```
