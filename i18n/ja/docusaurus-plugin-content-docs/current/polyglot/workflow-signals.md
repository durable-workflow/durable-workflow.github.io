---
title: Signal-with-start とワークフローシグナル
description: 1つの操作でワークフローを開始または再利用してシグナルを送り、ワークフローコードから別のワークフローへ永続的にシグナルを送ります。PHP、Python、Rust SDK に対応します。
---

# Signal-with-start とワークフローシグナル {#signal-with-start-and-workflow-signals}

ネイティブ Server 3.15.0 では、2つのシグナル操作が追加されました。

- **Signal-with-start** はクライアント呼び出しです。1つのリクエストでワークフローを開始するか開いている実行を再利用し、その実行に1つのシグナルを記録します。これらを1つの Server トランザクションで行います。
- **別のワークフローへのシグナル** はワークフローコマンドです。ワークフローコードが同じ名前空間内の別のワークフローへシグナルを送ります。リクエストとその結果は送信側の履歴に一度だけ記録され、リプレイでシグナルが再送されることはありません。

## 要件 {#requirements}

| ランタイム | Signal-with-start | 別のワークフローへのシグナル |
| --- | --- | --- |
| ネイティブ Server | 3.15.0 以降。`capabilities.signal_with_start` として公開 | 3.15.0 以降。`signal_external_workflow` Worker コマンドとして公開 |
| PHP SDK | 3.22.0 以降: `Client::signalWithStart()` | 3.22.0 以降: `WorkflowContext::signalExternalWorkflow()` |
| Python SDK | 2.20.0 以降: `Client.signal_with_start()` | 2.20.0 以降: `ctx.signal_external_workflow()` |
| Rust SDK | 4.21.0 以降: `Client::signal_with_start()` | 4.21.0 以降: `ctx.signal_external_workflow()` |
| 組み込み PHP (Laravel) | `WorkflowStub::signalWithStart()`。[シグナルガイド](../features/signals.md#signal-with-start)を参照 | 未リリース。[シグナルガイド](../features/signals.md#signal-another-workflow)を参照 |

公開済みの PHP Server 2.x はどちらの操作にも対応していません。SDK は送信前に接続先の Server を確認します。古い Server に対しては、クライアント呼び出しが `ServerCapabilityUnavailable` (PHP)、`RuntimeCapabilityUnsupported` (Python)、`Error::SignalWithStartUnavailable` (Rust) を発生させ、何も送信しません。Worker は何かを送信する前に、新しいシグナルコマンドを `signal_external_workflow_unavailable` で拒否します。そのためワークフロータスクは完了せず、実行も失敗しません。

## Signal-with-start {#signal-with-start}

呼び出し元が1つのエンティティを宛先とし、開始とシグナルを別々に行う間にイベントを失ってはならない場合は、signal-with-start を使います。`start(use-existing)` とその後の `signal` を別々に行うと2つの操作になります。その間に実行が閉じると、シグナルは拒否されます。Signal-with-start にはこの隙間がありません。

- **実行がない場合。** この呼び出しの入力と期限で新しい実行を開始します。受領記録の `start_outcome` は `started_new` です。
- **開いている実行がある場合**（continue-as-new 後の最新の実行を含む）。シグナルはその実行に加わり、`start_outcome` は `returned_existing_active` です。実行は入力、期限、履歴を維持します。重複ポリシーが `fail` の場合は、代わりに `instance_already_started` で拒否します。
- **実行が閉じている場合。** 閉じた実行のポリシーが `start_new_run` でない限り、`run_not_active` で拒否します。このポリシーでは閉じた実行の後に新しい実行を開始し、受領記録の `closed_run_id` で閉じた実行を示します。閉じた実行は結果を維持します。

ワークフロー型はインスタンスの型と、タスクキューは開いている実行のキューと一致する必要があります。一致しない場合、Server は `workflow_type_conflict` または `task_queue_conflict` で拒否します。いずれの拒否でも何も書き込まれません。

リクエスト ID はシグナルの[コマンドキー](./server-api-reference.md#command-keys)です。省略すると、各 SDK が呼び出しごとに生成します。プロセスの再起動後も再試行を有効にする必要がある場合は、独自のキーを保存してください。同じキー、シグナル名、引数、ワークフロー型での再試行は、実行が閉じた後や continue-as-new した後でも、`retained: true` 付きで元の受領記録を返し、何も開始しません。

```php
use DurableWorkflow\Exception\SignalWithStartFailed;

try {
    $receipt = $client->signalWithStart(
        'orders.entity',      // workflow type
        'order-42',           // workflow ID
        'orders',             // task queue
        'changed',            // signal name
        [2],                  // signal arguments
        input: ['order-42'],  // input for a run this call starts
        requestId: 'order-42-revision-2',
    );
    $receipt['start_outcome']; // "started_new" or "returned_existing_active"
} catch (SignalWithStartFailed $failed) {
    $failed->reason(); // For example "run_not_active". Nothing was written.
}
```

```python
from durable_workflow.errors import SignalWithStartFailed

try:
    receipt = await client.signal_with_start(
        "order-42",
        "changed",
        workflow_type="orders.entity",
        task_queue="orders",
        input=["order-42"],
        signal_args=[2],
        request_id="order-42-revision-2",
    )
    receipt["start_outcome"]  # "started_new" or "returned_existing_active"
except SignalWithStartFailed as failed:
    failed.reason  # For example "run_not_active". Nothing was written.
```

```rust
use durable_workflow::{json, SignalWithStartOptions};

match client
    .signal_with_start(
        "orders.entity",
        "orders",
        "order-42",
        "changed",
        json!(["order-42"]),
        json!([2]),
        SignalWithStartOptions::new().request_id("order-42-revision-2"),
    )
    .await
{
    Ok(receipt) => println!("{}", receipt["start_outcome"]),
    // For example Some("run_not_active"). Nothing was written.
    Err(error) => println!("{:?}", error.signal_with_start_refusal()),
}
```

閉じた実行の後に新しい実行を開始するには、`closedRunPolicy: 'start_new_run'` (PHP)、`closed_run_policy="start_new_run"` (Python)、`ClosedRunPolicy::StartNewRun` (Rust) を渡します。Signal-with-start はシグナルを一度だけ受理します。シグナルがきっかけとなる処理には、別途冪等性が必要です。

## 別のワークフローへのシグナル {#signal-another-workflow}

ワークフローコードは、ワークフロー ID を指定して同じ名前空間内の別のワークフローへシグナルを送ります。実行 ID を指定しなければシグナルは対象の現在の実行へ、指定すればその実行だけへ送られます。このシグナルはアクティビティではなくワークフローコマンドです。

- これを含む完了処理は、送信側の履歴に `ExternalSignalRequested` を記録し、対象でシグナルを受理し、同じシーケンスに `ExternalSignalDelivered` または `ExternalSignalFailed` のどちらか1つの結果を記録します。これらはすべて1つの Server トランザクションで行われます。
- 対象側では通常のシグナルです。他のシグナルと同じ `SignalReceived` イベントとシグナル記録を持ち、送信元の実行に帰属します。対象側でのコマンドキーは `workflow-signal:<sender run ID>:<sequence>` です。呼び出し元はこの接頭辞を使えません。リクエスト ID が `workflow-signal:` で始まるシグナルや signal-with-start は、422 と `reason: "request_id_reserved"` で拒否されます。
- リプレイは記録済みの結果を読み、再送しません。その時点で対象、実行、シグナル名、引数のいずれかが異なると、非決定的としてリプレイが失敗します。

配信されなかったシグナルは例外ではなく戻り値です。どう扱うかはワークフローコードが決めます。

| 結果 | 理由 | 発生条件 |
| --- | --- | --- |
| `delivered` | なし | 対象の実行がシグナルを受理しました。 |
| `target_not_found` | `instance_not_found` | この名前空間にその ID のワークフローが存在しません。 |
| `target_not_found` | `run_not_found` | 実行 ID がそのワークフローのどの実行も指していません。 |
| `target_closed` | `run_not_active` | 対象の実行は閉じています。 |
| `target_closed` | `historical_run` | 実行 ID が continue-as-new で置き換えられた実行を指しています。 |
| `rejected` | `unknown_signal`、`invalid_signal_arguments`、`structural_limit_exceeded` | 対象が、HTTP シグナルと同じようにシグナルを拒否しました。 |
| `rejected` | `runtime_reserved_signal` | その名前はランタイムのメッセージストリーム用に予約されています。 |
| `rejected` | `self_target` | 対象が送信側自身のワークフローです。 |
| `rejected` | `request_id_conflict` | そのコマンドキーは別のシグナルですでに使われています。 |

SDK は、何かを記録する前にワークフローコード内でシグナル名を検査します。名前は空であってはならず、制御文字（`0x20` 未満のバイト、または `0x7f`）を含んではならず、最大 191 文字かつ 255 バイトです。対象のワークフロー ID は 1〜191 文字です。拒否された名前は `InvalidSignalName` を発生させるか (PHP と Python)、`Error::InvalidExternalSignal` を返し (Rust)、コマンドは送信されません。

```php
use DurableWorkflow\Attribute\Workflow;
use DurableWorkflow\Worker\WorkflowContext;

final class ApproverWorkflow
{
    #[Workflow('orders.approver')]
    public function run(WorkflowContext $context, string $orderId): array
    {
        $result = $context->signalExternalWorkflow($orderId, 'approve', ['Ada']);

        if (! $result->delivered()) {
            // target_not_found, target_closed or rejected, with a reason
            return ['skipped' => $result->outcome->value, 'reason' => $result->reason];
        }

        return ['delivered_to' => $result->targetRunId];
    }
}
```

開始済みの子のハンドルにも同じコマンドがあります: `$child->signal('approve', ['Ada'])`。

```python
from durable_workflow import workflow


@workflow.defn(name="orders.approver")
class Approver:
    def run(self, ctx: workflow.WorkflowContext, order_id: str):
        result = yield ctx.signal_external_workflow(order_id, "approve", ["Ada"])
        if not result.delivered:
            # target_not_found, target_closed or rejected, with a reason
            return {"skipped": result.outcome, "reason": result.reason}
        return {"delivered_to": result.target_run_id}
```

```rust
use durable_workflow::{json, ExternalSignalOutcome};

worker.register_workflow("orders.approver", |ctx, input| async move {
    let order_id = input[0].as_str().unwrap_or_default().to_owned();
    let result = ctx
        .signal_external_workflow(order_id, "approve", json!(["Ada"]))
        .await?;
    match result.outcome {
        ExternalSignalOutcome::Delivered => Ok(json!({"delivered_to": result.target_run_id})),
        // target_not_found, target_closed or rejected, with a reason
        _ => Ok(json!({"skipped": result.outcome.as_str(), "reason": result.reason})),
    }
});
```

対象の1つの実行だけにシグナルを送るには、Rust では `.run_id(run_id)`、Python では `run_id=`、PHP では `runId:` を追加します。

このコマンドは単独で実行します。並列グループや永続的な選択のメンバーにはできません。ワークフロータスクを保持する Worker は、HTTP シグナルに必要なオペレーターロールなしで、そのタスクの名前空間内の任意のワークフローへシグナルを送れます。他のワークフローのコードからシグナルを受けてはならないワークフローは、別の名前空間に置いてください。

## アクティビティが引き続き必要な場合 {#when-an-activity-is-still-needed}

ワークフローコマンドが合わない場合は、クライアントを呼び出すアクティビティを使います。

- **ワークフローコードからの signal-with-start。** signal-with-start のワークフローコマンドはありません。アクティビティからクライアントの signal-with-start を呼び出し、そのリクエスト ID をワークフロー ID や業務キーなどの安定したワークフローデータから導出します。これにより、アクティビティを再試行するたびに同じキーが送られ、Server はシグナルを一度だけ受理します。
- **別の名前空間。** シグナルは名前空間内にとどまります。代わりに[名前空間をまたぐサービス呼び出し](./service-operations.md)を使います。
- **古い Server。** ネイティブ Server 3.15.0 より前では、ワークフローコードはアクティビティ経由でしかシグナルを送れません。この場合もシグナルに安定したリクエスト ID を付け、アクティビティの再試行で2つ目のシグナルが記録されないようにします。

アクティビティは少なくとも1回実行されるため、再試行で2つ目のシグナルが送られるのを防ぐのは安定したリクエスト ID です。シグナルコマンドは、アクティビティタスクなしで結果を履歴に記録します。
