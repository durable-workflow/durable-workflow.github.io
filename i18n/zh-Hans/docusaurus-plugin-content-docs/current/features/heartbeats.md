---
sidebar_position: 8
---

# 心跳 {#heartbeats}

心跳使长时间运行的活动能够报告当前尝试仍在运行。

`heartbeat()` 更新当前已认领的 `activity_attempts` 行，将最新心跳同步到活动执行，续租该活动任务，并为当前尝试追加类型化 `ActivityHeartbeatRecorded` 历史事件。Waterline 所选运行详情和历史导出，优先从类型化 `ActivityStarted`、`ActivityHeartbeatRecorded`、`ActivityRetryScheduled`、`ActivityCompleted`、`ActivityFailed` 和 `ActivityCancelled` 历史重建尝试状态、任务 ID、Worker、心跳、租约、取消和关闭时间。可变尝试行仅为旧数据提供回退或补充。

```php
use Workflow\V2\Activity;

final class PollRemoteJob extends Activity
{
    public function handle(string $jobId): array
    {
        do {
            sleep(1);

            $status = RemoteService::status($jobId);

            $this->heartbeat([
                'message' => 'Polling remote job',
                'current' => $status['completed'] ?? null,
                'total' => $status['total'] ?? null,
                'unit' => 'steps',
                'details' => [
                    'remote_state' => $status['state'] ?? 'running',
                ],
            ]);
        } while ($status['state'] === 'running');

        return $status;
    }
}
```

活动内部，`activityId()`、`attemptId()` 和 `attemptCount()` 提供持久执行和当前尝试标识，可用作外部工作的关联键。默认远程幂等键应使用 `activityId()`；只有需要区分同一持久活动执行的不同尝试的系统，才使用 `attemptId()`。

多语言 Worker 可通过 HTTP Worker 桥接发送心跳，无需构造 PHP 活动类。端点见 [Worker 协议](/docs/polyglot/worker-protocol)。

单个阻塞调用可能需要专门的辅助线程发送心跳。这表示进程仍然存活，不代表工作有进展。
请为调用设置独立且有限的截止时间，并在调用完成或失去执行权限时停止辅助线程。
Python Worker 应遵循[上下文捕获与取消示例](../polyglot/python.md#heartbeat-helper-thread)。

## 发送节奏与确认 {#heartbeat-cadence-and-receipts}

对于排队活动，第一个心跳截止时间从运行时领取时开始，早于任务交付和用户代码执行。已记录的心跳将下一个截止时间设为其运行时时间加上 `heartbeatTimeout`。发送请求或收到响应都不会重新开始一个完整窗口。参见[心跳超时](./timeouts.md#heartbeat-timeout)。

发送节奏应在窗口内留足余量，并限制两次调用之间的工作量。超时为 15 秒时，可以先考虑约 5 秒的目标间隔，但前提是交付、每个批次或 I/O 调用、执行暂停、网络延迟和传输重试都能放进剩余预算。请测量这些延迟并留足余量。这是规划建议，不是安全间隔的保证。已过期或被替换的尝试不能通过迟到的心跳恢复租约。

没有自动进度心跳计划，也没有 SDK 批量发送保证。Worker 注册心跳和所有权状态探测不会发布活动进度。每次被接受的进度心跳都会增加持久历史，因此不要报告每个极小操作。

嵌入式 `Activity::heartbeat()` 返回 `void`。无效进度和存储故障可能抛出异常。正常返回不是确认对象：已关闭、过期或被替换的尝试可能直接返回，而不再记录心跳。服务模式下，直接客户端调用与受监督 Worker 的错误行为不同。请参阅 [PHP](../polyglot/php.md#activity-heartbeats)、[Python](../polyglot/python.md#activity-heartbeat-requests) 和 [Rust](../polyglot/rust.md#activity-heartbeats) 指南。

心跳进度不会原子提交外部批次，也不能阻止旧执行者产生外部副作用。可安全重试的应用检查点需要独立的持久提交、稳定的逻辑作业键，以及幂等性或外部权限校验。替代尝试读取已确认检查点的接口由单独的[检查点功能](https://github.com/durable-workflow/.github/issues/218)跟踪。

## 进度快照 {#progress-snapshots}

`Activity::heartbeat()` 和 `ActivityTaskBridge::heartbeat()` 都接受可选的有界进度快照：

- `message`
  - 非空字符串，最多 280 个字符
- `current`
  - 非负整数或浮点数
- `total`
  - 非负整数或浮点数
- `unit`
  - 非空字符串，最多 64 个字符
- `details`
  - 扁平映射，最多 20 个 `key => scalar|null` 条目，键须匹配 `[A-Za-z0-9_.:-]{1,64}`

此载荷用于面向运维的进度信息，例如“正在下载分块”或“2 / 5 个分块”，不要用于大量日志或任意嵌套状态。Waterline 所选运行详情、时间线心跳条目和历史导出，在活动和当前尝试上将其展示为 `last_heartbeat_progress`；原始类型化 `ActivityHeartbeatRecorded` 历史事件则在 `progress` 下保存同一规范化载荷。

## 持久尝试跟踪 {#durable-attempt-tracking}

运行时为每次活动尝试记录独立的持久行，包括尝试序号、状态、开始时间、最新心跳、租约到期时间和关闭时间。活动开始、心跳、重试、完成、失败或取消时，也会记录类型化尝试历史，使历史尝试详情在可变尝试或任务行后续发生变化时仍可保留。当前已认领尝试的每次成功心跳都会记录一个紧凑的 `ActivityHeartbeatRecorded` 时间线点，包括活动执行 ID、活动尝试 ID、心跳时间、租约到期时间和事件发生时的活动快照。取消或终止命令关闭运行后，桥接会在 Worker 观察到停止时记录 `ActivityCancelled`，并将后续完成或失败报告作为过期报告拒绝，避免把取消转换为结果。

心跳是运维存活信号。每个已接受心跳都是持久历史，因此应根据超时和恢复需求选择有实际意义的间隔，避免将其用作高频进度日志。可选进度快照也应足够紧凑，适合运维诊断，不要将其当作流式事件源。
