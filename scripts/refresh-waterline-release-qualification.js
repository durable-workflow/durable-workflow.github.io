#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  QUALIFICATION_SCHEMA,
  QUALIFICATION_WORKFLOW_NAME,
  QUALIFICATION_WORKFLOW_PATH,
  SOURCE_SCHEMA,
  buildPublicComponentReleaseQualifications,
  qualificationArtifactName,
  renderPublicComponentReleaseQualifications,
} = require('./generate-component-release-qualifications');

const REPOSITORY = 'durable-workflow/waterline';
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
const API_BASE_URL = 'https://api.github.com';
const QUALIFICATION_JOB = 'Verify complete Waterline public release train';
const REQUIRED_PASSING_STEPS = Object.freeze([
  'Resolve release tag',
  'Check out the exact release source as inert qualification data',
  'Bind release tag to exact source commit',
  'Install Composer for exact-current qualification',
  'Require source-bound GitHub, Packagist, and image surfaces',
  'Solve the exact Waterline, Workflow, and PHP SDK tuple',
  'Wait for Packagist release',
  'Mark exact Composer qualification ready',
  'Upload docs release audit evidence',
]);
const DOCS_CONFIRMATION_STEP = 'Require live docs release audit refresh';
const QUALIFICATION_ASSET_SCHEMA =
  'durable-workflow.waterline.release-qualification-evidence';
const MAX_ASSET_BYTES = 1024 * 1024;
const repoRoot = path.join(__dirname, '..');
const retainedEvidencePath = path.join(
  repoRoot,
  'scripts',
  'component-release-qualification-retained-evidence.json',
);
const publicEvidencePath = path.join(
  repoRoot,
  'static',
  'public-component-release-qualifications.json',
);
const publishedVersionsPath = path.join(
  repoRoot,
  'scripts',
  'published-artifact-versions.json',
);

function fail(message) {
  throw new Error(message);
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value || {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} keys must be exactly ${wanted.join(', ')}; got ${actual.join(', ')}`);
  }
}

function exactObject(actual, expected, label) {
  const expectedKeys = Object.keys(expected || {});
  if (
    !actual
    || typeof actual !== 'object'
    || Array.isArray(actual)
    || Object.keys(actual).length !== expectedKeys.length
    || expectedKeys.some(key => (
      !Object.prototype.hasOwnProperty.call(actual, key)
      || actual[key] !== expected[key]
    ))
  ) {
    fail(`${label} does not match the exact released package tuple`);
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseArtifactJson(assetBytes) {
  if (
    !Buffer.isBuffer(assetBytes)
    || assetBytes.length === 0
    || assetBytes.length > MAX_ASSET_BYTES
  ) {
    fail(`qualification release asset must contain 1-${MAX_ASSET_BYTES} bytes`);
  }
  try {
    return JSON.parse(assetBytes.toString('utf8'));
  } catch (error) {
    fail(`qualification release asset is not valid JSON: ${error.message}`);
  }
}

function validateRun(run, jobs) {
  if (
    run?.repository?.full_name !== REPOSITORY
    || run.name !== QUALIFICATION_WORKFLOW_NAME
    || run.path !== QUALIFICATION_WORKFLOW_PATH
    || run.event !== 'repository_dispatch'
  ) {
    fail(
      `current Waterline qualification must come from ${REPOSITORY} ` +
        `${QUALIFICATION_WORKFLOW_PATH} on repository_dispatch`,
    );
  }
  if (
    !Number.isInteger(run.id)
    || run.id < 1
    || !Number.isInteger(run.run_attempt)
    || run.run_attempt < 1
    || run.html_url !== `${REPOSITORY_URL}/actions/runs/${run.id}`
    || run.status !== 'completed'
    || !['failure', 'success'].includes(run.conclusion)
    || typeof run.head_sha !== 'string'
    || !/^[0-9a-f]{40}$/.test(run.head_sha)
  ) {
    fail('current Waterline qualification run identity is incomplete or source-mismatched');
  }

  const allJobs = Array.isArray(jobs?.jobs) ? jobs.jobs : [];
  const job = allJobs.find(candidate => candidate?.name === QUALIFICATION_JOB);
  if (!job || !['failure', 'success'].includes(job.conclusion)) {
    fail(`current Waterline qualification run has no completed ${QUALIFICATION_JOB} job`);
  }
  const steps = Array.isArray(job.steps) ? job.steps : [];
  for (const name of REQUIRED_PASSING_STEPS) {
    const step = steps.find(candidate => candidate?.name === name);
    if (!step || step.status !== 'completed' || step.conclusion !== 'success') {
      fail(`current Waterline qualification did not pass required step: ${name}`);
    }
  }
  const confirmation = steps.find(candidate => candidate?.name === DOCS_CONFIRMATION_STEP);
  if (!confirmation || !['failure', 'success'].includes(confirmation.conclusion)) {
    fail('current Waterline qualification has no completed docs confirmation step');
  }
  const failedSteps = steps.filter(step => step?.conclusion === 'failure');
  if (
    failedSteps.some(step => step.name !== DOCS_CONFIRMATION_STEP)
    || (run.conclusion === 'failure' && confirmation.conclusion !== 'failure')
    || (run.conclusion === 'success' && confirmation.conclusion !== 'success')
  ) {
    fail('current Waterline qualification failed outside the expected pre-deployment docs check');
  }

  return confirmation.conclusion;
}

function validateArtifact(artifact, release, run, assetBytes) {
  const expectedName = qualificationArtifactName(run.id, run.run_attempt);
  if (
    release?.tag_name === undefined
    || artifact?.name !== expectedName
    || !Number.isInteger(artifact.id)
    || artifact.id < 1
    || artifact.state !== 'uploaded'
    || artifact.size !== assetBytes.length
    || artifact.browser_download_url !==
      `${REPOSITORY_URL}/releases/download/${release.tag_name}/${expectedName}`
  ) {
    fail(
      'qualification release asset metadata does not bind the accepted Waterline workflow run',
    );
  }

  const digest = `sha256:${sha256(assetBytes)}`;
  if (artifact.digest !== digest) {
    fail('qualification release asset digest does not match the downloaded public bytes');
  }
  return digest;
}

function declaredPackages(releaseManifest, serviceManifest) {
  const packages = {
    waterline: releaseManifest?.extra?.['durable-workflow']?.['product-train'],
    'sdk-php': serviceManifest?.require?.['durable-workflow/sdk'],
    workflow: releaseManifest?.['require-dev']?.['durable-workflow/workflow'],
  };
  const sdkDevelopmentPin = releaseManifest?.['require-dev']?.['durable-workflow/sdk'];
  if (sdkDevelopmentPin !== packages['sdk-php']) {
    fail('released Waterline embedded and service manifests declare different PHP SDK versions');
  }
  if (Object.values(packages).some(value => typeof value !== 'string' || value.length === 0)) {
    fail('released Waterline manifests do not declare one exact Composer package tuple');
  }
  return packages;
}

function buildQualificationRecord(input) {
  const {
    artifact,
    assetBytes,
    assetEvidence,
    jobs,
    release,
    releaseManifest,
    run,
    releaseTagCommit,
    serviceManifest,
    expectedWaterlineVersion,
  } = input;

  exactKeys(
    assetEvidence,
    [
      'qualification',
      'release',
      'release_surfaces',
      'repository',
      'schema',
      'schema_version',
      'workflow_run',
    ],
    'qualification release asset',
  );
  exactKeys(
    assetEvidence.workflow_run,
    ['event', 'head_sha', 'name', 'path', 'run_attempt', 'run_id', 'run_url'],
    'qualification release asset workflow run',
  );
  exactKeys(
    assetEvidence.release,
    ['source_commit', 'tag'],
    'qualification release asset release',
  );
  const qualification = assetEvidence.qualification;
  const releaseSurfaces = assetEvidence.release_surfaces;

  if (
    assetEvidence.schema !== QUALIFICATION_ASSET_SCHEMA
    || assetEvidence.schema_version !== 2
    || assetEvidence.repository !== REPOSITORY
    || assetEvidence.workflow_run.name !== run.name
    || assetEvidence.workflow_run.path !== run.path
    || assetEvidence.workflow_run.event !== run.event
    || assetEvidence.workflow_run.run_id !== run.id
    || assetEvidence.workflow_run.run_attempt !== run.run_attempt
    || assetEvidence.workflow_run.run_url !== run.html_url
    || assetEvidence.workflow_run.head_sha !== run.head_sha
    || assetEvidence.release.tag !== expectedWaterlineVersion
    || assetEvidence.release.source_commit !== releaseTagCommit
    || release?.tag_name !== expectedWaterlineVersion
    || releaseSurfaces?.schema !== 'durable-workflow.waterline-release-surfaces/v1'
    || releaseSurfaces.outcome !== 'verified'
    || releaseSurfaces.version !== expectedWaterlineVersion
    || releaseSurfaces.source_commit !== assetEvidence.release.source_commit
  ) {
    fail(
      `Missing trusted qualification for current published Waterline release ` +
        `${expectedWaterlineVersion}: public release evidence is absent, stale, or incomplete`,
    );
  }
  const docsConfirmation = validateRun(run, jobs);
  const digest = validateArtifact(artifact, release, run, assetBytes);
  const packages = declaredPackages(releaseManifest, serviceManifest);
  exactKeys(
    qualification,
    ['composer_graphs', 'outcome', 'package_metadata', 'packages', 'schema'],
    'exact Composer qualification',
  );
  exactKeys(qualification.packages, ['sdk-php', 'waterline', 'workflow'], 'package tuple');
  if (qualification.schema !== QUALIFICATION_SCHEMA || qualification.outcome !== 'pass') {
    fail('current Waterline exact Composer qualification outcome is not pass');
  }
  exactObject(qualification.packages, packages, 'exact Composer qualification');
  if (packages.waterline !== expectedWaterlineVersion) {
    fail(
      `Current published Waterline release is ${expectedWaterlineVersion}, but qualification ` +
        `artifact is for ${packages.waterline || '<missing>'}`,
    );
  }

  return {
    id: `waterline-${expectedWaterlineVersion}-composer`,
    component: {
      artifact: 'waterline',
      version: expectedWaterlineVersion,
    },
    qualification: {
      schema: qualification.schema,
      outcome: qualification.outcome,
      packages,
    },
    source: {
      repository_url: REPOSITORY_URL,
      release_tag: releaseSurfaces.version,
      release_commit: releaseSurfaces.source_commit,
      workflow_run: {
        name: run.name,
        path: run.path,
        event: run.event,
        head_sha: run.head_sha,
        run_id: run.id,
        run_attempt: run.run_attempt,
        run_url: run.html_url,
        run_conclusion: run.conclusion,
        qualification_outcome: 'pass',
      },
      artifact: {
        name: artifact.name,
        artifact_id: artifact.id,
        url: artifact.browser_download_url,
        digest,
      },
    },
    docs_confirmation: docsConfirmation,
  };
}

function mergeQualification(source, built, capturedAt) {
  const {docs_confirmation: ignored, ...record} = built;
  const records = (Array.isArray(source.records) ? source.records : [])
    .filter(candidate => candidate.id !== record.id);
  records.push(record);
  records.sort((left, right) => left.component.version.localeCompare(
    right.component.version,
    undefined,
    {numeric: true},
  ));

  return {
    schema: SOURCE_SCHEMA,
    schema_version: 2,
    retained_evidence_captured_at: capturedAt,
    current_qualification_id: record.id,
    records,
  };
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'durable-workflow-docs-release-qualification',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
  };
}

async function fetchResponse(url, token, fetchImpl = fetch) {
  let response = await fetchImpl(url, {
    headers: githubHeaders(token),
    redirect: 'follow',
  });
  if (token && [401, 403, 404].includes(response.status)) {
    response = await fetchImpl(url, {
      headers: githubHeaders(''),
      redirect: 'follow',
    });
  }
  if (!response.ok) {
    fail(`${url} returned HTTP ${response.status}`);
  }
  return response;
}

async function fetchPublicAsset(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: githubHeaders(''),
    redirect: 'follow',
  });
  if (!response.ok) {
    fail(`Public qualification release asset ${url} returned HTTP ${response.status}`);
  }
  return response;
}

async function fetchJson(url, token, fetchImpl = fetch) {
  const response = await fetchResponse(url, token, fetchImpl);
  try {
    return await response.json();
  } catch (error) {
    fail(`${url} did not return JSON: ${error.message}`);
  }
}

async function fetchRepositoryJson(relativePath, token, fetchImpl = fetch) {
  return fetchJson(
    `${API_BASE_URL}/repos/${REPOSITORY}${relativePath}`,
    token,
    fetchImpl,
  );
}

async function fetchManifest(filePath, ref, token, fetchImpl = fetch) {
  const source = await fetchRepositoryJson(
    `/contents/${filePath}?ref=${encodeURIComponent(ref)}`,
    token,
    fetchImpl,
  );
  if (source?.encoding !== 'base64' || typeof source.content !== 'string') {
    fail(`Waterline ${ref} ${filePath} did not return base64 source`);
  }
  try {
    return JSON.parse(Buffer.from(source.content.replaceAll('\n', ''), 'base64').toString('utf8'));
  } catch (error) {
    fail(`Waterline ${ref} ${filePath} is not valid JSON: ${error.message}`);
  }
}

async function fetchTagCommit(releaseTag, token, fetchImpl = fetch) {
  const reference = await fetchRepositoryJson(
    `/git/ref/tags/${encodeURIComponent(releaseTag)}`,
    token,
    fetchImpl,
  );
  let object = reference?.object;
  const visited = new Set();

  for (let depth = 0; depth < 5; depth += 1) {
    if (
      !object
      || !['commit', 'tag'].includes(object.type)
      || typeof object.sha !== 'string'
      || !/^[0-9a-f]{40}$/.test(object.sha)
      || visited.has(object.sha)
    ) {
      fail(`Waterline release tag ${releaseTag} does not resolve to an exact source commit`);
    }
    if (object.type === 'commit') {
      return object.sha;
    }
    visited.add(object.sha);
    const annotatedTag = await fetchRepositoryJson(
      `/git/tags/${object.sha}`,
      token,
      fetchImpl,
    );
    object = annotatedTag?.object;
  }

  fail(`Waterline release tag ${releaseTag} exceeds the trusted tag resolution depth`);
}

async function findCurrentQualification(expectedWaterlineVersion, options = {}) {
  const token = Object.prototype.hasOwnProperty.call(options, 'token')
    ? options.token
    : (process.env.GITHUB_TOKEN || '');
  const fetchImpl = options.fetchImpl || fetch;
  const requestedRunId = options.runId;
  const runsResponse = requestedRunId
    ? {workflow_runs: [await fetchRepositoryJson(
      `/actions/runs/${requestedRunId}`,
      token,
      fetchImpl,
    )]}
    : await fetchRepositoryJson(
      `/actions/workflows/${path.posix.basename(QUALIFICATION_WORKFLOW_PATH)}/runs?` +
        'event=repository_dispatch&status=completed&per_page=100',
      token,
      fetchImpl,
    );
  const runs = (Array.isArray(runsResponse.workflow_runs) ? runsResponse.workflow_runs : [])
    .sort((left, right) => Number(right.id) - Number(left.id));
  if (runs.length === 0) {
    fail(
      `No completed publisher-completion ${QUALIFICATION_WORKFLOW_NAME} run exists for ` +
        `current published Waterline ${expectedWaterlineVersion}`,
    );
  }

  const releaseManifest = await fetchManifest(
    'composer.json',
    expectedWaterlineVersion,
    token,
    fetchImpl,
  );
  const serviceManifest = await fetchManifest(
    'standalone/composer.json',
    expectedWaterlineVersion,
    token,
    fetchImpl,
  );
  let release;
  let releaseTagCommit;
  try {
    [release, releaseTagCommit] = await Promise.all([
      fetchRepositoryJson(
        `/releases/tags/${encodeURIComponent(expectedWaterlineVersion)}`,
        token,
        fetchImpl,
      ),
      fetchTagCommit(expectedWaterlineVersion, token, fetchImpl),
    ]);
  } catch (error) {
    fail(
      `Missing trusted qualification for current published Waterline release ` +
        `${expectedWaterlineVersion}: public release tag metadata is unavailable: ${error.message}`,
    );
  }
  const diagnostics = [];
  for (const candidate of runs) {
    try {
      const run = candidate.path
        ? candidate
        : await fetchRepositoryJson(`/actions/runs/${candidate.id}`, token, fetchImpl);
      const jobs = await fetchRepositoryJson(
        `/actions/runs/${run.id}/jobs?per_page=100`,
        token,
        fetchImpl,
      );
      const expectedAssetName = qualificationArtifactName(run.id, run.run_attempt);
      const artifact = (Array.isArray(release.assets) ? release.assets : []).find(
        item => item.name === expectedAssetName,
      );
      if (!artifact) {
        fail(
          `run ${run.id} has no publicly retrievable ${expectedAssetName} release asset`,
        );
      }
      const assetResponse = await fetchPublicAsset(artifact.browser_download_url, fetchImpl);
      const assetBytes = Buffer.from(await assetResponse.arrayBuffer());
      const assetEvidence = parseArtifactJson(assetBytes);
      const record = buildQualificationRecord({
        artifact,
        assetBytes,
        assetEvidence,
        jobs,
        release,
        releaseManifest,
        run,
        releaseTagCommit,
        serviceManifest,
        expectedWaterlineVersion,
      });
      return {
        record,
        capturedAt: new Date(run.updated_at || run.created_at).toISOString(),
      };
    } catch (error) {
      diagnostics.push(`run ${candidate.id}: ${error.message}`);
    }
  }

  fail(
    `Missing trusted qualification for current published Waterline release ` +
      `${expectedWaterlineVersion}. ${diagnostics.slice(0, 5).join('; ')}`,
  );
}

function parseArgs(argv) {
  const result = {check: false, runId: null};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') {
      result.check = true;
    } else if (argument === '--run-id') {
      result.runId = Number(argv[index + 1]);
      index += 1;
    } else if (argument.startsWith('--run-id=')) {
      result.runId = Number(argument.slice('--run-id='.length));
    } else {
      fail(`Unknown argument: ${argument}`);
    }
  }
  if (result.runId !== null && (!Number.isInteger(result.runId) || result.runId < 1)) {
    fail('--run-id must be a positive integer');
  }
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const published = JSON.parse(fs.readFileSync(publishedVersionsPath, 'utf8'));
  const expectedWaterlineVersion = published?.artifacts?.waterline;
  if (typeof expectedWaterlineVersion !== 'string' || expectedWaterlineVersion.length === 0) {
    fail('published artifact authority has no current Waterline release');
  }
  const source = JSON.parse(fs.readFileSync(retainedEvidencePath, 'utf8'));
  const current = await findCurrentQualification(expectedWaterlineVersion, options);
  const expectedSource = mergeQualification(source, current.record, current.capturedAt);
  const expectedSourceText = `${JSON.stringify(expectedSource, null, 2)}\n`;
  const expectedPublicText = renderPublicComponentReleaseQualifications(expectedSource);

  if (options.check) {
    const drift = [];
    if (fs.readFileSync(retainedEvidencePath, 'utf8') !== expectedSourceText) {
      drift.push('scripts/component-release-qualification-retained-evidence.json');
    }
    if (fs.readFileSync(publicEvidencePath, 'utf8') !== expectedPublicText) {
      drift.push('static/public-component-release-qualifications.json');
    }
    if (drift.length > 0) {
      fail(
        `Current Waterline ${expectedWaterlineVersion} qualification is not retained in ` +
          `${drift.join(', ')}; run npm run refresh:waterline-release-qualification`,
      );
    }
    console.log(`Current Waterline ${expectedWaterlineVersion} qualification is retained.`);
    return;
  }

  fs.writeFileSync(retainedEvidencePath, expectedSourceText);
  fs.writeFileSync(publicEvidencePath, expectedPublicText);
  console.log(
    `Retained trusted Waterline ${expectedWaterlineVersion} qualification from ` +
      `run ${current.record.source.workflow_run.run_id}.`,
  );
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Waterline release qualification refresh failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DOCS_CONFIRMATION_STEP,
  QUALIFICATION_JOB,
  REQUIRED_PASSING_STEPS,
  buildQualificationRecord,
  fetchTagCommit,
  findCurrentQualification,
  mergeQualification,
  parseArtifactJson,
  validateArtifact,
  validateRun,
};
