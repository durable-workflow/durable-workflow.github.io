---
sidebar_position: 17
---

# 検索属性 {#search-attributes}

検索属性は、実行中いつでも upsert できる型付き・索引付きのキーと値です。開始時に1度だけ設定する可視化ラベルと異なり、進行に合わせて更新できます。状態、顧客識別子、その他の実行中に変化する運用者向けメタデータの追跡に適しています。

## 検索属性の upsert {#upserting-search-attributes}

`upsertSearchAttributes()` は永続的な逐次ヘルパーです。各呼び出しで型付き `SearchAttributesUpserted` を記録し、新しい属性を実行の保存済み属性に結合します。

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, upsertSearchAttributes};

final class OrderWorkflow extends Workflow
{
    public function handle(string $orderId, string $customer): array
    {
        upsertSearchAttributes([
            'status' => 'processing',
            'customer' => $customer,
            'order_id' => $orderId,
        ]);

        $result = activity(ProcessOrderActivity::class, $orderId);

        upsertSearchAttributes([
            'status' => 'completed',
            'result' => $result->outcome,
        ]);

        return $result->toArray();
    }
}
```

## 開始時の検索属性の設定 {#setting-search-attributes-at-start-time}

`StartOptions::withSearchAttributes()` で開始時にも設定できます。属性は直ちに実行へ記録され、`StartAccepted` と `WorkflowStarted` に現れます。後の `upsertSearchAttributes()` はその上に結合します。

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(OrderWorkflow::class, 'order-42');
$workflow->start(
    $orderId,
    $customer,
    StartOptions::rejectDuplicate()->withSearchAttributes([
        'env' => 'production',
        'region' => 'us-east',
        'priority' => 'high',
    ]),
);
```

`withSearchAttributes()` は他の `StartOptions` ビルダーと連鎖できます。

```php
$options = StartOptions::rejectDuplicate()
    ->withBusinessKey('order-42')
    ->withLabels(['tenant' => 'acme'])
    ->withMemo(['note' => 'VIP order'])
    ->withSearchAttributes(['priority' => 'high']);

$workflow->start($orderId, $customer, $options);
```

開始時も同じ検証ルールです。キーは URL 安全な1〜64文字、値はスカラーまたは null で、null は保存せず除去します。

### コントロールプレーン {#control-plane}

コントロールプレーンの `start()` も検索属性を受け付けます。

```php
$controlPlane->start('orders.process-order', 'order-42', [
    'arguments' => $serializedArgs,
    'search_attributes' => ['env' => 'production', 'priority' => 'high'],
]);
```

## 仕組み {#how-it-works}

`upsertSearchAttributes()` はキーと値の連想配列を受け取ります。

- **キー**は URL 安全な1〜64文字（英字、数字、ハイフン、アンダースコア）です。
- **値**はスカラー（string、int、float、bool）または null で、文字列は191文字以内です。
- 値に `null` を渡すとキーを削除します。

呼び出しごとに次を行います。

1. ワークフロー Fiber を中断し、`UpsertSearchAttributesCall` を返します。
2. 実行器が属性を検証・正規化します（キーをアルファベット順に整列）。
3. upsert する `attributes` と完全な結合結果 `merged` を持つ `SearchAttributesUpserted` を追加します。
4. 実行の `search_attributes` 列を結合済みマップで更新します。
5. Waterline に直ちに反映するため実行サマリー投影を更新します。

リプレイは upsert を再実行せず記録済みイベントを再利用し、決定性を保ちます。

## 結合の動作 {#merging-behavior}

同じ実行で複数回 upsert すると属性を結合し、新しいキーを既存マップに重ねます。

```php
// First upsert
upsertSearchAttributes(['status' => 'processing', 'customer' => 'Taylor']);
// search_attributes = { customer: Taylor, status: processing }

// Second upsert
upsertSearchAttributes(['status' => 'completed', 'result' => 'success']);
// search_attributes = { customer: Taylor, result: success, status: completed }
```

削除するキーには `null` を指定します。

```php
upsertSearchAttributes(['temporary_flag' => null]);
```

## 可視化とフィルター {#visibility-and-filtering}

検索属性は次に表示されます。

- **実行詳細**: ラベルとメモの横に結合済みマップを表示。
- **実行サマリー投影**: 高速な読み取り用の非正規化サマリーに含む。
- **可視化フィルター**: Waterline の保存済みビューで値による実行の絞り込みが可能。
- **履歴タイムライン**: 各 `SearchAttributesUpserted` を型付き項目として表示。
- **履歴エクスポート**: JSON 履歴に含む。

## 新しい実行への継続 {#continue-as-new}

continue-as-new 時、現在の検索属性は自動で引き継がれます。新しい実行は前の結合済みマップ全体で開始し、引き続き upsert できます。

## プライバシーと上限 {#privacy-and-limits}

検索属性は**平文の運用メタデータ**です。Waterline にアクセスできる人なら値を参照でき、暗号化せず保存します。秘密、パスワード、トークン、個人識別情報（PII）を保存しないでください。

制約:

- キー名: URL 安全な1〜64文字（`[a-zA-Z0-9_-]`）。
- 値: スカラー型のみ（string、int、float、bool）、文字列は191文字以内。
- `null` でキーを削除。

## 検索属性、メモ、可視化ラベルの比較 {#search-attributes-vs-memo-vs-visibility-labels}

| | 検索属性 | メモ | 可視化ラベル |
|---|---|---|---|
| **設定時期** | 開始時または実行中 | 開始時または実行中 | 開始時のみ |
| **変更可能** | はい、`upsertSearchAttributes()` | はい、`upsertMemo()` | いいえ |
| **値の型** | スカラーのみ | JSON シリアライズ可能なもの | スカラーのみ |
| **索引** | あり | なし | あり |
| **フィルター** | 可 | 不可 | 可 |
| **用途** | 動的な状態、進捗追跡 | 豊富なメタデータ、注記、コンテキスト | 静的な分類 |
| **履歴イベント** | upsert ごとに `SearchAttributesUpserted` | upsert ごとに `MemoUpserted` | なし（開始時に設定） |

フィルターや並べ替えが不要な豊富な構造化メタデータには[メモ](./memo.md)を使います。
