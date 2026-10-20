---
sidebar_position: 4.5
title: カスタマイズ一覧
description: Durable Workflow v2 のモデル上書き、シリアライザー設定、可観測性リポジトリの置換、ヘルス、インポート、マイグレーション、書き込み動作について確定したサポート一覧。
---

# カスタマイズ一覧 {#customization-matrix}

このページは、サポートする Durable Workflow v2 のカスタマイズ契約を確定します。v2 永続モデルの接続先変更、モデルサブクラスの差し替え、PHP の運用可観測性リポジトリの置換、移行中に古いシリアライザー設定が有効かどうかの判断に使ってください。

## サポートする上書きの一覧 {#supported-override-matrix}

| 対象 | サポートする契約 | 補足 |
| --- | --- | --- |
| ベース名 `WorkflowInstance` を維持するスキーマ互換サブクラスによる `workflows.v2.instance_model` | サポート | 接続、キャスト、アプリの名前空間だけを変更する場合に使います。継承したリレーションはパッケージの外部キー `workflow_instance_id` の契約を維持します。 |
| テーブルやベース名を変更するサブクラスによる `workflows.v2.instance_model` | リレーションを明示的に上書きすればサポート | `runs()`、`commands()`、`updates()` が `workflow_instance_id` を維持するよう上書きします。起動時に検証され、キーを変更する継承リレーションの推論は拒否されます。`currentRun()` は既に `current_run_id` を明示しており、上書きは不要です。 |
| その他の `workflows.v2.*_model` の上書き（`run_model`、`task_model`、`history_event_model`、投影、スケジュール、アクティビティ行、失敗、メッセージ、メモ、検索属性、子呼び出し） | スキーマ互換サブクラスをサポート | パッケージの列名、主キー、外部キーを維持します。リレーションは使用するキーを既に固定しているため、スキーマが互換ならテーブルを変更したサブクラスでも継承したリレーションメソッドを使えます。 |
| 独自のテーブル名と独自の外部キー列名の併用 | 非サポート | v2 ランタイムと運用機能はパッケージの列名とキー名を前提とします。変更するとサポート契約の範囲外になります。 |
| `OperatorObservabilityRepository` の置換 | コンテナバインディングでサポート | 実装を `Workflow\V2\Contracts\OperatorObservabilityRepository` にバインドします。これは Waterline と `WorkflowStub::historyExport()` の PHP ランタイム統合契約であり、安定した言語間 API ではありません。リポジトリはパッケージのモデルオブジェクトを受け取ります。 |
| `serializer` | `avro` と旧バージョンの完了待ち・インポート用コーデックのみサポート | 新しい v2 実行は常に Avro の意味論を使います。`workflow-serializer-y` と `workflow-serializer-base64` は PHP ネイティブのデコードが必要な v1 履歴の完了やインポートにのみ有効です。v1 のカスタムシリアライザークラスは v2 ではサポートしません。 |
| ヘルスと doctor 診断 | サポート | `php artisan workflow:v2:doctor` と Waterline v2 のヘルス・統計は設定したモデルクラスを反映し、古いシリアライザー設定を移行の残作業として示します。 |
| 既定以外の接続でのパッケージマイグレーション | 公開したマイグレーションでサポート | 自動読み込みされるマイグレーションは Laravel の既定の接続で実行されます。永続モデルで別の接続を使う場合はマイグレーションを公開し、`$connection` を明示します。 |
| 書き込み側のコアランタイム（`WorkflowStub::make()`、`load()`、タスク作成、現在の実行の解決） | 設定済み永続モデル経由でサポート | 設定した `instance_model`、`run_model`、`task_model` が使われます。書き込み先テーブルはパッケージの列とキーに対してスキーマ互換を維持してください。 |

## v2 モデルキーの一覧 {#exact-v2-model-keys}

公開される `workflows.php` 設定は、`workflows.v2` に次の永続モデルキーを提供します。

- `instance_model`
- `run_model`
- `history_event_model`
- `task_model`
- `command_model`
- `link_model`
- `activity_execution_model`
- `activity_attempt_model`
- `timer_model`
- `failure_model`
- `run_summary_model`
- `run_wait_model`
- `run_timeline_entry_model`
- `run_timer_entry_model`
- `run_lineage_entry_model`
- `schedule_model`
- `schedule_history_event_model`

これらのキーにはパッケージモデルのサブクラスを使います。本ドキュメントで別途指定されていない限り、パッケージの列名と外部キーを維持してください。

## インスタンスモデルの上書きルール {#instance-model-override-rule}

現在の v2 でリレーションの追加作業が必要なのは、`workflows.v2.instance_model` のサブクラスが推論される外部キーを `workflow_instance_id` 以外に変更する場合だけです。

一般的な安全な例:

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

final class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'workflow';
}
```

サブクラスのベース名が `WorkflowInstance` のままなので、Eloquent が推論する外部キーは変わらず、継承したリレーションの整合性も保たれます。

異なるベース名や、テーブルを変更したストレージモデルを使う場合は、影響するリレーションを明示的に上書きします。

```php
namespace App\Workflow\Storage;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Workflow\V2\Models\WorkflowCommand;
use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Models\WorkflowUpdate;
use Workflow\V2\Support\ConfiguredV2Models;

final class TenantWorkflowInstance extends BaseWorkflowInstance
{
    protected $table = 'tenant_workflow_instances';

    public function runs(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('run_model', WorkflowRun::class),
            'workflow_instance_id',
        );
    }

    public function commands(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('command_model', WorkflowCommand::class),
            'workflow_instance_id',
        )->oldest('created_at');
    }

    public function updates(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('update_model', WorkflowUpdate::class),
            'workflow_instance_id',
        )
            ->orderBy('command_sequence')
            ->oldest('accepted_at')
            ->oldest('created_at')
            ->oldest('id');
    }
}
```

上書きがない場合、`tenant_workflow_instance_id` や `custom_workflow_instance_id` などの推論キーをアプリが使い始めるのではなく、パッケージは起動時に直ちに失敗します。

## シリアライザー、インポート、ヘルスのルール {#serializer-import-and-health-rules}

- 新しい v2 処理には `serializer = 'avro'` を維持します。
- 旧コーデックは PHP ネイティブのペイロードデコードが必要な v1 履歴の完了待ちやインポート中にのみ使います。
- v2 に削除済みの v1 カスタムシリアライザークラスを指定しないでください。
- アップグレードや設定変更後は `php artisan workflow:v2:doctor` を実行します。旧シリアライザー設定やその他の起動準備の問題を検出する診断機能です。
- Waterline v2 のヘルスと統計は、同じ永続モデル設定を運用者に示す画面として扱います。

## マイグレーションと書き込み側のルール {#migration-and-write-side-rules}

- 通常は既定の接続で自動読み込みされたパッケージマイグレーションを使います。
- 永続モデルで別の接続を使う場合は、マイグレーションを公開して `$connection` を設定し、`php artisan migrate` が設定したモデルサブクラスと同じデータベースを対象にするようにします。
- ランタイムの書き込み経路に関わる各モデルでは、パッケージのテーブル名、主キー、外部キーを維持します。
- このカスタマイズは読み取りだけに限りません。開始、読み込み、現在の実行の解決、タスク実行のすべてが設定済みの永続モデルを使います。

## 関連ガイド {#related-guides}

- [設定の公開](./publishing-config.md)
- [データベース接続](./database-connection.md)
- [移行ガイド](../migration.md)
- [監視](../monitoring.md)
