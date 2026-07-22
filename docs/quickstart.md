---
sidebar_position: 2
title: 2.0 Prerelease Quickstart
description: Complete a first Durable Workflow from PHP, Python, or Rust against the standalone 2.0 server.
tags:
  - quickstart
  - getting-started
  - PHP
  - Python
  - Rust
  - prerelease
keywords:
  - Durable Workflow quickstart
  - 2.0 prerelease quickstart
  - standalone PHP SDK quickstart
  - Python SDK quickstart
  - Rust SDK quickstart
  - standalone server Docker quickstart
---

# 2.0 Prerelease Quickstart

:::caution 2.0 prerelease

This guide uses the explicit 2.0 prerelease docs and exact published package
versions. Stable 1.x remains the default documentation line.

:::

Start the standalone Durable Workflow server, then choose **PHP**, **Python**,
or **Rust**. Each route creates its own project and ends by reading a completed
workflow and its durable result from the server. You do not need Laravel for
any of these routes.

The SDKs automatically use their official Apache Avro dependencies for the
default language-neutral payload envelope: `apache/avro` for PHP, `avro` for
Python, and `apache-avro` for Rust.

## Start the standalone server

You need Docker and `curl`. This source-free local server uses SQLite and a
development token. Keep it running while you complete one language route.

<!-- docs-example id="quickstart.server.setup" -->
```bash
export DW_SERVER_IMAGE=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-quickstart

docker run --rm \
  -v durable-workflow-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE" server-bootstrap

docker rm -f durable-workflow-server >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 8080:8080 \
  -v durable-workflow-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE"

until curl -sf http://localhost:8080/api/ready >/dev/null; do sleep 1; done
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info
```

The readiness request succeeds and cluster info identifies the local
standalone server. Now follow exactly one route below.

## PHP

Requirements: PHP 8.1 or newer and Composer. This is the framework-neutral
`durable-workflow/sdk` package, not the embedded Laravel engine.

### Install the SDK

<!-- docs-example id="quickstart.php.install" -->
```bash
mkdir durable-workflow-php-quickstart
cd durable-workflow-php-quickstart
composer require %%artifact.phpSdkComposerPackage%%
```

### Create the worker

The worker registers one workflow type and one activity type on its own task
queue.

<!-- docs-example id="quickstart.php.worker" -->
```bash
cat > worker.php <<'PHP'
<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use DurableWorkflow\Client;
use DurableWorkflow\Worker;
use DurableWorkflow\Worker\ActivityContext;
use DurableWorkflow\Worker\WorkflowContext;

$client = new Client('http://localhost:8080', token: 'dev-token');
$worker = new Worker($client, 'quickstart-php');

$worker->registerActivity(
    'quickstart.greet',
    static fn (ActivityContext $context, string $name): string => "Hello, {$name}!",
);

$worker->registerWorkflow(
    'quickstart.greeter',
    static function (WorkflowContext $context, string $name): Generator {
        $greeting = yield $context->activity('quickstart.greet', [$name]);

        return ['greeting' => $greeting, 'language' => 'php'];
    },
);

$worker->run();
PHP
```

### Create the starter and result reader

This client starts a uniquely named workflow, waits for its selected run, and
then describes the durable terminal state held by the server.

<!-- docs-example id="quickstart.php.client" -->
```bash
cat > start.php <<'PHP'
<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use DurableWorkflow\Client;

$client = new Client('http://localhost:8080', token: 'dev-token');
$workflowId = 'quickstart-php-greeter-'.bin2hex(random_bytes(4));
$handle = $client->startWorkflow(
    workflowType: 'quickstart.greeter',
    workflowId: $workflowId,
    taskQueue: 'quickstart-php',
    input: ['PHP'],
);

$result = $handle->result(timeoutSeconds: 30);
$execution = $handle->describeSelectedRun();

echo "workflow_id={$execution->workflowId}\n";
echo "status={$execution->status}\n";
echo 'result='.json_encode($result, JSON_THROW_ON_ERROR)."\n";
PHP
```

### Run it

<!-- docs-example id="quickstart.php.run" -->
```bash
php worker.php > quickstart-worker.log 2>&1 &
export QUICKSTART_WORKER_PID=$!
trap 'kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true' EXIT

php start.php

kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true
trap - EXIT
```

Success looks like this: `status=completed` and a result containing
`"greeting":"Hello, PHP!"`. You have run a standalone PHP worker and
inspected its durable result without Laravel.

Continue with the [PHP SDK guide](/docs/2.0/polyglot/php/), or return to the
language choices and try a separate route against the same server.

## Python

Requirements: Python 3.10 or newer. The program keeps the worker and client in
one process, but they still communicate with the server through the public
worker and control-plane APIs.

### Install the SDK

<!-- docs-example id="quickstart.python.install" -->
```bash
mkdir durable-workflow-python-quickstart
cd durable-workflow-python-quickstart

python3 -m venv .venv
. .venv/bin/activate
pip install %%artifact.pythonPackagePin%%
```

### Create the worker and starter

<!-- docs-example id="quickstart.python.greeter" -->
```bash
cat > greeter.py <<'PY'
import asyncio
import time

from durable_workflow import Client, Worker, activity, workflow


@activity.defn(name="quickstart.greet")
async def greet(name: str) -> dict:
    return {"greeting": f"Hello, {name}!", "language": "python"}


@workflow.defn(name="quickstart.greeter")
class GreeterWorkflow:
    def run(self, ctx, name):
        return (yield ctx.schedule_activity("quickstart.greet", [name]))


async def main():
    workflow_id = f"quickstart-python-greeter-{int(time.time())}"

    async with Client(
        "http://localhost:8080",
        token="dev-token",
        namespace="default",
    ) as client:
        handle = await client.start_workflow(
            workflow_type="quickstart.greeter",
            task_queue="quickstart-python",
            workflow_id=workflow_id,
            input=["Python"],
        )

        worker = Worker(
            client,
            task_queue="quickstart-python",
            workflows=[GreeterWorkflow],
            activities=[greet],
        )
        await worker.run_until(workflow_id=workflow_id, timeout=30.0)

        result = await handle.result(timeout=10.0)
        execution = await handle.describe_run()

    print(f"workflow_id={execution.workflow_id}")
    print(f"status={execution.status}")
    print(f"result={result}")


asyncio.run(main())
PY

python greeter.py
```

Success looks like this: `status=completed` and a result containing
`Hello, Python!`. The last two SDK calls read the selected run's result and
durable terminal state from the server.

Continue with the [Python SDK guide](/docs/2.0/polyglot/python/), or return to
the language choices and try a separate route against the same server.

## Rust

Requirements: Rust 1.86 or newer. This example runs a native worker and client
in one Tokio process.

### Install the SDK

<!-- docs-example id="quickstart.rust.install" -->
```bash
cargo new durable-workflow-rust-quickstart
cd durable-workflow-rust-quickstart
%%artifact.rustCargoAddCommand%%
cargo add tokio --features macros,rt-multi-thread,time
```

### Create the worker and starter

<!-- docs-example id="quickstart.rust.greeter" -->
```bash
cat > src/main.rs <<'RS'
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use durable_workflow::{json, Client, Result, Worker, WorkflowResultOptions};

#[tokio::main]
async fn main() -> Result<()> {
    let client = Client::builder("http://localhost:8080")
        .token(Some("dev-token".to_string()))
        .namespace("default")
        .build()?;
    let task_queue = "quickstart-rust";
    let mut worker = Worker::new(client.clone(), task_queue);

    worker.register_activity("quickstart.greet", |_context, arguments| async move {
        let name = arguments
            .get(0)
            .and_then(|value| value.as_str())
            .unwrap_or("Rust");
        Ok(json!({"greeting": format!("Hello, {name}!"), "language": "rust"}))
    });

    worker.register_workflow("quickstart.greeter", |context, input| async move {
        let name = input.get(0).and_then(|value| value.as_str()).unwrap_or("Rust");
        context.activity("quickstart.greet", json!([name])).await
    });

    worker.register().await?;
    let workflow_id = format!("quickstart-rust-greeter-{}", unique_suffix());
    let handle = client
        .start_workflow(
            "quickstart.greeter",
            task_queue,
            &workflow_id,
            json!(["Rust"]),
        )
        .await?;

    let watcher = handle.clone();
    worker
        .run_until(async move {
            loop {
                if watcher.describe().await.is_ok_and(|run| run.is_terminal()) {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        })
        .await?;

    let result = handle.result(WorkflowResultOptions::default()).await?;
    let execution = handle.describe_selected_run().await?;

    println!("workflow_id={workflow_id}");
    println!("status={}", execution.status.as_deref().unwrap_or("unknown"));
    println!("result={result}");
    Ok(())
}

fn unique_suffix() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
RS

cargo run
```

Success looks like this: `status=completed` and a JSON result containing
`"greeting":"Hello, Rust!"`. The example waits for its worker to finish the
run, then reads the selected run's durable status and decoded result.

Continue with the [Rust SDK guide](/docs/2.0/polyglot/rust/).

## Optional: embed the runtime in Laravel

Embedded Laravel is a separate first-party PHP deployment mode for
applications that want workflow state, queue execution, configuration, and
operator tooling inside their existing Laravel infrastructure. It installs
`durable-workflow/workflow`; it does not use the standalone server or
`durable-workflow/sdk`.

Start a fresh embedded application with the published package:

```bash
composer create-project laravel/laravel durable-workflow-laravel-quickstart
cd durable-workflow-laravel-quickstart
composer require %%artifact.workflowComposerPackage%%
php artisan migrate
php artisan queue:work
```

Continue with [Embedded Installation](/docs/2.0/installation/) to configure a
non-`sync` Laravel queue, then [define](/docs/2.0/defining-workflows/workflows/)
and [start](/docs/2.0/defining-workflows/starting-workflows/) an embedded
workflow. [Deployment Modes](/docs/2.0/polyglot/deployment-modes/) compares
this specialized route with the standalone platform.

## Next steps

- Use the [agent operating loop](/docs/2.0/agent-operating-loop/) for
  discover, change, run, diagnose, and repair operations.
- Add durable [timers](/docs/2.0/features/timers/) and configure activity
  [retries and execution policy](/docs/2.0/features/activity-execution-model/).
- Exchange [signals](/docs/2.0/features/signals/) and expose read-only
  [queries](/docs/2.0/features/queries/).
- Compose [child workflows](/docs/2.0/features/child-workflows/) and plan safe
  [worker build-ID rollouts](/docs/2.0/polyglot/worker-build-id-rollout/).

Release qualification is intentionally separate from this first-success
guide. The [Platform Conformance Suite](/docs/2.0/platform-conformance/)
contains the exact artifact matrix, public-source checks, full execution
transcripts, wall-clock criteria, teardown, and machine-readable quickstart
contract used for certification.
