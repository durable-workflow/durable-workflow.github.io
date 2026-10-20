---
sidebar_position: 7
---

# 副作用 {#side-effects}

副作用は、非決定的なコードを含むクロージャです。クロージャは1回だけ実行され、結果が保存されます。ワークフローがリトライされても再実行せず、保存済み結果を返します。リプレイが非決定的なコードを再実行せず常に同じ保存値を返すため、ワークフローの決定性が保たれます。

```php
use function Workflow\V2\await;
use function Workflow\V2\sideEffect;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Workflow;

#[Signal('finish')]
class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        $token = sideEffect(fn () => random_int(1000, 9999));
        $finish = await('finish');

        return compact('token', 'finish');
    }
}
```

後でワークフローが失敗してリトライされても、`random_int()` を呼ぶのは1回だけで、結果が保存されます。

## 副作用を使う場面 {#when-to-use-side-effects}

次の条件を満たす非決定的な値が必要な場合に `sideEffect()` を使います。

- 外部 I/O なしでローカルに計算する（乱数、UUID、タイムスタンプ）。
- 記録後はリプレイを含めて変化すべきでない。
- リトライの意味論が不要（クロージャは1回だけ実行される）。

```php
// Generate a correlation token for downstream systems.
$correlationId = sideEffect(fn () => (string) Str::uuid());

// Snapshot the current time for a business rule.
$decidedAt = sideEffect(fn () => now()->toIso8601String());
```

## 代わりにアクティビティを使う場面 {#when-to-use-an-activity-instead}

失敗する可能性がある、外部サービスと通信する、リトライやタイムアウトの意味論が必要なコードには、副作用ではなく[アクティビティ](../defining-workflows/activities.md)を使います。

| 場面 | 使用するもの |
|---|---|
| ランダムトークンを生成する | `sideEffect()` |
| 判断時の設定値を読む | `sideEffect()` |
| 外部 API を呼ぶ | `activity()` |
| データベースへ書き込む | `activity()` |
| メールや通知を送る | `activity()` |
| 例外を投げ得る高コストの計算 | `activity()` |

目安として、リトライしたい例外を投げる可能性があるクロージャは、アクティビティに置きます。

## 仕組み {#how-it-works}

- `sideEffect()` の各呼び出しは、ワークフローステップのシーケンス付きの型付き `SideEffectRecorded` 履歴イベントを追加します。
- ワークフローとクエリのリプレイはクロージャを再実行せず、コミット済み値を再利用します。
- Waterline は選択した実行のタイムラインで型付き履歴項目としてスナップショットを表示します。
- 副作用は安全にリプレイできるスナップショット専用で、失敗し得る処理やリトライが必要な処理には使いません。

## 避けるべきパターン {#anti-patterns}

**副作用内で外部サービスを呼ばないでください。** 呼び出しが失敗してもリトライされず、ワークフローは恒久的に失敗します。

```php
// BAD: HTTP calls can fail and side effects do not retry.
$price = sideEffect(fn () => Http::get('/api/price')->json('amount'));

// GOOD: Use an activity for external calls.
$price = activity(FetchPriceActivity::class);
```

**副作用内に低速な処理やブロッキング処理を置かないでください。** クロージャはワークフロータスクのスレッドで実行されるため、長い処理はタスク全体を遅らせます。

```php
// BAD: Expensive computation blocks the workflow task.
$hash = sideEffect(fn () => bcrypt($largePayload));

// GOOD: Offload heavy work to an activity.
$hash = activity(ComputeHashActivity::class, $largePayload);
```

**変更可能な外部状態に依存しないでください。** クロージャは1回だけ実行されます。時間とともに変わる値を読んだ場合、スナップショットはリプレイ時ではなく最初の実行時の値で固定されます。

```php
// The cached value is whatever it was during the first execution.
// If the cache changes later, this workflow still sees the old value.
$setting = sideEffect(fn () => cache('feature.flag'));
```

これは決定性のために意図的に固定する設計です。ワークフローの存続中に更新される値が必要なら、シグナルやアクティビティを使います。

## このパターンの実行 {#run-this-pattern}

[サンプルアプリ](/docs/sample-app)の経過時間ワークフローは、時刻の読み取りを `sideEffect()` 内で行う実行可能な参照例です。

```bash
php artisan app:elapsed
```

`App\Workflows\Elapsed\ElapsedTimeWorkflow` は `sideEffect()` コールバック内で開始・終了のタイムスタンプを整数として記録し、リプレイ時の Avro デコード後も値を保ちます。Waterline の詳細にはタイマー発火を挟む2つの `MarkerRecorded` が表示されます。この対のマーカーが、時刻の読み取りが決定的だったことを示す保存済みの証拠です。
