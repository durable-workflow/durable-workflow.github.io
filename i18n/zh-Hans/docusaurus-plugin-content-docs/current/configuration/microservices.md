---
sidebar_position: 5
---

# 微服务 {#microservices}

工作流可以跨多个 Laravel 应用运行。一个应用定义工作流，另一个定义活动。两者共享数据库和队列，各自运行 `queue:work` 进程。

## 共享数据库和队列 {#shared-database-and-queue}

将两个应用指向同一数据库和 Redis 队列：

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

只从其中一个应用运行迁移：

```bash
php artisan migrate
```

如果应用使用的数据库连接不是 `default`，请参阅[数据库连接](./database-connection.md)，将模型指向共享连接。

## 定义工作流和活动 {#defining-workflows-and-activities}

注册类型键，使引擎可以按名称路由任务：

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

工作流通过类型键调度活动：

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

## 运行 Worker {#running-workers}

每个应用在自己的队列上运行队列 Worker：

```bash
# App A
php artisan queue:work shared --queue=workflows

# App B
php artisan queue:work shared --queue=activities
```

应用 A 的 Worker 重放工作流并调度活动任务。应用 B 的 Worker 获取这些活动任务、执行并返回结果。引擎通过共享数据库完成交接。
