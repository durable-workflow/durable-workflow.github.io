---
sidebar_position: 5
---

# 信号与定时器 {#signal--timer}

`Workflow\V2` 支持以 `await($condition, timeout: $seconds, conditionKey: $key)` 进行带超时的条件等待，也支持以 `await('signal-name', timeout: $seconds)` 进行带超时的具名信号等待。

当工作流应在某个持久重放状态变为真后立即继续，但即使状态一直不变也应在截止时间后解除阻塞时，使用此功能。

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

带 `timeout:` 参数的 `await()` 行为如下：

- 谓词只能依赖重放的持久输入，如活动结果、更新修改或子工作流结果。非持久状态不会唤醒等待。
- 可选条件键是稳定的等待运维标签。重放根据先前历史校验该键，防止重新部署悄然将同一工作流步骤用于不同谓词。
- 谓词在定时器触发前变为真时，`await()` 返回 `true`。
- 截止时间先到达时，`await()` 返回 `false`。

可使用定时器简写辅助函数表达易读的超时值：`seconds()`、`minutes()`、`hours()`、`days()`、`weeks()`、`months()`、`years()`。

要从应用代码持久地改变谓词，请调用声明的更新：

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('approval-with-timeout');

$workflow->markReady();
```

条件在超时任务触发前变为真时，返回 `true`；超时先发生时，返回 `false`。

对于具名信号，`await('name', timeout: minutes(5))` 在信号到达时返回信号载荷，超时先发生时返回 `null`。`null` 专用于超时：无参数信号解析为 `true`，一个参数解析为该值，多个参数解析为数组。`Workflow\V2` 不使用旧版 `#[SignalMethod]` 状态修改方法来更改工作流状态。

## `awaitWithTimeout()` 辅助函数 {#awaitwithtimeout-helper}

`Workflow::awaitWithTimeout($timeout, $condition, $conditionKey = null)` 是 `await($condition, timeout: $timeout, conditionKey: $conditionKey)` 的简写封装。参数顺序将截止时间放在前面，使调用处的超时意图清晰可见。

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

返回语义与带 `timeout:` 参数的 `await()` 相同：可调用谓词的条件先满足时返回 `true`，截止时间先到达时返回 `false`；具名信号先到达时返回信号载荷，截止时间先到达时返回 `null`。

`awaitWithTimeout()` 表达“最多等待这么久直到条件满足”，而非“等待条件并附带超时选项”。选择调用处更清晰的形式即可，运行时同等处理二者，记录的工作流历史也相同。
