---
sidebar_position: 3
title: 外部执行接口
description: 使用与载体无关、具备活动执行语义的外部执行契约，实现有界任务、桥接和代理可操作的处理器。
tags:
  - external-execution
  - bridge-adapters
  - worker-protocol
  - AI
keywords:
  - 外部执行
  - 桥接适配器
  - 活动 Worker 协议
  - 任务结果封装
---

# 外部执行接口 {#external-execution-surface}

Durable Workflow v2 将外部执行视为以契约为基础的产品接口，而非 shell 约定或单一 Worker 传输方式。独立服务器在 `GET /api/cluster/info` 的 `worker_protocol.external_execution_surface_contract` 中发布机器可读的总契约。

该契约名为 `activity_grade_external_execution`，面向可以在完整工作流运行时之外执行的持久、有界工作：

- 运维维护活动
- 平台自动化
- 集成交接
- 启动工作、发送信号或更新，或移交工作的桥接适配器
- 脚本、守护进程、HTTP、基于队列、无服务器或代理驱动的处理器

主要切入点是运维、平台和集成自动化。AI 代理和脚本需要稳定入口，因此是重要使用方，但它们不改变运行时边界。

## 边界 {#boundary}

外部处理器可以：

- 执行一个持有租约的工作流或活动任务
- 通过 Worker 协议发送心跳，报告租约进度
- 返回结构化成功或失败封装
- 使用桥接适配器启动有界工作、发送信号或更新，或移交工作

外部处理器不得：

- 解释工作流重放语义
- 管理 `ContinueAsNew` 行为
- 在运行时契约之外实现信号、更新或查询的排序规则
- 直接修改事件历史
- 充当无界工作流运行时

这些规则由服务器和真正的 SDK 运行时负责。载体只应跨传输边界传递契约声明的输入和结果封装。

## 已发布的契约衔接点 {#published-contract-seams}

连接载体前先读取 `GET /api/cluster/info`。相关 v2 路径如下：

| 路径 | 用途 |
| --- | --- |
| `worker_protocol.external_execution_surface_contract` | 产品边界、运行时边界、有效载体类别和衔接点状态。 |
| `worker_protocol.external_task_input_contract` | 单个已租用工作流或活动任务的、与载体无关的输入封装。 |
| `worker_protocol.external_task_result_contract` | 与载体无关的成功、失败和格式错误输出封装。 |
| `worker_protocol.server_capabilities.external_execution_surface` | Worker 平面协商使用的精简能力指针。 |

外部执行接口还列出计划中的衔接点，包括确定性的认证、配置档和 TLS 组合、以配置为基础的处理器映射、有界桥接适配器、负载外部存储，以及准入与发布安全。应将它们视为契约衔接点，而非私有实现细节。

## 载体要求 {#carrier-requirements}

有效载体可以是基于轮询的 CLI 或守护进程、HTTP 处理器调用、基于队列的 Worker，或无服务器调用。传输方式可以不同，但以下要求不变：

- 产生声明的输入 schema
- 接受声明的结果 schema
- 保留 `task.id`、`task.attempt` 和 `task.idempotency_key`
- 将传输失败映射为结构化失败或格式错误输出结果
- 以确定性方式解析认证、TLS、配置档和环境输入

退出码、stderr、进程崩溃、HTTP 失败、队列可见性超时和无服务器平台错误都是传输层事实。只有在载体将其映射到声明的结果封装或 `malformed_output` 后，它们才成为工作流事实。

该契约下首个具体载体是[可调用 HTTP 载体](./invocable-carrier.md)，发布在 `worker_protocol.invocable_carrier_contract`。它仅支持活动任务，要求 HTTPS（仅开发环境允许回环 HTTP），并通过外部执行器配置解析认证。它在传输层的 `retry_policy` 与持久活动重试策略不同。报告结果后，持久活动重试仍由服务器或运行时负责。

## 桥接适配器 {#bridge-adapters}

桥接适配器是有界的入口或交接接口。它们可以启动工作、发送信号或更新，或移交工作，但不是工作流运行时，不应隐藏重放或事件历史行为。

每个桥接适配器都需要为以下情况提供明确的机器可读结果：

- 未知目标
- 认证失败
- 负载格式错误
- 重复启动
- 不支持的路由
- 交接被接受
- 交接被拒绝

保持与控制平面其他接口相同的运维清晰度：提供稳定状态码、具名 `reason` 值，以及足够的上下文，让 `dw`、Waterline、SDK 和代理可以解释发生了什么，无须从自然语言中提取信息。

CLI 直接提供 Webhook 桥接接口：

```bash
dw bridge:webhook stripe \
  --action=start_workflow \
  --idempotency-key=stripe-event-1001 \
  --target='{"workflow_type":"orders.fulfillment","task_queue":"external-workflows","business_key":"order-1001"}' \
  --input='{"order_id":"order-1001"}' \
  --json
```

JSON 响应与 `/api/cluster/info` 发布的桥接适配器结果契约一致，包含 `outcome`、`reason`、`control_plane_outcome`、`idempotency_key` 和已脱敏的 `target` 摘要。

## 代理可操作的结构 {#agent-operable-shape}

外部执行接口是 v2 AI 辅助开发方式的一部分。人理解工作流、活动和重放的不变量，工具则通过稳定契约操作：

1. 从 `/api/cluster/info` 发现外部执行接口
2. 选择满足已发布要求的载体
3. 产生外部任务输入封装
4. 保留任务标识和幂等性
5. 返回成功、失败或格式错误输出封装
6. 使用具名结果报告桥接和传输失败

这让 AI 辅助生成脚手架和运维自动化成为常规工作：工具可以引用协议清单、任务封装、结果封装和桥接结果，无须从某个演示脚本推断行为。
