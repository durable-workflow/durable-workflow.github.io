---
sidebar_position: 5
title: Worker Compatibility and Routing
description: Keep worker build rollouts safe by pinning in-flight work to compatible executors and making rollout gaps explicit.
tags:
  - worker-protocol
  - compatibility
  - operations
  - rollouts
keywords:
  - worker compatibility
  - worker build rollouts
  - compatibility markers
  - build id routing
  - rollback workers
---

# Worker Compatibility and Routing

Use this guide when you need to deploy a new worker build, canary one task
queue, roll a bad build back, or keep long-running workflows alive through a
worker build rollout. Durable Workflow v2 treats worker compatibility as a
routing contract, not as an informal deployment convention.

The key rule is simple: a run that was started under one compatibility family
must keep landing on workers that can safely replay and execute that run. The
system must surface "no compatible worker is available" as an explicit
operational state instead of silently handing the task to a different build.

## Two related identities

Durable Workflow exposes two related but different rollout surfaces:

- **Build id** is the operator-facing cohort identity on the standalone server.
  It is the value a worker registers as `build_id`, and it is what
  task-queue rollout APIs drain or resume.
- **Compatibility marker** is the routing identity for in-flight work. In
  embedded and server-hosted PHP workers it comes from
  `DW_V2_CURRENT_COMPATIBILITY` and
  `DW_V2_SUPPORTED_COMPATIBILITIES`. On the standalone server, build-id
  cohorts are the operator-facing way to inspect and control those compatible
  worker groups.

Treat both values as opaque strings such as `orders-2026-04-28` or
`api-v3`. Durable Workflow does not interpret semver, compare dates, or guess
that one string is newer than another.

## What gets pinned

Compatibility is attached to durable workflow work, not just to live worker
processes.

- **Workflow start** records the current compatibility family on the new run.
- **Workflow tasks** inherit that compatibility family and keep it through
  retries, lease expiry, and redispatch.
- **Activity tasks** inherit the same compatibility family as their parent run.
- **Retry runs** keep the source run's compatibility family.
- **Continue-as-new** keeps the current run's compatibility family.
- **Child workflows** inherit the parent run's compatibility family.

This means a long-running workflow does not drift onto a different executor
family just because a deployment changed. New builds affect new starts unless
you deliberately drain old cohorts and move traffic.

## How routing works

Compatibility enforcement happens at more than one layer.

### Poll-time narrowing

Workers narrow what they ask for by task queue and compatibility/build cohort
so the server or embedded engine can avoid offering obviously incompatible
tasks first.

This is an efficiency hint, not the final safety boundary.

### Claim-time enforcement

Claim-time enforcement is the correctness boundary. If a worker cannot safely
run a task, Durable Workflow rejects the claim with an explicit compatibility
reason instead of silently reassigning ownership.

That is the contract to rely on during compatibility-affecting deploys:

- tasks are never silently widened to an incompatible worker
- lease expiry and redelivery preserve the original compatibility family
- a missing compatible worker is observable state, not undefined behavior

## What operators should configure

Use stable, human-readable compatibility families for builds that can safely
replay the same in-flight workflows.

For embedded or server-hosted PHP workers, set:

```bash
DW_V2_CURRENT_COMPATIBILITY=orders-2026-04-28
DW_V2_SUPPORTED_COMPATIBILITIES=orders-2026-04-28,orders-2026-04-21
```

`DW_V2_CURRENT_COMPATIBILITY` names the family new runs are pinned to.
`DW_V2_SUPPORTED_COMPATIBILITIES` names the families this worker may still
claim while a rollout or rollback is in progress. Use `*` only for
single-build fleets or narrow test harnesses; do not use it to hide an
uncertain rollout policy.

For standalone-server workers, register a stable `build_id` and use the
build-id rollout APIs to drain or resume cohorts intentionally.

## Safe rollout pattern

Use this sequence for compatibility-affecting worker changes:

1. Start the new worker cohort with a new build id or compatibility marker.
2. Keep the old cohort live until you confirm the new cohort can claim work.
3. Drain the old cohort so it stops taking new tasks but can finish or release
   what it already leased.
4. Watch the compatibility and task-queue surfaces until the old cohort is no
   longer needed.
5. Resume the old cohort only if you need to roll back.

Keep the compatibility family stable across replay-compatible rebuilds. Change
it only when the new workers must no longer claim tasks created by the older
family.

## Explicit missing-worker state

When no worker can satisfy the required compatibility family, Durable Workflow
must show that plainly:

- worker fleet summaries show that required compatibility is not covered
- task-queue and rollout surfaces show which build cohorts are still active,
  draining, stale, or gone
- workflow diagnostics surface that the run is waiting for a compatible worker
- operator health and metrics expose compatibility-blocked work as a named
  condition

This is the expected signal during a partial rollout or an incomplete rollback.
Treat it as a real operating condition to fix, not as a random transient.

## How this relates to build-id rollouts

Build-id rollout state and compatibility routing solve different problems:

- **Build-id rollout** tells operators which worker cohorts are live and lets
  them drain or resume those cohorts intentionally.
- **Compatibility routing** decides whether a specific in-flight task is
  eligible to run on a specific worker.

You usually use both together. Build-id cohorts tell you which executors are
available; compatibility routing makes sure long-running work only lands on a
compatible cohort.

## Related references

- [Namespace, Auth, And Worker Registration](/docs/2.0/polyglot/namespace-auth-workers)
  for the worker registration payload, including `build_id`
- [Worker Build-Id Rollout](/docs/2.0/polyglot/worker-build-id-rollout) for
  drain/resume lifecycle on one task queue
- [Server Config Reference](/docs/2.0/polyglot/server-config-reference) for
  `DW_V2_CURRENT_COMPATIBILITY`,
  `DW_V2_SUPPORTED_COMPATIBILITIES`, and related config
- [Operator Operating Envelope](/docs/2.0/operator-operating-envelope) for
  the health, metrics, and run diagnostics that expose compatibility gaps
