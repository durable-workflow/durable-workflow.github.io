---
sidebar_position: 14
title: 运维适用边界
description: Durable Workflow v2 健康、队列状态、重建、导出、归档及部署拓扑的运维契约。
tags:
  - operations
  - observability
  - Waterline
keywords:
  - 运维适用边界
  - 工作流 v2 健康
  - 重建投影
  - 历史导出
  - 归档验证
  - 队列健康
  - 高可用性
---

# 运维适用边界 {#operator-operating-envelope}

本指南定义 Durable Workflow v2 面向运维的契约，用于判断哪些诊断阻断发布、哪些只是建议，哪些队列事实属于 Waterline 或 Worker 遥测，如何验证重建与导出，以及哪些部署形态属于文档中的运维范围。

此处部署与恢复流程适用于嵌入式 Laravel 和自托管 Server。Durable Workflow Cloud 是独立托管服务，负责运行时持久化、单区域放置、备份、恢复及故障恢复；客户通过命名空间运行时 URL 运维 SDK 客户端和 Worker。不要使用本指南把 Server 接入 Cloud；客户边界见 [Cloud 托管运行时](/docs/polyglot/cloud-control-plane)。

## 权威信息接口 {#source-of-truth-surfaces}

结合使用以下接口：

| 接口 | 用途 | 契约类别 |
| --- | --- | --- |
| `php artisan workflow:v2:doctor --strict` | v2 流量或升级前的后端能力门控 | 阻断 |
| `GET /waterline/api/v2/health` | 当前引擎源就绪及阻断/建议 v2 健康检查 | `status = error` 时阻断，`status = warning` 时建议 |
| `GET /waterline/api/stats` | 持久化集群总量、积压、修复循环、投影偏移与 Worker 兼容性 | 建议与基准 |
| `php artisan workflow:v2:rebuild-projections ...` | 预览与修复投影偏移 | 维护 |
| `php artisan workflow:v2:backfill-command-contracts ...` | 预览与回填旧命令契约快照 | 维护 |
| `php artisan workflow:v2:history-export ...` 与 Waterline 导出路由 | 重放、归档交接与事故产物 | 验证 |
| Waterline 归档操作与控制平面 `archive()` | 已关闭运行的生命周期转换 | 生命周期 |
| Worker SDK 指标、追踪及日志 | 调度到开始延迟、轮询成功、sticky 缓存与自定义遥测 | 运行时遥测 |

持久化状态的运维契约属于拥有该运行的运行时。Waterline 从嵌入式包或通过 PHP SDK 连接的独立 Server 投影该契约。Worker 内部延迟与进程行为仍以 Worker 遥测为准。

### 部署形态与接口对应 {#surface-mapping-by-deployment-shape}

上表 Waterline 路由适用于两种部署形态。嵌入式在进程内读取 Laravel 宿主持久化状态；服务模式运行已发布 Waterline 镜像，通过 PHP SDK 读取独立 Server 的一个命名空间。无论是否部署 Waterline，均可直接使用认证后的 Server API 与 `dw` CLI：

| 运维问题 | Waterline（嵌入式或服务模式） | 独立 Server 原生接口 |
| --- | --- | --- |
| 引擎源就绪及阻断/建议健康 | `GET /waterline/api/v2/health` | `GET /api/system/health`（管理员认证、控制平面 v2）；`dw server:health` 检查存活，`dw server:info` 查看拓扑、协议和发布安全。 |
| 持久化集群总量、积压、修复、兼容性和投影偏移 | `GET /waterline/api/stats` | `GET /api/system/operator-metrics` 与 `dw system:operator-metrics` |
| 选定运行详情及历史导出 | `GET /waterline/api/instances/...` 与 `/waterline/api/.../history-export` | `GET /api/workflows/{workflowId}`、`/runs/{runId}`、`/runs/{runId}/history/export`（见 [Server API](./polyglot/server-api-reference.md)） |
| 运维命令（取消、终止、修复、归档、信号/更新/查询） | `POST /waterline/api/instances/.../{cancel\|terminate\|repair\|archive}` 和信号/更新/查询路由 | `POST /api/workflows/{workflowId}/{cancel\|terminate\|repair\|archive}` 与 `POST /api/system/repair/pass` |
| 拓扑与节点身份发现 | 嵌入式：`php artisan workflow:v2:doctor --json` 的 `topology`；服务模式：连接 Server 原生接口 | `GET /api/cluster/info`、`GET /api/health`、`GET /api/ready`（或 `dw server:info`） |

下述字段组与契约名称不随读取接口变化。Waterline 部署限定于配置的运行时与命名空间，不合并嵌入式和 Server 管理的运行。

## 带日期的 2.0 证据快照 {#dated-20-evidence-snapshot}

此快照区分已在发布制品上测量的行为，以及产品支持但运维人员仍须在自己环境演练的流程。通过行仅适用于记载的 2.0 场景与拓扑，不代表其他底层设施或更大部署的全面保证。

当前证据清单如下：

| 证据与日期（UTC） | 直接测量内容 | 边界 |
| --- | --- | --- |
| 单区域故障转移演练，2026-07-28 | 测量跨节点完成、API 节点丢失、MySQL 中断恢复、Redis 中断与 DB 轮询回退、Worker 租约丢失/重新领取及单例调度器重启。每阶段丢失与重复断言均通过。 | 同一区域一个共享端点后方两个 API、一个 MySQL、一个 Redis 加速层、一个队列 Worker 和一个调度/维护进程。DB 与 Redis 是容器中断，不是托管提供方提升测试。 |
| 定时器重启矩阵，2026-07-28 | 休眠工作流在 Worker 和 Server 重启后完成，各运行只调度并触发一次定时器，无重复重放命令。 | 已发布 Server 测试拓扑上的持久定时器与重放恢复，不涵盖任意进程状态或外部效果恢复。 |
| 活动运行时矩阵，2026-07-29 | 测量 Worker 重启后的结果恢复、重试与超时、心跳与取消观察、终态结果持久化及所需产品接口上的幂等完成。 | 活动级引擎行为；应用仍负责外部副作用幂等性。 |
| 工作流生命周期矩阵，2026-07-29 | 跨 PHP、Python、Rust、CLI、API、历史和 Waterline 测量完成/失败、重复启动与 ID 复用策略、超时/重试、历史连续性及重复副作用防止。 | 已运行场景的生命周期正确性，不是可用性或吞吐基准。 |

支持的版本线见[兼容性契约](./compatibility.md)。做出特定拓扑的故障转移承诺前，应在实际部署演练文档中的恢复流程。

### 实测保证与支持流程 {#measured-guarantee-vs-supported-procedure}

| 故障或结果 | 日期证据直接证明 | 支持的运维流程 | 证据未确立的内容 |
| --- | --- | --- | --- |
| 丢失一个 API 节点 | 停止两台 API 中的一台，通过共享端点到达存活节点，保留已确认状态并完成运行。 | 用 `/api/ready` 移除故障节点，重试中断请求，恢复流量前核对拓扑和 Worker 注册。 | 整个集群丢失、可用区隔离或任意网络分区。 |
| 数据库中断 | 两个 API 均变为未就绪，持久状态保留，替代 Worker 在租约到期后重新领取并完成，重复完成被拒绝。 | 先恢复可写数据库，等待就绪，隔离旧所有者，验证代表运行再恢复流量。托管提升需提供方原生隔离、RPO 与耗时证据。 | 托管 DB 提升、脑裂下已确认写入行为或超出实测中断的 RPO/RTO。 |
| Redis 中断 | 就绪报告加速降级，DB 轮询保留状态；重放相同轮询不产生重复租约，Redis 恢复后就绪恢复。 | 把 Redis 作为加速层，容忍警告，在持久层恢复后修复，并检查轮询发现延迟回归基线。 | Redis 双主、网络分区时缓存行为或提供方提升时序。 |
| Worker 重启或丢失 | 故障转移证明丢失后重新领取并完成；后续活动矩阵证明重启后结果恢复与幂等完成。 | 允许租约到期或排空，启动兼容替代 Worker，确认注册与领取，外部效果保持幂等。 | 未持久化的进程状态恢复或外部副作用恰好一次。 |
| Server 或调度器重启 | 定时器矩阵证明 Server 重启后休眠工作流完成，无重复命令；故障演练也保留 API 丢失与单例调度器重启期间进度。 | 恢复持久层，让角色就绪，确认恰好一个调度/维护，再验证 Worker 注册及代表完成。 | 所有 Server 与存储同时丢失、多区域或重复调度器常态。 |
| 重复交付 | DB 恢复和 Worker 丢失阶段各只有一次逻辑完成，重复完成返回 HTTP `409`；Redis 降级重放原租约而不新建，活动幂等完成也单独通过。 | 使用稳定请求/任务标识，遵守旧尝试拒绝，活动外部效果保持幂等。 | 持久化引擎边界外的普遍恰好一次交付或副作用保证。 |
| 终态完成 | 跨节点、API 丢失、DB 恢复和 Worker 丢失均达到 `completed`；后续生命周期矩阵覆盖完成、失败、取消、终止、超时和重试。 | 归档或宣布恢复完成前，验证选定运行及历史/导出证据。 | 未实际验证的负载、集成或故障组合的完成。 |

### 当前最大负载单元 {#largest-current-load-cell}

当前最大配置的 Server 负载单元以启动并发 **8** 创建 **1,000 个工作流**，同时运行 **8 个**并发轮询 Worker，持续 120 秒。要求工作流启动完成率至少 98%，并检查端点可用性、缓存键清退、采样覆盖及资源上限。

这只是短时间的**正确性冒烟测试**，不是持续生产规模基准，不确立通用吞吐量、延迟、内存或最大并发保证。应针对计划运行的准确拓扑、Worker 组合、数据库、缓存和版本，通过基准与长浸泡资料确定这些值。

### 明确不在范围内 {#explicitly-out-of-scope}

2.0 证据主张不覆盖：

- 网络分区
- 人为时钟漂移
- 多区域运行
- 脑裂行为

这些实验不是 2.0 发布前提，只是作出对应网络分区、时钟偏差、多区域或脑裂主张的前提。受支持 2.0 范围仍是公开拓扑、其恢复资料及文档场景实测行为。不应将不受支持的混沌场景当作文档中单区域流程不可用的证据。

## 支持的拓扑 {#supported-topologies}

Durable Workflow v2 支持以下运维形态。第一列名称与 `/api/cluster/info` 和 [Server 角色拓扑](./polyglot/server-role-topology.md)清单中的 `topology.current_shape` 一致，使此运维契约对齐自动化读取的发现契约。

| 运维形态（`topology.current_shape`） | 支持的运维契约 | 主要故障域 | 恢复与故障转移预期 |
| --- | --- | --- | --- |
| `embedded`，单节点 | Waterline、控制、健康、重建、导出和归档在一个应用、一份 DB 和一个缓存中运行。 | 同主机 Laravel 进程、DB、缓存。 | 主机/DB 丢失视为全面中断。先恢复持久状态，再启动应用并验证注册后恢复流量。 |
| `embedded`，同区域小集群 | 共享一个 DB 和用于唤醒的缓存，节点工作流兼容性/配置一致；活动节点位于同一机房或区域，限制队列/定时器唤醒延迟。 | 共享 DB、缓存/唤醒协调、负载均衡及单例调度/维护。 | 单应用丢失只降容量；DB 丢失阻断流量；仅 Redis 丢失降级加速并警告，DB 轮询保持正确性。调度切换与升级为显式流程，非自动 HA 承诺。 |
| `standalone_server` 发行版 | 按[自托管部署](./deployment.md)矩阵，通过 `/api/system/...`、`/api/workflows/...` 或独立 Waterline 应用相同健康、统计、导出、归档与队列契约。 | 共享 DB、Redis、API 容器群、独立 Worker、可选观察者和单例调度/维护。 | API 与 Waterline 可替换。DB、Redis、单例调度决定恢复顺序；恢复持久层后验证 `/api/ready`、`/api/cluster/info` 及注册，再切回流量。 |
| `split_control_execution` | 与 `standalone_server` 相同契约，各角色隔离为 `ingress_node`、`control_plane_node`、`scheduler_node`、`matching_node`、`execution_node`。指标、健康和命令按节点适用，管理读取应发送到所查角色。 | 角色各自独立，按 [Server 角色拓扑](./polyglot/server-role-topology.md)故障域清单判断；共享 DB、Redis 和单例调度选举仍属集群边界。 | 顺序同独立形态，宣布就绪前核对每节点 `topology.current_shape`、`topology.current_process_class` 和 `topology.current_roles`。发送到错误节点的路由返回 `503 topology_role_unavailable`。 |

`split_control_execution` 不是独立引擎或产品，而是与 `standalone_server` 相同的运维契约，按 `topology.shape_assignments` 中的进程类别隔离角色。除非章节明确指出特定角色，下文对这两种 Server 形态均适用。[Server 角色拓扑](./polyglot/server-role-topology.md)定义角色词汇、权限边界和迁移路径。

Waterline 服务模式是观察者部署，不是另一种 Server 拓扑。增减它不改变 `topology.current_shape`、Server 原生 API/CLI 可用性或运行所属的运行时。

在实际拓扑运行手册中公布恢复顺序、备份频率、预期故障转移延迟及区域固定行为。产品契约说明要测量的事实，部署契约记录可接受的恢复时序、手动步骤与故障域。

### 各形态故障域清单 {#failure-domain-checklist-by-supported-shape}

以上表为概要，并按照更明确的丢失模型编写运行手册：

- **嵌入式 Laravel，单节点**：一个应用进程拥有控制、匹配、投影、调度及执行。进程丢失后，持久化命令、工作流进度、调度触发和运维读取全面中断，直到应用连接完好的持久存储并恢复就绪。
- **嵌入式 Laravel，同区域小集群**：丢失普通应用节点只减少部分 HTTP 与 Worker 容量，其余节点继续从共享持久库领取。共享数据库、共享缓存唤醒路径以及当前单例调度/维护拥有者是主要正确性边界。
- **独立 Server（`standalone_server`）**：丢失一个 `server_http_node` 只停止该节点入口和控制命令，健康 Worker 可完成已租任务，其他 API 节点继续服务。丢失 `worker_node` 只应增加受影响 `(connection, queue, compatibility)` 范围的积压、队列年龄或兼容性警告。丢失 `scheduler_node` 暂停新调度触发和维护扫描，不使运行中工作流失效。数据库丢失是集群故障；仅 Redis 丢失时保留数据库轮询，报告 `long_poll_wake_acceleration` 降级，并在 Redis 恢复前增加发现延迟。
- **分角色 Server（`split_control_execution`）**：`ingress_node`、`control_plane_node`、`scheduler_node`、`matching_node`、`execution_node` 各自独立。丢失只影响对应角色：入口丢失停止边缘 HTTP；控制丢失让运维命令快速失败但已租工作继续；匹配丢失回退到直接就绪任务发现；调度丢失暂停触发并记录错过运行；执行丢失积累就绪任务而不丢持久状态。数据库丢失仍是全局故障，仅 Redis 丢失则与独立形态一样降级加速、回退数据库并报告就绪警告。

部署依赖不同假设时，应以单独验证契约和运行手册处理，而不是假定自助指南仍可原样适用。

### 各拓扑的公开恢复资料 {#published-recovery-packet-by-topology}

上述拓扑只有在部署运行手册同时公开匹配恢复资料时，才具备生产就绪条件：

| 拓扑 | 运维应公开的事实 |
| --- | --- |
| `embedded`，单节点 | DB 备份计划、缓存保留预期、恢复使用的准确应用改订及环境/配置、最大可接受恢复滞后和最近成功演练证据。 |
| `embedded`，同区域小集群 | 单节点资料全部内容，以及当前调度/维护拥有者、普通节点丢失与共享 DB/缓存丢失的不同影响、恢复队列唤醒协调的切换步骤。 |
| `standalone_server` 发行版 | DB/Redis 备份频率、固定镜像/摘要、认证材料位置、`server_http_node`/`worker_node`/`scheduler_node` 切换预期、最近 `/api/ready` 与 `/api/cluster/info` 恢复验证和 Worker 重新注册证据。 |
| `split_control_execution` 发行版 | 独立形态全部资料，加各进程 `ingress_node`、`control_plane_node`、`scheduler_node`、`matching_node`、`execution_node` 扩缩/故障预期，以及错误节点返回 `503 topology_role_unavailable` 时客户端重路由规则。 |

资料缺失、过期或未经验证时，无论当前运行多少节点，都应按开发级拓扑处理。

### 信任基线前验证当前拓扑身份 {#verify-live-topology-identity-before-trusting-the-baseline}

独立及分角色部署中，解释队列、调度器或角色故障前，应先确认产品本身报告的节点身份，权威来源是 `GET /api/cluster/info`：

| 字段 | 用途 |
| --- | --- |
| `topology.current_shape` | 确认节点当前通告 `embedded`、`standalone_server` 还是 `split_control_execution`。 |
| `topology.current_roles` | 确认节点实际承载的逻辑角色。 |
| `topology.supported_shapes` | 确认当前 Server 构建公开支持的部署形态。 |
| `topology.shape_assignments` | 将各支持形态映射到文档进程/角色组合，以核对当前角色组合。 |

发布期间首先用这些字段检查拓扑偏移：

- 自助独立 Server 中，API 节点应继续报告 `api_ingress`、`control_plane`、`matching`、`history_projection` 组合，调度节点报告 `scheduler`，Worker 节点报告 `execution_plane`。
- 分角色形态中，先验证每个节点 `current_roles` 匹配 `shape_assignments` 中记录的组合，再将积压或调度延迟解释为 Worker 问题。
- 若 `current_roles` 偏离计划，在纠正节点身份前应质疑队列与故障转移基线。

嵌入式不提供 `/api/cluster/info`。可运行 `php artisan workflow:v2:doctor --json` 查看 `topology`，它公开相同角色拓扑模式，包括应用的 `current_shape`、`current_process_class`、`current_roles`、`execution_mode` 和嵌套 `matching_role`。

## 阻断与建议诊断 {#blocking-and-advisory-diagnostics}

Durable Workflow v2 区分阻断诊断与建议诊断。

| 严重性 | 含义 | 典型操作 |
| --- | --- | --- |
| 阻断 | 当前配置或就绪状态无法安全承载 v2 流量 | 停止发布，修复前提，重新验证 |
| 建议 | 接口可读，但部分派生事实需重建、回填或人工审查 | 适当时保持服务，再修复明确接口 |
| 健康 | 此接口未发现当前问题 | 继续正常运行 |

对已提供接口应用以下规则：

- `workflow:v2:doctor --strict` 在后端能力问题为 `error` 时阻断，例如 queue 模式使用不支持驱动，或缓存不支持锁。poll 模式下信息性队列诊断仍属建议。
- `GET /waterline/api/v2/health` 返回：
  - `status = ok`：v2 运维接口就绪，当前检查一致。
  - `status = warning`：接口可读取，但部分事实需重建、回填或修复后才可完全信任。
  - `status = error` 与 HTTP `503`：引擎源桥未就绪，或阻断能力问题使 v2 接口不可用。
- `GET /waterline/api/stats` 发布持久化运维事实。其 JSON 应用于仪表盘和脚本诊断，不是指标采集端点。

## 正确性与加速检查 {#correctness-vs-acceleration-checks}

每项 v2 健康检查的 `category` 为 `correctness` 或 `acceleration`，快照按类别汇总，使运维无需重新聚合检查列表即可回答两个不同问题。

- **正确性检查**：反映持久化就绪任务发现、投影新鲜度、命令契约回填、历史保留、Worker 兼容性和后端能力是否完好。`status = error` 表示安全领取或可信运维状态有风险，解除前应停止发布。
- **加速检查**：反映可选唤醒信号传播是否跟上。持久化轮询是正确性路径，因此 `status = warning` 表示跨节点唤醒可能变慢，但任务不会被搁置。

`checks` 的每项包含 `category`，快照还提供 `categories` 汇总，便于仪表盘同时概括两类状态：

```json
{
  "status": "warning",
  "categories": {
    "correctness": {"status": "ok", "check_count": 8},
    "acceleration": {"status": "warning", "check_count": 1}
  }
}
```

`acceleration` 降级只按加速问题处理：检查缓存或唤醒后端，但不阻断仅依赖持久化就绪发现的流量。`correctness` 降级才是阻断信号。规范加速项 `long_poll_wake_acceleration` 最高为 `warning`，其他检查均属正确性。

## 队列健康语义 {#queue-health-semantics}

队列健康分为持久化队列状态和 Worker/运行时遥测。

### 持久化队列事实 {#durable-queue-facts}

使用 Waterline 仪表盘统计与队列视图查看持久化任务状态：

| 事实 | 含义 |
| --- | --- |
| `operator_metrics.backlog.runnable_tasks` | 当前可领取的持久化任务。 |
| `operator_metrics.backlog.delayed_tasks` | 已存在但仍等待 `available_at` 的持久化任务。 |
| `operator_metrics.backlog.leased_tasks` | 当前由 Worker 领取的持久化任务。 |
| `operator_metrics.backlog.tasks_added_last_minute` | 最近 60 秒创建的不同持久化任务行，表示队列流入，而非传输尝试次数。 |
| `operator_metrics.backlog.tasks_dispatched_last_minute` | 最近成功 `last_dispatched_at` 位于过去 60 秒的不同任务行，与 `tasks_added_last_minute` 比较以判断流入是否超过分派。 |
| `operator_metrics.starts.pending_runs`, `operator_metrics.starts.pending_commands`, `operator_metrics.starts.ready_tasks`, `operator_metrics.starts.oldest_pending_start_at`, `operator_metrics.starts.max_pending_ms` | 持久化工作流启动积压，区分已接受但尚未转成活动工作流任务的启动与普通 Worker 队列延迟。 |
| `operator_metrics.tasks.oldest_ready_due_at`, `operator_metrics.tasks.max_ready_due_age_ms` | 当前最老可执行任务及等待分派年龄，是“最老就绪任务”的机器可读延迟对。 |
| `operator_metrics.tasks.dispatch_overdue`, `operator_metrics.tasks.oldest_dispatch_overdue_since`, `operator_metrics.tasks.max_dispatch_overdue_age_ms` | 尚无成功分派唤醒的就绪任务及最老年龄，识别通知加速退化，避免与普通队列增长混淆。 |
| `operator_metrics.backlog.unhealthy_tasks` | 分派失败、领取失败、分派逾期或租约过期的持久化任务。 |
| `operator_metrics.backlog.repair_needed_runs` | 当前没有可信持久化恢复路径的开放运行。 |
| `operator_metrics.tasks.oldest_lease_expired_at`, `operator_metrics.tasks.max_lease_expired_age_ms` | 最老过期租约及年龄，作为租约卡住和重复风险的主要年龄指标。 |
| `operator_metrics.backlog.oldest_compatibility_blocked_started_at`, `operator_metrics.backlog.max_compatibility_blocked_age_ms` | 最老兼容性路由阻塞及年龄，用于工作仍保留但没有合格兼容 Worker 的情况。 |
| 活动与过期轮询者 | 已注册 Worker 是否仍为队列发送心跳。 |
| 当前租约 | 哪些工作流/活动任务已租出，以及租约是否过期。 |

这些事实仅描述持久化工作流任务与活动任务流量。

需要队列级而非集群总量时，使用 Server 队列可见性路由查看积压年龄、轮询者、当前租约、准入预算、`stats.tasks_added_last_minute` 和 `stats.tasks_dispatched_last_minute`。比较流入和分派，识别积压或缺少可用 Worker 的队列；整体比较使用上述 `operator_metrics.backlog.*`。

Waterline 的 `GET /waterline/api/v2/health` 在 `queue_visibility.*` 下发布配置命名空间的同一队列详情。以下字段组构成带类型的队列健康契约：

| 字段组 | 含义 |
| --- | --- |
| `queue_visibility.available`, `queue_visibility.reason` | Waterline 是否能为配置命名空间产生队列信息，不能时说明原因。 |
| `queue_visibility.task_queues[].stats.approximate_backlog_count`, `queue_visibility.task_queues[].stats.approximate_backlog_age` | 队列本地积压数量与最老持久化积压年龄。 |
| `queue_visibility.task_queues[].stats.tasks_added_last_minute`, `queue_visibility.task_queues[].stats.tasks_dispatched_last_minute` | 过去 60 秒每队列持久化流入与分派，识别被健康集群总量掩盖的热点队列。 |
| `queue_visibility.task_queues[].stats.pollers.active_count`, `queue_visibility.task_queues[].stats.pollers.stale_count`, `queue_visibility.task_queues[].stats.pollers.stale_after_seconds` | 队列健康/过期轮询者数量及快照使用的心跳过期阈值。 |
| `queue_visibility.task_queues[].stats.workflow_tasks.*`, `queue_visibility.task_queues[].stats.activity_tasks.*` | 按工作流/活动任务区分的队列就绪、已租和过期租约计数。 |
| `queue_visibility.task_queues[].repair.candidates`, `dispatch_failed`, `expired_leases`, `dispatch_overdue` | 队列修复压力：需修复、分派失败、持有过期租约或等待重新分派逾期的任务。 |
| `queue_visibility.task_queues[].repair.oldest_dispatch_failed_at`, `max_dispatch_failed_age_ms`, `oldest_lease_expired_at`, `max_lease_expired_age_ms`, `oldest_dispatch_overdue_since`, `max_dispatch_overdue_age_ms` | 队列最老分派失败、租约过期及分派逾期的年龄信号。 |

同一健康响应中的 `coordination_alerts[]` 汇总队列事实和健康检查。可作为直接通知运维的警告/错误摘要，再进入匹配的 `queue_visibility` 或 `checks` 查看证据。

队列准入状态是该队列槽位与轮询者的一等信号。`saturated` 表示在线 Worker 的全部注册槽位已租出；`throttled` 表示 Server 租约/分派上限有意限制新工作；`no_slots` 表示已注册但该任务类型容量为零；`no_active_workers` 表示没有健康轮询者；`unavailable` 表示配置的锁准入保护当前无法证明安全。

新启动看似卡住但稳态队列延迟正常时，使用 `operator_metrics.starts.*`，区分控制平面启动准入/首任务创建欠账与下游 Worker 领取。

### 轮询压力与准入预算 {#poller-pressure-and-admission-budgets}

队列流转降级时，使用任务队列详情或 `dw task-queue:describe`，区分 Worker 容量不足、Server 有意节流或完全没有在线轮询者：

| 队列状态 | 含义 | 处理方式 |
| --- | --- | --- |
| `accepting` | Worker 仍有空槽位，Server 上限未满。 | 健康基线。 |
| `saturated` | 所有已注册 Worker 槽位均已租出。 | Worker 容量压力。 |
| `throttled` | Server 有效租约或分派速率上限有意限制队列。 | 通常为建议，除非上限意外或积压持续超基线增长。 |
| `no_slots` | 活动 Worker 已注册，但没有通告该任务类型槽位。 | 阻断该队列。 |
| `no_active_workers` | 队列当前没有健康轮询者。 | 阻断该队列。 |
| `unavailable` | 无法获取配置准入路径所需锁。 | 准入依赖恢复前阻断。 |

结合这些状态和流量事实判断：

- `tasks_added_last_minute > tasks_dispatched_last_minute` 且 `saturated`，表示持久化流入超过 Worker 容量。
- 同样速率失衡且 `throttled`，表示显式 Server 上限在限制队列，应按上限意图判断，而不是与无上限吞吐比较。
- 最老就绪年龄增加且 `no_active_workers` 或轮询者过期，表示队列已失去健康领取者，应视为该范围路由中断。

### 匹配角色部署形态 {#matching-role-deployment-shape}

需要确认当前节点实际提供的匹配/分派契约时，使用 `operator_metrics.matching_role.*`：

| 事实 | 含义 |
| --- | --- |
| `operator_metrics.matching_role.queue_wake_enabled` | 此节点是否仍在队列 Worker 循环事件运行 Worker 内广泛轮询唤醒。 |
| `operator_metrics.matching_role.shape` | 节点仍拥有唤醒路径时为 `in_worker`；由独立 `workflow:v2:repair-pass --loop` 扫描时为 `dedicated`。 |
| `operator_metrics.matching_role.task_dispatch_mode` | 节点就绪任务采用的 `queue` 或 `poll` 分派模式。 |
| `operator_metrics.matching_role.partition_primitives` | 固定路由轴，顺序为 `connection`、`queue`、`compatibility`、`namespace`。 |
| `operator_metrics.matching_role.backpressure_model` | 引擎执行的持久化准入边界，当前 v2 为 `lease_ownership`。 |

这些字段属于节点而非整个集群。混合形态发布时，应读取每个切换节点/Pod，确认匹配角色已按计划移动，再将积压或轮询者变化解释为 Worker 健康问题。

### Worker 与 SDK 遥测 {#worker-and-sdk-telemetry}

以下内容使用 Worker 指标、追踪与日志：

- 工作流和活动的 `schedule_to_start` 延迟
- 轮询成功率及同步/急切分派行为
- Sticky 缓存大小与驱逐
- Worker CPU、内存、线程和事件循环压力
- 活动或 Worker 代码发出的自定义应用指标

同步查询、实时调试及其他非持久化控制平面调用应在仪表盘中单独标记，不计入持久化任务积压，也不改变 Waterline 修复计数器。

## Worker 兼容性与发布健康 {#worker-compatibility-and-rollout-health}

`operator_metrics.workers` 发布决定活动 Worker 集群能否安全处理所需契约的兼容性事实：

| 事实 | 含义 |
| --- | --- |
| `operator_metrics.workers.required_compatibility` | Worker 可领取命名空间工作前必须通告的兼容性标记。 |
| `operator_metrics.workers.active_workers` | 通过兼容性心跳观察到的不同活动 Worker 数。 |
| `operator_metrics.workers.active_worker_scopes` | 这些 Worker 覆盖的 `(connection, queue)` 范围数量。 |
| `operator_metrics.workers.active_workers_supporting_required` | 通告兼容性覆盖所需标记的 Worker。 |
| `operator_metrics.workers.fleet` | 按范围列出活动 Worker，包含 `worker_id`、`connection`、`queue`、`supported`、`supports_required`、心跳 `source`（`database`/`cache`）和 `recorded_at`。 |

使用汇总数量发现部分 Worker 无法安全领取工作的发布状态，再进入 `fleet` 定位缺失覆盖的 `(connection, queue)`。Waterline 兼容性面板显示相同列表，无需手动查询指标接口。

命名空间 `active_workers_supporting_required` 为零时，Waterline 在受影响运行显示 `no_compatible_worker_for_task`。相同条件下，`worker_compatibility` 健康检查在 `correctness` 下为 `warning`，使正确性汇总也变为 `warning`，让兼容性缺口一目了然。

构建 ID 发布期间与这些事实协调的排空/恢复流程见[使用构建 ID 发布 Worker](./polyglot/worker-build-id-rollout.md)，固定契约见 [Worker 兼容性与路由](./polyglot/worker-compatibility-routing.md)。

## 告警语义 {#alert-semantics}

告警阈值依部署而定。公开队列年龄、修复延迟、Worker 覆盖和恢复时间的数值基线，当下列契约违反持续超过一次正常修复或 watchdog 窗口时告警。

| 告警类别 | 来源 | 处理方式 | 升级条件 | 运维响应 |
| --- | --- | --- | --- | --- |
| 就绪阻断 | `workflow:v2:doctor --strict`、`GET /waterline/api/v2/health` | 阻断 | `doctor --strict` 错误或健康返回 `status = error` / HTTP `503` | 停止发布/切换，修复前提，再检查就绪和兼容性。 |
| 兼容 Worker 覆盖 | `operator_metrics.workers.*`、`worker_compatibility`、`no_compatible_worker_for_task` | 阻断 | 命名空间或所需范围 `active_workers_supporting_required = 0` | 排空不兼容 Worker，注册兼容 Worker，信任新领取前确认 `correctness` 恢复。 |
| 持久队列延迟 | Waterline 队列、`operator_metrics.backlog.*`、Worker `schedule_to_start` | 持续则阻断，短暂则建议 | 兼容 Worker 可用时，最老就绪年龄或开始等待持续高于公开基线 | 增加 Worker 容量，检查准入限制及调度/匹配进展。 |
| 轮询压力与准入饱和 | 队列详情、`dw task-queue:describe`、`status`、过期轮询者及添加/分派率 | `no_active_workers`、`no_slots`、`unavailable` 阻断；有意 `throttled` 为建议 | 持续饱和且最老年龄与速率缺口增长，或计划维护外进入阻断状态 | 增加槽位、恢复轮询群；盲目扩容前确认 Server 上限和锁依赖按预期工作。 |
| 启动积压 | `operator_metrics.starts.*`、控制平面启动遥测及首任务 `schedule_to_start` | 持续则阻断，短暂则建议 | 兼容 Worker 与容量可用时，`pending_commands`、`ready_tasks` 或 `max_pending_ms` 持续超基线 | 端到端确认启动命令转为持久任务，匹配/分派及时创建首任务；扩容前区分启动欠账和普通延迟。 |
| 投影偏移与修复欠账 | `run_summary_projection` / `selected_run_projections`、`operator_metrics.repair.*` | 建议 | 超过计划重建窗口仍警告，或最大候选年龄持续增加 | 预览并执行修复，确认警告解除、过期年龄回归基线。 |
| 重试或失败风暴 | `operator_metrics.backlog.unhealthy_tasks`、运行诊断和 Worker 错误 | 建议；阻止持久进展时升级阻断 | 分派/领取失败、过期租约或重试耗尽持续高于基线 | 调查失败任务类别，对比 Worker 与持久错误，决定排空流量或隔离队列。 |
| 唤醒加速降级 | `long_poll_wake_acceleration` 与 `acceleration` 汇总 | 建议 | 缓存/通知维护窗口后仍持续警告 | 检查缓存或唤醒传播；除非 `correctness` 也降级，不视为正确性故障。 |

目的是对持久化契约风险呼叫，而非每个瞬态信号。只有威胁实际拓扑运维契约时，队列和 Worker 告警才应升级为阻断。

## 重建、修复与恢复要求 {#rebuild-repair-and-restore-expectations}

运维接口报告偏移时，按此顺序检查：

1. 检查 `GET /waterline/api/v2/health`。
   - `run_summary_projection` 与 `selected_run_projections` 警告表示仍可读取，但部分列表/详情需重建。
   - `command_contract_snapshots` 警告表示旧运行需回填 WorkflowStarted 契约，之后才能信任声明的信号、更新和查询表单。
   - `durable_resume_paths` 警告表示开放运行需修复，之后才能依赖投影的下一恢复来源。
2. 预览投影操作：

   ```bash
   php artisan workflow:v2:rebuild-projections --needs-rebuild --dry-run
   ```

3. 重建受影响投影：

   ```bash
   php artisan workflow:v2:rebuild-projections --needs-rebuild
   ```

4. 预览命令契约回填：

   ```bash
   php artisan workflow:v2:backfill-command-contracts --dry-run
   ```

5. 当前工作流类仍可用时回填命令契约：

   ```bash
   php artisan workflow:v2:backfill-command-contracts
   ```

6. 只有保留流程已明确移除持久化行、且要删除对应运行或历史已不存在的投影时，才使用 `--prune-stale`。

`operator_metrics.repair.*` 发布修复扫描开销。使用候选数、选中数、最大候选年龄与扫描上限压力判断修复是否处于基线内，或需要调查容量。

### 保留与投影偏移 {#retention-and-projection-drift}

Workflow 2.6.3 及更新版本中，标记 `details_pruned_at` 的保留运行不计为缺失摘要、重建欠账或摘要缺失年龄，但仍计入偏移报告 `runs` 总数。所有重建模式均跳过它，包括显式运行/实例选择，因此修复不会恢复已删除列表行，也不会让其重新成为清理目标。

无标记但缺少摘要的运行仍报告偏移。仅空历史不能证明旧作业清理过；选择补救方式前应依据权威保留记录确认是有意清理。投影重建无法恢复已删除历史，必要时使用适当备份。

旧运行时可能把已标记清理的运行误报为缺失摘要，应先升级再通过重建处理该警告。清理后确认 `run_summary_projection` 为 `ok`、`projections.run_summaries.needs_rebuild` 为零，后续清理不再选择同一运行。真正的投影丢失仍需修复。

## 导出与归档验证 {#export-and-archive-verification}

历史导出与归档有不同用途：

- **历史导出**：创建重放、调试或归档产物。
- **归档**：标记已关闭运行，移出活动集群概览。
- **清理**：保留期限确实届满后移除投影或持久化行。

使用以下验证顺序：

1. 导出选定运行：

   ```bash
   php artisan workflow:v2:history-export <workflow-instance-id> --run-id=<workflow-run-id> --output=storage/app/workflow-history/run.json --pretty
   ```

2. 核对包中预期运行 ID、模式版本及已配置脱敏元数据。
3. 验证引用的外部字节，并保留至产物要求的生命周期。按照[清理前导出流程](./configuration/pruning-workflows.md#export-before-pruning)盘点全部关闭运行并发现缺失副本。
4. 只有确实要留在数据库时才归档。Server 保留清理跳过归档且无取消归档 API；嵌入式清理由应用负责，不要求先归档。
5. 通过拥有数据的保留流程清理符合条件明细。保留运行与实例墓碑。投影重建不恢复已清理历史，并跳过有清理标记的运行。

Waterline 对应导出与归档路由见 [Waterline 运维 API 参考](./waterline-operator-api.md)。

## 备份、恢复与灾难恢复契约 {#backup-restore-and-disaster-recovery-contract}

备份、恢复与灾难恢复属于运维边界，不是可选私有手册。每个支持拓扑都应公布并演练以下事实：

1. 持久化备份集：数据库备份、Server 或应用镜像、环境/配置、认证材料位置，以及重新连接 Worker 的准确拓扑和恢复说明。
2. 恢复目标：最大可接受恢复滞后、故障转移延迟，以及谁有权宣布流量可安全恢复。
3. 恢复顺序：持久存储、缓存、引导/迁移、单例调度/维护、API 就绪、Worker 注册。
4. 验证：`/api/ready` 或 `/waterline/api/v2/health`、适用的 `/api/cluster/info`、代表 Worker 注册与恢复状态的代表历史导出。
5. 恢复后修复：重建投影，必要时回填命令契约，确认队列、兼容性和修复指标回归基线后，才宣布健康。

多区域与脑裂不在受支持 2.0 运维范围。[自托管指南](/docs/deployment#activepassive-multi-region)仅为支持团队协助评估保留 active/passive 架构与手册，不确立自助复制、故障转移、故障回切、RPO 或 RTO 保证。当前 [Cloud 托管契约](/docs/polyglot/cloud-control-plane)也在一个托管区域运行各命名空间，不承诺多区域复制、区域切换或回切。

恢复演练频率也属于公开运维契约，至少在以下时点演练：

- 某拓扑首次生产发布前
- 备份机制、模式/引导路径、认证模型或拓扑变更后
- 按与备份计划同一手册公开的定期频率

无法提供最近成功演练日期、实际恢复时长和验证证据时，该拓扑的备份与灾难恢复仍未被证实。

## 基准测试边界 {#benchmark-envelope}

Durable Workflow v2 公开应在自有环境测量的维度。在生产流量依赖之前，于预发布或金丝雀环境记录这些基线：

| 维度 | 基线内容 | 来源 |
| --- | --- | --- |
| 投影健康 | 稳态 `needs_rebuild = 0`、人为偏移后的重建时长和过期/孤立清理时间 | `/waterline/api/v2/health`、`/waterline/api/stats`、`workflow:v2:rebuild-projections` |
| 队列压力 | 积压年龄、最老就绪年龄、可运行/延迟数量、添加/分派率、分派逾期年龄、过期轮询者及 `accepting`、`saturated`、`throttled`、`no_slots`、`no_active_workers` | Waterline 统计和队列视图，以及 `operator_metrics.backlog.*` / `operator_metrics.tasks.*` |
| 工作流启动延迟 | 已接受但等待首任务创建的启动、最老待启动年龄及准入后首任务领取 | `operator_metrics.starts.*` 与 Worker `schedule_to_start` |
| 调度到开始延迟 | 工作流/活动从入队到开始的等待 | Worker SDK 指标 |
| 定时器扇出唤醒 | 突发定时器的唤醒传播时间，以及计划触发到就绪任务可见的延迟 | Worker 遥测及同区域唤醒协调检查 |
| 修复扫描成本 | 候选数、选中数、最大候选年龄、最大缺失运行年龄和扫描压力 | `operator_metrics.repair.*` |
| 历史压力 | 事件数、历史大小与 continue-as-new 建议阈值 | `operator_metrics.history.*` |

这些是基准维度，不是通用延迟承诺。请为实际拓扑公开自己的可接受范围。

## 长时间浸泡证据 {#long-soak-evidence}

单次基准快照不够。宣布拓扑可承受持续流量之前，应保存长浸泡证据，证明系统长期处于声明边界内。

至少包括：

- 负载形态：拓扑、镜像/应用改订、Worker 构建 ID、队列布局、缓存与数据库，以及工作流启动、定时器、活动、查询和导出的代表组合
- 浸泡窗口：开始与结束时间，持续时间至少覆盖一个正常修复窗口、适用的保留/归档轮次及代表性业务周期流量变化
- 持久队列稳定性：积压年龄、就绪年龄、启动积压年龄、添加与分派率、过期轮询者数量保持在公开基线内
- 正确性稳定性：健康接口无持续 `status = error`，`operator_metrics.repair.*` 无不明增长，`operator_metrics.workers.*` 无持续兼容性缺口
- 进程与缓存稳定性：内存、CPU、事件循环/线程压力及缓存/基数增长有界，不在稳态负载下单调攀升
- 恢复证据：最近成功备份与恢复演练时间、恢复时长及证明恢复后就绪的命令

将资料存放在运维人员可同时取得部署手册的位置。若主张公开基准、告警或恢复时间却没有匹配浸泡资料，应视为临时数据，而不是可信运维证据。

## 端到端运维清单 {#end-to-end-operator-checklist}

升级后及信任新环境前使用此清单：

1. 运行 `php artisan workflow:v2:doctor --strict`。
2. 检查健康接口为 `ok`、`warning` 还是 `error`。
3. 读取 `GET /waterline/api/stats` 的积压、修复、历史、命令契约、兼容性及投影偏移。
4. 健康报告偏移时，预览投影重建或契约回填。
5. 导出代表运行并验证归档/重放产物路径。
6. 确认归档运行离开活动概览，持久化行在清理前仍保留。
7. 演练手册中的恢复/故障转移，并验证实测延迟符合公开拓扑预期。

## 相关指南 {#related-guides}

- [监控](./monitoring.md)
- [Waterline 运维 API](./waterline-operator-api.md)
- [工作流清理](./configuration/pruning-workflows.md)
- [自托管部署](./deployment.md)
