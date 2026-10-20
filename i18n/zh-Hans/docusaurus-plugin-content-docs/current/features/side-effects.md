---
sidebar_position: 7
---

# 副作用 {#side-effects}

副作用是包含非确定性代码的闭包。闭包只执行一次，结果会被保存。即使工作流重试，闭包也不会再次执行，而是返回已保存的结果。这样，重放工作流时始终返回同一存储值，无需重新执行非确定性代码，从而保持工作流的确定性。

```php
use function Workflow\V2\await;
use function Workflow\V2\sideEffect;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Workflow;

#[Signal('finish')]
class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        $token = sideEffect(fn () => random_int(1000, 9999));
        $finish = await('finish');

        return compact('token', 'finish');
    }
}
```

工作流只调用一次 `random_int()` 并保存结果，即使之后工作流失败并重试也不例外。

## 何时使用副作用 {#when-to-use-side-effects}

需要满足以下条件的非确定性值时，使用 `sideEffect()`：

- 在本地计算，不涉及外部 I/O，例如随机数、UUID 或时间戳
- 记录后就不应再改变，包括在重放期间
- 不需要重试语义，闭包只执行一次

```php
// Generate a correlation token for downstream systems.
$correlationId = sideEffect(fn () => (string) Str::uuid());

// Snapshot the current time for a business rule.
$decidedAt = sideEffect(fn () => now()->toIso8601String());
```

## 何时改用活动 {#when-to-use-an-activity-instead}

代码可能失败、访问外部服务或需要重试／超时语义时，应使用[活动](../defining-workflows/activities.md)，而不是副作用：

| 场景 | 使用 |
|---|---|
| 生成随机令牌 | `sideEffect()` |
| 在决策时读取配置值 | `sideEffect()` |
| 调用外部 API | `activity()` |
| 写入数据库 | `activity()` |
| 发送邮件或通知 | `activity()` |
| 计算可能抛出异常的高成本值 | `activity()` |

判断原则：如果闭包可能抛出你希望重试的异常，就应将它放入活动。

## 工作原理 {#how-it-works}

- 每次 `sideEffect()` 调用都会追加带工作流步骤序列的类型化 `SideEffectRecorded` 历史事件
- 工作流重放和查询重放均复用已提交的值，不重新执行闭包
- Waterline 在所选运行时间线中将副作用快照展示为类型化历史条目
- 副作用仅用于可安全重放的快照，不用于可能失败或需要重试语义的工作

## 反模式 {#anti-patterns}

**不要在副作用内调用外部服务。** 服务调用失败时，副作用不会被重试，工作流将永久失败：

```php
// BAD: HTTP calls can fail and side effects do not retry.
$price = sideEffect(fn () => Http::get('/api/price')->json('amount'));

// GOOD: Use an activity for external calls.
$price = activity(FetchPriceActivity::class);
```

**不要在副作用内执行缓慢或阻塞操作。** 闭包在工作流任务线程中运行，耗时工作会延迟整个工作流任务：

```php
// BAD: Expensive computation blocks the workflow task.
$hash = sideEffect(fn () => bcrypt($largePayload));

// GOOD: Offload heavy work to an activity.
$hash = activity(ComputeHashActivity::class, $largePayload);
```

**不要依赖可变外部状态。** 闭包只执行一次。读取随时间变化的值时，快照固定在首次执行时，而不是重放时：

```php
// The cached value is whatever it was during the first execution.
// If the cache changes later, this workflow still sees the old value.
$setting = sideEffect(fn () => cache('feature.flag'));
```

这是有意的设计：快照固定以确保确定性。如果需要在工作流生命周期中持续更新的值，请使用信号或活动。

## 运行此模式 {#run-this-pattern}

[示例应用](/docs/sample-app)中的计时工作流提供可运行的参考，将时钟读取放在 `sideEffect()` 之后：

```bash
php artisan app:elapsed
```

`App\Workflows\Elapsed\ElapsedTimeWorkflow` 在 `sideEffect()` 回调内将开始和结束时间戳记录为整数，使记录值在重放的 Avro 载荷解码后仍能保留。Waterline 运行详情会展示位于定时器触发前后的两个 `MarkerRecorded` 事件。这对标记就是时钟读取保持确定性的磁盘证据。
