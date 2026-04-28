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
| `GET` | `/api/cluster/info` | yes | Server identity, supported SDK ranges, role topology, coordination-health summary, control-plane contract, worker-protocol contract, payload codecs, and feature capabilities. |

Example:

<!-- docs-example id="server.cluster-info.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" | jq '.control_plane.version, .worker_protocol.version'
```

`/api/cluster/info` intentionally does not require the control-plane version
header because it is the endpoint that advertises the supported versions. The
same response includes `coordination_health.routing_drains`, an all-namespaces
summary of task queues that still have draining build-id cohorts so rollout
automation can see active drains without walking every queue-specific
`/build-ids` endpoint.

### Cluster Topology Manifest

`/api/cluster/info` also returns the node's `topology` manifest under the
schema `durable-workflow.v2.role-topology`. That manifest is the supported way
to discover whether the node is currently acting as `standalone_server`,
`embedded`, or `split_control_execution`, which roles it owns, and what the
server expects from `matching_role`, `role_catalog`,
`authority_boundaries`, `authority_surfaces`, `failure_domains`,
`scaling_boundaries`, `supported_topologies`, and `migration_path`. The same
response also publishes live rollout-safety state for that node.

Read the manifest as follows:

- `topology.current_process_class`, `topology.current_shape`,
  `topology.current_roles`, and `topology.execution_mode` tell you which role
  shape the node is actually serving. `current_shape` and `current_roles`
  describe the responding node, not the full fleet.
- `topology.matching_role.shape`, `topology.matching_role.wake_owner`, and
  `topology.matching_role.task_dispatch_mode` tell you whether broad ready-task
  discovery is happening in-worker or through a dedicated matching-role sweep.
- `topology.matching_role.partition_primitives` and
  `topology.matching_role.backpressure_model` freeze the routing axes and
  lease-based admission model the server expects workers and operators to
  reason about.
- `topology.role_catalog` is the per-role node map. It tells you whether the
  responding node currently hosts a role, whether that role belongs to the
  control plane or execution plane, whether it runs user code, whether it
  accepts external HTTP, and which steady-state interface it serves.
- `topology.authority_surfaces` is the mutation-family ownership map for
  durable surfaces such as `workflow_tasks`, `activity_executions`,
  `worker_compatibility_heartbeats`, and `worker_registrations`. Use it when
  rollout or tooling decisions depend on which role owns a specific write.
- `topology.supported_topologies` is the normalized inventory of legal product
  shapes keyed by topology name, including each shape's `execution_mode` and
  process-class role bundles.
- `coordination_health` summarizes fleet-wide rollout and compatibility risk in
  one machine-readable block.
- `execution_mode` distinguishes `local_queue_worker` embedded execution from
  `remote_worker_protocol` worker-protocol execution.
- `split_control_execution` is a supported product topology, not a second
  server product or a different API.

Example:

<!-- docs-example id="server.cluster-info.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_process_class: .topology.current_process_class,
    current_shape: .topology.current_shape,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    coordination_health: {
      status: .coordination_health.status,
      http_status: .coordination_health.http_status
    }
  }'
```

For the conceptual contract behind those fields, including the role vocabulary
and migration path, see
[Server Role Topology](/docs/2.0/polyglot/server-role-topology).

### Namespace-Scoped System Health

`GET /api/system/health` is the authenticated rollout-safety and coordination
health surface for one namespace. It requires admin auth plus
`X-Durable-Workflow-Control-Plane-Version: 2`, resolves the namespace through
the normal control-plane request rules, and returns the exact namespace the
server evaluated plus the current `health` snapshot:

<!-- docs-example id="server.system-health.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/system/health" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  | jq '{namespace, status: .health.status, healthy: .health.healthy}'
```

Treat the payload as:

- `namespace`: the namespace whose rollout/coordination state was evaluated.
- `health.status` and `health.healthy`: the top-level machine-readable health
  verdict for that namespace.
- `health.checks` and `health.categories`: per-surface readiness, compatibility,
  projection, and coordination facts.
- `health.operator_metrics`: the current namespace-scoped queue, worker, and
  repair metrics bundled into the same snapshot.
- `health.structural_limits`: the effective structural limits and any related
  diagnostics the server is enforcing for that namespace.

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

### External Payload Reference Envelope

The external payload reference is a stable wire envelope. SDKs may decode it
into native helper types, but HTTP clients should treat these field names as
the contract:

| Field | Required | Meaning |
| --- | --- | --- |
| `schema` | yes | Must be `durable-workflow.v2.external-payload-reference.v1`. Unknown schemas fail closed. |
| `uri` | yes | Driver-owned object location, such as `file:///...`, `s3://bucket/prefix/object`, `gs://bucket/prefix/object`, or `azure://container/prefix/object`. |
| `sha256` | yes | Lowercase hex SHA-256 of the stored encoded bytes. SDKs and the server verify it before decode. |
| `size_bytes` | yes | Byte length of the stored encoded payload. Mismatch is an integrity failure. |
| `codec` | yes | Payload codec for the stored bytes, for example `json` or the SDK payload codec name. |
| `expires_at` | no | ISO-8601 expiry hint for retention/GC. Missing means the namespace retention policy owns cleanup. |

Payload offload is threshold-gated by the namespace storage policy. Inline
payloads continue to use the normal payload envelope until encoded bytes exceed
`threshold_bytes`; then the driver writes bytes and history stores the reference
envelope. Replay and history export must fail loudly when a referenced blob is
missing, mutated, outside the configured prefix, or owned by an unavailable
provider. They must not silently replace a missing object with `null`, `{}`, or
an empty byte string.

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

When `worker_protocol.server_capabilities.poll_status` is `true`, every
workflow-task, activity-task, and query-task poll response carries a
machine-readable `poll_status` field. Use it as the first branch point before
inspecting route-specific payload fields:

| `poll_status` | Typical HTTP status | Meaning |
| --- | --- | --- |
| `leased` | `200` | The server leased a task and `task` contains the task payload. |
| `empty` | `200` | No matching task was ready before the poll returned. |
| `throttled` | `200` | The queue is visible, but lease or dispatch admission limits withheld a new task for this poll. |
| `unavailable` | `503` or `200` | The server could not safely coordinate a poll path for the queue and returned a typed unavailable outcome instead of silently acting empty. |
| `draining` | `409` | The registered worker cohort is draining, so the server refuses to lease new work and returns `reason: "worker_draining"`. |

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
| `POST` | `/api/task-queues/{taskQueue}/build-ids/drain` | Mark a build-id cohort as draining so it stops claiming new tasks. |
| `POST` | `/api/task-queues/{taskQueue}/build-ids/resume` | Clear a previous drain so the cohort can claim new tasks again. |

Use task queue responses to distinguish no-worker conditions from saturated
worker slots, active lease caps, dispatch budgets, and query-task backpressure.
Drain and resume take a JSON body of `{"build_id": "..."}` (or
`{"build_id": null}` for the unversioned cohort), are idempotent, and persist
operator intent on the cohort so rollout state stays honest even after the
workers are removed. Once a worker heartbeat observes `drain_intent:
"draining"`, worker poll routes return HTTP `409` with `poll_status:
"draining"` and `reason: "worker_draining"` instead of leasing new tasks. See
[Worker Build-Id Rollout](/docs/2.0/polyglot/worker-build-id-rollout) for the
full unversioned-to-versioned cutover, canary, drain, and rollback lifecycle.

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
| `GET` | `/api/system/health` | Return the namespace-scoped rollout-safety and coordination health snapshot, including `routing_drains`. |
| `GET` | `/api/system/metrics` | Return bounded JSON metrics. |
| `GET` | `/api/system/operator-metrics` | Return the namespace-scoped operator metrics snapshot for runs, tasks, backlog, repair, workers, and structural limits. |
| `GET` | `/api/system/repair` | Inspect workflow repair backlog. |
| `POST` | `/api/system/repair/pass` | Run one workflow repair pass. |
| `GET` | `/api/system/activity-timeouts` | Inspect activity-timeout backlog. |
| `POST` | `/api/system/activity-timeouts/pass` | Run one activity-timeout enforcement pass. |
| `GET` | `/api/system/retention` | Inspect retention cleanup backlog. |
| `POST` | `/api/system/retention/pass` | Run one retention cleanup pass. |

`/api/system/health` is the quickest way to answer whether one namespace is
healthy enough to keep taking traffic. It returns the categorized rollout-
safety checks, the namespace's `operator_metrics`, and a `routing_drains`
section that lists task queues whose draining build-id cohorts still need
attention.

`/api/system/operator-metrics` is the namespace-scoped companion to
`/api/cluster/info` when you need raw backlog counts, compatibility-blocked
age, worker fleet detail, or other operator metrics behind the summarized
health surface.

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
