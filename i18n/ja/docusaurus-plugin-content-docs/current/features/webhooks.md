---
sidebar_position: 13
---

# Webhook {#webhooks}

外部システムがワークフローを開始し、動的にシグナルを送れる Webhook を提供します。外部サービス、API、自動化ツールと統合できます。

## Webhook の有効化 {#enabling-webhooks}
アプリのルートファイル（`routes/web.php` または `routes/api.php`）に登録します。

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

公開するクラスの明示的なマップを渡します。エイリアスは公開ルートのセグメントになり、各クラスは `#[Type(...)]` または `workflows.v2.types.workflows` への登録で安定した永続型キーを持つ必要があります。全ルートは[明示的なコマンドとクエリの Webhook](#explicit-command-and-query-webhooks)を参照してください。

## 可視化メタデータ {#visibility-metadata}
`Workflow\V2\Webhooks::routes(...)` の開始ルートは予約済み `visibility` オブジェクトも受け付けます。可視化メタデータとして保存し、`handle()` には渡しません。

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_id": "order-123",
           "orderId": 123,
           "visibility": {
             "business_key": "order-123",
             "labels": {
               "tenant": "acme",
               "region": "us-east"
             },
             "memo": {
               "customer": {
                 "id": 42,
                 "name": "Taylor"
               },
               "source": "checkout"
             }
           }
         }'
```

`business_key` と `visibility.labels` はインスタンス、実行、サマリー、型付き開始履歴、選択実行詳細、エクスポートにコピーします。Waterline は完全一致のクエリパラメーターで一覧を絞り込めます。

`visibility.memo` はインスタンス、実行、型付き開始履歴、詳細、エクスポートにコピーし、後の `continueAsNew()` も既定で継承します。最上位は JSON オブジェクトで、内部はスカラー、`null`、配列、オブジェクトを使えます。`memo` は返却専用のメタデータで、一覧フィルターやサマリー検索には使いません。

## Webhook 認証 {#webhook-authentication}
既定では認証不要ですが、`config/workflows.php` で複数の方式を設定できます。

**重要:** 外部に URL を共有したり公開したりする場合は、トークンまたは HMAC 署名の認証を有効にし、不正アクセスを防いでください。

### 認証方式 {#authentication-methods}
次をサポートします。
1. 認証なし（none）
2. トークン認証（token）
3. HMAC 署名検証（signature）
4. カスタム認証（custom）

### トークン認証 {#token-authentication}
ヘッダーに有効な API トークンが必要です。既定は `Authorization` で、設定で変更できます。

#### リクエスト例 {#example-request}
```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "Authorization: your-api-token" \
     -d '{"orderId": 123}'
```

### HMAC 署名認証 {#hmac-signature-authentication}
秘密鍵で検証します。既定ヘッダーは `X-Signature` で、変更可能です。

#### リクエスト例 {#example-request-1}
```bash
BODY='{"orderId": 123}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "your-secret-key" | awk '{print $2}')

curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "X-Signature: $SIGNATURE" \
     -d "$BODY"
```

### カスタム認証 {#custom-authentication}
`WebhookAuthenticator` を実装するクラスを作成します。

```php
use Illuminate\Http\Request;
use Workflow\Auth\WebhookAuthenticator;

class CustomAuthenticator implements WebhookAuthenticator
{
    public function validate(Request $request): Request
    {
        $allow = true;

        if ($allow) {
            return $request;
        } else {
            abort(401, 'Unauthorized');
        }
    }
}
```

次に `config/workflows.php` へ設定します。

```php
'webhook_auth' => [
    'method' => 'custom',
    'custom' => [
        'class' => App\Your\CustomAuthenticator::class,
    ],
],
```

`validate()` は有効なら `Request` を返し、未認可なら `abort(401)` を呼びます。

## Webhook ルートの設定 {#configuring-webhook-routes}
既定は `/webhooks` です。`config/workflows.php` で変更できます。

```php
'webhooks_route' => 'workflows',
```

変更後は次のルートになります。
```
POST /workflows/start/order-workflow
POST /workflows/signal/order-workflow/{workflowId}/mark-as-shipped
POST /workflows/instances/{workflowId}/queries/{query}
POST /workflows/instances/{workflowId}/runs/{runId}/queries/{query}
POST /workflows/instances/{workflowId}/signals/{signal}
POST /workflows/instances/{workflowId}/runs/{runId}/signals/{signal}
POST /workflows/instances/{workflowId}/repair
POST /workflows/instances/{workflowId}/cancel
POST /workflows/instances/{workflowId}/terminate
GET  /workflows/instances/{workflowId}/describe
POST /workflows/instances/{workflowId}/runs/{runId}/repair
POST /workflows/instances/{workflowId}/runs/{runId}/cancel
POST /workflows/instances/{workflowId}/runs/{runId}/terminate
GET  /workflows/instances/{workflowId}/runs/{runId}/describe
GET  /workflows/workflow-tasks/poll
GET  /workflows/activity-tasks/poll
POST /workflows/control-plane/start
```

## 明示的なコマンドとクエリの Webhook {#explicit-command-and-query-webhooks}

永続的な開始、シグナル、更新、修復、キャンセル、強制終了を HTTP で提供し、現在・選択実行向けの安全にリプレイできるクエリも提供します。

明示的なエイリアスマップで、公開したいワークフローだけを登録します。

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

クラスを直接登録する場合、`#[Type(...)]` または `workflows.v2.types.workflows` で安定した型キーが必要です。

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('order-workflow')]
class OrderWorkflow extends Workflow
{
    public function handle(int $orderId)
    {
        // ...
    }
}
```

等価な設定での登録:

```php
// config/workflows.php
'v2' => [
    'types' => [
        'workflows' => [
            'order-workflow' => App\Workflows\OrderWorkflow::class,
        ],
    ],
],
```

作成される開始ルート:

```
POST /webhooks/start/order-workflow
```

リクエスト例:

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123}'
```

`workflow_id` は不透明な公開インスタンス ID です。実行 ID ではなく、不透明な文字列として扱います。

呼び出し元の `workflow_id` は、英字、数字、`.`、`_`、`-`、`:` のみの空でない191文字以内の URL 安全な文字列です。空、長すぎるもの、非対応文字は検証で HTTP `422` になります。

同じ型マップは、リファクタリングで保存済みクラス名が古くなったときの Worker フォールバックにも使います。`order-workflow` を維持して登録先を新クラスに向ければ、元の PHP クラスを読めなくてもキュー内の v2 処理は永続型キーを解決できます。

重複開始の動作も指定できます。

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123,"on_duplicate":"return_existing_active"}'
```

`on_duplicate` の対応値:

- `reject_duplicate`
- `return_existing_active`

全コマンド Webhook が同じ JSON 形式を返します。

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

新規実行作成時の受理応答:

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

既存のアクティブ実行の再利用を要求した場合の受理応答:

```json
{
  "outcome": "returned_existing_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

重複開始の拒否応答:

```json
{
  "outcome": "rejected_duplicate",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "command_source": "webhook",
  "rejection_reason": "instance_already_started"
}
```

応答フィールド:

- `workflow_id` は公開インスタンス ID。
- `run_id` は受理した開始コマンドが作成した最初のアクティブ実行。
- `requested_run_id` は実行を明示的に指定した場合のみ設定。
- `resolved_run_id` は実際に解決した実行。インスタンス宛ての開始では `run_id` と同じ。
- `command_id` は永続開始コマンド ID。
- `command_source` はこのルートでは `webhook`。
- インスタンス宛てのシグナル、更新、修復、キャンセル、強制終了は可変の現在実行ポインターだけに依存せず最新の永続実行を解決します。列がずれても同じ公開 ID で continue-as-new の連鎖を参照できます。
- 実行宛てルートは同じ公開 ID の選択実行を固定し、過去なら `target_scope = run`、`outcome = rejected_not_current`、`rejection_reason = selected_run_not_current` で拒否します。`run_id` と `requested_run_id` は過去のまま、`resolved_run_id` は次に使う現在実行です。
- ペイロードのキーは `handle()` の引数名に宣言順で対応します。
- 開始引数は `handle()` に定義します。
- `handle()` がないクラスは作成前に HTTP `422` で拒否します。
- 必須キーの欠落は黙って捨てず HTTP `422` です。
- 空、長すぎる、ルートに安全でない `workflow_id` は重複処理に渡さず HTTP `422` です。
- 不正な `on_duplicate` は HTTP `422` です。
- `on_duplicate = return_existing_active` の再利用は HTTP `200` です。
- 再利用しない重複は HTTP `409`、`outcome = rejected_duplicate`、`command_status = rejected`、`rejection_reason = instance_already_started` です。
- 永続 `workflow_commands` 行は業務引数と別に入口のコンテキストを保存します。呼び出し元ラベル、認証方式や結果、ルート名、パス、正規化ペイロードと `X-Request-Id`・`X-Correlation-Id` などの選択ヘッダーから導いたリクエストフィンガープリントを含みます。

開始 Webhook の HTTP 応答一覧:

- 新規作成: `202`、`outcome = started_new`。
- アクティブ実行の再利用: `200`、`outcome = returned_existing_active`。
- 重複拒否: `409`、`outcome = rejected_duplicate`。
- 認証失敗: `401`。
- 未知のエイリアス: `404`。
- ペイロード検証失敗: `422`。

### シグナルコマンド Webhook {#signal-command-webhooks}

インスタンス宛てと実行宛ての両方を提供します。

```text
POST /webhooks/instances/{workflowId}/signals/{signal}
POST /webhooks/instances/{workflowId}/runs/{runId}/signals/{signal}
```

`workflowId` は公開インスタンス ID です。インスタンス宛ては適用時に現在のアクティブ実行を解決します。実行宛ては `runId` も取り、過去なら拒否します。シグナル名はルート引数です。本文は任意の最上位フィールドを1つ受け付けます。

```json
{
  "arguments": ["Taylor"]
}
```

`arguments` は配列です。省略すると `await('signal-name')` は `true` で再開します。対象クラスは `#[Workflow\V2\Attributes\Signal('...')]` で名前を宣言する必要があり、未宣言は無条件にバッファーせず永続的に拒否します。

シグナルの例:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/signals/approved-by" \
     -H "Content-Type: application/json" \
     -d '{"arguments":["Taylor"]}'
```

受理応答:

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

受理・拒否とも、元コマンドに関連する独立した永続 `workflow_signal_records` ライフサイクル行を持ちます。HTTP 相関 ID は引き続きコマンド ID です。Waterline 詳細とエクスポートは `signals[*].id` と、名前、`signal_wait_id`、コマンドシーケンス、適用後のワークフローシーケンス、状態、結果、検証エラー、保存引数を表示します。

インスタンスが存在するが未開始の場合の拒否:

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

現在の実行が終了済みの場合の拒否:

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

未宣言の名前の場合の拒否:

```json
{
  "outcome": "rejected_unknown_signal",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "unknown_signal"
}
```

実行宛てが過去を指定した場合の拒否:

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

シグナル Webhook の HTTP 応答一覧:

- 受理: `202`、`outcome = signal_received`。
- 認証失敗: `401`。
- 未知のインスタンス ID: `404`。
- 未宣言の名前: `404`、`outcome = rejected_unknown_signal`。型付き `WorkflowStarted` 契約があるか、古いイベントを最初の互換受理時に補完できれば、ライブクラスのリフレクションに依存せず拒否できます。
- 現在実行なし: `409`、`outcome = rejected_not_started`。
- 現在実行が終了済み: `409`、`outcome = rejected_not_active`。
- 過去の選択実行: `409`、`outcome = rejected_not_current`。
- `arguments` が配列でない: `422`。

### 開始付きシグナル Webhook {#signal-with-start-webhooks}

インスタンス宛ての連結受理ルートは、実行を新規作成または再利用した後、シグナルを記録します。

```text
POST /webhooks/start/{alias}/signals/{signal}
```

`alias` は `Workflow\V2\Webhooks::routes([...])` で登録したエイリアス、`signal` は `#[Signal(...)]` の永続名です。

本文は通常の開始フィールドと、シグナル用の予約済み `signal_arguments` を組み合わせます。

```json
{
  "workflow_id": "order-123",
  "signal_arguments": ["Taylor"],
  "visibility": {
    "business_key": "order-123"
  }
}
```

`signal_arguments` は配列です。この連結ルートの `on_duplicate` は既定 `return_existing_active` で、他の値は拒否します。

新規実行を作った場合の受理応答:

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "start_command_id": "01J...",
  "start_command_sequence": 1,
  "start_outcome": "started_new",
  "start_command_status": "accepted",
  "intake_group_id": "01J...",
  "rejection_reason": null
}
```

既存のアクティブ実行があれば `start_outcome = returned_existing_active` を返し、最上位の `command_*` はシグナルコマンドを表します。両コマンドは同じ `intake_group_id`、ルートメタデータ、相関ヘッダーを共有し、Worker の最初のユーザーステップの前に1トランザクションで記録します。

詳細とエクスポートは複合受理を `linked_intakes[*]` に固定します。正となるのは各受理行の `workflow_commands.context.intake.group_id` と `mode` です。`signal_with_start` のグループ行は `start_command_*`、開始以外の `primary_command_*`、`complete`、`missing_expected_command_types`、順序付きの内側の `commands[*]` スナップショットを含みます。

名前が未知か引数が永続契約に合わなければ、新規実行作成前に拒否します。`run_id`、`start_command_id`、`start_outcome` は `null` です。

開始付きシグナルの HTTP 応答一覧:

- 新規作成と記録: `202`、`outcome = signal_received`、`start_outcome = started_new`。
- 再利用と記録: `202`、`outcome = signal_received`、`start_outcome = returned_existing_active`。
- 認証失敗: `401`。
- 未知のエイリアス: `404`。
- 未宣言シグナル: `404`、`outcome = rejected_unknown_signal`。
- 配列だが契約に不適合: `422`、`outcome = rejected_invalid_arguments`。
- `signal_arguments` が配列でない、または `on_duplicate` が `return_existing_active` 以外: `422`。

### クエリ Webhook {#query-webhooks}

インスタンス宛てと実行宛ての両方を提供します。

```text
POST /webhooks/instances/{workflowId}/queries/{query}
POST /webhooks/instances/{workflowId}/runs/{runId}/queries/{query}
```

`workflowId` は公開インスタンス ID です。インスタンス宛ては更新後に最新の永続実行を解決します。クエリは読み取り専用のリプレイなので、実行宛ては過去や終了済みを含む特定の `runId` を固定できます。

`query` は `#[QueryMethod]` の公開名です。定義を読み込めれば PHP メソッド名も受け付けますが、成功応答の `query_name` は永続公開名に正規化します。

本文は位置引数リストまたは宣言パラメーター名をキーにした `arguments` マップを受け取ります。

```json
{
  "arguments": ["start"]
}
```

```json
{
  "arguments": {
    "prefix": "start"
  }
}
```

変更するルートと異なり、永続コマンド行を追加せず、選択実行をリプレイしてシリアライズ済み結果を直ちに返します。

クエリの例:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/queries/events-starting-with" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"prefix":"start"}}'
```

成功応答:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "result": "i:1;"
}
```

引数が宣言契約に合わない場合の拒否:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "message": "Workflow query [events-starting-with] received invalid arguments.",
  "validation_errors": {
    "prefix": [
      "The prefix argument is required."
    ]
  }
}
```

選択実行の定義をリプレイできない場合の拒否:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "blocked_reason": "workflow_definition_unavailable",
  "message": "Workflow 01J... [order-123] cannot execute query [events-starting-with] because the workflow definition is unavailable for durable type [order-workflow]."
}
```

クエリ Webhook の HTTP 応答一覧:

- リプレイ成功: シリアライズ済み `result` と `200`。
- 認証失敗: `401`。
- 未知のインスタンス・実行 ID: `404`。
- 未開始、対象実行にクエリ宣言なし、または `blocked_reason = workflow_definition_unavailable` による停止: `409`。
- `arguments` が宣言契約に不適合: `422`。

### 更新コマンド Webhook {#update-command-webhooks}

インスタンス宛て・実行宛ての POST と、永続ライフサイクルの参照ルートを提供します。

```text
POST /webhooks/instances/{workflowId}/updates/{update}
POST /webhooks/instances/{workflowId}/runs/{runId}/updates/{update}
GET /webhooks/instances/{workflowId}/updates/{updateId}
GET /webhooks/instances/{workflowId}/runs/{runId}/updates/{updateId}
```

`workflowId` は公開インスタンス ID、`update` は `#[UpdateMethod]` の永続名、`updateId` は応答のライフサイクル ID です。インスタンス宛て POST は適用時の現在のアクティブ実行を解決します。実行宛て POST は `runId` が過去なら拒否します。インスタンス宛て GET はそのインスタンスの保存済みライフサイクルを読み、実行宛て GET は選択実行内に限定します。

`#[UpdateMethod('mark-approved')]` を使うと、PHP メソッド名が異なっても公開対象は `mark-approved` です。

本文は位置引数リストまたは宣言パラメーター名をキーにした `arguments` マップを受け取ります。

```json
{
  "arguments": [true, "api"]
}
```

```json
{
  "arguments": {
    "approved": true
  }
}
```

受理だけ確認し、適用を後で Worker に任せる場合は `wait_for` を `accepted` にします。

```json
{
  "arguments": {
    "approved": true
  },
  "wait_for": "accepted"
}
```

省略または `completed` では、まず受理を記録し、設定した上限時間まで Worker の適用を待ちます。リクエストごとに `wait_timeout_seconds` で上書きできます。

```json
{
  "arguments": {
    "approved": true
  },
  "wait_timeout_seconds": 5
}
```

時間内に完了すれば通常の完了・失敗応答を返します。先に待機期限が来れば、無期限に待たず開いたままの受理済みライフサイクルと HTTP `202` を返します。`wait_for` が `accepted` なら、コマンド行、独立した更新行、型付き `UpdateAccepted` を記録し、タスクをスケジュールまたは再ディスパッチして適用を待たず `202` を返します。

POST と GET は通常のコマンドフィールドに加え `update_id`、`update_name`、`update_status`、`workflow_sequence`、`accepted_at`、`applied_at`、`rejected_at`、`closed_at` を含みます。開いた受理状態では、Worker が閉じるまで `workflow_sequence = null`、`result = null`、`applied_at = null`、`rejected_at = null`、`closed_at = null` です。

名前付きマップは型付き `UpdateAccepted` や `UpdateApplied` を追加する前に宣言順に正規化します。任意パラメーターもこの時点で PHP の既定値を補います。

受理・拒否とも `update_id` をキーにする永続 `workflow_updates` 行を持ちます。POST 後に GET で保存済み状態を読み、汎用コマンド行から推測する必要はありません。

更新の例:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/updates/mark-ready" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"approved":true}}'
```

完了応答:

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "completed",
  "wait_timed_out": false,
  "wait_timeout_seconds": 10,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

受理のみの応答:

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "accepted",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

ライフサイクル参照の例:

```bash
curl "https://example.com/webhooks/instances/order-123/updates/01J..." \
     -H "Content-Type: application/json"
```

まだ開いている場合の参照応答:

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

終了後の参照応答:

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

参照は実行を待たず保存済み状態のみを読むため、常に `wait_for = status`、`wait_timed_out = false`、`wait_timeout_seconds = null` です。

前に受理したシグナルが未適用なら、後の POST は呼び出し元でタスクをインライン実行せず `rejected_pending_signal` で拒否します。不正な引数は `validation_errors` 付きの `rejected_invalid_arguments`、過去実行宛て POST は `rejected_not_current` です。

更新 POST の HTTP 応答一覧:

- 受理・完了: `200`、`outcome = update_completed`。
- `wait_for = accepted` で適用を Worker に任せる: `202`、`update_status = accepted`。
- `wait_timeout_seconds` または既定まで待っても未終了: `202`、`update_status = accepted`、`wait_for = completed`、`wait_timed_out = true`。
- 認証失敗: `401`。
- 未知のインスタンス: `404`。
- 未知の永続更新名: `404`、`outcome = rejected_unknown_update`。型付き `WorkflowStarted` スナップショットがあるか、最初の互換受理時に補完できれば、ライブ定義へのフォールバック前に永続メタデータから拒否できます。
- 現在実行なし: `409`、`outcome = rejected_not_started`。
- 終了済み: `409`、`outcome = rejected_not_active`。
- 過去の選択実行: `409`、`outcome = rejected_not_current`。
- 先のシグナルが未適用: `409`、`outcome = rejected_pending_signal`。
- 引数が配列でも、欠落、未知の引数、型不一致、null 許容違反など契約に不適合: `422`、`outcome = rejected_invalid_arguments`。
- 更新本体が例外: `422`、`outcome = update_failed`。
- `arguments` が配列でない: `422`。この形状検証は永続コマンド行の作成前です。

更新 GET 参照の HTTP 応答一覧:

- 終了し `update_status` が `completed`、`failed`、`rejected`: `200`。
- `update_status = accepted`: `202`。
- 認証失敗: `401`。
- 指定範囲でインスタンス、実行、`update_id` が不明: `404`。

### 修復・終了コマンド Webhook {#repair-and-terminal-command-webhooks}

インスタンス宛てと実行宛ての修復・終了ルートを提供します。

```text
POST /webhooks/instances/{workflowId}/repair
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/repair
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

`workflowId` は公開インスタンス ID です。インスタンスルートは常に現在のアクティブ実行を解決します。実行ルートは `runId` も指定し、過去なら永続結果 `rejected_not_current` で拒否します。開始と同じ `workflows.webhook_auth` を適用します。

修復の例:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/repair" \
     -H "Content-Type: application/json"
```

キャンセルの例:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/cancel" \
     -H "Content-Type: application/json"
```

強制終了の例:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/terminate" \
     -H "Content-Type: application/json"
```

現在実行の永続的な進行を復元した修復の受理応答:

```json
{
  "outcome": "repair_dispatched",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

健全な永続再開経路が既にある場合の修復の受理応答:

```json
{
  "outcome": "repair_not_needed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

キャンセルの受理応答:

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

強制終了の受理応答:

```json
{
  "outcome": "terminated",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

インスタンスが存在するが未開始の場合の拒否:

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

現在の実行が終了済みの場合の拒否:

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

実行宛ての修復・キャンセル・強制終了が過去を指定した場合の拒否:

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

修復・キャンセル・強制終了の HTTP 応答一覧:

- 期限を過ぎた実行可能タスクの再ディスパッチ、失効リースの回収、まだ開始していない不足タスクの再作成: `200`、`outcome = repair_dispatched`。適用前に行を失った受理済み更新・シグナルのワークフロータスクも含みます。
- 健全な再開経路がある、またはタスク行のない実行中アクティビティ内にある: `200`、`outcome = repair_not_needed`。
- 現在実行を正常に終了: `200`、`outcome = cancelled` または `outcome = terminated`。
- 認証失敗: `401`。
- 未知のインスタンス: `404`。
- 現在実行なし: `409`、`outcome = rejected_not_started`。
- 終了済み: `409`、`outcome = rejected_not_active`。
- 過去の選択実行: `409`、`outcome = rejected_not_current`。

### 詳細取得 Webhook {#describe-webhooks}

HTTP で状態を調べる、インスタンス宛て・実行宛てルートを提供します。

```text
GET /webhooks/instances/{workflowId}/describe
GET /webhooks/instances/{workflowId}/runs/{runId}/describe
```

`workflowId` は公開インスタンス ID です。インスタンス宛ては現在の状態を返し、実行宛ては過去や終了済みを含む特定 ID の実行を説明します。

Describe は読み取り専用で、永続コマンド行を作らずリプレイもしません。コミット済み投影からインスタンス情報、現在または選択実行の状態、サマリー、操作の可否を返します。

詳細取得の例:

```bash
curl "https://example.com/webhooks/instances/order-123/describe"
```

アクティブなワークフローの応答:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "waiting",
    "status_bucket": "running",
    "closed_reason": null,
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": null,
    "last_progress_at": "2026-04-12T12:00:01+00:00",
    "wait_kind": "signal",
    "wait_reason": "Waiting for signal [approved-by]"
  },
  "run_count": 1,
  "actions": {
    "can_signal": true,
    "can_query": true,
    "can_update": true,
    "can_cancel": true,
    "can_terminate": true
  },
  "reason": null
}
```

強制終了済みの応答:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "terminated",
    "status_bucket": "failed",
    "closed_reason": "terminated",
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": "2026-04-12T12:01:00+00:00",
    "last_progress_at": "2026-04-12T12:01:00+00:00",
    "wait_kind": null,
    "wait_reason": null
  },
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": null
}
```

操作の可否は今成功できるかを示します。終了済みはコマンドを受け付けず、リモート専用はローカルでクエリや更新を実行できず、過去の実行はシグナル、更新、キャンセル、強制終了を受け付けません。

実行宛ての詳細取得の例:

```bash
curl "https://example.com/webhooks/instances/order-123/runs/01J.../describe"
```

同じペイロードを返しますが、過去の実行なら `is_current_run` は `false` で、変更する操作もすべて `false` です。

インスタンスが見つからない場合:

```json
{
  "found": false,
  "workflow_instance_id": "order-123",
  "workflow_type": null,
  "workflow_class": null,
  "business_key": null,
  "run": null,
  "run_count": 0,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "instance_not_found"
}
```

インスタンスはあるが選択実行が見つからない場合:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": null,
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "run_not_found"
}
```

詳細取得の HTTP 応答一覧:

- インスタンスが存在する（アクティブ、終了済み、過去を問わない）: `200`。
- インスタンスはあるが選択実行なし: `200`、`reason = run_not_found`。
- 認証失敗: `401`。
- インスタンスなし: `404`、`reason = instance_not_found`。

### コントロールプレーン開始 Webhook {#control-plane-start-webhook}

クラスをローカルで解決できなくても、永続型キーを直接指定して開始できます。PHP クラスのエイリアスではなく型キーで操作する外部コンシューマーに推奨する経路です。

```text
POST /webhooks/control-plane/start
```

本文は次を受け付けます。

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `workflow_type` | string | はい | 永続ワークフロー型キー |
| `instance_id` | string | いいえ | 呼び出し元の公開インスタンス ID |
| `arguments` | string | いいえ | コーデックタグ付きのシリアライズ済み引数 |
| `connection` | string | いいえ | キュー接続の上書き |
| `queue` | string | いいえ | キュー名の上書き |
| `business_key` | string | いいえ | 呼び出し元のビジネスキー |
| `labels` | object | いいえ | 可視化ラベル |
| `memo` | object | いいえ | 索引のないメタデータ |
| `duplicate_start_policy` | string | いいえ | `reject_duplicate` または `return_existing_active` |

リクエスト例:

```bash
curl -X POST "https://example.com/webhooks/control-plane/start" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_type": "order-workflow",
           "instance_id": "order-123",
           "arguments": "{\"orderId\":123}",
           "connection": "redis",
           "queue": "default",
           "business_key": "order-123",
           "labels": {"tenant": "acme"}
         }'
```

新規開始の応答:

```json
{
  "started": true,
  "workflow_instance_id": "order-123",
  "workflow_run_id": "01J...",
  "workflow_type": "order-workflow",
  "outcome": "started_new",
  "task_id": "01J...",
  "reason": null
}
```

`instance_id` を省略すると ULID ベースの ID を自動生成します。

型キーが `workflows.v2.types.workflows` または `#[Type(...)]` でローカルクラスに対応するなら、開始時に完全なコマンド契約スナップショットとルーティングを適用します。ローカルにない場合は型キーと明示したルーティングでインスタンスを作り、契約と定義フィンガープリントの確定は最初のタスクを取得する Worker に任せます。そのため外部コンシューマーは Worker 群だけが解決できる型も開始できます。

コントロールプレーン開始の HTTP 応答一覧:

- 新規作成: `202`、`outcome = started_new`。
- アクティブ実行の再利用: `200`、`outcome = returned_existing_active`。
- 重複拒否: `409`、`outcome = rejected_duplicate`。
- 認証失敗: `401`。
- `workflow_type` の欠落または不正な `instance_id`: `422`。

`WorkflowControlPlane` はプログラムから使うコンテナ解決可能なシングルトンでもあります。Laravel コンテナから `Workflow\V2\Contracts\WorkflowControlPlane` を解決し、PHP、テスト、Artisan から `start()`、`signal()`、`query()`、`update()`、`cancel()`、`terminate()`、`describe()` を直接呼べます。

Webhook は、明示的エイリアスでの開始、インスタンス宛て・実行宛てのシグナル、更新、クエリ、詳細取得、修復、キャンセル、強制終了、ワークフロー・アクティビティのタスクポーリング、型キーによる作成のコントロールプレーン開始を提供します。
