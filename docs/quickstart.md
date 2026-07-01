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
| Standalone server | `%%artifact.serverDockerHubImage%%` |
| CLI | `dw` `%%artifact.cliVersion%%` |
| Python SDK | `%%artifact.pythonPackagePin%%` |
| Laravel package | `%%artifact.workflowComposerPackage%%` |
| Waterline | `%%artifact.waterlineComposerPackage%%` |

The machine-readable <a href="https://durable-workflow.com/quickstart-execution-contract.json">quickstart execution contract</a>
lists the supported personas, hosting branches, public artifact sources, exact
command scripts, success probes, completion state, and teardown steps for this
2.0 prerelease path.

## Start A Local Server

Use this server for the Python and operator paths. It runs the published server
image with SQLite, so no source checkout, MySQL, or Redis setup is required.

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

## Python User

Create a clean project, install the published Python SDK, then run one workflow
to completion against the local server.

<!-- docs-example id="quickstart.python.install" -->
```bash
mkdir durable-workflow-python-quickstart
cd durable-workflow-python-quickstart

python3 -m venv .venv
. .venv/bin/activate
pip install %%artifact.pythonPackagePin%%
```

Create `greeter.py`:

<!-- docs-example id="quickstart.python.greeter" -->
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

<!-- docs-example id="quickstart.operator.setup" -->
```bash
curl -fsSL https://durable-workflow.com/install.sh | %%artifact.cliInstallerEnv%% sh
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

Set `QUICKSTART_WORKFLOW_ID` to the id printed by `python greeter.py` before
running this block; the first line fails clearly if it is missing. Then capture
the current run id and read the durable completed state:

<!-- docs-example id="quickstart.operator.observe" -->
```bash
export QUICKSTART_WORKFLOW_ID="${QUICKSTART_WORKFLOW_ID:?set to workflow_id printed by python greeter.py}"

dw workflow:describe "$QUICKSTART_WORKFLOW_ID" --output=json \
  | tee quickstart-workflow.json
export QUICKSTART_RUN_ID="$(
  python -c 'import json; print(json.load(open("quickstart-workflow.json"))["run_id"])'
)"

dw workflow:history "$QUICKSTART_WORKFLOW_ID" "$QUICKSTART_RUN_ID" --output=json
dw workflow:list --status=completed --output=json
```

An operator-only CLI session can verify server readiness, worker registration,
task queues, and completed runs. It does not create or complete a user workflow
by itself: completion requires a worker process that implements the workflow
type, such as the Python worker above or a Laravel queue worker below.

## Laravel User

Create a fresh Laravel app, install the published prerelease packages, define
one workflow and one activity, then let the queue worker complete the run.

<!-- docs-example id="quickstart.laravel.install" -->
```bash
composer create-project laravel/laravel durable-workflow-laravel-quickstart
cd durable-workflow-laravel-quickstart

composer require \
  %%artifact.workflowComposerPackage%% \
  %%artifact.waterlineComposerPackage%%
composer show durable-workflow/workflow
composer show durable-workflow/waterline

printf '\nQUEUE_CONNECTION=database\nWATERLINE_ALLOW_UNAUTHENTICATED=true\n' >> .env
php artisan key:generate
php artisan waterline:install
php artisan migrate
```

Create the workflow and activity:

<!-- docs-example id="quickstart.laravel.workflow-files" -->
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

<!-- docs-example id="quickstart.laravel.command" -->
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
        $deadline = now()->addMinutes(10);

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

Run the worker and start the workflow, capturing the command output and elapsed
time:

<!-- docs-example id="quickstart.laravel.run" -->
```bash
set -o pipefail

php artisan queue:work --tries=1 --timeout=60 \
  > storage/logs/quickstart-worker.log 2>&1 &
export QUICKSTART_QUEUE_PID=$!
trap 'kill "$QUICKSTART_QUEUE_PID" 2>/dev/null || true' EXIT

SECONDS=0
php artisan app:quickstart-workflow 2>&1 | tee quickstart-laravel-output.log
printf 'elapsed_seconds=%s\n' "$SECONDS"

if [ -s storage/logs/quickstart-worker.log ]; then
  sed -n '1,120p' storage/logs/quickstart-worker.log
fi

kill "$QUICKSTART_QUEUE_PID" 2>/dev/null || true
trap - EXIT
```

The successful output includes `status=completed` and `output=Hello, Laravel!`.
To inspect the operator view, run `php artisan serve` and open `/waterline`.

## Completion Criteria

Before tearing the quickstart down, verify each path reached an observable
state from published artifacts:

| Path | Observable proof |
| --- | --- |
| Local server hosting | `curl -sf http://localhost:8080/api/ready` succeeds, `curl -H "Authorization: Bearer $DW_AUTH_TOKEN" http://localhost:8080/api/cluster/info` returns JSON for the standalone server topology, and the Python workflow below completes against that server. |
| Python user | `python greeter.py` prints `workflow_id=quickstart-python-greeter-*`, `status=completed`, and `Hello, Python!` before the 60 seconds contract timeout. |
| Operator user | `dw doctor` and `dw server:health` succeed, `dw workflow:describe "$QUICKSTART_WORKFLOW_ID" --output=json` writes `run_id`, `dw workflow:history "$QUICKSTART_WORKFLOW_ID" "$QUICKSTART_RUN_ID" --output=json` shows history for that run, and `dw workflow:list --status=completed --output=json` shows the completed `quickstart-python-greeter-*` workflow on the same server profile. |
| Laravel user | `composer show durable-workflow/workflow` prints `durable-workflow/workflow` with `%%artifact.workflowVersion%%`, `composer show durable-workflow/waterline` prints `durable-workflow/waterline` with `%%artifact.waterlineVersion%%`, and `php artisan app:quickstart-workflow` prints `workflow_id=quickstart-laravel-*`, `status=completed`, `output=Hello, Laravel!`, and `elapsed_seconds=` before the 600 seconds contract timeout while the Laravel queue worker is running. |

## Clean Up

Remove the CLI profile and workflow inspection file:

<!-- docs-example id="quickstart.operator.cleanup" -->
```bash
dw env:delete local || true
rm -f quickstart-workflow.json
```

Remove the Python workspace:

<!-- docs-example id="quickstart.python.cleanup" -->
```bash
deactivate 2>/dev/null || true
cd ..
rm -rf durable-workflow-python-quickstart
```

If you created the Laravel app but did not start the queue worker, remove the
app directory:

<!-- docs-example id="quickstart.laravel.app-cleanup" -->
```bash
cd ..
rm -rf durable-workflow-laravel-quickstart
```

If the Laravel queue worker might still be running, stop it before removing the
app directory:

<!-- docs-example id="quickstart.laravel.cleanup" -->
```bash
kill "$QUICKSTART_QUEUE_PID" 2>/dev/null || true
cd ..
rm -rf durable-workflow-laravel-quickstart
```

Stop and remove the standalone server:

<!-- docs-example id="quickstart.server.cleanup" -->
```bash
docker rm -f durable-workflow-server
docker volume rm durable-workflow-quickstart
```

For deeper guides, continue to [Python SDK](/docs/2.0/polyglot/python),
[Server](/docs/2.0/polyglot/server), [CLI](/docs/2.0/polyglot/cli), and
[Waterline Operator API](/docs/2.0/waterline-operator-api).
