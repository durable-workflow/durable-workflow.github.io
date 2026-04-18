---
sidebar_position: 5
title: Embedded to Server Migration
description: Move a Laravel embedded v2 deployment to the standalone Durable Workflow server.
---

# Embedded to Server Migration

This guide is for teams already running Durable Workflow v2 inside a Laravel
application and moving new workflow traffic to the standalone server. If the
application is still on v1, start with [Migrating to 2.0](/docs/2.0/migration)
and keep existing v1 runs on the v1 engine until they finish.

The migration is an adoption path, not an in-place database move. The
standalone server owns new control-plane starts, durable history, schedules,
worker registrations, and task delivery over HTTP. Your application workers
continue to own workflow and activity code.

## Current Boundary

Supported today:

- Start new workflows through the server control-plane API or CLI.
- Register PHP, Python, or custom HTTP workers against the server.
- Poll and complete workflow and activity tasks through the worker protocol.
- Export closed-run history bundles from embedded v2 or server v2 for audit,
  debugging, and archival handoff.
- Observe server-managed workflows through the server API, CLI, and Waterline
  surfaces that read server state.

Not supported as an automatic operation today:

- Moving in-flight v1 or embedded v2 runs into the server.
- Importing old embedded history so it appears as live server-managed workflow
  state.
- Replaying v1 history with non-PHP workers.

Plan the cutover so old embedded runs drain where they started, while new runs
start on the server.

## Phase A: Prepare Embedded v2

Before deploying the server, make the embedded app use language-neutral
contracts. This reduces the amount of code that changes during cutover.

1. Define stable workflow and activity type keys.

   ```php
   // config/workflows.php
   'v2' => [
       'types' => [
           'workflows' => [
               'orders.process' => App\Workflows\ProcessOrderWorkflow::class,
           ],
           'activities' => [
               'orders.reserve-inventory' => App\Activities\ReserveInventory::class,
               'orders.capture-payment' => App\Activities\CapturePayment::class,
           ],
       ],
   ],
   ```

2. Use those keys at every external boundary.

   Server clients send `workflow_type: "orders.process"`, and workers register
   `supported_workflow_types` / `supported_activity_types` with those same
   strings. Do not expose PHP FQCNs as the durable public contract.

3. Use the language-neutral payload codec.

   ```php
   // config/workflows.php
   'serializer' => 'avro',
   ```

   Keep legacy PHP codecs only while finishing old PHP-only runs. New
   server-managed workflows should use `avro`.

4. Pick namespace and task queue names.

   Choose names you can keep stable across embedded, server, and cloud:

   ```bash
   export DURABLE_WORKFLOW_NAMESPACE=production
   export DURABLE_WORKFLOW_TASK_QUEUE=orders
   ```

5. Decide whether compatibility markers are needed.

   Single-fleet deployments can leave compatibility unset. Mixed fleets should
   set `WORKFLOW_V2_CURRENT_COMPATIBILITY` and
   `WORKFLOW_V2_SUPPORTED_COMPATIBILITIES` before cutover so workers do not
   claim runs from incompatible builds.

## Phase B: Deploy the Server Beside Embedded

Run the server as a new runtime target while the Laravel app continues handling
existing embedded runs.

```bash
git clone https://github.com/durable-workflow/server.git
cd server
cp .env.example .env
docker compose up -d
```

For local development you may set `WORKFLOW_SERVER_AUTH_DRIVER=none`. For
shared environments, use role-scoped credentials:

```bash
WORKFLOW_SERVER_AUTH_DRIVER=token
WORKFLOW_SERVER_WORKER_TOKEN=worker-secret
WORKFLOW_SERVER_OPERATOR_TOKEN=operator-secret
WORKFLOW_SERVER_ADMIN_TOKEN=admin-secret
```

Verify discovery and create the namespace:

```bash
export SERVER=http://localhost:8080
export ADMIN_TOKEN=admin-secret
export OPERATOR_TOKEN=operator-secret

curl "$SERVER/api/health"

curl "$SERVER/api/cluster/info" \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

curl -X POST "$SERVER/api/namespaces" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"name":"production","description":"Production workflows","retention_days":30}'
```

The server rejects control-plane requests without
`X-Durable-Workflow-Control-Plane-Version: 2`; workers use the separate
`X-Durable-Workflow-Protocol-Version: 1.0` header.

## Phase C: Connect Workers

Workers must register before polling. The registration advertises runtime,
task queue, and the type keys the worker can execute.

```bash
export WORKER_TOKEN=worker-secret

curl -X POST "$SERVER/api/worker/register" \
  -H "Authorization: Bearer $WORKER_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "orders-php-1",
    "task_queue": "orders",
    "runtime": "php",
    "sdk_version": "2.0.0-alpha",
    "supported_workflow_types": ["orders.process"],
    "supported_activity_types": [
      "orders.reserve-inventory",
      "orders.capture-payment"
    ],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

Then run workers in server mode for the same namespace and task queue. Python
workers follow the same registration and poll contract through the Python SDK.
Custom workers can use the [Worker Protocol](/docs/2.0/polyglot/worker-protocol)
directly.

Check visibility before cutover:

```bash
curl "$SERVER/api/workers" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"

curl "$SERVER/api/task-queues/orders" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

## Phase D: Route New Starts to the Server

Cut over one workflow family at a time. Keep the embedded app and queue workers
running for old runs until they drain.

Start a shadow workflow first:

```bash
curl -X POST "$SERVER/api/workflows" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "orders-shadow-1001",
    "workflow_type": "orders.process",
    "task_queue": "orders",
    "input": [{"order_id":"1001","mode":"shadow"}]
  }'
```

Watch the run:

```bash
curl "$SERVER/api/workflows/orders-shadow-1001" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

After the shadow path works, move the production caller from
`WorkflowStub::start()` to the server client, CLI, or direct HTTP API. Leave
signals, queries, updates, cancel, and terminate routed to the same runtime that
started the workflow. A workflow started embedded should receive embedded
commands; a workflow started on the server should receive server control-plane
commands.

## Phase E: Preserve Old History

Use history export for evidence and debugging. It is not a server import path.

For embedded v2 runs:

```bash
php artisan workflow:v2:history-export order-123 \
  --output=storage/workflow-history/order-123.json \
  --pretty
```

For server-managed runs:

```bash
curl "$SERVER/api/workflows/order-123/runs/$RUN_ID/history/export" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  > order-123-history.json
```

Archive terminal server runs after export when you want to keep them out of
retention pruning:

```bash
curl -X POST "$SERVER/api/workflows/order-123/archive" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"reason":"history exported to archive storage"}'
```

## Phase F: Add Polyglot Workers

Once a workflow family runs through the server, add Python or custom workers by
registering the same namespace, task queue, and type keys. Keep payloads in
`avro` and keep activity inputs and outputs language-neutral: arrays, objects,
strings, numbers, booleans, and nulls.

For Python, use [the Python SDK guide](/docs/2.0/polyglot/python). For direct
HTTP implementations, use [the worker protocol reference](/docs/2.0/polyglot/worker-protocol).

## Cutover Checklist

- [ ] v1 runs are drained or intentionally left on the v1 engine.
- [ ] Embedded v2 uses stable type keys, not PHP FQCNs, at external boundaries.
- [ ] New v2 workflows use the `avro` codec.
- [ ] Server `/api/health` and `/api/cluster/info` pass from the deployment
  network.
- [ ] Target namespace exists on the server.
- [ ] Workers register with the expected task queue and supported type keys.
- [ ] A shadow workflow starts, is claimed by a worker, and reaches the expected
  state.
- [ ] Operators can list workflows, inspect task queues, and view worker
  registrations.
- [ ] Old embedded starters are paused or moved so duplicate business keys do
  not start in both runtimes.
- [ ] Closed old runs that must be retained are exported to durable storage.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `missing_control_plane_version` | Client called a control-plane route without the v2 header | Send `X-Durable-Workflow-Control-Plane-Version: 2` |
| `missing_protocol_version` | Worker called a worker route without the worker protocol header | Send `X-Durable-Workflow-Protocol-Version: 1.0` |
| `namespace_not_found` | The namespace has not been created on the server | Create it with `POST /api/namespaces` |
| Worker polls return no task | Task queue, type key, namespace, or compatibility marker does not match | Compare workflow start payload, worker registration, and task queue visibility |
| Payload cannot be decoded by a non-PHP worker | A legacy PHP serializer was used for new v2 work | Move new starts to `avro`; drain legacy-codec runs on PHP |
| Old workflow does not respond to server signal/query/update | The run was started in embedded mode | Send commands through the embedded app until that run finishes |

## Related Guides

- [Server setup](/docs/2.0/polyglot/server)
- [Worker protocol](/docs/2.0/polyglot/worker-protocol)
- [Python SDK](/docs/2.0/polyglot/python)
- [Migrating to 2.0](/docs/2.0/migration)
