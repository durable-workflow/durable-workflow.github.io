---
sidebar_position: 18
title: Platform Protocol Specs
description: Catalog of normative machine-readable specifications for every public Durable Workflow surface — OpenAPI for HTTP, JSON Schema for object families, AsyncAPI for event streams.
tags:
  - compatibility
  - protocols
  - api-stability
  - openapi
  - json-schema
  - asyncapi
keywords:
  - platform protocol specs
  - normative spec catalog
  - openapi
  - asyncapi
  - json schema
  - control-plane spec
  - worker protocol spec
  - local activity runtime schema
  - history export schema
  - waterline read api spec
  - repair actionability schema
  - mcp tool result schema
---

# Platform Protocol Specs

This page is the **catalog of normative machine-readable protocol
specifications** for every public Durable Workflow surface. It is the
single source of truth for SDK authors, agents, operators, and
third-party tooling that need to validate against Durable contracts
without reading prose or reverse-engineering fixtures.

The companion page [Version Compatibility](/docs/compatibility) says
*which* surfaces are public and *how* they may change. This catalog says
*where* the normative spec for each surface lives, *which format* it
uses, *which repository* owns it, which object families it governs, which
schema/version authority owns those families, and *which conformance
test* pins it against drift.

The same catalog is published in machine-readable form so SDK builds,
agents, and CI gates can validate themselves against one source of
truth:

- `platform_protocol_specs` in the response body of
  `GET /api/cluster/info` on the standalone Durable Workflow server,
  schema `durable-workflow.v2.platform-protocol-specs.catalog`,
  version `13`.
- A frozen mirror of the same manifest in this repository at
  `static/platform-protocol-specs.json`.
- The PHP class `Workflow\V2\Support\PlatformProtocolSpecs`, which is
  the in-process source the server re-exports.

A release that adds a spec entry, changes its format, owner,
object-family authority, breaking-change rule, or status, or removes an
entry must update this page, the JSON mirror, and the PHP manifest in the
same change. The
release-check gate in `scripts/check-platform-protocol-specs.js` fails
the docs build when it detects drift.

## Published Spec Files

These are the authoritative machine-readable files referenced by the
catalog. The per-entry sections below define owner, object-family
schema/version authority, and breaking-change policy for each file.

| Spec | File |
|------|------|
| `control_plane_api` | [`control-plane-api.openapi.yaml`](pathname:///platform-protocol-specs/control-plane-api.openapi.yaml) |
| `worker_protocol_api` | [`worker-protocol-api.openapi.yaml`](pathname:///platform-protocol-specs/worker-protocol-api.openapi.yaml) |
| `worker_protocol_stream` | [`worker-protocol-stream.asyncapi.yaml`](pathname:///platform-protocol-specs/worker-protocol-stream.asyncapi.yaml) |
| `worker_sessions_runtime` | [`worker-sessions-runtime.schema.json`](pathname:///platform-protocol-specs/worker-sessions-runtime.schema.json) |
| `local_activity_runtime` | [`local-activity-runtime.schema.json`](pathname:///platform-protocol-specs/local-activity-runtime.schema.json) |
| `history_event_payloads` | [`history-event-payloads.schema.json`](pathname:///platform-protocol-specs/history-event-payloads.schema.json) |
| `history_export_bundle` | [`history-export-bundle.schema.json`](pathname:///platform-protocol-specs/history-export-bundle.schema.json) |
| `replay_bundle` | [`replay-bundle.schema.json`](pathname:///platform-protocol-specs/replay-bundle.schema.json) |
| `waterline_read_api` | [`waterline-read-api.openapi.yaml`](pathname:///platform-protocol-specs/waterline-read-api.openapi.yaml) |
| `waterline_diagnostic_objects` | [`waterline-diagnostic-objects.schema.json`](pathname:///platform-protocol-specs/waterline-diagnostic-objects.schema.json) |
| `repair_actionability_objects` | [`repair-actionability-objects.schema.json`](pathname:///platform-protocol-specs/repair-actionability-objects.schema.json) |
| `cli_json_envelopes` | [`cli-json-envelopes.schema.json`](pathname:///platform-protocol-specs/cli-json-envelopes.schema.json) |
| `mcp_discovery` | [`mcp-discovery.schema.json`](pathname:///platform-protocol-specs/mcp-discovery.schema.json) |
| `mcp_tool_results` | [`mcp-tool-results.schema.json`](pathname:///platform-protocol-specs/mcp-tool-results.schema.json) |
| `cluster_info_envelope` | [`cluster-info-envelope.schema.json`](pathname:///platform-protocol-specs/cluster-info-envelope.schema.json) |

## Spec Formats

Every entry in the catalog declares one of three formats. The format is
chosen by the shape of the contract, not by the repository that hosts
it.

| Format | When to use | File extension |
|--------|-------------|----------------|
| `openapi` | OpenAPI 3.1 specification document. Used for HTTP+JSON request/response surfaces where method, path, status code, and body shape are part of the contract. | yaml or json |
| `json_schema` | JSON Schema (Draft 2020-12) document for a single object family or a small set of related object families. Used for response bodies, persisted record shapes, event payloads, and tool-result envelopes that are produced or consumed across protocol boundaries. | json |
| `asyncapi` | AsyncAPI 2.6+ specification document. Used for event-stream and long-poll semantics where ordering, delivery, ack, and channel topology are part of the contract. | yaml or json |

## Status Levels

Every entry declares one of three status levels so the catalog
enumerates the full spec set even before every spec is written.

| Status | Meaning |
|--------|---------|
| `published` | A normative machine-readable spec exists at the listed `spec_path`, is pinned by `conformance_test`, and is referenced from public docs. SDK authors and tooling must validate against this spec. |
| `in_progress` | The owner repo has begun publishing the spec; coverage is partial. Fields and routes that are listed are normative; routes not yet listed are still governed by the `authority_manifest` and the per-package stability document. CI enforces alignment between what the spec covers and what the manifest advertises. |
| `planned` | The spec is planned but not yet published. The `authority_manifest` and the per-package stability document remain the normative source until the spec lands. |

## Evolution Rules

These rules apply to the spec entries below. They are reproduced in the
JSON mirror under `evolution_rules`. They sit on top of the
patch/minor/major release rules in [Version Compatibility](/docs/compatibility);
this page only adds the per-format specifics.

| Evolution rule | Meaning | Applies to |
|----------------|---------|------------|
| `additive_minor_breaking_major` | Additive changes (new endpoints, new optional fields, new enum cases that consumers may safely ignore) advance the spec in a minor version. Removals, renames, type narrowings, or semantic changes require a major version, ship behind a parallel route or field where feasible, and are announced one minor in advance. | `openapi`, `asyncapi`, `json_schema` |
| `parallel_primitive_only` | The spec describes a frozen wire format. The only allowed breaking change is to introduce a parallel primitive (a new event type, command type, or schema id) alongside the existing one. The original shape stays decodable indefinitely. | `json_schema` |
| `experimental_any_release` | Spec entries marked experimental may change in any release. Consumers must opt in by reading the experimental flag on the spec. | `openapi`, `asyncapi`, `json_schema` |

## Owner Repositories

Every entry names exactly one `owner_repo`. The owner repo is the
authoritative source for advancing the spec version and for the
conformance test that pins the spec.

- `durable-workflow/workflow` — PHP workflow package, local activity
  runtime, history-event payloads, history-export bundle, replay bundle,
  repair/actionability object families.
- `durable-workflow/server` — standalone server control-plane and
  worker-protocol APIs and the `cluster/info` envelope.
- `durable-workflow/waterline` — Waterline read API and diagnostic
  object families.
- `durable-workflow/durable-workflow.github.io` — this catalog, MCP
  discovery and tool-result envelopes, and the human-readable mirrors of
  the protocol manifests.
- `durable-workflow/cli` — `dw` CLI JSON output (governed by the CLI
  reference page and the CLI output-schema manifest; this catalog names
  the manifest and per-command schema index as the protocol entry for
  automation-facing CLI output).
- `durable-workflow/sdk-python` — Python SDK public surface (governed
  by the per-package README; not in this catalog because the Python SDK
  is a consumer, not a publisher of the protocol spec set).

## Object Family Authority Index

Every public object family governed by the catalog names one schema
authority and one version authority. This table is the human-readable
index for the `object_families` arrays in
`static/platform-protocol-specs.json`; the published spec files carry
the same metadata under `x-durable-workflow-object-families`.

| Spec | Object family | Owner repo | Schema authority | Version authority |
|------|---------------|------------|------------------|-------------------|
| `control_plane_api` | `control_plane_request_contract` | `durable-workflow/server` | `App\Support\ControlPlaneRequestContract::SCHEMA` | `App\Support\ControlPlaneRequestContract::VERSION` |
| `control_plane_api` | `control_plane_response_envelope` | `durable-workflow/server` | `App\Support\ControlPlaneResponseContract::SCHEMA` | `App\Support\ControlPlaneResponseContract::VERSION` |
| `control_plane_api` | `control_plane_operation_contract` | `durable-workflow/server` | `App\Support\ControlPlaneResponseContract::CONTRACT_SCHEMA` | `App\Support\ControlPlaneResponseContract::CONTRACT_VERSION` |
| `worker_protocol_api` | `worker_registration_request` | `durable-workflow/server` | `App\Http\Controllers\Api\WorkerController::register` | `Workflow\V2\Support\WorkerProtocolVersion::VERSION` |
| `worker_protocol_api` | `worker_task_poll_request` | `durable-workflow/server` | `App\Support\WorkflowTaskPoller and App\Support\ActivityTaskPoller` | `Workflow\V2\Support\WorkerProtocolVersion::VERSION` |
| `worker_protocol_api` | `worker_task_result` | `durable-workflow/server` | `App\Http\Controllers\Api\WorkerController task completion/failure actions` | `Workflow\V2\Support\WorkerProtocolVersion::VERSION` |
| `worker_protocol_api` | `worker_query_task_poll_request` | `durable-workflow/server` | `App\Http\Controllers\Api\WorkerController::pollQueryTasks and App\Support\WorkflowQueryTaskBroker::poll` | `Workflow\V2\Support\WorkerProtocolVersion::VERSION` |
| `worker_protocol_api` | `worker_query_task_result` | `durable-workflow/server` | `App\Http\Controllers\Api\WorkerController::completeQueryTask/failQueryTask and App\Support\WorkflowQueryTaskBroker terminal outcomes` | `Workflow\V2\Support\WorkerProtocolVersion::VERSION` |
| `worker_protocol_api` | `external_task_input_contract` | `durable-workflow/server` | `App\Support\ExternalTaskInputContract::SCHEMA` | `App\Support\ExternalTaskInputContract::VERSION` |
| `worker_protocol_api` | `external_task_result_contract` | `durable-workflow/server` | `App\Support\ExternalTaskResultContract::SCHEMA` | `App\Support\ExternalTaskResultContract::VERSION` |
| `worker_protocol_stream` | `worker_poll_stream` | `durable-workflow/server` | `App\Support\LongPoller and App\Support\WorkerProtocol` | `Workflow\V2\Support\WorkerProtocolVersion::VERSION` |
| `worker_protocol_stream` | `worker_task_lease` | `durable-workflow/server` | `App\Support\WorkflowTaskPoller and App\Support\ActivityTaskPoller` | `Workflow\V2\Support\WorkerProtocolVersion::VERSION` |
| `worker_protocol_stream` | `worker_task_heartbeat` | `durable-workflow/server` | `App\Http\Controllers\Api\WorkerController heartbeat actions` | `Workflow\V2\Support\WorkerProtocolVersion::VERSION` |
| `worker_sessions_runtime` | `worker_session_runtime_contract` | `durable-workflow/workflow` | `Workflow\V2\Support\WorkerProtocolVersion::workerSessionSemantics` | `Workflow\V2\Support\WorkerProtocolVersion::VERSION` |
| `worker_sessions_runtime` | `worker_session_options` | `durable-workflow/workflow` | `Workflow\V2\Support\WorkerSessionOptions::toSnapshot` | `Workflow\V2\Support\WorkerProtocolVersion::VERSION` |
| `worker_sessions_runtime` | `worker_session_lifecycle` | `durable-workflow/server` | `App\Http\Controllers\Api\WorkerSessionController and App\Support\WorkerSessionRegistry` | `Workflow\V2\Support\WorkerProtocolVersion::VERSION` |
| `worker_sessions_runtime` | `worker_session_visibility` | `durable-workflow/server` | `App\Support\WorkerSessionRegistry::visibility` | `durable-workflow.v2.worker-sessions-runtime` |
| `local_activity_runtime` | `local_activity_runtime_contract` | `durable-workflow/workflow` | `Workflow\V2\Support\LocalActivityContract::manifest` | `Workflow\V2\Support\LocalActivityContract::VERSION` |
| `local_activity_runtime` | `local_activity_options` | `durable-workflow/workflow` | `Workflow\V2\Support\LocalActivityOptions::toSnapshot` | `Workflow\V2\Support\LocalActivityContract::VERSION` |
| `local_activity_runtime` | `local_activity_history_markers` | `durable-workflow/workflow` | `Workflow\V2\Support\LocalActivityRuntime::eventPayload` | `durable-workflow.v2.history-event-payloads` |
| `local_activity_runtime` | `local_activity_visibility` | `durable-workflow/workflow` | `Workflow\V2\Support\RunActivityView and Workflow\V2\Support\OperatorMetrics` | `durable-workflow.v2.local-activity-runtime` |
| `history_event_payloads` | `workflow_history_events` | `durable-workflow/workflow` | `Workflow\V2\Enums\HistoryEventType` | `durable-workflow.v2.history-event-payloads` |
| `history_event_payloads` | `workflow_schedule_history_events` | `durable-workflow/workflow` | `Workflow\V2\Models\WorkflowScheduleHistoryEvent` | `durable-workflow.v2.history-event-payloads` |
| `history_export_bundle` | `history_export_bundle` | `durable-workflow/workflow` | `Workflow\V2\Support\HistoryExport::SCHEMA` | `durable-workflow.v2.history-export` |
| `replay_bundle` | `replay_bundle` | `durable-workflow/workflow` | `Workflow\V2\Support\WorkflowReplayer` | `durable-workflow.v2.replay-bundle` |
| `waterline_read_api` | `waterline_read_envelope` | `durable-workflow/waterline` | `waterline route/controller response envelopes` | `durable-workflow.v2.waterline-read-api` |
| `waterline_read_api` | `waterline_operator_action_envelope` | `durable-workflow/waterline` | `waterline operator action controllers` | `durable-workflow.v2.waterline-read-api` |
| `waterline_diagnostic_objects` | `waterline_run_detail` | `durable-workflow/waterline` | `Waterline\Http\Controllers\WorkflowsController` | `durable-workflow.v2.waterline-diagnostic-objects` |
| `waterline_diagnostic_objects` | `waterline_health_diagnostics` | `durable-workflow/waterline` | `Waterline\Http\Controllers\V2HealthController` | `durable-workflow.v2.waterline-diagnostic-objects` |
| `waterline_diagnostic_objects` | `waterline_timeline_rows` | `durable-workflow/waterline` | `Waterline operator timeline projections` | `durable-workflow.v2.waterline-diagnostic-objects` |
| `waterline_diagnostic_objects` | `waterline_lineage_edges` | `durable-workflow/waterline` | `Waterline operator lineage projections` | `durable-workflow.v2.waterline-diagnostic-objects` |
| `repair_actionability_objects` | `task_repair_policy` | `durable-workflow/workflow` | `Workflow\V2\Support\TaskRepairPolicy::snapshot` | `durable-workflow.v2.repair-actionability-objects` |
| `repair_actionability_objects` | `task_repair_candidates` | `durable-workflow/workflow` | `Workflow\V2\Support\TaskRepairCandidates::snapshot` | `durable-workflow.v2.repair-actionability-objects` |
| `repair_actionability_objects` | `operator_queue_visibility` | `durable-workflow/workflow` | `Workflow\V2\Support\OperatorQueueVisibility` | `durable-workflow.v2.repair-actionability-objects` |
| `repair_actionability_objects` | `actionability` | `durable-workflow/waterline` | `Waterline\Support\ActionabilityContract` | `Waterline\Support\ActionabilityContract::VERSION` |
| `cli_json_envelopes` | `cli_output_schema_manifest` | `durable-workflow/cli` | `DurableWorkflow\Cli\Support\OutputSchemaRegistry::manifest` | `schemas/output/manifest.json version` |
| `cli_json_envelopes` | `cli_command_output_schema` | `durable-workflow/cli` | `schemas/output/*.schema.json via DurableWorkflow\Cli\Support\OutputSchemaRegistry` | `schemas/output/manifest.json schema_id and version metadata` |
| `mcp_discovery` | `mcp_tool_discovery` | `durable-workflow/durable-workflow.github.io` | `docs/mcp-workflows.md and static/platform-protocol-specs/mcp-discovery.schema.json` | `durable-workflow.v2.mcp-discovery` |
| `mcp_discovery` | `llms_txt_discovery` | `durable-workflow/durable-workflow.github.io` | `docs/mcp-workflows.md and generated llms files` | `durable-workflow.v2.mcp-discovery` |
| `mcp_tool_results` | `mcp_tool_result_envelope` | `durable-workflow/durable-workflow.github.io` | `docs/mcp-workflows.md Tool Result Contract and static/platform-protocol-specs/mcp-tool-results.schema.json` | `durable-workflow.v2.mcp-tool-results` |
| `cluster_info_envelope` | `cluster_info_envelope` | `durable-workflow/server` | `App\Http\Controllers\Api\HealthController::clusterInfo` | `durable-workflow.v2.cluster-info-envelope` |
| `cluster_info_envelope` | `client_compatibility_manifest` | `durable-workflow/server` | `App\Support\ClientCompatibility::SCHEMA` | `App\Support\ClientCompatibility::VERSION` |
| `cluster_info_envelope` | `surface_stability_contract` | `durable-workflow/workflow` | `Workflow\V2\Support\SurfaceStabilityContract::SCHEMA` | `Workflow\V2\Support\SurfaceStabilityContract::VERSION` |
| `cluster_info_envelope` | `platform_protocol_specs_catalog` | `durable-workflow/workflow` | `Workflow\V2\Support\PlatformProtocolSpecs::SCHEMA` | `Workflow\V2\Support\PlatformProtocolSpecs::VERSION` |
| `cluster_info_envelope` | `platform_conformance_suite_manifest` | `durable-workflow/workflow` | `Workflow\V2\Support\PlatformConformanceSuite::SCHEMA` | `Workflow\V2\Support\PlatformConformanceSuite::VERSION` |
| `invocable_carrier_execution` | `invocable_carrier_contract` | `durable-workflow/server` | `App\Support\InvocableCarrierContract::SCHEMA` | `App\Support\InvocableCarrierContract::VERSION` |
| `invocable_carrier_execution` | `external_execution_surface_contract` | `durable-workflow/server` | `App\Support\ExternalExecutionSurfaceContract::SCHEMA` | `App\Support\ExternalExecutionSurfaceContract::VERSION` |
| `invocable_carrier_execution` | `external_executor_config_contract` | `durable-workflow/server` | `App\Support\ExternalExecutorConfigContract::CONTRACT_SCHEMA` | `App\Support\ExternalExecutorConfigContract::CONTRACT_VERSION` |

## Spec Catalog

Each row below is the catalog entry for one public surface. The fields
match the JSON mirror exactly.

### `control_plane_api`

OpenAPI specification for the standalone Durable Workflow server
control-plane HTTP+JSON API: namespace, schedule, command, run,
history, search, worker-session visibility, and system routes that the
CLI, Python SDK, cloud control plane, and operator scripts call.

| Field | Value |
|-------|-------|
| Format | `openapi` |
| Spec id | `durable-workflow.v2.control-plane-api` |
| Surface family | `server_api` |
| Authority manifest | `control_plane` |
| Owner repo | `durable-workflow/server` |
| Owner symbol | `App\Support\ControlPlaneProtocol` and `App\Support\ControlPlaneRequestContract` |
| Evolution rule | `additive_minor_breaking_major` |
| Breaking-change release | `major` |
| Discovery endpoint | `GET /api/cluster/info -> control_plane` |
| Conformance test | `durable-workflow/server: tests/Feature/ClusterInfoCompatibilityTest.php`, `tests/Feature/ControlPlaneVersionCoverageTest.php`, `tests/Feature/ControlPlane*ContractTest.php`, and `tests/Feature/WorkflowControlPlaneTest.php` |
| Status | `published` |
| Spec path | `static/platform-protocol-specs/control-plane-api.openapi.yaml` |
| Object families | `control_plane_request_contract`, `control_plane_response_envelope`, `control_plane_operation_contract` |

### `worker_protocol_api`

OpenAPI specification for the worker-plane HTTP+JSON API: register,
poll, heartbeat, worker-session lifecycle, complete, and fail for
workflow, activity, and query tasks. Query-task routes are lease-fenced
request/response work and are advertised through the `query_tasks` worker
capability. The companion AsyncAPI document `worker_protocol_stream`
describes the long-poll and lease-renewal semantics.

| Field | Value |
|-------|-------|
| Format | `openapi` |
| Spec id | `durable-workflow.v2.worker-protocol-api` |
| Surface family | `worker_protocol` |
| Authority manifest | `worker_protocol` |
| Owner repo | `durable-workflow/server` |
| Owner symbol | `App\Support\WorkerProtocol` and `Workflow\V2\Support\WorkerProtocolVersion` |
| Evolution rule | `additive_minor_breaking_major` |
| Breaking-change release | `major` |
| Discovery endpoint | `GET /api/cluster/info -> worker_protocol` |
| Conformance test | `durable-workflow/server: tests/Feature/WorkerProtocolContractTest.php`, `tests/Feature/WorkerProtocolSuccessContractTest.php`, `tests/Feature/WorkerProtocolOwnershipErrorContractTest.php`, `tests/Feature/WorkerProtocolVersionCoverageTest.php`, `tests/Feature/WorkflowWorkerProtocolTest.php`, `tests/Feature/ActivityWorkerProtocolTest.php`, and `tests/Feature/WorkflowQueryTaskBrokerTest.php`; `durable-workflow/workflow: tests/Unit/V2/WorkerProtocolClientTest.php` and `tests/Unit/V2/WorkflowQueryTaskExecutorTest.php` |
| Status | `published` |
| Spec path | `static/platform-protocol-specs/worker-protocol-api.openapi.yaml` |
| Object families | `worker_registration_request`, `worker_task_poll_request`, `worker_task_result`, `worker_query_task_poll_request`, `worker_query_task_result`, `external_task_input_contract`, `external_task_result_contract` |

### `worker_protocol_stream`

AsyncAPI specification for the worker poll/heartbeat/complete/fail
event-stream semantics: long-poll cancellation, lease renewal, queue
routing precedence, build-id rollout drains, and graceful disconnect.

| Field | Value |
|-------|-------|
| Format | `asyncapi` |
| Spec id | `durable-workflow.v2.worker-protocol-stream` |
| Surface family | `worker_protocol` |
| Authority manifest | `worker_protocol` |
| Owner repo | `durable-workflow/server` |
| Owner symbol | `App\Support\WorkerProtocol` and `Workflow\V2\Support\WorkerCompatibilityFleet` |
| Evolution rule | `additive_minor_breaking_major` |
| Breaking-change release | `major` |
| Discovery endpoint | `GET /api/cluster/info -> worker_protocol` |
| Conformance test | `durable-workflow/server: tests/Feature/WorkerProtocolContractTest.php`, `tests/Feature/WorkerProtocolSuccessContractTest.php`, and `tests/Feature/WorkerProtocolOwnershipErrorContractTest.php` |
| Status | `published` |
| Spec path | `static/platform-protocol-specs/worker-protocol-stream.asyncapi.yaml` |
| Object families | `worker_poll_stream`, `worker_task_lease`, `worker_task_heartbeat` |

### `worker_sessions_runtime`

JSON Schema for the worker-session runtime contract: the
`worker_protocol.server_capabilities.worker_sessions` manifest,
`schedule_activity` `worker_session` command options, explicit lifecycle
request/result envelopes, activity task affinity snapshots, and operator
visibility envelopes.

| Field | Value |
|-------|-------|
| Format | `json_schema` |
| Spec id | `durable-workflow.v2.worker-sessions-runtime` |
| Surface family | `worker_protocol` |
| Authority manifest | `worker_protocol` |
| Owner repo | `durable-workflow/server` |
| Owner symbol | `App\Support\WorkerSessionRegistry and Workflow\V2\Support\WorkerProtocolVersion::workerSessionSemantics` |
| Evolution rule | `additive_minor_breaking_major` |
| Breaking-change release | `major` |
| Discovery endpoint | `GET /api/cluster/info -> worker_protocol.server_capabilities.worker_sessions` |
| Conformance test | `durable-workflow/server: tests/Feature/WorkerSessionProtocolTest.php` and `tests/Feature/ClusterInfoTest.php`; `durable-workflow/workflow: tests/Unit/V2/WorkerProtocolVersionTest.php` and `tests/Unit/V2/WorkerSessionOptionsTest.php` |
| Status | `published` |
| Spec path | `static/platform-protocol-specs/worker-sessions-runtime.schema.json` |
| Object families | `worker_session_runtime_contract`, `worker_session_options`, `worker_session_lifecycle`, `worker_session_visibility` |

### `local_activity_runtime`

JSON Schema for the local activity runtime contract: the
`worker_protocol.server_capabilities.local_activities` manifest,
`LocalActivityOptions` snapshots, same-process execution markers,
workflow-task lease heartbeats, cold-replay retry semantics, and
operator visibility markers.

| Field | Value |
|-------|-------|
| Format | `json_schema` |
| Spec id | `durable-workflow.v2.local-activity-runtime` |
| Surface family | `worker_protocol` |
| Authority manifest | `worker_protocol` |
| Owner repo | `durable-workflow/workflow` |
| Owner symbol | `Workflow\V2\Support\LocalActivityContract` and `Workflow\V2\Support\LocalActivityOptions` |
| Evolution rule | `additive_minor_breaking_major` |
| Breaking-change release | `major` |
| Discovery endpoint | `GET /api/cluster/info -> worker_protocol.server_capabilities.local_activities` |
| Conformance test | `durable-workflow/workflow: tests/Unit/V2/LocalActivitiesDocumentationTest.php`, `tests/Unit/V2/WorkerProtocolVersionTest.php`, `tests/Unit/V2/WorkflowFacadeTest.php`, and `tests/Feature/V2/V2LocalActivityTest.php`; `durable-workflow/server: tests/Feature/ClusterInfoTest.php` |
| Status | `published` |
| Spec path | `static/platform-protocol-specs/local-activity-runtime.schema.json` |
| Object families | `local_activity_runtime_contract`, `local_activity_options`, `local_activity_history_markers`, `local_activity_visibility` |

### `history_event_payloads`

JSON Schema set for every published `workflow_history_events` and
`workflow_schedule_history_events` payload. Once a workflow writes an
event, every future SDK that replays it must decode the same field set;
the only allowed breaking change is a parallel primitive with a new
event type name. The frozen-event tables in the workflow package
[`docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/v2/docs/api-stability.md)
are the per-event source of truth.

| Field | Value |
|-------|-------|
| Format | `json_schema` |
| Spec id | `durable-workflow.v2.history-event-payloads` |
| Surface family | `history_event_wire_formats` |
| Authority manifest | `history_event_payload_contract` |
| Owner repo | `durable-workflow/workflow` |
| Owner symbol | `Workflow\V2\Models\WorkflowHistoryEvent` and `Workflow\V2\Enums\HistoryEventType` |
| Evolution rule | `parallel_primitive_only` |
| Breaking-change release | `parallel_primitive_only` |
| Conformance test | `durable-workflow/workflow: tests/Unit/V2/HistoryEventWireFormatDocumentationTest.php` and `tests/Unit/V2/VersionMarkerWireFormatTest.php` |
| Status | `published` |
| Spec path | `static/platform-protocol-specs/history-event-payloads.schema.json` |
| Object families | `workflow_history_events`, `workflow_schedule_history_events` |

### `history_export_bundle`

JSON Schema for the history-export bundle that the server emits and
that replay tooling consumes: ordered history events, payload
references, payload codec metadata, lineage edges, and bundle manifest.
The schema is defined once for the v2 release; the schema id
`durable-workflow.v2.history-export` is the canonical version anchor
and the only allowed breaking change is a parallel primitive (a new
schema id alongside the existing one).

| Field | Value |
|-------|-------|
| Format | `json_schema` |
| Spec id | `durable-workflow.v2.history-export-bundle` |
| Surface family | `history_event_wire_formats` |
| Authority manifest | `history_event_payload_contract` |
| Owner repo | `durable-workflow/workflow` |
| Owner symbol | `Workflow\V2\Support\HistoryExport` |
| Evolution rule | `parallel_primitive_only` |
| Breaking-change release | `parallel_primitive_only` |
| Conformance test | `durable-workflow/workflow: tests/Unit/V2/HistoryExportTest.php` |
| Status | `published` |
| Spec path | `static/platform-protocol-specs/history-export-bundle.schema.json` |
| Object families | `history_export_bundle` |

### `replay_bundle`

JSON Schema for the deterministic replay bundle: workflow definition
fingerprint, decoded history, side-effect projections, and
replay-verification metadata. Consumed by replay tooling, debugging
UIs, and the replay-verification contract.

| Field | Value |
|-------|-------|
| Format | `json_schema` |
| Spec id | `durable-workflow.v2.replay-bundle` |
| Surface family | `history_event_wire_formats` |
| Authority manifest | `replay_verification_contract` |
| Owner repo | `durable-workflow/workflow` |
| Owner symbol | `Workflow\V2\Support\WorkflowReplayer` and `Workflow\V2\Support\ReplayState` |
| Evolution rule | `additive_minor_breaking_major` |
| Breaking-change release | `major` |
| Conformance test | `durable-workflow/workflow: tests/Feature/V2/V2WorkflowReplayerTest.php`, `tests/Feature/V2/V2GoldenHistoryReplayTest.php`, and `durable-workflow/server: tests/Unit/ReplayVerificationContractTest.php` |
| Status | `published` |
| Spec path | `static/platform-protocol-specs/replay-bundle.schema.json` |
| Object families | `replay_bundle` |

### `waterline_read_api`

OpenAPI specification for the Waterline observability read API at
`/waterline/api/v2/*`: workflow lookup, run timeline, signal/update
views, schedule audit, and dashboard JSON shapes.

| Field | Value |
|-------|-------|
| Format | `openapi` |
| Spec id | `durable-workflow.v2.waterline-read-api` |
| Surface family | `waterline_api` |
| Authority manifest | `waterline_operator_api` |
| Owner repo | `durable-workflow/waterline` |
| Owner symbol | waterline `routes/api.php` and the Waterline OperatorReadController |
| Evolution rule | `additive_minor_breaking_major` |
| Breaking-change release | `major` |
| Conformance test | `durable-workflow/waterline: tests/Feature/V2DashboardWorkflowTest.php`, `tests/Feature/V2DashboardWorkflowListTest.php`, `tests/Feature/V2HealthControllerTest.php`, `tests/Feature/V2SchedulesHistoryControllerTest.php`, `tests/Feature/V2ServicesControllerTest.php`, and `tests/Feature/V2HistoryExportControllerTest.php` |
| Status | `published` |
| Spec path | `static/platform-protocol-specs/waterline-read-api.openapi.yaml` |
| Object families | `waterline_read_envelope`, `waterline_operator_action_envelope` |

### `waterline_diagnostic_objects`

JSON Schema for the diagnostic object families Waterline emits:
timeline rows, lineage edges, operator hints, queue depth snapshots,
and engine-source attribution. These are the diagnostic shapes that
operator dashboards and external observability adapters parse.

| Field | Value |
|-------|-------|
| Format | `json_schema` |
| Spec id | `durable-workflow.v2.waterline-diagnostic-objects` |
| Surface family | `waterline_api` |
| Authority manifest | `waterline_operator_api` |
| Owner repo | `durable-workflow/waterline` |
| Owner symbol | waterline DiagnosticObjectContract and OperatorReadProjections |
| Evolution rule | `additive_minor_breaking_major` |
| Breaking-change release | `major` |
| Conformance test | `durable-workflow/waterline: tests/Unit/Support/V2DiagnosticsExecutionContractAlignmentTest.php`, `tests/Feature/V2DashboardWorkflowTest.php`, and `tests/Feature/V2DashboardWorkflowListTest.php` |
| Status | `published` |
| Spec path | `static/platform-protocol-specs/waterline-diagnostic-objects.schema.json` |
| Object families | `waterline_run_detail`, `waterline_health_diagnostics`, `waterline_timeline_rows`, `waterline_lineage_edges` |

### `repair_actionability_objects`

JSON Schema for the repair and actionability object families:
task-repair candidates, repair policies, actionability hints,
operator-queue visibility entries, and the structured failure shapes
that drive operator-led recovery.

| Field | Value |
|-------|-------|
| Format | `json_schema` |
| Spec id | `durable-workflow.v2.repair-actionability-objects` |
| Surface family | `server_api` |
| Authority manifest | `control_plane` |
| Owner repo | `durable-workflow/workflow` |
| Owner symbol | `Workflow\V2\Support\TaskRepairCandidates`, `Workflow\V2\Support\TaskRepairPolicy`, and `Workflow\V2\Support\OperatorQueueVisibility` |
| Evolution rule | `additive_minor_breaking_major` |
| Breaking-change release | `major` |
| Conformance test | `durable-workflow/workflow: tests/Unit/Commands/V2RepairPassCommandTest.php`, `tests/Feature/V2/V2OperatorQueueVisibilityTest.php`; `durable-workflow/waterline: tests/Feature/V2DashboardWorkflowTest.php`, `tests/Feature/V2DashboardWorkflowListTest.php`; `durable-workflow/server: tests/Feature/TransportRepairTest.php` |
| Status | `published` |
| Spec path | `static/platform-protocol-specs/repair-actionability-objects.schema.json` |
| Object families | `task_repair_policy`, `task_repair_candidates`, `operator_queue_visibility`, `actionability` |

### `cli_json_envelopes`

JSON Schema index for the `dw` CLI machine-readable output contract:
the published output-schema manifest and the per-command JSON / JSONL
envelope schemas that automation, agents, and operator scripts consume.

| Field | Value |
|-------|-------|
| Format | `json_schema` |
| Spec id | `durable-workflow.v2.cli-json-envelopes` |
| Surface family | `cli_json` |
| Authority manifest | `cli_reference` |
| Owner repo | `durable-workflow/cli` |
| Owner symbol | `DurableWorkflow\Cli\Support\OutputSchemaRegistry`, `schemas/output/manifest.json`, and `tests/Commands/OutputContractTest.php` |
| Evolution rule | `additive_minor_breaking_major` |
| Breaking-change release | `major` |
| Conformance test | `durable-workflow/cli: tests/Commands/OutputContractTest.php` and `tests/Commands/ApplicationSmokeTest.php` |
| Status | `published` |
| Spec path | `static/platform-protocol-specs/cli-json-envelopes.schema.json` |
| Object families | `cli_output_schema_manifest`, `cli_command_output_schema` |

### `mcp_discovery`

JSON Schema for the Model Context Protocol discovery surface at
`/mcp/*` and the `llms.txt` / `llms-2.0.txt` discovery files: tool
list shape, parameter schema shape, and discovery hints.

| Field | Value |
|-------|-------|
| Format | `json_schema` |
| Spec id | `durable-workflow.v2.mcp-discovery` |
| Surface family | `mcp_discovery_results` |
| Authority manifest | `mcp_workflows` |
| Owner repo | `durable-workflow/durable-workflow.github.io` |
| Owner symbol | `docs/mcp-workflows.md`, `scripts/generate-llms.js`, and `scripts/generate-llms-full.js` |
| Evolution rule | `additive_minor_breaking_major` |
| Breaking-change release | `major` |
| Conformance test | `durable-workflow/durable-workflow.github.io: scripts/check-discoverability.js` and `scripts/check-llms-ai-surfaces.js` |
| Status | `published` |
| Spec path | `static/platform-protocol-specs/mcp-discovery.schema.json` |
| Object families | `mcp_tool_discovery`, `llms_txt_discovery` |

### `mcp_tool_results`

JSON Schema for MCP tool-result envelopes: result object shape,
payload-preview limits, error envelope, and the
`payload_preview_limit_bytes` semantics. Tool descriptions and
discovery hints are diagnostic, not contract.

| Field | Value |
|-------|-------|
| Format | `json_schema` |
| Spec id | `durable-workflow.v2.mcp-tool-results` |
| Surface family | `mcp_discovery_results` |
| Authority manifest | `mcp_workflows` |
| Owner repo | `durable-workflow/durable-workflow.github.io` |
| Owner symbol | `docs/mcp-workflows.md` Tool Result Contract and `static/platform-protocol-specs/mcp-tool-results.schema.json` |
| Evolution rule | `additive_minor_breaking_major` |
| Breaking-change release | `major` |
| Conformance test | `durable-workflow/durable-workflow.github.io: scripts/check-llms-ai-surfaces.js` and `scripts/check-platform-protocol-specs.js` |
| Status | `published` |
| Spec path | `static/platform-protocol-specs/mcp-tool-results.schema.json` |
| Object families | `mcp_tool_result_envelope` |

### `cluster_info_envelope`

JSON Schema for the `GET /api/cluster/info` envelope: identity,
capability, topology, coordination-health, and the nested protocol
manifests (`client_compatibility`, `control_plane`, `worker_protocol`,
`surface_stability_contract`, `platform_protocol_specs`,
`platform_conformance_suite`, `auth_composition_contract`,
`bridge_adapter_outcome_contract`, `replay_verification_contract`).
The envelope is the discovery surface that every other catalog entry
can be reached from.

The published spec lives at
[`static/platform-protocol-specs/cluster-info-envelope.schema.json`](pathname:///platform-protocol-specs/cluster-info-envelope.schema.json)
and declares `$id = durable-workflow.v2.cluster-info-envelope` (matching
`spec_id`) under JSON Schema Draft 2020-12. The schema pins the top-level
keys, required fields, and nested-manifest discovery points; per-manifest
field shapes are normative under each nested manifest's own `schema` /
`version` and are not redefined here.

The nested `platform_conformance_suite` manifest points to the public
[Platform Conformance Suite](/docs/platform-conformance) authority and
its static mirror at
[`static/platform-conformance-contract.json`](pathname:///platform-conformance-contract.json).

| Field | Value |
|-------|-------|
| Format | `json_schema` |
| Spec id | `durable-workflow.v2.cluster-info-envelope` |
| Surface family | `cluster_info_manifests` |
| Authority manifest | `cluster_info` |
| Owner repo | `durable-workflow/server` |
| Owner symbol | `App\Http\Controllers\Api\HealthController::clusterInfo` |
| Evolution rule | `additive_minor_breaking_major` |
| Breaking-change release | `major` |
| Discovery endpoint | `GET /api/cluster/info` |
| Conformance test | `durable-workflow/server: tests/Feature/ClusterInfoCompatibilityTest.php` |
| Status | `published` |
| Spec path | `static/platform-protocol-specs/cluster-info-envelope.schema.json` |
| Object families | `cluster_info_envelope`, `client_compatibility_manifest`, `surface_stability_contract`, `platform_protocol_specs_catalog`, `platform_conformance_suite_manifest` |

### `invocable_carrier_execution`

JSON Schema for the invocable HTTP carrier execution surface: the
activity-only HTTP carrier contract, external task input and result
envelopes, the external execution surface boundary, and the
handler-mapping config contract that routes activity tasks to carrier
endpoints. These wire-protocol terms define what an external activity
handler must implement to receive and complete tasks through the
invocable carrier.

| Field | Value |
|-------|-------|
| Format | `json_schema` |
| Spec id | `durable-workflow.v2.invocable-carrier-execution` |
| Surface family | `worker_protocol` |
| Authority manifest | `worker_protocol` |
| Owner repo | `durable-workflow/server` |
| Owner symbol | `App\Support\InvocableCarrierContract`, `App\Support\ExternalTaskInputContract`, `App\Support\ExternalTaskResultContract`, `App\Support\ExternalExecutionSurfaceContract`, and `App\Support\ExternalExecutorConfigContract` |
| Evolution rule | `additive_minor_breaking_major` |
| Breaking-change release | `major` |
| Discovery endpoint | `GET /api/cluster/info -> worker_protocol.invocable_carrier_contract` |
| Conformance test | `durable-workflow/server: tests/Unit/InvocableCarrierContractTest.php`, `tests/Unit/ExternalTaskInputContractTest.php`, `tests/Unit/ExternalTaskResultContractTest.php`, and `tests/Unit/ExternalExecutionSurfaceContractTest.php` |
| Status | `in_progress` |
| Spec path | `static/platform-protocol-specs/invocable-carrier-execution.schema.json` |
| Object families | `invocable_carrier_contract`, `external_execution_surface_contract`, `external_executor_config_contract` |

## Release Check

Release reviewers must confirm the platform-protocol-specs catalog
check before publish. The checks are reproduced in the JSON mirror
under `release_check`.

| Gate | Description |
|------|-------------|
| `catalog_aligned_with_surface_families` | Every entry's `surface_family` exists in `SurfaceStabilityContract::surfaceFamilies()`. Every `surface_family` that owns a public machine-facing surface has at least one catalog entry. |
| `owner_repo_known` | Every entry's `owner_repo` is one of the known fleet repositories. |
| `format_known` | Every entry's `format` is one of `openapi`, `json_schema`, or `asyncapi`. |
| `docs_authority_aligned` | This page lists every entry in the manifest with the same format, owner, object-family authority, status, and breaking-change rule. |
| `json_mirror_aligned` | `static/platform-protocol-specs.json` is byte-equivalent to the workflow package catalog mirror that `PlatformProtocolSpecs::manifest()` loads. |
| `object_family_authority_declared` | Every entry declares a non-empty `object_families` list. Each object family names the owning repo, schema authority, and version authority. Published spec files carry matching `x-durable-workflow-object-families` metadata so the file and catalog cannot drift. |
| `spec_path_published_when_status_published` | When `status` is `published`, the file at `spec_path` exists in this repository, is referenced from the matching authority doc page, parses as the format declared by the catalog entry (JSON Schema 2020-12 / OpenAPI 3.1 / AsyncAPI 2.6+), and the document's `$id` (or OpenAPI `info.title` / AsyncAPI `id`) matches the catalog `spec_id`. |
| `breaking_change_release_consistent_with_evolution_rule` | Every entry's `breaking_change_release` is one of `major`, `parallel_primitive_only`, or `experimental_any_release`, and matches the value required by its `evolution_rule`: `additive_minor_breaking_major` → `major`, `parallel_primitive_only` → `parallel_primitive_only`, `experimental_any_release` → `experimental_any_release`. Letting these diverge would let a frozen wire format claim a major-version break, contradicting its rule. |
| `deliverable_specs_published` | Every entry in the platform protocol-spec deliverable surface set is marked `published` and has a parseable spec document. |

The docs site CI runs `scripts/check-platform-protocol-specs.js` to
enforce these gates. When the workflow repository is checked out beside
the docs site, or when `WORKFLOW_REPO_PATH` points at it, the same check
also compares the static catalog mirror byte-for-byte with the workflow
package mirror. When the server repository is checked out beside the docs
site, or when `SERVER_REPO_PATH` points at it, the check also compares
server-owned OpenAPI, AsyncAPI, and cluster-info schema files against the
server repo's `resources/platform-protocol-specs/` copies. Drift here
means a release shipped a doc change without updating the machine-readable
catalog or the owning implementation repo. Either fix the doc, update the
owner mirror, or bump the catalog; do not silence the check.
