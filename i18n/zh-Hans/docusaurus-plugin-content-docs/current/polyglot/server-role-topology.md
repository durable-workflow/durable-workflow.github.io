---
title: Server 角色拓扑
description: 解读 /api/cluster/info 拓扑清单中的 Durable Workflow Server 角色、扩容边界、故障域和迁移步骤。
tags:
  - server
  - topology
  - deployment
  - control-plane
  - workers
keywords:
  - Durable Workflow 角色拓扑
  - 集群信息拓扑
  - Server 扩容边界
  - 控制执行分离
---

# Server 角色拓扑 {#server-role-topology}

## 为什么需要此清单 {#why-this-manifest-exists}

`GET /api/cluster/info` 按 `durable-workflow.v2.role-topology` 模式公布 Server 的 `topology` 清单。该清单是角色名称、受支持部署形态、持久写入权限、故障域预期、扩容边界，以及从当前独立发行版迁移到控制/执行分离拓扑的有序路径的公开契约。

需要从脚本、仪表盘、操作手册或发布自动化判断 Server 形态时，请使用本页。原始 HTTP 接口见 [Server API 参考](/docs/polyglot/server-api-reference)，部署设置见 [Server 指南](/docs/polyglot/server)。

## 阅读拓扑清单 {#reading-the-topology-manifest}

`topology` 对象回答以下契约问题：

| 字段组 | 回答的问题 |
| --- | --- |
| `schema`, `version` | 当前阅读的是哪个拓扑契约修订版？ |
| `supported_shapes` | 哪些产品部署形态是合法的？ |
| `role_vocabulary` | 此契约中哪些角色名称有效？ |
| `current_shape`, `current_process_class`, `current_roles`, `execution_mode` | 响应节点现在在做什么？ |
| `matching_role.*` | 谁负责广泛唤醒就绪任务，哪些路由维度已固定，当前采用什么派发/背压方式？ |
| `role_catalog`, `authority_surfaces` | 各角色拥有哪些接口和持久变更接口？ |
| `shape_assignments` | 每种受支持形态允许哪些进程类别？ |
| `authority_boundaries`, `failure_domains`, `scaling_boundaries` | 哪个角色可写什么，各角色如何故障，各角色按什么负载维度扩容？ |
| `supported_topologies`, `migration_path` | 产品支持哪些部署族，从独立形态向更隔离的角色迁移应遵循什么顺序？ |
| `kernel_invariants` | 无论运行哪种形态，角色拆分都必须保留哪些持久内核保证？ |

`current_shape`、`current_process_class` 和 `current_roles` 描述响应 HTTP 请求的节点，不描述整个集群。将 `current_process_class` 作为节点声明的身份；需要验证声明时，再将 `current_roles` 与 `shape_assignments` 中的进程类别角色组合比较。

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    scaling_boundaries: .topology.scaling_boundaries,
    migration_path: .topology.migration_path
  }'
```

## 角色词汇 {#role-vocabulary}

公开角色名称由 `topology.role_vocabulary` 固定：

| 角色 | 职责 |
| --- | --- |
| `api_ingress` | 接受外部 HTTP 流量，包括发现和控制平面入口。 |
| `control_plane` | 启动、发送信号、更新、修复、取消、终止、归档，及以其他方式变更工作流生命周期状态。 |
| `matching` | 发现就绪工作，管理任务租约并协调派发压力。 |
| `history_projection` | 持久化历史，并维护派生的运行摘要和导出。 |
| `scheduler` | 触发计划，并持久化计划运行状态。 |
| `execution_plane` | 执行工作流和活动任务。 |

自动化应将这些精确标识符视为稳定词汇。

## 受支持的部署形态 {#supported-deployment-shapes}

`topology.supported_shapes` 列出合法的产品部署形态：

| 形态 | `shape_assignments` 中公布的进程类别 | 契约含义 |
| --- | --- | --- |
| `embedded` | `application_process` | 一个应用进程负责控制平面、匹配、历史投影、计划调度和执行。 |
| `standalone_server` | `server_http_node`, `scheduler_node`, `worker_node` | 当前独立 Server 发行版：Server 节点负责 HTTP 入口/控制平面，调度器作为独立进程类别隔离，Worker 节点负责执行。 |
| `split_control_execution` | `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node` | 将相同产品契约拆为更小的角色专用进程类别，使扩容和故障边界能按子系统调整。 |

`split_control_execution` 是受支持的拓扑，不是第二个引擎或另一套 API。同一发现接口描述独立形态和角色分离形态。

## 当前节点身份 {#current-node-identity}

一起使用 `current_shape`、`current_process_class`、`current_roles` 和 `execution_mode`：

- `current_shape` 标识响应节点的形态契约。
- `current_process_class` 标识该节点声明的进程类别。
- `current_roles` 标识该节点当前活动的角色组合。
- `execution_mode` 区分 `remote_worker_protocol` 和 `local_queue_worker`。

对于独立 Server 发行版，即使 `DW_MODE=embedded` 将执行切换到本地队列 Worker，`current_shape` 仍是 `standalone_server`。此时 `execution_mode` 改为 `local_queue_worker`，HTTP 节点仍保留独立 Server 角色契约。

### 托管路由准入检查 {#hosted-route-gating}

同一拓扑契约也告诉调用方何时节点应直接拒绝托管流量。除非响应节点公布这些路由当前要求的 HTTP 控制角色组合，即 `api_ingress` 加 `control_plane`，经过认证的托管路由都会默认拒绝。

请求到错误节点时，响应返回 `503`、`reason: "topology_role_unavailable"` 以及重新路由所需的拓扑证据：

- `current_shape`
- `current_process_class`
- `current_roles`
- `required_roles`
- `missing_roles`

该检查在托管路由的命名空间解析之前执行，因此发送到 `scheduler_node`、`matching_node` 或 `execution_node` 的请求，在转向正确节点类别之前不会获知指定命名空间是否存在。`GET /api/health`、`GET /api/ready` 及经过认证的 `GET /api/cluster/info` 仍可用，使自动化能够先发现节点形态，再在其他位置重试。

### 工作流引导准入检查 {#workflow-bootstrap-gate}

当响应节点存在未解决的工作流 v2 引导阻塞项时，第二层路由级检查默认拒绝请求。当 `checks.workflow_v2.status` 为 `blocked` 时，经过认证的工作流启动/变更、计划变更、桥接适配器及 Worker 协议路由返回 `503` 和 `reason: "workflow_v2_blocked"`，并包含：

- `blocked_by`：有序的上游就绪阻塞项列表，例如 `migrations`。
- `remediation`：面向运维人员、用于清除所列阻塞项的说明，与 `/api/ready` 的 `checks.workflow_v2.remediation` 一致。

引导检查与托管路由拓扑检查位于同一位置：角色和协议版本验证之后、命名空间解析之前。因此，被阻塞请求永远不会观察到命名空间是否存在。

受检查的路由族包括 `/api/workflows` 等工作流路由，`POST /api/schedules`、`PUT /api/schedules/{scheduleId}`、`DELETE /api/schedules/{scheduleId}`、`/pause`、`/resume`、`/trigger` 和 `/backfill` 等计划变更，`/api/bridge-adapters/webhook/{adapter}` 等桥接适配器路由，以及 `/api/worker` 下的 Worker 协议路由。

计划**读取**（`GET /api/schedules`、`GET /api/schedules/{scheduleId}`、`GET /api/schedules/{scheduleId}/history`）被有意豁免，让运维人员在恢复期间仍能检查计划状态。Worker 协议路由在 Worker 协议封装中返回相同的引导检查负载，因此 Worker SDK 可以像控制平面一样，基于机器可读的 `reason: "workflow_v2_blocked"` 分支处理。

## 匹配角色契约 {#matching-role-contract}

`topology.matching_role` 固定响应节点实时的匹配和唤醒方式：

| 字段 | 含义 |
| --- | --- |
| `queue_wake_enabled` | 当前是否启用短期队列唤醒信号。 |
| `shape` | 节点公布的匹配部署形态：`in_worker` 或 `dedicated`。 |
| `wake_owner` | 当前负责广泛唤醒扫描的实现：`worker_loop` 或 `dedicated_repair_pass`。 |
| `task_dispatch_mode` | 通过 `poll` 驱动的远程 Worker 还是 `queue` 驱动的本地执行来派发。 |
| `partition_primitives` | 匹配角色使用的固定路由维度，依次为：`connection`、`queue`、`compatibility`、`namespace`。 |
| `backpressure_model` | 匹配角色强制执行的持久准入边界。当前 v2 报告 `lease_ownership`。 |
| `discovery_limits` | 编译进工作流包的固定匹配角色数值契约：`poll_batch_cap`、`availability_ceiling_seconds`、`wake_signal_ttl_seconds`、`workflow_task_lease_seconds` 和 `activity_task_lease_seconds`。 |

运维人员及自动化由此可以区分“存在匹配功能，但唤醒已降级”和“此节点有意运行不同派发模式”，并使用与 Server 运维指标公布的相同路由及背压词汇。

`discovery_limits` 是匹配角色的数值契约：`poll_batch_cap` 固定每次轮询返回的就绪任务行最大批量；`availability_ceiling_seconds` 固定应用到 `available_at` 的跨后端容差，使刚就绪任务能够承受亚秒级时间戳漂移；`wake_signal_ttl_seconds` 固定默认 `CacheLongPollWakeStore` 信号 TTL；`workflow_task_lease_seconds` / `activity_task_lease_seconds` 固定默认工作流及活动任务租约时长。运维人员读取这些值即可验证部署符合文档中的匹配角色契约，无需搜索包源码。收紧任何值都属于协议级变更，因为契约其他部分的派发、Worker 和加速时序依赖它们；重命名字段也属于协议级破坏性变更。

## 权限边界 {#authority-boundaries}

`topology.authority_boundaries` 列出各角色应变更的持久写入接口：

| 角色 | 公布的写入范围 |
| --- | --- |
| `api_ingress` | `worker_registrations` |
| `control_plane` | `workflow_instances`, `workflow_runs.status`, `workflow_tasks.lifecycle` |
| `matching` | `workflow_tasks.leases`, `activity_tasks.leases` |
| `history_projection` | `history_events`, `workflow_run_summaries`, `workflow_history_exports` |
| `scheduler` | `workflow_schedules.fire_state`, `workflow_starts.scheduled` |
| `execution_plane` | `workflow_tasks.outcomes`, `activity_attempts`, `worker_compatibility_heartbeats` |

拆分进程或增加拓扑专用自动化之前，使用此契约发现越过角色边界的偏移。

## 故障与扩容边界 {#failure-and-scaling-boundaries}

### 故障域 {#failure-domains}

`topology.failure_domains` 列出各角色中断时首先降级的行为，以及运维人员首先可见的信号：

| 故障域 | `effect` | `operator_signal` |
| --- | --- | --- |
| `control_plane_down` | `workers_continue_claimed_tasks_only_until_lease_expiry` | `operator_commands_fail_fast` |
| `execution_plane_down` | `ready_tasks_accumulate_without_loss` | `operators_see_ready_depth_growth` |
| `matching_down` | `claim_falls_back_to_direct_ready_task_discovery` | `ready_depth_rises_while_claim_rate_falls` |
| `history_projection_down` | `projection_reads_may_stale_while_durable_writes_continue` | `projection_lag_seconds_may_increase` |
| `scheduler_down` | `scheduled_workflows_stop_firing_and_record_missed_runs` | `operators_see_missed_schedule_state` |
| `api_ingress_down` | `external_http_traffic_stops_at_the_edge` | `embedded_in_process_calls_may_continue` |

这些是面向产品的预期，不是内部实现细节。在阅读日志之前，先用它们描述角色降级时应出现的行为。

### 扩容边界 {#scaling-boundaries}

`topology.scaling_boundaries` 指出在角色分离模型中各角色主要按哪个负载维度扩容：

| 角色 | 扩容边界 |
| --- | --- |
| `api_ingress` | `incoming_http_request_rate` |
| `control_plane` | `operator_commands_and_run_lifecycle_transitions` |
| `matching` | `ready_task_rate_and_poller_count` |
| `history_projection` | `durable_event_rate` |
| `scheduler` | `active_schedule_count` |
| `execution_plane` | `workflow_and_activity_task_rate` |

这明确回答了角色分离拓扑中“哪些部分独立扩容”的问题。

## 迁移路径 {#migration-path}

`topology.migration_path` 是有序的。每一步都保留同一个持久内核，同时更清晰地隔离职责：

1. `audit_role_boundaries`
   结果：在运行时形态变化前，工具标记跨角色写入。
2. `expose_role_bindings`
   结果：容器接口边界允许进程外适配器，无需修改包。
3. `introduce_dedicated_matching_shape`
   结果：匹配可作为独立进程类别运行，不改变认领契约。
4. `split_history_projection`
   结果：历史与投影可移到进程外，不引入第二个写入者。
5. `split_scheduler`
   结果：计划触发可置于领导者选举之后，同时单副本部署仍合法。
6. `optional_execution_partitioning`
   结果：Worker 可以按命名空间、连接、队列及兼容性分区。

应将此列表理解为受支持的拓扑转换顺序，不应把它当作脱离当前引擎的独立产品路线图。

每个 `topology.migration_path[]` 条目都带有显式的 `reversible: true` 标记。迁移路径是双向的：已达到 `split_history_projection` 的部署可以将历史角色合回控制平面进程，并仍是合法拓扑形态。回滚是契约的一部分，不是未建模的边缘情况。

## 持久内核不变量 {#durable-kernel-invariants}

`topology.kernel_invariants` 枚举无论运行哪种受支持形态，角色拆分都保留的保证。验证候选拓扑变更受产品支持、而非引擎分叉时，请使用此列表：

| 不变量 | 保证内容 |
| --- | --- |
| `single_persistence_engine` | 每种拓扑形态均由一个工作流数据库支撑；角色拆分不引入第二个持久化引擎。 |
| `single_worker_protocol` | 所有拓扑均由同一个 HTTP Worker 协议承载认领、完成、失败及心跳流量；角色拆分不分叉 Worker 契约。 |
| `single_history_writer` | 无论历史/投影角色在哪里运行，`history_events` 的每个逻辑事件都恰好只有一个持久写入者。 |
| `single_control_authority_per_run` | 给定工作流运行的每次变更均通过一个控制平面权威方路由；每次运行的行锁将跨副本转换串行化。 |
| `embedded_topology_remains_supported` | 一个进程承担所有角色的嵌入式形态必须保持合法；绝不强制现有嵌入式宿主迁移。 |
| `role_split_is_topology_only` | 拆分角色是拓扑变更，不是产品分叉；将角色合回单个进程始终是合法拓扑。 |

每个条目的 `applies_to` 字段列出不变量覆盖的形态。在受支持拓扑族中，目前每个不变量都适用于 `embedded`、`standalone_server` 和 `split_control_execution`。如果升级增加新形态，在将其视为产品支持之前，必须审查 `applies_to` 未包含该形态的不变量。

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '.topology.kernel_invariants[] | {id, applies_to}'
```

## 协调健康 {#coordination-health}

`/api/cluster/info` 还在 `topology` 旁公布 `coordination_health`。请明确区分：

- `topology` 告诉你节点允许做什么，以及产品形态应如何运行。
- `coordination_health` 告诉你跨命名空间的发布安全及协调检查当前是否健康。
- 当迁移或数据库连接等就绪前提缺失，导致 Server 无法评估发布安全健康时，会出现 `coordination_health.blocked_by`、`coordination_health.message` 和 `coordination_health.remediation`。
- `coordination_health.routing_drains` 汇总跨队列、跨命名空间正在排空的构建 ID 群组。`queues_with_drains` 指出发布自动化当前是否有意让流量避开某些群组。
- 发布安全评估运行后，`coordination_health.warning_checks`、`coordination_health.error_checks` 和 `coordination_health.checks` 仍是标准化检查清单。
- `coordination_health.checks[]` 始终包含固定的 `activity_path` 检查，与 `worker_compatibility`、`task_transport`、`routing_health`、`durable_resume_paths` 及投影/调度器检查并列。`activity_path` 是活动侧对应于 `task_transport` 的检查：它暴露从调度到启动、从启动到关闭、从调度到关闭或心跳截止时间已过却未被强制执行的活动，以及持续的活动重试积压。重命名此检查属于协议级变更。

判断某拓扑变更是否既受支持又在当前安全时，应结合使用两个接口。

## 相关参考 {#related-references}

- [Server API 参考](/docs/polyglot/server-api-reference)：经过认证的 `/api/cluster/info` HTTP 契约。
- [Server 指南](/docs/polyglot/server)：部署设置及更全面的独立 Server 运维模型。
- [部署模式](/docs/polyglot/deployment-modes)：何时选择嵌入式、独立 Server，或更广泛的支持团队指导拓扑。
