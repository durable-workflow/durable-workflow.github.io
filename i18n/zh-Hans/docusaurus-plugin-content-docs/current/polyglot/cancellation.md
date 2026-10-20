---
title: 协作式取消
description: 请求在限定时间内清理工作流、其子工作流及活动。
---

# 协作式取消 {#cooperative-cancellation}

Server 2.5.0 通过协议 1.20 增加了协作式取消。此功能要求 Worker 显式启用协作。在使用前，请检查运行时发现结果以及 SDK 的能力支持。

## 请求清理 {#request-cleanup}

使用 PHP SDK 的 `requestCancellation()`、Python 或 Rust 的 `request_cancellation()`，或 Server 的 `request-cancellation` 路由。工作流代码处理请求并执行清理时，运行保持活动状态。清理成功后，运行以 `Cancelled` 结束。

```http
POST /api/workflows/{workflowId}/runs/{runId}/request-cancellation
X-Durable-Workflow-Control-Plane-Version: 2
Authorization: Bearer <operator-token>
X-Namespace: <namespace>
Content-Type: application/json

{"reason":"Order withdrawn","cleanup_timeout_seconds":30}
```

选定的运行必须仍是当前运行。首次接受请求时返回 HTTP 202。重复请求返回 HTTP 200，并包含原始请求标识和截止时间。修改重复请求的超时不会延长清理时间预算。

不可变的取消上下文提供请求 ID 和根请求 ID、原因、请求者、来源、原始请求时间、截止时间以及有序的沿袭链。工作流代码在已记录的交付边界接收它。此前已完成的调用正常重放。确定性的 `deadline()` 和 `remaining()` 辅助方法使清理在重启后能够作出相同决定。

现有的 `cancel()` 会立即关闭运行，不会恢复工作流清理。`terminate()` 也会立即关闭运行，结果为 `Terminated`。

## 选择操作策略 {#choose-operation-policies}

| 策略 | 子工作流 | 远程活动 | 本地活动 |
| --- | --- | --- | --- |
| TryCancel | 请求子工作流清理，并继续父工作流清理 | 请求停止回调，并继续工作流清理 | 停止受监督的回调，并继续清理 |
| WaitCancellationCompleted | 等待子工作流已记录的终态结果 | 等待原始回调的持久化停止回执 | 等待原始回调的持久化停止回执后再继续 |
| Abandon | 让子工作流独立运行 | 让活动在原有的有限总超时内独立运行 | 在准入前拒绝 |

父工作流关闭有单独的策略。`RequestCancellation` 发送协作请求，保留原始取消沿袭链及有限的截止时间。`RequestCancel` 保留原有的立即取消行为。

每个协作的子工作流继承根请求标识和清理时间预算。子工作流可以获得更早的截止时间，但不能扩大预算。被放弃的操作有独立的生命周期，不纳入这次清理等待。

## 监督与恢复 {#supervision-and-recovery}

支持协作的 Worker 独立于应用活动心跳观察取消。PHP 使用受监督的回调进程。Python 监督异步和同步回调。Rust 监督异步回调 future。脱离监督的工作及下游服务需要自行实现取消和幂等行为。

清理可以使用取消屏蔽来执行持久化活动、定时器和子工作流调用。屏蔽保留原始截止时间。如果 Worker 退出，替代 Worker 会先重放相同的交付边界及已完成的清理调用，再继续执行。截止时间到期或终止会撤销剩余的执行权限。

旧活动尝试被隔离后，不能再发布结果。已被外部系统接受的副作用仍需要应用幂等性或对账处理。

## 检查取消级联 {#inspect-the-cascade}

运行诊断提供 `cancellation_cascade`，其中包含根请求、参与运行、活动尝试、策略、停止回执、截止时间及清理结果。CLI 和 Waterline 展示相同的视图。

生命周期区分 `requested`、`delivered`、`cleaning_up`、`cancelled`、`deadline_expired` 和 `terminated`。视图不完整时会指出哪些内容无法验证，不会把缺少回执当作成功证明。

如果活动中的 Worker 认领不兼容，请求会返回明确的能力拒绝，不会记录部分取消。升级注册信息不会升级已经发出的认领。

## 发布边界 {#release-boundary}

受支持的发布范围包括整次运行请求、子工作流及活动策略、有时限的屏蔽清理、恢复和级联检查。可独立取消的操作作用域仍是禁用的源码预览，并在协议参考中标记为实验性功能。

精确的请求、回执和能力结构见 [Worker 协议规范](/platform-protocol-specs/worker-protocol-api.openapi.yaml)。各语言的编写指南位于 [PHP](https://php.durable-workflow.com/)、[Python](https://python.durable-workflow.com/) 和 [Rust](https://rust.durable-workflow.com/) SDK 站点。
