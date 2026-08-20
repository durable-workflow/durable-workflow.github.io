#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const semver = require('semver');

const repoRoot = path.join(__dirname, '..');
const sourcePath = path.join(
  repoRoot,
  'scripts',
  'component-release-qualification-retained-evidence.json',
);
const outputPath = path.join(
  repoRoot,
  'static',
  'public-component-release-qualifications.json',
);

const SOURCE_SCHEMA =
  'durable-workflow.docs.retained-component-release-qualification-evidence';
const PUBLIC_SCHEMA =
  'durable-workflow.docs.public-component-release-qualifications';
const QUALIFICATION_SCHEMA =
  'durable-workflow.exact-current-composer-qualification/v1';
const REQUIRED_PACKAGE_KEYS = Object.freeze(['sdk-php', 'waterline', 'workflow']);
const SOURCE_REPOSITORY_URL = 'https://github.com/durable-workflow/waterline';
const SOURCE_REPOSITORY = 'durable-workflow/waterline';
const QUALIFICATION_WORKFLOW_NAME = 'Release Docs Audit';
const QUALIFICATION_WORKFLOW_PATH = '.github/workflows/release-docs-audit.yml';
const QUALIFICATION_ARTIFACT_NAME = 'waterline-exact-composer-qualification';

function qualificationArtifactName(runId, runAttempt) {
  return `${QUALIFICATION_ARTIFACT_NAME}-${runId}-${runAttempt}.json`;
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value || {}).sort();
  const sortedExpected = [...expected].sort();

  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
    throw new Error(
      `${label} keys must be exactly ${sortedExpected.join(', ')}; got ${actual.join(', ')}`,
    );
  }
}

function assertReleased2xVersion(version, label) {
  const parsed = typeof version === 'string'
    ? semver.parse(version, {includePrerelease: true})
    : null;

  if (parsed === null || parsed.version !== version || parsed.major !== 2) {
    throw new Error(`${label} must be a valid released 2.x semantic version`);
  }
}

function validateTrustedCurrentSource(record, label) {
  assertExactKeys(
    record.source,
    ['artifact', 'release_commit', 'release_tag', 'repository_url', 'workflow_run'],
    `${label}.source`,
  );
  assertExactKeys(
    record.source.workflow_run,
    [
      'event',
      'head_sha',
      'name',
      'path',
      'qualification_outcome',
      'run_attempt',
      'run_conclusion',
      'run_id',
      'run_url',
    ],
    `${label}.source.workflow_run`,
  );
  assertExactKeys(
    record.source.artifact,
    ['artifact_id', 'digest', 'name', 'url'],
    `${label}.source.artifact`,
  );

  const run = record.source.workflow_run;
  if (
    run.name !== QUALIFICATION_WORKFLOW_NAME
    || run.path !== QUALIFICATION_WORKFLOW_PATH
    || run.event !== 'repository_dispatch'
    || typeof run.head_sha !== 'string'
    || !/^[0-9a-f]{40}$/.test(run.head_sha)
    || run.qualification_outcome !== 'pass'
    || !['failure', 'success'].includes(run.run_conclusion)
    || !Number.isInteger(run.run_id)
    || run.run_id < 1
    || !Number.isInteger(run.run_attempt)
    || run.run_attempt < 1
    || run.run_url !== `${SOURCE_REPOSITORY_URL}/actions/runs/${run.run_id}`
  ) {
    throw new Error(
      `${label}.source.workflow_run must bind the trusted publisher-completion qualification`,
    );
  }

  const artifact = record.source.artifact;
  const expectedArtifactName = qualificationArtifactName(run.run_id, run.run_attempt);
  if (
    artifact.name !== expectedArtifactName
    || !Number.isInteger(artifact.artifact_id)
    || artifact.artifact_id < 1
    || !/^sha256:[0-9a-f]{64}$/.test(artifact.digest)
    || artifact.url !==
      `${SOURCE_REPOSITORY_URL}/releases/download/${record.source.release_tag}/` +
        expectedArtifactName
  ) {
    throw new Error(
      `${label}.source.artifact must bind the immutable public qualification asset`,
    );
  }
}

function validateRecord(record, index) {
  const label = `retained component release qualification record ${index}`;
  const hasTrustedSource = Object.prototype.hasOwnProperty.call(
    record.source || {},
    'artifact',
  );
  assertExactKeys(record, ['component', 'id', 'qualification', 'source'], label);
  assertExactKeys(record.component, ['artifact', 'version'], `${label}.component`);
  assertExactKeys(
    record.qualification,
    ['outcome', 'packages', 'schema'],
    `${label}.qualification`,
  );
  if (hasTrustedSource) {
    validateTrustedCurrentSource(record, label);
  } else {
    assertExactKeys(
      record.source,
      ['release_commit', 'release_tag', 'repository_url', 'workflow_run'],
      `${label}.source`,
    );
    assertExactKeys(
      record.source.workflow_run,
      ['name', 'run_attempt', 'run_id', 'run_url'],
      `${label}.source.workflow_run`,
    );
  }
  assertExactKeys(
    record.qualification.packages,
    REQUIRED_PACKAGE_KEYS,
    `${label}.qualification.packages`,
  );

  if (record.component.artifact !== 'waterline') {
    throw new Error(`${label}.component.artifact must be waterline`);
  }
  assertReleased2xVersion(record.component.version, `${label}.component.version`);
  for (const artifact of REQUIRED_PACKAGE_KEYS) {
    assertReleased2xVersion(
      record.qualification.packages[artifact],
      `${label}.qualification.packages.${artifact}`,
    );
  }
  if (record.id !== `waterline-${record.component.version}-composer`) {
    throw new Error(`${label}.id must identify the Waterline version and Composer qualification`);
  }
  if (
    record.qualification.schema !== QUALIFICATION_SCHEMA
    || record.qualification.outcome !== 'pass'
  ) {
    throw new Error(`${label}.qualification must bind passing exact-current Composer evidence`);
  }
  if (
    record.qualification.packages.waterline !== record.component.version
    || record.source.release_tag !== record.component.version
  ) {
    throw new Error(`${label} must bind one exact Waterline release identity`);
  }
  if (
    record.source.repository_url !== SOURCE_REPOSITORY_URL
    || typeof record.source.release_commit !== 'string'
    || !/^[0-9a-f]{40}$/.test(record.source.release_commit)
  ) {
    throw new Error(`${label}.source must bind the public Waterline repository and release commit`);
  }

  const run = record.source.workflow_run;
  if (!hasTrustedSource && (
    run.name !== QUALIFICATION_WORKFLOW_NAME
    || !Number.isInteger(run.run_id)
    || run.run_id < 1
    || !Number.isInteger(run.run_attempt)
    || run.run_attempt < 1
    || run.run_url !== `${SOURCE_REPOSITORY_URL}/actions/runs/${run.run_id}`
  )) {
    throw new Error(`${label}.source.workflow_run must bind one public protected audit run`);
  }

  return Object.freeze({
    id: record.id,
    component: Object.freeze({...record.component}),
    qualification: Object.freeze({
      schema: record.qualification.schema,
      outcome: record.qualification.outcome,
      packages: Object.freeze({...record.qualification.packages}),
    }),
    source: Object.freeze({
      repository_url: record.source.repository_url,
      release_tag: record.source.release_tag,
      release_commit: record.source.release_commit,
      workflow_run: Object.freeze({...run}),
      ...(hasTrustedSource ? {artifact: Object.freeze({...record.source.artifact})} : {}),
    }),
  });
}

function buildPublicComponentReleaseQualifications(source) {
  const isCurrentSchema = source.schema_version === 2;
  assertExactKeys(source, isCurrentSchema
    ? [
      'current_qualification_id',
      'records',
      'retained_evidence_captured_at',
      'schema',
      'schema_version',
    ]
    : ['records', 'retained_evidence_captured_at', 'schema', 'schema_version'],
  'retained component release qualification evidence');
  if (source.schema !== SOURCE_SCHEMA || ![1, 2].includes(source.schema_version)) {
    throw new Error('retained component release qualification evidence schema is invalid');
  }
  if (
    typeof source.retained_evidence_captured_at !== 'string'
    || Number.isNaN(Date.parse(source.retained_evidence_captured_at))
    || new Date(source.retained_evidence_captured_at).toISOString()
      !== source.retained_evidence_captured_at
  ) {
    throw new Error('retained component release qualification capture time is invalid');
  }
  if (!Array.isArray(source.records) || source.records.length === 0) {
    throw new Error('retained component release qualification evidence must contain records');
  }

  if (
    isCurrentSchema
    && (typeof source.current_qualification_id !== 'string'
      || source.current_qualification_id.length === 0)
  ) {
    throw new Error('retained component release qualification evidence has no current record');
  }

  const currentQualificationId = isCurrentSchema ? source.current_qualification_id : null;
  const records = source.records.map(validateRecord);
  const ids = records.map(record => record.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('retained component release qualification record ids must be unique');
  }
  if (isCurrentSchema && !ids.includes(currentQualificationId)) {
    throw new Error('retained component release qualification current record is absent');
  }
  const currentRecord = isCurrentSchema
    ? records.find(record => record.id === currentQualificationId)
    : null;
  if (isCurrentSchema && !currentRecord.source.artifact) {
    throw new Error(
      'retained component release qualification current record is not trusted evidence',
    );
  }

  const publicRecords = isCurrentSchema
    ? records.map(record => Object.freeze({
      ...record,
      evidence_role: record.id === currentQualificationId ? 'current' : 'historical',
    }))
    : records;
  return {
    schema: PUBLIC_SCHEMA,
    schema_version: 1,
    outcome: 'pass',
    retained_evidence_captured_at: source.retained_evidence_captured_at,
    ...(isCurrentSchema ? {
      current_qualification_id: currentQualificationId,
      current_release: currentRecord.component,
    } : {}),
    qualifications: publicRecords,
  };
}

function currentQualificationSummary(source) {
  const evidence = buildPublicComponentReleaseQualifications(source);
  if (!evidence.current_qualification_id) {
    throw new Error(
      'Current Waterline release qualification is missing; wait for the trusted ' +
        'publisher-completion run and ingest its artifact',
    );
  }
  const record = evidence.qualifications.find(
    qualification => qualification.id === evidence.current_qualification_id,
  );
  const run = record.source.workflow_run;
  const artifact = record.source.artifact;

  return Object.freeze({
    repository: SOURCE_REPOSITORY,
    workflow_name: run.name,
    workflow_path: run.path,
    event: run.event,
    run_id: run.run_id,
    run_attempt: run.run_attempt,
    run_url: run.run_url,
    release_tag: record.source.release_tag,
    release_commit: record.source.release_commit,
    qualification_outcome: run.qualification_outcome,
    packages: Object.freeze({...record.qualification.packages}),
    artifact_id: artifact.artifact_id,
    artifact_name: artifact.name,
    artifact_digest: artifact.digest,
  });
}

function renderPublicComponentReleaseQualifications(source) {
  return `${JSON.stringify(buildPublicComponentReleaseQualifications(source), null, 2)}\n`;
}

function readTrackedPublicComponentReleaseQualifications() {
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const expected = buildPublicComponentReleaseQualifications(source);
  if (!fs.existsSync(outputPath)) {
    throw new Error('Missing static/public-component-release-qualifications.json');
  }
  const tracked = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  if (JSON.stringify(tracked) !== JSON.stringify(expected)) {
    throw new Error(
      'static/public-component-release-qualifications.json is stale against retained evidence',
    );
  }

  return Object.freeze({
    ...tracked,
    qualifications: Object.freeze(tracked.qualifications.map(record => Object.freeze(record))),
  });
}

function main() {
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const rendered = renderPublicComponentReleaseQualifications(source);

  if (process.argv.includes('--check')) {
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== rendered) {
      throw new Error(
        'static/public-component-release-qualifications.json is stale; run ' +
          'npm run generate:component-release-qualifications',
      );
    }
    console.log('Tracked component release qualification view is current.');
    return;
  }

  fs.writeFileSync(outputPath, rendered, 'utf8');
  console.log('Generated static/public-component-release-qualifications.json.');
}

if (require.main === module) {
  main();
}

module.exports = {
  PUBLIC_SCHEMA,
  QUALIFICATION_SCHEMA,
  QUALIFICATION_ARTIFACT_NAME,
  QUALIFICATION_WORKFLOW_NAME,
  QUALIFICATION_WORKFLOW_PATH,
  SOURCE_SCHEMA,
  buildPublicComponentReleaseQualifications,
  currentQualificationSummary,
  qualificationArtifactName,
  readTrackedPublicComponentReleaseQualifications,
  renderPublicComponentReleaseQualifications,
};
