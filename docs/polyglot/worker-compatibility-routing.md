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

## Definition fingerprint evolution {#definition-fingerprint-evolution}

**Released support.** Server 2.9.9 and PHP SDK 2.5.4, Python SDK 2.6.2 and Rust SDK 3.5.6 introduced the entry safeguards and routing/recovery behavior below. These are minimum feature versions; install current stable releases for security fixes.

The original build pin and the definition fingerprint answer different questions. A replay-compatible rebuild can keep the same build family while changing its source fingerprint. By default, the Server prefers an eligible worker with the fingerprint recorded at `WorkflowStarted`. If none remains, a changed definition can claim the original only when its worker advertises `workflow_entry_arguments_validation`. That capability promises pre-entry refusal without failing the business run. It is not inferred from the runtime language or protocol version, and manually adding the string does not make an unsafe worker implementation safe.

Fallback still requires the original namespace, task queue, workflow type, build and replay capabilities. The run keeps its recorded fingerprint and admission snapshots. The SDK must validate original entry input and replay committed commands; a source change, version marker or successful registration is not proof that this replay will succeed. Restart changed code with a new worker id, because an active registration cannot change its advertised fingerprint.

Run detail, selected-run debug, repair responses and task-queue detail expose `definition_routing`:

| Status | Meaning and action |
| --- | --- |
| `matching_definition_available` / `matching_definition_preferred` | Eligible recorded-definition capacity is available or preferred over the changed worker. |
| `replay_required` | A capable changed definition may claim. Entry validation and strict replay still have to succeed. This is not a blocked verdict. |
| `entry_validation_unavailable` | The replacement lacks the entry-validation capability. Upgrade the SDK or restore the recorded definition. |
| `no_eligible_worker` / `worker_definition_missing` / `recorded_definition_missing` | Inspect missing capacity or fingerprint information while preserving original routing guards. |
| `pinning_disabled` | The matching-source preference is disabled; other claim and replay guards still apply. |

`blocked = true` describes a due ready workflow task without an eligible definition route. Queue detail samples at most ten runs and reports whether more ready runs exist; it is not a complete count of all passive or blocked runs. Repair cannot manufacture a matching worker or rewrite history. After a genuine entry refusal, follow the [same-original recovery procedure](../failures-and-recovery.md#service-entry-recovery).

`DW_V2_PIN_TO_RECORDED_FINGERPRINT=false` removes the matching-source preference. It does not clear build pins, namespace/queue/type boundaries, registration identity, lease fencing or strict replay checks. It is not a substitute for the safe SDK and default-path upgrade. Older runtimes can silently strand a changed definition or retry an unclassified entry refusal; use the exact qualified runtime/SDK combination.

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
