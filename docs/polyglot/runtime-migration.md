---
title: "Moving between runtimes"
description: "Drain existing runs and move new starts between self-hosted Server deployments and Cloud."
tags:
  - migration
  - operations
  - polyglot
---

# Moving between runtimes

Move new starts to the destination while existing runs finish on their source. This procedure covers independent service-mode runtimes. A history export preserves evidence; it does not transfer a live Server-sourced run. The supported [embedded-v2 import](./embedded-to-server.md#phase-e-import-eligible-embedded-v2-runs) accepts eligible embedded sources only.

## Choose the destination {#paths}

| Move | Destination preparation |
| --- | --- |
| Self-hosted Server to another self-hosted Server | Deploy the destination with its own authoritative database, payload storage and credentials. Follow the [deployment guide](../deployment.md). |
| Self-hosted Server to Cloud | Provision the destination namespace and verify its returned runtime URL, credentials and capabilities. Follow [Cloud setup](./cloud-control-plane.md). |
| Cloud to self-hosted Server | Prepare the self-hosted destination and its SDK workers before changing application traffic. Keep the Cloud source provisioned while its runs drain. |

## Prepare both runtimes {#prepare}

Record each source endpoint, namespace, workflow instance and run ID, task queue, workflow/activity type and payload-store dependency. Preserve a tested recovery path for self-hosted storage. A Cloud move does not grant access to a database backup or copy Cloud credentials to the destination. Verify the actual destination release and capabilities, role credentials, worker registrations and advertised types.

## Switch new starts in small groups {#cutover}

1. Run the destination and its workers beside the source. Complete a uniquely identified canary with representative activities and results. Keep its side effects isolated from real business work.
2. Inventory every start producer: application calls, schedules, webhook/bridge adapters and service calls. Choose a cutover point for one workflow family. Coordinate schedule pauses and destination registration so both runtimes do not start the same occurrence.
3. Route that family’s new starts to the destination. Keep an application-owned record of which endpoint and namespace accepted each workflow. Reusing a business key on another runtime does not provide cross-runtime deduplication.
4. Keep signals, approvals, updates, queries, cancellation and result/history reads pointed at the runtime owning the run. Keep source workers, queues, timers, credentials and payload access available. Changing a client URL does not move accepted work or its activity leases.
5. Check outcomes and failures before moving the next family. If a start has an uncertain transport outcome, resolve it at the original runtime before submitting it elsewhere. A long-lived run that never reaches terminal state has not drained.

## Preserve evidence before retirement {#preserve-evidence}

Export the history you must retain, including every required continuation run, original payload bytes and codecs. Check completeness and integrity with a compatible consumer, and retain the exact producer identity. [History export and replay guidance](../testing.md#service-sdk-replay) explains the separate checks. Audit exports do not make Server-sourced runs eligible for live import.

Use the producer actually serving the export. Core 2.11.4 alone does not qualify Server, bundled CLI, SDK HTTP or Cloud exports. Follow the separate [Server HTTP producer/image qualification](https://github.com/durable-workflow/server/issues/692). Old lossy bundles remain invalid. Do not change numbers or checksums to force acceptance, and do not destroy the authoritative source while required evidence is unavailable or unverifiable.

## Retire the source last {#retire-source}

Confirm that no source-owned nonterminal runs remain across every relevant namespace and all list pages. Include waiting parents/children and runs created by remaining start producers. A healthy endpoint, an empty first page or unavailable metrics does not prove zero open work. Confirm that no callers, callbacks or workers still depend on the source and that required archives are readable.

Only then retire self-hosted resources or deprovision the Cloud runtime. Cloud capacity charges continue while it remains provisioned, including while idle or draining. Deprovisioning removes active runtime data and credentials and is not pause/resume. Use the existing plan’s returned billing terms; this procedure creates no automatic refund or billing exception.

## Roll back routing without moving runs {#rollback}

Route future starts back only to a healthy, compatible source. Runs already accepted by the destination remain destination-owned and need its workers and command routing until terminal. Preserve both ownership records and prevent duplicate starts. Do not restore old source storage over newer accepted state or resume a second live copy of a run.
