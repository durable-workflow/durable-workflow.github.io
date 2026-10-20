---
sidebar_position: 5
---

# Microsserviços {#microservices}

Workflows podem abranger várias aplicações Laravel. Uma aplicação define workflows e outra define atividades. Ambas compartilham um banco de dados e uma fila, cada uma executando seu próprio processo `queue:work`.

## Banco de dados e fila compartilhados {#shared-database-and-queue}

Direcione ambas as aplicações para o mesmo banco de dados e a mesma fila Redis:

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

Execute as migrações em apenas uma das aplicações:

```bash
php artisan migrate
```

Se as aplicações usarem uma conexão com o banco de dados diferente de `default`, consulte [Conexão com o banco de dados](./database-connection.md) para direcionar os modelos à conexão compartilhada.

## Definindo workflows e atividades {#defining-workflows-and-activities}

Registre chaves de tipo para que o mecanismo possa rotear tarefas pelo nome:

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

O workflow agenda a atividade pela chave de tipo:

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

## Executando workers {#running-workers}

Cada aplicação executa um worker de fila em sua própria fila:

```bash
# App A
php artisan queue:work shared --queue=workflows

# App B
php artisan queue:work shared --queue=activities
```

O worker da aplicação A faz replay dos workflows e agenda tarefas de atividade. O worker da aplicação B recebe essas tarefas de atividade, executa-as e retorna os resultados. O mecanismo cuida da transferência pelo banco de dados compartilhado.
