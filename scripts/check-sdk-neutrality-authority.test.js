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
const {
  workflowAuthorityLockSource,
} = require('./refresh-public-artifact-versions');
const currentWorkflowRef = require('./public-artifact-versions.json').artifacts.workflow;

function nextWorkflowPrerelease(ref) {
  return ref.replace(/\.(\d+)$/, (_, sequence) => `.${Number(sequence) + 1}`);
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
  function writeAuthorityFixture(root, workflowRef, manifestSource) {
    fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
    fs.mkdirSync(path.join(root, 'static'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'static', 'sdk-neutrality-contract.json'),
      manifestSource,
    );
    fs.writeFileSync(
      path.join(root, 'scripts', 'workflow-sdk-neutrality-authority-lock.json'),
      workflowAuthorityLockSource(workflowRef, manifestSource),
    );
  }

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

  const successorWorkflowRef = nextWorkflowPrerelease(currentWorkflowRef);
  const currentManifestSource = fs.readFileSync(
    path.join(__dirname, '..', 'static', 'sdk-neutrality-contract.json'),
    'utf8',
  );
  const unchangedSuccessorRoot = path.join(isolatedRoot, 'unchanged-successor');
  writeAuthorityFixture(unchangedSuccessorRoot, successorWorkflowRef, currentManifestSource);
  const unchangedPublishedManifest = path.join(
    isolatedRoot,
    'unchanged-published-sdk-neutrality-contract.json',
  );
  fs.writeFileSync(unchangedPublishedManifest, currentManifestSource);

  assert.doesNotThrow(
    () => assertWorkflowMirrorMatches({
      environment: {},
      repoRoot: unchangedSuccessorRoot,
      workflowVersion: successorWorkflowRef,
    }),
    'standalone validation must accept a successor ref whose authority bytes are unchanged',
  );
  assert.doesNotThrow(
    () => assertWorkflowMirrorMatches({
      environment: {
        WORKFLOW_SDK_NEUTRALITY_MANIFEST_PATH: unchangedPublishedManifest,
      },
      repoRoot: unchangedSuccessorRoot,
      workflowVersion: successorWorkflowRef,
    }),
    'release validation must accept the same successor ref and packaged authority bytes',
  );

  const staleRefRoot = path.join(isolatedRoot, 'stale-ref-successor');
  writeAuthorityFixture(staleRefRoot, currentWorkflowRef, currentManifestSource);
  assert.throws(
    () => assertWorkflowMirrorMatches({
      environment: {
        WORKFLOW_SDK_NEUTRALITY_MANIFEST_PATH: unchangedPublishedManifest,
      },
      repoRoot: staleRefRoot,
      workflowVersion: successorWorkflowRef,
    }),
    new RegExp(`lock targets ${escaped(currentWorkflowRef)}.*pins ${escaped(successorWorkflowRef)}`),
    'release validation must reject a stale lock ref even when the packaged bytes match',
  );

  const staleDigestRoot = path.join(isolatedRoot, 'stale-digest-successor');
  writeAuthorityFixture(staleDigestRoot, successorWorkflowRef, currentManifestSource);
  const staleDigestLockPath = path.join(
    staleDigestRoot,
    'scripts',
    'workflow-sdk-neutrality-authority-lock.json',
  );
  const staleDigestLock = JSON.parse(fs.readFileSync(staleDigestLockPath, 'utf8'));
  staleDigestLock.sha256 = '0'.repeat(64);
  fs.writeFileSync(staleDigestLockPath, `${JSON.stringify(staleDigestLock, null, 2)}\n`);
  assert.throws(
    () => assertWorkflowMirrorMatches({
      environment: {
        WORKFLOW_SDK_NEUTRALITY_MANIFEST_PATH: unchangedPublishedManifest,
      },
      repoRoot: staleDigestRoot,
      workflowVersion: successorWorkflowRef,
    }),
    new RegExp(`must match the exact Workflow ${escaped(successorWorkflowRef)} authority digest`),
    'release validation must reject a stale digest before accepting packaged bytes',
  );

  const changedManifestSource = `${currentManifestSource}\n`;
  const changedSuccessorRoot = path.join(isolatedRoot, 'changed-successor');
  writeAuthorityFixture(changedSuccessorRoot, successorWorkflowRef, changedManifestSource);
  const changedPublishedManifest = path.join(
    isolatedRoot,
    'changed-published-sdk-neutrality-contract.json',
  );
  fs.writeFileSync(changedPublishedManifest, changedManifestSource);
  assert.doesNotThrow(
    () => assertWorkflowMirrorMatches({
      environment: {},
      repoRoot: changedSuccessorRoot,
      workflowVersion: successorWorkflowRef,
    }),
    'standalone validation must accept refreshed successor authority bytes and digest',
  );
  assert.doesNotThrow(
    () => assertWorkflowMirrorMatches({
      environment: {
        WORKFLOW_SDK_NEUTRALITY_MANIFEST_PATH: changedPublishedManifest,
      },
      repoRoot: changedSuccessorRoot,
      workflowVersion: successorWorkflowRef,
    }),
    'release validation must accept refreshed successor authority bytes and digest',
  );
  assert.throws(
    () => assertWorkflowMirrorMatches({
      environment: {
        WORKFLOW_SDK_NEUTRALITY_MANIFEST_PATH: unchangedPublishedManifest,
      },
      repoRoot: changedSuccessorRoot,
      workflowVersion: successorWorkflowRef,
    }),
    /must be byte-equivalent/,
    'release validation must reject stale packaged bytes for a refreshed successor digest',
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
      workflowVersion: successorWorkflowRef,
    }),
    new RegExp(`lock targets ${escaped(currentWorkflowRef)}.*pins ${escaped(successorWorkflowRef)}`),
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
    new RegExp(`must match the exact Workflow ${escaped(currentWorkflowRef)} authority digest`),
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

const workflowMisclassifiedAsPhpSdk = changed(contract, copy => {
  copy.sdk_breadth_policy.first_party.php_sdk.package = 'durable-workflow/workflow';
});
assert.throws(
  () => assertSdkBreadthPolicy(workflowMisclassifiedAsPhpSdk, catalogs),
  /first_party\.php_sdk\.package must be "durable-workflow\/sdk"/,
  'the embedded Workflow package must not be accepted as the standalone PHP SDK',
);

const missingEmbeddedWorkflowEngine = changed(contract, copy => {
  delete copy.sdk_breadth_policy.embedded_engines.php_workflow_engine;
});
assert.throws(
  () => assertSdkBreadthPolicy(missingEmbeddedWorkflowEngine, catalogs),
  /embedded_engines must declare "php_workflow_engine"/,
  'the standalone PHP SDK split must retain the embedded Workflow engine authority',
);

const standaloneRoleForEmbeddedEngine = changed(contract, copy => {
  copy.sdk_breadth_policy.embedded_engines.php_workflow_engine.role =
    'Framework-neutral standalone SDK.';
});
assert.throws(
  () => assertSdkBreadthPolicy(standaloneRoleForEmbeddedEngine, catalogs),
  /role must identify the embedded Laravel engine boundary/,
  'the Workflow package must remain explicitly classified as the embedded engine',
);

console.log('SDK-neutrality-authority adversarial tests passed');
