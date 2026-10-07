---
sidebar_position: 5
---

# Мікросервіси {#microservices}

Workflow можуть охоплювати кілька застосунків Laravel. Один застосунок визначає
workflow, інший — activity. Обидва використовують спільні базу даних і чергу,
кожен запускає власний процес `queue:work`.

## Спільні база даних і черга {#shared-database-and-queue}

Налаштуйте обидва застосунки на ту саму базу даних і чергу Redis:

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

Запускайте міграції лише з одного застосунку:

```bash
php artisan migrate
```

Якщо застосунки використовують інше з’єднання з базою даних, ніж `default`,
дивіться [з’єднання з базою даних](./database-connection.md), щоб спрямувати моделі
до спільного з’єднання.

## Визначення workflow й activity {#defining-workflows-and-activities}

Зареєструйте ключі типів, щоб рушій міг маршрутизувати завдання за назвою:

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

Workflow планує activity за ключем типу:

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

## Запуск worker {#running-workers}

Кожен застосунок запускає worker черги на власній черзі:

```bash
# App A
php artisan queue:work shared --queue=workflows

# App B
php artisan queue:work shared --queue=activities
```

Worker застосунку A відтворює workflow та планує завдання activity. Worker
застосунку B отримує ці завдання, виконує їх і повертає результати. Рушій
координує передавання через спільну базу даних.
