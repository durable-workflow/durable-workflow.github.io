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
independently and is never attached to Cloud.

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

The runner resolves the current stable artifact versions, gives each
credential only to its matching child process, waits up to 60 seconds for a
worker registration advertising the exact queue and generated workflow and
activity types, then starts one client request. It succeeds only after the SDK
returns the expected result, `dw` reports `completed`, and the required
workflow and activity history is present. The command does not run a local
Server or Waterline in managed mode.

Continue with the language guide for SDK-specific authoring:

- [PHP SDK](/docs/polyglot/php/): run `scripts/playground php`.
- [Python SDK](/docs/polyglot/python/): run `scripts/playground python`.
- [Rust managed-runtime quickstart](/docs/polyglot/rust-cloud-quickstart/):
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

Choose [self-hosted Server](/docs/polyglot/server) when your team needs to
operate the Server image, database, cache, networking, authentication, backups,
and failover independently. A self-hosted Server cannot be registered with,
attached to, or used as the backing runtime for a Cloud namespace. Embedded
Laravel, self-hosted Server, and Cloud are separate deployment choices.

## Billing Usage API

Cloud Dev uses one isolated, single-host runtime cell for each provisioned Dev
space. Its approved launch terms are:

| Billing term | Cloud Dev |
| --- | ---: |
| Provisioned runtime | $0.03 per hour, metered by minute |
| Calendar-month maximum | $20 per Dev space |
| Active-month minimum | $1 when a Dev space is provisioned during the month |
| Managed capacity | 1 vCPU, 1 GB memory, 5 GB durable storage |
| Additional durable storage | $2 per GB-month, metered by GB-hour |
| Basic encrypted backups | Included |
| Availability | Single host, no SLA |

The allocation covers Cloud-operated Server, MySQL, Redis, scheduling,
Waterline access, backups, upgrades, and infrastructure. Customer PHP, Python,
and Rust workers run outside that allocation. Workflow starts, activity
attempts, retries, timers, signals, queries, updates, and child workflows are
operational telemetry, not separate billing units. Prices exclude applicable
taxes. Additional durable storage is outside the $20 runtime-capacity maximum.

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

The response schema is
`durable_workflow.cloud.namespace_capacity_usage.v1`. It separates allocated
capacity time and additional durable storage from semantic event counters. The
abbreviated Cloud Dev response below shows that distinction.

```json
{
  "schema": "durable_workflow.cloud.namespace_capacity_usage.v1",
  "access_control": {
    "scope": "organization_billing_usage",
    "read_allowed": true,
    "export_allowed": true
  },
  "current_period": {
    "starts_at": "2026-05-01T00:00:00+00:00",
    "ends_at": "2026-05-31T23:59:59+00:00"
  },
  "metering_policy": {
    "invoice_drivers": [
      "namespace_plan_capacity",
      "additional_durable_storage_gb_month"
    ],
    "semantic_events_are_invoice_units": false,
    "network": "measured_not_billable",
    "basic_backups": "included",
    "customer_worker_compute": "excluded"
  },
  "by_namespace": [
    {
      "namespace": "development",
      "project": "sample-app",
      "environment": "development",
      "plan": {
        "version": "cloud-dev.single-host-v1",
        "name": "Cloud Dev",
        "availability_class": "development_single_host",
        "sla_status": "none",
        "billing_terms": {
          "currency": "usd",
          "unit": "provisioned_runtime_hour",
          "hourly_rate_cents": 3,
          "monthly_cap_cents": 2000,
          "active_month_minimum_cents": 100,
          "billing_period": "calendar_month_utc",
          "metering_resolution_seconds": 60,
          "additional_storage_unit": "gb_month",
          "additional_storage_rate_cents": 200,
          "additional_storage_metering_unit": "gb_hour",
          "additional_storage_in_monthly_cap": false
        }
      },
      "allocation": {
        "managed_cpu_vcpu": 1,
        "managed_memory_gb": 1,
        "included_durable_storage_gb": 5
      },
      "operational_telemetry": {
        "billing_status": "not_billable",
        "counters": {
          "workflow_execution_count": 20,
          "activity_execution_count": 40,
          "timer_fire_count": 5,
          "signal_delivery_count": 3,
          "update_delivery_count": 0,
          "query_task_count": 2
        }
      }
    }
  ]
}
```

Cloud Dev's time meter starts when its isolated runtime is provisioned and
stops when that runtime is deprovisioned. The monthly cap and minimum apply per
Dev space in UTC calendar months. Durable storage above the included amount is
metered separately. Cloud preserves an operating and recovery reserve on the
runtime disk and requires a capacity change before storage can consume it.

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

Then flatten namespace capacity rows with:

```jq
.by_namespace[]
| {
    project,
    environment,
    namespace,
    plan: .plan.name,
    cpu_vcpu: .allocation.managed_cpu_vcpu,
    memory_gb: .allocation.managed_memory_gb,
    included_storage_gb: .allocation.included_durable_storage_gb,
    capacity_status
  }
```

Use `invoice_units` for capacity and storage reconciliation. Use
`operational_telemetry` to understand workload shape and benchmark behavior;
do not convert those event counters into charges.

## Related References

- [Deployment Modes](/docs/polyglot/deployment-modes)
- [PHP SDK](/docs/polyglot/php)
- [Python SDK](/docs/polyglot/python)
- [Rust SDK](/docs/polyglot/rust)
- [Server](/docs/polyglot/server)
- [Self-Hosting Deployments](/docs/deployment)
- [Support](/docs/support)
