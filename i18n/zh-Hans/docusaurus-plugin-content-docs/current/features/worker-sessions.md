---
sidebar_position: 24
title: Worker 会话
description: 将一系列持久活动尝试固定到同一 Worker 会话租约，以获得 GPU、文件系统或进程本地状态的亲和性。
tags:
  - activities
  - workers
  - affinity
  - operations
keywords:
  - Worker 会话
  - 活动亲和性
  - GPU Worker
  - 本地文件系统 Worker
  - Worker 协议会话
---

# Worker 会话 {#worker-sessions}

Worker 会话是 v2 的活动亲和性原语。多个持久活动步骤必须复用进程本地状态、GPU 内存、挂载文件系统或其他 Worker 本地资源时，使用会话。

## 契约概要 {#contract-summary}

- 同一时间，一个会话只有一个租约持有者。
- 首个被接纳的会话内活动创建或重新获取租约。
- 活动心跳同时续租活动尝试和会话。
- `POST /api/worker/sessions`、`POST /api/worker/sessions/{sessionId}/heartbeat` 和 `DELETE /api/worker/sessions/{sessionId}` 为外部 Worker 提供显式生命周期操作。
- 先执行队列路由，Worker 注册到任务队列后再执行 Worker 会话接纳。
- Worker 注册的 `capabilities` 必须满足会话的所有要求。
- 过期和孤立会话对运维人员可见，允许故障恢复的会话可以被重新获取。

## 编写 API {#authoring-api}

PHP 工作流作者使用 `Workflow::workerSession()` 或 `Workflow\V2\workerSession()` 创建会话句柄，并通过该句柄调度活动：

```php
use Workflow\V2\Support\WorkerSessionOptions;
use Workflow\V2\Workflow;

$session = Workflow::workerSession(
    'gpu-render',
    new WorkerSessionOptions(
        queue: 'gpu-activities',
        requirements: ['gpu:nvidia-l4'],
        leaseSeconds: 120,
        ttlSeconds: 1800,
        maxConcurrentActivities: 1,
    ),
);

$frames = $session->activity(RenderFramesActivity::class, $videoId);
$manifest = $session->activity(AssembleManifestActivity::class, $frames['path']);
```

活动选项快照在 `activity_options.worker_session` 下保存同一契约。外部运行时在 `schedule_activity` 工作流任务命令的 `worker_session` 下使用相同 JSON 结构。

```json
{
  "type": "schedule_activity",
  "activity_type": "media.render-frames",
  "worker_session": {
    "session_id": "gpu-render",
    "queue": "gpu-activities",
    "requirements": ["gpu:nvidia-l4"],
    "lease_seconds": 120,
    "ttl_seconds": 1800,
    "max_concurrent_activities": 1,
    "create_if_missing": true,
    "allow_reacquire_after_failure": true
  }
}
```

## Python 服务 Worker {#python-service-workers}

[Python Worker 会话示例](../polyglot/python.md#worker-sessions)创建 `WorkerSessionOptions`，安排两个顺序执行的远程活动，声明持有者能力，并处理重试耗尽后的活动失败。它还展示了持有者丢失后如何重建可丢弃的 Worker 本地状态，并解释为何显式关闭或 TTL 到期后需要新会话 ID。该方案已使用发布的 Python SDK 2.9.0 和 Server 2.11.0 验证，包括 Server 调度器/维护角色。

## 生命周期 {#lifecycle}

会话按需创建。首个会话内活动任务被具备所需能力的 Worker 接纳时，匹配层创建或重新获取会话。Worker 也可以在轮询前调用 `POST /api/worker/sessions` 显式创建会话。

持有者关闭会话、会话租约过期、绝对 TTL 到期或检测到持有 Worker 故障时，活动会话结束。TTL 到期和显式关闭对该会话 ID 是终态。`allow_reacquire_after_failure` 为真时，租约过期或检测为孤立的会话可以被重新获取。

## 租约与所有权 {#lease-and-ownership}

同一时间最多一个 Worker 持有会话租约。只有满足以下条件之一时，Server 才接纳会话内活动任务：

- 会话不存在，且 `create_if_missing` 为真；
- 活动会话已由当前轮询 Worker 持有；
- 会话已过期、失败或孤立，且允许重新获取。

会话所有权不取代每次活动尝试的租约。每次活动尝试仍有自己的 `activity_attempt_id`、租约持有者、心跳、完成、失败、超时和取消路径。

## 接纳与路由 {#admission-and-routing}

Worker 会话参与普通队列路由。`WorkerSessionOptions` 可设置 `connection` 和 `queue`；逐调用的 `ActivityOptions` 仍可覆盖它们。Server 在普通任务队列接纳之后应用会话专有接纳规则：

- Worker 注册的 `capabilities` 必须覆盖所有会话要求；
- `max_concurrent_activities` 限制会话内持有租约的活动尝试数；
- `max_concurrent_worker_sessions` 限制单个 Worker 注册持有的活动会话租约数。

针对特定 Worker 集群的路由使用普通能力字符串，如 `gpu:nvidia-l4`、`gpu:a100`、`fs:/mnt/models` 或 `zone:us-east-1a`。

## 故障、取消与关闭 {#failure-cancellation-and-shutdown}

活动心跳同时续租活动尝试和会话。Worker 也可通过 Worker 协议直接续租会话。会话租约过期后，会话变为 `expired`；持有者的 Worker 注册心跳过期或缺失时，会话变为 `orphaned`。

持有 Worker 在步骤序列中途失效时，执行中的活动保留普通至少一次行为：尝试租约过期，修复使其可再次认领，过期完成报告可能被拒绝。契约允许时，具备所需能力的 Worker 可以重新获取会话。工作流作者必须预期重新获取后需要重建进程本地状态。

工作流取消仍通过活动心跳响应传播。会话租约绝不允许会话内活动忽略 `cancel_requested`。计划关闭 Worker 时，应先通过 `DELETE /api/worker/sessions/{sessionId}` 关闭持有的会话，再停止进程；执行中的活动仍按各自尝试租约完成、失败、取消或过期。

## 可见性 {#visibility}

Worker 协议能力通过 `GET /api/cluster/info` 和每个 Worker 平面响应公告 `worker_session_verbs` 和 `worker_sessions` 运行时契约。机器可读契约发布在 [`worker-sessions-runtime.schema.json`](/platform-protocol-specs/worker-sessions-runtime.schema.json)，并在[平台协议规范](/docs/platform-protocol-specs#worker-session-runtime-notes)目录中建立索引。

运维人员可通过 `GET /api/worker-sessions` 列出活动、已关闭、已过期、失败和孤立会话。详情包含会话 ID、持有者、队列、要求、租约到期、TTL 到期、活动中的活动数量和失败原因。系统运维指标包含各会话状态的数量。

## 何时选择 Worker 会话 {#choosing-worker-sessions}

每个步骤彼此独立时，优先使用普通队列活动。整个操作是一个原子副作用时，优先使用一个较大的活动。只有多个持久活动步骤必须复用 Worker 本地资源，且工作流能够容忍 Worker 故障后重建该资源时，才使用 Worker 会话。

Worker 会话与普通队列活动、本地活动和粘性执行的关系见[活动执行模型](/docs/features/activity-execution-model)。
