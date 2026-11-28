---
title: 在静默期后合并修订
description: 使用持久信号等待，在输入暂停后更新实体。
---

# 在静默期后合并修订 {#debouncing-and-coalescing}

## 等待一段静默期 {#quiet-window}

为每个实体使用固定的工作流 ID。保留最大的正整数修订号，并更新到该版本。此模式有意跳过中间修订，适用于刷新到最新状态。需要逐笔处理的业务，例如单笔付款，应使用处理每个请求的流程。

每次收到信号都开启一个新的限时等待。结果为 `null` 时，静默期结束。重放遵循已记录的等待和计时器。

```php
use Workflow\V2\Activity;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, await, continueAsNew};

#[Type('docs.entity-debounce')]
#[Signal('changed', [
    ['name' => 'revision', 'type' => 'int', 'allows_null' => false],
])]
final class EntityDebounce extends Workflow
{
    public function handle(
        string $entity,
        int $pending = 0,
        int $applied = 0,
        int $batches = 0,
    ): mixed {
        while (true) {
            if ($pending <= $applied) {
                $pending = max($applied, await('changed'));
            }

            while (($next = await('changed', timeout: 1)) !== null) {
                $pending = max($pending, $next);
            }

            if ($pending <= $applied) {
                continue;
            }

            activity(ApplyRevision::class, $entity, $pending);
            $applied = $pending;

            if (++$batches >= 2) {
                return continueAsNew($entity, 0, $applied, 0);
            }
        }
    }
}

#[Type('docs.apply-revision')]
final class ApplyRevision extends Activity
{
    public function handle(string $entity, int $revision): array
    {
        return ['entity' => $entity, 'revision' => $revision];
    }
}
```

注册工作流类型，使新 worker 或后继运行能解析同一个定义。

```php
config(['workflows.v2.types.workflows' => [
    'docs.entity-debounce' => EntityDebounce::class,
]]);
```

## 原子接纳变更 {#embedded-intake}

```php
use Workflow\V2\WorkflowStub;

$entity = 'customer-42';
$revision = 1;
$receipt = WorkflowStub::make(EntityDebounce::class, 'refresh:'.$entity)
    ->signalWithStart('changed', [$revision], $entity);
```

回执确认接纳已持久化，活动仍可能处于待处理状态。嵌入式 `signalWithStart` 会启动不存在的实例，向活动运行发送信号，或在实例关闭后创建新运行。普通启动策略会让已关闭的实例保持关闭。

## 保留待处理变更并限制历史 {#pending-input-and-continuation}

活动执行期间收到的信号会保持待处理，直到下一次等待。下一批次有自己的静默期，当前活动会继续执行。在继续运行的参数中保留已应用的修订号，以及已读取但尚未应用的修订号。面向实例且设有声明处理程序的待处理信号可以传递给后继运行。面向具体运行的命令仍绑定到选定的运行。

以有代表性的突发输入测量历史。接纳、应用信号、等待、计时器和活动都增加事件，包括 `SignalReceived` 和 `SignalApplied`。连续输入可能在静默期结束前耗尽历史容量。限制输入并为继续运行预留空间。Continue-as-new 保留执行截止时间。

示例活动只返回选定的修订号。对于实际外部效果，在目标系统中使用 `(实体, 修订)` 等幂等键。即使信号已去重，活动重试仍可能重复发送外部请求。
