---
sidebar_position: 9.2
title: MCP 工作流接口
description: 使用示例应用的 MCP 服务器作为 AI 客户端工作流接口的参考实现，完成发现、启动、诊断、修复、结果查询和历史读取。
tags:
  - ai
  - agents
  - mcp
  - sample-app
keywords:
  - durable workflow MCP
  - MCP 工作流工具
  - 示例应用 MCP 服务器
  - AI 客户端工作流发现
---

# MCP 工作流接口 {#mcp-workflow-surface}

示例应用在以下地址提供 Durable Workflow v2 MCP 服务器参考实现：

```text
/mcp/workflows
```

当 AI 客户端需要检查或操作本地工作流应用时，使用这个端点，无须抓取 Waterline 界面或猜测 Laravel 内部实现。该端点是结构化开发接口：列出应用选择开放的工作流，说明凭据要求，启动运行，轮询结果，并返回有数量上限的历史事实。

## 服务器契约 {#server-contract}

示例应用从 `routes/ai.php` 注册服务器，并在 `config/workflow_mcp.php` 中配置开放的工作流键。该配置就是 AI 客户端的公开允许列表。只有被列入其中，且元数据足以让客户端判断能否安全运行的工作流，才可通过 MCP 操作。

每个已配置的工作流应说明：

- 稳定的工作流键
- 该键对应的工作流类
- 必填参数和可选参数
- 凭据要求
- 是否适合无凭据的本地冒烟测试
- 代理可以引用的输出和历史预期

工具描述不得包含秘密。可以说明工作流需要某种凭据，但不能包含凭据值或特定账户的详细信息。

## 工具 {#tools}

参考服务器提供六个工作流工具：

| 工具 | 用途 |
| --- | --- |
| `list_workflows` | 发现已配置的工作流键、描述、凭据要求、v2 状态和最近运行。 |
| `start_workflow` | 启动已配置的工作流，返回 `workflow_id`、`run_id`、状态、业务键和命令结果。 |
| `get_workflow_result` | 轮询当前或所选运行，获取状态、输出、可见性元数据和最近的失败摘要。 |
| `get_workflow_history` | 获取有数量上限的 v2 类型化历史事件尾部和最近的持久失败记录。 |
| `diagnose_workflow` | 依据结构化事实、根因、修复建议和下一步操作，对所选运行进行分类。 |
| `repair_workflow` | 请求内置 v2 修复命令，返回结构化变更结果，说明请求已接受、已拒绝或无需修复。 |

每次启动前先调用 `list_workflows`。这是代理的兼容性检查：响应告诉客户端有哪些工作流键，以及工作流能否在当前环境中运行。

发现封装使用规范 schema ID `durable-workflow.v2.mcp-discovery`。代理可据此识别已发布的工具列表结构、参数 schema、发现提示，以及调用工具前需要理解的 `payload_preview_limit_bytes` 语义。

## 工具输入契约 {#tool-input-contract}

MCP 工具 schema 有意使用 Durable Workflow 的术语，而非 Laravel 内部概念。扩展示例应用服务器时，保持以下字段稳定：

| 工具 | 稳定输入 |
| --- | --- |
| `list_workflows` | `show_recent`、`limit`，以及发现最近运行时使用的可选 `status`。 |
| `start_workflow` | `workflow`、按顺序排列的 `arguments`，以及可选的 `instance_id`、`business_key`、`visibility_labels`、`memo`、`search_attributes` 和 `duplicate_start_policy`。 |
| `get_workflow_result` | `workflow_id`，以及可选的 `run_id`、`include_recent_history` 和 `history_limit`。 |
| `get_workflow_history` | `workflow_id` 或 `run_id`、`limit` 和 `include_payloads`。 |
| `diagnose_workflow` | `workflow_id` 或 `run_id`，以及可选的 `history_limit`。 |
| `repair_workflow` | `workflow_id` 或 `run_id`。 |

新代理应优先使用 `arguments`，而非旧的 `args` 输入。`arguments` 直接对应工作流 `handle()` 的参数顺序，`args` 仅为旧的对象形式调用方保留。

仅当代理需要幂等性时，才使用调用方提供的 `instance_id`。若重复执行的冒烟测试应附着到活动工作流，而非因重复而失败，请同时使用 `duplicate_start_policy=return_existing_active`。

## 工具结果契约 {#tool-result-contract}

工具结果封装使用规范 schema ID `durable-workflow.v2.mcp-tool-results`。代理可据此解析结果状态、负载预览截断、错误字段、根因和修复建议对象、安全变更封装，以及 schema 和版本标记。

代理应将以下结果字段视为跨工具关联的持久标识：

| 工具 | 稳定结果字段 |
| --- | --- |
| `list_workflows` | `available_workflows`、`allow_fqcn`、`workflow_id_kind`、`run_id_kind`、`status_values`，以及可选的 `recent_workflows`。 |
| `start_workflow` | `workflow_id`、`run_id`、`workflow`、`workflow_class`、`workflow_type`、`status`、`running`、`business_key`、`duplicate_start_policy` 和 `command`。 |
| `get_workflow_result` | `found`、`workflow_id`、`run_id`、`current_run_id`、`current_run_is_selected`、`status`、`running`、`output`、`error`、可见性元数据和时间戳。 |
| `get_workflow_history` | `found`、`workflow_id`、`run_id`、`current_run_id`、`status`、`history_event_count`、`returned_event_count`、`events_are_most_recent`、`payloads_included`、`events` 和 `failures`。 |
| `diagnose_workflow` | `found`、`workflow_id`、`run_id`、`diagnosis`、`facts`、`latest_failure`、`recent_history`、`root_cause`、`remediation` 和 `next_actions`。 |
| `repair_workflow` | `found`、`workflow_id`、`run_id`、`accepted`、`status`、`mutation`、`command`、`remediation` 和 `next_actions`。 |

历史负载预览有明确大小上限。`include_payloads` 为 true 时，每个事件预览都会报告 `payload_preview_limit_bytes`、`size_bytes`、`preview_bytes` 和 `truncated`，使代理可以说明自己看到的是完整负载还是预览。

## 失败与修复建议分类 {#failure-and-remediation-taxonomy}

`diagnose_workflow` 是机器可读的根因接口。其 `root_cause` 对象使用 schema ID `durable-workflow.v2.agent-root-cause`，包含：

- `category`，例如 `activity_failure`、`workflow_failure`、`task_repair_attention`、`waiting_for_signal`、`history_growth_attention`、`in_progress` 或 `none`
- `source.kind` 和 `source.id`，标识产生该分类的工作流、活动、等待、任务队列或历史类别
- `retryable`、`severity` 和 `actionable`
- 存在持久失败行时，提供 `failure_category`、`exception_class` 和 `handled` 等失败详情

配套的 `remediation` 对象使用 schema ID `durable-workflow.v2.agent-remediation`。它包含 `classification`、简短的 `summary`、`automatic_repair.tool`、`automatic_repair.allowed`，以及列出受支持后续命令的 `next_actions` 条目。代理仅应在 `automatic_repair.allowed` 为 true 时调用 `repair_workflow`。其他分类会指示代理等待、通过文档规定的工作流命令接口发送预期输入、检查历史、修改工作流或活动代码，或规划 Continue-As-New。

`repair_workflow` 返回 `durable-workflow.v2.safe-mutation` 封装。`mutation.applied` 表示修复命令是否被接受，`command.outcome` 则区分 `repair_dispatched`、`repair_not_needed`，以及运行已进入终态或非当前运行等结构化拒绝结果。

## 安全的代理循环 {#safe-agent-loop}

先使用无凭据工作流：

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "diagnose_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "repair_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

`simple` 和 `elapsed` 工作流键是首选冒烟测试入口。只有当 `list_workflows` 报告凭据要求，且本地环境已具备所需密钥后，才使用需要凭据的示例。

## 报告结构 {#report-shape}

AI 客户端应使用稳定事实报告 MCP 结果：

- 使用的文档版本，通常为 `2.0`
- MCP 端点和工具名称
- 工作流键、`workflow_id` 和 `run_id`
- 状态和最近的失败摘要
- `root_cause.category` 和 `remediation.classification`
- 尝试修复变更前，`remediation.automatic_repair.allowed` 是否为 true
- 有数量上限的历史事件名称和时间戳
- 本次运行使用的是无凭据冒烟测试工作流，还是需要凭据的示例

这些事实与 CLI、Python SDK 和 Waterline 历史导出接口一致，因此人可以从其他客户端重现同一次运行。

## 相关页面 {#related-pages}

- [AI 辅助开发](./ai-assisted-development.md)
- [代理操作循环](./agent-operating-loop.md)
- [代理工具契约](./agent-tooling-contract.md)
- [示例应用](./sample-app.md)
- [客户端与 Worker 能力](./polyglot/cli-python-parity.md)
- [消息流](./features/message-streams.md)
