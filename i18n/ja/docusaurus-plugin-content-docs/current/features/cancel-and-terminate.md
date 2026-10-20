---
sidebar_position: 16
---

# キャンセルと強制終了 {#cancel-and-terminate}

このガイドは埋め込み Laravel の `Workflow\V2\WorkflowStub` API を扱います。サービスモードでは [PHP SDK ガイド](https://php.durable-workflow.com/)、[Python のキャンセルリファレンス](https://python.durable-workflow.com/reference/errors/#durable_workflow.errors.ActivityCancelled)、[Rust のライフサイクル API](https://rust.durable-workflow.com/durable_workflow/struct.Client.html#method.cancel_workflow)を使ってください。

キャンセルと強制終了は実行中のワークフローを閉じる正式な永続コマンドです。両方ともコマンド履歴と型付き履歴に記録され、Waterline に表示されます。

現在の埋め込み API では、両方とも直ちに実行を閉じます。**キャンセル**は `cancelled`、**強制終了**は `terminated` を記録します。閉じたワークフロー内のクリーンアップはスケジュールしません。埋め込み Laravel は期限付きの協調的クリーンアップ用に `requestCancellation()` も提供します。Server と PHP、Python、Rust SDK でも、明示的に有効化した Worker で別の協調的要求をサポートします。機能、期限、クリーンアップ、復旧の契約は[協調的キャンセル](/docs/polyglot/cancellation)を参照してください。

## キャンセル {#cancel}

キャンセルは直ちに `cancelled` に遷移し、永続履歴を記録します。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->cancel();

$result->accepted();   // true
$result->outcome();    // "cancelled"
$result->commandId();  // Durable command id
$result->reason();     // null (no reason provided)
```

### 理由付きキャンセル {#cancel-with-reason}

監査記録、コマンド履歴、Waterline でユーザー、ポリシー、運用者によるキャンセルを区別するため、構造化した理由を渡せます。

```php
$result = $workflow->cancel('Customer requested cancellation');

$result->reason(); // "Customer requested cancellation"
```

理由は永続コマンド記録と、型付きの `CancelRequested`、`WorkflowCancelled` の両方に保存され、リプレイ、エクスポート、オフライン解析でも残ります。

### キャンセルが行うこと {#what-cancel-does}

受理時、エンジンは未完了のアクティビティ実行とタイマーを閉じ、実行を `cancelled` にし、キャンセルされた子を待つ親を再開して結果を観測できるようにします。

### キャンセルを拒否する条件 {#cancel-is-rejected-when}

- 未開始のインスタンス: `rejection_reason = instance_not_started`
- 既に閉じた現在の実行: `rejection_reason = run_not_active`
- 過去（現在ではない）の実行を指定: `rejection_reason = selected_run_not_current`

## 強制終了 {#terminate}

強制終了は後続コードをスケジュールせず直ちに閉じます。キャンセルと同様にクリーンアップ時間は設けません。`terminated` という別の結果が適切な場合に使います。

```php
$result = $workflow->terminate();

$result->accepted();   // true
$result->outcome();    // "terminated"
```

### 理由付き強制終了 {#terminate-with-reason}

```php
$result = $workflow->terminate('Operator emergency shutdown');

$result->reason(); // "Operator emergency shutdown"
```

### 強制終了が行うこと {#what-terminate-does}

キャンセルと同じトランザクション手順に従いますが、次が異なります。

- `TerminateRequested` と `WorkflowTerminated` を記録します。
- `failure_category = terminated`、`propagation_kind = terminated` の `WorkflowFailure` 行を作ります。
- 実行に `closed_reason = terminated` を設定します。
- ワークフローコードをそれ以上スケジュールしません。

### 強制終了を拒否する条件 {#terminate-is-rejected-when}

キャンセルと同じ条件です。

## 実行を指定するコマンド {#run-targeted-commands}

どちらも現在の実行の代わりに特定の実行を対象にできます。

```php
$selectedRun = WorkflowStub::loadRun($runId);
$result = $selectedRun->attemptCancel('Draining old run');

$result->targetScope(); // "run"
```

対象が現在の実行でなければ `selected_run_not_current` で拒否します。応答は `requested_run_id`（指定した実行）と `resolved_run_id`（次に使う現在の実行）を含みます。

## 例外を投げない API {#non-throwing-api}

例外なしで拒否を扱うには `attemptCancel()` と `attemptTerminate()` を使います。

```php
$result = $workflow->attemptCancel('Duplicate order');

if ($result->rejected()) {
    $result->rejectionReason(); // e.g. "run_not_active"
}
```

`cancel()` と `terminate()` は拒否時に `LogicException` を投げます。

## Webhook {#webhooks}

Webhook ルートからも使えます。

```text
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

本文で理由を渡します。

```json
{
  "reason": "Operator: duplicate order"
}
```

応答はコマンド結果、公開インスタンス ID、理由を含みます。

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J10000000000000000000021",
  "reason": "Operator: duplicate order",
  "command_id": "01J40000000000000000000021",
  "command_status": "accepted"
}
```

## キャンセルを意図せず例外処理に吸収しない {#cancellation-is-not-an-error-you-catch-by-accident}

キャンセルは予期しないアプリエラーではなく明示的なライフサイクル結果です。埋め込みの `Workflow\V2\Exceptions\WorkflowCancelledException` は `\Exception` ではなく `\Error` を継承します。`catch (\Exception $e)` では捕捉せず、`catch (\Throwable $t)` では捕捉します。

キャンセル済みの結果を読むときに他の失敗と区別するなら、例外名を指定して捕捉してください。結果取得側で捕捉しても実行は再び開かれず、その中のクリーンアップもスケジュールされません。

## Waterline {#waterline}

Waterline は選択実行の詳細に両操作を提供します。詳細の `can_cancel` と `can_terminate` は永続状態から決まります。

コマンド履歴は理由、呼び出し元の識別情報、結果を表示します。理由が指定されていれば `commands[*].reason` に運用者や呼び出し元の理由が入ります。

## 状態の対応 {#status-mapping}

どちらも一覧ルーティングでは `failed` 分類に入ります。生の `status` と `closed_reason` が区別します。

| 状態 | 状態の分類 | 終了理由 |
| --- | --- | --- |
| `cancelled` | `failed` | `cancelled` |
| `terminated` | `failed` | `terminated` |

## 型付き履歴 {#typed-history}

キャンセルは次の履歴を生成します。

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
CancelRequested       <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowCancelled     <- failure_id, failure_category, reason when supplied
```

強制終了は次を生成します。

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
TerminateRequested    <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowTerminated    <- failure_id, failure_category, reason when supplied
```

## キャンセルと強制終了の比較 {#cancel-vs-terminate}

| | キャンセル | 強制終了 |
| --- | --- | --- |
| 後続コードをスケジュール | いいえ | いいえ |
| 未完了アクティビティをキャンセル | はい | はい |
| 未完了タイマーをキャンセル | はい | はい |
| 理由メタデータ | あり | あり |
| 永続コマンド履歴 | あり | あり |
| 親が子の結果を受信 | はい | はい |
| 失敗行を記録 | はい（`cancelled`） | はい（`terminated`） |
| 状態の分類 | `failed` | `failed` |
| 終了理由 | `cancelled` | `terminated` |
