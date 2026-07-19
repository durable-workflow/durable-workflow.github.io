#!/usr/bin/env node

const assert = require('assert');

const {
  assertPublicConformanceContractHasNoInternalHarnessArtifacts,
  collectPublicConformanceContractInternalHarnessLeaks,
} = require('./check-platform-conformance-authority');
const {
  stablePlatformConformanceDiscoveryEntries,
} = require('./platform-conformance-public-discovery');
const suite = require('../static/platform-conformance-contract.json');

const validate = contract =>
  assertPublicConformanceContractHasNoInternalHarnessArtifacts(
    contract,
    'adversarial public conformance contract',
  );

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

assert.throws(
  () => validate({
    runner_url: 'custom-local:/app/scripts/conformance/php-sdk-published-artifacts.sh',
  }),
  /container path/,
  'container paths must be rejected independently of URL spelling',
);

assert.doesNotThrow(
  () => validate({
    package: 'durable-workflow/sdk',
    schema: 'durable-workflow.v2.php-sdk-conformance.result',
    endpoint: 'POST /api/worker/workflow-tasks/poll',
    readiness_criterion: '/api/ready returns success',
    observer_endpoint: 'GET /waterline/api/instances/{instanceId}',
    mcp_endpoint: 'POST /mcp/tools/call',
  }),
  'package identifiers, schema identities, and HTTP route descriptions are not repository paths',
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

const invalidAuthoritySuite = JSON.parse(JSON.stringify(suite));
invalidAuthoritySuite.conformance_authorities.php_sdk.url =
  'static/platform-conformance/php-sdk-conformance.json';
assert.throws(
  () => stablePlatformConformanceDiscoveryEntries(invalidAuthoritySuite),
  /must use a public https:\/\/durable-workflow\.github\.io\/platform-conformance\/ URL/,
  'repository-local authority locations must not satisfy public discovery',
);

console.log('Platform-conformance public-boundary adversarial checks passed');
