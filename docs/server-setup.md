---
sidebar_position: 15
title: Server
description: Deploy and configure the Durable Workflow standalone server.
---

# Server

The Durable Workflow server is a standalone, language-neutral workflow orchestration service. It exposes the same durable execution engine as the PHP package over HTTP, letting you write workflows in Python, PHP, or any language that speaks HTTP.

Use the standalone server when you need:
- **Polyglot workflows** — Python workers executing PHP-authored workflows, or vice versa
- **Microservice orchestration** — orchestrate services written in different languages
- **Centralized workflow runtime** — multiple applications sharing one workflow engine
- **Non-Laravel environments** — use Durable Workflow outside Laravel

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
CACHE_DRIVER=redis
QUEUE_CONNECTION=redis

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=null
REDIS_DB=0
```

Cache must support [atomic locks](https://laravel.com/docs/12.x/cache#atomic-locks). Queue drivers: Redis, Amazon SQS, Beanstalkd, database.

### Authentication

The server supports two auth drivers:

**Token-based** (default):

```bash
WORKFLOW_SERVER_AUTH_DRIVER=token
WORKFLOW_SERVER_AUTH_TOKEN=your-secret-token-here
```

All requests must send `Authorization: Bearer your-secret-token-here`.

**HMAC signature**:

```bash
WORKFLOW_SERVER_AUTH_DRIVER=hmac
WORKFLOW_SERVER_HMAC_KEY_ID=client-1
WORKFLOW_SERVER_HMAC_SECRET=your-hmac-secret
```

Requests must include `X-HMAC-Signature`, `X-HMAC-Timestamp`, and `X-HMAC-Key-ID` headers.

**No auth** (development only):

```bash
WORKFLOW_SERVER_AUTH_DRIVER=none
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
WORKFLOW_DEFAULT_RETENTION_DAYS=30
```

After retention expires, workflows are pruned. Configure per-namespace retention via the API.

### Namespaces

The bootstrap seeds a `default` namespace. To disable:

```bash
WORKFLOW_BOOTSTRAP_DEFAULT_NAMESPACE=false
```

Create namespaces via the API:

```bash
curl -X POST http://localhost:8080/api/namespaces \
  -H "Authorization: Bearer $TOKEN" \
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

Returns server version, protocol versions, and supported features:

```json
{
  "server_version": "0.1.9",
  "control_plane": {
    "version": 2,
    "request_contract": { ... },
    "response_contract": { ... }
  },
  "worker_protocol": {
    "version": "1.0",
    "supported_workflow_task_commands": [
      "complete_workflow",
      "fail_workflow",
      "continue_as_new",
      "schedule_activity",
      "start_timer",
      "start_child_workflow"
    ]
  }
}
```

## Connecting Workers

Workers poll the server for tasks and execute workflow code or activities. See the [Worker Protocol](/docs/2.0/configuration/worker-protocol) reference for the full API contract.

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

See the [Python SDK](/docs/2.0/sdks/python) guide for worker setup.

### Custom Language Workers

Any language can implement a worker by:
1. Registering with `POST /api/worker/register`
2. Long-polling for tasks with `POST /api/worker/workflow-tasks/poll` or `POST /api/worker/activity-tasks/poll`
3. Completing tasks with `POST /api/worker/workflow-tasks/{id}/complete` or `POST /api/worker/activity-tasks/{id}/complete`

All requests require:
- `Authorization: Bearer $TOKEN`
- `X-Namespace: your-namespace`
- `X-Durable-Workflow-Protocol-Version: 1.0`

See the [server README](https://github.com/durable-workflow/server#getting-started-end-to-end-workflow) for a curl-based walkthrough.

## CLI

The [Durable Workflow CLI](/docs/2.0/cli) provides a shell interface to the server:

```bash
# Install
brew install durable-workflow/tap/dw

# Configure
export DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080
export DURABLE_WORKFLOW_AUTH_TOKEN=your-token
export DURABLE_WORKFLOW_NAMESPACE=default

# Use
dw server:health
dw workflow:list
dw workflow:start --type=my-workflow --input='{"key":"value"}'
```

## Deployment

### Docker

Build and run a production image:

```bash
docker build -t my-workflow-server .
docker run -d \
  -p 8080:8080 \
  -e DB_CONNECTION=mysql \
  -e DB_HOST=your-db-host \
  -e WORKFLOW_SERVER_AUTH_TOKEN=your-secret \
  my-workflow-server
```

Run migrations before starting the API:

```bash
docker run --rm \
  -e DB_CONNECTION=mysql \
  -e DB_HOST=your-db-host \
  my-workflow-server \
  php artisan migrate --force
```

### Kubernetes

The server is stateless and horizontally scalable. Key considerations:

- **Shared cache** — Use Redis or another networked cache for multi-node deployments. Long-poll wake-ups use cache-backed signals, so a shared cache ensures prompt task delivery.
- **Shared queue** — Use Redis, SQS, or another networked queue backend. Do not use the `sync` driver.
- **Database** — MySQL 8.0+, PostgreSQL 13+, or compatible. Run migrations as a Kubernetes Job before starting the API.
- **Liveness probe** — `GET /api/health`
- **Readiness probe** — `GET /api/health`

Example deployment manifest:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: workflow-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: workflow-server
  template:
    metadata:
      labels:
        app: workflow-server
    spec:
      containers:
      - name: server
        image: my-workflow-server:latest
        ports:
        - containerPort: 8080
        env:
        - name: DB_CONNECTION
          value: mysql
        - name: DB_HOST
          value: mysql-service
        - name: CACHE_DRIVER
          value: redis
        - name: REDIS_HOST
          value: redis-service
        - name: WORKFLOW_SERVER_AUTH_TOKEN
          valueFrom:
            secretKeyRef:
              name: workflow-secrets
              key: auth-token
        livenessProbe:
          httpGet:
            path: /api/health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
```

## API Reference

The server exposes three API surfaces:

### Control Plane

Start, describe, signal, query, update, cancel, and terminate workflows. Requires `X-Durable-Workflow-Control-Plane-Version: 2`.

Key endpoints:
- `POST /api/workflows` — Start a workflow
- `GET /api/workflows/{id}` — Describe a workflow
- `POST /api/workflows/{id}/signal/{name}` — Send a signal
- `POST /api/workflows/{id}/query/{name}` — Execute a query
- `POST /api/workflows/{id}/update/{name}` — Execute an update
- `POST /api/workflows/{id}/cancel` — Request cancellation
- `POST /api/workflows/{id}/terminate` — Terminate immediately

### Worker Protocol

Workers register, poll for tasks, heartbeat, and complete tasks. Requires `X-Durable-Workflow-Protocol-Version: 1.0`.

Key endpoints:
- `POST /api/worker/register` — Register a worker
- `POST /api/worker/workflow-tasks/poll` — Long-poll for workflow tasks
- `POST /api/worker/workflow-tasks/{id}/complete` — Complete workflow task
- `POST /api/worker/activity-tasks/poll` — Long-poll for activity tasks
- `POST /api/worker/activity-tasks/{id}/complete` — Complete activity task

See the [Worker Protocol](/docs/2.0/configuration/worker-protocol) reference for details.

### System

Health, repair, retention, and namespace management.

Key endpoints:
- `GET /api/health` — Health check
- `GET /api/cluster/info` — Server capabilities
- `GET /api/namespaces` — List namespaces
- `POST /api/namespaces` — Create namespace
- `POST /api/system/repair/pass` — Run task repair sweep
- `POST /api/system/activity-timeouts/pass` — Enforce activity timeouts

## Troubleshooting

### Workers not receiving tasks

**Check:**
1. Workers registered? `curl http://localhost:8080/api/workers -H "Authorization: Bearer $TOKEN" -H "X-Namespace: default"`
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
1. `WORKFLOW_SERVER_AUTH_DRIVER` matches client auth method?
2. Token/HMAC secret matches between server and client?
3. Auth headers present? `Authorization: Bearer $TOKEN` or HMAC signature headers?

## Learn More

- [Worker Protocol Reference](/docs/2.0/configuration/worker-protocol) — Full API contract for workers
- [Python SDK](/docs/2.0/sdks/python) — Build Python workers
- [CLI](/docs/2.0/cli) — Command-line interface
- [Server Repository](https://github.com/durable-workflow/server) — Source code, issues, releases
