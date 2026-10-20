---
title: 轮询外部状态
description: 选择有界轮询或回调信号，在工作流代码中持久等待，并核算历史记录成本。
---

# 轮询外部状态 {#polling-external-state}

应在活动中查询外部任务，不要在工作流代码中发出网络请求。先决定在哪里等待，再选择轮询间隔。

## 选择等待边界 {#choose-the-waiting-boundary}

| 模式 | Worker使用情况 | 持久历史与控制 |
| --- | --- | --- |
| 重试一个活动，直到状态就绪 | 每次尝试期间占用活动槽位；重试退避期间释放 | 每次尝试和重试计划都会增加历史。工作流代码不会在尝试之间恢复，因此此时无法检查历史预算或执行 continue-as-new。 |
| 一个持续发送心跳的长活动 | 整个等待期间占用活动槽位 | 每个被接受的心跳都会增加一个历史事件。为活动设置有限截止时间，并为外部请求设置有界超时；心跳不会延长整个执行的截止时间。 |
| 活动检查后等待持久定时器 | 两次检查之间释放活动槽位 | 每次检查增加活动事件，每个间隔增加定时器事件。工作流代码可在检查之间决定停止、补偿或 continue-as-new。 |
| 专用轮询子工作流 | 子工作流使用其所选模式需要的槽位 | 将轮询历史转移到子工作流；为父工作流增加子调用的启动与结果事件。子工作流的历史和执行仍有开销。请明确选择父工作流关闭策略。 |
| 提交后返回，再接收回调信号 | 提交后释放活动槽位；由工作流持久等待 | 提交、信号接纳与应用以及带截止时间的等待都会增加历史记录。需要经过身份验证的关联关系及应用级去重。 |

使用简短且可安全重试的检查。回调若阻塞在外部请求中，不会仅因为工作流具备定时器或取消策略就变得可响应。

## 通过回调与信号完成任务 {#callback-and-signal-completion}

如果外部系统能够发送通知，就在短活动中提交任务并返回受理确认。让**工作流**以有限的截止时间等待已声明的信号或由回放重建的条件。不要一直占用活动、HTTP 响应或 SSE 连接来等待任务完成。

启动工作流之前，先选择实例 ID，并保存经过身份验证的外部操作、命名空间、**公开工作流实例 ID**与已声明信号名称之间的映射。启动事务一旦提交，活动就可能立即提交外部任务。运行 ID 只标识单次运行，不能作为跨 continue-as-new 的稳定回调地址。验证回调身份，并在转发前检查保存的映射；不要信任任意请求自行提供的路由或身份字段。

### 嵌入式 PHP 回调 {#embedded-php-callback}

将 `services.jobs.url` 配置为供应商地址，将 `services.jobs.callback_url` 配置为应用经过身份验证的适配器地址。按供应商 API 调整示例中的 `/jobs` 请求：它必须快速确认受理并返回 `job_id`。实现供应商要求的身份验证，并限制请求时长。只有供应商确实遵守操作键时，它才有去重作用。

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

使用调用方选定的实例 ID，以及有限的单次运行和整体执行超时来启动。将 `ExternalCompletion` 注册到[经过身份验证的 Webhook](../features/webhooks.md)；应用的回调适配器可以将已验证输入转发到面向实例的信号路由：

```bash
curl -fsS -X POST "$APP_URL/webhooks/instances/external-job-42/signals/job-completed" \
  -H "Authorization: $WEBHOOK_TOKEN" -H 'Content-Type: application/json' \
  -d '{"arguments":["op-42",{"value":42}]}'
```

这里使用嵌入式 Webhook 的 `arguments` 格式，而不是 Server 的负载信封。供应商应调用应用经过身份验证的适配器，不应获得 Server 操作员或工作器凭据。

### Python 回调与条件 {#python-callback-and-condition}

下面的活动只执行有时限的提交操作。在活动环境中配置 `JOB_API_URL`、`JOB_CALLBACK_URL` 和供应商身份验证。将两个定义都注册到 [Python 工作器](./python.md)。显式传入调用方已知的工作流实例 ID；此例没有假定工作流上下文存在并未提供的 ID 访问器。

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

选择实例 ID，并在**调用 start 之前**持久化操作的命名空间、实例与信号映射。启动提交后，活动就可能开始。随后，应用使用有限的时间预算启动该实例：

```python
handle = await client.start_workflow(
    workflow_type="external-completion", task_queue="external-jobs",
    workflow_id="external-job-42", input=["external-job-42", "op-42"],
    execution_timeout_seconds=60, run_timeout_seconds=30,
)
```

验证供应商身份并查出已保存的操作映射后，回调适配器使用**相同命名空间**的 Client：

```python
await client.signal_workflow(
    "external-job-42", "job-completed", args=["op-42", {"value": 42}],
)
```

这会使用 SDK 标准 Avro 信封调用 Server 的 `POST /api/workflows/{workflowId}/signal/{signalName}`。成功的信号调用只确认接纳，不表示工作流代码已处理回调。需要确认处理结果时，应查询工作流结果或保留的信号状态。

### 提前回调、续接与迟到回调 {#early-continued-and-late-callbacks}

- 在启动运行前声明信号。早于等待到达的回调会被保存，并按持久化顺序消费；Python 在回放时重建处理器状态。后续注册不能改写旧运行的声明。
- 面向实例的回调会跟随 continue-as-new；显式面向某次运行的调用仍被限制在该运行。兼容的 Core 2.7.0+ 运行时会在交接时保留符合条件的已接收实例信号的原始身份与顺序。应用仍需要**已应用**回调的状态时，必须通过续接输入携带这些状态。
- 终态关闭之后的回调会被明确拒绝。对于已发布的 Server，Python 暴露 `SignalFailed.reason == "run_not_active"` 和状态409。已接纳但尚未应用的信号，也可能保留因关闭而拒绝的处置状态；原先的接纳回执不会被抹除。参见[信号接纳与关闭](../features/signals.md#acceptance-and-closure)。
- 等待期限不会取消外部任务。应核对其结果，或通过活动请求供应商取消。迟到结果可能需要应用作出恢复决策；不要悄悄启动替代任务。

### 重复投递与流式传输的限制 {#duplicate-delivery-and-streaming-limits}

供应商会重试回调，信号接纳后也可能发生网络错误。持久化应用操作或事件键及准确意图，在回调入口与业务处理中都做去重，并保留结果不确定的投递以便核对。Python 处理器只保留本次运行中每个操作的第一个结果；这不是跨运行去重或仅接纳一次的保证。不要仅因已发出请求就把不确定的转发标记为已处理。[共享问题 #216](https://github.com/durable-workflow/.github/issues/216) 仍负责安全重试信号与保留接纳身份。幂等请求头或仅一次活动尝试，本身都不能保证外部副作用只发生一次。

先启动工作流，再按此方案提交外部任务。服务模式下，`start(use-existing)` 后接 `signal` 是**两个操作**，中间可能发生关闭竞态；原子接纳仍属于[共享问题 #222](https://github.com/durable-workflow/.github/issues/222)。嵌入式 `signalWithStart` 是单独的原子 API。防抖请求 [Website #280](https://github.com/durable-workflow/durable-workflow.github.io/issues/280) 已由该产品需求替代，并非由此回调方案交付完成。

活动内保持的 HTTP/SSE 套接字并不持久：工作器或进程丢失时连接会结束，它占用活动槽位，重连还可能重复或遗漏外部事件。提交与回调仍会增加活动、信号和等待历史；执行并非免费或无限。需要持久的**工作流输出**时，请使用 [Workflow Streams](./workflow-streams.md) 及其持久化序列与游标契约，不要把传输连接当成存储。

上述 PHP 和 Python 代码已在发布的 **Server 2.9.7 / Core 2.7.2** 与正常安装的 **Python SDK 2.6.1** 上执行。独立的 PostgreSQL 17.11 检查覆盖了提前回调、等待中回调、迟到拒绝，以及 Python 工作器缺席时接收回调、随后冷读取的 continue-as-new。嵌入式检查使用真实 Webhook 路由。这些是本方案的证据，不代表所有数据库、供应商身份验证、优雅关闭或原生运行时均已通过资格验证。[验证记录](https://github.com/durable-workflow/durable-workflow.github.io/issues/321#issuecomment-6292485315) 单独保留了未成功的原始尝试。

## 限制重试与历史增长 {#bound-retries-and-history}

重试需要显式启用：PHP 活动默认只有一次尝试。例如设置 `maxAttempts: 3`、`backoff: [5, 30]`、`startToCloseTimeout: 10` 和 `scheduleToCloseTimeout: 90`，即可在有限延迟和原始总时间限制内进行三次远程尝试。对应的 Python 策略为 `ActivityRetryPolicy(max_attempts=3, backoff_seconds=[5, 30])`，单次尝试和活动总超时分别配置。成功返回“尚未就绪”不是失败，也不会触发重试。参见[失败与恢复](../failures-and-recovery.md)。

当“尚未就绪”被明确表示为可重试结果，且工作流无需在检查之间运行时，适合使用重试。不要把无限重试当作隐藏的轮询循环。本地活动重试延迟的一致性由[重试契约议题](https://github.com/durable-workflow/.github/issues/219)跟踪；本文示例使用远程活动。

## 有计划地切换到新运行 {#roll-over-deliberately}

这个可运行演示每次运行只检查一次，等待后将有限的剩余检查计数传给下一次运行。只需把活动中的模拟状态查询替换为真实的有界请求。即使达到检查次数上限，示例也会返回最后的状态；调用方必须检查 `ready`。

### 嵌入式 PHP {#embedded-php}

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

按照常规[嵌入式工作流设置](../installation.md)启动，并为单次运行和整个执行设置有限超时。

### 服务模式 Python Worker {#python-service-worker}

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

在同一个 [Python Worker](./python.md)中注册 `PollDemo` 和 `check_status`，然后以参数 `[2, 30]` 以及有限的执行与运行超时启动。观察当前工作流实例以跟随其后继运行；绑定到特定运行的句柄仍然选择原来的运行。

两个示例均已在发布的 Server **2.9.7 / Core 2.7.2** 和正常安装的 Python **2.6.1** 上以测试输入 `[2, 1]` 执行。两者都在两次运行中完成两次真实检查。Continue-as-new 重置单次运行的历史，增加运行与链接开销，并保留整个执行最初的截止时间。它不会提供无限生命周期。

这里使用相对持久等待。Python 的推进式时钟和重放稳定的历史预算读取，仍分别属于[时钟](https://github.com/durable-workflow/.github/issues/215)与[预算](https://github.com/durable-workflow/workflow/issues/859)任务。本示例不根据 `ctx.now()` 或重新计算的历史长度分支。不要把 `DW_MAX_HISTORY_EVENTS` 当作强制执行的自动切换机制：[Server #504](https://github.com/durable-workflow/server/issues/504) 正在跟踪这一缺口。

## 中断并核对外部结果 {#interrupt-and-reconcile}

若要通过信号停止，请[在信号与当前等待之间使用 select](../features/concurrency.md)，并按落败操作支持的取消策略显式取消它。仅做选择不会取消其他操作。请求停止活动不能证明外部副作用从未发生：请使用幂等键，并在补偿或重新启动前核对外部状态。立即取消、终止和工作流硬超时不会执行工作流补偿代码；需要运行清理时，应使用已支持的[协作式取消](./cancellation.md)。

## 检查实际历史 {#inspect-the-actual-history}

上述 Python 服务模式的发布版本测量记录了：

| 已完成场景 | 规范历史事件 |
| --- | --- |
| 一个远程活动在第三次尝试成功 | 共10个：1次调度、3次开始、2次重试调度、1次完成，以及3个运行生命周期事件 |
| 一个活动发送两个被接受的心跳 | 共8个：3个活动事件、2个心跳事件，以及3个生命周期事件 |
| 两次成功检查之间使用一个定时器 | 共11个：6个活动事件、2个定时器事件，以及3个生命周期事件 |

切换示例在 Python 的两次运行中记录了 **8 + 5** 个事件，在 PHP 中记录了 **8 + 6** 个；PHP 还会为后继运行记录 `StartAccepted`。这些是实测的操作与运行开销，不是通用事件总数、计费单位或性能结果。其他命令、失败、取消以及运行时接纳元数据可能增加事件。请检查每次运行的历史、已保留的尝试策略和原始截止时间，而不要仅按循环次数估算增长。精确观察及失败的验证程序记录保留在[资格验证记录](https://github.com/durable-workflow/durable-workflow.github.io/issues/283#issuecomment-6288504564)中。
