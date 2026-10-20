---
sidebar_position: 8
---

# ハートビート {#heartbeats}

ハートビートにより、長時間実行されるアクティビティは現在の試行がまだ動作中であると報告できます。

`heartbeat()` は取得中の `activity_attempts` 行を更新し、最新のハートビートを稼働中のアクティビティ実行にも反映し、タスクのリースを更新して、現在の試行の型付き `ActivityHeartbeatRecorded` 履歴イベントを追加します。Waterline の選択実行詳細と履歴エクスポートは、型付きの `ActivityStarted`、`ActivityHeartbeatRecorded`、`ActivityRetryScheduled`、`ActivityCompleted`、`ActivityFailed`、`ActivityCancelled` 履歴を優先し、試行の状態、タスク ID、Worker、ハートビート、リース、キャンセルと終了の時刻を再構築します。変更可能な試行行は、古いデータへのフォールバックや補完として残ります。

```php
use Workflow\V2\Activity;

final class PollRemoteJob extends Activity
{
    public function handle(string $jobId): array
    {
        do {
            sleep(1);

            $status = RemoteService::status($jobId);

            $this->heartbeat([
                'message' => 'Polling remote job',
                'current' => $status['completed'] ?? null,
                'total' => $status['total'] ?? null,
                'unit' => 'steps',
                'details' => [
                    'remote_state' => $status['state'] ?? 'running',
                ],
            ]);
        } while ($status['state'] === 'running');

        return $status;
    }
}
```

アクティビティ内では、`activityId()`、`attemptId()`、`attemptCount()` から永続実行と現在の試行の識別情報を取得でき、外部処理との関連付けに使えます。リモートの冪等性キーには通常 `activityId()` を使い、同じ永続アクティビティ実行の個々の試行を区別する必要があるシステムにのみ `attemptId()` を使ってください。

多言語 Worker は PHP のアクティビティクラスを構築せずに HTTP Worker ブリッジでハートビートを送信できます。エンドポイントは [Worker プロトコル](/docs/polyglot/worker-protocol)を参照してください。

## 進捗スナップショット {#progress-snapshots}

`Activity::heartbeat()` と `ActivityTaskBridge::heartbeat()` はどちらも、サイズ制限のある任意の進捗スナップショットを受け付けます。

- `message`
  - 280文字以内の空でない文字列
- `current`
  - 非負の整数または浮動小数点数
- `total`
  - 非負の整数または浮動小数点数
- `unit`
  - 64文字以内の空でない文字列
- `details`
  - キーが `[A-Za-z0-9_.:-]{1,64}` に一致する、最大20項目の `key => scalar|null` のフラットなマップ

このペイロードは `"Downloading chunk"` や `2 / 5 chunks` といった運用者向け進捗に使い、大量のログや任意の入れ子状態には使わないでください。Waterline の選択実行詳細、タイムラインのハートビート項目、履歴エクスポートは、アクティビティと現在の試行の `last_heartbeat_progress` として表示します。生の型付き `ActivityHeartbeatRecorded` 履歴イベントは、同じ正規化済みペイロードを `progress` に保持します。

## 永続的な試行追跡 {#durable-attempt-tracking}

ランタイムはアクティビティの試行ごとに、試行番号、状態、開始時刻、最新ハートビート、リース失効時刻、終了時刻を含む独立した永続行を記録します。また、開始、ハートビート、リトライ、完了、失敗、キャンセル時に型付きの試行履歴を記録するため、後に変更可能な試行行やタスク行がずれても、過去の試行詳細が残ります。現在取得中の試行からの成功したハートビートは、アクティビティ実行 ID、試行 ID、ハートビート時刻、リース失効時刻、イベント当時のアクティビティスナップショットを持つ簡潔な `ActivityHeartbeatRecorded` タイムライン項目を記録します。キャンセルや強制終了コマンドが実行を閉じると、Worker が停止を認識した時点でブリッジは `ActivityCancelled` を記録します。後から届く完了や失敗は古い報告として拒否し、キャンセルを結果に変えません。

ハートビートは運用上の生存信号です。受理されたものはすべて永続履歴になるため、大量の進捗ログとして使わず、タイムアウトや復旧に必要な間隔にしてください。任意の進捗スナップショットもイベントストリームとして扱わず、運用診断に十分な小ささに保ってください。
