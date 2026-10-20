---
sidebar_position: 4
---

# 数据库连接 {#database-connection}

以下步骤用于自定义工作流 v2 持久模型的数据库连接。*只有*在需要使用不同于 Laravel 应用默认连接的数据库连接时，才需要执行这些步骤。

完整的 v2 覆盖契约见[定制支持矩阵](./customization-matrix.md)，包括更换表的子类、序列化规则、仓库替换、健康诊断和迁移要求。

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

工作流迁移从包中自动加载（`WorkflowServiceProvider::loadMigrationsFrom`），并在默认数据库连接上运行。v2 表使用非默认连接时，请通过 `php artisan vendor:publish --tag=migrations` 发布迁移，并在每个发布的迁移类中设置 `protected $connection = 'mysql';`，使 `php artisan migrate` 在正确的数据库上执行。
