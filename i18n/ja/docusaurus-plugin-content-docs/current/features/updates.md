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

`request_id` はポータブルな実行単位の Update-ID 契約ではありません。検証済み PHP 経路では、同じキーを異なる引数で送っても最初の保持更新を返すことがあります。埋め込みの検索はインスタンス内の更新名もまたぎます。continue-as-new 後に再利用すると、後続へ更新を受理せず前の実行の結果を返す場合があります。終了後も保持済みキーの確認記録を返せる一方、新規更新は拒否されます。

埋め込み Laravel の更新 webhook は、呼び出し元のキーを `X-Request-Id` から取得します。プロキシを通す場合も、このヘッダーを維持してください。スタンドアロン Server の HTTP 更新は、JSON 本文の `request_id` だけをキーとして使い、`X-Request-Id` ヘッダーは相関情報として扱います。本文のキーを省略すると、同じヘッダーを持つリクエストでも重複排除キーは付きません。

検証済みの PHP 経路では、同じインスタンス内の更新名が異なっていても、同じキーで保持された記録が見つかる場合があります。1つのキーは1つの論理操作に使い、元の意図を維持します。引数を変えたり、別の更新名で再利用したり、次の実行で新しい操作を開始すると仮定したりしないでください。[公開 PHP 成果物の検証](https://github.com/durable-workflow/server/issues/505#issuecomment-6287102328)では、プロキシのヘッダーとは独立したキーと、終了後の保持記録を確認しています。この復旧動作は、同じキーを異なる意図で使った場合の移植可能な競合検出を保証しません。より広い契約は[共通 issue 216](https://github.com/durable-workflow/.github/issues/216)で扱います。Native Server や他 SDK は個別の検証が必要です。

確認記録の復旧はコマンド、更新、履歴の保持に依存します。アプリに依存しない重複排除期間を保証するものではありません。[履歴保持](../configuration/pruning-workflows.md)を確認し、必要な期間は業務台帳を保持します。証拠がなければ結果は不明のままです。

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
- 更新本体の失敗はワークフロー実行を閉じません。更新単位の失敗として記録し、実行は次のリプレイタスクに向けて開いたままです。
- クエリは完了済み更新をリプレイしますが、拒否・失敗した更新は、リプレイされないコマンドと履歴の事実としてのみ残ります。
