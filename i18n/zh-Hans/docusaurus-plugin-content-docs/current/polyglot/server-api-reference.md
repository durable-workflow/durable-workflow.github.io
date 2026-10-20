---
sidebar_position: 3
title: Server API 参考
description: Durable Workflow Server 控制平面、Worker 平面、命名空间、存储、计划及系统端点的 HTTP 参考。
tags:
  - server
  - API
  - reference
  - control-plane
keywords:
  - Durable Workflow Server API
  - 控制平面版本头
  - Worker 协议端点
  - 外部负载存储 API
---

# Server API 参考 {#server-api-reference}

独立 Server 提供带版本的 HTTP+JSON API。构建直接调用 Server 的 SDK、脚本、桥接适配器或运维操作手册时，请使用本页。部署和配置见 [Server 指南](/docs/polyglot/server)，调用 `dw` 命令时见 [CLI 命令参考](/docs/polyglot/cli-reference)。

## 请求头与版本管理 {#headers-and-versioning}

除非 Server 配置其他认证驱动，否则所有认证请求都使用 bearer 令牌：

```http
Authorization: Bearer <token>
X-Namespace: default
Content-Type: application/json
Accept: application/json
```

控制平面路由要求：

```http
X-Durable-Workflow-Control-Plane-Version: 2
```

Worker 平面路由要求：

```http
X-Durable-Workflow-Protocol-Version: 1.0
```

Server 通过 `GET /api/cluster/info` 公布受支持版本和机器可读契约。客户端应先在此发现版本，再启动长时间运行的自动化。缺失或不支持的控制平面版本默认拒绝，并返回 `missing_control_plane_version` 或 `unsupported_control_plane_version` 等具名原因。

验证、代码生成和偏移检查应使用规范性的[平台协议规范](/docs/platform-protocol-specs)目录，而非本自然语言参考。该目录链接控制平面 OpenAPI 文档、Worker 协议 OpenAPI 和 AsyncAPI 文档、`cluster_info` JSON Schema，以及相关 MCP、历史、Waterline 和修复/可操作性模式。

## 发现与健康 {#discovery-and-health}

这些路由供负载均衡器、SDK 引导及兼容性检查使用。

| 方法 | 路径 | 认证 | 用途 |
| --- | --- | --- | --- |
| `GET` | `/api/health` | 否 | 存活探测及响应节点的机器可读拓扑摘要。 |
| `GET` | `/api/ready` | 否 | 就绪探测，以及相同拓扑摘要和发布安全引导检查。 |
| `GET` | `/api/cluster/info` | 是 | Server 标识、支持的 SDK 范围、角色拓扑、协调健康摘要、控制平面契约、Worker 协议契约、负载编解码器及功能能力。 |

示例：

<!-- docs-example id="server.cluster-info.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" | jq '.control_plane.version, .worker_protocol.version'
```

`/api/cluster/info` 有意不要求控制平面版本头，因为它就是公布受支持版本的端点。同一响应还包含 `coordination_health`，即跨所有命名空间的发布和就绪摘要，对应已用于 Server 就绪状态的检查。

### 公开拓扑摘要 {#public-topology-summary}

`GET /api/health` 和 `GET /api/ready` 都依据已实现的健康摘要契约返回顶层 `topology` 对象。在控制平面认证、命名空间解析或更全面的 `/api/cluster/info` 发现成功之前，需要识别哪个节点响应了探测时，请使用它。

公开摘要始终包含：

- `topology.schema`
- `topology.version`
- `topology.current_shape`
- `topology.current_process_class`
- `topology.current_roles`
- `topology.execution_mode`
- `topology.matching_role.queue_wake_enabled`
- `topology.matching_role.shape`
- `topology.matching_role.wake_owner`
- `topology.matching_role.task_dispatch_mode`
- `topology.matching_role.partition_primitives`
- `topology.matching_role.backpressure_model`
- `topology.matching_role.discovery_limits.poll_batch_cap`
- `topology.matching_role.discovery_limits.availability_ceiling_seconds`
- `topology.matching_role.discovery_limits.wake_signal_ttl_seconds`
- `topology.matching_role.discovery_limits.workflow_task_lease_seconds`
- `topology.matching_role.discovery_limits.activity_task_lease_seconds`

`topology.matching_role.discovery_limits` 是固定的匹配角色数值契约：`poll_batch_cap` 是每次轮询返回的就绪任务行最大批量；`availability_ceiling_seconds` 是应用到 `available_at` 的跨后端容差，使刚就绪的任务能承受亚秒级时间戳漂移；`wake_signal_ttl_seconds` 是默认 `CacheLongPollWakeStore` 信号 TTL；`workflow_task_lease_seconds` / `activity_task_lease_seconds` 是默认工作流和活动任务租约时长。收紧任何值都是协议级变更，因为 Worker 和下游工具将它们作为权威匹配角色契约读取；重命名字段也是协议级破坏性变更。

即使顶层就绪 `status` 为 `not_ready`，`/api/ready` 仍返回相同 `topology` 块，使探测在引导阻塞存在时仍能区分 `server_http_node`、`scheduler_node`、`matching_node` 和 `execution_node` 响应。

示例：

<!-- docs-example id="server.health.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/health" | jq '{
  status,
  topology: {
    schema: .topology.schema,
    version: .topology.version,
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role
  }
}'
```

### 就绪阻塞项 {#readiness-blockers}

`GET /api/ready` 返回顶层 `status` 及机器可读 `checks`。两项检查决定 Server 能否安全评估发布安全健康：

- `checks.migrations` 是引导和迁移准入检查。它公布 `repository_exists`、`pending_migrations`、`adoptable_migrations`、`blocking_migrations`、`missing_tables`、`operator_surface` 和 `readiness_contract`。
- `adoptable_migrations` 表示现有工作流表只需补登记迁移历史。Server 保持就绪并报告 `status: "warning"`，使运维人员能在下一次迁移轮次前安排登记。
- `blocking_migrations` 表示仍需发布安全迁移记录。Server 默认拒绝服务，返回 `status: "pending"` 及 `remediation` 字符串，不会假装集群已是当前版本。
- `operator_surface.available` 和 `operator_surface.required_tables` 告诉你 v2 运维接口是否具备启动后解释发布安全所需的持久表。
- `readiness_contract.version` 固定脚本解析这些就绪字段时应预期的安装和登记契约修订版。
- `checks.workflow_v2` 对应跨所有命名空间的发布安全结论。缺少就绪前提时，它报告 `status: "blocked"` 并添加 `blocked_by`、`message` 和 `remediation`，不会假装集群健康。

示例：

<!-- docs-example id="server.ready.blockers.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/ready" | jq '{
  status,
  migrations: {
    status: .checks.migrations.status,
    adoptable_migrations: .checks.migrations.adoptable_migrations,
    blocking_migrations: (.checks.migrations.blocking_migrations | map(.migration)),
    missing_tables: .checks.migrations.missing_tables,
    operator_surface: .checks.migrations.operator_surface,
    readiness_contract: .checks.migrations.readiness_contract
  },
  workflow_v2: {
    status: .checks.workflow_v2.status,
    blocked_by: .checks.workflow_v2.blocked_by,
    remediation: .checks.workflow_v2.remediation
  }
}'
```

### 集群拓扑清单 {#cluster-topology-manifest}

`/api/cluster/info` 还按 `durable-workflow.v2.role-topology` 模式返回节点的 `topology` 清单。应通过此清单发现节点当前以 `standalone_server`、`embedded` 还是 `split_control_execution` 运行、拥有哪些角色，以及 Server 对 `matching_role`、`shape_assignments`、`authority_boundaries`、`failure_domains`、`scaling_boundaries` 和 `migration_path` 的预期。同一响应还公布该节点的实时发布安全状态。

按以下方式阅读清单：

- `topology.current_shape`、`topology.current_process_class`、`topology.current_roles` 和 `topology.execution_mode` 告诉你节点实际提供哪种角色形态。这些字段描述响应节点，不描述整个集群。
- `topology.role_vocabulary` 是合法 v2 角色名称的固定列表。
- `topology.matching_role.queue_wake_enabled`、`topology.matching_role.shape`、`topology.matching_role.wake_owner`、`topology.matching_role.task_dispatch_mode`、`topology.matching_role.partition_primitives` 和 `topology.matching_role.backpressure_model` 告诉你广泛的就绪任务发现是在 Worker 内执行还是通过专用匹配角色扫描执行、哪个进程负责扫描、哪些路由维度保持稳定，以及当前 v2 强制执行什么持久准入边界。
- `topology.matching_role.discovery_limits` 公布固定的匹配角色数值契约：`poll_batch_cap`、`availability_ceiling_seconds`、`wake_signal_ttl_seconds`、`workflow_task_lease_seconds` 和 `activity_task_lease_seconds`。用它们验证部署符合文档中的匹配角色契约；包在 `dw server:info`、运维指标快照和命名空间作用域健康接口中输出相同标识符。
- `topology.role_catalog` 和 `topology.authority_surfaces` 将角色名称映射到自动化在响应节点上应预期的接口、持久写入接口及读取路径。
- `topology.shape_assignments` 是每种受支持形态的机器可读进程类别清单。需要将响应节点映射到文档中的进程类别时，将当前角色组合与该表比较。
- `topology.supported_topologies` 汇总产品支持的部署族及每个族预期的节点类别。
- `coordination_health` 在一个机器可读块中汇总集群级发布和兼容性风险。除 `status` 和 `http_status` 外，当缺失迁移或数据库不可达等上游就绪问题阻塞发布安全评估时，还可公布 `blocked_by`、`message` 和 `remediation`。
- `coordination_health.checks[]` 始终包含固定的 `activity_path` 检查，与 `worker_compatibility`、`task_transport`、`routing_health`、`durable_resume_paths` 及投影/调度器检查并列。`activity_path` 是活动侧对应于 `task_transport` 的检查：它暴露从调度到启动、从启动到关闭、从调度到关闭或心跳截止时间已过却未被强制执行的活动（`timeout_overdue`、`oldest_timeout_overdue_at`、`max_timeout_overdue_age_ms`），以及持续的活动重试积压（`retrying`、`oldest_retrying_started_at`、`max_retrying_age_ms`）。重命名此检查属于协议级变更。
- `coordination_health.routing_drains` 汇总跨命名空间和队列正在排空的构建 ID 群组。用 `queues_with_drains` 和每队列的 `build_ids` 条目查看哪里有意让流量避开正在排空的 Worker。
- `execution_mode` 区分 `local_queue_worker` 嵌入式执行与 `remote_worker_protocol` Worker 协议执行。
- `split_control_execution` 是受支持的产品拓扑，不是第二个 Server 产品或另一套 API。

示例：

<!-- docs-example id="server.cluster-info.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_shape: .topology.current_shape,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    coordination_health: {
      status: .coordination_health.status,
      http_status: .coordination_health.http_status,
      blocked_by: .coordination_health.blocked_by,
      queues_with_drains: .coordination_health.routing_drains.queues_with_drains
    }
  }'
```

这些字段背后的概念契约，包括角色词汇和迁移路径，见 [Server 角色拓扑](/docs/polyglot/server-role-topology)。

### 错误节点拓扑拒绝 {#wrong-node-topology-rejections}

响应节点没有托管端点所需 HTTP 控制接口时，经过认证的托管路由默认拒绝。检查在角色和协议版本验证后、命名空间解析前执行，因此错误节点请求不会泄露命名空间是否存在。

检查阻塞请求时，Server 返回 `503` 和 `reason: "topology_role_unavailable"`，并包含：

- `current_shape`：响应节点公布的拓扑形态。
- `current_process_class`：响应节点声明的进程类别，例如 `scheduler_node` 或 `execution_node`。
- `current_roles`：节点实际托管的角色。
- `required_roles`：端点所需的托管路由角色。
- `missing_roles`：响应节点缺失的 `required_roles` 子集。

控制平面路由在控制平面封装中返回该负载。Worker 协议路由在 Worker 协议封装中返回相同字段，并保留正常的 Worker 协议版本头。

请求落到仅运行调度器的节点时，`GET /api/workflows` 的错误节点响应示例：

```json
{
  "reason": "topology_role_unavailable",
  "message": "This node does not host the topology roles required for this endpoint.",
  "current_shape": "standalone_server",
  "current_process_class": "scheduler_node",
  "current_roles": ["scheduler"],
  "required_roles": ["api_ingress", "control_plane"],
  "missing_roles": ["api_ingress", "control_plane"]
}
```

即使节点没有托管当前 HTTP 控制接口，`GET /api/health`、`GET /api/ready` 和经认证的 `GET /api/cluster/info` 仍可用于存活检查和发现。

### 工作流引导准入检查 {#workflow-bootstrap-gate}

响应节点的 `checks.workflow_v2.status` 为 `blocked` 时，变更或服务工作流 v2 流量的认证路由也默认拒绝。检查在角色和协议版本验证后、命名空间解析前执行，因此在发布受阻期间发送的请求永远不会观察到命名空间是否存在。

检查触发时，Server 返回 `503` 和 `reason: "workflow_v2_blocked"`，并包含：

- `blocked_by`：阻止工作流 v2 安全服务的有序上游就绪阻塞项列表（例如 `migrations`）。
- `remediation`：面向运维人员、用于清除所列阻塞项的简短说明，与 `/api/ready` 的 `checks.workflow_v2.remediation` 字段一致。

受引导检查约束的路由族包括：

- **工作流启动与变更**：启动、描述、命令及针对运行的命令组中的每个 `/api/workflows` 路由（例如 `POST /api/workflows`、`POST /api/workflows/{workflowId}/signal/{signalName}`、`POST /api/workflows/{workflowId}/runs/{runId}/cancel`）。
- **计划变更**：`POST /api/schedules`、`PUT /api/schedules/{scheduleId}`、`DELETE /api/schedules/{scheduleId}`、`POST /api/schedules/{scheduleId}/pause`、`POST /api/schedules/{scheduleId}/resume`、`POST /api/schedules/{scheduleId}/trigger` 和 `POST /api/schedules/{scheduleId}/backfill`。
- **桥接适配器**：`POST /api/bridge-adapters/webhook/{adapter}`。
- **Worker 协议**：每个 `/api/worker` 和 `/api/worker/*` 路由，包括注册、心跳，以及工作流任务、查询任务和活动任务的轮询/完成/失败/心跳操作。

计划**读取**被有意豁免，让运维人员在恢复期间仍可检查计划状态：引导检查阻塞其他路由时，`GET /api/schedules`、`GET /api/schedules/{scheduleId}` 和 `GET /api/schedules/{scheduleId}/history` 继续提供服务。

控制平面路由在控制平面封装中返回引导检查负载，并包含 `X-Durable-Workflow-Control-Plane-Version` 头。Worker 协议路由在 Worker 协议封装中返回相同 `reason`、`blocked_by` 和 `remediation` 字段，并保留 `X-Durable-Workflow-Protocol-Version` 头，使 Worker 根据机器可读原因分支，而非从单独的 `503` 推断队列状态。

缺少发布安全迁移时，`POST /api/workflows` 的引导检查响应示例：

```json
{
  "reason": "workflow_v2_blocked",
  "message": "This node is not ready to serve workflow v2 traffic until bootstrap blockers are cleared.",
  "blocked_by": ["migrations"],
  "remediation": "Restore database connectivity and migrate the workflow tables before relying on workflow v2 rollout-safety health."
}
```

`/api/worker/*` 路由在 Worker 协议封装中返回相同负载，使 Worker SDK 能继续根据 `reason` 分支，并在上游阻塞项清除后重试。

### 命名空间作用域的系统健康 {#namespace-scoped-system-health}

`GET /api/system/health` 是单个命名空间的认证发布安全与协调健康接口。它要求管理员认证及 `X-Durable-Workflow-Control-Plane-Version: 2`，按普通控制平面请求规则解析命名空间，并返回 Server 实际评估的命名空间及当前 `health` 快照：

<!-- docs-example id="server.system-health.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/system/health" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  | jq '{namespace, status: .health.status, healthy: .health.healthy}'
```

负载字段含义如下：

- `namespace`：已评估发布/协调状态的命名空间。
- `health.status` 和 `health.healthy`：该命名空间顶层机器可读健康结论。
- `health.checks` 和 `health.categories`：各接口的就绪、兼容性、投影及协调信息。
- `health.operator_metrics`：打包在同一快照中的当前命名空间作用域队列、Worker 和修复指标。
- `health.structural_limits`：Server 为该命名空间强制执行的有效结构限制及相关诊断。

## 工作流控制平面 {#workflow-control-plane}

工作流路由是运维/控制平面路由，要求 operator 或 admin 角色及 `X-Durable-Workflow-Control-Plane-Version: 2`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/workflows` | 列出工作流实例。支持状态、类型、查询文本和数量上限等过滤。 |
| `POST` | `/api/workflows` | 启动工作流实例。 |
| `GET` | `/api/workflows/{workflowId}` | 描述某个工作流 ID 的当前运行。 |
| `GET` | `/api/workflows/{workflowId}/debug` | 返回有限诊断信息，用于调查卡住的运行。 |
| `GET` | `/api/workflows/{workflowId}/runs` | 列出某个工作流 ID 的运行。 |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}` | 描述特定运行。 |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/debug` | 返回选定运行的有限诊断信息。 |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history` | 分页读取运行历史事件。 |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history/export` | 导出某次运行的归档重放包。 |

启动请求使用语言中立的控制平面结构：

<!-- docs-example id="server.workflow-start.curl" -->
```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"],
    "memo": {"source": "api-reference"},
    "search_attributes": {"CustomerId": "cust-42"},
    "duplicate_policy": "reject"
  }'
```

### 工作流命令 {#workflow-commands}

Server 也提供协作式 `request-cancellation` 路由。有时限清理契约及 Worker 要求见[协作式取消](/docs/polyglot/cancellation/)。

针对实例的命令路由操作某工作流 ID 的当前运行：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/signal/{signalName}` | 发送信号。 |
| `POST` | `/api/workflows/{workflowId}/query/{queryName}` | 执行只读查询。 |
| `POST` | `/api/workflows/{workflowId}/update/{updateName}` | 提交或执行更新。 |
| `POST` | `/api/workflows/{workflowId}/cancel` | 立即将运行关闭为已取消；不恢复工作流清理。 |
| `POST` | `/api/workflows/{workflowId}/terminate` | 强制终止。 |
| `POST` | `/api/workflows/{workflowId}/repair` | 请求 Server 修复可重试的卡住状态。 |
| `POST` | `/api/workflows/{workflowId}/archive` | 归档已关闭工作流运行。 |

针对运行的命令路由会明确拒绝历史或错误运行目标：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/signal/{signalName}` | 仅在选定运行仍为当前运行时发送信号。 |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/query/{queryName}` | 对选定运行执行查询。 |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/update/{updateName}` | 仅在选定运行仍为当前运行时提交或执行更新。 |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/cancel` | 仅在选定运行仍为当前运行时取消。 |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/terminate` | 仅在选定运行仍为当前运行时终止。 |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/repair` | 仅在选定运行仍为当前运行时修复。 |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/archive` | 仅在选定运行为当前运行且已关闭时归档。 |

带调用方负载的命令使用 `input` 数组。Python 和 PHP SDK 为你编码语言中立的负载封装；直接 HTTP 调用方必须发送目标工作流或活动能解码的 JSON 值。

## 命名空间与存储 {#namespace-and-storage}

命名空间路由要求 operator 或 admin 角色。变更命名空间及外部存储的路由要求 admin 角色。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/namespaces` | 列出命名空间。 |
| `POST` | `/api/namespaces` | 创建命名空间。 |
| `GET` | `/api/namespaces/{namespace}` | 描述命名空间保留期、元数据及存储策略。 |
| `PUT` | `/api/namespaces/{namespace}` | 更新命名空间元数据或保留期。 |
| `PUT` | `/api/namespaces/{namespace}/external-storage` | 配置命名空间外部负载存储策略。 |
| `POST` | `/api/storage/test` | 通过配置的外部存储驱动，往返测试小型和大型负载。 |

外部负载存储策略允许大型负载封装携带稳定引用，代替原始字节。本地策略通过配置的文件系统路径解析。`s3`、`gcs` 和 `azure` 等对象存储策略使用 Server 上显式配置的文件系统磁盘和桶/前缀设置。

### 外部负载引用封装 {#external-payload-reference-envelope}

外部负载引用是稳定的线格式封装。SDK 可以将它解码为原生辅助类型，但 HTTP 客户端应将这些字段名视为契约：

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | 必须为 `durable-workflow.v2.external-payload-reference.v1`。未知模式默认拒绝。 |
| `uri` | 是 | 驱动管理的对象位置，例如 `file:///...`、`s3://bucket/prefix/object`、`gs://bucket/prefix/object` 或 `azure://container/prefix/object`。 |
| `sha256` | 是 | 所存编码字节的小写十六进制 SHA-256。SDK 和 Server 在解码前验证它。 |
| `size_bytes` | 是 | 所存编码负载的字节长度。不匹配即完整性失败。 |
| `codec` | 是 | 始终为 `avro`：固定的类型化 Value 模式及 Avro 单对象帧。外层 HTTP 文档仍为 JSON。 |
| `expires_at` | 否 | 用于保留期/GC 的 ISO-8601 到期提示。缺失时由命名空间保留策略负责清理。 |

负载外移由命名空间存储策略的阈值控制。在编码字节超过 `threshold_bytes` 前，内联负载继续使用普通负载封装；之后驱动写入字节，历史保存引用封装。如果引用的 blob 缺失、被修改、位于配置前缀之外，或归属不可用提供商，重放和历史导出必须明确失败，绝不能悄悄用 `null`、`{}` 或空字节串替换缺失对象。

完整请求权限契约，包括命名空间解析、角色限定凭据及 Worker 注册字段，见[命名空间、认证与 Worker 注册](/docs/polyglot/namespace-auth-workers)。

## 服务目录管理 API {#service-catalog-admin-apis}

服务目录路由是经过认证的管理员控制平面路由。它们与其余托管控制平面采用相同的命名空间解析、拓扑角色准入检查及 `X-Durable-Workflow-Control-Plane-Version: 2` 要求。

使用这组路由为跨命名空间服务目录注册命名空间作用域的端点、服务和操作元数据。输入名称不区分大小写，响应和查找中规范化为小写。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/service-endpoints` | 列出当前命名空间的服务端点。 |
| `POST` | `/api/service-endpoints` | 创建服务端点。 |
| `GET` | `/api/service-endpoints/{endpointName}` | 描述一个端点。 |
| `PUT` | `/api/service-endpoints/{endpointName}` | 更新端点描述或元数据。 |
| `DELETE` | `/api/service-endpoints/{endpointName}` | 删除未使用的端点。 |
| `GET` | `/api/service-endpoints/{endpointName}/services` | 列出某端点下注册的服务。 |
| `POST` | `/api/service-endpoints/{endpointName}/services` | 在某端点下创建服务。 |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | 描述一个服务。 |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | 更新服务描述或元数据。 |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | 删除未使用的服务。 |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | 列出某服务下注册的操作。 |
| `POST` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | 创建操作绑定。 |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | 描述一个操作。 |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}/service-calls/{serviceCallId}` | 描述一个持久服务调用快照。 |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | 更新操作绑定。 |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | 删除未使用的操作。 |

响应集合使用 `service_endpoints`、`services` 或 `operations` 数组。单个资源包含稳定的小写名称、元数据及时间戳：

- 端点返回 `id`、`namespace`、`endpoint_name`、`description`、`metadata`、`created_at` 和 `updated_at`。
- 服务增加 `endpoint_id` 和 `service_name`。
- 操作增加 `service_id`、`operation_name`、`operation_mode`、`handler_binding_kind`、`handler_target_reference`、`handler_binding`、`deadline_policy`、`idempotency_policy`、`cancellation_policy`、`retry_policy`、`boundary_policy` 和 `metadata`。
- 服务调用快照增加 `caller_namespace`、调用方及关联工作流 ID、`status`、`resolved_binding_kind`、`resolved_target_reference`、负载引用、策略快照，以及 `accepted_at`、`started_at`、`completed_at`、`failed_at` 和 `cancelled_at` 等生命周期时间戳。

操作创建/更新请求与响应使用相同 JSON 字段名。`operation_mode` 为 `sync` 或 `async`。`handler_binding_kind` 是 `start_workflow`、`signal_workflow`、`update_workflow`、`query_workflow`、`activity_execution` 或 `invocable_http` 之一。新操作必须提供 `handler_target_reference` 或非空 `handler_binding` 负载。

嵌套服务调用详情还提供 `service_call_attempts`、`retry_attempt_count`、原始 `call_deadline_at`、类型化失败元数据及保留的 Avro `result_envelope`。已接受或已启动调用不是终态。等待完成的工作流调用方根据关联工作流的实际结果或终态失败/取消解析，同时保留原始调用标识和截止时间。

使用 [CLI 服务调用检查](./cli-reference.md#service-call-inspection)或 Waterline 服务目录检查该原始调用。检查不会请求另一次服务执行。

依赖项仍存在时，删除路由默认拒绝，返回 HTTP `409` 及具名原因，例如 `endpoint_has_services`、`service_has_operations` 或 `operation_has_service_calls`。

## 桥接适配器 {#bridge-adapters}

桥接适配器是有限入口端点。它们不执行工作流代码，而是将事件交给控制平面并返回具名结果。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/bridge-adapters/webhook/{adapter}` | 从 webhook 形式的事件启动、发送信号或更新工作流。 |

示例：

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/bridge-adapters/webhook/stripe" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start_workflow",
    "idempotency_key": "evt_1001",
    "target": {
      "workflow_type": "orders.fulfillment",
      "task_queue": "orders",
      "business_key": "order-1001"
    },
    "input": {"order_id": "order-1001"}
  }'
```

使用 `outcome`、`reason`、`idempotency_key` 和 `control_plane_outcome` 等响应字段，不要仅根据 HTTP 状态推断行为。

## Worker 协议 {#worker-protocol}

Worker 路由要求 worker 角色及 `X-Durable-Workflow-Protocol-Version: 1.0`。SDK Worker 在内部使用这些端点；自定义语言 Worker 可实现相同协议。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/worker/register` | 注册 Worker 标识、任务队列、支持的工作流/活动类型、容量、运行时及构建元数据。 |
| `POST` | `/api/worker/heartbeat` | 刷新 Worker 集群可见性及兼容性信息。 |
| `POST` | `/api/worker/workflow-tasks/poll` | 长轮询工作流任务。 |
| `POST` | `/api/worker/workflow-tasks/{taskId}/history` | 获取已租用工作流任务的分页任务历史。 |
| `POST` | `/api/worker/workflow-tasks/{taskId}/heartbeat` | 为已租用工作流任务发送心跳。 |
| `POST` | `/api/worker/workflow-tasks/{taskId}/complete` | 使用命令完成工作流任务。 |
| `POST` | `/api/worker/workflow-tasks/{taskId}/fail` | 报告工作流任务失败。 |
| `POST` | `/api/worker/query-tasks/poll` | 长轮询 Server 路由的查询任务。 |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/complete` | 完成查询任务。 |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/fail` | 报告查询任务失败或拒绝查询任务。 |
| `POST` | `/api/worker/activity-tasks/poll` | 长轮询活动任务。 |
| `POST` | `/api/worker/activity-tasks/{taskId}/heartbeat` | 为已租用活动任务发送心跳。 |
| `POST` | `/api/worker/activity-tasks/{taskId}/complete` | 完成活动任务。 |
| `POST` | `/api/worker/activity-tasks/{taskId}/fail` | 报告活动任务失败。 |

Worker 应将租约 ID、尝试、任务 ID 和心跳端点视为 Server 签发的不透明值。过时租约或错误任务 ID 会返回具名 Worker 协议错误，不会悄悄完成工作。

当 `worker_protocol.server_capabilities.poll_status` 为 `true` 时，每个工作流任务、活动任务和查询任务轮询响应都携带机器可读的 `poll_status` 字段。应先根据它分支，再检查路由专属负载字段：

| `poll_status` | 典型 HTTP 状态 | 含义 |
| --- | --- | --- |
| `leased` | `200` | Server 已租出任务，`task` 包含任务负载。 |
| `empty` | `200` | 轮询返回前没有匹配的就绪任务。 |
| `throttled` | `200` | 队列可见，但租约或派发准入限制阻止本次轮询获得新任务。 |
| `unavailable` | `503` or `200` | Server 无法安全协调队列轮询路径，返回类型化不可用结果，而不是悄悄表现为空队列。 |
| `draining` | `409` | 已注册 Worker 群组正在排空，因此 Server 拒绝租出新工作，并返回 `reason: "worker_draining"`。 |

## 集群与任务队列可见性 {#fleet-and-task-queue-visibility}

这些路由提供 Worker 集群和队列准入的运维诊断，属于控制平面路由。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/workers` | 列出已注册 Worker。 |
| `GET` | `/api/workers/{workerId}` | 描述一个 Worker。 |
| `DELETE` | `/api/workers/{workerId}` | 注销一个 Worker。 |
| `GET` | `/api/task-queues` | 列出任务队列及准入状态。 |
| `GET` | `/api/task-queues/{taskQueue}` | 描述某队列的工作流/活动/查询容量。 |
| `GET` | `/api/task-queues/{taskQueue}/build-ids` | 列出某队列观察到的构建 ID。 |
| `POST` | `/api/task-queues/{taskQueue}/build-ids/drain` | 将构建 ID 群组标记为排空，使其停止认领新任务。 |
| `POST` | `/api/task-queues/{taskQueue}/build-ids/resume` | 清除之前的排空，使群组能再次认领新任务。 |

使用任务队列响应区分缺少 Worker、Worker 槽位饱和、活动租约上限、派发预算和查询任务背压。排空和恢复接受 JSON 体 `{"build_id": "..."}`（无版本群组使用 `{"build_id": null}`），具有幂等性，并在群组上持久化运维意图，使 Worker 移除后发布状态仍如实反映情况。Worker 心跳一旦观察到 `drain_intent: "draining"`，Worker 轮询路由就返回 HTTP `409`、`poll_status: "draining"` 和 `reason: "worker_draining"`，不再租出新任务。完整的无版本到有版本切换、金丝雀、排空和回滚生命周期见 [Worker 构建 ID 发布](/docs/polyglot/worker-build-id-rollout)。

## 计划与搜索属性 {#schedules-and-search-attributes}

计划路由属于控制平面路由。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/schedules` | 列出计划。 |
| `POST` | `/api/schedules` | 创建计划。 |
| `GET` | `/api/schedules/{scheduleId}` | 描述一个计划。 |
| `PUT` | `/api/schedules/{scheduleId}` | 更新计划规范、动作、注释、memo 或搜索属性。 |
| `DELETE` | `/api/schedules/{scheduleId}` | 删除计划。 |
| `POST` | `/api/schedules/{scheduleId}/pause` | 暂停后续触发。 |
| `POST` | `/api/schedules/{scheduleId}/resume` | 恢复已暂停计划。 |
| `POST` | `/api/schedules/{scheduleId}/trigger` | 立即触发计划。 |
| `POST` | `/api/schedules/{scheduleId}/backfill` | 补跑某个时间窗口。 |
| `GET` | `/api/search-attributes` | 列出已注册搜索属性。 |
| `POST` | `/api/search-attributes` | 注册搜索属性。 |
| `DELETE` | `/api/search-attributes/{name}` | 删除搜索属性。 |

搜索属性名称和类型是命名空间搜索契约的一部分。避免在运维仪表盘或指标标签中使用高基数属性。

## 系统操作 {#system-operations}

系统路由要求 admin 角色。它们是显式运维轮次；自动化应优先读取状态路由，再调用执行轮次路由。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/system/health` | 返回命名空间作用域的发布安全与协调健康快照，嵌套在 `health` 下。 |
| `GET` | `/api/system/metrics` | 返回有限 JSON 指标。 |
| `GET` | `/api/system/operator-metrics` | 返回命名空间作用域的运行、任务、积压、修复、Worker 及结构限制运维指标快照。 |
| `GET` | `/api/system/repair` | 检查工作流修复积压。 |
| `POST` | `/api/system/repair/pass` | 运行一次工作流修复轮次。 |
| `GET` | `/api/system/activity-timeouts` | 检查活动超时积压。 |
| `POST` | `/api/system/activity-timeouts/pass` | 运行一次活动超时强制执行轮次。 |
| `GET` | `/api/system/retention` | 检查保留期清理积压。 |
| `POST` | `/api/system/retention/pass` | 运行一次保留期清理轮次。 |

对于 PHP Server 保留期，状态路由读取当前命名空间策略，并返回符合条件运行的有限列表。策略变化也影响现有已关闭历史。未过滤的轮次选择过期运行；显式 `run_ids` 直接定位已关闭运行，不应用有界年龄过滤。永久保留和已归档运行保护仍适用。更改策略或运行清理前，请审查[保留过程及备份步骤](./server.md#retention)。

`/api/system/health` 是判断某命名空间是否健康到可以继续接收流量的最快方式。它返回 `{namespace, health}`，其中 `health` 包含分类的发布安全检查、嵌套 `health.operator_metrics` 快照，以及健康接口使用的结构限制摘要。

需要原始积压数量、兼容性阻塞年龄、Worker 集群详情或健康摘要背后的其他运维指标时，`/api/system/operator-metrics` 是 `/api/cluster/info` 的命名空间作用域配套接口。

`/api/system/metrics` 是 JSON 运维接口，不是 Prometheus 抓取端点。指标名称和维度受 Server 有界增长策略限制。

## 错误契约 {#error-contract}

错误响应使用 HTTP 状态码及具名机器可读原因。客户端应根据 `reason` 或嵌套的控制平面/Worker 协议原因字段分支，不依赖自然语言消息。

常见状态：

| 状态 | 含义 |
| --- | --- |
| `400` | 缺失或不支持的协议/版本头、格式错误查询，或不支持的路由方法。 |
| `401` | 缺失或无效认证。 |
| `403` | 已认证令牌缺少所需角色。 |
| `404` | 找不到命名空间、工作流、运行、计划、Worker 或搜索属性。 |
| `409` | 重复或冲突，例如工作流已启动，或运行目标无效。 |
| `422` | 验证失败；响应包含字段级验证细节。 |
| `429` | 准入或任务队列容量已满。 |
| `503` | 请求到达未托管所需拓扑角色的节点。托管路由返回 `reason: "topology_role_unavailable"` 及 `current_shape`、`current_process_class`、`current_roles`、`required_roles` 和 `missing_roles`。工作流 v2 引导被阻塞时，相同状态配合 `reason: "workflow_v2_blocked"`、`blocked_by` 和 `remediation`，适用于工作流启动/变更、计划变更、桥接适配器及 Worker 协议路由；计划读取路由（`GET /api/schedules`、`GET /api/schedules/{scheduleId}`、`GET /api/schedules/{scheduleId}/history`）仍可用，使运维人员能在恢复期间检查计划状态。 |
| `500` | Server 失败。仅当操作幂等或具有幂等键时才视为可重试。 |

验证响应包含 `reason: "validation_failed"` 及 `errors` 或 `validation_errors`。工作流命令响应还将验证和操作细节投影到嵌套的 `control_plane` 对象。

## 另请参阅 {#see-also}

- [Server 指南](/docs/polyglot/server)
- [命名空间、认证与 Worker 注册](/docs/polyglot/namespace-auth-workers)
- [Worker 协议](/docs/polyglot/worker-protocol)
- [任务队列准入](/docs/polyglot/task-queue-admission)
- [外部执行](/docs/polyglot/external-execution)
- [CLI 命令参考](/docs/polyglot/cli-reference)
