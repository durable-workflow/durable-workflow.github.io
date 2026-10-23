---
sidebar_position: 6
title: タスクキューの受け入れ
description: スタンドアロン Server の Worker スロット、Server 側のキュー上限、クエリタスクのバックプレッシャーを調整します。
tags:
  - admission
  - operations
  - task-queues
  - bounded-growth
keywords:
  - タスクキューの受け入れ
  - ディスパッチ上限
  - キューの制限
  - 上限付き Worker キュー
---

# タスクキューの受け入れ {#task-queue-admission}

タスクキューの受け入れ制御は、1つのキュー、テナント、下流依存先によって Worker 群全体が消費されるのを防ぎます。Durable Workflow は3層で受け入れ制御を公開します。

- Worker 登録はローカルのワークフロー・アクティビティスロットを広告する
- Server は名前空間・キューごとに有効なワークフロー・アクティビティリース数を制限できる
- Server は名前空間・キューごとに毎分のワークフロー・アクティビティディスパッチ数を制限できる
- Server は複数キューで共有する名前付きの下流制限グループごとに毎分のディスパッチ数を制限できる
- クエリタスクは保留キューに上限を持ち、同期読み取りが無制限に増える代わりに早期に失敗する

キューがレート制限された依存先と結びつく場合、複数テナントが同じ Server を共有する場合、またはワークフローの待機理由を説明する必要がある場合に受け入れ制御を使います。

受け入れ制御はマッチング契約の上に位置します。これらの上限が次のタスクを通してよいか判断する前に、実行可能な処理を検出してリースする仕組みは[タスクのマッチングとディスパッチ](/docs/polyglot/task-matching-dispatch)を参照してください。

## 上限の適用方法 {#how-the-budget-is-applied}

ワークフローとアクティビティのポーリングは、名前空間とタスクキューに現在登録されている Worker を起点にします。各 Worker は `max_concurrent_workflow_tasks` と `max_concurrent_activity_tasks` を広告します。Server は有効で古くなっていない Worker の値を合算し、キューの登録スロット容量を計算します。

Server 側の有効リース数とディスパッチレートの上限は任意です。設定した場合、Server は次のワークフロータスクやアクティビティタスクをリースする前に、短命なキャッシュロックを確認します。有効リース上限に達していると、そのポーリングでは進行中タスク数の上限を超えずにタスクなしを返します。毎分のディスパッチ上限に達していると、次の分バケットに余裕ができるまでタスクなしを返します。下流制限グループは、同じ `dispatch_budget_group` 名を共有する名前空間内のすべてのキューに、同じ毎分ディスパッチ制御を適用します。

クエリタスクは異なります。コントロールプレーンは一時的なクエリタスクをキューに入れ、Worker の応答を待ちます。`DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` は、各名前空間とタスクキューに存在できる保留クエリタスク数を制限します。キューが満杯になると、新しいクエリは HTTP `429` と `query_task_queue_full` を返します。クエリタスクキューを変更するためのロックをキャッシュストアが提供できない場合、クエリは HTTP `503` と `query_task_queue_unavailable` を返します。

## 再試行負荷と下流サービスの予算 {#retry-load-and-downstream-budgets}

**初回試行も再試行も**キュー、namespace、予算グループのディスパッチ上限に数えます。上限は複数のワークフローで正常に取得した activity task の試行を対象とし、再試行だけではありません。上限に達するとタスクは待ち、それ自体で activity は失敗しません。schedule-to-start、schedule-to-close、ワークフロー期限は進み続けるため、待機で設定済みタイムアウトを使い切る場合があります。

上限は毎分の試行数を測り、成功率や下流の健全性は測らず、サーキットブレーカーも開きません。activity や HTTP クライアントの内部再試行により、1回の取得で複数の HTTP 呼び出しが生じるため別に制限します。下流に接続せず即時拒否した試行も取得枠を消費します。

例えば `production` namespace の通常の activity キュー `payments` と `refunds` が、毎分20回の取得を許す `payment-api` 予算を共有します。参加するすべてのキューに同じ上限を設定し、無関係のキューは含めません。これは分バケットの上限であり、平滑な速度や各キューの予約枠ではありません。

```bash
DW_TASK_QUEUE_ADMISSION_OVERRIDES='{
  "production:payments": {
    "activity_tasks": {
      "dispatch_budget_group": "payment-api",
      "max_dispatches_per_minute_per_budget_group": 20
    }
  },
  "production:refunds": {
    "activity_tasks": {
      "dispatch_budget_group": "payment-api",
      "max_dispatches_per_minute_per_budget_group": 20
    }
  }
}'
```

Server の上限を有限の試行回数と backoff に組み合わせます。この Python SDK 2.9.0 の例では、アプリが `myapp.payments` から非同期の共有ブレーカーと決済クライアントを提供します。そのクライアントでは I/O を制限し、安定した冪等キーを使ってください。`charge` を `production` の `payments` worker に、`PaymentWorkflow` を対応する workflow worker に登録します。

```python
from durable_workflow import NonRetryableError, activity, workflow
from myapp.payments import breaker, payment_api

@activity.defn(name="payments.charge")
async def charge(order):
    if await breaker.is_open("payment-api"):
        raise NonRetryableError("payment-api breaker is open")
    return await payment_api.charge(order, idempotency_key=order["id"])

@workflow.defn(name="payments.order")
class PaymentWorkflow:
    def run(self, ctx, order):
        return (yield ctx.schedule_activity(
            "payments.charge", [order], queue="payments",
            retry_policy={"max_attempts": 3, "backoff_seconds": [2, 5]},
            start_to_close_timeout=10,
            schedule_to_start_timeout=30,
            schedule_to_close_timeout=90,
        ))
```

アプリのブレーカーが開いていれば決済前に `NonRetryableError` を送出します。通常の再試行可能な決済エラーは、設定した backoff で最大3回試行します。元のタイムアウトが3回より先に切れる場合もあります。業務上必要なら workflow が最終 activity エラーを捕捉し、未捕捉の最終エラーは workflow を閉じる場合があります。全体の workflow 期限は別に選びます。

保護対象の下流呼び出しは**通常のキューに入る activity** に置いてください。インラインのローカル activity は通常の activity task を作らず、キュー/namespace/グループの activity ディスパッチ上限は計量しません。prepared local claim は実行権限を検証し、この予算は検証しません。組み込み Laravel に独立 Server の admission はなく、独自のデプロイ制御を使います。[ローカル activity](../features/local-activities.md)を参照してください。

## namespace ごとのリクエスト受付制限 {#namespace-request-admission}

以下は公開済み **PHP Server 2.11.0** の契約です。実際のイメージと[バージョン付き設定リファレンス](./server-config-reference.md#additional-published-php-controls)を確認してください。HTTP 予算は、worker slot、task dispatch、保留中の poll、永続状態クォータとは別です。予算は `Durable-Workflow-Namespace` または `DW_DEFAULT_NAMESPACE` で解決されたリクエストの namespace に属し、管理 URL が別の namespace を指す場合も同じです。

認証後に namespace の受付制限へ到達したリクエストは、次の制御・管理ルート群とその配下で計上されます。`/api/namespaces`, `/api/storage`, `/api/workflows`, `/api/activities`, `/api/bridge-adapters`, `/api/workers`, `/api/worker-sessions`, `/api/task-queues`, `/api/deployments`, `/api/schedules`, `/api/search-attributes`, `/api/service-endpoints`, `/api/service-catalog`。複数形の `/api/workers` 管理ルートも対象です。

単数形の `/api/worker/*` の登録、polling、結果報告は、この HTTP 予算を使いません。health/readiness、`/api/cluster/info`、管理用 `/api/system/*`、runtime 認証情報、外部 payload 転送もこの gate の対象外ですが、それぞれのアクセス・容量・ストレージ検査は適用されます。認証、プロトコル、namespace 解決で先に拒否されたリクエストは、このカウンターまで到達しません。

頻度制限は Server の時計による固定の分単位 bucket です。平滑化されたレートや移動窓ではありません。予算 N では、境界の直前に N 件、直後にさらに N 件を受け付ける場合があります。後段で失敗しても計上されます。頻度の判定は同時数の前なので、同時数による拒否も分予算を消費する場合があります。同時数 slot はリクエスト終了と cleanup まで保持され、実行中 workflow 数を数えるものではありません。

複数 API replica では、同じ共有 Redis store/key prefix、同期した時計、一貫した読み込み済み設定が必要です。replica を増やしても共有 namespace 予算は増えません。ローカル file cache は、互換性のある書き込み権限を持つプロセス間だけを調整し、複数ノード用の基準構成ではありません。ノード単位の worker/query poll 待機数上限は別です。[環境変数変更後は対象 role を再起動](./server-config-reference.md#how-changes-take-effect)してください。

```dotenv
DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE=100
DW_NAMESPACE_MAX_CONCURRENT_REQUESTS=8
DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE=150
DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS=10
DW_NAMESPACE_ADMISSION_OVERRIDES='{"payments":{"max_requests_per_minute":200,"max_concurrent_requests":12},"reports":{"max_requests_per_minute":40,"max_concurrent_requests":3}}'
```

既存 namespace では、例の実効値は `payments` が毎分150件・同時10件、`reports` が40/3、その他が100/8です。override は既定値を増減できますが、hard cap の150/10は適用されます。この設定は namespace を作成せず、スループットを予約しません。

これらの HTTP 設定は未設定なら対応する上限を追加しませんが、hard cap だけでも上限になります。null override は既定値へ戻ります。値は正の整数が必要で、0は無効です。PHP 実装上限は毎分10000000件・同時1024件で、実際の HTTP pool 容量とは別です。公開 PHP2.11.0 は不正な `DW_NAMESPACE_ADMISSION_OVERRIDES` JSON を空の override として黙って扱い、全体の既定値へ戻します。デプロイ前に JSON を検証してください。既定値と hard cap がなければ意図した namespace 上限が失われます。この[確認済み製品不具合](https://github.com/durable-workflow/durable-workflow.github.io/issues/335#issuecomment-6369150521)はドキュメント更新では修正されません。

| 理由 | HTTP | 再試行の目安（秒） |
| --- | --- | --- |
| `namespace_request_rate_exhausted` | `429` | 次の分まで、1〜60 |
| `namespace_request_concurrency_exhausted` | `429` | 1 |
| `namespace_request_admission_unavailable` | `503` | 1 |

JSON の `retry_after_seconds` と `Retry-After` ヘッダーは一致します。設定済みの調整機構が利用不能、または数値上限が無効な場合は503で拒否します。通常リクエストの予算を使い切っても namespace の管理メトリクスを確認できます。`dw_namespace_request_admission_rejections` が有限の理由を報告します。呼び出し側の retry/backoff を制限し、冪等性を保ってください。通信結果が不確かな場合、書き込みを自動再送してよいことにはなりません。[タイムアウト予算](../deployment.md#worker-long-poll-timeout-budgets)も参照してください。

## namespace の永続状態クォータ {#namespace-durable-state}

`DW_NAMESPACE_DURABLE_LIMITS` は保持行数の既定上限、`DW_NAMESPACE_DURABLE_OVERRIDES` は namespace ごとの上書き、`DW_NAMESPACE_DURABLE_HARD_LIMITS` は回避できない hard cap です。空オブジェクトは上限を追加しません。override は既定値を増減でき、null は既定値へ戻ります。HTTP 制限と異なり、永続クォータの0は有効で、新規割り当てを防ぎます。例では既存 `payments` は open run を250、その他は100まで保持でき、hard cap は500です。

```dotenv
DW_NAMESPACE_DURABLE_LIMITS='{"max_open_workflow_runs":100,"max_open_workflow_run_waits":200,"max_pending_workflow_timers":200}'
DW_NAMESPACE_DURABLE_HARD_LIMITS='{"max_open_workflow_runs":500}'
DW_NAMESPACE_DURABLE_OVERRIDES='{"payments":{"max_open_workflow_runs":250}}'
```

以下のリソースに `max_<resource>` フィールドを使います。各行は、その所有 namespace、または関連する workflow/run の namespace で計上されます。保持総数と open/pending の部分集合は独立した上限です。namespace 行で変更を直列化し、データベースの正本の件数で判断します。

| リソース | 計上対象 |
| --- | --- |
| `workflow_instances`, `workflow_runs` | 終了済み run も含む、保持中の全 workflow instance/run 行。 |
| `open_workflow_runs` | 状態が `pending`、`running`、`waiting` の run。 |
| `workflow_history_events`, `workflow_commands`, `workflow_tasks` | 保持中の履歴、command、workflow task 行。 |
| `pending_workflow_tasks` | キュー内で状態が `ready` の workflow task 行。active lease には別の受付制限があります。 |
| `workflow_timers`, `pending_workflow_timers` | 保持中の全 timer と、その `pending` 部分集合。 |
| `workflow_run_waits`, `open_workflow_run_waits` | 保持中の全 run wait と、その `open` 部分集合。 |
| `schedules`, `schedule_history_events`, `worker_registrations` | 保持中の schedule、schedule history、worker 登録行。古い登録も削除まで計上されます。 |
| `workflow_streams`, `workflow_stream_items` | durable stream と inbound stream、およびその item 行。 |

子や service call を待つ親も、自分の namespace で open run を使い続けます。子は自分の run を追加します。同じ namespace なら両方の open run と wait/timer を計画してください。workflow を作成する service operation は、その workflow の namespace に行を消費します。既存 run への signal/update が自動的に2つ目の run を作るわけではありません。サービス呼び出し境界と外部 payload のクォータは別です。

枯渇時は429 `namespace_<resource>_exhausted` を返します。`retryable` を確認してください。再試行不可で待機目安を持たないクォータもあり、再試行可能な永続クォータ拒否は60秒を提示しますが、その後の空きを保証しません。設定済みクォータを評価できない場合は503 `namespace_durable_state_quota_unavailable` と1秒の目安です。保持行数の逼迫には、短い retry loop ではなく retention や容量・設定変更が必要な場合があります。

管理メトリクスではリクエストヘッダーで namespace を選びます。`dw_namespace_durable_state_usage` と JSON の `limits`、`usage`、`remaining`、`configuration_status`、`measurement_status` がその範囲を示します。namespace はリクエストの範囲であり、無制限な metric label ではありません。計測不能は使用量0や無制限容量を意味しません。[完全な設定リファレンス](./server-config-reference.md#namespace-durable-controls)を参照してください。

## Server の設定 {#server-configuration}

すべてのキューに同じ上限を適用する場合は、全体の上限を設定します。

```bash
DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE=25
DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE=100
DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE=500
DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE=2000
DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE=600
DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE=1200
DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE=12000
DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE=24000
DW_QUERY_TASK_MAX_PENDING_PER_QUEUE=1024
```

キューの上限は1つのタスクキューを保護します。名前空間の上限は、その名前空間の全タスクキューにわたるテナント全体の合計を保護します。テナントが多数のキューへ処理を分割しても、下流の割り当て枠は1つのままの場合に有用です。制限グループの上限は、名前空間内のすべてのキューを絞らずに、選択したキュー群が共有する名前付きの下流依存先を保護します。

特定のキューや名前空間に異なる上限が必要な場合、`DW_TASK_QUEUE_ADMISSION_OVERRIDES` を使います。キーは `namespace:task_queue`、`namespace:*`、`task_queue`、`*` の順に検査します。

```bash
DW_TASK_QUEUE_ADMISSION_OVERRIDES='{
  "production:payments": {
    "workflow_tasks": {
      "max_active_leases_per_queue": 8,
      "max_dispatches_per_minute": 120,
      "dispatch_budget_group": "downstream-openai",
      "max_dispatches_per_minute_per_budget_group": 600
    },
    "activity_tasks": {
      "max_active_leases_per_queue": 12,
      "max_dispatches_per_minute": 240
    }
  },
  "production:*": {
    "workflow_tasks": {
      "max_active_leases_per_namespace": 300,
      "max_dispatches_per_minute_per_namespace": 6000
    },
    "activity_tasks": {
      "max_active_leases_per_namespace": 1200,
      "max_dispatches_per_minute_per_namespace": 12000
    }
  },
  "email": {
    "activity_tasks": {
      "max_active_leases_per_queue": 4,
      "max_dispatches_per_minute": 60,
      "dispatch_budget_group": "downstream-sendgrid",
      "max_dispatches_per_minute_per_budget_group": 300
    }
  },
  "*": {
    "workflow_tasks": { "max_active_leases_per_queue": 50 }
  }
}'
```

上書き値は `max_active_leases_per_queue` の別名として `max_active_leases`、`dispatch_budget_group` の別名として `budget_group` も受け入れます。

Server 側の有効リース上限、ディスパッチレート上限、クエリタスク受け入れには、アトミックなロックに対応するキャッシュが必要です。ディスパッチレートカウンターは短命な分単位バケットで、上限があり実際にタスクをリースするキューにだけ作成します。複数ノードのデプロイでは Redis を推奨します。

## Worker スロットの登録 {#worker-slot-registration}

Python のワークフローハンドラーとアクティビティハンドラーに独立したプロセスリソースを与えるには、[Worker プロセスを分ける例](https://python.durable-workflow.com/guides/separate-workers/)を使います。登録するハンドラーのリストで役割を分けてください。両方の並行度を正の値に保ち、プロセス全体の合計を制限する必要がある場合は Server の上限を適用します。

Python Worker は `Worker(...)` でローカルセマフォを公開し、登録時に同じ値を送ります。

```python
worker = Worker(
    client,
    task_queue="payments",
    workflows=[PaymentWorkflow],
    activities=[charge_card, send_receipt],
    max_concurrent_workflow_tasks=8,
    max_concurrent_activity_tasks=12,
)
```

カスタム HTTP Worker では、スロットフィールドを `POST /api/worker/register` に送ります。

```json
{
  "worker_id": "payments-python-1",
  "task_queue": "payments",
  "runtime": "python",
  "supported_workflow_types": ["payments.PaymentWorkflow"],
  "supported_activity_types": ["payments.charge_card", "payments.send_receipt"],
  "max_concurrent_workflow_tasks": 8,
  "max_concurrent_activity_tasks": 12
}
```

Worker スロットだけではテナントの厳密な上限になりません。現在有効な Worker が処理できる量を示すものです。Worker を増やしても維持されるキュー全体の上限が必要なら、Server の上限を追加してください。

## 受け入れ状態の検査 {#inspect-admission}

デバッグ時には CLI を使います。

```bash
dw task-queue:list
dw task-queue:describe payments
dw task-queue:describe payments --json | jq '.admission'
```

Server は次の経路でも同じデータを公開します。

- `GET /api/task-queues`
- `GET /api/task-queues/{name}`

受け入れ状態のペイロードには3つのセクションがあります。

```json
{
  "workflow_tasks": {
    "status": "throttled",
    "active_worker_count": 3,
    "configured_slot_count": 24,
    "leased_count": 8,
    "ready_count": 5,
    "available_slot_count": 16,
    "server_max_active_leases_per_queue": 8,
    "server_active_lease_count": 8,
    "server_remaining_active_lease_capacity": 0,
    "server_max_active_leases_per_namespace": 300,
    "server_namespace_active_lease_count": 149,
    "server_remaining_namespace_active_lease_capacity": 151,
    "server_max_dispatches_per_minute": 120,
    "server_dispatch_count_this_minute": 120,
    "server_remaining_dispatch_capacity": 0,
    "server_max_dispatches_per_minute_per_namespace": 6000,
    "server_namespace_dispatch_count_this_minute": 3520,
    "server_remaining_namespace_dispatch_capacity": 2480,
    "server_dispatch_budget_group": "downstream-openai",
    "server_max_dispatches_per_minute_per_budget_group": 600,
    "server_budget_group_dispatch_count_this_minute": 600,
    "server_remaining_budget_group_dispatch_capacity": 0,
    "server_lock_required": true,
    "server_lock_supported": true,
    "budget_source": "worker_registration.max_concurrent_workflow_tasks",
    "server_budget_source": "server.admission.queue_overrides"
  },
  "activity_tasks": {
    "status": "accepting",
    "configured_slot_count": 36,
    "server_max_active_leases_per_queue": 12,
    "server_remaining_active_lease_capacity": 4,
    "server_max_dispatches_per_minute": 240,
    "server_remaining_dispatch_capacity": 197
  },
  "query_tasks": {
    "status": "accepting",
    "max_pending_per_queue": 1024,
    "approximate_pending_count": 7,
    "remaining_pending_capacity": 1017,
    "lock_supported": true,
    "budget_source": "server.query_tasks.max_pending_per_queue"
  }
}
```

## ステータスリファレンス {#status-reference}

| セクション | ステータス | 意味 |
|---------|--------|---------|
| ワークフロー・アクティビティ | `accepting` | 有効な Worker に空きスロットがあり、Server の上限にも達していない。 |
| ワークフロー・アクティビティ | `throttled` | 任意の Server 側有効リース上限または毎分ディスパッチ上限に達している。 |
| ワークフロー・アクティビティ | `saturated` | Server 上限の設定がなくても、登録した Worker スロットがすべてリース済み。 |
| ワークフロー・アクティビティ | `no_slots` | 有効な Worker がそのタスク種別に0スロットを登録した。 |
| ワークフロー・アクティビティ | `no_active_workers` | そのキューをポーリングする有効で古くなっていない Worker がいない。 |
| ワークフロー・アクティビティ | `unavailable` | 設定済みの Server 上限にキャッシュロックが必要だが、ロックを利用できない。 |
| クエリ | `accepting` | 保留クエリタスクキューに残り容量がある。 |
| クエリ | `full` | 保留クエリタスクが `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` に達し、新しいクエリは HTTP `429` を返す。 |
| クエリ | `unavailable` | クエリタスクキューがキャッシュロックを取得できず、新しいクエリは HTTP `503` を返す。 |

## 調整の手順 {#tuning-pattern}

1. プロセスに見合う Worker スロット数から始めます。CPU 中心のワークフロータスクは、通常 I/O 中心のアクティビティタスクより少なくします。
2. 全 Worker を通じて進行中数の上限が必要なキューには、有効リース上限を追加します。
3. 1テナントが多数のキューを作れても進行中数の合計を制限する必要がある場合は、名前空間全体の有効リース上限を追加します。
4. Worker に空きスロットがあっても、レート制限された外部 API、データベースプール、テナント、旧サービスをバーストから保護するキューには、毎分ディスパッチ上限を追加します。
5. 複数のキューが1つの下流依存先を共有し、名前空間内の無関係なキューは処理を続けるべき場合、制限グループのディスパッチ上限を追加します。
6. 下流の割り当て枠がキュー固有ではなくテナント全体の場合、名前空間全体のディスパッチ上限を追加します。
7. 負荷中に `dw task-queue:describe <queue>` を検査します。`saturated` は Worker 容量の追加またはワークフローのファンアウト削減が必要なことを示します。`throttled` は有効リースまたはディスパッチレートの上限が機能していることを示します。`no_active_workers` はキューに健全なポーラーがいないことを示します。
8. クエリタスク容量は通常の運用読み取りに十分な量を保ちつつ、インシデント時は早期に失敗できる程度に制限します。クエリタスクのあふれはバックプレッシャーであり、データ損失ではありません。

## 関連ガイド {#related-guides}

- [Server](/docs/polyglot/server)
- [CLI](/docs/polyglot/cli)
- [Python SDK](/docs/polyglot/python)
- [Worker プロトコル](/docs/polyglot/worker-protocol)
