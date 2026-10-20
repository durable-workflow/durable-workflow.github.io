---
sidebar_position: 4
---

# データベース接続 {#database-connection}

ワークフロー v2 の永続モデルが使うデータベース接続をカスタマイズする手順を説明します。これは Laravel アプリケーションの既定の接続と異なる接続を使う場合に*のみ*必要です。

テーブルを変更するサブクラス、シリアライザーのルール、リポジトリの置換、ヘルス診断、マイグレーションの要件を含む v2 の完全なオーバーライド契約は、[カスタマイズ一覧](./customization-matrix.md)を参照してください。

1. アプリのモデルディレクトリに、v2 の基底モデルクラスを継承するクラスを作成します。
2. 各クラスで目的の `$connection` を設定します。
3. ワークフローの設定ファイルを公開します。
4. `workflows.v2` のモデルバインディングをカスタムクラスに変更します。

## v2 ワークフローモデルの拡張 {#extending-v2-workflow-models}

`app\Models\V2\WorkflowInstance.php` に次を記述します。

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'mysql';
}
```

接続先を変更する各 v2 永続モデルに同じパターンを適用します。最低限、次が対象です。

- `Workflow\V2\Models\WorkflowRun`
- `Workflow\V2\Models\WorkflowHistoryEvent`
- `Workflow\V2\Models\WorkflowTask`
- `Workflow\V2\Models\WorkflowCommand`
- `Workflow\V2\Models\WorkflowLink`
- `Workflow\V2\Models\ActivityExecution`
- `Workflow\V2\Models\ActivityAttempt`
- `Workflow\V2\Models\WorkflowTimer`
- `Workflow\V2\Models\WorkflowFailure`
- `Workflow\V2\Models\WorkflowRunSummary`
- `Workflow\V2\Models\WorkflowSchedule`
- `Workflow\V2\Models\WorkflowScheduleHistoryEvent`

各サブクラスで `protected $connection = 'mysql';` を宣言します。`config/database.php` で定義した別の接続名でも構いません。

## カスタムモデルの登録 {#registering-custom-models}

ワークフローの設定ファイルを公開し、`workflows.v2.*_model` のバインディングをカスタムクラスに変更します。

```php
// config/workflows.php

'v2' => [
    'instance_model' => App\Models\V2\WorkflowInstance::class,
    'run_model' => App\Models\V2\WorkflowRun::class,
    'history_event_model' => App\Models\V2\WorkflowHistoryEvent::class,
    'task_model' => App\Models\V2\WorkflowTask::class,
    'command_model' => App\Models\V2\WorkflowCommand::class,
    // ...
],
```

パッケージは `Workflow\V2\Support\ConfiguredV2Models` を通してモデルを解決するため、v2 モデルを参照するリレーションやクエリには、設定した接続が透過的に適用されます。

スキーマ互換のサブクラスの範囲を超えて、カスタム `instance_model` の推論される外部キーを変更する場合、パッケージは起動時に `runs()`、`commands()`、`updates()` のリレーションが明示的にオーバーライドされていることを検証します。

## マイグレーション {#migrations}

ワークフローのマイグレーションはパッケージから自動読み込みされ（`WorkflowServiceProvider::loadMigrationsFrom`）、既定のデータベース接続で実行されます。v2 テーブルで別の接続を使う場合は、`php artisan vendor:publish --tag=migrations` でマイグレーションを公開し、公開された各マイグレーションクラスに `protected $connection = 'mysql';` を設定してください。これにより `php artisan migrate` が正しいデータベースで実行します。
