#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const protocolCatalog = require('../static/platform-protocol-specs.json');
const compatibilityContract = require('../static/compatibility-contract.json');
const conformanceContract = require('../static/platform-conformance-contract.json');
const {
  assertAuthorityContracts,
  assertPageDeclaration,
  assertRenderedAuthorityRoles,
} = require('./check-worker-protocol-authority-roles');

const repoRoot = path.join(__dirname, '..');
const clone = value => structuredClone(value);
const differentProtocolVersion = version => version === '0.0' ? '0.1' : '0.0';
const readSource = relativePath => fs.readFileSync(
  path.join(repoRoot, relativePath),
  'utf8',
);

const roles = assertAuthorityContracts({readSource});
assert.equal(
  roles.currentServer.protocolVersion,
  compatibilityContract.surface_families.worker_protocol.negotiation
    .default_advertised_version,
);
assert.equal(roles.currentServer.resolverRole, 'unversioned_server_mirror');
assert.equal(roles.currentConformance.protocolVersion, '1.19');
assert.equal(roles.currentConformance.suiteVersion, 47);
assert.equal(roles.currentConformance.resolverRole, 'versioned_conformance_fixture');
assert.ok(roles.historicalConformance.protocolVersions.includes('1.17'));

const versionedCatalog = clone(protocolCatalog);
versionedCatalog.specs.worker_protocol_api.spec_url =
  roles.currentConformance.apiUrl;
assert.throws(
  () => assertAuthorityContracts({catalog: versionedCatalog, readSource}),
  /current Server API resolver must use the unversioned public catalog target/,
  'the public catalog must not redirect current Server consumers to a conformance fixture',
);

const advancedCompatibility = clone(compatibilityContract);
const mismatchedProtocolVersion = differentProtocolVersion(
  roles.currentServer.protocolVersion,
);
advancedCompatibility.surface_families.worker_protocol.negotiation
  .default_advertised_version = mismatchedProtocolVersion;
assert.throws(
  () => assertAuthorityContracts({
    compatibility: advancedCompatibility,
    readSource,
  }),
  new RegExp(`compatibility marker advertises ${mismatchedProtocolVersion}`),
  'the current Server marker must agree with the unversioned specification bytes',
);

const missingCurrent = clone(conformanceContract);
missingCurrent.artifact_version_history.worker_protocol_api.bindings.at(-1)
  .status = 'historical';
assert.throws(
  () => assertAuthorityContracts({conformance: missingCurrent, readSource}),
  /must declare exactly one current binding/,
  'the conformance target must have one explicit current API binding',
);

const staleFixture = clone(conformanceContract);
staleFixture.fixture_catalog.worker_task_lifecycle.sources[0].resolver_url =
  roles.currentServer.apiUrl;
assert.throws(
  () => assertAuthorityContracts({conformance: staleFixture, readSource}),
  /API fixture source must exactly match its current artifact-history binding/,
  'fixture catalog sources must match the current conformance marker',
);

const splitTarget = clone(conformanceContract);
splitTarget.artifact_version_history.worker_protocol_stream.bindings.at(-1)
  .resolver_url = splitTarget.artifact_version_history.worker_protocol_stream
    .bindings.at(-2).resolver_url;
assert.throws(
  () => assertAuthorityContracts({conformance: splitTarget, readSource}),
  /API and stream bindings must target one protocol version/,
  'current conformance API and stream resolvers must stay on the same target',
);

assert.doesNotThrow(
  () => assertPageDeclaration(
    `import WorkerProtocolAuthorityRoles from `
      + `'@site/src/components/WorkerProtocolAuthorityRoles';\n\n`
      + `Editable explanation.\n\n<WorkerProtocolAuthorityRoles />\n`,
    'editable page fixture',
  ),
  'page validation must be independent of headings and explanatory prose',
);
assert.throws(
  () => assertPageDeclaration('Editable explanation only.\n', 'missing block fixture'),
  /must import and render exactly one WorkerProtocolAuthorityRoles block/,
  'an explanatory page without the structured role block must fail',
);

const renderedFixture = `
  <section data-worker-protocol-authority-roles="true"
    data-current-server-protocol-version="${roles.currentServer.protocolVersion}"
    data-current-conformance-protocol-version="${roles.currentConformance.protocolVersion}"
    data-current-conformance-suite-version="${roles.currentConformance.suiteVersion}">
    <table><tbody>
      <tr data-worker-protocol-role="${roles.currentServer.role}"
        data-protocol-version="${roles.currentServer.protocolVersion}"
        data-resolver-role="${roles.currentServer.resolverRole}"
        data-api-url="${roles.currentServer.apiUrl}"
        data-stream-url="${roles.currentServer.streamUrl}"></tr>
      <tr data-worker-protocol-role="${roles.currentConformance.role}"
        data-protocol-version="${roles.currentConformance.protocolVersion}"
        data-suite-version="${roles.currentConformance.suiteVersion}"
        data-resolver-role="${roles.currentConformance.resolverRole}"
        data-api-url="${roles.currentConformance.apiUrl}"
        data-stream-url="${roles.currentConformance.streamUrl}"></tr>
      <tr data-worker-protocol-role="${roles.historicalConformance.role}"
        data-history-protocol-versions="${roles.historicalConformance.protocolVersions.join(', ')}"
        data-history-binding-count="${roles.historicalConformance.bindingCount}"
        data-resolver-role="${roles.historicalConformance.resolverRole}"></tr>
    </tbody></table>
  </section>`;
assert.doesNotThrow(
  () => assertRenderedAuthorityRoles(renderedFixture, roles, 'rendered fixture'),
);
assert.throws(
  () => assertRenderedAuthorityRoles(
    renderedFixture.replace(
      `<tr data-worker-protocol-role="${roles.currentConformance.role}"
        data-protocol-version="${roles.currentConformance.protocolVersion}"`,
      `<tr data-worker-protocol-role="${roles.currentConformance.role}"
        data-protocol-version="${mismatchedProtocolVersion}"`,
    ),
    roles,
    'drifted rendered fixture',
  ),
  error => {
    assert.equal(
      error.message,
      'drifted rendered fixture data-protocol-version must be '
        + `"${roles.currentConformance.protocolVersion}", `
        + `got "${mismatchedProtocolVersion}"`,
    );
    return true;
  },
  'rendered role data must not collapse the conformance target into the Server marker',
);

console.log('Worker protocol authority-role adversarial checks passed.');
