---
sidebar_position: 18
title: Platform Protocol Specs
description: Consumer catalog of public Durable Workflow OpenAPI, JSON Schema, and AsyncAPI specifications.
tags:
  - compatibility
  - protocols
  - api-stability
  - openapi
  - json-schema
  - asyncapi
keywords:
  - platform protocol specs
  - protocol catalog
  - openapi
  - asyncapi
  - json schema
  - control-plane spec
  - worker protocol spec
---

# Platform Protocol Specs

The platform protocol catalog tells SDK authors, agents, operators, and
third-party tooling exactly which machine-readable specification governs each
public Durable Workflow surface.

Use the
[machine-readable catalog](https://durable-workflow.github.io/platform-protocol-specs.json)
for automation. Every available entry provides both a stable specification
identifier and a public HTTPS URL that resolves directly to an OpenAPI,
AsyncAPI, or JSON Schema artifact.

Repository paths, implementation symbols, and test fixtures are intentionally
not consumer authority. They are excluded from the published catalog and kept
only as validation diagnostics.

## Catalog identity and discovery

The catalog has schema
durable-workflow.v2.platform-protocol-specs.catalog and version 15. It is
available through:

- the public JSON catalog at
  https://durable-workflow.github.io/platform-protocol-specs.json;
- platform_protocol_specs in GET /api/cluster/info on the standalone server;
- this 2.0 guide for human-readable context.

The JSON URL is the machine-consumable catalog authority. The server re-exports
the same catalog so clients can discover the active protocol surface without
assuming a repository layout.

## Consumer fields

Each entry exposes the following contract:

| Field | Meaning |
|---|---|
| spec_id | Stable Durable Workflow protocol identifier. Published documents carry the matching identity. |
| spec_url | Direct public HTTPS URL for the machine-readable specification. |
| format | openapi, json_schema, or asyncapi. |
| status | Whether the referenced artifact is published, in progress, or planned. |
| surface_family | Compatibility-policy family that governs the surface. |
| authority_manifest | Discovery manifest through which a runtime advertises the surface. |
| owner_repo | Project responsible for the specification. |
| object_families | Public object-family names and their owning projects. |
| evolution_rule | Compatibility rule for additive and breaking changes. |
| breaking_change_release | Release boundary required by that evolution rule. |

Consumers should resolve spec_url and validate the document identity against
spec_id. They do not need source checkout access.

## Available specifications

| Catalog entry | Format | Status | Owner | Public specification |
|---|---|---|---|---|
| control_plane_api | OpenAPI | published | durable-workflow/server | [control-plane-api.openapi.yaml](https://durable-workflow.github.io/platform-protocol-specs/control-plane-api.openapi.yaml) |
| worker_protocol_api | OpenAPI | published | durable-workflow/server | [worker-protocol-api.openapi.yaml](https://durable-workflow.github.io/platform-protocol-specs/worker-protocol-api.openapi.yaml) |
| worker_protocol_stream | AsyncAPI | published | durable-workflow/server | [worker-protocol-stream.asyncapi.yaml](https://durable-workflow.github.io/platform-protocol-specs/worker-protocol-stream.asyncapi.yaml) |
| worker_sessions_runtime | JSON Schema | published | durable-workflow/server | [worker-sessions-runtime.schema.json](https://durable-workflow.github.io/platform-protocol-specs/worker-sessions-runtime.schema.json) |
| local_activity_runtime | JSON Schema | published | durable-workflow/workflow | [local-activity-runtime.schema.json](https://durable-workflow.github.io/platform-protocol-specs/local-activity-runtime.schema.json) |
| history_event_payloads | JSON Schema | published | durable-workflow/workflow | [history-event-payloads.schema.json](https://durable-workflow.github.io/platform-protocol-specs/history-event-payloads.schema.json) |
| history_export_bundle | JSON Schema | published | durable-workflow/workflow | [history-export-bundle.schema.json](https://durable-workflow.github.io/platform-protocol-specs/history-export-bundle.schema.json) |
| replay_bundle | JSON Schema | published | durable-workflow/workflow | [replay-bundle.schema.json](https://durable-workflow.github.io/platform-protocol-specs/replay-bundle.schema.json) |
| waterline_read_api | OpenAPI | published | durable-workflow/waterline | [waterline-read-api.openapi.yaml](https://durable-workflow.github.io/platform-protocol-specs/waterline-read-api.openapi.yaml) |
| waterline_diagnostic_objects | JSON Schema | published | durable-workflow/waterline | [waterline-diagnostic-objects.schema.json](https://durable-workflow.github.io/platform-protocol-specs/waterline-diagnostic-objects.schema.json) |
| repair_actionability_objects | JSON Schema | published | durable-workflow/workflow | [repair-actionability-objects.schema.json](https://durable-workflow.github.io/platform-protocol-specs/repair-actionability-objects.schema.json) |
| cli_json_envelopes | JSON Schema | published | durable-workflow/cli | [cli-json-envelopes.schema.json](https://durable-workflow.github.io/platform-protocol-specs/cli-json-envelopes.schema.json) |
| mcp_discovery | JSON Schema | published | durable-workflow/durable-workflow.github.io | [mcp-discovery.schema.json](https://durable-workflow.github.io/platform-protocol-specs/mcp-discovery.schema.json) |
| mcp_tool_results | JSON Schema | published | durable-workflow/durable-workflow.github.io | [mcp-tool-results.schema.json](https://durable-workflow.github.io/platform-protocol-specs/mcp-tool-results.schema.json) |
| cluster_info_envelope | JSON Schema | published | durable-workflow/server | [cluster-info-envelope.schema.json](https://durable-workflow.github.io/platform-protocol-specs/cluster-info-envelope.schema.json) |
| invocable_carrier_execution | JSON Schema | in progress | durable-workflow/server | [invocable-carrier-execution.schema.json](https://durable-workflow.github.io/platform-protocol-specs/invocable-carrier-execution.schema.json) |

### worker_sessions_runtime

This schema covers worker-session capability discovery, lifecycle envelopes,
task-affinity snapshots, and operator visibility. Its stable identifier is
durable-workflow.v2.worker-sessions-runtime.

### local_activity_runtime

This schema covers local-activity capability discovery, option snapshots,
history markers, retry semantics, and operator visibility. Its stable
identifier is durable-workflow.v2.local-activity-runtime.

### cluster_info_envelope

This schema covers GET /api/cluster/info and the nested discovery manifests
available from that endpoint. Its stable identifier is
durable-workflow.v2.cluster-info-envelope.

## Formats

| Format | Use |
|---|---|
| OpenAPI 3.1 | HTTP and JSON request-response surfaces whose routes, methods, status codes, and envelopes are part of the contract. |
| JSON Schema 2020-12 | Persisted records, event payloads, result envelopes, runtime options, and related object families. |
| AsyncAPI 2.6 or newer | Poll, stream, lease-renewal, ordering, and delivery semantics. |

## Status levels

| Status | Meaning |
|---|---|
| published | The public machine-readable specification is available at spec_url and can be consumed directly. |
| in_progress | A public specification is available, but its coverage is partial. Listed fields and routes are normative. |
| planned | The entry has a stable catalog identity but no consumable specification yet. Planned entries do not advertise spec_url. |

## Evolution rules

additive_minor_breaking_major allows additive changes in minor releases.
Removals, renames, type narrowings, and semantic changes require a major
release and should use a parallel route or field where practical.

parallel_primitive_only governs frozen wire formats. A breaking shape must be
introduced under a new event type, command type, or schema identifier while
the original remains decodable.

experimental_any_release applies only to explicitly experimental
specifications and allows change in any release.

## Release validation

Docs-site CI enforces the following machine checks:

| Gate | What CI checks |
|---|---|
| catalog_aligned_with_surface_families | Every entry references a declared public compatibility family. |
| owner_repo_known | Entry and object-family owners use the catalog vocabulary. |
| format_known | Every available artifact parses as its declared format. |
| public_spec_references_resolve | Every available spec_url is an HTTPS URL in the public protocol-spec namespace and resolves to a shipped artifact whose identity matches spec_id. |
| repository_local_authority_fields_rejected | Published entries contain no repository-local paths, implementation symbols, test references, or legacy authority fields. |
| workflow_package_mirror_aligned | The public catalog matches the packaged Workflow catalog when that release input is available. |
| server_owned_spec_mirrors_aligned | Server-owned published artifacts match owner-repository mirrors when those inputs are available. |
| diagnostic_provenance_complete | Validation-only provenance covers every catalog entry and object family. |
| object_family_metadata_declared | Catalog entries and published documents agree on object-family names and owners. |
| breaking_change_release_consistent_with_evolution_rule | Every breaking-change release value matches its evolution rule. |
| deliverable_specs_published | Every required platform surface has a published, parseable specification. |

The machine check loads the public JSON catalog, validates its vocabulary and
consumer-safe references, parses shipped specifications, checks object-family
and embedded-schema metadata, and compares package mirrors when available.
The Markdown page is a consumer guide and is not parsed as a second catalog.

When the contract changes, update the packaged Workflow catalog, this public
JSON mirror, and affected published specification artifacts together. Human
review confirms that explanatory prose remains useful without treating it as
machine authority.
