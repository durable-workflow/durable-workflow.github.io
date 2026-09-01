---
sidebar_position: 19
title: SDK Neutrality
description: Standing language-agnosticism contract that keeps Durable Workflow public surfaces buildable from a future TypeScript, Go, Java, or .NET SDK without a protocol redesign.
tags:
  - compatibility
  - protocols
  - api-stability
  - sdk
  - language-agnosticism
keywords:
  - sdk neutrality
  - language agnosticism
  - protocol neutrality
  - codec neutrality
  - typescript sdk
  - go sdk
  - java sdk
  - dotnet sdk
  - python sdk
  - php workflow package
---

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# SDK Neutrality

This page is the human-readable guide to the platform-wide SDK neutrality
contract. It enumerates the minimum neutrality rules that
every public Durable Workflow surface must satisfy and the standing
language-agnosticism audit that release reviewers apply to new server,
workflow, CLI, Waterline, and MCP surfaces.

The upstream architecture guide is published at
[`sdk-neutrality.md`](https://github.com/durable-workflow/workflow/blob/main/docs/architecture/sdk-neutrality.md).
The consumable machine-readable authority is published from this site at
[`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json) under
the schema id `durable-workflow.v2.sdk-neutrality.contract`. Its protocol and
SDK-breadth authority comes from the JSON shipped in the Workflow Composer
package at `resources/sdk-neutrality-contract.json`. The public mirror adds
current package-distribution metadata from the centralized docs artifact
tuple. The standalone Durable Workflow server re-exports the packaged base
manifest from `GET /api/cluster/info` under `sdk_neutrality_contract`. When
this page disagrees with the published JSON contract, the JSON contract wins
and the disagreement is a documentation bug.

This contract is downstream of the
[Version Compatibility](/docs/compatibility) authority (which says
*which* surfaces are public and *how* they may change) and the
[Platform Protocol Specs](/docs/platform-protocol-specs) catalog
(which says *where* the normative spec for each surface lives). It says
*what shape* those specs are allowed to take so that a future SDK outside the
current PHP, Python, and Rust roster can target them without requiring a
protocol redesign.

## Why this exists

Durable ships three first-party standalone SDKs: the PHP `durable-workflow/sdk`
package, Python `durable_workflow` package, and Rust `durable-workflow` crate.
The separate PHP `durable-workflow/workflow` package remains the embedded
Laravel engine and replay owner; it is not the framework-neutral PHP SDK.
Building or maintaining a wide first-party SDK roster is **not** a release goal.
Demand for SDKs in TypeScript, Go, Java, and .NET ecosystems has not
yet been demonstrated, and the maintenance cost of a broad official
roster is high.

What this contract protects against is a different failure mode: the
public contracts under those SDKs quietly hard-coding language-specific
assumptions. If a future TypeScript or Go SDK becomes worth
building, the work should be "write a new client against the published
wire protocol", not "redesign the protocol so another language can speak it
at all".

## Scope

| Scope key | Meaning |
| --- | --- |
| `goal` | Preserve protocol and contract neutrality so a future TypeScript, Go, Java, or .NET SDK does not require a protocol redesign to exist. |
| `non_goal` | Ship a broad official SDK portfolio. First-party SDK breadth is intentionally narrow and grows only when adoption demand justifies it. |
| `present_priority` | Python is the current highest-value non-PHP path for existing users and is treated as a priority surface for parity coverage. |
| `future_posture` | TypeScript, Go, Java, .NET and other languages are demand-driven. They have no reserved release slot, but every public contract must be shaped so a future SDK in those languages can be written without breaking the wire protocol. |

## Official SDK breadth policy

The official-SDK roster is intentionally narrow:

| Language | Posture | Published package | Conformance authority |
| --- | --- | --- | --- |
| PHP | `priority` | [`durable-workflow/sdk`](https://packagist.org/packages/durable-workflow/sdk) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json), actors `sdk_php`, `php_sdk_client`, and `php_worker` |
| Python | `priority` | <PythonPackageReleaseLink>`durable_workflow` %%artifact.pythonPublishedSdkVersion%%</PythonPackageReleaseLink> | [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json), actor `python_sdk_runtime` |
| Rust | `priority` | [`durable-workflow`](https://crates.io/crates/durable-workflow) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json), actors `rust_sdk`, `rust_worker`, and `rust_sdk_client` |
| TypeScript | `demand_driven` | None | Public contracts must remain implementable in TypeScript without protocol redesign. |
| Go | `demand_driven` | None | Public contracts must remain implementable in Go without protocol redesign. |
| Java | `demand_driven` | None | Public contracts must remain implementable in Java without protocol redesign. |
| .NET | `demand_driven` | None | Public contracts must remain implementable in .NET without protocol redesign. |

The JSON contract lists the exact `scenario_ids` that constitute coverage for
`first_party.php_sdk`, `first_party.python_sdk`, and `first_party.rust_sdk`.
It tracks the Laravel package separately as
`embedded_engines.php_workflow_engine`, with replay coverage under actor
`workflow_php_runtime`. Consumers can resolve those identifiers directly in
the linked catalogs without cloning an SDK repository or reading its test
suite.

A new first-party SDK is added only when:

1. There is documented user demand the existing SDKs cannot serve.
2. A candidate maintainer team commits to keeping the SDK on the
   conformance harness, the protocol-spec catalog, and the release
   authority manifest.
3. Adding the SDK does not require breaking changes to the worker
   protocol, control plane, history-event wire formats, or replay
   fixtures. If it would, the protocol is the bug, not the SDK.

## Neutrality rules

Every public Durable contract must satisfy each of the seven neutrality
rules below. The JSON manifest is the authority for the exact field
shapes; the summaries are for reviewers. Each rule on the JSON manifest
carries a `requirement`, `rationale`, `how_to_apply` line, and an `authority`
array. Every authority entry has a stable catalog or schema ID and an absolute
URL to its published artifact.

| Rule | Requirement |
| --- | --- |
| `protocol_neutrality` | Public RPC and event surfaces use HTTP+JSON or AsyncAPI shapes that any HTTP-capable runtime can produce and consume. |
| `codec_neutrality` | Every durable payload that crosses a public boundary advertises `avro`. No other public or engine-specific v2 codec is offered. |
| `error_shape_neutrality` | Public failure objects use a structured envelope of (`code`, `message`, optional `details`). PHP and Python exception class names are diagnostic only. |
| `type_identity_neutrality` | Workflow, activity, child workflow, and exception types are identified by stable string names. Class FQCNs and module paths are SDK-input convenience, not contract. |
| `replay_fixture_neutrality` | Replay fixtures and golden history bundles are JSON conforming to the published `history_event_payloads` and `replay_bundle` schemas. |
| `discovery_neutrality` | Every public surface is reachable from `GET /api/cluster/info` and the `platform_protocol_specs` catalog. |
| `documentation_neutrality` | Public-contract docs describe shapes in schema, route, and field semantics. PHP and Python class behaviour appears as SDK examples, not as the normative contract. |

## Standing language-agnosticism audit

Every new server, workflow, CLI, Waterline, or MCP surface must clear
the neutrality audit before promotion to `stable`. The audit is a
standing review item on the release PR for every change that touches an
audit-scoped surface family. The audit-scoped families are:

- `server_api`
- `worker_protocol`
- `cli_json`
- `waterline_api`
- `mcp_discovery_results`
- `cluster_info_manifests`

The checklist has eight steps. Seven correspond to the neutrality rules
above. The eighth — the **future-SDK thought experiment** — asks the
reviewer to describe in two sentences how a TypeScript or Go SDK would
consume the new surface using only the published spec catalog and a
standard HTTP+JSON toolchain. If the answer requires a first-party SDK,
the surface is not neutral and either the surface is reshaped or the
neutrality gap is recorded as a known limitation before promotion.

## What a future SDK relies on

The contract identifies the surfaces a future SDK must be able to read
without inspecting any first-party SDK source:

- **Protocol** — `durable-workflow.v2.control-plane-api`,
  `durable-workflow.v2.worker-protocol-api`, and
  `durable-workflow.v2.worker-protocol-stream` in the published
  [protocol catalog](https://durable-workflow.github.io/platform-protocol-specs.json).
- **Codecs** — the universal codec set documented by
  `durable-workflow.v2.worker-protocol-api` and advertised through the
  `durable-workflow.v2.cluster-info-envelope` discovery schema.
- **Error shape** — the worker-protocol failure envelope and
  `durable-workflow.v2.repair-actionability-objects` schema.
- **Replay inputs** — the `durable-workflow.v2.history-event-payloads` and
  `durable-workflow.v2.replay-bundle` JSON Schemas plus scenario IDs in the
  public [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json)
  catalog.
- **Discovery** — `durable-workflow.v2.cluster-info-envelope` and the
  `durable-workflow.v2.platform-protocol-specs.catalog` itself.

If any of those surfaces is not reachable for a candidate SDK in a
given language, building the SDK requires protocol changes and the
language-agnosticism guarantee is not being honored.

## Release gates

A release that introduces a new public surface family or promotes an
existing surface from `prerelease` or `experimental` to `stable` must
record the audit outcome on the release PR. The release-gates section
of the manifest enumerates the specific checks:

- `audit_recorded` — the release PR description states which audit
  steps were applied and links the protocol-spec catalog entry, the
  conformance fixture, and the discovery entry for the new surface.
- `no_php_or_python_only_required_fields` — no guaranteed field on a
  `stable` surface requires a PHP-only or Python-only codec.
- `universal_codec_advertised` — worker protocol negotiation advertises
  exactly one universal codec, `avro`.
- `fixture_schema_validated` — new replay fixtures or golden history
  bundles validate against the published JSON Schemas.
- `discovery_entry_present` — new public surfaces have a
  `platform_protocol_specs` catalog entry with a non-empty
  `surface_family`, `owner_repo`, and `format`.

Enforcement is split between machine and human gates. Release CI resolves every
authority URL, protocol/schema ID, and conformance scenario ID in the public
contract; cross-references the audit scope against the surface stability
families; and rejects repository-local authority paths or implementation
symbols. Release reviewers tick the SDK-neutrality audit on every release PR
that adds or promotes a public surface and remain responsible for the
future-SDK thought experiment.

## Changing this contract

Adding a neutrality rule, tightening an existing rule, adding a
required audit step, adding a surface family to the audit scope, or
changing the official-SDK breadth policy is a contract change. Bump the
manifest version, update the architecture guide and this page in the same
change, and align the consumable contract at
[`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json).
Removing a neutrality rule or audit step is a major change.
