---
sidebar_position: 4
title: Rust Cloud 快速入门
description: 对已配置的 Durable Workflow Cloud 命名空间运行共享 Sample App Rust 试验环境。
tags:
  - Rust
  - Cloud
  - quickstart
  - workers
keywords:
  - Rust Cloud 快速入门
  - 命名空间运行时 URL
  - Rust Worker
  - Sample App 试验环境
---

# Rust Cloud 快速入门 {#rust-cloud-quickstart}

:::caution 受控早期访问

Durable Workflow Cloud 通过受控早期访问提供服务。仅在 Cloud 已配置命名空间及两个限定角色的运行时凭据后使用本指南。已正式提供的 Rust 使用路径不需要 Cloud；请从 [Rust SDK 指南](./rust.md) 开始，或对试验环境默认的本地运行时执行 `scripts/playground rust`。

:::

Sample App 为 PHP、Python 和 Rust 提供对称的共享试验环境。本页选择 Rust，只更改目标运行时。对应的 [PHP](./php.md) 和 [Python](./python.md) SDK 路径使用相同命令，将语言参数设为 `php` 或 `python`；[Sample App 试验环境契约](https://github.com/durable-workflow/sample-app/blob/main/README.md#symmetric-sdk-playground) 记录全部三种选择。

试验环境从 Sample App 的机器管理元数据解析当前稳定制品版本。请使用生成的版本，不要将版本号复制到这些命令中，也不要增加独立的 SDK 安装步骤。

## 1. 打开已准备的 Sample App {#1-open-the-prepared-sample-app}

[从 Sample App 的 `main` 分支创建 Codespace](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)，等待设置完成，然后在仓库根目录打开终端。准备好的镜像包含共享试验环境所需的 SDK 工具链和 `dw`。

Cloud 提供运行时 URL、运行时命名空间及两个角色凭据。选择应用任务队列，再将以下占位符替换为对应值后导出：

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<rust-task-queue>'
```

运行时 URL 是 Cloud 返回的命名空间运行时根地址。它必须是绝对 HTTPS URL，不能包含查询、片段或末尾的 `/api`；SDK 和 CLI 会自行追加 API 路由。运行时命名空间是随 URL 返回的独立值，不能从路径推断名称。

客户端凭据用于启动、描述和读取工作流。Worker 凭据用于注册、轮询、发送心跳及完成任务。即使此命令会启动两个子进程，它们仍必须是不同的、限定角色的密钥。Cloud 管理密钥用于管理命名空间和凭据；不要将它导出或传递为任一运行时凭据。

## 2. 运行 Rust 使用流程 {#2-run-the-rust-journey}

运行共享的外部运行时契约：

```bash
scripts/playground rust --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_RUNTIME_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

命令在 `.playground/rust` 下生成缺失文件，不替换调用方拥有的源码。在启动任何进程前，它会输出实际使用的工作流类型、活动类型、队列、Worker 命令、客户端命令、输入和预期结果。Worker 仅接收 Worker 凭据；其精确注册信息可见后，客户端才会接收客户端凭据。

注册最多等待 60 秒。不能仅凭进程启动就判定已就绪。只有命令输出如下形态的检查点后才继续（标识仅作示例）：

```text
Worker ready: target=managed runtime_url=<provisioned-runtime-url> namespace=<provisioned-runtime-namespace> id=<worker-id> queue=<rust-task-queue> workflow_type=sample-app.playground.rust.authored-workflow activity_type=sample-app.playground.rust.authored-activity
```

同一命令启动一个工作流，最多等待 120 秒获取 SDK 客户端结果，用 `dw` 确认 `status=completed`，并检查必需的工作流和活动历史。成功结果示例：

```text
Completed rust workflow <workflow-id>: {"greeting":"Hello, Durable Workflow, from the Sample App Rust playground","input":{"name":"Durable Workflow"},"activity_runtime":"rust","workflow_runtime":"rust"}
```

最后的 `Playground success` 行再次列出目标运行时、命名空间、队列、已注册类型及预期结果结构，不包含凭据值。命令还写入 `storage/app/playground-rust-evidence.json`，包含所选制品版本、精确注册信息、工作流/运行标识、`completed` 状态、结果及历史事件类型。Managed Waterline 仍是已配置命名空间的运维界面；托管流程不会启动本地 Server 或 Waterline。

## 有限诊断 {#bounded-diagnosis}

如果 60 秒内没有出现 `Worker ready` 检查点，请从错误上方输出的实际契约开始检查：

- **队列不匹配：**运行器查询传给 `--task-queue` 的精确值。确认 Cloud 准许使用该队列，并且输出的注册信息使用相同值，然后重新运行同一命令。
- **类型不匹配：**错误会列出 Worker 必须公布的工作流和活动类型。将它们与实际契约比较。如果调用方文件包含旧的硬编码注册，请更新文件，或用 `--source "$HOME/durable-rust-worker"` 在新目录验证当前脚手架。
- **凭据角色不匹配：**注册前的授权问题指向 Worker 凭据；描述或启动运行时的授权问题指向客户端凭据。不要交换值，也不要用 Cloud 管理密钥替换任一个值。
- **运行时不匹配：**两种角色都必须使用精确的已配置运行时 URL 和运行时命名空间。移除末尾的 `/api`；不要替换成 Cloud 管理 URL 或自托管 Server URL。

如果注册成功但未能完成，请保留输出的工作流/运行标识。在 Managed Waterline 中检查该选定运行，将其待处理的工作流或活动类型及任务队列与实际契约比较。先修复不匹配，再启动另一次运行。保留的证据路径和有限的 Worker 输出会指出失败的是客户端结果、持久状态、预期结果还是必需的历史检查。

返回内容更全面的 [Rust SDK 指南](./rust.md)，或使用生成的 [Rust API 参考](https://rust.durable-workflow.com/durable_workflow/) 查询各个类型和方法。
