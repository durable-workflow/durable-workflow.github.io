---
sidebar_position: 5
---

# シグナル + タイマー {#signal--timer}

`Workflow\V2` は、タイムアウト付き条件待機の `await($condition, timeout: $seconds, conditionKey: $key)` と、タイムアウト付き名前付きシグナル待機の `await('signal-name', timeout: $seconds)` をサポートします。

永続入力のリプレイで復元した状態が成立したら直ちに継続し、変化しなくても期限後に待機を解除したい場合に使います。

```php
use Workflow\UpdateMethod;
use function Workflow\V2\await;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

use function Workflow\V2\minutes;

#[Type('approval-with-timeout')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): string
    {
        $approved = await(fn () => $this->ready, timeout: minutes(5), conditionKey: 'approval.ready');

        return $approved ? 'approved' : 'timed out';
    }

    #[UpdateMethod]
    public function markReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

import SignalTimerSimulator from '@site/src/components/SignalTimerSimulator';

<SignalTimerSimulator />

`timeout:` 付きの `await()` は次のように動作します。

- 述語はリプレイされた永続入力（アクティビティ結果、更新による変更、子の結果）だけに依存する必要があります。永続化されない状態では待機は再開しません。
- 任意の条件キーは安定した運用者向けラベルです。リプレイは履歴とキーを照合し、再デプロイで同じステップを別の述語に黙って再利用することを防ぎます。
- タイマー発火前に述語が true になると `await()` は `true` を返します。
- 期限が先に到来すると `false` を返します。

読みやすい期間を指定するため、`seconds()`、`minutes()`、`hours()`、`days()`、`weeks()`、`months()`、`years()` のタイマーヘルパーを使えます。

アプリコードから述語の状態を永続的に変えるには、宣言した更新を呼びます。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('approval-with-timeout');

$workflow->markReady();
```

タイムアウトタスクの発火前に条件が成立すると `true`、タイムアウトが先なら `false` を返します。

名前付きシグナルでは `await('name', timeout: minutes(5))` は到着時にペイロードを、タイムアウト時に `null` を返します。`null` はタイムアウト専用です。引数なしなら `true`、1引数ならその値、複数なら配列になります。`Workflow\V2` は状態変更に旧 `#[SignalMethod]` メソッドを使いません。

## `awaitWithTimeout()` ヘルパー {#awaitwithtimeout-helper}

`Workflow::awaitWithTimeout($timeout, $condition, $conditionKey = null)` は `await($condition, timeout: $timeout, conditionKey: $conditionKey)` の短縮形です。期限を先に置き、呼び出し箇所でタイムアウトの意図を明確にします。

```php
use function Workflow\V2\{await, minutes};
use Workflow\V2\Workflow;

#[Type('approval-with-timeout')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): string
    {
        $approved = Workflow::awaitWithTimeout(
            minutes(5),
            fn () => $this->ready,
            'approval.ready',
        );

        return $approved ? 'approved' : 'timed out';
    }

    #[UpdateMethod]
    public function markReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

戻り値は `timeout:` 付き `await()` と同じです。callable 述語では条件が先なら `true`、期限が先なら `false`、名前付きシグナルでは到着が先ならペイロード、期限が先なら `null` です。

`awaitWithTimeout()` は「条件を最大この時間まで待つ」と読めます。`await()` は「条件を待ち、タイムアウトをオプションで付ける」形式です。読みやすい方を選んでください。ランタイム上は同じで、同じ履歴を記録します。
