---
sidebar_position: 23
title: ローカルアクティビティ
description: 永続的な履歴、リトライ、タイムアウト、可視化を維持し、現在のワークフロー Worker 内で短いアクティビティを実行します。
tags:
  - activities
  - workers
  - execution
keywords:
  - ローカルアクティビティ
  - localActivity
  - executeLocalActivity
  - 同一プロセスのアクティビティ
  - ワークフロータスクのハートビート
---

# ローカルアクティビティ {#local-activities}

ローカルアクティビティは、現在のワークフロータスクを処理する Worker 内で短い処理を行う v2 プリミティブです。リトライ、タイムアウト、ハートビート、キャンセル、履歴、運用上の可視化の意味論を維持し、通常のアクティビティタスクのキュー投入を省略します。

低レイテンシで冪等、かつワークフロー Worker 自身の実行に適した処理に使います。独立した Worker のスケーリング、キュールーティング、長時間実行、別のアクティビティタスクリースが必要なら通常のキュー経由アクティビティを使います。

## 契約の概要 {#contract-summary}

- `localActivity(...)` と `Workflow::localActivity(...)` は現在のタスクと同じプロセスでクラスを実行します。
- ランタイムは `activity_executions` 行と、`execution_mode=local`、`local_activity=true` 付きの通常の履歴イベントを作成します。
- 通常の `TaskType::Activity` タスクは作らないため、`connection`、`queue`、Worker セッション、schedule-to-start のルーティングオプションは拒否されます。
- ローカル試行はワークフロータスクのリースを所有します。`heartbeat()` はそのリースを更新し、`ActivityHeartbeatRecorded` を記録します。
- リトライは隠れたループではなく、バックオフ付きの永続ワークフロータスクです。
- コールドリプレイはコミット済み履歴を読みます。Worker 喪失後、開始済みローカル試行に終端イベントがなければ、次の試行は `retry_reason=cold_replay` を記録します。
- 実行詳細、履歴エクスポート、タイムライン、運用メトリクスは、ローカル試行を通常のキュー経由試行と区別して表示します。

## 記述 API {#authoring-api}

名前空間付きヘルパーを使います。

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(
        maxAttempts: 3,
        startToCloseTimeout: 10,
        scheduleToCloseTimeout: 30,
        heartbeatTimeout: 5,
    ),
    $orderId,
);
```

または静的ワークフローファサードを使います。

```php
use Workflow\V2\Workflow;

$receipt = Workflow::localActivity(SendReceiptActivity::class, $orderId);
$receipt = Workflow::executeLocalActivity(SendReceiptActivity::class, $orderId);
```

`LocalActivityOptions` は次のリトライ・タイムアウトフィールドを受け付けます。

- `maxAttempts`
- `backoff`
- `startToCloseTimeout`
- `scheduleToCloseTimeout`
- `heartbeatTimeout`
- `nonRetryableErrorTypes`

ローカルアクティビティは通常のマッチングに入らないため、`connection`、`queue`、Worker セッションのルーティング、`scheduleToStartTimeout` を拒否します。

## 実行と履歴 {#execution-and-history}

リプレイがローカルアクティビティに達すると、現在のワークフロータスクは次を行います。

1. `activity_options.execution_mode=local` 付きの実行を作成します。
2. ローカルマーカー付きの `ActivityScheduled` と `ActivityStarted` を記録します。
3. Worker 内でアクティビティクラスを生成し実行します。
4. `ActivityCompleted`、`ActivityFailed`、`ActivityTimedOut`、`ActivityCancelled` のいずれかを記録します。
5. 記録したイベントからワークフローコードを再開します。

リプレイは完了済みローカルアクティビティを再実行しません。クエリとコールドリプレイは通常のアクティビティと同じ履歴イベントを読みます。

## ハートビート {#heartbeats}

ローカルアクティビティはアクティビティタスクのリースではなく、現在実行中のワークフロータスクのリースを所有します。ランタイムは試行開始時にそのリースを更新します。`$this->heartbeat()` が呼ばれると進捗を記録し、試行とワークフロータスクのリースを更新します。

長時間のローカル処理は、ローカルのハートビートタイムアウトとワークフロータスクのリースの両方を維持できる頻度でハートビートを送る必要があります。

```php
use Workflow\V2\Activity;

final class PollShortJobActivity extends Activity
{
    public function handle(string $jobId): array
    {
        $state = $this->fetch($jobId);

        $this->heartbeat([
            'message' => 'Polling remote job',
            'job_id' => $jobId,
            'state' => $state['status'],
        ]);

        return $state;
    }
}
```

## タイムアウトとリトライ {#timeouts-and-retries}

`startToCloseTimeout` は1回の試行を、`scheduleToCloseTimeout` はリトライを含むローカル実行全体を制限します。`heartbeatTimeout` は記録するハートビート間の時間を制限します。

リトライ可能な失敗やタイムアウト時は `ActivityRetryScheduled` を記録し、バックオフ後に実行可能になるワークフロータスクを作成します。そのタスクは履歴をリプレイし、同じローカルアクティビティのシーケンスに達して次の試行を開始します。

各試行は新しい `activity_attempts` 行です。リトライは `retry_reason` に `failure`、`timeout`、`cold_replay` のいずれかを記録します。

## キャンセルと Worker 喪失 {#cancellation-and-worker-loss}

キャンセルは協調的です。ローカルアクティビティはハートビート、タイムアウトの適用、試行完了の境界でキャンセルを認識し、ローカルマーカー付きの `ActivityCancelled` を記録します。

終端イベントのコミット前に Worker が終了すると、リースが失効し、通常のタスク修復がワークフロータスクを回収します。コールドリプレイはコミット済み履歴を読み、開始済み試行に終端イベントがなければ `retry_reason=cold_replay` でリトライをスケジュールします。

## 可視化 {#visibility}

運用者は状態を報告するすべての箇所でローカルアクティビティを区別できます。

- 履歴ペイロードは `execution_mode=local` と `local_activity=true` を含みます。
- `activity_executions.activity_options.execution_mode` は `local` です。
- 実行詳細と履歴エクスポートは `execution_mode` と `local_activity` を含みます。
- 運用メトリクスは `activities.local`、`activities.local_open`、`activities.local_attempts` と、キュー経由・ローカル別のカウンターを提供します。

ランタイムマニフェストは `GET /api/cluster/info` の `worker_protocol.server_capabilities.local_activities` に公開されます。機械可読な契約は [`local-activity-runtime.schema.json`](/platform-protocol-specs/local-activity-runtime.schema.json) で、[プラットフォームプロトコル仕様](/docs/platform-protocol-specs#local-activity-runtime-notes)に掲載されています。

イベント名は通常のアクティビティと同じです。別のイベント群を増やさず、タイムラインとリプレイツールの順序を保てます。

## 適切なプリミティブの選択 {#choosing-the-right-primitive}

ワークフロー Worker 内で実行するのが適切でキュールーティングが不要な、短くリトライ可能な冪等の副作用にローカルアクティビティを使います。

リモート呼び出し、低速 I/O、CPU 負荷の高い処理、専用 Worker 群、バックプレッシャー、ワークフロー Worker 喪失後も独立したリースのタスクで進める処理には通常の[アクティビティ](/docs/defining-workflows/activities)を使います。

複数の通常ステップで GPU メモリやマウント済みファイルシステムなどを再利用する場合は [Worker セッション](/docs/features/worker-sessions)を使います。

[`sideEffect(...)`](/docs/features/side-effects) は、アクティビティのリトライ、タイムアウト、ハートビート、キャンセルが不要な、安全にリプレイできるスナップショットにのみ使います。
