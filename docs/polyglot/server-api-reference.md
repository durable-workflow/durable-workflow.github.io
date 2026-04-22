---
sidebar_position: 3
title: Server API Reference
description: HTTP reference for Durable Workflow server control-plane, worker-plane, namespace, storage, schedule, and system endpoints.
tags:
  - server
  - API
  - reference
  - control-plane
keywords:
  - Durable Workflow server API
  - control-plane version header
  - worker protocol endpoints
  - external payload storage API
---

# Server API Reference

The standalone server exposes a versioned HTTP+JSON API. Use this page when
building SDKs, scripts, bridge adapters, or operator runbooks that call the
server directly. Use the [server guide](/docs/2.0/polyglot/server) for
deployment and configuration, and the [CLI command reference](/docs/2.0/polyglot/cli-reference)
when shelling out to `dw`.

## Headers And Versioning

All authenticated requests use bearer tokens unless the server is configured
for another auth driver:

```http
Authorization: Bearer <token>
X-Namespace: default
Content-Type: application/json
Accept: application/json
```

Control-plane routes require:

```http
X-Durable-Workflow-Control-Plane-Version: 2
```

Worker-plane routes require:

```http
X-Durable-Workflow-Protocol-Version: 1.0
```

The server publishes supported versions and machine-readable contracts from
`GET /api/cluster/info`. Clients should discover versions there before
starting long-lived automation. Missing or unsupported control-plane versions
fail closed with a named reason such as `missing_control_plane_version` or
`unsupported_control_plane_version`.

## Discovery And Health

These routes are used by load balancers, SDK bootstraps, and compatibility
checks.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | no | Liveness probe for the HTTP process. |
| `GET` | `/api/ready` | no | Readiness probe that checks runtime dependencies. |
| `GET` | `/api/cluster/info` | yes | Server identity, supported SDK ranges, control-plane contract, worker-protocol contract, payload codecs, and feature capabilities. |

Example:

<!-- docs-example id="server.cluster-info.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" | jq '.control_plane.version, .worker_protocol.version'
```

`/api/cluster/info` intentionally does not require the control-plane version
header because it is the endpoint that advertises the supported versions.

## Workflow Control Plane

Workflow routes are operator/control-plane routes. They require an operator or
admin role and `X-Durable-Workflow-Control-Plane-Version: 2`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/workflows` | List workflow instances. Supports filters such as status, type, query text, and limit. |
| `POST` | `/api/workflows` | Start a workflow instance. |
| `GET` | `/api/workflows/{workflowId}` | Describe the current run for one workflow id. |
| `GET` | `/api/workflows/{workflowId}/debug` | Return bounded diagnostic facts for stuck-run investigation. |
| `GET` | `/api/workflows/{workflowId}/runs` | List runs for one workflow id. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}` | Describe a specific run. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/debug` | Return bounded diagnostic facts for a selected run. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history` | Page through run history events. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history/export` | Export the archival replay bundle for a run. |

Start requests use the language-neutral control-plane shape:

<!-- docs-example id="server.workflow-start.curl" -->
```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"],
    "memo": {"source": "api-reference"},
    "search_attributes": {"CustomerId": "cust-42"},
    "duplicate_policy": "reject"
  }'
```

### Workflow Commands

Instance-targeted command routes operate on the current run for a workflow id:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/signal/{signalName}` | Send a signal. |
| `POST` | `/api/workflows/{workflowId}/query/{queryName}` | Execute a read-only query. |
| `POST` | `/api/workflows/{workflowId}/update/{updateName}` | Submit or execute an update. |
| `POST` | `/api/workflows/{workflowId}/cancel` | Request cancellation. |
| `POST` | `/api/workflows/{workflowId}/terminate` | Force termination. |
| `POST` | `/api/workflows/{workflowId}/repair` | Ask the server to repair retryable stuck state. |
| `POST` | `/api/workflows/{workflowId}/archive` | Archive a closed workflow run. |

Run-targeted command routes reject historical or wrong-run targets explicitly:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/signal/{signalName}` | Send a signal only if the selected run is current. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/query/{queryName}` | Execute a query against the selected run. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/update/{updateName}` | Submit or execute an update only if the selected run is current. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/cancel` | Cancel only if the selected run is current. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/terminate` | Terminate only if the selected run is current. |

Commands with caller payloads use an `input` array. The Python and PHP SDKs
encode language-neutral payload envelopes for you; direct HTTP callers must
send JSON values that the target workflow or activity can decode.

## Namespace And Storage

Namespace routes require operator or admin roles. Mutating namespace and
external-storage routes require admin role.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/namespaces` | List namespaces. |
| `POST` | `/api/namespaces` | Create a namespace. |
| `GET` | `/api/namespaces/{namespace}` | Describe namespace retention, metadata, and storage policy. |
| `PUT` | `/api/namespaces/{namespace}` | Update namespace metadata or retention. |
| `PUT` | `/api/namespaces/{namespace}/external-storage` | Configure the namespace external payload storage policy. |
| `POST` | `/api/storage/test` | Round-trip a small and large payload through the configured external storage driver. |

External payload storage policies let large payload envelopes carry stable
references instead of raw bytes. Local policies resolve through the configured
filesystem path. Object-storage policies such as `s3`, `gcs`, and `azure` use
an explicitly configured filesystem disk and bucket/prefix settings on the
server.

For the full request-authority contract, including namespace resolution,
role-scoped credentials, and worker registration fields, see
[Namespace, Auth, And Worker Registration](/docs/2.0/polyglot/namespace-auth-workers).

## Bridge Adapters

Bridge adapters are bounded ingress endpoints. They do not execute workflow
code; they hand events to the control plane and return a named outcome.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/bridge-adapters/webhook/{adapter}` | Start, signal, or update a workflow from a webhook-shaped event. |

Example:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/bridge-adapters/webhook/stripe" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start_workflow",
    "idempotency_key": "evt_1001",
    "target": {
      "workflow_type": "orders.fulfillment",
      "task_queue": "orders",
      "business_key": "order-1001"
    },
    "input": {"order_id": "order-1001"}
  }'
```

Use response fields such as `outcome`, `reason`, `idempotency_key`, and
`control_plane_outcome` instead of inferring behavior from HTTP status alone.

## Worker Protocol

Worker routes require a worker role and
`X-Durable-Workflow-Protocol-Version: 1.0`. SDK workers use these endpoints
internally; custom language workers can implement the same protocol.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/worker/register` | Register worker identity, task queues, supported workflow/activity types, capacity, runtime, and build metadata. |
| `POST` | `/api/worker/heartbeat` | Refresh worker fleet visibility and compatibility facts. |
| `POST` | `/api/worker/workflow-tasks/poll` | Long-poll for workflow tasks. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/history` | Fetch paginated task history for a leased workflow task. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/heartbeat` | Heartbeat a leased workflow task. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/complete` | Complete a workflow task with commands. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/fail` | Fail a workflow task. |
| `POST` | `/api/worker/query-tasks/poll` | Long-poll for server-routed query tasks. |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/complete` | Complete a query task. |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/fail` | Fail or reject a query task. |
| `POST` | `/api/worker/activity-tasks/poll` | Long-poll for activity tasks. |
| `POST` | `/api/worker/activity-tasks/{taskId}/heartbeat` | Heartbeat a leased activity task. |
| `POST` | `/api/worker/activity-tasks/{taskId}/complete` | Complete an activity task. |
| `POST` | `/api/worker/activity-tasks/{taskId}/fail` | Fail an activity task. |

Workers should treat lease ids, attempts, task ids, and heartbeat endpoints as
opaque server-issued values. A stale lease or wrong task id returns a named
worker-protocol error instead of silently completing work.

## Fleet And Task Queue Visibility

These routes expose operator diagnostics for worker fleets and queue
admission. They are control-plane routes.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/workers` | List registered workers. |
| `GET` | `/api/workers/{workerId}` | Describe one worker. |
| `DELETE` | `/api/workers/{workerId}` | Deregister one worker. |
| `GET` | `/api/task-queues` | List task queues and admission status. |
| `GET` | `/api/task-queues/{taskQueue}` | Describe workflow/activity/query capacity for one queue. |
| `GET` | `/api/task-queues/{taskQueue}/build-ids` | List build ids observed for one queue. |

Use task queue responses to distinguish no-worker conditions from saturated
worker slots, active lease caps, dispatch budgets, and query-task backpressure.

## Schedules And Search Attributes

Schedule routes are control-plane routes.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/schedules` | List schedules. |
| `POST` | `/api/schedules` | Create a schedule. |
| `GET` | `/api/schedules/{scheduleId}` | Describe one schedule. |
| `PUT` | `/api/schedules/{scheduleId}` | Update schedule spec, action, note, memo, or search attributes. |
| `DELETE` | `/api/schedules/{scheduleId}` | Delete a schedule. |
| `POST` | `/api/schedules/{scheduleId}/pause` | Pause future fires. |
| `POST` | `/api/schedules/{scheduleId}/resume` | Resume a paused schedule. |
| `POST` | `/api/schedules/{scheduleId}/trigger` | Trigger a schedule immediately. |
| `POST` | `/api/schedules/{scheduleId}/backfill` | Backfill a time window. |
| `GET` | `/api/search-attributes` | List registered search attributes. |
| `POST` | `/api/search-attributes` | Register a search attribute. |
| `DELETE` | `/api/search-attributes/{name}` | Delete a search attribute. |

Search attribute names and types are part of the namespace search contract.
Avoid using high-cardinality attributes for operator dashboards or metric
labels.

## System Operations

System routes require admin role. They are explicit operator passes; prefer
status routes before pass routes in automation.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/system/metrics` | Return bounded JSON metrics. |
| `GET` | `/api/system/repair` | Inspect workflow repair backlog. |
| `POST` | `/api/system/repair/pass` | Run one workflow repair pass. |
| `GET` | `/api/system/activity-timeouts` | Inspect activity-timeout backlog. |
| `POST` | `/api/system/activity-timeouts/pass` | Run one activity-timeout enforcement pass. |
| `GET` | `/api/system/retention` | Inspect retention cleanup backlog. |
| `POST` | `/api/system/retention/pass` | Run one retention cleanup pass. |

`/api/system/metrics` is a JSON operator surface, not a Prometheus scrape
endpoint. Metric names and dimensions are bounded by the server's
bounded-growth policy.

## Error Contract

Error responses use HTTP status codes plus named machine-readable reasons.
Clients should branch on `reason` or nested control-plane/worker-protocol
reason fields, not on prose messages.

Common statuses:

| Status | Meaning |
| --- | --- |
| `400` | Missing or unsupported protocol/version header, malformed query, or unsupported route method. |
| `401` | Missing or invalid authentication. |
| `403` | Authenticated token lacks the required role. |
| `404` | Namespace, workflow, run, schedule, worker, or search attribute was not found. |
| `409` | Duplicate or conflict, such as an already-started workflow or invalid run target. |
| `422` | Validation failed; response includes field-level validation details. |
| `429` | Admission or task queue capacity is full. |
| `500` | Server failure. Treat as retryable only when the operation is idempotent or has an idempotency key. |

Validation responses include `reason: "validation_failed"` plus `errors` or
`validation_errors`. Workflow command responses also project validation and
operation details into the nested `control_plane` object.

## See Also

- [Server guide](/docs/2.0/polyglot/server)
- [Namespace, Auth, And Worker Registration](/docs/2.0/polyglot/namespace-auth-workers)
- [Worker Protocol](/docs/2.0/polyglot/worker-protocol)
- [Task Queue Admission](/docs/2.0/polyglot/task-queue-admission)
- [External Execution](/docs/2.0/polyglot/external-execution)
- [CLI Command Reference](/docs/2.0/polyglot/cli-reference)
