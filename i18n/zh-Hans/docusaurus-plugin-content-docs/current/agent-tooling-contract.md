---
sidebar_position: 9.3
title: 代理工具契约
description: 将 MCP 工具、CLI JSON、服务器诊断、Waterline 导出和 SDK 测试夹具视为统一的、机器可操作的 Durable Workflow v2 契约。
tags:
  - ai
  - agents
  - mcp
  - operations
keywords:
  - durable workflow 代理工具
  - AI 工具契约
  - MCP 工作流诊断
  - 机器可读工作流操作
---

# 代理工具契约 {#agent-tooling-contract}

Durable Workflow v2 通过稳定契约公开产品事实，让 AI 辅助开发成为常规工作。工具应读取文档版本、发现本地接口、调用已记录的操作，并报告具名事实。它不应通过 HTML 推断工作流状态、把日志解析结果视为事实依据，或猜测哪种 SDK 行为对应某条 CLI 命令。

本页定义未来的 MCP 工具、本地代理、脚本和 SDK 应保持的契约结构。

## 契约层次 {#contract-layers}

| 层次 | 稳定入口 | 契约要求 |
| --- | --- | --- |
| 文档检索 | 规范地址 `llms.txt` 和 `llms-full.txt` 跟随稳定版 2.0 文档。`llms-2.0.txt` 和 `llms-full-2.0.txt` 是同一发布系列的固定版本别名。 | 2.0 产品工作使用规范 URL。URL 必须指明归档的 1.x 系列时固定使用 `-1.x.txt`；使用方需要显式主版本 URL 时，使用 `-2.0.txt`。 |
| 本地发现 | `/mcp/workflows` 的 `list_workflows` | 应用维护的 MCP 允许列表列明开放的工作流键、所需凭据、预期参数，以及是否适合冒烟测试。 |
| 工作流操作 | MCP `start_workflow`、`get_workflow_result`、`get_workflow_history`、`diagnose_workflow`、`repair_workflow`；`dw` JSON 命令；SDK 客户端 | 每个客户端都直接报告工作流 ID、运行 ID、命名空间、任务队列、命令状态、根因分类、修复建议和具名失败字段，无须抓取 UI。 |
| 服务器诊断 | `/api/cluster/info`、`dw server:info --output=json`、`dw doctor --output=json`、`dw debug workflow --output=json` | 兼容性、协议、任务队列、Worker 和停滞运行的信息采用机器可读格式，并设有数量或大小上限。 |
| 持久证据 | Waterline 所选运行详情和历史导出 | 重放、等待、定时器、运行谱系、投影来源、完整性检查、持久失败和运维操作是否可执行，均依据类型化状态。 |
| 跨语言一致性 | CLI/Python 请求夹具和 SDK 测试 | 共享控制平面操作在不同语言中保持请求结构一致。 |

每一层都应能独立使用。组合起来后，代理就有足够上下文做出小范围修改、验证修改并解释结果。

## MCP 工具设计 {#mcp-tool-design}

新的 MCP 工具应直接呈现 Durable Workflow 的概念：

- 使用工作流、运行、任务队列、计划、历史、失败、Worker、命名空间和兼容性等产品名词。
- 返回稳定标识符和具名状态字段，不能仅返回自然语言摘要。
- 诊断工具返回 `root_cause`、`remediation` 和 `next_actions` 对象，使代理无须解析自然语言即可选择下一条命令。
- 为历史、失败和负载提供有上限的数组和预览，让客户端可以检查内容，无须下载无限增长的跟踪记录。
- 将发现与变更分开。在启动或控制工作流前，客户端应能查询有哪些工作流，以及需要哪些凭据。
- 变更必须明确且结构化。对于本地示例工作流，`repair_workflow` 是正式的修复变更入口。即使修复被拒绝或无需修复，也返回 `durable-workflow.v2.safe-mutation` 封装。
- 显式标记无凭据冒烟测试工作流，使代理可以在不访问外部服务的情况下测试本地连接。
- 工具描述或结果元数据不得包含秘密值、客户专属主机名或特定账户的凭据。

示例应用的 `/mcp/workflows` 端点是本地工作流接口的参考实现。未来针对特定项目的 MCP 服务器应保持同样的原则：配置决定允许列表，工具仅操作列出的工作流，结果引用可由人通过 `dw`、Waterline 或 SDK 重现的持久工作流事实。

## 命令与 SDK 的一致性 {#command-and-sdk-parity}

自动化应能在客户端之间切换而不改变语义：

| 操作类别 | 必须具备的一致性证据 |
| --- | --- |
| 启动、信号、更新、查询、修复、取消、终止、归档 | CLI 和 SDK 请求体符合文档规定的控制平面结构。 |
| 历史、详情、列表、结果 | 响应保留稳定标识符、状态名称、时间戳和失败字段。 |
| 任务队列与 Worker | 容量、租约、执行槽、兼容性和 Worker ID 保持结构化。 |
| 外部执行 | 输入和结果封装保持语言中立，并携带具名的桥接结果。 |

为控制平面操作添加 CLI 命令、SDK 方法或 MCP 工具时，优先提供共享测试夹具或已记录的 JSON 示例，以便其他客户端进行断言。可以保留便于人阅读的表格，但自动化契约是 JSON 或 JSONL。

## 诊断报告结构 {#diagnosis-report-shape}

工具解释运行失败或停滞的原因时，报告应包含：

- 使用的文档版本和来源页面
- 调用的命令、SDK 方法或 MCP 工具
- 工作流 ID、运行 ID、命名空间和任务队列
- 当前状态和最近的持久失败摘要
- 最近的类型化历史事件名称
- 待处理的等待、定时器、任务或外部活动租约
- 可用时提供 Worker 和任务队列的兼容性事实
- 具名退出码、HTTP 状态、验证错误或阻塞原因
- 机器可读的 `root_cause.category` 和 `remediation.classification`
- 安全修复变更是否获准、已应用、被拒绝或不需要

这种结构使报告可以用于本地 Laravel 应用、独立服务器部署、Python Worker 和未来的 SDK。

## 根因与修复建议 {#root-cause-and-remediation}

支持的根因 schema ID 为 `durable-workflow.v2.agent-root-cause`。诊断工具应包含：

- `category`，例如 `activity_failure`、`workflow_failure`、`task_repair_attention`、`waiting_for_signal`、`history_growth_attention`、`in_progress` 或 `none`
- `source.kind` 和 `source.id`
- `retryable`、`severity` 和 `actionable`

支持的修复建议 schema ID 为 `durable-workflow.v2.agent-remediation`。它包括 `classification`、`summary`、`automatic_repair.tool`、`automatic_repair.allowed` 和 `next_actions`。`repair_workflow` 是受支持的本地 MCP 修复接口。MCP 不可用时，使用文档规定的 `dw` CLI JSON 契约和服务器 HTTP 控制平面路由：

```bash
dw debug workflow <workflow-id> --output=json
dw workflow:history <workflow-id> <run-id> --output=json
dw workflow:repair <workflow-id> --output=json
dw system:repair-status --output=json
dw system:repair-pass --output=json
```

这些命令是受支持的非 MCP 契约，用于检查、安全变更、诊断和修复自动化。

## 代理约束 {#guardrails-for-agents}

允许代理自动化例行步骤，同时保持持久执行模型：

- 保持工作流编排的确定性。
- 将 I/O、随机性、外部 API 调用和凭据放在活动或外部处理器中。
- 使用信号、更新、查询、计划、定时器和消息流来控制工作流，避免使用临时状态表代替它们。
- 将 Waterline 历史导出视为证据，而非变更 API。
- 除非公开文档明确规定，否则应将路由列表、数据库内部结构和框架专用模型行视为实现细节。

不变量依然清晰：工作流记录持久决策，活动执行可能失败的工作，重放必须能够解释发生过什么。工具契约为其余操作提供稳定入口。

## 相关页面 {#related-pages}

- [AI 辅助开发](./ai-assisted-development.md)
- [代理操作循环](./agent-operating-loop.md)
- [MCP 工作流接口](./mcp-workflows.md)
- [客户端与 Worker 能力](./polyglot/cli-python-parity.md)
- [Server HTTP API 参考](./polyglot/server-api-reference.md)
- [监控](./monitoring.md)
