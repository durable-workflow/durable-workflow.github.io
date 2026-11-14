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

worker 在激活和冷替换后重建已提交的 workflow 历史，因此普通应用日志可能重复先前的消息。若对应 binding 提供了已文档化的重放感知 logger，请使用该接口。Rust 服务模式提供 [Rust SDK 4.17 workflow logger](../polyglot/rust.md#workflow-logging)；其他 binding 保留各自文档中的契约。

日志是进程观测。持久 workflow 命令应独立于重放状态观测和日志投递。即使使用重放感知 logger，未提交尝试的消息也可能在崩溃或 retry 后重复；它不是 exactly-once outbox。主机 handler 应有界且非阻塞，避免日志阻塞 worker。应通过合适的 activity 或有记录的 workflow 操作执行持久业务效果。

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
