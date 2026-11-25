---
sidebar_position: 7
title: Worker 构建 ID 发布
description: 检查构建群组、选择新启动使用的构建，并为固定到旧构建的运行保留处理能力。
tags: [worker-protocol, operations, rollouts, build-ids, task-queues]
keywords: [Worker 构建, 排空, 回滚, 金丝雀, 无版本 Worker]
---

# Worker 构建 ID 发布

## 更换构建前进行重放 {#replay-before-changing-builds}

晋升候选构建前，应使用其准确的应用代码重放具有代表性的运行中和最近关闭的历史。回滚前，应使用旧制品重放新构建写入的历史。请遵循[重放检查](../testing.md#replay-before-deployment)；兼容的路由构建组或完整性检查通过，本身都不能证明重放兼容性。

使用本指南检查 Worker 群组、选择新工作流使用的构建，并为已有运行保留兼容 Worker。提升构建会改变新启动的选择；排空会阻止该群组领取新任务。这些操作都不会迁移已有运行，也不能证明构建可以删除；这一判断由[受保护的退役](#retire-a-build-or-queue)做出。

[Worker 兼容性与路由](/docs/polyglot/worker-compatibility-routing)介绍工作流任务、活动、重试、子工作流及 continue-as-new 保留的身份。群组范围是 `(namespace, task_queue, build_id)`。未提供 `build_id` 的注册属于无版本的 `null` 群组。

## 服务器记录的发布状态 {#rollout-state-the-server-records}

| 字段 | 含义 |
| --- | --- |
| `build_id` | 注册的构建身份；`null` 表示无版本群组。 |
| `rollout_status` | `active`、`active_with_draining`、`draining`、`stale_only` 或 `no_workers`。 |
| `drain_intent`, `drained_at` | 持久化的排空意图及首次时间；重复排空不会改变该时间。 |
| `promoted_at`, `rolled_back_at` | 持久化的提升和回滚时间。 |
| `new_start_selected` | 此群组被显式提升选中。`false` 并不排除下文的单一群组回退选择。 |
| `active_worker_count` | 心跳新鲜且未排空的注册数；不是空闲槽位数，也不保证覆盖所有工作流类型。 |
| `draining_worker_count` | 心跳新鲜且标记排空的注册数，不能领取新任务，但不一定持有租约。 |
| `stale_worker_count` | 心跳早于 `stale_after_seconds` 阈值的注册数。 |
| `total_worker_count` | 活跃、排空和过期注册的总数。 |
| `runtimes`, `sdk_versions` | 从注册中观察到的运行时和 SDK 字符串。 |
| `last_heartbeat_at`, `first_seen_at` | 注册的新鲜度和存续时间，不能证明该构建已无剩余运行。 |
| `pending_workflow_tasks` | 下文说明的工作流任务计数及诊断。 |

排空意图在 Worker 重启、缺失和心跳过期后仍然存在，只有显式恢复才能清除。Worker 缺失不会自动恢复群组。

## 检查发布状态 {#inspect-the-rollout}

调整处理能力前，读取准确的命名空间和队列：

```bash
curl -fsS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders-critical/build-ids" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

```bash
dw task-queue:build-ids orders-critical --namespace orders-prod --json
```

```python
from durable_workflow import Client

async with Client("https://durable-workflow.example", token=operator_token,
                  namespace="orders-prod") as client:
    rollout = await client.list_task_queue_build_ids("orders-critical")
    for cohort in rollout.build_ids:
        print(cohort.build_id, cohort.rollout_status, cohort.total_worker_count)
```

旧 SDK 的响应模型可能不暴露新增字段；这类字段以 HTTP 快照为准。

## 按群组查看待处理工作流任务 {#pending-workflow-tasks-by-cohort}

`pending_workflow_tasks` 只统计此命名空间和队列中的工作流任务，按任务的有效兼容性分组；任务未指定时回退到运行的兼容性。它不是活动积压、未关闭运行数、吞吐量或进程负载。

| 子字段 | 解读 |
| --- | --- |
| `ready_count` | 状态为 `ready` 的工作流任务行数。 |
| `leased_count` | 状态为 `leased` 的行数。 |
| `total_count` | `ready_count + leased_count`。 |
| `status` | 无任务时为 `idle`；否则为 `pending`，非 null 构建没有活跃 Worker 时为 `no_compatible_worker`。 |
| `operator_visible_signal`, `message` | 缺少兼容 Worker 时的诊断；其他情况下可以为 null。 |

无版本群组不会得到这种构建专属的缺失诊断。字段缺失、请求失败或观察过期不等于零。重新读取快照，检查心跳和类型声明。

例如，旧构建可能有两个就绪任务和一个已租用任务，新构建却没有待处理任务。队列总数三不能说明哪组需要处理能力。如果旧构建没有活跃 Worker，应恢复旧构建的兼容容量，或在意外排空时显式恢复群组。增加新构建 Worker 无法处理固定到旧构建的任务。只有过期注册时，应先排查丢失的进程或心跳，再将其计为可用容量。

缩减群组前，应谨慎检查它自身的任务数、新鲜 Worker、声明的工作流类型、可用槽位和排空意图。为租约及已有运行未来产生的工作保留容量。等待信号、定时器、活动或子工作流的运行，当前可能没有工作流任务，却仍会在未来需要旧构建。活动也可能使用其他已记录队列。此端点不能提供安全退役结论，也不授权将最后一个必要群组缩容至零；请使用[受保护的退役](#retire-a-build-or-queue)。

[Server #534](https://github.com/durable-workflow/server/issues/534)跟踪独立的抓取指标与缩容至零能力。此处没有规定内置 KEDA/HPA 触发器。

## 首次从无版本切换到有版本 {#first-cutover-unversioned-to-versioned}

1. 使用稳定构建 ID 启动新 Worker，核对命名空间、队列、类型及新鲜心跳。
2. 检查两个群组和原始运行。新名称或 Worker 数量都不能证明兼容性。
3. 当新启动应选择该构建时，显式提升它：

   ```bash
   dw task-queue:promote orders-critical --namespace orders-prod --build-id orders-v2
   ```

4. 保留兼容已有历史的 Worker。提升不会修改旧固定关系，排空也不是迁移。
5. 旧构建的清单为空后，使用[受保护的退役](#retire-a-build-or-queue)将其退役。任务计数为空或注册数为零都不足以证明安全。只要某个运行可能需要它，就保留构建产物。

## 对新构建进行金丝雀发布 {#canary-a-new-build}

服务器不提供构建群组间的百分比分流。新启动选择最近提升且未排空、未回滚的群组。没有这类提升时，先选择声明所需工作流类型的唯一活跃群组，再选择队列中的唯一活跃群组。仍无法唯一确定时，运行不固定构建。因此，同类型的多个活跃群组在没有提升时不意味着加权分流。

增加 Worker 改变的是容量，不是提升后的新启动策略。若需隔离金丝雀，使用独立队列，并将选定的应用新启动显式路由到该队列。在原队列提升新构建时，仍须为旧固定运行保留旧 Worker。

## 在链的下一次延续时切换构建 {#move-a-chain-at-its-next-continuation}

当 Server 与 SDK 使用 Worker 协议 1.21 协商出 `continue_as_new_target_build` 后，可在 continue-as-new 时选择已提升的构建。后续运行使用传入的参数并开始记录新的历史。请在已提升的构建能够解码并接受这些参数时使用此选项。普通的 continue-as-new 保留前一次运行绑定的构建。

Server 在关闭前一次运行时，按后续运行的确切命名空间、队列和工作流类型选择已持久化的提升目标。如果 Server 已有该构建服务此类型的持久证据，目标构建可缩容至零个 Worker。如果没有符合条件的提升目标，Server 拒绝转换并保持当前运行开放。Worker 通过工作流任务的常规重试流程报告 `promoted_build_unavailable`。Waterline 显示拒绝及已安排的重试时间。转换成功后，相互关联的运行历史会记录两个运行绑定的构建。

只要还有开放运行需要旧构建，就保留该构建的 Worker。每条链在自己选用此功能的延续提交时切换。仍开放的子运行保留各自绑定的构建。

## 排空旧构建 {#drain-an-older-build}

排空会阻止该群组的工作流、活动和查询 poll 领取新工作，但不会转移任务。排空中 Worker 的 poll 返回 HTTP409，包含 `poll_status: "draining"` 和 `reason: "worker_draining"`。已有租约保留原有权限。

```bash
dw task-queue:drain orders-critical --namespace orders-prod --build-id orders-v1
```

不要仅因新构建能领取自己的工作就排空旧构建：旧运行可能因此一直等待。过早排空后，应恢复群组，并恢复具有原始所需构建的 Worker：

```bash
dw task-queue:resume orders-critical --namespace orders-prod --build-id orders-v1
```

排空或停止全部 Worker 不能证明可以删除构建产物。排空仍是紧急停止手段：无论是否仍有工作固定在该构建上，它都会立即拒绝该构建的轮询。是否删除应由[受保护的退役](#retire-a-build-or-queue)决定。

## 退役构建或队列 {#retire-a-build-or-queue}

Native Server 3.14.0 及更高版本会判断构建或队列能否安全移除，并在仍有任何活跃依赖时拒绝退役。要求 `GET /api/cluster/info` 中的 `capabilities.worker_build_retirement` 严格为 `true`；已发布的 PHP Server 不提供这些路由。与其他 build-id 路由一样，使用运维或管理员令牌以及命名空间。

| 目的 | HTTP 端点 |
| --- | --- |
| 检查单个构建 | `GET /api/deployments/{namespace}/{taskQueue}@{buildId}/retirement` (无版本群组使用 `@unversioned`) |
| 退役单个构建 | `POST /api/deployments/{namespace}/{taskQueue}@{buildId}/retire` |
| 检查队列上的所有群组 | `GET /api/task-queues/{taskQueue}/retirement` |
| 退役队列 | `POST /api/task-queues/{taskQueue}/retire` |

1. 提升替代构建，并让旧构建的 Worker 继续运行。它们会完成仍固定在旧构建上的运行、延迟重试、定时器以及续接的链。
2. 持续检查旧构建，直到 `retirable` 为 `true`：

   ```bash
   dw task-queue:retirement orders-critical --namespace orders-prod --build-id orders-v1 --json
   ```

   每个阻塞项都给出准确的 `count`、最多 20 个示例标识以及一个 `recovery` 操作：等待工作完成，或取消、终止你决定放弃的运行。
3. 执行退役，可选择绑定到检查时得到的 `observation.inventory_revision`：

   ```bash
   dw task-queue:retire orders-critical --namespace orders-prod --build-id orders-v1 \
     --expected-revision "$INVENTORY_REVISION"
   ```

4. 只有在退役成功后，才停止旧构建的进程。

不带 `--build-id` 或 `--unversioned` 时，两个命令作用于队列上的所有群组。这些命令需要 CLI 2.12.0 或更高版本；使用更早的 CLI 时，请直接调用 HTTP 路由。

清单统计固定在该构建上的未结束运行（包括等待中、已续接和子运行）、就绪、已租约和延迟的任务（尚未到期的活动重试和定时器）、未结束的活动、待处理的更新校验，以及（针对队列）在该队列上启动运行的计划。若存在未记录任务队列的未结束运行，清单为 `incomplete`，无法退役。

检查只是预览。退役操作会在启动、重试和任务创建所使用的同一个串行化转换中重新计数，并且只在没有剩余依赖时写入。被拒绝的退役返回 HTTP409，不做任何更改；请按照 `expected_resolution` 处理后重新检查。

| `reason` | 含义 |
| --- | --- |
| `unknown_deployment`, `unknown_task_queue` | 目标既没有已注册的 Worker，也没有已记录的发布。 |
| `selected_for_new_starts` | 队列上的新启动仍会选择此构建。请先提升替代构建。 |
| `inventory_incomplete` | 存在无法归属的未结束运行。清单缺失绝不等于允许退役。 |
| `live_dependencies` | 至少有一个阻塞项计数不为零。 |
| `inventory_changed` | `expected_inventory_revision` 已不再匹配。 |

退役成功时返回 HTTP200，以及 `outcome: "retired"`、`retired_at` 和 `retired_by`。该构建的发布意图变为终止状态 `drained`：它不会再被选为新启动目标，无法通过部署生命周期提升或恢复，其 Worker 保持排空。当队列上的所有群组都已退役且没有活跃 Worker 时，该队列上的新启动会以 `task_queue_draining` 和 `routing_status: "retired"` 被拒绝，直到有新的活跃群组注册。运行固定关系、活动队列、历史和截止时间都不会改变。

如需恢复，`dw task-queue:resume`（`POST /api/task-queues/{taskQueue}/build-ids/resume`）会把已退役的构建重新设为 `active`；退役时已保证它当时没有任何工作。

## 回滚有问题的构建 {#roll-back-a-bad-build}

恢复已知正常的 Worker，必要时恢复其群组，并为未来启动提升该构建。随后对问题部署执行回滚。回滚不会改写已有固定关系，也不会把剩余工作交给其他构建。应保留兼容 Worker，或在应用层作出明确的恢复决定。

重试、子工作流和普通的 continue-as-new 继承原先绑定的构建。部署与重放兼容的代码时，请使用稳定的构建标识。长时间运行的链可在延续时[选择已提升的构建](#move-a-chain-at-its-next-continuation)。恢复时保留已存储的兼容性字段。

## 端点和命令参考 {#endpoints-and-commands-reference}

| 目的 | HTTP 端点 | CLI | Python SDK 方法 |
| --- | --- | --- | --- |
| 检查群组 | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| 为新启动提升构建 | `POST /api/task-queues/{taskQueue}/build-ids/promote` | `dw task-queue:promote` | `Client.promote_task_queue_build_id` |
| 排空 | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| 恢复 | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |
| 检查退役条件 | `GET /api/task-queues/{taskQueue}/retirement`, `GET /api/deployments/{name}/retirement` | `dw task-queue:retirement` | — |
| 退役 | `POST /api/task-queues/{taskQueue}/retire`, `POST /api/deployments/{name}/retire` | `dw task-queue:retire` | — |

提升、排空和恢复路由接受 `{"build_id":"orders-v2"}`，无版本群组则使用 `{"build_id":null}`。退役路由接受可选的 `{"expected_inventory_revision":"..."}` 请求体。CLI 只能选择 `--build-id` 或 `--unversioned` 之一。

完整生命周期使用 `GET /api/deployments` 及 `POST /api/deployments/{name}/{promote,drain,resume,rollback}`。使用返回的名称，如 `orders-prod/orders-critical@orders-v2`，以及原命名空间。在已发布的 Apache 路径上，应保留名称中的斜杠分隔符：对整个复合名称编码可能在到达 API 前触发 Apache HTML404。被拒绝的操作返回 HTTP409，以及有类型的 `reason` 和 `blockages` 数组。检查 `expected_resolution`；拒绝不等于提升成功。独立的[Server #521](https://github.com/durable-workflow/server/issues/521)跟踪当前不完整的 OpenAPI 镜像，不代表新的运行时实现或冻结模式变更。

## 相关参考 {#related-references}

- [Worker 兼容性与路由](/docs/polyglot/worker-compatibility-routing)
- [命名空间、认证与 Worker 注册](/docs/polyglot/namespace-auth-workers)
- [任务队列接纳控制](/docs/polyglot/task-queue-admission)
- [滚动升级](/docs/rolling-upgrades)
- [Server API 参考](/docs/polyglot/server-api-reference)
- [CLI 命令参考](/docs/polyglot/cli-reference)
