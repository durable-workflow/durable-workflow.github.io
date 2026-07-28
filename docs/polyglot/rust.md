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

The first-party Rust SDK is a workflow-authoring surface, not only a protocol
compatibility client. Rust authors deterministic workflows, activities, and
long-running worker services against the same durable execution model used by
PHP and Python. The async control-plane client starts, signals, queries,
cancels, terminates, and awaits executions; the worker runtime replays
workflow history, runs workflow/activity handlers, reports worker and activity
heartbeats, and exchanges language-neutral payloads with a self-hosted Server
or Durable Workflow Cloud namespace runtime.

For crate modules, structs, traits, and methods, see the generated
[Rust SDK API reference](https://rust.durable-workflow.com/).

Cloud customers configure the provisioned namespace's runtime URL and use
separate credentials for client and worker roles, even when both roles run in
one process. See
[Cloud Managed Runtime](/docs/2.0/polyglot/cloud-control-plane) for the managed
connection boundary and the Cloud-specific connection example below.

At the current `%%artifact.rustSdkVersion%%` floor, Rust supports durable
timers, child workflows, activity retries and timeouts, signals, replayed query
handlers, cancellation and termination, server-enforced workflow deadlines,
typed side effects, version markers, and typed terminal/replay failures. It
does not yet claim the Rust authoring surface for updates or schedule
management. Use the
[2.0 Capability Index](/docs/2.0/capabilities/) instead of assuming every SDK
has identical feature breadth.

This page belongs to the explicit 2.0 prerelease docs line. The Rust crate is
published independently from the stable 1.x PHP documentation line and does
not change which docs version is the public default.

## Package and source

- [Crate on crates.io](https://crates.io/crates/durable-workflow)
- [Source repository](https://github.com/durable-workflow/sdk-rust)

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
package metadata declares compatibility with Durable Workflow server
`%%artifact.serverVersion%%`, worker protocol 1.2, and control plane 2. During deployment, the protocol
manifests advertised by `GET /api/cluster/info` remain authoritative.

Server `%%artifact.serverVersion%%` negotiates worker-protocol headers within major `1`: a server
advertising `1.N` accepts a worker header `1.M` only when `M <= N`. Rust SDK
`%%artifact.rustSdkVersion%%` sends `X-Durable-Workflow-Protocol-Version: 1.2`, so it requires
the same synchronized server train, which must also advertise worker
protocol `1.2` or newer. The current server advertises `1.13`, accepts the
Rust header, and returns `1.13` in its response header and body.

Negotiation fails closed. A missing or malformed header, a different major,
or a worker minor newer than the server's advertised minor is rejected. The
server version range selects the release family; it does not override the
runtime protocol manifest.

## Connect to Durable Workflow Cloud

The repository's
[`hello_world` example](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs)
registers a Rust worker, starts a workflow, sends a signal, runs an activity,
reports an activity heartbeat, and waits for the completed result. Because that
example runs the application client and worker in one process, a Cloud
connection must give its `Client` both role-specific credentials instead of
setting the generic token fallback.

Export the values returned when Cloud provisions the namespace and creates its
two runtime credentials:

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='https://your-runtime-url'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='orders'
export DURABLE_WORKFLOW_CLIENT_TOKEN='dwr_client_credential'
export DURABLE_WORKFLOW_WORKER_TOKEN='dwr_worker_credential'
```

In `examples/hello_world.rs`, replace the existing `server_url`, `token`, and
`Client::builder(...)` setup with this split-token builder configuration:

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

```bash
cargo run --example hello_world
```

The example's workflow start, signal, describe, and result calls use
`control_token`; its `Worker` registration, polling, heartbeat, and completion
calls use `worker_token`. Both roles use the same Cloud-provided runtime URL,
runtime namespace, and task queue, but they do not reuse a credential. Do not
replace either Cloud credential with `.token(...)`: that method is the generic
single-token fallback used by the self-hosted configuration below.

## Run the combined example with self-hosted Server

The unmodified `hello_world` example accepts one token for a self-hosted
Durable Workflow Server whose authentication policy allows the same credential
to make workflow commands and poll for work:

```bash
DURABLE_WORKFLOW_SERVER_URL=http://127.0.0.1:8080 \
DURABLE_WORKFLOW_TOKEN=your-token \
cargo run --example hello_world
```

This `DURABLE_WORKFLOW_TOKEN` command is for self-hosted Server usage, not a
Cloud namespace. Use `TASK_QUEUE` to override the example's default
`rust-workers` task queue.

## Start with server-enforced workflow timeouts

Rust SDK `%%artifact.rustSdkVersion%%` adds `WorkflowStartOptions` and
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
and a 600-second run timeout. See [Timeouts](/docs/2.0/features/timeouts) for
the server's deadline and continue-as-new semantics.

These are workflow policy, not HTTP or result-polling timeouts. In particular,
`WorkflowResultOptions::timeout` only stops the local `result()` call from
waiting. It does not close, cancel, or otherwise change the workflow run. The
caller can inspect the returned identity and wait again. An execution or run
deadline configured with `WorkflowStartOptions` is durable server state; when
it expires, the server closes the run with a terminal `timed_out` outcome.

## Deterministic side effects and version markers

Rust SDK `%%artifact.rustSdkVersion%%` records small non-deterministic values
with `WorkflowContext::side_effect` and derives deterministic UUIDv4 values
with `WorkflowContext::uuid_v4`. A cold replay decodes the recorded value
instead of invoking the callback again; reordered, missing, duplicate, or
codec-incompatible markers return a typed `Error::NonDeterministicReplay`.

Use `WorkflowContext::get_version(change_id, min_supported, max_supported)` to
keep old and new workflow branches replay-compatible during a rollout. New
runs record `max_supported`; existing runs reuse the durable marker.
`patched(change_id)` provides the boolean rollout form, and
`deprecate_patch(change_id)` preserves the marker after the legacy branch has
drained. See [Side Effects](/docs/2.0/features/side-effects/) and
[Versioning](/docs/2.0/features/versioning/) for the shared durable semantics.

## Cancel, terminate, and handle terminal outcomes

The 2.0 baseline separates cooperative cancellation from forced termination.
Cancellation is the normal lifecycle operation when workflow and
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

Long-running activities should heartbeat and inspect `should_stop()`. On
cancellation, release temporary files, connections, or other process-local
resources and return promptly. A late completion is rejected by durable state
and cannot convert a cancelled or terminated run into success; managed workers
continue polling after that definitive rejection and after restart.

For server images, authentication, and production topology, continue with the
[server setup guide](/docs/2.0/polyglot/server).
