---
sidebar_position: 5
title: Rust SDK
description: 安装第一方 Rust SDK，并查找其 crate、源码及生成的 API 文档。
tags:
  - Rust
  - SDK
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - Rust SDK
  - durable-workflow crate
  - Rust Worker
  - crates.io
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# Rust SDK {#rust-sdk}

本指南介绍正式提供的 SDK 接口，各个类型和方法请继续查看生成的 API 参考。无需 Cloud 账号：主要路径使用已发布 Rust crate 和自托管 Server。已加入 Durable Workflow Cloud 受控早期访问的开发者，也可选择明确独立的[托管运行时快速入门](./rust-cloud-quickstart.md)。

第一方 Rust SDK 提供工作流编写接口，不仅是协议兼容客户端。Rust 可以使用与 PHP 和 Python 相同的持久执行模型，编写确定性工作流、活动和长时间运行的 Worker 服务。异步控制平面客户端启动、发送信号、查询、更新、取消、终止及等待执行；Worker 运行时重放工作流历史，运行工作流/活动/更新处理器，报告 Worker 和活动心跳，并与自托管 Server 或 Durable Workflow Cloud 命名空间运行时交换语言中立的负载。

[Rust 文档首页](https://rust.durable-workflow.com/)提供 SDK 索引及常用入口。crate 模块、结构体、trait 和方法请继续查看生成的 [Rust SDK API 参考](https://rust.durable-workflow.com/durable_workflow/)。

稳定版 Rust SDK 支持持久定时器、子工作流、活动重试和超时、本地活动、Worker 会话、粘性执行、信号、经重放的查询处理器、取消和终止、Server 强制执行的工作流截止时间、类型化副作用、版本标记、更新，以及类型化终态/重放失败。它尚未声明支持计划管理。请使用 [2.0 能力索引](/docs/capabilities/)，不要假定每个 SDK 的功能覆盖范围完全一致。

## 试用本地 Sample App 试验环境 {#try-the-local-sample-app-playground}

若要通过最短路径在不使用 Cloud 的情况下编写工作流，请在 [GitHub Codespaces 中打开当前 Sample App 的 `main` 分支](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)，然后运行：

<!-- docs-example id="sdk.rust.sample-app-playground" -->
```bash
scripts/playground rust
```

本地试验环境生成由调用方拥有的工作流和活动源码，选择当前稳定制品，并启动已发布的 Server 和 Waterline。它先等待与生成契约中的标识、工作流类型、活动类型和任务队列完全匹配的 Worker 注册，再启动工作流。成功要求获得预期的完成结果和历史；随后终端输出精确的本地 Waterline 运行链接和结构化 JSON 证据路径。

这个有意保持简小、先关注传输的脚手架使用 `serde_json::Value`；它不是唯一推荐的 Rust 应用契约。继续查看 crate 现有的[类型化输入/输出示例](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs)、[重试、超时、心跳和终态失败活动策略示例](https://github.com/durable-workflow/sdk-rust/blob/main/examples/activity_options.rs)，以及[本地活动示例](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs)。对于不想使用 Sample App 的用户，下方包、仓库示例及生成的 API 参考仍是直接路径。

## 包与源码 {#package-and-source}

- [crates.io 上的 crate](https://crates.io/crates/durable-workflow)
- [源码仓库](https://github.com/durable-workflow/sdk-rust)

从最近一次通过资格验证的制品组合安装 Rust SDK。精确依赖约束由与 Server 快速入门相同的机器可读权威数据生成：

<!-- docs-example id="rust.sdk.install" -->
```bash
%%artifact.rustCargoAddCommand%%
```

或在 `Cargo.toml` 中直接声明相同的已验证依赖约束：

```toml
[dependencies]
%%artifact.rustCargoRequirement%%
```

crate 要求 Rust 1.86 或更新版本。包元数据记录用于验证该 SDK 发布的 Server 版本，以及 Worker 协议默认版本和最低版本、控制平面版本 2。与更新 Server 的兼容性单独验证。部署期间，请使用 `GET /api/cluster/info` 公布的协议清单及能力。

Server 在主版本 `1` 内协商 Worker 协议头：公布 `1.N` 的 Server 仅在 `M <= N` 时接受 Worker 头 `1.M`。Rust SDK 3.5.0 默认使用 `X-Durable-Workflow-Protocol-Version: 1.20`，要求 Server 公布 `1.20` 或更新版本。对于较旧但兼容的 Server，可通过客户端构建器的 `worker_protocol_version` 设置选择 `WorkerProtocolVersion::V119`。SDK 3.4.x 默认使用 `1.19`。可选启用的协作式取消配置要求 `1.20`，并拒绝显式选择 `1.19`。

协商默认拒绝不合规请求。缺失或格式错误的头、不同主版本，或高于 Server 公布次版本的 Worker 次版本都会被拒绝。SDK 和 Server 发布版本独立跟踪，由运行时协议清单决定兼容性。

## 本地活动 {#local-activities}

Rust SDK 3.1.0 在配置了 `Worker::local_activities(true)` 的 Worker 上增加内联本地执行。使用普通活动注册方法注册回调，然后使用工作流上下文的本地活动方法。重试和超时配置见[可运行示例](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs)及 [LocalActivityOptions 参考](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html)。

Server 记录终态结果以供冷重放。Worker 丢失后，未提交的本地副作用可能再次执行，必须具有幂等性。异步回调必须让出执行权给 Tokio。阻塞工作需要独立进程监督。内联本地执行和已准备的协作式本地监督使用独立 Worker 配置。

## Worker 会话 {#worker-sessions}

启用 `Worker::worker_sessions(true)`，并用 `capabilities(...)` 声明 Worker 满足的要求。使用 `in_worker_session(WorkerSessionOptions::new(session_id))` 路由远程活动。活动上下文通过 `worker_session()` 提供共享句柄。Worker 注册后，显式句柄支持 `create()`、`renew()` 和 `close(reason)`。

使用 `max_concurrent_worker_sessions(...)` 限制 Worker 会话数，用 `max_concurrent_activities(...)` 限制会话活动并发数。显式续租空闲句柄。活动心跳也会续租持有者租约，同时保留原始绝对 TTL。异步回调让出执行权给 Tokio 后，如果本地观察到租约或 TTL 到期，就会被丢弃，无需依赖应用心跳。

会话资源存在于持有者进程中。替代进程必须重建它们，中断的外部副作用需要幂等性和尝试隔离。已提交结果重放时不重新运行回调。优雅关闭会先关闭持有的会话，再注销。本地活动不能使用会话路由。

会话支持始于 Rust SDK 3.2.0。请使用 Server 2.5.1 或更新版本。[可运行示例](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs) 在两个类型化活动之间复用进程内缓存，并输出其代次。配置和生命周期方法见 [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html) 和 [WorkerSession](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSession.html)。

## 有界粘性执行 {#bounded-sticky-execution}

启用 `Worker::sticky_cache(StickyCacheOptions::new(capacity))`，保留不可变的编码历史以供后续重放。缓存默认禁用。设置 `max_history_bytes(...)` 和 `ttl(...)` 限制保留历史及生命周期。为解码和重放预留额外内存。

缓存使用工作流、运行和构建标识。Worker 替换、过期、驱逐或无效历史游标都会回退到完整持久历史。终态工作流和停止的 Worker 丢弃其缓存条目。工作流代码必须能在空缓存下正确重放。

支持始于 Rust SDK 3.4.0 及已通过资格验证的 Server 基线。参见[配置参考](https://rust.durable-workflow.com/durable_workflow/struct.StickyCacheOptions.html)、[可运行示例](https://github.com/durable-workflow/sdk-rust/blob/3.4.0/examples/sticky_execution.rs)和[可移植 Worker 亲和性指南](./portable-worker-affinity.md)。

## 准备已发布的仓库示例 {#prepare-the-released-repository-example}

仓库的 [`hello_world` 示例](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs) 注册 Rust Worker、启动工作流、发送信号、运行活动、报告活动心跳，并等待完成结果。由于示例在一个进程中运行应用客户端和 Worker，下方无需账号的路径将其连接到自托管 Server。已配置 Cloud 命名空间是可选的第二运行时，使用独立的角色限定凭据。

为获得可重复的源码练习，请获取已验证组合记录的精确 crate 源码。下方值由该机器可读权威数据生成。示例目录是绝对路径，因此任一连接路径都能直接进入：

<!-- docs-example id="rust.sdk.repository-source" -->
```bash
export DURABLE_WORKFLOW_RUST_VERSION=%%artifact.rustSdkVersion%%
export DURABLE_WORKFLOW_RUST_EXAMPLE_DIR="$PWD/durable-workflow-rust-${DURABLE_WORKFLOW_RUST_VERSION}"
git clone --depth 1 --single-branch --branch "$DURABLE_WORKFLOW_RUST_VERSION" \
  https://github.com/durable-workflow/sdk-rust.git "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
```

## 使用自托管 Server 运行组合示例 {#run-the-combined-example-with-self-hosted-server}

未经修改的 `hello_world` 示例接受一个令牌，用于连接认证策略允许同一凭据发送工作流命令和轮询工作的自托管 Durable Workflow Server：

<!-- docs-example id="rust.sdk.self-hosted" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080 \
DURABLE_WORKFLOW_TOKEN=dev-token \
cargo run --example hello_world
```

示例使用本地 Server 快速入门配置的 `default` 命名空间。用 `TASK_QUEUE` 覆盖默认的 `rust-workers` 任务队列。此路径不涉及 Cloud 注册或 Cloud 凭据。

## 可选第二路径：连接 Durable Workflow Cloud {#optional-secondary-path-connect-to-durable-workflow-cloud}

若要以最短路径验证托管运行时，请使用 [Rust Cloud 快速入门](./rust-cloud-quickstart.md)。它运行 PHP 和 Python 同样可用的对称 Sample App 试验环境，动态选择当前稳定制品，验证精确 Worker 就绪状态，并等待完成结果。

<ProductPromotion source="docs-v2-rust-sdk">
已加入 Cloud？使用独立的角色限定运行时凭据，对已配置命名空间运行共享 Rust 试验环境。
</ProductPromotion>

调整现有 Rust 进程时，下方较底层的组合 SDK 示例很有用。导出 Cloud 配置命名空间及创建两个运行时凭据时返回的值：

托管连接边界见 [Cloud 托管运行时](/docs/polyglot/cloud-control-plane)。

<!-- docs-example id="rust.sdk.cloud.environment" -->
```bash
export DURABLE_WORKFLOW_RUNTIME_URL='https://your-runtime-url'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='orders'
export DURABLE_WORKFLOW_CLIENT_TOKEN='dwr_client_credential'
export DURABLE_WORKFLOW_WORKER_TOKEN='dwr_worker_credential'
```

在 `$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR/examples/hello_world.rs` 中，用以下拆分令牌的构建器配置替换现有 `server_url`、`token` 和 `Client::builder(...)` 设置：

<!-- docs-example id="rust.sdk.cloud.client" -->
```rust
let runtime_url = std::env::var("DURABLE_WORKFLOW_RUNTIME_URL")
    .expect("DURABLE_WORKFLOW_RUNTIME_URL must be set");
let runtime_namespace = std::env::var("DURABLE_WORKFLOW_RUNTIME_NAMESPACE")
    .expect("DURABLE_WORKFLOW_RUNTIME_NAMESPACE must be set");
let client_token = std::env::var("DURABLE_WORKFLOW_CLIENT_TOKEN")
    .expect("DURABLE_WORKFLOW_CLIENT_TOKEN must be set");
let worker_token = std::env::var("DURABLE_WORKFLOW_WORKER_TOKEN")
    .expect("DURABLE_WORKFLOW_WORKER_TOKEN must be set");

let client = Client::builder(runtime_url)
    .namespace(runtime_namespace)
    .control_token(Some(client_token))
    .worker_token(Some(worker_token))
    .build()?;
```

然后正常运行示例：

<!-- docs-example id="rust.sdk.cloud.run" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
cargo run --example hello_world
```

示例的工作流启动、信号、描述和结果调用使用 `control_token`；`Worker` 的注册、轮询、心跳及完成调用使用 `worker_token`。两个角色使用 Cloud 提供的相同运行时 URL、运行时命名空间和任务队列，但不复用凭据。不要将任一 Cloud 凭据替换成 `.token(...)`：此方法是上方自托管配置使用的通用单令牌回退。

## 使用 Server 强制执行的工作流超时启动 {#start-with-server-enforced-workflow-timeouts}

Rust SDK 提供 `WorkflowStartOptions` 和 `Client::start_workflow_with_options`，用于设置即使启动进程退出后也由 Server 强制执行的工作流截止时间。执行超时覆盖整个工作流实例，包括继续为新运行；运行超时只覆盖单次运行，并在新运行开始时重新计算。

<!-- docs-example id="rust.workflow-start-timeouts" -->
```rust
use durable_workflow::{json, Client, Result, WorkflowStartOptions};

async fn start(client: &Client) -> Result<()> {
    let handle = client.start_workflow_with_options(
        "orders.await-payment",
        "orders",
        "order-42",
        WorkflowStartOptions::new()
            .execution_timeout_seconds(300)
            .run_timeout_seconds(30),
        json!([{"order_id": "order-42"}]),
    ).await?;

    println!("workflow={} run={:?}", handle.workflow_id, handle.run_id);
    Ok(())
}
```

两个值均以秒为单位，必须为正数，且运行超时不能超过执行超时。现有 `Client::start_workflow` 便捷方法使用 `WorkflowStartOptions::default()`：执行超时 3600 秒，运行超时 600 秒。Server 的截止时间及继续为新运行语义见[超时](/docs/features/timeouts)。

这些是工作流策略，不是 HTTP 或结果轮询超时。尤其是 `WorkflowResultOptions::timeout` 仅停止本地 `result()` 调用等待。它不会关闭、取消或以其他方式更改工作流运行。调用方可以检查返回标识并再次等待。通过 `WorkflowStartOptions` 配置的执行或运行截止时间是持久 Server 状态；到期时，Server 以终态 `timed_out` 结果关闭运行。

## 确定性并行组 {#deterministic-parallel-groups}

`WorkflowContext::parallel` 及其 `join` 别名组合活动、子工作流、定时器、混合组和嵌套组，不增加新的 Server 命令。`ParallelOperation` 的构造函数延迟每个叶子操作，直到知道完整树结构：

```rust
use durable_workflow::{json, ChildWorkflowOptions, ParallelOperation};
use std::time::Duration;

let results = ctx.parallel(vec![
    ParallelOperation::activity("load-profile", json!(["customer-42"])),
    ParallelOperation::group(vec![
        ParallelOperation::child_workflow(
            "quote-shipping",
            ChildWorkflowOptions::new("shipping-workers"),
            json!(["customer-42"]),
        ),
        ParallelOperation::timer(Duration::from_secs(1)),
    ]),
]).await?;
```

每个叶子都携带共享的稳定组标识及完整的从外到内路径。成功结果保留嵌套输入结构和顺序。`Error::ParallelFailed` 保留类型化叶子原因、确定性成员路径、组路径及已完成同级成员。待处理及已完成历史重放时不会重新调度；完全重复和迟到完成不会改变选定的位置结果。

## 持久首次完成选择 {#durable-first-completion-selection}

`WorkflowContext::select` 和 `select_keyed` 一起启动活动、子工作流、定时器、信号、条件等待及嵌套普通组，然后从运行时记录的胜出项处恢复：

```rust
use durable_workflow::{json, ParallelOperation, SelectionKey};
use std::time::Duration;

let selected = ctx.select_keyed(vec![
    ("resolver", ParallelOperation::activity("resolve-request", json!([request_id]))),
    ("input", ParallelOperation::signal("resolution.received")),
    ("deadline", ParallelOperation::timer(Duration::from_secs(2))),
]).await?;

if selected.key == SelectionKey::Name("deadline".to_string()) {
    if let Some(resolver) = selected.handle(&SelectionKey::Name("resolver".to_string())) {
        resolver.cancel().await?;
    }
}
```

`SelectionResult` 保留稳定键/索引、操作种类和标识、类型化值或失败，以及每个成员的 `DurableOperationHandle`。未胜出操作继续运行，除非工作流代码随后等待 `handle.await_result()` 或等待 `handle.cancel()`。取消 future 解析为 unit；只有已提交的 `SelectionOperationCancelled` 历史证明取消胜出。重放会越过未有对应记录的请求；先提交完成时，`await_result()` 仍返回该完成结果。重启和重放消费持久化的胜出项；后续或重复终态事件不能更改它。

## Saga 补偿 {#saga-compensation}

仅在相应正向活动完成后注册补偿，再将正向结果传给 `Saga::finish`：

```rust
let mut saga = ctx.saga();
let outcome = async {
    let flight = ctx.activity("trip.reserve-flight", json!([])).await?;
    saga.add_compensation("trip.cancel-flight", json!([flight]))?;

    let hotel = ctx.activity("trip.reserve-hotel", json!([])).await?;
    saga.add_compensation("trip.cancel-hotel", json!([hotel]))?;

    ctx.activity("trip.charge", json!([])).await?;
    Ok(json!({"status": "booked"}))
}.await;

saga.finish(outcome).await
```

已处理的失败使用现有活动命令，按注册顺序逆序执行，每次一个补偿。补偿在首次失败时停止。`Error::SagaCompensationFailed` 在重启和重放期间保留两个类型化错误、补偿活动类型及其注册顺序。终态 `cancel_workflow` 不会恢复工作流代码执行补偿。

## 确定性副作用与版本标记 {#deterministic-side-effects-and-version-markers}

Rust SDK 使用 `WorkflowContext::side_effect` 记录小型非确定性值，并使用 `WorkflowContext::uuid_v4` 派生确定性 UUIDv4 值。冷重放解码已记录值，不再次调用回调；标记顺序变化、缺失、重复或编解码器不兼容时返回类型化 `Error::NonDeterministicReplay`。

使用 `WorkflowContext::get_version(change_id, min_supported, max_supported)`，在发布期间保持新旧工作流分支重放兼容。新运行记录 `max_supported`；现有运行复用持久标记。`patched(change_id)` 提供布尔形式的发布控制；旧分支排空后，`deprecate_patch(change_id)` 保留标记。共享持久语义见[副作用](/docs/features/side-effects/)和[版本管理](/docs/features/versioning/)。

## 取消、终止及处理终态结果 {#cancel-terminate-and-handle-terminal-outcomes}

服务模式的 `cancel_workflow` 和 `terminate_workflow` 都立即关闭运行。两者记录不同终态结果，但都不会要求工作流代码执行清理。需要有时限的工作流清理时，请配合协作 Worker 使用 `request_cancellation()`。操作策略、监督和恢复见[协作式取消指南](/docs/polyglot/cancellation)。

```rust
use durable_workflow::{Client, WorkflowCommandOptions};

# async fn cancel(client: &Client) -> durable_workflow::Result<()> {
client.cancel_workflow(
    "order-42",
    WorkflowCommandOptions::new()
        .reason("customer withdrew the order")
        .request_id("cancel-order-42"),
).await?;
# Ok(())
# }
```

面向实例的 `cancel_workflow` 和 `terminate_workflow` 在 Server 上解析当前运行。为保障选定运行安全，请调用 `cancel_workflow_run` 或 `terminate_workflow_run`，或使用句柄的 `cancel_selected_run` 和 `terminate_selected_run` 方法。如果选定运行已过时，`Error::WorkflowCommandRejected` 提供稳定的 `historical_run_command_rejected` 原因，以及工作流 ID、运行 ID、目标作用域、HTTP 状态和响应体。

成功的 `WorkflowHandle::result` 调用仍返回解码后的 JSON 值。其他所有结果都应匹配类型化终态变体。根据稳定的原因和类别字段分支处理，不依赖显示文本：

<!-- docs-example id="rust.typed-workflow-timeouts" -->
```rust
use durable_workflow::{Error, WorkflowHandle, WorkflowResultOptions};

# async fn wait(handle: WorkflowHandle) -> durable_workflow::Result<()> {
match handle.result(WorkflowResultOptions::default()).await {
    Ok(value) => println!("completed: {value}"),
    Err(Error::WorkflowCancelled(outcome)) => {
        println!("cancelled {:?}: {}", outcome.run_id, outcome.reason);
    }
    Err(Error::WorkflowTerminated(outcome)) => {
        println!("terminated: {}", outcome.reason);
    }
    Err(Error::WorkflowFailed(outcome)) => {
        println!("failure {:?}: {:?}", outcome.failure_id, outcome.exception_class);
    }
    Err(Error::WorkflowTimedOut(outcome)) => match (
        outcome.reason.as_str(),
        outcome.failure_category.as_deref(),
    ) {
        ("result_wait_timeout", Some("client_timeout")) => {
            println!(
                "caller deadline for {} / {:?}; the run may still be open",
                outcome.workflow_id, outcome.run_id,
            );
        }
        ("execution_timeout" | "run_timeout", category) => {
            println!(
                "server timeout for {} / {:?}: reason={} category={:?}",
                outcome.workflow_id, outcome.run_id, outcome.reason, category,
            );
        }
        (reason, category) => {
            println!("other typed timeout: reason={reason} category={category:?}");
        }
    }
    Err(error) => return Err(error),
}
# Ok(())
# }
```

每个终态结果都携带工作流和运行标识。如果 Server 提供，还保留公开原因、失败类别和标识、异常类型和类、不可重试状态、消息及异常负载。本地等待截止时间的原因为 `result_wait_timeout`，类别为 `client_timeout`；Server 超时是终态 `timed_out` 运行，其稳定原因为 `execution_timeout` 或 `run_timeout`。

任一启动方法返回的句柄都会保留选定的 `run_id`。`WorkflowHandle::result` 描述该运行专属路由，因此即使复用相同工作流 ID 创建更新运行，等待也不会悄悄报告新运行结果。在日志、指标及重试记录中同时保留 `outcome.workflow_id` 和 `outcome.run_id`；只有明确需要跟随当前运行时，才使用实例级查询。

## 工作流更新 {#workflow-updates}

Rust 在应用客户端、选定句柄及 Worker 编写角色中均支持持久更新。JSON 兼容值使用 `Client::update_workflow` 或 `WorkflowHandle::update`，显式类型化 Avro 值使用对应的 `update_workflow_avro_value` 或 `update_avro_value` 方法。

Worker 用 `Worker::register_update` 注册具名处理器；处理器直接消费和返回 Avro 值时，使用 `register_update_avro_value`。更新是持久的、带结果的工作流变更，区别于发送后无需等待的信号和只读的经重放查询。

## 负载封装 {#payload-envelope}

工作流输入、信号、活动、查询及结果使用已发布的 `PayloadEnvelope` 契约：`codec` 加编码后的 `blob`。SDK 默认的 `avro` 路径使用其声明的 `apache-avro` 依赖及平台固定的带版本 Value 模式；不要手工拼装 blob，也不要用实现专有记录替换封装。

<!-- docs-example id="rust.avro-payload-envelope" -->
```rust
use durable_workflow::{decode_payload, json, PayloadEnvelope, Result, Value};

fn round_trip() -> Result<()> {
    let envelope = PayloadEnvelope::avro(&json!({"order_id": "order-42"}))?;
    assert_eq!(envelope.codec, "avro");

    let decoded: Value = decode_payload(&envelope)?;
    assert_eq!(decoded["order_id"], "order-42");
    Ok(())
}
```

`start_workflow` 和 `start_workflow_with_options` 自动将此封装应用到其可序列化输入。仅在程序需要直接交换封装时使用公开辅助函数。

长时间运行的活动应发送心跳并检查 `should_stop()`。取消时，释放临时文件、连接或其他进程内资源，并及时返回。迟到完成会被持久状态拒绝，不能把已取消或已终止运行变为成功；受管理的 Worker 在该明确拒绝后及重启后继续轮询。

Server 镜像、认证及生产拓扑请继续查看 [Server 设置指南](/docs/polyglot/server)。
