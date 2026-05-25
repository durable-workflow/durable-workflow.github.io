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
pages instead. If you want the hosted control-plane contract above region-scoped
runtime targets, see [Cloud Control Plane](/docs/2.0/polyglot/cloud-control-plane).
The automatic-failover language in this self-hosting guide refers to
customer-operated server deployments; hosted Cloud multi-region namespace
replication v1 is documented separately on the Cloud page.

## Deployment support matrix

| Path | Start from | Supported for | Not promised by this path | Commercial support starts when |
| --- | --- | --- | --- | --- |
| Local development and internal non-production | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) with `DW_SERVER_TAG=0.2.198` or `DW_SERVER_IMAGE=durableworkflow/server:0.2.198` | One developer machine, LAN demos, shared staging, SDK and worker integration tests | Internet-facing production, durable backup guarantees, strict secret rotation, multi-node failover | You want help turning a working dev stack into a production runbook |
| Single-node production | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) with a production env file, MySQL and Redis volumes, role-scoped tokens, backups, TLS through a reverse proxy, and pinned image tags or digests | One VM, VPS, or internal Docker host with persistent workflow state and a simple operational model | Host-level HA, automatic database failover, multi-region recovery, zero-downtime major topology changes | The deployment carries production traffic and you want review of backup, restore, auth, TLS, upgrade, or rollback procedures |
| Small clustered deployment | Published `durableworkflow/server` or `ghcr.io/durable-workflow/server` images using the [Compose recipe](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) as the container/process template, with 2-3 API nodes, shared external MySQL/PostgreSQL, shared Redis, independently scaled workers, and exactly one scheduler/maintenance runner | Horizontal API and worker capacity when one node is no longer enough; rolling upgrades when every guarantee in the [rolling-upgrade contract](/docs/2.0/rolling-upgrades) holds; single-region HA failover (managed-database failover, managed-Redis failover, API-node loss, worker loss, scheduler-runner restart) when every guarantee in the [single-region HA contract](#single-region-high-availability-and-failover) holds | SQLite clustering, Redis-less multi-node mode, duplicate schedulers as a steady-state topology, active/active multi-writer databases, self-hosted hands-free regional failover, Helm, broad "five-nines" or "zero-downtime" SLA promises | You need sizing, failure-domain, rollout, or recovery planning across more than one host |
| Raw Kubernetes manifests | The server repository [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) manifests, using published server images and your existing database, Redis, ingress, and secret management | Teams that already operate Kubernetes and want inspectable manifests for API, worker, scheduler, bootstrap, service, probes, config, and secrets; the [single-region HA contract](#single-region-high-availability-and-failover) when the manifests are wired to the same readiness, singleton-scheduler, and shared-substrate rules as the small-cluster recipe | Helm charts, managed-Kubernetes provider validation, active/active multi-region, custom operators, environment-specific storage/networking/security decisions | You need Helm, overlays, managed-cluster validation, or provider-specific production planning |
| Active/passive multi-region | A validated single-node or small-cluster deployment per region, plus asynchronous database replication from active to standby and a published failover/failback runbook | Regional disaster recovery with operator-driven failover; standby database, optional standby Redis, and idle API/worker capacity in a second region; the singleton scheduler/maintenance runner pinned to the active region; the single-region HA contract inside each region | Active/active multi-region, self-hosted automatic or hands-free regional failover, synchronous cross-region replication (RPO=0), cross-region active visibility or federated search, region-pinned task queues as an engine-enforced routing axis | You need a topology beyond active/passive, an automated failover controller, or an RPO=0 cross-region commitment |
| Support-led topologies | A reviewed design based on your environment | Self-hosted active/active multi-region, hands-free regional failover outside hosted Cloud replication v1, RPO=0 cross-writer replication, duplicate scheduler runners as a steady-state topology, bespoke security/networking, private SLOs, custom overlays, migration planning | Self-serve copy/paste operation | The topology itself is part of the product risk |

The public distribution is intentionally optimized for local development,
single-node production, and small clustered deployments. Kubernetes manifests
are provided for teams that already operate Kubernetes. Active/passive
multi-region with operator-driven regional failover is a self-serve contract
(see [Active/passive multi-region](#activepassive-multi-region) below).
Single-region HA failover — managed-database failover, managed-Redis failover,
API-node loss, worker loss, and scheduler-runner restart inside one region —
is also a self-serve contract layered on the small-cluster and Kubernetes
shapes (see
[Single-region high availability and failover](#single-region-high-availability-and-failover)
below). For self-hosted server deployments, Helm charts, active/active
multi-region, automatic regional failover, duplicate scheduler runners as a
steady-state topology, and provider-specific managed-Kubernetes validation
remain support-led because they depend on your database, cache, networking,
security, runner, and upgrade choices. Hosted Cloud multi-region namespace
replication v1 is a separate Cloud-managed contract; see
[Cloud Control Plane](/docs/2.0/polyglot/cloud-control-plane). See the
[support boundary](/docs/2.0/support) for the commercial support model.

## Production recovery deliverables

Calling a topology "production-ready" means publishing the recovery packet for
that topology, not just starting the containers. Keep the latest evidence in
the same runbook as the deployment commands:

| Path | Minimum published recovery packet |
| --- | --- |
| Single-node production | Backup schedule, pinned image or digest, env/config snapshot location, maximum accepted restore lag, and the latest successful restore rehearsal timestamp plus verification evidence. |
| Small clustered deployment | The single-node packet plus the expected impact of losing one API node, one worker node, the scheduler/maintenance runner, Redis, or the shared database; the worker re-registration steps after restore; and the documented rolling-upgrade or stop-the-world posture for the current release. |
| Raw Kubernetes manifests | The clustered packet plus the cluster-specific storage, secret, ingress, and rollout owners that must be restored or re-applied before traffic is declared healthy again. |
| Single-region HA failover | The clustered or raw-manifest packet plus rehearsal evidence for managed-database failover, managed-Redis failover, API-node loss, worker loss, and scheduler-runner restart, each completing within the bounded recovery time published in the [Single-region HA contract](#single-region-high-availability-and-failover) without acknowledged-write loss. |

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

- Docker Hub: `durableworkflow/server:0.2.198`
- GitHub Container Registry: `ghcr.io/durable-workflow/server:0.2.198`
- Digest pinning: `durableworkflow/server@sha256:...` or
  `ghcr.io/durable-workflow/server@sha256:...`

Use mutable tags only for local experiments. Production env files should pin a
specific version tag or digest so upgrade and rollback steps are auditable.

## Local development and internal non-production

Use the published-image Compose recipe when you want a source-free stack backed
by MySQL and Redis:

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

export DW_SERVER_TAG=0.2.198
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
DW_SERVER_IMAGE=durableworkflow/server:0.2.198
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
multi-writer databases, self-hosted hands-free regional failover, Helm charts,
and broad "five-nines" or "zero-downtime" SLA promises need separate
validation or support-led design before you rely on them. Active/passive
multi-region with operator-driven regional failover is its own self-serve
contract; see
[Active/passive multi-region](#activepassive-multi-region) below.
Single-region HA failover — managed-database failover, managed-Redis failover,
API-node loss, worker loss, and scheduler-runner restart inside one region —
is its own self-serve contract layered on this one; see
[Single-region high availability and failover](#single-region-high-availability-and-failover)
below for the engine recovery bounds, the readiness rules during a failover,
and the rehearsal evidence that turns those bounds into a recovery packet.

This path is self-serve when your team already has a clear VM, network,
database, cache, backup, and load-balancer model. It becomes support-led when
you need help deciding those boundaries, capacity, rollout order, or recovery
procedures.

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
is the same self-serve contract on the raw-manifest path as on the small-cluster
path, provided the manifests are wired to the readiness, singleton-scheduler,
and shared-substrate rules in
[Single-region high availability and failover](#single-region-high-availability-and-failover)
below. Provider-specific load balancers, storage classes, network policies,
Helm charts, active/active multi-region, and self-hosted hands-free regional
failover remain support-led or tracked separately from the raw-manifest
contract.

## Single-region high availability and failover

Single-region HA failover is a self-serve contract layered on the small-cluster
shape and the raw Kubernetes shape. It covers the failure modes that the
engine survives **inside one region**: managed-database failover (RDS
Multi-AZ, Aurora cluster failover, Cloud SQL HA, Patroni promotion, etc.),
managed-Redis failover (Sentinel, Elasticache replication-group failover,
Memorystore HA, etc.), API-node loss, worker loss, and
scheduler/maintenance runner restart. Cross-region active/passive recovery is
a different contract; see
[Active/passive multi-region](#activepassive-multi-region) below.

The full contract — engine guarantees, readiness rules, the per-event
recovery bounds, the split-brain prevention rules, and the rehearsal
acceptance test that operators must run — lives in the workflow library at
[`docs/deployment/ha-failover.md`](https://github.com/durable-workflow/workflow/blob/v2/docs/deployment/ha-failover.md)
and the standalone server at
[`docs/ha-failover-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/ha-failover-validation.md).
This section is the public surface of those documents.

### Validated topology

The HA contract applies when the deployment matches the small-cluster shape
or the raw-manifest shape and the operator preserves three rules:

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

### Per-event behavior and recovery bounds

The engine commits to bounded recovery for each event class. The wall-clock
recovery time the operator observes is the engine bound plus the managed
service's own promotion latency.

| Event | Operator-visible behavior | Engine recovery bound (after substrate / runner is back) |
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
  the server can use its configured database and Redis. During a database
  outage `/api/ready` correctly fails on every node — the load balancer
  MUST tolerate the all-down state rather than fall back to a stale
  "last known good" roster.
- Use a check interval of 5–10 seconds and a removal threshold of 2–3
  consecutive failures.
- Do not require sticky sessions; the small-cluster smoke proves an
  external worker can poll `server-a` and complete on `server-b`.
- During a Redis-only failover, readiness MAY remain green on every node.
  Acceleration-layer degradation surfaces as **warnings** on
  `backend_capabilities` and `long_poll_wake_acceleration`; do not configure
  the load balancer to remove nodes on those warnings.

After substrate recovery, the recommended verification sequence is to wait
for at least one node's `/api/ready` to return 200, curl `/api/cluster/info`
through the load balancer with an admin token to confirm the topology
manifest, issue `POST /api/worker/register` for a probe worker through the
load-balanced endpoint, confirm exactly one scheduler runner is alive in
its orchestrator, and resume external traffic.

### Recovery packet additions

A small-cluster or raw-manifest deployment that claims this contract MUST
extend its recovery packet (per the
[Operator Operating Envelope](/docs/2.0/operator-operating-envelope)) with
rehearsal evidence for each event class:

- a managed-database failover that completes without acknowledged-write
  loss and within the bounded recovery time above;
- a managed-Redis failover that does not flap the load-balancer rotation,
  does not lose any acknowledged work, and surfaces only as warnings on
  `backend_capabilities` and `long_poll_wake_acceleration`;
- an API-node loss event that the load balancer absorbs within the
  configured readiness interval, with no acknowledged-write loss;
- a scheduler-runner restart on a different host that fires no duplicate
  schedules and leaves no schedule unevaluated past its `next_fire_at`
  plus one tick.

A deployment that has not run the rehearsal is not yet self-serve under
this contract; it remains support-led until the rehearsal evidence is
recorded in the operator's recovery packet and refreshed on the cadence
the Operator Operating Envelope publishes.

### Boundary against unsupported HA claims

The single-region HA contract is intentionally narrow. The following remain
**outside** it and continue to require a support-led design pass; the
topology itself is part of the product risk:

- active/active multi-writer database topologies;
- automatic or hands-free regional failover for self-hosted active/passive
  topologies (active/passive with operator-driven failover is the
  [next section](#activepassive-multi-region); hosted Cloud multi-region
  replication v1 is documented separately in
  [Cloud Control Plane](/docs/2.0/polyglot/cloud-control-plane));
- synchronous cross-region database replication (RPO=0);
- duplicate scheduler/maintenance runners as a steady-state topology;
- engine-enforced region-pinned task queues as a routing axis;
- Helm charts and provider-specific managed-Kubernetes validation;
- broad "five-nines" or "zero-downtime" SLA promises beyond the bounded
  recovery times above.

The contract is *bounded recovery during named events*, not an uptime
promise that depends on the operator's database, network, and orchestrator
choices. Marketing or SLA language for self-hosted deployments MUST NOT
cross that line without dedicated validation.

## Active/passive multi-region

Active/passive multi-region with operator-driven regional failover is a
self-serve contract. It extends the single-node, small-cluster, or raw
Kubernetes path per region; it does not weaken any of those contracts inside
the active region. The full contract — data authority, replication
assumptions, namespace/task-queue/worker behavior, the failover and failback
runbook, split-brain prevention, and the consistency/latency tradeoffs — lives
in the workflow library at
[`docs/deployment/multi-region.md`](https://github.com/durable-workflow/workflow/blob/v2/docs/deployment/multi-region.md)
and the standalone server at
[`docs/multi-region-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/multi-region-validation.md).

The shape this path supports:

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

The disaster-recovery boundary is explicit: this contract is a
recovery-time topology, not a substitute for backups. The recovery
packet documented in
[Operator Operating Envelope](/docs/2.0/operator-operating-envelope)
remains required, with replication-lag SLO, promotion-runbook latency,
last successful failover rehearsal date, and the fencing procedure for
the recovered primary added on top.

For self-hosted deployments, active/active multi-region, automatic regional
failover, synchronous cross-region replication (RPO=0), cross-region active
visibility, and region-pinned task queues as an engine-enforced routing axis
remain [support-led](/docs/2.0/support) because the topology itself is part of
the product risk. Hosted Cloud multi-region namespace replication v1 is scoped
separately by the [Cloud control-plane contract](/docs/2.0/polyglot/cloud-control-plane).

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
