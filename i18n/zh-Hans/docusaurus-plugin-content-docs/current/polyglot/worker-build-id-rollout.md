---
sidebar_position: 7
title: Worker 构建 ID 发布
description: 使用独立服务器的构建 ID 发布状态，完成 Worker 构建的发布、金丝雀测试、排空和回滚，避免执行搁置。
tags:
  - worker-protocol
  - operations
  - rollouts
  - build-ids
  - task-queues
keywords:
  - Worker 构建 ID 发布
  - 排空 Worker 构建
  - 回滚 Worker 构建
  - 金丝雀 Worker
  - 无版本到有版本切换
---

# Worker 构建 ID 发布 {#worker-build-id-rollout}

从未指定版本的 Worker 切换到带构建标记的 Worker、在任务队列中测试新构建、在退役旧构建前排空它，或回滚有问题的构建时，使用本参考。服务器在在线 Worker 记录之外保留运维意图，即使旧 Worker 在积压处理完前消失，下一次轮询、CLI 详情或 `list_task_queue_build_ids` 调用也会如实反映发布状态。

本指南说明群组控制。完整的路由契约见 [Worker 兼容性与路由](/docs/polyglot/worker-compatibility-routing)，其中规定执行中的工作必须固定到兼容执行器，并将“没有可用的兼容 Worker”作为明确的运维状态。

Durable Workflow 服务器将单个任务队列的发布表示为一组**构建 ID 群组**。调用 `POST /api/worker/register` 时报告相同 `build_id` 的所有 Worker 注册都属于同一群组。省略 `build_id` 的 Worker 组成**无版本群组**，这是发布前的默认状态，也是首次切换时需要迁出的群组。

## 服务器记录的发布状态 {#rollout-state-the-server-records}

每个 `(namespace, task_queue, build_id)` 群组包含汇总的 Worker 状态（活动、排空、失联和总数）及运维意图：

| 字段 | 用途 |
| --- | --- |
| `build_id` | 注册的构建标识。`null` 表示无版本群组。 |
| `rollout_status` | 群组如何处理新任务的汇总视图：`active`、`active_with_draining`、`draining`、`stale_only` 或 `no_workers`。 |
| `drain_intent` | 群组的运维意图：`active` 或 `draining`。 |
| `drained_at` | 群组首次被标记为排空的时间。群组活动时不存在。重复排空调用不会改变此时间戳。 |
| `active_worker_count` | 当前接受新任务的在线 Worker 数。 |
| `draining_worker_count` | 仍持有执行中任务，但不再认领新工作的在线 Worker 数。 |
| `stale_worker_count` | 最后心跳早于失联截止时间的 Worker 数。 |
| `total_worker_count` | 以上三类 Worker 的总数。 |
| `runtimes`, `sdk_versions` | 在群组中观察到的不同运行时和 SDK 版本字符串。 |
| `last_heartbeat_at`, `first_seen_at` | 整个群组的心跳时间窗口，用于删除前确认群组已停止活动。 |

`drain_intent` 会持久保存：重启某个 Worker、停止所有 Worker 或群组失联，都不会悄然将它恢复为 `active`。只有显式调用 `POST .../build-ids/resume` 才会清除 `drain_intent` 和 `drained_at`。因此，即使群组已没有在线 Worker，`rollout_status` 仍能准确反映状态。

## 检查发布状态 {#inspect-the-rollout}

排空或删除构建前，确认队列中哪些群组仍可访问：

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders-critical/build-ids" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

运维 CLI 和 Python SDK 提供相同快照：

```bash
dw task-queue:build-ids orders-critical --json
```

```python
from durable_workflow import Client

async with Client("https://durable-workflow.example", token=operator_token) as client:
    rollout = await client.list_task_queue_build_ids("orders-critical")
    for cohort in rollout.build_ids:
        print(cohort.build_id, cohort.rollout_status, cohort.total_worker_count)
```

## 首次切换：从无版本到有版本 {#first-cutover-unversioned-to-versioned}

一直由无版本 Worker 服务的队列，会报告一个 `build_id: null`、`rollout_status: "active"` 的群组。首次切换是在它旁边引入一个带构建标记的新群组。

1. 部署新的 Worker 集群，通过 `POST /api/worker/register` 注册稳定的 `build_id`，例如 `orders-worker-2026-04-22`。
2. 确认两个群组均活动：

   ```bash
   dw task-queue:build-ids orders-critical --json
   ```

   应看到 `null` 和新 `build_id` 都报告 `rollout_status: "active"`，且 `active_worker_count` 非零。
3. 新 Worker 开始处理工作后，开始排空无版本群组：

   ```bash
   dw task-queue:drain orders-critical --unversioned
   ```

   无版本群组的 `drain_intent` 变为 `draining`。仍在运行的 Worker 继续处理已认领任务，但停止认领新任务。之后不带 `build_id` 的 Worker 注册或心跳也会进入排空状态。
4. 等待无版本群组的 `active_worker_count` 和 `draining_worker_count` 均为零。群组仍以 `drain_intent: "draining"` 列出，便于确认切换会持续生效。

## 对新构建进行金丝雀发布 {#canary-a-new-build}

金丝雀是第二个构建，仅接收少量流量，主构建继续服务。为金丝雀使用独立的 `build_id`，以便单独检查各群组状态。

1. 部署金丝雀 Worker，使用 `build_id: orders-worker-2026-04-22-canary`。
2. 检查 `list_task_queue_build_ids`，确认两个群组均报告 `rollout_status: "active"`，且 Worker 数量符合预期。
3. 增加新 `build_id` 的 Worker 并减少主构建 Worker，以提升新构建；或排空金丝雀以撤下它：

   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22-canary
   ```

服务器不控制任务在各群组之间的分配比例。运维人员调整群组大小，依靠轮询分布为流量分配权重。构建 ID 发布状态用于确认哪些群组仍能认领工作，以及在某个群组准备停止时发起有序交接。

## 排空旧构建 {#drain-an-older-build}

排空让已租用任务继续在旧构建运行，新任务则交给队列中其他活动群组：

```bash
dw task-queue:drain orders-critical --build-id orders-worker-2026-04-21-z9
```

服务器在群组上记录 `drain_intent: "draining"`，并在该 `build_id` 下的每个已注册 Worker 下次心跳时，将其标记为排空。调用是幂等的：重复调用不会重置 `drained_at`，因此自动化可以安全重试。

Worker 行被标记为 `draining` 后，工作流任务、活动任务和查询任务轮询路由停止向其租用新工作。群组恢复前，轮询以 HTTP `409`、`poll_status: "draining"` 和 `reason: "worker_draining"` 失败。

`draining` 属于通用轮询响应契约，不是仅供排空使用的特殊字段。Worker 还通过同一 `poll_status` 接口观察正常的 `leased` 和 `empty` 轮询、准入导致的 `throttled` 结果，以及其他轮询路径上的类型化 `unavailable` 协调失败。

轮询 `list_task_queue_build_ids`，观察 `active_worker_count` 和 `draining_worker_count` 降至零，以监控排空。此时群组显示 `rollout_status: "draining"`，Worker 计数为零，表示已无在线 Worker，而运维意图仍记录“已排空”。这是安全停止 Worker 进程并删除构建产物的时机。

## 回滚有问题的构建 {#roll-back-a-bad-build}

回滚采用相反流程：恢复先前排空的群组，将新流量转回它，再排空问题构建。

1. 恢复已知正常的群组：

   ```bash
   dw task-queue:resume orders-critical --build-id orders-worker-2026-04-21-z9
   ```

   服务器清除 `drain_intent` 和 `drained_at`，并立即将该 `build_id` 下仍在发送心跳的 Worker 行恢复为 `active`，使读取端点停止报告排空状态。
2. 排空问题群组：

   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22
   ```

3. 将已知正常构建扩容，或在 Worker 已停止时重新部署。以其 `build_id` 注册的 Worker 会读取已清除的排空意图，并进入 `active` 状态。

恢复操作也是幂等的。对已活动的群组重复调用不产生变化，因此自动回滚流程可以安全发出此操作。

## 端点与命令参考 {#endpoints-and-commands-reference}

| 意图 | HTTP 端点 | CLI | Python SDK 方法 |
| --- | --- | --- | --- |
| 检查群组状态 | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| 将群组标记为排空 | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| 恢复先前排空的群组 | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |

排空与恢复均接受 JSON 请求体 `{"build_id": "..."}`，无版本群组则使用 `{"build_id": null}`。CLI 使用 `--unversioned` 表示无版本群组，其他构建使用 `--build-id <value>`；同时指定两者会立即失败。

## 相关参考 {#related-references}

- [命名空间、认证与 Worker 注册](/docs/polyglot/namespace-auth-workers)：通过 `POST /api/worker/register` 为每个 Worker 记录 `build_id`
- [任务队列准入](/docs/polyglot/task-queue-admission)：与发布状态一起生效的 Worker 执行槽和派发预算
- [Server API 参考](/docs/polyglot/server-api-reference)：完整控制平面路由及所需角色和协议头
- [CLI 命令参考](/docs/polyglot/cli-reference)：每个 `dw task-queue:*` 子命令的参数和选项结构
