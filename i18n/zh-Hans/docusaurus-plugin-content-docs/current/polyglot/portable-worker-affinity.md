---
sidebar_position: 26
title: 可移植 Worker 亲和性
description: PHP、Python 和 Rust SDK 在服务模式下的 Worker 亲和性支持与限制。
tags:
  - workers
  - activities
  - replay
  - polyglot
---

# 可移植 Worker 亲和性 {#portable-worker-affinity}

服务模式 Worker 通过 Server Worker 协议实现以下能力。可用能力由 SDK 版本与 Worker 配置决定。

本地活动、Worker 会话和 sticky 执行遵循同一可移植性规则：service Worker 必须声明支持或明确拒绝每项能力。这些声明要求最低协议 `1.18`。除非 Worker 结构化清单也将同一功能标为支持，否则 Server 拒绝平面路由能力。

## SDK 支持 {#sdk-support}

| SDK Worker | 本地活动 | Worker 会话 | Sticky 执行 |
| --- | --- | --- | --- |
| PHP | 支持 | 支持 | 支持 |
| Python | 支持起始版本：2.2.0 | 支持起始版本：2.3.0 | 支持起始版本：2.5.0，要求 `sticky_cache_capacity` 大于零 |
| Rust | 支持起始版本：3.1.0，设置 `Worker::local_activities(true)` | 支持起始版本：3.2.0，设置 `Worker::worker_sessions(true)` | 支持起始版本：3.4.0，设置 `Worker::sticky_cache(...)` |

Worker 只通告其配置中已实现并启用的能力。Rust 本地活动、会话及 sticky 执行，以及 Python sticky 执行均须显式启用。旧 SDK 拒绝未实现能力。普通工作流和队列活动无需这些优化，使用完整持久化历史重放。

## 本地活动记录 {#local-activity-recording}

PHP、Python 和已启用能力的 Rust Worker 在工作流 Worker 内运行本地活动。工作流任务完成中包含参数、尝试结果、重试与超时设置、心跳进度，以及最终结果或失败。Server 原子记录这些内容，作为标记 `execution_mode=local` 的普通活动历史。

重放使用已记录的活动终态事件，不重新调用本地处理程序。Server 提交完成前 Worker 丢失可能导致处理程序再次执行，因此外部效果必须幂等。

普通 PHP Worker 内联执行同步处理程序。在尝试前、`ActivityContext::heartbeat()` 或处理程序返回后观察取消，以及心跳、单次尝试和总体超时。这些处理程序应保持短小，并使用安全心跳边界拆分阻塞工作。

Python 和 Rust 异步回调必须向语言运行时让出执行。Rust 独立于应用心跳续约准确的工作流任务租约，在超时、权限丢失或 Worker 关闭时丢弃回调，并记录有界尝试与心跳报告。参阅 [Rust 本地活动示例](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs)和 [API 参考](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html)。

启用[协作式取消](/docs/polyglot/cancellation)的 PHP Worker 使用协议 1.20，并为已准备的本地活动使用受监督回调进程。Rust 内联本地执行采用独立的普通 Worker 配置，不能与预备的协作式本地监督组合。阻塞回调需要进程监督才能保证物理停止。

## Worker 会话生命周期 {#worker-session-lifecycle}

PHP、Python 和 Rust SDK 提供带类型的会话选项，以及创建、使用、续约和关闭操作。选项包括要求、队列、租约时长、总 TTL、活动最大并发数与重新获取策略。Worker 正常关闭时会关闭自己持有的会话。

持有者消失后，其租约和并发预留会过期。要求匹配时，新持有者可以重新获取会话，但首次活动使用前必须重建 Worker 本地资源。会话标识不会让进程内存持久化。

重新获取保留会话原始绝对 TTL。续约延长持有权限，但不延长 TTL。使用 Server 2.5.1 或更新版本，以保留原始 TTL，并在冷重放中使用记录的会话路由。参阅 [Rust 会话示例](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs)与 [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html)。

## Sticky 执行与冷重放 {#sticky-execution-and-cold-replay}

PHP、Python 和 Rust 缓存均有上限，使用准确的工作流 ID、运行 ID 和 Worker 构建 ID 作为键。它们报告 `hit`、`miss`、`eviction` 和 `forced_cold_replay`。到期、驱逐、Worker 替换、持有者丢失或构建不匹配都会丢弃优化并重放完整持久化历史。

Python SDK 2.5.0 应搭配 Server 2.5.10 或更新版本。其缓存默认禁用。通过 `sticky_cache_capacity` 启用，并设置保留历史的字节上限与 TTL。缓存存储编码后的持久化历史，可复用经验证的分页游标以减少重复下载。应为解码和确定性重放预留额外内存。参阅 [Python Sticky 执行指南与可运行示例](https://python.durable-workflow.com/guides/sticky-execution/)。

Rust SDK 3.4.0 支持同一已发布 Server 基线。使用 `Worker::sticky_cache(StickyCacheOptions::new(...))` 启用，并配置编码历史字节上限与 TTL。每次重放解码一个新快照；接受暖命中前，重复使用的游标会与当前任务租约和持久化历史核对。缓存保存历史，不保存活的工作流实例或会话资源。参阅 [StickyCacheOptions](https://rust.durable-workflow.com/durable_workflow/struct.StickyCacheOptions.html)和 [Rust 可运行示例](https://github.com/durable-workflow/sdk-rust/blob/3.4.0/examples/sticky_execution.rs)。

Server 2.5.10 为早于 2.2.0 的 PHP SDK 保留完整重放。要使用以 StartAccepted 开头历史的重放提示，请使用 PHP SDK 2.2.0 或更新版本。

Sticky 亲和性不会为缓存所有者预留就绪任务，也不给它匹配优先级。其他合格 Worker 可以在所有者亲和性有效时领取，包括所有者没有空闲工作流槽位时，此领取标记为 `forced_cold_replay`。增加 TTL 不会让匹配等待所有者。

强制冷重放是缓存优化不可用的诊断证据，并非工作流正确性失败。空缓存下工作流也必须保持确定性。参阅[匹配与诊断规则](/docs/features/sticky-execution#routing-identity)。

## 安全默认值与滚动集群 {#safe-defaults-and-rolling-fleets}

普通工作流无需会话或 sticky 配置。混合版本集群在协议下限处安全拒绝：Server 接受特定功能完成数据之前，检查协商版本、平面能力、结构化清单以及准确的 sticky 缓存标识。

已发布的[跨 SDK 场景清单](/platform-conformance/portable-worker-affinity-runtime-scenarios.json)覆盖能力声明真实性、本地活动重放、会话持有者丢失与重新获取、sticky 命中与驱逐、Worker 替换、强制冷重放和零配置工作流。

嵌入式 Laravel 实现参阅[本地活动](/docs/features/local-activities)、[Worker 会话](/docs/features/worker-sessions)和 [Sticky 执行](/docs/features/sticky-execution)。这些 API 属于 Workflow 包，服务模式 Worker 应使用对应 SDK 的 API。
