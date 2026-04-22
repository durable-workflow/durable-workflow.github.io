---
sidebar_position: 4
tags:
  - Python
  - SDK
  - workers
  - polyglot
keywords:
  - Python SDK
  - durable_workflow Client
  - Python worker
  - async workflow client
---

# Python SDK

The Python SDK is a thin, async-first client for the Durable Workflow server. It lets Python processes start, observe, signal, and cancel workflows through the server's control-plane API, and register as workers that execute workflow tasks and activities.

The SDK targets the same durable model as the PHP package — instance IDs, run IDs, history events, task queues, and type keys are shared across languages. A Python worker can serve activities for a PHP-authored workflow, and vice versa.

For side-by-side examples of the same operation through the Python SDK and
`dw`, see [CLI and Python parity](/docs/2.0/polyglot/cli-python-parity).

For constructor signatures, return types, exception classes, and metric names,
see the generated [Python API reference](https://python.durable-workflow.com/).

## Requirements

- Python 3.10 or later
- Docker (for the local server used in this quickstart) or an existing [Durable Workflow server](/docs/2.0/polyglot/server)

## Installation

```bash
pip install durable-workflow
```

The SDK depends on [httpx](https://www.python-httpx.org/) for HTTP and Apache Avro for the default language-neutral payload codec. Prometheus metrics support is optional.

## Quickstart

Here is a complete Python program that defines a workflow with one activity, starts it against a local Durable Workflow server, and waits for the result:

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

### Running against a local server

The program above assumes a Durable Workflow server reachable at `http://localhost:8080`. If you don't have one yet, the fastest path is the server's Docker Compose stack:

```bash
git clone https://github.com/durable-workflow/server.git
cd server
cp .env.example .env
printf '\nDW_AUTH_DRIVER=none\n' >> .env
docker compose up -d
until curl -sf http://localhost:8080/api/health > /dev/null; do sleep 1; done
```

`DW_AUTH_DRIVER=none` is local-development only. For production deployment — auth drivers, database config, TLS — see the [server setup guide](/docs/2.0/polyglot/server).

For a larger example, the SDK repository includes [`examples/order_processing`](https://github.com/durable-workflow/sdk-python/tree/main/examples/order_processing), a Docker Compose stack that runs a Python worker through an order workflow end to end.

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

### Signals, Queries, and Updates

Signals are recorded in durable history and dispatched to Python handlers
during workflow replay:

```python
@workflow.defn(name="approval")
class ApprovalWorkflow:
    def __init__(self) -> None:
        self.approved = False
        self.approved_by = None

    @workflow.signal("approve")
    def approve(self, by: str) -> None:
        self.approved = True
        self.approved_by = by

    def run(self, ctx, *args):
        yield ctx.schedule_activity("wait_for_approval", [])
        return {"approved": self.approved, "approved_by": self.approved_by}
```

Query and update receiver decorators are available so workflow classes can
publish stable handler names. Python workers execute server-routed query tasks
by replaying the committed workflow history and invoking the registered query
handler against that replayed state. They also apply accepted updates delivered
through workflow tasks:

```python
@workflow.defn(name="approval")
class ApprovalWorkflow:
    def __init__(self) -> None:
        self.approved = False

    @workflow.query("status")
    def status(self) -> dict:
        return {"approved": self.approved}

    @workflow.update("set_approval")
    def set_approval(self, approved: bool) -> dict:
        self.approved = approved
        return {"approved": self.approved}

    @set_approval.validator
    def validate_set_approval(self, approved: bool) -> None:
        if not isinstance(approved, bool):
            raise ValueError("approved must be boolean")
```

Python workers now complete server-routed queries by returning a query-task
result to the server, and complete accepted updates by sending
`complete_update` or `fail_update` commands back to the server. Synchronous
pre-accept update validator routing is still being completed, so use that path
only with deployments that advertise validator support for the target workflow
type.

### Workflow Context

The `WorkflowContext` passed to `run` provides deterministic operations:

| Method | Description |
|--------|-------------|
| `ctx.schedule_activity(type, args)` | Schedule an activity task, optionally with per-call retry and timeout options |
| `ctx.start_timer(seconds)` | Durable sleep |
| `ctx.start_child_workflow(type, args)` | Start a child workflow, optionally with per-call retry and workflow timeout options |
| `ctx.side_effect(fn)` | Capture a non-deterministic value |
| `ctx.get_version(change_id, min, max)` | Safe workflow code versioning |
| `ctx.upsert_search_attributes(attrs)` | Update search attributes |
| `ctx.continue_as_new(*args)` | Restart the workflow with new input |
| `ctx.now()` | Deterministic clock (from history) |
| `ctx.random()` | Seeded random generator |
| `ctx.uuid4()` | Deterministic UUID |
| `ctx.logger` | Logger that is silent during replay |

### Activity Retries and Timeouts

Use `ActivityRetryPolicy` and timeout keyword arguments on `ctx.schedule_activity(...)`
when one activity call needs a different retry budget or deadline than the
default single-attempt behavior:

```python
from durable_workflow import ActivityRetryPolicy

receipt = yield ctx.schedule_activity(
    "process_payment",
    [validated],
    retry_policy=ActivityRetryPolicy(
        max_attempts=4,
        initial_interval_seconds=1,
        backoff_coefficient=2,
        maximum_interval_seconds=30,
        non_retryable_error_types=["ValidationError"],
    ),
    start_to_close_timeout=120,
    schedule_to_close_timeout=300,
    heartbeat_timeout=15,
)
```

`start_to_close_timeout` caps one attempt after a worker starts it.
`schedule_to_close_timeout` caps the whole activity execution across all
attempts. `heartbeat_timeout` requires long-running activities to call
`activity.context().heartbeat(...)` before the interval expires. The retry
policy is snapped onto the durable activity execution when it is scheduled, so
later deploys do not change already-running attempts.

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
from durable_workflow import ChildWorkflowRetryPolicy

result = yield ctx.start_child_workflow(
    "child-workflow-type",
    [{"input": "data"}],
    task_queue="child-queue",
    parent_close_policy="terminate",
    retry_policy=ChildWorkflowRetryPolicy(
        max_attempts=3,
        initial_interval_seconds=2,
        backoff_coefficient=2,
        non_retryable_error_types=["ValidationError"],
    ),
    execution_timeout_seconds=600,
    run_timeout_seconds=120,
)
```

`execution_timeout_seconds` caps the logical child workflow execution across
retries and continue-as-new runs. `run_timeout_seconds` caps each child run
attempt. Retry backoff is applied after a child run fails; invalid child start
commands are protocol errors and are not retried as child attempts.

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

The two `max_concurrent_*` values are advertised to the server during worker
registration and appear in task queue admission diagnostics. Treat them as the
worker's local capacity. Use server-side
[task queue admission](/docs/2.0/polyglot/task-queue-admission) caps when a
namespace, queue, or downstream budget group needs a hard shared budget across
multiple workers.

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
| `WorkflowCancelled` | Workflow was cancelled (inherits from `BaseException`, not `Exception`) |
| `WorkflowTerminated` | Workflow was terminated |
| `ActivityCancelled` | Activity was cancelled during execution (inherits from `BaseException`, not `Exception`) |
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

### Cancellation is intentionally uncatchable by `except Exception`

`WorkflowCancelled` and `ActivityCancelled` inherit from `BaseException`, not `Exception`. A generic `except Exception:` block in an activity body — or in code that awaits `client.get_result()` — will **not** catch them. This is deliberate: cancellation is a control-plane outcome, and silently swallowing it in a catch-all would let an activity report success after its workflow asked it to stop.

If you need to run cleanup on cancellation, catch the class by name and re-raise:

```python
from durable_workflow import ActivityCancelled, activity

@activity.defn(name="long_task")
async def long_task(items: list) -> dict:
    ctx = activity.context()
    try:
        for i, item in enumerate(items):
            await process(item)
            await ctx.heartbeat({"progress": i + 1})
        return {"done": True}
    except ActivityCancelled:
        await cleanup_partial_state()
        raise
```

This mirrors the standard-library precedent set by `asyncio.CancelledError` and `KeyboardInterrupt`.

## Payload Codecs

Every payload that crosses the worker-protocol boundary is codec-tagged. v2 ships a single language-neutral codec, **`avro`**, which is the Python SDK's default for every outgoing client and worker payload — matching the server, PHP, and every other polyglot SDK.

### Avro support is built in

`pip install durable-workflow` already pulls in the official Apache Avro Python bindings as a runtime dependency, so every outgoing surface (`start_workflow`, `signal_workflow`, `query_workflow`, `update_workflow`, activity result encoding, schedule actions) emits Avro-tagged payloads out of the box. There is no optional extra to install for codec interop.

### What the SDK does today

The SDK uses a generic-wrapper schema for Avro payloads — the Python value is JSON-encoded, then the resulting string is Avro-binary-framed under a `{json: string, version: int}` record. This gives schema-evolution framing and compact transport without requiring the Python developer to hand-write an Avro schema for every workflow.

Every client and worker surface works end-to-end on the Avro default:

- **Client starts, signals, queries, updates** — `start_workflow`, `signal_workflow`, `query_workflow`, and `update_workflow` always emit `payload_codec = "avro"` payloads via the generic-wrapper schema. A Python client can therefore drive workflows that PHP and other polyglot SDKs will replay, and vice-versa.
- **Activity worker** — Avro-tagged activity arguments decode transparently. The worker encodes activity results as Avro so PHP, Python, and future SDK workers share one payload boundary.
- **Activity failures** — `fail_activity_task(..., details=...)` sends `failure.details` as a `{codec, blob}` envelope. The server records the blob plus `details_payload_codec`, so diagnostic failure data from Python workers remains language-neutral in history exports and observability views.
- **Workflow worker history replay** — Avro-tagged start input and activity result events are decoded during replay, so a Python workflow can participate in an Avro-coded run.
- **Workflow query tasks** — Server-routed query tasks carry Avro-tagged workflow arguments, query arguments, and replay history. The worker returns the query result as an Avro envelope.

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
