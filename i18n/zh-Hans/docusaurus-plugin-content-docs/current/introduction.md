---
sidebar_position: 1
description: 选择 Durable Workflow Cloud、自托管 Server 或 Laravel 内嵌模式，再用官方 SDK 完成第一个工作流。
tags:
  - concepts
  - getting-started
  - workflows
keywords:
  - durable workflow
  - 多语言工作流引擎
  - AI 智能体工作流引擎
  - 持久编排
  - v2 工作流概念
---

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# 简介 {#introduction}

Durable Workflow 2.0 将工作流的状态和历史保存在短生命周期的应用进程之外，让 PHP、Python 和 Rust Worker 能在重启后安全地继续执行。第一次使用时，建议先阅读[快速开始](/docs/quickstart/)，把一个工作流运行到 `completed`，再查阅内容更详细的[能力索引](/docs/capabilities/)。

## 选择部署方式 {#choose-a-deployment-model}

### 服务模式 {#service-mode}

应用通过官方 SDK 使用远程持久运行时。你可以选择由谁运维运行时：

- **[Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/)** 是托管选项。Durable Workflow 负责工作流编排、持久存储和 Managed Waterline。你的团队在已配置的命名空间中运行 SDK 客户端和 Worker。**Cloud 用户无需安装或运行 Durable Workflow Server，也无需部署单独的 Waterline 服务。**
- **[自托管 Server](/docs/polyglot/server/)** 提供相同的服务接口，由你的团队负责部署、安全、扩容、备份和升级。Waterline 是可选的独立观测服务，连接到由 Server 管理的命名空间。

两种选择提供相同的版本化 HTTP+JSON 控制平面、Worker 协议、命名空间模型和跨语言载荷封装。[部署模式](/docs/polyglot/deployment-modes/)说明各方负责的边界。

### Laravel 内嵌模式 {#embedded-laravel}

内嵌模式适用于希望在自身基础设施内管理工作流状态、队列、配置和运维工具的 Laravel 应用。它安装 `durable-workflow/workflow`，无需连接 Cloud 或运行单独的 Server。内嵌 Waterline 包在应用进程内读取该应用管理的状态。

如果你希望由应用直接管理运行时，请从[内嵌模式安装](/docs/installation/)开始。

从稳定 v1 升级，或重新评估现有 2.0 内嵌部署的 Laravel 团队，可以通过[Laravel 采用与运行时迁移指南](/docs/laravel-adoption/)比较可执行的内嵌模式与 PHP SDK 路径，再切换流量。

## 选择服务模式 SDK {#choose-a-service-mode-sdk}

- **[PHP SDK](/docs/polyglot/php/)**：在不依赖特定框架的 PHP 应用或远程 Worker 中安装 `durable-workflow/sdk`。
- **[Python SDK](/docs/polyglot/python/)**：编写确定性的工作流和活动，并使用异步控制平面客户端。<PythonPackageReleaseLink authority="qualified">Python SDK 稳定版本</PythonPackageReleaseLink>与 Server 快速开始使用同一份机器可读的稳定版本清单。
- **[Rust SDK](/docs/polyglot/rust/)**：编写确定性的工作流和活动，运行原生 Worker 服务。

三者都是同一公开服务接口的官方实现。[客户端与 Worker 能力](/docs/polyglot/cli-python-parity/)明确列出了支持的功能及各接口的有意差异。

## 完成第一个工作流 {#your-first-completed-workflow}

[快速开始](/docs/quickstart/)先说明目标、运行时选择、前提条件、所需时间和预期结果。PHP、Python 和 Rust 都有完整可执行的路径，每次只显示你选择的语言。

本地自托管路径使用已发布的包和镜像，无需获取产品源码。Cloud 路径使用托管命名空间的连接信息，无需运行 Server。

## 服务模式的组成 {#how-service-mode-fits-together}

服务模式部署包含三部分：

- **运行时**管理持久状态、命令与历史记录、任务匹配、定时器、调度、命名空间和认证协议。托管命名空间由 Cloud 运维，自托管运行时由你的团队运维。
- **应用 Worker**通过 PHP、Python 或 Rust SDK 执行工作流和活动代码。它们可以与应用一起部署，也可以作为独立服务部署，并独立于运行时扩容。
- **客户端与运维工具**通过 SDK、`dw` CLI、HTTP API、机器可读模式、Waterline 和智能体接口，启动、检查和控制同一份运行时状态。

## 统一的公开持久执行契约 {#one-public-durable-execution-contract}

官方 SDK 使用注册的字符串名称标识工作流和活动类型，并共享公开载荷封装。封装注明编解码器，保存可跨语言使用的值，不依赖 PHP 序列化、Python pickle 或 Rust 内部类型。

工作流 Worker 根据持久命令和历史记录重建决策。当 Worker 声明相同的公开编解码器并注册相同的类型名称时，活动和子工作流的输入与结果可以跨语言传递。依赖某个 SDK 功能前，请查阅[能力索引](/docs/capabilities/)和运行时发现信息。

## 使用对应模式的示例 {#learn-from-the-matching-examples}

- **服务模式与多语言**：阅读[快速开始](/docs/quickstart/)和 PHP、Python 或 Rust SDK 指南。
- **Laravel 内嵌模式**：在 [Sample App](/docs/sample-app/)示例集中探索 Laravel 原生工作流模式和 Waterline 观测结果。

Cloud 和自托管服务模式应从服务模式指南开始。内嵌示例集面向 Laravel 应用。

## 面向智能体的明确操作契约 {#agent-operable-by-contract}

人工运维和自主智能体使用同一套机器可读契约。可验证的操作循环是**发现 → 修改 → 运行 → 诊断 → 修复**：版本与能力清单、明确的工作流命令、结构化结果、类型化历史、Worker 与队列诊断、安全修改，以及修改后的验证。参阅[智能体操作循环](/docs/agent-operating-loop/)和 [AI 智能体评估指南](/docs/ai-agent-workflow-engine/)。

## 你需要工作流吗？ {#do-you-need-a-workflow}

这些情况通常适合使用工作流：

- 流程持续几分钟、几小时或几天。
- 需要等待人工审批。
- 需要等待 webhook 或其他外部事件。
- 需要暂停并稍后继续，但不想一直保留运行中的进程。
- 需要在崩溃后恢复，避免错误或重复工作。

如果只是按顺序执行五个队列任务，并在第一个失败时停止，任务链通常更合适。Durable Workflow 适用于下一步依赖外部事件、等待或无法提前确定的决策的场景。
