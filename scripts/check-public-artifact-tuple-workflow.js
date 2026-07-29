const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const yaml = require('js-yaml');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'public-artifact-tuple.yml');
const deployWorkflowPath = path.join(__dirname, '..', '.github', 'workflows', 'deploy.yml');
const routeScriptPath = path.join(__dirname, 'route-public-artifact-tuple-handoff.js');
const packagePath = path.join(__dirname, '..', 'package.json');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const deployWorkflow = fs.readFileSync(deployWorkflowPath, 'utf8');
const routeScript = fs.readFileSync(routeScriptPath, 'utf8');
const packageSource = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const registryFreshnessCommand = 'node scripts/refresh-public-artifact-versions.js --check';
const PROTECTED_REFRESH_SOURCE_GUARD =
  "github.repository == 'durable-workflow/durable-workflow.github.io' && " +
  "github.ref == 'refs/heads/main'";
const {
  artifactVersionDigest,
  buildReadyItemPayload,
  findExistingReadyItem,
  handoffKey,
  routeReadyItem,
} = require(routeScriptPath);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertProtectedRefreshSource(source) {
  const parsed = yaml.load(source);
  const refreshJob = parsed?.jobs?.refresh;

  if (!refreshJob || refreshJob.if !== PROTECTED_REFRESH_SOURCE_GUARD) {
    throw new Error(
      'public artifact tuple workflow must guard the credential-bearing refresh job with the ' +
        'exact repository identity and protected main ref',
    );
  }
}

assertProtectedRefreshSource(workflow);

for (const [label, fixture] of [
  [
    'non-main ref',
    workflow.replace("github.ref == 'refs/heads/main'", "github.ref == 'refs/tags/latest'"),
  ],
  [
    'different repository',
    workflow.replace(
      "github.repository == 'durable-workflow/durable-workflow.github.io'",
      "github.repository == 'contributor/durable-workflow.github.io'",
    ),
  ],
]) {
  assert.notStrictEqual(fixture, workflow, `${label} fixture must mutate the workflow`);
  assert.throws(
    () => assertProtectedRefreshSource(fixture),
    /exact repository identity and protected main ref/,
    `public artifact tuple contract must reject a ${label}`,
  );
}

function workflowStepPosition(name) {
  const position = workflow.indexOf(`      - name: ${name}\n`);
  if (position === -1) {
    fail(`public-artifact-tuple workflow is missing step: ${name}`);
  }
  return position;
}

for (const forbidden of [
  'contents: write',
  'pull-requests: write',
  'git push',
  'git commit',
  'api.github.com',
  '/pulls',
  'GH_TOKEN',
]) {
  if (workflow.includes(forbidden)) {
    fail(`public-artifact-tuple workflow must not use direct GitHub write behavior: ${forbidden}`);
  }
}

for (const required of [
  'contents: read',
  'docs-artifact-tuple-handoff.json',
  'public-artifact-tuple-pipeline-handoff',
  'Route pipeline ready item',
  'PIPELINE_GATE_URL',
  'scripts/route-public-artifact-tuple-handoff.js',
  "schema: 'durable-workflow.docs.public-artifact-tuple-handoff'",
  'schema_version: 2',
  "action: 'pipeline_ready_item'",
  "integration: 'pipeline'",
  'published_artifact_versions: publishedSource.artifacts',
  'previous_published_artifact_versions: previousPublishedSource.artifacts',
  'HEAD:scripts/published-artifact-versions.json',
  'scripts/public-artifact-versions.json',
  'scripts/published-artifact-versions.json',
  'static/public-artifact-compatibility-evidence.json',
  'static/quickstart-execution-contract.json',
  'static/compatibility-contract.json',
  'static/sdk-neutrality-contract.json',
  'scripts/workflow-sdk-neutrality-authority-lock.json',
  "stable_default_docs_line: '1.x'",
  "prerelease_docs_line: '2.0'",
  "'LEAK=0'",
  "'MIXED=0'",
]) {
  if (!workflow.includes(required)) {
    fail(`public-artifact-tuple workflow is missing required pipeline handoff contract: ${required}`);
  }
}

if (workflow.includes('previous_artifact_versions:')) {
  fail(
    'public artifact tuple handoff must compare previous published-component state, not the previous qualified aggregate',
  );
}

const detectPosition = workflowStepPosition('Detect tuple changes');
const protocolCatalogPosition = workflowStepPosition('Verify candidate server protocol catalog');
const protocolCatalogEvidencePosition = workflowStepPosition('Upload candidate server protocol catalog evidence');
const writePosition = workflowStepPosition('Write pipeline handoff');
const uploadPosition = workflowStepPosition('Upload pipeline handoff');
const routePosition = workflowStepPosition('Route pipeline ready item');
const validatePosition = workflowStepPosition('Validate refreshed docs');

if (!(
  detectPosition < protocolCatalogPosition
  && protocolCatalogPosition < protocolCatalogEvidencePosition
  && protocolCatalogEvidencePosition < writePosition
  && writePosition < uploadPosition
  && uploadPosition < routePosition
)) {
  fail('public artifact tuple handoff must verify server catalog convergence before it is written, uploaded, and routed');
}

if (routePosition >= validatePosition) {
  fail('public artifact tuple handoff must route before the full docs build');
}

const validateStep = workflow.slice(validatePosition, workflow.indexOf('\n      - name:', validatePosition + 1));
if (!validateStep.includes('run: npm run build')) {
  fail('post-route public artifact tuple validation must preserve the normal docs build');
}

if (packageSource.scripts.build.includes(registryFreshnessCommand)) {
  fail('normal docs builds must validate the committed tuple without requiring registry freshness');
}

if (packageSource.scripts['check:public-artifact-tuple'] !== registryFreshnessCommand) {
  fail('registry freshness must remain available through the explicit tuple check command');
}

for (const required of [
  'name: Refresh public artifact tuple',
  'run: node scripts/refresh-public-artifact-versions.js --date',
  'name: Report current tuple',
  `run: ${registryFreshnessCommand}`,
]) {
  if (!workflow.includes(required)) {
    fail(`public artifact tuple workflow must preserve explicit registry freshness enforcement: ${required}`);
  }
}

for (const required of [
  'node scripts/generate-docs-narrative-audit.js',
  'node scripts/check-docs-narrative-audit.js',
]) {
  if (!packageSource.scripts.build.includes(required)) {
    fail(`normal docs build must preserve generated route inventory checks: ${required}`);
  }
}

if (!deployWorkflow.includes('- name: Build website') || !deployWorkflow.includes('run: npm run build')) {
  fail('docs deploy workflow must preserve the complete npm build');
}

for (const required of [
  'Verify candidate server protocol catalog',
  'node scripts/check-public-server-protocol-catalog.js',
  'PUBLIC_SERVER_PROTOCOL_CATALOG_EVIDENCE: public-server-protocol-catalog-conformance.json',
  'public-server-protocol-catalog-conformance',
  'public-server-protocol-catalog-bootstrap.log',
  'public-server-protocol-catalog-server.log',
]) {
  if (!workflow.includes(required)) {
    fail(`public-artifact-tuple workflow is missing published server catalog conformance: ${required}`);
  }
}

for (const required of [
  'Verify pinned server protocol catalog',
  'node scripts/check-public-server-protocol-catalog.js',
  'PUBLIC_SERVER_PROTOCOL_CATALOG_EVIDENCE: public-server-protocol-catalog-conformance.json',
  'public-server-protocol-catalog-conformance',
  'public-server-protocol-catalog-bootstrap.log',
  'public-server-protocol-catalog-server.log',
]) {
  if (!deployWorkflow.includes(required)) {
    fail(`docs deploy workflow is missing published server catalog conformance: ${required}`);
  }
}

const deployCatalogPosition = deployWorkflow.indexOf('      - name: Verify pinned server protocol catalog\n');
const deployBuildPosition = deployWorkflow.indexOf('      - name: Build website\n');
const deployFreshnessPosition = deployWorkflow.indexOf(
  '      - name: Verify current public artifact tuple\n',
);
const deployPlanPosition = deployWorkflow.indexOf('      - name: Plan deployment\n');
const deployFreshnessStep = deployWorkflow.slice(
  deployFreshnessPosition,
  deployPlanPosition,
);
if (
  deployFreshnessPosition === -1
  || !deployFreshnessStep.includes(`run: ${registryFreshnessCommand}`)
  || !deployFreshnessStep.includes('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}')
) {
  fail(
    'docs deployment must compare the committed tuple with current public registries ' +
      'using authenticated release metadata',
  );
}
if (!(
  deployFreshnessPosition < deployPlanPosition
  && deployPlanPosition < deployBuildPosition
)) {
  fail('docs deployment must verify public registry freshness before planning or building a release');
}
if (!(deployCatalogPosition !== -1 && deployCatalogPosition < deployBuildPosition)) {
  fail('docs deployment must verify the pinned published server catalog before building an advertisable site');
}

for (const required of [
  'gh.issue.list',
  'gh.issue.create',
  'source:handoff',
  'pipeline-request-b64',
  'pipeline-files-b64',
  'docs-artifact-tuple-key',
]) {
  if (!routeScript.includes(required)) {
    fail(`public-artifact-tuple router is missing required pipeline routing contract: ${required}`);
  }
}

const stableArtifactVersions = {
  cli: '0.2.0',
  'sdk-php': '0.1.1',
  'sdk-python': '0.2.0',
  'sdk-rust': '0.1.0',
  server: '0.2.426',
  workflow: '2.0.0-alpha.275',
  waterline: '0.2.0',
};
const stableKeyHandoff = {
  tuple_date: '2026-06-18',
  artifact_versions: stableArtifactVersions,
  published_artifact_versions: {...stableArtifactVersions},
};
function compatibilityEvidence(versions) {
  const qualificationSource =
    'https://example.test/sdk-server-qualification.json';
  const evidenceTag =
    'beta-conformance/beta-qualified-fixture/12345.1';
  const conformanceSuiteSource = [
    'https://github.com/durable-workflow/.github/releases/download',
    evidenceTag,
    'suite-result.json',
  ].join('/');
  const serverDistribution = {
    kind: 'oci',
    locator: `oci:docker.io/durableworkflow/server@${versions.server}`,
    artifacts: [{name: 'manifest', sha256: 'e'.repeat(64)}],
  };
  return {
    schema: 'durable-workflow.docs.public-artifact-compatibility-evidence',
    schema_version: 2,
    outcome: 'pass',
    qualified_artifact_versions: {...versions},
    sdk_server_compatibility: Object.fromEntries(
      ['sdk-php', 'sdk-python', 'sdk-rust'].map(artifact => [
        artifact,
        {
          sdk_version: versions[artifact],
          sdk_source_commit: 'b'.repeat(40),
          sdk_distribution: {
            kind: {
              'sdk-php': 'composer',
              'sdk-python': 'pypi',
              'sdk-rust': 'crates.io',
            }[artifact],
            locator: {
              'sdk-php': `composer:durable-workflow/sdk@${versions[artifact]}`,
              'sdk-python': `pypi:durable-workflow@${versions[artifact]}`,
              'sdk-rust': `crates.io:durable-workflow@${versions[artifact]}`,
            }[artifact],
            artifacts: [{name: artifact, sha256: 'f'.repeat(64)}],
          },
          server_version: versions.server,
          server_source_commit: 'c'.repeat(40),
          server_distribution: structuredClone(serverDistribution),
          supported_server_versions: versions.server,
          outcome: 'pass',
          evidence_source: conformanceSuiteSource,
        },
      ]),
    ),
    authority: {
      release_plan: {
        tag: 'release-plan/qualified-fixture',
        sha256: 'a'.repeat(64),
      },
      sdk_server_qualification: {
        schema: 'durable-workflow.sdk-server-qualification/v1',
        source_url: qualificationSource,
        sha256: 'd'.repeat(64),
        evidence: {
          schema: 'durable-workflow.beta-conformance.suite-result/v2',
          tag: evidenceTag,
          source_url: conformanceSuiteSource,
          sha256: 'e'.repeat(64),
          outcome: 'pass',
          github_run: {
            repository: 'durable-workflow/.github',
            run_id: 12345,
            run_attempt: 1,
            evidence_tag: evidenceTag,
          },
        },
      },
    },
  };
}
const nextRunSameTuple = {
  ...stableKeyHandoff,
  tuple_date: '2026-06-19',
};
const nextTuple = {
  ...stableKeyHandoff,
  artifact_versions: {
    ...stableKeyHandoff.artifact_versions,
    server: '0.2.427',
  },
};
const nextPublishedTuple = {
  ...stableKeyHandoff,
  published_artifact_versions: {
    ...stableKeyHandoff.published_artifact_versions,
    server: '0.2.427',
  },
};
const stableKey = handoffKey(stableKeyHandoff);
const sameTupleKey = handoffKey(nextRunSameTuple);
const nextTupleKey = handoffKey(nextTuple);
const nextPublishedTupleKey = handoffKey(nextPublishedTuple);

if (stableKey !== sameTupleKey) {
  fail('public artifact tuple ready-item key must stay stable across tuple_date changes for the same artifact versions');
}

if (stableKey === nextTupleKey) {
  fail('public artifact tuple ready-item key must change when qualified artifact versions change');
}

if (stableKey === nextPublishedTupleKey) {
  fail('public artifact tuple ready-item key must change when published artifact versions change');
}

if (stableKey.includes(stableKeyHandoff.tuple_date)) {
  fail('public artifact tuple ready-item key must not include tuple_date');
}

const legacyKey = `${stableKeyHandoff.tuple_date}-${artifactVersionDigest(stableKeyHandoff.artifact_versions)}`;
const existing = findExistingReadyItem(
  [{number: 42, body: `<!-- docs-artifact-tuple-key: ${legacyKey} -->`}],
  [stableKey, legacyKey]
);

if (!existing || existing.number !== 42) {
  fail('public artifact tuple router must match existing pending handoffs with legacy date-prefixed keys');
}

const multiArtifactHandoff = {
  schema: 'durable-workflow.docs.public-artifact-tuple-handoff',
  schema_version: 2,
  action: 'pipeline_ready_item',
  repository: 'durable-workflow.github.io',
  target_branch: 'main',
  refresh_command: 'npm run refresh:public-artifact-versions',
  refresh_files: [
    'scripts/public-artifact-versions.json',
    'scripts/published-artifact-versions.json',
    'static/public-artifact-compatibility-evidence.json',
    'static/quickstart-execution-contract.json',
    'static/compatibility-contract.json',
    'static/sdk-neutrality-contract.json',
    'scripts/workflow-sdk-neutrality-authority-lock.json',
  ],
  changed_files: [
    'scripts/public-artifact-versions.json',
    'scripts/published-artifact-versions.json',
    'static/public-artifact-compatibility-evidence.json',
    'static/quickstart-execution-contract.json',
    'static/compatibility-contract.json',
    'static/sdk-neutrality-contract.json',
    'scripts/workflow-sdk-neutrality-authority-lock.json',
  ],
  tuple_date: stableKeyHandoff.tuple_date,
  artifact_versions: stableKeyHandoff.artifact_versions,
  published_artifact_versions: stableKeyHandoff.published_artifact_versions,
  compatibility_evidence: compatibilityEvidence(stableKeyHandoff.artifact_versions),
  previous_published_artifact_versions: {
    cli: '0.1.99',
    'sdk-php': '0.1.0',
    'sdk-python': '0.1.99',
    'sdk-rust': '0.1.0',
    server: '0.2.425',
    workflow: '2.0.0-alpha.274',
    waterline: '0.1.99',
  },
  release_status_guard: {
    stable_default_docs_line: '1.x',
    prerelease_docs_line: '2.0',
    no_default_docs_cutover: true,
    live_release_audit_assertions: [
      'LEAK=0',
      'MIXED=0',
      'stable default 1.x',
      'explicit prerelease 2.0',
    ],
  },
};
const multiArtifactPayload = buildReadyItemPayload(multiArtifactHandoff);
const requestMatch = /<!-- pipeline-request-b64: ([A-Za-z0-9+/=]+) -->/.exec(multiArtifactPayload.body);
const filesMatch = /<!-- pipeline-files-b64: ([A-Za-z0-9+/=]+) -->/.exec(multiArtifactPayload.body);

if (!requestMatch) {
  fail('public artifact tuple ready item must include an encoded refresh request');
}

if (!filesMatch) {
  fail('public artifact tuple ready item must include encoded refresh-file metadata');
}

const decodedRequest = Buffer.from(requestMatch[1], 'base64').toString('utf8');
const decodedFiles = JSON.parse(Buffer.from(filesMatch[1], 'base64').toString('utf8'));

if (!decodedRequest.includes('npm run refresh:public-artifact-versions -- --date 2026-06-18')) {
  fail('public artifact tuple refresh request must preserve tuple_date as the docs row date');
}

if (JSON.stringify(decodedFiles) !== JSON.stringify(multiArtifactHandoff.refresh_files)) {
  fail('public artifact tuple refresh-file metadata must preserve the focused refresh files');
}

for (const authorityFile of [
  'static/public-artifact-compatibility-evidence.json',
  'static/sdk-neutrality-contract.json',
  'scripts/workflow-sdk-neutrality-authority-lock.json',
]) {
  if (!decodedFiles.includes(authorityFile)) {
    fail(`public artifact tuple ready item must include generated Workflow authority file ${authorityFile}`);
  }
}

const publishedServerAdvanceHandoff = {
  ...multiArtifactHandoff,
  changed_files: ['scripts/published-artifact-versions.json'],
  published_artifact_versions: {
    ...multiArtifactHandoff.published_artifact_versions,
    server: '0.2.427',
  },
  previous_published_artifact_versions: {
    ...multiArtifactHandoff.published_artifact_versions,
  },
};
const publishedServerAdvancePayload = buildReadyItemPayload(
  publishedServerAdvanceHandoff,
);
const publishedServerRequestMatch =
  /<!-- pipeline-request-b64: ([A-Za-z0-9+/=]+) -->/.exec(
    publishedServerAdvancePayload.body,
  );
const publishedServerRequest = Buffer.from(
  publishedServerRequestMatch[1],
  'base64',
).toString('utf8');

assert.strictEqual(
  publishedServerAdvancePayload.title,
  'Refresh public docs artifact tuple for server 0.2.427',
  'a published-only Server advance must name the independently published version',
);
assert.notStrictEqual(
  publishedServerAdvancePayload.key,
  stableKey,
  'a published-only Server advance must receive a distinct handoff key',
);
assert.match(
  publishedServerAdvancePayload.body,
  /<!-- pipeline-worker-branch: seed\/docs-artifact-tuple-server-0\.2\.427 -->/,
  'a published-only Server advance must route through a version-specific branch',
);
for (const text of [
  '## Changed Independently Published Components\n- server 0.2.426 -> 0.2.427',
  '## Current Independently Published Component Tuple',
  '- server: 0.2.427',
  '## Qualified Aggregate Recommendation',
  '- server: 0.2.426',
]) {
  assert.ok(
    publishedServerAdvancePayload.body.includes(text),
    `a published-only Server advance body must include ${text}`,
  );
}
for (const text of [
  'Changed independently published components:\n- server 0.2.426 -> 0.2.427',
  'Current independently published component tuple:',
  '- server 0.2.427',
  'Qualified aggregate recommendation:',
  '- server 0.2.426',
]) {
  assert.ok(
    publishedServerRequest.includes(text),
    `a published-only Server advance request must include ${text}`,
  );
}
const legacyQualifiedKeys = [
  `versions-${artifactVersionDigest(stableKeyHandoff.artifact_versions)}`,
  legacyKey,
];
if (
  publishedServerAdvancePayload.duplicateKeys.some(key => (
    legacyQualifiedKeys.includes(key)
  ))
) {
  fail(
    'a published-only advance must not deduplicate against qualified-tuple-only handoffs',
  );
}

for (const [label, mutate, expected] of [
  [
    'missing current published-component state',
    handoff => {
      delete handoff.published_artifact_versions;
    },
    /handoff\.published_artifact_versions must be an object/,
  ],
  [
    'malformed current published-component state',
    handoff => {
      handoff.published_artifact_versions.server = '';
    },
    /handoff\.published_artifact_versions\.server must be a non-empty string/,
  ],
  [
    'missing previous published-component state',
    handoff => {
      delete handoff.previous_published_artifact_versions;
    },
    /handoff\.previous_published_artifact_versions must be an object/,
  ],
  [
    'malformed previous published-component state',
    handoff => {
      handoff.previous_published_artifact_versions.unexpected = '1.0.0';
    },
    /handoff\.previous_published_artifact_versions contains unknown artifacts: unexpected/,
  ],
]) {
  const invalidHandoff = structuredClone(multiArtifactHandoff);
  mutate(invalidHandoff);
  assert.throws(
    () => buildReadyItemPayload(invalidHandoff),
    expected,
    `the tuple router must reject ${label}`,
  );
}

assert.throws(
  () => buildReadyItemPayload({
    ...multiArtifactHandoff,
    compatibility_evidence: compatibilityEvidence({
      ...multiArtifactHandoff.artifact_versions,
      server: '0.2.999',
    }),
  }),
  /must bind the exact selected artifact versions/,
  'the tuple router must reject compatibility evidence for a different Server tuple',
);

const authorizationOnlyEvidence = compatibilityEvidence(
  multiArtifactHandoff.artifact_versions,
);
authorizationOnlyEvidence.schema_version = 3;
authorizationOnlyEvidence.outcome = 'authorized';
delete authorizationOnlyEvidence.authority.sdk_server_qualification;
assert.throws(
  () => buildReadyItemPayload({
    ...multiArtifactHandoff,
    compatibility_evidence: authorizationOnlyEvidence,
  }),
  /must be a passing version 2 record/,
  'the tuple router must reject release-plan authorization without qualification',
);

const failedQualificationEvidence = compatibilityEvidence(
  multiArtifactHandoff.artifact_versions,
);
failedQualificationEvidence.sdk_server_compatibility['sdk-python'].outcome = 'fail';
assert.throws(
  () => buildReadyItemPayload({
    ...multiArtifactHandoff,
    compatibility_evidence: failedQualificationEvidence,
  }),
  /must bind sdk-python/,
  'the tuple router must reject a failed SDK qualification',
);

const mismatchedLocatorEvidence = compatibilityEvidence(
  multiArtifactHandoff.artifact_versions,
);
mismatchedLocatorEvidence.sdk_server_compatibility[
  'sdk-rust'
].sdk_distribution.locator = 'crates.io:durable-workflow@9.9.9';
assert.throws(
  () => buildReadyItemPayload({
    ...multiArtifactHandoff,
    compatibility_evidence: mismatchedLocatorEvidence,
  }),
  /must bind sdk-rust/,
  'the tuple router must reject a mismatched SDK distribution locator',
);

const mismatchedDigestEvidence = compatibilityEvidence(
  multiArtifactHandoff.artifact_versions,
);
mismatchedDigestEvidence.sdk_server_compatibility[
  'sdk-rust'
].server_distribution.artifacts[0].sha256 = '1'.repeat(64);
assert.throws(
  () => buildReadyItemPayload({
    ...multiArtifactHandoff,
    compatibility_evidence: mismatchedDigestEvidence,
  }),
  /same exact Server source and distribution digests/,
  'the tuple router must reject mismatched Server distribution digests',
);

const unchangedAuthorityBytesHandoff = {
  ...multiArtifactHandoff,
  changed_files: multiArtifactHandoff.changed_files.filter(
    file => file !== 'static/sdk-neutrality-contract.json',
  ),
};
const unchangedAuthorityBytesPayload = buildReadyItemPayload(unchangedAuthorityBytesHandoff);
if (!unchangedAuthorityBytesPayload.body.includes('pipeline-files-b64')) {
  fail('a successor Workflow ref with unchanged authority bytes must remain routable');
}
if (
  unchangedAuthorityBytesPayload.key !== multiArtifactPayload.key
  || unchangedAuthorityBytesPayload.body !== multiArtifactPayload.body
) {
  fail('changed and unchanged successor authority bytes must route through one tuple ready-item key');
}

if (multiArtifactPayload.key.includes(stableKeyHandoff.tuple_date)) {
  fail('public artifact tuple payload key must not include tuple_date');
}

if (multiArtifactPayload.title.includes(stableKeyHandoff.tuple_date)) {
  fail('public artifact tuple ready item title must not include tuple_date');
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch (err) {
        reject(err);
      }
    });
    request.on('error', reject);
  });
}

async function withStubGate(issues, callback) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method !== 'POST' || request.url !== '/api/worker/actions/execute') {
        response.writeHead(404, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({status: 'failed', error: 'unexpected endpoint'}));
        return;
      }

      const payload = await readRequestBody(request);
      requests.push(payload);

      if (payload.action === 'gh.issue.list') {
        response.writeHead(200, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({status: 'completed', result: issues}));
        return;
      }

      if (payload.action === 'gh.issue.create') {
        response.writeHead(200, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({
          status: 'completed',
          result: {
            number: 730,
            title: payload.input.title,
            body: payload.input.body,
            labels: payload.input.labels.split(','),
          },
        }));
        return;
      }

      response.writeHead(400, {'Content-Type': 'application/json'});
      response.end(JSON.stringify({status: 'failed', error: `unexpected action ${payload.action}`}));
    } catch (err) {
      response.writeHead(500, {'Content-Type': 'application/json'});
      response.end(JSON.stringify({status: 'failed', error: err.message}));
    }
  });

  const address = await listen(server);
  const previousGateUrl = process.env.PIPELINE_GATE_URL;
  process.env.PIPELINE_GATE_URL = `http://127.0.0.1:${address.port}`;

  try {
    return await callback(requests);
  } finally {
    if (previousGateUrl === undefined) {
      delete process.env.PIPELINE_GATE_URL;
    } else {
      process.env.PIPELINE_GATE_URL = previousGateUrl;
    }
    await close(server);
  }
}

function parseLabels(labels) {
  return labels.split(',').filter(Boolean);
}

function assertLabelSet(labels, expectedLabels, message) {
  const actual = parseLabels(labels).sort();
  const expected = [...expectedLabels].sort();

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${message}: expected ${expected.join(', ')}, got ${actual.join(', ')}`);
  }
}

function assertGateListPayload(request) {
  if (!request || request.action !== 'gh.issue.list') {
    fail('public artifact tuple router must list existing handoff ready items through the gate');
  }

  if (request.input.repo !== 'durable-workflow.github.io') {
    fail('public artifact tuple list payload must target the docs repository');
  }

  assertLabelSet(request.input.labels, [
    'pipeline:ready-item',
    'branch:main',
    'state:pending',
    'source:handoff',
    'flow:release',
  ], 'public artifact tuple list payload must use the pending handoff release labels');

  if (request.input.state !== 'open' || request.input.limit !== 50) {
    fail('public artifact tuple list payload must use the bounded open-ready-item lookup');
  }
}

function assertGateCreatePayload(request) {
  if (!request || request.action !== 'gh.issue.create') {
    fail('public artifact tuple router must create missing handoff ready items through the gate');
  }

  if (request.input.repo !== multiArtifactPayload.repo) {
    fail('public artifact tuple create payload must target the docs repository');
  }

  if (request.input.title !== multiArtifactPayload.title) {
    fail('public artifact tuple create payload must preserve the generated title');
  }

  if (!request.input.body.includes(`<!-- docs-artifact-tuple-key: ${multiArtifactPayload.key} -->`)) {
    fail('public artifact tuple create payload must include the duplicate key marker');
  }

  if (!request.input.body.includes(filesMatch[0])) {
    fail('public artifact tuple create payload must include focused refresh-file metadata');
  }

  assertLabelSet(request.input.labels, [
    'pipeline:ready-item',
    'branch:main',
    'state:pending',
    'source:handoff',
    'flow:release',
    'priority:P0',
  ], 'public artifact tuple create payload must use the full handoff release label set');
}

async function assertStubGateCreatePath() {
  const routed = await withStubGate([], async requests => {
    const readyItem = await routeReadyItem(multiArtifactPayload);

    if (requests.length !== 2) {
      fail(`public artifact tuple create path must make exactly two gate requests, saw ${requests.length}`);
    }

    assertGateListPayload(requests[0]);
    assertGateCreatePayload(requests[1]);

    return readyItem;
  });

  if (!routed || routed.number !== 730) {
    fail('public artifact tuple create path must return the created ready item');
  }
}

async function assertStubGateDuplicatePath() {
  const routed = await withStubGate(
    [{number: 42, body: `<!-- docs-artifact-tuple-key: ${legacyKey} -->`}],
    async requests => {
      const readyItem = await routeReadyItem(multiArtifactPayload);

      if (requests.length !== 1) {
        fail(`public artifact tuple duplicate path must only list existing items, saw ${requests.length} requests`);
      }

      assertGateListPayload(requests[0]);

      return readyItem;
    }
  );

  if (!routed || routed.number !== 42) {
    fail('public artifact tuple duplicate path must reuse an existing legacy-key handoff');
  }
}

async function main() {
  await assertStubGateCreatePath();
  await assertStubGateDuplicatePath();

  console.log('Public artifact tuple workflow routes a read-only pipeline handoff.');
}

main().catch(err => {
  fail(err.stack || err.message);
});
