---
sidebar_position: 4
title: Python API Reference
---

# Python SDK API Reference

This page is generated from the SDK's public symbols and docstrings by `repos/sdk-python/scripts/generate-api-reference.py`. Do not edit it by hand.

The SDK is async-first. Use `durable_workflow.Client` and `durable_workflow.Worker` for deployed code, or `durable_workflow.sync.Client` for scripts that cannot manage an event loop.

## Package Exports

`from durable_workflow import ...` exposes:

`ActivityCancelled`, `ActivityContext`, `ActivityInfo`, `ChildWorkflowFailed`, `Client`, `ContinueAsNew`, `DurableWorkflowError`, `InMemoryMetrics`, `InvalidArgument`, `MetricsRecorder`, `NamespaceNotFound`, `NonRetryableError`, `NoopMetrics`, `PrometheusMetrics`, `QueryFailed`, `ScheduleAction`, `ScheduleAlreadyExists`, `ScheduleBackfillResult`, `ScheduleDescription`, `ScheduleHandle`, `ScheduleList`, `ScheduleNotFound`, `ScheduleSpec`, `ScheduleTriggerResult`, `ServerError`, `StartChildWorkflow`, `Unauthorized`, `UpdateRejected`, `Worker`, `WorkflowAlreadyStarted`, `WorkflowCancelled`, `WorkflowExecution`, `WorkflowFailed`, `WorkflowHandle`, `WorkflowList`, `WorkflowNotFound`, `WorkflowTerminated`, `__version__`, `activity`, `sync`, `workflow`

## Control Plane

### `durable_workflow.client.Client`

```python
Client(base_url: str, *, token: str | None = None, control_token: str | None = None, worker_token: str | None = None, namespace: str = 'default', timeout: float = 60.0, retry_policy: RetryPolicy | None = None, metrics: MetricsRecorder | None = None) -> None
```

Async HTTP client for Durable Workflow control-plane and worker APIs.

The client owns one `httpx.AsyncClient` connection pool. Use it as an async
context manager or call `aclose()` when finished.

#### Methods

##### `aclose`

```python
async aclose() -> None
```

##### `backfill_schedule`

```python
async backfill_schedule(schedule_id: str, *, start_time: str, end_time: str, overlap_policy: str | None = None) -> ScheduleBackfillResult
```

##### `cancel_workflow`

```python
async cancel_workflow(workflow_id: str, *, reason: str | None = None) -> None
```

##### `complete_activity_task`

```python
async complete_activity_task(*, task_id: str, activity_attempt_id: str, lease_owner: str, result: Any, codec: str = 'avro') -> Any
```

##### `complete_workflow_task`

```python
async complete_workflow_task(*, task_id: str, lease_owner: str, workflow_task_attempt: int, commands: list[dict[str, Any]]) -> Any
```

##### `create_schedule`

```python
async create_schedule(*, schedule_id: str | None = None, spec: ScheduleSpec, action: ScheduleAction, overlap_policy: str | None = None, jitter_seconds: int | None = None, max_runs: int | None = None, memo: dict[str, Any] | None = None, search_attributes: dict[str, Any] | None = None, paused: bool = False, note: str | None = None) -> ScheduleHandle
```

##### `delete_schedule`

```python
async delete_schedule(schedule_id: str) -> None
```

##### `describe_schedule`

```python
async describe_schedule(schedule_id: str) -> ScheduleDescription
```

##### `describe_workflow`

```python
async describe_workflow(workflow_id: str) -> WorkflowExecution
```

##### `fail_activity_task`

```python
async fail_activity_task(*, task_id: str, activity_attempt_id: str, lease_owner: str, message: str, failure_type: str | None = None, stack_trace: str | None = None, non_retryable: bool = False, details: Any | None = None, codec: str = 'avro') -> Any
```

##### `fail_workflow_task`

```python
async fail_workflow_task(*, task_id: str, lease_owner: str, workflow_task_attempt: int, message: str, failure_type: str | None = None, stack_trace: str | None = None) -> Any
```

##### `get_cluster_info`

```python
async get_cluster_info() -> dict[str, Any]
```

Fetch server build identity, capabilities, and protocol manifests.

##### `get_history`

```python
async get_history(workflow_id: str, run_id: str) -> Any
```

##### `get_result`

```python
async get_result(handle: WorkflowHandle, *, poll_interval: float = 0.5, timeout: float = 30.0) -> Any
```

##### `get_schedule_handle`

```python
get_schedule_handle(schedule_id: str) -> ScheduleHandle
```

##### `get_workflow_handle`

```python
get_workflow_handle(workflow_id: str, *, run_id: str | None = None, workflow_type: str = '') -> WorkflowHandle
```

##### `health`

```python
async health() -> dict[str, Any]
```

##### `heartbeat_activity_task`

```python
async heartbeat_activity_task(*, task_id: str, activity_attempt_id: str, lease_owner: str, details: dict[str, Any] | None = None) -> Any
```

##### `list_schedules`

```python
async list_schedules() -> ScheduleList
```

##### `list_workflows`

```python
async list_workflows(*, workflow_type: str | None = None, status: str | None = None, query: str | None = None, page_size: int | None = None, next_page_token: str | None = None) -> WorkflowList
```

##### `pause_schedule`

```python
async pause_schedule(schedule_id: str, *, note: str | None = None) -> None
```

##### `poll_activity_task`

```python
async poll_activity_task(*, worker_id: str, task_queue: str, timeout: float = 35.0) -> Any
```

##### `poll_workflow_task`

```python
async poll_workflow_task(*, worker_id: str, task_queue: str, timeout: float = 35.0) -> Any
```

##### `query_workflow`

```python
async query_workflow(workflow_id: str, query_name: str, *, args: list[Any] | None = None) -> Any
```

##### `register_worker`

```python
async register_worker(*, worker_id: str, task_queue: str, supported_workflow_types: list[str] | None = None, supported_activity_types: list[str] | None = None, runtime: str = 'python', sdk_version: str | None = None) -> Any
```

##### `resume_schedule`

```python
async resume_schedule(schedule_id: str, *, note: str | None = None) -> None
```

##### `signal_workflow`

```python
async signal_workflow(workflow_id: str, signal_name: str, *, args: list[Any] | None = None) -> None
```

##### `start_workflow`

```python
async start_workflow(*, workflow_type: str, task_queue: str, workflow_id: str, input: list[Any] | None = None, execution_timeout_seconds: int = 3600, run_timeout_seconds: int = 600, duplicate_policy: str | None = None, memo: dict[str, Any] | None = None, search_attributes: dict[str, Any] | None = None) -> WorkflowHandle
```

##### `terminate_workflow`

```python
async terminate_workflow(workflow_id: str, *, reason: str | None = None) -> None
```

##### `trigger_schedule`

```python
async trigger_schedule(schedule_id: str, *, overlap_policy: str | None = None) -> ScheduleTriggerResult
```

##### `update_schedule`

```python
async update_schedule(schedule_id: str, *, spec: ScheduleSpec | None = None, action: ScheduleAction | None = None, overlap_policy: str | None = None, jitter_seconds: int | None = None, max_runs: int | None = None, memo: dict[str, Any] | None = None, search_attributes: dict[str, Any] | None = None, note: str | None = None) -> None
```

##### `update_workflow`

```python
async update_workflow(workflow_id: str, update_name: str, *, args: list[Any] | None = None, wait_for: str | None = None, wait_timeout_seconds: int | None = None, request_id: str | None = None) -> Any
```

##### `workflow_task_history`

```python
async workflow_task_history(*, task_id: str, page_token: str, lease_owner: str, workflow_task_attempt: int) -> Any
```

### `durable_workflow.client.WorkflowHandle`

```python
WorkflowHandle(client: Client, workflow_id: str, run_id: str | None = None, workflow_type: str = '') -> None
```

Convenience wrapper for operating on one workflow ID.

#### Methods

##### `cancel`

```python
async cancel(*, reason: str | None = None) -> None
```

##### `describe`

```python
async describe() -> WorkflowExecution
```

##### `query`

```python
async query(query_name: str, args: list[Any] | None = None) -> Any
```

##### `result`

```python
async result(*, poll_interval: float = 0.5, timeout: float = 30.0) -> Any
```

##### `signal`

```python
async signal(signal_name: str, args: list[Any] | None = None) -> None
```

##### `terminate`

```python
async terminate(*, reason: str | None = None) -> None
```

##### `update`

```python
async update(update_name: str, args: list[Any] | None = None, *, wait_for: str | None = None, wait_timeout_seconds: int | None = None, request_id: str | None = None) -> Any
```

### `durable_workflow.client.WorkflowExecution`

```python
WorkflowExecution(workflow_id: str, run_id: str | None, workflow_type: str, status: str | None = None, namespace: str | None = None, task_queue: str | None = None, input: Any = None, output: Any = None, payload_codec: str | None = None) -> None
```

Current server view of one workflow execution.

#### Fields

| Field | Type | Default |
|---|---|---|
| `workflow_id` | `str` | required |
| `run_id` | `str | None` | required |
| `workflow_type` | `str` | required |
| `status` | `str | None` | `None` |
| `namespace` | `str | None` | `None` |
| `task_queue` | `str | None` | `None` |
| `input` | `Any` | `None` |
| `output` | `Any` | `None` |
| `payload_codec` | `str | None` | `None` |

### `durable_workflow.client.WorkflowList`

```python
WorkflowList(executions: list[WorkflowExecution], next_page_token: str | None = None) -> None
```

One page of workflow visibility results.

#### Fields

| Field | Type | Default |
|---|---|---|
| `executions` | `list[WorkflowExecution]` | required |
| `next_page_token` | `str | None` | `None` |

## Schedules

### `durable_workflow.client.ScheduleSpec`

```python
ScheduleSpec(cron_expressions: list[str] | None = None, intervals: list[dict[str, str]] | None = None, timezone: str | None = None) -> None
```

Calendar or interval rules for a scheduled workflow.

#### Fields

| Field | Type | Default |
|---|---|---|
| `cron_expressions` | `list[str] | None` | `None` |
| `intervals` | `list[dict[str, str]] | None` | `None` |
| `timezone` | `str | None` | `None` |

#### Methods

##### `to_dict`

```python
to_dict() -> dict[str, Any]
```

### `durable_workflow.client.ScheduleAction`

```python
ScheduleAction(workflow_type: str, task_queue: str | None = None, input: list[Any] | None = None, execution_timeout_seconds: int | None = None, run_timeout_seconds: int | None = None) -> None
```

Workflow start request issued whenever a schedule fires.

#### Fields

| Field | Type | Default |
|---|---|---|
| `workflow_type` | `str` | required |
| `task_queue` | `str | None` | `None` |
| `input` | `list[Any] | None` | `None` |
| `execution_timeout_seconds` | `int | None` | `None` |
| `run_timeout_seconds` | `int | None` | `None` |

#### Methods

##### `to_dict`

```python
to_dict() -> dict[str, Any]
```

### `durable_workflow.client.ScheduleHandle`

```python
ScheduleHandle(client: Client, schedule_id: str) -> None
```

Convenience wrapper for operating on one schedule ID.

#### Methods

##### `backfill`

```python
async backfill(*, start_time: str, end_time: str, overlap_policy: str | None = None) -> ScheduleBackfillResult
```

##### `delete`

```python
async delete() -> None
```

##### `describe`

```python
async describe() -> ScheduleDescription
```

##### `pause`

```python
async pause(*, note: str | None = None) -> None
```

##### `resume`

```python
async resume(*, note: str | None = None) -> None
```

##### `trigger`

```python
async trigger(*, overlap_policy: str | None = None) -> ScheduleTriggerResult
```

##### `update`

```python
async update(*, spec: ScheduleSpec | None = None, action: ScheduleAction | None = None, overlap_policy: str | None = None, jitter_seconds: int | None = None, max_runs: int | None = None, memo: dict[str, Any] | None = None, search_attributes: dict[str, Any] | None = None, note: str | None = None) -> None
```

### `durable_workflow.client.ScheduleDescription`

```python
ScheduleDescription(schedule_id: str, status: str | None = None, spec: dict[str, Any] | None = None, action: dict[str, Any] | None = None, overlap_policy: str | None = None, note: str | None = None, memo: dict[str, Any] | None = None, search_attributes: dict[str, Any] | None = None, jitter_seconds: int | None = None, max_runs: int | None = None, remaining_actions: int | None = None, fires_count: int = 0, failures_count: int = 0, next_fire_at: str | None = None, last_fired_at: str | None = None, latest_workflow_instance_id: str | None = None, paused_at: str | None = None, created_at: str | None = None, updated_at: str | None = None, info: dict[str, Any] | None = None) -> None
```

Current server view of a schedule and its recent execution state.

#### Fields

| Field | Type | Default |
|---|---|---|
| `schedule_id` | `str` | required |
| `status` | `str | None` | `None` |
| `spec` | `dict[str, Any] | None` | `None` |
| `action` | `dict[str, Any] | None` | `None` |
| `overlap_policy` | `str | None` | `None` |
| `note` | `str | None` | `None` |
| `memo` | `dict[str, Any] | None` | `None` |
| `search_attributes` | `dict[str, Any] | None` | `None` |
| `jitter_seconds` | `int | None` | `None` |
| `max_runs` | `int | None` | `None` |
| `remaining_actions` | `int | None` | `None` |
| `fires_count` | `int` | `0` |
| `failures_count` | `int` | `0` |
| `next_fire_at` | `str | None` | `None` |
| `last_fired_at` | `str | None` | `None` |
| `latest_workflow_instance_id` | `str | None` | `None` |
| `paused_at` | `str | None` | `None` |
| `created_at` | `str | None` | `None` |
| `updated_at` | `str | None` | `None` |
| `info` | `dict[str, Any] | None` | `None` |

### `durable_workflow.client.ScheduleList`

```python
ScheduleList(schedules: list[ScheduleDescription], next_page_token: str | None = None) -> None
```

One page of schedule visibility results.

#### Fields

| Field | Type | Default |
|---|---|---|
| `schedules` | `list[ScheduleDescription]` | required |
| `next_page_token` | `str | None` | `None` |

### `durable_workflow.client.ScheduleTriggerResult`

```python
ScheduleTriggerResult(schedule_id: str, outcome: str, workflow_id: str | None = None, run_id: str | None = None, reason: str | None = None, buffer_depth: int | None = None) -> None
```

Outcome returned after manually triggering a schedule.

#### Fields

| Field | Type | Default |
|---|---|---|
| `schedule_id` | `str` | required |
| `outcome` | `str` | required |
| `workflow_id` | `str | None` | `None` |
| `run_id` | `str | None` | `None` |
| `reason` | `str | None` | `None` |
| `buffer_depth` | `int | None` | `None` |

### `durable_workflow.client.ScheduleBackfillResult`

```python
ScheduleBackfillResult(schedule_id: str, outcome: str, fires_attempted: int = 0, results: list[dict[str, Any]] | None = None) -> None
```

Outcome returned after asking a schedule to backfill missed fires.

#### Fields

| Field | Type | Default |
|---|---|---|
| `schedule_id` | `str` | required |
| `outcome` | `str` | required |
| `fires_attempted` | `int` | `0` |
| `results` | `list[dict[str, Any]] | None` | `None` |

## Workers And Authoring

### `durable_workflow.worker.Worker`

```python
Worker(client: Client, *, task_queue: str, workflows: Iterable[type] = (), activities: Iterable[Callable[..., Any]] = (), worker_id: str | None = None, poll_timeout: float = 35.0, max_concurrent_workflow_tasks: int = 10, max_concurrent_activity_tasks: int = 10, shutdown_timeout: float = 30.0, metrics: MetricsRecorder | None = None) -> None
```

Polls workflow and activity tasks and dispatches them to Python callables.

#### Methods

##### `run`

```python
async run() -> None
```

Register the worker and poll until `stop()` is called or the task is cancelled.

##### `run_until`

```python
async run_until(*, workflow_id: str, timeout: float = 60.0, poll_interval: float = 0.5) -> WorkflowExecution
```

Run this worker until a workflow reaches a terminal state.

This is intended for examples, smoke tests, and single-workflow scripts.
Long-running workers should call `run` and coordinate shutdown from
their process supervisor.

##### `stop`

```python
async stop() -> None
```

Stop polling and drain in-flight tasks up to the configured shutdown timeout.

### `durable_workflow.workflow.WorkflowContext`

```python
WorkflowContext(*, run_id: str = '', current_time: datetime.datetime | None = None) -> None
```

Replay-safe helper surface passed to workflow `run` methods.

#### Methods

##### `continue_as_new`

```python
continue_as_new(*args: Any, workflow_type: str | None = None, task_queue: str | None = None) -> ContinueAsNew
```

##### `get_version`

```python
get_version(change_id: str, min_supported: int, max_supported: int) -> RecordVersionMarker
```

##### `now`

```python
now() -> datetime.datetime
```

##### `random`

```python
random() -> random.Random
```

##### `schedule_activity`

```python
schedule_activity(activity_type: str, arguments: list[Any], *, queue: str | None = None) -> ScheduleActivity
```

##### `side_effect`

```python
side_effect(fn: Callable[[], Any]) -> RecordSideEffect
```

##### `start_child_workflow`

```python
start_child_workflow(workflow_type: str, arguments: list[Any] | None = None, *, task_queue: str | None = None, parent_close_policy: str | None = None) -> StartChildWorkflow
```

##### `start_timer`

```python
start_timer(seconds: int) -> StartTimer
```

##### `upsert_search_attributes`

```python
upsert_search_attributes(attributes: dict[str, Any]) -> UpsertSearchAttributes
```

##### `uuid4`

```python
uuid4() -> uuid.UUID
```

### `durable_workflow.workflow.ContinueAsNew`

```python
ContinueAsNew(workflow_type: str | None = None, arguments: list[Any] = <factory>, task_queue: str | None = None) -> None
```

Workflow return value that starts a new run with fresh history.

#### Fields

| Field | Type | Default |
|---|---|---|
| `workflow_type` | `str | None` | `None` |
| `arguments` | `list[Any]` | `list()` |
| `task_queue` | `str | None` | `None` |

#### Methods

##### `to_server_command`

```python
to_server_command(task_queue: str, *, payload_codec: str = 'avro') -> dict[str, Any]
```

### `durable_workflow.workflow.StartChildWorkflow`

```python
StartChildWorkflow(workflow_type: str, arguments: list[Any] = <factory>, task_queue: str | None = None, parent_close_policy: str | None = None) -> None
```

Command requesting a child workflow run.

#### Fields

| Field | Type | Default |
|---|---|---|
| `workflow_type` | `str` | required |
| `arguments` | `list[Any]` | `list()` |
| `task_queue` | `str | None` | `None` |
| `parent_close_policy` | `str | None` | `None` |

#### Methods

##### `to_server_command`

```python
to_server_command(task_queue: str, *, payload_codec: str = 'avro') -> dict[str, Any]
```

### `durable_workflow.activity.ActivityContext`

```python
ActivityContext(*, info: 'ActivityInfo', client: 'Client') -> 'None'
```

Per-attempt activity context exposed by `durable_workflow.activity.context`.

#### Methods

##### `heartbeat`

```python
async heartbeat(details: dict[str, Any] | None = None) -> None
```

##### `info`

```python
info() -> ActivityInfo
```

##### `is_cancelled`

```python
is_cancelled() -> bool
```

### `durable_workflow.activity.ActivityInfo`

```python
ActivityInfo(task_id: str, activity_type: str, activity_attempt_id: str, attempt_number: int, task_queue: str, worker_id: str) -> None
```

Metadata attached to the currently running activity attempt.

#### Fields

| Field | Type | Default |
|---|---|---|
| `task_id` | `str` | required |
| `activity_type` | `str` | required |
| `activity_attempt_id` | `str` | required |
| `attempt_number` | `int` | required |
| `task_queue` | `str` | required |
| `worker_id` | `str` | required |

## Synchronous Facade

### `durable_workflow.sync.Client`

```python
Client(base_url: str, *, token: str | None = None, control_token: str | None = None, worker_token: str | None = None, namespace: str = 'default', timeout: float = 60.0, retry_policy: RetryPolicy | None = None, metrics: MetricsRecorder | None = None) -> None
```

Blocking wrapper around the async client.

Each call opens and closes its own event loop, so this facade is best for
scripts, notebooks, and command-line tools rather than high-throughput
services.

#### Methods

##### `backfill_schedule`

```python
backfill_schedule(schedule_id: str, *, start_time: str, end_time: str, overlap_policy: str | None = None) -> ScheduleBackfillResult
```

##### `cancel_workflow`

```python
cancel_workflow(workflow_id: str, *, reason: str | None = None) -> None
```

##### `close`

```python
close() -> None
```

##### `create_schedule`

```python
create_schedule(*, schedule_id: str | None = None, spec: ScheduleSpec, action: ScheduleAction, overlap_policy: str | None = None, jitter_seconds: int | None = None, max_runs: int | None = None, memo: dict[str, Any] | None = None, search_attributes: dict[str, Any] | None = None, paused: bool = False, note: str | None = None) -> durable_workflow.sync.SyncScheduleHandle
```

##### `delete_schedule`

```python
delete_schedule(schedule_id: str) -> None
```

##### `describe_schedule`

```python
describe_schedule(schedule_id: str) -> ScheduleDescription
```

##### `describe_workflow`

```python
describe_workflow(workflow_id: str) -> WorkflowExecution
```

##### `get_history`

```python
get_history(workflow_id: str, run_id: str) -> Any
```

##### `get_result`

```python
get_result(handle: durable_workflow.sync.SyncWorkflowHandle, *, poll_interval: float = 0.5, timeout: float = 30.0) -> Any
```

##### `get_schedule_handle`

```python
get_schedule_handle(schedule_id: str) -> durable_workflow.sync.SyncScheduleHandle
```

##### `health`

```python
health() -> dict[str, Any]
```

##### `list_schedules`

```python
list_schedules() -> ScheduleList
```

##### `list_workflows`

```python
list_workflows(*, workflow_type: str | None = None, status: str | None = None, query: str | None = None, page_size: int | None = None, next_page_token: str | None = None) -> WorkflowList
```

##### `pause_schedule`

```python
pause_schedule(schedule_id: str, *, note: str | None = None) -> None
```

##### `query_workflow`

```python
query_workflow(workflow_id: str, query_name: str, *, args: list[Any] | None = None) -> Any
```

##### `resume_schedule`

```python
resume_schedule(schedule_id: str, *, note: str | None = None) -> None
```

##### `signal_workflow`

```python
signal_workflow(workflow_id: str, signal_name: str, *, args: list[Any] | None = None) -> None
```

##### `start_workflow`

```python
start_workflow(*, workflow_type: str, task_queue: str, workflow_id: str, input: list[Any] | None = None, execution_timeout_seconds: int = 3600, run_timeout_seconds: int = 600, duplicate_policy: str | None = None, memo: dict[str, Any] | None = None, search_attributes: dict[str, Any] | None = None) -> durable_workflow.sync.SyncWorkflowHandle
```

##### `terminate_workflow`

```python
terminate_workflow(workflow_id: str, *, reason: str | None = None) -> None
```

##### `trigger_schedule`

```python
trigger_schedule(schedule_id: str, *, overlap_policy: str | None = None) -> ScheduleTriggerResult
```

##### `update_schedule`

```python
update_schedule(schedule_id: str, *, spec: ScheduleSpec | None = None, action: ScheduleAction | None = None, overlap_policy: str | None = None, jitter_seconds: int | None = None, max_runs: int | None = None, memo: dict[str, Any] | None = None, search_attributes: dict[str, Any] | None = None, note: str | None = None) -> None
```

##### `update_workflow`

```python
update_workflow(workflow_id: str, update_name: str, *, args: list[Any] | None = None, wait_for: str | None = None, wait_timeout_seconds: int | None = None, request_id: str | None = None) -> Any
```

### `durable_workflow.sync.SyncWorkflowHandle`

```python
SyncWorkflowHandle(async_handle: WorkflowHandle) -> None
```

Blocking wrapper around an async workflow handle.

#### Methods

##### `cancel`

```python
cancel(*, reason: str | None = None) -> None
```

##### `describe`

```python
describe() -> WorkflowExecution
```

##### `query`

```python
query(query_name: str, args: list[Any] | None = None) -> Any
```

##### `result`

```python
result(*, poll_interval: float = 0.5, timeout: float = 30.0) -> Any
```

##### `signal`

```python
signal(signal_name: str, args: list[Any] | None = None) -> None
```

##### `terminate`

```python
terminate(*, reason: str | None = None) -> None
```

##### `update`

```python
update(update_name: str, args: list[Any] | None = None, *, wait_for: str | None = None, wait_timeout_seconds: int | None = None, request_id: str | None = None) -> Any
```

### `durable_workflow.sync.SyncScheduleHandle`

```python
SyncScheduleHandle(async_handle: ScheduleHandle) -> None
```

Blocking wrapper around an async schedule handle.

#### Methods

##### `backfill`

```python
backfill(*, start_time: str, end_time: str, overlap_policy: str | None = None) -> ScheduleBackfillResult
```

##### `delete`

```python
delete() -> None
```

##### `describe`

```python
describe() -> ScheduleDescription
```

##### `pause`

```python
pause(*, note: str | None = None) -> None
```

##### `resume`

```python
resume(*, note: str | None = None) -> None
```

##### `trigger`

```python
trigger(*, overlap_policy: str | None = None) -> ScheduleTriggerResult
```

##### `update`

```python
update(*, spec: ScheduleSpec | None = None, action: ScheduleAction | None = None, overlap_policy: str | None = None, jitter_seconds: int | None = None, max_runs: int | None = None, memo: dict[str, Any] | None = None, search_attributes: dict[str, Any] | None = None, note: str | None = None) -> None
```

## Metrics

### `durable_workflow.metrics.MetricsRecorder`

```python
MetricsRecorder(*args, **kwargs)
```

Pluggable counter and histogram recorder used by the client and worker.

#### Methods

##### `increment`

```python
increment(name: str, value: float = 1.0, tags: Mapping[str, str] | None = None) -> None
```

Increment a counter metric.

##### `record`

```python
record(name: str, value: float, tags: Mapping[str, str] | None = None) -> None
```

Record a histogram/sample metric.

### `durable_workflow.metrics.NoopMetrics`

Default metrics recorder that intentionally drops all observations.

#### Methods

##### `increment`

```python
increment(name: str, value: float = 1.0, tags: Mapping[str, str] | None = None) -> None
```

##### `record`

```python
record(name: str, value: float, tags: Mapping[str, str] | None = None) -> None
```

### `durable_workflow.metrics.InMemoryMetrics`

```python
InMemoryMetrics(counters: dict[tuple[str, tuple[tuple[str, str], ...]], float] = <factory>, histograms: dict[tuple[str, tuple[tuple[str, str], ...]], list[float]] = <factory>) -> None
```

Simple recorder useful for tests and custom exporter loops.

#### Fields

| Field | Type | Default |
|---|---|---|
| `counters` | `dict[MetricKey, float]` | `dict()` |
| `histograms` | `dict[MetricKey, list[float]]` | `dict()` |

#### Methods

##### `counter_value`

```python
counter_value(name: str, tags: Mapping[str, str] | None = None) -> float
```

##### `increment`

```python
increment(name: str, value: float = 1.0, tags: Mapping[str, str] | None = None) -> None
```

##### `observations`

```python
observations(name: str, tags: Mapping[str, str] | None = None) -> list[float]
```

##### `record`

```python
record(name: str, value: float, tags: Mapping[str, str] | None = None) -> None
```

### `durable_workflow.metrics.PrometheusMetrics`

```python
PrometheusMetrics(*, registry: Any | None = None) -> None
```

Metrics recorder backed by the optional prometheus-client package.

#### Methods

##### `increment`

```python
increment(name: str, value: float = 1.0, tags: Mapping[str, str] | None = None) -> None
```

##### `record`

```python
record(name: str, value: float, tags: Mapping[str, str] | None = None) -> None
```

## Retry Policy

### `durable_workflow.retry_policy.RetryPolicy`

```python
RetryPolicy(max_attempts: int = 3, initial_backoff_seconds: float = 0.1, max_backoff_seconds: float = 5.0, backoff_multiplier: float = 2.0, jitter: bool = True) -> None
```

Retry policy for transient server errors.

Retries requests that fail with transient errors (connection errors,
timeouts, 5xx server errors, 429 rate limit). Does not retry client
errors (4xx except 429).

Uses exponential backoff with jitter to avoid thundering herd.

#### Fields

| Field | Type | Default |
|---|---|---|
| `max_attempts` | `int` | `3` |
| `initial_backoff_seconds` | `float` | `0.1` |
| `max_backoff_seconds` | `float` | `5.0` |
| `backoff_multiplier` | `float` | `2.0` |
| `jitter` | `bool` | `True` |

#### Methods

##### `backoff_seconds`

```python
backoff_seconds(attempt: int) -> float
```

Calculate backoff duration for the given attempt number (0-indexed).

##### `execute`

```python
async execute(fn: Callable[[], Awaitable[~T]]) -> ~T
```

Execute the given async function with retries.

Raises the last exception if all retries are exhausted.

##### `should_retry`

```python
should_retry(exc: Exception, attempt: int) -> bool
```

Check if the error is retryable and we haven't exceeded max attempts.

## Workflow Decorators

##### `durable_workflow.workflow.defn`

```python
defn(*, name: str)
```

Register a class as a workflow type under a language-neutral name.

##### `durable_workflow.workflow.registry`

```python
registry() -> dict[str, type]
```

Return a copy of workflow types registered in this process.

## Activity Decorators And Context

##### `durable_workflow.activity.defn`

```python
defn(*, name: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]
```

Register a callable as an activity type under a language-neutral name.

##### `durable_workflow.activity.context`

```python
context() -> ActivityContext
```

Return the current activity attempt context.

##### `durable_workflow.activity.registry`

```python
registry() -> dict[str, Callable[..., Any]]
```

Return a copy of activity callables registered in this process.

## Payload Serialization

##### `durable_workflow.serializer.encode`

```python
encode(value: Any, codec: str = 'avro') -> str
```

Encode a Python value as a payload blob for *codec*.

Raises `ValueError` for unknown codecs and
`durable_workflow.errors.AvroNotInstalledError` when the Avro
runtime dependency is missing from a broken or partial installation.

##### `durable_workflow.serializer.envelope`

```python
envelope(value: Any, codec: str = 'avro') -> dict[str, str]
```

Wrap a value in a `{codec, blob}` payload envelope.

##### `durable_workflow.serializer.decode_envelope`

```python
decode_envelope(value: Any, codec: str | None = None) -> Any
```

Decode a value that may be a `{codec, blob}` envelope or a raw blob.

When *value* is an envelope, its inner `codec` takes precedence over
the *codec* argument.  When *value* is a raw blob, *codec* selects the
decoder (defaulting to JSON).

##### `durable_workflow.serializer.decode`

```python
decode(blob: str | None, codec: str | None = None) -> Any
```

Decode a payload blob into a Python value.

Raises `ValueError` for unknown codecs or malformed blobs, and
`durable_workflow.errors.AvroNotInstalledError` when the Avro
runtime dependency is missing from a broken or partial installation.

## Exceptions

### `durable_workflow.errors.DurableWorkflowError`

```python
DurableWorkflowError(*args, **kwargs)
```

Inherits from `Exception`.

### `durable_workflow.errors.ServerError`

```python
ServerError(status: int, body: object) -> None
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.WorkflowNotFound`

```python
WorkflowNotFound(workflow_id: str) -> None
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.WorkflowAlreadyStarted`

```python
WorkflowAlreadyStarted(workflow_id: str) -> None
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.WorkflowFailed`

```python
WorkflowFailed(message: str, exception_class: str | None = None) -> None
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.WorkflowCancelled`

```python
WorkflowCancelled(message: str = 'workflow was cancelled') -> None
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.WorkflowTerminated`

```python
WorkflowTerminated(message: str = 'workflow was terminated') -> None
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.NamespaceNotFound`

```python
NamespaceNotFound(namespace: str) -> None
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.InvalidArgument`

```python
InvalidArgument(message: str, errors: dict[str, Any] | None = None) -> None
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.Unauthorized`

```python
Unauthorized(message: str = 'unauthorized') -> None
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.ScheduleNotFound`

```python
ScheduleNotFound(schedule_id: str) -> None
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.ScheduleAlreadyExists`

```python
ScheduleAlreadyExists(schedule_id: str) -> None
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.QueryFailed`

```python
QueryFailed(*args, **kwargs)
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.UpdateRejected`

```python
UpdateRejected(*args, **kwargs)
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.ChildWorkflowFailed`

```python
ChildWorkflowFailed(message: str, exception_class: str | None = None) -> None
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.ActivityCancelled`

```python
ActivityCancelled(message: str = 'activity was cancelled') -> None
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.NonRetryableError`

```python
NonRetryableError(message: str, *, cause: Exception | None = None) -> None
```

Inherits from `durable_workflow.errors.DurableWorkflowError`.

### `durable_workflow.errors.AvroNotInstalledError`

```python
AvroNotInstalledError(*args, **kwargs)
```

Raised when the core `avro` runtime dependency is unavailable.

Inherits from `ImportError`.

## Metric Names

| Constant Value |
|---|
| `durable_workflow_client_requests` |
| `durable_workflow_client_request_duration_seconds` |
| `durable_workflow_worker_polls` |
| `durable_workflow_worker_poll_duration_seconds` |
| `durable_workflow_worker_tasks` |
| `durable_workflow_worker_task_duration_seconds` |

