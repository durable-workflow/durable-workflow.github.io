---
sidebar_position: 2
title: 工作流约束
description: 保持重放的确定性，并在应用启动时发现不安全的调用。
---

# 工作流约束 {#workflow-constraints}

工作流类不能依赖会随时间变化的外部状态或服务，包括当前日期和时间、当前用户、外部网络资源，以及其他可能变化的状态来源。

在工作流类中避免以下操作：

- 不要用 `Carbon::now()` 读取当前时间，因为每次调用的结果都可能不同。使用 `Workflow\V2\Workflow::now()` 或 `Workflow\V2\now()`，获取可安全重放的工作流时间。
- 不要用 `Auth::user()` 获取当前用户，因为结果取决于当前登录者。在启动工作流时把用户作为输入传入。
- 不要直接请求外部网络资源，因为其响应、速度和可用性可能变化。在启动时传入所需数据，或通过活动获取数据。
- 不要直接使用随机数生成器或其他随机来源，除非将结果记录在 `sideEffect` 中。也可以在启动工作流时把所需随机值作为输入传入。

## 从 workflow 代码记录日志 {#workflow-logging}

引擎每次唤醒工作流时都会从历史中重放它，因此工作流代码中的普通日志调用会在每个已完成的步骤中再次写入。一个有 50 个步骤的工作流会把第一行日志写 50 次。请改用感知重放的日志记录器。它只在代码首次运行时写入。嵌入式工作流、PHP SDK 和 Rust 的日志记录器还会在每一行中加入运行的标识：

- 嵌入式工作流（Workflow 2.42.0 或更高版本）：`$this->logger()` 返回一个 PSR-3 日志记录器，它通过 Laravel 日志记录器或你传入的通道写入，例如 `$this->logger('workflow')`。每一行都包含 `workflow_instance_id`、`workflow_run_id`、`workflow_type` 和 `namespace`。`$this->replayState()` 返回 `Workflow\V2\Enums\WorkflowReplayState`（`Replaying`、`Executing` 或 `Unavailable`），`$this->isReplaying()` 是其布尔形式。
- PHP SDK：`$context->logger()` 通过 `Worker` 的 PSR-3 日志记录器写入。参见 [PHP SDK 指南](../polyglot/php.md#workflow-logging)。
- Rust SDK：`ctx.logger()`。参见 [Rust SDK 4.17 工作流日志记录器](../polyglot/rust.md#workflow-logging)。
- Python SDK：`ctx.logger`，它在重放期间保持静默，但不会加入运行的标识。

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

final class ShipOrderWorkflow extends Workflow
{
    public function handle(string $orderId): string
    {
        $this->logger()->info('Shipping started', ['order_id' => $orderId]);
        $label = activity(PrintLabelActivity::class, $orderId);
        $this->logger()->info('Label printed', ['label' => $label]);

        return $label;
    }
}
```

查询和更新验证器从不写日志，因为它们始终是重放。

在嵌入式工作流中，日志行会在工作流任务的数据库事务提交之后写入，因此回滚的任务不会写入任何内容。在未记录步骤的情况下等待某个挂起的 `select()` 句柄的代码只记录一次，由越过该等待的任务写入。实时运行的更新处理程序中的日志行会在更新被应用时写入。在 PHP SDK 中，日志行会在 Server 接受工作流任务之后写入；参见 [PHP SDK 指南](../polyglot/php.md#workflow-logging)。

日志是对进程的观察。请让持久的工作流命令独立于重放状态的观察和日志投递。感知重放的日志记录器不是 exactly-once outbox：如果嵌入式或 PHP SDK 的 Worker 在提交或接受与写入之间终止，这些日志行会丢失；而 Rust 日志记录器在崩溃或重试后可能会重复来自未提交尝试的消息。请让宿主处理程序有界且非阻塞，以免日志阻塞 Worker。请把持久的业务效果放在合适的活动或已记录的工作流操作中。

## 启动时检查 {#boot-time-guardrails}

注册在 `workflows.v2.types.workflows` 下的工作流类，会在应用启动时接受扫描，检测 `Carbon::now()`、`Auth::user()`、`DB::`、`Http::`、`random_int()` 等明显不安全的重放调用。`workflows.v2.guardrails.boot` 决定如何处理结果：

| 模式 | 行为 |
| --- | --- |
| `warn`（默认） | 为每个发现记录警告，不阻止应用启动。 |
| `silent` | 完全跳过启动时扫描。 |
| `throw` | 发现第一个问题时抛出 `LogicException`，适用于 CI。 |

```php
// config/workflows.php
'v2' => [
    'guardrails' => [
        'boot' => env('DW_V2_GUARDRAILS_BOOT', 'warn'),
    ],
],
```

在 CI 中设置 `DW_V2_GUARDRAILS_BOOT=throw`，拒绝新增的不安全重放调用。生产环境保留 `warn`，避免尚未发现的问题阻止部署。

### 扫描检查的内容 {#scan-coverage}

扫描是词法层面的。它只读取工作流类、其父类和 trait，并标记：

- 读取当前时间：`time()`、`date()`、`microtime()`、`hrtime()`、`today()`、`Carbon::now()` 之类的静态调用，以及不带参数或带 `'now'`、`'+1 day'` 等相对时间的 `new DateTime()`、`new DateTimeImmutable()`、`new Carbon()` 或 `new CarbonImmutable()`。固定日期不会被标记。
- 随机性：`random_int()`、`random_bytes()`、`rand()`、`mt_rand()`、`uniqid()`、`shuffle()`、`array_rand()`、`str_shuffle()` 以及 `Str::uuid()` 之类的辅助方法。
- 外部状态：`DB::`、`Cache::`、`Http::`、`Auth::`、`auth()` 和 `request()`。

它看不到通过辅助类或服务类进行的调用、依赖进程状态的值（例如静态属性或无序数据的顺序），也看不到运行时才决定的内容。扫描结果干净并不能证明确定性。请对已记录的历史运行[重放验证](../testing.md)来发现其余问题。

在初始发布范围内，启动时扫描是唯一可以阻止工作流运行的确定性检查。运行时不会在获取工作流任务时再次执行确定性诊断。这是 2.0 的明确选择：启动扫描在部署前检查本地注册的 PHP 工作流，Waterline 则展示长期运行任务的定义指纹变化，避免跨构建获取任务成为新的部署故障来源。

对于早于指纹记录的运行，也采用保守策略。如果运行进入新的 `getVersion()` 分支，但其 `WorkflowStarted` 历史早于指纹快照，运行时将它保留在 `WorkflowStub::DEFAULT_VERSION`，不假定当前定义可以安全重放。参阅[版本管理](../features/versioning.md)。

### 注释和格式修改 {#comment-only-edits}

默认情况下，定义指纹覆盖原始源代码行。因此，只修改工作流类、其 trait 或父工作流类中的注释、docblock 或空白，或只修改 `await()` 条件 closure 中的这些内容，对进行中的运行来说都算作定义修改：历史中缺少的 `getVersion()` 或 `patched()` 标记会取 `WorkflowStub::DEFAULT_VERSION`，修改过的条件 closure 会导致重放失败。

从 2.34 起，worker 可以改为记录去掉注释和空白后的 PHP 代码 token 的指纹（前缀 `sha256-tokens:`），这类修改不会改变它。请在所有 worker 都升级到 2.34 或更高版本后，通过 `DW_DEFINITION_FINGERPRINT_VERSION=v2` 启用，因为较旧的 worker 会把这样的运行视为已修改。每个运行都保留它记录的指纹版本：启用前启动的运行仍对注释修改敏感，切换回 `v1` 是安全的。
