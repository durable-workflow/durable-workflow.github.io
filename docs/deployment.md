---
sidebar_position: 13
title: Self-Hosting Deployments
description: Choose a supported Durable Workflow v2 self-hosting path and the artifact to start from.
---

# Self-Hosting Deployments

Durable Workflow v2 supports several self-hosted shapes. Pick the smallest path
that matches the environment you operate, then keep the image, database, cache,
auth, readiness, and upgrade contract explicit.

This guide covers the standalone server distribution. If you run the Laravel
package embedded in your own app, use the package installation and configuration
pages instead. Durable Workflow Cloud is a separate managed-service choice in
which Cloud operates the runtime, persistence, placement, and recovery; a
self-hosted Server is never attached to Cloud. See
[Cloud Managed Runtime](/docs/2.0/polyglot/cloud-control-plane). The current
Cloud contract is a single-region managed runtime and recovery boundary; it
does not promise multi-region replication, automatic regional failover, or
failback.

The self-hosted Server distribution does not bundle or operate Waterline.
Deploy Waterline separately only when you want its operator UI, and connect it
to a Server-owned namespace using the
[Waterline deployment and monitoring guide](/docs/2.0/monitoring/#waterline-service).
Cloud instead includes Managed Waterline for its managed namespace.

## Deployment support matrix

| Path | Start from | Supported for | Not promised by this path | Commercial support starts when |
| --- | --- | --- | --- | --- |
| Local development and internal non-production | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) with `%%artifact.serverTagEnv%%` or `%%artifact.serverImageEnv%%` | One developer machine, LAN demos, shared staging, SDK and worker integration tests | Internet-facing production, durable backup guarantees, strict secret rotation, multi-node failover | You want help turning a working dev stack into a production runbook |
| Single-node production | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) with a production env file, MySQL and Redis volumes, role-scoped tokens, backups, TLS through a reverse proxy, and pinned image tags or digests | One VM, VPS, or internal Docker host with persistent workflow state and a simple operational model | Host-level HA, automatic database failover, multi-region recovery, zero-downtime major topology changes | The deployment carries production traffic and you want review of backup, restore, auth, TLS, upgrade, or rollback procedures |
| Small clustered deployment | Published `durableworkflow/server` or `ghcr.io/durable-workflow/server` images using the [Compose recipe](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) as the container/process template, with 2-3 API nodes, shared external MySQL/PostgreSQL, shared Redis, independently scaled workers, and exactly one scheduler/maintenance runner | Horizontal API and worker capacity when one node is no longer enough; rolling upgrades when every guarantee in the [rolling-upgrade contract](/docs/2.0/rolling-upgrades) holds | SQLite clustering, Redis-less multi-node mode, duplicate schedulers as a steady-state topology, active/active multi-writer databases, self-hosted hands-free regional failover, broad "five-nines" or "zero-downtime" SLA promises, and self-serve single-region HA failover until its [release-evidence gate](#release-evidence-status) passes | You need sizing, failure-domain, rollout, or recovery planning across more than one host, or you intend to claim the gated single-region HA behavior |
| Helm chart for Kubernetes | The version pinned in the [chart release contract](/charts/release.json), from `oci://ghcr.io/durable-workflow/charts/durable-workflow` or `https://durable-workflow.github.io/charts/`, with your external database, Redis, ingress, and secret management | A repeatable production install and upgrade path for the chart's server, worker, singleton scheduler, bootstrap, service, probes, and policy resources | Bundled persistence, provider-managed infrastructure, active/active multi-region, custom operators, and self-serve single-region HA failover until its [release-evidence gate](#release-evidence-status) passes | You need provider-specific architecture, capacity, recovery, or changes outside the chart's published values contract |
| Raw Kubernetes manifests | The server repository [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) manifests, using published server images and your existing database, Redis, ingress, and secret management | Teams that already operate Kubernetes and want inspectable manifests for API, worker, scheduler, bootstrap, service, probes, config, and secrets | The separate Helm lifecycle, managed-Kubernetes provider validation, active/active multi-region, custom operators, environment-specific storage/networking/security decisions, and self-serve single-region HA failover until its [release-evidence gate](#release-evidence-status) passes | You need overlays, managed-cluster validation, provider-specific production planning, or intend to claim the gated single-region HA behavior |
| Active/passive multi-region evaluation | A validated single-node or small-cluster deployment per region, plus asynchronous database replication from active to standby and a reviewed failover/failback runbook | Support-led architecture evaluation and environment-specific rehearsal for regional disaster recovery | A proven self-serve 2.0 contract, active/active multi-region, automatic or hands-free regional failover, synchronous cross-region replication (RPO=0), cross-region active visibility or federated search, or region-pinned task queues as an engine-enforced routing axis | Before relying on cross-region replication, failover, failback, RPO, or RTO in production |
| Support-led topologies | A reviewed design based on your environment | Self-hosted active/passive or active/active multi-region, hands-free regional failover, RPO=0 cross-writer replication, duplicate scheduler runners as a steady-state topology, bespoke security/networking, private SLOs, custom overlays, migration planning | Self-serve copy/paste operation | The topology itself is part of the product risk |

The public distribution is intentionally optimized for local development,
single-node production, and small clustered deployments. Kubernetes manifests
are provided for teams that already operate Kubernetes. Active/passive
multi-region material is available as a support-led evaluation guide (see
[Active/passive multi-region](#activepassive-multi-region) below), not as a
proven self-serve 2.0 contract.
Single-region HA failover — managed-database failover, managed-Redis failover,
API-node loss, worker loss, and scheduler-runner restart inside one region —
is currently support-led while its exact-release evidence gate remains closed
(see
[Single-region high availability and failover](#single-region-high-availability-and-failover)
below). For self-hosted server deployments, active/active multi-region,
automatic regional failover, duplicate scheduler runners as a steady-state
topology, and provider-specific managed-Kubernetes validation remain
support-led because they depend on your database, cache, networking, security,
runner, and upgrade choices. The published Helm chart is a self-serve packaging
path within those same operator-owned boundaries. Cloud currently provides
single-region managed operation and recovery, not multi-region replication or
regional failover; see
[Cloud Managed Runtime](/docs/2.0/polyglot/cloud-control-plane). See the
[support boundary](/docs/2.0/support) for the commercial support model.

## Production recovery deliverables

Calling a topology "production-ready" means publishing the recovery packet for
that topology, not just starting the containers. Keep the latest evidence in
the same runbook as the deployment commands:

| Path | Minimum published recovery packet |
| --- | --- |
| Single-node production | Backup schedule, pinned image or digest, env/config snapshot location, maximum accepted restore lag, and the latest successful restore rehearsal timestamp plus verification evidence. |
| Small clustered deployment | The single-node packet plus the expected impact of losing one API node, one worker node, the scheduler/maintenance runner, Redis, or the shared database; the worker re-registration steps after restore; and the documented rolling-upgrade or stop-the-world posture for the current release. |
| Helm chart for Kubernetes | The clustered packet plus chart version, values revision, image digest, cluster-specific ingress and secret owners, and the latest chart upgrade/rollback rehearsal. |
| Raw Kubernetes manifests | The clustered packet plus the cluster-specific storage, secret, ingress, and rollout owners that must be restored or re-applied before traffic is declared healthy again. |
| Single-region HA evaluation (support-led while the release-evidence gate is closed) | The clustered or raw-manifest packet plus rehearsal evidence for managed-database failover, managed-Redis failover, API-node loss, worker loss, and scheduler-runner restart, each completing within the recovery target published in the [Single-region HA contract](#single-region-high-availability-and-failover) without acknowledged-write loss. |
| Active/passive multi-region evaluation (support-led) | The per-region packet plus the database replication and fencing design, measured replication lag, operator-owned RPO/RTO, promotion and failback runbooks, and environment-specific rehearsal evidence. |

If you cannot produce that packet on demand, treat the environment as staging
until the recovery contract is written down and rehearsed. The
[Operator Operating Envelope](/docs/2.0/operator-operating-envelope) defines
the restore order, verification pass, and rehearsal cadence those packets must
follow.

## Security, Data, And Audit Posture

Self-hosted Durable Workflow deployments inherit most security controls from
the environment you operate. Publish these facts in the same release or runbook
packet as the image tag, migration plan, and recovery evidence:

| Posture area | Honest release statement |
| --- | --- |
| Data handling | Workflow arguments, results, history, memos, search attributes, visibility labels, command context, audit rows, exception messages, and operator notes can contain customer application data. Treat search attributes and labels as operator-visible metadata, not secret storage. |
| Encryption | Use TLS for every production HTTP surface. At-rest encryption comes from your database, object storage, filesystem, queue, cache, and secret manager. The workflow package and server do not automatically encrypt each payload field. |
| Compliance | The open-source package and self-hosted server provide controls and audit evidence, not a compliance certification by themselves. Claims such as SOC 2, HIPAA, PCI, ISO, or FedRAMP belong to your own program unless a hosted offering documents otherwise. |
| Audit logs | Workflow commands, schedule audit events, history export metadata, and service-call records provide durable operational evidence. They are not a complete SIEM, DLP system, immutable external ledger, or legal-hold system unless you add those components. |
| Support | Role-scoped credentials, TLS termination, backups, restore rehearsal, and narrow self-serve topologies are documented here. Advanced identity, mTLS rollout, private networking, custom policy engines, provider compliance, and bespoke topology review are support-led unless public docs say otherwise. |

Network posture must be explicit:

- **Webhook ingress:** document the public endpoint, auth method, replay or
  idempotency strategy, timeout, payload limit, trusted proxy-header
  configuration, and secret rotation plan.
- **Worker-to-backend traffic:** use TLS verification, role-scoped worker
  credentials, namespace headers, private networking or mTLS when workers cross
  an untrusted network, and rotation that does not grant operator capabilities
  to worker tokens.
- **Operator surfaces:** place Waterline, standalone-server operator APIs, CLI
  automation endpoints, and custom admin panels behind authenticated sessions
  or role-scoped service credentials, with CSRF protection for browser
  sessions and documented proxy/TLS boundaries.

## Published images

Use published images for self-hosted server deployments:

- Docker Hub: `%%artifact.serverDockerHubImage%%`
- GitHub Container Registry: `%%artifact.serverGhcrImage%%`
- Digest pinning: `durableworkflow/server@sha256:...` or
  `ghcr.io/durable-workflow/server@sha256:...`

Use mutable tags only for local experiments. Production env files should pin a
specific version tag or digest so upgrade and rollback steps are auditable.

## Local development and internal non-production

Use the published-image Compose recipe when you want a source-free stack backed
by MySQL and Redis:

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

export %%artifact.serverTagEnv%%
export DW_AUTH_TOKEN=dev-token

docker compose -f docker-compose.published.yml up -d --wait
```

Verify the API, readiness, cluster discovery, and worker registration:

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info

curl -X POST http://localhost:8080/api/worker/register \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -d '{"worker_id":"compose-worker","task_queue":"compose","runtime":"python"}'
```

This path is safe for development and internal staging. It is not a production
security boundary: the example uses one compatibility token, default service
passwords, local named volumes, and no TLS.

## Single-node production

Use the same Compose artifact with production configuration outside source
control:

```env
%%artifact.serverImageEnv%%
SERVER_PORT=8080
APP_ENV=production
APP_DEBUG=false

DB_DATABASE=durable_workflow
DB_USERNAME=workflow
DB_PASSWORD=replace-with-random-password
DB_ROOT_PASSWORD=replace-with-random-root-password

DW_AUTH_DRIVER=token
DW_AUTH_BACKWARD_COMPATIBLE=false
DW_WORKER_TOKEN=replace-with-worker-token
DW_OPERATOR_TOKEN=replace-with-operator-token
DW_ADMIN_TOKEN=replace-with-admin-token
```

Start with that env file:

```bash
docker compose --env-file durable-workflow.prod.env \
  -f docker-compose.published.yml up -d --wait
```

Operate the host as a production service:

- Put TLS, public routing, request logging, and IP allow lists in a reverse
  proxy in front of the API container.
- Do not expose MySQL or Redis publicly.
- Use `DW_WORKER_TOKEN` for workers, `DW_OPERATOR_TOKEN` for application and
  operator traffic, and `DW_ADMIN_TOKEN` for namespace and administrative work.
- Back up the MySQL volume before every image upgrade and on a regular
  schedule. Redis should be preserved for graceful restarts, but MySQL remains
  the durable workflow-history source of truth.
- Keep the exact env file, image tag or digest, and database backup together for
  restores.

Upgrade order:

1. Back up MySQL and record the current image reference.
2. Change only `DW_SERVER_IMAGE` or `DW_SERVER_TAG`.
3. Pull the new image.
4. Run `docker compose --env-file durable-workflow.prod.env -f docker-compose.published.yml up -d --wait`.
5. Confirm `/api/ready`, `/api/cluster/info`, and worker registration before
   shifting external traffic.

The server README keeps the latest command-level Compose examples in the
[Official Image + Compose](https://github.com/durable-workflow/server#official-image--compose)
section.

## Small clustered deployments

A small cluster is a modest extension of the single-node model. The validated
self-serve contract is intentionally narrow:

- Run 2-3 stateless API containers behind a load balancer. Health,
  readiness, cluster discovery, worker registration, workflow-task polling, and
  workflow-task completion must work without sticky sessions.
- Use one shared external MySQL or PostgreSQL database for durable history.
  SQLite is single-node only and is not a clustered persistence backend.
- Use shared Redis for cache, long-poll wake signals, query-task queue locks,
  task-queue admission locks, and queue state. Redis-less multi-node mode is
  not a supported clustered contract.
- Check `GET /api/cluster/info` on each API node during rollout.
  `topology.current_shape` should remain `standalone_server`,
  `topology.current_roles` should include `api_ingress`, `control_plane`,
  `matching`, and `history_projection`, and `topology.execution_mode` should
  remain `remote_worker_protocol` for standalone server nodes. Use
  `topology.matching_role` to confirm the matching path you actually deployed:
  default nodes report `queue_wake_enabled: true`, `shape: "in_worker"`, and
  `wake_owner: "worker_loop"`, while dedicated matching rollouts flip nodes
  with `DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` to `queue_wake_enabled: false`,
  `shape: "dedicated"`, and `wake_owner: "dedicated_repair_pass"`. The same
  block should continue to advertise the intended `task_dispatch_mode`, the
  frozen routing axes in `partition_primitives`, and the current
  `backpressure_model`. See
  [Server Role Topology](/docs/2.0/polyglot/server-role-topology) for the
  field-by-field meaning of the topology manifest.
- Scale external SDK workers independently from API nodes. Workers can run on
  separate hosts or processes, but they should talk to the load-balanced API
  endpoint rather than to one sticky node.
- Configure [task queue admission](/docs/2.0/polyglot/task-queue-admission)
  for queues that protect a tenant, external API, database pool, or other
  shared downstream dependency.
- Run exactly one scheduler or maintenance process for schedule evaluation,
  activity-timeout enforcement, and history pruning.
- Run bootstrap/migrations once per rollout before new API and worker
  containers accept traffic.
- Choose a rollout posture for this release: stop-the-world (drain workers,
  stop scheduler/maintenance, replace API nodes, run bootstrap/migrations,
  then restart workers and the scheduler) or
  [rolling upgrades](/docs/2.0/rolling-upgrades) when every guarantee on
  that contract holds.
- Treat the database and Redis as the primary failure domains. The server
  containers are replaceable; the persistence and coordination layers are not.

The published self-serve recipes start in the `standalone_server` shape even
though cluster discovery also names `split_control_execution` as a supported
product topology. Treat that as one contract with different role assignments,
not as a second server product. If you pilot a more explicit role split later,
keep reading `topology.current_shape`, `topology.current_roles`, and
`topology.matching_role` from `/api/cluster/info` instead of inferring duties
from hostnames or container names. The
[Server Role Topology](/docs/2.0/polyglot/server-role-topology) page explains
those role assignments and the migration path in one place.

Every API node should use the same auth tokens or signature keys, app version,
workflow package version, payload-codec configuration, database connection, and
Redis connection. Give each API node a unique `DW_SERVER_ID` so cluster
discovery and logs can distinguish the nodes.

The unsupported boundaries are explicit: SQLite clustering, Redis-less
multi-node mode, duplicate schedulers as a steady-state topology, active/active
multi-writer databases, self-hosted hands-free regional failover,
and broad "five-nines" or "zero-downtime" SLA promises need separate
validation or support-led design before you rely on them. Active/passive
multi-region guidance is also support-led evaluation material; see
[Active/passive multi-region](#activepassive-multi-region) below.
Single-region HA failover — managed-database failover, managed-Redis failover,
API-node loss, worker loss, and scheduler-runner restart inside one region —
is a support-led evaluation contract until the release-evidence gate passes;
see
[Single-region high availability and failover](#single-region-high-availability-and-failover)
below for the engine recovery targets, the readiness rules during a failover,
and the evidence required to open that gate.

This path is self-serve when your team already has a clear VM, network,
database, cache, backup, and load-balancer model. It becomes support-led when
you need help deciding those boundaries, capacity, rollout order, or recovery
procedures.

## Helm chart for Kubernetes

The published chart targets the Server appVersion and anonymously pullable
default image recorded in the [release contract](/charts/release.json). The
[release provenance](https://durable-workflow.github.io/charts/provenance.json)
binds the chart version, appVersion, chart-source revision, package digest, and
image digest to the advertised endpoints.

Install the exact package from the OCI registry:

```bash
helm install durable-workflow \
  oci://ghcr.io/durable-workflow/charts/durable-workflow \
  --version 0.1.1 \
  --namespace durable-workflow --create-namespace \
  -f my-values.yaml
```

Or install the same package from the HTTPS chart repository:

```bash
helm repo add durable-workflow https://durable-workflow.github.io/charts/
helm repo update
helm install durable-workflow durable-workflow/durable-workflow \
  --version 0.1.1 \
  --namespace durable-workflow --create-namespace \
  -f my-values.yaml
```

Your values file must point to an external MySQL/PostgreSQL database and
external Redis, provide production credentials through existing Kubernetes
Secrets, and configure ingress/TLS for your environment. The chart does not
create persistence or provider-managed infrastructure. Pin the image by digest
when your change-control policy requires an immutable runtime identity.

Release automation installs from both commands with a clean Helm client and
rejects publication when the channels differ or when changed chart content
reuses an existing chart version. Every chart change—including a changed
appVersion or default image—therefore requires a higher chart version.

## Kubernetes manifests

The server repository includes raw manifests under
[`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) for teams
that already operate Kubernetes:

- Namespace and shared labels
- ConfigMap and Secret split
- Bootstrap/migration Job
- API Deployment and Service
- Worker Deployment
- Scheduler CronJob
- PodDisruptionBudget
- `/api/health` liveness and `/api/ready` readiness probes
- Conservative resource requests and limits

Before applying the manifests, replace the image tag with a specific published
version or digest, provide real database and Redis credentials, and wire the
ConfigMap values to the services your cluster already operates. The manifests
are intentionally raw and inspectable; they are not a Helm chart and do not
promise generic managed-Kubernetes behavior.

For a Kubernetes production rollout, prove at minimum:

```bash
kubectl -n durable-workflow wait --for=condition=complete job/durable-workflow-migrate --timeout=180s
kubectl -n durable-workflow rollout status deploy/durable-workflow-server
kubectl -n durable-workflow rollout status deploy/durable-workflow-worker
kubectl -n durable-workflow port-forward svc/durable-workflow-server 8080:8080
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_ADMIN_TOKEN" http://localhost:8080/api/cluster/info
```

Single-region HA failover — managed-database failover, managed-Redis failover,
API-node loss, worker loss, and scheduler-runner restart inside one region —
remains support-led on the raw-manifest path just as it does on the small-cluster
path while the release-evidence gate is closed. The intended contract requires
the readiness, singleton-scheduler, and shared-substrate rules in
[Single-region high availability and failover](#single-region-high-availability-and-failover)
below. Provider-specific load balancers, storage classes, network policies,
active/active multi-region, and self-hosted hands-free regional failover remain
support-led or tracked separately from the raw-manifest contract. Use the
separately versioned Helm path above when you want Helm-managed installation
and upgrades.

## Single-region high availability and failover

Single-region HA failover is currently an **unverified, support-led** contract
candidate layered on the small-cluster shape and the raw Kubernetes shape. It
targets the failure modes that the engine is designed to survive **inside one
region**: managed-database failover (RDS
Multi-AZ, Aurora cluster failover, Cloud SQL HA, Patroni promotion, etc.),
managed-Redis failover (Sentinel, Elasticache replication-group failover,
Memorystore HA, etc.), API-node loss, worker loss, and
scheduler/maintenance runner restart. Cross-region active/passive recovery is
a different, support-led evaluation; see
[Active/passive multi-region](#activepassive-multi-region) below.

The intended contract — engine behavior, readiness rules, the per-event
recovery targets, the split-brain prevention rules, and the rehearsal
acceptance test — lives in the workflow library at
[`docs/deployment/ha-failover.md`](https://github.com/durable-workflow/workflow/blob/v2/docs/deployment/ha-failover.md)
and the standalone server at
[`docs/ha-failover-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/ha-failover-validation.md).
This section is the public surface of those documents.

### Release-evidence status

No passing exact-release result is linked for the documented public server
release. The recorded released-image attempt stopped during `topology_start`
while waiting for API readiness, before any failure-matrix or recovery-bound
claim could be established. Do not treat the runner's presence, its scenario
manifest, or a deployment-specific rehearsal as evidence that the released
image has passed the full matrix. Single-region HA therefore remains
support-led.

Self-serve wording is authorized only after a source-free run uses the exact
documented server release for the image, runner, and Compose topology and
publishes a `single-region-failover-result.json` with `outcome: "pass"`,
`runner_blocked: false`, every entry in `phase_outcomes` at `status: "pass"`,
every recovery-bound verdict passing, and evidence for every required scenario
in the public
[single-region failover scenario manifest](/platform-conformance/single-region-failover-scenarios.json).
That public passing result must be linked from this status section and must name
the same server image as `%%artifact.serverDockerHubImage%%`. Until all of those
conditions hold, the recovery bounds below are evaluation targets rather than
released-image validation claims.

### Candidate topology

The intended HA contract applies when the deployment matches the small-cluster
shape or the raw-manifest shape and the operator preserves three rules:

- **One writable workflow database endpoint, always.** Managed failover
  (RDS Multi-AZ, Aurora cluster failover, Cloud SQL HA, Patroni, etc.) is
  permitted on the rule that the previous primary is fenced — revoke the
  write user, demote with `read_only=on`, sever replication, or restore from
  a known-good snapshot — before it can re-attach. A connection proxy (RDS
  Proxy, ProxySQL, PgBouncer) between the API/scheduler containers and the
  database is permitted; it does not change any guarantee, because the
  engine's contract is on the connection it sees.
- **One Redis endpoint at a time, with a documented promotion path.**
  Managed-Redis failover (Sentinel, Elasticache replication-group failover,
  Memorystore HA, etc.) is permitted. Redis is the acceleration layer, not
  the correctness substrate, so a Redis failover is a latency event, never a
  correctness event.
- **One scheduler/maintenance runner, always.** The orchestrator (Compose
  service with `deploy.replicas: 1`, systemd unit guarded by a host-level
  lease, or Kubernetes `Deployment` with `replicas: 1` and
  `RollingUpdate.maxSurge: 0`) is responsible for keeping the singleton
  invariant during restart. Duplicate scheduler runners as a steady-state
  topology are not in this contract.

### Per-event behavior and recovery targets

The intended engine contract defines bounded recovery targets for each event
class. These are not released-image guarantees while the release-evidence gate
is closed. The wall-clock recovery time the operator observes is the engine
target plus the managed service's own promotion latency.

| Event | Candidate engine behavior | Recovery target (after substrate / runner is back) |
| --- | --- | --- |
| Managed-database failover | Writes return errors and are not silently buffered. Reads return errors. `/api/ready` fails on every API node and on the scheduler. No acknowledged work is lost. | One connection-pool reconnect, plus one `task_repair` cadence (default 3s), plus one long-poll timeout (default 30s, max 60s) for in-flight pollers. |
| Managed-Redis failover | Wake signals dropped → discovery falls back to long-poll timeout. Acceleration-layer health checks go to **warning**, not error. `/api/ready` typically stays green. | Redis client reconnect interval. |
| API node loss (1 of N) | Load balancer removes the failed node within its readiness interval. In-flight requests against it fail at the LB and are retried by the client. | Load-balancer readiness interval (operator-controlled, typically 5–10s). |
| Worker loss | Tasks held by the failed worker pause until lease expiry. Other workers continue claiming their own tasks. | Lease expiry (5 min for activity tasks), plus one `task_repair` cadence. |
| Scheduler/maintenance restart | Schedule fires pause; activity-timeout enforcement pauses; history pruning pauses. All three resume on the next tick after restart. No duplicate fires occur because the runner is a singleton. | Orchestrator restart latency, plus one scheduler tick. |

### Load-balancer, readiness, and traffic-shift rules

The load balancer in front of the API nodes is the single decision point
for traffic admission during a failover:

- Wire the load balancer to **`GET /api/ready`**, not `/api/health` alone.
  `/api/health` only proves the process is serving HTTP; `/api/ready` proves
  the server can use its durable database and reports whether Redis wake
  acceleration is healthy or degraded. During a database outage `/api/ready`
  correctly fails on every node — the load balancer MUST tolerate the all-down
  state rather than fall back to a stale "last known good" roster.
- Use a check interval of 5–10 seconds and a removal threshold of 2–3
  consecutive failures.
- Do not require sticky sessions; the small-cluster smoke proves an
  external worker can poll `server-a` and complete on `server-b`.
- During a Redis-only failover, readiness remains green on every node while
  the database-backed durable paths are available. Acceleration-layer
  degradation surfaces as `checks.cache.status=warning` with
  `checks.cache.degraded_capability=long_poll_wake_acceleration`; do not
  configure the load balancer to remove nodes on that warning.

After substrate recovery, the recommended verification sequence is to wait
for at least one node's `/api/ready` to return 200, curl `/api/cluster/info`
through the load balancer with an admin token to confirm the topology
manifest, issue `POST /api/worker/register` for a probe worker through the
load-balanced endpoint, confirm exactly one scheduler runner is alive in
its orchestrator, and resume external traffic.

### Run the exact-artifact rehearsal

The server release includes a reusable baseline rehearsal intended to exercise
the full failure matrix without building product code from a checkout. The
runner and Compose topology must come from the same release tag as the server
image; do not combine a moving default-branch checkout with an arbitrary image.
On a clean host with Docker Engine, Docker Compose v2, Python 3.11 or newer, and
public registry access, run:

<!-- docs-example id="single-region-failover-exact-release" -->
```bash
export DW_SERVER_RELEASE=%%artifact.serverVersion%%
git clone --depth 1 --single-branch --branch "$DW_SERVER_RELEASE" \
  https://github.com/durable-workflow/server.git "server-$DW_SERVER_RELEASE"
cd "server-$DW_SERVER_RELEASE"
export DW_SERVER_IMAGE="durableworkflow/server:$DW_SERVER_RELEASE"
scripts/conformance/single-region-failover-published-artifacts.sh \
  --result-dir ./failover-result
```

This path deliberately derives the checkout and `DW_SERVER_IMAGE` from one
release variable. Do not override the image independently; select a different
release by changing `DW_SERVER_RELEASE` before cloning. The runner requires a
concrete public server tag or digest, pulls every
supporting image, resolves all runtime images to repository digests, and
rejects Compose build sections, product-source bind mounts, and local or
rolling server references. It starts exactly two API nodes behind one nginx
endpoint, one MySQL database, one Redis service, and one scheduler/maintenance
runner.

The resulting `single-region-failover-result.json` uses schema
`durable-workflow.v2.single-region-failover.result`. It records exact artifact
and tool versions, normalized topology, readiness transitions, measured
recovery times and bound verdicts, workflow/run/task/schedule identities, and
duplicate/loss assertions for cross-node completion, API-node loss, database
interruption, Redis interruption, worker lease loss, and singleton-scheduler
restart. External runners discover the invocation and public scenario manifest
from `GET /api/cluster/info` at `single_region_failover_contract`.

A result validates engine-visible interruption and recovery against the
released image only when it passes the release-evidence gate above. A failed,
partial, or runner-blocked result is diagnostic evidence, not validation. Even
a passing baseline does not turn a local MySQL or Redis container restart into
evidence for a cloud provider's promotion mechanism. Keep provider-native
promotion, fencing, RPO, and elapsed-time evidence alongside the baseline
result before claiming managed-service HA.

### Recovery packet additions

A small-cluster or raw-manifest deployment that claims this contract MUST
extend its recovery packet (per the
[Operator Operating Envelope](/docs/2.0/operator-operating-envelope)) with
rehearsal evidence for each event class:

- a managed-database failover that completes without acknowledged-write
  loss and within the bounded recovery time above;
- a managed-Redis failover that does not flap the load-balancer rotation,
  does not lose any acknowledged work, and surfaces
  `checks.cache.status=warning` with `long_poll_wake_acceleration` as the
  degraded capability;
- an API-node loss event that the load balancer absorbs within the
  configured readiness interval, with no acknowledged-write loss;
- a worker-loss event that preserves the durable run through lease expiry,
  reclaims it after the configured repair bound, and completes it exactly once;
- a scheduler-runner restart on a different host that fires no duplicate
  schedules and leaves no schedule unevaluated past its `next_fire_at`
  plus one tick.

While the release-evidence gate is closed, every deployment remains support-led
even if its own rehearsal passes. After a public all-phase result opens the
release gate, a deployment becomes self-serve under this contract only after
its environment-specific rehearsal evidence is recorded in the operator's
recovery packet and refreshed on the cadence the Operator Operating Envelope
publishes.

### Boundary against unsupported HA claims

The single-region HA contract is intentionally narrow. The following remain
**outside** it and continue to require a support-led design pass; the
topology itself is part of the product risk:

- active/active multi-writer database topologies;
- active/passive multi-region and automatic or hands-free regional failover
  for self-hosted topologies (the
  [next section](#activepassive-multi-region) preserves evaluation guidance);
- synchronous cross-region database replication (RPO=0);
- duplicate scheduler/maintenance runners as a steady-state topology;
- engine-enforced region-pinned task queues as a routing axis;
- provider-specific managed-Kubernetes validation beyond the published
  chart's packaging contract;
- broad "five-nines" or "zero-downtime" SLA promises beyond the bounded
  recovery times above.

The contract is *bounded recovery during named events*, not an uptime
promise that depends on the operator's database, network, and orchestrator
choices. Marketing or SLA language for self-hosted deployments MUST NOT
cross that line without dedicated validation.

## Active/passive multi-region

Active/passive multi-region is **support-led evaluation guidance**, not a
proven self-serve contract in the supported 2.0 operating envelope. Use this
section to review a candidate architecture and build an environment-specific
rehearsal with support before relying on it in production. Each region still
starts from a documented single-node, small-cluster, or raw Kubernetes path,
but those single-region contracts do not establish cross-region replication,
failover, failback, RPO, RTO, or split-brain behavior. The deeper design
material — data authority, replication assumptions,
namespace/task-queue/worker behavior, the failover and failback runbook,
fencing, and the consistency/latency tradeoffs — lives in the workflow library
at
[`docs/deployment/multi-region.md`](https://github.com/durable-workflow/workflow/blob/v2/docs/deployment/multi-region.md)
and the standalone server at
[`docs/multi-region-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/multi-region-validation.md).

The candidate shape to evaluate:

- One **active region** running the validated single-node or small-cluster
  contract: API container(s) behind a load balancer, shared external MySQL or
  PostgreSQL as the writable durable database, shared Redis, exactly one
  scheduler/maintenance runner, and external workers.
- One **standby region** holding an asynchronously replicated standby of the
  workflow database, optional standby Redis, no scheduler/maintenance
  process, and zero or more pre-provisioned API/worker containers that are
  idle until promotion.
- A **regional failover** that is explicit operator work: stop write traffic
  to the failed region, confirm replication state against the published
  RPO, promote the standby database, run any release-required migrations on
  the new primary, start the singleton scheduler/maintenance runner in the
  new active region, switch worker endpoints, switch external traffic, and
  rebuild any derived projections. There is no automatic cross-region
  cutover.
- A **failback** that runs the same sequence in reverse once the original
  region returns to service, with the recovered primary fenced (revoke
  write user, demote with `read_only=on`, sever replication, or restore
  from a known-good snapshot) before re-attaching as a standby.

Data authority and replication assumptions:

- The workflow database is the single durable source of truth and is
  region-bound: exactly one region writes to it at any given time. The
  standby region's database is a read replica until promotion. Recovery
  point objective (RPO) is the asynchronous replication lag; recovery time
  objective (RTO) is operator runbook execution time.
- Redis is region-local acceleration. Wake signals, query-task queue
  locks, and admission locks do not propagate across regions and must not
  be expected to. Each region runs its own Redis; the standby's cache is
  cold or warm at the operator's discretion and correctness does not
  depend on it being preserved across the failover.
- Visibility is served by the active region's database. Promote first,
  then read.

Namespace, task-queue, and worker-registration behavior:

- Namespaces and task queues are stored in the workflow database and
  survive promotion exactly as they were at the last replicated commit.
  They are not regionally partitioned by the engine.
- Workers in the new active region register against the local API
  endpoint after promotion. Pre-existing registrations from the failed
  region remain in the database and expire through the normal
  worker-expiry path.
- Build-id rollouts and deployment-lifecycle state survive failover
  because they live in the workflow database.

Consistency and latency tradeoffs in steady state:

- Workflow starts, signals, and updates commit against the active
  region's database; their latency is the active-region commit latency,
  and they are refused while authority is being withdrawn during a
  failover.
- Workflow-task and activity-task delivery follow the single-region
  acceleration contract inside the active region: sub-second when Redis
  is healthy, durable poll cadence otherwise.
- Schedules fire from the singleton scheduler in the active region and
  pause while no scheduler is running; fires resume from durable
  schedule rows after promotion.
- Visibility reads are read-after-write within the active region only;
  the engine does not provide cross-region read-your-writes or RPO=0.

The disaster-recovery boundary is explicit: this candidate design is not a
substitute for backups or evidence. The recovery packet documented in
[Operator Operating Envelope](/docs/2.0/operator-operating-envelope)
remains required, with replication-lag SLO, promotion-runbook latency,
last successful failover rehearsal date, and the fencing procedure for
the recovered primary added on top.

For self-hosted deployments, active/passive and active/active multi-region,
automatic regional failover, synchronous cross-region replication (RPO=0),
cross-region active visibility, and region-pinned task queues as an
engine-enforced routing axis remain
[support-led](/docs/2.0/support) because the topology itself is part of the
product risk. The current
[Cloud managed-runtime contract](/docs/2.0/polyglot/cloud-control-plane) is
single-region and does not supply those multi-region guarantees.

## Readiness contract

Use both health and readiness checks:

- `GET /api/health` proves the process is serving HTTP.
- `GET /api/ready` proves the server can use its configured runtime
  dependencies, including migrations and default namespace readiness.
- `GET /api/cluster/info` proves an authenticated client can discover build
  identity, control-plane protocol, worker protocol, payload codecs, and server
  capabilities.
- `POST /api/worker/register` proves workers can authenticate into the expected
  namespace and task queue.

Do not shift traffic based on `/api/health` alone.
