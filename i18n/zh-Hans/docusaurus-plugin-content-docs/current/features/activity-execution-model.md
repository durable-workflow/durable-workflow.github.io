---
sidebar_position: 22
title: 活动执行模型
description: Durable Workflow v2 中普通队列活动、本地活动、Worker 会话与粘性执行的关系。
tags:
  - activities
  - workers
  - execution
keywords:
  - 活动执行模型
  - 本地活动
  - Worker 会话
  - 粘性执行
  - 持久任务派发
  - 队列活动
---

# 活动执行模型 {#activity-execution-model}

PHP、Python 和 Rust 的服务 Worker 支持范围及不支持能力时拒绝执行的能力协商，见服务模式[可移植 Worker 亲和性](/docs/polyglot/portable-worker-affinity)支持矩阵。

Durable Workflow v2 为常见活动放置选择提供显式原语：

- 普通队列活动：持久、独立租约的工作；
- [本地活动](/docs/features/local-activities)：同进程的短时活动工作，仍记录活动历史；
- [Worker 会话](/docs/features/worker-sessions)：多个队列活动步骤之间的持久活动亲和性；
- [粘性执行](/docs/features/sticky-execution)：工作流重放缓存亲和性，以普通重放作为正确性回退。

## 普通队列活动 {#ordinary-queued-activities}

`activity(...)` 和 `Workflow::activity(...)` 是普通队列活动，仍是默认的活动原语。

1. 工作流代码调用 `activity(MyActivity::class, ...)`。
2. 工作流任务记录 `ActivityScheduled`，并在配置的连接和队列上创建持久活动任务。
3. 兼容 Worker 以租约认领该活动任务。
4. Worker 运行活动类，并报告完成、失败、取消、心跳或超时。
5. 引擎将活动结果记录到工作流历史，并从持久状态恢复工作流。

普通活动尝试可以在任何兼容 Worker 上运行。重试可能落到不同进程、主机或构建。活动代码必须能够幂等地应对重复投递、租约过期后的重试，以及迟到完成报告的竞争。默认远程幂等键使用 `activity_execution_id`；仅在下游系统需要逐尝试关联时使用 `activity_attempt_id`。

```php
use function Workflow\V2\activity;

$quote = activity(FetchQuoteActivity::class, $customerId);
$invoice = activity(CreateInvoiceActivity::class, $quote['id']);
```

## 本地活动 {#local-activities}

`localActivity(...)`、`Workflow::localActivity(...)` 和 `Workflow::executeLocalActivity(...)` 在当前执行工作流任务的 Worker 进程内运行活动类，不创建普通活动任务。

本地活动仍记录普通活动历史：

- `ActivityScheduled`
- `ActivityStarted`
- `ActivityHeartbeatRecorded`
- `ActivityRetryScheduled`
- `ActivityCompleted`
- `ActivityFailed`
- `ActivityCancelled`
- `ActivityTimedOut`

每个本地活动事件都带有 `execution_mode=local` 和 `local_activity=true`，活动执行快照保存 `activity_options.execution_mode=local`。本地尝试运行期间，活动心跳会续租所属的工作流任务。

短时、幂等的副作用需要活动重试、超时、心跳、取消和可见性语义，但不需要队列路由或独立活动 Worker 集群时，使用本地活动。API、超时、重试、关闭、冷重放、路由和指标契约见[本地活动](/docs/features/local-activities)。

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

## Worker 会话 {#worker-sessions}

Worker 会话将一系列普通队列活动尝试固定到同一 Worker 会话租约。多个持久步骤必须复用 GPU 内存、挂载文件系统或已加载模型等 Worker 本地资源时，使用会话。

Worker 会话不会使活动变成本地活动。会话内每个活动仍是持久活动任务，有自己的租约、心跳、超时、重试和终态历史。会话在普通队列路由之上增加显式亲和性和接纳规则。

会话 API、租约生命周期、路由、故障处理、关闭行为和运维诊断见 [Worker 会话](/docs/features/worker-sessions)。

## 粘性执行 {#sticky-execution}

粘性执行是一种工作流任务重放优化。Worker 完成工作流任务后，可以保留进程本地的热重放缓存；匹配时可优先将同一运行的下一工作流任务交给该 Worker。

粘性执行不会使工作流进度只保存在进程本地。缓存未命中、Worker 重启、排空、发布或驱逐后，正确性始终回退到从持久历史进行的普通冷重放。工作流代码不能依赖历史之外的内存状态。

粘性缓存生命周期、路由标识、回退规则、部署控制和指标见[粘性执行](/docs/features/sticky-execution)。

## 选择合适的原语 {#choosing-the-right-primitive}

确定性分支和计算直接使用工作流代码。

非确定性值需要可安全重放的快照，但不需要活动重试、超时、心跳或取消语义时，使用 [`sideEffect(...)`](/docs/features/side-effects)。

短时、可重试的同进程副作用应作为活动尝试可见，但不应进入普通任务匹配时，使用[本地活动](/docs/features/local-activities)。

远程调用、缓慢 I/O、CPU 密集工作、队列背压、专用 Worker 集群，或应通过独立租约活动任务继续的工作，使用普通[活动](/docs/defining-workflows/activities)。

多个普通活动步骤需要显式 Worker 本地亲和性时，使用 [Worker 会话](/docs/features/worker-sessions)。
