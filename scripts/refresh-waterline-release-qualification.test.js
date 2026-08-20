#!/usr/bin/env node

const assert = require('assert');
const crypto = require('crypto');

const retained = require('./component-release-qualification-retained-evidence.json');
const {
  buildPublicComponentReleaseQualifications,
  currentQualificationSummary,
  qualificationArtifactName,
} = require('./generate-component-release-qualifications');
const {
  DOCS_CONFIRMATION_STEP,
  QUALIFICATION_JOB,
  REQUIRED_PASSING_STEPS,
  buildQualificationRecord,
  findCurrentQualification,
  mergeQualification,
  parseArtifactJson,
} = require('./refresh-waterline-release-qualification');

const VERSION = '2.0.0-rc.21';
const RELEASE_COMMIT = 'a'.repeat(40);
const WORKFLOW_COMMIT = 'b'.repeat(40);
const TAG_OBJECT_COMMIT = 'c'.repeat(40);
const RUN_ID = 123456789;
const ARTIFACT_ID = 987654321;
const PACKAGES = {
  waterline: VERSION,
  'sdk-php': '2.0.0-rc.14',
  workflow: '2.0.0-rc.14',
};
const REORDERED_PACKAGES = {
  waterline: PACKAGES.waterline,
  workflow: PACKAGES.workflow,
  'sdk-php': PACKAGES['sdk-php'],
};

function fixture(qualifiedPackages = PACKAGES) {
  const run = {
    id: RUN_ID,
    run_attempt: 1,
    name: 'Release Docs Audit',
    path: '.github/workflows/release-docs-audit.yml',
    event: 'repository_dispatch',
    head_sha: WORKFLOW_COMMIT,
    status: 'completed',
    conclusion: 'failure',
    html_url: `https://github.com/durable-workflow/waterline/actions/runs/${RUN_ID}`,
    repository: {full_name: 'durable-workflow/waterline'},
    updated_at: '2026-08-20T12:00:00.000Z',
  };
  const qualification = {
    schema: 'durable-workflow.exact-current-composer-qualification/v1',
    outcome: 'pass',
    packages: {...qualifiedPackages},
    package_metadata: {
      name: 'durable-workflow/waterline',
      description: 'Waterline fixture',
    },
    composer_graphs: {embedded: {}, service: {}},
  };
  const releaseSurfaces = {
    schema: 'durable-workflow.waterline-release-surfaces/v1',
    outcome: 'verified',
    version: VERSION,
    source_commit: RELEASE_COMMIT,
  };
  const assetEvidence = {
    schema: 'durable-workflow.waterline.release-qualification-evidence',
    schema_version: 2,
    repository: 'durable-workflow/waterline',
    workflow_run: {
      name: run.name,
      path: run.path,
      event: run.event,
      run_id: run.id,
      run_attempt: run.run_attempt,
      run_url: run.html_url,
      head_sha: run.head_sha,
    },
    release: {
      tag: VERSION,
      source_commit: RELEASE_COMMIT,
    },
    qualification,
    release_surfaces: releaseSurfaces,
  };
  const assetBytes = Buffer.from(`${JSON.stringify(assetEvidence, null, 2)}\n`);
  const artifactName = qualificationArtifactName(RUN_ID, 1);
  const artifact = {
    id: ARTIFACT_ID,
    name: artifactName,
    state: 'uploaded',
    size: assetBytes.length,
    browser_download_url:
      `https://github.com/durable-workflow/waterline/releases/download/${VERSION}/` +
        artifactName,
    digest: `sha256:${crypto.createHash('sha256').update(assetBytes).digest('hex')}`,
  };

  return {
    expectedWaterlineVersion: VERSION,
    assetBytes,
    assetEvidence,
    run,
    jobs: {
      jobs: [
        {
          name: QUALIFICATION_JOB,
          conclusion: 'failure',
          steps: [
            ...REQUIRED_PASSING_STEPS.map(name => ({
              name,
              status: 'completed',
              conclusion: 'success',
            })),
            {
              name: DOCS_CONFIRMATION_STEP,
              status: 'completed',
              conclusion: 'failure',
            },
          ],
        },
      ],
    },
    artifact,
    release: {tag_name: VERSION, assets: [artifact]},
    releaseTagCommit: RELEASE_COMMIT,
    releaseSurfaces,
    qualification,
    releaseManifest: {
      extra: {'durable-workflow': {'product-train': VERSION}},
      'require-dev': {
        'durable-workflow/sdk': PACKAGES['sdk-php'],
        'durable-workflow/workflow': PACKAGES.workflow,
      },
    },
    serviceManifest: {
      require: {'durable-workflow/sdk': PACKAGES['sdk-php']},
    },
  };
}

const built = buildQualificationRecord(fixture());
assert.strictEqual(built.docs_confirmation, 'failure');
assert.strictEqual(built.source.workflow_run.qualification_outcome, 'pass');
assert.strictEqual(built.source.workflow_run.head_sha, WORKFLOW_COMMIT);
assert.strictEqual(built.source.release_commit, RELEASE_COMMIT);
assert.notStrictEqual(
  built.source.workflow_run.head_sha,
  built.source.release_commit,
  'the trusted workflow may land after the immutable current release tag',
);
assert.deepStrictEqual(built.qualification.packages, PACKAGES);
assert.deepStrictEqual(
  buildQualificationRecord(fixture(REORDERED_PACKAGES)).qualification.packages,
  PACKAGES,
  'exact package tuple validation must ignore JSON object insertion order',
);
assert.throws(
  () => buildQualificationRecord(fixture({...REORDERED_PACKAGES, unexpected: '2.0.0'})),
  /package tuple keys must be exactly sdk-php, waterline, workflow/,
  'order-independent package tuple validation must still reject unexpected keys',
);
assert.deepStrictEqual(
  parseArtifactJson(fixture().assetBytes),
  fixture().assetEvidence,
  'the retained public release asset reader must parse the exact uploaded JSON bytes',
);
assert.throws(
  () => currentQualificationSummary(retained),
  /Current Waterline release qualification is missing/,
  'legacy retained rows must not masquerade as current release evidence',
);

const merged = mergeQualification(retained, built, '2026-08-20T12:00:00.000Z');
const generated = buildPublicComponentReleaseQualifications(merged);
assert.strictEqual(merged.schema_version, 2);
assert.strictEqual(merged.current_qualification_id, `waterline-${VERSION}-composer`);
assert.strictEqual(generated.schema_version, 1, 'existing audit consumers remain compatible');
assert.strictEqual(generated.current_release.version, VERSION);
assert.strictEqual(
  generated.qualifications.find(record => record.id === merged.current_qualification_id)
    .evidence_role,
  'current',
);
assert(
  generated.qualifications
    .filter(record => record.id !== merged.current_qualification_id)
    .every(record => record.evidence_role === 'historical'),
  'superseded prereleases must remain explicitly historical',
);
assert.deepStrictEqual(currentQualificationSummary(merged), {
  repository: 'durable-workflow/waterline',
  workflow_name: 'Release Docs Audit',
  workflow_path: '.github/workflows/release-docs-audit.yml',
  event: 'repository_dispatch',
  run_id: RUN_ID,
  run_attempt: 1,
  run_url: `https://github.com/durable-workflow/waterline/actions/runs/${RUN_ID}`,
  release_tag: VERSION,
  release_commit: RELEASE_COMMIT,
  qualification_outcome: 'pass',
  packages: PACKAGES,
  artifact_id: ARTIFACT_ID,
  artifact_name: qualificationArtifactName(RUN_ID, 1),
  artifact_digest: fixture().artifact.digest,
});

function rejected(mutator, message) {
  const candidate = structuredClone(fixture());
  mutator(candidate);
  assert.throws(() => buildQualificationRecord(candidate), message);
}

rejected(
  value => { value.run.repository.full_name = 'attacker/waterline'; },
  /must come from durable-workflow\/waterline/,
);
rejected(
  value => {
    value.run.path = '.github/workflows/untrusted.yml';
    value.assetEvidence.workflow_run.path = value.run.path;
  },
  /must come from durable-workflow\/waterline/,
);
rejected(
  value => {
    value.run.event = 'pull_request';
    value.assetEvidence.workflow_run.event = value.run.event;
  },
  /repository_dispatch/,
);
rejected(
  value => { value.assetEvidence.workflow_run.run_id += 1; },
  /public release evidence is absent, stale, or incomplete/,
);
rejected(
  value => { value.releaseSurfaces.source_commit = 'b'.repeat(40); },
  /public release evidence is absent, stale, or incomplete/,
);
rejected(
  value => { value.releaseTagCommit = 'c'.repeat(40); },
  /public release evidence is absent, stale, or incomplete/,
);
rejected(
  value => { value.artifact.digest = `sha256:${'b'.repeat(64)}`; },
  /digest does not match the downloaded public bytes/,
);
rejected(
  value => { value.qualification.packages.workflow = '2.0.0-rc.13'; },
  /exact released package tuple/,
);
rejected(
  value => { value.qualification.outcome = 'incomplete'; },
  /outcome is not pass/,
);
rejected(
  value => {
    value.jobs.jobs[0].steps.find(step => (
      step.name === 'Solve the exact Waterline, Workflow, and PHP SDK tuple'
    )).conclusion = 'failure';
  },
  /did not pass required step/,
);
rejected(
  value => { value.expectedWaterlineVersion = '2.0.0-rc.22'; },
  /current published Waterline release 2.0.0-rc.22/,
);

const confirmed = fixture();
confirmed.run.conclusion = 'success';
confirmed.jobs.jobs[0].conclusion = 'success';
confirmed.jobs.jobs[0].steps.find(step => step.name === DOCS_CONFIRMATION_STEP)
  .conclusion = 'success';
assert.strictEqual(buildQualificationRecord(confirmed).docs_confirmation, 'success');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return structuredClone(body);
    },
    async arrayBuffer() {
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

async function assertPublicReleaseAssetRetrieval() {
  const source = fixture();
  const artifact = source.artifact;
  const token = 'docs-repository-token';
  const calls = [];
  const api = 'https://api.github.com/repos/durable-workflow/waterline';
  const fetchImpl = async (url, options) => {
    calls.push({url, options});

    if (url === `${api}/actions/runs/${RUN_ID}`) {
      return response(source.run);
    }
    if (url === `${api}/contents/composer.json?ref=${VERSION}`) {
      return response({
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(source.releaseManifest)).toString('base64'),
      });
    }
    if (url === `${api}/contents/standalone/composer.json?ref=${VERSION}`) {
      return response({
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(source.serviceManifest)).toString('base64'),
      });
    }
    if (url === `${api}/actions/runs/${RUN_ID}/jobs?per_page=100`) {
      return response(source.jobs);
    }
    if (url === `${api}/releases/tags/${VERSION}`) {
      return response(source.release);
    }
    if (url === `${api}/git/ref/tags/${VERSION}`) {
      return response({object: {type: 'tag', sha: TAG_OBJECT_COMMIT}});
    }
    if (url === `${api}/git/tags/${TAG_OBJECT_COMMIT}`) {
      return response({object: {type: 'commit', sha: RELEASE_COMMIT}});
    }
    if (url === artifact.browser_download_url) {
      return response(source.assetBytes);
    }
    throw new Error(`Unexpected fetch fixture URL: ${url}`);
  };

  const found = await findCurrentQualification(VERSION, {
    fetchImpl,
    runId: RUN_ID,
    token,
  });

  assert.strictEqual(found.record.source.workflow_run.run_id, RUN_ID);
  assert.strictEqual(found.record.source.artifact.digest, artifact.digest);
  const artifactCall = calls.find(call => call.url === artifact.browser_download_url);
  assert.ok(artifactCall, 'the public release asset route must be exercised');
  assert.strictEqual(
    artifactCall.options.headers.Authorization,
    undefined,
    'the public release asset download must not use the docs repository token',
  );
  assert(
    calls
      .filter(call => call !== artifactCall)
      .every(call => call.options.headers.Authorization === `Bearer ${token}`),
    'the docs repository token may rate-limit authenticated public metadata requests only',
  );

  await assert.rejects(
    () => findCurrentQualification(VERSION, {
      fetchImpl: async (url, options) => (
        url === artifact.browser_download_url
          ? response('', 401)
          : fetchImpl(url, options)
      ),
      runId: RUN_ID,
      token,
    }),
    /Public qualification release asset.*returned HTTP 401/,
    'an unreadable public release asset must fail closed with its exact URL and status',
  );

  await assert.rejects(
    () => findCurrentQualification(VERSION, {
      fetchImpl: async (url, options) => (
        url === `${api}/releases/tags/${VERSION}`
          ? response({}, 404)
          : fetchImpl(url, options)
      ),
      runId: RUN_ID,
      token: '',
    }),
    /Missing trusted qualification for current published Waterline release.*metadata.*HTTP 404/,
    'missing public release evidence must identify the exact current release',
  );

  calls.length = 0;
  const anonymous = await findCurrentQualification(VERSION, {
    fetchImpl,
    runId: RUN_ID,
    token: '',
  });
  assert.strictEqual(
    anonymous.record.source.artifact.digest,
    artifact.digest,
    'the configured public release route must remain retrievable without a new secret',
  );
  assert(
    calls.every(call => call.options.headers.Authorization === undefined),
    'anonymous public qualification retrieval must not synthesize credentials',
  );
}

assertPublicReleaseAssetRetrieval()
  .then(() => {
    console.log('Waterline release qualification ingestion checks passed.');
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
