---
sidebar_position: 5
title: Worker Compatibility and Routing
description: Preserve original run pins while promoting new starts and inspecting missing compatible workers.
tags: [worker-protocol, compatibility, operations, rollouts]
keywords: [worker compatibility, worker build rollouts, compatibility markers, build id routing, rollback workers]
---

# Worker Compatibility and Routing

Compatibility is a routing contract. Keep workers that can replay existing
histories available while changing which build receives new workflow starts.
Draining a build does not transfer its runs to a different build.

## Two related identities {#two-related-identities}

- **Build id** is the standalone Server cohort's registered `build_id`, scoped
  to a namespace and task queue. Promotion, drain and resume operate on this cohort.
- **Compatibility marker** is recorded on durable work. Embedded PHP uses
  `DW_V2_CURRENT_COMPATIBILITY` and `DW_V2_SUPPORTED_COMPATIBILITIES`; standalone
  worker build ids provide the corresponding routing identity.

Treat identities as opaque strings. A newer-looking name does not establish
replay compatibility or authorize an existing run to change its pin.

## What gets pinned {#what-gets-pinned}

The standalone Server selects the pin for new starts from explicit promotion,
then its single-active-cohort fallbacks; ambiguous starts can be unpinned.
See [the selection order](/docs/polyglot/worker-build-id-rollout#canary-a-new-build).

Workflow tasks and activities inherit the run's compatibility. Task retries,
lease expiry and redispatch preserve it. Retry runs, children and
continue-as-new also inherit the original pin. Promotion affects subsequent
new instances; it does not move a continuing chain to the new build.

## How routing works {#how-routing-works}

### Poll-time narrowing {#poll-time-narrowing}

Workers request a namespace, task queue and compatible build cohort. Poll-time
selection avoids offering incompatible work, but is not the final authority.

### Claim-time enforcement {#claim-time-enforcement}

The claim checks the task's original compatibility and worker identity. An
incompatible worker cannot gain its lease merely because another build is
absent. Lease expiry does not widen that compatibility.

## What operators should configure {#what-operators-should-configure}

For embedded PHP, configure the current and explicitly supported families:

```bash
DW_V2_CURRENT_COMPATIBILITY=orders-2026-04-28
DW_V2_SUPPORTED_COMPATIBILITIES=orders-2026-04-28,orders-2026-04-21
```

The first value pins new embedded runs; the second permits claims for those
families. Use `*` only with a deliberately verified compatibility policy.
For standalone workers, register a stable `build_id` and use the Server's
promotion and lifecycle controls. Keep a family stable across replay-compatible
rebuilds; changing a label does not make incompatible workflow code replay safely.

## Safe rollout pattern {#safe-rollout-pattern}

1. Deploy and inspect the new cohort's namespace, queue, supported workflow
   types and fresh registrations. Keep the old cohort available.
2. Explicitly promote the desired build for subsequent new starts. Worker
   counts do not define a percentage traffic split.
3. Keep compatible capacity for existing pinned runs, including passive runs
   waiting for a timer, signal, activity or child.
4. Drain only when intentionally stopping that cohort's new claims. If an
   early drain strands work, resume and restore the original compatible build.
5. To roll back new starts, restore/resume and promote the known-good cohort,
   then roll back the bad deployment. Existing pins remain unchanged.

Zero pending workflow tasks does not establish safe retirement. Retain the
artifact and recovery path while any pinned run or inherited chain can need
it. [Server #519](https://github.com/durable-workflow/server/issues/519) tracks
the separate guarded retirement capability; this checklist does not deliver it.

## Explicit missing-worker state {#explicit-missing-worker-state}

Inspect [per-cohort pending workflow tasks](/docs/polyglot/worker-build-id-rollout#pending-workflow-tasks-by-cohort),
fresh/draining/stale registrations and the original run pin together.
`no_compatible_worker` identifies pending workflow work for a non-null build
with no active compatible worker. It does not count activity queues or all
passive pinned runs. A missing field, failed request or stale heartbeat is not
an empty fleet or a zero backlog. Restore the matching build or investigate
its queue, namespace and workflow-type declarations before adding unrelated workers.

## How this relates to build-id rollouts {#how-this-relates-to-build-id-rollouts}

Rollout state describes registered capacity and new-start/lifecycle intent;
compatibility determines whether a specific original task can be claimed.
Use both. Neither a drain nor a rollback rewrites durable compatibility or
proves that a build can be removed.

## Related references {#related-references}

- [Namespace, Auth, And Worker Registration](/docs/polyglot/namespace-auth-workers)
- [Worker Build-Id Rollout](/docs/polyglot/worker-build-id-rollout)
- [Server Config Reference](/docs/polyglot/server-config-reference)
- [Operator Operating Envelope](/docs/operator-operating-envelope)
