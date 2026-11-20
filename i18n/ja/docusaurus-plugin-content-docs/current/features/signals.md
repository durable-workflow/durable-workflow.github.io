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

## 名前空間の境界 {#namespace-boundary}

通常のシグナルはクライアントの名前空間にあるワークフローを対象とします。子のハンドルも元の名前空間を保持します。別の名前空間で公開された操作には[サービス操作](./service-operations.md)を使ってください。ワークフロー id やキューの変更で名前空間間の権限を得ることはできません。

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

## 1つの操作で開始とシグナル送信を行う {#signal-with-start}

`signalWithStart()` は、ワークフローを開始するか開いている実行を再利用し、その実行にシグナルを記録する処理を1つのトランザクションで行います。`start()` の後に `signal()` を別々に呼ぶと、その間に実行が閉じてシグナルが拒否される隙間が生じます。

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$result = WorkflowStub::make(OrderApprovalWorkflow::class, 'order-123')
    ->signalWithStart('approved-by', ['approvedBy' => 'Taylor'], StartOptions::returnExistingActive());

$result->startOutcome(); // "started_new" or "returned_existing_active"
```

現在の実行が閉じている場合、組み込みの signal-with-start はその後に新しい実行を開始し、閉じた実行は結果を維持します。サービスモードのクライアントは Server の signal-with-start を使います。これにはネイティブ Server 3.15.0 以降が必要で、呼び出し元が新しい実行を求めない限り、閉じた実行への送信は拒否されます。PHP、Python、Rust SDK の呼び出しは [signal-with-start](/docs/polyglot/workflow-signals#signal-with-start) を参照してください。

## 別のワークフローへシグナルを送る {#signal-another-workflow}

:::note 実験的
組み込みワークフロー向けの永続的な signal-external は Workflow 2.35.0 で初めてリリースされました。API は実験的です。
:::

ワークフローコードは `signalExternalWorkflow()` で、同じ名前空間内の別のワークフローへシグナルを送れます。このワークフローはリクエストを一度だけ記録して待機します。その記録がコミットされた後、ランタイムが対象でシグナルを受理し、結果をこのワークフローの履歴に記録します。データベースの競合は、どちらのワークフローも失敗させずに再試行します。リプレイは再送せずに記録済みの結果を返します。

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\signalExternalWorkflow;

#[Type('order-approver')]
final class OrderApproverWorkflow extends Workflow
{
    public function handle(string $orderId): array
    {
        $result = signalExternalWorkflow($orderId, 'approved-by', ['Taylor']);

        if (! $result->delivered()) {
            // target_not_found, target_closed or rejected, with a reason
            return ['skipped' => $result->outcome->value, 'reason' => $result->reason];
        }

        return ['delivered_to' => $result->targetRunId];
    }
}
```

- 対象が存在しない、閉じている、または拒否した場合は、例外ではなく `ExternalSignalResult` が返されます。結果と理由は Server と同じで、[サービスモードのガイド](/docs/polyglot/workflow-signals#signal-another-workflow)に一覧があります。
- 4番目の引数に実行 ID を渡すと、その実行だけにシグナルを送ります。子のハンドルには `signalDurably()` があります。たとえば `$this->lastChild()->signalDurably('approved-by', 'Taylor')` です。ハンドルの `signal()` は従来どおり親の履歴の外で直接送信するため、親のリプレイ時に再送されることがあります。
- 対象側では、送信元の実行に帰属する通常のシグナルで、キーは `workflow-signal:<sender run id>:<sequence>` です。アプリケーションはこのリクエスト ID 接頭辞を使えません。
- シグナル名は Server の規則に従います（空でない、制御文字を含まない、最大 191 文字かつ 255 バイト）。拒否された名前は、何かが記録される前にワークフローコード内で `InvalidExternalSignalException` をスローします。
- 記録済みのステップで対象、実行、シグナル名、引数のいずれかを変更すると、履歴の形状不一致としてリプレイがブロックされます。

シグナルは名前空間内にとどまります。別の名前空間に届けるには[サービス操作](./service-operations.md)を使います。ワークフローコードから signal-with-start が必要な場合はアクティビティを使い、再試行されたアクティビティが二重にシグナルを送らないよう、安定したリクエスト ID を付けてください。

## シグナルペイロードの互換性を保って拡張する {#evolve-a-signal-payload}

互換性のある追加が必要なアプリケーションペイロードには、宣言済みのマップ引数を1つ使用します。この例では、任意の参考情報 `note` を追加しても `schema_version: 1` を維持します。古い送信側はこのフィールドを省略し、新しい読み取り側は `null` を使用します。古い読み取り側は、承認判断を変えずにこれを無視できます。認可や業務上の動作を変える必要がある変更には、無視されるフィールドを使用しないでください。

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('map-approval')]
#[Signal('reviewed', [
    ['name' => 'payload', 'type' => 'array', 'allows_null' => false],
])]
final class MapApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $payload = await('reviewed');
        if (! is_array($payload) || array_is_list($payload)
            || ($payload['schema_version'] ?? null) !== 1) {
            return ['status' => 'rejected_payload', 'reason' => 'unsupported_shape_or_version'];
        }
        if (! in_array($payload['decision'] ?? null, ['approved', 'rejected'], true)) {
            return ['status' => 'rejected_payload', 'reason' => 'invalid_decision'];
        }
        $note = $payload['note'] ?? null;
        if ($note !== null && ! is_string($note)) {
            return ['status' => 'rejected_payload', 'reason' => 'invalid_note'];
        }

        return ['status' => 'processed', 'decision' => $payload['decision'], 'note' => $note];
    }
}
```

どちらの送信側も、同じ宣言済みパラメーター `payload` を使用します。

```php
use Workflow\V2\WorkflowStub;

$oldPayload = ['schema_version' => 1, 'decision' => 'approved'];
$newPayload = [...$oldPayload, 'note' => 'review λ'];

$receipt = WorkflowStub::load('review-123')->attemptSignalWithArguments(
    'reviewed',
    ['payload' => $newPayload], // An old sender passes $oldPayload here.
);
```

宣言が検証するのは外側の引数です。`payload` の代わりにスカラーを渡すと、受け付け時に拒否されます。`array` 型は、入れ子のフィールドを検証せず、PHPのリストと文字列キーのマップも区別しません。ワークフローは業務処理の前に、これらのアプリケーション規則を検証します。そのため、未対応のバージョンや不正な `note` が永続的に受け付けられた後で、ワークフロー結果が `rejected_payload` になる場合があります。この結果は、受領確認 `signal_received` とは別です。

必須フィールドとその意味を維持してください。フィールドの欠落と明示的な `null` が同じ意味かどうかを定義します。この例の `note` では同じ意味です。記録済みの古い値を読むデコーダーを残してください。互換性のない構造や意味への変更には、任意フィールドを追加するだけでなく、新しいアプリケーションバージョンと明確な互換性計画が必要です。

runは、開始時に記録したシグナル宣言とデフォルト値を維持します。現在のハンドラーのシグネチャやデフォルト値を変更しても、その契約は書き換わりません。トップレベルのシグナル引数を追加することと、既存マップ内にキーを追加することは異なります。古いrunが新しい引数を受け付けたり、新しいデフォルト値を採用したりするとは限りません。新しいrunは新しい宣言を記録でき、古いrunは元の宣言を維持します。

このアプリケーション形式は、固定の[Avro Valueワイヤースキーマ](/docs/polyglot/avro-value-protocol)とは別です。サービスモードのPHP、Python、Rustクライアントは、それぞれのSDKで対応するマップ、リスト、スカラー値をエンコードします。Pythonのdataclass、PHPのドメインオブジェクト、Rustのstructには、対応する明示的な値アダプターが必要です。アプリケーションのバージョンフィールドはスキーマレジストリーではありません。サービスモードAPIは[SDKリファレンス](/docs/sdk-neutrality)を参照してください。

ペイロードに互換性があっても、変更したワークフロー定義が既存runを取得する権限は得られません。必要な互換workerやbuildを利用可能な状態に保ってください。Server 2.9.7のソースフィンガープリント制約は、別途[Server #518](https://github.com/durable-workflow/server/issues/518)で管理しています。このレシピは制約を回避せず、現在のハンドラーが古いrunのコードを置き換えるとも保証しません。ランタイムが対応するルーティング契約の範囲内でリプレイに安全なコード変更を行うには、[ワークフローのバージョニング](./versioning.md)を使用してください。

記録済み値に関する同じ境界は、アクティビティの引数と結果にも適用されます。リトライやリプレイでは、古い構造の値を読むことがあります。履歴を書き換えたり、現在のモデルのデフォルト値に依存したりせず、その値との互換性をアダプターで維持してください。

## 応答が不確かな場合 {#after-an-uncertain-response}

永続的に受理された後でも、タイムアウトや応答喪失は起こります。後の終了済み・未検出の応答は後のリクエストを表すだけで、元のシグナルが適用されたかは分かりません。送信前の状態確認でも、その後に終了や continue-as-new が起こり得る隙間は残ります。

配信が不確かな場合、元の名前空間、ワークフロー識別情報、シグナル名、引数、アプリの操作キーを保持して調べます。リトライを拒否されたという理由だけで代替ワークフローを開始しないでください。

### 同じコマンドキーで再試行する {#retry-with-the-same-command-key}

コマンドキーを使うと、再試行そのものが安全になります。`approve-order-123` のように論理的なシグナルごとに1つのキーを選び、送信前に操作記録とともに保存します。Workflow 2.18.0 以降では、`withRequestId()` でキーを付けます。応答を失った後は、同じキー、名前、引数、対象で同じシグナルを再送します。

```php
use Workflow\V2\WorkflowStub;

$result = WorkflowStub::load('order-123')
    ->withRequestId('approve-order-123')
    ->attemptSignalWithArguments('approved-by', ['approvedBy' => 'Taylor']);

if ($result->requestIdConflict()) {
    // The key already names a different signal. Nothing was recorded.
    $retainedCommandId = $result->conflict()['retained_command_id'];
} elseif ($result->retained() && ! $result->intentVerified()) {
    // A legacy receipt: the original admission, not proof that this retry matches it.
} else {
    $result->commandId(); // The same signal command on every matching retry.
}
```

- 同じキー、シグナル名、型付き引数、明示的な実行対象での再試行は、元の受領記録を返し、何も記録しません。`retained()` は true です。元のコマンドが保持されている限り、実行が終了した後や continue-as-new した後でも同様に動作します。
- 同じキーで名前、引数、実行対象のいずれかが異なる場合は拒否されます。`requestIdConflict()` が true になり、`outcome()` は `rejected_request_id_conflict` です。`conflict()` は保持されたコマンドと異なる部分を示します。何も記録されず、キーは元の受領記録を保持し続けます。その受領記録を読むには元の入力を送り、新しい入力には新しいキーを使ってください。
- Workflow がコマンドの意図を記録する前に受理された受領記録は、`retained()` が true、`intentVerified()` が false として読み戻されます。これは元の受理であり、この再試行の引数が一致する証明ではありません。自分のシグナルとして扱う前に、その識別情報を確認してください。
- キーは 1〜255 文字の Unicode 文字列で、大文字小文字の同一視や正規化を行わずに完全一致で比較されます。空、長すぎる、または不正な UTF-8 のキーは、受理前に `InvalidCommandRequestIdException` をスローします。キーなしで送ったシグナルは常に新しいシグナルです。

アップグレード前に Workflow の `intent_digest` マイグレーションを適用し、埋め込みデータベースに書き込むすべてのプロセスを停止してまとめてアップグレードしてください。古いリリースは意図を比較しないため、同じシグナルキーを繰り返すと2つ目のシグナルが記録されます。

サービスモードのクライアントは、キーを本文の `request_id` として送ります。Native Server 3.9.2 以降は同じ規則を適用し、一部のレガシーキーに対して `request_id_ambiguous` による拒否を追加します。HTTP 契約と PHP、Python、Rust、CLI の呼び出しは、[シグナルと更新のコマンドキー](/docs/polyglot/server-api-reference#command-keys)を参照してください。

コマンドキーはシグナルを一度だけ受理させます。シグナルがきっかけとなるアクティビティを厳密に1回だけ実行させるものではありません。保持された更新の調査とアプリ側の照合は、[不確かなコマンドからの復旧](./updates.md#recover-after-an-uncertain-response)を参照してください。

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

`App\Workflows\Webhooks\WebhookWorkflow` は HTTP Webhook の入口から開始し、対応するシグナルが来るまで `await('ready')` で待ちます。待機中に Waterline を開くと、受理の瞬間に `SignalReceived` イベントが現れます。
