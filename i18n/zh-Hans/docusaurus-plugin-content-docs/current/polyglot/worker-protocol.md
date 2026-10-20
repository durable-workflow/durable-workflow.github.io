---
sidebar_position: 5
title: Worker 协议
description: 实现版本化 Worker 平面协议，用于轮询、租约、历史重放、心跳、完成和外部任务结果。
tags:
  - worker-protocol
  - external-workers
  - polyglot
keywords:
  - Worker 协议
  - 外部 Worker 轮询
  - 工作流任务桥接
---

# Worker 协议 {#worker-protocol}

Durable Workflow 通过两个桥接契约提供版本化 Worker 协议。这些契约定义外部 Worker（包括独立 Durable Workflow 服务器）轮询、认领、执行和完成工作流与活动任务时使用的完整操作集。

## 协议版本 {#protocol-version}

当前服务器声明的协议版本为 **1.20**。协议采用类似语义化版本的编号方式：

- **主版本**在不向后兼容的变更时递增，例如新增必填字段、移除操作或改变分页语义。
- **次版本**在增量变更时递增，例如新增可选字段或非终态命令类型。

Worker 可以使用同一主版本内较旧的次版本。声明 `1.N` 的服务器在 `M <= N` 时接受 `X-Durable-Workflow-Protocol-Version: 1.M`，并在响应中返回自己声明的 `1.N`。因此，默认的 `1.20` 服务器接受 `1.0` 至 `1.20` 的请求版本。部署前应发现每个 SDK 要求的次版本和可选能力配置。缺失或格式错误的头、不同主版本，以及比服务器更新的 Worker 次版本，均被拒绝处理。

PHP SDK 2.3.2、Python SDK 2.5.7 和 Rust SDK 3.5.0 默认使用 `1.20`。这些版本也支持显式选择 `1.19`，以连接较旧的兼容 Server。包括协作式取消在内的可选 Worker 能力仍需显式启用，选择协议版本不会启用它们。配置及已发布兼容性元数据见各 [SDK 文档](/docs/polyglot/deployment-modes/)。

可以通过程序获取完整协议描述：

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$summary = WorkerProtocolVersion::describe();
// Returns version, verb lists, command types, and pagination defaults.
```

## 能力发现 {#capability-discovery}

独立服务器在 `GET /api/cluster/info` 的 `worker_protocol.server_capabilities` 下发布 Worker 协议能力。同一对象还会作为 `server_capabilities` 出现在 Worker 平面响应中，包括轮询、心跳、完成和失败响应。

发送可选命令字段前，读取以下字段：

- `supported_workflow_task_commands`：工作流任务完成操作接受的命令类型。
- `poll_status`：即使没有租用任务，轮询响应也携带机器可读状态，区分 `leased`、`empty`、`throttled` 和 `unavailable`，客户端无须从 `task: null` 推断队列状态。
- `activity_retry_policy` 和 `activity_timeouts`：活动命令的重试及超时选项。
- `worker_session_verbs` 和 `worker_sessions`：Worker 会话生命周期操作、活动命令字段、续期行为、故障检测和终态。Worker 会话运行时结构由 [`worker-sessions-runtime.schema.json`](/platform-protocol-specs/worker-sessions-runtime.schema.json)规定。
- `child_workflow_retry_policy` 和 `child_workflow_timeouts`：子工作流重试及超时选项。
- `parent_close_policy`：子工作流的父级关闭策略支持。
- `query_tasks`：服务器为外部运行时路由的工作流查询任务。
- `non_retryable_failures`：工作流和活动的失败元数据支持。

轮询前，每个 Worker 必须通过 `POST /api/worker/register` 注册命名空间、任务队列、运行时、支持的类型键和本地容量。[命名空间、认证与 Worker 注册](/docs/polyglot/namespace-auth-workers)参考规定了注册负载和按角色限定权限的认证契约。这些操作背后的就绪任务发现和租约分配契约见[任务匹配与派发](/docs/polyglot/task-matching-dispatch)。多个持久步骤间的活动亲和性见 [Worker 会话](/docs/features/worker-sessions)。

## 执行语义 {#execution-semantics}

Worker 传输采用至少一次的分布式协调，不保证恰好一次投递：

- 工作流任务重放从已提交历史重建状态，不是工作流级重试
- 活动任务租约过期可能触发向另一个 Worker 重新投递
- 另一次尝试已提交胜出的持久结果时，迟到的完成或失败报告可能作为过期报告被拒绝

Worker 或载体访问其他系统时，默认使用 `activity_execution_id` 作为远程幂等键。只有下游系统必须区分同一逻辑活动执行的不同尝试时，才使用 `activity_attempt_id`。

这些操作背后的重放、重试、租约过期、重新投递，以及按持久标识恰好一次记录历史的权威契约，见[执行保证与幂等性](/docs/constraints/execution-guarantees)。

## 工作流任务桥接 {#workflow-task-bridge}

`WorkflowTaskBridge` 契约定义外部 Worker 如何与持久工作流任务交互：

| 操作 | 描述 |
|------|-------------|
| `poll` | 查找符合队列和兼容性条件的就绪工作流任务 |
| `claim` / `claimStatus` | 认领指定任务，获得 5 分钟租约 |
| `historyPayload` | 获取已认领任务的完整重放历史 |
| `historyPayloadPaginated` | 为大型工作流分页获取历史 |
| `execute` | 使用包执行器在进程内认领并执行任务 |
| `complete` | 从外部 Worker 提交命令以完成任务 |
| `fail` | 记录外部 Worker 报告的任务失败 |
| `heartbeat` | 延长已认领任务的租约 |

### 历史分页 {#paginated-history}

历史较大的工作流可使用 `historyPayloadPaginated` 分页获取事件：

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;

$bridge = app(WorkflowTaskBridge::class);

$afterSequence = 0;
$allEvents = [];

do {
    $page = $bridge->historyPayloadPaginated($taskId, $afterSequence, 500);
    $allEvents = array_merge($allEvents, $page['history_events']);
    $afterSequence = $page['next_after_sequence'] ?? $afterSequence;
} while ($page['has_more']);
```

默认每页 500 个事件，与 `WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` 以及服务器在 Worker 协议能力中发布的 `default_history_page_size` 一致；最大为 1000。服务器可通过 Worker 协议清单声明不同的有效默认值，因此应优先读取已发布能力，不要硬编码任一数值。响应包含 `has_more` 和 `next_after_sequence`，用于基于游标的分页。

### 历史压缩 {#history-compression}

历史非常大的工作流可以由桥接或服务器压缩历史事件负载，减少传输大小。压缩需要主动选择：调用方必须通过类似 `Accept-Encoding` 的参数请求压缩。

响应中的事件数超过压缩阈值（50 个事件）时，桥接可能返回：

- `history_events`：`[]`，空数组表示事件位于压缩字段中
- `history_events_compressed`：base64 编码的压缩负载
- `history_events_encoding`：使用的算法，为 `gzip` 或 `deflate`

调用方先解码 base64，再按指定算法解压，并对结果进行 JSON 解码，恢复原始 `history_events` 数组。

```php
use Workflow\V2\Support\HistoryPayloadCompression;

// Compress a history payload for transfer (bridge/server side).
$compressed = HistoryPayloadCompression::compress($payload, 'gzip');

// Decompress on the worker side.
$original = HistoryPayloadCompression::decompress($compressed);
```

调用方未请求压缩，或事件数低于阈值时，响应包含标准的未压缩 `history_events` 数组。

### 长轮询语义 {#long-poll-semantics}

两个 `poll` 操作都支持可选长轮询。调用方提供 `timeout_seconds` 参数时，桥接或服务器保持连接打开，最多等待指定时长，直到匹配任务就绪，不会立即返回空结果。

| 参数 | 默认值 | 最小值 | 最大值 |
|-----------|---------|-----|-----|
| `timeout_seconds` | 30 | 1 | 60 |

行为如下：

- 等待期间任务就绪时，立即返回任务。
- 超时且没有任务时，响应保持正常轮询封装，返回 `task: null` 和 `poll_status: "empty"`。
- 除非正在关闭，客户端收到空长轮询响应后应立即重试。
- 传输层 HTTP 超时应设置为大于 60 秒，避免提前断开连接。

每个 Worker 轮询响应都包含 `poll_status`：

| 值 | 含义 |
|------|---------|
| `leased` | 服务器已将任务租给此 Worker。 |
| `empty` | 短轮询或长轮询超时结束前，没有就绪的匹配任务。 |
| `throttled` | 准入限制阻止服务器租用工作，即使队列中仍可能有就绪任务。 |
| `unavailable` | 队列或匹配路径暂时不可用，Worker 应将其视为临时基础设施问题。 |

先根据 `poll_status` 分支处理，再判断空轮询是否意味着空闲容量。`task: null` 与 `poll_status: "throttled"` 表示背压，不表示没有工作。

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$semantics = WorkerProtocolVersion::longPollSemantics();
// ['default_timeout_seconds' => 30, 'min_timeout_seconds' => 1, 'max_timeout_seconds' => 60]

// Clamp a caller-supplied timeout to the valid range.
$clamped = WorkerProtocolVersion::clampLongPollTimeout($userTimeout);
```

### 轮询响应状态 {#poll-response-status}

服务器为工作流任务、活动任务和查询任务轮询保持统一响应契约：

- `task`：已租用任务负载；本次未租用工作时为 `null`。
- `poll_status`：本次轮询尝试的机器可读结果。
- `protocol_version` 和 `server_capabilities`：回传的 Worker 协议清单字段。

Worker 应先按 `poll_status` 分支处理，再对 `task` 做路由专用假设：

| `poll_status` | 常见 HTTP 状态 | 含义 |
| --- | --- | --- |
| `leased` | `200` | 服务器已租用工作，`task` 包含负载。 |
| `empty` | `200` | 轮询返回前没有就绪的匹配任务。 |
| `throttled` | `200` | 队列准入限制阻止本次轮询获取新租约。 |
| `unavailable` | `503` 或 `200` | 服务器无法安全协调队列，返回类型化的不可用结果。 |
| `draining` | `409` | Worker 的构建 ID 群组正在排空，服务器拒绝租用新工作，返回 `reason: "worker_draining"`。 |

### 完成、心跳和失败请求 {#completion-heartbeat-and-fail-requests}

工作流任务的 `complete`、`heartbeat` 和 `fail` 端点，都要求 Worker 回传轮询或认领响应中的两个租约标识字段：

| 字段 | 类型 | 描述 |
|------|------|-------------|
| `lease_owner` | 字符串 | 持有任务租约的 Worker 标识。必须与 `poll` 或 `claim` 返回的 `lease_owner` 一致。 |
| `workflow_task_attempt` | 大于等于 1 的整数 | 已租用任务的尝试次数。必须与 `poll` 或 `claim` 返回的 `workflow_task_attempt` 一致。 |

应用任何命令前，先拒绝过期尝试或不匹配的租约持有者，因此已过期 Worker 无法向被重新认领的任务提交重放命令。

请求端点与请求体：

- `POST /api/worker/workflow-tasks/{task_id}/complete`：要求 `lease_owner`、`workflow_task_attempt` 和非空 `commands` 数组。命令结构见[命令类型](#command-types)。
- `POST /api/worker/workflow-tasks/{task_id}/heartbeat`：要求 `lease_owner` 和 `workflow_task_attempt`，返回续期后的租约到期时间及当前运行状态。
- `POST /api/worker/workflow-tasks/{task_id}/fail`：要求 `lease_owner`、`workflow_task_attempt`，以及包含必填 `message`、可选 `type` 和 `stack_trace` 的 `failure` 对象。

完成请求示例：

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1,
  "commands": [
    { "type": "complete_workflow" }
  ]
}
```

心跳请求示例：

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1
}
```

失败请求示例：

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1,
  "failure": {
    "message": "Replay mismatch at event 7",
    "type": "DeterminismFailed"
  }
}
```

### 命令类型 {#command-types}

完成工作流任务时，外部 Worker 提交一组类型化命令。每次完成操作最多允许一个终态命令。

**非终态命令**可以为零个或多个，按顺序处理：

| 类型 | 必填字段 | 描述 |
|------|----------------|-------------|
| `schedule_activity` | `activity_type` | 调度待执行的活动任务 |
| `start_timer` | `delay_seconds` | 调度持久定时器 |
| `start_child_workflow` | `workflow_type` | 启动子工作流实例 |
| `complete_update` | `update_id` | 将已接受的更新标记为已应用且已完成 |
| `fail_update` | `update_id`, `message` | 将已接受的更新标记为失败 |
| `record_side_effect` | `result` | 记录确定性的副作用结果 |
| `record_version_marker` | `change_id`, `version`, `min_supported`, `max_supported` | 记录版本决策 |
| `upsert_search_attributes` | `attributes` | 在工作流运行上插入或更新索引元数据 |

`schedule_activity` 接受可选的 `retry_policy`、`start_to_close_timeout`、`schedule_to_start_timeout`、`schedule_to_close_timeout` 和 `heartbeat_timeout` 字段。`retry_policy` 使用 `max_attempts`、`backoff_seconds` 和 `non_retryable_error_types`。

`start_child_workflow` 接受可选的 `parent_close_policy`、`retry_policy`、`execution_timeout_seconds` 和 `run_timeout_seconds` 字段。`parent_close_policy` 为 `abandon`、`request_cancel`、`request_cancellation` 或 `terminate` 之一。`request_cancel` 立即关闭子工作流；`request_cancellation` 携带原始取消标识和截止时间请求协作式清理，参见[协作式取消](/docs/polyglot/cancellation)。子工作流重试策略使用与活动相同的 `max_attempts`、`backoff_seconds` 和 `non_retryable_error_types` 对象结构。重试退避在子运行失败后应用；无效子工作流启动命令属于协议错误，不消耗子工作流重试次数。

`complete_update` 在 Worker 应用更新处理器后，关闭 `update_id` 指定的已接受更新。它接受可选的 `result` 负载，使用与工作流完成结果相同的 `{codec, blob}` 封装。`fail_update` 将已接受更新关闭为失败，除必填 `message` 外，还接受可选的 `exception_class`、`exception_type` 和 `non_retryable` 字段。

**终态命令**最多一个：

| 类型 | 必填字段 | 描述 |
|------|----------------|-------------|
| `complete_workflow` | — | 将运行标记为完成，可选 `result` |
| `fail_workflow` | `message` | 将运行标记为失败 |
| `continue_as_new` | — | 关闭运行并启动新运行，可选 `arguments`、`workflow_type` |

工作流任务持有租约期间，如果取消或终止命令关闭了运行，工作流任务的 `history`、`heartbeat`、`complete` 和 `fail` 调用仍保留 Worker 协议封装，但以 `reason: "run_closed"` 拒绝。响应还包含 `can_continue: false`、`cancel_requested: true`，以及 `run_cancelled` 或 `run_terminated` 等具体 `stop_reason`，使 Worker 能区分取消观察与一般租约错误。同一响应还包含持久运行记录中的 `run_closed_reason` 和 `run_closed_at`，便于 Worker 记录导致已租用任务停止的确切关闭状态。

工作流任务轮询响应包含从持久任务负载复制的稳定恢复上下文：

| 字段 | 含义 |
|------|---------|
| `workflow_wait_kind` | 本任务应用的等待：`update`、`signal`、`child`、`condition`、`timer`；普通重放或启动任务为 `null` |
| `open_wait_id` | 稳定等待标识，例如 `update:{id}` 或 `signal-application:{id}` |
| `resume_source_kind` / `resume_source_id` | 唤醒任务的持久来源，例如 `workflow_update`、`workflow_signal`、`timer` 或 `child_workflow_run` |
| `workflow_update_id` | 任务应用更新时的已接受更新 ID |
| `workflow_signal_id` | 任务应用信号时的已接受信号 ID |
| `signal_name` / `signal_wait_id` | 任务应用信号或带定时器的信号等待时，对应的信号目标和稳定等待标识 |
| `workflow_command_id` | 可用时，提供产生该任务的控制平面命令 ID |
| `activity_execution_id` / `activity_attempt_id` / `activity_type` | 任务在活动完成或失败后恢复时的活动标识 |
| `child_call_id` / `child_workflow_run_id` | 任务解析子工作流结果时的子工作流等待标识 |
| `timer_id` / `condition_wait_id` | 任务在定时器触发后恢复时的纯定时器和带定时器条件等待标识 |
| `condition_key` / `condition_definition_fingerprint` | 带定时器条件等待记录了这些值时，提供稳定条件标签和谓词指纹 |
| `workflow_sequence` / `workflow_event_type` | 基于事件的活动、子工作流和定时器结果解析任务的历史序列与事件类型 |

不适用的字段为 `null`。SDK Worker 需要将已租用任务与已接受更新、信号、活动结果、子工作流结果或带定时器等待关联时，应优先使用这些字段，无须扫描历史。纯定时器恢复设置 `workflow_wait_kind: "timer"`、`open_wait_id: "timer:{timer_id}"`、`resume_source_kind: "timer"` 和 `timer_id`。基于信号的恢复设置 `workflow_wait_kind: "signal"` 和 `signal_name`；已接受信号的应用任务还设置 `workflow_signal_id`，带定时器信号等待则设置 `signal_wait_id` 和触发的 `timer_id`。条件超时恢复设置 `workflow_wait_kind: "condition"`、`condition_wait_id`；具名等待还设置 `condition_key` 和 `condition_definition_fingerprint`。

## 查询任务 {#query-tasks}

控制平面查询指向代码由外部运行时管理的工作流时，独立服务器无法在 PHP 进程内重放该工作流。它会创建临时查询任务，等待工作流任务队列中活动且支持查询的 Worker 执行。工作流代码位于 Server 进程之外的远程 PHP SDK Worker 也属于此情况。

查询任务只读。Worker 重放提供的历史，调用已注册查询处理器，然后完成查询任务或报告失败。它们不写入持久历史事件，且调用方控制平面查询超时后不会重试。

| 端点 | 描述 |
|----------|-------------|
| `POST /api/worker/query-tasks/poll` | 在 Worker 注册的任务队列上长轮询查询任务 |
| `POST /api/worker/query-tasks/{query_task_id}/complete` | 提交查询结果 |
| `POST /api/worker/query-tasks/{query_task_id}/fail` | 拒绝查询或报告失败 |

轮询请求：

```json
{
  "worker_id": "py-worker-1",
  "task_queue": "orders"
}
```

轮询响应：

```json
{
  "poll_status": "leased",
  "task": {
    "query_task_id": "01J...",
    "query_task_attempt": 1,
    "workflow_id": "order-123",
    "run_id": "01J...",
    "workflow_type": "order-processing",
    "query_name": "status",
    "payload_codec": "avro",
    "workflow_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "query_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "history_events": [],
    "task_queue": "orders",
    "lease_owner": "py-worker-1",
    "lease_expires_at": "2026-04-18T12:00:00.000000Z"
  },
  "protocol_version": "1.13",
  "server_capabilities": { "query_tasks": true }
}
```

轮询没有返回租约时，`task` 为 `null`。使用 `poll_status` 区分普通的空等待、限流或暂时的队列不可用。Worker 完成或报告失败时，必须回传 `lease_owner` 和 `query_task_attempt`；过期尝试和不匹配的租约持有者会被拒绝。

完成请求：

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "result": { "status": "ready" },
  "result_envelope": { "codec": "avro", "blob": "<base64-avro-bytes>" }
}
```

失败请求：

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "failure": {
    "reason": "rejected_unknown_query",
    "message": "unknown query 'status'",
    "type": "QueryFailed"
  }
}
```

工作流类型没有匹配的查询处理器时，使用 `reason: "rejected_unknown_query"`，控制平面调用方收到 `404`。其他 Worker 侧查询失败应使用 `reason: "query_rejected"`，并返回 `409`。没有活动 Worker 可以接受查询时，控制平面返回 `query_worker_unavailable`；配置的超时内未收到结果时，返回 `query_worker_timeout`。

## 活动任务桥接 {#activity-task-bridge}

`ActivityTaskBridge` 契约定义外部 Worker 如何与活动任务交互：

| 操作 | 描述 |
|------|-------------|
| `poll` | 查找符合队列和兼容性条件的就绪活动任务 |
| `claim` / `claimStatus` | 认领指定活动任务并获得租约 |
| `complete` | 记录活动完成及结果 |
| `fail` | 记录活动失败，可附带有编解码器标签的 `failure.details` |
| `status` | 检查存活与取消状态，不续租 |
| `heartbeat` | 延长租约，并报告可选进度 |

活动心跳响应包含 `can_continue` 和 `cancel_requested` 字段，让长时间运行的活动能够响应取消请求。运行级取消或终止命令停止已租用活动时，心跳、完成和失败响应还包含 `run_closed_reason` 和 `run_closed_at`。

## 负载编解码器 {#payload-codecs}

跨 Worker 协议边界的每个负载字节串都标有 **`payload_codec`**，指明附带 blob 的格式。v2 使用同一个语言无关编解码器 **`avro`**，使任一 SDK（PHP、Python、Go、TypeScript、Rust）都能在不共享运行时或应用密钥的情况下编码和解码负载。运行中的服务器在 `GET /api/cluster/info` 的 **`capabilities.payload_codecs`** 下声明编解码器支持。

### `avro` 编解码器 {#the-avro-codec}

`avro` 是 v2 类型化值编解码器。每个负载使用固定的递归 `durable_workflow.protocol.Value` schema 和标准 Avro 单对象帧。具名分支保留布尔值、有符号 64 位整数、有限双精度浮点数、字节、UTF-8 字符串、列表和字符串键映射，无需工作流专用 schema 或注册服务。参见 [Avro Value 协议](/docs/polyglot/avro-value-protocol/)。

### 线格式：负载封装 {#wire-format-payload-envelope}

在携带负载字节的字段（`arguments`、`result`、`payload` 等）中，Worker 协议在不透明字符串旁提供编解码器。轮询响应形式如下：

```json
{
  "task_id": "...",
  "payload_codec": "avro",
  "arguments": {
    "codec": "avro",
    "blob": "<base64-avro-bytes>"
  },
  "history_events": [ ... ]
}
```

Worker 在解码前读取 `payload_codec`，确认它是 `avro`。无法识别的编解码器值属于错误，Worker 不应尝试探测或猜测。

活动完成以同样的 `{codec, blob}` 封装发送 `result`。活动失败可在 `failure.details` 中发送结构化诊断负载；存在时，`failure.details` 也是 `{codec, blob}` 封装。服务器原样存储详情 blob，并在持久失败负载中记录 `details_payload_codec`，使非 PHP Worker 无需 PHP 序列化即可往返传递诊断数据。

稳定的跨语言失败接口包含 `activity_type`、`failure_category`、`exception_type`、`message`、`code`、`non_retryable`，以及带编解码器标签的 `details`。异常类名、源文件路径、行号和堆栈跟踪等运行时字段仅用于诊断。SDK 不应在默认 `exception_payload` 中公开这些运行时字段；仅当 Worker 或服务器显式记录 `diagnostics` 或 `runtime_diagnostics` 封装时，才可展示它们。

### 启动工作流 {#starting-a-workflow}

`POST /api/workflows` 接受两种形式的 `input`：

1. **普通 JSON 数组**：服务器将每个 JSON 值适配到固定 Avro Value schema。JSON 输入无法表达字节分支；需要字节的客户端应发送显式 Avro 封装。

   ```json
   { "workflow_type": "MyWorkflow", "input": ["hello", 42] }
   ```

2. **显式封装**：适用于已持有预编码字节的客户端：

   ```json
   {
     "workflow_type": "MyWorkflow",
     "input": { "codec": "avro", "blob": "<base64-avro-bytes>" }
   }
   ```

服务器原样存储 blob，并为运行标记 `avro` 编解码器。

编解码器存储在 `WorkflowRun` 上，并**在运行的整个生命周期中传播**：活动参数、结果、信号和更新参数，以及子工作流输入都采用 Avro 编码。

嵌入式或包内启动（通过 PHP `WorkflowStub::make(...)->start(...)` 启动工作流，而非 HTTP API）也按最终 v2 仅支持 Avro 的编解码器契约解析新运行默认值。

## 解析桥接服务 {#resolving-the-bridges}

两个桥接都注册在 Laravel 容器中，可以直接解析：

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;
use Workflow\V2\Contracts\ActivityTaskBridge;

$workflowBridge = app(WorkflowTaskBridge::class);
$activityBridge = app(ActivityTaskBridge::class);
```

## 相关指南 {#related-guides}

- [Server](./server.md)：托管此协议的控制平面端点和部署形态。
- [外部执行接口](./external-execution.md)：基于 Worker 协议构建、具有活动执行语义的 Worker、桥接和处理器契约。
