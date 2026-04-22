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

Use the standalone server when you need:
- **Polyglot workflows** — Python workers executing PHP-authored workflows, or vice versa
- **Microservice orchestration** — orchestrate services written in different languages
- **Centralized workflow runtime** — multiple applications sharing one workflow engine
- **Non-Laravel environments** — use Durable Workflow outside Laravel

If you already run v2 embedded in a Laravel app, use the
[embedded-to-server migration guide](/docs/2.0/polyglot/embedded-to-server) to
prepare type keys, deploy the server beside embedded execution, connect workers,
and route only new workflow starts to the server.

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
```

This starts:
- **server** — the API and worker services
- **mysql** — the workflow state database
- **redis** — cache and queue backend
- **bootstrap** — one-shot service that runs migrations and seeds the default namespace

### Ports

| Service | Port | Purpose |
|---------|------|---------|
| Server API | 8080 | Control-plane and worker-protocol endpoints |
| MySQL | 3306 | Database (exposed for development convenience) |
| Redis | 6379 | Cache and queue (exposed for development convenience) |

## Configuration

The server uses environment variables for configuration. Key settings:

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
Operator tokens can start, list, signal, query, update, cancel, terminate, and
observe workflows. Admin tokens can use administrative endpoints such as
namespace and retention management.

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
  "timestamp": "2026-04-15T12:00:00Z"
}
```

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

For carrier-neutral external handlers, the same endpoint publishes
`worker_protocol.external_execution_surface_contract`. That manifest names the
[activity-grade external execution surface](/docs/2.0/polyglot/external-execution),
links the external task input/result envelope contracts, and keeps workflow
replay, `ContinueAsNew`, signal/update/query ordering, and event-history
interpretation inside real runtimes.

Key field notes for client code:

- The app version is `version`, not `server_version`.
- Workflow-task command capabilities live under `worker_protocol.server_capabilities.supported_workflow_task_commands`, not at the top of `worker_protocol`. The same nested object is echoed on every worker-plane response via the `server_capabilities` field.
- Worker command-option capabilities, including retry policies, timeout fields, parent-close policy, and non-retryable failures, are also echoed in `server_capabilities` so workers can negotiate behavior without a separate cluster-info request.
- Universal payload codecs live under `capabilities.payload_codecs`; final v2 advertises `avro` there. When the server advertises engine-specific codecs that only a PHP worker can honor, those appear under `capabilities.payload_codecs_engine_specific.<engine>` — language-neutral SDKs should ignore that object unless they opt into that engine.

## Connecting Workers

Workers poll the server for tasks and execute workflow code or activities. See the [Worker Protocol](/docs/2.0/polyglot/worker-protocol) reference for the full API contract.

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
shared Redis, independently scaled workers, exactly one scheduler or
maintenance runner, and stop-the-world upgrades. SQLite clustering,
Redis-less multi-node mode, duplicate schedulers, rolling upgrades,
multi-region, Helm, and provider-specific failover are outside that contract
until separately validated.

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
- `GET|POST /api/schedules`, `GET|PUT|DELETE /api/schedules/{id}`, `POST /api/schedules/{id}/{pause|resume|trigger|backfill}` — Schedule management
- `GET|POST|DELETE /api/search-attributes` — Search attribute management
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

- `GET /api/health` — Liveness/readiness probe (no auth required)
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
