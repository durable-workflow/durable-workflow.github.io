---
sidebar_position: 24
title: Worker セッション
description: 一連の永続アクティビティ試行を1つの Worker セッションリースに固定し、GPU、ファイルシステム、プロセスローカルの状態へのアフィニティを実現します。
tags:
  - activities
  - workers
  - affinity
  - operations
keywords:
  - Worker セッション
  - アクティビティのアフィニティ
  - GPU Worker
  - ローカルファイルシステムの Worker
  - Worker プロトコルのセッション
---

# Worker セッション {#worker-sessions}

Worker セッションは v2 のアクティビティアフィニティのプリミティブです。複数の永続ステップでプロセスローカルな状態、GPU メモリ、マウント済みファイルシステム、その他の Worker ローカルリソースを再利用する場合に使います。

## 契約の概要 {#contract-summary}

- セッションのリース所有者は同時に1つです。
- 最初に受け入れられたセッション内アクティビティがリースを作成または再取得します。
- アクティビティのハートビートは試行とセッション両方のリースを更新します。
- `POST /api/worker/sessions`、`POST /api/worker/sessions/{sessionId}/heartbeat`、`DELETE /api/worker/sessions/{sessionId}` が外部 Worker 向けの明示的なライフサイクル操作を提供します。
- キュールーティングが先に実行され、Worker がタスクキューに登録された後にセッションへの受け入れを行います。
- Worker 登録の `capabilities` はすべてのセッション要件を満たす必要があります。
- 失効・孤立したセッションは運用者に表示され、障害復旧を許可するセッションなら再取得できます。

## 記述 API {#authoring-api}

PHP ワークフローでは `Workflow::workerSession()` または `Workflow\V2\workerSession()` でセッションハンドルを作成し、そこからアクティビティをスケジュールします。

```php
use Workflow\V2\Support\WorkerSessionOptions;
use Workflow\V2\Workflow;

$session = Workflow::workerSession(
    'gpu-render',
    new WorkerSessionOptions(
        queue: 'gpu-activities',
        requirements: ['gpu:nvidia-l4'],
        leaseSeconds: 120,
        ttlSeconds: 1800,
        maxConcurrentActivities: 1,
    ),
);

$frames = $session->activity(RenderFramesActivity::class, $videoId);
$manifest = $session->activity(AssembleManifestActivity::class, $frames['path']);
```

アクティビティのオプションスナップショットは同じ契約を `activity_options.worker_session` に保存します。外部ランタイムはワークフロータスクの `schedule_activity` コマンドの `worker_session` に同じ JSON 形式を使います。

```json
{
  "type": "schedule_activity",
  "activity_type": "media.render-frames",
  "worker_session": {
    "session_id": "gpu-render",
    "queue": "gpu-activities",
    "requirements": ["gpu:nvidia-l4"],
    "lease_seconds": 120,
    "ttl_seconds": 1800,
    "max_concurrent_activities": 1,
    "create_if_missing": true,
    "allow_reacquire_after_failure": true
  }
}
```

## Python のサービス Worker {#python-service-workers}

[Python の Worker セッション例](../polyglot/python.md#worker-sessions)では、`WorkerSessionOptions` を作成し、2 つのリモートアクティビティを順番にスケジュールし、保持者の capability を宣言して、試行を使い切ったアクティビティの失敗を処理します。保持者の喪失後に破棄可能な Worker ローカル状態を再構築する方法と、明示的なクローズや TTL 満了後に新しいセッション ID が必要な理由も説明します。この手順は公開済みの Python SDK 2.9.0 と Server 2.11.0 で検証済みで、Server のスケジューラー/メンテナンスロールも含みます。

## ライフサイクル {#lifecycle}

セッションは遅延作成されます。最初のセッション内タスクが要件を満たす Worker に受け入れられると、マッチング層が作成または再取得します。Worker はポーリング前に `POST /api/worker/sessions` で明示的に作成することもできます。

アクティブなセッションは、所有者によるクローズ、リース失効、絶対 TTL の満了、所有 Worker の障害検出で終了します。TTL 満了と明示的なクローズは、そのセッション ID の終端です。リース失効や孤立検出の場合は `allow_reacquire_after_failure` が true なら再取得できます。

## リースと所有権 {#lease-and-ownership}

同時にセッションリースを所有する Worker は最大1つです。Server は次のいずれかの場合のみセッション内タスクを受け入れます。

- セッションが存在せず、`create_if_missing` が true。
- ポーリング中の Worker が既にアクティブなセッションを所有している。
- セッションが失効、失敗、孤立しており、再取得が許可されている。

セッションの所有権は試行ごとのリースを置き換えません。各試行は固有の `activity_attempt_id`、リース所有者、ハートビート、完了、失敗、タイムアウト、キャンセルの経路を持ちます。

## 受け入れとルーティング {#admission-and-routing}

セッションは通常のキュールーティングに従います。`WorkerSessionOptions` は `connection` と `queue` を設定でき、呼び出しごとの `ActivityOptions` でさらに上書きできます。Server は通常のタスクキューへの受け入れ後にセッション固有の条件を適用します。

- Worker 登録の `capabilities` が全セッション要件を満たすこと。
- `max_concurrent_activities` はセッション内のリース中の試行数を制限します。
- `max_concurrent_worker_sessions` は1つの Worker 登録が所有するアクティブなセッションリース数を制限します。

Worker 群に固有のルーティングには `gpu:nvidia-l4`、`gpu:a100`、`fs:/mnt/models`、`zone:us-east-1a` などの単純な機能文字列を使います。

## 失敗、キャンセル、シャットダウン {#failure-cancellation-and-shutdown}

アクティビティのハートビートは試行とセッション両方のリースを更新します。Worker プロトコルでセッションを直接更新することもできます。リースが切れると `expired`、所有 Worker 登録のハートビートが古いか存在しなければ `orphaned` になります。

途中で所有 Worker が停止しても、実行中のアクティビティは通常の少なくとも1回の動作を維持します。試行リースが失効し、修復で再取得可能になり、古い完了報告は拒否される場合があります。契約が許せば要件を満たす Worker がセッションを再取得できます。再取得後はプロセスローカルな状態の再構築が必要と想定してください。

ワークフローのキャンセルは引き続きアクティビティのハートビート応答で伝わります。セッションリースがあっても `cancel_requested` を無視することはできません。計画的な終了ではプロセスを停止する前に `DELETE /api/worker/sessions/{sessionId}` で所有セッションを閉じてください。実行中のアクティビティはそれぞれの試行リースに従い、完了、失敗、キャンセル、失効します。

## 可視化 {#visibility}

Worker プロトコルの機能情報は、`GET /api/cluster/info` と全 Worker プレーン応答で `worker_session_verbs` と `worker_sessions` ランタイム契約を通知します。機械可読な契約は [`worker-sessions-runtime.schema.json`](/platform-protocol-specs/worker-sessions-runtime.schema.json) に公開され、[プラットフォームプロトコル仕様](/docs/platform-protocol-specs#worker-session-runtime-notes)に掲載されています。

運用者は `GET /api/worker-sessions` でアクティブ、クローズ済み、失効、失敗、孤立のセッションを一覧できます。詳細にはセッション ID、所有者、キュー、要件、リース失効、TTL 満了、アクティブなアクティビティ数、失敗理由が含まれます。システム運用メトリクスは各状態の件数を含みます。

## Worker セッションの選択 {#choosing-worker-sessions}

各ステップが独立なら通常のキュー経由アクティビティを優先します。操作全体が1つの原子的な副作用なら、1つの大きなアクティビティを優先します。複数の永続ステップで Worker ローカルのリソースを再利用する必要があり、Worker 障害後の再構築を許容できる場合だけセッションを使います。

通常のアクティビティ、ローカルアクティビティ、スティッキー実行との関係は[アクティビティの実行モデル](/docs/features/activity-execution-model)を参照してください。
