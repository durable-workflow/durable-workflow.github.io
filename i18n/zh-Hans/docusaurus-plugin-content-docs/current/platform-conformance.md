---
sidebar_position: 19
title: 平台一致性套件
description: Durable Workflow v2 一致性套件清单、夹具目录、测试框架规则和发布门槛的公开权威来源。
tags:
  - compatibility
  - conformance
  - protocols
  - api-stability
keywords:
  - 平台一致性套件
  - 一致性测试框架
  - 一致性夹具
  - Durable Workflow 兼容性
  - platform-conformance-contract
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import platformConformanceContract from '@site/static/platform-conformance-contract.json';

# 平台一致性套件 {#platform-conformance-suite}

本页是 Durable Workflow **平台一致性套件**的公开权威来源，为宣称兼容 Durable Workflow v2 的实现定义一致性目标矩阵、可复用夹具目录、测试框架契约、通过/失败规则和发布门槛。

<PublicAuthorityIdentity
  manifest={platformConformanceContract}
  manifestUrl="https://durable-workflow.github.io/platform-conformance-contract.json"
/>

独立 Server 在 `GET /api/cluster/info` 的 `platform_conformance_suite` 下声明同一清单。[平台协议规范](/docs/platform-protocol-specs)目录将该嵌套清单列为 `cluster_info_envelope` 规范中的 `platform_conformance_suite_manifest` 对象族。

套件从属于[版本兼容性](/docs/compatibility)权威规则。凡是套件列举接口族或稳定性规则之处，都必须与接口稳定性契约一致。兼容性权威来源定义契约是什么；本页定义实现如何证明自己遵循该契约。

<WorkerProtocolAuthorityRoles />

## 公开一致性权威来源 {#public-conformance-authorities}

套件通过 schema 身份和公开 URL 注册稳定的机器可读权威来源。与框架无关的 PHP SDK 权威契约发布为 [`durable-workflow.v2.php-sdk-conformance-contract`](pathname:///platform-conformance/php-sdk-conformance.json)。它声明评估 `durable-workflow/sdk` 对已发布独立 Server 时所使用的已发布软件包拓扑、场景和证据要求，以及公开运行器和结果 schema 标识符。

## 目标矩阵 {#target-matrix}

一致性**目标**是一类可宣称 Durable 兼容性的实现。一个实现可宣称多个目标。例如，独立 Server 宣称 `standalone_server`、`worker_protocol_implementation` 和 `repair_actionability_surface`。

| 目标 | 必需接口族 | 必需夹具类别 |
| --- | --- | --- |
| `standalone_server` | `server_api`, `worker_protocol`, `cluster_info_manifests` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `worker_task_lifecycle`, `failure_repair_actionability` |
| `embedded_engine` | `history_event_wire_formats` | `history_replay_bundles` |
| `official_sdk` | `official_sdks`, `worker_protocol`, `history_event_wire_formats` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `worker_task_lifecycle`, `history_replay_bundles` |
| `worker_protocol_implementation` | `worker_protocol`, `history_event_wire_formats` | `worker_task_lifecycle`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `history_replay_bundles` |
| `cli_json_client` | `cli_json` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `cli_json_envelopes` |
| `waterline_contract_surface` | `waterline_api` | `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `namespace_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `waterline_observer_envelopes` |
| `repair_actionability_surface` | `worker_protocol`, `server_api` | `failure_repair_actionability` |
| `mcp_discovery_surface` | `mcp_discovery_results` | `mcp_discovery_envelopes` |
| `prerelease_release_candidate` | `server_api`, `official_sdks`, `cli_json`, `waterline_api`, `cluster_info_manifests` | `skew_refusal_matrix_contract`, `workflow_update_runtime_contract`, `principal_attribution_contract`, `prerelease_readiness_contract` |

目标是稳定的。新增目标、给现有目标添加必需接口、添加必需夹具类别、将临时类别提升为必需类别、修改稳定运行时场景的 `operations` 或 `pass_criteria`、修改稳定运行时场景的公开要求字段（`artifact_policy`、`common_result_evidence`、`required_matrix`、`scenario_requirements` 或 `host_runner_contract`），或修改通过/失败规则，都属于套件契约变更，必须提升清单版本。

## 夹具目录 {#fixture-catalog}

每个稳定来源都是公开产物，在套件目录中有三个机器可读绑定：`artifact_id`、`resolver_url` 和 `sha256`。运行时产物 ID 以套件版本结尾，协议产物 ID 以平台协议目录版本结尾。使用方通过获取 `resolver_url` 解析产物，只有字节的 SHA-256 摘要与目录绑定匹配时才接受。

| 类别 | 状态 | 使用方可解析的权威来源 |
| --- | --- | --- |
| `control_plane_request_response` | `stable` | [`durable-workflow.v2.control-plane-api@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/control-plane-api.openapi.yaml) |
| `worker_task_lifecycle` | `stable` | [`durable-workflow.v2.worker-protocol-api@catalog-16`](https://durable-workflow.github.io/platform-protocol-specs/v1.19/worker-protocol-api.openapi.yaml) |
| `worker_task_lifecycle` | `stable` | [`durable-workflow.v2.worker-protocol-stream@catalog-16`](https://durable-workflow.github.io/platform-protocol-specs/v1.19/worker-protocol-stream.asyncapi.yaml) |
| `signal_query_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/signal_query_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/signal-query-runtime-scenarios.json) |
| `workflow_update_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/workflow_update_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/workflow-update-runtime-scenarios.json) |
| `search_attribute_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/search_attribute_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/search-attribute-runtime-scenarios.json) |
| `schedules_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/schedules_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/schedules-runtime-scenarios.json) |
| `history_replay_bundles` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/history_replay_bundles@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/replay-runtime-scenarios.json) |
| `history_replay_bundles` | `stable` | [`durable-workflow.v2.history-event-payloads@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/history-event-payloads.schema.json) |
| `history_replay_bundles` | `stable` | [`durable-workflow.v2.replay-bundle@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/replay-bundle.schema.json) |
| `namespace_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/namespace_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/namespace-runtime-scenarios.json) |
| `child_workflow_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/child_workflow_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/child-workflow-runtime-scenarios.json) |
| `worker_versioning_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/worker_versioning_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/worker-versioning-runtime-scenarios.json) |
| `saga_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/saga_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/saga-runtime-scenarios.json) |
| `migration_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/migration_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/migration-runtime-scenarios.json) |
| `skew_refusal_matrix_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/skew_refusal_matrix_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/skew-refusal-matrix-scenarios.json) |
| `prerelease_readiness_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/prerelease_readiness_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/prerelease-readiness-scenarios.json) |
| `failure_repair_actionability` | `stable` | [`durable-workflow.v2.repair-actionability-objects@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/repair-actionability-objects.schema.json) |
| `cli_json_envelopes` | `stable` | [`durable-workflow.cli.output-schema-manifest@3`](https://durable-workflow.github.io/cli-json-envelopes/v3/manifest.json) |
| `principal_attribution_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/principal_attribution_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/principal-attribution-scenarios.json) |

套件行保留 CLI schema 修订 v3，作为不可变历史证据。当前 CLI 契约是 [`durable-workflow.cli.output-schema-manifest@4`](https://durable-workflow.github.io/cli-json-envelopes/v4/manifest.json) 闭包，它发布仅 Avro 的负载字段，不重写 v2 或 v3 字节。

当前一致性套件 Worker 协议目标使用 `durable-workflow.v2.worker-protocol-api@catalog-16` 和 `durable-workflow.v2.worker-protocol-stream@catalog-16` 记录的生命周期中立协议 1.19 字节。协议修订 1.15 至 1.18 仍可通过套件历史保留的版本化解析 URL 获取。这些版本化夹具不能替代无版本前缀的当前已发布 Server 协议权威来源。之前带 beta 表述的字节只通过套件清单中明确标识为历史的 [`durable-workflow.v2.worker-protocol-api@catalog-16-beta-history`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/e990bc36731463cc5b2cb2a9175dbccfdea61704/static/platform-protocol-specs/worker-protocol-api.openapi.yaml) 绑定保留。

计划中的 `waterline_observer_envelopes` 和 `mcp_discovery_envelopes` 类别仍为 `provisional`。它们计划使用的源码树位置是不具规范效力的占位信息：测试框架不得将其解析为夹具，也不得用于稳定一致性声明。

## 工作流生命周期发布权威来源 {#workflow-lifecycle-release-authority}

确切已发布工作流生命周期场景的权威定义[以 JSON 发布](https://durable-workflow.github.io/platform-conformance/workflow-lifecycle-scenarios.json)，记录在当前已发布 Server、PHP SDK 和 Rust SDK 发布边界上执行的生命周期要求。

PHP 分片从 Packagist 将当前产物组合指定的确切 `durable-workflow/sdk` 软件包安装到一次性 Composer 项目中。它对匹配的公开 Server 镜像运行独立 PHP 客户端和 Worker 进程，记录 Packagist 分发及官方 `apache/avro` 来源，并且必须报告 `local_product_source_checkouts_used=false`。

Rust 分片从 crates.io 安装当前产物组合指定的确切 crate，记录该 crate 及官方 `apache-avro` crate 的注册表来源和校验和。负载证明使用由 `apache-avro` 支撑的 SDK 已发布 Avro 封装；自定义编解码器实现或本地产品检出不属于可接受来源。

Rust 分片必须执行并报告以下全部单元：

- 通过公开 SDK 命令执行 `instance_cancel` 和 `instance_terminate`。
- `selected_run_guard` 和 `stale_run_rejection`，确保所选运行实例不能与工作流实例的当前运行混淆。
- `typed_failed`、`typed_cancelled`、`typed_terminated` 和 `typed_timed_out`，以携带工作流和运行身份的类型化终态结果呈现。
- `cancellation_heartbeat` 和 `late_activity_completion_refused`，让活动代码观察到取消，且迟到完成不能覆盖终态结果。
- 在取消收尾尚未完成时执行 `worker_restart_during_cancellation`，证明替代 Worker 不会重新领取已关闭活动。

清单还要求确切产物与 Server 版本、集群身份、安装来源、工作流身份、逐单元结果、稳定原因、负载契约、执行器拓扑、Rust 分片契约版本、运行器身份和分片退出状态。缺失、不受支持、runner-blocked 或未成功的 Rust 证据都不能满足生命周期类别。

某夹具类别只有在目标列出它且类别状态不是 `provisional` 时，才是该目标的必需项。临时类别发出提示警告，只有在后续套件版本中提升至 `stable` 后才成为强制依据。

`signal_query_runtime_contract` 类别是稳定的。其结果必须记录具体、固定的已发布产物版本，并将每个必需场景标为 `pass`、`fail`、`unsupported`、`not_covered` 或 `runner_blocked`，同时链接发现。`latest`、`current`、`head`、`<latest>`、`${VERSION}` 或 `{{ version }}` 等占位或未解析版本令牌无法通过结果门槛。只有 `pass` 单元计入类别通过结果：
`published_artifact_install_only`、`python_worker_cli_and_sdk_baseline`、`php_worker_cli_and_sdk_baseline`、`python_worker_php_facing_and_cli_clients`、`php_worker_python_and_cli_clients`、`rust_worker_rust_php_python_clients`、`python_worker_rust_client`、`php_worker_rust_client`、`rust_query_error_and_immutability`、`ordered_signal_delivery`、`dedup_contract_observation`、`signal_during_replay`、`query_during_replay`、`rust_replayed_instance_state_query_after_cold_restart`、`completed_run_signal_and_query`、`unknown_signal_and_query_errors`、`malformed_signal_and_query_payloads` 和 `waterline_operator_visibility`。

这些场景 ID 和通过标准以机器可读运行时场景清单发布在 [`static/platform-conformance/signal-query-runtime-scenarios.json`](pathname:///platform-conformance/signal-query-runtime-scenarios.json)。实现测试可以执行这些场景，但不是外部测试框架的稳定夹具来源。

Rust 单元从 crates.io 安装运行时场景清单声明的确切 `durable-workflow` crate 版本，并记录 SDK 及解析出的 `apache-avro` 依赖的 Cargo 注册表来源和校验和。基于快照的查询传输由 `rust_worker_rust_php_python_clients` 和 `rust_query_error_and_immutability` 评估。它不是重放后的工作流实例状态。独立的 `rust_replayed_instance_state_query_after_cold_restart` 单元使用 `register_replayed_workflow` 和 `register_replayed_query`，冷停止后启动全新 Rust Worker 进程，恢复持久历史，并通过 Rust、PHP 和 Python 调用方比较运行中、已恢复和已完成状态。成功和失败查询序列都在第一次成功的受测查询前捕获历史与工作流命令数量，并必须使这些数量保持不变。

对于 `completed_run_signal_and_query`，正常完成且有可重放已声明查询处理器的运行实例，必须通过每个声称支持的公开查询接口返回最终查询状态。稳定终态错误仅对明确不受支持的终态或不可用处理器有效；对于可重放的已完成运行实例，通用已完成运行终态错误不能算通过。

`workflow_update_runtime_contract` 是稳定运行时场景类别。其结果必须使用已发布产物，固定 Server、CLI、Python SDK、PHP SDK 和 Waterline 版本，声明是否使用本地产品源码检出，并将每个必需更新场景标为 `pass`、`fail`、`unsupported`、`not_covered` 或 `runner_blocked`，同时链接发现。通过的更新证据必须执行公开控制平面、历史、CLI/SDK 和操作人员可读接口；本地源码执行不计入。

必需工作流更新场景涵盖：已发布产物安装、已声明更新契约可见性、已接受更新的控制平面与历史证据、运行或等待中的操作可见性、已完成结果往返、失败或拒绝结果、重复请求或幂等行为、未知更新拒绝、无效输入拒绝、负载封装往返、终态工作流行为、已验证主体归属、PHP 客户端/Worker 对等性、Python 客户端/Worker 对等性和操作诊断。SDK 若缺少第一类更新支持，结果必须报告类型化不支持单元及聚焦的 SDK 发现，不得悄悄省略该语言。

这些场景 ID 和通过标准以机器可读运行时场景清单发布在 [`static/platform-conformance/workflow-update-runtime-scenarios.json`](pathname:///platform-conformance/workflow-update-runtime-scenarios.json)。在已注册宿主运行器能够安装固定的已发布产物并驱动完整工作流更新矩阵之前，当前宿主运行器交接刻意保持 `runner_blocked`。

`search_attribute_runtime_contract` 是稳定运行时场景类别。结果必须使用已发布产物，覆盖 PHP 和 Python 工作流启动/upsert 行为、CLI 查询与错误接口、Waterline 操作可见性、跨语言编解码往返、相等/范围/布尔查询、OR/NOT 语法、关键词列表成员关系、类型安全、索引延迟分布、负载下延迟、命名空间隔离、保留名称拒绝和查询注入加固。Python/Server 冒烟子集不符合契约，直到每个必需单元均记录为 `pass`、`fail`、`unsupported`、`not_covered` 或 `runner_blocked`，并链接发现。只有 `pass` 单元计入类别通过结果。

这些搜索属性场景 ID 和通过标准发布在 [`static/platform-conformance/search-attribute-runtime-scenarios.json`](pathname:///platform-conformance/search-attribute-runtime-scenarios.json)。

`schedules_runtime_contract` 是稳定运行时场景类别。结果必须使用已发布产物，覆盖 cron 周期、固定速率周期、列表与描述可见性、暂停/恢复窗口内无触发、删除停止后续触发、错过触发策略、重启后保留、CLI 计划操作、Python SDK 计划操作、面向 PHP 的计划操作、Python 创建的 PHP 工作流触发、PHP 创建的 Python 工作流触发、无效 cron 拒绝和不存在工作流类型的结果。计划生命周期冒烟子集不符合契约，直到每个必需单元均记录为 `pass`、`fail`、`unsupported`、`not_covered` 或 `runner_blocked`，并链接发现。只有 `pass` 单元计入类别通过结果。

这些计划场景 ID 和通过标准发布在 [`static/platform-conformance/schedules-runtime-scenarios.json`](pathname:///platform-conformance/schedules-runtime-scenarios.json)。

`history_replay_bundles` 也是稳定运行时场景类别。结果必须使用已发布产物，覆盖 PHP 和 Python 对已完成历史、Worker 重启、活动、信号/更新、等待条件、版本标记、saga 补偿、明确代码分歧拒绝、Server 端历史修改拒绝、格式错误历史拒绝及进行中信号重启时序的重放。黄金历史冒烟子集不符合契约，直到每个必需单元均记录为 `pass`、`fail`、`unsupported`、`not_covered` 或 `runner_blocked`，并链接发现。只有 `pass` 单元计入类别通过结果。

这些重放场景 ID 和通过标准发布在 [`static/platform-conformance/replay-runtime-scenarios.json`](pathname:///platform-conformance/replay-runtime-scenarios.json)。

`namespace_runtime_contract` 是稳定运行时场景类别。结果必须使用已发布产物，覆盖命名空间创建/更新/描述/列表、生命周期清理和重建、工作流可见性和变更隔离、PHP Worker 任务队列隔离、CLI 命名空间上下文和默认范围行为、SDK 命名空间选择对等性、搜索属性 schema 和值查询隔离、计划隔离、Waterline/操作人员范围可见性、明确的 Nexus 跨命名空间调用、保留名称拒绝及产品发现的结果记录路由。命名空间冒烟子集不符合契约，直到每个必需单元均记录为 `pass`、`fail`、`unsupported`、`not_covered` 或 `runner_blocked`，并链接发现。只有 `pass` 单元计入类别通过结果。

Waterline/操作人员范围可见性的非规范性实现说明可以来自已发布 Waterline 产物或聚焦的 Waterline 分片。对审查者有用的捕获包括：限定范围的工作流列表和详情、产品公开时的计划视图、搜索属性值、仪表板范围、操作 API stats，以及产品声明的任何默认或未限定范围视图的记录判定；规范性通过标准仍是下述 `waterline_operator_namespace_visibility` 场景。

这些命名空间场景 ID 和通过标准发布在 [`static/platform-conformance/namespace-runtime-scenarios.json`](pathname:///platform-conformance/namespace-runtime-scenarios.json)。

`child_workflow_runtime_contract` 是稳定运行时场景类别。结果必须使用已发布产物，覆盖同语言 PHP 和 Python 父子运行、PHP 到 Python 及 Python 到 PHP 父子运行、子失败往返类型、父取消传播到子、父观察直接子取消、等待子工作流时跨父 Worker 重启的重放、并发扇出五个子工作流，以及命名空间行为。单个父子冒烟测试不符合契约，直到每个必需单元均记录为 `pass`、`fail`、`unsupported`、`not_covered` 或 `runner_blocked`，并链接发现。只有 `pass` 单元计入类别通过结果。

这些子工作流场景 ID 和通过标准发布在 [`static/platform-conformance/child-workflow-runtime-scenarios.json`](pathname:///platform-conformance/child-workflow-runtime-scenarios.json)。

`saga_runtime_contract` 是稳定运行时场景类别。结果必须使用已发布产物，覆盖正向成功、后续步骤失败后逆序补偿、早期步骤失败时无额外补偿、补偿重试幂等性、补偿失败终态可见性、补偿中途 Worker 重启、PHP 工作流到 Python 补偿、Python 工作流到 PHP 补偿、类型化补偿错误往返，以及操作人员可见的进行中补偿状态。仅证明一条正常路径或一个 SDK 的 saga 冒烟测试不符合契约，直到每个必需单元均记录为 `pass`、`fail`、`unsupported`、`not_covered` 或 `runner_blocked`，并链接发现。只有 `pass` 单元计入类别通过结果。PHP 软件包在运行时矩阵中标识为 `workflow-php`，与平台发布产物集比较时也可记录为 `workflow`。

这些 saga 场景 ID 和通过标准发布在 [`static/platform-conformance/saga-runtime-scenarios.json`](pathname:///platform-conformance/saga-runtime-scenarios.json)。

`worker_versioning_runtime_contract` 是稳定运行时场景类别。结果必须使用已发布产物，覆盖 Worker build-ID 注册、操作人员发布可见性、排空/恢复控制、逐运行兼容性固定、仅由兼容 Worker 重放、新启动的提升版本路由、缓存驱逐后重放、无兼容 Worker 诊断、CLI 和 Waterline 可见性接口、PHP/Python 跨语言固定、对抗性的未提升版本行为，以及历史 API 版本固定。Worker 版本管理冒烟子集不符合契约，直到每个必需单元均记录为 `pass`、`fail`、`unsupported`、`not_covered` 或 `runner_blocked`，并链接发现。只有 `pass` 单元计入类别通过结果。

PHP/Python 跨语言固定证据必须记录 Worker 运行时身份、工作流和运行 ID、任务队列发布状态、用于验证固定的公开轮询和发布结果、已发布 Worker 产物安装来源和版本，并确认未使用本地产品源码检出。

这些 Worker 版本管理场景 ID 和通过标准发布在 [`static/platform-conformance/worker-versioning-runtime-scenarios.json`](pathname:///platform-conformance/worker-versioning-runtime-scenarios.json)。

`migration_runtime_contract` 是稳定运行时场景类别。结果必须使用已发布产物，覆盖最新受支持 v1 状态准备、文档所述迁移步骤、已完成历史保留和重放、进行中工作流推进、活动中途重试状态、信号或定时器等待状态、计划周期、Worker 注册投影、Waterline 操作可见性、CLI 访问升级前状态、新 v2 工作流启动、考虑队列的回滚语义，以及对不受支持版本偏差的明确拒绝。回滚证据必须盘点就绪、延迟和已保留 v1 队列工作；记录恢复边界是已排空、捕获为应用一致的 SQL 加队列切点，还是接受为不可恢复；并证明每条恢复的非终态 v1 行都有可运行队列或信号唤醒路径。符合条件的过期 `pending` 行，仅在证据观察到 Worker 循环分发默认启用的 Watchdog、Watchdog 在五分钟过期边界后重新分发该工作流，以及行在记录的队列上推进时，才可改用受支持的 v1.0.77 Watchdog。该仅 pending 路径不能替代重试、定时器或 `waiting`/`running` 工作所需保留队列状态。仅当恢复切点不存在其他依赖队列的非终态 v1 执行时，仅 SQL 恢复才是通过的回滚证据。恢复清单只能记录 `APP_KEY` 密钥管理器引用和版本；密钥与恢复凭据应与 SQL 和队列备份分开进行访问控制。全新安装冒烟测试，或不从真实 v1 状态开始的迁移运行，都不符合契约，直到每个必需单元均记录为 `pass`、`fail`、`unsupported`、`not_covered` 或 `runner_blocked`，并链接发现。只有 `pass` 单元计入类别通过结果。

文档步骤单元必须记录当前指南命令列表、按指南顺序实际执行的命令、退出码和逐命令耗时。前后状态快照必须包含观察到的已完成历史、进行中工作流、重试活动、信号或定时器等待、计划和 Worker 注册单元。

这些迁移场景 ID 和通过标准发布在 [`static/platform-conformance/migration-runtime-scenarios.json`](pathname:///platform-conformance/migration-runtime-scenarios.json)。

`skew_refusal_matrix_contract` 是稳定运行时场景类别。结果必须使用已发布产物，覆盖 CLI、Python SDK、独立 PHP SDK Worker 和 Waterline 接口的兼容、向后偏差、向前偏差及窗口外组合。Workflow 只作为嵌入式 Laravel 和 Waterline 引擎存在。还必须探测未来版本边界，捕获每个偏差操作的请求和响应，将 Worker 偏差归类为 `register_refused`、`register_and_serve` 或 `register_and_drop`，将 Waterline 偏差归类为 `banner`、`render_refused` 或 `stale_render`。协议清单冒烟子集不符合契约，直到每个必需单元均记录为 `pass`、`fail`、`unsupported`、`not_covered` 或 `runner_blocked`，并链接发现。只有 `pass` 单元计入类别通过结果；`register_and_drop` 以及没有明显警告的 `stale_render` 都是阻塞性产品发现。

这些偏差拒绝场景 ID 和通过标准发布在 [`static/platform-conformance/skew-refusal-matrix-scenarios.json`](pathname:///platform-conformance/skew-refusal-matrix-scenarios.json)。

`principal_attribution_contract` 是稳定运行时场景类别。结果必须使用已发布产物，证明工作流历史对启动、信号、查询、取消、完成、失败、匿名和 Server 来源事件接口记录 Server 派生的主体。必须执行对抗性负载/请求头伪造、alice/bob 命名身份、凭据轮换、CLI 操作可见性、Waterline 操作可见性，以及通过 Python SDK 和 PHP `DurableWorkflow\Client` 进行已验证启动或信号操作。SDK 单元必须记录软件包版本、操作输出、历史/API 主体样本和原始 HTTP 参考主体，让测试框架比较主体结构及预期主体 ID。PHP 单元必须将 `durable-workflow/sdk` 解析为确切 Packagist 分发，记录 dist 类型、URL 和引用。`durable-workflow/workflow` 仅为嵌入式 Laravel 和 Waterline 引擎单独解析。角色令牌冒烟子集不符合契约，直到每个必需场景均记录为 `pass`、`fail`、`unsupported`、`not_covered` 或 `runner_blocked`，并链接发现。

这些主体归属场景 ID 和通过标准发布在 [`static/platform-conformance/principal-attribution-scenarios.json`](pathname:///platform-conformance/principal-attribution-scenarios.json)。

`prerelease_readiness_contract` 是面向协调 2.0 候选发布的稳定运行时场景类别。结果只能使用已发布产物和面向用户的公开文档，分别记录 Workflow 和 Waterline 的 GO / NO-GO 判定，覆盖核心功能完整性、迁移就绪、公开 API 稳定性、文档准确性、配置可理解性和跨组件兼容性，并将 Server、CLI、PHP、Python 和 Rust SDK、Workflow、Waterline、示例应用和公开文档作为一个生态产物组合评估。还必须根据当前公开文档执行每个版本化 2.0 独立快速入门路径，以及单独的嵌入式 Laravel 路径，在 10 分钟内观察到工作流完成，并记录确切命令、输出、产物版本、软件包来源和实际耗时。仅发现信息的快速入门检查不符合契约，直到 PHP、Python、Rust 和 Laravel 快速入门场景都记录为 `pass`、`fail`、`unsupported`、`not_covered` 或 `runner_blocked`。
任何缺失产物、过期文档页面、未记录的迁移步骤、可安装性缺口、API 不稳定、跨组件破坏性变更风险或发布渠道不匹配，都必须记录为非通过单元并链接发现。只有运行器自身证据不符合契约，不能让预发布就绪状态变为通过。

这些预发布就绪场景 ID 和通过标准发布在 [`static/platform-conformance/prerelease-readiness-scenarios.json`](pathname:///platform-conformance/prerelease-readiness-scenarios.json)。简明的 [2.0 快速入门](/docs/quickstart/)是公开入门路径。

## 通过/失败规则 {#pass--fail-rules}

1. **`guaranteed_field_equality`。** 夹具 schema 中标记为保证的每个字段，都必须存在于实现响应中，类型正确且值相等。忽略仅诊断字段。
2. **`unknown_additive_fields_tolerated`。** 额外字段只有在文档标为仅诊断，或夹具所在稳定性级别允许增量演进时才通过。
3. **`frozen_shape_exact_match`。** 由 `frozen` 接口族支撑的夹具必须完全匹配。冻结结构不匹配始终是失败。
4. **`required_fixtures_must_pass`。** 声称某个目标的发布必须通过该目标的每个必需夹具类别。任何一个必需夹具失败，都意味着该发布不符合该目标。
5. **`stable_runtime_scenario_coverage`。** 稳定运行时类别必须报告其声明的每个必需场景，使用运行时场景清单发布的状态之一：`pass`、`fail`、`unsupported`、`not_covered` 或 `runner_blocked`。完全一致要求每个必需场景都通过。仅冒烟子集、省略场景、不支持的公开接口、未覆盖单元或 runner-blocked 单元都不符合契约，必须链接所属发现。这组状态及运行时仅通过才计入的规则，是套件版本 5+ 的语义。
6. **`provisional_categories_warn_only`。** 临时类别中夹具失败发出警告，不阻止发布。
7. **`diagnostic_only_mismatches_pass`。** 仅诊断字段不同时，测试框架在 `diagnostic_diff` 中记录差异，夹具通过。

测试框架结果声明四种一致性级别之一：

| 级别 | 含义 |
| --- | --- |
| `full` | 每个声称目标的每个必需夹具都通过。 |
| `partial` | 至少一个声称目标的每个必需夹具都通过，但另一个声称目标失败。 |
| `provisional` | 只有临时类别失败；必需类别全部通过。 |
| `nonconforming` | 每个声称目标都至少有一个必需夹具失败。 |

## 测试框架契约 {#harness-contract}

符合要求的测试框架：

- 从 `GET /api/cluster/info` 的 `platform_conformance_suite` 加载套件清单，离线运行则从静态镜像加载；
- 从事实来源路径加载每个声明的夹具；
- 通过夹具记录的操作驱动实现；
- 按上述通过/失败规则比较响应；
- 每次运行输出一个结果文档，包含 schema `durable-workflow.v2.platform-conformance.result`、套件版本、实现身份、逐夹具结果、诊断差异和整体一致性级别；
- 当且仅当一致性级别为 `nonconforming` 时以非零状态退出。

结果文档是一项产物。只有结果针对实现构建及该构建所指定套件版本生成时，兼容性声明才有效。

## 发布门槛 {#release-gates}

| 发布 | 必须声称的目标 | 必需产物 |
| --- | --- | --- |
| `durable-workflow/server` | `standalone_server`, `worker_protocol_implementation`, `repair_actionability_surface` | 附在发布中的测试框架结果文档。 |
| `durable-workflow/workflow` | `embedded_engine` | 附在发布中的测试框架结果文档。 |
| `durable-workflow/sdk` | `official_sdk`, `worker_protocol_implementation` | 附在发布中的测试框架结果文档。 |
| `durable_workflow` | `official_sdk`, `worker_protocol_implementation` | 附在发布中的测试框架结果文档。 |
| `dw` | `cli_json_client` | 附在发布中的测试框架结果文档。 |
| `waterline` | `waterline_contract_surface` | 附在发布中的测试框架结果文档。 |
| `durable-workflow/2.0-release-candidate` | `prerelease_release_candidate` | 一致性记录保存已发布产物的预发布就绪结果。 |

发布审查者确认已附上测试框架结果，一致性级别为 `full` 或 `provisional`，且结果中的套件版本与受测构建公开的版本一致。`nonconforming` 结果阻止发布。

## 发布检查 {#release-check}

文档站点发布检查 `scripts/check-platform-conformance-authority.js` 在静态清单指向缺失、仓库本地、仅版本别名或非文档站点权威来源时使构建失败。它还验证每个稳定夹具级 `authority_doc` 值是当前版本文档站点权威 URL，并在每个稳定夹具类别中拒绝仓库相对源码树、测试夹具、文档、schema 目录、无版本产物 ID、非公开解析地址和错误字节摘要。运行时类别还必须公开与套件绑定的公开场景清单。同一检查要求本页列出机器可读镜像中的清单 schema、目标名称、夹具类别名称、通过/失败规则和发布门槛。

套件变更时，一起更新本页和 `static/platform-conformance-contract.json`。如果变更新增目标、添加必需夹具类别、将临时类别提升为稳定、修改稳定运行时场景的 `operations` 或 `pass_criteria`、修改稳定运行时场景的公开要求字段（`artifact_policy`、`common_result_evidence`、`required_matrix`、`scenario_requirements` 或 `host_runner_contract`），或修改通过/失败规则，应在同一发布变更中提升套件版本。发布检查按套件版本化摘要固定稳定运行时场景标准和公开运行时要求快照，避免外部测试框架在旧套件版本下看到新标准或证据策略要求。

已发布运行时场景标准和公开要求摘要条目只能追加。推进稳定运行时场景 `operations` 或 `pass_criteria` 时，保持全部现有 `VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS` 条目不变，提高套件版本，将场景清单更新至该版本，并为新的当前套件添加标准摘要条目。修改公开运行时清单证据要求、产物策略、必需矩阵、场景要求字段或宿主运行器契约字段时，保持全部现有 `VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS` 条目不变，提升套件版本，将场景清单更新至该版本，并为新的当前套件添加对应公开要求摘要条目。发布检查将目标分支已发布摘要条目与当前修改比较，因此即使当前套件版本添加了新摘要，编辑或删除旧套件条目仍会失败。

