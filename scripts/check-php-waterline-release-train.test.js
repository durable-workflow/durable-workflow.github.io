#!/usr/bin/env node

const assert = require('assert');

const {
  SCHEMA_VERSION,
  buildQuickstartQualification,
  quickstartContractIdentity,
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
  'rust_user_cloud_completion',
  'operator_local_server_observation',
  'laravel_user_embedded_completion',
];
const contract = {
  schema: 'durable-workflow.docs.v2.quickstart-execution-contract',
  version: 5,
  contract_url: 'https://durable-workflow.com/quickstart-execution-contract.json',
  artifacts: Object.fromEntries(
    Object.entries(versions).map(([name, version]) => [name, {version}]),
  ),
  scenarios: requiredScenarios.map(id => ({id})),
};
const contractBytes = Buffer.from(`${JSON.stringify(contract, null, 2)}\n`);
const digest = character => character.repeat(64);
assert.strictEqual(
  SCHEMA_VERSION,
  7,
  'the release-train guard must remain compatible with the deployed v7 audit verifier',
);
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
  qualification: {
    contract_identity: quickstartContractIdentity(contract, contractBytes),
    scenario_results: requiredScenarios.map(id => ({id, outcome: 'pass'})),
    exact_composer_graph: {
      outcome: 'pass',
      artifact_tuple: {
        'sdk-php': versions['sdk-php'],
        waterline: versions.waterline,
        workflow: versions.workflow,
      },
      manifest_sha256: digest('a'),
      install_output_sha256: digest('b'),
      package_discovery: 'pass',
      package_discovery_output_sha256: digest('c'),
      laravel_boot: 'pass',
    },
  },
};

const qualify = (candidateContract, evidenceRecords) => quickstartQualificationFromEvidence(
  candidateContract,
  versions,
  evidenceRecords,
  candidateContract === contract
    ? contractBytes
    : Buffer.from(`${JSON.stringify(candidateContract, null, 2)}\n`),
);

const sourceOnly = qualify(contract, []);
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
  qualify(contract, [stale]).outcome,
  'incomplete',
  'stale passing quickstart evidence must not complete the current tuple',
);

const staleContract = structuredClone(contract);
staleContract.artifacts['sdk-php'].version = '2.0.0-rc.6';
assert.strictEqual(
  qualify(staleContract, [passing]).outcome,
  'incomplete',
  'an execution tuple different from the quickstart contract must not pass',
);

const legacyPass = structuredClone(passing);
delete legacyPass.qualification;
assert.strictEqual(
  qualify(contract, [legacyPass]).outcome,
  'incomplete',
  'a tuple-only legacy pass must not complete the quickstart qualification',
);
assert.strictEqual(
  quickstartQualificationFromEvidence(contract, versions, [legacyPass]).outcome,
  'incomplete',
  'parsed contract data without an exact byte identity must remain incomplete',
);

const wrongContract = structuredClone(passing);
wrongContract.qualification.contract_identity.sha256 = digest('d');
assert.strictEqual(
  qualify(contract, [wrongContract]).outcome,
  'incomplete',
  'evidence for different contract bytes must not pass',
);

const missingScenarioResult = structuredClone(passing);
missingScenarioResult.qualification.scenario_results.pop();
assert.strictEqual(
  qualify(contract, [missingScenarioResult]).outcome,
  'incomplete',
  'evidence must prove every required scenario passed',
);

const staleComposerGraph = structuredClone(passing);
staleComposerGraph.qualification.exact_composer_graph.artifact_tuple['sdk-php'] =
  '2.0.0-rc.6';
assert.strictEqual(
  qualify(contract, [staleComposerGraph]).outcome,
  'incomplete',
  'Laravel proof must use the exact PHP SDK, Workflow, and Waterline graph',
);

const failedPackageDiscovery = structuredClone(passing);
failedPackageDiscovery.qualification.exact_composer_graph.package_discovery = 'fail';
assert.strictEqual(
  qualify(contract, [failedPackageDiscovery]).outcome,
  'incomplete',
  'failed Laravel package discovery must not pass',
);

const failedLaravelBoot = structuredClone(passing);
failedLaravelBoot.qualification.exact_composer_graph.laravel_boot = 'fail';
assert.strictEqual(
  qualify(contract, [failedLaravelBoot]).outcome,
  'incomplete',
  'failed Laravel application boot must not pass',
);

const runnerBlocked = structuredClone(passing);
runnerBlocked.runner_blocked = true;
assert.strictEqual(
  qualify(contract, [runnerBlocked]).outcome,
  'incomplete',
  'runner-blocked evidence must not complete the current tuple',
);

const completed = qualify(contract, [passing]);
assert.strictEqual(completed.outcome, 'pass');
assert.deepStrictEqual(completed.required_scenarios, requiredScenarios);
assert.deepStrictEqual(completed.evidence.artifact_tuple, versions);
assert.deepStrictEqual(completed.evidence.qualification, passing.qualification);
assert.deepStrictEqual(completed.contract_artifact_versions, versions);
assert.deepStrictEqual(completed.execution_artifact_versions, versions);

const missingLaravel = structuredClone(contract);
missingLaravel.scenarios.pop();
assert.throws(
  () => qualify(missingLaravel, [passing]),
  /exact six release scenarios/,
);

console.log('PHP SDK and Waterline docs release-train checks passed');
