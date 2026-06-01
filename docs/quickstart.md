---
sidebar_position: 2
title: 2.0 Prerelease Quickstart
description: A first-time path for Laravel, Python, and operator users evaluating Durable Workflow 2.0 prerelease artifacts.
tags:
  - quickstart
  - getting-started
  - Laravel
  - Python
  - operations
  - prerelease
keywords:
  - Durable Workflow quickstart
  - 2.0 prerelease quickstart
  - Laravel workflow quickstart
  - Python SDK quickstart
  - standalone server Docker quickstart
  - operator quickstart
---

# 2.0 Prerelease Quickstart

:::caution 2.0 prerelease

This page is for evaluating the Durable Workflow 2.0 release candidate. Stable
1.x remains the default public documentation line. Use this guide only when you
are intentionally testing 2.0 prerelease packages and images.

:::

This path uses published artifacts only:

| Surface | Artifact |
| --- | --- |
| Standalone server | `durableworkflow/server:0.2.206` |
| CLI | `dw` `0.1.70` |
| Python SDK | `durable-workflow==0.4.83` |
| Laravel package | `durable-workflow/workflow:2.0.0-alpha.187@alpha` |
| Waterline | `durable-workflow/waterline:2.0.0-alpha.69@alpha` |

## Start A Local Server

Use this server for the Python and operator paths. It runs the published server
image with SQLite, so no source checkout, MySQL, or Redis setup is required.

```bash
export DW_SERVER_IMAGE=durableworkflow/server:0.2.206
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

## Python User

Create a clean project, install the published Python SDK, then run one workflow
to completion against the local server.

```bash
mkdir durable-workflow-python-quickstart
cd durable-workflow-python-quickstart

python3 -m venv .venv
. .venv/bin/activate
pip install durable-workflow==0.4.83
```

Create `greeter.py`:

```bash
cat > greeter.py <<'PY'
import asyncio
import time

from durable_workflow import Client, Worker, activity, workflow


@activity.defn(name="quickstart.greet")
async def greet(name: str) -> dict:
    return {"greeting": f"Hello, {name}!", "length": len(name)}


@workflow.defn(name="quickstart.greeter")
class GreeterWorkflow:
    def run(self, ctx, name):
        result = yield ctx.schedule_activity("quickstart.greet", [name])
        return result


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

    print(f"workflow_id={workflow_id}")
    print("status=completed")
    print(f"result={result}")


asyncio.run(main())
PY

python greeter.py
```

The successful output includes `status=completed`, the workflow id, and the
activity result. Keep the printed workflow id for the operator check below.

## Operator User

Install the published CLI, point it at the same local server, then inspect the
completed Python workflow.

```bash
curl -fsSL https://durable-workflow.com/install.sh | VERSION=0.1.70 sh
export PATH="$HOME/.local/bin:$PATH"

dw env:set local \
  --server=http://localhost:8080 \
  --token=dev-token \
  --namespace=default \
  --make-default

dw doctor
dw server:health
dw server:info --output=json
```

Set `QUICKSTART_WORKFLOW_ID` to the id printed by `python greeter.py`, then
read the durable completed state:

```bash
export QUICKSTART_WORKFLOW_ID=quickstart-python-greeter-0000000000

dw workflow:describe "$QUICKSTART_WORKFLOW_ID" --output=json
dw workflow:history "$QUICKSTART_WORKFLOW_ID" --output=json
dw workflow:list --status=completed --output=json
```

An operator-only CLI session can verify server readiness, worker registration,
task queues, and completed runs. It cannot complete a user workflow by itself:
completion requires a worker process that implements the workflow type, such as
the Python worker above or a Laravel queue worker below.

## Laravel User

Create a fresh Laravel app, install the published prerelease packages, define
one workflow and one activity, then let the queue worker complete the run.

```bash
composer create-project laravel/laravel durable-workflow-laravel-quickstart
cd durable-workflow-laravel-quickstart

composer require \
  durable-workflow/workflow:2.0.0-alpha.187@alpha \
  durable-workflow/waterline:2.0.0-alpha.69@alpha

printf '\nQUEUE_CONNECTION=database\nWATERLINE_ALLOW_UNAUTHENTICATED=true\n' >> .env
php artisan key:generate
php artisan waterline:install
php artisan migrate
```

Create the workflow and activity:

```bash
mkdir -p app/Workflows/Quickstart

cat > app/Workflows/Quickstart/WelcomeActivity.php <<'PHP'
<?php

namespace App\Workflows\Quickstart;

use Workflow\V2\Activity;
use Workflow\V2\Attributes\Type;

#[Type('quickstart.laravel.welcome-activity')]
class WelcomeActivity extends Activity
{
    public function handle(string $name): string
    {
        return "Hello, {$name}!";
    }
}
PHP

cat > app/Workflows/Quickstart/WelcomeWorkflow.php <<'PHP'
<?php

namespace App\Workflows\Quickstart;

use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

use function Workflow\V2\activity;

#[Type('quickstart.laravel.welcome')]
class WelcomeWorkflow extends Workflow
{
    public function handle(string $name): string
    {
        return activity(WelcomeActivity::class, $name);
    }
}
PHP
```

Create an artisan command that starts the workflow and waits for a terminal
state:

```bash
mkdir -p app/Console/Commands

cat > app/Console/Commands/RunQuickstartWorkflow.php <<'PHP'
<?php

namespace App\Console\Commands;

use App\Workflows\Quickstart\WelcomeWorkflow;
use Illuminate\Console\Command;
use Workflow\V2\WorkflowStub;

class RunQuickstartWorkflow extends Command
{
    protected $signature = 'app:quickstart-workflow';

    protected $description = 'Run the Durable Workflow quickstart workflow.';

    public function handle(): int
    {
        $workflow = WorkflowStub::make(
            WelcomeWorkflow::class,
            'quickstart-laravel-'.now()->format('YmdHis')
        );

        $workflow->start('Laravel');
        $deadline = now()->addSeconds(60);

        while ($workflow->refresh()->running()) {
            if (now()->greaterThan($deadline)) {
                $this->error('status=timeout');
                $this->line('workflow_id='.$workflow->workflowId());

                return self::FAILURE;
            }

            usleep(100_000);
        }

        $this->line('workflow_id='.$workflow->workflowId());
        $this->line('status='.$workflow->status());
        $this->line('output='.$workflow->output());

        return $workflow->completed() ? self::SUCCESS : self::FAILURE;
    }
}
PHP
```

Run the worker and start the workflow:

```bash
php artisan queue:work --tries=1 --timeout=60 \
  > storage/logs/quickstart-worker.log 2>&1 &
export QUICKSTART_QUEUE_PID=$!

php artisan app:quickstart-workflow

kill "$QUICKSTART_QUEUE_PID" 2>/dev/null || true
```

The successful output includes `status=completed` and `output=Hello, Laravel!`.
To inspect the operator view, run `php artisan serve` and open `/waterline`.

## Completion Criteria

Before tearing the quickstart down, verify each path reached an observable
state from published artifacts:

| Path | Observable proof |
| --- | --- |
| Local server hosting | `curl http://localhost:8080/api/ready` succeeds, `GET /api/cluster/info` returns the standalone server topology, and the Python workflow below completes against that server. |
| Python user | `python greeter.py` prints `status=completed`, a `quickstart-python-greeter-*` workflow id, and the activity result. |
| Operator user | `dw workflow:describe "$QUICKSTART_WORKFLOW_ID" --output=json` and `dw workflow:list --status=completed --output=json` show the completed Python workflow on the same server profile. |
| Laravel user | `php artisan app:quickstart-workflow` prints `status=completed` and `output=Hello, Laravel!` while the Laravel queue worker is running. |

## Clean Up

```bash
docker rm -f durable-workflow-server
docker volume rm durable-workflow-quickstart
```

For deeper guides, continue to [Python SDK](/docs/2.0/polyglot/python),
[Server](/docs/2.0/polyglot/server), [CLI](/docs/2.0/polyglot/cli), and
[Waterline Operator API](/docs/2.0/waterline-operator-api).
