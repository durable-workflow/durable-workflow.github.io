---
sidebar_position: 9
title: PHP SDK
description: Connect framework-neutral PHP applications and remote workers to a self-hosted Server or Cloud managed runtime.
tags:
  - php
  - sdk
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - Durable Workflow PHP SDK
  - PHP remote worker
  - PHP standalone server client
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# PHP SDK

Use `durable-workflow/sdk` when a PHP application or remote worker connects to
the standalone Durable Workflow Server or a Durable Workflow Cloud namespace
runtime URL. This first-party SDK is framework-neutral: it provides the
control-plane client, authentication, transport, public payload codec, replay
handler, and managed remote-worker lifecycle without requiring Laravel or the
embedded engine package.

## Try the local Sample App playground

For the shortest no-Cloud authoring journey, open the current Sample App
[`main` branch in GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
and run:

<!-- docs-example id="sdk.php.sample-app-playground" -->
```bash
scripts/playground php
```

The local playground generates caller-owned workflow and activity source,
selects the current compatibility-qualified artifacts, and starts the published
Server and Waterline. It waits for a worker registration whose identity,
workflow type, activity type, and task queue match the generated contract before
starting the workflow. Success requires the expected completed result and
history; the terminal then prints the exact local Waterline run link and the
path to structured JSON evidence.

The package-owned quickstart and API reference below remain the direct path for
users who want to add the SDK to an existing project without Sample App.

<ProductPromotion source="docs-v2-php-sdk">
Run PHP clients and workers against a Cloud-managed namespace with separate
role-scoped credentials.
</ProductPromotion>

For step-by-step onboarding, framework paths, testing, deployment, and
troubleshooting, use the authored
[PHP developer portal](https://php.durable-workflow.com/). For exact
constructor signatures, return types, and exception classes, use its distinct
[generated API reference](https://php.durable-workflow.com/api/). The portal's
[machine-readable contract](https://php.durable-workflow.com/quickstart-contract.json)
identifies the package, runtime forms, role credentials, shipped source files,
expected result, and published-artifact smoke as one tested path.

Cloud customers use the runtime URL and namespace returned during provisioning,
with separate client and worker credentials. See
[Cloud Managed Runtime](/docs/2.0/polyglot/cloud-control-plane) for that
connection boundary; the examples below show the same SDK against local
self-hosted values.

Use `durable-workflow/workflow` for the separate embedded Laravel path, where
the application owns workflow state in its existing database and executes work
through its Laravel queues. See [Deployment Modes](/docs/2.0/polyglot/deployment-modes/)
for the complete ownership comparison.

## Requirements

- PHP 8.1 or later
- A reachable [self-hosted Server](/docs/2.0/polyglot/server/) or provisioned
  [Cloud namespace runtime](/docs/2.0/polyglot/cloud-control-plane)

## Install

Install the current published PHP SDK. The exact requirement below is generated
from the registry-refreshed published-artifact authority, and Composer records
the resolved package in `composer.lock`:

<!-- docs-example id="php.sdk.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

The SDK uses the official `apache/avro` Composer package for the public payload
envelope. Its production dependency graph excludes Laravel, Illuminate,
`durable-workflow/workflow`, and `durable-workflow/server`.

## Start and inspect a workflow

The SDK-owned quickstart creates a clean Composer project, defines one
attributed workflow and activity, starts the worker, starts a unique workflow,
and waits for the result. The same shipped `bootstrap.php`, `worker.php`, and
`client.php` files are installed from the package and executed by the protected
published-artifact smoke, so this page does not maintain a second code listing.

Choose only the runtime connection value:

| Runtime | Value passed to `Client` | SDK request path behavior |
| --- | --- | --- |
| Self-hosted Server | Bare origin such as `http://localhost:8080` | Adds one `/api` segment; callers do not append `/api`. |
| Durable Workflow Cloud | Complete provisioned URI such as `https://cloud.example/api/runtime/v1/namespaces/<runtime-id>` | Preserves the namespace runtime path and appends endpoint `/api` after it. |

Open the [tested PHP path](https://php.durable-workflow.com/) for the exact
commands and visible source. Client operations read
`DURABLE_WORKFLOW_CLIENT_TOKEN`; worker polling reads
`DURABLE_WORKFLOW_WORKER_TOKEN`. The guide keeps those credentials in separate
processes without echoing or committing either value.

`Worker::register()` discovers `#[Workflow]` and `#[Activity]` handlers in the
same source file. The guide also documents the direct
`registerWorkflow()`/`registerActivity()` alternative for callable-first code.
The bootstrap removes autoloader-path selection from users when those shipped
files run in a standalone project, SDK checkout, installed package, or a
playground/container that places them beside its Composer `vendor/` directory.

`WorkflowHandle` follows the current run after a continue-as-new transition.
Use its selected-run methods when an operation must remain guarded to one
specific run.

## Lifecycle, updates, schedules, and visibility

The current public client is broader than selected-run result handling:

- `WorkflowHandle` exposes `describe`, `result`, `signal`, `query`, `cancel`,
  and `terminate`, with selected-run variants for run-specific safety.
- `Client` exposes `listWorkflows` with server filtering and pagination,
  `workflowHistory`, `updateWorkflow`, `cancelWorkflow`, and
  `terminateWorkflow`.
- Schedule methods cover create, describe, list, update, pause, resume,
  trigger, backfill, and delete.
- Operational visibility includes `listNamespaces`, `listWorkers`, and
  `listTaskQueues`, with matching describe methods.

Remote workers register workflow, activity, query, and update handlers through
`registerWorkflow`, `registerActivity`, `registerQuery`, and `registerUpdate`.
Use the generated [PHP SDK API reference](https://php.durable-workflow.com/api/)
for complete parameters and return types.

## Run a remote PHP worker

Workflow handlers are ordinary callables that run as straight-line code inside
a managed Fiber. Call operations such as `WorkflowContext::activity()`
directly; the SDK suspends the Fiber at durable decisions and returns recorded
results during replay without repeating external activity. Do not declare a
workflow as a Generator or yield `WorkflowContext` commands: Generator results
are rejected. The managed worker registers its workflow and activity type
names, polls the public worker protocol, heartbeats, completes or fails tasks,
and handles graceful shutdown when `pcntl` is available.

## Framework service mode and embedded Laravel

The same package ships first-party
[Laravel service-mode](https://github.com/durable-workflow/sdk-php#laravel-service-mode)
and
[Symfony service-mode](https://github.com/durable-workflow/sdk-php#symfony-service-mode)
bridges. They retain framework dependency injection, configuration, logging,
console workers, and test fakes while connecting to Cloud or Server.

Those bridges are distinct from
[embedded Laravel workflows](/docs/2.0/installation/), where
`durable-workflow/workflow` makes the Laravel application itself own durable
state and execute through Laravel queues. See
[Laravel Adoption and Runtime Transition](/docs/2.0/laravel-adoption/) for the
same representative Laravel use case across v1, v2 embedded, and this shipped
service-mode bridge, including drain and rollback. Use
[Deployment Modes](/docs/2.0/polyglot/deployment-modes/) for the wider runtime
boundary comparison.

## Protocol and release boundary

The SDK declares its supported server range, worker protocol version,
control-plane version, and payload codecs in Composer metadata. The server also
publishes its accepted protocol and codec set from `GET /api/cluster/info`.
Check runtime discovery during deployment instead of inferring compatibility
from a server patch version.

The PHP SDK is versioned independently from the 2.0 Laravel package. Keep the
exact published pin in runnable prerelease examples and evaluate release notes
when moving between pre-1.0 SDK releases; no cross-release shim is implied.

## Related references

- [Standalone Server](/docs/2.0/polyglot/server/)
- [Deployment Modes](/docs/2.0/polyglot/deployment-modes/)
- [Worker Protocol](/docs/2.0/polyglot/worker-protocol/)
- [Capability Index](/docs/2.0/capabilities/)
- [PHP developer portal](https://php.durable-workflow.com/)
- [PHP API reference](https://php.durable-workflow.com/api/)
- [PHP executable quickstart contract](https://php.durable-workflow.com/quickstart-contract.json)
- [PHP SDK source](https://github.com/durable-workflow/sdk-php)
