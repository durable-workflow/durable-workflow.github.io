---
sidebar_position: 4
title: Rust Cloud Quickstart
description: Run a Rust workflow and activity against one Durable Workflow Cloud namespace with the supported SDK and CLI.
tags:
  - Rust
  - Cloud
  - quickstart
  - workers
keywords:
  - Rust Cloud quickstart
  - namespace runtime URL
  - Rust worker
  - dw workflow start
---

# Rust Cloud Quickstart

:::caution Controlled early access

Durable Workflow Cloud is available through controlled early access. Use this
guide only with a provisioned Cloud namespace and its role-scoped runtime
credentials. For generally available Rust SDK setup and API guidance, start
with the [Rust SDK guide](./rust.md).

:::

This is the shortest supported Rust path from a fresh Sample App Codespace to a
completed Durable Workflow Cloud run. It uses the Rust and CLI prerelease
channels resolved by the Sample App's machine-owned dependency metadata. It
builds the small worker in development mode; there is no custom release build.

The path has three credential roles:

- A Cloud API key administers namespaces and creates credentials. It is not
  used by this execution path.
- A client runtime credential lets `dw` start and inspect workflows.
- A worker runtime credential lets the Rust process register, poll, heartbeat,
  complete work, and deregister during shutdown.

The client and worker credentials must be different secrets. Both execution
roles connect to the same namespace runtime URL and runtime namespace.

## 1. Open the prepared Sample App

[Create a Codespace from the Sample App `main`
branch](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main),
wait for setup to finish, and open a terminal at the repository root. The
prepared image already includes Rust 1.86 or newer, Cargo, and `dw`.

Configure the values returned by Cloud when the namespace and its two runtime
credentials were created:

<!-- docs-example id="rust.cloud.environment" -->
```bash
export DURABLE_WORKFLOW_RUNTIME_URL='https://cloud.example/api/runtime/v1/namespaces/00000000-0000-4000-8000-000000000000'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='orders'
export DURABLE_WORKFLOW_CLIENT_TOKEN='dwr_client_credential'
export DURABLE_WORKFLOW_WORKER_TOKEN='dwr_worker_credential'
export DURABLE_WORKFLOW_TASK_QUEUE='rust-cloud-quickstart'
export DURABLE_WORKFLOW_MANAGED_WATERLINE_URL='https://managed-waterline-url-from-cloud'
```

`DURABLE_WORKFLOW_RUNTIME_URL` is the complete namespace-scoped runtime URL.
Its path ends at the namespace identifier; it does not end in `/api`. Do not
replace it with the Cloud administration URL or a self-hosted Server URL. The
SDK and CLI preserve that namespace path and append their own `/api` route.

## 2. Verify the supported CLI

The prepared Sample App image includes the current published CLI. Verify the
bundled command before continuing:

<!-- docs-example id="rust.cloud.cli" -->
```bash
command -v dw
dw --version
```

`scripts/rust-cloud.sh run` validates `dw` against the Sample App's
machine-readable qualified tuple; a stale prepared image fails before starting
the worker. Outside the prepared image, install the supported prerelease
channel and rerun the validation:

<!-- docs-example id="rust.cloud.cli.install" -->
```bash
%%artifact.cliChannelInstallerCommand%%
dw --version
```

The installer and `dw upgrade` report if another binary shadows the selected
release. Resolve that bounded `PATH` instruction before continuing.

## 3. Start the Rust worker

In the first terminal, run the Sample App's dedicated worker entry point:

<!-- docs-example id="rust.cloud.worker" -->
```bash
scripts/rust-cloud.sh worker
```

The worker registers one `sample.rust-cloud.greeter` workflow and one
`sample.rust-cloud.greet` activity on `rust-cloud-quickstart`. It reads only the
worker credential. Press Ctrl+C after the result is complete; the SDK stops its
pollers and deregisters the worker before exiting.

For a one-terminal evaluator path, `scripts/rust-cloud.sh run` builds the same
development binary, starts it, runs the CLI command below, retains version and
result evidence, and then performs the same clean shutdown.

## 4. Start and wait for the workflow

In a second terminal with the same environment, record the SDK and CLI
versions, then start the workflow with the client credential:

<!-- docs-example id="rust.cloud.version-evidence" -->
```bash
cargo tree --locked --manifest-path rust-cloud/Cargo.toml -p durable-workflow --depth 0
dw --version
```

<!-- docs-example id="rust.cloud.start" -->
```bash
export RUST_CLOUD_WORKFLOW_ID="rust-cloud-$(date +%s)"
dw workflow:start \
  --server="$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace="$DURABLE_WORKFLOW_RUNTIME_NAMESPACE" \
  --token="$DURABLE_WORKFLOW_CLIENT_TOKEN" \
  --type=sample.rust-cloud.greeter \
  --task-queue="$DURABLE_WORKFLOW_TASK_QUEUE" \
  --workflow-id="$RUST_CLOUD_WORKFLOW_ID" \
  --input='["Cloud"]' \
  --wait --json | tee rust-cloud-result.json
```

Successful JSON has `status_bucket: "completed"` and an `output` object with a
Rust greeting and activity evidence. Keep `rust-cloud-result.json`, the Cargo
version line, and `dw --version` with clean-machine validation evidence.

Open `DURABLE_WORKFLOW_MANAGED_WATERLINE_URL`, search for
`RUST_CLOUD_WORKFLOW_ID`, and confirm the selected run is completed. Its history
shows the workflow task and `sample.rust-cloud.greet` activity task. Managed
Waterline is the operator surface for this Cloud namespace; do not deploy a
separate Waterline instance.

## Bounded diagnosis

If `--wait` reports no compatible worker, keep it running while checking that
the worker terminal reached registration, both terminals use the exact same
runtime URL, namespace, and task queue, and the worker token has the worker
role. A worker token passed to `dw` produces a client-credential authorization
error; a client token passed to the worker produces the corresponding worker
credential error.

If the worker reports an incompatible protocol or SDK, compare the recorded
Cargo and CLI versions with the CLI diagnostic, update the Sample App checkout,
and rerun the development build. Do not switch to an older checked-in
prerelease or add a release build flag.

If a task is leased but never completes, keep the worker alive and inspect the
run in Managed Waterline. Match the leased workflow or activity type and task
queue to the worker output, then use the CLI's periodic JSON diagnostic to
distinguish a pending workflow task, pending activity, recent handler failure,
or lost worker. Do not start a second workflow until the first run's durable
state is understood.

## Raw HTTP is a protocol example

The supported onboarding path is `dw workflow:start`; it recognizes the Cloud
namespace runtime URL and supplies version headers. When diagnosing the wire
contract itself, the equivalent control-plane request includes the required
version header explicitly:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_RUNTIME_URL/api/workflows" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_CLIENT_TOKEN" \
  -H "X-Namespace: $DURABLE_WORKFLOW_RUNTIME_NAMESPACE" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H 'Content-Type: application/json' \
  -d '{"workflow_type":"sample.rust-cloud.greeter","workflow_id":"rust-cloud-protocol-example","task_queue":"rust-cloud-quickstart","input":["Cloud"]}'
```

This raw request is a protocol example, not a fallback onboarding path. It does
not replace CLI discovery, `--wait --json`, version recording, or Managed
Waterline verification.

Return to the broader [Rust SDK guide](./rust.md), then use the generated
[Rust API reference](https://rust.durable-workflow.com/durable_workflow/) for individual types
and methods.
