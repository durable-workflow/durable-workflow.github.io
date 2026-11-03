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

V2 载荷使用可移植的值格式，因此 Eloquent 模型不能作为工作流或活动的参数或结果。请传递模型的键，并在使用该模型的活动中加载模型。

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(int $userId)
    {
        return activity(MyActivity::class, $userId);
    }
}
```

```php
use App\Models\User;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(int $userId)
    {
        $user = User::findOrFail($userId);

        return "Hello, {$user->name}!";
    }
}
```

请在活动中加载模型，而不是在工作流代码中加载。工作流代码会在重放时重新执行，之后的重放中数据库查询可能返回不同的行。

向 `start()` 传递模型会抛出 `InvalidArgumentException`。向 `activity()` 传递模型会使工作流运行失败。两种错误都会指出模型类：

```
unsupported_value_type: Eloquent model App\Models\User cannot cross a V2 payload boundary. Pass its key and load the model inside the activity.
```

同样的规则适用于 Eloquent 集合。请改为传递键数组。如果活动只需要少数几个属性，请以数组形式传递这些属性。

在 v1 中，工作流和活动通过 `SerializesModels` 接收模型：它保存模型标识符，并在任务运行时重新加载模型。V2 不会这样做。

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
