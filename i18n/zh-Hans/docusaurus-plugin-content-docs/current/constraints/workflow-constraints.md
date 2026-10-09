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

在初始发布范围内，启动时扫描是唯一可以阻止工作流运行的确定性检查。运行时不会在获取工作流任务时再次执行确定性诊断。这是 2.0 的明确选择：启动扫描在部署前检查本地注册的 PHP 工作流，Waterline 则展示长期运行任务的定义指纹变化，避免跨构建获取任务成为新的部署故障来源。

对于早于指纹记录的运行，也采用保守策略。如果运行进入新的 `getVersion()` 分支，但其 `WorkflowStarted` 历史早于指纹快照，运行时将它保留在 `WorkflowStub::DEFAULT_VERSION`，不假定当前定义可以安全重放。参阅[版本管理](../features/versioning.md)。
