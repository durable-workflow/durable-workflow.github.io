---
sidebar_position: 18
---

# メモ {#memo}

メモは実行中にいつでも読み取り・更新できる、索引のないキーと値のメタデータです。索引がありフィルター可能な[検索属性](./search-attributes.md)とは異なり、詳細や履歴エクスポートに表示する豊富な構造化メタデータ向けです。契約上、全実行を横断するフィルターや並べ替えには含みません。

## メモの upsert {#upserting-memos}

`upsertMemo()` は永続的な逐次ヘルパーです。呼び出しごとに型付き `MemoUpserted` を記録し、新しい項目を実行の保存済みメモに結合します。

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, upsertMemo};

final class OrderWorkflow extends Workflow
{
    public function handle(string $orderId, string $customer): array
    {
        upsertMemo([
            'customer_name' => $customer,
            'order_id' => $orderId,
            'status' => 'processing',
            'line_items' => [
                ['sku' => 'WIDGET-1', 'qty' => 2],
                ['sku' => 'GADGET-3', 'qty' => 1],
            ],
        ]);

        $result = activity(ProcessOrderActivity::class, $orderId);

        upsertMemo([
            'status' => 'completed',
            'result_summary' => $result->outcome,
        ]);

        return $result->toArray();
    }
}
```

開始時に `StartOptions` でも設定できます。

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(OrderWorkflow::class, 'order-123');
$workflow->start(
    'ORD-456',
    'Taylor',
    StartOptions::rejectDuplicate()->withMemo([
        'source' => 'api',
        'priority' => 'high',
    ]),
);
```

## 仕組み {#how-it-works}

`upsertMemo()` はキーと値の連想配列を受け取ります。

- **キー**は英字、数字、`.`、`_`、`-`、`:` からなる1〜64文字で、`42` のような整数にはできません
- **値**はスカラー、null、配列、入れ子オブジェクトなど、JSON シリアライズ可能なデータです。
- 値に `null` を渡すとキーを削除します。

呼び出しごとに次を行います。

1. ワークフロー Fiber を中断し、`UpsertMemoCall` コマンドを返します。
2. 実行器が項目を検証・正規化します（キーをアルファベット順に整列）。
3. upsert する `entries` と完全な結合結果 `merged` を持つ `MemoUpserted` を追加します。
4. 実行の `memo` 列を結合済みマップで更新します。

リプレイは upsert を再実行せず記録済みイベントを再利用し、決定性を保ちます。

## 結合の動作 {#merging-behavior}

同じ実行で複数回 upsert するとメモを結合します。新しいキーは既存マップに重ねられます。

```php
// First upsert
upsertMemo(['status' => 'processing', 'customer' => 'Taylor']);
// memo = { customer: Taylor, status: processing }

// Second upsert
upsertMemo(['status' => 'completed', 'result' => 'success']);
// memo = { customer: Taylor, result: success, status: completed }
```

削除するキーには `null` を指定します。

```php
upsertMemo(['temporary_note' => null]);
```

## 可視化 {#visibility}

メモは次に表示されます。

- **実行詳細**: Waterline の詳細ページに結合済みメモ全体を表示。
- **履歴タイムライン**: 各 `MemoUpserted` を型付き項目として表示。
- **履歴エクスポート**: JSON 履歴に含む。
- **Describe**: コントロールプレーンの `describe` 応答に現在のメモを含む。

メモは実行サマリー投影に**含まれず**、フィルター、並べ替え、保存済みビューには**使えません**。索引付きでフィルター可能なメタデータには[検索属性](./search-attributes.md)を使います。

## 新しい実行への継続 {#continue-as-new}

continue-as-new 時、現在のメモは自動で引き継がれます。新しい実行は前の結合済みマップ全体で開始し、引き続き upsert できます。

## 入れ子構造 {#nested-structures}

スカラーに限定される検索属性と異なり、メモは入れ子の JSON 構造をサポートします。

```php
upsertMemo([
    'order' => [
        'id' => 'ORD-456',
        'items' => [
            ['sku' => 'WIDGET-1', 'qty' => 2],
            ['sku' => 'GADGET-3', 'qty' => 1],
        ],
    ],
    'metadata' => [
        'source' => 'api',
        'version' => 2,
    ],
]);
```

キーの規則はメモの最上位のキーに適用されます。入れ子の値はメモ値のサイズ上限に含まれます。

## 制約 {#constraints}

- キー名: 英字、数字、`.`、`_`、`-`、`:` からなる1〜64文字で、`42` のような整数は不可。規則は最上位のキーに適用されます。
- サイズ: 各値はエンコード後最大10,240バイト、最大100キー、実行ごとに合計65,536バイト。[`memo_size_bytes`](../constraints/structural-limits.md#memo-size) の上限（既定 64 KiB）は合計を厳しくできますが、引き上げることはできません。
- 上限を超えると `StructuralLimitExceededException` が発生し、その `limitName` がどの上限かを示します。開始は何も書き込まずに拒否され、ワークフローコードからの upsert は実行を `structural_limit` の失敗として終了させます。
- upsert のたびに `MemoUpserted` 履歴イベントが追加されるため、ループ内の upsert は履歴を増やします。
- 値: JSON シリアライズ可能な型（スカラー、null、配列、入れ子オブジェクト）。
- `null` でキーを削除。
- メモは結果整合のメタデータでありリプレイの正ではありません。値に基づいてワークフローを分岐させないでください。

## メモ、検索属性、可視化ラベルの比較 {#memo-vs-search-attributes-vs-visibility-labels}

| | メモ | 検索属性 | 可視化ラベル |
|---|---|---|---|
| **設定時期** | 開始時または実行中 | 実行中の任意の時点 | 開始時のみ |
| **変更可能** | はい、`upsertMemo()` | はい、`upsertSearchAttributes()` | いいえ |
| **値の型** | JSON シリアライズ可能なもの | スカラーと文字列のリスト | スカラーのみ |
| **索引** | なし | あり | あり |
| **フィルター** | 不可 | 可 | 可 |
| **用途** | 豊富なメタデータ、注記、コンテキスト | 動的な状態、進捗追跡 | 静的な分類 |
| **履歴イベント** | upsert ごとに `MemoUpserted` | upsert ごとに `SearchAttributesUpserted` | なし（開始時に設定） |
