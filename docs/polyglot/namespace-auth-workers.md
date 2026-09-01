---
sidebar_position: 4
title: Namespace, Auth, And Worker Registration
description: Reference for server namespace resolution, role-scoped authentication, and worker registration contracts.
tags:
  - server
  - namespaces
  - authentication
  - worker-protocol
keywords:
  - Durable Workflow namespace auth
  - role scoped server tokens
  - worker registration contract
  - X-Namespace
---

# Namespace, Auth, And Worker Registration

Use this reference when provisioning a standalone server, issuing automation
credentials, or implementing a worker runtime. The server has three separate
contracts that must line up before work can flow:

- the request names a namespace through `X-Namespace`, `?namespace=`, or the
  server default namespace
- the credential has the role required by the route family
- workers register the same namespace, task queue, runtime, type keys, and
  capacity that workflow starts and task polls use

## Request Authority

Durable Workflow treats namespace, auth role, and protocol version as request
authority. Do not infer them from workflow ids, task ids, or display labels.

| Request family | Required credential role | Required version header | Namespace source |
| --- | --- | --- | --- |
| Discovery `GET /api/cluster/info` | `worker`, `operator`, or `admin` | none | optional `X-Namespace` for context |
| Namespace list/describe | `operator` or `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | route target or request context |
| Namespace create/update/storage policy | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | route target or request body |
| Workflow, schedule, task queue, bridge adapter, worker visibility | `operator` or `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | `X-Namespace`, `?namespace=`, then default |
| System health, metrics, passes, and storage tests | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | `X-Namespace`, `?namespace=`, then default |
| Worker registration, polling, heartbeats, completion | `worker` | `X-Durable-Workflow-Protocol-Version: 1.0` | `X-Namespace`, `?namespace=`, then default |

The server checks the route role before namespace existence on role-gated
endpoints. A wrong-role token receives an auth failure instead of a namespace
existence signal. After the role and version checks pass, namespace-scoped
routes reject unknown namespaces with `reason: "namespace_not_found"`.

## Auth Roles

Token auth is the default production path:

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

If a deployment uses one shared `DW_AUTH_TOKEN`, that token effectively has all
route permissions. Prefer role-scoped tokens for production so a worker process
cannot mutate namespaces or run system maintenance passes.

The same role split exists for signature auth:

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

`DW_AUTH_DRIVER=none` is for local development only. It removes the auth
boundary from every route and should never be exposed outside a trusted local
network.

## Namespace Contract

The bootstrap process seeds the default namespace. Set
`DW_DEFAULT_NAMESPACE` when omitted namespace headers should resolve somewhere
other than `default`:

```bash
DW_DEFAULT_NAMESPACE=default
```

Create every tenant or environment namespace before directing clients or
workers at it:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "orders-prod",
    "description": "production order workflows",
    "retention_days": 90
  }'
```

Namespace names are normalized to lowercase and may contain letters, numbers,
dot, underscore, and dash. They are unique after normalization. For example,
creating `Production` and then `production` is a conflict with
`reason: "namespace_already_exists"`.

A normal workflow start names the namespace with `X-Namespace`:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"]
  }'
```

Control-plane reads, workflow commands, schedule operations, search-attribute
operations, task-queue visibility, and worker visibility use that same
namespace context. Namespace administration routes themselves are the
exception: they target the namespace in the route or request body and do not
require that namespace to already exist before create or describe can run.

## Worker Registration Contract

Every worker process must register before polling. Registration is namespaced,
so the tuple `(namespace, worker_id)` identifies the worker record. The
registered `task_queue` must match future poll requests for that worker id.

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/register" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "runtime": "python",
    "sdk_version": "<installed-sdk-version>",
    "build_id": "orders-worker-2026-04-22",
    "supported_workflow_types": ["orders.fulfillment"],
    "workflow_definition_fingerprints": {
      "orders.fulfillment": "sha256:definition-fingerprint"
    },
    "supported_activity_types": ["payments.capture"],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

| Field | Required | Contract |
| --- | --- | --- |
| `worker_id` | no | Stable process identity. The server generates one when omitted, but long-running runtimes should set it for logs and task queue diagnostics. |
| `task_queue` | yes | Queue this worker polls. Poll requests for a different queue fail with `reason: "task_queue_mismatch"`. |
| `runtime` | yes | One of `php`, `python`, `typescript`, `go`, or `java`. |
| `sdk_version` | no | Runtime SDK version shown in worker visibility and diagnostics. |
| `build_id` | no | Deploy/build identity used by task queue build-id visibility and rollout cohorts. It should stay stable for one replay-compatible worker family. |
| `supported_workflow_types` | no | Workflow type keys this worker can replay. Empty means no workflow-type filter. |
| `workflow_definition_fingerprints` | no | Per-workflow deterministic definition fingerprints. Active re-registration with a changed fingerprint is rejected. |
| `supported_activity_types` | no | Activity type keys this worker can execute. Empty means no activity-type filter. |
| `max_concurrent_workflow_tasks` | no | Advertised local workflow-task slots. Defaults to `100`; minimum `1`. |
| `max_concurrent_activity_tasks` | no | Advertised local activity-task slots. Defaults to `100`; minimum `1`. |

Active re-registration with the same worker id is allowed when the advertised
definition fingerprints are unchanged. If a running worker changes workflow
code for an already advertised type, it must restart with a new `worker_id`;
otherwise registration fails with `reason: "workflow_definition_changed"`.

`build_id` is not just decorative metadata. It is the operator-facing cohort
identity used by task-queue rollout APIs. Keep one `build_id` for workers that
can safely replay the same in-flight work, and change it when a rollout creates
a new compatibility family. See
[Worker Compatibility and Routing](/docs/polyglot/worker-compatibility-routing)
for the pinning and rollback contract, and
[Worker Build-Id Rollout](/docs/polyglot/worker-build-id-rollout) for the
drain/resume workflow.

## Polling And Visibility

Worker poll requests must use the same namespace, worker id, and task queue
that registration used:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/workflow-tasks/poll" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "timeout_seconds": 30
  }'
```

Operators can inspect the same registration state through control-plane
visibility:

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" | jq '.pollers, .admission'
```

Task queue visibility is the first place to check when workers receive no
tasks. It distinguishes missing workers from queue mismatches, unsupported
workflow/activity type filters, saturated worker slots, server active-lease
caps, dispatch-rate caps, and query-task backpressure.

Poll responses themselves expose the same machine-readable outcome through
`poll_status` when the server advertises
`worker_protocol.server_capabilities.poll_status = true` in
`GET /api/cluster/info`. Workflow-task, activity-task, and query-task poll
routes keep that field even when `task` is `null`, so worker runtimes can
branch on one stable surface:

- `leased`: a task was leased successfully.
- `empty`: no task was ready before the poll returned.
- `throttled`: queue admission limits withheld a new task for this poll.
- `unavailable`: the server could not safely coordinate the queue and returned
  a typed unavailable outcome instead of pretending the queue was empty.
- `draining`: the worker's build-id cohort is draining, so the poll fails with
  HTTP `409` and `reason: "worker_draining"` until the cohort resumes.

## Error Surface

Automation should branch on named reasons rather than prose messages.

| Reason | Where | Meaning | Operator action |
| --- | --- | --- | --- |
| `missing_control_plane_version` | control-plane route | The request omitted `X-Durable-Workflow-Control-Plane-Version: 2`. | Add the version header or upgrade the client profile. |
| `missing_protocol_version` | worker route | The request omitted `X-Durable-Workflow-Protocol-Version: 1.0`. | Fix the worker client or SDK version negotiation. |
| `namespace_not_found` | namespace-scoped route | The namespace from `X-Namespace`, query string, or server default does not exist. | Create the namespace or correct the client namespace. |
| `namespace_already_exists` | `POST /api/namespaces` | A normalized namespace name already exists. | Reuse it or choose a distinct name. |
| `task_queue_mismatch` | worker poll route | A worker id registered for one queue attempted to poll another. | Restart with a new worker id or poll the registered queue. |
| `worker_draining` | worker poll route | The worker's build-id cohort is marked draining, so it may finish in-flight work but cannot claim new tasks. | Resume the cohort for rollback, or stop the worker after its current leases drain. |
| `workflow_definition_changed` | `POST /api/worker/register` | Active worker id tried to advertise changed workflow fingerprints. | Restart the changed process with a new worker id. |
| `validation_failed` | any JSON route | A field is missing, malformed, too large, or outside allowed bounds. | Read `errors` or `validation_errors` and correct the payload. |

## See Also

- [Server API Reference](/docs/polyglot/server-api-reference)
- [Worker Protocol](/docs/polyglot/worker-protocol)
- [Task Queue Admission](/docs/polyglot/task-queue-admission)
- [CLI Command Reference](/docs/polyglot/cli-reference)
