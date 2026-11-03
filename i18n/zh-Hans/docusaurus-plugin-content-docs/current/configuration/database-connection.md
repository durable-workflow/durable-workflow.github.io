---
sidebar_position: 4
---

# 数据库连接 {#database-connection}

Workflow 默认使用 Laravel 应用的默认数据库连接，除非你为持久存储选择了其他连接。

要将工作流存储放到 `config/database.php` 中定义的连接上，请在环境变量中设置连接名：

```dotenv
DW_STORAGE_CONNECTION=workflows
```

Workflow 的模型、事务、行锁和提交后回调都使用此连接。所有工作流持久化表都应使用同一个 Laravel 连接。队列传输通过 Laravel 的队列配置单独设置。

你也可以按下文所示，通过自定义模型类选择连接。配置的 V2 `run_model` 为未显式指定模型连接的 V2 元数据提供存储连接。显式指定的模型连接应与它保持一致。`DW_STORAGE_CONNECTION` 优先于模型的连接属性。

完整的 v2 覆盖契约见[定制支持矩阵](./customization-matrix.md)，包括更换表的子类、序列化规则、仓库替换、健康诊断和迁移要求。

## 自定义模型连接 {#custom-model-connections}

1. 在应用模型目录中创建类，继承 v2 模型基类
2. 在每个类中设置所需的 `$connection`
3. 发布工作流配置文件
4. 更新 `workflows.v2` 模型绑定，指向自定义类

## 扩展 v2 工作流模型 {#extending-v2-workflow-models}

在 `app\Models\V2\WorkflowInstance.php` 中添加：

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'mysql';
}
```

对每个需要更换连接的 v2 持久模型重复此模式，至少包括：

- `Workflow\V2\Models\WorkflowRun`
- `Workflow\V2\Models\WorkflowHistoryEvent`
- `Workflow\V2\Models\WorkflowTask`
- `Workflow\V2\Models\WorkflowCommand`
- `Workflow\V2\Models\WorkflowLink`
- `Workflow\V2\Models\ActivityExecution`
- `Workflow\V2\Models\ActivityAttempt`
- `Workflow\V2\Models\WorkflowTimer`
- `Workflow\V2\Models\WorkflowFailure`
- `Workflow\V2\Models\WorkflowRunSummary`
- `Workflow\V2\Models\WorkflowSchedule`
- `Workflow\V2\Models\WorkflowScheduleHistoryEvent`

每个子类都应声明 `protected $connection = 'mysql';`，或使用你在 `config/database.php` 中定义的连接名。

## 注册自定义模型 {#registering-custom-models}

发布工作流配置文件，并更新 `workflows.v2.*_model` 绑定，指向自定义类：

```php
// config/workflows.php

'v2' => [
    'instance_model' => App\Models\V2\WorkflowInstance::class,
    'run_model' => App\Models\V2\WorkflowRun::class,
    'history_event_model' => App\Models\V2\WorkflowHistoryEvent::class,
    'task_model' => App\Models\V2\WorkflowTask::class,
    'command_model' => App\Models\V2\WorkflowCommand::class,
    // ...
],
```

包通过 `Workflow\V2\Support\ConfiguredV2Models` 解析模型，因此访问 v2 模型的所有关联或查询都会透明地使用配置的连接。

如果子类的更改超出结构兼容范围，改变了自定义 `instance_model` 的推断外键，包现在会在启动时验证是否已显式覆盖 `runs()`、`commands()` 和 `updates()` 关联。

## 迁移 {#migrations}

Workflow 迁移会自动从包中加载，并遵循 `DW_STORAGE_CONNECTION`。应用迁移仍使用各自配置的连接。

如果你使用自定义模型连接而没有设置 `DW_STORAGE_CONNECTION`，请为相应的已发布工作流迁移指定相同的 `$connection`。只运行这些工作流迁移时，也可以通过 Laravel 的 `--database` 选项选择目标。应用迁移应继续使用应用连接。

## 事务边界 {#transaction-boundaries}

当应用数据和工作流存储使用同一个 Laravel 连接时，在事务内启动的工作流会加入该事务。回滚会撤销事务内的工作流写入。引擎在最外层存储事务提交后，才把工作流任务发布到队列并发送生命周期事件。回滚会丢弃这些回调。

例如，设置 `DW_STORAGE_CONNECTION=workflows` 后：

```php
use App\Workflows\OrderWorkflow;
use Illuminate\Support\Facades\DB;
use Workflow\V2\WorkflowStub;

DB::connection('workflows')->transaction(function () {
    WorkflowStub::make(OrderWorkflow::class, 'order-123')->start('order-123');
});
```

如果应用模型的更改必须与这次启动原子提交，这些模型也必须使用 `workflows` 连接。

不同 Laravel 连接上的事务会独立提交，即使连接名指向同一个物理数据库也是如此。应用默认连接上的事务无法回滚已在其他存储连接上提交的工作流。请把需要原子性的更改放到同一个连接上，并纳入该连接的事务。

提交后发布保护的是工作流存储边界。队列使用的独立数据库或消息代理具有自己的事务和投递行为。
