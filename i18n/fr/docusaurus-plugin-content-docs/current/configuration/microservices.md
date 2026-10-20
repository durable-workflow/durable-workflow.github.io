---
sidebar_position: 5
---

# Microservices {#microservices}

Les workflows peuvent couvrir plusieurs applications Laravel. Une application définit les workflows, une autre les activités. Elles partagent une base de données et une file, chacune exécutant son propre processus `queue:work`.

## Base de données et file partagées {#shared-database-and-queue}

Faites pointer les deux applications vers la même base de données et la même file Redis :

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

Exécutez les migrations depuis une seule application :

```bash
php artisan migrate
```

Si les applications utilisent une connexion à la base de données différente de `default`, consultez [Connexion à la base de données](./database-connection.md) pour faire pointer les modèles vers la connexion partagée.

## Définir les workflows et les activités {#defining-workflows-and-activities}

Enregistrez des clés de type pour que le moteur puisse router les tâches par nom :

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

Le workflow programme l’activité à l’aide de sa clé de type :

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

## Exécuter les workers {#running-workers}

Chaque application exécute un worker sur sa propre file :

```bash
# App A
php artisan queue:work shared --queue=workflows

# App B
php artisan queue:work shared --queue=activities
```

Le worker de l’application A relit les workflows et programme les tâches d’activité. Celui de l’application B récupère ces tâches, les exécute et renvoie les résultats. Le moteur gère le passage de relais via la base de données partagée.
