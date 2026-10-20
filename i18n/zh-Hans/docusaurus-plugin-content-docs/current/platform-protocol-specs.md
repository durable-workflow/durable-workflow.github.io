---
sidebar_position: 18
title: 平台协议规范
description: 面向使用方的 Durable Workflow 公开 OpenAPI、JSON Schema 和 AsyncAPI 规范目录。
tags:
  - compatibility
  - protocols
  - api-stability
  - openapi
  - json-schema
  - asyncapi
keywords:
  - 平台协议规范
  - 协议目录
  - openapi
  - asyncapi
  - json schema
  - 控制平面规范
  - Worker 协议规范
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import ProtocolCatalog from '@site/src/components/ProtocolCatalog';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

# 平台协议规范 {#platform-protocol-specs}

平台协议目录让 SDK 作者、智能体、操作人员和第三方工具准确知道，Durable Workflow 的每个公开接口由哪份机器可读规范约束。

自动化请使用[机器可读目录](https://durable-workflow.github.io/platform-protocol-specs.json)。每个可用条目都提供稳定的规范标识符，以及直接指向 OpenAPI、AsyncAPI 或 JSON Schema 产物的公开 HTTPS URL。

仓库路径、实现符号和测试夹具刻意不作为使用方的权威来源。它们不包含在已发布目录中，只保留为验证诊断信息。

## 目录身份与发现 {#catalog-identity-and-discovery}

<PublicAuthorityIdentity
  manifest={protocolCatalog}
  manifestUrl="https://durable-workflow.github.io/platform-protocol-specs.json"
/>

还可通过以下途径获取目录：

- 公开 JSON 目录：https://durable-workflow.github.io/platform-protocol-specs.json；
- 独立 Server 的 GET /api/cluster/info 中的 platform_protocol_specs；
- 本篇 2.0 指南提供的可读说明。

JSON URL 是可供机器消费的目录权威来源。Server 重新导出同一目录，让客户端无需假设仓库布局即可发现当前协议接口。

<WorkerProtocolAuthorityRoles />

## 使用方字段 {#consumer-fields}

每个条目公开以下契约：

| 字段 | 含义 |
|---|---|
| spec_id | 稳定的 Durable Workflow 协议标识符。已发布文档携带与之匹配的身份。 |
| spec_url | 机器可读规范的直接公开 HTTPS URL。 |
| format | openapi、json_schema 或 asyncapi。 |
| status | 引用的产物是已发布、进行中还是计划中。 |
| surface_family | 约束该接口的兼容性策略族。 |
| authority_manifest | 运行时通过其声明该接口的发现清单。 |
| owner_repo | 负责该规范的项目。 |
| object_families | 公开对象族名称及其所属项目。 |
| evolution_rule | 增量和破坏性变更的兼容性规则。 |
| breaking_change_release | 该演进规则要求的发布边界。 |

使用方应解析 spec_url，并根据 spec_id 验证文档身份。无需访问源码检出目录。

## 可用规范 {#available-specifications}

此列表根据公开 JSON 目录渲染。因此，规范身份、可用性、公开链接和对象族归属始终属于目录数据，不会形成第二套文字权威来源。

<ProtocolCatalog />

### Worker 会话运行时说明 {#worker-session-runtime-notes}

此 schema 涵盖 Worker 会话能力发现、生命周期封装、任务亲和性快照和操作人员可见信息。其稳定标识符是 durable-workflow.v2.worker-sessions-runtime。

### 本地活动运行时说明 {#local-activity-runtime-notes}

此 schema 涵盖本地活动能力发现、选项快照、历史标记、重试语义和操作人员可见信息。其稳定标识符是 durable-workflow.v2.local-activity-runtime。

### cluster-info 封装说明 {#cluster-info-envelope-notes}

此 schema 涵盖 GET /api/cluster/info 及该端点提供的嵌套发现清单。其稳定标识符是 durable-workflow.v2.cluster-info-envelope。

## 格式 {#formats}

| 格式 | 用途 |
|---|---|
| OpenAPI 3.1 | 路由、方法、状态码和封装均属于契约的 HTTP 和 JSON 请求响应接口。 |
| JSON Schema 2020-12 | 持久化记录、事件载荷、结果封装、运行时选项及相关对象族。 |
| AsyncAPI 2.6 或更新版本 | 轮询、流、租约续期、顺序和投递语义。 |

## 状态级别 {#status-levels}

| 状态 | 含义 |
|---|---|
| published | 公开机器可读规范已在 spec_url 提供，可直接消费。 |
| in_progress | 已提供公开规范，但覆盖范围尚不完整。列出的字段和路由具有规范效力。 |
| planned | 条目有稳定的目录身份，但尚无可消费规范。计划中的条目不声明 spec_url。 |

## 演进规则 {#evolution-rules}

additive_minor_breaking_major 允许在次版本中进行增量变更。删除、重命名、收窄类型和语义变更需要主版本发布，并应在可行时使用并行路由或字段。

parallel_primitive_only 约束已冻结的线格式。破坏性结构必须通过新的事件类型、命令类型或 schema 标识符引入，同时原格式仍可解码。

experimental_any_release 仅适用于明确标记为实验性的规范，允许在任何发布中变更。

## 发布验证 {#release-validation}

文档站点 CI 执行以下机器检查：

| 门槛 | CI 检查内容 |
|---|---|
| catalog_aligned_with_surface_families | 每个条目都引用已声明的公开兼容性族。 |
| owner_repo_known | 条目和对象族的所属方使用目录词汇表。 |
| format_known | 每个可用产物都能按照其声明的格式解析。 |
| public_spec_references_resolve | 每个可用 spec_url 都是公开协议规范命名空间中的 HTTPS URL，并可解析到随发行交付且身份与 spec_id 匹配的产物。 |
| repository_local_authority_fields_rejected | 已发布条目不含仓库本地路径、实现符号、测试引用或旧版权威字段。 |
| workflow_package_mirror_aligned | 当相应发布输入可用时，公开目录与 Workflow 软件包内目录一致。 |
| server_owned_spec_mirrors_aligned | 当所属仓库输入可用时，Server 所属的已发布产物与所属仓库镜像一致。 |
| diagnostic_provenance_complete | 仅用于验证的来源信息覆盖每个目录条目和对象族。 |
| object_family_metadata_declared | 目录条目和已发布文档对对象族名称及所属方的声明一致。 |
| rendered_retrieval_surfaces_aligned | 构建后的 2.0 页面和完整 2.0 模型检索包公开每个可用条目的目录身份、公开 URL 和对象族归属。 |
| breaking_change_release_consistent_with_evolution_rule | 每个破坏性变更发布值都与演进规则相符。 |
| deliverable_specs_published | 每个必需的平台接口都有已发布、可解析的规范。 |

机器检查加载公开 JSON 目录，验证其词汇表和对使用方安全的引用，解析随发行交付的规范，检查对象族和嵌入 schema 元数据，并在软件包镜像可用时比较它们。站点和模型包生成后，语义检查将其渲染的目录值与同一个 JSON 权威来源比较。文档正文和标题文字不参与比较。

契约变更时，一起更新 Workflow 软件包内目录、此公开 JSON 镜像以及受影响的已发布规范产物。人工审查确认解释性正文仍然有用，但不将其当作机器权威来源。

继续阅读[平台一致性套件](/docs/platform-conformance)，解析用于验证这些协议规范、以字节绑定的当前有效夹具。该套件单独标识历史夹具证据，它们不能替代当前目录权威来源。
