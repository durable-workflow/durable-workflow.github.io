#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  assertOpenApiAcceptedWorkerProtocolVersions,
  composerPrereleaseStability,
  expectedAcceptedWorkerVersions,
} = require('./check-compatibility-authority');
const artifactVersionSource = require('./public-artifact-versions.json');
const {
  ARTIFACT_RELEASE_POLICY,
} = require('./public-artifact-versions');
const {
  buildArtifactVersionProjection,
} = require('./generate-docs-page-release-audit');

const openApiPath = path.join(
  __dirname,
  '..',
  'static',
  'platform-protocol-specs',
  'worker-protocol-api.openapi.yaml',
);
const contractPath = path.join(__dirname, '..', 'static', 'compatibility-contract.json');
const openApi = fs.readFileSync(openApiPath, 'utf8');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const advertisedVersion =
  contract.surface_families.worker_protocol.negotiation.default_advertised_version;
const expectedVersions = expectedAcceptedWorkerVersions(advertisedVersion);
const expectedEnum = `enum: [${expectedVersions.map(version => `"${version}"`).join(', ')}]`;

assert.doesNotThrow(
  () => assertOpenApiAcceptedWorkerProtocolVersions(openApi, expectedVersions),
  'the published request-header enum must match the complete negotiation window',
);

const narrowedOpenApi = openApi.replace(expectedEnum, 'enum: ["1.0", "1.1"]');
assert.notStrictEqual(
  narrowedOpenApi,
  openApi,
  'the adversarial fixture must narrow the actual OpenAPI request-header enum',
);
assert.throws(
  () => assertOpenApiAcceptedWorkerProtocolVersions(narrowedOpenApi, expectedVersions),
  /AcceptedWorkerProtocolRequestVersion\.enum must exactly match the computed negotiation window/,
  'narrowing the OpenAPI enum must fail compatibility-authority validation',
);

assert.strictEqual(ARTIFACT_RELEASE_POLICY.release_phase, 'beta');
assert.strictEqual(composerPrereleaseStability('workflow', '2.0.0-alpha.201'), 'alpha');
assert.strictEqual(composerPrereleaseStability('workflow', '2.0.0-beta.3'), 'beta');
assert.throws(
  () => composerPrereleaseStability('workflow', '2.0.0-rc.4'),
  /not admitted by the beta release phase/,
  'release-candidate compatibility authorities must wait for the RC policy transition',
);
assert.throws(
  () => composerPrereleaseStability('workflow', '2.0.0'),
  /not admitted by the beta release phase/,
  'stable compatibility authorities must wait for the stable cutover',
);
function successorVersion(version) {
  const successor = version.replace(/(\d+)(?![\s\S]*\d)/, sequence => String(Number(sequence) + 1));
  assert.notStrictEqual(successor, version, `test fixture must advance ${version}`);
  return successor;
}

const successorVersions = Object.fromEntries(
  Object.entries(artifactVersionSource.artifacts).map(([artifact, version]) => [
    artifact,
    successorVersion(version),
  ]),
);
const successorProjection = buildArtifactVersionProjection(successorVersions);

assert.deepStrictEqual(
  successorProjection.artifact_versions,
  successorVersions,
  'the public release audit must project every successor tuple component from its data source',
);
assert.deepStrictEqual(
  Object.keys(successorProjection.artifact_versions).sort(),
  Object.keys(artifactVersionSource.artifacts).sort(),
  'the successor projection regression must cover every artifact tuple component',
);

for (const [artifact, successor] of Object.entries(successorVersions)) {
  assert.strictEqual(
    successorProjection.artifact_versions[artifact],
    successor,
    `the public release audit must project the successor ${artifact} version`,
  );
  assert.notStrictEqual(
    successorProjection.artifact_versions[artifact],
    artifactVersionSource.artifacts[artifact],
    `the public release audit must not retain the previous ${artifact} version`,
  );
}

console.log('Compatibility-authority adversarial drift checks passed.');
