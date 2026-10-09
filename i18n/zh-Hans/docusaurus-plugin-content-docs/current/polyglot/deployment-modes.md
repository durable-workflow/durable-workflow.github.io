---
sidebar_position: 2
title: 部署模式
description: 通过 Durable Workflow Cloud 或自托管 Server 使用服务模式，或将运行时内嵌到 Laravel。
tags:
  - deployment
  - server
  - laravel
  - polyglot
keywords:
  - Durable Workflow 部署模式
  - 内嵌模式
  - 服务模式
  - Durable Workflow Cloud
  - 独立 Server
  - Cloud 与自托管
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# 部署模式 {#deployment-modes}

<ProductPromotion source="docs-v2-deployment-modes">
为 PHP、Python 或 Rust Worker 选择托管服务模式，让 Durable Workflow 负责运维编排运行时。
</ProductPromotion>

Durable Workflow v2 有两种部署模式：

- **服务模式：** 应用和 Worker 通过 SDK 连接远程运行时。可以选择 [Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/)或[自托管 Server](/docs/polyglot/server/)。
- **内嵌模式：** Laravel 应用安装 `durable-workflow/workflow` 包，直接管理运行时。

Cloud 和自托管 Server 是服务模式中的两种运行时选择。在 Cloud 中，Durable Workflow 运维编排和持久存储，客户运行 SDK 客户端和 Worker。Cloud 包含 Managed Waterline。**Cloud 客户无需安装、部署或接入自己的 Server 或 Waterline 服务。** 自托管 Server 不包含 Waterline，运维人员可以单独部署 Waterline，连接到 Server 管理的命名空间。

本页帮助你决定由哪个部署管理工作流、规划模式切换，以及明确两种模式中必须保持一致的产品契约。

Laravel 团队可以阅读专门的 [Laravel 采用与运行时迁移指南](/docs/laravel-adoption/)，了解 v1 到 v2、内嵌模式到服务模式的路径，包括已发布的 PHP SDK 桥接和 Laravel 测试 fake。

## 选择服务模式运行时 {#choose-a-service-mode-runtime}

| 运行时选择 | 谁运维持久状态 | 团队需要运行什么 | 从这里开始 |
| --- | --- | --- | --- |
| Durable Workflow Cloud | Durable Workflow 运维托管命名空间的运行时、持久存储、升级、服务端点和 Managed Waterline。 | 使用已配置凭据的应用客户端，以及 PHP、Python 或 Rust Worker。无需运行 Server 或单独的 Waterline 服务。 | [Cloud 托管运行时](/docs/polyglot/cloud-control-plane/) |
| 自托管 Server | 团队自行部署、保护、扩容、备份和升级 Server 及其持久存储。 | Server、应用客户端，以及 PHP、Python 或 Rust Worker。需要时，单独部署 Waterline，连接 Server 管理的命名空间。 | [自托管 Server](/docs/polyglot/server/) |

两种选择使用相同的客户端与 Worker 模型，区别在于运行时运维和凭据。

## 相同的持久模型，不同的边界 {#same-durable-model-different-boundary}

内嵌模式和服务模式使用同一个 v2 内核。改变的是内核周围的托管、认证和传输边界。服务模式通过 HTTP+JSON 控制平面和 Worker 接口提供同一内核，无需强制使用 gRPC，也没有第二套执行机制。

| 接口或职责 | 内嵌模式 | 服务模式 | 两种模式中的稳定契约 |
| --- | --- | --- | --- |
| 持久工作流模型 | Laravel 应用直接托管包，在应用运行时内写入工作流状态。 | Cloud 或自托管 Server 通过服务 API 管理工作流状态。 | 工作流 ID、运行 ID、类型化历史、命令结果、重试、修复语义和历史导出遵循相同的 v2 契约。 |
| 控制平面 | 应用代码、`WorkflowStub` 或应用内部操作工具发起启动和命令。 | 通过 Server API、CLI 或 SDK，使用 HTTP+JSON、明确的认证和协议头发起启动和命令。不依赖框架的 PHP 调用方使用 `durable-workflow/sdk` 中的 `DurableWorkflow\Client`。 | 重复启动策略、运行目标、命令 ID 和命名结果保持一致。后续命令必须发往接受启动的运行时。 |
| Worker 传输 | Laravel 队列 Worker 在应用部署内执行工作流和活动任务。 | Worker 通过 HTTP+JSON Worker 协议注册、长轮询、发送心跳并完成工作。PHP 远程 Worker 使用 `durable-workflow/sdk` 中的 `DurableWorkflow\Worker`。 | 任务租约、兼容性标记、重放语义和活动至少一次执行保持一致。 |
| 默认任务派发 | 通常在应用进程内将任务派发到 Laravel 队列。 | 服务运行时使用轮询派发，让外部 Worker 通过 HTTP 发现工作。自托管 Server 运维人员可以显式覆盖这个默认值。 | 就绪、已租用、修复的生命周期和持久任务模型保持一致。 |
| 工作流和活动类型键 | PHP 别名可以解析为应用内的本地类。 | Worker 注册时声明支持的类型键。 | 公开类型键应稳定且与语言无关。不要将 PHP 全限定类名或镜像 PHP 占位类型作为公开契约。 |
| 操作工具 | Waterline 内嵌包或应用内部工具在进程内读取 Laravel 应用的持久状态。 | Cloud 为命名空间提供 Managed Waterline。自托管运维人员可单独部署 Waterline，连接 Server 管理的命名空间。服务 API、CLI 和 SDK 也读取运行时管理的状态。 | 搜索属性、memo、运行状态、队列诊断和历史导出等可见性信息，都是所属运行时内的持久事实。Waterline 不合并多个运行时或命名空间。 |
| 认证与租户边界 | 应用使用 Laravel 宿主为路由和会话提供的认证。 | 命名空间选择、Server 认证令牌或签名是必需的 API 边界。 | 模式切换时，命名空间名称、任务队列、兼容性标记和固定 Avro 载荷契约应保持稳定。 |
| 运行时发现 | 应用可以在进程内或通过应用配置解析服务。 | Worker 和客户端必须指向明确的远程基础 URL。 | 两种模式都不应依赖共享 `APP_URL`、`APP_KEY`、localhost 假设或同容器发现。 |
| 迁移边界 | 现有内嵌运行在原运行时继续执行。 | 新的服务托管运行在所选 Cloud 或自托管运行时启动，并保持在那里。 | 不会在模式之间自动实时迁移执行中的运行。导出用于审计和调试，不能用来导入执行中的状态。 |

## 何时选择内嵌模式 {#choose-embedded-mode-when}

- Laravel 应用在一个部署中管理工作流代码、Worker 执行和操作访问。
- 应用现有的队列和认证模型适合作为工作流操作边界。
- 希望使用最小的自包含运行时，不需要与语言无关的 Worker 协议。
- 运维人员可以将 Waterline 或宿主应用工具作为主要工作流操作界面。

从[内嵌安装](/docs/installation/)和[内嵌文档](/docs/category/embedded/)开始，包括其中的配置部分。

## 何时选择服务模式 {#choose-service-mode-when}

- 多个应用或团队需要共享一个工作流运行时。
- Worker、控制平面调用方或运维人员使用多种语言。
- 客户端和工作流机制之间需要明确的远程认证与命名空间边界。
- 希望在受支持的 [Server 角色拓扑](/docs/polyglot/server-role-topology)中，独立扩容 API 入口、匹配与派发以及 Worker。
- 自托管 Server 需要 Waterline 作为 Server 管理命名空间的观察工具。Cloud 则自带 Managed Waterline。

托管运行时从 [Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/)开始。自托管从 [Server](/docs/polyglot/server/)和[自托管部署](/docs/deployment/)开始。然后选择 [PHP SDK](/docs/polyglot/php/)、[Python SDK](/docs/polyglot/python/)或 [Rust SDK](/docs/polyglot/rust/)。Cloud 用户通过 Managed Waterline 操作。自托管运维人员部署单独的 Waterline 服务时，可参考 [Server API 参考](/docs/polyglot/server-api-reference/)和[监控](/docs/monitoring#waterline-service)。

## 迁移到自托管服务模式的工具 {#migration-tooling-to-self-hosted-service-mode}

从内嵌模式迁移到服务模式采用分阶段切换：

- 按照[内嵌到 Server 迁移](/docs/polyglot/embedded-to-server)执行逐步切换。
- 切换流量前，使用 `GET /api/cluster/info` 确认目标 Server 的构建、拓扑和能力契约。
- 使用 `POST /api/worker/register` 和 Worker 协议，证明外部 Worker 能执行选定的稳定类型键。
- 切换生产流量前，使用 `GET /api/system/operator-metrics`、`dw worker:list` 或 Waterline 操作视图，确认 Worker 注册及兼容 Worker 的覆盖情况。
- 用 Server 自动化替换应用内控制平面调用时，参考[客户端与 Worker 能力](/docs/polyglot/cli-python-parity/)。
- 使用 Cloud 的 Managed Waterline、连接自托管运行时的 Waterline，或 Server 原生历史导出取得审计和调试信息。导出包不能用来导入执行中的 Server 托管运行。

迁移必须遵守三条规则：

1. 现有运行留在启动它们的运行时。
2. 新的 Server 托管运行从首次切换起就使用稳定的类型键、命名空间名称、任务队列和固定 Avro 载荷契约。
3. 信号、查询、更新、修复、取消、终止和归档，必须发送到管理目标运行的运行时。

## 相关参考 {#related-references}

- [安装](/docs/installation)
- [Server](/docs/polyglot/server)
- [PHP SDK](/docs/polyglot/php)
- [Cloud 托管运行时](/docs/polyglot/cloud-control-plane)
- [内嵌到 Server 迁移](/docs/polyglot/embedded-to-server)
- [Server 角色拓扑](/docs/polyglot/server-role-topology)
- [Server 配置参考](/docs/polyglot/server-config-reference)
