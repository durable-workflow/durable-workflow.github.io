---
title: サービス操作
description: 埋め込み PHP ワークフローから別の名前空間の操作を呼び出します。
---

# サービス操作 {#service-operations}

ワークフローが別の名前空間に属するサービスの永続的な結果を必要とする場合は、サービス操作を使います。呼び出し元は登録済みのエンドポイント、サービス、操作を指定します。ランタイムが呼び出しと結果を記録するため、代替の Worker も同じ結果をリプレイできます。

子ワークフローとシグナルは元の名前空間に留まります。子の型名やタスクキューを変えても、この境界は越えられません。同じ Durable Workflow クラスターの別の名前空間で公開された処理には、サービス操作を使ってください。

## 埋め込み PHP から呼び出す {#call-from-embedded-php}

呼び出し元を開始する前に、対象のカタログとハンドラーを登録します。[サービスモードのガイド](../polyglot/service-operations.md)で、共通カタログ、境界ポリシー、個別に公開される SDK のインターフェースを説明しています。

埋め込みヘルパーは、アプリケーションのランタイム自身のサービスカタログと制御プレーンを使います。自動的にリモート Server へ接続するわけではありません。呼び出し元がサービスモードのリモート Worker の場合は PHP SDK を使ってください。

```php
use Workflow\V2\Support\ServiceOperationOptions;
use Workflow\V2\Workflow;

final class CreateInvoice extends Workflow
{
    public function handle(int $invoiceId): mixed
    {
        $call = self::serviceOperation(
            'billing',
            'invoices',
            'create',
            [$invoiceId],
            new ServiceOperationOptions(
                targetNamespace: 'billing',
                modeOverride: 'sync',
                waitFor: 'completed',
            ),
        );

        return $call->responsePayload;
    }
}
```

`serviceOperation()` は `ServiceOperationResult` を返します。これには永続的な `serviceCallId`、ライフサイクル状態、処理結果、レスポンスデータが含まれます。サービスの終端失敗やキャンセルは、元の呼び出し位置で型付きワークフロー例外として復元されます。アプリケーションの失敗マッピングをリプレイ時にも利用可能にしてください。

## 呼び出し元が待つ条件を選ぶ {#choose-what-the-caller-waits-for}

次のワークフロー判断にサービス結果が必要なら、`modeOverride: 'sync'` と `waitFor: 'completed'` を使います。呼び出しが終端に達するまで、ワークフローは永続的に中断されます。

受け付けだけで十分なら、`modeOverride: 'async'` または `waitFor: 'accepted'` を使います。返されたレコードは元の呼び出しを識別します。受け付けは業務処理の完了を意味しません。対象が後で完了しても、受け付けだけを待った呼び出し元の記録済み結果は書き換わりません。ワークフローが終端結果を必要とする場合は、最初から完了待ちを選びます。

## 記録済みの契約を維持する {#preserve-the-recorded-contract}

開いている実行では、対象名前空間、エンドポイント/サービス/操作、リクエスト、待機オプションを安定させてください。互換性のない変更にはワークフローのバージョン分岐を使います。リプレイは記録済みの呼び出し識別情報と結果を再利用し、新しい実行を要求しません。

明示的な冪等性キーは永続的な業務上の識別情報です。同じ意図の操作とリクエストにだけ再利用してください。レスポンスの紛失や待機期限切れだけを理由に変更しないでください。別の業務操作が安全か判断する前に、元の呼び出しを確認します。

サービス実行を制限するには、カタログ操作の `deadline_policy` を設定します。`timeout_seconds` は元の受け付け時点から一度だけ解決され、`call_deadline_at` になります。代わりにオフセット付きの `deadline_at` も使えます。Worker の交換やリプレイで期限は更新されません。`waitTimeoutSeconds` はサービス実行期限ではありません。ワークフローとサービスの予算を整合させ、タイムアウト後は対象を確認してください。外部への作用がなかったと推測しないでください。

## 関連ガイド {#related-guides}

- [名前空間をまたぐサービス呼び出し](../polyglot/service-operations.md)
- [子ワークフロー](./child-workflows.md)
- [バージョニング](./versioning.md)
- [失敗と復旧](../failures-and-recovery.md)
