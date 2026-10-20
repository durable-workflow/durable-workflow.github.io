---
sidebar_position: 4
title: タイマー
description: プロセスの実時計に依存せず、永続タイマーと決定的なワークフロー時刻を使います。
tags:
  - timers
  - deterministic-time
  - waits
keywords:
  - 永続タイマー
  - 決定的な時刻
  - ワークフローの現在時刻
---

import TimerSimulator from '@site/src/components/TimerSimulator';

# タイマー {#timers}

ワークフローの実行を中断し、後で再開できます。永続タイマーは再起動や障害を越えて存続し、ワークフローのリプレイの意味論とも整合します。遅延、リトライ処理、タイムアウトの実装に使えます。

タイマーを使うには、ワークフロー内で `timer($duration)` を呼びます。

```php
use function Workflow\V2\timer;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        timer(30);

        return 'The workflow waited 30 seconds.';
    }
}
```

<TimerSimulator />

タイマーの動作:

- `timer()` の呼び出しごとに永続タイマー行と、型付きの `TimerScheduled`、`TimerFired`、および無効化時の `TimerCancelled` 履歴イベントを作成します。
- 遅延タイマーは専用のタイマータスクを経て、ワークフロータスクを再開します。
- `timer(0)` はワークフロータスク内で即時に発火し、タイマータスクを作成しません。
- リプレイとクエリは型付きの `TimerScheduled`、`TimerFired`、`TimerCancelled` 履歴をライフサイクルの正とします。そのため純粋なタイマーはコミット済み発火イベントが到着するまで待機し、選択した実行の詳細は履歴から未解決、発火済み、キャンセル済みのタイマー待機を再構築できます。
- Waterline は実行詳細とダッシュボードのペイロードにタイマー待機を表示します。
- エンジンレベルの `cancel()` と `terminate()` は未解決のタイマー待機を永続的に無効化し、遅れて届くタイマージョブは実行を再開せず何もしません。

任意の長さのタイマーを Amazon SQS を含むすべての Laravel キュードライバーで使えます。エンジンはメッセージ単位の制限を超える長い遅延を透過的に分割します。

乱数や1回限りの分岐入力など、安全にリプレイできるスナップショットには `sideEffect()` を使えます。

## 決定的な時刻の読み取り {#reading-deterministic-time}

ワークフロー本体で現在時刻が必要なときは、Laravel の `now()` や `Carbon::now()` の代わりに `Workflow::now()`（または `Workflow\V2\now()`）を使います。

```php
use function Workflow\V2\activity;
use function Workflow\V2\now;
use Workflow\V2\Workflow;

class DurationAwareWorkflow extends Workflow
{
    public function handle(string $name): array
    {
        $startedAt = Workflow::now();
        $greeting = activity(GreetingActivity::class, $name);
        $finishedAt = Workflow::now();

        return [
            'greeting' => $greeting,
            'took_ms' => $finishedAt->getTimestampMs() - $startedAt->getTimestampMs(),
        ];
    }
}
```

`Workflow::now()` は実行器による履歴イベントのリプレイに合わせて進みます。リプレイが消費した最後のアクティビティ完了、タイマー発火、シグナル受信、条件解決、子ワークフロー完了の `recorded_at` を返します。まだイベントを消費していない場合は実行の `started_at` を返します。ワークフロー Fiber の外側（アクティビティ内や、ワークフロー外のヘルパーを呼ぶクエリメソッドなど）では、実時計の `now()` にフォールバックします。

`Workflow::now()` を使うと、実時計が進んでも、同じ履歴の2回のリプレイで同じ時刻値が得られ、ワークフローの決定性を保てます。
