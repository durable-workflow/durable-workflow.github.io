---
sidebar_position: 10
---

import ConcurrencySimulator from '@site/src/components/ConcurrencySimulator';

# 並行実行 {#concurrency}

このガイドは `Workflow\V2\Workflow` を使う埋め込み Laravel の並行実行を扱います。サービスモードは [PHP SDK ガイド](https://php.durable-workflow.com/build/workflows-activities/)、[Python SDK ガイド](https://python.durable-workflow.com/sdk-reference/#deterministic-parallel-groups)、[Rust SDK リファレンス](https://rust.durable-workflow.com/durable_workflow/struct.WorkflowContext.html#method.parallel)を参照してください。

`all([...])` は中断前に永続グループ全体を記述します。ランタイムはアクティビティと子のコマンドをスケジュールし、元の入れ子の入力構造で結果を返します。

全体ではなく最初の完了で進む場合は選択グループを使います。これも永続的で、全メンバーを開始して勝者を1つ記録します。勝者以外は、コードが待機または明示的にキャンセルするまで動き続けます。

## 直列実行 {#series}

この例は3つを直列に実行し、各完了を待って次に進みます。

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return [
            activity(MyActivity1::class),
            activity(MyActivity2::class),
            activity(MyActivity3::class),
        ];
    }
}
```

<ConcurrencySimulator
  activities={[
    { name: 'MyActivity1', duration: 1500 },
    { name: 'MyActivity2', duration: 2000 },
    { name: 'MyActivity3', duration: 1200 },
  ]}
  mode="series"
  title="直列実行シミュレーター"
/>

## 並列実行 {#parallel}

この例は3つを並列に実行し、すべての完了を待って結果を集めます。

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return all([
            fn () => activity(MyActivity1::class),
            fn () => activity(MyActivity2::class),
            fn () => activity(MyActivity3::class),
        ]);
    }
}
```

<ConcurrencySimulator
  activities={[
    { name: 'MyActivity1', duration: 2000 },
    { name: 'MyActivity2', duration: 1500 },
    { name: 'MyActivity3', duration: 2500 },
  ]}
  mode="parallel"
  title="並列実行シミュレーター"
/>

違いは中断の場所です。直列では各 `activity()` が直接中断・再開します。並列ではクロージャが先にバリア全体を記述し、`all()` がグループ全体で1度中断するため、再開前に全メンバーを並列実行できます。

## 最初の完了の選択 {#first-completion-selection}

`select([...])` は独立したアクティビティ、子、タイマー、シグナル待機、条件待機、入れ子の通常バリアを開始し、1つが対象の結果や型付き失敗をコミットすると再開します。後で区別・再参照するメンバーには安定したアプリキーを付けます。キーは空でない文字列か非負整数です。

以下の調整処理はリゾルバーと同じ永続ステップで期限を開始します。入力処理やリゾルバーの進捗で、その期限をリセットしたり延期したりできません。

```php
use function Workflow\V2\{activity, await, select, timer};
use Workflow\V2\Workflow;

final class ResolveInRealTime extends Workflow
{
    public function handle(string $requestId): array
    {
        $selected = select([
            'resolved' => fn () => activity(ResolveRequest::class, $requestId),
            'manual' => fn () => await('resolution.received'),
            'deadline' => fn () => timer('2 seconds'),
        ]);

        if ($selected->key === 'deadline') {
            $selected->handles['resolved']->cancel();

            return ['status' => 'timed_out'];
        }

        // The deadline is not cancelled just because another member won.
        $selected->handles['deadline']->cancel();

        return [
            'status' => 'resolved',
            'source' => $selected->key,
            'value' => $selected->result(),
        ];
    }
}
```

結果は安定したメンバーキーとインデックス、操作種別と永続識別情報、結果または型付き失敗、勝者ハンドル、全メンバーのハンドルを含みます。非勝者は後で `await()` で待機、`cancel()` でキャンセルできます。選択は兄弟を暗黙に捨てたりキャンセルしたりしません。`cancel()` は void/unit の要求で、キャンセルが勝ったか返しません。結果の正は `SelectionOperationCancelled` 履歴です。完了が先にコミットされればキャンセルマーカーは書かれず、コミット済みタスク境界、後続コマンド、終端イベントが何もしない処理のコミットを証明した後にのみ、リプレイはキャンセル呼び出しを越えます。クエリは処理中のキャンセルで止まり、その後の推測状態を表示しません。何もしない処理のコミット後にハンドルを待つと、先の完了が返ります。

ランタイムは親実行のコミットロック中に最初の対象解決を記録します。コールド再起動、保存履歴の再読込、クエリ、後の非勝者完了は、言語ローカルな Future を競わせたり履歴順を解釈し直したりせず記録済み勝者を再利用します。完全な重複配信は冪等です。同時入力はコミット済み永続履歴で順序付けられ、アクティビティ中の入力は次のタスクで見えます。遅延・重複入力で記録済み勝者は置換しません。

## 入れ子のバリア {#nested-barriers}

入れ子の `all([...])` は1ステップで永続的な fan-out/fan-in の木を表します。各アクティビティや子を永続的な葉シーケンスとしてスケジュールし、完全な `parallel_group_path` を記録し、囲む各バリアが進めるまで待って、元の結果構造を復元します。リプレイでは葉が記録済み経路と一致する必要があります。グループ情報のない型付き葉履歴は推測で割り当てず、非互換の旧プレビュー履歴として扱います。

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

final class NestedWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => activity(BuildSummary::class),
            fn () => all([
                fn () => activity(BuildInvoice::class),
                fn () => activity(BuildShipment::class),
            ]),
        ]);
    }
}
```

Waterline は合成した1つの「入れ子」待機ではなく3つの未解決の葉を表示します。最初は外側バリアだけに属し、2番目と3番目は2項目の `parallel_group_path` を持つため、外側と未完了の内側サブグループを確認できます。

外側のサイズは入れ子配列数ではなく永続的な葉の数です。各葉の外から内への `parallel_group_path` は、各項目で同じ永続ワークフロー位置を保ちます。全葉のスケジュール後に中断し、入力位置順に成功値を組み立てます。再起動や完了済み履歴のリプレイは同じグループ識別情報を復元します。完全な終端重複は無視し、遅れた兄弟の完了は部分診断を補えますが、決定的方針で選択済みの失敗メンバーは変更しません。

埋め込みランタイムは `all()` から型付き葉の失敗を投げ、履歴と運用画面に永続グループ情報を保持します。

## 非同期コールバック {#async-callback}

`async(...)` はシリアライズ可能なコールバックをシステム型 `durable-workflow.async` の永続子として実行します。名前付き v2 と同じ逐次形式専用の契約で、`activity()`、`await()`、`timer()`、`sideEffect()` などは `yield` なしで本体から直接中断します。

```php
use function Workflow\V2\{activity, async};
use Workflow\V2\Workflow;

final class CustomerWorkflow extends Workflow
{
    public function handle(string $customerId): array
    {
        $profile = async(static function () use ($customerId): array {
            $customer = activity(LoadCustomer::class, $customerId);

            return [
                'customer' => $customer,
                'score' => activity(ScoreCustomer::class, $customer['id']),
            ];
        });

        return ['profile' => $profile];
    }
}
```

親はコールバックを子待機として扱い、履歴、系譜、Waterline は明示的な `child(...)` と同じ `child_call_id`、実行 ID、結果履歴を使います。Laravel の Serializable Closure で保存するため、アプリとデプロイ内に限定してください。サービス間ルーティングや長期のコード変更に安定した公開型が必要なら `child(SomeWorkflow::class, ...)` を使います。v2 のコールバックは逐次形式専用なので、`activity()`、`child()`、`await()`、`timer()`、`all([...])` を `yield` なしで直接呼びます。

## アクティビティと子の混合バリア {#mixed-activity--child-barriers}

同じ `all()` でアクティビティと子を混在させられます。結果は元の配列順で、成功メンバーは残りを待ち、最初の失敗は直ちに親を再開します。

親のリプレイ時点で複数が失敗済みなら、最も早い記録終了時刻の失敗を返します。同時刻なら葉のインデックスが小さい方を選び、再開とクエリが同じ例外になります。後の兄弟の失敗は、既に親に投げた例外を置換しません。

```php
use function Workflow\V2\{all, activity, child};
use Workflow\V2\Workflow;

final class OrderWorkflow extends Workflow
{
    public function handle(): array
    {
        [$charge, $shipment] = all([
            fn () => activity(ChargeCustomer::class),
            fn () => child(ShipOrderWorkflow::class),
        ]);

        return compact('charge', 'shipment');
    }
}
```

## 現在の制限 {#current-limits}

現在は次を含みません。

- 明示的な入れ子 `all([...])` 以外の、同時実行数を制限する組み込みヘルパー。

## 子ワークフローの並列実行 {#child-workflows-in-parallel}

子も専用の `all([...])` バリアで並列実行できます。親は複数の子を永続的に開始し、バリア全体が進めるときだけ再開します。

```php
use function Workflow\V2\{all, child};
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => child(MyChild1::class),
            fn () => child(MyChild2::class),
            fn () => child(MyChild3::class),
        ]);
    }
}
```

<ConcurrencySimulator
  activities={[
    { name: 'MyChild1', duration: 2200 },
    { name: 'MyChild2', duration: 1800 },
    { name: 'MyChild3', duration: 2500 },
  ]}
  mode="parallel"
  title="子ワークフローの並列実行シミュレーター"
/>

1つの親ステップに複数の fan-in 層が必要な場合、子だけの入れ子や子とアクティビティの混合を含む階層的並列処理を組み立てられます。
