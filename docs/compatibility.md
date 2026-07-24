---
sidebar_position: 17
title: Version Compatibility
description: Canonical compatibility and release-authority contract for Durable Workflow public surfaces.
tags:
  - compatibility
  - operations
  - protocols
  - api-stability
keywords:
  - version compatibility
  - compatibility authority
  - release authority
  - stability levels
  - protocol manifests
  - control plane version
  - worker protocol version
  - surface stability contract
---

# Version Compatibility

This page is the **canonical compatibility and release-authority contract** for
the Durable Workflow public platform. It is the single source of truth for:

- which surfaces are public,
- the stability level of each public surface,
- which changes may ship in a patch, minor, or major release,
- whether a given field is part of the contract or is diagnostic-only,
- and the runtime version-negotiation protocol clients use to fail closed when
  the server advertises a surface they cannot speak.

Per-package stability documents (for example `docs/api-stability.md` in the
`durable-workflow/workflow` repository, the `dw` CLI reference, the Waterline
operator API page) are **downstream** of this page. They add per-package
detail under these rules; when a per-package document and this page disagree,
this page wins, and the disagreement is a bug in the per-package document.

The same contract is published in machine-readable form so SDKs, server
manifests, and CI gates can validate themselves against one source of truth:

- `surface_stability_contract` in the response body of
  `GET /api/cluster/info` on the standalone Durable Workflow server, schema
  `durable-workflow.v2.surface-stability.contract`, version `4`.
- A frozen mirror of the same manifest in this repository at
  `static/compatibility-contract.json`.
- The PHP class `Workflow\V2\Support\SurfaceStabilityContract`, which is
  the in-process source the server re-exports.

Artifact-channel admission is governed separately by
[`/public-artifact-release-policy.json`](pathname:///public-artifact-release-policy.json).
This independently reviewed policy controls which 2.0 channels may become the
canonical public tuple.

A release that changes any surface listed below — its stability level, its
field set, its breaking-change rules — must update this page, the JSON
mirror, the PHP manifest, and any per-package stability document in the same
change. Docs CI validates the machine-readable contract, artifact release-phase
policy, released Rust metadata when available, and worker-protocol specs.
Editorial alignment between this page and the manifest remains an explicit
release-review responsibility.

## Companion: Platform Protocol Spec Catalog

This page says *which* surfaces are public and *how* they may change.
The companion [Platform Protocol Specs](/docs/2.0/platform-protocol-specs)
catalog says *where* the normative machine-readable specification for
each surface lives, *which format* the spec uses (OpenAPI for HTTP APIs,
JSON Schema for object families, AsyncAPI for event-stream semantics),
*which repository* owns the spec, which object families it governs, and
which public URL resolves the artifact. SDK authors, agents, and operators
should validate against the spec catalog rather than re-reading prose or
depending on repository-local implementation details.

The catalog has its own machine-readable mirror at
`platform_protocol_specs` in `GET /api/cluster/info` (schema
`durable-workflow.v2.platform-protocol-specs.catalog`, version `15`) and
at the public
[JSON catalog](https://durable-workflow.github.io/platform-protocol-specs.json).
Every catalog entry's `surface_family` must exist in the contract above;
docs-site CI validates the catalog, resolves each public spec URL, and rejects
repository-local authority fields.

Every required platform protocol catalog entry is marked `published`; the
invocable carrier entry remains `in_progress`. Every available entry links
directly to a public OpenAPI, AsyncAPI, or JSON Schema document. The
[`cluster_info_envelope`](/docs/2.0/platform-protocol-specs#cluster-info-envelope-notes)
schema pins the discovery surface every other catalog entry can be
reached from.

## Stability Levels

Every public surface in Durable Workflow carries exactly one of these
stability levels. Levels are explicit; a surface that is not classified is
not public.

| Level | Meaning | When breaking changes are allowed |
|-------|---------|-----------------------------------|
| `frozen` | Wire-format or persisted shape that must decode the same way for the workflow lifetime. Renaming, removing, or repurposing a field is a protocol break, never a minor change. | Only by introducing a **parallel primitive** with a new type name. The original shape stays decodable indefinitely. |
| `stable` | Public surface covered by the platform semver guarantee. Additive changes ship in minor releases. | Major release only. |
| `prerelease` | Public surface that is feature-complete but still allowed to change before the matching `1.0.0` / `2.0.0` cut. | In clearly labelled prerelease versions; called out in release notes. |
| `experimental` | Public-but-unstable surface. May change in any release, including patch releases. Callers must opt in by reading the experimental flag on the surface. | Any release; release notes call out the change. |

## Public Surface Families

This is the complete list of public surface families. Adding, removing, or
re-classifying a family requires a contract change (`SurfaceStabilityContract`
version bump, this page, and the JSON mirror in the same commit).

| Family | Stability | Authority manifest in `/api/cluster/info` | What it covers |
|--------|-----------|-------------------------------------------|----------------|
| `server_api` | `stable` | `control_plane` | Standalone server HTTP API: control-plane routes, namespace routes, schedule routes, system routes, plus `/api/health`, `/api/ready`, `/api/cluster/info`. Per-route version is governed by `control_plane.request_contract` and `control_plane.response.contract`. The top-level server `version` is build identity, not the client compatibility authority. |
| `worker_protocol` | `stable` | `worker_protocol` | Worker-plane HTTP API used by external SDK workers to register, poll, heartbeat, manage worker-session leases, complete, and fail workflow, activity, and query tasks. Includes the `worker_sessions` and `local_activities` runtime contracts, `external_execution_surface_contract`, `external_executor_config_contract`, `invocable_carrier_contract`, `external_task_input_contract`, and `external_task_result_contract`. |
| `cli_json` | `stable` | n/a (see CLI reference) | The `--output=json` and `--output=jsonl` shapes emitted by `dw`. JSON exit codes and JSON field names are the durable surface; the human-readable `--output=table` form is documentation, not contract. |
| `waterline_api` | `stable` | n/a (see Waterline operator API) | Waterline observability HTTP API at `/waterline/api/v2/*`, the engine-source contract, and the dashboard JSON shapes. Waterline must match the workflow package major version. |
| `mcp_discovery_results` | `stable` | n/a (see MCP workflows page) | The `/mcp/*` Model Context Protocol surfaces and the `llms.txt` / `llms-2.0.txt` discovery files. MCP tool names, parameter schemas, and `payload_preview_limit_bytes` semantics are part of the contract; tool descriptions and discovery hints are diagnostic. |
| `official_sdks` | `stable` | `client_compatibility` | The first-party SDKs: PHP `durable-workflow/sdk`, the `durable_workflow` Python SDK, and the `durable-workflow` Rust SDK. The `dw` CLI is the official command client. Each SDK's public surface is governed by its own per-package stability document, which must defer to this page. |
| `history_event_wire_formats` | `frozen` | n/a (frozen shapes; see workflow `docs/api-stability.md`) | The persisted shape of every row in `workflow_history_events` and `workflow_schedule_history_events`. Once a workflow writes an event, every future SDK that replays it must decode the same field set. |
| `cluster_info_manifests` | `stable` | `surface_stability_contract`, `client_compatibility`, `control_plane`, `worker_protocol`, `auth_composition_contract`, `coordination_health` | The protocol manifests published by `GET /api/cluster/info` itself. Each nested manifest carries its own `schema` and `version` and evolves under its own contract rules. The envelope keys are stable. |

### Per-package stability documents

These documents add per-package detail under the rules on this page:

- `durable-workflow/workflow` (PHP) — [`docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/v2/docs/api-stability.md). Authoritative for the PHP authoring API, the `Support\*` server-facing classes, and the frozen history-event wire-format tables.
- `durable-workflow/sdk` (PHP) — [`README.md`](https://github.com/durable-workflow/sdk-php/blob/main/README.md). Authoritative for the framework-neutral remote client and worker API distributed from Packagist.
- `durable-workflow/server` — [`README.md`](https://github.com/durable-workflow/server/blob/main/README.md) and `docs/contracts/*`. Authoritative for the standalone server's request/response contracts.
- `dw` CLI — [`/docs/polyglot/cli-reference`](/docs/2.0/polyglot/cli-reference). Authoritative for the JSON output shapes and exit codes.
- Python SDK — `README.md` in `durable-workflow/sdk-python`. Authoritative for the `durable_workflow` package public API.
- Rust SDK — `README.md` and `[package.metadata.durable-workflow]` in
  `durable-workflow/sdk-rust`. Authoritative for the `durable-workflow` crate
  public API and its package compatibility declaration.

## Release Rules

These rules apply to every public surface family above. They are reproduced in
the JSON mirror under `release_rules`.

### Patch releases

Allowed:
- bug fixes that preserve the documented contract
- documentation fixes
- dependency bumps that do not change the public surface
- changes to surfaces marked `experimental`

Forbidden:
- removing or renaming any `stable` or `frozen` field, route, command, or class
- narrowing accepted input on any `stable` route or command
- changing the meaning of an existing `stable` field

### Minor releases

Allowed:
- adding new fields, routes, commands, or classes to a `stable` surface
- adding new optional parameters with safe defaults
- adding new capability flags to discovery responses
- promoting a `prerelease` or `experimental` surface to `stable`

Forbidden:
- removing or renaming any `stable` or `frozen` field, route, command, or class
- changing the meaning of an existing `stable` or `frozen` field

### Major releases

Allowed:
- removing, renaming, or narrowing a `stable` surface
- increasing the required `control_plane.version` or `worker_protocol.version`
- dropping a previously supported SDK or CLI version range

Required:
- announce in release notes at least
  one minor release before cutting the major
- where feasible, ship the new surface alongside the old surface in a
  previous minor release so callers can migrate before the major
- document the migration path on the [migration guide](/docs/2.0/migration)
  before publish

## Diagnostic-Only Versus Guaranteed Fields

Every field in every `stable` or `frozen` surface is either **guaranteed** or
**diagnostic-only**. The two have different change rules:

- **Guaranteed fields** are part of the documented contract. Producers must
  keep emitting them in the documented shape; consumers may rely on their
  presence and meaning. Removing or renaming a guaranteed field on a `stable`
  surface is a major change.
- **Diagnostic-only fields** are emitted for human triage, debugging, and
  observability. They may be added, renamed, or removed in any minor
  release. They must be marked `diagnostic_only: true` (or the doc-page
  equivalent) wherever they are documented. **Consumers must not parse,
  persist, or branch on diagnostic fields in production decision logic.**

Unknown additive fields on a `stable` or `frozen` shape must be ignored by
older consumers (forward compatibility). Unknown required fields must fail
closed. SDKs and CLIs publish their own forward-compatibility behavior in
their per-package stability documents.

## Compatibility Matrix

This is the operational compatibility matrix. It records which client
versions are validated against which server protocol manifests. Components
validate the matrix at runtime via `GET /api/cluster/info` and fail closed
when the manifests do not agree.

### Supported 2.0 product train

Durable Workflow 2.0 has one supported prerelease choice. Every component below
uses the same product-train identifier; choose 2.0 once and install this tuple:

| Component | Supported version | Install identity |
|-----------|-------------------|------------------|
| Server | `%%artifact.serverVersion%%` | `%%artifact.serverDockerHubImage%%` |
| CLI | `%%artifact.cliVersion%%` | `%%artifact.cliInstallerEnv%%` |
| Workflow engine | `%%artifact.workflowVersion%%` | `%%artifact.workflowComposerPackage%%` |
| Waterline operator | `%%artifact.waterlineVersion%%` | `%%artifact.waterlineComposerPackage%%` |
| PHP SDK | `%%artifact.phpSdkVersion%%` | `%%artifact.phpSdkComposerPackage%%` |
| Python SDK | `%%artifact.pythonSdkVersion%%` | `%%artifact.pythonPackagePin%%` |
| Rust SDK | `%%artifact.rustSdkVersion%%` | `%%artifact.rustCargoRequirement%%` |

PyPI renders the Python distribution version as
`%%artifact.pythonRegistryVersion%%`; the documented PEP 440 install spelling
`%%artifact.productTrainVersion%%` resolves to that same release. This
normalization does not create a second supported version.

The prerelease train is coordinated as a unit. A tuple is publishable only when
all seven entries share the same authority identifier, both server
registries agree, and the generated quickstart contract uses those exact
artifacts. The registry refresher fails closed instead of combining
independently newest packages. Its current authorized release phase is
`%%artifact.releasePhase%%`; registry tags from later channels remain
ineligible until the release policy is reviewed and changed.

Earlier alpha and beta artifacts are historical. They are not alternative
installation choices, and package owners should yank or de-emphasize them
where their registry supports that operation without rewriting release
history. The current train does not include compatibility shims for behavior
from an earlier 2.0 prerelease.

Capabilities in this train are the 2.0 baseline and therefore have no
feature-introduction version matrix. New capabilities progress through
ordinary compatible releases: additive work advances the compatible version,
while a breaking public-surface change waits for the next major version.
During the prerelease period, a coordinated `%%artifact.releasePhase%%`
increment replaces the previous supported `%%artifact.releasePhase%%` tuple.

Stable 1.x remains the default public docs line. This page is explicit
prerelease guidance under `/docs/2.0/`; it does not authorize a default-docs
cutover.

### Runtime protocol compatibility

Top-level package versions select the supported train. Runtime protocol
manifests provide a second, fail-closed check:

| Client | Product train | Control plane | Worker protocol request |
|--------|---------------|---------------|-------------------------|
| CLI | `%%artifact.cliVersion%%` | `2` | n/a |
| PHP SDK | `%%artifact.phpSdkVersion%%` | `2` | `1.13` |
| Python SDK | `%%artifact.pythonSdkVersion%%` | `2` | `1.1` |
| Rust SDK | `%%artifact.rustSdkVersion%%` | `2` | `1.2` |

The server advertises worker protocol `1.13`. It accepts request headers
from the same major with a minor less than or equal to the advertised minor,
then returns the advertised version. Missing or malformed headers, different
majors, and worker minors ahead of the server fail closed. The CLI validates
`control_plane.version: "2"`.

The server's top-level `version` is build identity. Clients must use the
`control_plane`, `worker_protocol`, `client_compatibility`, and
`surface_stability_contract` manifests returned by
`GET /api/cluster/info` for protocol negotiation.

Workflow and Waterline must also share the exact current
`%%artifact.releasePhase%%` train. Matching only the major version is
insufficient during the 2.0 prerelease.

### Runtime validation examples

The SDKs validate discovery before registering a worker. An incompatible
server produces an explicit compatibility error rather than attempting a
legacy prerelease path. All worker requests send
`X-Durable-Workflow-Protocol-Version`; control-plane requests send
`X-Durable-Workflow-Control-Plane-Version: 2`.

Before a product train is promoted, release qualification must start from a
clean machine, install only the published artifacts named above, and complete
the PHP, Python, and Rust conformance paths. Source checkouts and unpublished
substitutions do not count as public-artifact evidence.

### Release progression

Patch releases preserve documented stable contracts. Minor releases may add
fields, routes, commands, classes, or optional parameters with safe defaults.
Breaking stable changes require a major release and a documented migration
path. Frozen history-event shapes remain decodable indefinitely; a new shape
uses a parallel primitive rather than mutating an existing event.

Every train release must keep package metadata, release notes, generated docs,
installation commands, the quickstart execution contract, and cross-language
examples synchronized with the machine-owned artifact tuple.

### Release review checklist

- Confirm the machine-readable compatibility contract matches the Workflow
  surface-stability manifest.
- Confirm all current artifact versions form one synchronized product train.
- Confirm installation examples resolve tokens from the artifact authority.
- Confirm package metadata declares the same server and product-train version.
- Confirm clean-machine published-artifact conformance passes for PHP, Python,
  and Rust.
- Confirm release notes describe post-baseline additions and do not present
  older prereleases as supported choices.

## See Also

- [Server Setup](/docs/2.0/polyglot/server) — Deploying the standalone server
- [Server API Reference](/docs/2.0/polyglot/server-api-reference) — `GET /api/cluster/info` and the protocol manifests
- [PHP SDK](/docs/2.0/polyglot/php) — PHP client and worker
- [Python SDK](/docs/2.0/polyglot/python) — Python client and worker
- [Rust SDK](/docs/2.0/polyglot/rust) — Rust client and worker
- [CLI](/docs/2.0/polyglot/cli) — Command-line interface
- [Migration Guide](/docs/2.0/migration) — Migrating from v1 to v2
- [PHP workflow `docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/v2/docs/api-stability.md) — per-package stability for the PHP workflow package
