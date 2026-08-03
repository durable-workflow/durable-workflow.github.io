#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const {
  assertPublishedConformanceAuthorities,
  assertPublicConformanceContractHasNoInternalHarnessArtifacts,
  assertStableFixtureSourcesResolve,
  assertStableSourceDependenciesResolve,
  assertRetainedCliJsonEnvelopeRevisions,
  assertWorkflowPackageAuthorityLock,
  assertWorkflowPackageMirrorMatches,
  collectPublicConformanceContractInternalHarnessLeaks,
} = require('./check-platform-conformance-authority');
const {
  stablePlatformConformanceDiscoveryEntries,
} = require('./platform-conformance-public-discovery');
const suite = require('../static/platform-conformance-contract.json');
const workflowAuthorityLock = require('./workflow-platform-conformance-authority-lock.json');
const suitePath = path.join(
  __dirname,
  '..',
  'static',
  'platform-conformance-contract.json',
);
const clone = value => JSON.parse(JSON.stringify(value));

const validate = contract =>
  assertPublicConformanceContractHasNoInternalHarnessArtifacts(
    contract,
    'adversarial public conformance contract',
  );

assert.doesNotThrow(
  () => assertStableFixtureSourcesResolve(suite),
  'every stable fixture source must resolve through its immutable versioned public artifact',
);
assert.doesNotThrow(
  () => assertPublishedConformanceAuthorities(suite),
  'the root suite must resolve its stable standalone conformance authorities',
);
assert.doesNotThrow(
  () => assertStableSourceDependenciesResolve(suite),
  'stable transitive source dependencies must use immutable public resolvers',
);
assert.doesNotThrow(
  () => assertRetainedCliJsonEnvelopeRevisions(suite),
  'retained CLI schema revisions and the current complete closure must remain byte-bound',
);

const missingPhpSdkAuthority = clone(suite);
delete missingPhpSdkAuthority.conformance_authorities.php_sdk;
assert.throws(
  () => assertPublishedConformanceAuthorities(missingPhpSdkAuthority),
  /conformance_authorities\.php_sdk/,
  'the stable PHP SDK contract must be discoverable from the root suite',
);
assert(
  !stablePlatformConformanceDiscoveryEntries(missingPhpSdkAuthority).some(
    entry => entry.path === '/platform-conformance/php-sdk-conformance.json',
  ),
  'PHP SDK discovery must be derived from the root suite relationship',
);

const mismatchedPhpSdkAuthority = clone(suite);
mismatchedPhpSdkAuthority.conformance_authorities.php_sdk.version = 2;
assert.throws(
  () => assertPublishedConformanceAuthorities(mismatchedPhpSdkAuthority),
  /must match/,
  'the root suite identity must exactly match the standalone PHP authority',
);

for (const [category] of Object.entries(suite.fixture_catalog).filter(
  ([, entry]) => entry.status === 'stable',
)) {
  const source = {
    repository: 'workflow',
    path: `tests/fixtures/${category}/`,
  };
  const candidate = clone(suite);
  candidate.fixture_catalog[category].sources = [source];

  assert.throws(
    () => assertStableFixtureSourcesResolve(candidate),
    /repository-relative/,
    `stable ${category} must reject non-resolvable ${source.path} references`,
  );
}

const missingArtifactId = clone(suite);
delete missingArtifactId.fixture_catalog.control_plane_request_response
  .sources[0].artifact_id;
assert.throws(
  () => assertStableFixtureSourcesResolve(missingArtifactId),
  /version-bound artifact_id/,
  'stable sources must identify the authority version used by their resolver',
);

const unversionedArtifactId = clone(suite);
unversionedArtifactId.fixture_catalog.cli_json_envelopes
  .sources[0].artifact_id = 'durable-workflow.cli.output-schema-manifest';
assert.throws(
  () => assertStableFixtureSourcesResolve(unversionedArtifactId),
  /revision-bound artifact id/,
  'CLI artifact identifiers must bind the retained schema revision',
);

const mutableRuntimeArtifactId = clone(suite);
mutableRuntimeArtifactId.fixture_catalog.signal_query_runtime_contract
  .sources[0].artifact_id =
    'durable-workflow.v2.platform-conformance.runtime-scenarios/signal_query_runtime_contract@latest';
assert.throws(
  () => assertStableFixtureSourcesResolve(mutableRuntimeArtifactId),
  /suite-bound artifact id/,
  'runtime artifact identifiers must bind the exact suite version',
);

const nonPublicResolver = clone(suite);
nonPublicResolver.fixture_catalog.failure_repair_actionability
  .sources[0].resolver_url =
    'http://localhost/platform-protocol-specs/repair-actionability-objects.schema.json';
assert.throws(
  () => assertStableFixtureSourcesResolve(nonPublicResolver),
  /immutable HTTPS resolver/,
  'stable source resolvers must use the public HTTPS authority',
);

for (const [category, mutableResolver] of [
  [
    'signal_query_runtime_contract',
    'https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json',
  ],
  [
    'control_plane_request_response',
    'https://durable-workflow.github.io/platform-protocol-specs/control-plane-api.openapi.yaml',
  ],
]) {
  const mutableCurrentAlias = clone(suite);
  mutableCurrentAlias.fixture_catalog[category].sources[0].resolver_url =
    mutableResolver;

  assert.throws(
    () => assertStableFixtureSourcesResolve(mutableCurrentAlias),
    /must resolve immutable bytes/,
    `stable ${category} must reject mutable current-only discovery aliases`,
  );
}

const mutableBranchResolver = clone(suite);
mutableBranchResolver.fixture_catalog.signal_query_runtime_contract
  .sources[0].resolver_url =
    'https://raw.githubusercontent.com/durable-workflow/workflow/v2/resources/conformance/suite-v38/platform-conformance/signal-query-runtime-scenarios.json';
assert.throws(
  () => assertStableFixtureSourcesResolve(mutableBranchResolver),
  /full-commit Workflow suite source/,
  'stable source resolvers must reject mutable Git branch references',
);

const unknownCommitResolver = clone(suite);
unknownCommitResolver.fixture_catalog.signal_query_runtime_contract
  .sources[0].resolver_url =
    unknownCommitResolver.fixture_catalog.signal_query_runtime_contract
      .sources[0].resolver_url.replace(
        '75dfd5c869823409ef3d6c4b009a7882159ae9a2',
        '0000000000000000000000000000000000000000',
      );
assert.throws(
  () => assertStableFixtureSourcesResolve(unknownCommitResolver),
  /published Workflow source revision/,
  'stable source resolvers must reject unknown full-length revisions',
);

const digestDrift = clone(suite);
digestDrift.fixture_catalog.cli_json_envelopes.sources[0].sha256 =
  `sha256:${'0'.repeat(64)}`;
assert.throws(
  () => assertStableFixtureSourcesResolve(digestDrift),
  /must match/,
  'stable source byte bindings must reject resolver content drift',
);

const retainedProtocolDigestDrift = clone(suite);
retainedProtocolDigestDrift.fixture_catalog.worker_task_lifecycle
  .sources[0].sha256 = `sha256:${'0'.repeat(64)}`;
assert.throws(
  () => assertStableFixtureSourcesResolve(retainedProtocolDigestDrift),
  /must match/,
  'a retained protocol revision must keep its immutable byte binding after the live catalog advances',
);

const mutableSourceDependency = clone(suite);
mutableSourceDependency.source_dependencies[
  'cluster-info-envelope.schema.json'
].resolver_url =
  'https://durable-workflow.github.io/platform-protocol-specs/cluster-info-envelope.schema.json';
assert.throws(
  () => assertStableSourceDependenciesResolve(mutableSourceDependency),
  /must resolve immutable bytes/,
  'transitive stable source dependencies must reject mutable current aliases',
);

const unknownDependencyRevision = clone(suite);
unknownDependencyRevision.source_dependencies[
  'cluster-info-envelope.schema.json'
].resolver_url = unknownDependencyRevision.source_dependencies[
  'cluster-info-envelope.schema.json'
].resolver_url.replace(
  'e990bc36731463cc5b2cb2a9175dbccfdea61704',
  '0000000000000000000000000000000000000000',
);
assert.throws(
  () => assertStableSourceDependenciesResolve(unknownDependencyRevision),
  /published docs protocol source revision/,
  'transitive dependencies must reject unknown full-length revisions',
);

const escapedSourceDependency = clone(suite);
escapedSourceDependency.source_dependencies[
  'cluster-info-envelope.schema.json'
].source_path =
  'resources/conformance/suite-v38/platform-protocol-specs/../cluster-info-envelope.schema.json';
assert.throws(
  () => assertStableSourceDependenciesResolve(escapedSourceDependency),
  /protocol carrier/,
  'transitive stable source dependencies must stay in the versioned carrier',
);

for (const provisional of [
  'waterline_observer_envelopes',
  'mcp_discovery_envelopes',
]) {
  assert.strictEqual(
    suite.fixture_catalog[provisional].status,
    'provisional',
    `${provisional} must remain explicitly non-normative`,
  );

  const accidentallyPromoted = clone(suite);
  accidentallyPromoted.fixture_catalog[provisional].status = 'stable';
  assert.throws(
    () => assertStableFixtureSourcesResolve(accidentallyPromoted),
    /repository-relative/,
    `${provisional} cannot become stable while it still uses planned source-tree placeholders`,
  );
}

assert.doesNotThrow(
  () => validate({
    runner_id: 'durable-workflow.v2.conformance.runner.php-sdk-published-artifacts',
    result_schema: 'durable-workflow.v2.php-sdk-conformance.result',
    runner_url:
      'https://durable-workflow.github.io/public/scripts/php-sdk-published-artifacts.sh',
    evidence_url:
      'https://durable-workflow.github.io/evidence/php-sdk-conformance-result.json',
    remote_package_repository: 'durable-workflow/sdk-php',
  }),
  'public identifiers, schemas, and absolute URLs must remain consumer-resolvable',
);

for (const runner of [
  'scripts/conformance/php-sdk-published-artifacts.sh',
  'conformance/php-sdk-published-artifacts.sh',
  'bin/runner',
  'conformance/runner',
  'conformance/bin/runner',
  'durable-workflow/bin',
  'arbitrary/nested/location/runner.php',
  '../conformance/runner',
  'C:\\workspace\\conformance\\runner.exe',
  'docker-compose.yml',
]) {
  assert.throws(
    () => validate({runner}),
    /repository path/,
    `repository-local runner location ${runner} must be rejected`,
  );
}

assert.throws(
  () => validate({runner: '/app/scripts/conformance/php-sdk-published-artifacts.sh'}),
  /container path/,
  'container-local runner paths must be rejected',
);

for (const runner of [
  '/data',
  '/data/conformance/php-sdk-published-artifacts.sh',
  '/data/cache@v2/runner',
  '/build/bin/runner',
  '/build/output+debug/runner',
  '/checkout/conformance/bin/runner',
  '/repo/docker-compose.yml',
  '/arbitrary-local-root/tools/runner',
  '/;/runner',
  '/,/runner',
  '/)/runner',
]) {
  assert.throws(
    () => validate({runner}),
    /local filesystem path/,
    `absolute local runner location ${runner} must be rejected regardless of its root`,
  );
}

for (const [runner, localPath] of [
  ['/api/ready and /tmp/private-runner', '/tmp/private-runner'],
  ['GET /api/ready then /tmp/private-runner', '/tmp/private-runner'],
  ['/api/ready,/tmp/private-runner', '/tmp/private-runner'],
  ['/api/ready;/tmp/private-runner', '/tmp/private-runner'],
  ['/api/ready)/tmp/private-runner', '/tmp/private-runner'],
  ['/api/ready|/tmp/private-runner', '/tmp/private-runner'],
  ['/api/ready[/tmp/private-runner]', '/tmp/private-runner'],
  ['/api/ready{/tmp/private-runner}', '/tmp/private-runner'],
  ['/api/ready}/tmp/private-runner{', '/tmp/private-runner'],
  ['/api/ready//tmp/private-runner', '/tmp/private-runner'],
  ['/api/ready://tmp/private-runner', '/tmp/private-runner'],
  [
    'public route /mcp/tools/call and local /data/runner',
    '/data/runner',
  ],
]) {
  const leaks = collectPublicConformanceContractInternalHarnessLeaks({runner});
  assert(
    leaks.some(leak => leak.includes(`"${localPath}"`)),
    `mixed public-route value must report the local path ${localPath}`,
  );
}

for (const separator of ['+', '-', '_', '.', '~', '@', '%']) {
  const localPath = '/tmp/private-runner';
  const runner = `/api/ready${separator}${localPath}`;
  const leaks = collectPublicConformanceContractInternalHarnessLeaks({runner});
  assert(
    leaks.some(leak => leak.includes(`"${localPath}"`)),
    `token punctuation ${separator} must not extend the public API-route exemption`,
  );
}

for (const runnerUrl of [
  'file:///app/scripts/conformance/php-sdk-published-artifacts.sh',
  'file:/app/scripts/conformance/php-sdk-published-artifacts.sh',
  'runner is file:///app/scripts/conformance/php-sdk-published-artifacts.sh',
  'http://localhost/scripts/conformance/php-sdk-published-artifacts.sh',
  'https://127.0.0.1/scripts/conformance/php-sdk-published-artifacts.sh',
  'http://[::1]/scripts/conformance/php-sdk-published-artifacts.sh',
]) {
  assert.throws(
    () => validate({runner_url: runnerUrl}),
    /non-public URL/,
    `non-public runner URL ${runnerUrl} must not bypass path checks`,
  );
}

for (const [field, url] of [
  ['runner_url', 'ftp://artifacts.example.com/conformance/result.json'],
  ['evidence_url', 's3://conformance-results/php-sdk/result.json'],
  ['artifact_url', 'packagist://durable-workflow/sdk@0.2.0'],
  ['evidence_url', 'data:application/json;base64,e30='],
  ['artifact_uri', 'urn:durable-workflow:private-artifact'],
  ['runner_reference', 'javascript:runPrivateHarness()'],
]) {
  assert.throws(
    () => validate({[field]: url}),
    /non-public URL/,
    `non-public ${field} ${url} must be rejected regardless of scheme`,
  );
}

assert.throws(
  () => validate({
    runner_url: 'custom-local:/app/scripts/conformance/php-sdk-published-artifacts.sh',
  }),
  /non-public URL/,
  'unsupported schemes must be rejected independently of URL spelling',
);

for (const runner of [
  'custom-local:///app/scripts/private-runner',
  '/api/ready;custom-local:///app/scripts/private-runner',
]) {
  const leaks = collectPublicConformanceContractInternalHarnessLeaks({runner});
  assert(
    leaks.some(leak => (
      leak.includes('non-public URL "custom-local:///app/scripts/private-runner"')
    )),
    `triple-slash unsupported URL ${runner} must be rejected`,
  );
  assert(
    leaks.some(leak => leak.includes('local filesystem path "/app/scripts/private-runner"')),
    `triple-slash unsupported URL ${runner} must not hide its filesystem payload`,
  );
}

assert.doesNotThrow(
  () => validate({
    package: 'durable-workflow/sdk',
    schema: 'durable-workflow.v2.php-sdk-conformance.result',
    endpoint: 'POST /api/worker/workflow-tasks/poll',
    readiness_criterion: '/api/ready returns success',
    observer_endpoint: 'GET /waterline/api/instances/{instanceId}',
    selected_run_endpoint:
      'GET /api/workflows/{workflowId}/runs/{runId}/history',
    mcp_endpoint: 'POST /mcp/tools/call',
    public_result_url:
      'https://durable-workflow.github.io/public/result-v2.json',
    public_principal_id: 'auth:token',
    public_command: 'dw workflow:describe <workflow-id>',
    artifact_digest: 'sha256:0123456789abcdef',
  }),
  'public identifiers, URLs, and HTTP route descriptions are not repository paths',
);

assert.throws(
  () => validate({evidence: 'php-sdk-conformance-result.json'}),
  /internal harness artifact/,
  'internal result filenames must be rejected',
);

assert.throws(
  () => validate({lifecycle_sidecar_file: 'arbitrary-name.bin'}),
  /internal harness field/,
  'internal sidecar fields must be rejected even when their values are disguised',
);

assert(
  stablePlatformConformanceDiscoveryEntries(suite).some(entry => (
    entry.path === '/platform-conformance/php-sdk-conformance.json' &&
    entry.buildPath === 'platform-conformance/php-sdk-conformance.json'
  )),
  'the suite authority catalog must project the PHP SDK contract into public discovery',
);
assert(
  stablePlatformConformanceDiscoveryEntries(suite).some(entry => (
    entry.path ===
      '/platform-conformance/signal-query-runtime-scenarios.json' &&
    entry.buildPath ===
      'platform-conformance/signal-query-runtime-scenarios.json'
  )),
  'immutable runtime sources must retain their friendly current discovery aliases',
);

assert.doesNotThrow(
  () => assertWorkflowPackageMirrorMatches(suitePath),
  'the package-mirror guard must accept an identical authority',
);
assert.doesNotThrow(
  () => assertWorkflowPackageAuthorityLock(suite, workflowAuthorityLock),
  'the Workflow authority lock must bind the checked-in manifest identity',
);

const staleWorkflowAuthorityLock = clone(workflowAuthorityLock);
staleWorkflowAuthorityLock.manifest_sha256 = `sha256:${'0'.repeat(64)}`;
assert.throws(
  () => assertWorkflowPackageAuthorityLock(suite, staleWorkflowAuthorityLock),
  /digest must match the exact Workflow package authority lock/,
  'the Workflow authority lock must reject same-version manifest drift',
);

const mutableWorkflowAuthorityLock = clone(workflowAuthorityLock);
mutableWorkflowAuthorityLock.workflow_source_commit = 'v2';
assert.throws(
  () => assertWorkflowPackageAuthorityLock(suite, mutableWorkflowAuthorityLock),
  /immutable 40-character source commit/,
  'the Workflow authority lock must reject mutable source refs',
);

assert.throws(
  () => assertWorkflowPackageMirrorMatches(
    path.join(__dirname, '..', 'static', 'sdk-neutrality-contract.json'),
  ),
  /must exactly match the published Workflow package mirror/,
  'the package-mirror guard must reject stale or unrelated authority content',
);

console.log('Platform-conformance public-boundary adversarial checks passed');
