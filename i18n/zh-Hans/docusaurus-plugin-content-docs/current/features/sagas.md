---
sidebar_position: 11
---

# Saga {#sagas}

本指南介绍使用 `Workflow\V2\Workflow` 的嵌入式 Laravel 工作流补偿。对于 service 模式 Worker，请参阅 [PHP SDK 指南](https://php.durable-workflow.com/build/workflows-activities/)、[Python SDK 指南](https://python.durable-workflow.com/sdk-reference/#saga-compensation)或 [Rust SDK 参考](https://rust.durable-workflow.com/durable_workflow/struct.Saga.html)。

Saga 是管理复杂长时间操作的成熟设计模式：

- Saga 通过一系列本地事务管理分布式事务。
- 本地事务是 saga 参与者（活动）执行的工作单元。
- Saga 中每个操作都可以由补偿活动撤销。
- 工作流代码决定何时调用补偿。补偿也可能失败，需要足够时间和可工作的 Worker 才能完成。

```php
use function Workflow\V2\activity;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('booking-saga')]
class BookingSagaWorkflow extends Workflow
{
    public function handle(): array
    {
        try {
            $flightId = activity(BookFlightActivity::class);
            $this->addCompensation(fn () => activity(CancelFlightActivity::class, $flightId));

            $hotelId = activity(BookHotelActivity::class);
            $this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotelId));

            $carId = activity(BookRentalCarActivity::class);
            $this->addCompensation(fn () => activity(CancelRentalCarActivity::class, $carId));

            return compact('flightId', 'hotelId', 'carId');
        } catch (\Throwable $e) {
            $this->compensate();

            throw $e;
        }
    }
}
```

工作流捕获异常时，`$this->compensate()` 按**逆序**运行所有已注册补偿。上例中，如果 `BookRentalCarActivity` 失败，引擎先取消酒店再取消航班，从最近的步骤往前回退 saga。

在每个正向活动成功后注册其补偿。重放会重建注册顺序，并复用已记录的活动结果，包括已经完成的补偿。

## 由截止时间驱动的补偿 {#deadline-driven-compensation}

引擎[工作流超时](./timeouts.md#timeout-outcome-and-cleanup)会在工作流代码运行补偿前关闭运行。`catch` 或 `finally` 不会改变该行为。立即执行的 `cancel()` 与 `terminate()` 也不提供清理窗口。

如果超时应撤销已完成工作，请使用更早的应用截止时间。此嵌入式工作流先预订资源，再最多等待确认信号 30 秒。等待到期后，工作流代码恢复，释放预订，然后返回 `expired` 业务结果：

```php
use function Workflow\V2\{activity, await};
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;

#[Type('reservation-deadline')]
#[Signal('confirm')]
final class ReservationDeadlineWorkflow extends Workflow
{
    public function handle(string $orderId): array
    {
        $reservationId = activity(
            ReserveResourceActivity::class,
            new ActivityOptions(scheduleToCloseTimeout: 30),
            $orderId,
        );
        $this->addCompensation(fn () => activity(
            ReleaseResourceActivity::class,
            new ActivityOptions(scheduleToCloseTimeout: 30),
            $reservationId,
        ));

        if (await('confirm', timeout: 30) === null) {
            $this->compensate();

            return ['status' => 'expired'];
        }

        return ['status' => 'confirmed'];
    }
}
```

`ReserveResourceActivity` 和 `ReleaseResourceActivity` 是应用自定义活动。两者都应使用预订的稳定业务键实现幂等。等待在预订成功后开始。不带参数发送 `confirm`，成功结果为 `true`；`null` 表示等待到期。

启动时设置更长的引擎限制作为兜底：

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(ReservationDeadlineWorkflow::class, 'order-123');
$workflow->start(
    'order-123',
    StartOptions::rejectDuplicate()->withRunTimeout(300),
);

// From an authenticated application action, before the wait expires:
WorkflowStub::load('order-123')->signal('confirm');
```

等待到期且补偿成功时，工作流正常完成，输出包含 `status: expired`；这不是引擎超时的运行。如果释放活动失败，`compensate()` 会传播失败。如果引擎截止时间先到，运行关闭，剩余补偿无法执行。应为调度和重试预留时间，并考虑可能更早的执行截止时间。

独立的协作式 `requestCancellation()` 操作允许调用方在运行活动期间请求清理。可用其有界取消屏蔽在取消请求下完成持久清理。工作流超时不会自动触发该机制。参阅[协作式取消](../polyglot/cancellation.md)。

## 补偿顺序 {#compensation-ordering}

默认情况下，补偿按**注册逆序依次执行**。后续步骤可能依赖之前的步骤，因此这是最安全的默认方式。

默认情况下，`compensate()` 在首次补偿失败时停止，并将失败传播给调用方。

## 并行补偿 {#parallel-compensation}

要并行运行补偿，使用 `setParallelCompensation(true)`。启用后，每个补偿闭包应返回已启动但尚未等待的活动调用，以便引擎并发执行：

```php
use function Workflow\V2\activity;

use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('parallel-saga')]
class ParallelSagaWorkflow extends Workflow
{
    public function handle(): void
    {
        $this->setParallelCompensation(true);

        try {
            $flightId = activity(BookFlightActivity::class);
            $this->addCompensation(fn () => activity(CancelFlightActivity::class, $flightId));

            $hotelId = activity(BookHotelActivity::class);
            $this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotelId));

            activity(ChargePaymentActivity::class);
        } catch (\Throwable $e) {
            $this->compensate();

            throw $e;
        }
    }
}
```

启用并行补偿时，补偿闭包返回活动调用，由引擎收集并通过 `all()` 执行。

## 出错后继续 {#continue-with-error}

默认情况下，补偿活动抛出异常后会跳过剩余补偿并传播错误。要忽略个别失败、继续运行全部补偿，请使用 `setContinueWithError(true)`：

```php
$this->setContinueWithError(true);
```

启用后，引擎捕获并丢弃各补偿闭包的异常，然后继续下一项。补偿相互独立、且希望部分失败时仍尽力清理的场景适合此设置。

### 组合两个标志 {#combining-both-flags}

`setParallelCompensation(true)` 可与 `setContinueWithError(true)` 同时使用。两者启用时，所有补偿通过 `all()` 并发运行；任何补偿抛出的错误会被捕获，使剩余补偿仍能完成。不启用 `setContinueWithError(true)` 时，并行补偿失败立即传播，工作流失败。

```php
$this->setParallelCompensation(true);
$this->setContinueWithError(true);
```

## 工作原理 {#how-it-works}

- `addCompensation()` 注册在 `compensate()` 期间调用的 callable
- `compensate()` 逆序遍历已注册补偿
- 每个补偿闭包都是普通 V2 工作流步骤，调用的活动与其他活动一样生成持久历史事件
- 补偿活动显示在 Waterline 时间线与历史导出中
- 工作流成功时不会调用补偿闭包，也不会生成补偿历史

## 运行此模式 {#run-this-pattern}

[Sample App](/docs/sample-app) 中由信号驱动的旅行代理 saga 是本页的可运行参考。克隆示例应用，设置 `OPENAI_API_KEY`，然后运行：

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` 为每个预订活动注册补偿，因此酒店预订成功后航班失败时，会通过补偿列表撤销酒店。它与本页模式相同，事件可在 Waterline 运行时间线中查看。
