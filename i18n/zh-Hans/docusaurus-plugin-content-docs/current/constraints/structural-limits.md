---
sidebar_position: 5
---

# 结构限制 {#structural-limits}

结构限制约束单次工作流运行的资源消耗。当操作将超出配置的限制时，引擎会记录类型化故障，包含机器可读的 `structural_limit` 故障类别和具体限制类型，然后将运行标记为失败。这可保护系统，避免无界扇出、过大载荷和元数据膨胀。

## 限制类型 {#limit-kinds}

| 限制类型 | 默认值 | 约束对象 |
|---|---|---|
| `pending_activity_count` | 2,000 | 同时处于非终态的活动执行数 |
| `pending_child_count` | 1,000 | 同时处于非终态的子工作流数 |
| `pending_timer_count` | 2,000 | 同时等待中的定时器数 |
| `pending_signal_count` | 5,000 | 同时等待处理的信号数 |
| `pending_update_count` | 500 | 同时未解决的更新数 |
| `command_batch_size` | 1,000 | 单次并行扇出（`all()`）的项目数 |
| `payload_size_bytes` | 2 MiB | 单个参数载荷序列化后的大小 |
| `memo_size_bytes` | 256 KiB | 未索引 memo 元数据序列化后的大小 |
| `search_attribute_size_bytes` | 40 KiB | 已索引搜索属性元数据序列化后的大小 |
| `history_transaction_size` | 5,000 | 单次工作流任务执行产生的历史事件数 |

所有限制均在调度、记录或命令接收时检查。值为 `0` 时，禁用该类限制的检查。

## 软限制警告 {#soft-limit-warnings}

在硬限制终止运行或拒绝命令之前，引擎可以警告资源正接近上限。当按数量计量的资源（待处理活动、子工作流、定时器、信号、更新、命令批次大小或历史事务事件数）超过硬限制的可配置百分比时，引擎会记录结构化警告。

默认警告阈值为 **80%**。例如，`pending_activity_count` 默认限制为 2,000，运行中的待处理活动达到 1,600 个时就会记录警告。运行仍正常执行，运维人员可在硬限制导致运行失败前扩展 Worker、触发 continue-as-new 或提高限制。

通过 `workflows.v2.structural_limits.warning_threshold_percent` 配置阈值：

```env
DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT=80
```

设为 `0` 可完全禁用软限制警告。

警告日志包含结构化上下文：

```
[Durable Workflow] Run 42 approaching structural limit [pending_activity_count]: 1620 / 2000 (81% utilization, warning at 80%).
```

结构化日志上下文包括 `workflow_run_id`、`workflow_type`、`limit_kind`、`current`、`limit` 和 `utilization_percent`，便于集成日志聚合和告警工具。

## 配置 {#configuration}

通过配置中的 `workflows.v2.structural_limits` 或环境变量覆盖任意限制：

```php
// config/workflows.php
'v2' => [
    'structural_limits' => [
        'pending_activity_count' => (int) env('DW_V2_LIMIT_PENDING_ACTIVITIES', 2000),
        'pending_child_count' => (int) env('DW_V2_LIMIT_PENDING_CHILDREN', 1000),
        'pending_timer_count' => (int) env('DW_V2_LIMIT_PENDING_TIMERS', 2000),
        'pending_signal_count' => (int) env('DW_V2_LIMIT_PENDING_SIGNALS', 5000),
        'pending_update_count' => (int) env('DW_V2_LIMIT_PENDING_UPDATES', 500),
        'command_batch_size' => (int) env('DW_V2_LIMIT_COMMAND_BATCH_SIZE', 1000),
        'payload_size_bytes' => (int) env('DW_V2_LIMIT_PAYLOAD_SIZE_BYTES', 2097152),
        'memo_size_bytes' => (int) env('DW_V2_LIMIT_MEMO_SIZE_BYTES', 262144),
        'search_attribute_size_bytes' => (int) env('DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES', 40960),
        'history_transaction_size' => (int) env('DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE', 5000),
        'warning_threshold_percent' => (int) env('DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT', 80),
    ],
],
```

## 检查位置 {#enforcement-points}

### 待处理数量限制（执行器侧） {#pending-count-limits-executor-side}

执行器在调度活动、子工作流或定时器前，会统计该运行中当前处于非终态的同类项目数。如果数量已达到或超过配置的限制，运行会立即失败，并抛出 `StructuralLimitExceededException`。

这可防止无界并行扇出循环等模式累积数千个待处理操作：

```php
// This will fail if $items exceeds the pending_activity_count limit
$calls = [];
foreach ($items as $item) {
    $calls[] = fn () => activity(ProcessItemActivity::class, $item);
}
return all($calls); // Also checked against command_batch_size
```

要在限制内处理大批量数据，请按有界分块处理：

```php
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);
}
```

### 待处理数量限制（接收侧） {#pending-count-limits-intake-side}

信号或更新命令通过控制平面、Webhook 或 `WorkflowStub` 到达时，引擎会在接受命令前检查目标运行中未处理信号（`received` 状态）或未解决更新（`accepted` 状态）的数量。

如果数量已达到或超过配置的限制，命令会被**拒绝**，原因为 `structural_limit_exceeded`。拒绝响应包含机器可读元数据（`structural_limit_kind`、`structural_limit_value`、`structural_limit_configured`），以便调用方识别根本原因。

执行器侧限制会使运行失败；接收侧限制只拒绝单条命令，不终止工作流。运行保持活动状态，待处理项目处理完毕后，调用方可以重试。

```php
// If 5,000 signals are already pending, this will be rejected:
$result = $workflow->attemptSignal('process-item', $data);
if ($result->rejected()) {
    // $result->rejectionReason() === 'structural_limit_exceeded'
    // back off and retry later
}
```

### 命令批次大小 {#command-batch-size}

`all()` 函数会检查单个扇出组中叶操作的总数是否超过 `command_batch_size`。检查在调度任何单个活动或子工作流之前进行，因此运行会直接失败，避免只调度批次的一部分。

### 载荷大小 {#payload-size}

执行器调度活动或子工作流时，会序列化参数载荷，并按 `payload_size_bytes` 检查字节长度。如果序列化后的载荷超出限制，运行会在为该操作创建任何数据库行之前失败。

这适用于：

- **活动参数**：在 `scheduleActivity` 序列化 `ActivityCall` 参数时检查。
- **子工作流参数**：在 `scheduleChildWorkflow` 序列化子工作流的启动参数时检查，此时尚未创建子实例或运行行。

```php
// A 3 MiB payload will fail with the default 2 MiB limit
activity(ProcessDocumentActivity::class, $threeMegabyteBlob);
```

要满足限制，可在命名空间启用[外部载荷存储](../features/external-payload-storage.md)，让运行时将超过阈值的载荷透明地转存至配置的对象存储；也可以自行存储字节数据，然后传递应用层引用：

```php
$ref = Storage::put('docs/incoming.pdf', $blob);
activity(ProcessDocumentActivity::class, $ref);
```

外部载荷存储在历史中记录带哈希的 `durable-workflow.v2.external-payload-reference.v1` 信封，以保持重放完整性。因此，限制检查的是引用信封，而非原始字节数据。

### memo 大小 {#memo-size}

工作流通过 `upsertMemo()` 插入或更新 memo 条目时，执行器会将新条目合并到现有 memo 映射中，再将合并结果编码为 JSON，并按 `memo_size_bytes` 检查字节长度。如果合并后的 memo 超出限制，运行会在持久化 memo 之前失败。

### 历史事务大小 {#history-transaction-size}

每次工作流任务执行（重放并向前推进的一轮）都可能产生新的历史事件，包括调度活动、创建定时器、记录副作用和插入或更新搜索属性等。`history_transaction_size` 限制单个任务可产生的新事件总数。

这可发现失控循环，避免其在单个任务内不交还控制权而创建无界事件：

```php
// If a workflow schedules thousands of operations in one task,
// the history transaction limit prevents the task from growing
// without bound. Process large batches in bounded chunks instead.
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);  // Each chunk is a separate task execution
}
```

检查在执行器主循环每次迭代的开头进行。重放期间（读取已有历史）的事件不计入限制，只有当前任务新写入的事件才计入。

### 搜索属性大小 {#search-attribute-size}

工作流通过 `upsertSearchAttributes()` 插入或更新搜索属性时，执行器会将新属性合并到现有集合中，再将合并结果编码为 JSON，并按 `search_attribute_size_bytes` 检查字节长度。如果合并后的属性超出限制，运行会在持久化属性之前失败。

## 故障分类 {#failure-taxonomy}

超出结构限制时，引擎会记录：

- 一行 `WorkflowFailure`，其中 `failure_category = structural_limit`
- 一个 `WorkflowFailed` 历史事件，包含：
  - `failure_category = structural_limit`
  - `structural_limit_kind`：超出的具体限制（如 `pending_activity_count`、`command_batch_size`）
  - `structural_limit_value`：触发限制时的当前数量或大小
  - `structural_limit_configured`：配置的上限

这些元数据可由机器读取，运维人员、Waterline 和外部工具无需解析自由文本消息即可识别根本原因。

## 健康检查 {#health-check}

v2 健康检查快照的 `structural_limits` 包含当前结构限制配置，便于运维人员查看生效的上限：

```json
{
  "structural_limits": {
    "pending_activity_count": 2000,
    "pending_child_count": 1000,
    "pending_timer_count": 2000,
    "pending_signal_count": 5000,
    "pending_update_count": 500,
    "command_batch_size": 1000,
    "payload_size_bytes": 2097152,
    "memo_size_bytes": 262144,
    "search_attribute_size_bytes": 40960,
    "history_transaction_size": 5000,
    "warning_threshold_percent": 80
  }
}
```

## 依赖后端的限制 {#backend-dependent-limits}

后端能力快照发布针对当前基础设施调整后的完整结构限制契约。大多数限制是独立于后端的配置值，但部分后端有额外约束：

- **SQS 队列**：[标准 SQS 消息延迟](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-message-timers.html)上限为 900 秒。更长的定时器、活动重试和工作流任务延迟由传输层分段处理。能力快照保留 `max_single_timer_delay_seconds: 900` 以兼容现有使用方。
- **SQLite 数据库**：SQLite 串行执行写入，因此快照标记 `concurrent_write_safety: limited`。在并发 Worker 负载下，较高的待处理数量限制可能导致锁争用。

提前到达的 SQS 投递会安排另一条受延迟上限约束的消息，不会租用持久任务、消耗执行尝试次数、写入执行历史或运行用户代码。原始 `available_at` 保持不变。到期后，任务遵循正常执行和重复投递防护流程。等待期间工作流和活动的整体截止时间仍在计时，因此应选择符合这些时间预算的退避。不限制延迟的队列驱动保留请求的精确延迟。

完整契约位于后端能力响应的 `structural_limits` 部分：

```json
{
  "structural_limits": {
    "configured": { "pending_activity_count": 2000, "..." : "..." },
    "backend_adjustments": { "max_single_timer_delay_seconds": 900 },
    "effective": { "pending_activity_count": 2000, "max_single_timer_delay_seconds": 900, "..." : "..." },
    "issues": [
      {
        "component": "structural_limits",
        "severity": "info",
        "code": "queue_max_delay_constraint",
        "message": "The [sqs] queue driver limits delayed dispatch to 900 seconds; longer task delays are chunked by the transport layer."
      }
    ]
  }
}
```

## Waterline {#waterline}

Waterline 在异常表中以 `structural_limit` 故障类别展示结构限制故障。时间线的故障详情包括限制类型、当前值和配置的上限。

## Server 请求边界限制 {#server-request-boundary-limits}

使用独立 Server 时，在工作流任务、信号、更新或查询到达控制平面之前，HTTP 请求边界会应用另一组上限。超限请求会快速返回 `422 validation_failed`（整个请求体检查则返回 `413 payload_too_large`），使客户端获知拒绝原因，而 Server 不会向数据库写入任何行。

| 限制 | 默认值 | 配置键 | 约束对象 |
|---|---|---|---|
| 请求体大小 | 2 MiB | `server.limits.max_payload_bytes` | HTTP 请求体的总字节数 |
| memo 大小 | 256 KiB | `server.limits.max_memo_bytes` | `POST /workflows` 和 `POST /schedules` 中序列化的 memo |
| 搜索属性数量 | 100 | `server.limits.max_search_attributes` | 每个命名空间注册的自定义搜索属性数 |
| 搜索属性键长度 | 128 字节 | `server.limits.max_search_attribute_key_length` | 启动时单个搜索属性键的长度 |
| 搜索属性值大小 | 2 KiB | `server.limits.max_search_attribute_value_bytes` | 启动时的每个字符串值（以及数组值的每个元素） |
| 信号／更新／查询名称 | 256 字节 | `server.limits.max_operation_name_length` | 信号／更新／查询名称的 URL 路径段 |
| `workflow_id` 长度 | 128 字符 | 控制器验证器 | `POST /workflows` 中的工作流 ID |
| `workflow_type` / `task_queue` / `business_key` | 255 字符 | 控制器验证器 | `POST /workflows` 中的字符串字段 |
| `request_id` | 255 字符 | 控制器验证器 | 信号／更新／取消／终止操作的去重令牌 |
| `reason` | 1,000 字符 | 控制器验证器 | 取消／终止／归档操作的原因文本 |

每个限制均可通过 `DW_*` 环境变量单独配置（完整契约见 `config/dw-contract.php`）。值为 `0` 时，仅禁用该项限制，其他限制仍然生效。

当前配置值发布在 `GET /api/cluster/info` 响应的 `limits` 下，客户端可在运行时发现这些限制：

```json
{
  "limits": {
    "max_payload_bytes": 2097152,
    "max_memo_bytes": 262144,
    "max_search_attributes": 100,
    "max_search_attribute_key_length": 128,
    "max_search_attribute_value_bytes": 2048,
    "max_operation_name_length": 256,
    "max_pending_activities": 2000,
    "max_pending_children": 2000
  }
}
```

验证错误通过标准控制平面错误信封返回，包含 `reason: "validation_failed"` 和以出错字段（`signal_name`、`update_name`、`query_name`、`search_attributes`、`memo` 等）为键的 `validation_errors` 映射。载荷大小超限使用 `reason: "payload_too_large"` 和 `413` 状态码。
