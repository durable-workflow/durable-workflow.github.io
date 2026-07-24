---
sidebar_position: 2
title: Deployment Modes
description: Choose embedded Laravel mode or the standalone server without changing the Durable Workflow v2 contract.
tags:
  - deployment
  - server
  - laravel
  - polyglot
keywords:
  - Durable Workflow deployment modes
  - embedded mode
  - service mode
  - standalone server
  - embedded vs server
---

# Deployment Modes

Durable Workflow v2 ships one durable engine in two packaging shapes:

- **Embedded mode** inside a Laravel application that installs the
  `durable-workflow/workflow` package directly.
- **Service mode** through the standalone
  [Durable Workflow server](/docs/2.0/polyglot/server), with framework-neutral
  PHP applications and remote workers installing `durable-workflow/sdk`.

Durable Workflow Cloud is a separate managed-service choice, not a third
packaging shape for a customer Server. In Cloud, Durable Workflow operates the
orchestration runtime and persistence while customers run SDK clients and
workers. A self-hosted Server is not attached to Cloud; see
[Cloud Managed Runtime](/docs/2.0/polyglot/cloud-control-plane).

Use this page when deciding which shape should own a workflow fleet, planning a
cutover between them, or documenting which parts of the product contract must
stay identical across both.

## Same Durable Engine, Different Boundary

Embedded mode and service mode keep one v2 kernel. What changes is the hosting,
auth, and transport boundary around it.
Service mode keeps the same kernel behind HTTP+JSON control-plane and worker
surfaces; there is no mandatory gRPC and no second engine.

| Surface | Embedded mode | Service mode | Stable in both modes |
| --- | --- | --- | --- |
| Durable workflow model | A Laravel app hosts the package directly and writes workflow state inside the app runtime. | The standalone server hosts the same package and writes workflow state behind its HTTP control plane. | Workflow ids, run ids, typed history, command outcomes, retries, repair semantics, and history export remain the same v2 contract. |
| Control plane | Starts and commands come from app code, `WorkflowStub`, or app-local operator tooling. | Starts and commands go through the server API, CLI, or SDKs over HTTP+JSON with explicit auth and protocol headers. Framework-neutral PHP callers use `DurableWorkflow\Client` from `durable-workflow/sdk`. | Duplicate-start policy, run targeting, command ids, and named outcomes stay the same. Route follow-up commands to the runtime that accepted the start. |
| Worker transport | Laravel queue workers execute workflow and activity tasks inside the app deployment. | Workers register, long-poll, heartbeat, and complete work over the HTTP+JSON worker protocol. PHP remote workers use `DurableWorkflow\Worker` from `durable-workflow/sdk`. | Task leases, compatibility markers, replay semantics, and at-least-once activity execution stay the same. |
| Task dispatch default | Tasks are normally dispatched to the Laravel queue in-process with the application. | The server defaults to `task_dispatch_mode = poll` so external workers discover work over HTTP unless you explicitly override it. | The ready/leased/repair lifecycle and durable task model stay the same. |
| Workflow and activity type keys | PHP aliases can resolve to local classes inside the app. | Workers advertise supported type keys during registration. | Public type keys should stay stable and language-neutral. Do not make PHP FQCNs or mirrored PHP placeholder types the public contract. |
| Operator surface | The embedded Waterline package or app-local tooling reads the Laravel app's durable state in process. | The server API, CLI, and SDKs read server-owned durable state directly; the published Waterline service can project the same namespace through the PHP SDK. | Visibility facts such as search attributes, memos, run status, queue diagnostics, and history export are durable facts within the runtime that owns the run. Waterline does not combine runtimes or namespaces. |
| Auth and tenancy boundary | App auth is whatever the Laravel host exposes around its own routes and sessions. | Namespace selection and server auth tokens or signatures are mandatory API boundaries. | Namespace names, task queues, compatibility markers, and payload-codec choices should stay stable across a cutover. |
| Runtime discovery | The app can resolve services in-process or through app-local configuration. | Workers and clients must target an explicit remote base URL. | Do not couple either mode to shared `APP_URL`, `APP_KEY`, localhost assumptions, or same-container discovery. |
| Migration boundary | Existing embedded runs keep executing where they started. | New server-managed runs start on the server and stay there. | There is no automatic live migration of in-flight runs between modes. Export is for audit/debugging, not for importing live state. |

## Choose Embedded Mode When

- Your Laravel application owns workflow authoring, worker execution, and
  operator access in one deployment.
- The app's existing queue and auth model is the right boundary for workflow
  operations.
- You want the smallest self-contained runtime and do not need a
  language-neutral worker protocol.
- Your operators can use Waterline or host-app tooling as the primary workflow
  surface.

Start with [Installation](/docs/2.0/installation) and the configuration pages
under [Run And Operate](/docs/2.0/category/run-and-operate).

## Choose Service Mode When

- Multiple applications or teams should share one workflow runtime.
- Workers, control-plane callers, or operators are not all Laravel/PHP.
- You need an explicit remote auth and namespace boundary between clients and
  the workflow engine.
- You want to scale API ingress, matching/dispatch, and workers independently
  within the supported
  [server role topology](/docs/2.0/polyglot/server-role-topology).
- You want the Waterline UI as a separately deployed observer over a
  server-owned namespace.

Start with [Server](/docs/2.0/polyglot/server),
[PHP SDK](/docs/2.0/polyglot/php),
[Self-Hosting Deployments](/docs/2.0/deployment), and the
[Server API Reference](/docs/2.0/polyglot/server-api-reference). Use
[Monitoring](/docs/2.0/monitoring#waterline-service) when deploying the
Waterline service.

## Migration Tooling Between Modes

The supported path from embedded mode to service mode is staged adoption, not a
live handoff of in-flight state:

- Use [Embedded to Server Migration](/docs/2.0/polyglot/embedded-to-server) for
  the step-by-step cutover.
- Use `GET /api/cluster/info` to confirm the target server build, topology, and
  capability contract before switching traffic.
- Use `POST /api/worker/register` plus the worker protocol to prove external
  workers can serve the stable type keys you chose.
- Use `GET /api/system/operator-metrics`, `dw worker:list`, or Waterline
  operator views to verify worker registration and compatible fleet coverage
  before shifting production traffic.
- Use [CLI and Python Parity](/docs/2.0/polyglot/cli-python-parity) when
  replacing app-local control-plane calls with server-backed automation.
- Use the Waterline deployment attached to the owning runtime or the
  server-native history export for audit/debugging evidence; do not treat
  export bundles as an import path for live server-managed runs.

Three migration rules are non-negotiable:

1. Existing runs stay on the runtime where they started.
2. New server-managed runs use stable type keys, namespace names, task queues,
   and payload codecs from the first cutover.
3. Signals, queries, updates, repair, cancel, terminate, and archive must go to the
   runtime that owns the target run.

## Related References

- [Installation](/docs/2.0/installation)
- [Server](/docs/2.0/polyglot/server)
- [PHP SDK](/docs/2.0/polyglot/php)
- [Cloud Managed Runtime](/docs/2.0/polyglot/cloud-control-plane)
- [Embedded to Server Migration](/docs/2.0/polyglot/embedded-to-server)
- [Server Role Topology](/docs/2.0/polyglot/server-role-topology)
- [Server Config Reference](/docs/2.0/polyglot/server-config-reference)
