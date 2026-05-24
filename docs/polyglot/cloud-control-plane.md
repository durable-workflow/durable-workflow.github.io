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

The 2.0 prerelease product contract is:

- **Cloud hosts the control plane.** Organizations, projects, environments,
  namespaces, API keys, audit logs, and runtime-target health inventory live in
  the hosted Cloud surface.
- **A runtime target is the data-plane boundary.** Each runtime target is a
  Durable Workflow server endpoint with a base URL, a region label, health, and
  namespace ownership.
- **A namespace has one active runtime authority at a time.** Standard
  namespaces point at one runtime target until an operator deliberately
  migrates them. Cloud multi-region replication v1 is the hosted exception: a
  namespace is enrolled in a configured primary/secondary target pair, and
  Cloud may change the active target during failover without turning the
  namespace into active/active execution or an arbitrary target migration.
- **The runtime target stays authoritative for workflow facts.** Workflow
  starts, signals, updates, cancels, worker leases, schedules, history export,
  task queues, and worker registrations remain runtime-owned facts even when
  Cloud presents them in a hosted operator experience.

```text
Cloud control plane
  organization
    project
      environment
        namespace  --->  active runtime target (base URL, region, health)
                    \->  optional replication secondary in Cloud v1

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
      namespace  --->  active runtime target
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
named region and provider. Those labels are part of operator reasoning, not a
hidden implementation detail.

- **Region is explicit.** Operators should know which runtime target and region
  own a namespace before they route workers or operator traffic.
- **Provider is explicit.** Multi-region namespace replication v1 pairs two
  registered runtime targets with the same provider value and different
  regions.
- **Automatic failover is namespace-scoped and Cloud-hosted.** A Cloud
  multi-region namespace has a home primary target plus one secondary target.
  Cloud checks runtime readiness every minute, switches workflow routing to
  the secondary when the home region is unhealthy, and switches back
  automatically after the home region recovers. At each point, exactly one
  runtime target is active for workflow writes.
- **The v1 RTO target is 20 minutes.** Namespace replication state exposes the
  current primary, home primary, secondary region, lag seconds, last successful
  replication time, and failover/failback timestamps. Multi-cloud replication,
  active/active writes, per-workflow region pinning, and cross-region Nexus
  calls remain outside the v1 self-serve contract.
- **Deliberate migrations stay deliberate.** Moving a namespace outside its
  configured replication pair, changing providers, or moving in-flight runs to
  a different runtime design remains a migration with storage, auth,
  compatibility, worker-drain, and recovery consequences.

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
- multi-cloud namespace replication
- bespoke ingress, VPN, VPC peering, or provider-specific private-routing
  designs

Those are support-led topology decisions, not hidden defaults. When you need
them, treat the design itself as part of the product risk and validate it with
the same care as database, cache, and rollout planning.

## Migration And Hybrid Adoption

Cloud mode is compatible with staged adoption rather than all-at-once cutover:

1. Start with embedded mode or a self-hosted server.
2. Attach one or more runtime targets to Cloud.
3. Assign each environment or namespace to the target that should own it, or
   enroll a hosted Cloud namespace in a configured primary/secondary
   replication pair.
4. Keep workers pointed at the runtime target that owns their namespace.
5. Move only new traffic or newly chosen namespaces when you are ready; keep
   deliberate target migrations separate from Cloud-managed failover inside a
   replication pair.

Three migration rules stay fixed:

- Existing in-flight runs stay with the runtime that already owns them unless
  you perform an explicit migration plan outside the normal live-run contract.
- Cloud multi-region replication v1 failover changes the active runtime target
  only inside the configured primary/secondary pair. It is not a general
  namespace migration mechanism.
- Cloud does not change the durable runtime contract. Namespace names, task
  queues, compatibility markers, payload codecs, worker registration, and
  history export remain runtime-level facts before and after you adopt the
  hosted control plane.

## Billing Usage API

Cloud exposes organization-scoped billing usage for finance, operations, and
chargeback automation. The endpoint is authenticated by a Cloud API key and
does not accept a customer or organization id in the request; the caller's
organization is resolved from the `dwc_` bearer token so one customer cannot
query another customer's usage.

```http
GET /api/v1/billing/usage?period_start=2026-05-01&period_end=2026-05-31
Authorization: Bearer dwc_...
Accept: application/json
```

`period_start` and `period_end` are optional ISO-8601 dates. When omitted,
Cloud returns the current calendar month. Billing usage reads and exports stay
available even if billing restrictions pause namespace provisioning or workflow
operations, so finance teams can still recover account standing.

The response schema is `durable_workflow.cloud.billing_usage.v1`:

```json
{
  "schema": "durable_workflow.cloud.billing_usage.v1",
  "access_control": {
    "scope": "organization_billing_usage",
    "api": {"authentication": "organization_api_key"}
  },
  "current_period": {
    "starts_at": "2026-05-01T00:00:00+00:00",
    "ends_at": "2026-05-31T23:59:59+00:00"
  },
  "totals": {
    "workflow_execution_count": 20,
    "activity_execution_count": 80,
    "timer_fire_count": 10,
    "signal_delivery_count": 5,
    "update_delivery_count": 3,
    "query_task_count": 2,
    "storage_byte_hours": 123456,
    "billable_action_count": 120,
    "estimated_cost_cents": 240
  },
  "by_action_type": [
    {
      "action_type": "workflow_start",
      "raw_count": 20,
      "billing_unit": "billable_action",
      "billing_units": 20,
      "estimated_cost_cents": 40
    },
    {
      "action_type": "activity_execution",
      "raw_count": 80,
      "billing_unit": "billable_action",
      "billing_units": 80,
      "estimated_cost_cents": 160
    },
    {
      "action_type": "timer_fire",
      "raw_count": 10,
      "billing_unit": "billable_action",
      "billing_units": 10,
      "estimated_cost_cents": 20
    },
    {
      "action_type": "signal",
      "raw_count": 5,
      "billing_unit": "billable_action",
      "billing_units": 5,
      "estimated_cost_cents": 10
    },
    {
      "action_type": "update",
      "raw_count": 3,
      "billing_unit": "billable_action",
      "billing_units": 3,
      "estimated_cost_cents": 6
    },
    {
      "action_type": "query",
      "raw_count": 2,
      "billing_unit": "billable_action",
      "billing_units": 2,
      "estimated_cost_cents": 4
    }
  ],
  "by_namespace": [
    {
      "namespace": "orders",
      "project": "commerce",
      "environment": "prod",
      "usage": {
        "billable_action_count": 120,
        "estimated_cost_cents": 240
      },
      "action_types": [
        {
          "action_type": "workflow_start",
          "raw_count": 20,
          "billing_units": 20,
          "estimated_cost_cents": 40
        },
        {
          "action_type": "activity_execution",
          "raw_count": 80,
          "billing_units": 80,
          "estimated_cost_cents": 160
        },
        {
          "action_type": "timer_fire",
          "raw_count": 10,
          "billing_units": 10,
          "estimated_cost_cents": 20
        },
        {
          "action_type": "signal",
          "raw_count": 5,
          "billing_units": 5,
          "estimated_cost_cents": 10
        },
        {
          "action_type": "update",
          "raw_count": 3,
          "billing_units": 3,
          "estimated_cost_cents": 6
        },
        {
          "action_type": "query",
          "raw_count": 2,
          "billing_units": 2,
          "estimated_cost_cents": 4
        }
      ]
    }
  ]
}
```

The standard action types are `workflow_start`, `activity_execution`,
`timer_fire`, `signal`, `update`, and `query`. `raw_count` is the source meter
count. `billing_units` is the derived `billable_action` quantity used for
chargeback, and `estimated_cost_cents` is allocated proportionally across
action types so totals reconcile with the namespace and report totals.

Export the same evidence as CSV or a JSON report when a downstream finance
system needs a file handoff:

```bash
curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/export?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."

curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/report?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."
```

For a JSON-backed dashboard panel, request the same API with the panel's time
range:

```text
GET https://cloud.durable-workflow.com/api/v1/billing/usage?period_start=${__from:date:YYYY-MM-DD}&period_end=${__to:date:YYYY-MM-DD}
Authorization: Bearer dwc_...
```

Then flatten namespace/action rows with:

```jq
.by_namespace[]
| . as $namespace
| .action_types[]
| {
    project: $namespace.project,
    environment: $namespace.environment,
    namespace: $namespace.namespace,
    action_type,
    raw_count,
    billing_units,
    estimated_cost_cents
  }
```

Group the dashboard by `namespace` and `action_type`, sum `billing_units`, and
plot `estimated_cost_cents / 100` as the cost series.

## Related References

- [Deployment Modes](/docs/2.0/polyglot/deployment-modes)
- [Server](/docs/2.0/polyglot/server)
- [Server Role Topology](/docs/2.0/polyglot/server-role-topology)
- [Self-Hosting Deployments](/docs/2.0/deployment)
- [Support](/docs/2.0/support)
