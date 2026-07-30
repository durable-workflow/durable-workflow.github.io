#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const {
  assertPublicConformanceContractHasNoInternalHarnessArtifacts,
  assertWorkflowPackageMirrorMatches,
  collectPublicConformanceContractInternalHarnessLeaks,
} = require('./check-platform-conformance-authority');
const {
  stablePlatformConformanceDiscoveryEntries,
} = require('./platform-conformance-public-discovery');
const suite = require('../static/platform-conformance-contract.json');
const suitePath = path.join(__dirname, '..', 'static', 'platform-conformance-contract.json');

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

assert.doesNotThrow(
  () => assertWorkflowPackageMirrorMatches(suitePath),
  'the package-mirror guard must accept an identical authority',
);
assert.throws(
  () => assertWorkflowPackageMirrorMatches(
    path.join(__dirname, '..', 'static', 'sdk-neutrality-contract.json'),
  ),
  /must exactly match the published Workflow package mirror/,
  'the package-mirror guard must reject stale or unrelated authority content',
);

console.log('Platform-conformance public-boundary adversarial checks passed');
