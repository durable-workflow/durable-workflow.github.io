---
sidebar_position: 19
title: SDK 中立性
description: 长期有效的语言无关契约，让未来的 TypeScript、Go、Java 或 .NET SDK 无需重新设计协议即可使用 Durable Workflow 的公开接口。
tags:
  - compatibility
  - protocols
  - api-stability
  - sdk
  - language-agnosticism
keywords:
  - SDK 中立性
  - 语言无关性
  - 协议中立性
  - 编解码器中立性
  - typescript sdk
  - go sdk
  - java sdk
  - dotnet sdk
  - python sdk
  - PHP 工作流软件包
---

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# SDK 中立性 {#sdk-neutrality}

本页是平台级 SDK 中立性契约的可读指南，列出 Durable Workflow 每个公开接口必须满足的最低中立性规则，以及发布审查者对新的 Server、Workflow、CLI、Waterline 和 MCP 接口执行的长期语言无关性审查。

上游架构指南位于 [`sdk-neutrality.md`](https://github.com/durable-workflow/workflow/blob/main/docs/architecture/sdk-neutrality.md)。供使用方消费的机器可读权威契约由本站发布在 [`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json)，schema ID 为 `durable-workflow.v2.sdk-neutrality.contract`。其协议和 SDK 覆盖范围的权威来源是 Workflow Composer 软件包中的 `resources/sdk-neutrality-contract.json`。公开镜像从集中维护的文档产物组合中补充当前软件包分发元数据。独立 Durable Workflow Server 在 `GET /api/cluster/info` 的 `sdk_neutrality_contract` 下重新导出软件包内的基础清单。如果本页与已发布 JSON 契约不一致，以 JSON 契约为准，并将不一致视为文档错误。

本契约遵循[版本兼容性](/docs/compatibility)的权威规则（定义*哪些*接口公开，以及*如何*变更），以及[平台协议规范](/docs/platform-protocol-specs)目录（定义每个接口的规范性规范*位于何处*）。本契约规定这些规范允许采用*何种形式*，让当前 PHP、Python 和 Rust 之外的未来 SDK 能够使用它们而无需重新设计协议。

## 为什么需要它 {#why-this-exists}

Durable 提供三个第一方独立 SDK：PHP `durable-workflow/sdk` 软件包、Python `durable_workflow` 软件包，以及 Rust `durable-workflow` crate。单独的 PHP `durable-workflow/workflow` 软件包仍是嵌入式 Laravel 引擎和重放的负责方，它不是与框架无关的 PHP SDK。构建或维护广泛的第一方 SDK 阵容**不是**发布目标。TypeScript、Go、Java 和 .NET 生态的 SDK 需求尚未得到证实，而维护广泛官方 SDK 阵容的成本很高。

本契约防范的是另一种故障：这些 SDK 底层的公开契约悄悄固化了特定语言的假设。如果未来值得构建 TypeScript 或 Go SDK，工作应是“根据已发布的线协议编写新客户端”，而不应是“重新设计协议，使另一种语言能够与之通信”。

## 范围 {#scope}

| 范围键 | 含义 |
| --- | --- |
| `goal` | 保持协议和契约中立性，让未来的 TypeScript、Go、Java 或 .NET SDK 无需重新设计协议即可存在。 |
| `non_goal` | 交付庞大的官方 SDK 组合。第一方 SDK 覆盖范围刻意收窄，只有实际采用需求足以支撑时才扩展。 |
| `present_priority` | 对现有用户而言，Python 是当前价值最高的非 PHP 路径，视为一致性覆盖的优先接口。 |
| `future_posture` | TypeScript、Go、Java、.NET 和其他语言以需求为驱动。它们没有预留发布名额，但每个公开契约都必须允许未来用这些语言编写 SDK，而不破坏线协议。 |

## 官方 SDK 覆盖范围策略 {#official-sdk-breadth-policy}

官方 SDK 阵容刻意保持精简：

| 语言 | 策略 | 已发布软件包 | 一致性权威来源 |
| --- | --- | --- | --- |
| PHP | `priority` | [`durable-workflow/sdk`](https://packagist.org/packages/durable-workflow/sdk) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json)，参与方 `sdk_php`、`php_sdk_client` 和 `php_worker` |
| Python | `priority` | <PythonPackageReleaseLink>`durable_workflow` %%artifact.pythonPublishedSdkVersion%%</PythonPackageReleaseLink> | [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json)，参与方 `python_sdk_runtime` |
| Rust | `priority` | [`durable-workflow`](https://crates.io/crates/durable-workflow) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json)，参与方 `rust_sdk`、`rust_worker` 和 `rust_sdk_client` |
| TypeScript | `demand_driven` | 无 | 公开契约必须能够在 TypeScript 中实现，无需重新设计协议。 |
| Go | `demand_driven` | 无 | 公开契约必须能够在 Go 中实现，无需重新设计协议。 |
| Java | `demand_driven` | 无 | 公开契约必须能够在 Java 中实现，无需重新设计协议。 |
| .NET | `demand_driven` | 无 | 公开契约必须能够在 .NET 中实现，无需重新设计协议。 |

JSON 契约列出构成 `first_party.php_sdk`、`first_party.python_sdk` 和 `first_party.rust_sdk` 覆盖范围的确切 `scenario_ids`。它单独将 Laravel 软件包跟踪为 `embedded_engines.php_workflow_engine`，其重放覆盖位于参与方 `workflow_php_runtime` 下。使用方可以直接在链接的目录中解析这些标识符，无需克隆 SDK 仓库或阅读其测试套件。

只有满足以下条件才会增加新的第一方 SDK：

1. 有记录在案、现有 SDK 无法满足的用户需求。
2. 候选维护团队承诺持续让 SDK 对齐一致性测试框架、协议规范目录和发布权威清单。
3. 增加 SDK 不需要对 Worker 协议、控制平面、历史事件线格式或重放夹具做破坏性修改。如果需要，错误在协议，而不在 SDK。

## 中立性规则 {#neutrality-rules}

每个公开 Durable 契约都必须满足以下七条中立性规则。确切字段结构以 JSON 清单为准，以下摘要供审查者参考。JSON 清单中每条规则都包含 `requirement`、`rationale`、`how_to_apply` 行和 `authority` 数组。每个权威条目都包含稳定的目录或 schema ID，以及指向已发布产物的绝对 URL。

| 规则 | 要求 |
| --- | --- |
| `protocol_neutrality` | 公开 RPC 和事件接口使用任何支持 HTTP 的运行时都能生成和消费的 HTTP+JSON 或 AsyncAPI 结构。 |
| `codec_neutrality` | 每个跨越公开边界的持久载荷都声明 `avro`。不提供其他公开或引擎特定的 v2 编解码器。 |
| `error_shape_neutrality` | 公开失败对象使用结构化封装（`code`、`message`、可选 `details`）。PHP 和 Python 异常类名仅用于诊断。 |
| `type_identity_neutrality` | 工作流、活动、子工作流和异常类型通过稳定字符串名称标识。类 FQCN 和模块路径只是便于 SDK 输入的形式，不属于契约。 |
| `replay_fixture_neutrality` | 重放夹具和黄金历史包是符合已发布 `history_event_payloads` 和 `replay_bundle` schema 的 JSON。 |
| `discovery_neutrality` | 每个公开接口均可通过 `GET /api/cluster/info` 和 `platform_protocol_specs` 目录发现。 |
| `documentation_neutrality` | 公开契约文档通过 schema、路由和字段语义描述结构。PHP 和 Python 类行为作为 SDK 示例出现，不充当规范性契约。 |

## 长期语言无关性审查 {#standing-language-agnosticism-audit}

每个新的 Server、Workflow、CLI、Waterline 或 MCP 接口，在提升为 `stable` 前都必须通过中立性审查。只要修改涉及审查范围内的接口族，该审查就是发布 PR 的常设审查项。范围包括：

- `server_api`
- `worker_protocol`
- `cli_json`
- `waterline_api`
- `mcp_discovery_results`
- `cluster_info_manifests`

检查清单有八步。七步对应上面的中立性规则。第八步是**未来 SDK 思维实验**：要求审查者用两句话说明，TypeScript 或 Go SDK 如何仅凭已发布的规范目录和标准 HTTP+JSON 工具链消费新接口。如果答案需要第一方 SDK，该接口就不中立，必须调整其结构，或在提升前将中立性缺口记录为已知限制。

## 未来 SDK 依赖什么 {#what-a-future-sdk-relies-on}

契约指定了未来 SDK 必须无需查看任何第一方 SDK 源码就能读取的接口：

- **协议**：已发布[协议目录](https://durable-workflow.github.io/platform-protocol-specs.json)中的 `durable-workflow.v2.control-plane-api`、`durable-workflow.v2.worker-protocol-api` 和 `durable-workflow.v2.worker-protocol-stream`。
- **编解码器**：`durable-workflow.v2.worker-protocol-api` 中记录、通过 `durable-workflow.v2.cluster-info-envelope` 发现 schema 声明的通用编解码器集合。
- **错误结构**：Worker 协议失败封装和 `durable-workflow.v2.repair-actionability-objects` schema。
- **重放输入**：`durable-workflow.v2.history-event-payloads` 和 `durable-workflow.v2.replay-bundle` JSON Schema，以及公开 [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json) 目录中的场景 ID。
- **发现**：`durable-workflow.v2.cluster-info-envelope` 和 `durable-workflow.v2.platform-protocol-specs.catalog` 本身。

如果某种语言的候选 SDK 无法访问其中任何接口，构建 SDK 就需要协议修改，语言无关性保证也就没有兑现。

## 发布门槛 {#release-gates}

引入新公开接口族，或将现有接口从 `prerelease` 或 `experimental` 提升为 `stable` 的发布，必须在发布 PR 中记录审查结果。清单的发布门槛部分列出具体检查：

- `audit_recorded`：发布 PR 描述说明执行了哪些审查步骤，并链接新接口的协议规范目录条目、一致性夹具和发现条目。
- `no_php_or_python_only_required_fields`：`stable` 接口上任何受保证的字段都不要求仅 PHP 或仅 Python 可用的编解码器。
- `universal_codec_advertised`：Worker 协议协商恰好声明一个通用编解码器，即 `avro`。
- `fixture_schema_validated`：新重放夹具或黄金历史包通过已发布 JSON Schema 的验证。
- `discovery_entry_present`：新的公开接口具有 `platform_protocol_specs` 目录条目，且 `surface_family`、`owner_repo` 和 `format` 非空。

约束由机器检查和人工门槛共同落实。发布 CI 解析公开契约中的每个权威 URL、协议/schema ID 和一致性场景 ID；将审查范围与接口稳定性族交叉核对；并拒绝仓库本地权威路径或实现符号。发布审查者在每个添加或提升公开接口的发布 PR 上完成 SDK 中立性审查，且仍负责未来 SDK 思维实验。

## 修改本契约 {#changing-this-contract}

新增中立性规则、收紧现有规则、增加必需审查步骤、向审查范围添加接口族，或修改官方 SDK 覆盖范围策略，都属于契约变更。应提升清单版本，在同一修改中更新架构指南和本页，并对齐 [`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json) 中供使用方消费的契约。删除中立性规则或审查步骤属于主版本变更。
