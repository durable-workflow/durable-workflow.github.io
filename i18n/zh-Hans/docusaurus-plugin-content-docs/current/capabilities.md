---
sidebar_position: 2
title: 2.0 能力索引
description: Durable Workflow 2.0 的服务模式 SDK、嵌入式运行时、协议和能力索引。
tags:
  - capabilities
  - compatibility
  - polyglot
keywords:
  - Durable Workflow 2.0 能力
  - PHP Python Rust SDK
  - 工作流引擎功能矩阵
  - 确切的功能最低版本
---

# Durable Workflow 2.0 能力索引 {#durable-workflow-20-capability-index}

本页是 Durable Workflow 2.0 稳定发布系列的能力索引。

## 受支持的可安装渠道 {#supported-installable-channel}

产物的确切标识由软件包注册表和发布元数据规定，本能力摘要不另行维护。

| 接口或组件 | 受支持渠道 | 在本索引中的角色 |
| --- | --- | --- |
| CLI | 2.0 稳定版 | 机器可读的运维和诊断客户端。 |
| PHP SDK | 2.0 稳定版 | 官方服务模式 `durable-workflow/sdk` 客户端及远程工作流和活动 Worker，面向 Cloud 命名空间运行时或自托管 Server。 |
| 嵌入式 Laravel 引擎 | 2.0 稳定版 | 独立的应用内 `durable-workflow/workflow` 部署模式，具有自己的编写运行时、持久化引擎、队列和重放。 |
| Python SDK | 2.0 稳定版 | 官方服务模式确定性工作流和活动 SDK，以及面向 Cloud 命名空间运行时或自托管 Server 的运维和控制平面客户端。要求 Python 3.10 或更新版本。 |
| Rust SDK | 2.0 稳定版 | 官方服务模式确定性工作流和活动 SDK、Worker 服务及控制平面客户端，面向 Cloud 命名空间运行时或自托管 Server。要求 Rust 1.86 或更新版本。 |
| Server | 2.0 稳定版 | 使用 PHP 实现、与语言无关的自托管运行时，提供 v2 控制平面和 Worker 协议。 |
| Waterline | 2.0 稳定版 | Cloud 包含 Managed Waterline；自托管运维人员单独部署服务镜像，连接 Server 命名空间；嵌入式 Laravel 安装 Composer 包，在进程内读取应用管理的状态。 |

PHP、Python 和 Rust 是三种官方服务模式 SDK 语言。只要运行时发现结果报告已发布能力，每个 SDK 都可以连接已配置的 Durable Workflow Cloud 命名空间运行时或自托管 Server。它们共享稳定的字符串类型名、同一持久命令和历史模型、控制平面版本 `2`、Worker 协议主版本 `1`，以及公开负载封装。Rust 是工作流 SDK：它运行确定性工作流代码、活动和 Worker 服务，不仅提供原始协议调用。Python 同时提供工作流编写，以及命名空间、计划、Worker、队列、历史、修复等运维客户端接口。

嵌入式 Laravel 仍是独立的应用内 PHP 部署模式；PHP 服务模式客户端或 Worker 不需要使用它。框架无关的 PHP SDK 与嵌入式 Laravel 引擎分别进行版本管理。

先使用[部署模式](/docs/polyglot/deployment-modes/)选择责任边界，再阅读 [Cloud 托管运行时](/docs/polyglot/cloud-control-plane/)或[自托管 Server](/docs/polyglot/server/)。以下能力证据仅适用于所选运行时声明支持相应契约的情况。

PHP SDK 2.3.2、Python SDK 2.5.7 和 Rust SDK 3.5.0 默认使用 Worker 协议 `1.20`。默认 Worker 要求 Server 在主版本 `1` 内声明支持 `1.20` 或更新版本。每个 SDK 也支持显式选择 `1.19`，以连接较旧的兼容 Server。协作式取消要求 `1.20`，且必须显式启用该能力。兼容性由运行时发现结果和所选 SDK 的已发布元数据决定。参见[版本兼容性](/docs/compatibility/)和 [Worker 协议](/docs/polyglot/worker-protocol/)。

## 能力与 SDK 最低版本 {#capability-and-sdk-floors}

“服务模式”表示 Cloud 或自托管 Server 管理远程运行时。“嵌入式”表示 Laravel 应用在进程内管理运行时。SDK 列有意记录差异；某 SDK 未列出或能力受限，不表示它具有完整的一致能力。

| 能力 | 当前 2.0 契约与官方最低要求 | 明确的 2.0 证据 |
| --- | --- | --- |
| 工作流 | PHP、Python 和 Rust 远程 Worker 可编写确定性工作流；嵌入式 Laravel 编写使用 Workflow 包。 | [工作流编写](/docs/defining-workflows/workflows/)、[PHP SDK](/docs/polyglot/php/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/) |
| 活动与服务 | 嵌入式引擎和三个服务模式 SDK 都支持编写活动。Rust 工作流和活动在官方 Worker 服务中运行；Python 和 PHP 也提供官方控制与服务客户端。 | [活动](/docs/defining-workflows/activities/)、[PHP SDK](/docs/polyglot/php/)、[活动执行](/docs/features/activity-execution-model/)、[外部执行](/docs/polyglot/external-execution/) |
| 信号 | PHP、Python 和 Rust 工作流接口在当前最低版本中支持持久异步变更。 | [信号](/docs/features/signals/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/) |
| 查询 | 支持只读重放查询。PHP、Python 和 Rust 提供查询处理器与客户端；Rust 重放查询任务要求 Worker 协议 `1.8` 或更新版本。 | [查询](/docs/features/queries/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/) |
| 更新 | PHP、Python 和 Rust 提供客户端及 Worker 处理器的更新接口。当 Server 发现结果声明支持确切的接受前契约时，Python 声明的验证器执行同步接受前验证：批准后才接受，拒绝、Worker 丢失、超时和被隔离的完成均明确失败。PHP 和 Rust 不提供验证器编写接口，也不声明验证器。 | [更新](/docs/features/updates/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/#workflow-updates) |
| 定时器 | PHP、Python 和 Rust 支持由服务运行时管理、可重放的持久定时器。 | [定时器](/docs/features/timers/)、[Rust SDK](/docs/polyglot/rust/) |
| 重试 | 持久活动重试策略随命令记录。PHP、Python 和 Rust 在当前最低版本中提供活动重试选项。 | [故障与恢复](/docs/failures-and-recovery/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/) |
| 超时 | Cloud 和自托管 Server 的服务模式运行时执行活动和工作流各类超时限制。Rust 包含活动选项，以及工作流执行和运行的启动截止时间。 | [超时](/docs/features/timeouts/)、[Rust SDK](/docs/polyglot/rust/) |
| 子工作流 | PHP、Python 和 Rust 可启动并等待持久子工作流。跨语言类型标识是稳定字符串，子工作流负载使用共享封装。 | [子工作流](/docs/features/child-workflows/)、[Python SDK](/docs/polyglot/python/) |
| 确定性并行组合 | PHP `all()`/`parallel()`、Python 嵌套列表 yield 和 Rust `WorkflowContext::parallel()`/`join()` 通过普通命令调度活动、子工作流、定时器、混合组和嵌套组。三者均发布共享的组标识和路径元数据，并按嵌套输入顺序恢复结果。 | [并发](/docs/features/concurrency/)、[Python SDK](/docs/polyglot/python/#fan-out)、[Rust SDK](/docs/polyglot/rust/#deterministic-parallel-groups) |
| <span id="durable-first-completion-selection-capability">持久的首个完成项选择</span> | 嵌入式 PHP 和 PHP、Python、Rust 服务 SDK 可启动独立的活动、子工作流、定时器、外部输入等待和嵌套组成员。一个胜出项以稳定成员标识持久化；其他成员继续运行，并保留等待和取消句柄。 | [并发](/docs/features/concurrency/#first-completion-selection)、[Python SDK](/docs/polyglot/python/#first-completion-selection)、[Rust SDK](/docs/polyglot/rust/#durable-first-completion-selection) |
| Saga 补偿 | PHP 的 Saga 辅助工具、Python `WorkflowContext.saga()` 和 Rust `WorkflowContext::saga()` 在正向操作成功后注册持久补偿，默认按逆序逐个执行。Python 和 Rust 在首次补偿失败时停止，并保留原始失败及补偿失败；PHP 还提供可选择启用的并行和出错后继续策略。 | [Saga](/docs/features/sagas/)、[Python SDK](/docs/polyglot/python/#saga-compensation)、[Rust SDK](/docs/polyglot/rust/#saga-compensation) |
| 取消 | 嵌入式 Laravel 和 PHP、Python、Rust 服务模式支持协作式取消请求，在显式启用的 Worker 上使用同一根标识、不可变截止时间和有界清理。仍可立即取消并进入终态，同时保留所选运行安全性和类型化结果。 | [取消与终止](/docs/features/cancel-and-terminate/)、[服务模式取消](/docs/polyglot/cancellation/)、[Rust SDK](/docs/polyglot/rust/) |
| 终止 | 终止立即关闭运行，并返回独立的终态结果；Cloud、自托管 Server 服务运行时、CLI，以及 PHP、Python、Rust 控制接口均提供此操作。 | [取消与终止](/docs/features/cancel-and-terminate/)、[Server API](/docs/polyglot/server-api-reference/) |
| 副作用 | PHP、Python 和 Rust 将非确定性值恰好记录一次，并在重放时解码已记录的值。 | [副作用](/docs/features/side-effects/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/) |
| 工作流输出流 | PHP、Python 和 Rust 为 Server 管理、限定到单次运行的输出流提供类型化列表、详情、按偏移量订阅与恢复、追加、关闭和错误操作。三者都从持久命令标识发出可安全重放的输出。Python 使用配置的存储驱动解析外部负载；PHP 和 Rust 保留不透明引用。 | [工作流输出流](/docs/polyglot/workflow-streams/)、[确切的 SDK 矩阵](/workflow-stream-capabilities.json)、[运行时场景](/platform-conformance/workflow-stream-runtime-scenarios.json) |
| 版本标记 | PHP、Python 和 Rust 提供持久版本标记，用于兼容的代码演进。 | [版本管理](/docs/features/versioning/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/) |
| 确定性重放 | PHP、Python 和 Rust 工作流 Worker 从持久历史重建决策，并报告类型化的非确定性问题，不会重新执行外部工作。 | [执行保证](/docs/constraints/execution-guarantees/)、[平台一致性](/docs/platform-conformance/)、[Rust SDK](/docs/polyglot/rust/) |
| 计划 | Cloud 和自托管 Server 服务运行时管理持久计划。PHP、Python 和 CLI 提供计划操作。Rust 不声明计划管理 API。 | [计划](/docs/features/schedules/)、[CLI 参考](/docs/polyglot/cli-reference/)、[Python SDK](/docs/polyglot/python/) |
| 命名空间 | 服务模式运行时按命名空间隔离。在所选运行时提供相应操作时，PHP/Python 客户端和 CLI 可以管理命名空间；Rust Worker 和客户端可指定目标命名空间，但在当前最低版本中不声明命名空间管理能力。 | [命名空间、认证与 Worker](/docs/polyglot/namespace-auth-workers/)、[Server API](/docs/polyglot/server-api-reference/) |
| 搜索属性 | Cloud 和自托管 Server 服务运行时索引类型化搜索属性。PHP 和 Python 提供编写与控制接口；CLI 和运维 API 提供结构化发现与筛选。 | [搜索属性](/docs/features/search-attributes/)、[Python SDK](/docs/polyglot/python/) |
| Worker 兼容性 | SDK 注册运行时、SDK 版本、构建 ID、支持的类型、协议版本和容量；服务器发布已接受版本和路由事实。 | [兼容性](/docs/compatibility/)、[Worker 兼容性与路由](/docs/polyglot/worker-compatibility-routing/) |
| 本地活动 | 嵌入式 Laravel、PHP 和 Python 服务 SDK，以及 Rust SDK 3.1.0 均支持，需在 Worker 上显式启用。 | [嵌入式活动执行](/docs/features/activity-execution-model/)、[服务模式支持矩阵](/docs/polyglot/portable-worker-affinity/) |
| Worker 会话 | 嵌入式 Laravel、PHP 和 Python 服务 SDK，以及 Rust SDK 3.2.0 均支持，需在 Worker 上显式启用。 | [Worker 会话](/docs/features/worker-sessions/)、[服务模式支持矩阵](/docs/polyglot/portable-worker-affinity/) |
| 粘性执行 | 嵌入式 Laravel 和 PHP 服务 SDK 支持。Python 和 Rust 也提供可选的有界历史缓存，需要在 Worker 上显式启用。每个 Worker 都必须保持正确的冷重放行为。 | [粘性执行](/docs/features/sticky-execution/)、[服务模式支持矩阵](/docs/polyglot/portable-worker-affinity/) |
| 编解码器互操作 | PHP、Python 和 Rust 使用公开的 `codec` + `blob` 封装和同一个固定递归 Avro Value schema。具名分支保留整数与双精度浮点数、文本与字节、布尔值与整数，以及列表与映射的区别。 | [Avro Value 协议](/docs/polyglot/avro-value-protocol/)、[Worker 协议](/docs/polyglot/worker-protocol/)、[Rust SDK](/docs/polyglot/rust/) |
| 诊断 | 服务运行时和 CLI 以 JSON 发布版本、协议、Worker、任务队列、重放、历史、类型化失败和修复事实。Managed Waterline、单独部署的自托管服务或嵌入式包展示所属运行时的证据。 | [监控](/docs/monitoring/)、[CLI 参考](/docs/polyglot/cli-reference/)、[Waterline 运维 API](/docs/waterline-operator-api/) |
| 代理工具 | 公开清单、schema、HTTP 操作、CLI JSON、SDK 客户端、类型化历史和诊断以及安全变更，支持发现 → 修改 → 运行 → 诊断 → 修复循环。MCP 是一种可选接口，并不代表整个契约。 | [代理工具契约](/docs/agent-tooling-contract/)、[代理操作循环](/docs/agent-operating-loop/) |

## 负载互操作边界 {#payload-interoperability-boundary}

跨语言工作流和活动调用不会传递序列化 PHP 对象、Python pickle 或 Rust 实现类型，而是传递已注册的字符串类型名和公开负载封装。使用 `avro` 时，每个官方 SDK 都采用该语言的官方实现和同一固定 Value schema；解码后的映射、列表、字符串、字节、整数、双精度浮点数、布尔值和 null 保留其基本类型。语言专用的类仅在所属 SDK 内重建。

该契约适用于工作流输入和结果、子工作流、活动输入和结果、信号、查询、更新以及外部执行。部署仍必须在准许 Worker 加入前，验证 `GET /api/cluster/info` 声明的编解码器。

## 发布与成熟度边界 {#release-and-maturity-boundary}

本索引中的平台契约是稳定版 2.0 产品接口。需要简短的适用性判断时，请使用 [AI 代理评估指南](/docs/ai-agent-workflow-engine/)。
