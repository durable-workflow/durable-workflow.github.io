---
sidebar_position: 16
---

# 取消与终止 {#cancel-and-terminate}

本指南介绍嵌入式 Laravel 的 `Workflow\V2\WorkflowStub` API。服务模式客户端和 Worker 请使用 [PHP SDK 指南](https://php.durable-workflow.com/)、[Python 取消参考](https://python.durable-workflow.com/reference/errors/#durable_workflow.errors.ActivityCancelled)或 [Rust 生命周期 API](https://rust.durable-workflow.com/durable_workflow/struct.Client.html#method.cancel_workflow)。

取消和终止是关闭运行中工作流的正式持久命令。二者都记录在命令历史中，产生类型化历史事件，并在 Waterline 展示。

当前嵌入式 API 中，两个命令都立即关闭运行。**取消**记录 `cancelled` 结果，**终止**记录 `terminated` 结果。两者都不会在已关闭工作流内调度清理。嵌入式 Laravel 另提供 `requestCancellation()`，用于有时限的协作清理。Server 和 PHP、Python、Rust SDK 支持此独立协作请求，但 Worker 必须显式启用该能力。能力、截止时间、清理和恢复契约见[协作取消](/docs/polyglot/cancellation)。

## 取消 {#cancel}

取消会立即将运行转为 `cancelled`，并记录持久历史。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->cancel();

$result->accepted();   // true
$result->outcome();    // "cancelled"
$result->commandId();  // Durable command id
$result->reason();     // null (no reason provided)
```

### 取消并附带原因 {#cancel-with-reason}

可提供结构化原因，在审计记录、命令历史和 Waterline 中区分用户、策略或运维人员触发的取消。

```php
$result = $workflow->cancel('Customer requested cancellation');

$result->reason(); // "Customer requested cancellation"
```

原因持久化在持久命令记录及 `CancelRequested`、`WorkflowCancelled` 类型化历史事件中，因此在重放、导出和离线分析时仍保留。

### 取消执行的操作 {#what-cancel-does}

取消命令被接受后，引擎关闭所有未完成活动执行和待触发定时器，将运行转为 `cancelled`，并恢复等待该已取消子工作流的父工作流，使其观察到结果。

### 取消被拒绝的情形 {#cancel-is-rejected-when}

- 实例尚未启动：`rejection_reason = instance_not_started`
- 当前运行已关闭：`rejection_reason = run_not_active`
- 指定运行的取消命令指向历史（非当前）运行：`rejection_reason = selected_run_not_current`

## 终止 {#terminate}

终止会立即关闭运行中的工作流，不再调度后续工作流代码。与取消一样，它不提供清理窗口；需要明确的 `terminated` 结果时使用。

```php
$result = $workflow->terminate();

$result->accepted();   // true
$result->outcome();    // "terminated"
```

### 终止并附带原因 {#terminate-with-reason}

```php
$result = $workflow->terminate('Operator emergency shutdown');

$result->reason(); // "Operator emergency shutdown"
```

### 终止执行的操作 {#what-terminate-does}

终止遵循与取消相同的事务步骤，但：

- 改为记录 `TerminateRequested` 和 `WorkflowTerminated` 历史事件。
- 创建 `WorkflowFailure` 行，包含 `failure_category = terminated` 和 `propagation_kind = terminated`。
- 将运行的 `closed_reason = terminated`。
- 不调度任何后续工作流代码执行。

### 终止被拒绝的情形 {#terminate-is-rejected-when}

拒绝条件与取消相同。

## 指定运行的命令 {#run-targeted-commands}

取消和终止都可以指向某个具体运行，而不是实例的当前运行。

```php
$selectedRun = WorkflowStub::loadRun($runId);
$result = $selectedRun->attemptCancel('Draining old run');

$result->targetScope(); // "run"
```

目标运行不再是实例的当前运行时，指定运行的命令以 `selected_run_not_current` 拒绝。响应包含 `requested_run_id`（调用方指定的运行）和 `resolved_run_id`（下一步应使用的当前运行）。

## 不抛异常的 API {#non-throwing-api}

希望不通过异常处理拒绝结果时，使用 `attemptCancel()` 和 `attemptTerminate()`：

```php
$result = $workflow->attemptCancel('Duplicate order');

if ($result->rejected()) {
    $result->rejectionReason(); // e.g. "run_not_active"
}
```

`cancel()` 和 `terminate()` 被拒绝时会抛出 `LogicException`。

## Webhook {#webhooks}

取消和终止可通过 Webhook 路由调用：

```text
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

在请求体中传入原因：

```json
{
  "reason": "Operator: duplicate order"
}
```

响应包含命令结果、公开实例 ID 和原因：

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J10000000000000000000021",
  "reason": "Operator: duplicate order",
  "command_id": "01J40000000000000000000021",
  "command_status": "accepted"
}
```

## 取消是显式的生命周期结果 {#cancellation-is-not-an-error-you-catch-by-accident}

取消是显式生命周期结果，不是意外应用错误。嵌入式包的 `Workflow\V2\Exceptions\WorkflowCancelledException` 继承 `\Error`，而非 `\Exception`。`catch (\Exception $e)` 无法捕获它，`catch (\Throwable $t)` 可以。

读取已取消工作流的结果时，如需区分取消与其他故障，请按名称捕获该异常。在结果端捕获异常不会重新打开已取消的运行，也不会在其中调度清理。

## Waterline {#waterline}

Waterline 在所选运行详情中提供取消和终止运维操作。详情载荷包含由持久状态决定的 `can_cancel` 和 `can_terminate` 标志。

命令历史视图显示每条取消或终止命令的原因、调用方身份和结果。提供原因时，`commands[*].reason` 携带运维人员或调用方给出的原因。

## 状态映射 {#status-mapping}

`cancelled` 和 `terminated` 运行在列表路由中均归入 `failed` 状态分类，通过原始 `status` 和 `closed_reason` 区分：

| 状态 | 状态分类 | 关闭原因 |
| --- | --- | --- |
| `cancelled` | `failed` | `cancelled` |
| `terminated` | `failed` | `terminated` |

## 类型化历史 {#typed-history}

已取消的运行产生以下历史序列：

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
CancelRequested       <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowCancelled     <- failure_id, failure_category, reason when supplied
```

已终止的运行产生：

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
TerminateRequested    <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowTerminated    <- failure_id, failure_category, reason when supplied
```

## 取消与终止对比 {#cancel-vs-terminate}

| | 取消 | 终止 |
| --- | --- | --- |
| 调度后续工作流代码 | 否 | 否 |
| 取消未完成活动 | 是 | 是 |
| 取消未完成定时器 | 是 | 是 |
| 原因元数据 | 是 | 是 |
| 持久命令历史 | 是 | 是 |
| 父工作流收到子工作流结果 | 是 | 是 |
| 记录故障行 | 是（`cancelled`） | 是（`terminated`） |
| 状态分类 | `failed` | `failed` |
| 关闭原因 | `cancelled` | `terminated` |
