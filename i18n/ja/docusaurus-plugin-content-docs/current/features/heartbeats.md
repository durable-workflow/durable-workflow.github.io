---
sidebar_position: 8
---

# ハートビート {#heartbeats}

ハートビートにより、長時間実行されるアクティビティは現在の試行がまだ動作中であると報告できます。

`heartbeat()` は、現在取得中の `activity_attempts` 行をハートビート時刻と最新の進捗で更新し、最新のハートビートを実行中のアクティビティ実行に反映して、そのアクティビティタスクのリースを更新します。`ActivityHeartbeatRecorded` 履歴イベントを書き込むのは進捗が変わったときだけで、記録間隔ごとに最大 1 回です（後述）。Waterline の選択実行の詳細と履歴エクスポートは、最新のハートビートと進捗を試行行から読み取り、試行の状態、タスク ID、Worker、リース、キャンセル、終了時刻を型付きの `ActivityStarted`、`ActivityHeartbeatRecorded`、`ActivityRetryScheduled`、`ActivityCompleted`、`ActivityFailed`、`ActivityCancelled` 履歴から再構成します。古いデータでは試行行をフォールバックとして使います。

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

単一のブロッキング呼び出しには、ハートビート用の補助処理が必要な場合があります。
これは進捗ではなく生存の通知です。呼び出し自体に有限の期限を設定し、
完了時や実行権限を失った時は補助処理を停止してください。
Python では[コンテキストの取得とキャンセルの実装例](../polyglot/python.md#heartbeat-helper-thread)に従ってください。

## 送信間隔と確認 {#heartbeat-cadence-and-receipts}

キューに入ったアクティビティでは、最初のハートビート期限はランタイムの取得時点から始まり、タスクの配信やユーザーコードの実行より前です。記録されたハートビートは、ランタイムの時刻に `heartbeatTimeout` を加えて次の期限を設定します。リクエストの送信時や応答の受信時に、期間が最初から始まるわけではありません。[ハートビートのタイムアウト](./timeouts.md#heartbeat-timeout)を参照してください。

期間に十分な余裕を残して送信間隔を選び、呼び出し間の処理量に上限を設けてください。15 秒のタイムアウトなら約 5 秒を目安にできますが、配信、各バッチや I/O 呼び出し、実行の中断、ネットワーク遅延、通信の再試行が残り時間に収まる場合だけです。これらの遅延を測定し、余裕を確保します。これは計画の指針であり、安全な間隔の保証ではありません。期限切れまたは置換済みの試行は、遅いハートビートでリースを回復できません。

進捗ハートビートの自動スケジュールや SDK によるバッチ送信の保証はありません。Worker 登録のハートビートと所有状態の確認は、アクティビティの進捗を公開しません。受理されたハートビートはすべてリースを更新し、ハートビート期限を延ばします。履歴イベントが書き込まれるのは、進捗が前回記録した進捗と異なり、かつそのイベントからハートビートタイムアウトと 60 秒のうち長いほうの時間が経過している場合だけです。進捗のないハートビートは生存を示すだけで、履歴は書き込みません。間隔のために保留された進捗は、試行の終了時に 1 回記録されます。進捗が変わらないまま 1 時間毎秒ハートビートしても、書き込まれるイベントは 1 件です。古い履歴は、すでに記録したハートビートごとのイベントをそのまま保持します。

埋め込みの `Activity::heartbeat()` は `void` を返します。無効な進捗やストレージ障害は例外になり得ます。正常に戻っても確認オブジェクトを返すわけではありません。終了、期限切れ、置換済みの試行では、新しいハートビートを記録せずに戻る場合があります。サービスモードでは、クライアントの直接呼び出しと監督下の Worker でエラー動作が異なります。[PHP](../polyglot/php.md#activity-heartbeats)、[Python](../polyglot/python.md#activity-heartbeat-requests)、[Rust](../polyglot/rust.md#activity-heartbeats) のガイドを参照してください。

ハートビート進捗は外部バッチを原子的にコミットせず、古い実行者の外部作用を防ぐ権限境界にもなりません。再試行に安全なアプリケーションのチェックポイントには、独自の永続コミット、安定した論理ジョブキー、冪等性または外部での権限確認が必要です。置換試行が確認済みチェックポイントを取得する API は、別の[チェックポイント機能](https://github.com/durable-workflow/.github/issues/218)で追跡しています。

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

ランタイムは、アクティビティの試行ごとに独立した永続行を 1 つ記録します。試行番号、状態、開始時刻、最新のハートビートと進捗、リース期限、終了時刻を含みます。また、アクティビティの開始、ハートビート、リトライ、完了、失敗、キャンセルのたびに型付きの試行履歴を記録するため、可変の試行行やタスク行が後でずれても、過去の試行の詳細は残ります。記録されたハートビートは、アクティビティ実行 ID、試行 ID、ハートビート時刻、リース期限、進捗、イベント時点のアクティビティスナップショットを含む、コンパクトな `ActivityHeartbeatRecorded` のタイムライン項目を追加します。cancel または terminate コマンドが実行を終了した場合、ブリッジは Worker が停止を検知した時点で `ActivityCancelled` を記録し、その後の完了や失敗を古いものとして拒否します。キャンセルが結果に変わることはありません。

ハートビートは運用上の生存シグナルです。タイムアウトと復旧に必要な頻度でハートビートしてください。生存を示すだけのハートビートは履歴を増やさず、進捗の変化は間隔ごとに最大 1 回記録されます。任意の進捗スナップショットは、イベントストリームとして扱わず、運用担当者の診断に足りる程度にコンパクトにしてください。
