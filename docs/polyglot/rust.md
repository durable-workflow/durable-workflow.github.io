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
  - Rust SDK
  - durable-workflow crate
  - Rust worker
  - crates.io
---

# Rust SDK

The first-party Rust SDK provides async worker and control-plane clients for
Durable Workflow. It can register workflow and activity handlers, start,
signal, query, cancel, terminate, and await executions, report worker and
activity heartbeats, and exchange language-neutral payloads with the
standalone server.

This page belongs to the explicit 2.0 prerelease docs line. The Rust crate is
published independently from the stable 1.x PHP documentation line and does
not change which docs version is the public default.

## Package and source

- [Crate on crates.io](https://crates.io/crates/durable-workflow)
- [Source repository](https://github.com/durable-workflow/sdk-rust)
- [Generated Rust API documentation](https://rust.durable-workflow.com/)

Install the exact Rust SDK version in the current public artifact tuple:

```bash
%%artifact.rustCargoAddCommand%%
```

Or pin the same version directly in `Cargo.toml`:

```toml
[dependencies]
%%artifact.rustCargoRequirement%%
```

The `%%artifact.rustSdkVersion%%` release requires Rust 1.86 or newer. Its
package metadata declares compatibility with Durable Workflow server 0.2.x,
worker protocol 1.2, and control plane 2. During deployment, the protocol
manifests advertised by `GET /api/cluster/info` remain authoritative.

Server `0.2.x` negotiates worker-protocol headers within major `1`: a server
advertising `1.N` accepts a worker header `1.M` only when `M <= N`. Rust SDK
`0.1.x` sends `X-Durable-Workflow-Protocol-Version: 1.2`, so it requires a
server in the declared `>=0.2,<0.3` package range that also advertises worker
protocol `1.2` or newer. The current server advertises `1.13`, accepts the
Rust header, and returns `1.13` in its response header and body.

Negotiation fails closed. A missing or malformed header, a different major,
or a worker minor newer than the server's advertised minor is rejected. The
server version range selects the release family; it does not override the
runtime protocol manifest.

## Start with the SDK

The repository's
[`hello_world` example](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs)
registers a Rust worker, starts a workflow, sends a signal, runs an activity,
reports an activity heartbeat, and waits for the completed result. Run it
against an existing server with:

```bash
DURABLE_WORKFLOW_SERVER_URL=http://127.0.0.1:8080 \
DURABLE_WORKFLOW_TOKEN=your-token \
cargo run --example hello_world
```

Use `TASK_QUEUE` to override the example's default `rust-workers` task queue.

## Cancel, terminate, and handle terminal outcomes

Rust SDK 0.1.8 and newer separates cooperative cancellation from forced
termination. Cancellation is the normal lifecycle operation when workflow and
activity code should observe the stop request and clean up. Termination closes
the run without waiting for that cleanup and should be reserved for an
operator-enforced stop.

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
value. Match the typed terminal variants for every other outcome:

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
    Err(Error::WorkflowTimedOut(outcome)) => {
        println!("timeout: {}", outcome.reason);
    }
    Err(error) => return Err(error),
}
# Ok(())
# }
```

Each terminal outcome carries workflow and run identity. It also retains the
public reason, failure category and identity, exception type and class,
non-retryable state, message, and exception payload when the server supplies
them. A local wait deadline has reason `result_wait_timeout`; a server timeout
remains a distinct terminal `timed_out` run.

Long-running activities should heartbeat and inspect `should_stop()`. On
cancellation, release temporary files, connections, or other process-local
resources and return promptly. A late completion is rejected by durable state
and cannot convert a cancelled or terminated run into success; managed workers
continue polling after that definitive rejection and after restart.

For server images, authentication, and production topology, continue with the
[server setup guide](/docs/2.0/polyglot/server).
