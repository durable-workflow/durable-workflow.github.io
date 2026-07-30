---
sidebar_position: 15
---

# Support

Durable Workflow is an open-source project and is free to use under the MIT license. You do not need a commercial agreement to run it, ship it, or build production systems with it.

## Community Support

The primary way to get help with Durable Workflow is through the community. Community support is best for public questions, design discussion, bug reports, and shared operational patterns.

This is the best place for:

- Usage questions
- Workflow modeling advice
- Help understanding determinism and replay
- Sharing ideas and patterns
- Reporting bugs or unexpected behavior

### GitHub Discussions

GitHub Discussions is the preferred place for longer-form questions, design discussions, and issues that may benefit others.

https://github.com/durable-workflow/workflow/discussions

### Discord

Discord is best for:

- Quick questions
- Informal discussion
- Early feedback
- Community collaboration

https://discord.gg/xu5aDDpqVy

Community support is provided on a best-effort basis and is often sufficient for development, experimentation, and many production use cases.

## Deployment Support Boundary

Durable Workflow is designed to be useful without a sales call. The public distribution is intentionally optimized for the deployment paths most teams need first:

- **Local development and internal non-production environments**  
  Run the package or standalone server locally, on a LAN, or in a shared staging environment so developers can throw workflows at it and iterate quickly.

- **Single-node production**  
  Run the standalone server on one VM, VPS, or internal host with a durable database, cache, reverse proxy, backups, and role-scoped credentials.

- **Small clustered deployments**  
  Run 2-3 stateless API containers behind a load balancer with shared external MySQL or PostgreSQL, shared Redis, independently scaled workers, and exactly one scheduler or maintenance runner.

- **Kubernetes manifests**  
  Use the provided manifests when your team already operates Kubernetes and wants a Kubernetes-native starting point.

Hosted Durable Workflow Cloud is a separate
[managed orchestration service](/docs/2.0/polyglot/cloud-control-plane). Cloud
operates its runtime, persistence, single-region placement, and recovery;
customers run SDK clients and workers. Customers do not attach a self-hosted
Server to Cloud. Multi-region replication, regional failover, and failback are
not part of the current Cloud contract.

We intentionally optimize the public distribution for local development,
single-node production, and the narrow small-cluster contract described in the
self-hosting guide. Kubernetes manifests are provided for teams that already
operate Kubernetes. The small-cluster contract supports
[rolling upgrades](/docs/2.0/rolling-upgrades) when every guarantee on that
page holds. Active/passive multi-region with operator-driven regional
failover remains support-led evaluation guidance; see
[Active/passive multi-region](/docs/2.0/deployment#activepassive-multi-region)
in the self-hosting guide. The published Helm chart is a self-serve packaging
and rollout path; custom chart changes, provider infrastructure, duplicate
schedulers, Redis-less
multi-node operation, provider failover, active/passive or active/active
multi-region, self-hosted automatic regional failover, and advanced HA
topologies remain
support-led because they require environment-specific sizing, database,
networking, security, and upgrade decisions.

See the [self-hosting deployment guide](/docs/2.0/deployment) for the
concrete support matrix, published-image Compose recipes, raw Kubernetes
manifest boundary, readiness checks, and where support-led work begins.

That boundary keeps the self-serve path simple while leaving room for deeper help when the deployment itself becomes a distributed-systems project.

## Commercial Support (Optional)

For teams that need additional assurance or maintainer-level expertise, commercial support and consultancy are available.

Using Durable Workflow does **not** require a commercial agreement, and all functionality remains fully open source regardless of whether commercial support is used.

Commercial support is intended for teams running Durable Workflow in production systems where correctness, upgrade safety, deployment topology, and long-running execution semantics matter.

## What Commercial Support Covers

Commercial support engagements are led by the project maintainer and typically include:

- **Production deployment planning**  
  Guidance on choosing between single-node, narrow small-cluster, Kubernetes, and support-led deployment models, including database, cache, reverse proxy, scheduler, and worker topology.

- **Sizing, reliability, and upgrade planning**  
  Help with capacity assumptions, backup and restore strategy, bootstrap and migration order, rollout safety, and operational runbooks.

- **Advanced topology support**  
  Support-led design work for custom Helm chart changes, provider-specific Kubernetes infrastructure, custom overlays, duplicate scheduler designs, Redis-less multi-node mode, high-availability deployments, active/passive or active/active multi-region, self-hosted automatic regional failover, and synchronous cross-region replication. The published chart remains a self-serve installation path; the [self-hosting guide](/docs/2.0/deployment#activepassive-multi-region) retains active/passive architecture and runbook material for support-led evaluation. The separate [Cloud managed-runtime contract](/docs/2.0/polyglot/cloud-control-plane) documents the hosted service's single-region placement, recovery, and connectivity boundary.

- **Security review**  
  Assistance with role-scoped credentials, network exposure, internal versus public endpoints, TLS termination, and access boundaries for operators and workers.

- **Workflow architecture & design reviews**  
  Guidance on modeling workflows correctly, including activity boundaries, signals, inbox/outbox usage, and long-running execution patterns.

- **Determinism & replay safety guidance**  
  Help identifying and avoiding non-deterministic behavior, replay issues, and subtle correctness problems that can surface over time.

- **Upgrade & versioning strategy**  
  Assistance with safe upgrades, workflow versioning, and determining when patterns like `continue-as-new` are required.

- **Debugging complex workflow behavior**  
  Support with diagnosing stuck workflows, unexpected loops, signal handling issues, and other hard-to-reason-about runtime behavior.

- **Backports & patches**  
  Access to fixes and backports for supported versions to help avoid maintaining private forks.

- **Custom integrations (by arrangement)**  
  Help integrating Durable Workflow with existing systems such as chat platforms, approval systems, internal APIs, or observability tooling.

## Who Commercial Support Is For

Commercial support is typically a good fit if you are:

- Running Durable Workflow in **production**
- Deploying the standalone server for **multiple teams or services**
- Building **long-running or human-in-the-loop workflows**
- Designing a **clustered, provider-specific or customized Kubernetes/Helm, active/passive or active/active multi-region, or self-hosted automatic-failover topology** beyond the proven single-region 2.0 operating envelope
- Operating in an environment where **correctness and upgrade safety matter**
- Looking for **maintainer-level expertise** rather than generic consulting
- Wanting to avoid forks and long-term maintenance risk

## Contact

To discuss commercial support or consultancy, please contact:

**support@durable-workflow.com**

We’re happy to start with a short introductory conversation to understand your use case and determine next steps.
