---
sidebar_position: 4
title: 定时器
description: 使用持久定时器和确定性的工作流时间，避免依赖进程的系统时钟状态。
tags:
  - timers
  - deterministic-time
  - waits
keywords:
  - 持久定时器
  - 确定性时间
  - 工作流当前时间
---

import TimerSimulator from '@site/src/components/TimerSimulator';

# 定时器 {#timers}

框架支持暂停工作流执行，并在稍后恢复。持久定时器可在重启和故障后继续存在，同时保持与工作流重放语义一致，适合实现延迟、重试逻辑或超时。

在工作流内调用 `timer($duration)` 使用定时器：

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

定时器行为：

- 每次 `timer()` 调用都会创建持久定时器行及类型化 `TimerScheduled`、`TimerFired` 历史事件；被取代时还会记录 `TimerCancelled`
- 延迟定时器先执行专用定时器任务，再恢复工作流任务
- `timer(0)` 在工作流任务内直接触发，不创建定时器任务
- 重放和查询路径将类型化 `TimerScheduled`、`TimerFired` 和 `TimerCancelled` 历史视为定时器生命周期的权威依据，因此纯定时器会持续阻塞直到已提交的触发事件到达，所选运行详情也能从历史重建未完成、已触发或已取消的定时器等待
- Waterline 在运行详情和仪表板载荷中展示定时器等待
- 引擎级 `cancel()` 和 `terminate()` 命令以持久方式取代未完成的定时器等待，迟到的定时器作业不执行任何操作，不会重新打开运行

任意时长的定时器都适用于所有 Laravel 队列驱动，包括 Amazon SQS。引擎会将超过驱动单消息上限的长延迟透明地分段处理。

随机值或一次性分支输入等可安全重放的快照可使用 `sideEffect()`。

## 读取确定性时间 {#reading-deterministic-time}

工作流主体需要当前时间时，使用 `Workflow::now()` 或 `Workflow\V2\now()`，不要使用 Laravel 的 `now()` 辅助函数或 `Carbon::now()`：

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

`Workflow::now()` 随执行器重放历史事件而推进。它返回重放已消费的最后一个活动完成、定时器触发、信号接收、条件解决或子工作流完成事件的 `recorded_at`。尚未消费事件时，返回运行的 `started_at`。在工作流 Fiber 之外，例如活动内，或转调非工作流辅助函数的查询方法内，会回退到系统时钟 `now()`。

使用 `Workflow::now()` 可保持工作流的确定性：即使两次重放之间系统时间已推进，同一历史的两次重放仍产生相同的时间值。
