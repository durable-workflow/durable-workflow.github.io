---
sidebar_position: 1
title: シグナル
description: 実行中のワークフローに型付き外部コマンドを送り、検証、ルーティング、待機を理解します。
tags:
  - commands
  - signals
  - human-in-the-loop
keywords:
  - ワークフローのシグナル
  - シグナルコマンド
  - 人が介入するワークフロー
---

import SignalSimulator from '@site/src/components/SignalSimulator';

# シグナル {#signals}

シグナルはワークフローの外からイベントを起こします。外部イベントへの応答、人が介入する処理、外部タスクの完了通知などに使えます。永続カーソルを進めながら順序付き入力を繰り返し受ける場合は[メッセージストリーム](./message-streams.md)を使います。

## 受理と終了 {#acceptance-and-closure}

`signal_received` は永続的な受理を示し、コードが処理済みであることは示しません。業務操作の確認が必要なら、保持された状態と履歴を調べてください。

Core 2.7.0 または互換 Server では、リモートワークフロータスク中に受理した対象シグナルに、成功終了前の配信ターンを与えます。インスタンス宛てでコマンド契約に宣言された受信済みシグナルは、元の識別情報、引数、順序を維持して[新しい実行への継続](./continue-as-new.md)をまたぎます。特定の実行宛てのシグナルは別の実行へ移りません。

永続的なシグナル宣言のない実行に、後の Worker 登録で宣言が追加されることはありません。配信を確立できなければ、受理済みシグナルは以下の明示的な拒否状態で終了します。

シグナルの適用前に実行が閉じると、状態は `rejected` となり、`run_closed_before_signal_applied`、終了時刻、`SignalRejected` 履歴イベントを記録します。通常完了時に未使用のバッファー済みシグナルや、失敗、キャンセル、タイムアウト前に適用できないシグナルも含みます。先の受理確認は有効なままです。受理だけでなく保持された処理結果が必要なら[更新](./updates.md)を使います。

書き込み側を Core 2.7.0 へ上げる前に、同じデータベースを読む Waterline を含む、埋め込みおよび直接データベースを読む全リーダーの処理を完了させて更新してください。古いリーダーは `SignalRejected` をデコードできません。新しいライターに対して稼働させたり、イベント保存後にリーダーを戻したりしないでください。

## 名前付きシグナルの待機 {#named-signal-waits}

ワークフローは `await('signal-name')` を直接呼びます。同名の次の受理済みコマンドが実行を再開し、中断中のワークフローへ決定的な値を返します。

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string'],
])]
final class OrderApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $approvedBy = await('approved-by');

        return [
            'approved_by' => $approvedBy,
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

PHP からは公開インスタンス ID を指定してシグナルを送ります。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptSignalWithArguments('approved-by', [
    'approvedBy' => 'Taylor',
]);

$result->accepted();    // true
$result->outcome();     // "signal_received"
$result->commandId();   // Durable signal-command id
$result->instanceId();  // "order-123"
```

シグナルの動作:

- 繰り返し指定できるクラス属性 `#[Signal('signal-name')]` で、外部シグナル名を事前に宣言します。順序付きパラメーター契約も指定できます。
- 宛先は実行 ID ではなく公開インスタンス ID です。continue-as-new の連鎖でも同じ公開ルートを保ちます。
- パラメーター契約がある場合、不正なペイロードは機械可読な `validation_errors` 付きの `rejected_invalid_arguments` で拒否します。
- 契約がなければ `await('name')` は引数なしで `true`、1引数でその値、複数なら全引数の配列を返します。
- 未知の名前は `rejected_unknown_signal`、終了済みや未開始のインスタンスへの送信は `rejected_not_active` または `rejected_not_started` で拒否します。

## 応答が不確かな場合 {#after-an-uncertain-response}

永続的に受理された後でも、タイムアウトや応答喪失は起こります。後の終了済み・未検出の応答は後のリクエストを表すだけで、元のシグナルが適用されたかは分かりません。送信前の状態確認でも、その後に終了や continue-as-new が起こり得る隙間は残ります。

配信が不確かな場合、元の名前空間、ワークフロー識別情報、シグナル名、引数、アプリの操作キーを保持して調べます。再送は対象の実際の重複処理契約に従ってください。リトライを拒否されたという理由だけで代替ワークフローを開始しないでください。

保持された更新の調査とアプリ側の照合は、[不確かなコマンドからの復旧](./updates.md#recover-after-an-uncertain-response)を参照してください。

## 送信者の識別と認可 {#sender-identity-and-authorization}

`approvedBy` はアプリのデータです。例の `Taylor` は認証済み送信者の証明ではありません。`#[Signal]` は名前と引数を検証するもので、Laravel アプリは受理前に呼び出し元を認証し、操作を認可する必要があります。

たとえば承認エンドポイントでは認証済みユーザーと注文ポリシーを使えます。このアプリは `workflow_instance_id`、`workflow_namespace` を保存する `Order` モデルを定義し、その注文へのアクセスを検査する `approve` ポリシーを登録します。実行者やルーティング値はリクエスト本文から受け取りません。

```php
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Workflow\V2\CommandContext;
use Workflow\V2\WorkflowStub;

Route::post('/orders/{order}/approve', function (Request $request, Order $order) {
    $user = $request->user();
    Gate::forUser($user)->authorize('approve', $order);

    $actorId = (string) $user->getAuthIdentifier();
    $context = CommandContext::phpApi()->withPrincipal('user', $actorId);

    $result = WorkflowStub::load(
        $order->workflow_instance_id,
        $order->workflow_namespace,
    )->withCommandContext($context)->attemptSignalWithArguments('approved-by', [
        'approvedBy' => $actorId,
    ]);

    return response()->json([
        'accepted' => $result->accepted(),
        'outcome' => $result->outcome(),
        'command_id' => $result->commandId(),
    ], $result->accepted() ? 202 : 409);
})->middleware('auth');
```

ポリシーはワークフローの読み込みやシグナル送信前に検査します。Webhook や管理エンドポイントを含め、このシグナルを送る全承認経路で同じポリシーを強制してください。ワークフロー内の `await('approved-by')` は記録済み引数を受け取るだけで、認証済み送信者オブジェクトを返したり、権限を再確認したりしません。

コマンドの監査用識別情報はその引数とは別です。`withCommandContext()` は `commandId()` で識別する `WorkflowCommand` にコンテキストを記録します。`context.principal` と `principalType()`、`principalId()`、`principalLabel()` はホスト側の監査調査を支援し、関連履歴と運用画面で記録したコマンドの帰属を表示できます。帰属情報がなければ送信者を特定したことにはなりません。

`CommandContext::withPrincipal()` は信頼するホストコードが渡した情報を記録するだけで、ユーザーの認証やシグナルの認可はしません。呼び出し元が制御する入力から切り離し、決定的なリプレイ内ではライブ HTTP セッションや現在の権限のデータベース参照を使わないでください。

サービスモード SDK はこの埋め込みルートではなく Server の HTTP 認可境界を使います。資格情報、信頼するゲートウェイ、監査識別情報は[シグナルの認可と帰属](/docs/polyglot/namespace-auth-workers#signal-authorization-and-attribution)を参照してください。

<SignalSimulator />

**重要:** `await()` はワークフロー内でのみ使い、アクティビティ内では使わないでください。

永続状態の述語が true になるまで待つ場合は[条件待機](./condition-waits.md)、タイムアウト付き `await` は[シグナル + タイマー](./signal+timer.md)、繰り返す inbox/outbox の流れは[メッセージストリーム](./message-streams.md)を参照してください。

## このパターンの実行 {#run-this-pattern}

[サンプルアプリ](/docs/sample-app)の Webhook 起動ワークフローは、このページの名前付きシグナル待機を実行できる参照例です。

```bash
php artisan app:webhook
```

`App\Workflows\Webhooks\WebhookWorkflow` は HTTP Webhook の入口から開始し、対応するシグナルが来るまで `await('ready')` で待ちます。待機中に Waterline を開くと、受理の瞬間に `WorkflowExecutionSignaled` イベントが現れます。
