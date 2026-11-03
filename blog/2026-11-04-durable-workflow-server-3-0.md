---
slug: durable-workflow-server-3-0
title: "Durable Workflow Server 3.0: One Native Process"
description: "Server 3.x is a native (Rust) implementation of the standalone Durable Workflow Server. It runs as one container plus a database. You no longer deploy Redis, a queue worker, a scheduler or a bootstrap job."
authors: [richard]
tags: [server, self-hosting, rust, release]
draft: true
---

import ProductPromotion from '@site/src/components/ProductPromotion';

{/*
  Release-day checklist:
  - The Server version is written as the literal 3.0.3 in the prose, the
    commands and the Compose URL. Replace every occurrence if the release
    number changes.
  - Merge docs PR #426 first. This post links to its native install guides.
  - Confirm PHP SDK 3.8.1 is published (it fixes activities with heartbeat
    timeouts; do not recommend 3.8.0).
  - Remove `draft: true` to publish.
*/}

Durable Workflow Server 3.0 is a native implementation of the standalone
Server, written in Rust. It runs as a single process. You give it a database
and a token. It creates its own schema, serves the API, and fires durable timers
and schedules itself. You no longer deploy Redis, a queue worker, a scheduler or
a bootstrap job alongside it.

Your workflows do not change. The native Server implements the same HTTP control
plane and worker protocol, so existing PHP, Python and Rust workers connect to
it as before.

<!-- truncate -->

## What changed, and why

PHP Server 2.x ran the PHP workflow engine behind the Server's HTTP boundary.
That design worked, but a production installation had five moving parts beside
the database: the API server, a queue worker, a scheduler, a one-time bootstrap
job and Redis. Each one had to be sized, monitored, restarted in the right order
and described in a runbook.

The native Server replaces all of that with one process:

- On first start it creates its schema and the `default` namespace.
- The same process fires durable timers and schedules and runs the maintenance
  passes, including activity-timeout enforcement. These keep running while SDK
  workers are stopped.
- It stores data in SQLite (the default), MySQL, MariaDB or PostgreSQL.
- It uses token authentication. A shared `DW_AUTH_TOKEN` is required, and the
  Server refuses to start without one. You can add role-scoped worker,
  operator and admin tokens so that each client gets only the access it needs.

We did not set out to design a new architecture. The goal of the rewrite,
tracked in [server#325](https://github.com/durable-workflow/server/issues/325),
was a new major version of the same product, with the same API, behavior and
data. Before release, we ran the same shared corpus of 97 fixture cases against
the published PHP Server 2.11.8 image, embedded Laravel and the native 3.0.0
image. All three passed every case. That shows the behavior matches. It is not a
performance claim, and this post does not publish benchmark numbers.

PHP Server 2.x is frozen at 2.11.8, its final release. Embedded Laravel
Workflow is unaffected and remains a first-class way to run Durable Workflow.

## Try it in two minutes

All you need is Docker. The commands below start the Server with SQLite in a
named volume and a local development token. The API listens on loopback only:

```bash
export DW_SERVER_IMAGE=durableworkflow/server:3.0.3
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-quickstart

docker rm -f durable-workflow-server >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 127.0.0.1:8080:8080 \
  -v durable-workflow-quickstart:/app/database \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE"

until curl -sf http://localhost:8080/api/ready >/dev/null; do sleep 1; done
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info
```

Cluster info should report `"implementation":"rust"` and version `3.0.3`. Next,
go to [step 3 of the quickstart](/docs/quickstart/#choose-one-language) and run
a workflow with the PHP, Python or Rust SDK. Use `dev-token` only for this local
exercise. When you are done, remove the container and the volume:

```bash
docker rm -f durable-workflow-server
docker volume rm durable-workflow-quickstart
```

### Compose with MySQL

The published Compose file runs the native Server with MySQL. Download it from
the release and pin the image version:

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/3.0.3/docker-compose.published.yml

export DW_SERVER_IMAGE=durableworkflow/server:3.0.3
export DW_AUTH_TOKEN=dev-token

docker compose -f docker-compose.published.yml up -d --wait
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info \
  | jq '{version, implementation}'
```

Compose refuses to start until `DW_AUTH_TOKEN` is set, and it publishes the API
on `127.0.0.1` only. For single-node production, the
[deployment guide](/docs/deployment/) covers the env file, backups, TLS through
a reverse proxy and upgrades. All Server settings are listed in the
[configuration reference](/docs/polyglot/server-config-reference/).

### Image tags

Native releases are published to the same repositories as before:
`durableworkflow/server` on Docker Hub and `ghcr.io/durable-workflow/server`.
The rolling `3` and `latest` tags now follow native releases. The `2` tag stays
on PHP 2.11.8. If you run PHP Server from `latest`, pin `2.11.8` or an image
digest today. A native Server refuses to start against a PHP-owned database
and leaves it untouched, but an accidental pull would still leave you without a
running Server.

### Kubernetes

Helm chart 1.x runs the native Server by default. It renders one Server Deployment and no
worker, scheduler, migration Job or Redis. You supply an external MySQL,
MariaDB or PostgreSQL database, because the chart refuses SQLite, and you
provide the tokens through Kubernetes Secrets. Running more than one replica
requires a ReadWriteMany volume for external payload storage. The chart is
still marked beta. An existing PHP release never switches to native on an
ordinary upgrade: the chart refuses to upgrade it until you set `runtime`
explicitly. See [Helm chart for Kubernetes](/docs/deployment/#helm-chart-for-kubernetes).

## Moving from PHP Server 2.x

The native Server never converts a database when it starts. You move an
existing PHP database to native once, with an explicit, one-way takeover:

1. Upgrade to PHP Server 2.5.14 or later, which adds an ownership fence. Then
   stop every PHP role that can write: the API server, queue workers, the
   scheduler and any bootstrap job.
2. Inspect the stopped database with the native image's read-only
   `upgrade-inspect` commands.
3. Back up the database and restore the backup into a separate database. Run
   `upgrade-fingerprint` on both. The two digests must match.
4. Run `upgrade-takeover` with that digest. Before it changes anything, it
   refuses if the database was written after your backup, or if the database
   holds state that the native Server cannot carry over.
5. Start the native Server. From then on, PHP refuses to run against that
   database.

There is no rollback to PHP after takeover, apart from restoring your verified
backup into a new database. Takeover recognizes PHP database layouts from
2.5.14 through 2.11.8 and refuses any other database before changing it.
Databases created by PHP 2.8.0 through 2.11.8 are tested end to end on SQLite,
PostgreSQL, MySQL and MariaDB. It also refuses, without changing anything, a
database that holds external payload references, workflow-to-workflow
messages, pending service-call work, or schedules that use search attributes or
Laravel queue routing. Rehearse the takeover on a restored copy of your backup
first. Takeover is planned for deprecation in the 3.1.x line, so move from PHP
while you are on 3.0.x. Follow the
[native takeover runbook](https://github.com/durable-workflow/server/blob/3.0.3/docs/rust-server-upgrade-takeover.md)
step by step.

## SDK support

The native Server implements worker protocol 1.20, the version the current SDKs
use. These SDK releases declare support for native Server 3.x:

| SDK | Release | Declares native Server 3.x support from |
| --- | --- | --- |
| [PHP](/docs/polyglot/php/) (`durable-workflow/sdk`) | 3.8.1 | 3.0.0 |
| [Python](/docs/polyglot/python/) (`durable-workflow`) | 2.13.0 | 3.0.0 |
| [Rust](/docs/polyglot/rust/) (`durable-workflow` crate) | 4.10.3 | 3.0.2 |

Server 3.0.3 meets all three declarations.

## What isn't there yet

Some things are not yet available in the native Server:

- **No server-side admission control or quotas.** Task-queue lease and dispatch
  caps, namespace request admission and namespace durable-state quotas have
  not been implemented on native yet
  ([server#982](https://github.com/durable-workflow/server/issues/982)). If one
  of these limits is configured, the Server refuses to start rather than
  silently ignoring it. Until then, limit task concurrency with each SDK
  worker's slots and the number of workers you run.
- **No published high-availability evidence.** No failover rehearsal has been
  published for the native Server, and `/api/cluster/info` reports
  `single_region_failover_contract: false`. The validated small-cluster and
  HA failover contracts remain PHP 2.x contracts. To run more than one native
  replica, use the Helm chart. Single-region HA is available only as a
  support-led design. The
  [deployment support matrix](/docs/deployment/#deployment-support-matrix)
  shows what each path supports and what it does not promise.
- **External payloads are stored on local disk only.** The native Server has
  no S3 transport yet.
- **Token authentication only.** The native Server refuses the 2.x HMAC
  `signature` driver.
- **Open protocol gaps.** Task-delivery offers
  ([server#931](https://github.com/durable-workflow/server/issues/931)),
  durable signal and update command keys
  ([server#934](https://github.com/durable-workflow/server/issues/934)) and the
  `abandon` activity cancellation policy
  ([server#971](https://github.com/durable-workflow/server/issues/971)) are
  still open. The [release notes](https://github.com/durable-workflow/server/releases)
  for each version list its known issues.

If one of these gaps blocks you, comment on the issue. That helps us decide what
to build next.

## Or let us run it

Durable Workflow Cloud runs the Server for you. Cloud operates the runtime,
persistence and recovery for a managed namespace. Your existing PHP, Python or
Rust workers connect to it with role-scoped credentials. Cloud is in early
access, and the request form lets you ask to join the launch cohort. If you would rather not
operate a database, backups and upgrades yourself,
[request early access](https://cloud.durable-workflow.com/early-access#source=blog-native-server-3-0).

<ProductPromotion source="blog-native-server-3-0">
Skip operating the Server yourself: Cloud runs the runtime and persistence for
a managed namespace, and the same SDK workers connect with role-scoped
credentials.
</ProductPromotion>
