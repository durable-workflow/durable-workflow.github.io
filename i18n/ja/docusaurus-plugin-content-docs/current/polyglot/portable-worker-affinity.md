---
sidebar_position: 26
title: 言語間で共通の Worker アフィニティ
description: PHP、Python、Rust SDK の service モードにおける Worker アフィニティの対応状況と制限。
tags:
  - workers
  - activities
  - replay
  - polyglot
---

# 言語間で共通の Worker アフィニティ {#portable-worker-affinity}

service モードの Worker は Server の Worker プロトコルを通じて以下の機能を実装します。利用できる機能は SDK バージョンと Worker 設定で決まります。

ローカルアクティビティ、Worker セッション、Sticky 実行には共通の移植性ルールがあります。service Worker は各機能を対応または明示的拒否として宣言します。宣言の最低プロトコルは `1.18` です。構造化マニフェストが同じ機能を対応としなければ、Server は平坦なルーティング能力の宣言を拒否します。

## SDK の対応状況 {#sdk-support}

| SDK Worker | ローカルアクティビティ | Worker セッション | Sticky 実行 |
| --- | --- | --- | --- |
| PHP | 対応 | 対応 | 対応 |
| Python | 対応開始：2.2.0 | 対応開始：2.3.0 | 対応開始：2.5.0（`sticky_cache_capacity` がゼロより大きい場合） |
| Rust | 対応開始：3.1.0、設定：`Worker::local_activities(true)` | 対応開始：3.2.0、設定：`Worker::worker_sessions(true)` | 対応開始：3.4.0、設定：`Worker::sticky_cache(...)` |

Worker はそのプロファイルで実装・有効化した能力だけを通知します。Rust のローカルアクティビティ、セッション、Sticky 実行、および Python の Sticky 実行は明示的な有効化が必要です。古い SDK は未実装機能を拒否します。通常のワークフローとキュー経由のアクティビティは、これらの最適化なしでも完全な永続履歴を Replay します。

## ローカルアクティビティの記録 {#local-activity-recording}

PHP、Python、有効化した Rust Worker は、ワークフロー Worker 内でローカルアクティビティを実行します。タスク完了には引数、試行結果、再試行・タイムアウト設定、ハートビート進捗、最終結果や失敗が含まれます。Server は一連の内容を `execution_mode=local` の通常のアクティビティ履歴として原子的に記録します。

Replay は記録済みのアクティビティ終端イベントを使用し、ローカルハンドラーを再実行しません。ただし Server が完了を確定する前に Worker が失われると、再実行される場合があるため、外部効果は冪等にしてください。

通常の PHP Worker は同期ハンドラーをインライン実行します。キャンセルとハートビート・試行ごと・全体のタイムアウトは、試行前、`ActivityContext::heartbeat()`、ハンドラーが戻った後に確認します。処理を短くし、ブロックする仕事を安全なハートビート境界で分けてください。

Python と Rust の非同期コールバックは、言語 runtime に制御を渡す必要があります。Rust はアプリケーションのハートビートとは独立に、正確なワークフロータスクのリースを更新します。タイムアウト、権限喪失、Worker 終了時にはコールバックを破棄し、上限付きの試行とハートビートを報告します。[Rust ローカルアクティビティ例](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs)と [API リファレンス](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html)を参照してください。

[協調的キャンセル](/docs/polyglot/cancellation)を有効にした PHP Worker はプロトコル 1.20 と、準備済みローカルアクティビティ用の監督されたコールバックプロセスを使用します。Rust のインライン実行は別の通常プロファイルであり、準備済みの協調ローカル監督と併用できません。ブロックするコールバックの物理停止には、プロセス監督が必要です。

## Worker セッションのライフサイクル {#worker-session-lifecycle}

PHP、Python、Rust SDK は型付きセッション設定と、作成、使用、更新、終了操作を提供します。設定には要求条件、キュー、リース時間、合計 TTL、アクティビティ同時数、再取得方針があります。Worker は正常終了時、保有セッションを閉じます。

保有者が消えると、リースと同時実行枠の予約は期限切れになります。条件が合えば別の保有者が再取得できますが、最初のアクティビティの前にローカルリソースを再構築する必要があります。セッションの同一性は、プロセスメモリを永続化しません。

再取得は元の絶対 TTL を保持します。更新は保有権限を延長しますが、TTL は延長しません。元の TTL の維持とコールド Replay 中の記録済みセッションルーティングには、Server 2.5.1 以降を使用します。[Rust セッション例](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs)と [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html)を参照してください。

## Sticky 実行とコールド Replay {#sticky-execution-and-cold-replay}

PHP、Python、Rust のキャッシュは上限付きで、正確なワークフロー ID、実行 ID、Worker ビルド ID をキーにします。`hit`、`miss`、`eviction`、`forced_cold_replay` を報告します。期限切れ、退避、置換、保有者喪失、ビルド不一致で最適化を破棄し、完全な永続履歴を Replay します。

Python SDK 2.5.0 は Server 2.5.10 以降と使います。キャッシュは既定で無効です。`sticky_cache_capacity` で有効化し、保持履歴のバイト上限と TTL を設定します。エンコード済み履歴と、検証済みページカーソルの再利用により、再ダウンロードを減らせます。デコードと決定的 Replay 用の追加メモリも見込んでください。[Python の Sticky 実行ガイドと実行例](https://python.durable-workflow.com/guides/sticky-execution/)を参照してください。

Rust SDK 3.4.0 も同じ公開 Server 基準に対応します。`Worker::sticky_cache(StickyCacheOptions::new(...))` で有効にし、エンコード済み履歴のバイト上限と TTL を設定します。各 Replay は新しいスナップショットをデコードし、温まったキャッシュのヒットを受け入れる前に、再使用カーソルを現在のリースと永続履歴で検証します。キャッシュは履歴であり、生きたワークフローやセッションのリソースではありません。[StickyCacheOptions](https://rust.durable-workflow.com/durable_workflow/struct.StickyCacheOptions.html) と [Rust 実行例](https://github.com/durable-workflow/sdk-rust/blob/3.4.0/examples/sticky_execution.rs)を参照してください。

Server 2.5.10 は PHP SDK 2.2.0 より前でも完全な Replay を維持します。StartAccepted で始まる履歴の Replay ヒントを使うには、PHP SDK 2.2.0 以降を使用します。

Sticky アフィニティは所有者のためのタスク予約やマッチング優先権ではありません。所有者のワークフロー枠が満杯のときを含め、別の稼働 Worker が有効なアフィニティ中に取得でき、`forced_cold_replay` と表示されます。TTL を増やしても、所有者を待つようにはなりません。

強制コールド Replay は、キャッシュ最適化を利用できなかった診断情報であり、ワークフローの正しさの失敗ではありません。空のキャッシュでも決定性を維持してください。[マッチングと診断の規則](/docs/features/sticky-execution#routing-identity)を参照してください。

## 安全な既定値とローリング更新 {#safe-defaults-and-rolling-fleets}

通常のワークフローにセッションや Sticky の設定は不要です。混在バージョンの Worker 群では、Server が機能固有の完了情報を受け付ける前に、交渉済みプロトコル、平坦な能力、構造化マニフェスト、正確なキャッシュ同一性を確認し、最低条件を満たさなければ拒否します。

公開済みの[SDK 間シナリオマニフェスト](/platform-conformance/portable-worker-affinity-runtime-scenarios.json)は、宣言の真実性、ローカルアクティビティの Replay、セッション保有者の喪失と再取得、Sticky ヒットと退避、Worker 置換、強制コールド Replay、設定不要のワークフローを対象にしています。

Laravel 組み込みの実装は、[ローカルアクティビティ](/docs/features/local-activities)、[Worker セッション](/docs/features/worker-sessions)、[Sticky 実行](/docs/features/sticky-execution)を参照してください。これらは Workflow パッケージの API です。service Worker には対応する SDK の API を使用します。
