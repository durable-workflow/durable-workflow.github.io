---
sidebar_position: 4
---

# 传递数据 {#passing-data}

可通过 `start()` 方法向工作流传递数据。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start('world');
```

参数会传入工作流的 `handle()` 方法。

同样，可通过 `activity()` 辅助函数向活动传递数据。

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle($name)
    {
        return activity(MyActivity::class, $name);
    }
}
```

参数会传入活动的 `handle()` 方法。

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle($name)
    {
        return "Hello, {$name}!";
    }
}
```

import PassingDataSimulator from '@site/src/components/PassingDataSimulator';

<PassingDataSimulator />

通常只应以这种方式传递少量数据。数据量较大时，应将数据写入数据库、缓存或文件系统，再将键或文件路径传给工作流和活动。活动随后可通过键或文件路径读取数据。

应用确实需要通过历史携带文档、媒体二进制数据或序列化导出等大数据时，请在命名空间启用[外部载荷存储](../features/external-payload-storage.md)。运行时将超过阈值的载荷转存至配置的对象存储，并在历史中记录可验证的引用信封，既保持重放完整性，也满足 [`payload_size_bytes` 结构限制](../constraints/structural-limits.md#payload-size)。

## 输出 {#output}

工作流完成后，可通过 `output()` 方法获取输出。

```php
$workflow->output();
=> 'Hello, world!'
```

## 模型 {#models}

传入模型的行为类似于 `SerializesModels`。

```php
use App\Models\User;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(User $user)
    {
        return activity(MyActivity::class, $user->name);
    }
}
```

向工作流或活动传入 Eloquent 模型时，只序列化其 `ModelIdentifier`。这可减小载荷，保持工作流效率和性能。

```
object(ModelIdentifier) {
    id: 42,
    class: "App\Models\User",
    relations: [],
    connection: "mysql"
}
```

工作流或活动运行时，会从数据库获取完整模型实例，包括已加载的关联。如需避免执行期间额外访问数据库，可考虑先将模型转换为数组再传入。

## 依赖注入 {#dependency-injection}

除传递数据外，还可以在工作流或活动的 `handle()` 方法上为依赖声明类型。Laravel 服务容器会自动注入这些依赖。

```php
use Illuminate\Contracts\Foundation\Application;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(Application $app)
    {
        if ($app->runningInConsole()) {
            // ...
        }
    }
}
```

依赖注入不会放宽工作流的确定性要求。工作流可以为 Laravel 应用容器或配置读取器等稳定服务声明类型，但实际执行工作的注入依赖仍须处于正确的持久边界内。将外部 I/O、数据库访问、服务调用或其他可能失败或应重试的工作放入 `activity(...)` 或 `localActivity(...)`。`sideEffect()` 仅用于需要一次性固定在历史中的可安全重放的值快照，例如读取系统时钟、生成随机值，或在决策时捕获配置值。
