---
sidebar_position: 4
title: Rust Cloud Quickstart
description: Run the shared Sample App Rust playground against a provisioned Durable Workflow Cloud namespace.
tags:
  - Rust
  - Cloud
  - quickstart
  - workers
keywords:
  - Rust Cloud quickstart
  - namespace runtime URL
  - Rust worker
  - Sample App playground
---

# Rust Cloud Quickstart

:::caution Controlled early access

Durable Workflow Cloud is available through controlled early access. Use this
guide only after Cloud has provisioned a namespace and two role-scoped runtime
credentials. The generally available Rust journey does not require Cloud; start
with the [Rust SDK guide](./rust.md) or run `scripts/playground rust` against
the playground's default local runtime.

:::

The Sample App exposes one symmetric playground for PHP, Python, and Rust. This
page selects Rust and changes only the runtime target. The corresponding
[PHP](./php.md) and [Python](./python.md) SDK paths use the same command with
`php` or `python`; the [Sample App playground
contract](https://github.com/durable-workflow/sample-app/blob/main/README.md#symmetric-sdk-playground)
documents all three choices.

The playground resolves the current stable artifact versions from the Sample
App's machine-owned metadata. Use those generated versions instead of copying
version numbers into these commands or adding a separate SDK installation step.

## 1. Open the prepared Sample App

[Create a Codespace from the Sample App `main`
branch](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main),
wait for setup to finish, and open a terminal at the repository root. The
prepared image contains the SDK toolchains and `dw` required by the shared
playground.

Cloud provides the runtime URL, runtime namespace, and two role credentials.
Choose an application task queue, then export these placeholders only after
replacing them with the corresponding values:

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<rust-task-queue>'
```

The runtime URL is the namespace runtime root returned by Cloud. It must be an
absolute HTTPS URL without a query, fragment, or terminal `/api`; the SDK and
CLI append their own API routes. The runtime namespace is the separate value
returned with that URL, not a name inferred from its path.

The client credential starts, describes, and reads workflows. The worker
credential registers, polls, heartbeats, and completes tasks. They must be
different role-scoped secrets even though this one command launches both child
processes. A Cloud administration key manages namespaces and credentials; do
not export or pass it as either runtime credential.

## 2. Run the Rust journey

Run the shared external-runtime contract:

```bash
scripts/playground rust --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_RUNTIME_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

The command scaffolds missing files under `.playground/rust` without replacing
caller-owned source. It prints the effective workflow type, activity type,
queue, worker command, client command, input, and expected result before it
starts anything. The worker receives only the worker credential; after its
exact registration becomes visible, the client receives only the client
credential.

The registration wait is bounded to 60 seconds. Do not treat process startup
alone as readiness. Continue only after the command prints a checkpoint shaped
like this (identities are illustrative):

```text
Worker ready: target=managed runtime_url=<provisioned-runtime-url> namespace=<provisioned-runtime-namespace> id=<worker-id> queue=<rust-task-queue> workflow_type=sample-app.playground.rust.authored-workflow activity_type=sample-app.playground.rust.authored-activity
```

The same command starts one workflow, waits up to 120 seconds for the SDK
client result, confirms `status=completed` with `dw`, and checks the required
workflow and activity history. One successful result looks like:

```text
Completed rust workflow <workflow-id>: {"greeting":"Hello, Durable Workflow, from the Sample App Rust playground","input":{"name":"Durable Workflow"},"activity_runtime":"rust","workflow_runtime":"rust"}
```

The final `Playground success` line repeats the runtime target, namespace,
queue, registered types, and expected result shape without credential values.
The command also writes `storage/app/playground-rust-evidence.json` with the
selected artifact versions, exact registration, workflow/run identity,
`completed` status, result, and history event types. Managed Waterline remains
the operator surface for the provisioned namespace; the managed journey does
not start a local Server or Waterline.

## Bounded diagnosis

If the `Worker ready` checkpoint does not appear within 60 seconds, start with
the effective contract printed above the error:

- **Queue mismatch:** the runner queries the exact value passed to
  `--task-queue`. Confirm that Cloud admits that queue and that the printed
  registration uses the same value; then rerun the same command.
- **Type mismatch:** the error names the workflow and activity types the worker
  must advertise. Compare them with the effective contract. If caller-owned
  files contain older hard-coded registrations, update them or prove the
  current scaffold in a new directory with
  `--source "$HOME/durable-rust-worker"`.
- **Credential-role mismatch:** authorization before registration points to
  the worker credential; authorization while describing or starting the run
  points to the client credential. Do not swap the values or replace either
  with a Cloud administration key.
- **Runtime mismatch:** both roles must use the exact provisioned runtime URL
  and runtime namespace. Remove a terminal `/api`; do not substitute the Cloud
  administration URL or a self-hosted Server URL.

If registration succeeds but completion fails, keep the printed workflow/run
identity. Inspect that selected run in Managed Waterline and compare its
pending workflow or activity type and task queue with the effective contract.
Fix that mismatch before starting another run. The retained evidence path and
bounded worker output identify whether the client result, durable status,
expected result, or required history check failed.

Return to the broader [Rust SDK guide](./rust.md), or use the generated [Rust
API reference](https://rust.durable-workflow.com/durable_workflow/) for
individual types and methods.
