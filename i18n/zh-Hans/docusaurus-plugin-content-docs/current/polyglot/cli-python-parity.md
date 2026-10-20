---
title: 客户端与 Worker 能力
description: 比较 CLI、PHP SDK、Python SDK 和 Rust SDK 的客户端与 Worker 能力。
---

# 客户端与 Worker 能力 {#client-and-worker-capabilities}

根据进程需要执行的任务选择接口。`dw` CLI 与第一方 PHP、Python 和 Rust SDK 共享 v2 控制平面及 Worker 契约，但其运维、客户端和 Worker 角色并不相同。

这份覆盖所有客户端的指南保留原有的 `/docs/polyglot/cli-python-parity/` 路由，使现有链接继续有效。

## 能力比较 {#capability-comparison}

| 能力 | `dw` CLI | PHP SDK | Python SDK | Rust SDK |
| --- | --- | --- | --- | --- |
| 工作流生命周期 | **支持：**启动、列出、检查、等待、取消、终止及归档运维命令。[命令](./cli-reference.md#workflow-commands) | **支持：**通过 `Client` 和 `WorkflowHandle` 启动、描述、列出、等待结果、取消及终止。[生命周期证据](./php.md#lifecycle-updates-schedules-and-visibility) | **支持：**通过异步客户端启动、列出/描述、等待结果、取消及终止。[工作流操作](./python.md#workflow-operations) | **支持：**通过 `Client` 和 `WorkflowHandle` 启动、描述、等待结果、取消及终止。[终态操作](./rust.md#cancel-terminate-and-handle-terminal-outcomes) |
| 信号 | **支持：**按工作流 ID 或选定运行发送。[命令](./cli-reference.md#workflow-commands) | **支持：**客户端与句柄发送方法，以及 Worker 信号历史。[PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **支持：**异步客户端发送，工作流 Worker 处理信号。[消息](./python.md#signals-queries-and-updates) | **支持：**客户端与句柄发送，以及 Worker 信号处理。[Rust API](https://rust.durable-workflow.com/) |
| 查询 | **支持：**执行具名只读查询并输出结构化结果。[命令](./cli-reference.md#workflow-commands) | **支持：**客户端与句柄查询，以及已注册的 Worker 查询处理器。[PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **支持：**异步客户端查询，以及经重放的 Worker 查询处理器。[消息](./python.md#signals-queries-and-updates) | **支持：**当运行时发现公布查询任务支持时，支持客户端查询及经重放的 Worker 查询处理器。[Rust API](https://rust.durable-workflow.com/) |
| 更新 | **支持：**提交并等待已接受或已完成的结果。[命令](./cli-reference.md#workflow-commands) | **支持：**`updateWorkflow` 和 `registerUpdate`；PHP SDK 不提供验证器编写接口，也不声明任何验证器。[PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **支持：**当发现结果公布接受前契约时，支持客户端、工作流处理器及同步声明的验证器。带验证器的 Worker 会拒绝不支持的运行时。[消息](./python.md#signals-queries-and-updates) | **支持：**客户端、句柄、Avro 载荷及已注册的 Worker 更新接口；Rust SDK 不提供验证器编写接口，也不声明任何验证器。[更新](./rust.md#workflow-updates) |
| 调度 | **支持：**完整调度生命周期、补跑及审计历史。[命令](./cli-reference.md#schedule-commands) | **支持：**通过 `Client` 管理完整调度生命周期并列出调度。[PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **支持：**完整异步调度生命周期及审计历史分页。[调度](./python.md#schedules) | **不支持：**当前 Rust SDK 不声明调度管理 API。请使用 CLI、PHP、Python 或 Server API。 |
| 可观测性 | **支持：**工作流/运行搜索、Worker、任务队列、历史及诊断 JSON。[命令](./cli-reference.md#workflow-commands) | **支持：**工作流过滤/分页、历史、命名空间、Worker 及任务队列。[可观测性证据](./php.md#lifecycle-updates-schedules-and-visibility) | **支持：**工作流、调度、命名空间、Worker、队列、历史及搜索属性客户端接口。[客户端 API](./python.md#client-api-reference) | **范围不同：**支持选定运行的描述/结果；不声明整个集群的列表/搜索及命名空间管理能力。[Rust 客户端](./rust.md#package-and-source) |
| Worker 执行 | **有意区分：**底层 Worker 协议命令用于诊断和一致性验证；`dw` 不是应用 Worker 运行时。[Worker 命令](./cli-reference.md#worker-protocol-commands) | **支持：**通过 `durable-workflow/sdk` 提供远程工作流、活动、查询及更新处理器。[PHP Worker](./php.md#run-a-remote-php-worker) | **支持：**确定性工作流及活动 Worker。[Python Worker](./python.md#worker) | **支持：**原生工作流、活动、查询及更新处理器。[Rust Worker API](https://rust.durable-workflow.com/) |

**支持**表示所列当前发布版本的接口提供该能力。**范围不同**表示有意设置的范围边界。**不支持**表示明确的当前缺口，不是隐藏承诺。当能力依赖协商的 Worker 协议时，以运行时协议发现为准。

## 各产品接口的证据 {#evidence-by-product-surface}

### CLI

[CLI 概览](./cli.mdx) 定义安装、配置档、结构化输出及退出行为。[命令参考](./cli-reference.md) 是完整的运维接口，包括生命周期、消息、调度、可观测性，以及有意区别于 SDK Worker 循环的底层 Worker 协议命令。

### PHP SDK

固定版本的 PHP SDK 提供框架无关的客户端与远程 Worker API。其当前公开接口包括工作流生命周期及结果句柄、信号、查询、更新、调度、工作流过滤/历史、命名空间、Worker 和任务队列可观测性，以及已注册的工作流、活动、查询和更新处理器。参见 [PHP SDK 指南](./php.md) 与生成的 [PHP API 参考](https://php.durable-workflow.com/api/)。

### Python SDK

Python SDK 将异步控制平面客户端与确定性工作流及活动 Worker 结合。其指南提供[客户端操作](./python.md#client-api-reference)、[消息处理器](./python.md#signals-queries-and-updates)、[Worker 执行](./python.md#worker) 和[调度管理](./python.md#schedules)。生成的 [Python API 参考](https://python.durable-workflow.com/) 包含精确签名和结果类型。

### Rust SDK

已发布的 Rust SDK 提供控制平面及选定运行的生命周期、信号、经重放的查询、更新，以及原生工作流/活动 Worker。更新支持包括 `Client::update_workflow`、`WorkflowHandle::update`、`Worker::register_update` 及其 Avro 值变体。调度管理和整个集群的列表/搜索仍是明确的缺口。参见 [Rust SDK 指南](./rust.md) 与生成的 [Rust API 参考](https://rust.durable-workflow.com/)。

## 共享契约证据 {#shared-contract-evidence}

四个产品都面向相同的带版本 HTTP+JSON 控制平面及公开载荷信封。证据按其证明内容划分：

- [能力索引](/docs/capabilities/) 记录精确的制品最低版本及当前覆盖范围；
- [平台一致性套件](/docs/platform-conformance/) 记录跨客户端、跨 Worker 的运行时场景；
- CLI 和 Python 仓库保留共享请求样例，针对目前按字节比较语义请求体的操作；
- PHP 和 Rust 公开 API 参考及发布测试证明上方所列的其他受支持方法。

两个仓库存在共享样例，不代表其他 SDK 缺少该操作。反过来，共同的端点也不代表每个产品提供相同的运维或 Worker 角色。

## 添加或扩展客户端接口 {#adding-or-extending-a-client-surface}

新增 CLI 或 SDK 操作时：

1. 保持路径、方法、语义字段、载荷信封及错误结果与语言无关。
2. 为每个参与的客户端或 Worker 添加请求与运行时证据。
3. 记录有意不同的语法或角色边界。
4. 明确标记不受支持的产品。
5. 将语言专属的序列化、文件路径、类名或错误结构视为公开契约中的缺陷。
