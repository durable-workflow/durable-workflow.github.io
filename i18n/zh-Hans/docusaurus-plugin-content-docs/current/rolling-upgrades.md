---
sidebar_position: 15
title: 滚动升级
description: 无需停止实时流量，自助对 Durable Workflow Server API 节点、Worker 和调度器执行滚动升级。
tags:
  - operations
  - upgrades
  - rollouts
  - rollback
keywords:
  - 滚动升级
  - 滚动安全
  - Worker 排空
  - schema 隔离
  - 就绪契约
  - 回滚工作流
---

# 滚动升级 {#rolling-upgrades}

需要在部署保持在线的同时替换 API 节点、Worker 或调度器时，使用滚动升级。本契约覆盖[自托管部署](/docs/deployment)指南中的小型集群形态：负载均衡器后有两到三个 API 节点、共享外部 MySQL 或 PostgreSQL、共享 Redis、独立扩缩的 Worker，以及恰好一个调度器或维护运行器。

只有本页全部保证成立时才支持滚动升级。超出此边界时，应改用部署指南中记录的整体停机流程。

本契约使用的角色词汇和形态清单记录在 [Server 角色拓扑](/docs/polyglot/server-role-topology)中。本指南聚焦当前 `standalone_server` 各进程类别如何原地滚动替换。

## 这里的滚动升级意味着什么 {#what-rolling-upgrade-means-here}

**滚动升级**逐一替换进程，停止每个进程之前先将其排空，其余进程继续服务流量。整个部署因此实现零停机，并有一个新旧进程共存的有界重叠窗口。

契约区分当前 `standalone_server` 形态下的四类进程，每类都有自己的发布方式：

- **HTTP/API 节点**：提供 HTTP 流量的无状态 Server 进程，当前承载 `api_ingress`、`control_plane`、`matching` 和 `history_projection` 角色。
- **Worker**：轮询 Worker 平面、执行活动和工作流任务的 SDK 进程，承担 `execution_plane` 角色。
- **调度器/维护运行器**：触发计划并处理活动超时和历史保留的单实例进程，承担 `scheduler` 角色。
- **Bootstrap**：执行数据库迁移和默认命名空间初始化的一次性进程。

API 节点与 Worker 独立滚动替换。调度器是单实例，必须先停止旧实例再启动新实例，但其余部署在此间隙内继续服务流量。

## 兼容的版本偏差规则 {#compatible-version-skew-rules}

滚动升级重叠窗口是多个 Server 镜像、工作流软件包版本或 Worker SDK 版本同时在线的时间段。窗口必须满足本节所有规则。

### Server 镜像与工作流软件包 {#server-image-and-workflow-package}

- **仅相邻版本。** 滚动升级期间，每个 API 节点及其他 Server 进程使用的镜像，其工作流软件包主版本必须与集群先前的软件包相同，且与每个其他在线进程相差不超过一个次版本。跨主版本必须整体停机升级。
- **向前增量迁移。** 同一主版本内，每项 Durable Workflow v2 schema 变更都是增量的。新节点不得要求尚未迁移的列或表。旧节点不能因出现其不读取的新列而失败。下方[迁移顺序规则](#schemabootstrap-ordering)落实这一点。
- **相邻控制平面和 Worker 协议版本。** 每个节点通过 `GET /api/cluster/info` 发布其支持的 `control_plane.version` 和 `worker_protocol.version` 范围。滚动升级时，新镜像支持的范围必须与每个在线旧节点的支持范围重叠。发布前发现版本范围；没有重叠就中止。

### Worker SDK 与构建身份 {#worker-sdk-and-build-identity}

- **Worker 标记每个构建。** 所有可能参与滚动升级的 Worker 都必须通过 `POST /api/worker/register` 注册稳定的 `build_id`。无版本群组（`build_id: null`）是发布前默认值；[Worker build-id 发布指南](/docs/polyglot/worker-build-id-rollout)说明首次切换。
- **工作流定义指纹保持固定。** 带有 `DW_V2_PIN_TO_RECORDED_FINGERPRINT=true`（默认值）的 Server 镜像，让进行中的运行实例固定到 `WorkflowStarted` 记录的工作流定义指纹。对于同一工作流，新 Worker 若携带不同指纹，在这些运行实例完成前会拒绝领取它们。
- **构建重叠时的准入策略。** 开始前选择 [`DW_V2_FLEET_VALIDATION_MODE`](/docs/polyglot/server-config-reference) 策略。`warn` 允许发布继续，即使没有在线 Worker 提供所需兼容性标记；`fail` 在此窗口内阻止分发，并使就绪契约默认拒绝。要求明确切换的生产发布应使用 `fail`。

## Schema/bootstrap 顺序 {#schemabootstrap-ordering}

Schema 变更通过一次 bootstrap 执行。顺序很重要。

1. **首先执行 bootstrap，且恰好一次。** 启动任何新的 API 节点、Worker 或调度器前，先在一个容器内运行 `php artisan server:bootstrap --force`（或已发布镜像的等价命令）。Bootstrap 运行 `migrate` 和默认命名空间初始化；对于连接上已存在表的工作流软件包迁移，它会接管这些迁移。
2. **新 schema 必须向后兼容旧代码。** 此发布路径中的每个 v2 迁移都是增量的（新表、新列、新索引）。旧 API 节点和 Worker 继续使用新 schema 运行。
3. **Bootstrap 完成前不要启动新代码。** 只有 bootstrap 成功退出后才滚动替换 Server 镜像。新 API 节点和 Worker 可能依赖刚迁移的表；提前启动是切换期间 5xx 激增最常见的原因。
4. **Bootstrap 是幂等的。** 可以安全重跑。如果执行中途失败，修复根本错误后重跑；迁移账本从中断处继续，命名空间行已存在时初始化不执行任何操作。

某项迁移先在一个 Server 上执行、后在另一个 Server 上执行，**绝不能**破坏就绪接口。规划时若发现非增量变更，应为该版本安排整体停机升级窗口，下个版本再恢复滚动升级。

## 重叠窗口内的排空与准入 {#drain-and-admission-during-the-overlap-window}

三个准入接口自动保证重叠窗口安全：

- **启动时准入。** 每个 Server 进程启动时加载 `BackendCapabilities`、`LongPollCacheValidator`、`WorkflowModeGuard` 和就绪契约。后端或缓存无法满足 v2 契约的进程拒绝将自身标记为就绪。
- **Worker 兼容性。** 当 `DW_V2_FLEET_VALIDATION_MODE=fail`，且没有在线 Worker 在任务的连接和队列范围内声明所需兼容性标记时，匹配角色阻止分发，`worker_compatibility` 健康检查从 `warning` 升级为 `error`。任务保持就绪和可见，绝不丢弃；该节点的就绪契约返回 503，负载均衡器因此将其移出轮转。
- **路由安全。** 所需兼容性没有在线 Worker 支持的就绪任务会被保留，计入 `compatibility_blocked_runs` 积压指标。路由安全绝不会悄悄退化为任务丢失；路由排空后仍适用至少一次执行保证。

为缩短 Worker 重叠窗口，应在新 Worker 上线时排空旧 Worker 群组。使用 [Worker build-id 发布](/docs/polyglot/worker-build-id-rollout)流程：

```bash
dw task-queue:drain orders-critical --build-id orders-worker-2026-04-21-z9
```

群组的 `drain_intent` 变为 `draining`。该构建的 Worker 继续完成进行中的工作，但不再领取新任务。等待该群组的 `active_worker_count` 和 `draining_worker_count` 降至零，再停止旧 Worker 进程。

调度器不运行长期任务队列，因此无需 Worker 排空。停止旧调度器容器，若尚未执行 bootstrap 则执行它，然后启动新实例。两者之间的窗口取决于新容器启动所需时间；下一次 tick 会从持久状态恢复计划触发。

若发布还引入专用匹配角色部署，应明确说明该拓扑变更，而不要假设每个执行节点仍会进行广泛的就绪任务扫描。[任务匹配与分发](/docs/polyglot/task-matching-dispatch)记录了 `workflow:v2:repair-pass --loop` 加 `DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` 的形态。通过 `GET /api/cluster/info` 验证在线节点契约：`topology.current_shape` 仍应匹配正在切换的部署，`topology.current_roles` 仍应匹配文档中的节点角色组合，`topology.matching_role.queue_wake_enabled`、`topology.matching_role.shape` 和 `topology.matching_role.wake_owner` 应显示预期的广泛就绪任务负责方。默认形态报告 `queue_wake_enabled: true`、`shape: "in_worker"` 和 `wake_owner: "worker_loop"`；专用匹配发布将执行节点切换为 `queue_wake_enabled: false`、`shape: "dedicated"` 和 `wake_owner: "dedicated_repair_pass"`。

## 就绪与切换 {#readiness-and-cutover}

使用就绪契约决定何时向节点发送流量，不能只看存活探针。

- `GET /api/health` 证明进程正在提供 HTTP 服务。
- `GET /api/ready` 证明进程能够使用其配置的运行时依赖，包括迁移、默认命名空间，以及 `DW_V2_FLEET_VALIDATION_MODE=fail` 下的 Worker 兼容性准入检查。
- `GET /api/cluster/info` 证明已验证客户端能够发现构建身份、控制平面协议、Worker 协议、负载编解码器和 Server 能力。
- `POST /api/worker/register` 证明 Worker 能通过身份验证进入预期命名空间和任务队列。

一个 API 节点的切换顺序：

1. 将节点移出负载均衡器轮转。最简单的方式是在启动新容器之前停止新镜像的启动前钩子，让负载均衡器的就绪探针失败。
2. 排空进行中的 HTTP 请求。多数客户端在连接重置后重试；长连接（Worker 长轮询）会重新连接其余节点。
3. 停止旧容器，启动新容器。
4. 等待 `GET /api/ready` 返回 200，且 `GET /api/cluster/info` 声明新构建身份。如果发布改变匹配拓扑，还应确认 `topology.matching_role.task_dispatch_mode`、`topology.matching_role.queue_wake_enabled`、`topology.matching_role.shape`、`topology.matching_role.wake_owner`、`topology.matching_role.partition_primitives` 和 `topology.matching_role.backpressure_model` 符合目标部署，再让节点接收流量。需要在响应进程的实时积压、修复和 Worker 计数旁查看相同节点本地匹配角色契约时，使用 `/api/system/operator-metrics`。
5. 将节点放回轮转。

每次只替换一个节点。前一个节点回到轮转并正常服务流量之前，不要替换下一个。

Worker 按群组切换：

1. 使用新 `build_id` 启动新 Worker 群组。
2. 通过 `dw task-queue:build-ids <queue> --json` 确认两个群组都报告 `rollout_status: "active"` 且 `active_worker_count` 非零。
3. 使用 `dw task-queue:drain` 排空旧群组。
4. 等待旧群组的 `active_worker_count` 和 `draining_worker_count` 归零。
5. 停止旧 Worker 进程。

## 回滚 {#rollback}

每一步都可逆。开始前先规划回滚。

- **Bootstrap 回滚。** v2 迁移可通过标准 Laravel `down()` 路径回滚。如果要撤销新镜像依赖的迁移，必须先停止全部新节点；否则新代码会遇到缺失的列，这些节点的就绪契约返回 503。由于 schema 变更是增量的，多数回滚不必撤销迁移。
- **API 节点回滚。** 停止新容器，在同一节点重启旧容器。启动时将其移出轮转，待 `GET /api/ready` 正常后恢复。对其他已升级 API 节点重复操作。Schema 变更是增量的，因此旧代码仍可正常读取新 schema。
- **Worker 回滚。** 恢复先前排空的群组，排空有问题的群组，再扩容已知正常的构建：

  ```bash
  dw task-queue:resume orders-critical --build-id orders-worker-2026-04-21-z9
  dw task-queue:drain  orders-critical --build-id orders-worker-2026-04-22
  ```

  恢复操作清除 `drain_intent` 和 `drained_at`，在恢复的 `build_id` 下发送心跳的 Worker 会在下次轮询时变回 `active`。两个调用都是幂等的。

若发布暴露了非增量 schema 问题，应安排整体停机升级窗口以回滚，执行修正迁移并重新规划。

## 操作人员验证 {#operator-verification}

通过操作接口验证每个发布阶段，不要仅凭日志。

| 问题 | 接口 |
| --- | --- |
| Bootstrap 是否完成？ | `php artisan server:bootstrap --force` 退出码为 0；`migrate:status` 显示每项迁移均已执行。 |
| 新节点是否就绪？ | `GET /api/ready` 返回 200；`GET /api/cluster/info` 报告新构建。 |
| 兼容性准入是否健康？ | `GET /api/system/operator-metrics` 的 `workers.fleet`、`workers.active_workers` 和 `workers.active_workers_supporting_required` 对每个所需兼容性标记都一致显示非零支持者数量。 |
| Worker 排空是否推进？ | `dw task-queue:build-ids <queue> --json` 显示排空群组的 `active_worker_count` 和 `draining_worker_count` 下降。 |
| 路由是否安全？ | `GET /api/system/operator-metrics` 的 `backlog.compatibility_blocked_runs` 和 `backlog.max_compatibility_blocked_age_ms` 接近零；`worker_compatibility` 健康检查不是 `error`。 |
| 调度器是否追平？ | `GET /api/system/operator-metrics` 的 `schedules.missed` 为零，`schedules.oldest_overdue_at` 为 null。 |
| 卡住的运行实例是否在堆积？ | `GET /api/system/operator-metrics` 的 `runs.repair_needed` 和 `runs.max_repair_needed_age_ms` 接近发布前基线。 |

`dw system:operator-metrics --json` 在控制台公开独立 Server 集群的同一操作指标快照，操作人员可选择适合现有流程的接口。单独部署的 Waterline 服务可通过 PHP SDK 在 `/waterline/api/v2/health` 和 `/waterline/api/stats` 下读取相同的 Server 所有发布状态；保持其端点、命名空间和 Server 令牌与正在滚动替换的集群一致。嵌入式 Laravel 部署则从进程内软件包公开这些 Waterline 路由。无论哪种情况，Server API 和 CLI 均可用，详见[操作运行边界](/docs/operator-operating-envelope)。

## 故障模式及应对 {#failure-modes-and-what-to-do}

| 症状 | 可能原因 | 操作 |
| --- | --- | --- |
| 新 API 节点启动后 `GET /api/ready` 失败 | Bootstrap 尚未完成，或 `DW_V2_FLEET_VALIDATION_MODE=fail` 且暂无兼容 Worker 在线 | 重跑 bootstrap；先让兼容 Worker 群组上线，再将 API 节点放回轮转。 |
| 发布中 `worker_compatibility` 健康检查升级为 `error` | 所需兼容性标记没有在线 Worker 支持 | 在支持该标记的 `build_id` 下启动更多 Worker；如果应回滚，则恢复先前排空的群组。 |
| `backlog.compatibility_blocked_runs` 上升，`max_compatibility_blocked_age_ms` 增长 | 任务所需标记没有在线 Worker 支持 | 同上；任务被保留，兼容 Worker 发送心跳后将自动重新分发。 |
| `dw task-queue:drain` 成功，但 Worker 继续领取任务 | Worker 进程在排空操作后尚未发送心跳 | 等待一个心跳周期；若群组仍活跃，重启 Worker 进程，让其读取排空意图。 |
| 调度器重启后计划停止触发 | 新旧调度器均已停止 | 启动新调度器容器；在下次操作指标抓取时确认 `schedules.missed` 归零。 |

若症状不在此列表中，将发布视为失败：停止增加新进程，排空已启动的新群组，先恢复之前的构建，再进一步调试。

## 相关参考 {#related-references}

- [自托管部署](/docs/deployment)：本契约假定的部署形态。
- [Worker build-id 发布](/docs/polyglot/worker-build-id-rollout)：逐群组排空和恢复调用。
- [操作运行边界](/docs/operator-operating-envelope)：与发布信号一起阅读的诊断、队列和重建契约。
- [Server 配置参考](/docs/polyglot/server-config-reference)：发布安全环境变量（`DW_V2_FLEET_VALIDATION_MODE`、`DW_V2_PIN_TO_RECORDED_FINGERPRINT`、`DW_V2_GUARDRAILS_BOOT`、`DW_V2_CACHE_VALIDATION_MODE`、`DW_V2_MULTI_NODE`、`DW_V2_VALIDATE_CACHE_BACKEND`、`DW_V2_TASK_REPAIR_*`）。
- [Server API 参考](/docs/polyglot/server-api-reference)：验证每个发布阶段使用的就绪、集群信息和操作指标端点。
