---
sidebar_position: 22
title: アクティビティの実行モデル
description: Durable Workflow v2 におけるキュー経由アクティビティ、ローカルアクティビティ、Worker セッション、スティッキー実行の関係。
tags:
  - activities
  - workers
  - execution
keywords:
  - アクティビティの実行モデル
  - ローカルアクティビティ
  - Worker セッション
  - スティッキー実行
  - 永続タスクのディスパッチ
  - キュー経由アクティビティ
---

# アクティビティの実行モデル {#activity-execution-model}

PHP、Python、Rust のサービス Worker のサポート状況と、未対応なら拒否する機能ネゴシエーションは、サービスモードの[ポータブル Worker アフィニティ](/docs/polyglot/portable-worker-affinity)の対応表を参照してください。

Durable Workflow v2 は一般的なアクティビティ配置方法を明示的なプリミティブとして提供します。

- 通常のキュー経由アクティビティ: 独立したリースを持つ永続処理。
- [ローカルアクティビティ](/docs/features/local-activities): アクティビティ履歴を記録する短い同一プロセス内の処理。
- [Worker セッション](/docs/features/worker-sessions): 複数のキュー経由ステップにまたがる永続アクティビティのアフィニティ。
- [スティッキー実行](/docs/features/sticky-execution): リプレイキャッシュのアフィニティ。正しさは通常のリプレイへのフォールバックで保証します。

## 通常のキュー経由アクティビティ {#ordinary-queued-activities}

`activity(...)` と `Workflow::activity(...)` は通常のキュー経由アクティビティで、既定のプリミティブです。

1. ワークフローコードが `activity(MyActivity::class, ...)` を呼びます。
2. ワークフロータスクは `ActivityScheduled` を記録し、設定した接続とキューに永続アクティビティタスクを作成します。
3. 互換性のある Worker がリースでタスクを取得します。
4. Worker はクラスを実行し、完了、失敗、キャンセル、ハートビート、タイムアウトを報告します。
5. エンジンは結果を履歴に記録し、永続状態からワークフローを再開します。

通常の試行は互換性のあるどの Worker でも実行でき、リトライは別のプロセス、ホスト、ビルドに届く場合があります。重複配信、リース失効後のリトライ、遅れた完了報告の競合を通して、コードは冪等でなければなりません。リモートの冪等性キーには通常 `activity_execution_id` を使い、後続システムが試行単位の関連付けを必要とする場合だけ `activity_attempt_id` を使います。

```php
use function Workflow\V2\activity;

$quote = activity(FetchQuoteActivity::class, $customerId);
$invoice = activity(CreateInvoiceActivity::class, $quote['id']);
```

## ローカルアクティビティ {#local-activities}

`localActivity(...)`、`Workflow::localActivity(...)`、`Workflow::executeLocalActivity(...)` は、現在ワークフロータスクを実行する Worker プロセス内でクラスを実行します。通常のアクティビティタスクは作成しません。

ローカルアクティビティも通常のアクティビティ履歴を記録します。

- `ActivityScheduled`
- `ActivityStarted`
- `ActivityHeartbeatRecorded`
- `ActivityRetryScheduled`
- `ActivityCompleted`
- `ActivityFailed`
- `ActivityCancelled`
- `ActivityTimedOut`

各イベントは `execution_mode=local` と `local_activity=true` を持ち、実行スナップショットは `activity_options.execution_mode=local` を保存します。ローカル試行中のハートビートは、そのワークフロータスクのリースを更新します。

リトライ、タイムアウト、ハートビート、キャンセル、可視化の意味論が必要で、キュールーティングや独立したアクティビティ Worker 群が不要な短い冪等な副作用に使います。API、タイムアウト、リトライ、終了、コールドリプレイ、ルーティング、メトリクスの契約は[ローカルアクティビティ](/docs/features/local-activities)を参照してください。

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

## Worker セッション {#worker-sessions}

Worker セッションは一連の通常アクティビティ試行を1つのセッションリースに固定します。GPU メモリ、マウント済みファイルシステム、読み込み済みモデルなど、Worker ローカルのリソースを複数の永続ステップで再利用する場合に使います。

セッション内でもアクティビティがローカルになるわけではありません。それぞれが固有のリース、ハートビート、タイムアウト、リトライ、終端履歴を持つ永続タスクです。セッションは通常のキュールーティングに明示的なアフィニティと受け入れルールを追加します。

API、リースのライフサイクル、ルーティング、失敗処理、終了動作、運用診断は [Worker セッション](/docs/features/worker-sessions)を参照してください。

## スティッキー実行 {#sticky-execution}

スティッキー実行はワークフロータスクのリプレイ最適化です。Worker はタスク完了後にプロセスローカルのウォームキャッシュを保持できます。その実行の後続タスクを取得した場合、有効なキャッシュを再利用できます。アフィニティは準備済みタスクを予約せず、キャッシュ所有者をマッチングで優先しません。別の適格な Worker が取得し、履歴をコールドリプレイすることもできます。

ワークフローの進捗がプロセスローカルになるわけではありません。キャッシュミス、再起動、処理の完了待ち、展開、キャッシュ追い出し後の正しさは、永続履歴からの通常のコールドリプレイで保ちます。ワークフローコードは履歴外のメモリ状態に依存してはいけません。

キャッシュのライフサイクル、ルーティング識別情報、フォールバックルール、デプロイ制御、メトリクスは[スティッキー実行](/docs/features/sticky-execution)を参照してください。

## 適切なプリミティブの選択 {#choosing-the-right-primitive}

決定的な分岐や計算はワークフローコードに直接記述します。

リトライ、タイムアウト、ハートビート、キャンセルの意味論が不要な非決定的な値の、安全にリプレイできるスナップショットには [`sideEffect(...)`](/docs/features/side-effects) を使います。

通常のタスクマッチングには入れず、試行として可視化したい短いリトライ可能な同一プロセス内の副作用には[ローカルアクティビティ](/docs/features/local-activities)を使います。

リモート呼び出し、低速 I/O、CPU 負荷の高い処理、キューのバックプレッシャー、専用 Worker 群、独立したリースのタスクで継続すべき処理には通常の[アクティビティ](/docs/defining-workflows/activities)を使います。

複数の通常アクティビティステップに明示的な Worker ローカルのアフィニティが必要なら [Worker セッション](/docs/features/worker-sessions)を使います。
