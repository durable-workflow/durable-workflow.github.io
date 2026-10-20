---
sidebar_position: 4
title: Laravel への導入とランタイム移行
description: フレームワーク連携とランタイム所有権を明確に保ちながら、Laravel ワークフロー群を v1 から Durable Workflow 2.0 の組み込みまたはサービスモードへ移行します。
tags:
  - laravel
  - migration
  - service-mode
  - embedded
keywords:
  - Laravel Durable Workflow の移行
  - Laravel サービスモード
  - v1 から v2 への移行
  - 組み込みからサービスモードへ
---

# Laravel への導入とランタイム移行 {#laravel-adoption-and-runtime-transition}

Laravel アプリケーションには、Durable Workflow 2.0 のファーストパーティの移行先が二つあります。組み込みモードは永続実行をアプリケーション内に保ちます。サービスモードは Laravel をアプリ・Worker のフレームワークとして維持し、Cloud またはセルフホスト Server が永続状態を所有します。

このページは、三つの経路の判断と移行を扱います。

1. 安定版 v1 Laravel から 2.0 組み込みへ。
2. 安定版 v1 Laravel から 2.0 PHP SDK サービスモードへ。
3. 2.0 組み込み Laravel から 2.0 PHP SDK サービスモードへ。

直近の目的がパッケージ単位の v1 更新なら、詳細な [2.0 移行ガイド](/docs/migration/)を併読してください。セルフホストのサービスランタイムを選択済みなら、ここで移行方針を選んだ後、[組み込みから Server への手順](/docs/polyglot/embedded-to-server/)へ進みます。

## 移行先を選ぶ {#pick-the-destination}

| 出発点 | 移行先 | 選ぶ場合 | 最初の移行境界 |
| --- | --- | --- | --- |
| 安定版 v1 Laravel | 2.0 組み込み | Laravel アプリが引き続き永続化、キュー、実行、組み込み Waterline を所有する。 | 保守中の `durable-workflow/workflow` を 2.0 系列へ更新。既存 v1 実行はパッケージの v1 互換経路で完了し、新規開始は v2 を使う。 |
| 安定版 v1 Laravel | PHP SDK サービスモード | Laravel の依存注入、設定、Artisan、ログ、イベント、テスト fake を維持し、永続状態は Cloud・Server が所有する。 | `durable-workflow/sdk` を別のサービスクライアント・Worker 境界として追加。v1 履歴と永続 Laravel キュージョブは終端まで v1 に残す。 |
| 2.0 組み込み Laravel | PHP SDK サービスモード | アプリによるオーケストレーションランタイム所有をやめる、または共有・多言語ランタイムが必要。 | Worker 準備後、新規開始をサービスへ振り向ける。組み込み実行は開始元でドレインするか、セルフホスト Server 向けの適格な組み込み v2 の明示的インポートを使う。 |

PHP SDK ブリッジと組み込みパッケージは、互換 PHP バージョン上の Laravel 9～13 をサポートします。サポート対象 v1 アプリは、無関係な Laravel 更新なしでどちらも選べます。

## 所有境界を比較する {#compare-the-ownership-boundary}

| 項目 | 安定版 v1 Laravel | 2.0 組み込み Laravel | 2.0 PHP SDK サービスモード |
| --- | --- | --- | --- |
| ランタイム所有者 | Laravel アプリがオーケストレーション・リプレイを所有。 | Laravel アプリが v2 エンジン、履歴、matching、タイマー、リプレイを所有。 | Cloud が名前空間ランタイムを運用するか、チームがセルフホスト Server を運用。Laravel はクライアント・リモート Worker を実行し、ランタイムは実行しない。 |
| Composer パッケージ | 安定版 1.x の `durable-workflow/workflow`。 | 2.0 成果物の規範にある `durable-workflow/workflow`。 | 独立公開された PHP SDK 規範の `durable-workflow/sdk`。組み込みエンジンに依存しない。 |
| 必要なプロセス | Laravel web/CLI と Laravel キュー Worker または Horizon。 | Laravel web/CLI とキュー Worker または Horizon。スケジューラー・修復ロールは組み込み設定に従う。 | Laravel アプリと一つ以上の `php artisan durable-workflow:worker`。Cloud はランタイムを供給。セルフホストは別途 Server と永続化が必要。 |
| キューとストレージ | ワークフロー行と PHP 向け履歴は設定済み Laravel DB、ワークフロー・アクティビティ・リトライ・タイマージョブは Laravel キュー。 | イベント履歴と投影はアプリの設定 DB、組み込みタスクは通常 Laravel キュー。 | 永続履歴・タスク状態は Cloud・Server 永続化。`DURABLE_WORKFLOW_TASK_QUEUE` は SDK Worker がポーリングするリモートタスクキュー識別情報で、Laravel キュー接続ではない。 |
| ワークフロー・アクティビティの識別 | PHP クラスが永続識別情報。 | `workflows.v2.types` に安定した別名を設定し、クラスはローカル実装とする。 | `#[Workflow('orders.fulfill')]` と `#[Activity('orders.reserve')]` が登録時に安定した文字列型キーを公開。PHP FQCN をランタイム間契約に使わない。 |
| 認証情報 | Laravel アプリ、DB、キャッシュ、キューの認証情報。元の `APP_KEY` も v1 復旧の一部。 | Laravel アプリと DB・キャッシュ・キュー、ホストが所有する組み込み Waterline 認証。 | Cloud アプリプロセスは制御用、Worker は Worker 用認証情報のみ受け取る。セルフホストは共有トークンまたは同等の限定認証情報を使用可能。プロセス入力であり、意図的に Laravel 設定キャッシュから除外。 |
| 運用ツール | Laravel ログ・イベント、キューツール、Horizon、v1 Waterline、利用可能なら `workflow:v1:list`。 | Laravel ログ・イベント、キューツール、`workflow:v2:doctor`、履歴・修復コマンド、組み込み Waterline。 | SDK 診断は Laravel の PSR logger と `WorkerDiagnosticEvent` を通る。Cloud は Managed Waterline を含む。セルフホストは Server API・CLI を使い、任意で名前空間向け Waterline を別途デプロイ。 |
| 切り替え・ロールバック責任 | チームが v1 DB、キュー状態、設定、秘密を一つの復旧セットとして保全。 | チームが新規 v1/v2 開始を分離し、v1 起動経路を維持し、旧テーブル・キューの廃止時点を判断。 | チームが実行を所有するランタイムへコマンドを送る。Cloud は管理サービス内のランタイム復帰を所有し、セルフホストは Server 永続化・復帰を所有。アプリのロールバックでも両方の実行が終端になるまで新旧経路を維持。 |

Cloud とセルフホスト Server は、サービスモード内の選択肢です。Cloud ユーザーは Server や別の Waterline サービスをインストールしません。セルフホスト運用者は Server のデプロイ、保護、バックアップ、拡張、更新を担います。Waterline は Server 所有名前空間向けの別の任意デプロイです。

## 三つのモードで同じ Laravel 用途を実装する {#one-laravel-use-case-in-all-three-modes}

例は `orders.fulfill` の在庫を予約します。安定版 v1 クラスを v2 型キーへ意図的に対応付け、以後は型キーと設定タスクキューを安定させます。リトライや完了応答の喪失後にアクティビティが複数回実行され得るため、予約とビジネスイベント受信側は冪等にしなければなりません。

本番とテストで同じアプリケーションアクションを使います。

| モード | 本番の入口 | fake 有効後の入口 |
| --- | --- | --- |
| 安定版 v1 Laravel | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| 2.0 組み込み Laravel | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| PHP SDK サービスモード | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |

全モードで、アプリ境界の Laravel コンストラクター注入を使えます。安定版 v1 はアクティビティ依存を `execute()` に注入します。組み込み v2 とサービスモードは、Laravel コンテナがワークフロー・アクティビティを構築するため通常のコンストラクターを使います。リプレイされるワークフローが読むものは決定的で設定に基づくものに保ち、DB、ネットワーク、時計などの副作用はアクティビティに置きます。

### 安定版 v1 Laravel {#stable-v1-laravel}

[安定版 v1 のインストール](/docs/1.x/installation/)と実際のキュードライバー要件を維持します。この代表例は、コンストラクター注入の開始アクションと、メソッド注入のアクティビティサービスを使います。

<!-- docs-example id="laravel.adoption.v1.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;
use Workflow\Activity;
use Workflow\Workflow;
use Workflow\WorkflowOptions;
use Workflow\WorkflowStub;
use function Workflow\activity;

final class FulfillOrderWorkflow extends Workflow
{
    public function execute(string $orderId): \Generator
    {
        return yield activity(ReserveInventoryActivity::class, $orderId);
    }
}

final class ReserveInventoryActivity extends Activity
{
    public function execute(
        OrderPolicy $orders,
        InventoryGateway $inventory,
        LoggerInterface $logger,
        Dispatcher $events,
        string $orderId,
    ): array {
        $orders->assertFulfillable($orderId);
        $reservation = $inventory->reserve($orderId);
        $logger->info('Inventory reserved', ['order_id' => $orderId]);
        $events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}

final class StartOrderFulfillment
{
    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public function start(string $orderId): void
    {
        $workflow = WorkflowStub::make(FulfillOrderWorkflow::class);
        $workflow->start($orderId, new WorkflowOptions('redis', 'orders'));
        $this->logger->info('Order workflow started', ['order_id' => $orderId]);
    }
}
```

`config/queue.php` と環境が実際の Laravel キュー接続を選びます。設定キュー向け Worker を実行します。

<!-- docs-example id="laravel.adoption.v1.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

安定版 fake は、本番と同じ注入済みアプリケーションアクションを実行します。

<!-- docs-example id="laravel.adoption.v1.fake" -->
```php
<?php

use Workflow\WorkflowStub;

WorkflowStub::fake();
WorkflowStub::mock(ReserveInventoryActivity::class, ['status' => 'reserved']);

app(StartOrderFulfillment::class)->start('1001');

WorkflowStub::assertDispatched(
    ReserveInventoryActivity::class,
    fn (string $orderId): bool => $orderId === '1001',
);
```

実アクティビティのテストでは Laravel イベント検証を使えます。アプリの別箇所に v2 SDK を追加しただけで v1 Worker を置き換えないでください。

### 2.0 組み込み Laravel {#20-embedded-laravel}

安定版インストールは組み込みクイックスタートと同じ Workflow パッケージです。

<!-- docs-example id="laravel.adoption.v2-embedded.install" -->
```bash
composer require %%artifact.workflowComposerPackage%%
```

`config/workflows.php` を公開・更新し、同じビジネス契約に安定した別名を付けます。公開ファイルには他の必須 v1/v2 設定もあるため、この抜粋で全体を置き換えず既存配列にマージします。

<!-- docs-example id="laravel.adoption.v2-embedded.config" -->
```php
<?php

return [
    'v2' => [
        'namespace' => env('DW_V2_NAMESPACE', 'production'),
        'types' => [
            'workflows' => [
                'orders.fulfill' => App\Workflows\FulfillOrderWorkflow::class,
            ],
            'activities' => [
                'orders.reserve' => App\Activities\ReserveInventoryActivity::class,
            ],
        ],
    ],
];
```

記述 API は `handle()` に変わり、アクティビティ結果を yield しません。Laravel が両オブジェクトを構築します。副作用を表すログ・ビジネスイベントは引き続きアクティビティに置きます。

<!-- docs-example id="laravel.adoption.v2-embedded.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;
use Workflow\V2\Activity;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\activity;

final class FulfillOrderWorkflow extends Workflow
{
    public ?string $connection = 'redis';
    public ?string $queue = 'orders';

    public function __construct(private readonly OrderPolicy $orders)
    {
    }

    public function handle(string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);

        return activity(ReserveInventoryActivity::class, $orderId);
    }
}

final class ReserveInventoryActivity extends Activity
{
    public ?string $connection = 'redis';
    public ?string $queue = 'orders';

    public function __construct(
        private readonly OrderPolicy $orders,
        private readonly InventoryGateway $inventory,
        private readonly LoggerInterface $logger,
        private readonly Dispatcher $events,
    ) {
    }

    public function handle(string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);
        $reservation = $this->inventory->reserve($orderId);
        $this->logger->info('Inventory reserved', ['order_id' => $orderId]);
        $this->events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}

final class StartOrderFulfillment
{
    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public function start(string $orderId): void
    {
        WorkflowStub::make(FulfillOrderWorkflow::class, "order-{$orderId}")
            ->start($orderId);
        $this->logger->info('Order workflow started', ['order_id' => $orderId]);
    }
}
```

組み込みデプロイに必要な Laravel キュー Worker を実行します。

<!-- docs-example id="laravel.adoption.v2-embedded.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

同じアプリケーションアクションから組み込み fake を使います。準備済みタスクをインライン実行し、アクティビティ配送を記録します。

<!-- docs-example id="laravel.adoption.v2-embedded.fake" -->
```php
<?php

use Workflow\V2\WorkflowStub;

WorkflowStub::fake();
WorkflowStub::mock(ReserveInventoryActivity::class, ['status' => 'reserved']);

app(StartOrderFulfillment::class)->start('1001');
while (WorkflowStub::runReadyTasks() > 0) {
}

WorkflowStub::assertDispatched(
    ReserveInventoryActivity::class,
    fn (string $orderId): bool => $orderId === '1001',
);
```

この fake は組み込みの永続行と履歴を検証します。SDK クライアント fake ではなく、サービスランタイムの代替ではありません。

### Laravel 内の PHP SDK サービスモード {#php-sdk-service-mode-in-laravel}

独立公開の SDK パッケージをインストールします。このコマンドは特定のポイントリリースを転記せず、公開 PHP SDK 成果物の規範から描画します。

<!-- docs-example id="laravel.adoption.service.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

Laravel 9～13 は provider を自動検出します。設定を公開し、属性付きハンドラークラスを列挙します。

<!-- docs-example id="laravel.adoption.service.config" -->
```php
<?php

return [
    'runtime_url' => env('DURABLE_WORKFLOW_RUNTIME_URL', 'http://localhost:8080'),
    'namespace' => env('DURABLE_WORKFLOW_NAMESPACE', 'production'),
    'task_queue' => env('DURABLE_WORKFLOW_TASK_QUEUE', 'orders'),
    'handlers' => [
        App\Workflows\FulfillOrderWorkflow::class,
        App\Activities\ReserveInventoryActivity::class,
    ],
    'poll_timeout_seconds' => 5,
];
```

サービスワークフローは組み込み v2 と同じ公開文字列を使います。Laravel コンテナが両方の属性付きクラスを構築します。

<!-- docs-example id="laravel.adoption.service.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use DurableWorkflow\Attribute\Activity;
use DurableWorkflow\Attribute\Workflow;
use DurableWorkflow\Worker\ActivityContext;
use DurableWorkflow\Worker\WorkflowContext;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;

final class FulfillOrderWorkflow
{
    public function __construct(private readonly OrderPolicy $orders)
    {
    }

    #[Workflow('orders.fulfill')]
    public function run(WorkflowContext $context, string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);

        return $context->activity('orders.reserve', [$orderId]);
    }
}

final class ReserveInventoryActivity
{
    public function __construct(
        private readonly OrderPolicy $orders,
        private readonly InventoryGateway $inventory,
        private readonly LoggerInterface $logger,
        private readonly Dispatcher $events,
    ) {
    }

    #[Activity('orders.reserve')]
    public function run(ActivityContext $context, string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);
        $reservation = $this->inventory->reserve($orderId);
        $this->logger->info('Inventory reserved', ['order_id' => $orderId]);
        $this->events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}
```

アプリコードは、ファサード越しに内部へ触れたり転送クライアントを組み立てたりせず、Laravel ネイティブの SDK インターフェースを注入します。属性付きクラスが型を、公開設定が既定キューを供給します。

<!-- docs-example id="laravel.adoption.service.client" -->
```php
<?php

use DurableWorkflow\Bridge\Laravel\LaravelWorkflowClientInterface;
use DurableWorkflow\WorkflowHandleInterface;

final class StartOrderFulfillment
{
    public function __construct(
        private readonly LaravelWorkflowClientInterface $workflows,
    ) {
    }

    public function start(string $orderId): WorkflowHandleInterface
    {
        return $this->workflows->start(
            FulfillOrderWorkflow::class,
            [$orderId],
            workflowId: "order-{$orderId}",
        );
    }

    public function handle(string $orderId): WorkflowHandleInterface
    {
        return $this->workflows->handle(
            FulfillOrderWorkflow::class,
            "order-{$orderId}",
        );
    }
}
```

設定公開後、秘密でない設定だけをキャッシュします。`RUNTIME_URL` は、プロビジョニング済み Cloud 名前空間ランタイムの完全 URI、またはセルフホスト Server オリジンにします。`/api` を追加しないでください。

Worker ロールの認証情報だけを与えて開始します。

<!-- docs-example id="laravel.adoption.service.worker" -->
```bash
php artisan vendor:publish --tag=durable-workflow-config
env -u DURABLE_WORKFLOW_TOKEN \
  -u DURABLE_WORKFLOW_CLIENT_TOKEN \
  -u DURABLE_WORKFLOW_WORKER_TOKEN \
  DURABLE_WORKFLOW_RUNTIME_URL="$RUNTIME_URL" \
  DURABLE_WORKFLOW_NAMESPACE=production \
  DURABLE_WORKFLOW_TASK_QUEUE=orders \
  php artisan config:cache
env -u DURABLE_WORKFLOW_CLIENT_TOKEN \
  DURABLE_WORKFLOW_WORKER_TOKEN="$WORKER_SECRET" \
  php artisan durable-workflow:worker
```

`--queue` 上書きなしでは、Artisan Worker は設定済み `orders` タスクキューをポーリングします。通常ポーリング前の登録・ポーリング診断は、ランタイム、名前空間、キュー、属性付きワークフロー・アクティビティ型、Worker 認証情報ロールを示します。

アプリ・web・キュープロセスには代わりに `DURABLE_WORKFLOW_CLIENT_TOKEN` を渡し、Worker トークンを渡しません。セルフホストでは、意図的に両ロールを許可する一つの認証情報として `DURABLE_WORKFLOW_TOKEN` を使えます。

SDK Worker はライフサイクル、リトライ、ハンドラー失敗、終了の診断を Laravel PSR logger に書き、Laravel イベントで `DurableWorkflow\Bridge\Event\WorkerDiagnosticEvent` を配送します。ビジネスアクティビティは上記の注入済み logger・event dispatcher を使い続けられます。

同梱のファサード fake は、アプリコードと同じ注入インターフェースを置き換えます。

<!-- docs-example id="laravel.adoption.service.fake" -->
```php
<?php

use DurableWorkflow\Bridge\Laravel\Facades\DurableWorkflow;

$workflows = DurableWorkflow::fake()
    ->setWorkflowResult('order-1001', ['status' => 'fulfilled']);

app(StartOrderFulfillment::class)->start('1001');
$result = app(StartOrderFulfillment::class)->handle('1001')->result();

$this->assertSame(['status' => 'fulfilled'], $result);
$workflows->assertWorkflowStarted(
    FulfillOrderWorkflow::class,
    ['1001'],
    workflowId: 'order-1001',
);
$workflows->assertResultRequested('order-1001');
```

Cloud・Server なしで Laravel アプリのやり取りを検証します。ハンドラーコマンドのテストには SDK の Worker テストハーネスを使います。クライアント fake はリモート Worker コードを実行しません。

## ドレイン、切り替え、ロールバック {#drain-cut-over-and-roll-back}

Composer 要件の変更では、処理中ワークフロー、履歴、遅延タイマー、リトライ、準備済み・予約済みキュージョブは移動しません。移行中は新旧を別々の永続システムとして扱います。

### 1. 復旧時点を確立する {#1-establish-the-recovery-cut}

トラフィック変更前に次を行います。

- v1・組み込み DB 接続、全ワークフロー・アクティビティキュー、バックエンドのアカウント・リージョン・接頭辞、キャッシュロック、元の `APP_KEY` の秘密管理参照を記録します。
- 新規開始とメッセージ入口を止めて静止させます。全 Worker は現在のジョブ境界後に停止します。監督プロセスが即再起動する場合、`queue:restart` だけでは静止しません。
- 全実行をドレインするか、SQL と全準備済み・遅延・予約済みキュージョブを含むアプリ整合的な復旧時点を捕捉します。DB バックアップだけではキュー依存のタイマー、リトライ、アクティビティを再作成できません。
- 各非終端ワークフロー ID の所有ランタイムを記録します。シグナル、クエリ、更新、キャンセル、強制終了、修復、結果読み取りはその記録に従います。

### 2. 経路別ルールを適用する {#2-apply-the-path-specific-rule}

| 移行 | 既存の非終端実行 | 切り替え後の新規実行 | ロールバック境界 |
| --- | --- | --- | --- |
| v1 → 2.0 組み込み | v1 互換経路で完了。終端まで v1 テーブル、PHP デコード要件、Laravel キュー消費側と状態を保持。 | v2 カナリア成功後に `Workflow\V2\WorkflowStub` で開始。 | 対応する v1 SQL・キューの同じ復旧時点と正確なアプリ設定を復元するか前進修正。新しいキュー状態の上に古い SQL を戻さない。 |
| v1 → Cloud・セルフホストのサービスモード | v1 に残す。v1 履歴はサービスへインポート・リモート Worker でリプレイできない。 | 登録済み SDK Worker が期待型キーを通知した後、`LaravelWorkflowClientInterface` で開始。 | v1 が正常な場合だけ新規開始を戻す。サービスで受理済みの実行はそこに残す。 |
| 組み込み v2 → Cloud | 元の場所でドレイン。Cloud 導入やパッケージ変更は履歴インポートにならない。 | クライアント・Worker 認証情報とキュー確認後、Cloud 名前空間で開始。 | 必要なら新規開始を組み込みに戻すが、Cloud 受理済み実行へのコマンドは Cloud に送る。 |
| 組み込み v2 → セルフホスト Server | 元の場所でドレインするか、適格で静止済み v2 実行に対し、対応するエクスポート、dry-run、原子的インポートを別途行う。インストールだけから適格性を推測しない。 | Server 検出、名前空間、登録、キュー確認後に SDK で開始。 | インポート失敗は部分実行を書かない。コミット後は Server が所有し、組み込みのコピーを再開しない。 |

セルフホストのインポートには、完全な[組み込みから Server への移行手順](/docs/polyglot/embedded-to-server/#phase-e-import-eligible-embedded-v2-runs)を使います。v1、墨消し済み履歴、リース中タスク、実行中アクティビティ試行など危険なスナップショットを拒否します。履歴エクスポート単独は監査・デバッグデータです。明示的に検証されるインポート操作だけが Server 所有状態を作ります。

### 3. 切り替え前に移行先を実証する {#3-prove-the-destination-before-switching-traffic}

1. 一つの名前空間、タスクキュー、安定した型集合を設定。
2. 旧ランタイムの隣で移行先と SDK Worker を開始。
3. Server 検出または Cloud プロビジョニング、ロール認証情報、登録、通知型キー、キュー可視性、Laravel 診断を検証。
4. 一意に識別するシャドー・カナリア注文を送り、移行先の運用画面で終端結果を待つ。
5. ワークフロー系統ごとに新規開始を切り替え、同じビジネスキーを両ランタイムで開始しない。
6. 全ソース実行が終端か、対応セルフホストインポートを完了するまで、元の Worker、キュー状態、認証情報、ログ・イベント、運用画面を維持。

旧パッケージ、キュー、テーブル、秘密、Waterline の廃止は最後の手順であり、切り替えの仕組みではありません。

## 選んだ経路へ進む {#continue-with-the-chosen-path}

- [安定版 v1 のインストール](/docs/1.x/installation/)
- [安定版 v1 の移行計画](/docs/migration/)
- [2.0 組み込みのインストール](/docs/installation/)
- [v1 から v2 への詳細なパッケージ移行](/docs/migration/)
- [PHP SDK サービスモード](/docs/polyglot/php/)
- [Cloud マネージドランタイム](/docs/polyglot/cloud-control-plane/)
- [セルフホスト Server](/docs/polyglot/server/)
- [組み込み v2 からセルフホスト Server](/docs/polyglot/embedded-to-server/)
