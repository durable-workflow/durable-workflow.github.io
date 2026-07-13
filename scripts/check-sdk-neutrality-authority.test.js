#!/usr/bin/env node

const assert = require('assert');
const {
  assertNoRepositoryLocalReferences,
  assertNeutralityRules,
  assertReleaseGates,
  assertSdkBreadthPolicy,
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
