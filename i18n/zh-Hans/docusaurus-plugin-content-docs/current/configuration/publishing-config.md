---
sidebar_position: 1
---

# 发布配置 {#publishing-config}

以下命令会在 `config` 文件夹中创建 `workflows.php` 配置文件。

```bash
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="config"
```

## 工作流任务租约（v2） {#workflow-task-lease-v2}

使用正整数秒数配置嵌入式工作流任务租约：

```env
DW_V2_WORKFLOW_TASK_LEASE_SECONDS=300
```

它映射到 `config/workflows.php` 中的 `workflows.v2.workflow_task_lease_seconds`，默认值为 `300`。任务领取和续租会读取当前有效配置。设为零不会关闭租约。修改部署配置后，请更新配置缓存并重启长期运行的Worker。

Server改用 `DW_WORKFLOW_TASK_TIMEOUT`，并将该值映射到包设置。这个恢复租约与活动和工作流期限彼此独立。参阅[工作流任务租约](../features/timeouts.md#workflow-task-lease)。

## 更改工作流文件夹 {#changing-workflows-folder}

默认情况下，`make` 命令将文件写入 `app/Workflows` 文件夹。

```php
php artisan make:workflow MyWorkflow
php artisan make:activity MyActivity
```

更新 `workflows_folder` 设置即可更改此行为。

```php
'workflows_folder' => 'Workflows',
```

## 使用自定义模型（旧版 v1） {#using-custom-models-legacy-v1}

:::note 旧版

这些 `stored_workflow_*` 键用于配置 v1 `Workflow\Models\StoredWorkflow*` 类。Workflow v2 使用下文的持久模型覆盖项，如 `instance_model`、`run_model`、`task_model` 等。只有迁移期间仍运行 v1 工作流时，才保留 v1 键。

:::

在发布的 `workflows.php` 配置文件中，可将 v1 模型类更新为自己的子类。

```php
'stored_workflow_model' => App\Models\StoredWorkflow::class,

'stored_workflow_exception_model' => App\Models\StoredWorkflowException::class,

'stored_workflow_log_model' => App\Models\StoredWorkflowLog::class,

'stored_workflow_signal_model' => App\Models\StoredWorkflowSignal::class,

'stored_workflow_timer_model' => App\Models\StoredWorkflowTimer::class,
```

## 使用模型覆盖（v2） {#using-model-overrides-v2}

运行时也提供持久实例、运行、任务、历史和投影表的模型覆盖项：

```php
'v2' => [
    'instance_model' => App\Models\WorkflowInstance::class,
    'run_model' => App\Models\WorkflowRun::class,
    'task_model' => App\Models\WorkflowTask::class,
    'history_event_model' => App\Models\WorkflowHistoryEvent::class,
    'run_summary_model' => App\Models\WorkflowRunSummary::class,
    'run_wait_model' => App\Models\WorkflowRunWait::class,
    'run_timeline_entry_model' => App\Models\WorkflowTimelineEntry::class,
    'run_timer_entry_model' => App\Models\WorkflowRunTimerEntry::class,
    'run_lineage_entry_model' => App\Models\WorkflowRunLineageEntry::class,
],
```

这些覆盖不限于读取或重建投影。`WorkflowStub::make()`、`load()`、`loadSelection()`、实例预留、运行选择和工作流任务执行均使用配置的 `instance_model`、`run_model` 和 `task_model`。Waterline 详情和历史导出也通过同样配置的类读取。因此，一项应用级覆盖同时影响核心运行时路径和运维读取。

自定义子类的结构应与内置模型兼容。如果子类还更改了表名或包模型通常推断的其他 Eloquent 约定，也应在子类中覆盖受影响的关联，使 `currentRun()`、`runs()` 等查询与自定义结构保持一致。

固定的 v2 支持契约见[定制支持矩阵](./customization-matrix.md)，其中说明哪些覆盖可安全使用继承子类，哪些需要显式覆盖关联，以及序列化、仓库、健康检查、导入、迁移和写入行为如何配合。

## 载荷编解码器 {#payload-codec}

v2 的新工作流载荷使用 `avro`：

```php
'serializer' => 'avro',
```

- **`avro`**（默认值，新 v2 工作流必须使用）：Apache Avro 二进制编码。传输和存储紧凑，大载荷的编解码速度快于旧版 PHP 序列化器。

如果已发布的 v1 配置仍设置了 `serializer`，最终版 v2 会继续读取该值用于 `workflow:v2:doctor` 诊断，但新 v2 载荷仍使用 Avro。

### 旧版编解码器（仅限 v1 迁移） {#legacy-codecs-v1-migration-only}

迁移期间仍可使用两种仅限 PHP 的编解码器读取 v1 历史：

- `workflow-serializer-y`：使用字节转义编码的 PHP `SerializableClosure`（v1 默认值）。
- `workflow-serializer-base64`：使用 base64 编码的 PHP `SerializableClosure`。

将 `serializer` 设为旧版编解码器时，`php artisan workflow:v2:doctor` 会标记此设置。新 v2 工作流仍使用 Avro；仅在完成或导入需要 PHP 原生载荷解码的 v1 运行时保留旧编解码器设置。

内部 v1 导入／收尾读取器识别旧版完全限定类名，例如 `Workflow\Serializers\Y::class`。它们不是 v2 的公开编解码器别名，新 v2 运行或 SDK 无法选择它们。

## 兼容性标记 {#compatibility-markers}

运行时可为每个新运行附加兼容性标记，并让 Worker 公告其可安全执行的标记。这道运行时防护使长期运行的工作流在有计划的 Worker 构建发布期间继续由兼容构建执行。

为当前构建上的新运行设置标记：

```env
DW_V2_CURRENT_COMPATIBILITY=build-2026-04
```

发布期间可让 Worker 接受多个标记：

```env
DW_V2_SUPPORTED_COMPATIBILITIES=build-2026-04,build-2026-03
```

调整单个 Worker 心跳快照在数据库支持的集群视图中保持可见的时间：

```env
DW_V2_COMPATIBILITY_HEARTBEAT_TTL=30
```

多个应用共享同一工作流数据库时，可将集群视图限定到一个应用或部署命名空间：

```env
DW_V2_COMPATIBILITY_NAMESPACE=sample-app
```

发布的 `workflows.php` 配置将这些值映射如下：

```php
'v2' => [
    'compatibility' => [
        'current' => env('DW_V2_CURRENT_COMPATIBILITY'),
        'supported' => env('DW_V2_SUPPORTED_COMPATIBILITIES'),
        'namespace' => env('DW_V2_COMPATIBILITY_NAMESPACE'),
        'heartbeat_ttl_seconds' => (int) env('DW_V2_COMPATIBILITY_HEARTBEAT_TTL', 30),
    ],
],
```

省略 `supported` 时，Worker 默认只接受 `current` 标记。在任务级兼容性标记出现前创建的旧任务和运行摘要行，会在迁移时从所属运行的标记回填；必要时也会在运行时认领或恢复路径上回填。任何位置都确实没有标记的任务和运行，仍可由任意 Worker 认领。

重放到达新引入且尚无类型化 `VersionMarkerRecorded` 事件的分支点时，`getVersion()` 的回退逻辑优先使用运行启动时的 `workflow_definition_fingerprint`。同一兼容性标记的运行若明确从旧工作流定义启动，就能保留 `DEFAULT_VERSION` 分支。`WorkflowStarted` 历史早于指纹快照的旧运行，仍回退到启动时兼容性标记和已占用序列检查。因此，引入新版本化工作流代码的每轮部署都应更新 `DW_V2_CURRENT_COMPATIBILITY`，并在旧 Worker 批次收尾期间，将新旧标记暂时同时列入 `DW_V2_SUPPORTED_COMPATIBILITIES`。

每个队列 Worker 也会在 `Looping` 和任务处理期间记录数据库支持的兼容性心跳快照。Waterline 和详情辅助方法同时提供本地构建视图（`compatibility_supported`、`compatibility_reason`）和集群视图（`compatibility_namespace`、`compatibility_supported_in_fleet`、`compatibility_fleet_reason`、`compatibility_fleet`）。设置 `DW_V2_COMPATIBILITY_NAMESPACE` 后，数据库心跳行必须匹配该命名空间，每个数据库快照除 `worker_id`、队列范围、支持的标记和 `source = database` 外，也报告自己的 `namespace`。滚动升级期间，集群视图还会读取尚未重启以使用新快照表的 Worker 的旧缓存心跳格式。这些旧缓存行即使在配置命名空间后仍作为发布期间的回退而可见，但在旧 Worker 重启并使用命名空间快照路径之前，其 `namespace = null`。也就是说，只有所有 Worker 都重启并使用数据库心跳路径后，才能实现完整的严格命名空间隔离。重新派发逾期任务或重建缺失任务等传输层恢复，不再依赖扫描 Worker 能否执行该任务；只有最终认领步骤仍受兼容性防护约束。

已有未完成任务，但当前构建和任何活动 Worker 心跳快照都未公告其标记时，运行会显示为等待兼容 Worker，避免在该构建上错误显示 `repair_needed` 状态。

## 历史预算 {#history-budgets}

Waterline 使用运行摘要投影报告所选运行的类型化历史大小。以下阈值控制投影何时将 `continue_as_new_recommended` 设为真：

```env
DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD=10000
DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD=5242880
```

发布的 `workflows.php` 配置将这些值映射如下：

```php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD', 10000),
        'continue_as_new_size_bytes_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD', 5242880),
    ],
],
```

将任一阈值设为 `0` 可禁用对应方面的建议。该标记仅供参考，用于在重放成本增长前规划 `continueAsNew()` 边界，不改变所选运行的运行时行为。

## 更新等待策略 {#update-wait-policy}

`attemptUpdate()`、Webhook 更新路由和 Waterline 更新控件等等待完成的更新 API，只会等待有限的时间预算，随后回退为仍已接受的更新生命周期状态。默认预算配置如下：

```env
DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS=10
DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS=50
```

发布的 `workflows.php` 配置将这些值映射如下：

```php
'v2' => [
    'update_wait' => [
        'completion_timeout_seconds' => (int) env('DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS', 10),
        'poll_interval_milliseconds' => (int) env('DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS', 50),
    ],
],
```

`completion_timeout_seconds` 控制 `attemptUpdate*` 和 HTTP 完成等待尝试获取 Worker 已应用结果的时长；到期后返回已接受的生命周期状态，避免无限阻塞。`poll_interval_milliseconds` 仅调整等待期间调用方检查持久更新行的频率，不改变 Worker 执行顺序或重放行为。Waterline 运维指标在修复策略旁展示生效的 `update_wait` 值，便于运维人员无需打开配置文件即可查看实际默认值。

## 历史导出脱敏 {#history-export-redaction}

历史导出按设计包含已存储的工作流、命令、活动、更新、任务和故障数据，因为重放调试和归档交接需要持久事实。如果这些产物可能离开受保护环境，请在广泛开放导出端点或 CLI 输出前配置脱敏器。

创建实现 `Workflow\V2\Contracts\HistoryExportRedactor` 的脱敏器：

```php
namespace App\Support;

use Workflow\V2\Contracts\HistoryExportRedactor;

final class WorkflowHistoryExportRedactor implements HistoryExportRedactor
{
    public function redact(mixed $value, array $context): mixed
    {
        return [
            'redacted' => true,
            'path' => $context['path'],
        ];
    }
}
```

然后在 `config/workflows.php` 中注册：

```php
'v2' => [
    'history_export' => [
        'redactor' => App\Support\WorkflowHistoryExportRedactor::class,
        'signing_key' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY'),
        'signing_key_id' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID'),
    ],
],
```

脱敏器接收当前值，以及 `path`、`category`、`workflow_instance_id`、`workflow_run_id` 和 `workflow_type` 等上下文。导出会对工作流参数／输出载荷、历史事件载荷、命令载荷／上下文、更新载荷、任务载荷、活动载荷，以及故障消息／文件／堆栈诊断调用它。生成的包包含 `redaction.applied`、`redaction.policy` 和 `redaction.paths`，便于下游工具了解产物应用了哪种策略。

每次导出还包含脱敏后计算的 `integrity` 块。校验和使用 `canonicalization = json-recursive-ksort-v1` 和 `checksum_algorithm = sha256`；配置 `signing_key` 后，同一规范化载荷以 `signature_algorithm = hmac-sha256` 签名，可选的 `signing_key_id` 则报告为 `key_id`。签名密钥应保存在导出产物之外，下游验证器需要区分密钥时，应更新密钥 ID。
