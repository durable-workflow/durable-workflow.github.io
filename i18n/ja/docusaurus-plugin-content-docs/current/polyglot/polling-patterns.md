---
title: 外部状態のポーリング
description: 上限付きの再試行、ハートビート付きアクティビティ、永続タイマーループを選び、履歴の増加量を把握します。
---

# 外部状態のポーリング {#polling-external-state}

外部ジョブへの問い合わせはアクティビティで行い、ワークフローコードからネットワークリクエストを送らないでください。間隔を決める前に、どこで待機するかを決めます。

## 待機を担う境界を選ぶ {#choose-the-waiting-boundary}

| パターン | Workerの使用 | 永続履歴と制御 |
| --- | --- | --- |
| 準備が整うまで1つのアクティビティを再試行する | 各試行中はアクティビティスロットを使用し、再試行の待機中は解放する | 各試行と再試行の予定が履歴を増やします。試行間でワークフローコードは再開しないため、その間に履歴予算を確認したり continue-as-new を実行したりできません。 |
| ハートビートを送る長時間アクティビティ | 待機中ずっとアクティビティスロットを占有する | 受理されたハートビートごとに履歴イベントが増えます。アクティビティには有限の期限を、外部リクエストには上限付きタイムアウトを設定します。ハートビートは実行全体の期限を延長しません。 |
| アクティビティで確認してから永続タイマーで待つ | 確認と確認の間はアクティビティスロットを解放する | 確認ごとにアクティビティイベント、待機ごとにタイマーイベントが増えます。確認間にワークフローコードが停止、補償、continue-as-new を判断できます。 |
| ポーリング専用の子ワークフロー | 子は選択したパターンに必要なスロットを使用する | ポーリング履歴を子に移し、親には子の開始・解決イベントを追加します。子の履歴や実行のコストがなくなるわけではありません。親終了時のポリシーを明示的に選びます。 |

短く、安全に再試行できる確認処理を使ってください。外部リクエストでブロックされたコールバックは、ワークフローにタイマーやキャンセルポリシーがあるだけでは応答可能になりません。

## 再試行と履歴に上限を設ける {#bound-retries-and-history}

再試行は明示的な設定が必要です。PHP アクティビティの既定は1回の試行です。たとえば `maxAttempts: 3`、`backoff: [5, 30]`、`startToCloseTimeout: 10`、`scheduleToCloseTimeout: 90` を設定すると、有限の遅延と元の総時間制限のもとでリモート試行を3回行えます。対応する Python のポリシーは `ActivityRetryPolicy(max_attempts=3, backoff_seconds=[5, 30])` で、試行ごととアクティビティ全体のタイムアウトは別に指定します。「まだ準備できていない」という正常な戻り値は失敗ではなく、再試行を起こしません。[失敗と復旧](../failures-and-recovery.md)を参照してください。

未準備を明示的に再試行可能な結果として扱い、確認間にワークフローコードを実行する必要がなければ、再試行が適しています。無制限の再試行を見えないポーリングループにしないでください。ローカルアクティビティの再試行遅延の整合性は[再試行契約の issue](https://github.com/durable-workflow/.github/issues/219)で追跡しています。ここの例はリモートアクティビティを使います。

## 意図的に新しい実行へ移る {#roll-over-deliberately}

この実行可能なデモは、1つの run につき1回確認し、待機後に有限の残り確認回数を次の run に渡します。アクティビティの模擬的な状態取得だけを、実際の上限付きリクエストに置き換えてください。確認回数の上限に達しても最後の状態を返すため、呼び出し元は `ready` を確認する必要があります。

### 組み込み PHP {#embedded-php}

```php
use Workflow\V2\Activity;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;
use function Workflow\V2\activity;
use function Workflow\V2\timer;
use function Workflow\V2\continueAsNew;

final class CheckDemoStatus extends Activity
{
    public function handle(int $remaining): array
    {
        return ['ready' => $remaining <= 1];
    }
}

final class PollDemo extends Workflow
{
    public function handle(int $remaining = 2, int $intervalSeconds = 30): array
    {
        $status = activity(CheckDemoStatus::class, new ActivityOptions(
            maxAttempts: 1, startToCloseTimeout: 10, scheduleToCloseTimeout: 15,
        ), $remaining);
        if ($status['ready'] || $remaining <= 1) {
            return $status;
        }
        timer($intervalSeconds);
        return continueAsNew($remaining - 1, $intervalSeconds);
    }
}
```

通常の[組み込みワークフローの設定](../installation.md)から開始し、run と実行全体に有限のタイムアウトを設定します。

### サービスモードの Python Worker {#python-service-worker}

```python
from durable_workflow import activity, workflow
from durable_workflow.workflow import ActivityRetryPolicy

@activity.defn(name="poll-demo.status")
async def check_status(remaining):
    return {"ready": remaining <= 1}

@workflow.defn(name="poll-demo")
class PollDemo:
    def run(self, ctx, remaining=2, interval_seconds=30):
        result = yield ctx.schedule_activity(
            "poll-demo.status", [remaining],
            retry_policy=ActivityRetryPolicy(max_attempts=1, backoff_seconds=[1]),
            start_to_close_timeout=10, schedule_to_close_timeout=15,
        )
        if result["ready"] or remaining <= 1:
            return result
        yield ctx.sleep(interval_seconds)
        return ctx.continue_as_new(remaining - 1, interval_seconds)
```

`PollDemo` と `check_status` を同じ [Python Worker](./python.md)に登録し、引数 `[2, 30]` と有限の実行全体・run タイムアウトを指定して開始します。後続 run を追うには現在のワークフローインスタンスを観察します。特定の run に結び付いたハンドルは、引き続き元の run を選択します。

両方の例を公開済みの Server **2.9.7 / Core 2.7.2** と通常インストールした Python **2.6.1**、テスト入力 `[2, 1]` で実行しました。どちらも2つの run にまたがって2回の実際の確認を完了しました。Continue-as-new は run の履歴を新しくし、run とリンクのコストを追加しますが、実行全体の元の期限は維持します。寿命が無制限になるわけではありません。

ここでは相対的な永続待機を使用します。Python の進む時計と、リプレイ時にも安定した履歴予算の読み取りは、それぞれ[時計](https://github.com/durable-workflow/.github/issues/215)と[予算](https://github.com/durable-workflow/workflow/issues/859)の別の課題です。このレシピは `ctx.now()` や再計算した履歴長で分岐しません。`DW_MAX_HISTORY_EVENTS` を強制的な自動切り替えとして扱わないでください。この不足は [Server #504](https://github.com/durable-workflow/server/issues/504) で追跡しています。

## 中断して外部状態を照合する {#interrupt-and-reconcile}

シグナルで停止する場合は、[シグナルと待機中の操作を select で競合させ](../features/concurrency.md)、負けた操作を、その操作が対応するキャンセルポリシーで明示的にキャンセルします。選択だけでは他の操作はキャンセルされません。アクティビティへの停止要求は、外部副作用が発生しなかったことの証明にはなりません。冪等性キーを使い、補償や再開始の前に外部状態を照合してください。即時キャンセル、強制終了、ワークフローのハードタイムアウトは、ワークフローの補償コードを実行しません。クリーンアップを実行する必要があれば、対応済みの[協調キャンセル](./cancellation.md)を使います。

## 実際の履歴を確認する {#inspect-the-actual-history}

上記の公開済み Python サービスモードでの計測結果は次のとおりです。

| 完了したケース | 正式な履歴イベント |
| --- | --- |
| 3回目の試行で成功する1つのリモートアクティビティ | 合計10件：予定1件、開始3件、再試行予定2件、完了1件、run のライフサイクル3件 |
| 受理されたハートビートを2回送る1つのアクティビティ | 合計8件：アクティビティ3件、ハートビート2件、ライフサイクル3件 |
| 1つのタイマーで隔てられた2回の成功した確認 | 合計11件：アクティビティ6件、タイマー2件、ライフサイクル3件 |

切り替え例は Python の各 run に **8 + 5** 件、PHP の各 run に **8 + 6** 件を記録しました。PHP は後続 run にも `StartAccepted` を記録します。これは実測した操作・run のコストであり、普遍的なイベント総数、課金単位、性能結果ではありません。他のコマンド、失敗、キャンセル、ランタイムの受理メタデータによってイベントが追加される場合があります。ループ回数だけで増加量を推測せず、各 run の履歴、保持された試行ポリシー、元の期限を確認してください。正確な観察結果と失敗した検証用プログラムの記録は[検証記録](https://github.com/durable-workflow/durable-workflow.github.io/issues/283#issuecomment-6288504564)に残しています。
