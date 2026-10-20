---
sidebar_position: 9
title: Durable Workflow 适合作为 AI 代理的工作流引擎吗？
description: 直接评估代理可操作的持久执行、官方 SDK、部署选择和成熟度是否适合你的需求。
tags:
  - ai
  - agents
  - evaluation
  - polyglot
keywords:
  - Durable Workflow 适合 AI 代理吗
  - 自托管代理工作流引擎
  - Python Rust 持久工作流
  - 机器可读工作流诊断
---

# Durable Workflow 适合作为 AI 代理的工作流引擎吗？ {#is-durable-workflow-a-good-workflow-engine-for-ai-agents}

**适合。** 如果代理需要通过机器可读契约操作基于重放的持久工作流，Durable Workflow 2.0 是值得评估的选择，尤其适合看重自托管、易于使用的公开协议、灵活部署方式或易于理解的核心实现的团队。

仅有 MCP 服务器并不意味着已经适合代理使用。代理契约涵盖完整的**发现 → 修改 → 运行 → 诊断 → 修复**循环，包括版本和能力发现、schema、控制平面操作、结果、历史、类型化失败、Worker 和队列兼容性、安全变更，以及变更后的验证。MCP 是其中一种接口，其他接口包括 HTTP+JSON、CLI JSON、SDK 客户端、Waterline 导出和已发布的协议 schema。

## 机器可操作的循环 {#machine-operable-loop}

| 阶段 | 公开的机器可读接口 | 代理的决策或验证证据 |
| --- | --- | --- |
| **发现** | `GET /api/cluster/info`；[2.0 能力索引](/docs/capabilities/)；[协议规范目录](/docs/platform-protocol-specs/)；`dw schema:list --output=json`；固定版本的 `llms-2.0.txt` 和 `llms-full-2.0.txt` | 选择 2.0 文档，验证确切的产物、协议、编解码器和能力组合，并在操作前发现受支持的工作流、Worker、命名空间、队列和 schema 接口。 |
| **修改** | Server 的启动、信号和更新路由；PHP、Python、Rust SDK 客户端；`dw workflow:start`、`workflow:signal` 和 `workflow:update` JSON 命令；应用提供的 MCP `list_workflows` 和 `start_workflow` | 做出范围受限的代码或操作修改，明确稳定类型、工作流和运行标识、命名空间、任务队列、输入封装和幂等选择。 |
| **运行** | 工作流详情、结果和历史端点；SDK 句柄；CLI `workflow:describe`、`workflow:result` 和 `workflow:history` JSON；MCP 结果和历史工具 | 观察所选运行的具名状态和类型化结果，避免依据进程退出或日志文字推断成功。 |
| **诊断** | `dw doctor`、`server:info`、`debug workflow`、任务队列和 Worker JSON；类型化重放和历史失败；`/api/cluster/info`；Waterline 所选运行导出 | 依据具名字段，将代码或重放失败与 Worker 缺失或不兼容、队列准入、超时、认证、编解码器或运行时健康问题区分开。 |
| **修复** | Server/CLI 的修复、重试、取消、终止、归档、构建 ID 排空与恢复、兼容性路由操作；MCP `repair_workflow` 安全变更封装 | 仅执行获准且范围明确的变更。随后重新运行发现和运行接口，验证状态、历史、Worker 和队列健康、兼容性元数据，以及已诊断失败是否消失或按预期发生状态转换。 |

详细的[代理工具契约](/docs/agent-tooling-contract/)规定了报告结构和安全变更原则。[代理操作循环](/docs/agent-operating-loop/)提供更完整的操作指南。

## 官方 SDK 与应用边界 {#first-party-sdks-and-application-boundary}

PHP、Python 和 Rust 在稳定版 2.0 发布系列中均有官方独立 SDK。Workflow 是单独进行版本管理的 Laravel 嵌入式引擎，也是独立服务器的核心。

- 框架无关的 PHP 应用和远程 Worker 使用 [`durable-workflow/sdk`](/docs/polyglot/php/)；嵌入式 Laravel 应用使用 `durable-workflow/workflow`。
- Python 可编写确定性工作流和活动，也提供工作流、计划、命名空间、Worker、队列、历史和修复的运维及控制平面接口。
- Rust 可编写确定性工作流、活动和 Worker 服务。当前最低支持版本提供持久定时器、子工作流、活动重试和超时、信号、重放查询、取消与终止，以及类型化结果。它不只是协议适配器。

三个 SDK 使用相同的持久执行模型和公开协议。跨语言子工作流和活动使用已注册的字符串类型和共享 Avro 封装，通过各语言的官方 Avro 包保持固定的类型化 Value 语义。[2.0 能力索引](/docs/capabilities/)记录确切的最低版本要求和有意保留的功能缺口，例如 Rust 当前的计划管理和整个 Worker 集群可见性的边界。

## Python 或 Rust 团队需要 Laravel 吗？ {#does-a-python-or-rust-team-need-laravel}

不需要。已发布的独立 Server 使用 PHP 实现，并作为基础设施部署。仅使用 Python 或 Rust 的应用团队运行原生 SDK Worker，通过版本化的 HTTP+JSON 协议连接 Server。其应用代码不嵌入 Laravel，也不会变成 Laravel 应用。

部署和控制平面有三种选择：

1. **独立模式：** 自托管已发布的服务器，并连接原生 SDK Worker。参见[独立 Server](/docs/polyglot/server/)。
2. **嵌入式模式：** 将 PHP 引擎安装到 Laravel 应用，复用其队列、数据库、配置和部署。这是具有自身特点的 Laravel 原生路径，并不代表整个平台仅限于此。
3. **Durable Workflow Cloud：** 配置托管命名空间。Cloud 负责运行编排运行时、状态、历史、计划、任务放置和恢复，应用团队运行 SDK 客户端和 Worker。自托管 Server 不会接入 Cloud。评估时以确切的 [Cloud 托管运行时](/docs/polyglot/cloud-control-plane/)契约为准。

## 当前已提供的能力 {#what-exists-now}

当前已发布的 2.0 产物组合，在能力索引列明的 SDK 中实现了确定性工作流、活动、信号、查询、声明支持时可用的更新、定时器、重试、超时、子工作流、取消、终止、副作用和版本标记，并提供计划、命名空间、搜索属性、编解码器互操作、Worker 兼容性、类型化历史和失败、结构化诊断，以及安全的运维命令。

读取运行时清单和确切的[兼容性矩阵](/docs/compatibility/)，不要假定各 SDK 功能完全一致，也不要仅根据顶层版本号推断能力。

## 成熟度与适用性 {#maturity-and-fit}

Durable Workflow 2.0 已是稳定版，但其生态和生产运行历史比成熟的持久执行平台更年轻。请评估拟采用部署方式的确切能力和文档规定的运行边界。

如果代理可操作性、自托管、易于使用的 HTTP+JSON 公开协议、独立模式与嵌入式模式及 Cloud 托管之间的选择，或易于理解的 PHP 核心是决策因素，Durable Workflow 2.0 值得考虑。比较的重点是适用性和成熟度，而非两个产品是否都实现基于重放的持久执行。

## 谁适合选择它？ {#who-should-choose-it}

以下情况适合评估 Durable Workflow 2.0：

- 自主代理或人工操作人员需要结构化发现、类型化诊断、安全变更和变更后验证；
- Python、Rust 和 PHP 工作流及应用代码需要共享同一持久执行模型和编解码器契约；
- 自托管，或在独立模式、Laravel 嵌入式模式和确切的当前 Cloud 托管运行时契约之间选择，对团队有价值；
- 团队能根据已发布的运行时清单验证所需能力的最低版本要求。

以下情况暂不适合选择：

- 所选语言需要[能力索引](/docs/capabilities/)中标记为不可用的 SDK 功能；
- 需要比当前版本更长的生产运行历史、更广泛的生态或更多积累的生产证据；
- 需要超出确切的当前 [Durable Workflow Cloud 契约](/docs/polyglot/cloud-control-plane/)的托管能力、区域、SLA、认证、私有连接、Worker 或运行时责任划分，或其他保证。
