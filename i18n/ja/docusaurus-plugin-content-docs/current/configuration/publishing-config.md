---
sidebar_position: 1
---

# 設定の公開 {#publishing-config}

次のコマンドは `config` フォルダーに `workflows.php` 設定ファイルを作成します。

```bash
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="config"
```

## ワークフローフォルダーの変更 {#changing-workflows-folder}

既定では `make` コマンドは `app/Workflows` フォルダーに書き込みます。

```php
php artisan make:workflow MyWorkflow
php artisan make:activity MyActivity
```

`workflows_folder` 設定で変更できます。

```php
'workflows_folder' => 'Workflows',
```

## カスタムモデルの使用（旧 v1） {#using-custom-models-legacy-v1}

:::note 旧バージョン

`stored_workflow_*` キーは v1 の `Workflow\Models\StoredWorkflow*` クラスを設定します。Workflow v2 は後述する `instance_model`、`run_model`、`task_model` などの永続モデルの上書きを使います。v1 キーは移行中に v1 ワークフローをまだ実行している場合のみ残してください。

:::

公開された `workflows.php` で、v1 モデルクラスを独自のサブクラスに変更できます。

```php
'stored_workflow_model' => App\Models\StoredWorkflow::class,

'stored_workflow_exception_model' => App\Models\StoredWorkflowException::class,

'stored_workflow_log_model' => App\Models\StoredWorkflowLog::class,

'stored_workflow_signal_model' => App\Models\StoredWorkflowSignal::class,

'stored_workflow_timer_model' => App\Models\StoredWorkflowTimer::class,
```

## モデル上書きの使用（v2） {#using-model-overrides-v2}

ランタイムは永続インスタンス、実行、タスク、履歴、投影の各テーブルのモデル上書きも提供します。

```php
'v2' => [
    'instance_model' => App\Models\WorkflowInstance::class,
    'run_model' => App\Models\WorkflowRun::class,
    'task_model' => App\Models\WorkflowTask::class,
    'history_event_model' => App\Models\WorkflowHistoryEvent::class,
    'run_summary_model' => App\Models\WorkflowRunSummary::class,
    'run_wait_model' => App\Models\WorkflowRunWait::class,
    'run_timeline_entry_model' => App\Models\WorkflowTimelineEntry::class,
    'run_timer_entry_model' => App\Models\WorkflowRunTimerEntry::class,
    'run_lineage_entry_model' => App\Models\WorkflowRunLineageEntry::class,
],
```

上書きは読み取りや投影の再構築だけに限りません。`WorkflowStub::make()`、`load()`、`loadSelection()`、インスタンス予約、実行選択、ワークフロータスク実行はすべて設定済みの `instance_model`、`run_model`、`task_model` を使います。Waterline の詳細と履歴エクスポートも同じクラスで読み取ります。アプリレベルの1つの上書きが、コアランタイムの経路と運用者向けの読み取りの両方を制御します。

カスタムサブクラスは組み込みモデルとのスキーマ互換性を保ってください。テーブル名や、通常パッケージモデルが推論する Eloquent の規約も変更する場合は、影響するリレーションを上書きし、`currentRun()`、`runs()` などの参照を独自スキーマと一致させます。

[カスタマイズ一覧](./customization-matrix.md)には、継承したまま安全に使える上書き、明示的なリレーション上書きが必要なもの、シリアライザー、リポジトリ、ヘルス、インポート、マイグレーション、書き込み動作の関係を含む、確定した v2 サポート契約を示しています。

## ペイロードコーデック {#payload-codec}

v2 は新しいワークフローペイロードに `avro` を使います。

```php
'serializer' => 'avro',
```

- **`avro`**（既定、新しい v2 ワークフローに必須）: Apache Avro のバイナリエンコーディングです。通信と保存のサイズが小さく、大きなペイロードでは旧 PHP シリアライザーより高速にエンコード・デコードできます。

公開済みの v1 設定に `serializer` が残っている場合、正式版 v2 は `workflow:v2:doctor` 診断のために値を読みますが、新しい v2 ペイロードは Avro を使います。

### 旧コーデック（v1 移行専用） {#legacy-codecs-v1-migration-only}

移行中の v1 履歴の読み取りには、PHP 専用の2つのコーデックを引き続き使えます。

- `workflow-serializer-y`: バイトエスケープでエンコードする PHP `SerializableClosure`（v1 の既定）。
- `workflow-serializer-base64`: base64 でエンコードする PHP `SerializableClosure`。

`serializer` に旧コーデックを指定すると `php artisan workflow:v2:doctor` が指摘します。新しい v2 ワークフローは Avro を使います。旧設定は PHP ネイティブのペイロードデコードが必要な v1 実行を完了またはインポートする間だけ維持してください。

内部の v1 インポート・完了待ちリーダーは、旧完全修飾クラス名（`Workflow\Serializers\Y::class` など）を認識します。これらは公開 v2 コーデックエイリアスではなく、新しい v2 実行や SDK では選択できません。

## 互換性マーカー {#compatibility-markers}

ランタイムは新しい実行に互換性マーカーを付け、Worker は安全に実行できるマーカーを通知できます。これは、計画的な Worker ビルドの展開中に、長期間の実行を互換性のあるビルドに保つ実行時の制約です。

現在のビルドで新しい実行に付けるマーカーを設定します。

```env
DW_V2_CURRENT_COMPATIBILITY=build-2026-04
```

展開中に複数のマーカーを受け付けるよう、任意で Worker に指定できます。

```env
DW_V2_SUPPORTED_COMPATIBILITIES=build-2026-04,build-2026-03
```

データベースを使う Worker 群の表示で、各 Worker のハートビートスナップショットを表示する期間を調整します。

```env
DW_V2_COMPATIBILITY_HEARTBEAT_TTL=30
```

複数のアプリが同じワークフローデータベースを共有する場合、任意で Worker 群の表示を1つのアプリやデプロイ名前空間に限定します。

```env
DW_V2_COMPATIBILITY_NAMESPACE=sample-app
```

公開される `workflows.php` は、それらの値を次の設定に対応付けます。

```php
'v2' => [
    'compatibility' => [
        'current' => env('DW_V2_CURRENT_COMPATIBILITY'),
        'supported' => env('DW_V2_SUPPORTED_COMPATIBILITIES'),
        'namespace' => env('DW_V2_COMPATIBILITY_NAMESPACE'),
        'heartbeat_ttl_seconds' => (int) env('DW_V2_COMPATIBILITY_HEARTBEAT_TTL', 30),
    ],
],
```

`supported` を省略すると、Worker は `current` の1つだけを使います。タスク単位のマーカー導入前に作られた古いタスク行と実行サマリー行は、移行時に実行のマーカーで補完され、必要なら実行時の取得・復旧経路でも補完されます。どこにもマーカーを持たないタスクや実行は、引き続きどの Worker でも取得できます。

リプレイが、型付き `VersionMarkerRecorded` イベントのない新しい分岐点に達すると、`getVersion()` のフォールバックは開始時の `workflow_definition_fingerprint` を優先します。これにより、古い定義で開始したことが明確な同一互換性の実行は `DEFAULT_VERSION` 分岐を維持できます。フィンガープリント導入前の `WorkflowStarted` 履歴を持つ実行は、開始時の互換性マーカーと使用済みシーケンスの検査にフォールバックします。そのため、新しいバージョン付きコードを導入する展開では引き続き `DW_V2_CURRENT_COMPATIBILITY` を更新し、古い Worker 群の処理が完了するまで `DW_V2_SUPPORTED_COMPATIBILITIES` に新旧両方を一時的に指定してください。

各キュー Worker は `Looping` とタスク処理中に、データベースへ互換性ハートビートのスナップショットも記録します。Waterline と詳細ヘルパーは、ローカルビルドの表示（`compatibility_supported`、`compatibility_reason`）と Worker 群の表示（`compatibility_namespace`、`compatibility_supported_in_fleet`、`compatibility_fleet_reason`、`compatibility_fleet`）を提供します。`DW_V2_COMPATIBILITY_NAMESPACE` が設定されていると、データベースのハートビート行はその名前空間と一致する必要があります。各スナップショットは `worker_id`、キュー範囲、サポートするマーカー、`source = database` とともに自分の `namespace` を報告します。ローリングアップグレード中は、新しいテーブルを使うよう再起動していない Worker の旧キャッシュ形式も読みます。この旧行は名前空間設定下でも展開時のフォールバックとして表示されますが、該当 Worker が名前空間付きの経路に再起動するまでは `namespace = null` です。厳密な名前空間分離が完了するのは、全 Worker がデータベース方式へ再起動した後です。期限超過タスクの再ディスパッチや不足タスクの再作成といった転送レベルの復旧は、走査する Worker がそのタスクを実行できるかどうかには依存しません。最終的な取得段階だけが互換性で制限されます。

未完了タスクが存在しても、現在のビルドも有効な Worker ハートビートもそのマーカーを通知していない場合、誤った `repair_needed` を表示せず、互換 Worker 待ちとして表示し続けます。

## 履歴の規模の目安 {#history-budgets}

Waterline は実行サマリー投影から、選択した実行の型付き履歴の大きさを報告します。次のしきい値が、投影の `continue_as_new_recommended` を有効にするタイミングを制御します。

```env
DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD=10000
DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD=5242880
```

公開される `workflows.php` は、それらの値を次の設定に対応付けます。

```php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD', 10000),
        'continue_as_new_size_bytes_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD', 5242880),
    ],
],
```

しきい値を `0` にすると、その側の推奨判定を無効にします。このフラグは助言用です。選択実行の動作を変えずに、リプレイコストが増える前に `continueAsNew()` の境界を計画するために使います。

## 更新の待機ポリシー {#update-wait-policy}

`attemptUpdate()`、Webhook の更新ルート、Waterline の更新操作など、完了を待つ API は上限時間まで待機し、超えると受理済みの更新ライフサイクルを返します。既定の上限時間を次で設定します。

```env
DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS=10
DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS=50
```

公開される `workflows.php` は、それらの値を次の設定に対応付けます。

```php
'v2' => [
    'update_wait' => [
        'completion_timeout_seconds' => (int) env('DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS', 10),
        'poll_interval_milliseconds' => (int) env('DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS', 50),
    ],
],
```

`completion_timeout_seconds` は、`attemptUpdate*` と HTTP の完了待機が、無期限にブロックせず受理状態を返すまで、Worker 適用済み結果を待つ時間を制御します。`poll_interval_milliseconds` は待機中に呼び出し元が永続更新行を確認する頻度だけを調整し、Worker の実行順序やリプレイ動作は変えません。Waterline の運用メトリクスは修復ポリシーの隣に有効な `update_wait` を示し、設定ファイルを開かずに既定値を確認できます。

## 履歴エクスポートの秘匿化 {#history-export-redaction}

リプレイのデバッグやアーカイブの引き渡しに永続的な事実が必要なため、履歴エクスポートは意図的に保存済みのワークフロー、コマンド、アクティビティ、更新、タスク、失敗のデータを含みます。成果物が保護環境の外に出る可能性がある場合、エンドポイントや CLI 出力を広く公開する前に秘匿化処理を設定してください。

`Workflow\V2\Contracts\HistoryExportRedactor` を実装する秘匿化クラスを作成します。

```php
namespace App\Support;

use Workflow\V2\Contracts\HistoryExportRedactor;

final class WorkflowHistoryExportRedactor implements HistoryExportRedactor
{
    public function redact(mixed $value, array $context): mixed
    {
        return [
            'redacted' => true,
            'path' => $context['path'],
        ];
    }
}
```

次に `config/workflows.php` に登録します。

```php
'v2' => [
    'history_export' => [
        'redactor' => App\Support\WorkflowHistoryExportRedactor::class,
        'signing_key' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY'),
        'signing_key_id' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID'),
    ],
],
```

秘匿化処理は現在の値と、`path`、`category`、`workflow_instance_id`、`workflow_run_id`、`workflow_type` などのコンテキストを受け取ります。ワークフローの引数・出力、履歴イベント、コマンドのペイロード・コンテキスト、更新、タスク、アクティビティ、失敗のメッセージ・ファイル・トレース診断に対して呼ばれます。結果のバンドルは `redaction.applied`、`redaction.policy`、`redaction.paths` を含み、後続ツールは適用したポリシーを識別できます。

各エクスポートは秘匿化後に計算した `integrity` も含みます。チェックサムは `canonicalization = json-recursive-ksort-v1` と `checksum_algorithm = sha256` を使います。`signing_key` が設定されていれば、同じ正規化ペイロードに `signature_algorithm = hmac-sha256` で署名し、任意の `signing_key_id` を `key_id` として報告します。署名キーはエクスポート成果物の外に保管し、後続の検証器がキーを区別する必要がある場合はキー ID を更新してください。
