---
sidebar_position: 9.1
title: 代理操作循环
description: 为 AI 代理提供稳定的 v2 流程，用于发现、修改、运行、诊断和修复 Durable Workflow 应用。
tags:
  - ai
  - agents
  - mcp
  - operations
keywords:
  - durable workflow 代理循环
  - AI 工作流调试
  - MCP 工作流
  - Waterline 历史导出
  - dw JSON 输出
---

# 代理操作循环 {#agent-operating-loop}

当每一步都有稳定入口时，代理更容易使用 Durable Workflow v2。下面的循环从人需要掌握的同一不变量开始，再通过机器可读契约完成发现、执行、诊断和修复。

## 1. 使用正确的文档版本 {#1-use-the-right-docs-line}

稳定版 2.0 工作使用规范文档包。它跟随公开网站面向读者的不带版本号的默认文档路径：

```text
https://durable-workflow.com/llms-full.txt
```

当 URL 本身必须指明当前主版本时，使用带版本号的 2.0 文档包：

```text
https://durable-workflow.com/llms-full-2.0.txt
```

当 URL 本身必须指明稳定的 1.x 主版本时，使用显式固定的 1.x 地址：

```text
https://durable-workflow.com/llms-full-1.x.txt
```

## 2. 发现本地工作流接口 {#2-discover-the-local-workflow-surface}

示例应用的 MCP 端点可用时，从该端点开始：

```text
/mcp/workflows
```

参考工具契约、安全冒烟测试的工作流键和代理报告结构见 [MCP 工作流接口](./mcp-workflows.md)。

先调用 `list_workflows`。响应会告诉代理：哪些工作流对外开放、需要什么凭据、接受哪些参数，以及已有哪些最近运行。在使用需要外部 API 密钥的示例前，先用 `simple` 或 `elapsed` 进行无凭据冒烟测试。

MCP 不可用时，使用 CLI 和服务器契约：

```bash
dw server:info --output=json
dw workflow:list --output=json
dw task-queue:list --output=json
```

这些命令直接提供协议版本、命名空间上下文、工作流可见性和任务队列健康信息。

## 3. 做出最小改动 {#3-make-the-smallest-change}

编辑工作流代码时，保持持久执行边界：

- 在工作流方法中保留编排决策
- 将 I/O、随机性、网络调用和外部凭据放在活动中
- 使用信号、更新、查询、定时器和消息流，避免以临时表或队列任务代替这些机制
- 反复接收人工或 AI 输入时，遵循[消息流](./features/message-streams.md)契约

这一边界比编程语言接口更重要。PHP 工作流类、`dw`、Python SDK 和外部 Worker 都应描述相同的控制平面操作。

不需要修改源码时，“修改”步骤可以是明确的操作选择：选择开放的工作流键、提供稳定的 `business_key`、为幂等冒烟测试选择 `duplicate_start_policy=return_existing_active`，或发送 `diagnose_workflow` 建议且文档已定义的信号或更新输入。

## 4. 通过结构化入口运行 {#4-run-through-structured-handles}

使用最适合任务的具体入口：

| 任务 | 首选入口 |
| --- | --- |
| 启动本地示例工作流 | 通过 `/mcp/workflows` 调用 `start_workflow` |
| 修复本地示例工作流 | 先调用 `diagnose_workflow`，仅在修复建议允许时调用 `repair_workflow` |
| 启动或控制服务器工作流 | `dw workflow:start`、`dw workflow:signal`、`dw workflow:update` 或 SDK 中的等效操作 |
| 检查兼容性 | `dw server:info --output=json` 和 `/api/cluster/info` |
| 检查队列健康状况 | `dw task-queue:describe <queue> --output=json` |
| 比较客户端和 Worker 接口 | [客户端与 Worker 能力](./polyglot/cli-python-parity.md) |
| 实现非 PHP Worker | [Worker 协议](./polyglot/worker-protocol.md) |
| 实现外部处理器 | [外部执行接口](./polyglot/external-execution.md) |

代理循环优先使用 JSON 或 JSONL 输出。终端表格面向人工阅读。

## 5. 先诊断，再修复 {#5-diagnose-before-repairing}

在修改代码或重放命令前收集事实：

```bash
dw doctor --output=json
dw server:info --output=json
dw debug workflow <workflow-id> --output=json
dw workflow:history <workflow-id> <run-id> --output=json
```

对于 MCP 示例应用接口，调用：

```json
{"tool": "diagnose_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
```

读取 `root_cause.category`、`remediation.classification` 和 `remediation.automatic_repair.allowed`。仅当最后一个字段为 true 时调用 `repair_workflow`：

```json
{"tool": "repair_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
```

Waterline 可用时，导出所选运行的历史。导出内容包括类型化历史事件、所选运行上下文、等待、定时器、运行谱系、投影来源元数据、完整性检查和持久失败记录。这些事实让代理可以区分工作流缺陷与 Worker 不可用、凭据缺失、任务队列故障、客户端不兼容或待处理的运维操作。

## 6. 依据契约报告 {#6-report-with-contracts}

代理报告应引用稳定的事实：

- 使用的文档版本和 LLM 文档包
- 工作流 ID、运行 ID、命名空间和任务队列
- 调用的命令或 MCP 工具
- JSON 状态、退出码或具名失败原因
- `root_cause.category`、`remediation.classification`，以及修复是否获准或被拒绝
- 最近的类型化历史事件和最近的持久失败记录
- `server:info` 或 `/api/cluster/info` 返回的兼容性或协议版本

这种报告结构可用于本地示例应用、独立服务器部署、Python Worker 和未来的客户端 SDK。

## 7. 已发布产物的验证证据 {#7-published-proof}

示例应用的一致性测试工具使用已发布产物验证代理循环。它的 MCP 分片执行以下步骤：

1. 发现：JSON-RPC `tools/list` 和 `list_workflows`
2. 修改：选择无凭据的 `simple` 工作流，并显式提供 `business_key`
3. 运行：`start_workflow`
4. 诊断：`diagnose_workflow`，包含根因和修复建议对象
5. 修复：通过 `repair_workflow` 执行安全的结构化变更或返回拒绝
6. 验证：`get_workflow_result`、`diagnose_workflow` 和 `get_workflow_history`

验证证据在一致性元数据中记录工具状态码、工作流 ID、完成状态、根因 schema ID、修复建议 schema ID、安全变更 schema ID，以及有数量上限的历史证据。

## 相关页面 {#related-pages}

- [AI 辅助开发](./ai-assisted-development.md)
- [代理工具契约](./agent-tooling-contract.md)
- [MCP 工作流接口](./mcp-workflows.md)
- [示例应用](./sample-app.md)
- [CLI 命令参考](./polyglot/cli-reference.md)
- [Worker 协议](./polyglot/worker-protocol.md)
- [外部执行接口](./polyglot/external-execution.md)
