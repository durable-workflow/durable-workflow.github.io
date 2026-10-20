---
sidebar_position: 2
---

# オプション {#options}

ワークフローやアクティビティの定義には各種オプションがあります。失敗とするまでの試行回数、接続とキュー、許容する最大実行秒数などを指定できます。

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public ?string $connection = 'default';
    public ?string $queue = 'default';

    public int $tries = 3;

    public function backoff(): array
    {
        return [1, 2, 5, 10, 15, 30, 60, 120];
    }
}
```

`Workflow\V2\Workflow` と `Workflow\V2\Activity` の `$connection`、`$queue` は `public ?string` として宣言され、既定値は `null` です。PHP の公開プロパティ型の不変性ルールに従うため、サブクラスで再宣言するときも null 許容型を維持してください。値を固定せず、アプリの既定の接続やキューを継承するには `null` を使います。

アクティビティのタイムアウトはクラスプロパティでは設定しません。呼び出しごとの [`ActivityOptions`](#activityoptions)（`startToCloseTimeout` など）、またはスケジュール時のアクティビティリトライポリシーのスナップショットを使います。Worker ループのタイミング設定は[タスク修復ポリシー](/docs/polyglot/server-config-reference#workflow-package-controls)も参照してください。

## StartOptions {#startoptions}

`Workflow\V2\StartOptions` は開始時に可視化、重複排除、実行タイムアウトの設定を渡します。キューは選択しません。ルーティングはワークフローとアクティビティの `$connection`、`$queue`、および呼び出しごとの `ActivityOptions` が決めます。

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;
use Workflow\V2\Enums\DuplicateStartPolicy;

$workflow = WorkflowStub::make(MyWorkflow::class);

$workflow->start(
    'arg1',
    new StartOptions(
        duplicateStartPolicy: DuplicateStartPolicy::ReturnExistingActive,
        businessKey: 'order-12345',
        labels: ['tenant' => 'acme'],
        executionTimeoutSeconds: 3600,
    ),
);
```

`StartOptions` はエンジンが消費し、ワークフローの `handle()` 引数には渡しません。ワークフローとともに永続化され、その後のワークフローやアクティビティのディスパッチ（リプレイと continue-as-new を含む）に使われます。

## ActivityOptions {#activityoptions}

`Workflow\V2\Support\ActivityOptions` はアクティビティクラスを変更せずに、呼び出しごとのルーティング、リトライ、タイムアウトを上書きします。

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    ChargeCard::class,
    new ActivityOptions(
        connection: 'redis',
        queue: 'critical',
        maxAttempts: 5,
        startToCloseTimeout: 30,
    ),
    $orderId,
);
```

## 接続 {#connection}

`$connection` はワークフローやアクティビティを送るキュー接続を指定します。既定では未設定のため、既定の接続を使います。ワークフローやアクティビティクラスの `$connection` で上書きできます。

## キュー {#queue}

`$queue` はワークフローやアクティビティの追加先キューを指定します。既定では未設定のため、指定した接続の既定キューを使います。ワークフローやアクティビティクラスの `$queue` で上書きできます。

## リトライ {#retries}

`$tries` はアクティビティを失敗とするまでの総試行回数を制御します。既定は `1`（1回だけ試行し、自動リトライなし）です。リトライを許可するには `1` より大きくし、無期限にリトライするには `0` にします。`ActivityOptions::$maxAttempts` で呼び出しごとに上書きできます。

## タイムアウト {#timeout}

v2 の基底 `Activity` クラスに `$timeout` プロパティはありません。[`ActivityOptions`](#activityoptions) の `startToCloseTimeout`、`scheduleToStartTimeout`、`scheduleToCloseTimeout`、`heartbeatTimeout` で呼び出しごとに設定します。ランタイムはスケジュール時にリトライポリシーをアクティビティ実行へスナップショット化するため、後のデプロイでクラスやオプションが変わっても、スケジュール済み試行のタイムアウトは安定します。Worker ループのディスパッチタイミングは[タスク修復ポリシー](/docs/polyglot/server-config-reference#workflow-package-controls)で制御します。

## バックオフ {#backoff}

`backoff` メソッドは現在の試行に対応する整数の配列を返します。既定の待機間隔は指数的に長くなり、最大2分です。アクティビティクラスで `backoff` を実装すると上書きできます。

## 名前空間 {#namespace}

ワークフローを名前空間に限定して分離できます。設定した名前空間はコントロールプレーンの開始 API と `Workflow\V2\WorkflowStub::make()->start()` の両方に適用され、新しいインスタンス、実行、永続タスク、実行サマリー投影に保存されます。タスクのポーリングと Waterline の可視化フィルターで、結果を1つの名前空間に制限できます。両 PHP 開始 API で一貫して割り当てるには Workflow 2.4.2 以降を使ってください。

名前空間名に使えるのは英小文字、数字、ドット、アンダースコア、ハイフンだけです（`[a-z0-9._-]+` に一致、最大128文字）。

環境変数で既定の名前空間を設定します。

```env
DW_V2_NAMESPACE=production
```

または `config/workflows.php` に設定します。

```php
'v2' => [
    'namespace' => env('DW_V2_NAMESPACE'),
    // ...
],
```

明示した名前空間は設定の既定値を上書きします。スタブでは `make()` の第3引数に渡します。

```php
$workflow = \Workflow\V2\WorkflowStub::make(
    OrderProcessingWorkflow::class,
    'order-12345',
    'staging',
);
$workflow->start();
```

コントロールプレーンでは `start()` のオプションで指定します。

```php
$controlPlane->start('order-processing', 'order-12345', [
    'namespace' => 'staging',
    // ...
]);
```

設定にも明示的な指定にも名前空間がなければ、新しいインスタンスは `null` のままです。名前空間に限定した観測には、それらの実行は含まれません。設定を変更しても既存インスタンスは再割り当てされません。別の名前空間を通じた既存インスタンスの開始は拒否されます。

### Waterline の名前空間の限定 {#waterline-namespace-scoping}

複数の名前空間を持つ共有データベースに Waterline を配置する場合、`WATERLINE_NAMESPACE` で全一覧を1つの名前空間に制限します。

```env
WATERLINE_NAMESPACE=production
```

すべての可視化クエリに名前空間フィルターが入り、設定した名前空間のワークフローだけを表示します。全コマンド操作（キャンセル、シグナル、強制終了、更新、修復、アーカイブ、クエリ）も限定されます。別の名前空間のインスタンスや実行を対象とするコマンドは、実行されず 404 を返します。

### コマンドの名前空間の限定 {#command-namespace-scoping}

`WorkflowStub::load()`、`loadSelection()`、`loadRun()` は任意の `namespace` 引数を受け付けます。

```php
use Workflow\V2\WorkflowStub;

// Load only if the instance belongs to the given namespace
$stub = WorkflowStub::load('order-12345', namespace: 'production');

// Load a specific run, scoped to namespace
$stub = WorkflowStub::loadRun($runId, namespace: 'production');

// Load a specific selection, scoped to namespace
$stub = WorkflowStub::loadSelection('order-12345', $runId, namespace: 'production');
```

`namespace` が `null`（既定）の場合は後方互換性のため全名前空間から読み込みます。指定した場合はデータベースレベルでフィルターを適用し、その名前空間にワークフローがなければ `ModelNotFoundException` を投げます。

コントロールプレーンのコマンドメソッド（`signal`、`cancel`、`terminate`、`update`、`repair`、`archive`）もオプション配列に `namespace` を受け付けます。

```php
$controlPlane->cancel('order-12345', [
    'namespace' => 'production',
]);
```

### タスクブリッジの名前空間フィルター {#task-bridge-namespace-filtering}

ワークフローとアクティビティの両タスクブリッジは `poll()` に任意の `namespace` を受け付けます。

```php
$tasks = $bridge->poll('redis', 'default', limit: 10, namespace: 'production');
```

省略した場合、`poll()` は全名前空間のタスクを返します（名前空間導入前の環境との後方互換性を維持します）。

## 永続的な型エイリアス {#durable-type-aliases}

`workflows.v2.types` に登録すると、ワークフローとアクティビティの永続的な型キーが保存されます。失敗ペイロードでも同じパターンで例外クラスを扱えます。

```php
'v2' => [
    'types' => [
        'workflows' => [
            'billing.invoice-sync' => App\Workflows\InvoiceSyncWorkflow::class,
        ],
        'activities' => [
            'payments.capture' => App\Activities\CapturePaymentActivity::class,
        ],
        'exceptions' => [
            'billing.invoice-declined' => App\Exceptions\InvoiceDeclined::class,
        ],
        'exception_class_aliases' => [
            App\Exceptions\LegacyInvoiceDeclined::class => App\Exceptions\InvoiceDeclined::class,
        ],
    ],
],
```

アクティビティ、更新、子、ワークフローの失敗を例外エイリアス付きで記録すると、エンジンは型付き履歴に `exception_type`、失敗ペイロードに `type` として保存します。リプレイは記録済み PHP クラスにフォールバックする前にエイリアスを解決します。エイリアスが現在の throwable クラスを指していれば、後でクラスを移動しても `catch` の意味論を保てます。

例外エイリアス導入前に記録され、インポートされた v1 の失敗には、`workflows.v2.types.exception_class_aliases` で旧例外の完全修飾クラス名を現在の throwable クラスに対応付けられます。永続的な `exceptions` 型エイリアスが優先されます。クラスエイリアスマップは永続的な `type` を持たない記録済みペイロードのリファクタリング用です。新しいワークフローは、履歴を PHP クラス名から独立させるため永続的な例外型エイリアスを使ってください。

正式版 v2 は失敗記録時に永続的な例外エイリアスを書き込みます。後で throwable クラスを移動する可能性がある失敗を記録する前に、安定したエイリアスを設定してください。

リプレイする失敗を永続的な `exceptions` マップ、クラスエイリアスマップ、記録済みクラスで解決できない場合、エンジンはワークフロー内で汎用ランタイム例外にフォールバックしません。クエリのリプレイは `UnresolvedWorkflowFailureException` を投げ、Waterline は `exception_replay_blocked = true` を表示します。同じ問題に遭遇した Worker タスクは失敗したまま、実行は開いたままになります。名前を変更した過去の失敗を広い `catch (RuntimeException)` に頼って処理せず、マッピングを直して実行を修復してください。
