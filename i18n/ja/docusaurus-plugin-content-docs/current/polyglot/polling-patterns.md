---
title: 外部状態のポーリング
description: 上限のあるポーリングとコールバックシグナルを選び、ワークフローのコードで永続的に待機し、履歴のコストを把握します。
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
| ジョブを送信して戻り、後でコールバックシグナルを受信 | 送信後にアクティビティのスロットを解放し、ワークフローが永続的に待機 | 送信、シグナルの受け入れと適用、期限付きの待機で履歴が増加。認証済みの対応付けとアプリケーションでの重複処理が必要。 |

短く、安全に再試行できる確認処理を使ってください。外部リクエストでブロックされたコールバックは、ワークフローにタイマーやキャンセルポリシーがあるだけでは応答可能になりません。

## コールバックとシグナルによる完了 {#callback-and-signal-completion}

外部システムから通知できる場合は、短いアクティビティでジョブを送信し、受領確認を返します。**ワークフロー**は、宣言済みのシグナルまたはリプレイで再構築した条件を、有限の期限で待機します。ジョブが完了するまでアクティビティ、HTTP レスポンス、SSE 接続を開いたままにしないでください。

ワークフローを開始する前にインスタンス ID を選び、認証済みの外部操作、名前空間、**公開ワークフローインスタンス ID**、宣言済みのシグナル名の対応を保存します。開始がコミットされると、アクティビティはすぐにジョブを送信できます。run ID が識別するのは一つの run だけで、continue-as-new をまたぐ安定したコールバック先にはなりません。コールバックを認証し、保存した対応を確認してから転送してください。任意のリクエストが送るルーティングや識別情報を信用してはいけません。

### 組み込み PHP のコールバック {#embedded-php-callback}

`services.jobs.url` にプロバイダーの URL、`services.jobs.callback_url` にアプリケーションの認証済みアダプターを設定します。例の `/jobs` リクエストをプロバイダーの API に合わせてください。送信を速やかに受け付け、`job_id` を返す必要があります。プロバイダー固有の認証を実装し、リクエスト時間に上限を設けます。操作キーによる重複排除は、プロバイダーが実際にそのキーを尊重する場合に限り有効です。

```php
use Illuminate\Support\Facades\Http;
use Workflow\V2\Activity;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;
use function Workflow\V2\activity;
use function Workflow\V2\await;

#[Type('external.submit')]
final class SubmitExternalJob extends Activity
{
    public function handle(string $workflowId, string $operationId): array
    {
        return Http::connectTimeout(2)->timeout(5)
            ->withHeaders(['Idempotency-Key' => $operationId])
            ->post(config('services.jobs.url').'/jobs', [
                'workflow_id' => $workflowId,
                'operation_id' => $operationId,
                'signal' => 'job-completed',
                'callback_url' => config('services.jobs.callback_url'),
            ])->throw()->json();
    }
}

#[Type('external-completion')]
#[Signal('job-completed', [
    ['name' => 'operationId', 'type' => 'string'],
    ['name' => 'result', 'type' => 'array'],
])]
final class ExternalCompletion extends Workflow
{
    public function handle(string $operationId): array
    {
        $job = activity(SubmitExternalJob::class, new ActivityOptions(
            maxAttempts: 1, startToCloseTimeout: 10, scheduleToCloseTimeout: 15,
        ), $this->workflowId(), $operationId);

        $received = await('job-completed', timeout: 10);
        if ($received === null) {
            return ['status' => 'timed_out', 'job_id' => $job['job_id']];
        }
        if ($received[0] !== $operationId) {
            return ['status' => 'unexpected_operation'];
        }
        return ['status' => 'completed', 'result' => $received[1]];
    }
}
```

呼び出し元が選んだインスタンス ID と、run および実行全体の有限なタイムアウトを指定して開始します。`ExternalCompletion` を[認証済み Webhook](../features/webhooks.md)に登録します。アプリケーションのコールバックアダプターは、検証済みの入力をインスタンス指定のシグナルルートへ転送できます。

```bash
curl -fsS -X POST "$APP_URL/webhooks/instances/external-job-42/signals/job-completed" \
  -H "Authorization: $WEBHOOK_TOKEN" -H 'Content-Type: application/json' \
  -d '{"arguments":["op-42",{"value":42}]}'
```

これは組み込み Webhook の `arguments` 形式であり、Server のペイロードエンベロープではありません。プロバイダーにはアプリケーションの認証済みアダプターを呼び出させ、Server の運用者用・ワーカー用の認証情報を渡さないでください。

### Python のコールバックと条件 {#python-callback-and-condition}

次のアクティビティは、時間を制限した送信だけを行います。アクティビティの環境に `JOB_API_URL`、`JOB_CALLBACK_URL`、プロバイダーの認証を設定します。両方の定義を [Python ワーカー](./python.md)に登録してください。呼び出し元が知っているワークフローインスタンス ID を明示的に渡します。この例は、ワークフローコンテキストに存在しない ID 取得機能を仮定しません。

```python
import os
import httpx
from durable_workflow import activity, workflow
from durable_workflow.workflow import ActivityRetryPolicy

@activity.defn(name="external.submit")
async def submit_external_job(workflow_id, operation_id):
    async with httpx.AsyncClient(timeout=5.0) as provider:
        response = await provider.post(
            os.environ["JOB_API_URL"] + "/jobs",
            headers={"Idempotency-Key": operation_id},
            json={"workflow_id": workflow_id, "operation_id": operation_id,
                  "signal": "job-completed",
                  "callback_url": os.environ["JOB_CALLBACK_URL"]},
        )
        response.raise_for_status()
        return response.json()

@workflow.defn(name="external-completion")
class ExternalCompletion:
    def __init__(self):
        self.results = {}

    @workflow.signal("job-completed")
    def completed(self, operation_id: str, result: dict):
        self.results.setdefault(operation_id, result)

    def run(self, ctx, workflow_id, operation_id):
        job = yield ctx.schedule_activity(
            "external.submit", [workflow_id, operation_id],
            retry_policy=ActivityRetryPolicy(max_attempts=1, backoff_seconds=[1]),
            start_to_close_timeout=10, schedule_to_close_timeout=15,
        )
        ready = yield ctx.wait_condition(
            lambda: operation_id in self.results,
            key="external.completed", timeout=10,
        )
        if not ready:
            return {"status": "timed_out", "job_id": job["job_id"]}
        return {"status": "completed", "result": self.results[operation_id]}
```

インスタンス ID を選び、操作の名前空間・インスタンス・シグナルの対応を **start の呼び出し前に**永続化します。開始がコミットされるとアクティビティが動き始めます。その後、アプリケーションは有限の時間枠でインスタンスを開始します。

```python
handle = await client.start_workflow(
    workflow_type="external-completion", task_queue="external-jobs",
    workflow_id="external-job-42", input=["external-job-42", "op-42"],
    execution_timeout_seconds=60, run_timeout_seconds=30,
)
```

プロバイダーを認証し、保存済みの操作の対応を解決した後、アダプターは**同じ名前空間**の Client を使います。

```python
await client.signal_workflow(
    "external-job-42", "job-completed", args=["op-42", {"value": 42}],
)
```

これは SDK 標準の Avro エンベロープで、Server の `POST /api/workflows/{workflowId}/signal/{signalName}` を呼び出します。成功が示すのはシグナルの受け入れであり、ワークフローコードによる処理完了ではありません。確認が必要なら、ワークフローの結果または保持されたシグナル状態を調べます。

### 早い通知、継続、遅い通知 {#early-continued-and-late-callbacks}

- run を開始する前にシグナルを宣言します。待機より先に届いたコールバックは保持され、永続化された順序で消費されます。Python はリプレイ時にハンドラーの状態を再構築します。後の登録で古い run の宣言を書き換えることはできません。
- インスタンス指定のコールバックは continue-as-new を追従します。明示的な run 指定の呼び出しは、その run に制限されます。互換性のある Core 2.7.0 以降では、対象となる受信済みインスタンスシグナルは引き継ぎ時も元の識別情報と順序を保持します。**適用済み**コールバックの状態が引き続き必要なら、継続の入力引数で渡してください。
- 終端状態になった後のコールバックは明示的に拒否されます。公開済み Server に対する Python では、ステータス409と `SignalFailed.reason == "run_not_active"` を返します。受け入れ済みで未適用のシグナルは、終了に伴う拒否状態を保持する場合があります。過去の受け入れレシートは消えません。[シグナルの受け入れと終了](../features/signals.md#acceptance-and-closure)を参照してください。
- 待機期限が過ぎても外部ジョブはキャンセルされません。結果を照合するか、アクティビティからプロバイダーへキャンセルを依頼します。遅れた結果にはアプリケーションの復旧判断が必要な場合があります。通知せずに代替の仕事を開始しないでください。

### 重複配信とストリーミングの限界 {#duplicate-delivery-and-streaming-limits}

プロバイダーはコールバックを再送し、シグナル受け入れ後にネットワークエラーが起きる場合もあります。アプリケーションの操作・イベントキーと正確な意図を保存し、コールバック入口と業務処理の両方で重複を排除し、結果不明の配信を照合用に保持します。Python ハンドラーが保持するのは、この run の各操作の最初の結果です。run をまたぐ重複排除や一度だけの受け入れを保証するものではありません。リクエストを送っただけで、不確かな転送を処理済みにしないでください。安全なシグナル再試行と保持される受け入れ識別情報は、引き続き[共通 Issue #216](https://github.com/durable-workflow/.github/issues/216)の対象です。冪等性ヘッダーや一回のアクティビティ試行だけで、外部副作用が一度になる保証はありません。

このレシピでジョブを送信する前にワークフローを開始します。サービスモードの `start(use-existing)` とその後の `signal` は、途中に終了が入り得る**二つの操作**です。アトミックな受け入れは[共通 Issue #222](https://github.com/durable-workflow/.github/issues/222)の未解決事項です。組み込みの `signalWithStart` は別のアトミック API です。デバウンス要求の [Website #280](https://github.com/durable-workflow/durable-workflow.github.io/issues/280) はその製品要件に置き換えられたものであり、このレシピで完成したわけではありません。

アクティビティ内で保持する HTTP/SSE ソケットは永続的ではありません。ワーカーやプロセスを失うと終了し、アクティビティのスロットを占有し、再接続では外部イベントが重複したり欠落したりします。送信とコールバックも、アクティビティ、シグナル、待機の履歴を増やします。無料でも無制限でもありません。永続的な**ワークフローの出力**には、通信接続をストレージとみなすのではなく、永続化されたシーケンス・カーソルの契約を持つ [Workflow Streams](./workflow-streams.md) を使用します。

上の PHP と Python のコードは、公開済みの **Server 2.9.7 / Core 2.7.2** と通常インストールした **Python SDK 2.6.1** で実行しました。別の PostgreSQL 17.11 の確認では、待機前・待機中のコールバック、遅い通知の拒否、Python ワーカー不在中のコールバックを含む continue-as-new とその後のコールド読み取りを検証しました。組み込み側は実際の Webhook ルートを使いました。これはレシピの根拠であり、全データベース、プロバイダー認証、正常なシャットダウン、ネイティブランタイムの認定ではありません。[検証記録](https://github.com/durable-workflow/durable-workflow.github.io/issues/321#issuecomment-6292485315)には失敗した元の試行も区別して残しています。

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
