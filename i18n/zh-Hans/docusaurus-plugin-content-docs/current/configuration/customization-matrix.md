---
sidebar_position: 4.5
title: 定制支持矩阵
description: Durable Workflow v2 关于模型覆盖、序列化设置、可观测性仓库替换、健康检查、导入、迁移和写入行为的固定支持矩阵。
---

# 定制支持矩阵 {#customization-matrix}

本页明确 Durable Workflow v2 支持的定制契约。需要将 v2 持久模型移至其他连接、替换模型子类、替换 PHP 运维可观测性仓库，或判断迁移期间旧序列化设置是否仍有效时，请查阅本页。

## 支持的覆盖方式 {#supported-override-matrix}

| 定制项 | 支持契约 | 说明 |
| --- | --- | --- |
| `workflows.v2.instance_model` 使用结构兼容且保留基名 `WorkflowInstance` 的子类 | 支持 | 仅需更改连接、类型转换或应用命名空间时，采用此方式。继承的关联保留包的 `workflow_instance_id` 外键契约。 |
| `workflows.v2.instance_model` 使用更换表或更改基名的子类 | 显式覆盖关联后支持 | 覆盖 `runs()`、`commands()` 和 `updates()`，使其保留 `workflow_instance_id`。包现在会在启动时验证，并拒绝会改变这些键的继承关联推断。`currentRun()` 已显式固定 `current_run_id`，无需覆盖。 |
| 其他 `workflows.v2.*_model` 覆盖（`run_model`、`task_model`、`history_event_model`、投影、调度、活动行、故障、消息、memo、搜索属性、子调用） | 支持结构兼容的子类 | 保留包的列名、主键和外键。这些关联已固定使用的键，因此结构保持兼容时，更换表的子类仍可使用继承的关联方法。 |
| 自定义表名并自定义外键列名 | 不支持 | v2 运行时和运维界面依赖包的列名与键名。更改它们会超出支持契约。 |
| 替换 `OperatorObservabilityRepository` | 支持容器绑定 | 将实现绑定至 `Workflow\V2\Contracts\OperatorObservabilityRepository`。这是 Waterline 和 `WorkflowStub::historyExport()` 的 PHP 运行时集成契约，并非稳定的跨语言 API。仓库接收包的模型对象。 |
| `serializer` | 仅支持 `avro` 和旧版收尾／导入编解码器 | 新 v2 运行始终使用 Avro 语义。`workflow-serializer-y` 和 `workflow-serializer-base64` 仅用于完成或导入仍需 PHP 原生解码的 v1 历史。v2 不支持 v1 的自定义序列化类。 |
| 健康检查和 doctor 诊断 | 支持 | `php artisan workflow:v2:doctor` 和 Waterline v2 健康／统计信息反映配置的模型类，并将过时的序列化设置标记为迁移遗留问题。 |
| 非默认连接上的包迁移 | 发布迁移后支持 | 自动加载的包迁移使用 Laravel 默认连接。如果持久模型使用其他连接，请发布迁移并显式设置迁移的 `$connection`。 |
| 核心写入运行时（`WorkflowStub::make()`、`load()`、任务创建、当前运行解析） | 通过配置的持久模型支持 | 运行时使用配置的 `instance_model`、`run_model` 和 `task_model`。写入侧表的结构须与包的列和键兼容。 |

## v2 模型键的准确列表 {#exact-v2-model-keys}

发布的 `workflows.php` 配置在 `workflows.v2` 下提供以下持久模型键：

- `instance_model`
- `run_model`
- `history_event_model`
- `task_model`
- `command_model`
- `link_model`
- `activity_execution_model`
- `activity_attempt_model`
- `timer_model`
- `failure_model`
- `run_summary_model`
- `run_wait_model`
- `run_timeline_entry_model`
- `run_timer_entry_model`
- `run_lineage_entry_model`
- `schedule_model`
- `schedule_history_event_model`

这些键应使用包模型的子类。除非本文档集中的页面另有说明，否则保留包的列名和外键。

## 实例模型覆盖规则 {#instance-model-override-rule}

目前，只有 `workflows.v2.instance_model` 在子类使推断出的外键不再是 `workflow_instance_id` 时，才需要额外处理关联。

典型的安全示例：

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

final class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'workflow';
}
```

子类基名仍为 `WorkflowInstance`，因此 Eloquent 保留相同的推断外键，继承的关联仍保持一致。

如果使用不同基名或更换表的存储模型，请显式覆盖受影响的关联：

```php
namespace App\Workflow\Storage;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Workflow\V2\Models\WorkflowCommand;
use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Models\WorkflowUpdate;
use Workflow\V2\Support\ConfiguredV2Models;

final class TenantWorkflowInstance extends BaseWorkflowInstance
{
    protected $table = 'tenant_workflow_instances';

    public function runs(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('run_model', WorkflowRun::class),
            'workflow_instance_id',
        );
    }

    public function commands(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('command_model', WorkflowCommand::class),
            'workflow_instance_id',
        )->oldest('created_at');
    }

    public function updates(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('update_model', WorkflowUpdate::class),
            'workflow_instance_id',
        )
            ->orderBy('command_sequence')
            ->oldest('accepted_at')
            ->oldest('created_at')
            ->oldest('id');
    }
}
```

缺少这些覆盖时，包现在会在启动时立即报错，避免应用意外使用 `tenant_workflow_instance_id` 或 `custom_workflow_instance_id` 等推断键。

## 序列化、导入和健康检查规则 {#serializer-import-and-health-rules}

- 新的 v2 工作保留 `serializer = 'avro'`。
- 仅在收尾或导入仍需 PHP 原生载荷解码的 v1 历史时使用旧编解码器。
- 不要将 v2 指向已移除的 v1 自定义序列化类。
- 升级或更改配置后运行 `php artisan workflow:v2:doctor`。该诊断会标记旧序列化设置和其他启动就绪问题。
- Waterline v2 健康和统计信息是同一持久模型配置的运维视图。

## 迁移和写入侧规则 {#migration-and-write-side-rules}

- 常规方式是在默认连接上执行自动加载的包迁移。
- 如果持久模型使用其他连接，请发布迁移并设置迁移的 `$connection`，确保 `php artisan migrate` 使用与配置的模型子类相同的数据库。
- 参与运行时写入路径的每个模型都应保留包的表名、主键和外键。
- 写入路径的定制并不限于只读操作：启动、加载、当前运行解析和任务执行均使用配置的持久模型。

## 相关指南 {#related-guides}

- [发布配置](./publishing-config.md)
- [数据库连接](./database-connection.md)
- [迁移指南](../migration.md)
- [监控](../monitoring.md)
