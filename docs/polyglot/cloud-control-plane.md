---
sidebar_position: 3
title: Cloud Managed Runtime
description: Provision a Durable Workflow Cloud namespace and connect SDK clients and customer-run workers to its managed runtime.
tags:
  - cloud
  - managed-runtime
  - polyglot
  - operations
keywords:
  - Durable Workflow Cloud
  - namespace runtime URL
  - runtime credentials
  - customer-run workers
  - private networking
  - single-region managed runtime
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# Cloud Managed Runtime

<ProductPromotion source="docs-v2-cloud-runtime">
Request a managed namespace for a real workload and share feedback during the
launch cohort.
</ProductPromotion>

Durable Workflow Cloud is a managed orchestration service. Cloud operates both
the hosted control plane and the orchestration runtime, including workflow
state, history, schedules, task queues, leases, and durable visibility.
Customers run SDK clients and workers against a provisioned Cloud namespace.

This is separate from self-hosting. A self-hosted Durable Workflow Server runs
independently and is never attached to Cloud. The guidance on this page belongs
to the explicit 2.0 prerelease docs line.

## Managed Service Boundary

The customer-visible boundary is one Cloud namespace:

```text
Cloud organization
  project
    environment
      namespace
        stable runtime URL
        client runtime credential  ---> workflow starts and commands
        worker runtime credential  ---> registration, polling, and completion

Cloud-operated runtime
  workflow state and history
  schedules and task queues
  leases, matching, and visibility
  Managed Waterline
```

Cloud owns namespace provisioning, runtime operation, persistence, placement,
runtime health, recovery, and the Managed Waterline surface for the namespace.
Customers own application code, workflow and activity implementations, and the
processes that run their workers. Cloud customers do not deploy a separate
Waterline service.

Cloud administration and runtime traffic use different credentials:

- A Cloud API key (`dwc_...`) manages projects, environments, namespaces,
  billing, and runtime-credential lifecycle.
- A client runtime credential (`dwr_...`) starts and controls workflows in one
  managed namespace.
- A worker runtime credential (`dwr_...`) registers workers, long-polls for
  tasks, sends heartbeats, and settles work in that namespace.

A Cloud API key is not accepted by the namespace runtime URL. Runtime
credentials are scoped to one namespace and role, returned only when created,
and omitted from later list and audit responses.

If Cloud onboarding uses the CLI, install it from the [CLI guide](./cli.mdx)
and update an existing standalone installation explicitly with `dw upgrade`.
The CLI never updates in the background. After installing or upgrading, run
`command -v dw` and `dw --version`; resolve any installer `PATH` remediation
before using Cloud credentials so the selected release is the active binary.

## Provision And Connect A Namespace

### 1. Create and provision the namespace

Create the namespace without supplying a Server URL, deployment identifier, or
placement record:

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders","retention_days":30}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/provision \
  -H "Authorization: Bearer dwc_..."
```

After provisioning completes, the namespace response provides its stable
`runtime_url`, its `runtime_namespace`, managed status, and customer-visible
region information. Treat the returned URL and namespace value as configuration
owned by Cloud; do not derive an endpoint or replace it with a self-hosted
Server address.

### 2. Issue separate client and worker credentials

Issue the two runtime roles independently:

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-client","role":"client"}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-worker","role":"worker"}'
```

Each token is displayed once in its create response. Store it in the secret
store used by only the corresponding role. A deliberately combined client and
worker process receives both values as two distinct secrets. Rotate and revoke
the roles independently, and never substitute a Cloud API key for either
runtime credential.

### 3. Complete a first Cloud workflow {#cloud-first-workflow}

The Sample App's shared external-runtime playground runs the same authored
workflow-and-activity journey with PHP, Python, or Rust. Open a [Sample App
Codespace](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main),
export the provisioned namespace values and two runtime credentials, and choose
an application task queue:

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<language-task-queue>'
```

Then choose a first-party SDK and run the same managed-runtime contract:

```bash
language=rust # Choose php, python, or rust.
scripts/playground "$language" --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_RUNTIME_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

The runner resolves the current qualified artifact tuple, gives each
credential only to its matching child process, waits up to 60 seconds for a
worker registration advertising the exact queue and generated workflow and
activity types, then starts one client request. It succeeds only after the SDK
returns the expected result, `dw` reports `completed`, and the required
workflow and activity history is present. The command does not run a local
Server or Waterline in managed mode.

Continue with the language guide for SDK-specific authoring:

- [PHP SDK](/docs/2.0/polyglot/php/): run `scripts/playground php`.
- [Python SDK](/docs/2.0/polyglot/python/): run `scripts/playground python`.
- [Rust managed-runtime quickstart](/docs/2.0/polyglot/rust-cloud-quickstart/):
  run `scripts/playground rust` and use its worker-ready, completed-result, and
  mismatch diagnostics.

A combined client-and-worker journey holds both runtime credentials as distinct
secrets. A Cloud administration key is not a runtime credential and must not be
exported under either runtime-token variable.

### 4. Continue with managed operation

The SDK client starts workflows and sends follow-up commands through the
namespace runtime URL. Customer-run workers register and long-poll through the
same URL using the worker role. Cloud authenticates and scopes each request,
executes the orchestration protocol in the managed runtime, and persists the
workflow state and history.

The customer application does not select a runtime deployment for an
operation. Workflow IDs, run IDs, task queues, compatibility markers, and Avro
payload encoding remain durable application contracts within the Cloud namespace.

## Customer-Run Worker Connectivity

Workers can run in your network, VM fleet, container platform, or application
environment. They need outbound HTTPS reachability to the namespace runtime URL
and must allow the worker protocol's long-lived poll requests.

- No inbound connection from Cloud to a worker is required.
- Proxies and egress gateways must not shorten long polls into a busy retry
  loop.
- Workers should retry transient connection failures and service-unavailable
  responses with bounded backoff.
- Moving a worker process does not move workflow state; Cloud retains the
  namespace's durable state and history.
- Credential rotation does not require changing the runtime URL, namespace, or
  task queue.

## Region Placement And Recovery Boundary

The current 2.0 launch cohort provisions each namespace in one managed region.
The namespace response exposes that region and its service status for
residency, latency, and incident decisions; infrastructure deployment
identities, private addresses, upstream credentials, and provider topology
remain internal.

Multi-region replication, automatic regional failover or failback, and
customer-facing RTO or replication-lag targets are not part of the current
Cloud contract. Applications should retry transient connection failures using
their normal bounded policy, but must not treat a stable namespace URL as a
guarantee of automatic cross-region recovery.

## Private Connectivity And Support Boundary

The 2.0 self-serve Cloud contract assumes outbound access from clients and
workers to the public namespace runtime URL. Private-only ingress, bespoke VPN
or peering arrangements, and provider-specific private routing are support-led
connectivity designs, not hidden defaults. Customers are never given internal
runtime addresses or asked to route around the namespace URL.

## Cloud Or Self-Hosted Server

Choose Cloud when Durable Workflow should operate the orchestration runtime,
persistence, single-region placement, recovery, and Managed Waterline while
your team operates the SDK clients and workers.

Choose [self-hosted Server](/docs/2.0/polyglot/server) when your team needs to
operate the Server image, database, cache, networking, authentication, backups,
and failover independently. A self-hosted Server cannot be registered with,
attached to, or used as the backing runtime for a Cloud namespace. Embedded
Laravel, self-hosted Server, and Cloud are separate deployment choices.

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

The response schema is `durable_workflow.cloud.billing_usage.v1`. The
abbreviated zero-valued response below illustrates the API shape only; it does
not represent a plan rate or pricing quote. `estimated_cost_cents` comes from
the caller's plan-backed usage rollup. Every usage and cost value is zero, so
the example does not imply an action-count-to-cost rate.

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
    "workflow_execution_count": 0,
    "activity_execution_count": 0,
    "timer_fire_count": 0,
    "signal_delivery_count": 0,
    "update_delivery_count": 0,
    "query_task_count": 0,
    "storage_byte_hours": 0,
    "billable_action_count": 0,
    "estimated_cost_cents": 0
  },
  "by_action_type": [
    {
      "action_type": "workflow_start",
      "raw_count": 0,
      "billing_unit": "billable_action",
      "billing_units": 0,
      "estimated_cost_cents": 0
    }
  ],
  "by_namespace": [
    {
      "namespace": "example",
      "project": "example",
      "environment": "test",
      "usage": {
        "billable_action_count": 0,
        "estimated_cost_cents": 0
      },
      "action_types": [
        {
          "action_type": "workflow_start",
          "raw_count": 0,
          "billing_units": 0,
          "estimated_cost_cents": 0
        }
      ]
    }
  ]
}
```

The standard action types are `workflow_start`, `activity_execution`,
`timer_fire`, `signal`, `update`, and `query`. `raw_count` is the source meter
count. `billing_units` is the derived `billable_action` quantity used for
chargeback. The plan-backed `estimated_cost_cents` rollup is allocated
proportionally across action types so totals reconcile with the namespace and
report totals.

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
- [PHP SDK](/docs/2.0/polyglot/php)
- [Python SDK](/docs/2.0/polyglot/python)
- [Rust SDK](/docs/2.0/polyglot/rust)
- [Server](/docs/2.0/polyglot/server)
- [Self-Hosting Deployments](/docs/2.0/deployment)
- [Support](/docs/2.0/support)
