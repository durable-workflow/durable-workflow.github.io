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
pages instead.

## Deployment support matrix

| Path | Start from | Supported for | Not promised by this path | Commercial support starts when |
| --- | --- | --- | --- | --- |
| Local development and internal non-production | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) with `DW_SERVER_TAG=0.2` or `DW_SERVER_IMAGE=durableworkflow/server:0.2` | One developer machine, LAN demos, shared staging, SDK and worker integration tests | Internet-facing production, durable backup guarantees, strict secret rotation, multi-node failover | You want help turning a working dev stack into a production runbook |
| Single-node production | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) with a production env file, MySQL and Redis volumes, role-scoped tokens, backups, TLS through a reverse proxy, and pinned image tags or digests | One VM, VPS, or internal Docker host with persistent workflow state and a simple operational model | Host-level HA, automatic database failover, multi-region recovery, zero-downtime major topology changes | The deployment carries production traffic and you want review of backup, restore, auth, TLS, upgrade, or rollback procedures |
| Small clustered deployment | Published `durableworkflow/server` or `ghcr.io/durable-workflow/server` images using the [Compose recipe](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) as the container/process template, with 2-3 API nodes, shared external MySQL/PostgreSQL, shared Redis, independently scaled workers, and exactly one scheduler/maintenance runner | Horizontal API and worker capacity when one node is no longer enough; rolling upgrades when every guarantee in the [rolling-upgrade contract](/docs/2.0/rolling-upgrades) holds | SQLite clustering, Redis-less multi-node mode, duplicate schedulers, multi-region operation, Helm, provider-specific failover, broad HA/SLA guarantees | You need sizing, failure-domain, rollout, or recovery planning across more than one host |
| Raw Kubernetes manifests | The server repository [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) manifests, using published server images and your existing database, Redis, ingress, and secret management | Teams that already operate Kubernetes and want inspectable manifests for API, worker, scheduler, bootstrap, service, probes, config, and secrets | Helm charts, managed-Kubernetes provider validation, advanced HA, multi-region, custom operators, environment-specific storage/networking/security decisions | You need Helm, overlays, managed-cluster validation, high availability, or provider-specific production planning |
| Support-led topologies | A reviewed design based on your environment | Advanced HA, multi-region, bespoke security/networking, private SLOs, custom overlays, migration planning | Self-serve copy/paste operation | The topology itself is part of the product risk |

The public distribution is intentionally optimized for local development,
single-node production, and small clustered deployments. Kubernetes manifests
are provided for teams that already operate Kubernetes. Helm charts, advanced
HA, multi-region, and provider-specific managed-Kubernetes validation are
support-led because they depend on your database, cache, networking, security,
runner, and upgrade choices. See the [support boundary](/docs/2.0/support) for
the commercial support model.

## Published images

Use published images for self-hosted server deployments:

- Docker Hub: `durableworkflow/server:0.2`
- GitHub Container Registry: `ghcr.io/durable-workflow/server:0.2`
- Digest pinning: `durableworkflow/server@sha256:...` or
  `ghcr.io/durable-workflow/server@sha256:...`

Use mutable tags only for local experiments. Production env files should pin a
specific version tag or digest so upgrade and rollback steps are auditable.

## Local development and internal non-production

Use the published-image Compose recipe when you want a source-free stack backed
by MySQL and Redis:

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

export DW_SERVER_TAG=0.2
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
DW_SERVER_IMAGE=durableworkflow/server:0.2
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

Every API node should use the same auth tokens or signature keys, app version,
workflow package version, payload-codec configuration, database connection, and
Redis connection. Give each API node a unique `DW_SERVER_ID` so cluster
discovery and logs can distinguish the nodes.

The unsupported boundaries are explicit: SQLite clustering, Redis-less
multi-node mode, duplicate schedulers, multi-region deployments, Helm charts,
provider-specific failover, and broad HA/SLA promises need separate
validation or support-led design before you rely on them.

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

Provider-specific load balancers, storage classes, network policies, managed
database failover, Helm charts, multi-region, and advanced HA are support-led or
tracked separately from the raw-manifest contract.

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
