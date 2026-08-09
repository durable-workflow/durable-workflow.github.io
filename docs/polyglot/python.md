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

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Python SDK

The Python SDK is a thin, async-first client for a self-hosted Durable Workflow
Server or Durable Workflow Cloud namespace runtime. It lets Python processes
start, observe, signal, and cancel workflows through the runtime's
control-plane API, and register as workers that execute workflow tasks and
activities.

The SDK targets the same durable model as the PHP package — instance IDs, run IDs, history events, task queues, and type keys are shared across languages. A Python worker can serve activities for a PHP-authored workflow, and vice versa.

For a capability comparison across the Python SDK, PHP SDK, Rust SDK, and
`dw`, see
[Client and Worker Capabilities](/docs/2.0/polyglot/cli-python-parity/).

For constructor signatures, return types, exception classes, and metric names,
see the generated [Python SDK API reference](https://python.durable-workflow.com/).

Cloud customers use the provisioned namespace's runtime URL and namespace with
separate client and worker credentials. See
[Cloud Managed Runtime](/docs/2.0/polyglot/cloud-control-plane) for that
connection boundary; the quickstart below uses local self-hosted values.

## Requirements

- Python 3.10 or later
- Docker (for the local Server used in this quickstart), an existing
  [self-hosted Server](/docs/2.0/polyglot/server), or a provisioned
  [Cloud namespace runtime](/docs/2.0/polyglot/cloud-control-plane)

## Installation

Install the published SDK version selected by the current 2.0 prerelease
artifact tuple:

The package authority for this docs line is the exact
<PythonPackageReleaseLink>Python SDK %%artifact.pythonPublishedSdkVersion%%
release</PythonPackageReleaseLink>. The install command remains pinned to the
compatibility-qualified aggregate used by the runnable quickstart.

<!-- docs-example id="python.sdk.install" -->
```bash
pip install %%artifact.pythonPackagePin%%
```

The SDK depends on [httpx](https://www.python-httpx.org/) for HTTP and on the
`fastavro` Python package to encode the Apache Avro wire format used by the
default language-neutral payload codec. Prometheus metrics support is optional.

## Quickstart

Here is a complete Python program that defines a workflow with one activity, starts it against a local Durable Workflow server, and waits for the result:

<!-- docs-example id="python.quickstart.worker" -->
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
    async with Client("http://localhost:8080", token="dev-token", namespace="default") as client:
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

The program above assumes a Durable Workflow server reachable at
`http://localhost:8080` with the local `dev-token`. If you don't have one yet,
the fastest source-free path is the published server image:

```bash
export DW_SERVER_IMAGE=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-python-quickstart

docker run --rm \
  -v durable-workflow-python-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE" server-bootstrap

docker rm -f durable-workflow-server >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 8080:8080 \
  -v durable-workflow-python-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE"

until curl -sf http://localhost:8080/api/ready > /dev/null; do sleep 1; done
```

For production deployment — auth drivers, database config, TLS — see the [server setup guide](/docs/2.0/polyglot/server).

For a larger example, the SDK repository includes [`examples/order_processing`](https://github.com/durable-workflow/sdk-python/tree/main/examples/order_processing), a Docker Compose stack that runs a Python worker through an order workflow end to end.

## Client API Reference

The async `durable_workflow.Client` is the public entry point for control-plane
and worker-plane HTTP calls. Use it as an async context manager so the
underlying `httpx.AsyncClient` connection pool closes cleanly.

```python
from durable_workflow import Client

async with Client(
    "https://workflow.example.com",
    token="shared-token",
    namespace="default",
    timeout=60.0,
) as client:
    info = await client.get_cluster_info()
```

### Constructor

| Argument | Type | Default | Use when |
| --- | --- | --- | --- |
| `base_url` | `str` | required | Server origin, without `/api`. |
| `token` | `str | None` | `None` | One bearer token should authorize both control-plane and worker-plane calls. |
| `control_token` | `str | None` | `None` | Control-plane calls need a different bearer token than worker polling. |
| `worker_token` | `str | None` | `None` | Worker-plane calls need a different bearer token than operator calls. |
| `namespace` | `str` | `"default"` | Target a server namespace through `X-Namespace`. |
| `timeout` | `float` | `60.0` | Override the default HTTP timeout. |
| `retry_policy` | `TransportRetryPolicy | None` | default policy | Tune transport retries for transient HTTP failures. |
| `metrics` | `MetricsRecorder | None` | no-op | Emit client and worker metrics to a custom recorder. |
| `payload_size_limit_bytes` | `int` | SDK default | Match the server's max payload-byte contract. |
| `payload_size_warning_threshold_percent` | `int` | SDK default | Warn before a payload reaches the configured limit. |
| `payload_size_warnings` | `bool` | `True` | Disable local payload-size warnings in tests or controlled scripts. |

`token` is the simplest option. If both `control_token` and `worker_token` are
set, control-plane methods use `control_token` and worker-plane methods use
`worker_token`.

### External Payload Storage

The SDK exports the same external-payload reference contract used by the server
and CLI storage APIs. Use it when Python activity handlers or invocable
carriers need to decode large payload references from workflow history, or when
a Python process needs to create a language-neutral payload envelope without
embedding large bytes inline.

| API | Role | Failure surface |
| --- | --- | --- |
| `ExternalStorageDriver` | Protocol for `put(data, sha256=..., codec=...)`, `get(uri)`, and `delete(uri)`. | Driver-raised storage errors. |
| `LocalFilesystemExternalStorage` | Dependency-free `file://` driver for local development and tests. | `ValueError` when a referenced URI escapes the configured root. |
| `S3ExternalStorage` | Adapter for a boto3-compatible client. | `ValueError` for foreign bucket/prefix references or non-byte responses. |
| `GCSExternalStorage` | Adapter for a google-cloud-storage-style client. | `ValueError` for foreign bucket/prefix references or non-byte responses. |
| `AzureBlobExternalStorage` | Adapter for an Azure container client. | `ValueError` for foreign container/prefix references or non-byte responses. |
| `ExternalPayloadReference` | Immutable wire reference with `uri`, `sha256`, `size_bytes`, `codec`, and schema. | `ValueError` when `from_dict()` receives an unsupported schema or malformed fields. |
| `ExternalPayloadCache` | Bounded replay cache for already verified external payload bytes. | Constructor rejects non-positive entry or byte limits. |
| `store_external_payload()` | Stores encoded bytes through a driver and returns `ExternalPayloadReference`. | Driver errors. |
| `fetch_external_payload()` | Fetches referenced bytes, then verifies size and SHA-256 before decode. | `ExternalPayloadIntegrityError` on size/hash mismatch. |
| `delete_external_payload()` | Deletes the referenced object and evicts any cache entry. | Driver-raised storage errors. |
| `external_storage_envelope()` | Encodes a value inline until the threshold is crossed, then writes bytes through a driver. | `ValueError` when the threshold is invalid or no driver can resolve a reference. |
| `external_storage_driver_from_policy()` | Builds the matching driver from a server or Cloud `external_payload_storage` policy, given application-supplied provider clients. | `ValueError` when the policy is disabled, unsupported, or missing the required client/bucket/container. |

```python
from durable_workflow import (
    ExternalPayloadCache,
    LocalFilesystemExternalStorage,
    external_storage_envelope,
    to_avro_payload_value,
)
from durable_workflow.external_storage import fetch_external_payload, store_external_payload

storage = LocalFilesystemExternalStorage("/var/lib/durable-workflow/payloads")
cache = ExternalPayloadCache(max_entries=256, max_bytes=32 * 1024 * 1024)

payload = to_avro_payload_value({"invoice_pdf": "x" * 1_000_000})
envelope = external_storage_envelope(
    payload,
    external_storage=storage,
    threshold_bytes=64 * 1024,
)

reference = store_external_payload(storage, b'{"archived":true}', codec="json")
payload_bytes = fetch_external_payload(storage, reference, cache=cache)
```

The reference schema is `EXTERNAL_PAYLOAD_REFERENCE_SCHEMA`
(`durable-workflow.v2.external-payload-reference.v1`). Object-store adapters do
not add cloud SDK dependencies to `durable-workflow`; applications pass their
already configured S3, GCS, or Azure clients.

The wire envelope fields are intentionally small and stable:

```json
{
  "schema": "durable-workflow.v2.external-payload-reference.v1",
  "uri": "s3://dw-payloads/billing/run-001/input.json",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "size_bytes": 1048576,
  "codec": "json",
  "expires_at": "2026-05-22T00:00:00Z"
}
```

`ExternalPayloadReference.from_dict()` rejects unknown schemas and malformed
fields. `fetch_external_payload()` verifies `size_bytes` and `sha256` before
returning bytes, and raises `ExternalPayloadIntegrityError` when the object is
missing, truncated, or mutated. Worker replay should use `ExternalPayloadCache`
only after verification, so repeated history reads avoid refetching the same
blob without weakening integrity checks.

When the application has already read the namespace's
`external_payload_storage` policy from the server or Cloud control plane,
`external_storage_driver_from_policy()` returns the matching driver. Provider
SDK clients remain application-owned, so the SDK never adds boto3,
google-cloud-storage, or azure-storage-blob as runtime dependencies:

```python
from durable_workflow.external_storage import external_storage_driver_from_policy

namespace = await client.describe_namespace("billing")
driver = external_storage_driver_from_policy(
    namespace.external_payload_storage,
    s3_client=application_owned_s3_client,
)
```

The factory raises `ValueError` when the policy is disabled, when the named
driver is unsupported, or when the matching provider client is missing.
Disabled policies do not return a no-op driver; callers should branch on
`policy.enabled` before asking for a driver.

### Namespaces

Namespaces are the tenancy boundary for workflows, schedules, search
attributes, and external payload storage. The Client targets one namespace at a
time through the `namespace=` constructor argument, but the operator surface
below applies to any namespace the bearer token is authorized for.

| Method | Returns | Failure surface |
| --- | --- | --- |
| `await client.list_namespaces()` | `NamespaceList` | Auth/server errors. |
| `await client.describe_namespace(name)` | `NamespaceDescription` | `NamespaceNotFound`, auth/server errors. |
| `await client.create_namespace(name, description=None, retention_days=30)` | `NamespaceDescription` | `InvalidArgument` for duplicate names or invalid retention, auth/server errors. |
| `await client.update_namespace(name, description=None, retention_days=None)` | `NamespaceDescription` | `NamespaceNotFound`, `InvalidArgument`, auth/server errors. Only provided fields are sent. |
| `await client.set_namespace_external_storage(name, driver=..., enabled=True, threshold_bytes=None, config=None)` | `NamespaceDescription` | `InvalidArgument` when the policy fails server validation, auth/server errors. |
| `await client.test_external_storage(driver=None, small_payload_bytes=None, large_payload_bytes=None)` | `StorageTestResult` | `InvalidArgument` when the bound policy is missing required fields, auth/server errors. |

`set_namespace_external_storage` mirrors `dw namespace:set-storage-driver`. The
first positional argument is the namespace `name`, matching `describe_namespace`,
`create_namespace`, and `update_namespace`. The deprecated `namespace=` alias
emits a `DeprecationWarning`; new code should use the positional `name`. The
`config` dict carries driver-specific keys including the optional `disk` field
on `s3`, `gcs`, and `azure` so credentials stay on the server. The returned
`NamespaceDescription` reflects the policy the server actually persisted —
including the threshold the server fell back to when no caller value was
provided.

`test_external_storage` mirrors `dw storage:test`. The server round-trips a
small and large payload through the bound external storage driver and returns
`StorageTestResult`, which exposes per-payload `StoragePayloadTestResult`
records with `wrote`, `read`, `verified`, `latency_ms`, and `bytes` fields.

`NamespaceDescription` carries the namespace's `external_payload_storage`
policy as documented in [External Payload Storage](#external-payload-storage).
Pair it with `external_storage_driver_from_policy()` to build the matching
Python driver from the policy without re-reading credentials in application
code.

### Cluster and Task Queues

| Method | Returns | Notes |
| --- | --- | --- |
| `await client.health()` | `dict[str, Any]` | Calls the health endpoint for readiness checks. |
| `await client.get_cluster_info()` | `dict[str, Any]` | Reads server version, protocol, capability, and compatibility metadata. |
| `await client.list_task_queues()` | `TaskQueueList` | Lists task queues visible in the namespace. |
| `await client.describe_task_queue(name)` | `TaskQueueDescription` | Returns worker capacity, current leases, query admission, and dispatch-budget facts. |
| `await client.list_task_queue_build_ids(task_queue)` | `TaskQueueBuildIdRollout` | Snapshots the per-build-id cohort state for a queue, including unversioned workers under a cohort whose `build_id` is `None`. |
| `await client.drain_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | Marks a build-id cohort as draining so it stops claiming new tasks. Pass `build_id=None` to drain unversioned workers. Idempotent. |
| `await client.resume_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | Reverts a previous drain so the cohort can claim work again. Pass `build_id=None` to resume unversioned workers. Idempotent. |

Task queue return types expose nested `TaskQueueAdmission`,
`TaskQueueTaskAdmission`, `TaskQueueQueryAdmission`, `TaskQueueBuildIdCohort`,
`TaskQueueBuildIdRollout`, and `TaskQueueBuildIdRolloutState` dataclasses so
scripts can check server-side capacity and build-id rollout without parsing
prose output. See
[Worker Build-Id Rollout](/docs/2.0/polyglot/worker-build-id-rollout) for the
end-to-end rollout walkthrough; the CLI mirrors of these methods are
`dw task-queue:build-ids`, `dw task-queue:drain`, and `dw task-queue:resume`.

### Workflow Operations

| Method | Returns | Failure surface |
| --- | --- | --- |
| `await client.start_workflow(...)` | `WorkflowHandle` | `WorkflowAlreadyStarted`, `InvalidArgument`, `Unauthorized`, `ServerError` |
| `await client.describe_workflow(workflow_id)` | `WorkflowExecution` | `WorkflowNotFound`, auth/server errors |
| `await client.list_workflows(...)` | `WorkflowList` | Auth/server errors |
| `await client.list_workflow_runs(workflow_id)` | `WorkflowRunList` | `WorkflowNotFound`, auth/server errors |
| `await client.describe_workflow_run(workflow_id, run_id)` | `WorkflowRun` | `WorkflowNotFound`, auth/server errors |
| `await client.get_history(workflow_id, run_id)` | decoded history payload | `WorkflowNotFound`, auth/server errors |
| `await client.export_history(workflow_id, run_id)` | decoded archival history payload | `WorkflowNotFound`, auth/server errors |
| `await client.signal_workflow(workflow_id, signal_name, args=None)` | `None` | `WorkflowNotFound`, `InvalidArgument`, auth/server errors |
| `await client.query_workflow(workflow_id, query_name, args=None)` | decoded query result | `QueryFailed`, `WorkflowNotFound`, auth/server errors |
| `await client.update_workflow(workflow_id, update_name, args=None, ...)` | decoded update result | `UpdateRejected`, `WorkflowNotFound`, auth/server errors |
| `await client.cancel_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`, auth/server errors |
| `await client.terminate_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`, auth/server errors |
| `await client.repair_workflow(workflow_id)` | `WorkflowCommandResult` | `WorkflowNotFound`, auth/server errors |
| `await client.archive_workflow(workflow_id, reason=None)` | `WorkflowCommandResult` | `WorkflowNotFound`, auth/server errors |
| `await client.get_result(handle, poll_interval=0.5, timeout=30.0)` | decoded workflow output | `WorkflowFailed`, `WorkflowCancelled`, `WorkflowTerminated`, `TimeoutError` |

`start_workflow` accepts `workflow_type`, `task_queue`, optional
`workflow_id`, optional `input`, `duplicate_policy`, `memo`,
`search_attributes`, `business_key`, `execution_timeout_seconds`, and
`run_timeout_seconds`. All caller payloads are Avro-enveloped before they cross
the HTTP boundary.

Use `client.get_workflow_handle(workflow_id, run_id=None, workflow_type="")`
when a script already knows the workflow id and wants handle-style methods.

| `WorkflowHandle` method | Equivalent client method |
| --- | --- |
| `await handle.result(...)` | `client.get_result(handle, ...)` |
| `await handle.describe()` | `client.describe_workflow(handle.workflow_id)` |
| `await handle.signal(name, args=None)` | `client.signal_workflow(...)` |
| `await handle.query(name, args=None)` | `client.query_workflow(...)` |
| `await handle.update(name, args=None, ...)` | `client.update_workflow(...)` |
| `await handle.cancel(reason=None)` | `client.cancel_workflow(...)` |
| `await handle.terminate(reason=None)` | `client.terminate_workflow(...)` |

### Schedules

Schedules use `ScheduleSpec` for calendar/interval rules and `ScheduleAction`
for the workflow start request issued when a schedule fires.

| Method | Returns | Notes |
| --- | --- | --- |
| `await client.create_schedule(...)` | `ScheduleHandle` | Creates a schedule and returns a handle. |
| `await client.list_schedules()` | `ScheduleList` | Lists visible schedules. |
| `await client.describe_schedule(schedule_id)` | `ScheduleDescription` | Reads schedule status, action, next fire, and counters. |
| `await client.update_schedule(schedule_id, ...)` | `None` | Updates spec, action, overlap policy, jitter, memo, search attributes, or note. |
| `await client.pause_schedule(schedule_id, note=None)` | `None` | Pauses future fires. |
| `await client.resume_schedule(schedule_id, note=None)` | `None` | Resumes a paused schedule. |
| `await client.trigger_schedule(schedule_id, overlap_policy=None)` | `ScheduleTriggerResult` | Requests an immediate fire. |
| `await client.backfill_schedule(schedule_id, start_time=..., end_time=..., overlap_policy=None)` | `ScheduleBackfillResult` | Replays missed fire windows. |
| `await client.get_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `ScheduleHistoryPage` | Returns one page of the schedule's audit history stream, ordered by `sequence` ascending. `limit` is clamped server-side between 1 and 500 (default 100); `after_sequence` is a non-negative cursor obtained from the previous page's `next_cursor`. Raises `ScheduleNotFound` if the schedule id is unknown. History survives a `delete_schedule` call so operators can audit why a schedule was removed. |
| `client.iter_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `AsyncIterator[ScheduleHistoryEvent]` | Yields every audit event for the schedule, paging under the hood until the server reports `has_more=False`. Same failure surface as `get_schedule_history`. |
| `await client.delete_schedule(schedule_id)` | `None` | Deletes the schedule. |

`client.get_schedule_handle(schedule_id)` returns a `ScheduleHandle` with
`describe`, `update`, `pause`, `resume`, `trigger`, `backfill`, `history`,
`iter_history`, and `delete` methods that forward to the corresponding client
methods. `ScheduleHandle.history(...)` returns a `ScheduleHistoryPage` and
`ScheduleHandle.iter_history(...)` returns an `AsyncIterator[ScheduleHistoryEvent]`.

A `ScheduleHistoryPage` carries the ordered `events` list, a `has_more` flag,
a `next_cursor` integer (or `None` on the final page), the `schedule_id`, and
the owning `namespace`. Each `ScheduleHistoryEvent` carries `sequence`,
`event_type` (`ScheduleCreated`, `SchedulePaused`, `ScheduleResumed`,
`ScheduleUpdated`, `ScheduleTriggered`, `ScheduleTriggerSkipped`, or
`ScheduleDeleted`), `recorded_at`, optional `workflow_instance_id` and
`workflow_run_id` for fired workflows, and the raw `payload` dictionary the
control plane recorded for the transition.

### Bridge Events and Worker-Plane Methods

`await client.send_webhook_bridge_event(adapter, action=..., target=..., input=..., idempotency_key=..., correlation=None)`
returns `BridgeAdapterOutcome`, the same machine-readable outcome contract used
by `dw bridge:webhook`. It is the Python entry point for bounded ingress from
webhook-shaped systems.

The low-level worker-plane methods are public for custom workers and protocol
tests, but normal applications should use `Worker`:

| Method group | Methods |
| --- | --- |
| Worker registration | `register_worker` |
| Workflow tasks | `poll_workflow_task`, `complete_workflow_task`, `fail_workflow_task`, `workflow_task_history` |
| Query tasks | `poll_query_task`, `complete_query_task`, `fail_query_task` |
| Activity tasks | `poll_activity_task`, `complete_activity_task`, `fail_activity_task`, `heartbeat_activity_task` |

These methods send `X-Durable-Workflow-Protocol-Version` and use `worker_token`
when one is configured. Prefer the higher-level `Worker` unless you are writing
an SDK adapter or protocol conformance test.

`workflow_task_history(...)` pages replay history for one already leased
workflow task. Call it only after `poll_workflow_task(...)` returns
`next_history_page_token`:

```python
page = await client.workflow_task_history(
    task_id="workflow-task-01",
    next_history_page_token="history-page-2",
    lease_owner="python-worker-1",
    workflow_task_attempt=2,
)
```

The request body uses `next_history_page_token`, `lease_owner`, and
`workflow_task_attempt`. The decoded response uses the worker-protocol field
names `history_events`, `total_history_events`, and
`next_history_page_token`; it does not use the control-plane run-history names
`events` or `next_page_token`.

### Workers

The worker registry exposes which workers the server has seen recently and what
each worker can run. Use these methods to drive build-id rollouts, find stale
workers to deregister, and reconcile fleet capacity from operator scripts.

| Method | Returns | Failure surface |
| --- | --- | --- |
| `await client.list_workers(task_queue=None, status=None)` | `WorkerList` | Auth/server errors. |
| `await client.describe_worker(worker_id)` | `WorkerDescription` | `WorkerNotFound`, auth/server errors. |
| `await client.deregister_worker(worker_id)` | `dict[str, Any]` | `WorkerNotFound`, auth/server errors. |

`list_workers` filters server-side: pass `task_queue` to scope to one queue and
`status` to a single status string the server recognizes. The default returns
every registered worker for the namespace.

`WorkerDescription` carries the worker's runtime, SDK version, build id,
declared workflow and activity types, last heartbeat, and current task
admission so a script can decide which cohort to drain or which workers to
remove from the roster.

`deregister_worker` is idempotent on the server side; it removes a worker that
no longer heartbeats so capacity accounting and `list_workers` stay clean.
It does not interrupt in-flight leases.

### Search Attributes

Search attributes are typed namespace metadata that appear on workflow
executions for filtering and indexing. The Python client mirrors the same
control-plane surface as the CLI.

| Method | Returns | Failure surface |
| --- | --- | --- |
| `await client.list_search_attributes()` | `SearchAttributeList` | Auth/server errors. |
| `await client.create_search_attribute(name, attribute_type)` | `dict[str, Any]` | `InvalidArgument` for duplicate names or unsupported types, auth/server errors. |
| `await client.delete_search_attribute(name)` | `dict[str, Any]` | `SearchAttributeNotFound`, `InvalidArgument` when the attribute is system-defined, auth/server errors. |

`SearchAttributeList` separates `system` and `custom` attribute definitions so
operator scripts can verify that the engine-defined keys (workflow id, status,
type, start time, etc.) are present before refusing to create a clashing custom
key. Supported `attribute_type` values are `keyword`, `text`, `int`, `double`,
`bool`, `datetime`, and `keyword_list`.

### System Maintenance

Operator scripts and on-call automation drive the same maintenance loops as the
`dw system:*` commands through the Client. Each method requires the bearer
token to carry admin scope; without it the server returns `Unauthorized`.

| Method | Returns | CLI mirror |
| --- | --- | --- |
| `await client.repair_status()` | `dict[str, Any]` | `dw system:repair-status` |
| `await client.repair_pass(run_ids=None, instance_id=None)` | `dict[str, Any]` | `dw system:repair-pass` |
| `await client.retention_status()` | `dict[str, Any]` | `dw system:retention-status` |
| `await client.retention_pass(run_ids=None, limit=None)` | `dict[str, Any]` | `dw system:retention-pass` |
| `await client.activity_timeout_status()` | `dict[str, Any]` | `dw system:activity-timeout-status` |
| `await client.activity_timeout_pass(execution_ids=None, limit=None)` | `dict[str, Any]` | `dw system:activity-timeout-pass` |

`repair_pass` runs one task-repair sweep. With no filters the server runs a
full-scope pass over the namespace; pass `run_ids` to narrow the sweep to a
specific list of workflow runs, or `instance_id` to bound it to a single
running instance.

`retention_pass` enforces the namespace retention window on terminal runs.
With no filters the server prunes expired runs up to its scan limit; pass
`run_ids` to narrow the sweep, or `limit` to bound how many runs a single pass
processes. The companion `retention_status()` reports the namespace retention
window, the cutoff, and the run ids currently eligible for pruning up to the
server's scan limit.

`activity_timeout_pass` enforces start-to-close and schedule-to-close deadlines
on activity executions that have already passed their deadline. With no
filters the server processes any expired activity executions up to its scan
limit; pass `execution_ids` to target a specific list, or `limit` to bound a
single pass.

These methods do not raise on empty work — repeated calls during a quiet
period return the same `passes` / `repaired` / `pruned` counters with zero
deltas, so they are safe to call from cron-driven operator scripts.

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
| `interceptors` | `()` | Ordered worker task wrappers for instrumentation, tracing, and policy hooks |

The two `max_concurrent_*` values are advertised to the server during worker
registration and appear in task queue admission diagnostics. Treat them as the
worker's local capacity. Use server-side
[task queue admission](/docs/2.0/polyglot/task-queue-admission) caps when a
namespace, queue, or downstream budget group needs a hard shared budget across
multiple workers.

### Worker API Reference

| Method | Returns | Use when |
| --- | --- | --- |
| `await worker.run()` | `None` | Long-running process supervised by systemd, Docker, Kubernetes, or a local dev shell. Registers once, then polls workflow, activity, and query tasks until stopped or cancelled. |
| `await worker.run_until(workflow_id=..., timeout=60.0, poll_interval=0.5)` | `WorkflowExecution` | Smoke tests and examples that start one workflow and want the same process to drive it until a terminal status. |
| `await worker.stop()` | `None` | Cooperative shutdown. Stops new polls and drains in-flight tasks up to `shutdown_timeout`. |

`run()` validates server compatibility before it starts polling. The worker
requires the server's published `control_plane.version`,
`control_plane.request_contract`, `worker_protocol.version`, and
`auth_composition_contract` to match the SDK's supported contract versions. A
missing or incompatible manifest raises `RuntimeError` during registration, so
supervisors fail fast instead of running a worker that cannot safely complete
tasks.

`run_until()` uses the same registration and dispatch path as `run()`, but
polls sequentially and returns the final `WorkflowExecution` for the named
workflow. It raises `TimeoutError` when the workflow is still non-terminal
after the timeout.

During task execution:

- unknown workflow or activity types are reported back to the server as task
  failures, not hidden in local logs
- `NonRetryableError` marks activity failures as non-retryable
- `ActivityCancelled` propagates as a cancellation outcome
- unhandled activity exceptions are reported as retryable failures unless the
  activity retry policy or server deadline says otherwise
- query handler exceptions are reported as `QueryFailed`

### Worker Interceptors

Pass `interceptors=[...]` when worker execution needs tracing, metrics, audit
logging, or local policy checks around tasks. Interceptors run in the order
provided; the first interceptor is the outer wrapper and should call `next` to
continue the chain.

```python
from durable_workflow import (
    ActivityInterceptorContext,
    PassthroughWorkerInterceptor,
)

class AuditInterceptor(PassthroughWorkerInterceptor):
    async def execute_activity(self, context: ActivityInterceptorContext, next):
        print("activity started", context.activity_type, context.worker_id)
        return await next(context)

worker = Worker(
    client,
    task_queue="orders",
    workflows=[OrderWorkflow],
    activities=[charge_card],
    interceptors=[AuditInterceptor()],
)
```

| Hook | Context fields | `next` returns |
| --- | --- | --- |
| `execute_workflow_task(context, next)` | `worker_id`, `task_queue`, `task` | workflow commands, or `None` |
| `execute_activity(context, next)` | `worker_id`, `task_queue`, `task`, `activity_type`, `args` | decoded activity result |
| `execute_query_task(context, next)` | `worker_id`, `task_queue`, `task` | encoded query result string |

Use `PassthroughWorkerInterceptor` as a base class when you only need one
hook. Implement `WorkerInterceptor` directly when you want type checkers to
force all hooks to be present.

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

# Read the audit history stream (paused/resumed/triggered/updated events)
page = await handle.history(limit=100)
for event in page.events:
    print(event.sequence, event.event_type, event.recorded_at)
while page.has_more and page.next_cursor is not None:
    page = await handle.history(limit=100, after_sequence=page.next_cursor)
    for event in page.events:
        print(event.sequence, event.event_type, event.recorded_at)

# Or iterate every event without managing cursors
async for event in handle.iter_history():
    print(event.sequence, event.event_type)

# Delete the schedule (history survives the delete for audit)
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

## Testing

Workflow authors should be able to test workflow code without a running server
or worker. The `durable_workflow.testing` module ships two entry points:

- `WorkflowEnvironment` drives a workflow to completion in a single Python
  process against user-registered activity mocks.
- `replay_history` and `replay_history_file` replay a captured production
  history against current workflow code and raise on any non-determinism.

Both entry points reuse the same `durable_workflow.workflow.replay` machinery
the worker uses at runtime, so a workflow that passes its test harness behaves
the same way under a real worker.

### WorkflowEnvironment

`WorkflowEnvironment` dispatches yielded workflow commands against registered
mocks and auto-fires timers, side effects, and search-attribute upserts. Tests
do not need a real clock, Redis, or server.

```python
from durable_workflow import workflow
from durable_workflow.testing import WorkflowEnvironment

@workflow.defn(name="greeter")
class Greeter:
    def run(self, ctx, name: str):
        greeting = yield ctx.schedule_activity("greet", [name])
        return greeting


def test_greeter_returns_activity_result() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("greet", "hello, world")

    result = env.execute_workflow(Greeter, "world")

    assert result == "hello, world"
```

| Method | Purpose |
| --- | --- |
| `register_activity_result(name, result)` | Return `result` for every call to activity `name`. Use this when the test does not care about arguments. |
| `register_activity(name, fn)` | Call `fn(*arguments)` for each scheduled invocation of activity `name`. Use this when the mock must vary with arguments or capture invocations. |
| `register_child_workflow_result(workflow_type, result)` | Return `result` when the workflow starts a child of type `workflow_type`. |
| `signal(name, args=None, run=None)` | Queue a signal to be delivered before the next replay iteration. The harness injects a `SignalReceived` event and dispatches it to the registered `@workflow.signal` handler. Pass `run=N` to target link `N` of a continue-as-new chain. |
| `register_workflow(workflow_cls)` | Make an additional workflow class resolvable by name. Required when a chain calls `continue_as_new(workflow_type=...)` with a type other than the starting workflow. |
| `execute_workflow(workflow_cls, *args, run_id="test-run")` | Drive the workflow to a terminal state and return its result. Follows `continue_as_new` links to the final run and returns that run's result. Raises `WorkflowFailed` when the workflow ends in the failed state. |
| `runs` / `run_count` | After `execute_workflow` returns, expose one `WorkflowRunRecord` per link in the chain (input, workflow type, history events, terminal command) so tests can assert on the full continuation chain. |

The harness fails loudly on missing fixtures:

- scheduling an activity that has no registered mock raises `KeyError`
- starting a child workflow that has no registered mock raises `KeyError`
- a workflow that never reaches a terminal state within the iteration limit
  (default `1000`) raises `RuntimeError`

Pass `iteration_limit=...` to `WorkflowEnvironment(...)` to tune the cap for
workflows that legitimately iterate more than the default.

#### Callable activity mocks

Use `register_activity` when the mock needs to respond based on arguments or
record calls:

```python
def test_callable_mock_captures_arguments() -> None:
    captured: list[str] = []

    def record_greet(name: str) -> str:
        captured.append(name)
        return f"greeted:{name}"

    env = WorkflowEnvironment()
    env.register_activity("greet", record_greet)

    assert env.execute_workflow(Greeter, "alice") == "greeted:alice"
    assert captured == ["alice"]
```

#### Signals

Signals queued with `env.signal(...)` are drained before the next replay
iteration. The signal payload is wrapped in the same `{codec, blob}` envelope
the worker sees at runtime and dispatched to the workflow's registered
`@workflow.signal` handler:

```python
@workflow.defn(name="approval")
class Approval:
    def __init__(self) -> None:
        self.approved_by: str | None = None

    @workflow.signal("approve")
    def on_approve(self, by: str) -> None:
        self.approved_by = by

    def run(self, ctx):
        yield ctx.schedule_activity("wait", [])
        return {"approved_by": self.approved_by}


def test_signal_is_delivered_before_run_returns() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("wait", None)
    env.signal("approve", ["alice"])

    result = env.execute_workflow(Approval)

    assert result == {"approved_by": "alice"}
```

#### Timers, side effects, and search attributes

The harness auto-fires the corresponding history event for each of these
commands, so workflows do not block on wall-clock time inside tests:

- `ctx.sleep(seconds)` → `TimerFired`
- `ctx.side_effect(...)` → `SideEffectRecorded`
- `ctx.upsert_search_attributes(...)` → `SearchAttributesUpserted`
- `workflow.version(...)` markers → `VersionMarkerRecorded`

#### Continue-as-new chains

When a workflow returns `ctx.continue_as_new(...)`, the harness appends a
`WorkflowContinuedAsNew` event to the completing run, resets history, and
starts a new run with the command's arguments. The return value of
`execute_workflow` is the terminal result of the final link.

```python
@workflow.defn(name="countdown")
class Countdown:
    def run(self, ctx, counter: int):
        yield ctx.schedule_activity("emit", [counter])
        if counter > 0:
            return ctx.continue_as_new(counter - 1)
        return {"final_counter": counter}


def test_chain_returns_final_run_result() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("emit", None)

    result = env.execute_workflow(Countdown, 3)

    assert result == {"final_counter": 0}
    assert env.run_count == 4
    assert [r.input for r in env.runs] == [[3], [2], [1], [0]]
```

When the chain switches workflow types, register the follow-on class first:

```python
@workflow.defn(name="stage-one")
class StageOne:
    def run(self, ctx):
        yield ctx.schedule_activity("stage_one", [])
        return ctx.continue_as_new(workflow_type="stage-two")


@workflow.defn(name="stage-two")
class StageTwo:
    def run(self, ctx):
        return (yield ctx.schedule_activity("stage_two", []))


def test_chain_can_switch_workflow_type() -> None:
    env = WorkflowEnvironment()
    env.register_workflow(StageTwo)
    env.register_activity_result("stage_one", None)
    env.register_activity_result("stage_two", "done")

    assert env.execute_workflow(StageOne) == "done"
    assert [r.workflow_type for r in env.runs] == ["stage-one", "stage-two"]
```

Target a signal at a specific link in the chain with `run=N`:

```python
env.signal("approve", ["alice"], run=2)  # delivered to the second run
```

The chain length is capped by `continue_as_new_limit` (default `50`).
Exceeding the limit raises `RuntimeError` so tests catch runaway
continuations instead of spinning forever; tune the limit with
`WorkflowEnvironment(continue_as_new_limit=...)` when a chain legitimately
runs longer.

#### Failure assertions

Workflows that raise a Python exception surface as `WorkflowFailed`:

```python
import pytest
from durable_workflow.errors import WorkflowFailed

@workflow.defn(name="failing")
class Failing:
    def run(self, ctx):
        yield ctx.schedule_activity("step", [])
        raise RuntimeError("boom")


def test_workflow_failure_surfaces_as_workflow_failed() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("step", None)

    with pytest.raises(WorkflowFailed) as exc_info:
        env.execute_workflow(Failing)

    assert "boom" in str(exc_info.value)
```

### Replay testing against production history

Use `replay_history` to regression-test a workflow change against a real
history captured from the server. The replayer runs the current workflow code
against the recorded event sequence and raises if it yields a different
command than the one history recorded — the definition of a non-determinism
bug.

```python
from durable_workflow import Client
from durable_workflow.testing import replay_history

async with Client("http://localhost:8080") as client:
    history = await client.get_history("order-42", run_id="...")

replay_history(OrderWorkflow, history["events"], start_input=["order-42"])
```

A workflow that previously completed must still complete when replayed
against the same history. If the workflow code changed in a way that diverges
from the recorded sequence (reordered activity calls, removed branches,
changed activity types), `replay_history` raises so the regression is caught
in CI rather than in production.

`replay_history_file` is a convenience wrapper that reads a JSON file in
either of two shapes: a top-level list of events, or a dict with an `events`
key matching the `get_history` response shape:

```python
from durable_workflow.testing import replay_history_file

replay_history_file(
    OrderWorkflow,
    "tests/histories/order-42.json",
    start_input=["order-42"],
)
```

Both functions accept an optional `payload_codec` override. Leave it unset to
use the codec the history recorded.

#### Class-based replayer

When one test pass replays histories for several different workflow types, or
when the test should let the captured `WorkflowStarted` event decide which
workflow to replay, use the `Replayer` class. Register every workflow class
up front and call `replay(...)` once per captured history:

```python
from durable_workflow import Replayer, ReplayOutcome

replayer = Replayer(workflows=[OrderWorkflow, RefundWorkflow])

# Explicit type and input — equivalent to replay_history(OrderWorkflow, ...).
outcome: ReplayOutcome = replayer.replay(
    history["events"],
    start_input=["order-42"],
    workflow_type="order",
)

# Type and start input inferred from a WorkflowStarted event in the history.
outcome = replayer.replay(history)  # history may be an events list or a
                                    # dict with an "events" key

for command in outcome.commands:
    # Inspect commands the replayed workflow would have emitted next.
    ...
```

`Replayer(workflows=[...])` rejects an empty workflow set or a duplicate
registration with `ValueError`. `replay(...)` raises `ValueError` when a
history asks for a workflow type that was not registered, or when multiple
workflows are registered and the caller does not provide `workflow_type` and
the history does not include a `WorkflowStarted` event.

`ReplayOutcome.commands` is the same command list the functional
`replay_history` helpers return; the class-based entry point exists so a test
suite can share one registration across many histories.

### Test Harness Reference

| Symbol | Purpose |
| --- | --- |
| `durable_workflow.testing.WorkflowEnvironment` | In-process test harness. Drive a workflow to completion against registered activity and child-workflow mocks. |
| `durable_workflow.testing.replay_history(workflow_cls, events, start_input=None, *, run_id="", payload_codec=None)` | Replay a history event sequence against current workflow code. Raises on non-determinism. |
| `durable_workflow.testing.replay_history_file(workflow_cls, path, start_input=None, *, run_id="", payload_codec=None)` | Load a JSON history from disk and replay it. Accepts either a top-level list of events or a dict with an `events` key. |
| `durable_workflow.Replayer(*, workflows=[...])` | Class-based replayer. Register one or more workflow classes, then call `replay(history, start_input=None, *, workflow_type=None, workflow_id=None, run_id="", payload_codec=None)` to replay each captured history. Infers `workflow_type` and `start_input` from a `WorkflowStarted` event when the history contains one. |
| `durable_workflow.ReplayOutcome` | Dataclass returned by `Replayer.replay`. Carries `commands: list[Command]` — the commands the replayed workflow would have emitted next. |
| `durable_workflow.errors.WorkflowFailed` | Raised by `execute_workflow` when the workflow terminates in the failed state. |
| `durable_workflow.errors.WorkflowCancelled` | Terminal state when the workflow was cancelled. Inherits from `BaseException`. |
| `durable_workflow.errors.WorkflowTerminated` | Terminal state when the workflow was terminated by the server. Inherits from `BaseException`. |

## Payload Codecs

Every payload that crosses the worker-protocol boundary is codec-tagged. v2 ships a single language-neutral codec, **`avro`**, which is the Python SDK's default for every outgoing client and worker payload — matching the server, PHP, and every other polyglot SDK.

### Avro support is built in

The pinned 2.0 SDK artifact pulls in `fastavro` as a runtime dependency, so
every outgoing surface (`start_workflow`, `signal_workflow`, `query_workflow`,
`update_workflow`, activity result encoding, schedule actions) emits
Avro-tagged payloads through the optimized production path. There is no
optional codec extra to install.

### Fixed typed values

The SDK explicitly selects named branches in the shared
`durable_workflow.protocol.Value` schema. It does not JSON-encode the value
inside Avro. Integers and doubles, strings and bytes, booleans and integers,
and lists and maps therefore remain distinct across SDKs. The wire uses Avro
single-object framing and the schema fingerprint; unknown fingerprints fail
with `unsupported_payload_schema`.

Every client and worker surface works end-to-end on the Avro default:

- **Client starts, signals, queries, updates** — `start_workflow`, `signal_workflow`, `query_workflow`, and `update_workflow` emit `payload_codec = "avro"` payloads through the fixed Value schema. A Python client can therefore drive workflows that PHP and other polyglot SDKs will replay, and vice-versa.
- **Activity worker** — Avro-tagged activity arguments decode transparently. The worker encodes activity results as Avro so PHP, Python, and future SDK workers share one payload boundary.
- **Activity failures** — `fail_activity_task(..., details=...)` sends `failure.details` as a `{codec, blob}` envelope. The server records the blob plus `details_payload_codec`, so diagnostic failure data from Python workers remains language-neutral in history exports and observability views.
- **Workflow worker history replay** — Avro-tagged start input and activity result events are decoded during replay, so a Python workflow can participate in an Avro-coded run.
- **Workflow query tasks** — Server-routed query tasks carry Avro-tagged workflow arguments, query arguments, and replay history. The worker returns the query result as an Avro envelope.

### Running a Python activity worker against an Avro-coded run

No extra configuration is needed: the SDK reads `payload_codec` on every claim and picks the right decoder. If the server default is `avro` and the activity task arrives Avro-coded, the Python worker decodes it, runs the activity, and encodes the result back as `avro`.

### Types that round-trip cleanly across Python and PHP

| Python type | Avro Value branch | PHP type |
|-------------|------|----------|
| `str` | `StringValue` | `string` |
| `bytes` | `BytesValue` | `AvroBinaryValue` |
| `int` | `LongValue` | `int` |
| `float` | `DoubleValue` | `float` |
| `bool` | `BooleanValue` | `bool` |
| `None` | `null` | `null` |
| `list` | `ArrayValue` | `array` (list) |
| `dict[str, ...]` | `MapValue` | `array` (string-keyed map) |

Adapt Python-specific types such as dataclasses, sets, tuples, and datetime
objects to canonical strings, integers, maps, or lists before using them as
workflow or activity values.

## Running Against a Shared Server

The [Quickstart](#quickstart) above shows how to bring up a local server with
the published Docker image. In a team environment you usually point the Python
worker at an existing server (staging, production, or a shared dev instance):

```python
from durable_workflow import Client

client = Client(
    "https://workflow.example.internal",
    control_token="team-orders-operator-token",
    worker_token="team-orders-worker-token",
    namespace="team-orders",
)
```

Set the `namespace` argument to whichever tenant namespace the shared server has
provisioned for your team, and use the credentials issued for that namespace.
The Server operator manages namespace creation; see the
[Server guide](/docs/2.0/polyglot/server) for details.

The same constructor supports a Cloud managed runtime. Use the namespace's
Cloud-provided runtime URL and namespace value, set `control_token` to the
client runtime credential, and set `worker_token` to the worker runtime
credential. Cloud provisions the namespace; do not substitute a self-hosted
Server address. See
[Cloud Managed Runtime](/docs/2.0/polyglot/cloud-control-plane).
