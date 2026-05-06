---
sidebar_position: 3
title: Cloud Control Plane
description: Freeze the Durable Workflow Cloud control-plane contract, runtime-target boundary, worker connectivity model, and support-led topology edge.
tags:
  - cloud
  - control-plane
  - polyglot
  - operations
keywords:
  - Durable Workflow Cloud
  - runtime target
  - control plane data plane
  - hybrid workers
  - private networking
  - region failover
---

# Cloud Control Plane

Durable Workflow Cloud is the hosted control plane for Durable Workflow
runtimes. It is not a second engine and it does not replace the standalone
server protocol. Cloud owns tenancy, namespace placement, authentication, audit
logs, runtime-target inventory, and operator workflows above one or more
runtime targets. The runtime target still owns workflow execution, worker
polling, schedules, history, and durable visibility.

Use this page when deciding whether Cloud fits a deployment, when attaching
customer-run workers to a Cloud-managed namespace, or when reasoning about
regional placement, hybrid adoption, and where support-led topology work
begins.

## One Hosted Control Plane, Region-Scoped Runtime Targets

The current 2.0 product contract is:

- **Cloud hosts the control plane.** Organizations, projects, environments,
  namespaces, API keys, audit logs, and runtime-target health inventory live in
  the hosted Cloud surface.
- **A runtime target is the data-plane boundary.** Each runtime target is a
  Durable Workflow server endpoint with a base URL, a region label, health, and
  namespace ownership.
- **A namespace belongs to one runtime target at a time.** Cloud can manage
  many namespaces and many targets, but a single namespace is pinned to one
  target for durable execution until you deliberately move it.
- **The runtime target stays authoritative for workflow facts.** Workflow
  starts, signals, updates, cancels, worker leases, schedules, history export,
  task queues, and worker registrations remain runtime-owned facts even when
  Cloud presents them in a hosted operator experience.

```text
Cloud control plane
  organization
    project
      environment
        namespace  --->  runtime target (base URL, region, health)

Runtime target
  workflow execution
  worker registration + polling
  schedules
  history + visibility
```

That split keeps one durable engine and one worker protocol while making the
control-plane surface hosted and multi-tenant.

## Hosted Identity Boundary

Cloud identity sits above namespaces:

```text
organization
  project
    environment
      namespace  --->  runtime target
```

Cloud owns hosted users, service accounts, API keys, organization membership,
project and environment roles, namespace provisioning, runtime-target
assignment, and Cloud audit logs. A principal can be allowed to administer one
namespace without receiving rights to sibling namespaces in the same
organization.

When Cloud initiates or forwards a runtime command, the runtime request must
still resolve to explicit command facts: actor or service identity summary,
capability, target namespace/resource, auth outcome, request fingerprint or
Cloud audit id, and runtime command outcome. Cloud may map that identity to a
runtime-target credential, but the target remains the execution authority.

## What The Runtime Target Owns

The runtime target is still an ordinary Durable Workflow server from the point
of view of SDKs, workers, and automation:

- it exposes the control-plane and worker-protocol HTTP+JSON contracts
- it publishes `GET /api/cluster/info` for topology, capability, and version
  discovery
- it enforces namespace, auth, worker registration, task polling, and task
  completion semantics
- it remains the source of truth for queue health, worker visibility, durable
  history, and runtime health

Verify the target you are talking to at the runtime layer, not by inferring it
from Cloud UI labels:

```bash
curl -sS "https://runtime.example.com/api/cluster/info" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

Cloud may cache or summarize those facts for operators, but the runtime target
remains the authority surface that workers and automation must obey.

## Worker Connectivity Contract

Worker placement is intentionally separate from the control-plane contract.
What matters is reachability to the owning runtime target and conformance to
the standard worker protocol.

- **Workers connect to the runtime target, not to a proprietary Cloud relay.**
  Registration, long-polling, heartbeats, completion, and failure all stay on
  the runtime target's HTTP+JSON worker endpoints.
- **Customer-run workers are first-class in Cloud mode.** A worker can run in
  your network, on your VM or container platform, or beside your application as
  long as it can reach the runtime target and present the right auth and
  namespace headers.
- **Hybrid adoption is first-class.** Cloud can host the control plane while
  workers remain customer-run, and different environments or namespaces can
  point at different runtime targets.
- **Worker location is not part of the durable contract.** Moving a worker from
  one host to another does not change workflow ids, run ids, task semantics,
  compatibility markers, or history. The protocol is the contract, not the
  hosting venue.

If a future offering runs workers for you, those workers still need to speak
the same runtime-owned protocol. Cloud mode is a hosted control plane, not a
second worker API.

## Regional Placement And Failover Boundary

Cloud makes regional placement explicit by attaching each runtime target to a
named region. That region label is part of operator reasoning, not a hidden
implementation detail.

- **Region is explicit.** Operators should know which runtime target and region
  own a namespace before they route workers or operator traffic.
- **Failover is not a silent product guarantee.** Moving a namespace from one
  runtime target to another is a rollout operation with storage, auth,
  compatibility, and worker-drain consequences. Treat it like a deliberate
  migration, not like transparent live failover.
- **Automatic multi-region runtime failover is not a self-serve 2.0 promise.**
  Multi-region and advanced HA topologies remain support-led because they
  depend on your storage, networking, traffic-management, and recovery design.

The hosted control plane helps operators see target health and region posture,
but it does not erase the underlying runtime and storage boundaries.

## Private Networking And Support-Led Topologies

The current self-serve Cloud contract assumes direct reachability from workers
and automation to the runtime target's base URL.

That means the following are **not** frozen as self-serve product guarantees in
2.0:

- Cloud-managed relays that proxy worker traffic on your behalf
- private-network-only worker connectivity with no direct runtime-target reach
- active/active multi-region execution
- automatic cross-region runtime failover
- bespoke ingress, VPN, VPC peering, or provider-specific private-routing
  designs

Those are support-led topology decisions, not hidden defaults. When you need
them, treat the design itself as part of the product risk and validate it with
the same care as database, cache, and rollout planning.

## Migration And Hybrid Adoption

Cloud mode is compatible with staged adoption rather than all-at-once cutover:

1. Start with embedded mode or a self-hosted server.
2. Attach one or more runtime targets to Cloud.
3. Pin each environment or namespace to the target that should own it.
4. Keep workers pointed at the runtime target that owns their namespace.
5. Move only new traffic or newly chosen namespaces when you are ready.

Two migration rules stay fixed:

- Existing in-flight runs stay with the runtime that already owns them unless
  you perform an explicit migration plan outside the normal live-run contract.
- Cloud does not change the durable runtime contract. Namespace names, task
  queues, compatibility markers, payload codecs, worker registration, and
  history export remain runtime-level facts before and after you adopt the
  hosted control plane.

## Related References

- [Deployment Modes](/docs/2.0/polyglot/deployment-modes)
- [Server](/docs/2.0/polyglot/server)
- [Server Role Topology](/docs/2.0/polyglot/server-role-topology)
- [Self-Hosting Deployments](/docs/2.0/deployment)
- [Support](/docs/2.0/support)
