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

V2 のペイロードはポータブルな値形式を使うため、Eloquent モデルをワークフローやアクティビティの引数・結果にすることはできません。モデルのキーを渡し、そのモデルを使うアクティビティの中でモデルを読み込んでください。

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(int $userId)
    {
        return activity(MyActivity::class, $userId);
    }
}
```

```php
use App\Models\User;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(int $userId)
    {
        $user = User::findOrFail($userId);

        return "Hello, {$user->name}!";
    }
}
```

モデルはワークフローのコードではなくアクティビティで読み込んでください。ワークフローのコードはリプレイで再実行され、後のリプレイではデータベースクエリが別の行を返す可能性があります。

`start()` にモデルを渡すと `InvalidArgumentException` がスローされます。`activity()` にモデルを渡すと、ワークフローの実行が失敗します。どちらのエラーもモデルクラスを示します。

```
unsupported_value_type: Eloquent model App\Models\User cannot cross a V2 payload boundary. Pass its key and load the model inside the activity.
```

同じルールは Eloquent コレクションにも適用されます。代わりにキーの配列を渡してください。アクティビティが一部の属性だけを必要とする場合は、それらを配列として渡してください。

v1 では、ワークフローとアクティビティは `SerializesModels` を通じてモデルを受け取っていました。これはモデル識別子を保存し、ジョブの実行時にモデルを再読み込みする仕組みです。V2 はこれを行いません。

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

依存性の注入によって決定性の要件が緩むことはありません。Laravel のアプリケーションコンテナや設定リーダーのような安定したサービスの型は指定できますが、処理を行う依存関係には適切な永続化の境界が必要です。外部 I/O、データベースアクセス、サービス呼び出しなど、失敗する可能性がある処理やリトライすべき処理は `activity(...)` または `localActivity(...)` 内に置いてください。`sideEffect()` は実時計の読み取り、乱数、判断時の設定値など、履歴に固定すべき1回限りの安全にリプレイできる値のスナップショットにのみ使います。
