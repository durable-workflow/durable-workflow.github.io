---
sidebar_position: 5
title: Rust SDK
description: Install the first-party Rust SDK and find its crate, source, and generated API documentation.
tags:
  - Rust
  - SDK
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - Rust SDK
  - durable-workflow crate
  - Rust worker
  - crates.io
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# Rust SDK

Use this guide for the general-access SDK surface, then continue to the
generated API reference for individual types and methods. No Cloud account is
required: the primary path uses the published Rust crate with a self-hosted
Server. Developers already enrolled in Durable Workflow Cloud controlled early
access can instead choose the clearly separate [managed-runtime
quickstart](./rust-cloud-quickstart.md).

The first-party Rust SDK is a workflow-authoring surface, not only a protocol
compatibility client. Rust authors deterministic workflows, activities, and
long-running worker services against the same durable execution model used by
PHP and Python. The async control-plane client starts, signals, queries,
updates, cancels, terminates, and awaits executions; the worker runtime replays
workflow history, runs workflow/activity/update handlers, reports worker and
activity heartbeats, and exchanges language-neutral payloads with a self-hosted
Server or Durable Workflow Cloud namespace runtime.

The [Rust documentation landing page](https://rust.durable-workflow.com/)
provides the SDK index and general entry points. For crate modules, structs,
traits, and methods, continue to the generated [Rust SDK API
reference](https://rust.durable-workflow.com/durable_workflow/).

The stable Rust SDK supports durable
timers, child workflows, activity retries and timeouts, local activities, worker sessions, sticky execution, signals, replayed query
handlers, cancellation and termination, server-enforced workflow deadlines,
typed side effects, version markers, updates, and typed terminal/replay
failures. It does not yet claim schedule management. Use the
[2.0 Capability Index](/docs/capabilities/) instead of assuming every SDK
has identical feature breadth.

## Try the local Sample App playground

For the shortest no-Cloud authoring journey, open the current Sample App
[`main` branch in GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
and run:

<!-- docs-example id="sdk.rust.sample-app-playground" -->
```bash
scripts/playground rust
```

The local playground generates caller-owned workflow and activity source,
selects the current stable artifacts, and starts the published
Server and Waterline. It waits for a worker registration whose identity,
workflow type, activity type, and task queue match the generated contract before
starting the workflow. Success requires the expected completed result and
history; the terminal then prints the exact local Waterline run link and the
path to structured JSON evidence.

This intentionally small, transport-first scaffold uses `serde_json::Value`;
it is not the only recommended Rust application contract. Continue to the
crate's existing [typed input/output
example](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs),
[retry, timeout, heartbeat, and terminal-failure activity policy
example](https://github.com/durable-workflow/sdk-rust/blob/main/examples/activity_options.rs)
and [local activity example](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs).
The package,
repository example, and generated API reference below remain the direct paths
for users who do not want Sample App.

## Package and source

- [Crate on crates.io](https://crates.io/crates/durable-workflow)
- [Source repository](https://github.com/durable-workflow/sdk-rust)

Install the Rust SDK from the last passing qualified tuple. The exact requirement
is generated from the same machine-readable authority as the Server quickstart:

<!-- docs-example id="rust.sdk.install" -->
```bash
%%artifact.rustCargoAddCommand%%
```

Or declare the same qualified requirement directly in `Cargo.toml`:

```toml
[dependencies]
%%artifact.rustCargoRequirement%%
```

The crate requires Rust 1.86 or newer. Its package metadata records the Server
version used to qualify that SDK release, plus the worker protocol default and
minimum and control plane 2. Compatibility with a newer Server is verified
separately. During deployment, use the protocol manifests and capabilities
advertised by `GET /api/cluster/info`.

Server negotiates worker-protocol headers within major `1`: a server
advertising `1.N` accepts a worker header `1.M` only when `M <= N`. Rust SDK
3.5.0 defaults to `X-Durable-Workflow-Protocol-Version: 1.20` and requires a
server advertising `1.20` or newer. For an older compatible Server, select
`WorkerProtocolVersion::V119` through the client builder's
`worker_protocol_version` setting. SDK 3.4.x uses `1.19` by default.
The opt-in cooperative cancellation profile requires `1.20` and refuses an
explicit `1.19` selection.

Negotiation fails closed. A missing or malformed header, a different major,
or a worker minor newer than the server's advertised minor is rejected. The
SDK and Server release versions are tracked independently. Their runtime
protocol manifests determine compatibility.

## Workflow lists and complete run history {#workflow-lists-and-history}

These APIs require Rust SDK **4.6.0 or later**; check `Cargo.lock` because the separate installation tuple above may select an older crate. The [normal installed-package acceptance](https://github.com/durable-workflow/sdk-rust/issues/122#issuecomment-6363352910) verifies three list pages, six history pages, a 128 KiB payload, export/replay and the read-only example against published Server 2.11.0. Offline testing helpers require 4.5.0; these listing/history methods and iterators require 4.6.0. This does not change the selected Server/SDK tuple.

`Client::list_workflows(WorkflowListOptions)` and `Client::get_workflow_history(workflow_id, run_id, WorkflowHistoryOptions)` each return **one page**. Resume manually with its opaque `next_page_token`, or use lazy iterators for complete reads. The methods preserve Server validation, filters and namespace scope; they add no query fields or grammar. For example, find an open run using a registered keyword search attribute:

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

The Server's `status=running` filter selects the active **status bucket**, including raw `pending` and `waiting` statuses. `WorkflowSummary` preserves `status`, `status_bucket`, `is_terminal`, search attributes and unknown metadata in `raw`. Search attributes are not unique: a filter may match both a parent and children that inherited its value. Handle zero, one and multiple matches as above. Create the client in the intended namespace before constructing the iterator; namespace and filters stay fixed across every token.

Read an entire selected run without loading every page at once:

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

`iter_workflows(options)` yields each `WorkflowSummary` through `next().await`. Both iterators support `into_stream()` for `futures_util::TryStreamExt`; pin the returned stream before polling. Construction performs no I/O; the next page is fetched only after the current page is exhausted. A null/empty token ends iteration; an empty page with a token is followed. Repeated or cyclic tokens return `Error::Pagination` with bounded token state. A page failure preserves the original typed error, then that iterator ends. Handle the error: a partial read is not a complete result. Collecting a stream still stores every collected item.

History iteration keeps the original workflow/run identity and enumerates available events; it neither follows continue-as-new nor subscribes indefinitely. Event metadata and payload wire envelopes are retained. For offline replay use `Client::export_workflow_history` with `testing::WorkflowHistory::from_export`, rather than passing a partial history page. See [offline replay](#rust-replay-export).

Published Server 2.11 uses 50 list rows by default (maximum 200) and 100 history events (maximum 1,000) per page. Page sizes pass unchanged to Server validation. Stop early when enough results are available, choose a suitable page size and apply an application timeout. Pagination adds no snapshot isolation while runs change concurrently. See the [released read-only example](https://github.com/durable-workflow/sdk-rust/blob/4.6.0/examples/workflow_pagination.rs), [Client API](https://rust.durable-workflow.com/durable_workflow/struct.Client.html) and [pagination types](https://rust.durable-workflow.com/durable_workflow/pagination/index.html).

## Metrics and Prometheus export {#rust-sdk-metrics}

These APIs require Rust SDK **4.7.0 or later**. Check `Cargo.lock`: the separate installation tuple above may select an older crate. The [normal installed acceptance](https://github.com/durable-workflow/sdk-rust/pull/131#issuecomment-6364178456) verifies four HTTP controls, all six metrics from a real published Server 2.11.0 worker, and the released exporter example. This feature minimum does not promote the selected tuple.

The default recorder is a **no-op**. Supply an `Arc<dyn metrics::MetricsRecorder>` implementing `increment(name, count, tags)` and `record(name, seconds, tags)`. The client, its clones and newly constructed workers inherit that recorder. `Worker::metrics_recorder` overrides worker poll/task observations; client request observations keep the client recorder. Callbacks must be fast and handle exporter failures locally. Unwinding recorder panics are isolated from SDK results; blocking exporters or process aborts cannot be repaired by this hook.

Each observed client request, worker poll or claimed-task dispatch increments one counter by one and records one nonnegative monotonic duration in seconds. The six stable recorder names are:

| Counter | Duration histogram |
| --- | --- |
| `durable_workflow_client_requests` | `durable_workflow_client_request_duration_seconds` |
| `durable_workflow_worker_polls` | `durable_workflow_worker_poll_duration_seconds` |
| `durable_workflow_worker_tasks` | `durable_workflow_worker_task_duration_seconds` |

Client tag keys are exactly `method`, `route`, `plane`, `status_code`, `outcome`; worker keys are `task_kind`, `task_queue`, `outcome`. Reviewed route placeholders omit IDs, query strings, payloads and credentials; unknown paths use `unknown`. Queue names are application-controlled: use a bounded set, not one queue per run.

Client outcomes include `ok`, `http_error`, `bridge_rejected`, `TransportError`, `TimeoutError`, `SdkError` and `pending` for a cancelled future. `status_code` keeps an observed decimal HTTP status, otherwise `none`. Rust exception outcome names need not match another SDK’s names.

One client observation includes internal transport/storage-admission retries and response/payload handling; application/worker-managed calls are separate observations. A lazy iterator observes each fetched page. Worker polls include managed retry/backoff and distinguish `task`, `empty`, `backpressure`, `error`. Task outcomes `completed`, `failed`, `expired` describe dispatch processing, not the workflow’s terminal state. These are process observations, not durable counts, billing units or schedule-to-start latency; abrupt process loss can omit a final sample.

For the official Prometheus adapter, enable the optional `metrics-prometheus` Cargo feature. This example uses the exact released dependency recipe:

```toml
[dependencies]
durable-workflow = { version = "=4.7.0", features = ["metrics-prometheus"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

Save the [released example](https://github.com/durable-workflow/sdk-rust/blob/4.7.0/examples/metrics_prometheus.rs) as `examples/metrics_prometheus.rs`. These exact source bytes were compiled and run in the normal installed-package acceptance; the example prints health-request metrics:

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

Run it against your self-hosted Server:

```bash
DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080 \
DURABLE_WORKFLOW_AUTH_TOKEN=your-token \
cargo run --features metrics-prometheus --example metrics_prometheus
```

`PrometheusMetrics::new()` owns a dedicated registry backed by the official Prometheus Rust client 0.14. Serve `encode()` bytes from your application’s metrics route with `Content-Type: text/plain; version=0.0.4`. The adapter creates no listener or global registry. Your application owns scrape access/authentication, network exposure, resources and shutdown. Counter exports append `_total`; histograms use standard bucket/sum/count series. `registry()` allows application-owned collection and additional metrics.

For OpenTelemetry metrics, implement the recorder using your existing meter: count-unit (`1`) counters and second-unit (`s`) histograms with the exact names/tags above. Provider, aggregation, resource labels and exporter lifecycle remain application-owned. This is separate from execution tracing. See the [recorder API](https://rust.durable-workflow.com/durable_workflow/metrics/trait.MetricsRecorder.html), [Prometheus adapter API](https://rust.durable-workflow.com/durable_workflow/metrics/struct.PrometheusMetrics.html) and [released metrics contract](https://github.com/durable-workflow/sdk-rust/blob/4.7.0/README.md#client-and-worker-metrics).

## Worker task concurrency {#worker-task-concurrency}

The bounded worker lanes below require Rust SDK **4.3.1 or newer**. Check the crate in `Cargo.lock` before using them: the installation pin above belongs to a separate qualified artifact tuple and may select an older SDK. The [published-package acceptance](https://github.com/durable-workflow/sdk-rust/issues/107#issuecomment-6360719863) verifies three configured slots, a fourth callback admitted after a slot is released, and seven completed workflows including a handled activity failure. This guide does not change the Server protocol requirements above.

`Worker::max_concurrent_workflow_tasks(...)` and `Worker::max_concurrent_activity_tasks(...)` each default to **10**. `run()` and `run_until()` use independent bounded workflow and remote-activity lanes. Set a limit to **1** for serial execution within that task family. For example, configure an existing client before registering your application handlers:

```rust
use durable_workflow::Worker;

let mut worker = Worker::new(client.clone(), "payments")
    .max_concurrent_workflow_tasks(1)
    .max_concurrent_activity_tasks(1);
```

Register the workflow and activity handlers, then start `run()` or `run_until()` as usual. Setting both limits to one still permits a workflow task and a remote activity task to run at the same time. Queries keep a separate polling lane. Worker clones share the configured capacity, including simultaneous `run_once()` calls; cloning does not create another independent allowance.

Heartbeat availability follows actual claimed tasks, including input/history loading, callback execution and settlement. An empty long poll leaves capacity available. Success, failure, refusal and cancellation release the local slot. Inline local activities occupy their **workflow-task** slot and bypass the remote-activity pool, so the activity limit does not separately cap inline local execution across workflows.

Handlers are async futures on Tokio and must yield for other work to progress. Use `tokio::task::spawn_blocking` or a separate process for blocking work, with an explicit cancellation and shutdown boundary. Raising concurrency does not provide CPU isolation or make a detached thread cancellable. See the [Worker API](https://rust.durable-workflow.com/durable_workflow/struct.Worker.html) for the installed SDK's controls.

## Received activity retry budgets {#activity-retry-info}

Rust SDK **4.8.0 or newer** exposes `ActivityContext::retry_info()` in service activity handlers. Check the installed crate in `Cargo.lock`: the separately selected installation pin above can be older. The returned `ActivityRetryInfo` preserves the original `attempt_number()` and received `policy()` JSON, including unknown fields. It is an immutable snapshot of this invocation, independent of mutable compatibility fields on the context.

Use `attempt_limit()` and `is_last_configured_attempt()` to interpret the received budget:

| Received retry policy | `ActivityAttemptLimit` | Final configured attempt |
| --- | --- | --- |
| Object with positive integer `max_attempts: n` | `Bounded(n)`, including the first attempt | `Some(true)` once the original attempt reaches or exceeds `n`, otherwise `Some(false)` |
| Object with `max_attempts: null` | `Unlimited` | `Some(false)` |
| Omitted policy, root null, missing field or invalid limit | `Unknown` | `None` |

The helper also returns `None` for an invalid zero attempt number. A runtime's scheduling default does not establish received metadata: the published Server 2.11.0 no-authored-policy control omits the snapshot and therefore reports `Unknown`, not an inferred `Bounded(1)`. `policy()` distinguishes an omitted policy from a received JSON null without treating either as unlimited. The [normal installed acceptance](https://github.com/durable-workflow/sdk-rust/issues/135#issuecomment-6366200791) includes this control and the recipe below.

For a final-configured-attempt fallback or application alert, register a handler on your existing Worker:

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

`Some(false)` is not a promise of another execution. Non-retryable failure, cancellation, workflow closure and elapsed deadlines can end work before its configured budget is used. The helper does not change retry admission or grant extra time.

Local activities and direct `testing::WorkflowEnvironment::run_activity` calls have no received Server snapshot and report unknown policy. Fresh `run_workflow` tests expose the modeled snapshot recorded in their generated history. These test semantics do not prove a deployed Server sends a policy. See [ActivityRetryInfo](https://rust.durable-workflow.com/durable_workflow/struct.ActivityRetryInfo.html) and [ActivityAttemptLimit](https://rust.durable-workflow.com/durable_workflow/enum.ActivityAttemptLimit.html).

## Local activities

Rust SDK 3.1.0 adds inline local execution on workers configured with
`Worker::local_activities(true)`. Register callbacks with the ordinary activity
registration methods, then use the workflow context's local activity methods.
See the [runnable example](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs)
and [LocalActivityOptions reference](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html)
for retry and timeout configuration.

Server records the terminal result for cold replay. Uncommitted local effects
can execute again after worker loss and must be idempotent. Async callbacks
must yield to Tokio. Blocking work needs separate process supervision.
Inline local execution and prepared cooperative local supervision use separate
worker profiles.

## Worker sessions

Enable `Worker::worker_sessions(true)` and declare the requirements your worker
satisfies with `capabilities(...)`. Route remote activities with
`in_worker_session(WorkerSessionOptions::new(session_id))`. The activity context
provides the shared handle through `worker_session()`. Explicit handles support
`create()`, `renew()` and `close(reason)` after worker registration.

Bound worker session count with `max_concurrent_worker_sessions(...)` and session
activity concurrency with `max_concurrent_activities(...)`. Renew idle handles
explicitly. Activity heartbeats also renew the holder lease, preserving the
original absolute TTL. An async callback that yields to Tokio is dropped when
its locally observed lease or TTL expires without requiring application heartbeats.

Session resources live in the holder process. A replacement must rebuild them,
and interrupted external effects need idempotency and attempt fencing. Committed
results replay without rerunning the callback. Graceful shutdown closes held
sessions before deregistration. Local activities cannot use session routing.

Session support starts with Rust SDK 3.2.0. Use Server 2.5.1 or newer. The
[runnable example](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs)
reuses a process-local cache across two typed activities and prints its generation.
See [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html)
and [WorkerSession](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSession.html)
for configuration and lifecycle methods.

## Bounded sticky execution

Enable `Worker::sticky_cache(StickyCacheOptions::new(capacity))` to retain
immutable encoded history for subsequent replay. The cache is disabled by
default. Set `max_history_bytes(...)` and `ttl(...)` to bound retained history
and its lifetime. Allow additional memory for decoding and replay.

The cache uses workflow, run and build identity. Worker replacement, expiry,
eviction or an invalid history cursor falls back to complete durable history.
Terminal workflows and stopped workers discard their entries. Workflow code
must replay correctly with an empty cache.

Support starts with Rust SDK 3.4.0 and the qualified Server baseline. See the
[configuration reference](https://rust.durable-workflow.com/durable_workflow/struct.StickyCacheOptions.html),
[runnable example](https://github.com/durable-workflow/sdk-rust/blob/3.4.0/examples/sticky_execution.rs)
and [portable worker-affinity guide](./portable-worker-affinity.md).

## Prepare the released repository example

The repository's
[`hello_world` example](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs)
registers a Rust worker, starts a workflow, sends a signal, runs an activity,
reports an activity heartbeat, and waits for the completed result. Because that
example runs the application client and worker in one process, the no-account
path below connects it to a self-hosted Server. A provisioned Cloud namespace
is an optional secondary runtime with separate role-scoped credentials.

For a reproducible source exercise, obtain the exact crate source recorded by
the qualified tuple. The value below is generated from that machine-readable
authority. The example directory is absolute so either connection path can
enter it directly:

<!-- docs-example id="rust.sdk.repository-source" -->
```bash
export DURABLE_WORKFLOW_RUST_VERSION=%%artifact.rustSdkVersion%%
export DURABLE_WORKFLOW_RUST_EXAMPLE_DIR="$PWD/durable-workflow-rust-${DURABLE_WORKFLOW_RUST_VERSION}"
git clone --depth 1 --single-branch --branch "$DURABLE_WORKFLOW_RUST_VERSION" \
  https://github.com/durable-workflow/sdk-rust.git "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
```

## Run the combined example with self-hosted Server

The unmodified `hello_world` example accepts one token for a self-hosted
Durable Workflow Server whose authentication policy allows the same credential
to make workflow commands and poll for work:

<!-- docs-example id="rust.sdk.self-hosted" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080 \
DURABLE_WORKFLOW_TOKEN=dev-token \
cargo run --example hello_world
```

The example uses the `default` namespace provisioned by the local Server
quickstart. Use `TASK_QUEUE` to override its default `rust-workers` task queue.
No Cloud enrollment or Cloud credential is involved in this path.

## Optional secondary path: connect to Durable Workflow Cloud

For the shortest managed-runtime proof, use the [Rust Cloud
quickstart](./rust-cloud-quickstart.md). It runs the same symmetric Sample App
playground available to PHP and Python, selects current stable artifacts
dynamically, verifies exact worker readiness, and waits for a completed result.

<ProductPromotion source="docs-v2-rust-sdk">
Already enrolled in Cloud? Run the shared Rust playground against your
provisioned namespace with separate role-scoped runtime credentials.
</ProductPromotion>

The lower-level combined SDK example below is useful when adapting an existing
Rust process. Export the values returned when Cloud provisions the namespace
and creates its two runtime credentials:

See [Cloud Managed Runtime](/docs/polyglot/cloud-control-plane) for the
managed connection boundary.

<!-- docs-example id="rust.sdk.cloud.environment" -->
```bash
export DURABLE_WORKFLOW_RUNTIME_URL='https://your-runtime-url'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='orders'
export DURABLE_WORKFLOW_CLIENT_TOKEN='dwr_client_credential'
export DURABLE_WORKFLOW_WORKER_TOKEN='dwr_worker_credential'
```

In `$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR/examples/hello_world.rs`, replace the
existing `server_url`, `token`, and `Client::builder(...)` setup with this
split-token builder configuration:

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

Then run the example normally:

<!-- docs-example id="rust.sdk.cloud.run" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
cargo run --example hello_world
```

The example's workflow start, signal, describe, and result calls use
`control_token`; its `Worker` registration, polling, heartbeat, and completion
calls use `worker_token`. Both roles use the same Cloud-provided runtime URL,
runtime namespace, and task queue, but they do not reuse a credential. Do not
replace either Cloud credential with `.token(...)`: that method is the generic
single-token fallback used by the self-hosted configuration above.

## Start with server-enforced workflow timeouts

The Rust SDK provides `WorkflowStartOptions` and
`Client::start_workflow_with_options` for workflow deadlines that the server
enforces even after the starting process exits. Execution timeout covers the
whole workflow instance, including continue-as-new runs; run timeout covers one
run and is recomputed when a new run begins.

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

Both values are seconds, must be positive, and the run timeout cannot exceed
the execution timeout. The existing `Client::start_workflow` convenience
method uses `WorkflowStartOptions::default()`: a 3600-second execution timeout
and a 600-second run timeout. See [Timeouts](/docs/features/timeouts) for
the server's deadline and continue-as-new semantics.

These are workflow policy, not HTTP or result-polling timeouts. In particular,
`WorkflowResultOptions::timeout` only stops the local `result()` call from
waiting. It does not close, cancel, or otherwise change the workflow run. The
caller can inspect the returned identity and wait again. An execution or run
deadline configured with `WorkflowStartOptions` is durable server state; when
it expires, the server closes the run with a terminal `timed_out` outcome.

## Deterministic parallel groups

`WorkflowContext::parallel` and its `join` alias compose activities, child
workflows, timers, mixed groups, and nested groups without adding a new Server
command. Constructors on `ParallelOperation` defer every leaf until the entire
tree is known:

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

Every leaf carries the shared stable group identity plus its complete
outer-to-inner path. Successful results retain nested input shape and order.
`Error::ParallelFailed` preserves the typed leaf cause, deterministic member
path, group path, and completed siblings. Pending and completed histories replay
without rescheduling; exact duplicates and late completions do not change the
chosen positional outcome.

## Durable first-completion selection

`WorkflowContext::select` and `select_keyed` start activities, child workflows,
timers, signals, condition waits, and nested ordinary groups together, then
resume from the winner recorded by the runtime:

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

`SelectionResult` preserves the stable key/index, operation kind and identity,
typed value or failure, and a `DurableOperationHandle` for every member. A loser
continues unless workflow code later awaits `handle.await_result()` or awaits
`handle.cancel()`. The cancellation future resolves to unit; only committed
`SelectionOperationCancelled` history proves cancellation won. Replay advances
past an unmarked request, and `await_result()` still returns a completion that
committed first. Restart and replay consume the persisted winner; later or
duplicate terminal events cannot change it.

## Saga compensation

Register a compensation only after the corresponding forward activity has
completed, then give the forward result to `Saga::finish`:

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

Handled failure runs the existing activity command in
reverse registration order, one compensation at a time. Compensation stops at
its first failure. `Error::SagaCompensationFailed` preserves both typed errors,
the compensation activity type, and its registration order through restart and
replay.
Terminal `cancel_workflow` does not resume workflow code to run compensations.

## Deterministic side effects and version markers

The Rust SDK records small non-deterministic values
with `WorkflowContext::side_effect` and derives deterministic UUIDv4 values
with `WorkflowContext::uuid_v4`. A cold replay decodes the recorded value
instead of invoking the callback again; reordered, missing, duplicate, or
codec-incompatible markers return a typed `Error::NonDeterministicReplay`.

Use `WorkflowContext::get_version(change_id, min_supported, max_supported)` to
keep old and new workflow branches replay-compatible during a rollout. New
runs record `max_supported`; existing runs reuse the durable marker.
`patched(change_id)` provides the boolean rollout form, and
`deprecate_patch(change_id)` preserves the marker after the legacy branch has
drained. See [Side Effects](/docs/features/side-effects/) and
[Versioning](/docs/features/versioning/) for the shared durable semantics.

## Rust determinism rules {#rust-determinism-rules}

A replay must produce the same durable commands in the same order for the recorded input and history. Rust's ordinary collections, clocks and concurrency primitives do not automatically preserve that contract:

| Pattern in workflow code | Durable replacement |
| --- | --- |
| Scheduling while iterating a `HashMap` | Sort keys first or use a `BTreeMap`. |
| System-clock reads, `thread_rng` or a new UUID | Record a snapshot with `ctx.side_effect(...)`, or use an activity. |
| `tokio::time::sleep` or `std::thread::sleep` | `ctx.sleep(...)` or `ctx.start_timer(...)`. |
| `tokio::select!` or racing ordinary futures | `ctx.select(...)` or `ctx.select_keyed(...)`. |
| Untracked concurrent durable calls | `ctx.parallel(...)` with stable input ordering. |
| Network, filesystem or mutable external I/O | A registered activity. |
| Changing existing command order on deployment | A stable `ctx.get_version(...)` branch, tested against recorded history. |

Activities still need idempotent external effects; determinism does not make a repeated payment or file write safe. See [idempotency versus determinism](../constraints/idempotent-vs-deterministic.md).

## Offline tests and replay {#offline-testing-and-replay}

These APIs require Rust SDK **4.5.0 or newer**. Check `Cargo.lock`: the separate installation tuple above may select an older crate without them. The [normal installed 4.5.0 receipt](https://github.com/durable-workflow/sdk-rust/issues/105#issuecomment-6362112580) verifies twelve Server-free controls, this compiled example and a real Server 2.11.0 export/replay. It does not promote a new Server/SDK tuple.

### Activity and workflow unit tests {#rust-activity-workflow-tests}

`testing::WorkflowEnvironment` runs registered workflows and activities in the current process. Use `from_worker(worker)` to reuse the application's registrations, or register callbacks directly; `worker_mut()` exposes the normal typed registration APIs. Mocks are explicit: real activity callbacks execute their own code, so replace external effects deliberately.

Use `durable-workflow = "=4.5.0"` for the qualified recipe, Tokio with `macros`, `rt-multi-thread` and `time`, and `serde_json = "1"` for the export helper below. Save the released example as `examples/workflow_testing.rs` and run `cargo run --example workflow_testing`:

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

Direct `run_activity` executes one attempt. Within `run_workflow`, recorded retry policy applies before a terminal failure reaches workflow code. Real or mocked remote/local activity failures use typed `Error::ActivityFailed`, with exception type, attempt number and non-retryable metadata; an uncaught workflow error keeps its original Rust variant. Heartbeats are captured locally. Use the `*_avro_value` variants when JSON cannot preserve the original Avro value.

### Replay an exported run {#rust-replay-export}

Register the candidate workflow, then load a self-contained JSON bundle from `dw workflow:history-export` or `Client::export_workflow_history(workflow_id, run_id).await?`. Add this helper to the example above; it uses those imports and expects a completed fixture:

```rust
fn replay(env: WorkflowEnvironment) -> std::result::Result<(), Box<dyn std::error::Error>> {
let export = serde_json::from_slice(&std::fs::read("workflow-history.json")?)?;
let history = WorkflowHistory::from_export(export)?;
let report = env.replay(&history)?;
assert!(report.completed); // A running snapshot can remain durably pending.
Ok(())
}
```

For raw history, combine **all pages** and use `WorkflowHistory::from_history("hello", original_input, response)`, supplying the original task queue when absent. Keep original input and recorded results; pruned/redacted payloads, unresolved external references and remaining page tokens are refused. The SDK export helper resolves payload references while downloading. Replay itself contacts no Server and runs no activity callbacks.

Replay uses the worker's decoding, side-effect, version-marker and recorded select-resolution paths. Changed or reordered commands return `Error::NonDeterministicReplay(ReplayFailure)` with `sequence`, `expected` and `actual`; the installed real-export control finds a changed activity at sequence 3. New commands beyond the snapshot also fail. An open snapshot may report a durably pending prefix rather than completion: assert the expected outcome, and use fresh in-process execution plus integration tests for new branches. See the [released replay controls](https://github.com/durable-workflow/sdk-rust/blob/4.5.0/tests/workflow_testing.rs).

### Execution limits {#rust-test-execution-limits}

Timer and retry delays are skipped. Parallel callbacks run in command order, so this environment does not test scheduling races or performance. It does not simulate queues, leases or deployment behavior. Activity callbacks must yield; `max_steps(n)` bounds durable turns, commands and attempts (default 10,000), while `tokio::time::timeout` can bound asynchronous callback time.

Activity-timeout simulation, **new select races**, signals, children, services, sessions, continue-as-new and cancellation need integration tests; unsupported commands return `Error::Testing`. A recorded select winner can replay even though a new select race is not simulated. Keep live-runtime tests for those boundaries. See the [testing API](https://rust.durable-workflow.com/durable_workflow/testing/index.html) and [released execution contract](https://github.com/durable-workflow/sdk-rust/blob/4.5.0/README.md#testing-without-a-server).

## Entry compatibility and recovery {#entry-compatibility-and-recovery}

**Released support.** Rust SDK 3.5.6 introduced the entry safeguard below, with routing and recovery support in Server 2.9.9. These are minimum feature versions; install current stable releases for security fixes.

`Worker::register_typed_workflow` and the typed stateful adapters deserialize recorded input before invoking the application handler or its state factory. An incompatible input shape reports task failure type `WorkflowEntryArgumentsMismatch` and reason `workflow_entry_arguments_mismatch`, without submitting `fail_workflow`. The SDK's local error is `Error::HandlerType` for workflow input, with the workflow and expected Rust type rather than the recorded value. Raw workflow handlers are not given new Rust signature checks. An error returned by a successfully entered application handler remains an ordinary workflow failure, even if its text resembles the entry diagnostic.

The managed worker automatically advertises `workflow_entry_arguments_validation`. A qualified Server retains the failed task as replay-blocked and leaves the original run nonterminal. Older runtimes may retry the task instead, so the SDK alone does not establish the complete recovery contract.

Use `Client::describe_workflow_run(workflow_id, run_id)` to inspect the original and the selected-run debug endpoint for the task reason. Restore compatible input decoding and code before using the selected-run HTTP repair route in the [recovery procedure](../failures-and-recovery.md#service-entry-recovery). This crate has no `repair_workflow` convenience method. Keep original input, history, namespace, queue, build and deadlines; version durable-command changes inside a compatible handler and qualify cold replay. See [definition routing](./worker-compatibility-routing.md#definition-fingerprint-evolution).

## Cancel, terminate, and handle terminal outcomes

Service-mode `cancel_workflow` and `terminate_workflow` both close the run
immediately. They record distinct terminal outcomes, but neither asks workflow
code to run cleanup. Use `request_cancellation()` with cooperating workers for
bounded workflow cleanup. See the
[cooperative cancellation guide](/docs/polyglot/cancellation) for operation
policies, supervision and recovery.

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

Instance-targeted `cancel_workflow` and `terminate_workflow` resolve the
current run on the server. For selected-run safety, call
`cancel_workflow_run` or `terminate_workflow_run`, or use a handle's
`cancel_selected_run` and `terminate_selected_run` methods. If a selected run
is stale, `Error::WorkflowCommandRejected` exposes the stable
`historical_run_command_rejected` reason together with workflow ID, run ID,
target scope, HTTP status, and the response body.

Successful `WorkflowHandle::result` calls continue to return the decoded JSON
value. Match the typed terminal variants for every other outcome. Branch on
the stable reason and category fields instead of display text:

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

Each terminal outcome carries workflow and run identity. It also retains the
public reason, failure category and identity, exception type and class,
non-retryable state, message, and exception payload when the server supplies
them. A local wait deadline has reason `result_wait_timeout` and category
`client_timeout`; a server timeout is a terminal `timed_out` run whose stable
reason is `execution_timeout` or `run_timeout`.

Handles returned by either start method retain the selected `run_id`.
`WorkflowHandle::result` describes that run-specific route, so reusing the same
workflow ID for a newer run cannot make a wait silently report the newer run's
outcome. Preserve both `outcome.workflow_id` and `outcome.run_id` in logs,
metrics, and retry records; use instance-level lookups only when following the
current run is intentional.

## Workflow updates

Rust supports durable updates across application-client, selected-handle, and
worker-authoring roles. Use `Client::update_workflow` or
`WorkflowHandle::update` for JSON-compatible values, and the matching
`update_workflow_avro_value` or `update_avro_value` methods for explicitly
typed Avro values.

Workers register named handlers with `Worker::register_update`; use
`register_update_avro_value` when the handler consumes and returns Avro values
directly. An update is a durable, result-bearing workflow mutation. It is
separate from fire-and-forget signals and read-only replayed queries.

## Payload envelope

Workflow input, signals, activities, queries, and results use the published
`PayloadEnvelope` contract: a `codec` plus encoded `blob`. The SDK's default
`avro` path uses its declared `apache-avro` dependency and the platform's
fixed versioned Value schema; do not hand-roll the blob or replace the envelope
with an implementation-specific record.

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

`start_workflow` and `start_workflow_with_options` apply this envelope
automatically to their serializable input. Use the public helpers only when a
program needs to exchange an envelope directly.

## Activity heartbeats {#activity-heartbeats}

For remote activities, `ActivityContext::heartbeat(...).await` returns a `Result<ActivityHeartbeatResponse>`. Propagate errors and inspect `should_stop()` on a successful response. Direct request failures include `Error::Transport` and typed `Error::ActivityTaskRejected` HTTP refusals. A cooperatively supervised claim can instead return `Error::ActivityExecutionAbandoned` when heartbeat or ownership checks fail. Stop external work after losing authority. Do not assume a callback always reaches application cleanup code.

The first heartbeat window starts at runtime claim, before task delivery. A recorded heartbeat uses its runtime timestamp, not the caller's receipt time. Choose a cadence well inside the configured timeout, bound each work/I/O step and allow for scheduling, request latency and any transport retries. Follow the [cadence guidance](../features/heartbeats.md#heartbeat-cadence-and-receipts). No automatic progress-heartbeat or batching schedule is promised.

On cancellation, release process-local resources when execution still permits it and return promptly. A late completion is rejected by durable state and cannot turn a cancelled or terminated run into success. Managed workers continue polling after that definitive rejection and restart. A successful heartbeat is not an external-effect commit or a replacement attempt's resumable checkpoint.

For server images, authentication, and production topology, continue with the
[server setup guide](/docs/polyglot/server).
