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

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import ProtocolCatalog from '@site/src/components/ProtocolCatalog';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

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

<PublicAuthorityIdentity
  manifest={protocolCatalog}
  manifestUrl="https://durable-workflow.github.io/platform-protocol-specs.json"
/>

The catalog is also available through:

- the public JSON catalog at
  https://durable-workflow.github.io/platform-protocol-specs.json;
- platform_protocol_specs in GET /api/cluster/info on the standalone server;
- this 2.0 guide for human-readable context.

The JSON URL is the machine-consumable catalog authority. The server re-exports
the same catalog so clients can discover the active protocol surface without
assuming a repository layout.

<WorkerProtocolAuthorityRoles />

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

This inventory is rendered from the public JSON catalog. Specification
identity, availability, public links, and object-family ownership therefore
remain catalog data rather than a second prose authority.

<ProtocolCatalog />

### Worker session runtime notes

This schema covers worker-session capability discovery, lifecycle envelopes,
task-affinity snapshots, and operator visibility. Its stable identifier is
durable-workflow.v2.worker-sessions-runtime.

### Local activity runtime notes

This schema covers local-activity capability discovery, option snapshots,
history markers, retry semantics, and operator visibility. Its stable
identifier is durable-workflow.v2.local-activity-runtime.

### Cluster-info envelope notes

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
| rendered_retrieval_surfaces_aligned | The built 2.0 page and full 2.0 model-retrieval bundles expose every available entry's catalog identity, public URL, and object-family ownership. |
| breaking_change_release_consistent_with_evolution_rule | Every breaking-change release value matches its evolution rule. |
| deliverable_specs_published | Every required platform surface has a published, parseable specification. |

The machine check loads the public JSON catalog, validates its vocabulary and
consumer-safe references, parses shipped specifications, checks object-family
and embedded-schema metadata, and compares package mirrors when available.
After the site and model bundles are generated, a semantic check compares their
rendered catalog values to that same JSON authority. Documentation prose and
heading text are not part of the comparison.

When the contract changes, update the packaged Workflow catalog, this public
JSON mirror, and affected published specification artifacts together. Human
review confirms that explanatory prose remains useful without treating it as
machine authority.

Continue to the [Platform Conformance Suite](/docs/platform-conformance)
to resolve the active, byte-bound fixtures that exercise these protocol
specifications. Historical fixture evidence is identified separately in that
suite and does not replace a current catalog authority.
