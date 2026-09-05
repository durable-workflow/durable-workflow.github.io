---
sidebar_position: 3
title: Cloud Managed Runtime
description: Compare Cloud plans, measured workflow capacity, billing and availability, then connect PHP, Python or Rust workers to a managed namespace.
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
  - multi-region managed runtime
---

# Cloud Managed Runtime

Durable Workflow Cloud is a managed orchestration service. Cloud operates both
the hosted control plane and the orchestration runtime, including workflow
state, history, schedules, task queues, leases, and durable visibility.
Customers run SDK clients and workers against a provisioned Cloud namespace.

This is separate from self-hosting. A self-hosted Durable Workflow Server runs
independently and is never attached to Cloud.

## Plans And Pricing

Pay for provisioned capacity, not workflow semantics. Each namespace receives
an isolated managed runtime; customer PHP, Python, and Rust workers run in your
own environment. All five plans are available through Cloud.

| Plan | Runtime capacity | Included durable storage | Availability | Price (USD) |
| --- | --- | --- | --- | --- |
| Cloud Dev | 1 vCPU, 1 GB RAM | 5 GB | Single host, no SLA | $0.03/hour, capped at $20/month |
| Cloud Standard | 1 vCPU, 2 GB RAM | 25 GB | Single-region HA, 99.99% SLA | $100/month |
| Cloud Multi-Region | 1 vCPU, 2 GB RAM | 25 GB | Multi-region HA, 99.99% SLA | $150/month |
| Cloud Business | 4 vCPU, 8 GB RAM | 100 GB | Single-region HA, 99.99% SLA | $500/month |
| Cloud Business Multi-Region | 4 vCPU, 8 GB RAM | 100 GB | Multi-region HA, 99.99% SLA | $650/month |

Capacity covers the managed runtime components, not customer worker compute.
HA replication and standby capacity are included in the plan price; the table
does not add replicas together as extra workflow-execution capacity. Every plan
includes Managed Waterline, basic encrypted backups, upgrades, and a stable
runtime URL.

Cloud Dev is metered by minute, with a $1 active-month minimum and a $20 cap
per space per UTC calendar month. SLA plans have a fixed monthly runtime price,
with applicable plan-change prorations handled by Stripe. Additional durable
storage is $2/GB-month, metered by GB-hour and separate from runtime charges or
the Dev cap. Prices exclude applicable taxes. Storage expansion requires
available capacity; neither disk growth nor network use is unlimited.

See [Cloud pricing](https://cloud.durable-workflow.com/pricing) to choose a plan.
For larger capacity, different connectivity, SSO, enterprise support, or a
custom availability requirement, [contact us](https://cloud.durable-workflow.com/contact).

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

The namespace's HTTPS endpoint connects directly to its managed runtime.
SDK traffic is not proxied through the Cloud website/control-plane application.
Use the returned runtime URL unchanged, without appending `/api`; the SDK and
CLI construct their API paths. Administrative API calls still use
`https://cloud.durable-workflow.com/api/v1`.

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

In the [Cloud dashboard](https://cloud.durable-workflow.com/), create an
organization, project, environment, and namespace, then select its capacity
plan. Creating an account or namespace definition does not provision paid
capacity. Complete payment setup through Stripe, then select **Provision** on
the namespace page. Adding a card alone does not start provisioning.

Provisioning is asynchronous. The namespace page updates its progress while
Cloud prepares the runtime. Wait for it to become active before starting SDK
work. The page also provides runtime-credential creation and Managed Waterline
access for inspecting workflows and their history.

For API-driven setup, complete payment setup first. The following example uses
the organization's default plan; `capacity_plan_version` can select another
available plan. Do not supply your own Server URL, deployment identifier, or
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
export DURABLE_WORKFLOW_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<language-task-queue>'
```

Then choose a first-party SDK and run the same managed-runtime contract:

```bash
language=php # Choose php, python, or rust.
scripts/playground "$language" --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_NAMESPACE" \
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

Choose the recovery boundary with the plan:

- **Cloud Dev:** one isolated host with persistent state and backups. Maintenance
  and recovery may interrupt service. There is no uptime SLA or automatic
  regional failover.
- **Single-region HA:** three replicated hosts in one region, with automatic
  primary failover. One host may fail without losing the remaining quorum.
  A whole-region outage is outside this plan's SLA coverage.
- **Multi-region HA:** three replicated hosts across three regions, with
  automatic primary failover. The SLA includes loss or isolation of one
  configured region, provided the remaining members can form a quorum.

The stable runtime URL follows the elected primary; you do not change SDK
configuration during a supported failover. An isolated former primary is
prevented from continuing to serve authoritative work. If a safe primary
cannot be established, the runtime stops serving rather than accepting
conflicting writes. HA is not a promise of uninterrupted requests: clients and
workers still need bounded retries for transient failures.

The namespace page exposes its topology, region information, and service
status. Backups support recovery but are not a substitute for live replication.
Short failover tests demonstrate the exercised failure cases, not a universal
recovery-time guarantee or a month's achieved availability.

### SLA Measurement And Credits

The four SLA plans provide a 99.99% uptime SLA over a UTC calendar month,
measured at the customer runtime endpoint in one-minute windows. Missing
measurements count as unavailable, and planned maintenance is not excluded.
Customer-hosted worker availability is separate from managed runtime availability.

| Monthly availability | Automatic account credit |
| --- | ---: |
| At least 99.99% | None |
| At least 99.9%, below 99.99% | 10% |
| At least 99.0%, below 99.9% | 25% |
| Below 99.0% | 100% |

Account credits apply automatically; cash refunds require review and approval.
Cloud Dev has no SLA credits. See [Cloud pricing](https://cloud.durable-workflow.com/pricing)
for the plan's availability scope and billing terms.

## Private Connectivity And Support Boundary

The 2.0 self-serve Cloud contract assumes outbound access from clients and
workers to the public namespace runtime URL. Private-only ingress, bespoke VPN
or peering arrangements, and provider-specific private routing are support-led
connectivity designs, not hidden defaults. Customers are never given internal
runtime addresses or asked to route around the namespace URL.

## Cloud Or Self-Hosted Server

Choose Cloud when Durable Workflow should operate the orchestration runtime,
persistence, the selected plan's availability, recovery, and Managed Waterline while
your team operates the SDK clients and workers.

Choose [self-hosted Server](/docs/polyglot/server) when your team needs to
operate the Server image, database, cache, networking, authentication, backups,
and failover independently. A self-hosted Server cannot be registered with,
attached to, or used as the backing runtime for a Cloud namespace. Embedded
Laravel, self-hosted Server, and Cloud are separate deployment choices.

## Standard Workflow Benchmarks

[DW Standard Workflow v1](https://github.com/durable-workflow/server/tree/main/benchmarks/capacity)
defines a small, repeatable workload: one workflow start, one external activity,
and one workflow completion, with defined 1 KiB Avro inputs and results.
The customer worker runs outside the managed runtime allocation.

The recorded plan baselines below use that workload. The SLA-plan measurements
include their replicated HA topology; they are not extrapolated from a Dev host.

| Plan | Standard workflows/second | 30-day workflow actions |
| --- | ---: | ---: |
| Cloud Dev | 0.25 | 1,296,000 |
| Cloud Standard | 0.25 | 1,296,000 |
| Cloud Multi-Region | 0.10 | 518,400 |
| Cloud Business | 0.50 | 2,592,000 |
| Cloud Business Multi-Region | 0.20 | 1,036,800 |

The 30-day estimate is `workflows/second x 2,592,000 seconds x 2 workflow actions`:
one start and one activity for this comparison. It assumes that rate runs
continuously for 30 days. It is not an included-action quota, a billing unit,
or an exact mapping to another engine's action definitions.

These are measured workload baselines, not maximum throughput or guaranteed
capacity for every application. Larger payloads, more activities, timers,
signals, queries, replay-heavy histories, cross-region communication, and
customer worker latency change the result. The table does not claim separate
timer, signal, replay, or saturation benchmarks. Plan for your actual workflow
mix rather than multiplying these numbers by an arbitrary workflow size.

### Cloud Dev Measurement {#cloud-dev-capacity}

Cloud Dev is an isolated, single-host managed runtime for development and
evaluation. Each provisioned space receives the same runtime shape used for
the measurement below:

| Resource | Cloud Dev |
| --- | --- |
| Runtime compute | 1 shared vCPU, 1 GB RAM |
| Durable storage included | 5 GB |
| Runtime services | Server with Managed Waterline, queue worker, scheduler, MySQL, and Redis |
| Network path | Direct, space-specific HTTPS ingress |
| Customer workers | Run in the customer's environment |
| Availability | No SLA; maintenance interruptions are allowed |
| Runtime price | $0.03/hour, measured by minute, capped at $20/month |
| Storage above 5 GB | $2/GB-month |

Cloud Dev was measured with [DW Standard Workflow
v1](https://github.com/durable-workflow/server/tree/main/benchmarks/capacity),
a fixed comparison workload consisting of one workflow start, one external
activity, and one workflow completion with defined 1 KiB Avro inputs and
results. The test used the provisioned 1-vCPU/1-GB runtime topology, published
Server and PHP SDK artifacts, one PHP worker process, two client slots,
a 30-second warmup, and a five-minute measurement window.

| Measured result | Value |
| --- | ---: |
| Offered and completed rate | 0.25 standard workflows/second |
| Completed workflows | 75 of 75 |
| Errors / throttled starts | 0 / 0 |
| Scheduling latency, p50 | 28.0 ms |
| Scheduling latency, p95 | 95.1 ms |
| Scheduling latency, p99 | 134.5 ms |
| Final workflow backlog | 0 |
| 30-day workflow actions | 1,296,000 |

This is a measured development baseline, not a universal conversion for every
workflow and not an SLA. Larger payloads, additional activities, timers,
signals, queries, replay-heavy histories, and customer worker latency change
capacity. Cloud billing remains based on provisioned runtime time and durable
storage, not workflow operations.

## Billing Usage API

Cloud Dev uses one isolated, single-host runtime cell for each provisioned Dev
space. Its billing terms are:

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

Cloud Dev's time meter starts when its isolated runtime is activated and
stops when that runtime is deprovisioned. The monthly cap and minimum apply per
Dev space in UTC calendar months. Durable storage above the included amount is
metered separately. Cloud preserves an operating and recovery reserve on the
runtime disk and requires a capacity change before storage can consume it.

Idle runtimes still incur capacity charges. Deprovisioning stops runtime
capacity billing and removes active runtime data and credentials; it is not a
pause/resume operation. SLA plans use their selected monthly subscription price,
not the Dev hourly rate. Use the plan's returned `billing_terms` when interpreting
usage, and keep any separately retained billable storage distinct from runtime
capacity.

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
