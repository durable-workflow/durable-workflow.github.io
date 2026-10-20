---
sidebar_position: 9
title: AI 辅助开发
description: 将 Durable Workflow 的 v2 文档、MCP 接口、CLI 输出和历史导出作为编程代理可以稳定使用的入口。
tags:
  - ai
  - agents
  - llms
keywords:
  - durable workflow AI 文档
  - llms.txt
  - AI 编程助手
---

# AI 辅助开发 {#ai-assisted-development}

Durable Workflow v2 的设计让人先理解持久执行模型，再由工具承担反复检查和操作的工作。关键的产品接口是一组稳定的入口，代理可以直接读取、调用和引用，无须猜测；仅有聊天提示词并不足以做到这一点。

## 检索入口 {#retrieval-surfaces}

使用以下 LLM 文档产物，让 AI 助手依据 Durable Workflow 的机器可读文档工作：

| 入口 | URL | 用途 |
| --- | --- | --- |
| 规范清单 | `https://durable-workflow.com/llms.txt` | 稳定版 2.0 文档索引，跟随网站不带版本号的默认文档路径。 |
| 规范完整文档包 | `https://durable-workflow.com/llms-full.txt` | 与规范清单一致的单文件文档包。 |
| v1 清单 | `https://durable-workflow.com/llms-1.x.txt` | 固定到 1.x 版本的归档。 |
| v1 完整文档包 | `https://durable-workflow.com/llms-full-1.x.txt` | 固定到 1.x 稳定版的文档包。 |
| v2 清单 | `https://durable-workflow.com/llms-2.0.txt` | 固定到 2.0 版本的索引，与规范清单等价。 |
| v2 完整文档包 | `https://durable-workflow.com/llms-full-2.0.txt` | 固定到 2.0 版本的文档包。 |

默认的代理提示词应为稳定版 2.0 工作获取 `/llms.txt` 或 `/llms-full.txt`。维护 1.x 应用时，固定使用带 `-1.x.txt` 的 URL。

## 本地 MCP 接口 {#local-mcp-surface}

[示例应用](/docs/sample-app) 在 `/mcp/workflows` 提供 Laravel MCP 服务器。它是本地 v2 工作流开发中 AI 客户端集成的参考实现。专门的 [MCP 工作流接口](/docs/mcp-workflows)页面定义了端点、工具集、安全的冒烟测试工作流和报告结构。

MCP 服务器向代理提供结构化工作流操作：

| 工具 | 稳定入口 |
| --- | --- |
| `list_workflows` | 发现已配置的工作流键、凭据要求、状态值和最近运行。 |
| `start_workflow` | 启动已配置的 v2 工作流，接收 `workflow_id`、`run_id`、状态、业务键和命令结果。 |
| `get_workflow_result` | 轮询当前或指定运行，获取状态、输出、可见性元数据和最近的失败摘要。 |
| `get_workflow_history` | 获取有数量上限的 v2 类型化历史事件尾部和最近的持久失败记录。 |

使用 `simple` 或 `elapsed` 进行无凭据冒烟测试。仅在本地环境已包含所需密钥后，使用需要外部凭据的工作流。

代理编辑需要反复接收 AI 或人工输入的工作流时，应遵循 v2 [消息流](/docs/features/message-streams)契约。稳定的编写模式是 `Workflow::inbox()` / `Workflow::outbox()` / `MessageStream`。直接写入 `MessageService`、`WorkflowMessage` 或游标行属于运行时内部实现，不应作为示例代码模式。

## 命令与诊断契约 {#command-and-diagnostic-contracts}

代理应优先使用机器可读接口：

- [代理操作循环](/docs/agent-operating-loop)将 v2 文档、MCP 端点、`dw` JSON 输出、Waterline 历史导出和 SDK 参考组织成可重复的发现、修改、运行、诊断流程。
- [代理工具契约](/docs/agent-tooling-contract)定义 MCP 工具、CLI JSON、服务器诊断、Waterline 导出和 SDK 测试夹具如何组成统一的机器可操作接口。
- `dw` 命令为自动化提供稳定的退出码。参见 [CLI 参考](/docs/polyglot/cli#exit-codes)。
- [客户端与 Worker 能力](/docs/polyglot/cli-python-parity/)比较 `dw` 与三个官方 SDK 的生命周期、消息、计划、可见性和 Worker 执行接口，并在已有证据时给出共享请求证据。
- [外部执行接口](/docs/polyglot/external-execution)通过 `/api/cluster/info` 发布具有活动执行语义的任务边界、载体要求、桥接结果以及输入和结果封装路径。
- 服务器的健康、信息、命名空间、工作流、计划、Worker 和任务队列命令，是基于 shell 进行检查的适当入口。
- Waterline 历史导出是重放和失败诊断的依据。它包含类型化历史事件、投影来源元数据、完整性检查、所选运行上下文、等待、定时器、运行谱系和最近的持久失败记录。
- Python SDK 的类型和方法签名见生成的 [Python API 参考](https://python.durable-workflow.com/)。

代理需要解释工作流为何停滞时，应先收集以下事实：

1. `workflow_id` 和 `run_id`
2. 当前运行状态和最近的失败摘要
3. 最近的类型化历史事件
4. 尚未结束的等待、定时器和待处理任务
5. Worker 与任务队列的健康状况
6. 对应的文档版本。当前产品工作使用 `2.0`，仅旧版维护使用 `1.x`

这些信息足以区分持久工作流失败、Worker 运行时失败、外部凭据缺失、队列故障，以及等待批准的操作。

## 提示词结构 {#prompt-shape}

为编程代理提供明确的约束和入口：

```text
Use Durable Workflow docs from https://durable-workflow.com/llms-full-2.0.txt.
Use the sample app MCP endpoint at /mcp/workflows for workflow discovery,
start, result, and history. Prefer dw JSON/exit-code contracts and Waterline
history exports over screenshots. For external handlers or bridge adapters,
read worker_protocol.external_execution_surface_contract from /api/cluster/info
and preserve the external task input/result envelopes. Use Durable Workflow
2.0 APIs unless I explicitly ask for legacy 1.x maintenance.
```

目标很明确：人理解工作流、活动和重放的不变量，工具则依据已记录的契约操作。
