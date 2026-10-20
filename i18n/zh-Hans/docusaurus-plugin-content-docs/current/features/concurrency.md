---
sidebar_position: 10
---

import ConcurrencySimulator from '@site/src/components/ConcurrencySimulator';

# 并发 {#concurrency}

本指南介绍使用 `Workflow\V2\Workflow` 的嵌入式 Laravel 工作流并发。服务模式 Worker 请使用 [PHP SDK 指南](https://php.durable-workflow.com/build/workflows-activities/)、[Python SDK 指南](https://python.durable-workflow.com/sdk-reference/#deterministic-parallel-groups)或 [Rust SDK 参考](https://rust.durable-workflow.com/durable_workflow/struct.WorkflowContext.html#method.parallel)。

`all([...])` 在暂停前描述完整持久组。嵌入式运行时调度其中的活动和子工作流命令，并按原始嵌套输入结构返回结果。

进度取决于首个完成成员，而非整个屏障时，使用选择组。选择也是持久的：它启动每个成员，记录一个胜出者，并让其他成员继续运行，直到工作流代码等待或显式取消它们。

## 串行 {#series}

本示例串行执行 3 个活动，等待每个活动完成后才继续下一个。

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return [
            activity(MyActivity1::class),
            activity(MyActivity2::class),
            activity(MyActivity3::class),
        ];
    }
}
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyActivity1', duration: 1500 },
    { name: 'MyActivity2', duration: 2000 },
    { name: 'MyActivity3', duration: 1200 },
  ]}
  mode="series"
  title="串行执行模拟器"
/>

## 并行 {#parallel}

本示例并行执行 3 个活动，等待全部活动完成并收集结果。

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return all([
            fn () => activity(MyActivity1::class),
            fn () => activity(MyActivity2::class),
            fn () => activity(MyActivity3::class),
        ]);
    }
}
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyActivity1', duration: 2000 },
    { name: 'MyActivity2', duration: 1500 },
    { name: 'MyActivity3', duration: 2500 },
  ]}
  mode="parallel"
  title="并行执行模拟器"
/>

串行与并行示例的主要区别在于暂停发生的位置。串行示例中，每次 `activity()` 调用直接暂停并恢复工作流。并行示例中，闭包先描述整个屏障，`all()` 再为整个组暂停一次，因此工作流恢复前，每个成员均可并行运行。

## 首个完成的选择 {#first-completion-selection}

`select([...])` 启动独立活动、子工作流、定时器、信号等待、条件等待或嵌套普通屏障，并在某个成员提交符合条件的结果或类型化故障时恢复。后续代码需要区分或再次访问成员时，为成员提供稳定的应用键。成员键必须是非空字符串或非负整数。

以下协调器在与解析器相同的持久步骤启动截止计时。输入处理和解析器进度不能重置或推迟该截止时间：

```php
use function Workflow\V2\{activity, await, select, timer};
use Workflow\V2\Workflow;

final class ResolveInRealTime extends Workflow
{
    public function handle(string $requestId): array
    {
        $selected = select([
            'resolved' => fn () => activity(ResolveRequest::class, $requestId),
            'manual' => fn () => await('resolution.received'),
            'deadline' => fn () => timer('2 seconds'),
        ]);

        if ($selected->key === 'deadline') {
            $selected->handles['resolved']->cancel();

            return ['status' => 'timed_out'];
        }

        // The deadline is not cancelled just because another member won.
        $selected->handles['deadline']->cancel();

        return [
            'status' => 'resolved',
            'source' => $selected->key,
            'value' => $selected->result(),
        ];
    }
}
```

结果包含稳定成员键与索引、操作类型与持久标识、结果或类型化故障、胜出者句柄，以及每个成员的句柄。未胜出句柄可稍后通过 `await()` 等待，或通过 `cancel()` 取消。选择绝不隐式丢弃或取消其他成员。`cancel()` 是返回 void/unit 的请求，不报告取消是否胜出。`SelectionOperationCancelled` 历史才是结果的权威依据。如果完成先提交，运行时不写取消标记；只有已提交的工作流任务边界、后继命令或工作流终态事件证明该无操作已提交后，重放才越过取消调用。查询重放会在执行中的取消处停止，不展示其后的推测状态。无操作提交后再等待句柄，会返回先前完成的结果。

运行时在持有父运行提交锁时记录首个符合条件的解决结果。冷重启、持久历史重新加载、查询重放以及后续未胜出成员的完成，都会复用已记录胜出者，不会竞争本地语言 Future 或重新解释历史顺序。完全相同的重复投递是幂等的。并发输入按已提交持久历史排序；活动运行期间到达的输入在下一工作流任务中可见，迟到或重复输入无法替换已记录的胜出者。

## 嵌套屏障 {#nested-barriers}

嵌套 `all([...])` 组让一个工作流步骤表达持久扇出与扇入工作树。运行时将每个活动或子工作流调度为持久叶序列，记录叶的完整 `parallel_group_path`，等待所有包围屏障可推进，然后重建原始嵌套结果结构，再恢复工作流主体。重放时，`all([...])` 步骤中的活动或子叶仍须匹配已记录组路径；缺少组元数据的类型化叶历史会被视为不兼容的旧预览版历史，不会被推测纳入当前屏障。

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

final class NestedWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => activity(BuildSummary::class),
            fn () => all([
                fn () => activity(BuildInvoice::class),
                fn () => activity(BuildShipment::class),
            ]),
        ]);
    }
}
```

此示例中，Waterline 展示三个未完成叶等待，而非一个合成的“嵌套”等待。首个叶只属于外层屏障，第二、第三个叶提供含两个条目的 `parallel_group_path`，使运维人员同时看到外层组和仍未完成的内层子组。

外层组大小统计持久叶，而非嵌套数组。每个嵌套叶携带从外到内的 `parallel_group_path`；每个路径条目保留相同的持久工作流位置。组在暂停前调度所有叶，然后按输入位置组装成功值。Worker 重启和已完成历史的重放会重建相同组标识。完全相同的重复终态投递会被忽略，迟到的其他成员完成可补充部分诊断，但不会改变嵌入式运行时确定性策略已选定的失败成员。

嵌入式运行时从 `all()` 抛出类型化叶故障，并在历史和运维视图中保留屏障的持久组元数据。

## 异步回调 {#async-callback}

`async(...)` 将可序列化回调作为系统类型为 `durable-workflow.async` 的持久子工作流运行。异步回调与具名 v2 工作流使用相同的纯顺序辅助函数契约，因此 `activity()`、`await()`、`timer()`、`sideEffect()` 等单步骤辅助函数直接在回调主体中暂停，无需 `yield`。

```php
use function Workflow\V2\{activity, async};
use Workflow\V2\Workflow;

final class CustomerWorkflow extends Workflow
{
    public function handle(string $customerId): array
    {
        $profile = async(static function () use ($customerId): array {
            $customer = activity(LoadCustomer::class, $customerId);

            return [
                'customer' => $customer,
                'score' => activity(ScoreCustomer::class, $customer['id']),
            ];
        });

        return ['profile' => $profile];
    }
}
```

父运行将回调视为子等待，因此命令历史、谱系和 Waterline 详情使用与显式 `child(...)` 调用相同的 `child_call_id`、子运行 ID 和子结果历史。回调通过 Laravel 可序列化闭包支持序列化，因此应保持在本应用和本部署范围内。工作需要稳定公开工作流类型以进行跨服务路由或长期代码演进时，使用具名 `child(SomeWorkflow::class, ...)`。v2 的 `async(...)` 回调只支持顺序编写，直接调用 `activity()`、`child()`、`await()`、`timer()` 和 `all([...])`，不使用 `yield`。

## 混合活动与子工作流屏障 {#mixed-activity--child-barriers}

同一个 `all()` 也可对活动和子工作流的混合组进行扇入。结果仍按原始数组顺序返回，成功成员仍等待组内其他成员，而首个失败成员立即唤醒父工作流。

父工作流重放时，若多个屏障成员已非成功关闭，父工作流接收记录关闭时间最早的故障。两个故障记录时间相同时，屏障叶索引较低者胜出，使工作流恢复和查询重放选中相同异常。后续其他成员的故障不会替换已经抛入父步骤的异常。

```php
use function Workflow\V2\{all, activity, child};
use Workflow\V2\Workflow;

final class OrderWorkflow extends Workflow
{
    public function handle(): array
    {
        [$charge, $shipment] = all([
            fn () => activity(ChargeCustomer::class),
            fn () => child(ShipOrderWorkflow::class),
        ]);

        return compact('charge', 'shipment');
    }
}
```

## 当前限制 {#current-limits}

当前并发接口尚不包含：

- 超出显式嵌套 `all([...])` 组的内置有界并发辅助功能

## 并行子工作流 {#child-workflows-in-parallel}

子工作流也可在自己的 `all([...])` 屏障中并行运行。行为与并行活动相同，但对象是子工作流：父工作流持久地扇出多个子运行，只有整个子屏障可以推进时才恢复。

```php
use function Workflow\V2\{all, child};
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => child(MyChild1::class),
            fn () => child(MyChild2::class),
            fn () => child(MyChild3::class),
        ]);
    }
}
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyChild1', duration: 2200 },
    { name: 'MyChild2', duration: 1800 },
    { name: 'MyChild3', duration: 2500 },
  ]}
  mode="parallel"
  title="并行子工作流模拟器"
/>

这使工作流易于实现层次化并行。当一个父步骤需要多层扇入时，可使用嵌套的纯子工作流组，或子工作流与活动混合组。
