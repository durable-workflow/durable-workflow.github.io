---
title: Signal-with-start 与工作流信号
description: 通过一次操作启动或复用工作流并向其发送信号，并从工作流代码持久地向另一个工作流发送信号，适用于 PHP、Python 和 Rust SDK。
---

# Signal-with-start 与工作流信号 {#signal-with-start-and-workflow-signals}

原生 Server 3.15.0 新增两个信号操作：

- **Signal-with-start** 是客户端调用。一次请求启动工作流或复用其打开的运行，并在该运行上记录一个信号，全部在一个 Server 事务中完成。
- **向另一个工作流发送信号** 是工作流命令。工作流代码向其命名空间内的另一个工作流发送信号。请求及其结果在发送方历史中只记录一次，重放绝不会再次发送该信号。

## 要求 {#requirements}

| 运行时 | Signal-with-start | 向另一个工作流发送信号 |
| --- | --- | --- |
| 原生 Server | 3.15.0 或更高版本，通过 `capabilities.signal_with_start` 公布 | 3.15.0 或更高版本，通过 `signal_external_workflow` Worker 命令公布 |
| PHP SDK | 3.22.0 或更高版本：`Client::signalWithStart()` | 3.22.0 或更高版本：`WorkflowContext::signalExternalWorkflow()` |
| Python SDK | 2.20.0 或更高版本：`Client.signal_with_start()` | 2.20.0 或更高版本：`ctx.signal_external_workflow()` |
| Rust SDK | 4.21.0 或更高版本：`Client::signal_with_start()` | 4.21.0 或更高版本：`ctx.signal_external_workflow()` |
| 嵌入式 PHP（Laravel） | `WorkflowStub::signalWithStart()`，见[信号指南](../features/signals.md#signal-with-start) | Workflow 2.35.0 或更高版本（实验性）：`signalExternalWorkflow()`，见[信号指南](../features/signals.md#signal-another-workflow) |

已发布的 PHP Server 2.x 不支持这两个操作。SDK 在发送前会检查所连接的 Server。针对较旧的 Server，客户端调用会引发 `ServerCapabilityUnavailable`（PHP）、`RuntimeCapabilityUnsupported`（Python）或 `Error::SignalWithStartUnavailable`（Rust），且不发送任何内容。Worker 会在提交任何内容之前，以 `signal_external_workflow_unavailable` 拒绝新的信号命令，因此工作流任务不会完成，运行也不会失败。

## Signal-with-start {#signal-with-start}

当调用方针对单个实体，且不能在分开的启动与信号之间丢失事件时，请使用 signal-with-start。分开执行的 `start(use-existing)` 后接 `signal` 是两个操作：运行可能在两者之间关闭，随后信号会被拒绝。Signal-with-start 没有这个间隙。

- **没有运行。** 使用本次调用的输入和期限启动新运行。回执的 `start_outcome` 为 `started_new`。
- **存在打开的运行**，包括 continue-as-new 之后的最新运行。信号加入该运行，`start_outcome` 为 `returned_existing_active`。该运行保留其输入、期限和历史。若重复策略为 `fail`，则改为以 `instance_already_started` 拒绝。
- **运行已关闭。** 以 `run_not_active` 拒绝，除非已关闭运行策略为 `start_new_run`。该策略会在已关闭的运行之后启动新运行，回执在 `closed_run_id` 中给出已关闭的运行。已关闭的运行保留其结果。

工作流类型必须与实例的类型一致，任务队列必须与打开运行的队列一致。否则 Server 以 `workflow_type_conflict` 或 `task_queue_conflict` 拒绝。任何拒绝都不会写入内容。

请求 ID 就是该信号的[命令键](./server-api-reference.md#command-keys)。省略时，各 SDK 会为每次调用生成一个。如果重试需要在进程重启后仍然有效，请保存你自己的键。使用相同键、信号名称、参数和工作流类型的重试会返回原始回执并带有 `retained: true`，即使运行已关闭或已继续为新运行也是如此，且不会启动任何内容。

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

要在已关闭的运行之后启动新运行，请传入 `closedRunPolicy: 'start_new_run'`（PHP）、`closed_run_policy="start_new_run"`（Python）或 `ClosedRunPolicy::StartNewRun`（Rust）。Signal-with-start 只接收信号一次。信号触发的工作仍需自行保证幂等。

## 向另一个工作流发送信号 {#signal-another-workflow}

工作流代码按工作流 ID 向其命名空间内的另一个工作流发送信号。不带运行 ID 时，信号发往目标的当前运行；带运行 ID 时，只发往该运行。该信号是工作流命令，而不是活动：

- 携带它的完成操作会在发送方历史中记录 `ExternalSignalRequested`，在目标上接收该信号，并在同一序列号上记录恰好一个结果，即 `ExternalSignalDelivered` 或 `ExternalSignalFailed`，全部在一个 Server 事务中完成。
- 在目标上它是普通信号：与其他信号相同的 `SignalReceived` 事件和信号记录，归属于发送方运行。它在目标上的命令键为 `workflow-signal:<sender run ID>:<sequence>`。调用方不能使用该前缀：请求 ID 以 `workflow-signal:` 开头的信号或 signal-with-start 会以 422 和 `reason: "request_id_reserved"` 被拒绝。
- 重放读取已记录的结果，绝不再次发送。若在工作流的该位置目标、运行、信号名称或参数不同，重放会因非确定性而失败。

未投递的信号是返回值，而不是异常。由工作流代码决定如何处理。

| 结果 | 原因 | 何时 |
| --- | --- | --- |
| `delivered` | 无 | 目标运行已接收该信号。 |
| `target_not_found` | `instance_not_found` | 此命名空间中不存在该 ID 的工作流。 |
| `target_not_found` | `run_not_found` | 该运行 ID 不对应该工作流的任何运行。 |
| `target_closed` | `run_not_active` | 目标运行已关闭。 |
| `target_closed` | `historical_run` | 该运行 ID 指向已被 continue-as-new 替换的运行。 |
| `rejected` | `unknown_signal`、`invalid_signal_arguments`、`structural_limit_exceeded` | 目标拒绝了该信号，与拒绝 HTTP 信号的方式相同。 |
| `rejected` | `runtime_reserved_signal` | 该名称保留给运行时的消息流。 |
| `rejected` | `self_target` | 目标是发送方自身的工作流。 |
| `rejected` | `request_id_conflict` | 该命令键已用于另一个信号。 |

SDK 会在记录任何内容之前，在工作流代码中检查信号名称。名称不能为空，不能包含控制字符（小于 `0x20` 的字节或 `0x7f`），且最多 191 个字符、255 个字节。目标工作流 ID 长度为 1 到 191 个字符。被拒绝的名称会引发 `InvalidSignalName`（PHP 和 Python）或返回 `Error::InvalidExternalSignal`（Rust），且不会发送命令。

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

已启动子工作流的句柄具有相同的命令：`$child->signal('approve', ['Ada'])`。

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

在 Rust 中添加 `.run_id(run_id)`、在 Python 中添加 `run_id=`、在 PHP 中添加 `runId:`，即可只向目标的某一个运行发送信号。

请单独运行该命令。它不能作为并行组或持久选择的成员。持有工作流任务的 Worker 可以向该任务命名空间内的任何工作流发送信号，而无需 HTTP 信号所需的操作员角色。不应接收其他工作流代码所发信号的工作流，请放在单独的命名空间中。

## 带超时的条件等待如何排序 {#timed-condition-order}

使用 Native Server 3.27.0 或更高版本及兼容的 worker，并启用创建有序等待后，带超时的条件可以使用在原始 `TimerFired` 事件之前收到的信号和成功应用的更新。即使 worker 在计时器触发后才评估条件，这一规则也适用。接收顺序决定哪个符合范围的状态最先满足条件。命名信号使用相同的计时器边界。

在受支持的 `select()` 中，如果历史记录中第一次满足条件的状态早于子工作流完成或失败的事件，则选择条件分支。等待结束后，回放会使用已记录的结果。

默认情况下，创建有序等待处于禁用状态。自行部署 Server 时，请先按照[部署与回滚指南](https://github.com/durable-workflow/server/blob/3.27.0/rust/README.md#rolling-out-durable-input-ordering-for-timed-waits)操作，再启用该功能。

## 仍需要活动的情况 {#when-an-activity-is-still-needed}

当工作流命令不适用时，请使用调用客户端的活动：

- **从工作流代码执行 signal-with-start。** signal-with-start 没有对应的工作流命令。请从活动中调用客户端的 signal-with-start，并根据稳定的工作流数据（例如工作流 ID 和业务键）派生其请求 ID，使每次活动重试都发送相同的键，Server 只接收一次信号。
- **另一个命名空间。** 信号仅限于命名空间内。请改用[跨命名空间服务调用](./service-operations.md)。
- **较旧的 Server。** 在原生 Server 3.15.0 之前，工作流代码只能通过活动发送信号。同样要为该信号提供稳定的请求 ID，避免活动重试记录第二个信号。

活动至少运行一次，因此正是稳定的请求 ID 防止重试发送第二个信号。信号命令在历史中记录其结果，无需活动任务。
