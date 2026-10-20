---
sidebar_position: 4
---

# データの受け渡し {#passing-data}

`start()` メソッドでワークフローにデータを渡せます。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start('world');
```

引数はワークフローの `handle()` に渡されます。

同様に `activity()` ヘルパーでアクティビティにデータを渡せます。

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle($name)
    {
        return activity(MyActivity::class, $name);
    }
}
```

引数はアクティビティの `handle()` に渡されます。

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle($name)
    {
        return "Hello, {$name}!";
    }
}
```

import PassingDataSimulator from '@site/src/components/PassingDataSimulator';

<PassingDataSimulator />

通常、この方法で渡すデータは少量にしてください。大量のデータはデータベース、キャッシュ、ファイルシステムに書き込み、そのキーやファイルパスを渡します。アクティビティはそのキーやパスからデータを読み取れます。

文書、メディア、シリアライズされたエクスポートなどの大容量バイト列を履歴経由で渡す必要がある場合は、名前空間の[外部ペイロードストレージ](../features/external-payload-storage.md)を有効にします。ランタイムはしきい値を超えたペイロードを設定済みオブジェクトストアへ移し、検証可能な参照エンベロープを履歴に記録します。これによりリプレイの完全性を保ち、[`payload_size_bytes` の構造上の制限](../constraints/structural-limits.md#payload-size)内に収めます。

## 出力 {#output}

ワークフロー完了後は `output()` で出力を取得できます。

```php
$workflow->output();
=> 'Hello, world!'
```

## モデル {#models}

モデルの受け渡しは `SerializesModels` と同様に動作します。

```php
use App\Models\User;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(User $user)
    {
        return activity(MyActivity::class, $user->name);
    }
}
```

Eloquent モデルをワークフローやアクティビティに渡すと、`ModelIdentifier` だけがシリアライズされます。ペイロードを小さくし、効率と性能を維持します。

```
object(ModelIdentifier) {
    id: 42,
    class: "App\Models\User",
    relations: [],
    connection: "mysql"
}
```

ワークフローやアクティビティの実行時に、読み込み済みリレーションを含む完全なモデルインスタンスをデータベースから取得します。実行中の追加のデータベース呼び出しを避けたい場合は、渡す前にモデルを配列に変換することを検討してください。

## 依存性の注入 {#dependency-injection}

データを渡すだけでなく、`handle()` メソッドに依存関係の型を指定できます。Laravel のサービスコンテナが自動で注入します。

```php
use Illuminate\Contracts\Foundation\Application;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(Application $app)
    {
        if ($app->runningInConsole()) {
            // ...
        }
    }
}
```

依存性の注入によって決定性の要件が緩むことはありません。Laravel のアプリケーションコンテナや設定リーダーのような安定したサービスの型は指定できますが、処理を行う依存関係には適切な永続化の境界が必要です。外部 I/O、データベースアクセス、サービス呼び出し、失敗やリトライの可能性がある処理は `activity(...)` または `localActivity(...)` 内に置いてください。`sideEffect()` は実時計の読み取り、乱数、判断時の設定値など、履歴に固定すべき1回限りの安全にリプレイできる値のスナップショットにのみ使います。
