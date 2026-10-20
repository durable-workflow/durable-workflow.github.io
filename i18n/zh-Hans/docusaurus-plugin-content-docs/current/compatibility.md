---
sidebar_position: 17
title: 版本兼容性
description: Durable Workflow 公开接口的权威兼容性与发布权限契约。
tags:
  - compatibility
  - operations
  - protocols
  - api-stability
keywords:
  - 版本兼容性
  - 兼容性权威来源
  - 发布权限
  - 稳定性级别
  - 协议清单
  - 控制平面版本
  - Worker 协议版本
  - 接口稳定性契约
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

# 版本兼容性 {#version-compatibility}

本页是 Durable Workflow 公开平台的**权威兼容性与发布权限契约**，是以下事项的唯一事实来源：

- 哪些接口是公开接口，
- 每个公开接口的稳定性级别，
- 哪些变更可随补丁、次版本或主版本发布，
- 某个字段是契约的一部分还是仅用于诊断，
- 客户端在 Server 声明其无法使用的接口时，用于默认拒绝的运行时版本协商协议。

各软件包的稳定性文档（例如 `durable-workflow/workflow` 仓库的 `docs/api-stability.md`、`dw` CLI 参考和 Waterline 操作 API 页面）都**从属于**本页。它们在这些规则下补充软件包细节；发生冲突时，以本页为准，冲突属于软件包文档的错误。

同一契约也以机器可读形式发布，让 SDK、Server 清单和 CI 门槛依据同一事实来源自检：

- 独立 Durable Workflow Server 的 `GET /api/cluster/info` 响应体中的 `surface_stability_contract`，schema 为 `durable-workflow.v2.surface-stability.contract`，版本为 `5`。
- 本仓库 `static/compatibility-contract.json` 中同一清单的冻结镜像。
- PHP 类 `Workflow\V2\Support\SurfaceStabilityContract`，即 Server 重新导出的进程内来源。

产物渠道准入由 [`/public-artifact-release-policy.json`](pathname:///public-artifact-release-policy.json) 单独约束。这项独立审查的策略控制哪些 2.0 渠道可以成为权威公开产物组合。

发布若修改下列任何接口的稳定性级别、字段集或破坏性变更规则，必须在同一修改中更新本页、JSON 镜像、PHP 清单以及所有相关的软件包稳定性文档。文档 CI 验证机器可读契约、产物发布阶段策略、可用时的已发布 Rust 元数据以及 Worker 协议规范。本页与清单在文字上的对齐仍是明确的发布审查责任。

## 配套资料：平台协议规范目录 {#companion-platform-protocol-spec-catalog}

本页说明*哪些*接口公开以及*如何*变更。配套的[平台协议规范](/docs/platform-protocol-specs)目录说明每个接口的规范性机器可读规范*位于何处*、采用*何种格式*（HTTP API 使用 OpenAPI，对象族使用 JSON Schema，事件流语义使用 AsyncAPI）、由*哪个仓库*负责、约束哪些对象族，以及哪个公开 URL 可以获取产物。SDK 作者、代理和操作人员应根据规范目录验证，而不必反复阅读正文或依赖仓库本地实现细节。

目录在 `GET /api/cluster/info` 中以 `platform_protocol_specs` 声明。

<PublicAuthorityIdentity
  manifest={protocolCatalog}
  manifestUrl="https://durable-workflow.github.io/platform-protocol-specs.json"
/>

每个目录条目的 `surface_family` 必须存在于上述契约中；文档站点 CI 验证目录、解析每个公开规范 URL，并拒绝仓库本地权威字段。

<WorkerProtocolAuthorityRoles />

每个必需的平台协议目录条目都标记为 `published`；可调用载体条目仍是 `in_progress`。每个可用条目直接链接公开 OpenAPI、AsyncAPI 或 JSON Schema 文档。[`cluster_info_envelope`](/docs/platform-protocol-specs#cluster-info-envelope-notes) schema 固定了发现接口，其他所有目录条目均可从中到达。

## 稳定性级别 {#stability-levels}

Durable Workflow 中每个公开接口恰好具有以下一个稳定性级别。级别必须明确；未分类的接口不是公开接口。

| 级别 | 含义 | 何时允许破坏性变更 |
|-------|---------|-----------------------------------|
| `frozen` | 线格式或持久化结构，在工作流整个生命周期内必须以相同方式解码。重命名、删除或改变字段用途属于协议破坏，绝非次版本变更。 | 只能以新类型名称引入**并行原语**。原始结构必须永远可解码。 |
| `stable` | 受平台语义化版本保证覆盖的公开接口。增量变更随次版本发布。 | 仅主版本发布。 |
| `prerelease` | 功能完整的公开接口，但在对应 `1.0.0` / `2.0.0` 正式发布前仍允许变更。 | 在清晰标注的预发布版本中，并在发布说明中指出。 |
| `experimental` | 公开但不稳定的接口。可在包括补丁版本在内的任何发布中变更。调用方必须阅读接口的实验标记并主动选择使用。 | 任何发布；发布说明指出变更。 |

## 公开接口族 {#public-surface-families}

以下是完整公开接口族列表。新增、删除或重新分类接口族需要契约变更（在同一提交中提升 `SurfaceStabilityContract` 版本并更新本页和 JSON 镜像）。

| 接口族 | 稳定性 | `/api/cluster/info` 中的权威清单 | 覆盖范围 |
|--------|-----------|-------------------------------------------|----------------|
| `server_api` | `stable` | `control_plane` | 独立 Server HTTP API：控制平面、命名空间、计划和系统路由，以及 `/api/health`、`/api/ready`、`/api/cluster/info`。每路由版本由 `control_plane.request_contract` 和 `control_plane.response.contract` 约束。Server 顶层 `version` 是构建身份，不是客户端兼容性的权威来源。 |
| `worker_protocol` | `stable` | `worker_protocol` | 外部 SDK Worker 用于注册、轮询、心跳、管理 Worker 会话租约，以及完成或报告工作流、活动和查询任务失败的 Worker 平面 HTTP API。包含 `worker_sessions` 和 `local_activities` 运行时契约、`external_execution_surface_contract`、`external_executor_config_contract`、`invocable_carrier_contract`、`external_task_input_contract` 和 `external_task_result_contract`。 |
| `cli_json` | `stable` | 不适用（参见 CLI 参考） | `dw` 输出的 `--output=json` 和 `--output=jsonl` 结构。JSON 退出码和字段名是持久接口；供人阅读的 `--output=table` 形式是文档，不是契约。 |
| `waterline_api` | `stable` | 不适用（参见 Waterline 操作 API） | `/waterline/api/v2/*` 下的 Waterline 可观测性 HTTP API、引擎来源契约和仪表板 JSON 结构。Waterline 必须与工作流软件包主版本匹配。 |
| `mcp_discovery_results` | `stable` | 不适用（参见 MCP 工作流页面） | `/mcp/*` Model Context Protocol 接口，以及 `llms.txt` / `llms-2.0.txt` 发现文件。MCP 工具名、参数 schema 和 `payload_preview_limit_bytes` 语义属于契约；工具描述和发现提示仅用于诊断。 |
| `official_sdks` | `stable` | `client_compatibility` | 第一方 SDK：PHP `durable-workflow/sdk`、`durable_workflow` Python SDK 和 `durable-workflow` Rust SDK。`dw` CLI 是官方命令客户端。各 SDK 公开接口由其软件包稳定性文档约束，且必须服从本页。 |
| `history_event_wire_formats` | `frozen` | 不适用（冻结结构；参见 Workflow 的 `docs/api-stability.md`） | `workflow_history_events` 和 `workflow_schedule_history_events` 每行的持久化结构。工作流一旦写入事件，未来每个重放它的 SDK 都必须解码同一字段集。 |
| `cluster_info_manifests` | `stable` | `surface_stability_contract`, `client_compatibility`, `control_plane`, `worker_protocol`, `auth_composition_contract`, `coordination_health` | `GET /api/cluster/info` 本身发布的协议清单。每个嵌套清单都有自己的 `schema` 和 `version`，按自己的契约规则演进。封装键保持稳定。 |

### 各软件包稳定性文档 {#per-package-stability-documents}

这些文档依据本页规则补充软件包细节：

- `durable-workflow/workflow`（PHP）：[`docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/main/docs/api-stability.md)。PHP 编写 API、面向 Server 的 `Support\*` 类，以及冻结历史事件线格式表的权威来源。
- `durable-workflow/sdk`（PHP）：[`README.md`](https://github.com/durable-workflow/sdk-php/blob/main/README.md)。通过 Packagist 分发、与框架无关的远程客户端和 Worker API 的权威来源。
- `durable-workflow/server`：[`README.md`](https://github.com/durable-workflow/server/blob/main/README.md) 和 `docs/contracts/*`。独立 Server 请求/响应契约的权威来源。
- `dw` CLI：[`/docs/polyglot/cli-reference`](/docs/polyglot/cli-reference)。JSON 输出结构和退出码的权威来源。
- Python SDK：`durable-workflow/sdk-python` 中的 `README.md`。`durable_workflow` 软件包公开 API 的权威来源。
- Rust SDK：`durable-workflow/sdk-rust` 中的 `README.md` 和 `[package.metadata.durable-workflow]`。`durable-workflow` crate 公开 API 及软件包兼容性声明的权威来源。

## 发布规则 {#release-rules}

这些规则适用于上述每个公开接口族，也在 JSON 镜像的 `release_rules` 下提供。

### 补丁版本 {#patch-releases}

允许：

- 保留文档契约的错误修复
- 文档修复
- 不改变公开接口的依赖升级
- 修改标记为 `experimental` 的接口

禁止：

- 删除或重命名任何 `stable` 或 `frozen` 字段、路由、命令或类
- 收窄任何 `stable` 路由或命令所接受的输入
- 改变现有 `stable` 字段的含义

### 次版本 {#minor-releases}

允许：

- 向 `stable` 接口添加新字段、路由、命令或类
- 添加带安全默认值的新可选参数
- 向发现响应添加新能力标记
- 将 `prerelease` 或 `experimental` 接口提升为 `stable`

禁止：

- 删除或重命名任何 `stable` 或 `frozen` 字段、路由、命令或类
- 改变现有 `stable` 或 `frozen` 字段的含义

### 主版本 {#major-releases}

允许：

- 删除、重命名或收窄 `stable` 接口
- 提高必需的 `control_plane.version` 或 `worker_protocol.version`
- 放弃先前支持的 SDK 或 CLI 版本范围

必须：

- 至少在主版本发布前的一个次版本发布说明中预告
- 可行时，在先前次版本中同时交付新旧接口，让调用方在主版本前迁移
- 发布前在[迁移指南](/docs/migration)中记录迁移路径

## 仅诊断字段与保证字段 {#diagnostic-only-versus-guaranteed-fields}

每个 `stable` 或 `frozen` 接口的每个字段，要么是**保证字段**，要么是**仅诊断字段**。两者的变更规则不同：

- **保证字段**属于文档契约。生成方必须继续按文档结构输出；使用方可以依赖其存在和含义。删除或重命名 `stable` 接口上的保证字段属于主版本变更。
- **仅诊断字段**用于人工分诊、调试和可观测性，可在任何次版本中添加、重命名或删除。文档中必须标记为 `diagnostic_only: true`（或页面中的等价说明）。**使用方不得在生产决策逻辑中解析、持久化这些字段或据此分支。**

旧使用方必须忽略 `stable` 或 `frozen` 结构中的未知增量字段（向前兼容）。遇到未知必需字段必须默认拒绝。SDK 和 CLI 在各自软件包稳定性文档中公布向前兼容行为。

## 兼容性矩阵 {#compatibility-matrix}

这是运维兼容性矩阵，记录哪些客户端版本针对哪些 Server 协议清单完成了验证。组件在运行时通过 `GET /api/cluster/info` 验证矩阵，清单不一致时默认拒绝。

### 最近通过资格验证的可复现产物组合 {#last-qualified-reproducible-tuple}

下表显示从 [`stable-releases.json`](/stable-releases.json) 中选取、用于本文档的已审查稳定组合。组件独立版本化，因此兼容组合可以包含不同软件包版本。发布与资格验证报告保留每项已完成检查使用的确切版本和镜像摘要。

| 组件 | 支持版本 | 安装身份 |
|-----------|-------------------|------------------|
| Server | `%%artifact.serverVersion%%` | `%%artifact.serverDockerHubImage%%` |
| CLI | `%%artifact.cliVersion%%` | `%%artifact.cliInstallerEnv%%` |
| 工作流引擎 | `%%artifact.workflowVersion%%` | `%%artifact.workflowComposerPackage%%` |
| Waterline 操作界面 | `%%artifact.waterlineVersion%%` | `%%artifact.waterlineComposerPackage%%` |
| PHP SDK | `%%artifact.phpSdkVersion%%` | `%%artifact.phpSdkComposerPackage%%` |
| Python SDK | `%%artifact.pythonSdkVersion%%` | `%%artifact.pythonPackagePin%%` |
| Rust SDK | `%%artifact.rustSdkVersion%%` | `%%artifact.rustCargoRequirement%%` |

PyPI 将 Python 分发版本显示为 `%%artifact.pythonRegistryVersion%%`；文档中的 PEP 440 安装写法 `%%artifact.pythonSdkVersion%%` 解析到同一发布。这种规范化不产生第二个受支持版本。

所选组合在受影响使用方完成资格验证后推进。公开 Server 镜像仓库和生成的快速入门使用所选产物。软件包可以独立发布，通过协议清单、能力和使用方检查验证兼容性。

早期 alpha 和 beta 产物属于历史，不是可选入门路径，发布历史仍保留。

每个稳定组件都遵循语义化版本。兼容发布可增加能力；破坏公开接口的修改需要主版本。启用功能前，通过运行时发现检查已安装 Server 和 Worker 的可用能力。

### 运行时协议兼容性 {#runtime-protocol-compatibility}

顶层软件包版本选择受支持的产品系列。运行时协议清单提供第二层默认拒绝检查：

| 客户端 | 产品系列 | 控制平面 | 默认 Worker 注册协议 |
|--------|---------------|---------------|--------------------------------------|
| CLI | `%%artifact.cliVersion%%` | `2` | 不适用 |
| PHP SDK | `%%artifact.phpSdkVersion%%` | `2` | `1.20` |
| Python SDK | `%%artifact.pythonSdkVersion%%` | `2` | `1.20` |
| Rust SDK | `%%artifact.rustSdkVersion%%` | `2` | `1.20` |

SDK 也支持显式选择 Worker 协议 `1.19`，以连接较旧的兼容 Server。协作式取消要求 `1.20`，选择 `1.19` 不提供该能力。各操作可以使用其文档规定的最低协议版本，因此默认注册版本并不意味着每个 Worker 请求都发送 `1.20`。

当前已发布 Server 声明上方权威角色表中的 Worker 协议版本。它接受主版本相同、次版本小于或等于声明次版本的请求头，并返回声明版本。缺失或格式错误的请求头、不同主版本，以及领先于 Server 的 Worker 次版本都会被默认拒绝。CLI 验证 `control_plane.version: "2"`。

Server 顶层 `version` 是构建身份。客户端必须使用 `GET /api/cluster/info` 返回的 `control_plane`、`worker_protocol`、`client_compatibility` 和 `surface_stability_contract` 清单协商协议。

Workflow 和 Waterline 必须使用兼容的 2.x 发布。稳定版发布后，运行时发现和软件包约束提供兼容性边界。

### 运行时验证示例 {#runtime-validation-examples}

SDK 注册 Worker 前验证发现信息。Server 不兼容时会产生明确的兼容性错误，不会尝试旧版预发布路径。所有 Worker 请求发送 `X-Durable-Workflow-Protocol-Version`；控制平面请求发送 `X-Durable-Workflow-Control-Plane-Version: 2`。

产品系列提升前，发布资格验证必须从干净机器开始，仅安装上述已发布产物，并完成 PHP、Python 和 Rust 一致性路径。源码检出和未发布替代品不能作为公开产物证据。

稳定软件包元数据和运行时发现现已定义受支持的 2.x 兼容性边界。发布资格验证仍在发布前一起安装公开产物，补丁和次版本则遵循下方语义化版本规则。

### 发布演进 {#release-progression}

补丁版本保留文档中的稳定契约。次版本可增加字段、路由、命令、类，或带安全默认值的可选参数。破坏稳定契约的变更需要主版本及记录在案的迁移路径。冻结历史事件结构永久可解码；新结构使用并行原语，而不修改现有事件。

每次发布必须同步软件包元数据、发布说明、安装命令和跨语言示例。

### 发布审查清单 {#release-review-checklist}

- 确认机器可读兼容性契约与 Workflow 接口稳定性清单一致。
- 确认每个所选 SDK 版本都能通过针对所选 Server 的检查。
- 确认安装示例使用稳定发布渠道。
- 确认软件包元数据标识确切 SDK 发布和协议版本；在兼容性证据中记录后续 Server 资格验证。
- 确认在干净机器上使用已发布产物的 PHP、Python 和 Rust 一致性检查通过。
- 确认发布说明描述基线之后增加的内容，不将旧预发布版本列为受支持选项。

## 另请参阅 {#see-also}

- [Server 配置](/docs/polyglot/server)：部署独立 Server
- [Server API 参考](/docs/polyglot/server-api-reference)：`GET /api/cluster/info` 和协议清单
- [PHP SDK](/docs/polyglot/php)：PHP 客户端和 Worker
- [Python SDK](/docs/polyglot/python)：Python 客户端和 Worker
- [Rust SDK](/docs/polyglot/rust)：Rust 客户端和 Worker
- [CLI](/docs/polyglot/cli)：命令行界面
- [迁移指南](/docs/migration)：从 v1 迁移到 v2
- [PHP Workflow 的 `docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/main/docs/api-stability.md)：PHP 工作流软件包的稳定性规则
