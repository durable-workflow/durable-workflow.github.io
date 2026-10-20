---
sidebar_position: 5
title: Worker プロトコル
description: ポーリング、リース、履歴リプレイ、ハートビート、完了、外部タスク結果のために、バージョン付き Worker プレーンプロトコルを実装します。
tags:
  - worker-protocol
  - external-workers
  - polyglot
keywords:
  - Worker プロトコル
  - 外部 Worker ポーリング
  - ワークフロータスクブリッジ
---

# Worker プロトコル {#worker-protocol}

Durable Workflow は2つのブリッジ契約を通じて、バージョン付き Worker プロトコルを公開します。この契約は、スタンドアロン Durable Workflow Server を含む外部 Worker が、ワークフロータスクとアクティビティタスクのポーリング、クレーム、実行、完了に使う操作全体を定義します。

## プロトコルバージョン {#protocol-version}

現在 Server が広告するプロトコルバージョンは **1.20** です。semver 形式の番号に従います。

- **メジャー**は後方互換性のない変更（新しい必須フィールド、操作の削除、ページングの意味の変更）で上げる。
- **マイナー**は追加変更（新しい任意フィールド、新しい非終了コマンド型）で上げる。

Worker は同じメジャー内の古いマイナーを使えます。`1.N` を広告する Server は `M <= N` のとき `X-Durable-Workflow-Protocol-Version: 1.M` を受け入れ、レスポンスに広告中の `1.N` を返します。したがって既定の `1.20` Server は要求バージョン `1.0` から `1.20` を受け入れます。デプロイ前に各 SDK の必要マイナーと任意の機能プロファイルを確認してください。欠落・不正なヘッダー、異なるメジャー、Server より新しい Worker マイナーは安全側に失敗します。

PHP SDK 2.3.2、Python SDK 2.5.7、Rust SDK 3.5.0 は既定で `1.20` を使います。これらは古い互換 Server 向けに明示的な `1.19` 選択にも対応します。協調キャンセルなどの任意の Worker 機能は引き続き明示的なオプトインです。プロトコルバージョンの選択では有効になりません。設定と公開互換性メタデータは[各 SDK のドキュメント](/docs/polyglot/deployment-modes/)を参照してください。

プログラムからプロトコルの完全な説明を取得できます。

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$summary = WorkerProtocolVersion::describe();
// Returns version, verb lists, command types, and pagination defaults.
```

## 機能ディスカバリー {#capability-discovery}

スタンドアロン Server は `GET /api/cluster/info` の `worker_protocol.server_capabilities` に Worker プロトコル機能を公開します。同じオブジェクトが、ポーリング、ハートビート、完了、失敗を含む Worker プレーンのレスポンスで `server_capabilities` として返されます。

任意のコマンドフィールドを送る前に次を読みます。

- `supported_workflow_task_commands`: ワークフロータスク完了が受け入れるコマンド型。
- `poll_status`: リースなしでも機械可読状態を返し、`task: null` からキュー状態を推測させず `leased`、`empty`、`throttled`、`unavailable` を区別する。
- `activity_retry_policy` と `activity_timeouts`: アクティビティコマンドの再試行・タイムアウト設定。
- `worker_session_verbs` と `worker_sessions`: Worker セッションのライフサイクル操作、アクティビティコマンドフィールド、更新動作、失敗検出、終了状態。ランタイム構造は [`worker-sessions-runtime.schema.json`](/platform-protocol-specs/worker-sessions-runtime.schema.json) に定義する。
- `child_workflow_retry_policy` と `child_workflow_timeouts`: 子ワークフローの再試行・タイムアウト設定。
- `parent_close_policy`: 子ワークフローの親終了ポリシー対応。
- `query_tasks`: 外部ランタイム向けに Server がルーティングするワークフロークエリタスク。
- `non_retryable_failures`: ワークフローとアクティビティの失敗メタデータ対応。

ポーリング前に各 Worker は `POST /api/worker/register` で名前空間、タスクキュー、ランタイム、対応型キー、ローカル容量を登録する必要があります。[名前空間、認証、Worker 登録](/docs/polyglot/namespace-auth-workers)は登録ペイロードとロール別認証契約を固定します。これらの操作を支える実行可能タスク検出とリース割り当てのより広い契約は、[タスクのマッチングとディスパッチ](/docs/polyglot/task-matching-dispatch)を参照してください。複数の永続ステップにわたるアクティビティのアフィニティは [Worker セッション](/docs/features/worker-sessions)を参照してください。

## 実行の意味 {#execution-semantics}

Worker トランスポートは少なくとも1回の分散調整であり、正確に1回の配信ではありません。

- ワークフロータスクのリプレイはコミット済み履歴から状態を再構築する。ワークフローレベルの再試行ではない。
- アクティビティタスクのリース期限切れで、別 Worker への再配信が起きる場合がある。
- 別の試行が永続的な競合に勝っているため、遅い完了・失敗報告は古いものとして拒否される場合がある。

Worker やキャリアが他システムと通信する場合、既定のリモート冪等性キーには `activity_execution_id` を使います。同じ論理アクティビティ実行の別試行を下流システムで区別する必要がある場合だけ `activity_attempt_id` を使います。

これらの操作を支えるリプレイ、再試行、リース期限切れ、再配信、正確に1回の永続履歴の正本契約は、[実行保証と冪等性](/docs/constraints/execution-guarantees)を参照してください。

## ワークフロータスクブリッジ {#workflow-task-bridge}

`WorkflowTaskBridge` 契約は、外部 Worker が永続ワークフロータスクとやり取りする方法を定義します。

| 操作 | 説明 |
|------|-------------|
| `poll` | キューと互換性条件に一致する実行可能ワークフロータスクを探す |
| `claim` / `claimStatus` | 特定タスクをクレームし、5分のリースを取得する |
| `historyPayload` | クレーム済みタスクの完全なリプレイ履歴を取得する |
| `historyPayloadPaginated` | 大規模ワークフローの履歴をページ単位で取得する |
| `execute` | パッケージ実行器でプロセス内でタスクをクレームし実行する |
| `complete` | 外部 Worker のコマンドを送信してタスクを完了する |
| `fail` | 外部 Worker からタスク失敗を記録する |
| `heartbeat` | クレーム済みタスクのリースを延長する |

### ページ分割した履歴 {#paginated-history}

大きい履歴を持つワークフローは、`historyPayloadPaginated` でイベントをページ単位で取得します。

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;

$bridge = app(WorkflowTaskBridge::class);

$afterSequence = 0;
$allEvents = [];

do {
    $page = $bridge->historyPayloadPaginated($taskId, $afterSequence, 500);
    $allEvents = array_merge($allEvents, $page['history_events']);
    $afterSequence = $page['next_after_sequence'] ?? $afterSequence;
} while ($page['has_more']);
```

既定のページサイズは500イベント（`WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` と、Server が Worker プロトコル機能に公開する `default_history_page_size` に一致）、最大1000です。Server は Worker プロトコルマニフェストで異なる有効既定値を広告できるため、値を固定せず公開機能を読むことを優先してください。レスポンスはカーソルページング用の `has_more` と `next_after_sequence` を含みます。

### 履歴の圧縮 {#history-compression}

非常に大きい履歴では、ブリッジや Server は転送量を減らすためにイベントペイロードを圧縮できます。圧縮はオプトインで、呼び出し元が `Accept-Encoding` 形式のパラメーターで要求する必要があります。

レスポンス内のイベント数が圧縮しきい値（50イベント）を超えると、ブリッジは次を返す場合があります。

- `history_events`: `[]`（イベントが圧縮キーに入っていることを示す空配列）
- `history_events_compressed`: base64 エンコードされた圧縮ペイロード
- `history_events_encoding`: 使用アルゴリズム（`gzip` または `deflate`）

呼び出し元は base64 をデコードし、指定アルゴリズムで展開し、JSON デコードして元の `history_events` 配列を復元します。

```php
use Workflow\V2\Support\HistoryPayloadCompression;

// Compress a history payload for transfer (bridge/server side).
$compressed = HistoryPayloadCompression::compress($payload, 'gzip');

// Decompress on the worker side.
$original = HistoryPayloadCompression::decompress($compressed);
```

圧縮を要求しない場合やイベント数がしきい値未満の場合、標準の非圧縮 `history_events` 配列を返します。

### ロングポーリングの意味 {#long-poll-semantics}

両方の `poll` 操作は任意のロングポーリングモードに対応します。`timeout_seconds` を指定すると、ブリッジや Server は直ちに空結果を返さず、該当タスクが実行可能になるまで最大その期間接続を保持します。

| パラメーター | 既定値 | 最小 | 最大 |
|-----------|---------|-----|-----|
| `timeout_seconds` | 30 | 1 | 60 |

動作:

- 待機中にタスクが実行可能になると直ちに返す。
- タスクなしで期限切れになると通常のポーリングエンベロープを保ち、`task: null` と `poll_status: "empty"` を返す。
- 終了処理中でなければ、空のロングポーリングレスポンスに対し直ちに再試行するべき。
- 早期切断を避けるため、HTTP トランスポートのタイムアウトは60秒より長くするべき。

すべての Worker ポーリングレスポンスは `poll_status` を含みます。

| 値 | 意味 |
|------|---------|
| `leased` | Server がこの Worker にタスクをリースした。 |
| `empty` | 短いポーリングまたはロングポーリングの終了前に一致するタスクは実行可能にならなかった。 |
| `throttled` | キューに実行可能タスクがあっても、受け入れ上限が Server のリースを妨げた。 |
| `unavailable` | キューかマッチング経路が一時的に利用不能。Worker は一時的なインフラ上の取得失敗として扱う。 |

空ポーリングをアイドル容量とみなす前に `poll_status` で分岐します。`task: null` と `poll_status: "throttled"` はバックプレッシャーであり、処理がないことではありません。

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$semantics = WorkerProtocolVersion::longPollSemantics();
// ['default_timeout_seconds' => 30, 'min_timeout_seconds' => 1, 'max_timeout_seconds' => 60]

// Clamp a caller-supplied timeout to the valid range.
$clamped = WorkerProtocolVersion::clampLongPollTimeout($userTimeout);
```

### ポーリングレスポンスの状態 {#poll-response-status}

Server はワークフロー、アクティビティ、クエリの各タスクポーリングで1つのレスポンス契約を維持します。

- `task`: リースしたタスクペイロード。リースしなかった場合は `null`。
- `poll_status`: ポーリング試行の機械可読結果。
- `protocol_version` と `server_capabilities`: 返された Worker プロトコルマニフェストフィールド。

Worker は `task` についてルート固有の想定をする前に `poll_status` で分岐するべきです。

| `poll_status` | 典型的な HTTP ステータス | 意味 |
| --- | --- | --- |
| `leased` | `200` | リースに成功し、`task` にペイロードが入る。 |
| `empty` | `200` | ポーリング終了前に一致するタスクは実行可能にならなかった。 |
| `throttled` | `200` | キュー受け入れ上限がこの試行の新しいリースを保留した。 |
| `unavailable` | `503` または `200` | Server がキューを安全に調整できず、型付き利用不能結果を返した。 |
| `draining` | `409` | Worker の build-id コホートがドレイン中で、Server は新規リースを拒否し `reason: "worker_draining"` を返す。 |

### 完了、ハートビート、失敗のリクエスト {#completion-heartbeat-and-fail-requests}

ワークフロータスクの `complete`、`heartbeat`、`fail` はすべて、ポーリングまたはクレームのレスポンスから2つのリース ID フィールドを返す必要があります。

| フィールド | 型 | 説明 |
|------|------|-------------|
| `lease_owner` | string | リース保持者の Worker ID。`poll` または `claim` が返した `lease_owner` と一致する必要がある。 |
| `workflow_task_attempt` | 1以上の整数 | リースしたタスクの試行番号。`poll` または `claim` が返した `workflow_task_attempt` と一致する必要がある。 |

古い試行や誤ったリース所有者はコマンド適用前に拒否されます。期限切れ Worker が再クレームされたタスクへリプレイコマンドをコミットすることはできません。

エンドポイントと本文:

- `POST /api/worker/workflow-tasks/{task_id}/complete`: `lease_owner`、`workflow_task_attempt`、空でない `commands` 配列が必要。構造は[コマンド型](#command-types)を参照。
- `POST /api/worker/workflow-tasks/{task_id}/heartbeat`: `lease_owner` と `workflow_task_attempt` が必要。更新した期限と現在の実行状態を返す。
- `POST /api/worker/workflow-tasks/{task_id}/fail`: `lease_owner`、`workflow_task_attempt`、必須の `message` と任意の `type`、`stack_trace` を持つ `failure` オブジェクトが必要。

完了要求の例:

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1,
  "commands": [
    { "type": "complete_workflow" }
  ]
}
```

ハートビート要求の例:

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1
}
```

失敗要求の例:

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1,
  "failure": {
    "message": "Replay mismatch at event 7",
    "type": "DeterminismFailed"
  }
}
```

### コマンド型 {#command-types}

ワークフロータスクの完了時、外部 Worker は型付きコマンドリストを送ります。完了1回につき終了コマンドは最大1つです。

**非終了コマンド**（0個以上、順番に処理）:

| 型 | 必須フィールド | 説明 |
|------|----------------|-------------|
| `schedule_activity` | `activity_type` | アクティビティタスクを実行用にスケジュール |
| `start_timer` | `delay_seconds` | 永続タイマーをスケジュール |
| `start_child_workflow` | `workflow_type` | 子ワークフローインスタンスを開始 |
| `complete_update` | `update_id` | 受理済み更新を適用・完了済みにする |
| `fail_update` | `update_id`, `message` | 受理済み更新を失敗にする |
| `record_side_effect` | `result` | 決定的な副作用結果を記録 |
| `record_version_marker` | `change_id`, `version`, `min_supported`, `max_supported` | バージョニング判断を記録 |
| `upsert_search_attributes` | `attributes` | ワークフロー実行のインデックス付きメタデータを upsert |

`schedule_activity` は任意の `retry_policy`、`start_to_close_timeout`、`schedule_to_start_timeout`、`schedule_to_close_timeout`、`heartbeat_timeout` を受け入れます。`retry_policy` は `max_attempts`、`backoff_seconds`、`non_retryable_error_types` を使います。

`start_child_workflow` は任意の `parent_close_policy`、`retry_policy`、`execution_timeout_seconds`、`run_timeout_seconds` を受け入れます。`parent_close_policy` は `abandon`、`request_cancel`、`request_cancellation`、`terminate` のいずれかです。`request_cancel` は子を即時に閉じ、`request_cancellation` は元のキャンセル ID と期限で協調クリーンアップを要求します。[協調キャンセル](/docs/polyglot/cancellation)を参照してください。子の再試行ポリシーは、アクティビティと同じ `max_attempts`、`backoff_seconds`、`non_retryable_error_types` の構造です。子の実行失敗後に再試行バックオフを適用します。不正な子開始コマンドはプロトコルエラーであり、子の再試行回数を消費しません。

`complete_update` は Worker のハンドラー適用後、`update_id` の受理済み更新を閉じます。ワークフロー完了結果と同じ `{codec, blob}` エンベロープの任意の `result` を受け入れます。`fail_update` は受理済み更新を失敗として閉じ、必須の `message` に加え、任意の `exception_class`、`exception_type`、`non_retryable` を受け入れます。

**終了コマンド**（最大1つ）:

| 型 | 必須フィールド | 説明 |
|------|----------------|-------------|
| `complete_workflow` | — | 実行を完了にする（任意の `result`） |
| `fail_workflow` | `message` | 実行を失敗にする |
| `continue_as_new` | — | 実行を閉じ新しい実行を開始する（任意の `arguments`、`workflow_type`） |

ワークフロータスクのリース中にキャンセルや終了が実行を閉じると、`history`、`heartbeat`、`complete`、`fail` は Worker プロトコルエンベロープを保ちながら `reason: "run_closed"` で拒否します。レスポンスには `can_continue: false`、`cancel_requested: true`、`run_cancelled` や `run_terminated` など具体的な `stop_reason` も含み、汎用リースエラーとキャンセル観測を区別できます。同じレスポンスは永続実行レコードの `run_closed_reason` と `run_closed_at` を含み、リース中タスクを停止した正確な終了状態をログに残せます。

ワークフロータスクのポーリングレスポンスは、永続タスクペイロードからコピーした安定した再開コンテキストを含みます。

| フィールド | 意味 |
|------|---------|
| `workflow_wait_kind` | このタスクが適用する待機。`update`、`signal`、`child`、`condition`、`timer`、通常のリプレイ・開始では `null` |
| `open_wait_id` | `update:{id}`、`signal-application:{id}` など安定した待機 ID |
| `resume_source_kind` / `resume_source_id` | タスクを起こした永続ソース。`workflow_update`、`workflow_signal`、`timer`、`child_workflow_run` など |
| `workflow_update_id` | 更新を適用するタスクの受理済み更新 ID |
| `workflow_signal_id` | シグナルを適用するタスクの受理済みシグナル ID |
| `signal_name` / `signal_wait_id` | シグナルまたはタイマー付きシグナル待機を適用するタスクの、シグナル対象と安定した待機 ID |
| `workflow_command_id` | 存在する場合、タスクを生成したコントロールプレーンコマンド ID |
| `activity_execution_id` / `activity_attempt_id` / `activity_type` | 完了・失敗したアクティビティ後に再開するタスクのアクティビティ識別子 |
| `child_call_id` / `child_workflow_run_id` | 子ワークフローを解決するタスクの子待機識別子 |
| `timer_id` / `condition_wait_id` | タイマー後に再開するタスクの、単純タイマーとタイマー付き条件の識別子 |
| `condition_key` / `condition_definition_fingerprint` | タイマー付き条件待機が記録した、安定した条件ラベルと述語フィンガープリント |
| `workflow_sequence` / `workflow_event_type` | イベントに基づくアクティビティ、子、タイマー解決タスクの履歴シーケンスとイベント型 |

非該当フィールドは `null` です。SDK Worker がリース中タスクを受理済み更新、シグナル、アクティビティ結果、子の解決、タイマー付き待機と関連付ける際は、履歴走査よりこれらを優先するべきです。単純タイマーの再開は `workflow_wait_kind: "timer"`、`open_wait_id: "timer:{timer_id}"`、`resume_source_kind: "timer"`、`timer_id` を設定します。シグナルの再開は `workflow_wait_kind: "signal"` と `signal_name` を設定し、受理済みシグナル適用タスクは `workflow_signal_id` も、タイマー付きシグナル待機は `signal_wait_id` と発火する `timer_id` を設定します。条件タイムアウトの再開は `workflow_wait_kind: "condition"`、`condition_wait_id`、キー付きなら `condition_key` と `condition_definition_fingerprint` を設定します。

## クエリタスク {#query-tasks}

外部ランタイムがコードを所有するワークフローをコントロールプレーンのクエリが対象とする場合、スタンドアロン Server は PHP プロセス内でリプレイできません。代わりに一時クエリタスクを作り、そのワークフローのキュー上にいる有効でクエリ対応の Worker の実行を待ちます。Server プロセス外にコードを持つリモート PHP SDK Worker も含みます。

クエリタスクは読み取り専用です。Worker は渡された履歴をリプレイし、登録したクエリハンドラーを呼び、タスクを完了または失敗させます。永続履歴イベントを書かず、呼び出し元のコントロールプレーンクエリのタイムアウト後は再試行しません。

| エンドポイント | 説明 |
|----------|-------------|
| `POST /api/worker/query-tasks/poll` | Worker の登録キューでクエリタスクをロングポーリング |
| `POST /api/worker/query-tasks/{query_task_id}/complete` | クエリ結果を送信 |
| `POST /api/worker/query-tasks/{query_task_id}/fail` | クエリを拒否または失敗にする |

ポーリング要求:

```json
{
  "worker_id": "py-worker-1",
  "task_queue": "orders"
}
```

ポーリングレスポンス:

```json
{
  "poll_status": "leased",
  "task": {
    "query_task_id": "01J...",
    "query_task_attempt": 1,
    "workflow_id": "order-123",
    "run_id": "01J...",
    "workflow_type": "order-processing",
    "query_name": "status",
    "payload_codec": "avro",
    "workflow_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "query_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "history_events": [],
    "task_queue": "orders",
    "lease_owner": "py-worker-1",
    "lease_expires_at": "2026-04-18T12:00:00.000000Z"
  },
  "protocol_version": "1.13",
  "server_capabilities": { "query_tasks": true }
}
```

リースを返さないとき `task` は `null` です。`poll_status` で通常の空待機とスロットリング・一時的なキュー利用不能を区別します。完了・失敗時は `lease_owner` と `query_task_attempt` を返す必要があります。古い試行や誤ったリース所有者は拒否します。

完了要求:

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "result": { "status": "ready" },
  "result_envelope": { "codec": "avro", "blob": "<base64-avro-bytes>" }
}
```

失敗要求:

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "failure": {
    "reason": "rejected_unknown_query",
    "message": "unknown query 'status'",
    "type": "QueryFailed"
  }
}
```

ワークフロー型に一致するハンドラーがなければ `reason: "rejected_unknown_query"` を使い、コントロールプレーンの呼び出し元は `404` を受け取ります。ほかの Worker 側クエリ失敗は `reason: "query_rejected"` を使い `409` を返すべきです。受け入れられる有効な Worker がなければ `query_worker_unavailable`、設定した時間までに結果が届かなければ `query_worker_timeout` を返します。

## アクティビティタスクブリッジ {#activity-task-bridge}

`ActivityTaskBridge` 契約は外部 Worker がアクティビティタスクとやり取りする方法を定義します。

| 操作 | 説明 |
|------|-------------|
| `poll` | キューと互換性条件に一致する実行可能アクティビティタスクを探す |
| `claim` / `claimStatus` | リース付きで特定タスクをクレーム |
| `complete` | 結果を伴うアクティビティ完了を記録 |
| `fail` | 任意のコーデックタグ付き `failure.details` とともに失敗を記録 |
| `status` | リースを更新せず生存・キャンセル状態を確認 |
| `heartbeat` | リースを延長し任意の進捗を報告 |

ハートビート応答は `can_continue` と `cancel_requested` を含み、長時間のアクティビティがキャンセル要求に対応できます。実行単位のキャンセル・終了コマンドがリース中アクティビティを停止すると、ハートビート、完了、失敗のレスポンスは `run_closed_reason` と `run_closed_at` も含みます。

## ペイロードコーデック {#payload-codecs}

Worker プロトコル境界を越える各ペイロードバイト文字列には、付属 blob の形式を示す **`payload_codec`** タグが付きます。v2 は言語中立な **`avro`** だけを使います。SDK（PHP、Python、Go、TypeScript、Rust）はランタイムやアプリケーションキーを共有せずエンコード・デコードできます。稼働中 Server は `GET /api/cluster/info` の **`capabilities.payload_codecs`** に対応コーデックを広告します。

### `avro` コーデック {#the-avro-codec}

`avro` は v2 の型付き値コーデックです。すべてのペイロードは固定再帰スキーマ `durable_workflow.protocol.Value` と標準 Avro single-object フレームを使います。名前付き分岐により、ワークフロー固有スキーマやレジストリなしで、真偽値、符号付き64ビット整数、有限の倍精度浮動小数点数、バイト列、UTF-8 文字列、リスト、文字列キーのマップを保持します。[Avro Value プロトコル](/docs/polyglot/avro-value-protocol/)を参照してください。

### ワイヤー形式: ペイロードエンベロープ {#wire-format-payload-envelope}

ペイロードバイト列を持つフィールド（`arguments`、`result`、`payload` など）では、不透明な文字列とともにコーデックを公開します。ポーリングレスポンスの例です。

```json
{
  "task_id": "...",
  "payload_codec": "avro",
  "arguments": {
    "codec": "avro",
    "blob": "<base64-avro-bytes>"
  },
  "history_events": [ ... ]
}
```

Worker は `payload_codec` を読み、`avro` と確認してからデコードします。未知の値はエラーであり、嗅ぎ分けや推測を試みるべきではありません。

アクティビティ完了は同じ `{codec, blob}` エンベロープで `result` を送ります。アクティビティ失敗は `failure.details` に構造化診断ペイロードを送れ、存在する場合これも `{codec, blob}` エンベロープです。Server は blob をそのまま保存し、永続失敗ペイロードとともに `details_payload_codec` を記録するため、PHP 以外の Worker が PHP シリアライズなしで診断データを往復できます。

安定した言語横断の失敗サーフェスは `activity_type`、`failure_category`、`exception_type`、`message`、`code`、`non_retryable`、コーデックタグ付き `details` です。例外クラス名、ソースファイルパス、行番号、スタックトレースなどランタイムフィールドは診断専用です。SDK は既定の `exception_payload` にこれらを公開するべきではなく、Worker または Server が明示的に `diagnostics` または `runtime_diagnostics` エンベロープを記録した場合だけ表示できます。

### ワークフローの開始 {#starting-a-workflow}

`POST /api/workflows` は2形式の `input` を受け入れます。

1. **通常の JSON 配列:** Server は各 JSON 値を固定 Avro Value スキーマへ変換します。JSON 入力はバイト列分岐を表せないため、必要なクライアントは明示的な Avro エンベロープを送ります。

   ```json
   { "workflow_type": "MyWorkflow", "input": ["hello", 42] }
   ```

2. **明示的なエンベロープ:** エンコード済みバイト列を持つクライアント向けです。

   ```json
   {
     "workflow_type": "MyWorkflow",
     "input": { "codec": "avro", "blob": "<base64-avro-bytes>" }
   }
   ```

Server は blob をそのまま保存し、実行に `avro` コーデックを付けます。

コーデックは `WorkflowRun` に保存し、**実行の寿命を通じて伝播します**。アクティビティ引数、結果、シグナル・更新引数、子ワークフロー入力はすべて Avro エンコードです。

HTTP API ではなく PHP の `WorkflowStub::make(...)->start(...)` から開始する組み込み・パッケージの開始も、最終 v2 の Avro 専用契約で新実行の既定値を解決します。

## ブリッジの解決 {#resolving-the-bridges}

両ブリッジは Laravel コンテナに登録され、直接解決できます。

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;
use Workflow\V2\Contracts\ActivityTaskBridge;

$workflowBridge = app(WorkflowTaskBridge::class);
$activityBridge = app(ActivityTaskBridge::class);
```

## 関連ガイド {#related-guides}

- [Server](./server.md)は、このプロトコルをホストするコントロールプレーンエンドポイントとデプロイ構成を記載します。
- [外部実行サーフェス](./external-execution.md)は、Worker プロトコルを基盤とするアクティビティ相当の Worker、ブリッジ、ハンドラー契約を説明します。
