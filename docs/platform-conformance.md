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
`10`. The same manifest is advertised by the standalone server from
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
| `standalone_server` | `server_api`, `worker_protocol`, `cluster_info_manifests` | `control_plane_request_response`, `signal_query_runtime_contract`, `search_attribute_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `worker_task_lifecycle`, `failure_repair_actionability` |
| `official_sdk` | `official_sdks`, `worker_protocol`, `history_event_wire_formats` | `control_plane_request_response`, `signal_query_runtime_contract`, `search_attribute_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `worker_task_lifecycle`, `history_replay_bundles` |
| `worker_protocol_implementation` | `worker_protocol`, `history_event_wire_formats` | `worker_task_lifecycle`, `signal_query_runtime_contract`, `search_attribute_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `history_replay_bundles` |
| `cli_json_client` | `cli_json` | `control_plane_request_response`, `signal_query_runtime_contract`, `search_attribute_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `cli_json_envelopes` |
| `waterline_contract_surface` | `waterline_api` | `signal_query_runtime_contract`, `search_attribute_runtime_contract`, `namespace_runtime_contract`, `waterline_observer_envelopes` |
| `repair_actionability_surface` | `worker_protocol`, `server_api` | `failure_repair_actionability` |
| `mcp_discovery_surface` | `mcp_discovery_results` | `mcp_discovery_envelopes` |

Targets are stable. Adding a target, adding a required surface to an
existing target, adding a required fixture category, promoting a
provisional category to required, changing stable runtime scenario
`operations` or `pass_criteria`, or changing a pass / fail rule is a
suite contract change and must advance the manifest version.

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
| `signal_query_runtime_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/signal-query-runtime-scenarios.json` | Live published-artifact scenarios for signal delivery and query consistency across PHP and Python workers, CLI and SDK clients, replay timing, terminal runs, malformed payloads, and operator visibility. |
| `search_attribute_runtime_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/search-attribute-runtime-scenarios.json` | Live published-artifact scenarios for Temporal-parity search attributes across PHP and Python workers, CLI query surfaces, Waterline operator visibility, cross-language codecs, load latency, boolean grammar, and adversarial query handling. |
| `history_replay_bundles` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/replay-runtime-scenarios.json` | Deterministic replay coverage for frozen history bundles, worker restart replay, adversarial refusal, and in-flight signal timing across the official PHP and Python runtimes. |
| `history_replay_bundles` | `stable` | `workflow` | `tests/Fixtures/V2/GoldenHistory/` | Deterministic replay coverage for frozen history bundles, worker restart replay, adversarial refusal, and in-flight signal timing across the official PHP and Python runtimes. |
| `history_replay_bundles` | `stable` | `sdk-python` | `tests/fixtures/golden_history/` | Deterministic replay coverage for frozen history bundles, worker restart replay, adversarial refusal, and in-flight signal timing across the official PHP and Python runtimes. |
| `namespace_runtime_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/namespace-runtime-scenarios.json` | Live published-artifact scenarios for Temporal-parity namespace isolation, lifecycle cleanup, CLI and SDK namespace selection, PHP worker routing, Waterline visibility, Nexus opt-in crossing, and search-attribute value query isolation. |
| `child_workflow_runtime_contract` | `stable` | `durable-workflow.github.io` | `static/platform-conformance/child-workflow-runtime-scenarios.json` | Live published-artifact scenarios for child workflow orchestration across PHP and Python workers, cross-language parent/child execution, failure and cancellation propagation, replay after worker restart, concurrent fan-out, and namespace behavior. |
| `failure_repair_actionability` | `stable` | `server` | `docs/contracts/external-task-result.md` | Failure objects and repair / actionability shapes for stuck tasks, deterministic failure, and replay-mismatch surfaces. |
| `failure_repair_actionability` | `stable` | `server` | `docs/contracts/replay-verification.md` | Failure objects and repair / actionability shapes for stuck tasks, deterministic failure, and replay-mismatch surfaces. |
| `cli_json_envelopes` | `stable` | `cli` | `tests/fixtures/control-plane/` | The `--output=json` and `--output=jsonl` envelopes that automation depends on. |
| `cli_json_envelopes` | `stable` | `cli` | `schemas/` | The `--output=json` and `--output=jsonl` envelopes that automation depends on. |
| `waterline_observer_envelopes` | `provisional` | `waterline` | `tests/fixtures/observer/ (planned)` | The `/waterline/api/v2/*` shapes and operator dashboard JSON envelopes. |
| `mcp_discovery_envelopes` | `provisional` | `workflow` | `tests/Fixtures/Mcp/ (planned)` | MCP `tools/list`, `tools/call`, and `llms-2.0.txt` discovery envelopes. |
| `mcp_discovery_envelopes` | `provisional` | `server` | `tests/Fixtures/Mcp/ (planned)` | MCP `tools/list`, `tools/call`, and `llms-2.0.txt` discovery envelopes. |

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
`php_worker_python_and_cli_clients`, `ordered_signal_delivery`,
`dedup_contract_observation`, `signal_during_replay`,
`query_during_replay`, `completed_run_signal_and_query`,
`unknown_signal_and_query_errors`,
`malformed_signal_and_query_payloads`, and
`waterline_operator_visibility`.

Those scenario ids and their pass criteria are published as the
machine-readable runtime scenario manifest at
[`static/platform-conformance/signal-query-runtime-scenarios.json`](pathname:///platform-conformance/signal-query-runtime-scenarios.json).
Implementation tests may exercise the scenarios, but they are not stable
fixture sources for external harnesses.

For `completed_run_signal_and_query`, a completed cleanly run with a
replayable declared query handler must return its final query state
through every claimed public query surface. Stable terminal-state errors
are valid only for explicitly unsupported terminal states or unavailable
handlers; a generic completed-run terminal error is not a passing result
for a replayable completed run.

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
`pass_criteria`, or changes a pass / fail rule, advance the suite
version in the same release change. The release check pins stable
runtime scenario criteria by suite-versioned digests so external
harnesses cannot observe new criteria under an old suite version.

Published runtime scenario criteria digest entries are append-only. To
advance stable runtime scenario `operations` or `pass_criteria`, leave
every existing `VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS` entry
unchanged, increase the suite version, update the scenario manifest to
that version, and add a new digest entry for the new current suite. The
release check compares published digest entries from the target branch
against the current change, so editing or deleting an older suite entry
fails even when the current suite version adds a new digest.
