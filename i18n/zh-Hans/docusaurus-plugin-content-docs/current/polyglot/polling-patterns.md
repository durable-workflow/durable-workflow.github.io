---
title: 轮询外部状态
description: 选择有界重试、带心跳的活动或持久定时器循环，并核算它们的历史记录开销。
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

使用简短且可安全重试的检查。回调若阻塞在外部请求中，不会仅因为工作流具备定时器或取消策略就变得可响应。

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
