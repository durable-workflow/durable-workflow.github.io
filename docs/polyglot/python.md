---
sidebar_position: 3
---

# Python SDK

The Python SDK is a thin, async-first client for the Durable Workflow server. It lets Python processes start, observe, signal, and cancel workflows through the server's control-plane API, and register as workers that execute workflow tasks and activities.

The SDK targets the same durable model as the PHP package — instance IDs, run IDs, history events, task queues, and type keys are shared across languages. A Python worker can serve activities for a PHP-authored workflow, and vice versa.

## Requirements

- Python 3.10 or later
- Docker (for the local server used in this quickstart) or an existing [Durable Workflow server](/docs/2.0/polyglot/server)

## Installation

```bash
pip install durable-workflow
```

The SDK depends on [httpx](https://www.python-httpx.org/) for HTTP and Apache Avro for the default language-neutral payload codec. Prometheus metrics support is optional.

## Quickstart

The quickstart has two steps: start a local server, then run the Python worker against it.

### 1. Start a local server

The fastest path is the server's Docker Compose stack, which brings up the server plus its MySQL and Redis dependencies. The snippet below disables authentication for local development — do not use `WORKFLOW_SERVER_AUTH_DRIVER=none` in production.

```bash
git clone https://github.com/durable-workflow/server.git
cd server

# Generate an APP_KEY and disable auth for local dev.
cp .env.example .env
printf '\nAPP_KEY=base64:%s\nWORKFLOW_SERVER_AUTH_DRIVER=none\n' \
  "$(head -c 32 /dev/urandom | base64)" >> .env

docker compose up -d

# Wait for the health check to pass.
until curl -sf http://localhost:8080/api/health > /dev/null; do sleep 1; done
echo "Server is ready."
```

For a full walkthrough — auth drivers, database config, production deployment — see the [server setup guide](/docs/2.0/polyglot/server).

### 2. Run the Python worker

This example defines a workflow with one activity, starts it against the local server, and waits for the result.

```python
import asyncio
from durable_workflow import Client, Worker, workflow, activity

@activity.defn(name="greet")
async def greet(name: str) -> dict:
    return {"greeting": f"Hello, {name}!", "length": len(name)}

@workflow.defn(name="greeter")
class GreeterWorkflow:
    def run(self, ctx, *args):
        result = yield ctx.schedule_activity("greet", list(args))
        return result

async def main():
    # token=None matches WORKFLOW_SERVER_AUTH_DRIVER=none in the server .env.
    # If you set a token instead, pass token="your-token" here.
    async with Client("http://localhost:8080") as client:
        handle = await client.start_workflow(
            workflow_type="greeter",
            task_queue="default",
            workflow_id="greeting-1",
            input=["world"],
        )

        worker = Worker(
            client,
            task_queue="default",
            workflows=[GreeterWorkflow],
            activities=[greet],
        )

        await worker.run_until(workflow_id="greeting-1", timeout=30.0)
        result = await handle.result(timeout=10.0)

    print(result)  # {"greeting": "Hello, world!", "length": 5}

asyncio.run(main())
```

For a deployable multi-step example, the SDK repository includes
`examples/order_processing`: a Docker Compose stack that starts the server,
runs a Python worker, and completes an order workflow through inventory,
payment, shipment, and confirmation activities.

## Client

The `Client` class is the primary interface for control-plane operations. It communicates with the server over HTTP+JSON.

```python
from durable_workflow import Client

client = Client(
    "http://localhost:8080",
    token="your-api-token",   # optional, depends on server auth config
    control_token=None,        # optional operator/admin token for control-plane calls
    worker_token=None,         # optional worker token for worker polling/completion
    namespace="default",       # namespace for all operations
    timeout=60.0,              # HTTP request timeout in seconds
    metrics=None,              # optional metrics recorder
)
```

Use the client as an async context manager to ensure the underlying HTTP connection is closed:

```python
async with Client("http://localhost:8080") as client:
    ...
```

### Authentication and namespaces

The SDK sends bearer credentials with `Authorization: Bearer ...` and sends the
configured namespace on every request as `X-Namespace`.

Use `token=` for development servers or deployments that still use one shared
server token:

```python
client = Client("http://localhost:8080", token="shared-token", namespace="default")
```

For production servers with role-scoped credentials, use plane-specific tokens
so the same client can start workflows with an operator/admin token and run a
worker with a worker token:

```python
client = Client(
    "https://workflow.example.internal",
    control_token="operator-token",
    worker_token="worker-token",
    namespace="orders",
)
```

When a deployment issues namespace-scoped tokens, create one client per
namespace and pass that namespace's token. The server must provision the
namespace before client or worker requests target it.

The server does not expose native mTLS authentication yet. Terminate TLS or mTLS
at your ingress or service mesh today, forward only trusted traffic to the
server, and keep bearer tokens enabled until a server-side mTLS auth driver is
available.

### Starting a Workflow

```python
handle = await client.start_workflow(
    workflow_type="greeter",
    task_queue="default",
    workflow_id="greeting-1",
    input=["world"],
    execution_timeout_seconds=3600,
    run_timeout_seconds=600,
)
```

The returned `WorkflowHandle` provides methods for interacting with the running workflow.

### Workflow Handle

```python
handle = client.get_workflow_handle("greeting-1")

# Wait for the result
result = await handle.result(timeout=30.0)

# Describe the workflow
execution = await handle.describe()
print(execution.status)  # "completed", "running", etc.

# Signal the workflow
await handle.signal("my_signal", [{"key": "value"}])

# Query the workflow
answer = await handle.query("current_state")

# Cancel or terminate
await handle.cancel(reason="no longer needed")
await handle.terminate(reason="stuck workflow")
```

### Listing Workflows

```python
workflow_list = await client.list_workflows(
    workflow_type="greeter",
    status="running",
    page_size=50,
)

for execution in workflow_list.executions:
    print(f"{execution.workflow_id}: {execution.status}")
```

### Updates

Updates allow you to send a mutation to a running workflow and wait for the result:

```python
result = await client.update_workflow(
    "my-workflow-id",
    "approve",
    args=[{"approved": True}],
    wait_for="accepted",
    wait_timeout_seconds=10,
)
```

## Defining Workflows

Workflows are Python classes decorated with `@workflow.defn`. The `run` method is a generator that yields commands to the server.

```python
from durable_workflow import workflow

@workflow.defn(name="order-processing")
class OrderWorkflow:
    def run(self, ctx, *args):
        order = args[0] if args else {}

        # Schedule an activity and wait for the result
        validated = yield ctx.schedule_activity(
            "validate_order", [order]
        )

        # Start a timer (durable sleep)
        yield ctx.start_timer(seconds=60)

        # Schedule another activity
        receipt = yield ctx.schedule_activity(
            "process_payment", [validated]
        )

        return receipt
```

The `name` in `@workflow.defn(name="...")` is the type key used across all languages. It must be a plain string — not a Python module path or class reference.

### Workflow Context

The `WorkflowContext` passed to `run` provides deterministic operations:

| Method | Description |
|--------|-------------|
| `ctx.schedule_activity(type, args)` | Schedule an activity task |
| `ctx.start_timer(seconds)` | Durable sleep |
| `ctx.start_child_workflow(type, args)` | Start a child workflow |
| `ctx.side_effect(fn)` | Capture a non-deterministic value |
| `ctx.get_version(change_id, min, max)` | Safe workflow code versioning |
| `ctx.upsert_search_attributes(attrs)` | Update search attributes |
| `ctx.continue_as_new(*args)` | Restart the workflow with new input |
| `ctx.now()` | Deterministic clock (from history) |
| `ctx.random()` | Seeded random generator |
| `ctx.uuid4()` | Deterministic UUID |
| `ctx.logger` | Logger that is silent during replay |

### Determinism Rules

Workflow code is replayed from history. It must not perform any non-deterministic operations directly:

- No I/O (HTTP calls, file reads, database queries)
- No `datetime.now()` or `time.time()` — use `ctx.now()`
- No `random.random()` — use `ctx.random()`
- No `uuid.uuid4()` — use `ctx.uuid4()`

All non-determinism must flow through the context or be captured with `ctx.side_effect()`.

### Fan-Out

Yield a list of commands to run them concurrently:

```python
@workflow.defn(name="fan-out-example")
class FanOutWorkflow:
    def run(self, ctx, *args):
        items = args[0]

        # Schedule all activities at once
        results = yield [
            ctx.schedule_activity("process_item", [item])
            for item in items
        ]

        return results  # list of results in the same order
```

### Child Workflows

```python
result = yield ctx.start_child_workflow(
    "child-workflow-type",
    [{"input": "data"}],
    task_queue="child-queue",
    parent_close_policy="terminate",
)
```

### Continue-as-New

For long-running workflows, use continue-as-new to reset the history:

```python
from durable_workflow import ContinueAsNew

@workflow.defn(name="polling-workflow")
class PollingWorkflow:
    def run(self, ctx, *args):
        iteration = args[0] if args else 0

        result = yield ctx.schedule_activity("poll_source", [])

        if result.get("done"):
            return result

        # Continue with incremented iteration
        return ContinueAsNew(arguments=[iteration + 1])
```

## Defining Activities

Activities are async Python functions decorated with `@activity.defn`. Unlike workflows, activities can perform I/O freely.

```python
from durable_workflow import activity

@activity.defn(name="send_email")
async def send_email(to: str, subject: str, body: str) -> dict:
    # Activities can do I/O: HTTP calls, database queries, etc.
    response = await some_email_client.send(to=to, subject=subject, body=body)
    return {"message_id": response.id, "sent": True}
```

The `name` is the type key shared across languages. A PHP workflow can schedule an activity named `"send_email"` and a Python worker will pick it up, and vice versa.

### Activity Context

Inside an activity, access execution metadata and heartbeat via `activity.context()`:

```python
@activity.defn(name="long_running_task")
async def long_running_task(items: list) -> dict:
    ctx = activity.context()

    print(f"Attempt #{ctx.info.attempt_number}")
    print(f"Task queue: {ctx.info.task_queue}")

    for i, item in enumerate(items):
        # Check for cancellation
        if ctx.is_cancelled:
            return {"partial": True, "processed": i}

        await process(item)

        # Heartbeat to keep the task alive
        await ctx.heartbeat({"progress": i + 1, "total": len(items)})

    return {"processed": len(items)}
```

### Non-Retryable Errors

Raise `NonRetryableError` to fail the activity without retries:

```python
from durable_workflow import NonRetryableError

@activity.defn(name="validate")
async def validate(data: dict) -> dict:
    if "required_field" not in data:
        raise NonRetryableError("Missing required_field")
    return data
```

## Worker

The `Worker` registers with the server, polls for tasks, and dispatches them to your workflow and activity implementations.

```python
from durable_workflow import Client, Worker

async with Client("http://localhost:8080", token="secret") as client:
    worker = Worker(
        client,
        task_queue="default",
        workflows=[GreeterWorkflow, OrderWorkflow],
        activities=[greet, send_email, validate],
        max_concurrent_workflow_tasks=10,
        max_concurrent_activity_tasks=10,
    )

    await worker.run()  # blocks until worker.stop() is called
```

For smoke tests and one-workflow examples,
`await worker.run_until(workflow_id="...", timeout=60.0)` registers the same
worker and drives one workflow to a terminal state with sequential polling. Use
`run()` for deployed workers that should keep polling.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `task_queue` | required | The task queue to poll |
| `workflows` | `()` | Workflow classes to register |
| `activities` | `()` | Activity functions to register |
| `worker_id` | auto-generated | Unique worker identifier |
| `poll_timeout` | `35.0` | Long-poll timeout in seconds |
| `max_concurrent_workflow_tasks` | `10` | Max parallel workflow tasks |
| `max_concurrent_activity_tasks` | `10` | Max parallel activity tasks |
| `shutdown_timeout` | `30.0` | Seconds to drain in-flight tasks on stop |
| `metrics` | client's recorder | Optional metrics recorder for poll and task counters/histograms |

## Logging

The SDK uses Python's standard `logging` module with structured logger names:

| Logger Name | What It Logs |
|-------------|--------------|
| `durable_workflow.worker` | Worker registration, task polls, task completion, errors |
| `durable_workflow.workflow.replay` | Workflow replay events (silent during replay) |

### Configuring Logging

Set the logging level in your application's entry point:

```python
import logging

# Show INFO-level worker events (registration, task completion)
logging.basicConfig(level=logging.INFO)

# Or configure specific loggers
logging.getLogger("durable_workflow.worker").setLevel(logging.DEBUG)
logging.getLogger("durable_workflow.workflow.replay").setLevel(logging.INFO)
```

### Log Levels

- **INFO**: Worker registration, task starts/completions, workflow completion
- **DEBUG**: Detailed task payloads (truncated), poll cycles
- **WARNING**: Retryable errors (failed API calls, unknown workflow types)
- **ERROR**: Non-retryable failures, replay crashes

### Replay-Aware Logging

Inside workflows, use `ctx.logger` for replay-aware logging:

```python
@workflow.defn(name="order_processor")
class OrderProcessor:
    def run(self, ctx, order_id: str):
        ctx.logger.info("Processing order %s", order_id)  # Only logs during execution, not replay
        result = yield ctx.schedule_activity("process_order", [order_id])
        ctx.logger.info("Order processed: %s", result)
        return result
```

Log statements are **silent during replay** to avoid duplicate log spam when workflows recover or continue execution.

### Structured Logging

For JSON-structured logs, configure your application's root logger with a JSON formatter:

```python
import logging
import json

class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        })

handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logging.getLogger("durable_workflow").addHandler(handler)
logging.getLogger("durable_workflow").setLevel(logging.INFO)
```

## Metrics

`Client(metrics=...)` and `Worker(metrics=...)` accept any recorder with two methods:

```python
def increment(name: str, value: float = 1.0, tags: dict[str, str] | None = None) -> None: ...
def record(name: str, value: float, tags: dict[str, str] | None = None) -> None: ...
```

The default recorder is no-op, so metrics collection has no setup cost. Use `InMemoryMetrics` for tests or custom exporter loops:

```python
from durable_workflow import Client, InMemoryMetrics, Worker

metrics = InMemoryMetrics()

async with Client("http://localhost:8080", token="secret", metrics=metrics) as client:
    worker = Worker(client, task_queue="default", workflows=[GreeterWorkflow], activities=[greet])
```

For Prometheus, install the optional extra and pass `PrometheusMetrics`:

```bash
pip install 'durable-workflow[prometheus]'
```

```python
from durable_workflow import Client, PrometheusMetrics

metrics = PrometheusMetrics()
client = Client("http://localhost:8080", token="secret", metrics=metrics)
```

The SDK records:

| Metric | Type | Tags |
|--------|------|------|
| `durable_workflow_client_requests` | Counter | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_client_request_duration_seconds` | Histogram | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_worker_polls` | Counter | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_poll_duration_seconds` | Histogram | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_tasks` | Counter | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_task_duration_seconds` | Histogram | `task_kind`, `task_queue`, `outcome` |

## Schedules

Create and manage scheduled workflows through the client:

```python
from durable_workflow import ScheduleSpec, ScheduleAction

# Create a schedule
handle = await client.create_schedule(
    schedule_id="hourly-report",
    spec=ScheduleSpec(cron_expressions=["0 * * * *"]),
    action=ScheduleAction(
        workflow_type="generate-report",
        task_queue="default",
        input=[{"format": "pdf"}],
    ),
    overlap_policy="skip",
    jitter_seconds=30,
)

# List all schedules
schedule_list = await client.list_schedules()

# Describe a schedule
desc = await handle.describe()
print(f"Next fire: {desc.next_fire_at}")
print(f"Total fires: {desc.fires_count}")

# Pause and resume
await handle.pause(note="maintenance window")
await handle.resume(note="maintenance complete")

# Trigger immediately
result = await handle.trigger()

# Backfill missed runs
backfill = await handle.backfill(
    start_time="2024-01-01T00:00:00Z",
    end_time="2024-01-02T00:00:00Z",
)

# Update the schedule
await handle.update(
    spec=ScheduleSpec(cron_expressions=["*/30 * * * *"]),
    note="Changed to every 30 minutes",
)

# Delete the schedule
await handle.delete()
```

## Synchronous Client

For scripts, notebooks, and non-async contexts, use the synchronous wrapper:

```python
from durable_workflow.sync import Client as SyncClient

client = SyncClient("http://localhost:8080", token="secret")

handle = client.start_workflow(
    workflow_type="greeter",
    task_queue="default",
    workflow_id="sync-greeting-1",
    input=["world"],
)

execution = client.describe_workflow("sync-greeting-1")
print(execution.status)
```

The synchronous client mirrors the async API but wraps each call with `asyncio.run`.

## Error Handling

The SDK maps server error codes to typed Python exceptions:

| Exception | When |
|-----------|------|
| `WorkflowNotFound` | Workflow ID does not exist |
| `WorkflowAlreadyStarted` | Duplicate workflow ID with conflicting policy |
| `WorkflowFailed` | Workflow execution failed |
| `WorkflowCancelled` | Workflow was cancelled |
| `WorkflowTerminated` | Workflow was terminated |
| `ActivityCancelled` | Activity was cancelled during execution |
| `ChildWorkflowFailed` | A child workflow failed |
| `QueryFailed` | Query handler returned an error |
| `UpdateRejected` | Update was rejected by the workflow |
| `ScheduleNotFound` | Schedule ID does not exist |
| `ScheduleAlreadyExists` | Duplicate schedule ID |
| `NamespaceNotFound` | Namespace does not exist |
| `InvalidArgument` | Invalid request parameters |
| `Unauthorized` | Authentication failed |
| `ServerError` | Server returned an unexpected error |

```python
from durable_workflow import WorkflowNotFound, WorkflowAlreadyStarted

try:
    handle = await client.start_workflow(
        workflow_type="greeter",
        task_queue="default",
        workflow_id="existing-id",
        input=["world"],
    )
except WorkflowAlreadyStarted:
    handle = client.get_workflow_handle("existing-id")
except WorkflowNotFound:
    print("Workflow type not registered on any worker")
```

## Payload Codecs

Every payload that crosses the worker-protocol boundary is codec-tagged. v2 ships a single language-neutral codec, **`avro`**, which is the Python SDK's default for every outgoing client and worker payload — matching the server, PHP, and every other polyglot SDK.

### Avro support is built in

`pip install durable-workflow` already pulls in the official Apache Avro Python bindings as a runtime dependency, so every outgoing surface (`start_workflow`, `signal_workflow`, `query_workflow`, `update_workflow`, activity result encoding, schedule actions) emits Avro-tagged payloads out of the box. There is no optional extra to install for codec interop.

### What the SDK does today

The SDK uses a generic-wrapper schema for Avro payloads — the Python value is JSON-encoded, then the resulting string is Avro-binary-framed under a `{json: string, version: int}` record. This gives schema-evolution framing and compact transport without requiring the Python developer to hand-write an Avro schema for every workflow.

Every client and worker surface works end-to-end on the Avro default:

- **Client starts, signals, queries, updates** — `start_workflow`, `signal_workflow`, `query_workflow`, and `update_workflow` always emit `payload_codec = "avro"` payloads via the generic-wrapper schema. A Python client can therefore drive workflows that PHP and other polyglot SDKs will replay, and vice-versa.
- **Activity worker** — Avro-tagged activity arguments decode transparently. The worker echoes the task's codec when completing: an Avro-coded task gets an Avro-coded result back; a legacy JSON-coded task (from a pre-Avro run) gets a JSON-coded result.
- **Workflow worker history replay** — Avro-tagged start input and activity result events are decoded during replay, so a Python workflow can participate in an Avro-coded run.

### JSON decode path for legacy runs

The SDK still decodes `payload_codec = "json"` blobs when a task arrives from an older run that was started before Avro became the default. This is the only place JSON still appears on the wire — new runs and all outgoing client calls always use Avro, with no public flag to downgrade.

### Running a Python activity worker against an Avro-coded run

No extra configuration is needed: the SDK reads `payload_codec` on every claim and picks the right decoder. If the server default is `avro` and the activity task arrives Avro-coded, the Python worker decodes it, runs the activity, and encodes the result back as `avro`.

### Types that round-trip cleanly across Python and PHP

| Python type | JSON | PHP type |
|-------------|------|----------|
| `str` | `"string"` | `string` |
| `int` | `123` | `int` |
| `float` | `1.5` | `float` |
| `bool` | `true` | `bool` |
| `None` | `null` | `null` |
| `list` | `[...]` | `array` (indexed) |
| `dict` | `{...}` | `array` (associative) |

Avoid passing Python-specific types (dataclasses, sets, tuples, datetime objects) as workflow or activity inputs unless you explicitly convert them to JSON-compatible structures first.

## Running Against a Shared Server

The [Quickstart](#quickstart) above shows how to bring up a local server via Docker Compose. In a team environment you usually point the Python worker at an existing server (staging, production, or a shared dev instance):

```python
from durable_workflow import Client

client = Client(
    "https://workflow.example.internal",
    control_token="team-orders-operator-token",
    worker_token="team-orders-worker-token",
    namespace="team-orders",
)
```

Set the `namespace` argument to whichever tenant namespace the shared server has provisioned for your team, and use the credentials issued for that namespace. The server operator manages namespace creation — see the [server setup guide](/docs/2.0/polyglot/server) for details.
