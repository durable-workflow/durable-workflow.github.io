---
sidebar_position: 4
---

# データベース接続 {#database-connection}

Workflow は、永続ストレージ用に別の接続を選択しない限り、Laravel アプリケーションのデフォルトのデータベース接続を使用します。

`config/database.php` で定義した接続をワークフローのストレージに使用するには、環境変数にその接続名を設定します。

```dotenv
DW_STORAGE_CONNECTION=workflows
```

Workflow のモデル、トランザクション、行ロック、コミット後のコールバックはこの接続を使用します。すべての永続ワークフローテーブルに同じ Laravel 接続を使用してください。キューのトランスポートは Laravel のキュー設定で別に構成します。

以下に示すカスタムモデルクラスでも接続を選択できます。設定済みの V2 `run_model` は、モデルに明示的な接続がない V2 メタデータのストレージ接続を提供します。モデルで明示的に指定する接続は、それと一致させてください。`DW_STORAGE_CONNECTION` はモデルの接続プロパティより優先されます。

テーブルを変更するサブクラス、シリアライザーのルール、リポジトリの置換、ヘルス診断、マイグレーションの要件を含む v2 の完全なオーバーライド契約は、[カスタマイズ一覧](./customization-matrix.md)を参照してください。

## カスタムモデルの接続 {#custom-model-connections}

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

Workflow のマイグレーションはパッケージから自動的に読み込まれ、`DW_STORAGE_CONNECTION` に従います。アプリケーションのマイグレーションは、それぞれに設定された接続を引き続き使用します。

`DW_STORAGE_CONNECTION` を使わずにカスタムモデルの接続を使用する場合は、対応する公開済みワークフローマイグレーションにも同じ `$connection` を設定します。それらのワークフローマイグレーションだけを実行する場合は、Laravel の `--database` オプションでも対象を選べます。アプリケーションのマイグレーションはアプリケーション用の接続で実行してください。

## トランザクションの境界 {#transaction-boundaries}

アプリケーションのデータとワークフローのストレージが同じ Laravel 接続を使用する場合、トランザクション内で開始したワークフローはそのトランザクションに参加します。ロールバックすると、その中で行ったワークフローの書き込みも取り消されます。エンジンは、ストレージの最も外側のトランザクションがコミットされた後にワークフロータスクをキューへ発行し、ライフサイクルイベントを送信します。ロールバックされた場合、これらのコールバックは破棄されます。

たとえば、`DW_STORAGE_CONNECTION=workflows` を設定した場合は次のようになります。

```php
use App\Workflows\OrderWorkflow;
use Illuminate\Support\Facades\DB;
use Workflow\V2\WorkflowStub;

DB::connection('workflows')->transaction(function () {
    WorkflowStub::make(OrderWorkflow::class, 'order-123')->start('order-123');
});
```

この開始処理とアトミックにコミットする必要があるアプリケーションモデルの変更も、`workflows` 接続を使用する必要があります。

異なる Laravel 接続のトランザクションは、接続名が同じ物理データベースを指していても、それぞれ独立してコミットされます。アプリケーションのデフォルト接続のトランザクションでは、別のストレージ接続ですでにコミットされたワークフローをロールバックできません。アトミックに扱う必要がある変更は同じ接続にまとめ、その接続のトランザクションに含めてください。

コミット後の発行はワークフローストレージの境界を保護します。キューに別のデータベースやメッセージブローカーを使用する場合、そのトランザクションと配信の動作は独立しています。
