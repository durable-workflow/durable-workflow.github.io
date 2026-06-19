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
  `durable-workflow.v2.surface-stability.contract`, version `1`.
- A frozen mirror of the same manifest in this repository at
  `static/compatibility-contract.json`.
- The PHP class `Workflow\V2\Support\SurfaceStabilityContract`, which is
  the in-process source the server re-exports.

A release that changes any surface listed below — its stability level, its
field set, its breaking-change rules — must update this page, the JSON
mirror, the PHP manifest, and any per-package stability document in the same
change. The release-check gate in `scripts/check-compatibility-authority.js`
fails the docs build when it detects drift between this page and the JSON
mirror.

## Companion: Platform Protocol Spec Catalog

This page says *which* surfaces are public and *how* they may change.
The companion [Platform Protocol Specs](/docs/2.0/platform-protocol-specs)
catalog says *where* the normative machine-readable specification for
each surface lives, *which format* the spec uses (OpenAPI for HTTP APIs,
JSON Schema for object families, AsyncAPI for event-stream semantics),
*which repository* owns the spec, which object families it governs,
which schema/version authority owns those families, and *which
conformance test* pins the spec against drift. SDK authors, agents, and
operators should validate against the spec catalog rather than
re-reading prose for every surface.

The catalog has its own machine-readable mirror at
`platform_protocol_specs` in `GET /api/cluster/info` (schema
`durable-workflow.v2.platform-protocol-specs.catalog`, version `14`) and
a frozen JSON copy at `static/platform-protocol-specs.json` in this
repository. Every catalog entry's `surface_family` must exist in the
contract above; the release-check gate in
`scripts/check-platform-protocol-specs.js` fails the build on drift.

Every platform protocol catalog entry is now marked `published`, and each
entry links to an OpenAPI, AsyncAPI, or JSON Schema document under
`static/platform-protocol-specs/`. The
[`cluster_info_envelope`](/docs/2.0/platform-protocol-specs#cluster_info_envelope)
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
| `prerelease` | Public surface that is feature-complete but still allowed to change before the matching `1.0.0` / `2.0.0` cut. | In clearly labelled prerelease versions; called out in the version-history table on this page. |
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
| `official_sdks` | `stable` | `client_compatibility` | The first-party SDKs: PHP `durable-workflow/workflow`, `durable-workflow/server`, the `dw` CLI, and the `durable_workflow` Python SDK. Each SDK's public surface is governed by its own per-package stability document, which must defer to this page. |
| `history_event_wire_formats` | `frozen` | n/a (frozen shapes; see workflow `docs/api-stability.md`) | The persisted shape of every row in `workflow_history_events` and `workflow_schedule_history_events`. Once a workflow writes an event, every future SDK that replays it must decode the same field set. |
| `cluster_info_manifests` | `stable` | `surface_stability_contract`, `client_compatibility`, `control_plane`, `worker_protocol`, `auth_composition_contract`, `coordination_health` | The protocol manifests published by `GET /api/cluster/info` itself. Each nested manifest carries its own `schema` and `version` and evolves under its own contract rules. The envelope keys are stable. |

### Per-package stability documents

These documents add per-package detail under the rules on this page:

- `durable-workflow/workflow` (PHP) — [`docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/v2/docs/api-stability.md). Authoritative for the PHP authoring API, the `Support\*` server-facing classes, and the frozen history-event wire-format tables.
- `durable-workflow/server` — [`README.md`](https://github.com/durable-workflow/server/blob/main/README.md) and `docs/contracts/*`. Authoritative for the standalone server's request/response contracts.
- `dw` CLI — [`/docs/polyglot/cli-reference`](/docs/2.0/polyglot/cli-reference). Authoritative for the JSON output shapes and exit codes.
- Python SDK — `README.md` in `durable-workflow/sdk-python`. Authoritative for the `durable_workflow` package public API.

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
- announce in the version-history table at the bottom of this page at least
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

### Component versions

This table names the current installable public artifact tuple. The stability
contract is governed by the authority column, not by a component's top-level
package version or prerelease channel. Stable 1.x remains the default public
docs line; the 2.0 docs line is explicit prerelease guidance until the
release-status cutover is authorized.

| Component | Current installable public artifact | Contract authority and stability | Notes |
|-----------|-------------------------------------|----------------------------------|-------|
| Workflow Package (PHP) | 1.0.75 (stable 1.x docs), `%%artifact.workflowVersion%%` (2.0 prerelease docs) | `official_sdks` / `stable` | Core workflow engine. The 2.0 artifact is published with a Composer prerelease stability suffix while the 2.0 line ramps. |
| Standalone Server | `%%artifact.serverVersion%%` | `server_api` / `stable`; `control_plane` and `worker_protocol` protocol manifests | Language-neutral HTTP server. The top-level server version is build identity, not the client compatibility authority. |
| CLI (`dw`) | `%%artifact.cliVersion%%` | `cli_json` / `stable` | The installable artifact is still a 0.x package while the JSON contract is governed by the stable CLI surface. |
| Python SDK (`durable_workflow`) | `%%artifact.pythonSdkVersion%%` | `official_sdks` / `stable` | The installable artifact is still a 0.x package while SDK compatibility is governed by protocol manifests and the SDK stability document. |
| Waterline | 1.0.16 (stable 1.x docs), `%%artifact.waterlineVersion%%` (2.0 prerelease docs) | `waterline_api` / `stable` | Observability UI. The 2.0 artifact is published with a Composer prerelease stability suffix while the 2.0 line ramps. Major must match the workflow package major. |

### Server ↔ SDK / CLI

| Server Protocol Manifests | CLI 0.1.x | Python SDK 0.2.x | PHP Workflow 2.0.x |
|---------------------------|-----------|------------------|---------------------|
| `control_plane.version: "2"` + request-contract v1 + `worker_protocol.version: "1.0"` | ✅ Compatible | ✅ Compatible | ✅ Compatible |
| Missing or unknown protocol manifests | ❌ Fail closed | ❌ Fail closed | ❌ Fail closed |
| Future incompatible protocol versions | ❌ Breaking | ❌ Breaking | ❌ Breaking |

The top-level server `version` from `/api/cluster/info` is build identity,
not the client compatibility authority. Clients must use the protocol
manifests advertised by `/api/cluster/info`:

- `control_plane.version`
- `control_plane.request_contract.schema` and `version`
- `worker_protocol.version` for worker SDKs
- `client_compatibility.authority: "protocol_manifests"`
- `surface_stability_contract.schema: "durable-workflow.v2.surface-stability.contract"`

### Workflow Package ↔ Waterline

| Workflow Version | Waterline 1.x | Waterline 2.x |
|------------------|---------------|---------------|
| 1.x | ✅ Compatible | ❌ Not compatible |
| 2.x | ❌ Not compatible | ✅ Compatible |

Waterline versions must match the workflow package major version.

## Runtime Validation

### CLI

The CLI validates the control-plane protocol manifest on first invocation per session:

```bash
$ dw server:health
Server compatibility error: unsupported control_plane.version [3]; dw CLI 0.1.x requires control_plane.version 2.
```

Compatibility checks are cached per CLI invocation. Starting a new CLI command re-validates.

### Python SDK

The Python SDK validates protocol manifests when workers register:

```python
from durable_workflow import Client, Worker

client = Client("http://server:8080", token="...", namespace="default")
worker = Worker(client, task_queue="default", workflows=[...])

await worker.run()  # Validates protocol manifests before registering
```

If incompatible:

```
RuntimeError: Server compatibility error: unsupported worker_protocol.version '2.0'; sdk-python 0.2.x requires '1.0'.
```

### Server

The server returns its protocol manifests, the surface-stability contract,
and the compatibility policy in `GET /api/cluster/info`:

```json
{
  "version": "2.0.0",
  "supported_sdk_versions": {
    "php": ">=1.0",
    "python": ">=0.2,<1.0",
    "cli": ">=0.1,<1.0"
  },
  "client_compatibility": {
    "schema": "durable-workflow.v2.client-compatibility",
    "version": 1,
    "authority": "protocol_manifests",
    "top_level_version_role": "informational",
    "fail_closed": true
  },
  "surface_stability_contract": {
    "schema": "durable-workflow.v2.surface-stability.contract",
    "version": 1,
    "authority_url": "https://durable-workflow.github.io/docs/2.0/compatibility"
  },
  "control_plane": {
    "version": "2",
    "request_contract": {
      "schema": "durable-workflow.v2.control-plane-request.contract",
      "version": 1
    }
  },
  "worker_protocol": {
    "version": "1.0"
  }
}
```

The full `surface_stability_contract` body lists every public surface family,
its stability level, and the patch/minor/major release rules. Clients and
release-check tooling can consume the same manifest the docs build consumes.

## Upgrading

### Minor Version Upgrades (0.1.8 → 0.1.9, 2.0.0 → 2.0.1)

Minor versions are backward-compatible within the same major version:

- **Server**: Upgrade without client changes
- **CLI**: Upgrade independently
- **Python SDK**: Upgrade independently

Example: Server 2.0.1 works with CLI 0.1.0 and Python SDK 0.2.0 when it
advertises the protocol manifests listed above.

### Major Version Upgrades (2.x → 3.x)

Major version changes may introduce breaking changes:

1. **Check compatibility matrix** (above) for supported version combinations
2. **Upgrade server first**: Deploy new server version
3. **Validate with one client**: Test one CLI command or SDK worker
4. **Upgrade remaining clients**: CLI, SDK, workers

**Future major versions (2.x → 3.x)**: Will require client updates. Version validation will catch incompatibilities and provide clear error messages.

## Version Negotiation Protocol

All client-server communication includes protocol version headers:

**Control plane** (workflow start, describe, signal, query, update):
```
X-Durable-Workflow-Control-Plane-Version: 2
```

**Worker protocol** (task polling, completion):
```
X-Durable-Workflow-Protocol-Version: 1.0
```

The server validates these headers and rejects requests with missing or incompatible versions.

## Troubleshooting

### "Server compatibility error..."

**Cause**: The server did not advertise the protocol manifest expected by the client.

**Fix**:
1. Check the compatibility matrix above
2. Upgrade server or client to compatible protocol versions
3. If the server advertises the expected protocol manifests and the client reports incompatibility, file a bug

### "Missing X-Durable-Workflow-Protocol-Version header"

**Cause**: Old client not sending protocol version headers.

**Fix**: Upgrade CLI to 0.1.0+ or Python SDK to 0.2.0+.

### "Control plane version mismatch"

**Cause**: Server and client disagree on control-plane protocol version.

**Fix**: Ensure server is 2.x and client is sending version 2 header.

## Release Review Checklist

Every release PR must tick the following before tagging. The docs CI
script `scripts/check-compatibility-authority.js` enforces the
docs-side gates automatically; the rest belong to the human reviewer.

- [ ] **Docs authority aligned.** This page lists every surface family in
  `static/compatibility-contract.json` with the same stability level.
- [ ] **JSON mirror in sync.** `static/compatibility-contract.json` matches
  the manifest emitted by `Workflow\V2\Support\SurfaceStabilityContract`
  (the workflow package contract test pins the manifest shape).
- [ ] **Install docs aligned.** The [Installation](/docs/2.0/installation)
  page and any package install snippets do not claim a stability level
  different from the level this page assigns to the relevant SDK.
- [ ] **Package metadata aligned.** `composer.json` / `pyproject.toml` /
  `package.json` prerelease tags match the `stability_level` for the SDK
  family they belong to (e.g. `0.x` Python and CLI SDKs are `prerelease`,
  `2.0.x` server and workflow are `stable`).
- [ ] **Version-history aligned.** The version-history table below does
  not introduce stability claims that contradict this page.

## Version History

| Date | Server | CLI | Python SDK | Workflow | Waterline | Notes |
|------|--------|-----|------------|----------|-----------|-------|
| 2026-06-19 | 0.2.431 | 0.1.81 | 0.4.89 | 2.0.0-alpha.206 | 2.0.0-alpha.109 | Public release-audit evidence is aligned with the current published artifact tuple while stable 1.x remains the default docs line. |
| 2026-06-05 | 0.2.341 | 0.1.77 | 0.4.85 | 2.0.0-alpha.199 | 2.0.0-alpha.83 | Platform conformance suite version 24 requires worker-versioning cross-language PHP/Python pinning evidence to include worker runtime identities, workflow and run IDs, rollout state, public poll and rollout outcomes, published worker artifact install source and version, and confirmation that no local product source checkout was used. |
| 2026-06-05 | 0.2.341 | 0.1.77 | 0.4.85 | 2.0.0-alpha.199 | 2.0.0-alpha.83 | Public release-audit evidence is aligned with the current verified installable artifact tuple while stable 1.x remains the default docs line. |
| 2026-06-02 | 0.2.261 | 0.1.75 | 0.4.84 | 2.0.0-alpha.193 | 2.0.0-alpha.80 | Platform conformance suite version 20 adds a public worker-versioning evidence shard for published PHP/Python worker protocol client execution, so cross-language build-ID pinning evidence can be recorded without naming runner implementation details. It also publishes suite-versioned public runtime requirement digests for `artifact_policy`, `common_result_evidence`, `required_matrix`, `scenario_requirements`, and `host_runner_contract`. |
| 2026-06-02 | 2.0.0 | 0.1.0 | 0.2.0 | 2.0.0 | 2.0.0 | Platform conformance suite version 19 adds stable `schedules_runtime_contract` coverage for published-artifact schedule scenarios, including cron and fixed-rate cadence, public list and describe surfaces, pause/resume/delete controls, missed-fire policy, restart survival, CLI/Python/PHP client paths, cross-language scheduled workflow dispatch, and adversarial schedule inputs. |
| 2026-06-02 | 2.0.0 | 0.1.0 | 0.2.0 | 2.0.0 | 2.0.0 | Platform conformance suite version 18 requires prerelease readiness evidence to execute the 2.0 quickstart Laravel branch from live public docs through `status=completed` and `output=Hello, Laravel!`, with exact Composer package versions, commands, outputs, and wall-clock timing. |
| 2026-06-02 | 2.0.0 | 0.1.0 | 0.2.0 | 2.0.0 | 2.0.0 | Platform conformance suite version 17 requires prerelease readiness evidence to execute the 2.0 quickstart local-server hosting branch from live public docs through an observable completed workflow, with exact artifact versions, commands, outputs, and wall-clock timings. |
| 2026-05-25 | 2.0.0 | 0.1.0 | 0.2.0 | 2.0.0 | 2.0.0 | Platform conformance suite version 14 adds stable `prerelease_readiness_contract` coverage for published-artifact 2.0 readiness across Workflow, Waterline, server, CLI, Python SDK, sample app, public docs, migration, API stability, configuration understandability, and release-channel compatibility. |
| 2026-05-25 | 2.0.0 | 0.1.0 | 0.2.0 | 2.0.0 | 2.0.0 | Platform conformance suite version 13 adds stable `migration_runtime_contract` coverage for published-artifact v1 to v2 migration scenarios, including latest supported v1 state setup, documented migration steps, completed-history replay, in-flight progress, activity retries, schedules, worker registrations, CLI and Waterline visibility, new v2 starts, rollback semantics, and version-skew refusal. |
| 2026-05-24 | 2.0.0 | 0.1.0 | 0.2.0 | 2.0.0 | 2.0.0 | Platform conformance suite version 12 adds stable `saga_runtime_contract` coverage for published-artifact saga compensation scenarios, including forward success, reverse-order compensation after later-step failure, early-step failure, compensation retry idempotence, compensation failure visibility, mid-compensation worker restart, PHP/Python cross-language compensation, typed compensation error round trips, and operator-visible in-progress compensation state. |
| 2026-05-24 | 2.0.0 | 0.1.0 | 0.2.0 | 2.0.0 | 2.0.0 | Platform conformance suite version 11 adds stable `worker_versioning_runtime_contract` coverage for published-artifact worker-versioning scenarios, including build-ID registration, rollout visibility, drain/resume controls, per-run pins, compatible replay routing, no-compatible-worker diagnostics, cross-language PHP/Python pinning, adversarial no-bump behavior, and history API version pins. |
| 2026-05-24 | 2.0.0 | 0.1.0 | 0.2.0 | 2.0.0 | 2.0.0 | Platform conformance suite version 10 adds stable `search_attribute_runtime_contract` coverage for PHP and Python workers, CLI query and error surfaces, Waterline operator visibility, cross-language codec round trips, load and indexing latency, OR/NOT grammar, type safety, namespace isolation, reserved-name refusal, and query injection hardening. |
| 2026-05-20 | 2.0.0 | 0.1.0 | 0.2.0 | 2.0.0 | 2.0.0 | Platform conformance suite version 9 requires signal/query published-artifact results to record concrete pinned artifact versions and reject placeholder or unresolved version tokens. |
| 2026-05-20 | 2.0.0 | 0.1.0 | 0.2.0 | 2.0.0 | 2.0.0 | Platform conformance suite version 8 publishes the namespace lifecycle cleanup criteria that preserve cross-namespace external payload ownership under a new suite version and pins stable runtime scenario `operations` and `pass_criteria` criteria content in the docs-site release check. Later suite versions apply the same append-only release-check model to public runtime requirement digests. |
| 2026-05-20 | 2.0.0 | 0.1.0 | 0.2.0 | 2.0.0 | 2.0.0 | Platform conformance suite version 7 adds stable `child_workflow_runtime_contract` coverage for same-language and cross-language child execution, failure and cancellation propagation, worker-restart replay, concurrent fan-out, and namespace behavior. |
| 2026-05-20 | 2.0.0 | 0.1.0 | 0.2.0 | 2.0.0 | 2.0.0 | Platform conformance suite version 6 adds stable `namespace_runtime_contract` published-artifact scenarios for namespace lifecycle cleanup, workflow and worker isolation, CLI and SDK namespace selection, PHP worker task-queue routing, Waterline scoped visibility, Nexus opt-in crossing, reserved-name refusal, and search-attribute value query isolation. |
| 2026-05-19 | 2.0.0 | 0.1.0 | 0.2.0 | 2.0.0 | 2.0.0 | Platform conformance suite versions 2-5 update published-artifact conformance: version 2 adds stable `signal_query_runtime_contract` coverage for PHP and Python workers, cross-language clients, replay timing, terminal-run behavior, malformed payloads, and operator visibility; version 3 adds stable `history_replay_bundles` runtime scenarios and requires replay coverage for frozen histories, worker restart, adversarial refusal, and in-flight signal timing across official PHP and Python runtimes; version 4 requires completed cleanly runs with replayable declared query handlers to return final query state through every claimed public query surface; version 5 standardizes runtime scenario result statuses as `pass`, `fail`, `unsupported`, `not_covered`, or `runner_blocked` and requires every required stable runtime scenario to pass for full conformance. |
| 2026-05-02 | 2.0.0 | 0.1.0 | 0.2.0 | 2.0.0 | 2.0.0 | Compatibility-and-release-authority contract published. `surface_stability_contract` exposed in `/api/cluster/info`; per-package stability docs reference this page. |
| 2026-04-17 | 2.0.0 | 0.1.0 | 0.2.0 | 2.0.0 | 2.0.0 | Compatibility authority moved to protocol manifests |
| 2026-04-15 | 2.0.0 | 0.1.0 | 0.1.0 | 2.0.0 | 2.0.0 | Stable release |

## See Also

- [Server Setup](/docs/2.0/polyglot/server) — Deploying the standalone server
- [Server API Reference](/docs/2.0/polyglot/server-api-reference) — `GET /api/cluster/info` and the protocol manifests
- [Python SDK](/docs/2.0/polyglot/python) — Python client and worker
- [CLI](/docs/2.0/polyglot/cli) — Command-line interface
- [Migration Guide](/docs/2.0/migration) — Migrating from v1 to v2
- [PHP workflow `docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/v2/docs/api-stability.md) — per-package stability for the PHP workflow package
