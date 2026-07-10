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
Durable Workflow. It can register workflow and activity handlers, start and
signal executions, report worker and activity heartbeats, and exchange
language-neutral payloads with the standalone server.

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
For server images, authentication, and production topology, continue with the
[server setup guide](/docs/2.0/polyglot/server).
