---
sidebar_position: 3
---

# 更新 {#updates}

更新は現在の状態を取得すると同時にワークフロー状態を変更できます。クエリとシグナルを組み合わせたものに相当します。

## 明示的な更新コマンド {#explicit-update-commands}

受理された各更新は次の契約に従います。

- 実行中ワークフローに対する要求・応答の呼び出しです。`attemptUpdate*()` はハンドラーの完了を待ちます。`submitUpdate*()` は永続的な受理後すぐ戻り、後で `inspectUpdate($updateId)` で確認できます。
- 履歴と Webhook ルーティングには宣言した永続更新名を使います。`#[UpdateMethod('mark-approved')]` は PHP メソッド名を変更しても公開呼び出し名を維持します。
- 過去や終了済みの実行に対しては、現在の実行を黙って変更せず拒否します。
- ハンドラー実行前に、未宣言の名前を `rejected_unknown_update`、契約に合わない引数を機械可読な `validation_errors` 付きの `rejected_invalid_arguments` で拒否します。
- [更新バリデーター](#validate-updates-before-acceptance)が拒否したリクエストを、受理前に `update_validator_rejected` として拒否します。

クエリと同じく、更新はまずコミット済み履歴をリプレイします。クエリとは異なり、安全にリプレイできる状態を変更して値を返せます。

`UpdateMethod` 注釈で更新メソッドを定義します。任意の文字列引数で、PHP メソッド名の変更後も維持する公開永続名を固定できます。

```php
use Workflow\UpdateMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[UpdateMethod('mark-ready')]
    public function updateReady(bool $ready): bool
    {
        $this->ready = $ready;

        return $this->ready;
    }
}
```

生の戻り値が必要ならメソッドを直接呼びます。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->updateReady(true);
```

直接の PHP 呼び出しではメソッド名を使います。永続コマンドの対象は `mark-ready` のままです。

永続コマンドの結果も必要なら `attemptUpdate()` に永続更新名を渡します。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptUpdate('mark-ready', true);

$result->accepted();        // true
$result->completed();       // true when the update body ran successfully
$result->updateStatus();    // "accepted", "completed", "failed", or "rejected"
$result->updateId();        // Durable update lifecycle id
$result->result();          // Raw update return value when completed
$result->failureMessage();  // Failure message when the update body threw
```

`attemptUpdate()` はまず受理を記録し、Worker が適用して更新ライフサイクルを閉じるまで待って戻ります。待機には `workflows.v2.update_wait.completion_timeout_seconds` の上限があります。期限までに閉じなければ、`waitTimedOut() === true`、`updateStatus() === 'accepted'` の受理済みライフサイクルを返します。

個別の呼び出しで完了待機の上限時間を変えるには `withUpdateWaitTimeout()` を使います。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123')
    ->withUpdateWaitTimeout(5);

$result = $workflow->attemptUpdate('mark-ready', true);
```

位置引数リストや名前付きマップを持つ呼び出し元は `attemptUpdateWithArguments()` を使います。

```php
$result = $workflow->attemptUpdateWithArguments('mark-ready', [
    'ready' => true,
]);
```

名前付きマップは永続スナップショットの更新契約で検証され、受理前に宣言順に正規化されます。

永続的な受理だけが必要で、後で Worker が適用すればよい場合は `submitUpdate()` または `submitUpdateWithArguments()` を使います。

```php
$accepted = $workflow->submitUpdate('mark-ready', true);

$accepted->accepted();     // true
$accepted->completed();    // false
$accepted->updateStatus(); // "accepted"
$accepted->result();       // null until the worker records UpdateCompleted
```

`update_id` を持っており、再び待機せずに保存済みライフサイクルを確認するには `inspectUpdate()` を使います。

```php
$latest = $workflow->inspectUpdate($accepted->updateId());

$latest->updateStatus(); // "accepted"
$latest->closedAt();     // null until the lifecycle closes
```

`inspectUpdate()` はワークフロー実行を待ちません。保存された永続ライフサイクルを再読込し、現在の `UpdateResult` を返します。

## 受理前に更新を検証する {#validate-updates-before-acceptance}

バリデーターがない場合、業務ルールに反する更新はいったん受理されてから失敗します。失敗した更新として記録され、呼び出し側は不正なリクエストと失敗した操作を区別できません。バリデーターを宣言すると、受理前にリクエストを拒否できます。バリデーターには Workflow 2.42.0 以降が必要です。

```php
use Workflow\UpdateMethod;
use Workflow\UpdateValidator;
use Workflow\V2\Workflow;

final class CartWorkflow extends Workflow
{
    private array $items = [];

    #[UpdateMethod('add-item')]
    public function addItem(string $item): array
    {
        $this->items[] = $item;

        return $this->items;
    }

    #[UpdateValidator('add-item')]
    public function validateAddItem(string $item): void
    {
        if (count($this->items) >= 10) {
            throw new \RuntimeException('The cart is full.');
        }
    }
}
```

`#[UpdateValidator]` は、更新を永続名で指定します。更新にエイリアスがない場合はメソッド名で指定します。バリデーターは更新と同じ引数を受け取ります。更新を受理する前に、エンジンは履歴から実行の状態を再構築し、バリデーターだけを呼び出します。

- 通常どおり戻った場合、更新はいつもどおり受理・適用されます。
- 例外を投げるか `false` を返した場合、更新は理由 `update_validator_rejected`、結果 `rejected_invalid_arguments` で拒否されます。`rejectedByValidator()` は true になり、`rejectionMessage()` は例外メッセージを、`validationErrors()` は Laravel の `ValidationException` のエラーを返します。`update()` は理由とバリデーターのメッセージを含む `LogicException` を投げます。
- 拒否された更新は受理されず、ハンドラーも実行されず、ワークフローも起こされません。ほかの拒否と同様に、記録されるのは監査イベント `UpdateRejected` だけで、リプレイはこれを無視します。

バリデーターは読み取り専用です。再構築されたワークフロー状態は読めますが、永続的な呼び出し（アクティビティ、タイマー、子ワークフロー、シグナル、side effect、`await`、`getVersion()`、`patched()`、continue-as-new、memo または検索属性の upsert）はすべて `UpdateValidatorCommandException` を投げ、更新を拒否します。バリデーターが再構築された状態に加えた変更は破棄されます。ジェネレーターのバリデーターは本体が実行されないため、拒否されます。

バリデーターは履歴に記録されず、リプレイ中にも実行されないため、決定性に影響しません。バリデーターが見るのは確定済み履歴の状態です。受理済みでまだ適用されていない更新は見えません。リプレイとバリデーターは、更新の受理処理が実行のロックを保持している間に動くため、バリデーターは高速に保ってください。

状態を再構築できない場合や、バリデーターがデータベースエラーに遭遇した場合は、`UpdateValidationFailedException` が投げられ、何も記録されません。更新用の webhook ルートは、再試行可能な `503` と `update_validation_failed` で応答します。同じリクエスト ID で再試行してください。

拒否された更新をキー付きで再試行すると、バリデーターを再実行せずに保持済みの拒否が返ります。

更新バリデーターは Worker のインターセプターを通りません。

## 応答が不確かな場合の復旧 {#recover-after-an-uncertain-response}

永続的な受理、ハンドラーの完了、外部の業務上の作用は別々の事実です。呼び出し元がタイムアウトしても受理済み更新が動き続ける場合があり、応答喪失によりコミット済み結果を見失う場合もあります。後の新規更新の拒否だけでは元の結果は確定しません。

更新 ID をアプリに保存してある場合、再送せず保持されたライフサイクルを調べます。continue-as-new で調査先が変わらないよう、元の実行 ID を保持してください。

```php
use Workflow\V2\WorkflowStub;

$latest = WorkflowStub::loadRun($savedRunId, $savedNamespace)->inspectUpdate($savedUpdateId);

$latest->updateStatus();
$latest->result(); // Available when that retained update completed.
```

保存した ID は元の操作から取得します。調査は保持された記録を読むため、実行が終了または過去になっても使えます。証拠が欠落・削除されていれば結果は未解決であり、業務上の作用を繰り返す許可にはなりません。元の応答と生成された更新 ID を失った場合に照合できるよう、アプリ側の操作記録を保持してください。

### リクエスト ID と保持された確認記録 {#request-ids-and-retained-receipts}

名前空間、インスタンス ID、元の実行 ID、更新 ID、操作名、意図をアプリに保存します。受理確認は永続的な受理を証明し、完了ライフサイクルは記録済みハンドラー結果を示します。どちらも別の決済、メール、データベース書き込みが厳密に1回行われたことは証明しません。

埋め込み Laravel の更新 webhook は、呼び出し元のキーを `X-Request-Id` から取得します。プロキシを通す場合も、このヘッダーを維持してください。スタンドアロン Server の HTTP 更新は、JSON 本文の `request_id` だけをキーとして使い、`X-Request-Id` ヘッダーは相関情報として扱います。本文のキーを省略すると、同じヘッダーを持つリクエストでも重複排除キーは付きません。

コマンドキーは、1つのワークフローインスタンス上の1つの更新を、そのすべての実行にわたって識別します。Workflow 2.18.0 以降では、`withRequestId()` でキーを付けます。応答を失った後は、同じキーで同じ更新を再送します。

```php
use Workflow\V2\WorkflowStub;

$result = WorkflowStub::load('order-123')
    ->withRequestId('mark-ready-order-123')
    ->attemptUpdate('mark-ready', true);

$result->retained();          // True when this call returned an earlier admission
$result->intentVerified();    // False only for a legacy receipt
$result->requestIdConflict(); // True when the key already names a different update
$result->updateId();          // The original update on every matching retry
```

- 同じキー、更新名、型付き引数、明示的な実行対象での再試行は、更新 ID を含む元の確認記録を返し、何も記録しません。終了後や continue-as-new 後でも、再試行は元の更新を返します。後続の実行で新しい更新を受理することはありません。
- 同じキーで更新名、引数、実行対象のいずれかが異なる場合は、`rejected_request_id_conflict` として拒否されます。`conflict()` は保持されたコマンドと異なる部分を示します。何も記録されず、キーは元の確認記録を保持し続けます。
- Workflow がコマンドの意図を記録する前に受理された確認記録は、`retained()` が true、`intentVerified()` が false として読み戻されます。これは元の受理であり、この再試行の引数が一致する証明ではありません。
- キーは 1〜255 文字の Unicode 文字列で、完全一致で比較されます。不正なキーは、受理前に `InvalidCommandRequestIdException` をスローします。

1つのキーは1つの論理操作に使い、その引数は決して変更しないでください。新しい操作には新しいキーを使います。キー付きの更新が拒否されたことを確認した後も同様です。Workflow 2.18.0 および native Server 3.9.0 より前のリリースは意図を比較しません。そこでは、異なる引数や別の更新名で再利用したキーは、最初の更新の確認記録を返します。

サービスモードのクライアントは、キーを本文の `request_id` として送ります。Native Server 3.9.2 以降は同じ規則を適用し、一部のレガシーキーに対して `request_id_ambiguous` による拒否を追加します。HTTP 契約と PHP、Python、Rust、CLI の呼び出しは、[シグナルと更新のコマンドキー](/docs/polyglot/server-api-reference#command-keys)を参照してください。

確認記録の復旧はコマンド、更新、履歴の保持に依存します。保持期間の処理で実行の詳細が削除されると、そのキーも一緒に削除され、後でそのキーを使ったリクエストは新しいコマンドとして受理されます。アプリに依存しない重複排除期間を保証するものではありません。[履歴保持](../configuration/pruning-workflows.md)を確認し、必要な期間は業務台帳を保持します。証拠がなければ結果は不明のままです。

### 業務上の作用の保護 {#protect-the-business-effect}

請求書への課金などの操作では次を行います。

1. 送信前に `tenant-1:charge:invoice-123` などのアプリ操作キーと変更不可の意図を保存し、復旧時も同じキーを使います。
2. 作用を適用するアクティビティで、テナントと操作キーにデータベースの一意制約を設けます。1つのトランザクション内で保存済み意図の照合、ローカルの作用の適用、結果保存を原子的に行います。同じ意図の重複には保存済み結果を返し、異なる意図は拒否します。
3. 外部プロバイダーでは、サポートされる冪等性契約、または outbox と照合処理を使います。自分のデータベースのトランザクションで別のプロバイダー呼び出しを原子的にはできません。
4. 応答が不確かな場合、操作記録、元の更新ライフサイクル、プロバイダーの証拠を照合します。次の行動前に、作用が保留、コミット済み、失敗、不明のいずれかを記録します。

クエリの後にコマンドを送っても競合の隙間は残ります。元のシグナルが受理されていても重複で別のアクティビティが起動する場合があります。アプリのガードは繰り返し配信に耐える必要があります。検証済みの例は同じキーで2つのアクティビティを実行し、ローカルデータベースへの作用を1回だけコミットします。任意の外部システムに対する厳密に1回の実行を証明するものではありません。

更新のルール:

- `load($instanceId)` は continue-as-new 後を含む最新の永続実行を更新します。
- 選択実行が過去になった後の `loadRun($runId)` による新規更新は `rejected_not_current` で拒否します。保持記録の調査は別です。
- 終了済み実行への新規更新は `rejected_not_active` で拒否します。保持されたキー付き記録の再取得は別です。
- 実行を完了させるワークフロータスクの処理中に受理された更新は、シグナルと同様に、実行が終了する前に一度配信の機会を得ます。そのハンドラーが実行され、呼び出し元は結果を受け取ります。実行が失敗、キャンセル、または強制終了されたときに保留中の更新は、明示的な失敗として終了します。
- 更新本体の失敗はワークフロー実行を閉じません。更新単位の失敗として記録し、実行は次のリプレイタスクに向けて開いたままです。
- クエリは完了済み更新をリプレイしますが、拒否・失敗した更新は、リプレイされないコマンドと履歴の事実としてのみ残ります。
