#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  assertNoRepositoryLocalReferences,
  assertNeutralityRules,
  assertPinnedWorkflowAuthority,
  assertReleaseGates,
  assertSdkBreadthPolicy,
  assertWorkflowMirrorMatches,
  loadAuthorityCatalogs,
  loadContract,
} = require('./check-sdk-neutrality-authority');

function changed(contract, mutate) {
  const copy = JSON.parse(JSON.stringify(contract));
  mutate(copy);
  return copy;
}

const contract = loadContract();
const catalogs = loadAuthorityCatalogs();

assert.doesNotThrow(() => assertNoRepositoryLocalReferences(contract));
assert.doesNotThrow(() => assertNeutralityRules(contract, catalogs));
assert.doesNotThrow(() => assertSdkBreadthPolicy(contract, catalogs));
assert.doesNotThrow(() => assertReleaseGates(contract));

const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-neutrality-authority-'));
try {
  const standaloneRoot = path.join(isolatedRoot, 'standalone-docs-checkout');
  fs.mkdirSync(path.join(standaloneRoot, 'scripts'), {recursive: true});
  fs.mkdirSync(path.join(standaloneRoot, 'static'), {recursive: true});
  fs.copyFileSync(
    path.join(__dirname, 'workflow-sdk-neutrality-authority-lock.json'),
    path.join(standaloneRoot, 'scripts', 'workflow-sdk-neutrality-authority-lock.json'),
  );
  fs.copyFileSync(
    path.join(__dirname, '..', 'static', 'sdk-neutrality-contract.json'),
    path.join(standaloneRoot, 'static', 'sdk-neutrality-contract.json'),
  );
  assert.doesNotThrow(
    () => assertWorkflowMirrorMatches({environment: {}, repoRoot: standaloneRoot}),
    'standalone validation must use the authority digest locked to the exact Workflow artifact',
  );

  assert.throws(
    () => assertWorkflowMirrorMatches({
      environment: {},
      repoRoot: path.join(isolatedRoot, 'docs-checkout'),
    }),
    /authority input is required but unavailable/,
    'release validation must fail when the Workflow package authority is unavailable',
  );

  assert.throws(
    () => assertPinnedWorkflowAuthority({
      repoRoot: standaloneRoot,
      workflowVersion: '2.0.0-alpha.275',
    }),
    /lock targets 2\.0\.0-alpha\.274.*pins 2\.0\.0-alpha\.275/,
    'standalone validation must reject an authority lock for a different Workflow artifact',
  );

  const driftedStandaloneContract = path.join(
    standaloneRoot,
    'static',
    'drifted-sdk-neutrality-contract.json',
  );
  fs.copyFileSync(
    path.join(standaloneRoot, 'static', 'sdk-neutrality-contract.json'),
    driftedStandaloneContract,
  );
  fs.appendFileSync(driftedStandaloneContract, '\n');
  assert.throws(
    () => assertPinnedWorkflowAuthority({
      contractPath: driftedStandaloneContract,
      repoRoot: standaloneRoot,
    }),
    /must match the exact Workflow 2\.0\.0-alpha\.274 authority digest/,
    'standalone validation must reject byte drift from the pinned Workflow artifact',
  );

  const driftedWorkflow = path.join(isolatedRoot, 'workflow');
  fs.mkdirSync(path.join(driftedWorkflow, 'resources'), {recursive: true});
  fs.writeFileSync(
    path.join(driftedWorkflow, 'resources', 'sdk-neutrality-contract.json'),
    `${JSON.stringify(contract, null, 2)}\n\n`,
  );
  assert.throws(
    () => assertWorkflowMirrorMatches({
      environment: {
        WORKFLOW_SDK_NEUTRALITY_MANIFEST_PATH: path.join(
          driftedWorkflow,
          'resources',
          'sdk-neutrality-contract.json',
        ),
      },
    }),
    /must be byte-equivalent/,
    'release validation must reject byte drift from the Workflow package authority',
  );
} finally {
  fs.rmSync(isolatedRoot, {recursive: true, force: true});
}

const repositoryPath = changed(contract, copy => {
  copy.neutrality_rules.replay_fixture_neutrality.how_to_apply =
    'Read tests/Fixtures/V2/GoldenHistory/ for the replay authority.';
});
assert.throws(
  () => assertNoRepositoryLocalReferences(repositoryPath),
  /repository-relative path/,
  'repository-local fixture paths must fail the release check',
);

const implementationSymbol = changed(contract, copy => {
  copy.release_gates.enforcement.machine =
    'Workflow\\V2\\Support\\SdkNeutralityContract::manifest is the authority.';
});
assert.throws(
  () => assertNoRepositoryLocalReferences(implementationSymbol),
  /implementation symbol/,
  'implementation symbols must fail the release check',
);

const sourceBlobUrl = changed(contract, copy => {
  copy.neutrality_rules.replay_fixture_neutrality.authority[2].url =
    'https://github.com/durable-workflow/workflow/blob/v2/tests/Fixtures/replay.json';
});
assert.throws(
  () => assertNoRepositoryLocalReferences(sourceBlobUrl),
  /public URL with a repository-local path/,
  'source-blob URLs must not masquerade as consumable public authorities',
);

const unknownProtocolId = changed(contract, copy => {
  copy.neutrality_rules.codec_neutrality.authority[0].id =
    'durable-workflow.v2.unpublished-worker-protocol';
});
assert.throws(
  () => assertNeutralityRules(unknownProtocolId, catalogs),
  /is not published by static\/platform-protocol-specs\.json/,
  'unpublished protocol IDs must fail the release check',
);

const missingScenario = changed(contract, copy => {
  copy.sdk_breadth_policy.first_party.rust_sdk.conformance.scenario_ids.push(
    'rust_unpublished_conformance_scenario',
  );
});
assert.throws(
  () => assertSdkBreadthPolicy(missingScenario, catalogs),
  /references unpublished scenario/,
  'unpublished conformance scenario IDs must fail the release check',
);

const missingRustActor = changed(contract, copy => {
  copy.sdk_breadth_policy.first_party.rust_sdk.conformance.actor_ids = ['rust_sdk'];
});
assert.throws(
  () => assertSdkBreadthPolicy(missingRustActor, catalogs),
  /actor_ids must include "rust_worker"/,
  'incomplete Rust coverage must fail the release check',
);

console.log('SDK-neutrality-authority adversarial tests passed');
