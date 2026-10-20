---
sidebar_position: 6
---

# 工作流 ID {#workflow-id}

## 实例 ID 与运行 ID {#instance-ids-and-run-ids}

持久工作流有两个生命周期不同的标识：

- **实例 ID**（`id()`、`workflowId()`）是工作流稳定的公开句柄。首次启动时生成或由调用方提供，在工作流整个生命周期中保持不变，包括跨越 continue-as-new 链。
- **运行 ID**（`runId()`）标识该工作流的某一具体执行代。每次创建新运行时都会重新分配，包括首次启动和继续为新运行时。

实例 ID 用作可公开调用的句柄。运行 ID 指向某一具体执行代，适用于检查、调试或审计，长期使用控制平面的调用方无需追踪它。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);

$id = $workflow->id();

$workflow->start();

$runId = $workflow->runId();
```

需要工作流稳定的公开句柄时，使用实例 ID。需要检查某次具体执行时，使用运行 ID。

## 运行 ID 的生命周期 {#run-id-lifecycle}

运行 ID 是执行代标识。每一代 v2 工作流都有自己的运行 ID，同一个实例 ID 可随时间跨越多个执行代：

- 首次 `start()` 创建第一个运行及其运行 ID。
- `continueAsNew(...)` 以 `completed` / `continued` 关闭当前运行，并在同一实例 ID 下以全新运行 ID 启动新运行。参阅[继续为新运行](/docs/features/continue-as-new)。

运行 ID 只属于某一代，因此需要跨这些转换保持持久行为的调用方应通过实例 ID 解析：

- 信号、查询、更新和运维命令始终解析到实例最新的持久运行。调用方无需跨 continue-as-new 边界追踪运行 ID。
- 固定某一执行代的详情工具，例如 Waterline 运行详情、历史导出或重放调试器，接受显式运行 ID，以单独检查一次执行。

运行 ID 在工作流代码和活动中以 `runId()` 提供，在历史、投影和导出中则以 `workflow_run_id` / `run_id` 字段提供。它始终是事件或行所属执行代的运行 ID。旧历史事件记录的运行 ID 不一定等于同一实例的当前运行 ID。

## 用户自定义实例 ID {#user-defined-instance-ids}

启动工作流时可选择指定 ID。用户自定义 ID 必须是 URL 安全字符串，最多 191 个字符，只能使用字母、数字、`.`、`_`、`-` 和 `:`。

```php
$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');
```

之后引用工作流时，可使用自定义 ID 加载它。

```php
$workflow = WorkflowStub::load('order-123');
```

### 选择调用方提供的 ID {#choosing-a-caller-supplied-id}

选择能够一致标识某个业务操作的 ID。同一次启动的重试应复用该 ID；不同操作应生成新 ID。添加工作流类型前缀，必要时加入不透明的租户引用，避免共享存储的应用之间发生冲突。例如，`order:tenant-7f2:01J9Z6K6Z2EPV5G0C3R8F4M9AN` 将这些前缀与抗冲突标识组合。租户前缀只是命名约定，不是授权边界。请单独配置命名空间隔离。

ID 不会覆盖[重复启动策略](../configuration/options.md)。默认会拒绝重复启动。`ReturnExistingActive` 可返回已有活动工作流，不会启动另一个运行或替换原始参数。已完成实例的 ID 仍被保留；更改工作流类型也不会使该 ID 再次可用。

### ID 是可见元数据 {#ids-are-visible-metadata}

实例 ID 以明文出现在 Waterline、URL、CLI 输出、日志、历史导出和数据库中。载荷编解码器，包括载荷加密，均不覆盖这些标识。请使用不透明引用，避免包含邮箱地址、姓名、访问令牌或其他个人或秘密数据。敏感业务详情应放在受应用数据处理策略保护的载荷字段中。难以猜测的 ID 不能代替授权。

## 在活动和工作流内部访问 ID {#accessing-ids-inside-activities-and-workflows}

在活动内：

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(): void
    {
        $id = $this->workflowId();
        $runId = $this->runId();
    }
}
```

在工作流内，`$this->workflowId()` 返回实例 ID，`$this->runId()` 返回当前正在执行的所选运行 ID。
