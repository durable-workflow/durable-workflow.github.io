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
server directly. Use the [server guide](/docs/polyglot/server) for
deployment and configuration, and the [CLI command reference](/docs/polyglot/cli-reference)
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

For validation, code generation, and drift checks, use the normative
[Platform Protocol Specs](/docs/platform-protocol-specs) catalog instead
of this prose reference. It links the control-plane OpenAPI document, worker
protocol OpenAPI and AsyncAPI documents, the `cluster_info` JSON Schema, and
the adjacent MCP, history, Waterline, and repair/actionability schemas.

## Discovery And Health

These routes are used by load balancers, SDK bootstraps, and compatibility
checks.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | no | Liveness probe plus a machine-readable topology summary for the responding node. |
| `GET` | `/api/ready` | no | Readiness probe plus the same topology summary and rollout-safety bootstrap checks. |
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
same response also includes `coordination_health`, the all-namespaces rollout
and readiness summary that mirrors the checks already feeding the server's
readiness posture.

### Public Topology Summary

`GET /api/health` and `GET /api/ready` both return a top-level `topology`
object from the landed health-summary contract. Use it when you need to
identify which node answered a probe before control-plane auth, namespace
resolution, or broader `/api/cluster/info` discovery succeeds.

The public summary always includes:

- `topology.schema`
- `topology.version`
- `topology.current_shape`
- `topology.current_process_class`
- `topology.current_roles`
- `topology.execution_mode`
- `topology.matching_role.queue_wake_enabled`
- `topology.matching_role.shape`
- `topology.matching_role.wake_owner`
- `topology.matching_role.task_dispatch_mode`
- `topology.matching_role.partition_primitives`
- `topology.matching_role.backpressure_model`
- `topology.matching_role.discovery_limits.poll_batch_cap`
- `topology.matching_role.discovery_limits.availability_ceiling_seconds`
- `topology.matching_role.discovery_limits.wake_signal_ttl_seconds`
- `topology.matching_role.discovery_limits.workflow_task_lease_seconds`
- `topology.matching_role.discovery_limits.activity_task_lease_seconds`

`topology.matching_role.discovery_limits` is the frozen numeric matching-role
contract: `poll_batch_cap` is the maximum batch of ready-task rows returned per
poll, `availability_ceiling_seconds` is the cross-backend tolerance applied to
`available_at` so freshly-available tasks survive sub-second timestamp drift,
`wake_signal_ttl_seconds` is the default `CacheLongPollWakeStore` signal TTL,
and `workflow_task_lease_seconds` / `activity_task_lease_seconds` are the
default workflow and activity task lease durations. Tightening any of these
values is a protocol-level change because workers and downstream tooling read
them as the authoritative matching-role contract; renaming a field is also a
protocol-level break.

`/api/ready` returns the same `topology` block even when the top-level
readiness `status` is `not_ready`, so probes can still distinguish
`server_http_node`, `scheduler_node`, `matching_node`, and `execution_node`
responses while bootstrap blockers are active.

Example:

<!-- docs-example id="server.health.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/health" | jq '{
  status,
  topology: {
    schema: .topology.schema,
    version: .topology.version,
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role
  }
}'
```

### Readiness Blockers

`GET /api/ready` returns a top-level `status` plus machine-readable `checks`.
Two checks define whether the server can safely evaluate rollout-safety health:

- `checks.migrations` is the bootstrap and migration gate. It publishes
  `repository_exists`, `pending_migrations`, `adoptable_migrations`,
  `blocking_migrations`, `missing_tables`, `operator_surface`, and
  `readiness_contract`.
- `adoptable_migrations` means existing workflow tables only need migration
  history adoption. The server stays ready and reports `status: "warning"` so
  operators can schedule the adoption before the next migrate pass.
- `blocking_migrations` means rollout-safety migration records are still
  required. The server fails closed with `status: "pending"` and a
  `remediation` string instead of serving as if the fleet were current.
- `operator_surface.available` and `operator_surface.required_tables` tell you
  whether the v2 operator surface has the durable tables it needs to explain
  rollout safety after boot.
- `readiness_contract.version` pins the install and adoption contract revision
  that scripts should expect when they parse these readiness fields.
- `checks.workflow_v2` mirrors the all-namespaces rollout-safety verdict. When
  readiness prerequisites are missing it reports `status: "blocked"` and adds
  `blocked_by`, `message`, and `remediation` instead of pretending the fleet is
  healthy.

Example:

<!-- docs-example id="server.ready.blockers.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/ready" | jq '{
  status,
  migrations: {
    status: .checks.migrations.status,
    adoptable_migrations: .checks.migrations.adoptable_migrations,
    blocking_migrations: (.checks.migrations.blocking_migrations | map(.migration)),
    missing_tables: .checks.migrations.missing_tables,
    operator_surface: .checks.migrations.operator_surface,
    readiness_contract: .checks.migrations.readiness_contract
  },
  workflow_v2: {
    status: .checks.workflow_v2.status,
    blocked_by: .checks.workflow_v2.blocked_by,
    remediation: .checks.workflow_v2.remediation
  }
}'
```

### Cluster Topology Manifest

`/api/cluster/info` also returns the node's `topology` manifest under the
schema `durable-workflow.v2.role-topology`. That manifest is the supported way
to discover whether the node is currently acting as `standalone_server`,
`embedded`, or `split_control_execution`, which roles it owns, and what the
server expects from `matching_role`, `shape_assignments`,
`authority_boundaries`, `failure_domains`, `scaling_boundaries`, and
`migration_path`. The same
response also publishes live rollout-safety state for that node.

Read the manifest as follows:

- `topology.current_shape`, `topology.current_process_class`,
  `topology.current_roles`, and `topology.execution_mode` tell you which role
  shape the node is actually serving. These fields describe the responding
  node, not the full fleet.
- `topology.role_vocabulary` is the fixed list of legal v2 role names.
- `topology.matching_role.queue_wake_enabled`,
  `topology.matching_role.shape`, `topology.matching_role.wake_owner`,
  `topology.matching_role.task_dispatch_mode`,
  `topology.matching_role.partition_primitives`, and
  `topology.matching_role.backpressure_model` tell you whether broad ready-task
  discovery is happening in-worker or through a dedicated matching-role sweep,
  which process owns that sweep, which routing axes stay stable, and which
  durable admission boundary v2 enforces today.
- `topology.matching_role.discovery_limits` publishes the frozen numeric
  matching-role contract values: `poll_batch_cap`,
  `availability_ceiling_seconds`, `wake_signal_ttl_seconds`,
  `workflow_task_lease_seconds`, and `activity_task_lease_seconds`. Use these
  to verify the deployment matches the documented matching-role contract; the
  package emits the same identifiers in `dw server:info`, the operator-metrics
  snapshot, and the namespace-scoped health surface.
- `topology.role_catalog` and `topology.authority_surfaces` map those role
  names to the interfaces, durable-write surfaces, and read paths automation
  should expect on the responding node.
- `topology.shape_assignments` is the machine-readable process-class inventory
  for each supported shape. Compare the current role bundle against that table
  when you need to map the responding node onto a documented process class.
- `topology.supported_topologies` summarizes which deployment families the
  product supports and which node classes each family expects.
- `coordination_health` summarizes fleet-wide rollout and compatibility risk in
  one machine-readable block. Besides `status` and `http_status`, it can publish
  `blocked_by`, `message`, and `remediation` when rollout-safety evaluation is
  blocked by upstream readiness issues such as missing migrations or database
  reachability.
- `coordination_health.checks[]` always includes the frozen
  `activity_path` check next to `worker_compatibility`, `task_transport`,
  `routing_health`, `durable_resume_paths`, and the projection/scheduler checks.
  `activity_path` is the activity-side counterpart of `task_transport`: it
  surfaces activity executions whose schedule-to-start, start-to-close,
  schedule-to-close, or heartbeat deadline has passed without enforcement
  (`timeout_overdue`, `oldest_timeout_overdue_at`,
  `max_timeout_overdue_age_ms`) and the sustained activity retry backlog
  (`retrying`, `oldest_retrying_started_at`, `max_retrying_age_ms`). Renaming
  the check is a protocol-level change.
- `coordination_health.routing_drains` summarizes draining build-id cohorts
  across namespaces and queues. Use `queues_with_drains` and the per-queue
  `build_ids` entries to see where traffic is intentionally being held away from
  draining workers.
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
    current_shape: .topology.current_shape,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    coordination_health: {
      status: .coordination_health.status,
      http_status: .coordination_health.http_status,
      blocked_by: .coordination_health.blocked_by,
      queues_with_drains: .coordination_health.routing_drains.queues_with_drains
    }
  }'
```

For the conceptual contract behind those fields, including the role vocabulary
and migration path, see
[Server Role Topology](/docs/polyglot/server-role-topology).

### Wrong-Node Topology Rejections

Authenticated hosted routes fail closed when the responding node does not host
the HTTP control surface required for that endpoint. The gate runs after role
and protocol-version validation but before namespace resolution, so wrong-node
requests do not leak namespace existence.

When the gate blocks a request, the server returns `503` with
`reason: "topology_role_unavailable"` plus:

- `current_shape`: the responding node's advertised topology shape.
- `current_process_class`: the responding node's declared process class, such
  as `scheduler_node` or `execution_node`.
- `current_roles`: the roles that node actually hosts.
- `required_roles`: the hosted route roles the endpoint needs.
- `missing_roles`: the subset of `required_roles` missing from the responding
  node.

Control-plane routes return that payload in the control-plane envelope. Worker
protocol routes return the same fields in the worker-protocol envelope and keep
the normal worker-protocol version header.

Example wrong-node response from `GET /api/workflows` when the request lands on
a scheduler-only node:

```json
{
  "reason": "topology_role_unavailable",
  "message": "This node does not host the topology roles required for this endpoint.",
  "current_shape": "standalone_server",
  "current_process_class": "scheduler_node",
  "current_roles": ["scheduler"],
  "required_roles": ["api_ingress", "control_plane"],
  "missing_roles": ["api_ingress", "control_plane"]
}
```

`GET /api/health`, `GET /api/ready`, and authenticated `GET /api/cluster/info`
stay available for liveness and discovery even on nodes that do not host the
current HTTP control surface.

### Workflow Bootstrap Gate

Authenticated routes that mutate or serve workflow v2 traffic also fail closed
when `checks.workflow_v2.status` on the responding node is `blocked`. The gate
runs after role and protocol-version validation but before namespace
resolution, so a request sent during a blocked rollout never observes namespace
existence.

When the gate trips, the server returns `503` with
`reason: "workflow_v2_blocked"` plus:

- `blocked_by`: the ordered list of upstream readiness blockers (for example
  `migrations`) that are keeping workflow v2 from serving safely.
- `remediation`: the short operator-facing instruction for clearing the listed
  blockers, mirrored from the `/api/ready` `checks.workflow_v2.remediation`
  field.

The bootstrap-gated route families are:

- **Workflow start and mutation** — every `/api/workflows` route in the start,
  describe, command, and run-targeted command groups (for example
  `POST /api/workflows`, `POST /api/workflows/{workflowId}/signal/{signalName}`,
  `POST /api/workflows/{workflowId}/runs/{runId}/cancel`).
- **Schedule mutation** — `POST /api/schedules`,
  `PUT /api/schedules/{scheduleId}`, `DELETE /api/schedules/{scheduleId}`,
  `POST /api/schedules/{scheduleId}/pause`,
  `POST /api/schedules/{scheduleId}/resume`,
  `POST /api/schedules/{scheduleId}/trigger`, and
  `POST /api/schedules/{scheduleId}/backfill`.
- **Bridge adapters** — `POST /api/bridge-adapters/webhook/{adapter}`.
- **Worker protocol** — every `/api/worker` and `/api/worker/*` route, including
  registration, heartbeat, and workflow-task, query-task, and activity-task
  poll/complete/fail/heartbeat verbs.

Schedule **reads** are intentionally exempted so operators can inspect schedule
state during recovery: `GET /api/schedules`,
`GET /api/schedules/{scheduleId}`, and
`GET /api/schedules/{scheduleId}/history` continue to serve while the bootstrap
gate is blocking other routes.

Control-plane routes return the bootstrap-gate payload in the control-plane
envelope, including the `X-Durable-Workflow-Control-Plane-Version` header.
Worker-protocol routes return the same `reason`, `blocked_by`, and
`remediation` fields in the worker-protocol envelope and keep the
`X-Durable-Workflow-Protocol-Version` header so workers can branch on the
machine-readable reason instead of inferring queue state from a bare `503`.

Example bootstrap-gate response from `POST /api/workflows` while a rollout-safety
migration is missing:

```json
{
  "reason": "workflow_v2_blocked",
  "message": "This node is not ready to serve workflow v2 traffic until bootstrap blockers are cleared.",
  "blocked_by": ["migrations"],
  "remediation": "Restore database connectivity and migrate the workflow tables before relying on workflow v2 rollout-safety health."
}
```

The same payload is returned in the worker-protocol envelope for
`/api/worker/*` routes, so worker SDKs can keep branching on `reason` and
retrying after the upstream blocker clears.

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
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/repair` | Repair only if the selected run is current. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/archive` | Archive only if the selected run is current and closed. |

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
| `codec` | yes | Always `avro`: fixed typed Value schema with Avro single-object framing. The surrounding HTTP document remains JSON. |
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
[Namespace, Auth, And Worker Registration](/docs/polyglot/namespace-auth-workers).

## Service Catalog Admin APIs

Service-catalog routes are authenticated admin control-plane routes. They use
the same namespace resolution, topology-role gating, and
`X-Durable-Workflow-Control-Plane-Version: 2` requirement as the rest of the
hosted control plane.

Use this route family to register namespace-scoped endpoint, service, and
operation metadata for the cross-namespace service catalog. Names are
case-insensitive on input and are normalized to lowercase in responses and
lookups.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/service-endpoints` | List service endpoints for the current namespace. |
| `POST` | `/api/service-endpoints` | Create a service endpoint. |
| `GET` | `/api/service-endpoints/{endpointName}` | Describe one endpoint. |
| `PUT` | `/api/service-endpoints/{endpointName}` | Update endpoint description or metadata. |
| `DELETE` | `/api/service-endpoints/{endpointName}` | Delete an unused endpoint. |
| `GET` | `/api/service-endpoints/{endpointName}/services` | List services registered under one endpoint. |
| `POST` | `/api/service-endpoints/{endpointName}/services` | Create a service under one endpoint. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Describe one service. |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Update service description or metadata. |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Delete an unused service. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | List operations registered under one service. |
| `POST` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | Create an operation binding. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Describe one operation. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}/service-calls/{serviceCallId}` | Describe one durable service-call snapshot. |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Update an operation binding. |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Delete an unused operation. |

Response collections use `service_endpoints`, `services`, or `operations`
arrays. Individual resources include stable lowercase names plus metadata and
timestamps:

- Endpoints return `id`, `namespace`, `endpoint_name`, `description`,
  `metadata`, `created_at`, and `updated_at`.
- Services add `endpoint_id` and `service_name`.
- Operations add `service_id`, `operation_name`, `operation_mode`,
  `handler_binding_kind`, `handler_target_reference`, `handler_binding`,
  `deadline_policy`, `idempotency_policy`, `cancellation_policy`,
  `retry_policy`, `boundary_policy`, and `metadata`.
- Service-call snapshots add `caller_namespace`, caller and linked workflow
  ids, `status`, `resolved_binding_kind`, `resolved_target_reference`,
  payload references, policy snapshots, and lifecycle timestamps such as
  `accepted_at`, `started_at`, `completed_at`, `failed_at`, and
  `cancelled_at`.

Operation create/update requests use the same JSON field names as the response.
`operation_mode` is `sync` or `async`. `handler_binding_kind` is one of
`start_workflow`, `signal_workflow`, `update_workflow`, `query_workflow`,
`activity_execution`, or `invocable_http`. New operations must provide either
`handler_target_reference` or a non-empty `handler_binding` payload.

Delete routes fail closed with HTTP `409` and a named reason when dependents
still exist, such as `endpoint_has_services`, `service_has_operations`, or
`operation_has_service_calls`.

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
[Worker Build-Id Rollout](/docs/polyglot/worker-build-id-rollout) for the
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
| `GET` | `/api/system/health` | Return the namespace-scoped rollout-safety and coordination health snapshot, nested under `health`. |
| `GET` | `/api/system/metrics` | Return bounded JSON metrics. |
| `GET` | `/api/system/operator-metrics` | Return the namespace-scoped operator metrics snapshot for runs, tasks, backlog, repair, workers, and structural limits. |
| `GET` | `/api/system/repair` | Inspect workflow repair backlog. |
| `POST` | `/api/system/repair/pass` | Run one workflow repair pass. |
| `GET` | `/api/system/activity-timeouts` | Inspect activity-timeout backlog. |
| `POST` | `/api/system/activity-timeouts/pass` | Run one activity-timeout enforcement pass. |
| `GET` | `/api/system/retention` | Inspect retention cleanup backlog. |
| `POST` | `/api/system/retention/pass` | Run one retention cleanup pass. |

`/api/system/health` is the quickest way to answer whether one namespace is
healthy enough to keep taking traffic. It returns `{namespace, health}`, where
`health` contains the categorized rollout-safety checks, the nested
`health.operator_metrics` snapshot, and the structural-limit summary used by
the health surface.

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
| `503` | The request reached a node that does not host the required topology roles. Hosted routes return `reason: "topology_role_unavailable"` plus `current_shape`, `current_process_class`, `current_roles`, `required_roles`, and `missing_roles`. The same status with `reason: "workflow_v2_blocked"` plus `blocked_by` and `remediation` covers workflow start/mutation, schedule mutation, bridge-adapter, and worker-protocol routes while workflow v2 bootstrap is blocked; schedule read routes (`GET /api/schedules`, `GET /api/schedules/{scheduleId}`, `GET /api/schedules/{scheduleId}/history`) stay available so operators can inspect schedule state during recovery. |
| `500` | Server failure. Treat as retryable only when the operation is idempotent or has an idempotency key. |

Validation responses include `reason: "validation_failed"` plus `errors` or
`validation_errors`. Workflow command responses also project validation and
operation details into the nested `control_plane` object.

## See Also

- [Server guide](/docs/polyglot/server)
- [Namespace, Auth, And Worker Registration](/docs/polyglot/namespace-auth-workers)
- [Worker Protocol](/docs/polyglot/worker-protocol)
- [Task Queue Admission](/docs/polyglot/task-queue-admission)
- [External Execution](/docs/polyglot/external-execution)
- [CLI Command Reference](/docs/polyglot/cli-reference)
