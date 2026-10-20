---
sidebar_position: 5
---

# Microservicios {#microservices}

Los workflows pueden abarcar varias aplicaciones Laravel. Una define los workflows y otra las actividades. Ambas comparten una base de datos y una cola, y cada una ejecuta su propio proceso `queue:work`.

## Base de datos y cola compartidas {#shared-database-and-queue}

Configura ambas aplicaciones con la misma base de datos y cola Redis:

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

Ejecuta las migraciones desde una sola aplicación:

```bash
php artisan migrate
```

Si las aplicaciones usan una conexión de base de datos distinta de `default`, consulta [Conexión de base de datos](./database-connection.md) para dirigir los modelos a la conexión compartida.

## Definir workflows y actividades {#defining-workflows-and-activities}

Registra claves de tipo para que el motor pueda enrutar las tareas por nombre:

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

El workflow programa la actividad mediante su clave de tipo:

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

## Ejecutar workers {#running-workers}

Cada aplicación ejecuta un worker en su propia cola:

```bash
# App A
php artisan queue:work shared --queue=workflows

# App B
php artisan queue:work shared --queue=activities
```

El worker de la aplicación A reproduce los workflows y programa tareas de actividad. El worker de la aplicación B recoge esas tareas, las ejecuta y devuelve resultados. El motor gestiona el traspaso mediante la base de datos compartida.
