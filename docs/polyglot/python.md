---
sidebar_position: 4
tags:
  - Python
  - SDK
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - Python SDK
  - durable_workflow Client
  - Python worker
  - async workflow client
---

import ProductPromotion from '@site/src/components/ProductPromotion';
import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Python SDK

The Python SDK is a thin, async-first client for a self-hosted Durable Workflow
Server or Durable Workflow Cloud namespace runtime. It lets Python processes
start, observe, signal, and cancel workflows through the runtime's
control-plane API, and register as workers that execute workflow tasks and
activities.

## Try the local Sample App playground

For the shortest no-Cloud authoring journey, open the current Sample App
[`main` branch in GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
and run:

<!-- docs-example id="sdk.python.sample-app-playground" -->
```bash
scripts/playground python
```

The local playground generates caller-owned workflow and activity source,
selects the current stable artifacts, and starts the published
Server and Waterline. It waits for a worker registration whose identity,
workflow type, activity type, and task queue match the generated contract before
starting the workflow. Success requires the expected completed result and
history; the terminal then prints the exact local Waterline run link and the
path to structured JSON evidence.

The package installation, inline quickstart, API reference, and repository
example below remain the direct paths for users who do not want Sample App.

<ProductPromotion source="docs-v2-python-sdk">
Run Python clients and workers against a Cloud-managed namespace with separate
role-scoped credentials.
</ProductPromotion>

The SDK targets the same durable model as the PHP package — instance IDs, run IDs, history events, task queues, and type keys are shared across languages. A Python worker can serve activities for a PHP-authored workflow, and vice versa.

For a capability comparison across the Python SDK, PHP SDK, Rust SDK, and
`dw`, see
[Client and Worker Capabilities](/docs/polyglot/cli-python-parity/).

For constructor signatures, return types, exception classes, and metric names,
see the generated [Python SDK API reference](https://python.durable-workflow.com/).

Python SDK 2.5.0 adds an optional bounded history cache for sticky execution.
Use Server 2.5.10 or newer and enable it on each worker. See
[Portable Worker Affinity](/docs/polyglot/portable-worker-affinity) and the
[Python guide and runnable example](https://python.durable-workflow.com/guides/sticky-execution/).

Cloud customers use the provisioned namespace's runtime URL and namespace with
separate client and worker credentials. See
[Cloud Managed Runtime](/docs/polyglot/cloud-control-plane) for that
connection boundary; the quickstart below uses local self-hosted values.

## Requirements

- Python 3.10 or later
- Docker (for the local Server used in this quickstart), an existing
  [self-hosted Server](/docs/polyglot/server), or a provisioned
  [Cloud namespace runtime](/docs/polyglot/cloud-control-plane)

## Installation

Install the <PythonPackageReleaseLink authority="qualified">stable Python SDK
release</PythonPackageReleaseLink>. The exact requirement is generated
from the same tuple as the Server quickstart, and a lock or constraints file can
retain it for reproducibility.

<!-- docs-example id="python.sdk.install" -->
```bash
pip install %%artifact.pythonPackagePin%%
```

The SDK depends on [httpx](https://www.python-httpx.org/) for HTTP and on the
`fastavro` Python package to encode the Apache Avro wire format used by the
only public v2 payload codec. Prometheus metrics support is optional.

## Quickstart

Here is a complete Python program that defines a workflow with one activity, starts it against a local Durable Workflow server, and waits for the result:

<!-- docs-example id="python.quickstart.worker" -->
```python
import asyncio
import uuid

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
    workflow_id = f"greeting-{uuid.uuid4().hex}"

    async with Client("http://localhost:8080", token="dev-token", namespace="default") as client:
        handle = await client.start_workflow(
            workflow_type="greeter",
            task_queue="default",
            workflow_id=workflow_id,
            input=["world"],
        )

        worker = Worker(
            client,
            task_queue="default",
            workflows=[GreeterWorkflow],
            activities=[greet],
        )

        await worker.run_until(workflow_id=workflow_id, timeout=30.0)
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

For production deployment — auth drivers, database config, TLS — see the [server setup guide](/docs/polyglot/server).

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
| `token` | `str \| None` | `None` | One bearer token should authorize both control-plane and worker-plane calls. |
| `control_token` | `str \| None` | `None` | Control-plane calls need a different bearer token than worker polling. |
| `worker_token` | `str \| None` | `None` | Worker-plane calls need a different bearer token than operator calls. |
| `namespace` | `str` | `"default"` | Target a server namespace through `X-Namespace`. |
| `timeout` | `float` | `60.0` | Override the default HTTP timeout. |
| `retry_policy` | `TransportRetryPolicy \| None` | default policy | Tune transport retries for transient HTTP failures. |
| `metrics` | `MetricsRecorder \| None` | no-op | Emit client and worker metrics to a custom recorder. |
| `payload_size_limit_bytes` | `int` | SDK default | Match the server's max payload-byte contract. |
| `payload_size_warning_threshold_percent` | `int` | SDK default | Warn before a payload reaches the configured limit. |
| `payload_size_warnings` | `bool` | `True` | Disable local payload-size warnings in tests or controlled scripts. |
| `failure_report_limit_bytes` | `int` | `1048576` | Lower the complete encoded failure-report budget. See [bounded failure reports](#bounded-failure-reports). |

`token` is the simplest option. If both `control_token` and `worker_token` are
set, control-plane methods use `control_token` and worker-plane methods use
`worker_token`.

### Bounded failure reports {#bounded-failure-reports}

Python SDK **2.11.0** introduced bounded outgoing failure reports. Defaults are **62 KiB UTF-8 for the message**, **128 KiB for the stack**, **64 KiB for combined serialized optional details and diagnostics**, and **1 MiB for the complete HTTPX-encoded body**. Markers, JSON escaping, claim identity and other commands in the batch count toward that body limit. A lower configured or discovered transport limit takes precedence. Failure type, class, code, retry policy and claim identity are preserved.

Set a smaller body budget when needed. Payload-size warning settings remain advisory.

```python
from durable_workflow import Client

async with Client(
    "https://workflow.example.com",
    worker_token="worker-token",
    control_token="operator-token",
    failure_report_limit_bytes=512 * 1024,
) as client:
    info = await client.get_cluster_info()
```

A visible truncation marker and original byte counts identify shortened fields. Avro details remain intact or are omitted whole. An unrepresentable required envelope raises `FailureReportTooLarge` before HTTP submission. Local failures are normalized before workflow code observes them, so first execution and cold replay see the persisted message. An already observed local message remains immutable during final batch fitting.

### External Payload Storage

Normal `Client` and `Worker` operations use Server's authenticated runtime
transport automatically. The SDK discovers namespace policy and transport
limits through `GET /api/cluster/info`, uploads encoded values above the
threshold or needed to fit the request, and fetches referenced values before
decode. Application workflow and activity code receives the decoded value.
Provider credentials stay on Server. Remote workers do not need boto3, provider
clients or access to Server's local storage directory.

The runtime reference has schema
`durable-workflow.v2.runtime-external-payload-reference.v1` and an opaque
`reference_id`. It has no provider `uri`. Upload/fetch uses the normal role
credential and namespace, verifies encoded-byte size and SHA-256, and preserves
task-attempt and lease fencing for worker completion. See the
[runtime HTTP contract](./server-api-reference.md#runtime-external-payload-transport)
for routes, limits and typed refusals. SDK support depends on an available
compatible transport, not merely on a configured storage driver.

The following **direct provider helpers** serve application-managed storage
and test fixtures that deliberately access their own provider. They use a
different provider-URI schema. They are not required for normal Server or Cloud
clients, and a provider `external_storage` envelope is rejected by Server with
HTTP `422` and `external_payload_unsupported`.

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
| `external_storage_driver_from_policy()` | Builds a direct driver from an explicitly supplied policy and application-owned provider clients. It does not authorize direct provider access on Server or Cloud. | `ValueError` when the policy is disabled, unsupported, or missing the required client/bucket/container. |

```python
from durable_workflow import (
    ExternalPayloadCache,
    LocalFilesystemExternalStorage,
    external_storage_envelope,
    to_avro_payload_value,
)
from durable_workflow.serializer import encode
from durable_workflow.external_storage import fetch_external_payload, store_external_payload

storage = LocalFilesystemExternalStorage("/var/lib/durable-workflow/payloads")
cache = ExternalPayloadCache(max_entries=256, max_bytes=32 * 1024 * 1024)

payload = to_avro_payload_value({"invoice_pdf": "x" * 1_000_000})
envelope = external_storage_envelope(
    payload,
    external_storage=storage,
    threshold_bytes=64 * 1024,
)

reference = store_external_payload(
    storage,
    encode({"archived": True}).encode("utf-8"),
    codec="avro",
)
payload_bytes = fetch_external_payload(storage, reference, cache=cache)
```

For these direct helpers, the reference schema is `EXTERNAL_PAYLOAD_REFERENCE_SCHEMA`
(`durable-workflow.v2.external-payload-reference.v1`). Object-store adapters do
not add cloud SDK dependencies to `durable-workflow`; applications pass their
already configured S3, GCS, or Azure clients.

Their provider reference has the following fields. This is not the runtime
reference accepted by Server HTTP routes:

```json
{
  "schema": "durable-workflow.v2.external-payload-reference.v1",
  "uri": "s3://dw-payloads/billing/run-001/input.avro",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "size_bytes": 1048576,
  "codec": "avro",
  "expires_at": "2026-05-22T00:00:00Z"
}
```

`ExternalPayloadReference.from_dict()` rejects unknown schemas and malformed
fields. `fetch_external_payload()` verifies `size_bytes` and `sha256` before
returning bytes, and raises `ExternalPayloadIntegrityError` on size or hash
mismatch. Missing objects can also raise the provider driver's error. Use
`ExternalPayloadCache` for verified bytes only. Cache eviction does not grant
permission to delete a Server-managed object. `delete_external_payload()` is a
direct provider operation, not a runtime-reference cleanup API.

Use `external_storage_driver_from_policy()` in code that deliberately accesses
application-owned provider storage and owns the required client. Reading a
namespace policy does not make provider envelopes valid Server requests.
Provider clients remain application-owned; these optional adapters do not add
boto3, google-cloud-storage or azure-storage-blob as runtime dependencies:

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
Normal clients use the discovered runtime transport automatically. Direct
provider helpers require application-owned provider access; a policy description
does not make provider envelopes valid Server requests.

### Cluster and Task Queues

| Method | Returns | Notes |
| --- | --- | --- |
| `await client.health()` | `dict[str, Any]` | Calls the health endpoint for liveness checks. |
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
[Worker Build-Id Rollout](/docs/polyglot/worker-build-id-rollout) for the
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

Both operations close the Server run immediately with distinct terminal
outcomes. `cancel_workflow` does not deliver a cooperative request to workflow
code or run saga/finally cleanup. Use `request_cancellation()` with cooperating
workers for bounded workflow cleanup. See the
[cooperative cancellation guide](/docs/polyglot/cancellation) for operation
policies, supervision and recovery.

### Current workflow identity {#workflow-identity}

Python SDK 2.9.0 and later exposes read-only `ctx.workflow_id` and `ctx.run_id`
inside workflow code. Both are strings from the current task and stay identical
during replay. After continue-as-new, the workflow ID stays unchanged and the
successor gets its own run ID. Do not replace that ID with a predecessor ID
passed as an argument.

```python
from durable_workflow import workflow

@workflow.defn(name="identity")
class IdentityWorkflow:
    def run(self, ctx):
        identity = {"workflow_id": ctx.workflow_id, "run_id": ctx.run_id}
        yield ctx.schedule_activity("record_identity", [identity])
        return identity
```

These properties read local task identity without an HTTP request. For status
polling outside workflow code, use `await client.describe_workflow(workflow_id)`.
Use `await client.query_workflow(workflow_id, query_name)` for state exposed by a
registered query handler. Identity properties do not replace either operation.

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

With no `run_ids`, `retention_pass` asks the PHP Server to prune expired
terminal runs under the current namespace policy, up to its scan limit.
Explicit `run_ids` directly target closed runs and bypass that age scan;
they can prune history younger than the bounded retention window. Forever
retention and archived-run protections still apply. The companion
`retention_status()` reports the current policy, cutoff and bounded eligible
list without deleting history. Review the [retention procedure](./server.md#retention)
before shortening a policy or submitting explicit targets.

`activity_timeout_pass` enforces start-to-close and schedule-to-close deadlines
on activity executions that have already passed their deadline. With no
filters the server processes any expired activity executions up to its scan
limit; pass `execution_ids` to target a specific list, or `limit` to bound a
single pass.

These methods do not raise on empty work — repeated calls during a quiet
period return the same `passes` / `repaired` / `pruned` counters with zero
deltas, so they are safe to call from cron-driven operator scripts.

## Defining Workflows

Workflows are Python classes decorated with `@workflow.defn`. The `run` method is an ordinary synchronous function or a synchronous generator that yields durable commands to the server. Use the generator form when the workflow needs durable work; `async def run` is not supported.

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
        ready = yield ctx.wait_condition(
            lambda: self.approved, key="approval.approved", timeout=60,
        )
        return {
            "status": "approved" if ready else "timed_out",
            "approved": self.approved,
            "approved_by": self.approved_by,
        }
```

The wait belongs to the workflow, not an activity. Its predicate reads replayed
signal-handler state; the worker does not hold an activity slot for the approval.
The condition's timeout is separate from the workflow's finite run and execution
deadlines. For external-job completion, use a short submit-and-return activity
and a [correlated callback](./polling-patterns.md#callback-and-signal-completion).

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

Python workers complete server-routed queries by returning a query-task result
to the server. For a declared update validator, the worker instead receives a
dedicated validation task, replays authoritative workflow state, and invokes
only the validator. The server records no accepted update and dispatches no
update handler until that validation succeeds. Validator-bearing workers refuse
to register unless discovery advertises the synchronous pre-accept contract;
rejection, missing or incompatible workers, worker loss, timeout, and fenced
duplicate or stale completion remain explicit typed outcomes. PHP and Rust do
not currently expose update-validator authoring APIs and advertise that absence
in their workflow contracts rather than claiming validator parity.

### Handler lifecycle {#handler-lifecycle}

**Released validation.** Python SDK 2.6.2 introduced the handler guards below. Server-routed asynchronous queries and update validators remain supported. See [SDK #177](https://github.com/durable-workflow/sdk-python/issues/177#issuecomment-6296781770) for the corrected scope.

Every replay constructs a fresh workflow instance before executing `run()`. Signals already recorded at workflow start are applied after `run()` reaches its first `yield`, so constructor and pre-yield initialization happen first. Signal and update handlers mutate that replayed state. Queries inspect it without changing durable state; update validators inspect a disposable replayed state before acceptance. Put durable activities, timers and child workflow commands in `run()`, not in a handler.

| Handler | Supported form and failure outcome |
| --- | --- |
| `@workflow.signal` | Synchronous function. An exception while applying the signal during replay fails the workflow run. |
| `@workflow.update` | Synchronous function. A handler exception fails that update. |
| `@workflow.update_validator` or `@update_method.validator` | Synchronous function or `async def` under the Worker. An exception rejects the update before acceptance. |
| `@workflow.query` | Synchronous function or `async def` under the Worker. A handler exception fails the query, not the workflow run. |

The validation rejects coroutine functions for signals and updates, and rejects generator or async-generator functions for **all** decorated handler kinds, including queries and validators. It raises `InvalidWorkflowDefinition` at definition, registration or replay, including inherited handlers and offline tools. Synchronous signal and update wrappers cannot bypass the guards by returning asynchronous values. Returning generator or async-generator values is refused for every handler kind. These restrictions do not forbid the synchronous generator used by `run()`.

For a server-routed query, the Worker explicitly awaits an asynchronous result under the original query deadline and claim/cancellation authority. Awaiting does not grant a fresh budget or permit a result after authority is lost. For pre-accept validation, the Worker also awaits an asynchronous validator result against disposable replayed state.

The local synchronous helpers cannot await. `workflow.query_state()` refuses an asynchronous result with `QueryFailed`, and `workflow.validate_update()` refuses it with `UpdateRejected`. They close returned coroutines instead of leaking them as operation results.

### Workflow Context

The `WorkflowContext` passed to `run` provides deterministic operations:

| Method | Description |
|--------|-------------|
| `ctx.schedule_activity(type, args)` | Schedule an activity task, optionally with per-call retry and timeout options |
| `ctx.start_timer(seconds)` | Durable sleep |
| `ctx.start_child_workflow(type, args)` | Start a child workflow, optionally with per-call retry and workflow timeout options |
| `yield [command, [...]]` | Join a nested deterministic activity, child-workflow, timer, or mixed group in input order |
| `yield ctx.select({key: command, ...})` | Resume with the first durably committed member while retaining handles for every non-winner |
| `ctx.saga()` | Register and run reverse-order durable activity compensations |
| `ctx.side_effect(fn)` | Capture a non-deterministic value |
| `ctx.get_version(change_id, min, max)` | Safe workflow code versioning |
| `ctx.upsert_search_attributes(attrs)` | Update search attributes |
| `ctx.continue_as_new(*args)` | Restart the workflow with new input |
| `ctx.now()` | Persisted workflow-start time, fixed for this run |
| `ctx.random()` | Seeded random generator |
| `ctx.uuid4()` | Deterministic UUID |
| `ctx.logger` | Logger that is silent during replay |

### Entry compatibility and recovery {#entry-compatibility-and-recovery}

**Released support.** Python SDK 2.6.2 introduced the entry safeguard below, with routing and recovery support in Server 2.9.9. These are minimum feature versions; install current stable releases for security fixes.

Before calling `run(ctx, *start_input)`, the worker binds the recorded arguments against the entry signature. A missing required argument or incompatible arity raises `WorkflowEntryArgumentsMismatchError` with reason `workflow_entry_arguments_mismatch` before the body runs. Defaults fill omitted arguments only. Python annotations remain unenforced: changing an annotation does not validate or convert recorded data. A `TypeError` raised by a successfully entered ordinary or generator body remains an application failure.

The worker automatically advertises `workflow_entry_arguments_validation`. With a qualified Server, the failed task becomes replay-blocked while the original run remains nonterminal. Older runtimes may retry that task instead; SDK-side refusal alone does not establish the complete recovery contract.

Inspect the exact run with `await client.describe_workflow_run(workflow_id, run_id)` and the selected-run debug endpoint. After restoring a compatible entry method, use the selected-run HTTP repair route in the [recovery procedure](../failures-and-recovery.md#service-entry-recovery). `await client.repair_workflow(workflow_id)` and `handle.repair()` instead resolve the instance's current run; neither accepts a run-id argument. Preserve the original input, history, namespace, queue, build and deadlines. For command changes, put `ctx.get_version` inside that compatible method and qualify cold replay through [definition routing](./worker-compatibility-routing.md#definition-fingerprint-evolution).

### Workflow time and durable waits

During worker replay, `ctx.now()` returns the run's **persisted start time**.
It does not advance after an activity, timer, signal, or other durable step.
Repeated cold replays of the same history return that same start value. A
continue-as-new successor has its own start time; it does not keep the
predecessor's clock anchor.

The [published Python implementation](https://github.com/durable-workflow/sdk-python/blob/150c6f6bc14e3516f75cc615b2f75f093ed84ea1/src/durable_workflow/workflow.py#L2594-L2601)
uses `WorkflowStarted.payload.timestamp` when present, otherwise the canonical
`WorkflowStarted.recorded_at`. Missing or invalid persisted replay time is an
explicit clock error, not permission to read the worker's wall clock. This is
the fixed-start contract settled in [SDK #146](https://github.com/durable-workflow/sdk-python/issues/146).

Wait for a durable operation instead of looping until `ctx.now()` changes:

```python
from durable_workflow import workflow


@workflow.defn(name="wait_without_clock_loop")
class WaitWithoutClockLoop:
    def run(self, ctx):
        started_at = ctx.now()
        yield ctx.start_timer(30)
        return {
            "run_started_at": started_at.isoformat(),
            "after_wait": ctx.now().isoformat(),
        }
```

The timer's durable completion resumes the workflow. Both returned timestamps
are the same start time. A loop such as `while ctx.now() < deadline` will not
become false merely because timers fire.

For a relative delay, yield `ctx.start_timer(seconds)` or `ctx.sleep(seconds)`.
Use [first-completion selection](#first-completion-selection) when work should
race a durable timer. Set `execution_timeout_seconds` and `run_timeout_seconds`
on `client.start_workflow(...)` when Server must enforce a workflow deadline,
including while workers are stopped. An HTTP or `get_result()` waiting timeout
only limits that local request; it does not replace the workflow's persisted
deadline. Keep an application deadline across continue-as-new by explicitly
passing it as input, without replacing the Server's original execution deadline.

For measured elapsed time within one activity invocation, read a monotonic
clock there and return the duration as the activity result. For an external
UTC deadline, let an activity check the authoritative external clock and
return its decision; workflow code replays that recorded result. Never compare
UTC timestamps with monotonic values, or subtract monotonic readings from
different processes or hosts. `ctx.now()` subtraction measures neither active
processing time nor elapsed wall time in Python.

#### Clock differences across SDKs

These APIs are deterministic where provided, but they do not share one clock:

| Authoring surface | Repeated calls and durable steps | Continue-as-new successor |
| --- | --- | --- |
| Python `ctx.now()` | Fixed to this run's persisted start time, including after a timer or activity. | Uses the successor run's start anchor. |
| Embedded PHP `Workflow::now()` | Starts at the run's start time and advances to the recorded event time consumed by replay. See [workflow time](../features/timers.md#reading-deterministic-time). | Starts with the new run, then advances through that run's consumed events. |
| PHP service-mode SDK | No general public workflow `now()` helper. Use durable operations or recorded activity/side-effect values. | Pass application timing state explicitly when it must survive the handoff. |
| Rust service-mode SDK | No general public `WorkflowContext::now()` helper. A `side_effect` can record a small wall-clock snapshot; it is not an advancing clock. | A side effect in the new run is a new operation; pass earlier timing state explicitly if needed. |

The embedded PHP behavior is present in
[published Core](https://github.com/durable-workflow/workflow/blob/64efa176e4c37e5d6ae80e767ba3b41464024e53/src/V2/Support/WorkflowFiberContext.php);
the separate [PHP SDK context](https://github.com/durable-workflow/sdk-php/blob/2.5.2/src/Worker/WorkflowContext.php)
and [Rust SDK context](https://github.com/durable-workflow/sdk-rust/blob/3.5.5/src/lib.rs)
have their own APIs. Port the durable operation and deadline policy rather than
assuming that a clock helper has identical semantics in every SDK.

#### Order emitted events with sequence values

A workflow timestamp is not an event ordering key. Python events stamped with
`ctx.now()` can all have the same timestamp. Use
[Workflow Stream offsets](./workflow-streams.md), the applicable
[embedded outbox sequence](../features/message-streams.md), or a deterministic
workflow-local counter. Pair a run-local counter with `run_id`; carry it through
continue-as-new explicitly if the application needs one logical sequence.
Independent streams or runs do not gain a global order from their timestamps.

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

`ctx.schedule_activity(..., queue="payments-v2")` selects the queue for a newly scheduled activity. An already scheduled execution, its retries and repaired tasks keep their recorded queue. Changing the worker's `task_queue` does not reroute them or change an existing run's workflow queue. Keep compatible old-queue workers until the remaining dependencies are accounted for. Follow [recorded activity queues and recovery](./task-matching-dispatch.md#recorded-activity-queues).

### Determinism Rules

Workflow code is replayed from history. It must not perform any non-deterministic operations directly:

- No I/O (HTTP calls, file reads, database queries)
- No `datetime.now()` or `time.time()` — use `ctx.now()` only for the fixed run-start anchor; use durable timers for waits
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

        # Nested lists may mix activities, children, and timers.
        results = yield [
            ctx.schedule_activity("process_item", [items[0]]),
            [
                ctx.start_child_workflow("process-batch", [items[1:]]),
                ctx.start_timer(1),
            ],
        ]

        return results  # same nested shape and input order
```

The worker emits one ordinary command per durable leaf and attaches the shared
stable `parallel_group_*` fields plus the full outer-to-inner path. History can
close members in any order; replay still binds results and failures by durable
input position. Exact duplicate terminal delivery is ignored. Pending history
after a worker restart and fully completed history reconstruct the same group
without rescheduling completed work.

### First-completion selection

Use `ctx.select()` when independent work should start together but the workflow
can make progress after one member completes:

```python
selected = yield ctx.select({
    "resolver": ctx.schedule_activity("resolve-request", [request_id]),
    "input": ctx.wait_condition(lambda: self.resolution is not None, key="resolution-ready"),
    "deadline": ctx.start_timer(2),
})

if selected.key == "deadline":
    yield selected.handles["resolver"].cancel()
    return {"status": "timed_out"}

yield selected.handles["deadline"].cancel()
return {"status": "resolved", "value": selected.result()}
```

The `SelectionResult` includes the winner's stable key, input index, operation
kind and durable identity, typed outcome, and all `DurableOperationHandle`
instances. `yield handle.await_result()` waits for a non-winner later; `yield
handle.cancel()` records an explicit void request. Only committed
`SelectionOperationCancelled` history proves cancellation won; replay advances
past an unmarked request, and `await_result()` still returns a completion that
committed first. Replay consumes the persisted winner even if later history
contains another completion first. Duplicate and out-of-order external
delivery cannot replace an already committed winner.

### Saga Compensation

```python
def forward(saga):
    flight = yield ctx.schedule_activity("trip.reserve-flight", [])
    saga.add_compensation("trip.cancel-flight", [flight])

    hotel = yield ctx.schedule_activity("trip.reserve-hotel", [])
    saga.add_compensation("trip.cancel-hotel", [hotel])

    yield ctx.schedule_activity("trip.charge", [])
    return {"status": "booked"}

return (yield from ctx.saga().run(forward))
```

The saga executes ordinary activity commands sequentially in reverse
registration order after a failure. Terminal `cancel_workflow` does not
resume the workflow to run compensations. The helper stops on the
first compensation failure. `SagaCompensationFailed` preserves the initiating
failure, compensation failure, compensation activity type, and deterministic
registration order as structured diagnostics.

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

### Heartbeat requests {#activity-heartbeat-requests}

For remote activities, call `await ctx.heartbeat(...)` during bounded work, well before `heartbeat_timeout`. Its first window starts at runtime claim, before Python receives the task. Each recorded heartbeat uses the runtime's recording time, not the time its response reaches Python. Pauses, request latency and transport retries consume the budget. Follow the [cadence guidance](../features/heartbeats.md#heartbeat-cadence-and-receipts).

The direct `Client.heartbeat_activity_task()` call uses the configured `TransportRetryPolicy`. After that policy, transport errors can propagate as `httpx.TransportError`, and HTTP refusals become mapped SDK exceptions such as `ServerError`. This is HTTP retry behavior, not another activity attempt or more heartbeat time. `ActivityContext.heartbeat()` can raise `ActivityCancelled` when the worker tells the activity to stop. When cooperative process supervision is enabled, failed heartbeat or ownership checks can stop or abandon the callback. Do not assume every failure returns to a catch block or that cleanup code always runs.

Do not suppress heartbeat/ownership failures and continue external work or report success. Progress is not an external commit or a resumable-checkpoint receipt. Keep external effects idempotent.

### Heartbeat refusals and callback exit {#heartbeat-refusals-and-callback-exit}

In **Python SDK 2.9.0**, `ctx.heartbeat()` and `ctx.heartbeat_sync()` raise `ActivityLeaseAuthorityLost` when a heartbeat response says `can_continue=false`. The exception retains the original Server reason, such as `activity_deadline_elapsed`, `attempt_closed` or `run_closed`. A cancellation request instead raises `ActivityCancelled`. See the [published SDK qualification](https://github.com/durable-workflow/sdk-python/issues/186#issuecomment-6361330674).

The heartbeat that observes the refusal is a cooperative exit point. Stop external work and propagate the exception; do not catch it and return success. Code that never heartbeats can keep running until it returns. A helper heartbeat cannot forcibly interrupt a blocked library call: use finite I/O deadlines and the call's own cancellation mechanism.

The physical activity slot stays occupied until the callback/thread exits. Losing attempt authority does not make that thread available for replacement work, and the worker does not publish a late result for the closed attempt. Runtime timeout enforcement and stopping application code are separate boundaries. See [activity timeouts](../features/timeouts.md#activity-timeouts) and the [helper-thread guidance](#heartbeat-helper-thread).

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

### Terminal business errors {#terminal-business-errors}

`non_retryable_error_types` matches the **outermost** exception's short name (`exception_type`) or fully qualified class name (`exception_class`) exactly. For example, `ValidationError` does not match `SpecificValidationError`, even if it is a subclass. A qualified entry such as `app.errors.ValidationError` must match that recorded class name. The policy does not walk subclasses or exception causes. `raise RuntimeError(...) from NonRetryableError(...)` reports the outer `RuntimeError` and can still be retried.

When converting a known business exception, make `NonRetryableError` the outer exception and keep the original Python cause with `cause=error`. This marks the activity failure non-retryable without relying on a name list. It does not make the entire workflow fail automatically: workflow code receives `ActivityFailed` when the activity has no retries left, either because it is non-retryable or because its retry budget is exhausted.

```python
from durable_workflow import ActivityFailed, NonRetryableError, activity, workflow

@activity.defn(name="validate_order")
async def validate_order(order: dict) -> dict:
    try:
        if order.get("amount", 0) <= 0:
            raise ValueError("amount must be positive")
    except ValueError as error:
        raise NonRetryableError("Order validation failed", cause=error) from error
    return order

@workflow.defn(name="place_order")
class PlaceOrderWorkflow:
    def run(self, ctx, order: dict):
        try:
            yield ctx.schedule_activity("validate_order", [order])
        except ActivityFailed as failure:
            if (
                failure.activity_type != "validate_order"
                or failure.exception_type != "NonRetryableError"
                or not failure.non_retryable
            ):
                raise
            return {"order_id": order["id"], "status": "rejected"}
        return {"order_id": order["id"], "status": "accepted"}
```

For input `{"id": "order-123", "amount": 0}`, the activity fails once and the workflow completes normally with `status: rejected`. Handle only the business failure you intend to handle; the example rethrows other failures. Continue with further durable steps if your business flow requires them. An uncaught `ActivityFailed` fails the workflow. Preserving a Python cause does not mean retry policy examines that chain or that every SDK exposes an identical cause object.

### Synchronous and asynchronous activities {#activity-execution}

Ordinary `def` remote activities run in a dedicated thread pool bounded by
`max_concurrent_activity_tasks`. Each callback keeps its activity context.
Polling, workflow tasks and worker heartbeats can progress while a callback
blocks. `async def` activities run on the event loop and must use nonblocking
I/O; a blocking call inside an async function still stalls that loop.

From a synchronous callback, call
`activity.context().heartbeat_sync(details)` to send progress through the owner
event loop with the original task, attempt and worker identity. Async callbacks
use `await activity.context().heartbeat(details)`.

Cancelling an await does not stop a running Python thread. Its physical slot
stays occupied until the callback returns, and a late return does not submit a
result after cancellation. If a callback is still running after
`shutdown_timeout`, shutdown raises `RuntimeError` and retains the worker
registration. Set timeouts on downstream I/O and use separately isolated worker
processes for CPU-heavy work. See the SDK's
[execution and shutdown reference](https://python.durable-workflow.com/reference/worker/).

### Heartbeating from a helper thread {#heartbeat-helper-thread}

For one long blocking call, capture `ctx = activity.context()` inside the
synchronous activity and pass it to the helper. A new thread does not
automatically inherit the activity context. Use `ctx.heartbeat_sync(details)`
from the helper, never from the worker event loop. See the SDK's
[complete helper-thread recipe](https://python.durable-workflow.com/reference/activity/#heartbeats-during-one-blocking-call).

Stop and join the helper when the call returns or raises. If a heartbeat raises
`ActivityCancelled` or `ActivityLeaseAuthorityLost`, signal cooperative
cancellation to the call and re-raise the original exception before returning
a result. A helper exception cannot forcibly interrupt a blocked library call.
Give that call its own finite deadline and cancellation mechanism, and bound
heartbeat request timeouts and retries. Helper heartbeats can otherwise keep
reporting liveness while the work is hung.

## Worker

The `Worker` registers with the server, polls for tasks, and dispatches them to your workflow and activity implementations.

For independent workflow and activity processes, follow the Python SDK's
[runnable process-split guide](https://python.durable-workflow.com/guides/separate-workers/).
It covers separate registrations, shared or distinct task queues, retries,
role-specific slots and graceful shutdown.

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
[task queue admission](/docs/polyglot/task-queue-admission) caps when a
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

### Worker sessions {#worker-sessions}

Use `WorkerSessionOptions` when sequential remote activities need one worker's local resource. This example is checked with Python SDK **2.9.0** and Server **2.11.0**; see the [portable affinity version requirements](./portable-worker-affinity.md). Use a unique `job_id` for each workflow run so a new run does not reuse a terminal session id.

The cache below is disposable. Each activity can rebuild it from the durable business input, so a replacement holder does not depend on a previous process's memory:

```python
from durable_workflow import ActivityFailed, WorkerSessionOptions, activity, workflow

# Disposable process-local state. Rebuild it from durable business input.
documents = {}

def ensure_document(job_id):
    rebuilt = job_id not in documents
    if rebuilt:
        documents[job_id] = {"text": "document:" + job_id}
    return documents[job_id], rebuilt

@activity.defn(name="prepare_document")
async def prepare_document(job_id):
    document, rebuilt = ensure_document(job_id)
    return {"holder": activity.context().info.worker_id, "rebuilt": rebuilt}

@activity.defn(name="inspect_document")
async def inspect_document(job_id):
    document, rebuilt = ensure_document(job_id)
    return {"holder": activity.context().info.worker_id,
            "rebuilt": rebuilt, "text": document["text"]}

@workflow.defn(name="inspect_document_workflow")
class InspectDocumentWorkflow:
    def run(self, ctx, job_id):
        session = WorkerSessionOptions(
            session_id="documents:" + job_id,
            requirements=("fs:documents",),
            lease_seconds=5,
            ttl_seconds=60,
            max_concurrent_activities=1,
            allow_reacquire_after_failure=True,
        )
        options = dict(worker_session=session,
                       start_to_close_timeout=5,
                       schedule_to_start_timeout=12,
                       schedule_to_close_timeout=20,
                       retry_policy={"max_attempts": 1})
        try:
            prepared = yield ctx.schedule_activity("prepare_document", [job_id], **options)
            inspected = yield ctx.schedule_activity("inspect_document", [job_id], **options)
        except ActivityFailed as error:
            if error.activity_type not in {"prepare_document", "inspect_document"}:
                raise
            return {"status": "resource_unavailable", "job_id": job_id}
        return {"status": "inspected", "prepared": prepared, "inspected": inspected}
```

Register both activities and declare the required capability on the worker:

```python
from durable_workflow import Worker

worker = Worker(
    client,
    task_queue="documents",
    workflows=[InspectDocumentWorkflow],
    activities=[prepare_document, inspect_document],
    capabilities=["fs:documents"],
)
await worker.run()
```

Start `inspect_document_workflow` on the `documents` task queue with `[job_id]` as input. The first activity lazily acquires the session; the second uses the same holder while its lease remains valid. `max_concurrent_activities=1` bounds simultaneous activities in that session. Queue routing and capability checks still apply. These short leases/timeouts demonstrate bounded behavior; size them for your real work and heartbeat well before expiry.

After holder loss or lease expiry, `allow_reacquire_after_failure=True` permits another eligible worker to reacquire the session. Its local resource must be rebuilt. Already committed activity results replay, while uncommitted effects can repeat: use durable resource identifiers and idempotent external operations. A session does not migrate memory, files or open handles.

Explicit close and absolute TTL expiry are terminal for that session id. A later activity cannot reopen it and can remain unadmitted until its configured timeout is enforced. Run the Server's scheduler/maintenance role from the [published deployment recipe](https://github.com/durable-workflow/server/blob/2.11.0/docker-compose.published.yml); an API-only process is insufficient for timeout enforcement. The workflow handles exhausted activity failure with `ActivityFailed` and returns `resource_unavailable`; the application can then choose a fresh session and rebuild from the business input. This example does not promise an immediate session-closed exception or automatically reopen a terminal session.

For explicit holder lifecycle operations, use `worker.worker_session(options)` and its `create()`, `renew()` and `close(reason)` methods. Graceful worker shutdown closes its held sessions. See the [shared lifecycle contract](../features/worker-sessions.md#lifecycle).

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

<!-- docs-example id="python.sync-client" -->
```python
import uuid

from durable_workflow.sync import Client as SyncClient

client = SyncClient("http://localhost:8080", token="secret")
workflow_id = f"sync-greeting-{uuid.uuid4().hex}"

handle = client.start_workflow(
    workflow_type="greeter",
    task_queue="default",
    workflow_id=workflow_id,
    input=["world"],
)

execution = client.describe_workflow(workflow_id)
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

<!-- docs-example id="python.duplicate-start-recovery" -->
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

If an activity needs local cleanup when its task is cancelled, catch the class
by name and re-raise. This does not resume the closed workflow for compensation:

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

Both functions accept an optional `payload_codec` validation hint. Leave it
unset to use the history's recorded tag. An explicit or recorded tag must be
`avro`; `json`, unknown, or untagged durable payloads fail before decode.

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

## Payload Codec

<div
  data-public-payload-codec-contract="avro-only"
  data-payload-codec="avro"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-legacy-v1-import-drain="none">
  Every payload that crosses the worker-protocol boundary is codec-tagged.
  Durable Workflow 2.0 has one public payload codec: <code data-payload-codec-field="codec">avro</code>.
  The Python SDK rejects JSON-tagged, unknown, and untagged durable payloads
  instead of selecting another decoder. See the <a href="/docs/polyglot/avro-value-protocol/">Avro Value protocol</a>.
</div>

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

### Running a Python activity worker against a v2 run

No codec configuration is needed. The SDK validates `payload_codec` before
decoding every claim, accepts only `avro`, runs the activity, and returns an
Avro-tagged result. Any other tag fails closed with
`unsupported_payload_codec`; the worker never sniffs or guesses the format.

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
[Server guide](/docs/polyglot/server) for details.

The same constructor supports a Cloud managed runtime. Use the namespace's
Cloud-provided runtime URL and namespace value, set `control_token` to the
client runtime credential, and set `worker_token` to the worker runtime
credential. Cloud provisions the namespace; do not substitute a self-hosted
Server address. See
[Cloud Managed Runtime](/docs/polyglot/cloud-control-plane).

## Workflow list and history pages {#workflow-list-and-history-pages}

These published calls return **one page**, not an automatic complete read: `await client.list_workflows(...)` / `await client.get_history(workflow_id, run_id, ...)`. Continue with the returned opaque token while keeping namespace, filters and selected workflow/run fixed; stop at the final null/empty token and handle page errors explicitly. A partial page is not a replay bundle. Use the SDK history-export API for offline replay. The [published Python 2.9.0 client source](https://github.com/durable-workflow/sdk-python/blob/2.9.0/src/durable_workflow/client.py) defines the current parameters; no new iterator capability is implied.
