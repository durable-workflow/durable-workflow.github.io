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

開始時の検索属性は `upsertSearchAttributes()` と同じキー規則と上限に従います。null 値は破棄されます（保存されません）。上限を超える開始は、何も書き込まれる前に拒否されます。

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

- **キー**は英字、数字、`.`、`_`、`-`、`:` からなる1〜64文字です
- **値**は string、int、float、bool、文字列のリスト、または null です。サイズの上限は[プライバシーと上限](#privacy-and-limits)を参照してください
- 値に `null` を渡すと、そのキーは検索属性から削除されます

呼び出しごとに次を行います。

1. ワークフロー Fiber を中断し、`UpsertSearchAttributesCall` を返します。
2. 実行器が属性を検証・正規化します（キーをアルファベット順に整列）。
3. upsert する `attributes` と完全な結合結果 `merged` を持つ `SearchAttributesUpserted` を追加します。
4. 実行の `search_attributes` 列を結合済みマップで更新します。
5. Waterline に直ちに反映するため実行サマリー投影を更新します。

リプレイは upsert を再実行せず記録済みイベントを再利用し、決定性を保ちます。

## 属性の登録 {#registering-attributes}

Server では、`POST /api/search-attributes` で型を指定して検索属性を登録できます。登録したキーにはその型の値が必要になり、型が違う開始や upsert は拒否されます。

登録が制約するのは、登録したキーだけです。ネイティブ Server 3.5.0 以降では、登録されていないキーも引き続き受け付けられ、登録済み属性のない namespace と同じように型が推論されます。1 つの属性を登録しても、別のキーを upsert する実行中のワークフローは壊れません。PHP Server 2.x と 3.5.0 より前のネイティブ Server は、いずれかの属性が登録されると未登録のキーをすべて拒否します。そのため、これらでは最初の属性を登録する前に、ワークフローが使うすべてのキーを登録してください。

登録を削除すると、そのキーの検証は行われなくなります。保存済みの値と実行中のワークフローは変わらず、以降のそのキーの upsert は再び型が推論されます。ネイティブ Server では、登録されていないキー（登録を削除したキーを含む）でフィルターするリストクエリは、そのキーが namespace で定義されていないため拒否されます。

属性の型を変更するには、新しい型で新しい属性名を登録し、ワークフローがその名前に書き込むよう更新して、既存の実行が追いついたら新しい名前でフィルターします。同じ名前を削除して別の型で登録し直すと、以前の値は古い型のまま残ります。

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

Server 側の型付き比較、時間範囲、所属、引用符、HTTP ページングには[可視性クエリ言語](../polyglot/visibility-query-language.md)を使います。現在の embedded 一覧と Waterline の保存ビュー用フィルターは文法全体を実装していません。共通の同等性対応は[可視性クエリ機能](https://github.com/durable-workflow/.github/issues/224)で未完了です。

### 親子の一覧フィルター {#parent-child-list-filters}

子は[作成時に検索属性と memo を継承](./child-workflows.md#child-metadata-inheritance)し、その後は独立して値を更新できます。継承属性でフィルターしても、子が自動的に除外されることはありません。登録済み keyword 属性の Server クエリ `customer = 'customer-42'` は、親と、その値を保持するすべての子を返す場合があります。Memo は引き続きインデックスのないメタデータであり、検索属性のフィルターではありません。

検証した Server 2.11.0 の一覧 API には、**ルートのみ、または子のみを選ぶ組み込み述語はありません**。`ParentWorkflowId`、`RootWorkflowId`、`IsChildWorkflow` はクエリ言語の自動的な関係フィールドではなく、公開版の検証では未登録名として拒否されます。同名のカスタム属性を登録しても、親子の識別情報は自動で入りません。ワークフロー型フィルターが選ぶのは型であり、型を横断したすべてのルートや子ではありません。

実際の親子関係が必要なときは、実行の系譜を確認してください。より広い共通の可視性フィルターは引き続き[製品側の作業](https://github.com/durable-workflow/.github/issues/224)です。この制限の説明や利用者独自のメタデータ規約が、その機能の提供に代わるものではありません。[検証記録](https://github.com/durable-workflow/durable-workflow.github.io/issues/368#issuecomment-6362355504)には、親子の両方が返る結果と拒否された述語を残しています。

## datetime 検索属性の修復 {#repair-datetime-search-attributes}

履歴に基づく修復コマンドには、**実際にインストールされた Workflow 2.12.0 以降**が必要です。実行する Laravel アプリケーションで `composer.lock` と `php artisan help workflow:v2:repair-search-datetimes` を確認してください。ソースの checkout や Composer の制約だけでは、コマンドがインストール済みとは確認できません。

datetime の projection は、マイクロ秒精度の UTC 時点を保存します。`2026-10-08T12:34:56.123456+02:00` は `2026-10-08T10:34:56.123456Z` です。旧 writer は型付き履歴に offset を残しながら、offset のローカル時刻を保存することがありました。更新は新たな writer の誤りを防ぎますが、既存行を特定したり書き換えたりはしません。保存済み時刻から元のタイムゾーンを推測しないでください。

先にすべての projection writer を更新し、workflow のデータベースをバックアップしてください。ワークフローのインスタンス ID ではなく、**正確な run ID** を使います。まずプレビューします。

```sh
php artisan workflow:v2:repair-search-datetimes RUN_ID --namespace=production --json
php artisan workflow:v2:repair-search-datetimes RUN_ID --namespace=production --key=SubmittedAt --json
```

`--namespace=production` は完全一致のガードです。run の実際の namespace を指定してください。旧来の null namespace も含め、正確な run ID だけで十分な場合に限って省略します。明示的な空 namespace は拒否されます。`--key` を省略すると、その run の datetime 属性が対象です。既知のキーを複数選ぶ場合は `--key=SubmittedAt --key=ApprovedAt` のように繰り返します。

既定はプレビューです。`examined`、`would_repair`、正確な run とキーの選択を確認してから、同じ選択を明示的に適用します。

```sh
php artisan workflow:v2:repair-search-datetimes RUN_ID --namespace=production --key=SubmittedAt --apply --json
```

選択した属性と run summary を読み直し、再びプレビューしてください。根拠が変わらず値が正しければ、apply を繰り返しても修復数はゼロです。一部を修復できても、未選択のキーが正しいとは限りません。

各キーについて、保持されている最新の明示的に型付けされた `SearchAttributesUpserted` が必要で、その元の論理コマンドシーケンスが projection と一致しなければなりません。履歴の削除、根拠の欠落・古さ、曖昧なタイムゾーン、namespace の不一致、datetime 属性として残っていないキーは拒否されます。1つでも証明できないキーがあれば選択全体を拒否します。offset を推測せず、履歴を調べ、証明できるキーだけを選んでください。

コマンドは選択全体をロックして検証した後、派生属性と summary を1つのストレージトランザクションで更新します。正本の履歴、業務コマンド、run/task の識別子、lease は変更しません。JSON の失敗は `refused` と `unverified` を区別します。予期しないストレージエラー後は、再試行前に行を確認してください。不確かな commit は rollback を保証しません。

修復対象は派生検索属性と summary です。削除された履歴は復元せず、正本の input も変えません。Server の別の visibility query binding 処理とイメージへの採用には、それぞれ検証済みの提供が必要です。Core の tag だけでは HTTP の修正を確認できません。[正規の復旧手順](https://github.com/durable-workflow/workflow/blob/b3bbfdb5258c68546ae38ca1fde52818e4b05d12/docs/architecture/projection-timestamp-storage.md#datetime-search-attributes)を参照してください。

## 新しい実行への継続 {#continue-as-new}

continue-as-new 時、現在の検索属性は自動で引き継がれます。新しい実行は前の結合済みマップ全体で開始し、引き続き upsert できます。

## プライバシーと上限 {#privacy-and-limits}

検索属性は**平文の運用メタデータ**です。Waterline にアクセスできる人なら値を参照でき、暗号化せず保存します。秘密、パスワード、トークン、個人識別情報（PII）を保存しないでください。

制約:

- キー名: 英字、数字、`.`、`_`、`-`、`:` からなる1〜64文字。Server では検索属性を先に登録する必要があり、登録名は英字で始まり、英字、数字、`_` のみを使います（最大128文字）。両方のモードで使うキーにはこの形式を使ってください。
- 値: 最大2,048文字の文字列、最大255文字の keyword、keyword のリスト、int、float、bool、datetime。
- 実行ごと: 最大100属性、合計65,536バイト。[`search_attribute_size_bytes`](../constraints/structural-limits.md#search-attribute-size) の上限（既定 40 KiB）は合計を厳しくできますが、引き上げることはできません。
- 上限を超えると `StructuralLimitExceededException` が発生し、その `limitName` がどの上限かを示します。開始は何も書き込まずに拒否され、ワークフローコードからの upsert は実行を `structural_limit` の失敗として終了させます。
- upsert のたびに `SearchAttributesUpserted` 履歴イベントが追加されるため、ループ内の upsert は履歴を増やします。
- 値を `null` にすると、そのキーは削除されます

## 検索属性、メモ、可視化ラベルの比較 {#search-attributes-vs-memo-vs-visibility-labels}

| | 検索属性 | メモ | 可視化ラベル |
|---|---|---|---|
| **設定時期** | 開始時または実行中 | 開始時または実行中 | 開始時のみ |
| **変更可能** | はい、`upsertSearchAttributes()` | はい、`upsertMemo()` | いいえ |
| **値の型** | スカラーと文字列のリスト | JSON シリアライズ可能なもの | スカラーのみ |
| **索引** | あり | なし | あり |
| **フィルター** | 可 | 不可 | 可 |
| **用途** | 動的な状態、進捗追跡 | 豊富なメタデータ、注記、コンテキスト | 静的な分類 |
| **履歴イベント** | upsert ごとに `SearchAttributesUpserted` | upsert ごとに `MemoUpserted` | なし（開始時に設定） |

フィルターや並べ替えが不要な豊富な構造化メタデータには[メモ](./memo.md)を使います。
