---
sidebar_position: 1
---

# 設定の公開 {#publishing-config}

次のコマンドは `config` フォルダーに `workflows.php` 設定ファイルを作成します。

```bash
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="config"
```

## ワークフロータスクのリース（v2） {#workflow-task-lease-v2}

組み込みワークフロータスクのリースを、正の整数の秒数で設定します。

```env
DW_V2_WORKFLOW_TASK_LEASE_SECONDS=300
```

これは `config/workflows.php` の `workflows.v2.workflow_task_lease_seconds` に対応し、デフォルトは `300` です。タスクの取得と更新は有効な設定を参照します。ゼロではリースを無効化できません。デプロイ設定を変更した後は設定キャッシュを更新し、長時間稼働するWorkerを再起動してください。

Serverは代わりに `DW_WORKFLOW_TASK_TIMEOUT` を使い、その値をパッケージ設定へ反映します。この回復用リースは、アクティビティやワークフローの期限とは別です。[ワークフロータスクのリース](../features/timeouts.md#workflow-task-lease)を参照してください。

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

## Worker インターセプター {#worker-interceptors}

Worker インターセプターは次の Workflow パッケージリリースから利用できます。組み込み Durable Workflow は、アプリケーションのプロセス内で実行するワークフロータスク、アクティビティ、クエリ、更新の検証の前後で、順序付きの Worker インターセプターを実行します。監査ログ、メトリクスタグ、テナントコンテキスト、トレースなど、各ワークフローやアクティビティではなく一度だけ書きたい処理に使用します。フックの形は [Python](../polyglot/python.md#worker-interceptors)、[PHP](../polyglot/php.md#worker-interceptors)、[Rust](../polyglot/rust.md#worker-interceptors) の SDK インターセプターと同じです。

インターセプタークラスを `config/workflows.php` の `workflows.v2.interceptors` に列挙します。これらは Laravel コンテナから解決されるためコンストラクターインジェクションが使え、列挙した順に実行されます。最初のものが最も外側のラッパーです。

```php
'v2' => [
    // ...
    'interceptors' => [
        App\Workflows\AuditInterceptor::class,
    ],
],
```

各インターセプターは `Workflow\V2\Interceptors\WorkerInterceptor` を実装します。必要なフックだけを実装するには `Workflow\V2\Interceptors\PassthroughWorkerInterceptor` を継承し、チェーンを続けるために `$next($context)` を呼び出します。次の監査インターセプターは、コミットされた各ワークフロータスクとすべてのアクティビティ試行をログに記録します。

```php
namespace App\Workflows;

use Illuminate\Support\Facades\DB;
use Psr\Log\LoggerInterface;
use Workflow\V2\Interceptors\ActivityInterceptorContext;
use Workflow\V2\Interceptors\PassthroughWorkerInterceptor;
use Workflow\V2\Interceptors\WorkflowTaskInterceptorContext;
use Workflow\V2\Interceptors\WorkflowTaskOutcome;

final class AuditInterceptor extends PassthroughWorkerInterceptor
{
    public function __construct(private readonly LoggerInterface $audit)
    {
    }

    public function executeWorkflowTask(WorkflowTaskInterceptorContext $context, callable $next): WorkflowTaskOutcome
    {
        $outcome = $next($context);
        // The task commits after the chain returns; log only once it has.
        DB::afterCommit(fn () => $this->audit->info('workflow task', [
            'workflow_id' => $context->workflowId,
            'run_id' => $context->runId,
            'attempt' => $context->workflowTaskAttempt,
            'recorded' => $outcome->historyEventTypes,
        ]));

        return $outcome;
    }

    public function executeActivity(ActivityInterceptorContext $context, callable $next): mixed
    {
        $this->audit->info('activity started', [
            'activity_type' => $context->activityType,
            'attempt' => $context->attemptNumber,
            'workflow_id' => $context->workflowId,
        ]);
        try {
            return $next($context);
        } finally {
            $this->audit->info('activity finished', ['activity_type' => $context->activityType]);
        }
    }
}
```

コンテナは、設定されたインターセプターをタスクごとに構築します。タスク間で状態を保持する必要がある場合は、シングルトンとしてバインドしてください。

| フック | コンテキスト | `$next` の戻り値 |
| --- | --- | --- |
| `executeWorkflowTask($context, $next)` | `workerId`, `connection`, `taskQueue`, `namespace`, `task`, `taskId`, `workflowType`, `workflowId`, `runId`, `workflowTaskAttempt`, `historyLength`, `replaying`（`replayState()` も） | `historyEventTypes`、`runStatus`、`nextTaskId` を持つ `WorkflowTaskOutcome` |
| `executeActivity($context, $next)` | `workerId`, `connection`, `taskQueue`, `namespace`, `task`, `activityType`, `activityClass`, `arguments`, `attemptNumber`, `taskId`, `activityExecutionId`, `activityAttemptId`, `workflowId`, `runId`, `local`, `activity` | アクティビティの結果 |
| `executeQueryTask($context, $next)` | `workerId`（常に null）, `connection`, `taskQueue`, `namespace`, `task`, `queryName`, `workflowType`, `workflowId`, `runId`, `arguments`, `replayState()`（常に `Replaying`） | クエリの結果 |
| `executeUpdateValidation($context, $next)` | `workerId`（常に null）, `connection`, `taskQueue`, `namespace`, `updateName`, `workflowType`, `workflowId`, `runId`, `arguments`, `replayState()`（常に `Replaying`） | `approved`、`rejectionMessage`、`exceptionType`、`validationErrors` を持つ `UpdateValidationOutcome` |

`task` は取得したタスク行の配列スナップショットであり、モデルそのものではありません。`workerId` はホストとプロセス ID でキュー Worker プロセスを識別します。クエリと更新の検証は呼び出し元のプロセスで実行されるため、その `workerId` は null です。

ワークフロータスクのインターセプターは、ワークフローが記録する内容を変更できません。

- `executeWorkflowTask` は、ワークフロータスクをそのデータベーストランザクションの内側で、タスク試行ごとに一度ラップします。それ以前のワークフロータスクがその実行に対してすでにコマンドを記録している場合、`replaying` は `true` になります。これは重複排除のキーではありません。`historyEventTypes` には、このタスクが追加したイベントだけが列挙されます。
- `replayState()` は同じ答えを、`Workflow::replayState()` が使う列挙型 `Workflow\V2\Enums\WorkflowReplayState` として返します。インターセプターが見る値はそのタスクの間は固定です。
- フックの副作用はタスクのコミット前に実行され、試行が再試行されると繰り返される可能性があります。そのため、`DB::afterCommit()` で遅延させるか、`taskId` と `workflowTaskAttempt` をキーにしてください。
- エンジンは、ワークフローコードが生成した履歴をコミットします。結果は読み取り専用のビューです。別の結果を返したり、別のコンテキストを `$next` に渡したりしても、何も変わりません。
- ワークフローコードからの失敗は、インターセプターがそれを捕捉して正常に戻った場合でも、そのままエンジンに届きます。
- インターセプターがチェーンの外に例外をスローした場合、`$next` を呼ばなかった場合、または複数回呼び出した場合、タスクのトランザクションはロールバックされるため、何も記録されません。タスクは `WorkflowTaskInterceptorFailed` を最後のエラーとして解放され、通常の修復バックオフの後に再試行されます。内側のインターセプターが `$next` の後にスローした例外を外側のインターセプターが捕捉し、タスクをコミットさせることはできます。ただし、`$next` を呼ばなかった場合や繰り返し呼び出した場合は、常にタスクが失敗します。
- フックは実行行とタスク行がロックされている間に実行されるため、短く保ってください。フックは周囲のトランザクションをコミットまたはロールバックしてはならず、ラップしている実行に対してシグナルなどのコマンドを送信してはなりません。実行の記録済み状態を変更すると、すべての試行でタスクが失敗します。
- ローカルアクティビティはワークフロータスクの内側で実行されるため、`$next` の後に失敗し続けるフックがあると、再試行のたびにそれらのローカルアクティビティが再度実行されます。

更新検証のインターセプターは、`#[UpdateValidator]` を持つ更新が受理される前に実行されるリプレイとバリデーター呼び出しをラップします。バリデーターのない更新ではこのフックは実行されません。フックは判定を観察するだけで、変更はできません。

- エンジンはバリデーター自身の結果に従って動作します。別の `UpdateValidationOutcome` を返したり、別の引数を `$next` に渡したりしても、何も変わりません。バリデーターは常に更新の引数を受け取ります。
- フックが例外をスローした場合、`$next` を呼ばなかった場合、または複数回呼び出した場合、更新は `UpdateValidationFailedException` で拒否され、何も記録されません。そのため、フックが検証されていない更新を通すことはありません。
- フックは更新の受理トランザクションの内側で、実行の行がロックされている間に実行されるため、短く保ってください。副作用は `DB::afterCommit()` で遅延させてください。フックによる書き込みは、受理とともにコミットまたはロールバックされます。フックのコードはワークフローの Fiber の外側で実行されるため、その実行に対して永続的な処理をスケジュールすることはできません。

アクティビティとクエリのインターセプターは、`$context->withArguments(...)` で引数を変更でき、戻り値も変更できます。アクティビティの結果は一度だけ記録され、クエリは何も記録しないためです。書き換えられたクエリの引数は、クエリの契約に対して再度検証されます。アクティビティの例外は、いずれかのインターセプターが処理しない限り、すべてのインターセプターを通過し、その後アクティビティの通常のリトライポリシーに従います。アクティビティのインターセプターはキューに入れられたアクティビティとローカルアクティビティの両方をラップし、`local` で両者を区別できます。`WorkflowStub::fake()` でモックしたアクティビティでは、インターセプターは実行されません。

[組み込みトレース](../monitoring.md#embedded-tracing)が有効な場合、組み込みのワークフローとアクティビティのスパンが最も外側に留まるため、インターセプターはアクティブなスパンの内側で実行され、属性や子スパンを追加できます。

インターセプターは、このパッケージが実行するキュージョブ、ローカルアクティビティ、クエリをラップします。Worker タスクブリッジを通じて外部 SDK の Worker に渡されたタスクは、その SDK 自身のインターセプターの下で実行されます。ブリッジの呼び出し元のために取得済みのワークフロータスクをプロセス内で実行する Worker ブリッジの `execute` ルートでは、ワークフロータスクのインターセプターは実行されません。`workflows.v2.interceptors` 内のエントリーを解決できない場合、経路ごとに異なる形で失敗します。キューに入れられたワークフロータスクは解放されて再試行され、アクティビティ試行はそのリトライポリシーの下で失敗し、クエリは呼び出し元に例外をスローします。デプロイ時にリストを確認してください。完全な契約は[組み込みインターセプターガイド](https://github.com/durable-workflow/workflow/blob/main/docs/worker-interceptors.md)にあります。
