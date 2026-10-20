---
sidebar_position: 5
---

# マイクロサービス {#microservices}

ワークフローは複数の Laravel アプリケーションをまたいで実行できます。一方のアプリでワークフローを、もう一方でアクティビティを定義します。両者でデータベースとキューを共有し、それぞれで `queue:work` プロセスを実行します。

## データベースとキューの共有 {#shared-database-and-queue}

両アプリを同じデータベースと Redis キューに接続します。

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

マイグレーションは片方のアプリからだけ実行します。

```bash
php artisan migrate
```

`default` 以外のデータベース接続を使う場合、モデルを共有接続に向ける方法は[データベース接続](./database-connection.md)を参照してください。

## ワークフローとアクティビティの定義 {#defining-workflows-and-activities}

エンジンが名前でタスクをルーティングできるよう、型キーを登録します。

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

ワークフローは型キーでアクティビティをスケジュールします。

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

## Worker の実行 {#running-workers}

各アプリはそれぞれのキューでキュー Worker を実行します。

```bash
# App A
php artisan queue:work shared --queue=workflows

# App B
php artisan queue:work shared --queue=activities
```

アプリ A の Worker はワークフローをリプレイし、アクティビティタスクをスケジュールします。アプリ B の Worker はそのタスクを取得して実行し、結果を返します。引き継ぎはエンジンが共有データベースを通じて処理します。
