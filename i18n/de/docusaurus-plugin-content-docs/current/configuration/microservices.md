---
sidebar_position: 5
---

# Microservices {#microservices}

Workflows können sich über mehrere Laravel-Anwendungen erstrecken. Eine
Anwendung definiert Workflows, eine andere Aktivitäten. Beide teilen sich eine
Datenbank und eine Queue und führen jeweils einen eigenen `queue:work`-Prozess
aus.

## Gemeinsame Datenbank und Queue {#shared-database-and-queue}

Richten Sie beide Anwendungen auf dieselbe Datenbank und Redis-Queue aus:

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

Führen Sie Migrationen nur aus einer Anwendung aus:

```bash
php artisan migrate
```

Wenn die Anwendungen eine andere Datenbankverbindung als `default` verwenden,
erfahren Sie unter [Datenbankverbindung](./database-connection.md), wie Sie die
Modelle auf die gemeinsame Verbindung ausrichten.

## Workflows und Aktivitäten definieren {#defining-workflows-and-activities}

Registrieren Sie Typschlüssel, damit die Engine Aufgaben anhand des Namens
weiterleiten kann:

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

Der Workflow plant die Aktivität über ihren Typschlüssel ein:

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

## Worker ausführen {#running-workers}

Jede Anwendung führt einen Queue-Worker auf ihrer eigenen Queue aus:

```bash
# App A
php artisan queue:work shared --queue=workflows

# App B
php artisan queue:work shared --queue=activities
```

Der Worker von Anwendung A spielt Workflows erneut ab und plant
Aktivitätsaufgaben ein. Der Worker von Anwendung B übernimmt diese Aufgaben,
führt sie aus und gibt Ergebnisse zurück. Die Engine wickelt die Übergabe
über die gemeinsame Datenbank ab.
