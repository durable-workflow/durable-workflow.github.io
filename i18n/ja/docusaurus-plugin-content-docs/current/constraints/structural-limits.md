---
sidebar_position: 5
---

# 構造上の制限 {#structural-limits}

構造上の制限は、1つのワークフロー実行のリソース消費を制限します。操作が設定上限を超える場合、エンジンは機械可読な失敗分類 `structural_limit` と具体的な制限種別を持つ型付き失敗を記録し、実行を失敗させます。無制限の fan-out、巨大なペイロード、メタデータの肥大化から保護します。

## 制限の種類 {#limit-kinds}

| 制限種別 | 既定値 | 制限するもの |
|---|---|---|
| `pending_activity_count` | 2,000 | 同時に未終了のアクティビティ実行数 |
| `pending_child_count` | 1,000 | 同時に未終了の子ワークフロー数 |
| `pending_timer_count` | 2,000 | 同時に保留中のタイマー数 |
| `pending_signal_count` | 5,000 | 同時に未処理のシグナル数 |
| `pending_update_count` | 500 | 同時に未解決の更新数 |
| `command_batch_size` | 1,000 | 1回の並列 fan-out（`all()`）の項目数 |
| `payload_size_bytes` | 2 MiB | 単一の引数ペイロードのシリアライズ後のサイズ |
| `memo_size_bytes` | 256 KiB | 索引のないメモのシリアライズ後のサイズ |
| `search_attribute_size_bytes` | 40 KiB | 索引付き検索属性のシリアライズ後のサイズ |
| `history_transaction_size` | 5,000 | 1回のワークフロータスク実行で生成する履歴イベント数 |

スケジュール、記録、コマンド受理の時点で適用します。`0` はその種類の検査を無効にします。

## ソフトリミットの警告 {#soft-limit-warnings}

ハードリミットで実行を終了したりコマンドを拒否したりする前に、上限への接近を警告できます。保留中のアクティビティ、子、タイマー、シグナル、更新、コマンドバッチ数、履歴トランザクションイベント数が、設定した割合を超えると構造化警告を記録します。

既定の警告しきい値は **80%** です。たとえば `pending_activity_count` が既定の2,000なら1,600で警告します。実行は通常どおり続き、運用者は失敗前に Worker の増強、continue-as-new、上限変更などを行えます。

`workflows.v2.structural_limits.warning_threshold_percent` で設定します。

```env
DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT=80
```

`0` でソフトリミット警告をすべて無効にします。

警告ログは構造化コンテキストを含みます。

```
[Durable Workflow] Run 42 approaching structural limit [pending_activity_count]: 1620 / 2000 (81% utilization, warning at 80%).
```

`workflow_run_id`、`workflow_type`、`limit_kind`、`current`、`limit`、`utilization_percent` を含み、ログ集約やアラートと統合できます。

## 設定 {#configuration}

`workflows.v2.structural_limits` または環境変数で各上限を変更できます。

```php
// config/workflows.php
'v2' => [
    'structural_limits' => [
        'pending_activity_count' => (int) env('DW_V2_LIMIT_PENDING_ACTIVITIES', 2000),
        'pending_child_count' => (int) env('DW_V2_LIMIT_PENDING_CHILDREN', 1000),
        'pending_timer_count' => (int) env('DW_V2_LIMIT_PENDING_TIMERS', 2000),
        'pending_signal_count' => (int) env('DW_V2_LIMIT_PENDING_SIGNALS', 5000),
        'pending_update_count' => (int) env('DW_V2_LIMIT_PENDING_UPDATES', 500),
        'command_batch_size' => (int) env('DW_V2_LIMIT_COMMAND_BATCH_SIZE', 1000),
        'payload_size_bytes' => (int) env('DW_V2_LIMIT_PAYLOAD_SIZE_BYTES', 2097152),
        'memo_size_bytes' => (int) env('DW_V2_LIMIT_MEMO_SIZE_BYTES', 262144),
        'search_attribute_size_bytes' => (int) env('DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES', 40960),
        'history_transaction_size' => (int) env('DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE', 5000),
        'warning_threshold_percent' => (int) env('DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT', 80),
    ],
],
```

## 適用する箇所 {#enforcement-points}

### 保留数の制限（実行器側） {#pending-count-limits-executor-side}

アクティビティ、子、タイマーのスケジュール前に、その種類の未終了項目数を数えます。既に上限以上なら `StructuralLimitExceededException` で直ちに失敗します。

何千もの未完了操作を蓄積する無制限の並列 fan-out などを防ぎます。

```php
// This will fail if $items exceeds the pending_activity_count limit
$calls = [];
foreach ($items as $item) {
    $calls[] = fn () => activity(ProcessItemActivity::class, $item);
}
return all($calls); // Also checked against command_batch_size
```

大きなバッチは、上限内のチャンクに分けて処理します。

```php
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);
}
```

### 保留数の制限（受理側） {#pending-count-limits-intake-side}

コントロールプレーン、Webhook、`WorkflowStub` でシグナルや更新が到着すると、受理前に対象実行の未処理シグナル（`received`）や未解決更新（`accepted`）を数えます。

上限以上なら理由 `structural_limit_exceeded` でコマンドを**拒否**します。応答は原因を識別できる `structural_limit_kind`、`structural_limit_value`、`structural_limit_configured` を含みます。

実行器側と異なり、受理側は個別コマンドだけを拒否し、ワークフローを終了しません。実行はアクティブなまま、保留項目の処理後に再試行できます。

`request_id` を指定した Server の更新では、そのキーに対する拒否を保持します。容量や設定が変わっても、同じキーは元の拒否を返します。拒否を確認し容量を回復した後、新たに受理を求める場合は新しいキーを使ってください。応答が不確かな場合は別です。新たな受理が安全か判断する前に、元の記録を取得してください。

```php
// If 5,000 signals are already pending, this will be rejected:
$result = $workflow->attemptSignal('process-item', $data);
if ($result->rejected()) {
    // $result->rejectionReason() === 'structural_limit_exceeded'
    // back off and retry later
}
```

### コマンドバッチサイズ {#command-batch-size}

`all()` はグループ内の葉操作の総数を `command_batch_size` と比較します。個々のスケジュール前に検査するため、バッチを部分的に開始せず明確に失敗します。

### ペイロードサイズ {#payload-size}

アクティビティや子をスケジュールするとき、引数をシリアライズして `payload_size_bytes` と比較します。超過なら操作のデータベース行を作る前に失敗します。

対象:

- **アクティビティ引数**: `scheduleActivity` が `ActivityCall` 引数をシリアライズする時点。
- **子ワークフロー引数**: `scheduleChildWorkflow` が開始引数をシリアライズする時点。子のインスタンス・実行行の作成前です。

```php
// A 3 MiB payload will fail with the default 2 MiB limit
activity(ProcessDocumentActivity::class, $threeMegabyteBlob);
```

上限を守るには、名前空間の[外部ペイロードストレージ](../features/external-payload-storage.md)を有効にしてしきい値以上をオブジェクトストアへ透過的に移すか、自分でバイト列を保存してアプリレベルの参照を渡します。

```php
$ref = Storage::put('docs/incoming.pdf', $blob);
activity(ProcessDocumentActivity::class, $ref);
```

外部保存はハッシュ付き `durable-workflow.v2.external-payload-reference.v1` を履歴に記録して完全性を保ちます。上限が検査するのは元のバイト列ではなく参照エンベロープです。

### メモサイズ {#memo-size}

`upsertMemo()` で既存マップに結合し、結果を JSON 化して `memo_size_bytes` と比較します。超過なら保存前に失敗します。

### 履歴トランザクションサイズ {#history-transaction-size}

各ワークフロータスク（リプレイと前進の1ターン）は、スケジュール、タイマー作成、副作用記録、属性の upsert などの新イベントを生成します。`history_transaction_size` は1タスクの新規イベント総数を制限します。

制御を返さず1タスクで際限なくイベントを生成する暴走ループを検出します。

```php
// If a workflow schedules thousands of operations in one task,
// the history transaction limit prevents the task from growing
// without bound. Process large batches in bounded chunks instead.
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);  // Each chunk is a separate task execution
}
```

実行器の主ループの各反復の先頭で検査します。既存履歴を読むリプレイのイベントは数えず、現在のタスクで新たに書くものだけを数えます。

### 検索属性サイズ {#search-attribute-size}

`upsertSearchAttributes()` で既存属性に結合し、結果を JSON 化して `search_attribute_size_bytes` と比較します。超過なら保存前に失敗します。

## 失敗の分類 {#failure-taxonomy}

上限超過時は次を記録します。

- `failure_category = structural_limit` の `WorkflowFailure` 行。
- 次を持つ `WorkflowFailed` 履歴:
  - `failure_category = structural_limit`
  - `structural_limit_kind`: 超えた種類（`pending_activity_count`、`command_batch_size` など）。
  - `structural_limit_value`: 超過を起こした現在の件数やサイズ。
  - `structural_limit_configured`: 設定した上限。

機械可読なため、運用者、Waterline、外部ツールは自由記述の文章を解析せず原因を識別できます。

## ヘルスチェック {#health-check}

v2 のヘルススナップショットの `structural_limits` に現在の設定が含まれ、有効な上限を確認できます。

```json
{
  "structural_limits": {
    "pending_activity_count": 2000,
    "pending_child_count": 1000,
    "pending_timer_count": 2000,
    "pending_signal_count": 5000,
    "pending_update_count": 500,
    "command_batch_size": 1000,
    "payload_size_bytes": 2097152,
    "memo_size_bytes": 262144,
    "search_attribute_size_bytes": 40960,
    "history_transaction_size": 5000,
    "warning_threshold_percent": 80
  }
}
```

## バックエンドに依存する制限 {#backend-dependent-limits}

バックエンド機能スナップショットは、現在のインフラに合わせた全契約を公開します。多くは独立した設定値ですが、一部のバックエンドには追加制約があります。

- **SQS キュー**: [標準 SQS の遅延](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-message-timers.html)は900秒が上限です。長いタイマー、アクティビティのリトライ、タスク遅延は転送層で分割します。互換性のため `max_single_timer_delay_seconds: 900` を維持します。
- **SQLite**: 書き込みを直列化するため `concurrent_write_safety: limited` です。高い保留数上限は同時 Worker 負荷でロック競合を起こす場合があります。

早い SQS 配信は、永続タスクをリースせず、試行回数を消費せず、履歴やユーザーコードを実行せずに、上限付きメッセージを再予約します。元の `available_at` は維持します。期限になれば通常の実行と重複排除に従います。全体のワークフローとアクティビティの期限は待機中も進むため、その上限時間内のバックオフを選びます。遅延上限のないドライバーは要求した正確な遅延を維持します。

完全な契約は機能応答の `structural_limits` にあります。

```json
{
  "structural_limits": {
    "configured": { "pending_activity_count": 2000, "..." : "..." },
    "backend_adjustments": { "max_single_timer_delay_seconds": 900 },
    "effective": { "pending_activity_count": 2000, "max_single_timer_delay_seconds": 900, "..." : "..." },
    "issues": [
      {
        "component": "structural_limits",
        "severity": "info",
        "code": "queue_max_delay_constraint",
        "message": "The [sqs] queue driver limits delayed dispatch to 900 seconds; longer task delays are chunked by the transport layer."
      }
    ]
  }
}
```

## Waterline {#waterline}

例外テーブルに失敗分類 `structural_limit` を表示します。タイムラインの詳細は制限種別、現在値、設定上限を含みます。

## Server のリクエスト境界の制限 {#server-request-boundary-limits}

独立 Server は、タスク、シグナル、更新、クエリがコントロールプレーンに達する前に HTTP 境界で別の上限を適用します。データベース行を書かずに `422 validation_failed`（本文全体は `413 payload_too_large`）で直ちに拒否し、原因を知らせます。

| 制限 | 既定値 | 設定キー | 制限するもの |
|---|---|---|---|
| 本文サイズ | 2 MiB | `server.limits.max_payload_bytes` | HTTP 本文の総バイト数 |
| メモサイズ | 256 KiB | `server.limits.max_memo_bytes` | `POST /workflows` と `POST /schedules` のシリアライズ済みメモ |
| 検索属性数 | 100 | `server.limits.max_search_attributes` | 名前空間の登録済みカスタム属性数 |
| 検索属性キー長 | 128バイト | `server.limits.max_search_attribute_key_length` | 開始時の単一 SA キー長 |
| 検索属性値サイズ | 2 KiB | `server.limits.max_search_attribute_value_bytes` | 開始時の各文字列（配列は各要素） |
| シグナル・更新・クエリ名 | 256バイト | `server.limits.max_operation_name_length` | 名前の URL パスセグメント |
| `workflow_id` 長 | 128文字 | コントローラーの検証 | `POST /workflows` の ID |
| `workflow_type` / `task_queue` / `business_key` | 255文字 | コントローラーの検証 | `POST /workflows` の文字列 |
| `request_id` | 255文字 | コントローラーの検証 | シグナル・更新・キャンセル・強制終了の重複排除トークン |
| `reason` | 1,000文字 | コントローラーの検証 | キャンセル・強制終了・アーカイブの理由 |

各上限は `DW_*` 環境変数で個別に設定できます（全契約は `config/dw-contract.php`）。`0` はその制限のみ無効にし、他は維持します。

`GET /api/cluster/info` の `limits` に現在値を公開し、クライアントが実行時に確認できます。

```json
{
  "limits": {
    "max_payload_bytes": 2097152,
    "max_memo_bytes": 262144,
    "max_search_attributes": 100,
    "max_search_attribute_key_length": 128,
    "max_search_attribute_value_bytes": 2048,
    "max_operation_name_length": 256,
    "max_pending_activities": 2000,
    "max_pending_children": 2000
  }
}
```

検証エラーは標準形式で `reason: "validation_failed"` と、該当フィールド（`signal_name`、`update_name`、`query_name`、`search_attributes`、`memo` など）をキーにした `validation_errors` を返します。サイズ拒否は `reason: "payload_too_large"` と `413` です。
