---
sidebar_position: 9
---

# 子工作流 {#child-workflows}

当前 `Workflow\V2` 通过顺序编写的 `child()` 调用，以及 `all([...])` 扇入屏障支持持久子工作流。屏障可以仅包含子工作流、混合活动，或嵌套在更大的 `all([...])` 组中。父工作流因此可持久地调度一个或多个子工作流并等待其结果，无需让父进程持续存活。

子运行仍是普通工作流运行，有自己的工作流实例 ID 和运行 ID。它之所以成为子工作流，是因为存在回到父运行的持久链接，以及由父工作流为此次调用发出的稳定 `child_call_id`。

## 命名空间边界 {#namespace-boundary}

子工作流及通过其句柄发送的信号仍属于父工作流的命名空间。选择不同的工作流类型、语言或队列不会改变该命名空间。要持久调用同一集群中其他命名空间发布的操作，请使用[服务操作](./service-operations.md)。

```php
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(string $name): array
    {
        $child = child(ChildWorkflow::class, $name);

        return [
            'parent_workflow_id' => $this->workflowId(),
            'parent_run_id' => $this->runId(),
            'child' => $child,
        ];
    }
}
```

## 当前行为 {#current-behavior}

- 通过 `use function Workflow\V2\child;` 导入辅助函数，并调用 `child(ChildWorkflow::class, ...)`。调用暂停父工作流，创建持久子运行，并在子工作流关闭时返回其结果。
- 子工作流失败会在父工作流中抛出异常；成功则返回输出。取消和终止以不同异常类型呈现。
- `$this->child()` 返回最近的子工作流句柄；`$this->children()` 按工作流步骤顺序返回所有子句柄。句柄提供 `id()`、`runId()`、`callId()`，以及 `signal()`、`signalWithArguments()` 等信号辅助方法。
- 子工作流使用 `continueAsNew()` 时，父工作流透明地跟随最新运行：`runId()` 推进，`id()` 保持稳定。
- `all()` 可将 `fn () => child(...)` 和 `fn () => activity(...)` 闭包组合为一个屏障。首个子工作流失败会唤醒父工作流；成功路径则等待每个分支关闭后再恢复。

## 并行子工作流屏障 {#parallel-child-barrier}

希望父工作流的一个步骤同时等待多个子工作流时，通过 `use function Workflow\V2\all;` 和 `use function Workflow\V2\child;` 导入辅助函数。

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $children = all([
            fn () => child(FirstChildWorkflow::class),
            fn () => child(SecondChildWorkflow::class),
        ]);

        return $children;
    }
}
```

所有并行成员都是子工作流时，这种纯子工作流形式仍很实用：

- 将整个子工作流组作为一个父步骤等待
- 返回结果保留原始数组顺序
- 按相同的最早关闭时间、最低索引优先规则，选择非成功子工作流的关闭结果，并将其以异常抛回父工作流主体

需要在同一扇入步骤中组合子工作流和活动时，使用一个混合 `all([...])` 屏障。子工作流等待和活动等待共享 `parallel_group_id`，Waterline 将共享屏障标记为 `parallel_group_kind = mixed`。混合或纯子工作流子组嵌套在更大的 `all([...])` 内时，最内层组仍决定 `parallel_group_id`，而 `parallel_group_path` 保留完整的从外到内路径。

## 标识契约 {#identity-contract}

- `child()->id()` 和 Waterline `target_name` 指向子工作流实例 ID，在该实例的整个运行链中保持稳定。
- `child_call_id` 指向父工作流发出的调用本身，即使子工作流之后使用 `continueAsNew()` 也保持稳定。
- `resume_source_id`、`child_workflow_run_id` 和所选运行路由指向该调用链中的某次具体子运行。

## 子工作流句柄 {#child-handles}

父工作流持久地到达子工作流步骤后，可通过 `ChildWorkflowHandle` 检查此次调用。

```php
use Workflow\UpdateMethod;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle()
    {
        return child(ApprovalWorkflow::class);
    }

    #[UpdateMethod('approve-child')]
    public function approveChild(string $approvedBy): void
    {
        $this->child()?->signal('approved-by', $approvedBy);
    }
}
```

- `$this->child()` 返回最近可见的子句柄，或 `null`。
- `$this->children()` 按工作流步骤顺序返回所有可见句柄。
- 在 `all([fn () => child(...)])` 屏障中，这些句柄与屏障内子调用的步骤顺序相同，`$this->child()` 返回最后一个可见句柄。
- 句柄的 `runId()` 跟随该子调用链中父工作流最近记录的 `ChildRunStarted`。因此，父工作流等待使用 `continueAsNew()` 的子工作流时，仍可看到最新子运行 ID，同时保留原始 `callId()`。

## 句柄可用性 {#handle-availability}

子句柄由历史支持，不是推测结果：

- 父工作流尚未持久地到达子步骤前，`$this->child()` 返回 `null`，`$this->children()` 返回空列表。
- 父工作流为该步骤记录子调度或子启动历史后，句柄才对查询、更新和后续工作流重放可见。
- 查询重放不会从已记录更新中派发子信号，只恢复已提交历史所表达的内存状态。

## Waterline 可见性 {#waterline-visibility}

父工作流等待子工作流时，Waterline 将其展示为子工作流等待，而非独立任务类型。这意味着：

- 父运行摘要报告 `wait_kind = child` 和 `liveness_state = waiting_for_child`
- `waits` 包含 `kind = child`、稳定的 `child_call_id`、`target_name` 中的子工作流实例 ID，以及 `resume_source_id` 中的子运行 ID
- 同时存在多个未完成子等待时，详情还提供 `open_wait_count`
- 同一个纯子工作流或混合 `all([...])` 屏障创建的子等待共享 `parallel_group_id`，并提供 `parallel_group_kind`、`parallel_group_base_sequence`、`parallel_group_size` 和 `parallel_group_index`
- 嵌套子等待还提供 `parallel_group_path`，按最外层到最内层屏障排序
- `timeline` 包含 `ChildWorkflowScheduled`、`ChildRunStarted`、`ChildRunCompleted` 和 `ChildRunFailed` 等类型化子事件，使用同一个稳定 `child_call_id`
- 未完成子等待和谱系现在优先使用父工作流的类型化 `ChildWorkflowScheduled` / `ChildRunStarted` 历史，每个稳定 `child_call_id` 仅保留一个逻辑子条目，并跟随父工作流最近记录的子运行，即使复制的 `workflow_links` 行消失，或子实例的可变 `current_run_id` 在历史提交后偏移也如此
- 父工作流记录类型化子解决事件后，所选运行详情会继续根据父历史将该子等待视为已解决，即使可变子运行行后来发生偏移；子终态历史或旧链接数据可补充谱系和诊断，但不能替代重放所需而缺失的父级类型化子步骤历史
- 类型化子解决事件存在后，所选运行谱系和历史导出也从父历史保留子工作流类型、类、运行序号、状态分类和关闭原因，不会重新读取可变子运行行以获取这些已解决子字段
- 若存在终态子行或链接，但父工作流没有该子步骤的类型化 `ChildWorkflowScheduled`、`ChildRunStarted`、`ChildRunCompleted`、`ChildRunFailed`、`ChildRunCancelled` 或 `ChildRunTerminated` 历史，Worker 和查询重放以 `history_shape_mismatch` 阻塞，并记录事件 `no typed history`；Waterline 将所选子等待标记为 `status = unsupported`，提供 `history_authority = unsupported_terminal_without_history` 和 `history_unsupported_reason = terminal_child_link_without_typed_parent_history`，并在可用时从阻塞任务或谱系回退数据展示子标识
- 子解决事件记录后，若父恢复工作流任务行丢失，所选运行详情仍显示 `repair_needed`，提供带 `workflow_wait_kind = child`、`child_call_id` 和 `child_workflow_run_id` 的合成缺失工作流任务；手动 `repair()`、`workflow:v2:repair-pass` 或 Worker 循环修复会根据类型化父历史重建同一个子解决任务
- 谱系数组在 continue-as-new 链接旁展示持久父子关系，子工作流条目也携带相同 `child_call_id`

## 父级关闭策略 {#parent-close-policy}

父工作流关闭时，无论是完成、失败、超时、取消还是终止，每个未完成子工作流都按其**父级关闭策略**处理。策略按子调用设置，控制父运行退出时该子工作流的行为。

| 策略 | 值 | 行为 |
|---|---|---|
| 放弃管理 | `abandon` | 子工作流继续独立运行。此为默认值。 |
| 请求协作取消 | `request_cancellation` | 子工作流收到协作清理请求，保留父级原始取消谱系和截止时间。 |
| 请求取消 | `request_cancel` | 父级关闭时向子工作流发送取消命令。 |
| 终止 | `terminate` | 父级关闭时向子工作流发送终止命令。 |

### 默认策略 {#default-policy}

未传入 `ChildWorkflowOptions` 的 `child()` 调用始终使用 `ParentClosePolicy::Abandon`。源码兼容辅助函数 `Workflow\V2\child()`、`Workflow\V2\Workflow::child()` 和 `Workflow\V2\Workflow::executeChildWorkflow()`，在第一个参数不是 `ChildWorkflowOptions` 时均构造默认选项，将 `parentClosePolicy` 设置为 `ParentClosePolicy::Abandon`。`all([...])` 屏障内省略选项参数的每个 `child()` 闭包也使用该默认值。传入显式 `ChildWorkflowOptions` 可覆盖默认值，如下所示。

### 设置策略 {#setting-the-policy}

将 `ChildWorkflowOptions` 作为第一个参数传给 `child()`：

```php
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $options = new ChildWorkflowOptions(
            parentClosePolicy: ParentClosePolicy::RequestCancel,
        );

        return child(ChildWorkflow::class, $options, 'argument1');
    }
}
```

同一模式也适用于 `all()` 内并行屏障的闭包：

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;

$cancelOptions = new ChildWorkflowOptions(
    parentClosePolicy: ParentClosePolicy::RequestCancel,
);

$results = all([
    fn () => child(FirstChild::class, $cancelOptions),
    fn () => child(SecondChild::class, $cancelOptions, 'arg'),
]);
```

### 工作原理 {#how-it-works}

- 策略记录在 `workflow_links` 行（`parent_close_policy`）和 `ChildWorkflowScheduled` 历史事件载荷中。
- 父运行因任意原因关闭时，引擎查询策略不是 abandon 的未完成子链接，并向每个未完成子工作流发送相应命令：请求协作取消、取消或终止。
- 执行策略时子工作流若已关闭，则不执行任何操作，静默跳过命令。
- 策略以尽力而为方式执行：子命令被拒绝（例如子工作流已终态）不影响父级关闭。执行成功时在父运行记录 `ParentClosePolicyApplied` 历史事件；失败时改为记录 `ParentClosePolicyFailed`，使运维人员能区分成功执行与静默失败。
- continue-as-new **不会**触发父级关闭策略，因为工作流实例仍在新运行中保持活动。

### 父级结果矩阵 {#parent-disposition-matrix}

父级关闭策略在每种父级终态结果上触发，对仍存活或已交接至继续运行的运行不生效。凡是将父级标记为终态的结果，引擎行为都相同：对策略不是 abandon 且仍未关闭的子链接应用策略。

| 父级结果 | 执行策略？ | 说明 |
|---|---|---|
| 已完成 | 是 | 记录 `WorkflowCompleted` 后触发。顺序 `child()` 调用始终等待子工作流，因此自然完成时通常没有未完成子工作流，但仍调用执行器作为安全检查。 |
| 失败 | 是 | 任意终态工作流任务故障记录 `WorkflowFailed` 后触发。 |
| 超时 | 是 | 运行超时或执行超时关闭记录 `WorkflowTimedOut` 后触发。 |
| 已取消 | 是 | 已接受的 `CancelRequested` 命令关闭父运行后触发。 |
| 已终止 | 是 | 已接受的 `TerminateRequested` 命令关闭父运行后触发。 |
| 继续为新运行 | 否 | 工作流实例在新运行中保持活动，现有子链接改为指向新运行，并保留原始策略。 |
| 重置 | 目前不适用 | v2 运行时未提供独立重置命令或重置终态结果。未来关闭或替换父运行的重置或修复操作，必须明确子所有权是否转移；旧运行若成为终态，必须在停止持有未完成子工作流前应用父级关闭策略。 |

### 各策略的使用场景 {#when-to-use-each-policy}

**放弃管理（Abandon）**是默认策略，适用于子工作流代表独立工作，无论父级结果如何都应完成的情况，例如通知工作流或必须完成的清理任务。

**请求协作取消（Request Cancellation）**使用 `ParentClosePolicy::RequestCancellation` 进行协作清理。它保留已有父级取消请求的根标识和不可变截止时间。如果父级关闭时没有此请求，策略会从父级记录的关闭时间起设置一个共享的 600 秒清理预算。重复执行不会延长时间。服务模式 Worker 能力和清理契约见[协作取消](/docs/polyglot/cancellation)。

**请求取消（Request Cancel）**在父级关闭时应用子工作流的终态 `cancel()` 命令。尽管策略名称带有“请求”，它不会投递独立的协作 `requestCancellation()` 请求。该策略关闭子运行后，子工作流无法再执行工作流代码清理或补偿。请在关闭父级前完成所需补偿，或使用 **Abandon** 执行独立清理工作。

**终止（Terminate）**适用于子工作流必须立即停止的情况。子工作流纯粹辅助父级，父级关闭后没有独立价值时，使用此策略。

### Waterline 可见性 {#waterline-visibility-1}

Waterline 在以下位置展示 `parent_close_policy`：

- 父运行谱系视图中的子链接条目
- `ChildWorkflowScheduled` 时间线条目载荷
- 策略执行时子工作流的 `CancelRequested` 或 `TerminateRequested` 历史事件，原因中会说明父级关闭

## 当前限制 {#current-limitations}

当前接口不包含：

- 超出目前 `all([fn () => child(...)])`、`all([fn () => activity(...)])` 和混合 `all([fn () => child(...), fn () => activity(...)])` 屏障的内置有界并发辅助功能

也就是说，已到达的子步骤支持持久子句柄，但尚未提供超出当前 `child(...)` 和 `all([...])` 接口的更高级启动句柄或有界并发 API。

## 运行此模式 {#run-this-pattern}

[示例应用](/docs/sample-app)中的微服务协调工作流，是跨应用边界进行父子编排的可运行参考：

```bash
php artisan app:microservice
```

`App\Workflows\Microservice\MicroserviceWorkflow` 在主 Laravel 应用中运行父工作流，并将子工作派发至附带的微服务 Worker。运行进行期间打开 Waterline，可在父运行下看到子链接，谱系视图中的关闭策略与本页说明一致。
