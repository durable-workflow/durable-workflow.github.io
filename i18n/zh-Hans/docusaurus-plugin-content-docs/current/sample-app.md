---
sidebar_position: 8
tags:
  - sample-app
  - Laravel
  - message-streams
  - Waterline
keywords:
  - 示例应用
  - Laravel 使用方
  - AI 工作流示例
  - Waterline 仪表板
---

# 示例应用 {#sample-app}

https://github.com/durable-workflow/sample-app

这是嵌入式 Laravel 示例集：一个基于稳定 Durable Workflow 2.0 发布系列构建的 Laravel 13 示例应用，包含可在 GitHub Codespace 中运行的工作流。如果部署模式是**嵌入式 Laravel**，并希望一起查看 Laravel 队列执行与 Waterline，这里是合适的起点。

选择与运行时匹配的示例：

| 部署模式 | 示例路径 |
| --- | --- |
| Durable Workflow Cloud | 从 [Cloud 托管运行时](/docs/polyglot/cloud-control-plane/)开始，再使用已提供的命名空间凭据，选择 PHP、Python 或 Rust SDK 指南。Cloud 用户不运行 Server。 |
| 自托管服务模式 | 使用 [Durable Workflow 2.0 快速入门](/docs/quickstart/)，获取针对本地 Server、使用已发布产物的完整 PHP、Python 和 Rust 示例。 |
| 嵌入式 Laravel | 继续阅读本示例集和[嵌入式安装](/docs/installation/)。 |

本示例集是 Laravel 托管引擎的端到端证据，不是服务模式或多语言部署的通用起始应用。它是嵌入功能首先获得真实 Laravel 覆盖的位置，也是本站展示 Laravel 原生模式时的镜像来源。如果有 Durable Workflow 模式想分享，[贡献示例](/docs/contribute-a-sample)指南介绍提交流程。

> 在找 Laravel 12 / Durable Workflow 1.x 版本？它保留在 [`Laravel-12` 分支](https://github.com/durable-workflow/sample-app/tree/Laravel-12)。引用 v1 模式的旧博客和教程（例如 `Workflow\Workflow`、`yield activity(...)`、`Workflow\Activity`）针对该分支。

## 示例集 {#sample-gallery}

每个条目列出示例教授的模式功能面、对应工作流类、运行它的 artisan 命令，以及证明运行实例已提交的 Waterline 页面。示例集镜像 sample-app 仓库 README 的“Sample Index”；示例合并或移动时，README 和本示例集一起更新。

| 模式 | 工作流类 | 命令 | Waterline 页面 |
|---------|----------------|---------|------------------|
| 最小确定性 v2 工作流 | `App\Workflows\Simple\SimpleWorkflow` | `php artisan app:workflow` | 运行列表 → 运行详情，包含两个活动事件和一个 `WorkflowCompleted` 事件 |
| 不因重放漂移的持久耗时测量 | `App\Workflows\Elapsed\ElapsedTimeWorkflow` | `php artisan app:elapsed` | 运行详情显示两个 `SideEffectRecorded` 事件，分别记录 `TimerFired` 事件前后的 `sideEffect` 时钟读取 |
| 跨 Laravel 应用边界协调 | `App\Workflows\Microservice\MicroserviceWorkflow` | `php artisan app:microservice` | 运行详情显示通过任务队列在应用和微服务 Worker 间路由的活动事件 |
| 捕获产物的浏览器自动化 | `App\Workflows\Playwright\CheckConsoleErrorsWorkflow` | `php artisan app:playwright` | 运行详情按顺序显示 Playwright 活动、FFmpeg 活动和清理活动 |
| 由 Webhook 启动并等待信号的工作流 | `App\Workflows\Webhooks\WebhookWorkflow` | `php artisan app:webhook` | 运行详情显示来自 webhook 入口的 `WorkflowStarted` 和 `ready` 的 `SignalReceived` 事件 |
| 带持久重试/验证的 AI 活动循环 | `App\Workflows\Prism\PrismWorkflow` | `php artisan app:prism` | 运行详情显示重复活动尝试，以及满足验证器的 `ActivityCompleted` |
| 带 saga 补偿的信号驱动 AI 代理 | `App\Workflows\Ai\AiWorkflow` | `php artisan app:ai` | 运行详情显示消息流引用、更新历史，以及 saga 失败后记录的补偿活动 |

Waterline 页面列说明健康运行中预期出现的事件；若本地运行缺少某个事件，该缺口是定位 Worker 侧或环境问题的最快线索。

## 模式页面交叉链接 {#pattern-page-cross-links}

本站模式页面直接链接执行对应功能面的示例工作流。用下表从模式页面跳转到匹配的可运行工作流。

| 模式页面 | 示例工作流 |
|--------------|-----------------|
| [Saga](/docs/features/sagas) | `App\Workflows\Ai\AiWorkflow`（`php artisan app:ai`） |
| [信号](/docs/features/signals) | `App\Workflows\Webhooks\WebhookWorkflow`（`php artisan app:webhook`） |
| [消息流](/docs/features/message-streams) | `App\Workflows\Ai\AiWorkflow`（`php artisan app:ai`） |
| [子工作流](/docs/features/child-workflows) | 尚无专门示例集条目。请使用子工作流指南。 |
| [副作用](/docs/features/side-effects) | `App\Workflows\Elapsed\ElapsedTimeWorkflow`（`php artisan app:elapsed`） |
| [Webhook](/docs/features/webhooks) | `App\Workflows\Webhooks\WebhookWorkflow`（`php artisan app:webhook`） |
| [MCP 工作流](/docs/mcp-workflows) | 全部示例集条目，通过 `config/workflow_mcp.php` 公开 |

**步骤 1**

从此仓库 main 分支创建一个 codespace。

![图片](https://user-images.githubusercontent.com/1130888/233664377-f300ad50-5436-4bb8-b172-c52e12047264.png)

**步骤 2**

Codespace 创建后，等待构建完成，通常需要 5 到 10 分钟。

**步骤 3**

完成后会看到编辑器和底部终端。

![图片](https://user-images.githubusercontent.com/1130888/233665550-1a4f2098-2919-4108-ac9f-bef1a9f2f47c.png)

**步骤 4**

运行 composer install。

```bash
composer install
```

**步骤 5**

运行 init 命令，配置应用、安装额外依赖并执行迁移。

```bash
php artisan app:init
```

示例应用的 `php artisan migrate` 路径会直接加载 Workflow 和 Waterline 软件包迁移，因此正常安装后，所有表及 Waterline 已保存视图均已就绪。

**步骤 6**

启动队列 Worker，以便处理工作流和活动。

```bash
php artisan queue:work
```

若要验证修复循环本身，而不等待繁忙队列 Worker 进入下一个 `Looping` 周期，在第二个终端中明确执行一次恢复扫描：

```bash
php artisan workflow:v2:repair-pass
```

该命令与 Worker 循环使用相同的扫描和退避策略。它适用于修复本地队列/后端问题后、验证示例应用丢失任务场景时，或低流量 codespace 需要较久才进入下一轮循环时。实验期间添加 `--run-id=...`，可将扫描限制为一个或多个所选运行实例；若要覆盖整个工作流实例，使用 `--instance-id=...`。

**步骤 7**

创建一个新终端窗口。

![图片](https://user-images.githubusercontent.com/1130888/233666917-029247c7-9e6c-46de-b304-27473fd34517.png)

**步骤 8**

在新终端窗口中启动示例工作流。

```bash
php artisan app:workflow
```

**步骤 9**

在 https://[your-codespace-name]-80.preview.app.github.dev/waterline/dashboard 查看 Waterline 仪表板。

![图片](https://user-images.githubusercontent.com/1130888/233669600-3340ada6-5f73-4602-8d82-a81a9d43f883.png)

Waterline 是持久状态视图，回答工作流是否启动、哪个运行实例是当前实例、提交了哪些类型化历史事件、哪些等待尚未结束，以及有哪些可用操作。Worker 侧遥测是独立的：轮询延迟、任务耗时、导出器配置、自定义应用指标和 Worker 进程错误，来自 PHP Worker 日志或外部 Worker 的 SDK 指标端点。

| 接口 | 回答的问题 | 示例检查 |
| --- | --- | --- |
| Waterline 和历史导出 | 持久工作流状态、历史、重试、等待、信号、更新、失败和操作 | 打开 `/waterline/dashboard`，然后导出所选运行历史 |
| Worker 日志 | PHP 队列 Worker 进程错误和应用日志行 | 在 `php artisan queue:work` 运行时跟踪 `storage/logs/laravel.log` |
| SDK 指标 | 外部 Worker/客户端请求数、轮询延迟和任务耗时 | 抓取 SDK Worker 的 Prometheus/OpenMetrics 端点 |

对于 Python Worker，安装 Prometheus 扩展依赖，并从该 Worker 进程公开指标：

```bash
pip install 'durable-workflow[prometheus]'
```

```python
from prometheus_client import start_http_server

from durable_workflow import Client, PrometheusMetrics, Worker

metrics = PrometheusMetrics()
start_http_server(9102)

async with Client("http://localhost:8080", token="secret", metrics=metrics) as client:
    worker = Worker(
        client,
        task_queue="default",
        workflows=[GreeterWorkflow],
        activities=[greet],
        metrics=metrics,
    )
    await worker.run()
```

将 `GreeterWorkflow` 和 `greet` 替换为该 Worker 注册的工作流和活动处理器。

抓取 `:9102/metrics` 获取 `durable_workflow_worker_*` 和 `durable_workflow_client_*` 序列。这些指标解释 Worker 运行时性能；Waterline 仍是已提交工作流历史的事实来源。

Waterline 详情页面包含针对所选运行实例的“Export History”（导出历史）操作。详情页显示实例的当前运行时，该按钮使用实例级当前运行导出路由；历史运行详情继续使用明确的 `/runs/{runId}/history-export` 路径。也可从示例应用终端导出相同的重放/调试包：

```bash
php artisan workflow:v2:history-export {workflow-instance-id} --run-id={workflow-run-id} --output=storage/app/workflow-history/example.json --pretty
```

导出包含 SHA-256 完整性校验和。若其他系统需要通过 HMAC 签名验证导出包，在应用环境中设置 `DW_V2_HISTORY_EXPORT_SIGNING_KEY` 和 `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID`。

导出的 `selected_run` 块包含 `waits_projection_source`、`timeline_projection_source`、`timers_projection_source` 和 `lineage_projection_source`。导出的 `links` 块也包含 `projection_source`；`links.parents` / `links.children` 部分优先来自所选运行的类型化谱系历史，因此即使本地实验中可变链接行发生漂移，子工作流和 continue-as-new 关系仍在包中可见。当某条谱系行仅靠旧的可变兼容性数据保留时，包会将其标记为 `history_authority = mutable_open_fallback` 和 `diagnostic_only = true`，而不是在导出时悄悄重新填充额外链接元数据。

## AI 工作流消息流 {#ai-workflow-message-streams}

重复处理 AI 或人工输入的工作流，应使用第一类 v2 消息流门面作为编写模式：

```php
$reply = $this->inbox('ai.assistant')->receiveOne();

$this->outbox('ai.assistant')->sendReference(
    targetInstanceId: $this->workflowId(),
    payloadReference: $storedReplyReference,
    correlationId: $requestId,
);
```

大型请求/响应正文保留在应用自有负载存储中，再通过流传递存储引用。不要让新的示例工作流直接写 `workflow_messages`，或直接调用 `MessageStreamCursor`、`MessageService`。稳定 v2 收件箱/发件箱契约参见[消息流](/docs/features/message-streams)。

**步骤 10**

运行工作流和活动测试。

```bash
vendor/bin/phpunit
```

现在可以创建和测试工作流了。

## AI 客户端 MCP 服务器 {#ai-client-mcp-server}

示例应用还在 `/mcp/workflows` 公开 Laravel MCP 服务器。这是 Durable Workflow v2 的 AI 客户端参考接口：为代理提供结构化的工作流发现、启动、状态、输出、近期类型化历史和失败事实，无需抓取 Waterline。

MCP 端点和工具契约详见 [MCP 工作流接口](/docs/mcp-workflows)。更广泛的 AI 辅助开发契约，包括 v2 LLM 清单、CLI 退出码、Waterline 导出和 SDK 参考，参见 [AI 辅助开发](/docs/ai-assisted-development)。

MCP 服务器由 Laravel MCP 软件包在 `routes/ai.php` 中注册。公开的工作流键位于 `config/workflow_mcp.php`；每个条目可以包含工作流类及描述、凭据要求、预期参数等发现元数据。

默认工具：

| 工具 | 用途 |
| --- | --- |
| `list_workflows` | 列出配置的工作流键、凭据要求、v2 状态值，以及可选的近期运行实例。 |
| `start_workflow` | 启动配置的 v2 工作流，返回 `workflow_id`、`run_id`、状态、业务键和命令结果。 |
| `get_workflow_result` | 轮询当前或所选运行实例，返回状态、输出、可见性元数据和最近失败摘要。 |
| `get_workflow_history` | 返回有限条近期类型化 v2 历史事件和最近持久失败，供调试使用。 |
| `diagnose_workflow` | 用结构化事实、根因、修复措施和后续操作对所选运行实例分类。 |
| `repair_workflow` | 请求内置 v2 修复命令，返回结构化的已接受、已拒绝或无需变更结果。 |

典型代理循环如下：

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

无需凭据的冒烟测试使用 `simple` 或 `elapsed`。`prism` 工作流有意作为 AI 示例公开，但 Worker 需要 `OPENAI_API_KEY` 才能完成它。

