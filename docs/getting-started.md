---
sidebar_position: 2
title: Getting Started
description: Choose the fastest Durable Workflow 2.0 preview path for Laravel, Python, or operator workflows.
---

# Getting Started

Durable Workflow 2.0 is currently published as preview documentation. Use the
version picker for the stable 1.x docs; use this page when you want to try the
2.0 engine, standalone server, CLI, or Python SDK.

## Install Commands

| Surface | Command |
| --- | --- |
| Laravel package | `composer require durable-workflow/workflow:^2.0@alpha` |
| Standalone server image | `docker pull durableworkflow/server:0.2.2` |
| CLI | `curl -fsSL https://durable-workflow.com/install.sh \| sh` |
| Python SDK | `pip install durable-workflow` |

## Choose Your Path

### I am a Laravel user

The fastest Laravel path is the maintained sample application. It installs the
package, runs migrations, starts a queue worker, and executes a real workflow.

```bash
git clone https://github.com/durable-workflow/sample-app.git
cd sample-app
composer install
php artisan app:init
```

Keep the worker running in one terminal:

```bash
php artisan queue:work
```

Start the example workflow from a second terminal:

```bash
php artisan app:workflow
```

You now have a workflow running through Laravel queues and durable workflow
state. Open `/waterline/dashboard` in the sample app to inspect the run, or
continue with the [sample app guide](/docs/2.0/sample-app).

### I am a Python user

The Python SDK repository includes a deployable order-processing sample. It
starts a local Durable Workflow server, starts a Python worker, runs inventory,
payment, shipment, and confirmation activities, then exits after the workflow
completes.

```bash
git clone https://github.com/durable-workflow/sdk-python.git
cd sdk-python/examples/order_processing
docker compose up --build --exit-code-from python-worker python-worker
docker compose down -v
```

The `python-worker` service prints the completed order result as JSON. A
successful run ends with `status` set to `confirmed`. Continue with the
[Python SDK guide](/docs/2.0/polyglot/python) when you are ready to write your
own workflow and activities.

### I am an operator

Operators usually care about the server, CLI, namespaces, worker health, and
workflow visibility. Use the Python order-processing sample as a real workload,
then inspect it through `dw`.

Start the sample stack and leave it running:

```bash
git clone https://github.com/durable-workflow/sdk-python.git
cd sdk-python/examples/order_processing
docker compose up --build
```

Install and point the CLI at the sample server from another terminal:

```bash
curl -fsSL https://durable-workflow.com/install.sh | sh

export DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080
export DURABLE_WORKFLOW_AUTH_TOKEN=sample-token
export DURABLE_WORKFLOW_NAMESPACE=default

dw server:health
dw workflow:list
```

The stack publishes the server on `localhost:8080`, uses `sample-token`, and
runs a workflow to completion. Clean up when you are done:

```bash
docker compose down -v
```

Continue with the [server setup guide](/docs/2.0/polyglot/server) and
[CLI guide](/docs/2.0/polyglot/cli) for production authentication, deployment,
and operational commands.

## The Loop You Just Ran

1. A client starts a workflow through either Laravel code or the server HTTP
   control-plane API.
2. The engine records durable history and creates workflow or activity tasks in
   the configured task queue.
3. A worker polls for tasks, executes workflow replay or activity code, and
   sends completion commands back to the engine.
4. The engine appends more history, schedules the next task, or marks the
   workflow complete.
5. Operators inspect the same durable state through Waterline, the CLI, or the
   server API.

That cycle is the product boundary: durable state in the engine, ordinary code
in workers, and HTTP or Laravel APIs for starting and observing work.
