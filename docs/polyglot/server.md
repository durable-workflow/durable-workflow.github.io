---
sidebar_position: 2
title: Server
description: Deploy and configure the Durable Workflow standalone server.
tags:
  - server
  - control-plane
  - operations
  - polyglot
keywords:
  - Durable Workflow server
  - standalone server
  - control plane API
  - polyglot workflows
---

# Server

The Durable Workflow server is a standalone, language-neutral workflow orchestration service. It exposes the same durable execution engine as the PHP package over HTTP, letting you write workflows in Python, PHP, or any language that speaks HTTP.

If you are deciding between the standalone server and package embedding, start
with [Deployment Modes](/docs/2.0/polyglot/deployment-modes). This page covers
the service-mode distribution.

Use the standalone server when you need:
- **Polyglot workflows** — Python workers executing PHP-authored workflows, or vice versa
- **Microservice orchestration** — orchestrate services written in different languages
- **Centralized workflow runtime** — multiple applications sharing one workflow engine
- **Non-Laravel environments** — use Durable Workflow outside Laravel

If you already run v2 embedded in a Laravel app, use the
[embedded-to-server migration guide](/docs/2.0/polyglot/embedded-to-server) to
prepare type keys, deploy the server beside embedded execution, connect workers,
and route only new workflow starts to the server. Keep
[Deployment Modes](/docs/2.0/polyglot/deployment-modes) nearby during that
cutover so ids, command outcomes, task semantics, and runtime ownership rules
stay explicit.

Use [Worker Compatibility and Routing](/docs/2.0/polyglot/worker-compatibility-routing)
when you roll worker build cohorts, drain old cohorts, or need to keep
long-running runs pinned to compatible executors during rollback.

Use [Server Role Topology](/docs/2.0/polyglot/server-role-topology) when you
need the live role vocabulary, process classes, authority boundaries, failure
domains, or migration path that `GET /api/cluster/info` publishes.

## Quick Start

### Docker Compose

The fastest way to run the server:

```bash
# Clone the repository
git clone https://github.com/durable-workflow/server.git
cd server

# Copy environment config
cp .env.example .env

# Start the server with all dependencies
docker compose up -d

# Verify
curl http://localhost:8080/api/health
curl http://localhost:8080/api/cluster/info \
  | jq '.topology | {current_shape, current_roles, execution_mode}'
```

This starts:
- **server** — the API node serving `api_ingress`, `control_plane`, `matching`, and `history_projection`
- **worker** — the execution-plane queue worker
- **scheduler** — the singleton schedule and maintenance runner
- **mysql** — the workflow state database
- **redis** — cache and queue backend
- **bootstrap** — one-shot service that runs migrations and seeds the default namespace

The published Compose stack starts in the `standalone_server` shape. Read
`/api/cluster/info` to confirm the API node role bundle and matching-role
settings instead of inferring duties from container names.

### Ports

| Service | Port | Purpose |
|---------|------|---------|
| Server API | 8080 | Control-plane and worker-protocol endpoints |
| MySQL | 3306 | Database (exposed for development convenience) |
| Redis | 6379 | Cache and queue (exposed for development convenience) |

## Configuration

The server uses environment variables for configuration. Key settings are
summarized below; the full operator-facing `DW_*` contract is documented in
the [server config reference](/docs/2.0/polyglot/server-config-reference).

### Database

```bash
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=workflow
DB_USERNAME=workflow
DB_PASSWORD=secret
```

Supported: MySQL 8.0+, PostgreSQL 13+, SQLite 3.35+.

### Cache and Queue

```bash
CACHE_STORE=redis
QUEUE_CONNECTION=redis

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=null
REDIS_DB=0
```

Cache must support [atomic locks](https://laravel.com/docs/12.x/cache#atomic-locks). Queue drivers: Redis, Amazon SQS, Beanstalkd, database.

Atomic cache locks are required for server-side
[task queue admission caps](/docs/2.0/polyglot/task-queue-admission) and
query-task backpressure. Use Redis for multi-node deployments that need
workflow, activity, or query admission to hold across every server process.

### Authentication

The server supports three auth modes:

**Token-based** (default):

```bash
DW_AUTH_DRIVER=token
DW_AUTH_TOKEN=your-secret-token-here
```

All requests must send `Authorization: Bearer your-secret-token-here`.

For least-privilege deployments, configure role-scoped tokens instead of one
shared token:

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Worker tokens can register workers, poll tasks, heartbeat, and complete work.
Operator tokens can start, list, signal, query, update, repair, cancel,
terminate, archive, and observe workflows. Admin tokens can use administrative
endpoints such as namespace and retention management.

**HMAC signature**:

```bash
DW_AUTH_DRIVER=signature
DW_SIGNATURE_KEY=your-signature-secret
```

Requests must include `X-Signature`, calculated as
`hash_hmac('sha256', request_body, DW_SIGNATURE_KEY)`. The server
also accepts role-scoped signature keys:

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

**No auth** (development only):

```bash
DW_AUTH_DRIVER=none
```

⚠️ **Do not use `none` in production.** All endpoints become publicly accessible.

### Workflow Package

The Docker image installs the `durable-workflow/workflow` package. Control which version:

```bash
# Build-time arg (set in docker-compose.yml or pass to docker build)
WORKFLOW_PACKAGE_REF=v2        # branch, tag, or commit
WORKFLOW_PACKAGE_SOURCE=       # custom Git remote (optional)
```

### Retention

Configure how long completed workflows remain queryable:

```bash
DW_HISTORY_RETENTION_DAYS=30
```

After retention expires, workflows are pruned. Configure per-namespace retention via the API.

### Namespaces

The `server-bootstrap` command runs migrations and seeds the `default`
namespace. Use `DW_DEFAULT_NAMESPACE` to change the namespace used when a
request omits the namespace header:

```bash
DW_DEFAULT_NAMESPACE=default
```

Create namespaces via the API:

```bash
curl -X POST http://localhost:8080/api/namespaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production",
    "description": "Production workflows",
    "retention_days": 90
  }'
```

## Health Checks

### API Health

```bash
curl http://localhost:8080/api/health
```

Returns `200 OK` with:

```json
{
  "status": "serving",
  "timestamp": "2026-04-15T12:00:00Z",
  "checks": {
    "database": "ok"
  },
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 4,
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": ["api_ingress", "control_plane", "matching", "history_projection"],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": ["connection", "queue", "compatibility", "namespace"],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    }
  }
}
```

### Public Topology Summary

Unauthenticated `GET /api/health` and `GET /api/ready` both publish the
responding node's `topology` summary. That public block is intentionally
smaller than `/api/cluster/info`, but it still exposes the fields needed to
identify split-role nodes before control-plane auth or namespace resolution:

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
contract that compiles into the workflow package: `poll_batch_cap` is the
maximum batch of ready-task rows returned per poll,
`availability_ceiling_seconds` is the cross-backend tolerance applied to
`available_at` so freshly-available tasks survive sub-second timestamp drift,
`wake_signal_ttl_seconds` is the default `CacheLongPollWakeStore` signal TTL,
and `workflow_task_lease_seconds` / `activity_task_lease_seconds` are the
default workflow and activity task lease durations. Tightening any of these
values is a protocol-level change because workers and downstream tooling read
them as the authoritative matching-role contract.

The same summary appears on `/api/ready` even when the deployment is not ready,
so probes can still distinguish `server_http_node`, `scheduler_node`,
`matching_node`, and `execution_node` responses while bootstrap blockers are
active.

### Readiness

```bash
curl http://localhost:8080/api/ready
```

`/api/ready` is the deployment gate. It returns `200 OK` only when bootstrap
prerequisites and rollout-safety health are in a ready or warning state.

Treat the machine-readable fields as follows:

- `checks.migrations.repository_exists` and `checks.migrations.pending_migrations`
  tell you whether the migration repository exists and which migration records
  are still pending.
- `checks.migrations.adoptable_migrations` lists create-table migrations that
  only need adoption into migration history. This is a `warning`, not a
  fail-closed outage, so the server can stay ready while operators schedule the
  adoption.
- `checks.migrations.blocking_migrations` lists rollout-safety migration records
  that must land before the server should admit traffic. When this array is not
  empty, readiness fails closed with `checks.migrations.status = "pending"`.
- `checks.migrations.missing_tables` reports durable tables that are still
  absent, and `checks.migrations.operator_surface` tells you whether the v2
  operator surface is available enough to explain rollout safety once the server
  boots.
- `checks.migrations.readiness_contract.version` pins the boot and migration
  adoption contract revision that scripts should parse.
- `checks.workflow_v2` mirrors the all-namespaces rollout-safety verdict. When
  rollout-safety cannot be evaluated yet it returns `status: "blocked"` plus
  `blocked_by`, `message`, and `remediation` so operators can fix the upstream
  readiness gate instead of chasing queue symptoms.

### Workflow Bootstrap Gate

`checks.workflow_v2.status: "blocked"` is also a route-level gate, not just a
readiness signal. While workflow v2 bootstrap is blocked, the server fails
closed on workflow start/mutation, schedule mutation, bridge-adapter, and
worker-protocol routes with HTTP `503` and a machine-readable
`reason: "workflow_v2_blocked"` payload. The gate runs after role and
protocol-version validation but before namespace resolution, so blocked
requests never observe namespace existence.

The bootstrap-gate response always carries:

- `reason: "workflow_v2_blocked"` so callers branch on a machine-readable name
  instead of a prose message.
- `blocked_by`: the ordered list of upstream readiness blockers (for example
  `migrations`).
- `remediation`: the operator-facing instruction for clearing the listed
  blockers, mirrored from `/api/ready` `checks.workflow_v2.remediation`.

Bootstrap-gated route families:

- **Workflow start and mutation** — `/api/workflows` start, command, and
  run-targeted command routes.
- **Schedule mutation** — `POST /api/schedules`,
  `PUT /api/schedules/{scheduleId}`, `DELETE /api/schedules/{scheduleId}`,
  `POST /api/schedules/{scheduleId}/pause`,
  `POST /api/schedules/{scheduleId}/resume`,
  `POST /api/schedules/{scheduleId}/trigger`, and
  `POST /api/schedules/{scheduleId}/backfill`.
- **Bridge adapters** — `POST /api/bridge-adapters/webhook/{adapter}`.
- **Worker protocol** — every `/api/worker` and `/api/worker/*` route, including
  registration, heartbeat, workflow-task, query-task, and activity-task verbs.
  Worker-protocol routes return the bootstrap-gate payload in the
  worker-protocol envelope and keep the
  `X-Durable-Workflow-Protocol-Version` header so worker SDKs can branch on the
  same `reason: "workflow_v2_blocked"` field they parse from the control plane.

Schedule **reads** are intentionally exempted so operators can inspect
schedule state during recovery: `GET /api/schedules`,
`GET /api/schedules/{scheduleId}`, and
`GET /api/schedules/{scheduleId}/history` continue to serve while the
bootstrap gate is blocking other routes.

### Server Capabilities

```bash
curl http://localhost:8080/api/cluster/info \
  -H "Authorization: Bearer $TOKEN"
```

Returns the server build version, supported SDK versions, engine capabilities,
the client compatibility policy, and the independently-versioned control-plane
and worker-protocol manifests:

```json
{
  "server_id": "server-1",
  "version": "2.0.0",
  "default_namespace": "default",
  "supported_sdk_versions": {
    "php": ">=1.0",
    "python": ">=0.2,<1.0",
    "cli": ">=0.1,<1.0"
  },
  "client_compatibility": {
    "schema": "durable-workflow.v2.client-compatibility",
    "version": 1,
    "authority": "protocol_manifests",
    "top_level_version_role": "informational",
    "fail_closed": true
  },
  "capabilities": {
    "workflow_tasks": true,
    "activity_tasks": true,
    "signals": true,
    "queries": true,
    "updates": true,
    "schedules": true,
    "child_workflow_retry_policy": true,
    "child_workflow_timeouts": true,
    "payload_codecs": ["avro"],
    "response_compression": ["gzip", "deflate"]
  },
  "control_plane": {
    "version": "2",
    "header": "X-Durable-Workflow-Control-Plane-Version",
    "request_contract": { "schema": "durable-workflow.v2.control-plane-request.contract", "version": 1, "...": "..." },
    "response_contract": { "schema": "durable-workflow.v2.control-plane-response.contract", "version": 1, "...": "..." }
  },
  "worker_protocol": {
    "version": "1.0",
    "server_capabilities": {
      "long_poll_timeout": 30,
      "supported_workflow_task_commands": [
        "complete_workflow",
        "fail_workflow",
        "continue_as_new",
        "schedule_activity",
        "start_timer",
        "start_child_workflow"
      ],
      "workflow_task_poll_request_idempotency": true,
      "poll_status": true,
      "history_page_size_default": 500,
      "history_page_size_max": 1000,
      "activity_retry_policy": true,
      "activity_timeouts": true,
      "child_workflow_retry_policy": true,
      "child_workflow_timeouts": true,
      "parent_close_policy": true,
      "non_retryable_failures": true,
      "response_compression": ["gzip", "deflate"],
      "history_compression": {
        "supported_encodings": ["gzip"],
        "compression_threshold": 8192
      }
    }
  }
}
```

Treat `client_compatibility.authority: "protocol_manifests"` as the rule for
client checks. The top-level `version` is build identity; CLI and SDK clients
should fail closed when `control_plane.version`,
`control_plane.request_contract`, or `worker_protocol.version` is missing or
unsupported.

### Role topology and deployment shape

The field-by-field reference for this manifest lives on
[Server Role Topology](/docs/2.0/polyglot/server-role-topology). Keep this
section for the inline `cluster/info` example and use the dedicated page when
you need the supported shapes, authority boundaries, failure domains, scaling
boundaries, or migration-path contract in one place.

`GET /api/cluster/info` also publishes a `topology` manifest. It is the
machine-readable role map for the node that answered the request, so operators
and automation can read one contract instead of inferring node duties from
container names or rollout runbooks.

```json
{
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 2,
    "supported_shapes": [
      "embedded",
      "standalone_server",
      "split_control_execution"
    ],
    "role_vocabulary": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection",
      "scheduler",
      "execution_plane"
    ],
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection"
    ],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": [
        "connection",
        "queue",
        "compatibility",
        "namespace"
      ],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    },
    "shape_assignments": {
      "embedded": {
        "process_classes": [
          {
            "name": "application_process",
            "roles": [
              "control_plane",
              "matching",
              "history_projection",
              "scheduler",
              "execution_plane"
            ]
          }
        ]
      },
      "standalone_server": {
        "process_classes": [
          {
            "name": "server_http_node",
            "roles": [
              "api_ingress",
              "control_plane",
              "matching",
              "history_projection"
            ]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "worker_node",
            "roles": ["execution_plane"]
          }
        ]
      },
      "split_control_execution": {
        "process_classes": [
          {
            "name": "ingress_node",
            "roles": ["api_ingress"]
          },
          {
            "name": "control_plane_node",
            "roles": ["control_plane", "history_projection"]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "matching_node",
            "roles": ["matching"]
          },
          {
            "name": "execution_node",
            "roles": ["execution_plane"]
          }
        ]
      }
    },
    "authority_boundaries": {
      "control_plane": {
        "writes": [
          "workflow_instances",
          "workflow_runs.status",
          "workflow_tasks.lifecycle"
        ]
      },
      "execution_plane": {
        "writes": [
          "workflow_tasks.outcomes",
          "activity_attempts",
          "worker_compatibility_heartbeats"
        ]
      },
      "matching": {
        "writes": [
          "workflow_tasks.leases",
          "activity_tasks.leases"
        ]
      },
      "history_projection": {
        "writes": [
          "history_events",
          "workflow_run_summaries",
          "workflow_history_exports"
        ]
      },
      "scheduler": {
        "writes": [
          "workflow_schedules.fire_state",
          "workflow_starts.scheduled"
        ]
      },
      "api_ingress": {
        "writes": ["worker_registrations"]
      }
    },
   "failure_domains": {
      "control_plane_down": {
        "effect": "workers_continue_claimed_tasks_only_until_lease_expiry",
        "operator_signal": "operator_commands_fail_fast"
      },
      "execution_plane_down": {
        "effect": "ready_tasks_accumulate_without_loss",
        "operator_signal": "operators_see_ready_depth_growth"
      },
      "matching_down": {
        "effect": "claim_falls_back_to_direct_ready_task_discovery",
        "operator_signal": "ready_depth_rises_while_claim_rate_falls"
      },
      "history_projection_down": {
        "effect": "projection_reads_may_stale_while_durable_writes_continue",
        "operator_signal": "projection_lag_seconds_may_increase"
      },
      "scheduler_down": {
        "effect": "scheduled_workflows_stop_firing_and_record_missed_runs",
        "operator_signal": "operators_see_missed_schedule_state"
      },
      "api_ingress_down": {
        "effect": "external_http_traffic_stops_at_the_edge",
        "operator_signal": "embedded_in_process_calls_may_continue"
      }
    },
    "scaling_boundaries": {
      "api_ingress": "incoming_http_request_rate",
      "control_plane": "operator_commands_and_run_lifecycle_transitions",
      "matching": "ready_task_rate_and_poller_count",
      "history_projection": "durable_event_rate",
      "scheduler": "active_schedule_count",
      "execution_plane": "workflow_and_activity_task_rate"
    },
    "migration_path": [
      {
        "step": "audit_role_boundaries",
        "result": "tooling flags cross-role writes before runtime shape changes",
        "reversible": true
      },
      {
        "step": "expose_role_bindings",
        "result": "container seams allow out-of-process adapters without patching the package",
        "reversible": true
      },
      {
        "step": "introduce_dedicated_matching_shape",
        "result": "matching can run as its own process class without changing the claim contract",
        "reversible": true
      },
      {
        "step": "split_history_projection",
        "result": "history and projections can move out of process without introducing a second writer",
        "reversible": true
      },
      {
        "step": "split_scheduler",
        "result": "schedule firing can move behind leader election while single-replica deployments stay legal",
        "reversible": true
      },
      {
        "step": "optional_execution_partitioning",
        "result": "workers can partition by namespace, connection, queue, and compatibility",
        "reversible": true
      }
    ],
    "kernel_invariants": [
      {
        "id": "single_persistence_engine",
        "summary": "one workflow database backs every topology shape; role split does not introduce a second persistence engine",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_worker_protocol",
        "summary": "one HTTP worker protocol carries claim, complete, fail, and heartbeat traffic across every topology; role split does not fork the worker contract",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_history_writer",
        "summary": "history_events has exactly one durable writer per logical event regardless of where the history/projection role runs",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_control_authority_per_run",
        "summary": "every mutation of a given workflow run routes through one control-plane authority; per-run row locks serialise transitions across replicas",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "embedded_topology_remains_supported",
        "summary": "the embedded shape where one process fills every role MUST stay legal; existing embedded hosts are never forced to migrate",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "role_split_is_topology_only",
        "summary": "splitting roles is a topology change, not a product fork; collapsing the roles back onto a single process is always a legal topology",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      }
    ]
  },
  "coordination_health": {
    "schema": "durable-workflow.v2.coordination-health.contract",
    "version": 2,
    "namespace_scope": "all_namespaces",
    "status": "ok",
    "http_status": 200,
    "warning_checks": [],
    "error_checks": [],
    "categories": {
      "correctness": "ok"
    },
    "checks": [
      {
        "name": "worker_compatibility",
        "status": "ok",
        "category": "correctness",
        "message": null
      },
      {
        "name": "activity_path",
        "status": "ok",
        "category": "correctness",
        "message": null
      }
    ],
    "routing_drains": {
      "queues_with_drains": 0,
      "draining_build_id_count": 0,
      "active_worker_count": 0,
      "draining_worker_count": 0,
      "stale_worker_count": 0,
      "queues": []
    }
  }
}
```

Treat `topology.version` as the role-manifest schema version, not as a synonym
for the top-level server build version. Automation should check that field
before assuming fields added by a newer topology manifest revision. The
current public contract includes `supported_shapes`, `role_vocabulary`,
`current_shape`, `current_process_class`, `current_roles`, `execution_mode`,
`matching_role`, `role_catalog`, `shape_assignments`,
`authority_boundaries`, `authority_surfaces`, `failure_domains`,
`supported_topologies`, `scaling_boundaries`, `migration_path`, and
`kernel_invariants`.

Read the fields as follows:

- `supported_shapes` names the legal product topologies.
- `role_vocabulary` is the fixed list of v2 role names. Treat it as the
  canonical vocabulary for automation and diagnostics.
- `current_shape`, `current_process_class`, and `current_roles` describe the
  node you queried right now. Use `current_process_class` as the node's
  declared identity, then compare the current role bundle against
  `shape_assignments` for the current shape when you need to validate that
  declaration.
- `execution_mode` distinguishes embedded local queue execution
  (`local_queue_worker`) from standalone server worker-protocol execution
  (`remote_worker_protocol`).
- `matching_role.queue_wake_enabled`, `matching_role.shape`,
  `matching_role.wake_owner`, `matching_role.task_dispatch_mode`,
  `matching_role.partition_primitives`, and
  `matching_role.backpressure_model` tell you whether the node still runs the
  in-worker wake path or expects a dedicated repair or matching loop to own
  that sweep, which routing axes remain stable, and which durable admission
  boundary the matching layer currently enforces.
- `matching_role.discovery_limits` freezes the numeric matching-role contract
  values the workflow package compiles in: `poll_batch_cap` (the maximum batch
  of ready-task rows returned per poll), `availability_ceiling_seconds` (the
  cross-backend tolerance applied to `available_at` so freshly-available tasks
  survive sub-second timestamp drift), `wake_signal_ttl_seconds` (the default
  long-poll wake-signal TTL), `workflow_task_lease_seconds` (the default
  workflow task lease), and `activity_task_lease_seconds` (the default
  activity task lease). Operators read these to verify the deployment matches
  the documented matching-role contract without grepping the package source;
  tightening any value is a protocol-level change.
- `role_catalog` and `authority_surfaces` tell you which interfaces and
  durable mutation paths each role owns on the current manifest revision.
- `shape_assignments` maps each supported shape to the process classes and role
  bundles that shape is allowed to run.
- `supported_topologies` summarizes the deployment families the product
  supports and the node classes each family expects.
- `authority_boundaries` names which durable write surfaces each role is
  expected to mutate, so operators can catch cross-role drift before they split
  a deployment.
- `failure_domains` describes the first operator-visible degradation signal when
  a role goes down, instead of leaving that expectation implicit in a runbook.
- `scaling_boundaries` names the main load dimension for each role when the
  topology is split.
- authenticated hosted routes fail closed when the responding node does not
  host the HTTP control surface. In that case the server returns `503` with
  `reason: "topology_role_unavailable"` plus `current_shape`,
  `current_process_class`, `current_roles`, `required_roles`, and
  `missing_roles` so callers can reroute to a node that actually exposes the
  requested surface.
- `coordination_health` is the fleet-wide rollout-safety summary published from
  the same discovery call. It uses `all_namespaces` scope, summarizes the
  current status and HTTP posture, lists the normalized warning/error check
  names that also feed readiness health, and adds `blocked_by`, `message`, plus
  `remediation` when rollout-safety evaluation is blocked by upstream readiness
  problems.
- `coordination_health.checks[]` always includes the frozen check `activity_path`
  next to `worker_compatibility`, `task_transport`, `routing_health`,
  `durable_resume_paths`, and the projection/scheduler checks. `activity_path`
  is the activity-side counterpart of `task_transport`: it surfaces activity
  executions whose schedule-to-start, start-to-close, schedule-to-close, or
  heartbeat deadline has passed without enforcement (`timeout_overdue`,
  `oldest_timeout_overdue_at`, `max_timeout_overdue_age_ms`) and the sustained
  retry backlog (`retrying`, `oldest_retrying_started_at`,
  `max_retrying_age_ms`). Renaming the check is a protocol-level change.
- `coordination_health.routing_drains` summarizes draining build-id cohorts
  across queues and namespaces. `queues_with_drains` greater than zero means the
  fleet is intentionally holding traffic away from at least one draining cohort.
- `migration_path` lists the ordered rollout steps from today's standalone
  distribution toward more isolated role boundaries without introducing a
  second engine. Each entry's `reversible: true` flag declares that
  collapsing back to a less-isolated shape stays a legal topology.
- `kernel_invariants` enumerates the durable-kernel guarantees the role
  split must preserve regardless of which supported shape is running:
  `single_persistence_engine`, `single_worker_protocol`,
  `single_history_writer`, `single_control_authority_per_run`,
  `embedded_topology_remains_supported`, and `role_split_is_topology_only`.
  Each entry's `applies_to` lists the supported shapes the invariant
  covers; rollout automation MAY use the field to assert that a candidate
  topology change preserves the kernel before applying the shape change.

This keeps the role split as a topology change, not a second engine or a
separate control-plane API. When a deployment evolves from a narrow
`standalone_server` fleet toward a more explicit `split_control_execution`
shape, operators still read the same discovery surface. The values under
`current_shape`, `current_roles`, `execution_mode`, `matching_role`,
`shape_assignments`, `authority_boundaries`, `failure_domains`,
`scaling_boundaries`, and `migration_path` are
versioned as one manifest so rollout tooling can reason about the same
topology surface the server ships.

The same constraint also surfaces machine-readably through
`topology.kernel_invariants` so rollout automation can verify that no
candidate topology change introduces a second persistence engine, a
forked worker protocol, a second history writer, or a non-reversible
migration before applying the change.

The hosted-route gate applies only to authenticated API and worker endpoints.
`GET /api/health`, `GET /api/ready`, and authenticated `GET /api/cluster/info`
stay available for discovery, liveness, and topology inspection even on
`scheduler_node`, `matching_node`, or `execution_node` processes that do not
host the current HTTP control surface.

For carrier-neutral external handlers, the same endpoint publishes
`worker_protocol.external_execution_surface_contract`. That manifest names the
[activity-grade external execution surface](/docs/2.0/polyglot/external-execution),
links the external task input/result envelope contracts, and keeps workflow
replay, `ContinueAsNew`, signal/update/query ordering, and event-history
interpretation inside real runtimes.

Key field notes for client code:

- The app version is `version`, not `server_version`.
- Workflow-task command capabilities live under `worker_protocol.server_capabilities.supported_workflow_task_commands`, not at the top of `worker_protocol`. The same nested object is echoed on every worker-plane response via the `server_capabilities` field.
- `worker_protocol.server_capabilities.poll_status` means poll responses keep a
  machine-readable `poll_status` field even when no task is leased, so workers
  can distinguish `empty`, `throttled`, `unavailable`, and `draining` outcomes
  without scraping prose error messages.
- Worker command-option capabilities, including retry policies, timeout fields, parent-close policy, and non-retryable failures, are also echoed in `server_capabilities` so workers can negotiate behavior without a separate cluster-info request.
- Universal payload codecs live under `capabilities.payload_codecs`; final v2 advertises `avro` there. When the server advertises engine-specific codecs that only a PHP worker can honor, those appear under `capabilities.payload_codecs_engine_specific.<engine>` — language-neutral SDKs should ignore that object unless they opt into that engine.

## Connecting Workers

Workers poll the server for tasks and execute workflow code or activities. See the [Worker Protocol](/docs/2.0/polyglot/worker-protocol) reference for the full API contract.
For the route role matrix, namespace lookup rules, and exact worker
registration payload, see
[Namespace, Auth, And Worker Registration](/docs/2.0/polyglot/namespace-auth-workers).

### PHP Workers

PHP workers use the `durable-workflow/workflow` package in standalone server mode:

```bash
composer require durable-workflow/workflow:^2.0@alpha
```

The `@alpha` flag is required while 2.0 is a pre-release on Packagist; drop it once 2.0.0 is tagged stable.

Configure the worker to connect to the server:

```php
// config/workflow.php
return [
    'mode' => 'server',
    'server' => [
        'url' => env('DURABLE_WORKFLOW_SERVER_URL', 'http://localhost:8080'),
        'token' => env('DURABLE_WORKFLOW_AUTH_TOKEN'),
        'namespace' => env('DURABLE_WORKFLOW_NAMESPACE', 'default'),
    ],
];
```

Run the worker:

```bash
php artisan workflow:work
```

### Python Workers

Python workers use the `durable-workflow` SDK:

```bash
pip install durable-workflow
```

See the [Python SDK](/docs/2.0/polyglot/python) guide for worker setup.

### Custom Language Workers

Any language can implement a worker by:
1. Registering with `POST /api/worker/register`
2. Long-polling for tasks with `POST /api/worker/workflow-tasks/poll`, `POST /api/worker/activity-tasks/poll`, or `POST /api/worker/query-tasks/poll`
3. Completing tasks with `POST /api/worker/workflow-tasks/{id}/complete`, `POST /api/worker/activity-tasks/{id}/complete`, or `POST /api/worker/query-tasks/{id}/complete`

All requests require:
- `Authorization: Bearer $TOKEN`
- `X-Namespace: your-namespace`
- `X-Durable-Workflow-Protocol-Version: 1.0`

The server validates that the namespace exists. Register it via
`POST /api/namespaces` before directing workers or clients at it, or the
server returns `404` with `reason: "namespace_not_found"`.

See the [server README](https://github.com/durable-workflow/server#getting-started-end-to-end-workflow) for a curl-based walkthrough.

See [Task Queue Admission](/docs/2.0/polyglot/task-queue-admission) to tune
worker registration slots, server-side active lease caps, per-minute dispatch
budgets, and query-task backpressure.

## CLI

The [Durable Workflow CLI](/docs/2.0/polyglot/cli) provides a shell interface to the server:

```bash
# Install — Linux and macOS
curl -fsSL https://durable-workflow.com/install.sh | sh

# Install — macOS (Homebrew alternative)
brew install durable-workflow/tap/dw

# Install — Windows (PowerShell)
# irm https://durable-workflow.com/install.ps1 | iex

# Configure
export DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080
export DURABLE_WORKFLOW_AUTH_TOKEN=your-token
export DURABLE_WORKFLOW_NAMESPACE=default

# Use
dw server:health
dw workflow:list
dw workflow:start --type=my-workflow --input='["value"]'
dw workflow:start --type=my-workflow --input-file=input.json
```

See the [CLI install page](/docs/2.0/polyglot/cli#install) for a platform-detecting installer and direct binary downloads.

Task queue commands include admission status for workflow tasks, activity
tasks, and query tasks. Use them to distinguish missing workers, saturated
worker slots, server-side active lease or dispatch-rate throttling, and
query-task overflow.

## Deployment

Use the [self-hosting deployment guide](/docs/2.0/deployment) to choose a
supported topology before deploying production traffic. It separates local
development, single-node production, small clustered deployments, raw
Kubernetes manifests, and support-led topologies.

The self-serve small-cluster contract is deliberately narrow: 2-3 stateless API
nodes behind a load balancer, one shared external MySQL or PostgreSQL database,
shared Redis, independently scaled workers, and exactly one scheduler or
maintenance runner. Choose stop-the-world upgrades or
[rolling upgrades](/docs/2.0/rolling-upgrades) per release; the rolling-upgrade
contract names the version-skew, schema, drain, readiness, and rollback
guarantees that must hold. SQLite clustering, Redis-less multi-node mode,
duplicate schedulers, active/active multi-region, Helm, and provider-specific
failover are outside that contract until separately validated. Active/passive
multi-region with operator-driven regional failover is its own self-serve
contract in the
[self-hosting guide](/docs/2.0/deployment#activepassive-multi-region); each
region still runs the validated single-region or small-cluster shape.

For self-hosted server deployments, start from published images rather than
source-tree builds:

- Docker Hub: `durableworkflow/server:0.2`
- GitHub Container Registry: `ghcr.io/durable-workflow/server:0.2`
- Published-image Compose:
  [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml)
- Raw Kubernetes manifests:
  [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s)

Production deployments should pin a version tag or image digest, use
role-scoped credentials, run bootstrap/migrations before serving traffic, and
prove readiness with `/api/ready`, `/api/cluster/info`, and worker
registration. Do not shift production traffic based on `/api/health` alone.

## API Reference

For a complete endpoint-by-endpoint reference, including required headers,
roles, worker-protocol routes, external payload storage routes, and named error
reasons, see the [Server API Reference](/docs/2.0/polyglot/server-api-reference).

The server exposes three API surfaces:

### Control Plane

Start, describe, signal, query, update, cancel, and terminate workflows; manage namespaces, task queues, schedules, search attributes, and workers. Every control-plane request requires `X-Durable-Workflow-Control-Plane-Version: 2`. Requests without it are rejected with `missing_control_plane_version`.

Key endpoints:
- `POST /api/workflows` — Start a workflow
- `GET /api/workflows/{id}` — Describe a workflow
- `POST /api/workflows/{id}/signal/{name}` — Send a signal
- `POST /api/workflows/{id}/query/{name}` — Execute a query
- `POST /api/workflows/{id}/update/{name}` — Execute an update
- `POST /api/workflows/{id}/cancel` — Request cancellation
- `POST /api/workflows/{id}/terminate` — Terminate immediately
- `GET /api/workflows/{id}/runs/{runId}/history` — List run history events
- `GET /api/workflows/{id}/runs/{runId}/history/export` — Export a replay bundle
- `GET /api/namespaces`, `POST /api/namespaces`, `GET|PUT /api/namespaces/{namespace}` — Namespace management
- `GET /api/workers`, `GET|DELETE /api/workers/{id}` — Worker fleet management
- `GET /api/task-queues`, `GET /api/task-queues/{taskQueue}` — Task queue backlog, pollers, leases, and admission visibility
- `GET|POST /api/schedules`, `GET|PUT|DELETE /api/schedules/{id}`, `POST /api/schedules/{id}/{pause|resume|trigger|backfill}` — Schedule management
- `GET|POST|DELETE /api/search-attributes` — Search attribute management
- `GET|POST|PUT|DELETE /api/service-endpoints...` — Admin-only service catalog endpoints, nested services, operation bindings, and durable service-call snapshots
- `POST /api/system/repair/pass`, `POST /api/system/activity-timeouts/pass`, `POST /api/system/retention/pass` — Operator passes

Workflow control-plane responses, including run-history listing responses,
include the nested `control_plane` contract metadata that identifies the
operation and response contract version. History export is intentionally not
wrapped in that envelope; it returns the replay bundle unchanged so the bundle
integrity checksum and optional signature cover the exact artifact received by
the client.

Validation failures return HTTP 422 with `reason: validation_failed` plus
`errors` and `validation_errors`. Workflow operation routes also project that
reason and validation detail into `control_plane.reason` and
`control_plane.validation_errors`. Current run-targeted command routes project
the URL `run_id` in the response and `control_plane.run_id`, so clients can
distinguish instance-level commands from explicit selected-run commands.

Task queue visibility is the operator surface for deciding whether a queue is
falling behind because durable backlog is growing, workers have no available
slots, or the server is enforcing admission limits. `GET /api/task-queues`
returns one summary entry per queue; `GET /api/task-queues/{taskQueue}`
expands one queue with `pollers` and `current_leases`. Both routes expose
`stats.approximate_backlog_count`, `stats.approximate_backlog_age_seconds`,
and the per-kind `stats.workflow_tasks.*` / `stats.activity_tasks.*` readiness
and lease counters. The detailed route also includes the `admission` object so
automation can separate worker-capacity pressure from server-side queue or
query-task throttling. Fleet-level durable inflow versus dispatch rates live on
the operator-metrics surfaces (`operator_metrics.backlog.tasks_added_last_minute`
and `operator_metrics.backlog.tasks_dispatched_last_minute`), not on the
per-queue task-queue routes.

### Worker Protocol

Workers register, poll for tasks, heartbeat, and complete tasks. Requires `X-Durable-Workflow-Protocol-Version: 1.0`.

Key endpoints:
- `POST /api/worker/register` — Register a worker
- `POST /api/worker/workflow-tasks/poll` — Long-poll for workflow tasks
- `POST /api/worker/workflow-tasks/{id}/complete` — Complete workflow task
- `POST /api/worker/query-tasks/poll` — Long-poll for server-routed workflow query tasks
- `POST /api/worker/query-tasks/{id}/complete` — Complete workflow query task
- `POST /api/worker/query-tasks/{id}/fail` — Fail or reject workflow query task
- `POST /api/worker/activity-tasks/poll` — Long-poll for activity tasks
- `POST /api/worker/activity-tasks/{id}/complete` — Complete activity task

See the [Worker Protocol](/docs/2.0/polyglot/worker-protocol) reference for details.

### Discovery (unversioned)

The only endpoints that do **not** require `X-Durable-Workflow-Control-Plane-Version` are discovery and health probes:

- `GET /api/health` — Liveness probe plus the public `topology` summary (no auth required)
- `GET /api/ready` — Readiness probe plus the same `topology` summary (no auth required)
- `GET /api/cluster/info` — Server capabilities, protocol versions, payload codecs. Clients should hit this first to discover which control-plane and worker-protocol versions the server supports.

## Troubleshooting

### Workers not receiving tasks

**Check:**
1. Workers registered? `curl http://localhost:8080/api/workers -H "Authorization: Bearer $TOKEN" -H "X-Durable-Workflow-Control-Plane-Version: 2" -H "X-Namespace: default"`
2. Workers polling correct task queue?
3. Workflow started with matching task queue?
4. Cache backend shared across server instances?

### Long-poll connections timing out immediately

**Check:**
1. Cache driver supports atomic locks? Test with `php artisan workflow:v2:doctor --strict`
2. Redis reachable from server?
3. Load balancer timeout set higher than long-poll timeout (default: 60s)?

### Database connection errors

**Check:**
1. Database host and port correct?
2. Credentials valid?
3. Database exists?
4. Migrations run? `php artisan migrate:status`

### Auth failures

**Check:**
1. `DW_AUTH_DRIVER` matches client auth method?
2. Token/HMAC secret matches between server and client?
3. Auth headers present? `Authorization: Bearer $TOKEN` or HMAC signature headers?

## Learn More

- [Worker Protocol Reference](/docs/2.0/polyglot/worker-protocol) — Full API contract for workers
- [Embedded to Server Migration](/docs/2.0/polyglot/embedded-to-server) — Adopt the server from a Laravel embedded v2 app
- [Python SDK](/docs/2.0/polyglot/python) — Build Python workers
- [CLI](/docs/2.0/polyglot/cli) — Command-line interface
- [Server Repository](https://github.com/durable-workflow/server) — Source code, issues, releases
