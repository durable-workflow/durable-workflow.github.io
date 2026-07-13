---
sidebar_position: 19
title: Platform Conformance Suite
description: Public authority for the Durable Workflow v2 conformance-suite manifest, fixture catalog, harness rules, and release gates.
tags:
  - compatibility
  - conformance
  - protocols
  - api-stability
keywords:
  - platform conformance suite
  - conformance harness
  - conformance fixtures
  - durable workflow compatibility
  - platform-conformance-contract
---

# Platform Conformance Suite

This page is the public authority for the Durable Workflow **platform
conformance suite**. It defines the conformance target matrix, reusable
fixture catalog, harness contract, pass / fail rules, and release gates
for implementations that claim Durable Workflow v2 compatibility.

The machine-readable mirror is published at
[`static/platform-conformance-contract.json`](pathname:///platform-conformance-contract.json)
with schema `durable-workflow.v2.platform-conformance.suite`, version
`29`. The same manifest is advertised by the standalone server from
`GET /api/cluster/info` under `platform_conformance_suite`. The
[Platform Protocol Specs](/docs/2.0/platform-protocol-specs) catalog names
that nested manifest as the `platform_conformance_suite_manifest`
object family in the `cluster_info_envelope` spec.

The suite is downstream of the
[Version Compatibility](/docs/2.0/compatibility) authority. Where the suite
enumerates a surface family or stability rule, it must match the
surface-stability contract. The compatibility authority defines what
the contract is; this page defines how an implementation proves it
follows that contract.

## Target Matrix

A conformance **target** is a kind of implementation that can claim
Durable compatibility. An implementation may claim more than one target.
For example, the standalone server claims `standalone_server`,
`worker_protocol_implementation`, and `repair_actionability_surface`.

| Target | Required surface families | Required fixture categories |
| --- | --- | --- |
| `standalone_server` | `server_api`, `worker_protocol`, `cluster_info_manifests` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `worker_task_lifecycle`, `failure_repair_actionability` |
| `official_sdk` | `official_sdks`, `worker_protocol`, `history_event_wire_formats` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `worker_task_lifecycle`, `history_replay_bundles` |
| `worker_protocol_implementation` | `worker_protocol`, `history_event_wire_formats` | `worker_task_lifecycle`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `history_replay_bundles` |
| `cli_json_client` | `cli_json` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `cli_json_envelopes` |
| `waterline_contract_surface` | `waterline_api` | `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `namespace_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `waterline_observer_envelopes` |
| `repair_actionability_surface` | `worker_protocol`, `server_api` | `failure_repair_actionability` |
| `mcp_discovery_surface` | `mcp_discovery_results` | `mcp_discovery_envelopes` |
| `prerelease_release_candidate` | `server_api`, `official_sdks`, `cli_json`, `waterline_api`, `cluster_info_manifests` | `skew_refusal_matrix_contract`, `workflow_update_runtime_contract`, `principal_attribution_contract`, `prerelease_readiness_contract` |

Targets are stable. Adding a target, adding a required surface to an
existing target, adding a required fixture category, promoting a
provisional category to required, changing stable runtime scenario
`operations` or `pass_criteria`, changing a stable runtime scenario public
requirement field (`artifact_policy`, `common_result_evidence`,
`required_matrix`, `scenario_requirements`, or `host_runner_contract`), or
changing a pass / fail rule is a suite contract change and must advance the
manifest version.

## Fixture Catalog

The suite does not duplicate fixtures. It declares source-of-truth
locations and the categories each one supplies. Harnesses load the
declared fixtures directly from those locations.

Every stable fixture category uses a canonical current-version docs-site URL
as its fixture-level `authority_doc`. Stable runtime scenario categories use
this page's current docs route,
`https://durable-workflow.github.io/docs/2.0/platform-conformance`. Stable
non-runtime categories point at the public docs authority for their surface:
CLI and Python parity for control-plane fixtures, Worker Protocol for worker
task lifecycle fixtures, Platform Protocol Specs for repair/actionability
objects, and CLI Command Reference for CLI JSON envelopes. Their
machine-readable scenario ids and pass criteria are published in the docs-site
JSON manifests linked from the category notes below.

| Category | Status | Source repository | Path | Purpose |
| --- | --- | --- | --- | --- |
| `control_plane_request_response` | `stable` | `cli` | `tests/fixtures/control-plane/` | Frozen request bodies and response shapes for control-plane operations such as workflow start, signal, query, update, cancel, task-history, and namespace storage diagnostics. |
| `control_plane_request_response` | `stable` | `sdk-python` | `tests/fixtures/control-plane/` | Frozen request bodies and response shapes for control-plane operations such as workflow start, signal, query, update, cancel, task-history, and namespace storage diagnostics. |
| `worker_task_lifecycle` | `stable` | `cli` | `tests/fixtures/external-task/` | Task input envelopes and task result envelopes used by every conforming worker. |
| `worker_task_lifecycle` | `stable` | `cli` | `tests/fixtures/external-task-input/` | Task input envelopes and task result envelopes used by every conforming worker. |
| `worker_task_lifecycle` | `stable` | `sdk-python` | `tests/fixtures/external-task-input/` | Task input envelopes and task result envelopes used by every conforming worker. |
| `worker_task_lifecycle` | `stable` | `sdk-python` | `tests/fixtures/external-task-result/` | Task input envelopes and task result envelopes used by every conforming worker. |
| `signal_query_runtime_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/signal-query-runtime-scenarios.json` | Live published-artifact scenarios for signal delivery and query consistency across PHP, Python, and Rust workers and SDK clients, replay timing, terminal runs, malformed payloads, and operator visibility. |
| `workflow_update_runtime_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/workflow-update-runtime-scenarios.json` | Live published-artifact scenarios for workflow updates across declared update visibility, accepted/running/completed/failed outcomes, idempotency, refusal paths, payload envelopes, principal attribution, PHP/Python parity, and operator visibility. |
| `search_attribute_runtime_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/search-attribute-runtime-scenarios.json` | Live published-artifact scenarios for Temporal-parity search attributes across PHP and Python workers, CLI query surfaces, Waterline operator visibility, cross-language codecs, load latency, boolean grammar, and adversarial query handling. |
| `schedules_runtime_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/schedules-runtime-scenarios.json` | Live published-artifact scenarios for Temporal-parity schedules across cron and fixed-rate cadence, public list and describe surfaces, pause/resume/delete controls, missed-fire policy, restart survival, CLI/Python/PHP client paths, cross-language scheduled workflow dispatch, and adversarial schedule inputs. |
| `history_replay_bundles` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/replay-runtime-scenarios.json` | Deterministic replay coverage for frozen history bundles, worker restart replay, adversarial refusal, and in-flight signal timing across the official PHP and Python runtimes. |
| `history_replay_bundles` | `stable` | `workflow` | `tests/Fixtures/V2/GoldenHistory/` | Deterministic replay coverage for frozen history bundles, worker restart replay, adversarial refusal, and in-flight signal timing across the official PHP and Python runtimes. |
| `history_replay_bundles` | `stable` | `sdk-python` | `tests/fixtures/golden_history/` | Deterministic replay coverage for frozen history bundles, worker restart replay, adversarial refusal, and in-flight signal timing across the official PHP and Python runtimes. |
| `namespace_runtime_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/namespace-runtime-scenarios.json` | Live published-artifact scenarios for Temporal-parity namespace isolation, lifecycle cleanup, CLI and SDK namespace selection, PHP worker routing, Waterline visibility, Nexus opt-in crossing, and search-attribute value query isolation. |
| `child_workflow_runtime_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/child-workflow-runtime-scenarios.json` | Live published-artifact scenarios for child workflow orchestration across PHP and Python workers, cross-language parent/child execution, failure and cancellation propagation, replay after worker restart, concurrent fan-out, and namespace behavior. |
| `worker_versioning_runtime_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/worker-versioning-runtime-scenarios.json` | Live published-artifact scenarios for safe-deploy worker versioning across build-ID registration, rollout visibility, drain/resume controls, per-run pins, compatible replay routing, no-compatible-worker diagnostics, cross-language PHP/Python pinning, adversarial no-bump behavior, and history API version pins. |
| `saga_runtime_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/saga-runtime-scenarios.json` | Live published-artifact scenarios for saga compensation across forward success, reverse-order compensation, early failure, retry idempotence, compensation failure visibility, worker restart replay, PHP/Python cross-language compensation, typed compensation errors, and operator-visible in-progress compensation state. |
| `migration_runtime_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/migration-runtime-scenarios.json` | Live published-artifact scenarios for v1 to v2 migration across preserved histories, in-flight progress, activities, signal-or-timer waits, schedules, worker registrations, CLI access, Waterline operator visibility, new v2 starts, queue-aware rollback semantics, and version-skew refusal. |
| `skew_refusal_matrix_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/skew-refusal-matrix-scenarios.json` | Published-artifact version-skew refusal scenarios across CLI, Python SDK, PHP workflow worker, Waterline, future-version boundaries, worker registration classifications, Waterline render classifications, and per-operation request/response evidence. |
| `principal_attribution_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/principal-attribution-scenarios.json` | Published-artifact scenarios proving server-derived, non-spoofable principal attribution across raw HTTP, CLI, Python SDK, PHP workflow client, and Waterline operator surfaces. |
| `prerelease_readiness_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/prerelease-readiness-scenarios.json` | Published-artifact scenarios for 2.0 prerelease readiness across Workflow, Waterline, server, CLI, Python SDK, sample app, public docs, and the quickstart local-server hosting and Laravel paths. |
| `failure_repair_actionability` | `stable` | `server` | `docs/contracts/external-task-result.md` | Failure objects and repair / actionability shapes for stuck tasks, deterministic failure, and replay-mismatch surfaces. |
| `failure_repair_actionability` | `stable` | `server` | `docs/contracts/replay-verification.md` | Failure objects and repair / actionability shapes for stuck tasks, deterministic failure, and replay-mismatch surfaces. |
| `cli_json_envelopes` | `stable` | `cli` | `tests/fixtures/control-plane/` | The `--output=json` and `--output=jsonl` envelopes that automation depends on. |
| `cli_json_envelopes` | `stable` | `cli` | `schemas/` | The `--output=json` and `--output=jsonl` envelopes that automation depends on. |
| `waterline_observer_envelopes` | `provisional` | `waterline` | `tests/fixtures/observer/ (planned)` | The `/waterline/api/v2/*` shapes and operator dashboard JSON envelopes. |
| `mcp_discovery_envelopes` | `provisional` | `workflow` | `tests/Fixtures/Mcp/ (planned)` | MCP `tools/list`, `tools/call`, and `llms-2.0.txt` discovery envelopes. |
| `mcp_discovery_envelopes` | `provisional` | `server` | `tests/Fixtures/Mcp/ (planned)` | MCP `tools/list`, `tools/call`, and `llms-2.0.txt` discovery envelopes. |

## Workflow Lifecycle Release Authority

The exact released workflow-lifecycle scenario authority is
[published as JSON](https://durable-workflow.github.io/platform-conformance/workflow-lifecycle-scenarios.json).
It is the byte-equivalent public mirror named by server `0.2.647`, and it
records the lifecycle requirements exercised at the published server
`0.2.647` and `durable-workflow` crate `0.1.12` boundary. This authority is
part of the explicit 2.0 prerelease line. It does not change stable 1.x as the
default docs line.

The Rust shard installs exactly crate `0.1.12` from crates.io and records the
registry source and checksum for that crate and the official `apache-avro`
crate. The payload proof uses the SDK's published Avro envelope backed by
`apache-avro`; a custom codec implementation or local product checkout is not
acceptable provenance.

The shard must execute and report all of these cells:

- `instance_cancel` and `instance_terminate` through the public SDK commands.
- `selected_run_guard` and `stale_run_rejection` so a selected run cannot be
  confused with the instance's current run.
- `typed_failed`, `typed_cancelled`, `typed_terminated`, and `typed_timed_out`
  as typed terminal outcomes carrying workflow and run identity.
- `cancellation_heartbeat` and `late_activity_completion_refused` so activity
  code observes cancellation and a late completion cannot overwrite the
  terminal result.
- `worker_restart_during_cancellation` while cancellation settlement is still
  pending, proving that a replacement worker does not reclaim the closed
  activity.

The manifest also requires the exact artifact and server versions, cluster
identity, install provenance, workflow identities, per-cell outcomes, stable
reasons, payload contract, executor topology, Rust shard contract version,
runner identity, and shard exit status. Missing, unsupported, runner-blocked,
or unsuccessful Rust evidence cannot satisfy the lifecycle category.

A fixture category is required for a target only when the target lists
it and the category status is not `provisional`. Provisional categories
emit advisory warnings and become load-bearing only when promoted to
`stable` in a later suite version.

The `signal_query_runtime_contract` category is stable. A result for it
must record concrete pinned published artifact versions and must name
every required scenario as `pass`, `fail`, `unsupported`, `not_covered`,
or `runner_blocked` with linked findings. Placeholder or unresolved
version tokens such as `latest`, `current`, `head`, `<latest>`,
`${VERSION}`, or `{{ version }}` fail the result gate. Only `pass` cells
count toward a passing category:
`published_artifact_install_only`,
`python_worker_cli_and_sdk_baseline`, `php_worker_cli_and_sdk_baseline`,
`python_worker_php_facing_and_cli_clients`,
`php_worker_python_and_cli_clients`,
`rust_worker_rust_php_python_clients`, `python_worker_rust_client`,
`php_worker_rust_client`, `rust_query_error_and_immutability`,
`ordered_signal_delivery`,
`dedup_contract_observation`, `signal_during_replay`,
`query_during_replay`,
`rust_replayed_instance_state_query_after_cold_restart`,
`completed_run_signal_and_query`,
`unknown_signal_and_query_errors`,
`malformed_signal_and_query_payloads`, and
`waterline_operator_visibility`.

Those scenario ids and their pass criteria are published as the
machine-readable runtime scenario manifest at
[`static/platform-conformance/signal-query-runtime-scenarios.json`](pathname:///platform-conformance/signal-query-runtime-scenarios.json).
Implementation tests may exercise the scenarios, but they are not stable
fixture sources for external harnesses.

The Rust cells install the exact `durable-workflow` crate version declared by
the runtime scenario manifest from crates.io and record the Cargo registry
source and checksum for both the SDK and its resolved `apache-avro` dependency.
Snapshot-derived query transport is graded by
`rust_worker_rust_php_python_clients` and
`rust_query_error_and_immutability`. It is not replayed workflow-instance
state. The separate
`rust_replayed_instance_state_query_after_cold_restart` cell uses
`register_replayed_workflow` and `register_replayed_query`, starts a fresh Rust
worker process after a cold stop, restores durable history, and compares
running, restored, and completed state through Rust, PHP, and Python callers.
Both successful and failed query sequences capture history and workflow-command
counts before the first successful measured query and must leave those counts
unchanged.

For `completed_run_signal_and_query`, a completed cleanly run with a
replayable declared query handler must return its final query state
through every claimed public query surface. Stable terminal-state errors
are valid only for explicitly unsupported terminal states or unavailable
handlers; a generic completed-run terminal error is not a passing result
for a replayable completed run.

The `workflow_update_runtime_contract` category is a stable runtime
scenario category. A result for it must use published artifacts, pin the
server, CLI, Python SDK, PHP workflow package, and Waterline versions,
state whether any local product source checkouts were used, and name
every required update scenario as `pass`, `fail`, `unsupported`,
`not_covered`, or `runner_blocked` with linked findings. Passing update
evidence must exercise public control-plane, history, CLI/SDK, and
operator-readable surfaces; local source execution does not count.

Required workflow update scenarios cover published-artifact install,
declared update contract visibility, accepted update control-plane and
history evidence, running or waiting operator visibility, completed
result round trip, failed or refused outcomes, duplicate request or
idempotency behavior, unknown update refusal, invalid input refusal,
payload envelope round trip, terminal-workflow behavior, authenticated
principal attribution, PHP client/worker parity, Python client/worker
parity, and operator diagnostics. If an SDK lacks first-class update
support, the result must report a typed unsupported cell with a focused
SDK finding instead of silently omitting the language.

Those scenario ids and their pass criteria are published as the
machine-readable runtime scenario manifest at
[`static/platform-conformance/workflow-update-runtime-scenarios.json`](pathname:///platform-conformance/workflow-update-runtime-scenarios.json).
The current host-runner handoff is intentionally `runner_blocked` until a
registered host runner can install the pinned published artifacts and
drive the full workflow-update matrix.

The `search_attribute_runtime_contract` category is a stable runtime
scenario category. A result for it must use published artifacts, cover
PHP and Python workflow start/upsert behavior, CLI query and error
surfaces, Waterline operator visibility, cross-language codec round
trips, equality/range/bool queries, OR/NOT grammar, keyword-list
membership, type safety, indexing latency distribution, load latency,
namespace isolation, reserved-name refusal, and query injection
hardening. A Python/server smoke subset is nonconforming until every
required cell is recorded as `pass`, `fail`, `unsupported`,
`not_covered`, or `runner_blocked` with linked findings. Only `pass`
cells count toward a passing category.

Those search-attribute scenario ids and their pass criteria are
published at
[`static/platform-conformance/search-attribute-runtime-scenarios.json`](pathname:///platform-conformance/search-attribute-runtime-scenarios.json).

The `schedules_runtime_contract` category is a stable runtime scenario
category. A result for it must use published artifacts and cover cron
cadence, fixed-rate cadence, list and describe visibility, pause/resume
windows with no fires, delete stopping future fires, missed-fire policy,
restart survival, CLI schedule operations, Python SDK schedule
operations, PHP-facing schedule operations, Python-created PHP workflow
fires, PHP-created Python workflow fires, invalid cron refusal, and
nonexistent workflow type outcomes. A schedule lifecycle smoke subset is
nonconforming until every required cell is recorded as `pass`, `fail`,
`unsupported`, `not_covered`, or `runner_blocked` with linked findings.
Only `pass` cells count toward a passing category.

Those schedules scenario ids and their pass criteria are published at
[`static/platform-conformance/schedules-runtime-scenarios.json`](pathname:///platform-conformance/schedules-runtime-scenarios.json).

The `history_replay_bundles` category is also a stable runtime scenario
category. A result for it must use published artifacts, cover PHP and
Python replay for completed histories, worker restart, activity,
signal/update, wait-condition, version-marker, saga-compensation,
explicit code-divergence refusal, server-side history mutation refusal,
malformed history refusal, and in-flight signal restart timing. A
golden-history smoke subset is nonconforming until every required cell is
recorded as `pass`, `fail`, `unsupported`, `not_covered`, or
`runner_blocked` with linked findings. Only `pass` cells count toward a
passing category.

Those replay scenario ids and their pass criteria are published at
[`static/platform-conformance/replay-runtime-scenarios.json`](pathname:///platform-conformance/replay-runtime-scenarios.json).

The `namespace_runtime_contract` category is a stable runtime scenario
category. A result for it must use published artifacts, cover namespace
create/update/describe/list, lifecycle cleanup and recreate, workflow
visibility and mutation isolation, PHP worker task-queue isolation, CLI
namespace context and default-scope behavior, SDK namespace selection
parity, search-attribute schema and value query isolation, schedule
isolation, Waterline/operator scoped visibility, explicit Nexus
cross-namespace calls, reserved-name refusal, and result-record routing
for product findings. A namespace smoke subset is nonconforming until
every required cell is recorded as `pass`, `fail`, `unsupported`,
`not_covered`, or `runner_blocked` with linked findings. Only `pass`
cells count toward a passing category.

Non-normative implementation notes for Waterline/operator scoped
visibility can come from the published Waterline artifact or a focused
Waterline shard. Useful reviewer captures include scoped workflow list
and detail views, schedule views when the product exposes them,
search-attribute values, dashboard scope, operator API stats, and the
documented verdict for any default or unscoped view advertised by the
product; the normative pass criteria remain the
`waterline_operator_namespace_visibility` scenario below.

Those namespace scenario ids and their pass criteria are published at
[`static/platform-conformance/namespace-runtime-scenarios.json`](pathname:///platform-conformance/namespace-runtime-scenarios.json).

The `child_workflow_runtime_contract` category is a stable runtime
scenario category. A result for it must use published artifacts and cover
same-language PHP and Python parent/child runs, PHP-to-Python and
Python-to-PHP parent/child runs, child failure round-trip typing, parent
cancellation propagation to a child, direct child cancellation observed
by a parent, replay across parent worker restart while waiting on a
child, concurrent fan-out to five children, and namespace behavior. A
single parent/child smoke is nonconforming until every required cell is
recorded as `pass`, `fail`, `unsupported`, `not_covered`, or
`runner_blocked` with linked findings. Only `pass` cells count toward a
passing category.

Those child-workflow scenario ids and their pass criteria are published
at
[`static/platform-conformance/child-workflow-runtime-scenarios.json`](pathname:///platform-conformance/child-workflow-runtime-scenarios.json).

The `saga_runtime_contract` category is a stable runtime scenario
category. A result for it must use published artifacts and cover forward
success, failure after a later step with reverse-order compensation,
early-step failure with no extra compensation, compensation retry
idempotence, compensation-failure terminal visibility, mid-compensation
worker restart, PHP workflow to Python compensation, Python workflow to
PHP compensation, typed compensation error round trips, and
operator-visible in-progress compensation status. A saga smoke that only
proves one happy path or one SDK is nonconforming until every required
cell is recorded as `pass`, `fail`, `unsupported`, `not_covered`, or
`runner_blocked` with linked findings. Only `pass` cells count toward a
passing category. The PHP package is identified as `workflow-php` in the
runtime matrix and may also be recorded as `workflow` when comparing
against the platform release artifact set.

Those saga scenario ids and their pass criteria are published at
[`static/platform-conformance/saga-runtime-scenarios.json`](pathname:///platform-conformance/saga-runtime-scenarios.json).

The `worker_versioning_runtime_contract` category is a stable runtime
scenario category. A result for it must use published artifacts and
cover worker build-ID registration, operator rollout visibility,
drain/resume controls, per-run compatibility pins, replay only by
compatible workers, promoted-version routing for new starts, replay
after cache eviction, no-compatible-worker diagnostics, CLI and
Waterline visibility surfaces, PHP/Python cross-language pinning,
adversarial no-version-bump behavior, and history API version pins. A
worker-versioning smoke subset is nonconforming until every required
cell is recorded as `pass`, `fail`, `unsupported`, `not_covered`, or
`runner_blocked` with linked findings. Only `pass` cells count toward a
passing category.

Cross-language PHP/Python pinning evidence must record worker runtime
identities, workflow and run IDs, task-queue rollout state, the public
poll and rollout outcomes used to verify pinning, published worker
artifact install source and version, and confirmation that no local
product source checkout was used.

Those worker-versioning scenario ids and their pass criteria are
published at
[`static/platform-conformance/worker-versioning-runtime-scenarios.json`](pathname:///platform-conformance/worker-versioning-runtime-scenarios.json).

The `migration_runtime_contract` category is a stable runtime scenario
category. A result for it must use published artifacts and cover the
latest supported v1 state setup, the documented migration steps,
completed-history preservation and replay, in-flight workflow progress,
mid-activity retry state, signal-or-timer wait state, schedule cadence, worker registration
projection, Waterline operator visibility, CLI access to preupgrade
state, new v2 workflow starts, queue-aware rollback semantics, and loud
refusal for unsupported version skew. Rollback evidence must inventory ready,
delayed, and reserved v1 queue work; record whether the recovery boundary was
drained, captured as an application-consistent SQL-plus-queue cut, or accepted
as unrecoverable; and prove that each restored nonterminal v1 row has a
runnable queue or signal wake path. An eligible stale `pending` row may instead
use the supported v1.0.77 Watchdog only when evidence observes the worker loop
dispatching the enabled-by-default Watchdog, the Watchdog redispatching that
workflow after its five-minute stale bound, and the row advancing on its
recorded queue. That pending-only path does not replace preserved queue state
for retries, timers, or `waiting`/`running` work. SQL-only restore is passing
rollback evidence only when no other nonterminal queue-dependent v1 execution
exists at the recovery cut. The recovery manifest must record only the
`APP_KEY` secret-manager reference and version, with the key and recovery
credentials kept separately access-controlled from SQL and queue backups. A
fresh-install smoke or a migration run that
does not start from realistic v1 state is nonconforming until every
required cell is recorded as `pass`, `fail`, `unsupported`,
`not_covered`, or `runner_blocked` with linked findings. Only `pass`
cells count toward a passing category.

The documented-steps cell must record the live guide command list, the
commands actually executed in guide order, exit codes, and per-command
timings. Before and after state snapshots must include observed
completed-history, in-flight workflow, retrying-activity, signal-or-timer
wait, schedule, and worker-registration cells.

Those migration scenario ids and their pass criteria are published at
[`static/platform-conformance/migration-runtime-scenarios.json`](pathname:///platform-conformance/migration-runtime-scenarios.json).

The `skew_refusal_matrix_contract` category is a stable runtime scenario
category. A result for it must use published artifacts and cover
compatible, backward-skewed, forward-skewed, and outside-window pairings
for CLI, Python SDK, PHP workflow worker, and Waterline surfaces. It
must also probe future-version boundaries, capture requests and
responses for every skewed operation, classify worker skew as
`register_refused`, `register_and_serve`, or `register_and_drop`, and
classify Waterline skew as `banner`, `render_refused`, or
`stale_render`. A protocol-manifest smoke subset is nonconforming until
every required cell is recorded as `pass`, `fail`, `unsupported`,
`not_covered`, or `runner_blocked` with linked findings. Only `pass`
cells count toward a passing category; `register_and_drop` and
`stale_render` without a loud warning are blocking product findings.

Those skew-refusal scenario ids and their pass criteria are published at
[`static/platform-conformance/skew-refusal-matrix-scenarios.json`](pathname:///platform-conformance/skew-refusal-matrix-scenarios.json).

The `principal_attribution_contract` category is a stable runtime
scenario category. A result for it must use published artifacts and
prove that workflow history records server-derived principals for start,
signal, query, cancellation, completion, failure, anonymous, and
server-originated event surfaces. It must exercise adversarial
payload/header spoofing, alice/bob named identities, credential
rotation, CLI operator visibility, Waterline operator visibility, and
authenticated start or signal operations through both the Python SDK and
the PHP `Workflow\V2\Client\WorkflowClient`. SDK cells must record the
package version, operation outputs, history/API principal samples, and
raw HTTP reference principals so the harness can compare principal shape
and expected principal ids. A role-token smoke subset is nonconforming
until every required scenario is recorded as `pass`, `fail`,
`unsupported`, `not_covered`, or `runner_blocked` with linked findings.

Those principal-attribution scenario ids and their pass criteria are
published at
[`static/platform-conformance/principal-attribution-scenarios.json`](pathname:///platform-conformance/principal-attribution-scenarios.json).

The `prerelease_readiness_contract` category is a stable runtime
scenario category for the coordinated 2.0 release candidate. A result
for it must use only published artifacts and public user-facing docs,
record separate Workflow and Waterline GO / NO-GO verdicts, cover core
feature completeness, migration readiness, public API stability,
documentation accuracy, configuration understandability, and
cross-component compatibility, and evaluate server, CLI, Python SDK,
Workflow, Waterline, sample app, and public docs as one ecosystem tuple.
It must also execute the versioned 2.0 quickstart local-server hosting
and Laravel branches from live public docs through observable completed
workflows within 10 minutes, recording the exact commands, outputs,
artifact versions, and wall-clock timings. A discovery-only quickstart
check is nonconforming until it records
`quickstart_local_server_hosted_completion` and
`quickstart_laravel_branch_completion` as `pass`, `fail`,
`unsupported`, `not_covered`, or `runner_blocked`.
Any missing artifact, stale docs page, undocumented migration step,
installability gap, API instability, cross-component breaking-change
risk, or release-channel mismatch must be recorded as a non-pass cell
with a linked finding. Runner-only evidence is nonconforming and cannot
make prerelease readiness green.

Those prerelease readiness scenario ids and their pass criteria are
published at
[`static/platform-conformance/prerelease-readiness-scenarios.json`](pathname:///platform-conformance/prerelease-readiness-scenarios.json).

## Pass / Fail Rules

1. **`guaranteed_field_equality`.** Every field marked guaranteed in the
   fixture schema must be present, type-correct, and value-equal in the
   implementation response. Diagnostic-only fields are ignored.
2. **`unknown_additive_fields_tolerated`.** Extra fields pass only if
   they are documented diagnostic-only fields or the fixture is on a
   stability level that allows additive evolution.
3. **`frozen_shape_exact_match`.** Fixtures backed by a `frozen` surface
   family must match exactly. A frozen-shape mismatch is always a
   failure.
4. **`required_fixtures_must_pass`.** A release that claims a target must
   pass every required fixture category for that target. One failed
   required fixture means the release does not conform for that target.
5. **`stable_runtime_scenario_coverage`.** A stable runtime category
   must report every required scenario it declares with one of the
   statuses published by its runtime scenario manifest: `pass`, `fail`,
   `unsupported`, `not_covered`, or `runner_blocked`. Full conformance
   requires every required scenario to pass. A smoke-only subset,
   omitted scenario, unsupported public surface, uncovered cell, or
   runner-blocked cell is nonconforming and must link the owning
   finding. This status set and pass-only runtime rule are suite version
   5+ semantics.
6. **`provisional_categories_warn_only`.** A failed fixture in a
   provisional category emits a warning and does not block the release.
7. **`diagnostic_only_mismatches_pass`.** If only diagnostic-only fields
   differ, the harness records the difference in `diagnostic_diff` and
   the fixture passes.

The harness result declares one of four conformance levels:

| Level | Meaning |
| --- | --- |
| `full` | Every required fixture passes for every claimed target. |
| `partial` | Every required fixture passes for at least one claimed target, but another claimed target is failing. |
| `provisional` | Only provisional categories failed; required categories all passed. |
| `nonconforming` | At least one required fixture failed for every claimed target. |

## Harness Contract

A conforming harness:

- loads the suite manifest from `platform_conformance_suite` in
  `GET /api/cluster/info`, or from the static mirror for offline runs;
- loads each declared fixture from its source-of-truth path;
- drives the implementation through the fixture's documented operation;
- compares the response under the pass / fail rules above;
- emits one result document per run with schema
  `durable-workflow.v2.platform-conformance.result`, suite version,
  implementation identity, per-fixture results, diagnostic diff, and
  overall conformance level;
- exits non-zero if and only if the conformance level is
  `nonconforming`.

The result document is an artifact. A compatibility claim is valid only
when the result was produced against the implementation build and the
suite version named by that build.

## Release Gates

| Release | Required claimed target(s) | Required artifact |
| --- | --- | --- |
| `durable-workflow/server` | `standalone_server`, `worker_protocol_implementation`, `repair_actionability_surface` | Harness result document attached to the release. |
| `durable-workflow/workflow` | `official_sdk`, `worker_protocol_implementation` | Harness result document attached to the release. |
| `durable_workflow` | `official_sdk`, `worker_protocol_implementation` | Harness result document attached to the release. |
| `dw` | `cli_json_client` | Harness result document attached to the release. |
| `waterline` | `waterline_contract_surface` | Harness result document attached to the release. |
| `durable-workflow/2.0-release-candidate` | `prerelease_release_candidate` | Conformance record stores the published-artifact prerelease readiness result. |

Release reviewers confirm that the harness result is attached, the
conformance level is `full` or `provisional`, and the suite version in
the result matches the version exposed by the build under test. A
`nonconforming` result blocks the release.

## Release Check

The docs-site release check in
`scripts/check-platform-conformance-authority.js` fails the build if
the static manifest points at a missing, repo-local, version-alias-only,
or non-docs-site authority. It also validates every stable fixture-level
`authority_doc` value as a canonical current-version docs-site URL and
rejects stable runtime scenario categories that advertise implementation
tests or raw command test directories instead of an approved public
fixture or scenario manifest.
The same check requires this page to list the manifest schema, target
names, fixture category names, pass / fail rules, and release gates from
the machine-readable mirror.

When the suite changes, update this page and
`static/platform-conformance-contract.json` together. If the change
adds a target, adds a required fixture category, promotes a provisional
category to stable, changes stable runtime scenario `operations` or
`pass_criteria`, changes a stable runtime scenario public requirement
field (`artifact_policy`, `common_result_evidence`, `required_matrix`,
`scenario_requirements`, or `host_runner_contract`), or changes a pass /
fail rule, advance the suite version in the same release change. The
release check pins stable runtime scenario criteria and public runtime
requirement snapshots by suite-versioned digests so external harnesses
cannot observe new criteria or evidence-policy requirements under an old
suite version.

Published runtime scenario criteria and public requirement digest entries
are append-only. To advance stable runtime scenario `operations` or
`pass_criteria`, leave every existing
`VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS` entry unchanged, increase the
suite version, update the scenario manifest to that version, and add a new
criteria digest entry for the new current suite. To change public runtime
manifest evidence requirements, artifact policy, required matrix, scenario
requirement fields, or host-runner contract fields, leave every existing
`VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS` entry unchanged,
advance the suite version, update the scenario manifest to that version,
and add the corresponding public requirement digest entry for the new
current suite. The release check compares published digest entries from the
target branch against the current change, so editing or deleting an older
suite entry fails even when the current suite version adds a new digest.
