---
sidebar_position: 9
tags:
  - sample-app
  - contributing
  - patterns
keywords:
  - 贡献示例
  - Durable Workflow 示例贡献
  - sample-request 流程
  - 外部示例工作流
---

# 贡献示例 {#contribute-a-sample}

[示例应用](/docs/sample-app)是展示 Durable Workflow 模式在真实 Laravel 项目中如何运作的权威位置。如果你有能帮助其他工程师的模式，例如尚未展示的 saga 形式、消息流的另一种用法，或现有示例未涉及的工具集成，本指南说明如何将它合并进来。

这里的契约刻意保持简短。遵循契约的示例会按可预期的节奏合并。缺少其中部分内容的示例会留在审查阶段，直到补齐缺口。

## 编写代码之前 {#before-you-write-code}

1. **先创建 `sample-request` issue。** [`sample-request` 模板](https://github.com/durable-workflow/sample-app/issues/new/choose)会列出模式涉及的功能面、定义它的公开文档页面，以及所需的最低 Durable Workflow 软件包版本。贡献者投入 PR 之前，维护者与贡献者先在 issue 中就示例是否值得合并达成一致。
2. **选择示例索引中尚不存在的模式功能面。** [README 示例索引](https://github.com/durable-workflow/sample-app#sample-index)列出了所有已覆盖模式。如果想法归根结底只是“简单工作流的另一种写法”，它不是新示例，而是针对 `App\Workflows\Simple\SimpleWorkflow` 的文档调整。
3. **找到最接近的现有工作流类。** 新示例应与相邻示例保持一致：使用相同的 `app/Workflows/<Pattern>/` 目录布局、相同形式的 artisan 命令，以及相同的测试方式。即使展示的模式很好，另起一套新脚手架的示例仍会被拒绝。

## 可合并示例的样子 {#what-a-merged-sample-looks-like}

可合并的示例应当*可运行*、*便于教学*、*有测试覆盖*且*可发现*。这对应 sample-app 仓库中的四项具体产物：

1. 位于 `app/Workflows/<Pattern>/` 下的**工作流类**，端到端演示该模式。工作流代码保持确定性：读取时钟放在 `sideEffect()` 中，外部工作放在活动中，等待通过信号、更新、定时器或消息流实现。除非模式明确要求，否则工作流类应能在没有 `OPENAI_API_KEY` 或其他外部凭据的情况下编译。
2. 使用真实输入启动工作流的 **artisan 命令**，让读者只运行一个命令就能在 Waterline 中看到运行实例。该命令放在 `routes/console.php`（或等价的注册入口）中，与同类 artisan 命令放在一起，并遵循相同命名约定（`app:<short-pattern>`）。
3. 一条 **`config/workflow_mcp.php` 配置**，列明工作流类、模式、命令、必需凭据和参数。MCP 服务器通过此配置发现示例；在配置存在之前，上游覆盖 lint 不会将覆盖行标记为 `covered`。
4. 位于 **`tests/` 下的测试**，通过内存 v2 Worker 执行该工作流。测试不必断言每一个类型化历史事件，但必须证明工作流能使用 artisan 命令传入的输入完成执行。

如果示例展示的是*错误修复*而非功能，则放在 `app/Workflows/Bug/<short-id>/` 下，仍需提供相同的四项产物。

## 文档中需要哪些内容 {#what-goes-in-the-docs}

示例合并时，三处文档需要同步更新：

- sample-app 仓库的 **README“Sample Index”**：每个示例一行，包含目标、工作流类、artisan 命令和 MCP 键。它是事实来源。
- **文档站点示例集（[`docs/sample-app.md`](/docs/sample-app)）**：添加镜像条目，说明读者应该看到哪个 Waterline 页面。示例集让读者在克隆仓库前判断示例是否符合需要。
- 定义该功能面（saga、信号、消息流、子工作流等）的文档站点模式页面中的**交叉链接**。sample-app 文档页面底部的交叉链接表是权威列表；列出了功能面但未链接示例的条目会被视为缺口。

在 sample-app PR 中提交示例和 README 修改，并在关联的文档站点 PR 中提交示例集和模式页面修改。维护者会一起合并这些关联修改。
如果示例合并后尚无文档站点镜像，上游覆盖跟踪器会将其标记为 `gap`，直到文档 PR 补齐，因此建议贡献者一起交付。

## 命名、布局和风格 {#naming-layout-and-style}

- **类布局。** `app/Workflows/<Pattern>/<Pattern>Workflow.php`，活动类放在相邻的 `app/Workflows/<Pattern>/Activities/` 下。错误复现示例放在 `app/Workflows/Bug/<short-id>/` 下，布局相同。
- **Artisan 命令。** `app:<short-pattern>`（小写，不带连字符）。不要使用长形式名称（`app:run-<pattern>`）。
- **MCP 键。** 与 artisan 命令的简短模式名一致，让 MCP 客户端看到的名称和用户在终端输入的名称相同。
- **注释。** 解释*原因*，而非重复*操作*。重放安全不变量值得注释，例如为何将值包在 `sideEffect()` 中，或为何等待使用定时器而非 `usleep()`；不必在每次活动调用处重复相同注释。
- **Waterline 截图。** 文档站点的 sample-app 示例集会列出该示例预期产生的 Waterline 页面；在示例 PR 中添加或更新该页面截图。

## 哪些情况会被退回 {#what-gets-a-sample-rejected}

示例存在以下情况时会被退回：

- 工作流代码在 `sideEffect()` 或活动之外调用 `now()`、`random_*()` 或其他非确定性操作；
- 活动执行了引擎已经负责的持久化记账，例如直接写 `workflow_messages` 行、手动推进流游标，或在工作流代码内持久化 Waterline 状态；
- artisan 命令需要外部凭据，但 MCP 条目的 `requires` 字段未说明；
- README 示例索引、文档站点示例集条目和模式页面交叉链接未随同一项修改交付；
- 示例重复已有模式功能面，且未展示新内容（不同形式、不同故障模式或不同集成）。“相同模式、不同表述”属于文档修改，不是新示例。

上游覆盖 lint 和 sample-app 审查清单检查的也是这些问题，因此在打开 PR 前自行检查，是最快的合并路径。

## 快速检查清单 {#quick-checklist}

打开 PR 时使用此清单：

- [ ] 已有 `sample-request` issue，并链接公开模式文档页面。
- [ ] 工作流类位于 `app/Workflows/<Pattern>/` 下。
- [ ] artisan 命令以 `app:<short-pattern>` 名称注册。
- [ ] `config/workflow_mcp.php` 条目包含类、模式、命令、requires 和参数。
- [ ] 有端到端执行工作流的测试。
- [ ] README“Sample Index”条目。
- [ ] [`docs/sample-app.md`](/docs/sample-app) 中的文档站点示例集条目。
- [ ] 文档站点对应模式页面中的交叉链接。
- [ ] 公开边界扫描通过（`scripts/check-public-boundary.sh`）。

维护者审查时使用相同清单，因此全部完成的 PR 应能在一个发布周期内合并。
