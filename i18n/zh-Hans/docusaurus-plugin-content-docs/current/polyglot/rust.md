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

## 工作流列表与完整运行历史 {#workflow-lists-and-history}

这些 API 要求 Rust SDK **4.6.0 或更新版本**；请检查 `Cargo.lock`，因为上面的独立安装组合可能选择更旧的 crate。[普通安装包验收](https://github.com/durable-workflow/sdk-rust/issues/122#issuecomment-6363352910)已用发布的 Server 2.11.0 验证三页列表、六页历史、128 KiB payload、导出/replay 和只读示例。离线测试辅助 API 要求 4.5.0；这里的列表/历史方法和迭代器要求 4.6.0。这不改变所选 Server/SDK 组合。

`Client::list_workflows(WorkflowListOptions)` 与 `Client::get_workflow_history(workflow_id, run_id, WorkflowHistoryOptions)` 每次返回**一页**。可用不透明的 `next_page_token` 手动继续，也可用惰性迭代器完整读取。这些方法保留 Server 的验证、筛选和 namespace 范围，不增加查询字段或语法。例如，通过已注册的 keyword 属性寻找未结束的运行：

```rust
use durable_workflow::WorkflowListOptions;
async fn find(client: durable_workflow::Client) -> durable_workflow::Result<()> {
let mut matches = client.iter_workflows(
    WorkflowListOptions::new()
        .workflow_type("payments")
        .status("running")
        .query("OrderRef = 'order-42'")
        .page_size(2),
);
match (matches.next().await?, matches.next().await?) {
    (Some(run), None) => println!("open run: {} / {}", run.workflow_id, run.run_id),
    (None, _) => println!("no open run"),
    _ => println!("multiple open runs; refine the query"),
}
Ok(())
}
```

Server 的 `status=running` 筛选选择活跃的 **status bucket**，包含原始状态为 `pending` 或 `waiting` 的运行。`WorkflowSummary` 保留 `status`、`status_bucket`、`is_terminal`、搜索属性及 `raw` 中的未知元数据。搜索属性不保证唯一：筛选可能同时返回父运行及继承该值的子运行。请像上例一样处理零个、一个和多个匹配。先用目标 namespace 创建客户端，再构造迭代器；各 token 之间保留相同 namespace 和筛选条件。

无需一次加载所有页面即可读取选定运行的完整历史：

```rust
use durable_workflow::WorkflowHistoryOptions;
async fn audit(client: durable_workflow::Client) -> durable_workflow::Result<()> {
let mut events = client.iter_workflow_history(
    "payment-42", "selected-run-id", WorkflowHistoryOptions::new().page_size(100),
);
while let Some(event) = events.next().await? {
    println!("{}", event.event_type);
}
Ok(())
}
```

`iter_workflows(options)` 通过 `next().await` 逐项提供 `WorkflowSummary`。两个迭代器都支持用于 `futures_util::TryStreamExt` 的 `into_stream()`；轮询前需固定返回的 stream。构造时不执行 I/O，当前页耗尽后才请求下一页。null/空 token 表示结束；带 token 的空页会继续。重复或循环 token 返回 `Error::Pagination`，token 状态有界。页面失败保留原始类型化错误，随后该迭代器结束。必须处理错误，不能把部分读取当成完整结果。收集 stream 仍会存储所有收集到的项目。

历史迭代固定原始 workflow/run 身份，枚举可用事件，不追随 continue-as-new，也不无限订阅。事件元数据和 payload 线协议封装保持不变。离线 replay 请用 `Client::export_workflow_history` 与 `testing::WorkflowHistory::from_export`，不要传入部分历史页。参见[离线 replay](#rust-replay-export)。

发布的 Server 2.11 默认每页 50 条列表记录（最多 200）和 100 条历史事件（最多 1,000）。页大小原样传给 Server 验证。结果足够时提前停止，选择适当页大小并设置应用超时。运行并发变化时，分页不增加快照隔离。参见[发布的只读示例](https://github.com/durable-workflow/sdk-rust/blob/4.6.0/examples/workflow_pagination.rs)、[Client API](https://rust.durable-workflow.com/durable_workflow/struct.Client.html) 和[分页类型](https://rust.durable-workflow.com/durable_workflow/pagination/index.html)。

## 指标与 Prometheus 导出 {#rust-sdk-metrics}

这些 API 要求 Rust SDK **4.7.0 或更新版本**。请检查 `Cargo.lock`：上方独立安装组合可能选择旧 crate。[普通安装验收](https://github.com/durable-workflow/sdk-rust/pull/131#issuecomment-6364178456)已验证四项 HTTP 控制、真实 worker 与发布的 Server 2.11.0 产生的全部六项指标，以及导出示例。此最低版本不改变所选组合。

默认 recorder 是 **no-op**。提供实现 `increment(name, count, tags)` 和 `record(name, seconds, tags)` 的 `Arc<dyn metrics::MetricsRecorder>`。客户端、其克隆以及新建 worker 继承该 recorder。`Worker::metrics_recorder` 覆盖 worker 的 poll/task 观测，客户端请求仍使用客户端 recorder。回调必须快速，并在本地处理 exporter 故障。采用 unwinding 的 recorder panic 与 SDK 结果隔离；此 hook 无法修复阻塞 exporter 或进程中止。

每次观测客户端请求、worker poll 或已领取任务的处理时，计数器加一，并记录一次以秒为单位、非负的单调时长。六个稳定名称如下：

| 计数器 | 时长直方图 |
| --- | --- |
| `durable_workflow_client_requests` | `durable_workflow_client_request_duration_seconds` |
| `durable_workflow_worker_polls` | `durable_workflow_worker_poll_duration_seconds` |
| `durable_workflow_worker_tasks` | `durable_workflow_worker_task_duration_seconds` |

客户端标签键恰为 `method`、`route`、`plane`、`status_code`、`outcome`；worker 键为 `task_kind`、`task_queue`、`outcome`。经审查的路由占位符不含 ID、查询串、payload 或凭据；未知路径使用 `unknown`。队列名由应用控制，应使用有限集合，不要为每次运行创建队列名。

客户端结果包括 `ok`、`http_error`、`bridge_rejected`、`TransportError`、`TimeoutError`、`SdkError`，取消的 future 使用 `pending`。`status_code` 保留观测到的十进制 HTTP 状态，否则为 `none`。Rust 异常结果名称不必与其他 SDK 相同。

一次客户端观测包含内部传输/storage admission 重试及响应/payload 处理；应用或 worker 管理的独立调用分别计量。惰性迭代器按所请求的每页观测。worker poll 包含管理的 retry/backoff，区分 `task`、`empty`、`backpressure`、`error`。任务结果 `completed`、`failed`、`expired` 描述任务处理，不表示工作流终态。这是进程观测，不是持久计数、计费单位或 schedule-to-start 延迟；进程突然丢失可能遗漏最终样本。

使用官方 Prometheus 适配器时，启用可选 Cargo feature `metrics-prometheus`。示例采用已发布的依赖配置：

```toml
[dependencies]
durable-workflow = { version = "=4.7.0", features = ["metrics-prometheus"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

将[已发布示例](https://github.com/durable-workflow/sdk-rust/blob/4.7.0/examples/metrics_prometheus.rs)保存为 `examples/metrics_prometheus.rs`。这些完全相同的源码字节已通过普通安装编译和运行验收；示例打印健康请求的指标：

```rust
//! Preview application-owned Prometheus export; serve `encode()` from your HTTP metrics route.
use durable_workflow::{metrics::PrometheusMetrics, Client};
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let recorder = Arc::new(PrometheusMetrics::new()?);
    let client = Client::builder(std::env::var("DURABLE_WORKFLOW_SERVER_URL")?)
        .token(std::env::var("DURABLE_WORKFLOW_AUTH_TOKEN").ok())
        .metrics_recorder(recorder.clone())
        .build()?;
    client.health().await?;
    // Workers inherit this client recorder; Worker::metrics_recorder overrides
    // only worker poll/task observations. Applications own the scrape endpoint.
    print!("{}", String::from_utf8(recorder.encode()?)?);
    Ok(())
}
```

针对自托管 Server 运行：

```bash
DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080 \
DURABLE_WORKFLOW_AUTH_TOKEN=your-token \
cargo run --features metrics-prometheus --example metrics_prometheus
```

`PrometheusMetrics::new()` 拥有基于官方 Prometheus Rust client 0.14 的专用 registry。由应用的指标路由返回 `encode()` 字节，设置 `Content-Type: text/plain; version=0.0.4`。适配器不创建监听器或全局 registry。应用负责 scrape 访问/认证、网络暴露、资源和关闭。计数器导出附加 `_total`，直方图使用标准 bucket/sum/count 序列。`registry()` 支持应用自行采集及添加指标。

使用 OpenTelemetry 指标时，通过现有 meter 实现 recorder：计数器单位为 `1`，直方图单位为秒 `s`，名称和标签严格使用上述值。provider、聚合、资源标签及 exporter 生命周期由应用负责。它与执行 tracing 独立。参见 [recorder API](https://rust.durable-workflow.com/durable_workflow/metrics/trait.MetricsRecorder.html)、[Prometheus API](https://rust.durable-workflow.com/durable_workflow/metrics/struct.PrometheusMetrics.html) 和[发布的指标契约](https://github.com/durable-workflow/sdk-rust/blob/4.7.0/README.md#client-and-worker-metrics)。

## Worker 任务并发 {#worker-task-concurrency}

以下有界执行通道需要 Rust SDK **4.3.1 或更高版本**。使用前检查 `Cargo.lock` 中的版本：上方的安装固定版本属于另一组已验证构件，可能选择较旧的 SDK。[已发布包验收](https://github.com/durable-workflow/sdk-rust/issues/107#issuecomment-6360719863)验证了三个配置槽位、释放槽位后第四次回调才被接纳，以及七个完成的工作流，其中包括已处理的活动失败。前述 Server 协议要求仍然适用。

`Worker::max_concurrent_workflow_tasks(...)` 和 `Worker::max_concurrent_activity_tasks(...)` 的默认值各为 **10**。`run()` 和 `run_until()` 为工作流与远程活动使用独立的有界通道。设为 **1** 可使该类任务串行执行。例如，在注册应用处理函数前配置现有客户端：

```rust
use durable_workflow::Worker;

let mut worker = Worker::new(client.clone(), "payments")
    .max_concurrent_workflow_tasks(1)
    .max_concurrent_activity_tasks(1);
```

注册工作流和活动处理函数后，照常启动 `run()` 或 `run_until()`。两个限制都设为一时，仍允许一个工作流任务与一个远程活动任务同时执行。查询保留独立轮询通道。Worker 克隆共享配置容量，包括同时调用 `run_once()`；克隆不会创建另一份独立配额。

心跳报告的可用容量以实际已领取任务为准，包括输入/历史加载、回调执行和结果确认。空长轮询保留可用容量。成功、失败、拒绝和取消都会释放本地槽位。内联本地活动占用其**工作流任务**槽位，不经过远程活动池，因此活动限制不会单独约束跨工作流的内联执行。

处理函数作为 Tokio async future 执行，必须让出执行权。阻塞工作应使用 `tokio::task::spawn_blocking` 或独立进程，并设置明确的取消和关闭边界。提高并发不会隔离 CPU，也不会使脱离管理的线程可取消。参见已安装 SDK 的 [Worker API](https://rust.durable-workflow.com/durable_workflow/struct.Worker.html)。

## 活动收到的重试预算 {#activity-retry-info}

Rust SDK **4.8.0 或更新版本**在服务模式活动处理函数中提供 `ActivityContext::retry_info()`。请检查 `Cargo.lock` 中实际安装的 crate：上方独立选择的安装版本可能更旧。返回的 `ActivityRetryInfo` 保留原始 `attempt_number()` 和收到的 `policy()` JSON，包括未知字段。这是本次调用的不可变快照，不受上下文中可变兼容字段影响。

使用 `attempt_limit()` 和 `is_last_configured_attempt()` 解释收到的预算：

| 收到的重试策略 | `ActivityAttemptLimit` | 配置的最后一次尝试 |
| --- | --- | --- |
| 含正整数 `max_attempts: n` 的对象 | `Bounded(n)`，包括首次尝试 | 原始尝试编号达到或超过 `n` 时为 `Some(true)`，否则为 `Some(false)` |
| 含 `max_attempts: null` 的对象 | `Unlimited` | `Some(false)` |
| 策略省略、根 null、字段缺失或无效上限 | `Unknown` | `None` |

对于无效的零尝试编号，辅助方法也返回 `None`。运行时的调度默认值不能证明收到的元数据：已发布 Server 2.11.0 的未编写策略对照会省略快照，因此报告 `Unknown`，而非推断为 `Bounded(1)`。`policy()` 区分策略省略与收到 JSON null，但不会将任一情况视为无限重试。 [正常安装验收](https://github.com/durable-workflow/sdk-rust/issues/135#issuecomment-6366200791)包含此对照和下方示例。

若要在配置的最后一次尝试中选择回退或记录应用告警，请在现有 Worker 上注册处理函数：

```rust
use durable_workflow::{json, Worker};

pub fn register_charge(worker: &mut Worker) {
    worker.register_activity("charge", |ctx, _| async move {
        let retry = ctx.retry_info();
        if retry.is_last_configured_attempt() == Some(true) {
            // Select a final-attempt fallback or record an application alert.
        }
        Ok(json!({"attempt": retry.attempt_number()}))
    });
}
```

`Some(false)` 不保证还有下一次执行。不可重试失败、取消、工作流关闭或期限耗尽都可能在用完配置预算前结束工作。该辅助方法不会改变重试准入，也不会额外延长期限。

本地活动和直接调用 `testing::WorkflowEnvironment::run_activity` 没有收到的 Server 快照，会报告未知策略。新的 `run_workflow` 测试公开其生成历史中记录的模型快照。这些测试语义不能证明已部署 Server 会发送策略。参见 [ActivityRetryInfo](https://rust.durable-workflow.com/durable_workflow/struct.ActivityRetryInfo.html) 和 [ActivityAttemptLimit](https://rust.durable-workflow.com/durable_workflow/enum.ActivityAttemptLimit.html)。

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

## Rust 确定性规则 {#rust-determinism-rules}

对于已记录的输入和历史，重放必须按相同顺序生成相同的持久命令。Rust 常规集合、时钟和并发原语不会自动保持这一约定：

| 工作流代码中的模式 | 持久替代方式 |
| --- | --- |
| 遍历 `HashMap` 时调度 | 先对键排序，或使用 `BTreeMap`。 |
| 读取系统时钟、`thread_rng` 或新 UUID | 用 `ctx.side_effect(...)` 记录快照，或使用活动。 |
| `tokio::time::sleep` 或 `std::thread::sleep` | `ctx.sleep(...)` 或 `ctx.start_timer(...)`。 |
| `tokio::select!` 或普通 future 竞争 | `ctx.select(...)` 或 `ctx.select_keyed(...)`。 |
| 未跟踪的并发持久调用 | 使用输入顺序稳定的 `ctx.parallel(...)`。 |
| 网络、文件系统或可变外部 I/O | 已注册的活动。 |
| 部署时更改既有命令顺序 | 使用稳定的 `ctx.get_version(...)` 分支，并用记录的历史测试。 |

活动的外部副作用仍需幂等；确定性不会让重复付款或文件写入变得安全。参见[幂等与确定性](../constraints/idempotent-vs-deterministic.md)。

## 离线测试与重放 {#offline-testing-and-replay}

这些 API 需要 Rust SDK **4.5.0 或更新版本**。请检查 `Cargo.lock`：上方独立的安装组合可能选择没有这些 API 的旧 crate。[4.5.0 常规安装验证](https://github.com/durable-workflow/sdk-rust/issues/105#issuecomment-6362112580)确认了十二项无需 Server 的检查、本编译示例和真实 Server 2.11.0 的导出/重放。它不会提升当前选择的 Server/SDK 组合。

### 活动与工作流单元测试 {#rust-activity-workflow-tests}

`testing::WorkflowEnvironment` 在当前进程执行已注册的工作流和活动。通过 `from_worker(worker)` 复用应用注册，或直接注册回调；`worker_mut()` 提供常规类型化注册 API。Mock 必须显式指定：真实活动回调会执行自己的代码，因此应主动替换外部副作用。

已验证方案使用 `durable-workflow = "=4.5.0"`、启用 `macros`、`rt-multi-thread` 和 `time` 的 Tokio，以及供下方导出辅助函数使用的 `serde_json = "1"`。把发布示例保存为 `examples/workflow_testing.rs`，执行 `cargo run --example workflow_testing`：

```rust
//! Run with `cargo run --example workflow_testing`; no Server is required.
use durable_workflow::{
    json,
    testing::{WorkflowEnvironment, WorkflowHistory},
    Result,
};

#[tokio::main]
async fn main() -> Result<()> {
    let mut env = WorkflowEnvironment::new()?;
    env.register_activity("greet", |_, args| async move {
        Ok(json!(format!(
            "Hello, {}!",
            args[0].as_str().unwrap_or("friend")
        )))
    });
    env.register_workflow("hello", |ctx, args| async move {
        ctx.activity("greet", args).await
    });

    // An activity unit test executes the real callback and argument adapters.
    assert_eq!(
        env.run_activity("greet", "Ada").await?,
        json!("Hello, Ada!")
    );
    // A workflow unit test may replace activity callbacks explicitly.
    env.mock_activity("greet", |_, args| async move {
        Ok(json!({"greeting_for":args[0]}))
    });
    assert_eq!(
        env.run_workflow("hello", "Ada").await?,
        json!({"greeting_for":"Ada"})
    );

    // Replay executes the same registered workflow without running activities.
    // In a deployment test, read the JSON produced by dw workflow:history-export
    // or Client::export_workflow_history instead of this captured test history.
    let history = WorkflowHistory::from_export(env.last_history().unwrap().export())?;
    assert!(env.replay(&history)?.completed);
    println!("activity, workflow and offline replay passed");
    Ok(())
}
```

直接调用 `run_activity` 执行一次尝试。在 `run_workflow` 内，已记录的重试策略会在终态失败交给工作流代码之前应用。真实或模拟的远程/本地活动失败使用类型化的 `Error::ActivityFailed`，包含异常类型、尝试编号和不可重试标记；未捕获的工作流错误保留原始 Rust 变体。心跳在本地收集。若 JSON 无法保留原始 Avro 值，应使用 `*_avro_value` 变体。

### 重放导出的运行 {#rust-replay-export}

注册候选工作流，再加载 `dw workflow:history-export` 或 `Client::export_workflow_history(workflow_id, run_id).await?` 生成的自包含 JSON 包。把此辅助函数加入上方示例；它复用那些导入，并期望已完成的测试运行：

```rust
fn replay(env: WorkflowEnvironment) -> std::result::Result<(), Box<dyn std::error::Error>> {
let export = serde_json::from_slice(&std::fs::read("workflow-history.json")?)?;
let history = WorkflowHistory::from_export(export)?;
let report = env.replay(&history)?;
assert!(report.completed); // A running snapshot can remain durably pending.
Ok(())
}
```

对于原始历史，应合并**所有分页**，使用 `WorkflowHistory::from_history("hello", original_input, response)`，并在缺失时提供原始任务队列。保留原始输入和已记录结果；被裁剪/隐藏的载荷、未解析的外部引用以及剩余分页令牌会被拒绝。SDK 导出辅助函数会在下载时解析载荷引用。重放本身不会联系 Server，也不会执行活动回调。

重放使用 Worker 的解码、副作用、版本标记和已记录 select 结果处理路径。更改或重排命令会返回 `Error::NonDeterministicReplay(ReplayFailure)`，包含 `sequence`、`expected`、`actual`；已安装包的真实导出检查在序列 3 发现更改的活动。超出快照的新命令也会失败。未结束的快照可能显示持久等待的历史前缀，而不是完成：应断言预期结果，并用新的进程内执行与集成测试覆盖新分支。参见[已发布重放检查](https://github.com/durable-workflow/sdk-rust/blob/4.5.0/tests/workflow_testing.rs)。

### 执行限制 {#rust-test-execution-limits}

定时器和重试等待会被跳过。并行回调按命令顺序执行，因此此环境不能测试调度竞争或性能。它不模拟队列、租约或部署行为。活动回调必须让出执行权；`max_steps(n)` 限制持久执行轮次、命令和尝试次数（默认 10,000），而 `tokio::time::timeout` 可限制异步回调时间。

活动超时模拟、**新的 select 竞争**、信号、子工作流、服务、会话、continue-as-new 和取消需要集成测试；不支持的命令返回 `Error::Testing`。已有记录中的 select 胜出者可以重放，但新的 select 竞争不会被模拟。应保留真实运行时测试来验证这些边界。参见[测试 API](https://rust.durable-workflow.com/durable_workflow/testing/index.html)和[已发布执行约定](https://github.com/durable-workflow/sdk-rust/blob/4.5.0/README.md#testing-without-a-server)。

## 入口兼容性与恢复 {#entry-compatibility-and-recovery}

**已发布支持。** Rust SDK 3.5.6 引入了下述入口保护，Server 2.9.9 提供了配套的路由和恢复支持。这些是相应功能的最低支持版本；请安装当前稳定版本以获取安全修复。

`Worker::register_typed_workflow` 和类型化有状态适配器会先反序列化已记录输入，再调用应用处理器或其状态工厂。输入结构不兼容时，会报告任务失败类型 `WorkflowEntryArgumentsMismatch` 和原因 `workflow_entry_arguments_mismatch`，不会提交 `fail_workflow`。SDK 对工作流输入产生的本地错误为 `Error::HandlerType`，包含工作流和预期 Rust 类型，而不是已记录值。原始工作流处理器不会获得新的 Rust 签名检查。成功进入的应用处理器返回的错误仍是普通工作流失败，即使其文本看起来像入口诊断也不例外。

托管 Worker 会自动声明 `workflow_entry_arguments_validation`。经过验证的 Server 会将失败任务保留为重放受阻状态，并让原运行保持非终态。较旧的运行时可能重试任务，因此仅 SDK 本身不能确立完整恢复契约。

使用 `Client::describe_workflow_run(workflow_id, run_id)` 检查原运行，通过指定运行的调试端点查看任务原因。恢复兼容的输入解码和代码之后，再使用[恢复流程](../failures-and-recovery.md#service-entry-recovery)中指定运行的 HTTP 修复路由。此 crate 不提供 `repair_workflow` 便捷方法。保留原输入、历史、命名空间、队列、构建和截止时间；在兼容处理器内部对持久命令变更进行版本分支，并验证冷重放。请参阅[定义路由](./worker-compatibility-routing.md#definition-fingerprint-evolution)。

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

## 活动心跳 {#activity-heartbeats}

对于远程活动，`ActivityContext::heartbeat(...).await` 返回 `Result<ActivityHeartbeatResponse>`。请传播错误，并在成功响应上检查 `should_stop()`。直接请求故障包括 `Error::Transport` 和类型化 HTTP 拒绝 `Error::ActivityTaskRejected`。协作监督下的任务在心跳或所有权检查失败时，可能返回 `Error::ActivityExecutionAbandoned`。失去权限后请停止外部工作。不要假定回调总能执行到应用清理代码。

第一个心跳窗口从运行时领取任务开始，早于任务交付。已记录心跳使用其运行时时间，而不是调用方的接收时间。选择在配置超时内留足余量的节奏，限制每个工作或 I/O 步骤，并为执行暂停、请求延迟及可能的传输重试预留时间。请遵循[发送节奏建议](../features/heartbeats.md#heartbeat-cadence-and-receipts)。不保证自动进度心跳或批量发送计划。

取消时，如执行条件仍允许，请释放进程内资源并及时返回。持久状态会拒绝迟到的完成，不能将已取消或已终止的运行变为成功。受管理的 Worker 在该明确拒绝后及重启后继续轮询。成功心跳不是外部副作用的提交，也不是替代尝试的可恢复检查点。

Server 镜像、认证及生产拓扑请继续查看 [Server 设置指南](/docs/polyglot/server)。
