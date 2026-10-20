---
sidebar_position: 19
---

# タイムアウト {#timeouts}

ワークフローレベルのタイムアウトは、ワークフローを実行できる時間に上限を設けます。適用範囲は二つあります。

- **実行全体のタイムアウト**：continue-as-new を含む、ワークフローインスタンスの全実行にわたる合計経過時間を制限します。期限は開始時に一度計算され、その後も変わりません。
- **単一実行のタイムアウト**：一つの実行を制限します。新しい実行が始まるたびに、continue-as-new の場合も期限を再計算します。

どちらも任意で、組み合わせて使用できます。

## 設定 {#configuration}

ワークフロー開始時に `StartOptions` でタイムアウトを設定します。

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

$workflow->start(
    $orderId,
    StartOptions::rejectDuplicate()
        ->withExecutionTimeout(7200)   // 2 hours across all runs
        ->withRunTimeout(3600),        // 1 hour per run
);
```

### 実行全体のタイムアウト {#execution-timeout}

実行全体のタイムアウトは、ワークフローインスタンス全体に適用されます。continue-as-new を使用しても、チェーン内のすべての実行で期限は同じです。

```php
StartOptions::rejectDuplicate()->withExecutionTimeout(86400); // 24 hours
```

タイムアウト値は `WorkflowInstance` モデルに保存され、計算した期限は各 `WorkflowRun` に固定されます。

### 単一実行のタイムアウト {#run-timeout}

単一実行のタイムアウトは一つの実行に適用されます。continue-as-new の新しい実行では、現在時刻に設定済みの実行タイムアウトを加えて新しい期限を計算します。

```php
StartOptions::rejectDuplicate()->withRunTimeout(1800); // 30 minutes per run
```

### 検証 {#validation}

タイムアウト値は 1 秒以上でなければなりません。ゼロまたは負の値を渡すと `LogicException` が発生します。

```php
// Throws LogicException: "Workflow v2 execution timeout must be at least 1 second."
StartOptions::rejectDuplicate()->withExecutionTimeout(0);
```

### コントロールプレーン {#control-plane}

コントロールプレーン経由でワークフローを開始するときにも設定できます。

```php
$controlPlane->start('my-app.order-workflow', 'order-123', [
    'execution_timeout_seconds' => 7200,
    'run_timeout_seconds' => 3600,
]);
```

`describe` のレスポンスには、タイムアウトと期限のフィールドが含まれます。

```php
$description = $controlPlane->describe('order-123');

$description['execution_timeout_seconds']; // 7200
$description['run']['run_timeout_seconds']; // 3600
$description['run']['execution_deadline_at']; // ISO 8601 timestamp
$description['run']['run_deadline_at'];       // ISO 8601 timestamp
```

### Waterline {#waterline}

タイムアウトが設定されていると、Waterline の実行詳細画面に期間と計算済みの期限が表示されます。

### 履歴 {#history}

設定されている場合、`WorkflowStarted` 履歴イベントのペイロードにタイムアウトと期限が含まれます。

```json
{
    "execution_timeout_seconds": 7200,
    "run_timeout_seconds": 3600,
    "execution_deadline_at": "2026-04-12T14:00:00+00:00",
    "run_deadline_at": "2026-04-12T13:00:00+00:00"
}
```

### Continue-as-new {#continue-as-new}

ワークフローが continue-as-new を行うと、次のようになります。

- **実行全体の期限**は、前の実行から変更せずに引き継ぎます。
- **単一実行のタイムアウト**値は引き継ぎますが、**単一実行の期限**は現在時刻から再計算します。

つまり、実行全体のタイムアウトは常に最初の開始から測定し、新しい各実行には単一実行の新しいタイムアウト枠が与えられます。

## 適用方法 {#enforcement}

ワークフローレベルのタイムアウトは、二つの時点で適用されます。

1. **ワークフロータスクの開始時**：各タスクはワークフローを実行する前に `deadlineExpired()` を確認します。期限を過ぎていれば、直ちにタイムアウトさせます。
2. **TaskWatchdog による検出**：watchdog は、実行全体または単一実行の期限を過ぎているのに開いたワークフロータスクがない、非終端の実行を走査します。見つかった場合は期限切れタスクを作成して配信し、次のタスク実行でタイムアウトを適用します。

タイムアウトが発生すると、エンジンは次の処理を行います。

- 現在のタスク以外の、開いている全タスク（アクティビティ、タイマー、ワークフロー）をキャンセルする
- 開いている全アクティビティ実行をキャンセルし、`ActivityCancelled` 履歴イベントを記録する
- 保留中の全タイマーをキャンセルし、`TimerCancelled` 履歴イベントを記録する
- `failure_category = timeout` と `WorkflowTimeoutException` を持つ `WorkflowFailure` を記録する
- `timeout_kind` が `execution_timeout` または `run_timeout` の終端 `WorkflowTimedOut` 履歴イベントを記録する
- 開いている子ワークフローに親終了ポリシーを適用する
- 子の実行であれば、親ワークフローへ通知する

失敗行の例外クラスは `Workflow\V2\Exceptions\WorkflowTimeoutException` です。プログラムで調べられるように、`timeout_kind` と期限のタイムスタンプを保持します。

### タイムアウトの結果とクリーンアップ {#timeout-outcome-and-cleanup}

ワークフローの期限に達すると、実行は状態 `failed`、`closed_reason = timed_out` で閉じます。終端の履歴イベントは `WorkflowTimedOut` です。runtime は `WorkflowTimeoutException` を失敗データとして記録します。この例外をワークフロー本体へ投げたり、クリーンアップのためにコードを再開したりは**しません**。エンジンが期限を適用したときは、ワークフローの `catch`、`finally`、登録済み Saga 補償処理は実行されません。

アクティビティの永続実行をキャンセルしても、外部での副作用が取り消されるわけではなく、コールバックが停止した証明にもなりません。すでに確定している可能性のある処理には、冪等な操作とアプリケーション側の照合・修復を使用してください。

アプリケーションの期限に応じたクリーンアップが必要なら、より短い永続タイマーやタイムアウト付きの待機を使い、ワークフローコードで[終了前に補償](./sagas.md#deadline-driven-compensation)を行ってください。単一実行または実行全体の期限までに、アクティビティの再試行、Worker のスケジュール、クリーンアップの時間を残します。エンジンのタイムアウトは最後の安全上限です。Worker の遅延により、補償が完了する前にその上限へ達することもあります。

即時の `cancel()` と `terminate()` も、ワークフローのクリーンアップ猶予なしで実行を閉じます。別の操作である協調的 `requestCancellation()` は、実行が有効な間に、対応 Worker へ上限付きのクリーンアップ機会を渡せます。ワークフローのタイムアウトが自動で協調的キャンセル要求になることはなく、キャンセルシールドも実行全体または単一実行の期限を延長しません。[キャンセルと強制終了](./cancel-and-terminate.md)、[協調的キャンセル](../polyglot/cancellation.md)を参照してください。

## アクティビティのタイムアウト {#activity-timeouts}

アクティビティのタイムアウトは、個別のアクティビティ実行時間を制限します。四つの範囲があります。

- **スケジュールから開始まで**：スケジュールから最初の Worker 取得までを制限します。アクティビティが `Pending` の間に適用します。
- **開始から完了まで**：Worker の取得から完了までを制限します。再試行ごとにリセットします。
- **スケジュールから完了まで**：全再試行を通じた、スケジュールから完了までの合計経過時間を制限します。期限全体を過ぎているため再試行では解決せず、常に終端になります。
- **ハートビート**：ハートビート間の時間を制限します。`$this->heartbeat()` を呼ぶ長時間アクティビティは、設定間隔内のハートビートが必要で、なければ応答していないと見なされます。

すべて任意で、組み合わせて使用できます。アクティビティを呼び出すときに `ActivityOptions` で設定します。

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    LongRunningActivity::class,
    new ActivityOptions(
        scheduleToStartTimeout: 30,     // must be claimed within 30s
        startToCloseTimeout: 300,       // each attempt has 5 minutes
        scheduleToCloseTimeout: 600,    // total 10 minutes across all retries
        heartbeatTimeout: 15,           // must heartbeat every 15 seconds
        maxAttempts: 3,
    ),
    $input,
);
```

### スケジュールから開始までのタイムアウト {#schedule-to-start-timeout}

期限はアクティビティをスケジュールした時点で計算します。期限までに Worker が取得しなければ、`TaskWatchdog` がタイムアウトを適用します。試行回数が残っていれば、固定済みのバックオフで新しいタスクをスケジュールし、その実行可能時刻から開始待ち期限を再計算します。各再試行には新しい時間枠が与えられます。`scheduleToStartTimeout` が未設定なら、再試行時にこの期限を消去します。すべての試行が尽きると、終端の `ActivityTimedOut` 履歴を記録してワークフローを起こします。

### 開始から完了までのタイムアウト {#start-to-close-timeout}

期限は Worker がアクティビティタスクを取得したときに計算し、再試行ごとに新しい開始から完了までの期限を設定します。期限までに完了しなければ、その試行を閉じます。再試行が残っていれば、実行を `Pending` に戻し、設定されていれば開始待ち期限をリセットするので、再試行タスクが直ちに再タイムアウトするのを防ぎます。すべての試行が尽きると、終端のタイムアウトを記録します。

### スケジュールから完了までのタイムアウト {#schedule-to-close-timeout}

期限はスケジュール時に一度計算し、リセットしません。過ぎると、再試行が残っていても許容合計時間を超えているため、直ちに終端の失敗にします。試行ごとの制限内で無制限に再試行しかねない、不安定なアクティビティの総コストを制限するのに便利です。

### ハートビートのタイムアウト {#heartbeat-timeout}

最初の期限は Worker がタスクを取得したときに計算します。`$this->heartbeat()` が成功するたびに、設定された間隔だけ期限を延ばします。期限までに `heartbeat()` が呼ばれなければ、Worker は応答していないと判断します。再試行が残っていれば、設定済みの開始待ち期限をリセットして新しい試行をスケジュールします。なければ終端のタイムアウトを記録します。

```php
use Workflow\V2\Activity;

class LongRunningActivity extends Activity
{
    public function handle($input)
    {
        foreach ($items as $item) {
            $this->heartbeat(['processed' => $count]);
            // ... process item ...
        }
    }
}
```

### 適用方法 {#enforcement-1}

アクティビティのタイムアウトは、各 Worker ループで `TaskWatchdog` が適用します。watchdog は期限カラムを過ぎた実行を走査し、`ActivityTimeoutEnforcer` に処理を渡します。各適用で次を記録します。

- `timeout_kind` が `schedule_to_start`、`start_to_close`、`schedule_to_close`、`heartbeat` のいずれかである、終端の `ActivityTimedOut` 履歴イベント
- `failure_category = timeout`、`propagation_kind = timeout` の `WorkflowFailure` 行
- 親ワークフローを起こし、失敗を観測させる再開タスク

Waterline のアクティビティ詳細には、設定済みの全タイムアウトを含む再試行ポリシーが表示されます。タイムラインのアクティビティタイムアウトイベントには、その種類が表示されます。

### 未対応の範囲 {#what-is-not-yet-covered}

次は計画中で、まだ実装されていません。

- ワークフローレベルの再試行ポリシー

### 構造上の制限 {#structural-limits}

ペイロードサイズ、保留中の並列処理数、メタデータサイズの上限には、型付きの構造制限エラーをエンジンが適用します。契約、設定、失敗分類の全体は[構造上の制限](../constraints/structural-limits.md)を参照してください。
