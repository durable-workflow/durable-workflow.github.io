---
sidebar_position: 12
title: 補償スコープ
description: Laravel 組み込みワークフローで、補償義務を作成元のワークフロー実行より長く保持し、その実行が閉じた後に回復します。
---

# 補償スコープ {#compensation-scopes}

このガイドでは `Workflow\V2\Workflow` を使用する、Laravel 組み込みワークフローでの保持型補償を説明します。[Saga](sagas.md) は、補償を登録した実行の中で補償します。補償スコープは各義務を永続的な台帳に保持するため、その実行が完了、失敗、またはキャンセルされた後でも、義務を補償できます。

キャンセルが遅れて届く可能性がある場合、たとえば出荷ワークフローが完了し、その注文が数日後にキャンセルされる場合や、順方向の操作が記録された結果を返さずに効果を持ち得る場合に、スコープを使います。

## 提供状況と安定性 {#availability-and-stability}

| 部分 | 状態 |
| --- | --- |
| `DurableScope`、`RegisteredObligation`、`Obligation`、`ScopeIdentity` | 安定化予定（2.32.0 以降） |
| `ScopedOperation`、`OperationContext`、`ForwardResult`、`Resolution`、`HandlerRegistry` | 安定化予定（2.32.0 以降） |
| `ScopeAuthorization`、`ScopeAuthorizationRefused`、`ScopeRecovery::request()`、`ScopeRecovery::describe()`、`ScopeRetention::release()` | 安定化予定（2.32.0 以降） |
| `DurableScope::reserveChild()` とルートの受け入れ（`RootReservationStore`） | 実験的 |
| `@internal` が付いたクラス（アクティビティ、永続化、回復エンジン） | 公開 API ではない |

スコープ API は 2.29.0 で実験的機能として初めて提供されました。作成元の実行が閉じた後の自動回復、回復の再試行スケジュール、`describe()` は 2.31.0 で追加されます。後続のマイナーリリース（2.32.0 以降。どのリリースかはそのリリース時に決定されます）が安定化予定とされた部分を昇格させるまで、API 全体は実験的なままで、マイナーリリースで変更される可能性があります。昇格後は、それらの部分は [2.x 互換性ポリシー](../compatibility.md)に従います。初期サポートは Laravel 組み込みと逐次補償に限られます。

## 仕組み {#how-it-works}

スコープは `(application, namespace, key, generation)` で識別されます。順方向の作業は 1 つの作成元の実行に属するため、その実行に固有の generation を選んでください。各義務は、順方向の効果をディスパッチする前に、補償とともに登録されます。台帳は次を記録します。

- クローズドなハンドラーの型とバージョン（PHP クロージャーは記録しません）
- 安定した操作 ID（ハンドラーがプロバイダーとの照合に使います）
- 可搬な入力（JSON で最大 15,360 バイト、500 個の値、深さ 7）
- 順方向と補償の結果、および証拠の参照

作成元の実行が開いている間は、その実行をキャンセルするとネイティブの Saga が動き、登録の逆順で補償します。実行が閉じた後は、正規の回復ワークフローが台帳から同じ義務を補償します。元の実行を再開したり、その実行の履歴を変更したりすることはありません。

## ホストを設定する {#set-up-the-host}

サービスプロバイダーで、スコープ認可ポリシーとクローズドなハンドラーレジストリをバインドします。ポリシーはポリシーバージョンを返します。拒否する場合は `ScopeAuthorizationRefused` をスローします。

```php
use App\Compensation\OrderScopeAuthorization;
use App\Compensation\StockReservation;
use Workflow\V2\Compensation\Execution\HandlerRegistry;
use Workflow\V2\Compensation\Security\ScopeAuthorization;

$this->app->singleton(ScopeAuthorization::class, OrderScopeAuthorization::class);
$this->app->singleton(HandlerRegistry::class, static fn (): HandlerRegistry => new HandlerRegistry([
    'stock.reserve' => ['1' => new StockReservation()],
]));
```

`ScopeAuthorization::assertAllowed($scope, $principal, $operation)` は、`register`、`forward`、`compensate`、`participate`、`request`、`release`、`inspect` のいずれかで呼び出されます。それ以外の操作名は拒否してください。恒久的な拒否となるのは `ScopeAuthorizationRefused` だけです。それ以外の例外は一時的なものとして扱われ、再試行されます。自動回復も後で再び試みます。プリンシパルは、リクエストのペイロードからではなく、信頼できるアプリケーションポリシーから導出してください。パッケージのマイグレーションを実行すると、ワークフローのストレージ接続に台帳テーブルが作成されます。

識別子（アプリケーション、キー、generation、操作キー、ハンドラーバージョン）には `A-Z a-z 0-9 . _ : / -` の文字を 1～128 文字使用し、先頭は英字か数字にします。ハンドラータイプには `a-z 0-9 . _ -` を使用し、先頭は英小文字にします。また、エンジン用に予約されている `dw.` で始めてはいけません。

## ワークフローで義務を登録する {#register-obligations-in-a-workflow}

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Compensation\Definition\Obligation;
use Workflow\V2\Compensation\Definition\ScopeIdentity;
use Workflow\V2\Compensation\DurableScope;
use Workflow\V2\Exceptions\WorkflowCancellationRequestedException;
use Workflow\V2\Workflow;

#[Type('order')]
final class OrderWorkflow extends Workflow
{
    public function handle(array $identity, array $shipment): array
    {
        $scope = new DurableScope($this, ScopeIdentity::fromArray($identity), 'order-service');
        try {
            $scope->execute(new Obligation('reserve-stock', 'stock.reserve', '1', ['sku' => 'sku-1']));
            $scope->participate('shipment', ScopeIdentity::fromArray($shipment));
            // ... start the shipment workflow, wait for business events ...

            return ['status' => 'completed'];
        } catch (WorkflowCancellationRequestedException $cancelled) {
            self::cancellationShield(fn () => $this->compensate());

            return self::cancellationShield(static fn () => $scope->verifyCompensation());
        }
    }
}
```

- `execute()` は義務を登録してから、その順方向の操作を実行します。
- `register()` は登録だけを行い、`RegisteredObligation` を返します。補償の順序をディスパッチの順序と変える必要がある場合は、同じワークフロー内で後からその `execute()` を呼び出します。
- `participate()` は子スコープを登録します。逐次補償は、それより前の親の義務を補償する前に、その子の台帳が verified になるのを待ちます。子が存在しないか検証されていない場合、それより前の親の作業は停止します。

## ハンドラーを書く {#write-a-handler}

```php
use InvalidArgumentException;
use Workflow\V2\Compensation\Execution\ForwardResult;
use Workflow\V2\Compensation\Execution\OperationContext;
use Workflow\V2\Compensation\Execution\Resolution;
use Workflow\V2\Compensation\Execution\ScopedOperation;

final class StockReservation implements ScopedOperation
{
    public function assertInput(array $input): void
    {
        if (! is_string($input['sku'] ?? null)) {
            throw new InvalidArgumentException('A SKU is required.');
        }
    }

    public function execute(OperationContext $context): ForwardResult
    {
        // Idempotent by operation ID: a retry or a lost acknowledgement finds the same reservation.
        $reservation = Stock::reserve($context->operationId, $context->obligation->input['sku']);

        return ForwardResult::observed(['reservation' => $reservation->id], ['stock:' . $reservation->id]);
    }

    public function compensate(OperationContext $context): Resolution
    {
        if (! Stock::release($context->operationId)) {
            return Resolution::unknown('stock-release-pending');
        }

        return Resolution::verified(['stock-release:' . $context->operationId]);
    }
}
```

ハンドラーは同じ操作に対して複数回実行される可能性があるため、両方のメソッドを `operationId` で冪等にしてください。

- `execute()` は、証拠を伴う `ForwardResult::observed()`、プロバイダーの結果が不確かな場合は `unknown()`、プロバイダーが確実に何の効果も生じさせなかった場合は `rejected()` を返します。拒否された順方向の操作は、ワークフローの呼び出しを `scope_forward_rejected` で失敗させ、その補償にプロバイダーの呼び出しは必要ありません。`$context->reconcileBeforeForward` が true の場合、以前の試行が効果を生じている可能性があります。再度発行する前に、その操作を照会してください。
- `compensate()` が `Resolution::verified()` を返すのは、効果が取り消され、かつ順方向の効果が遅れて生じる可能性がないという証拠がある場合だけです。コールバックの戻り値、タイムアウト、閉じた実行はその証拠になりません。義務を未解決のまま保ち、ネイティブの再試行を実行させるには `unknown()` を返し、補償を確実に完了できない場合は `failed()` を返します。`$context->forwardOutcomeUnconfirmed` が true の場合、順方向の効果は一度も確認されておらず、まだ遅れて生じる可能性があります。

## キャンセルと回復 {#cancel-and-recover}

安定したリクエストキーを指定して補償をリクエストします。

```php
use Workflow\V2\Compensation\Recovery\ScopeRecovery;

$result = app(ScopeRecovery::class)->request($scope, 'cancel-order-42', 'order-service', 'customer-cancelled');
```

- 作成元の実行がまだ開いている場合、リクエストはその実行にキャンセルを求め、その Saga が補償します。
- スコープが未検証のままその実行が閉じた場合、タスクウォッチドッグは次のパスで同じリクエストを正規の回復へ回します。ウォッチドッグはキューワーカーのループと `workflow:v2:repair-pass` で動作し、まず元のプリンシパルを再認可します。同時に実行されたパスや、競合する手動リクエストがあっても、開始される回復実行は 1 つです。
- 実行がすでに閉じている場合、リクエストは正規の回復を直接開始します。

回復実行は、補償ごとに最大 6 回試行します。試行の間には 1、2、5、10 秒待ち、その後はアクティビティのリース 1 回分とタスク修復パス 1 回分待つため、クラッシュしたワーカーの試行は最後の試行の前に回収されます。子の検証、または新しい認可済みリクエストがあると、待機中の再試行はすぐに起動します。永続的な失敗は引き続き回復実行を失敗させ、義務は未解決のまま残ります。

結果は `describe()` で確認します。読み取り専用で、`inspect` の認可が必要です。常に同じキーを返します。ステータスは `ScopeStatus`、`NextAction`、`AutomaticRecovery`、`ObligationStatus` の各 enum の値です。拒否は安定した `code` とホストの `message` で表され、`message` は機械処理向けには安定していません。

```php
$view = app(ScopeRecovery::class)->describe($scope, 'order-service');
// scopeStatus, originStatus, recoveryRunId, recoveryStatus, automaticRecovery, refusal, nextAction, unresolved
```

自動回復が拒否された場合（`automaticRecovery: recovery_authorization_failed`）や回復実行が失敗した場合、`nextAction` は `submit_fresh_authorized_request` になります。その場合は新しいリクエストキーを送信してください。リクエストキーを繰り返すと元の受領情報が返され、別の実行が開始されることはありません。

スコープの台帳は補償を確定させます。注文を `cancelled` にするといった業務上の判断は、`scopeStatus` が `verified` になった後にアプリケーションが行う手順のままです。推奨パターンは、エンジンリポジトリのプロバイダー例と同様に、回復実行の完了時に業務上のキャンセルを確定させるリスナーです。

## 保持、アップグレード、ロールバック {#retention-upgrade-and-rollback}

- `ScopeRetention::release($scope, $principal)` は、検証後に保持された入力と順方向の結果を削除します。tombstone は残るため、古い generation やリクエストキーが再び受け入れられることはありません。自動的に期限切れになるものはなく、実行履歴の削除（pruning）が台帳を削除することもありません。
- 台帳がスコープ（解放済みの tombstone を含む）を 1 つでも保持している間、スキーマのロールバックは、どのマイグレーションの `down()` も実行する前に拒否されます。元に戻すには、アップグレード前に取得したデータベースのバックアップを復元してください。
- パッケージだけをダウングレードした場合、台帳は保持されます。再度アップグレードすると回復が再開されます。回復実行が開いている間はダウングレードしないでください。

## 保証と制限 {#guarantees-and-limits}

昇格後は、安定した API は 2.x の範囲内で互換性のない変更を受けません。記録された補償の履歴は、以降のすべての 2.x リリースでリプレイされ、新しい動作は記録されたバージョンマーカーの背後でのみ導入されます。台帳のマイグレーションは追加のみを行います。

次の制限は最小値であり、引き上げられることはあっても引き下げられることはありません。

- 義務の入力は JSON で 15,360 バイト、500 個の値、深さ 7。順方向の結果の値は 11,264 バイト、400 個の値、深さ 7
- スコープあたり 256 個の義務（最大 16 個の子の参加者を含む）、ネストは 1 段階
- スコープあたり 128 件のリクエスト（エンジンの子リクエストと共有）
- 結果あたり、最大 128 バイトの証拠参照を 32 個

保証されないもの: ウォッチドッグのタイミング、正確な再試行間隔（回復がリース修復 1 回分より長く続くことだけが保証されます）、台帳の行レイアウト、および `@internal` が付いたすべてのもの。外部効果の厳密に 1 回の実行は決して約束されません。操作 ID によるプロバイダーとの照合は、ハンドラーの責任です。

エンジンリポジトリの[補償スコープガイド](https://github.com/durable-workflow/workflow/blob/main/docs/compensation-scopes.md)には、実験的な子の予約とルートの受け入れの API を含む、完全な契約が記載されています。
