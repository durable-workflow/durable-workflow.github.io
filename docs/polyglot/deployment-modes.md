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
  [Durable Workflow server](/docs/polyglot/server).

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
| Control plane | Starts and commands come from app code, `WorkflowStub`, or app-local operator tooling. | Starts and commands go through the server API, CLI, or SDKs over HTTP+JSON with explicit auth and protocol headers. | Duplicate-start policy, run targeting, command ids, and named outcomes stay the same. Route follow-up commands to the runtime that accepted the start. |
| Worker transport | Laravel queue workers execute workflow and activity tasks inside the app deployment. | Workers register, long-poll, heartbeat, and complete work over the HTTP+JSON worker protocol. | Task leases, compatibility markers, replay semantics, and at-least-once activity execution stay the same. |
| Task dispatch default | Tasks are normally dispatched to the Laravel queue in-process with the application. | The server defaults to `task_dispatch_mode = poll` so external workers discover work over HTTP unless you explicitly override it. | The ready/leased/repair lifecycle and durable task model stay the same. |
| Workflow and activity type keys | PHP aliases can resolve to local classes inside the app. | Workers advertise supported type keys during registration. | Public type keys should stay stable and language-neutral. Do not make PHP FQCNs or mirrored PHP placeholder types the public contract. |
| Operator surface | Waterline or app-local tooling reads the embedded app's durable state. | The server API, CLI, and SDKs read the server-owned durable state. | Visibility facts such as search attributes, memos, run status, queue diagnostics, and history export are durable facts within the runtime that owns the run. |
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

Start with [Installation](/docs/installation) and the configuration pages
under [Run And Operate](/docs/category/run-and-operate).

## Choose Service Mode When

- Multiple applications or teams should share one workflow runtime.
- Workers, control-plane callers, or operators are not all Laravel/PHP.
- You need an explicit remote auth and namespace boundary between clients and
  the workflow engine.
- You want to scale API ingress, matching/dispatch, and workers independently
  within the supported
  [server role topology](/docs/polyglot/server-role-topology).

Start with [Server](/docs/polyglot/server),
[Self-Hosting Deployments](/docs/deployment), and the
[Server API Reference](/docs/polyglot/server-api-reference).

## Migration Tooling Between Modes

The supported path from embedded mode to service mode is staged adoption, not a
live handoff of in-flight state:

- Use [Embedded to Server Migration](/docs/polyglot/embedded-to-server) for
  the step-by-step cutover.
- Use `GET /api/cluster/info` to confirm the target server build, topology, and
  capability contract before switching traffic.
- Use `POST /api/worker/register` plus the worker protocol to prove external
  workers can serve the stable type keys you chose.
- Use `GET /api/system/operator-metrics`, `dw worker:list`, or Waterline
  operator views to verify worker registration and compatible fleet coverage
  before shifting production traffic.
- Use [CLI and Python Parity](/docs/polyglot/cli-python-parity) when
  replacing app-local control-plane calls with server-backed automation.
- Use Waterline or server-side history export for audit/debugging evidence; do
  not treat export bundles as an import path for live server-managed runs.

Three migration rules are non-negotiable:

1. Existing runs stay on the runtime where they started.
2. New server-managed runs use stable type keys, namespace names, task queues,
   and payload codecs from the first cutover.
3. Signals, queries, updates, repair, cancel, terminate, and archive must go to the
   runtime that owns the target run.

## Related References

- [Installation](/docs/installation)
- [Server](/docs/polyglot/server)
- [Cloud Control Plane](/docs/polyglot/cloud-control-plane)
- [Embedded to Server Migration](/docs/polyglot/embedded-to-server)
- [Server Role Topology](/docs/polyglot/server-role-topology)
- [Server Config Reference](/docs/polyglot/server-config-reference)
