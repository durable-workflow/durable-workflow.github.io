#!/usr/bin/env node

const assert = require('assert');

const {
  buildQuickstartQualification,
  quickstartQualificationFromEvidence,
} = require('./generate-docs-page-release-audit');
const {
  PUBLISHED_ARTIFACT_VERSIONS,
} = require('./public-artifact-versions');

const versions = {
  cli: '2.0.0-rc.12',
  'sdk-php': '2.0.0-rc.7',
  'sdk-python': '2.0.0-rc.8',
  'sdk-rust': '2.0.0-rc.7',
  server: '2.0.0-rc.13',
  waterline: '2.0.0-rc.10',
  workflow: '2.0.0-rc.12',
};
const requiredScenarios = [
  'php_user_local_server_completion',
  'python_user_local_server_completion',
  'rust_user_local_server_completion',
  'operator_local_server_observation',
  'laravel_user_embedded_completion',
];
const contract = {
  schema: 'durable-workflow.docs.v2.quickstart-execution-contract',
  scenarios: requiredScenarios.map(id => ({id})),
};
const passing = {
  schema: 'durable-workflow.v2.platform-conformance.run-evidence',
  schema_version: 1,
  id: 'quickstart-20260802t120000z',
  experiment: 'quickstart',
  evidence_kind: 'executed_run',
  artifact_tuple: versions,
  outcome: 'pass',
  runner_blocked: false,
  finished_at: '2026-08-02T12:00:00Z',
};

const sourceOnly = quickstartQualificationFromEvidence(contract, versions, []);
assert.strictEqual(sourceOnly.outcome, 'incomplete');
assert.strictEqual(sourceOnly.evidence, null);

assert.deepStrictEqual(
  buildQuickstartQualification().artifact_versions,
  PUBLISHED_ARTIFACT_VERSIONS,
  'deployed quickstart qualification must describe the exact published tuple',
);

const stale = structuredClone(passing);
stale.artifact_tuple['sdk-php'] = '2.0.0-rc.6';
assert.strictEqual(
  quickstartQualificationFromEvidence(contract, versions, [stale]).outcome,
  'incomplete',
  'stale passing quickstart evidence must not complete the current tuple',
);

const runnerBlocked = structuredClone(passing);
runnerBlocked.runner_blocked = true;
assert.strictEqual(
  quickstartQualificationFromEvidence(contract, versions, [runnerBlocked]).outcome,
  'incomplete',
  'runner-blocked evidence must not complete the current tuple',
);

const completed = quickstartQualificationFromEvidence(contract, versions, [passing]);
assert.strictEqual(completed.outcome, 'pass');
assert.deepStrictEqual(completed.required_scenarios, requiredScenarios);
assert.deepStrictEqual(completed.evidence.artifact_tuple, versions);

const missingLaravel = structuredClone(contract);
missingLaravel.scenarios.pop();
assert.throws(
  () => quickstartQualificationFromEvidence(missingLaravel, versions, [passing]),
  /exact five release scenarios/,
);

console.log('PHP SDK and Waterline docs release-train checks passed');
