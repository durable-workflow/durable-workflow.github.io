#!/usr/bin/env node

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const manifestPath = path.join(
  repoRoot,
  'static',
  'platform-conformance',
  'workflow-lifecycle-scenarios.json'
);
// This digest is the exact workflow-lifecycle manifest shipped by server
// 0.2.647 and exercised with durable-workflow crate 0.1.12.
const RELEASED_MANIFEST_SHA256 =
  'c74b2a8c8744a87bc5297ed50c761712636ed74044e9ec264065bf1f580a42f1';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const raw = read(manifestPath);
const digest = crypto.createHash('sha256').update(raw).digest('hex');
assert.strictEqual(
  digest,
  RELEASED_MANIFEST_SHA256,
  'workflow lifecycle authority must remain byte-equivalent to the released server 0.2.647 manifest'
);

const manifest = JSON.parse(raw);
assert.strictEqual(
  manifest.schema,
  'durable-workflow.v2.platform-conformance.runtime-scenarios'
);
assert.strictEqual(manifest.category, 'workflow_lifecycle_contract');
assert.strictEqual(manifest.suite_version, 18);
assert.strictEqual(manifest.result_schema, 'durable-workflow.v2.workflow-lifecycle.result');
assert.deepStrictEqual(manifest.source_policy, {
  pass_requires_published_artifacts_only: true,
  local_product_source_checkouts_used_must_be_false: true,
  truthy_values_rejected: ['1', 'true', 'yes', 'on'],
});

for (const field of [
  'artifact_versions',
  'published_artifact_versions',
  'artifact_sources',
  'scenario_results',
  'lifecycle_cell_outcomes',
  'findings',
  'local_product_source_checkouts_used',
  'source_policy',
]) {
  assert(
    manifest.required_run_record_fields.includes(field),
    `workflow lifecycle authority must require run-record field ${field}`
  );
}

for (const id of [
  'continue_as_new_run_chain_visibility',
  'continue_as_new_identity_and_history_continuity',
  'continue_as_new_duplicate_side_effect_prevention',
  'cancellation_public_surface_terminal_state',
  'termination_public_surface_terminal_state',
  'rust_sdk_lifecycle_surface',
]) {
  assert(
    manifest.required_scenarios.includes(id),
    `workflow lifecycle authority must require scenario ${id}`
  );
}

const rustScenario = manifest.scenarios.find(({id}) => id === 'rust_sdk_lifecycle_surface');
assert(rustScenario, 'workflow lifecycle authority must define the Rust SDK scenario');
assert.strictEqual(
  rustScenario.required_behavior,
  'rust_sdk_exact_crate_exercises_lifecycle_against_the_matching_published_server_image'
);
for (const field of [
  'artifact_version',
  'server_version',
  'install_provenance',
  'workflow_identities',
  'scenario_outcomes',
  'stable_reasons',
  'payload_contract',
  'executor_topology',
  'rust_shard_contract_version',
  'shard_runner',
  'shard_exit_status',
]) {
  assert(
    rustScenario.required_evidence.includes(field),
    `Rust lifecycle scenario must require evidence field ${field}`
  );
}

console.log(
  `Workflow lifecycle authority matches released manifest sha256:${digest}.`
);

module.exports = {
  RELEASED_MANIFEST_SHA256,
};
