#!/usr/bin/env node

const assert = require('assert');
const semver = require('semver');

const source = require('./component-release-qualification-retained-evidence.json');
const {
  PUBLIC_SCHEMA,
  buildPublicComponentReleaseQualifications,
} = require('./generate-component-release-qualifications');
const {
  buildComponentReleaseQualificationProjection,
} = require('./generate-docs-page-release-audit');
const {
  assertNoRepoLocalReferences,
} = require('./docs-audit-public-references');

const generated = buildPublicComponentReleaseQualifications(source);
const [retainedWaterline] = source.records;

function expectedPublicRecords(retainedSource) {
  if (retainedSource.schema_version !== 2) {
    return retainedSource.records;
  }

  return retainedSource.records.map(record => ({
    ...record,
    evidence_role:
      record.id === retainedSource.current_qualification_id ? 'current' : 'historical',
  }));
}

function assertExactPublicProjection(
  actual,
  retainedSource,
  message = 'generated public records may add only the derived evidence role',
) {
  assert.deepStrictEqual(actual, expectedPublicRecords(retainedSource), message);
}

assert.strictEqual(generated.schema, PUBLIC_SCHEMA);
assert.strictEqual(generated.outcome, 'pass');
assertExactPublicProjection(
  generated.qualifications,
  source,
  'generated public records may add only the derived evidence role to retained identities',
);
assert.strictEqual(
  generated.qualifications.find(record => record.id === source.current_qualification_id)
    .evidence_role,
  'current',
  'the retained current qualification must project as current evidence',
);
assert(
  generated.qualifications
    .filter(record => record.id !== source.current_qualification_id)
    .every(record => record.evidence_role === 'historical'),
  'retained superseded qualifications must project as historical evidence',
);

const identityDrift = structuredClone(generated.qualifications);
identityDrift[0].source.release_commit = 'f'.repeat(40);
assert.throws(
  () => assertExactPublicProjection(identityDrift, source),
  /generated public records may add only the derived evidence role/,
  'the public projection comparison must reject retained identity drift',
);

const unexpectedProjectionField = structuredClone(generated.qualifications);
unexpectedProjectionField[0].unexpected = true;
assert.throws(
  () => assertExactPublicProjection(unexpectedProjectionField, source),
  /generated public records may add only the derived evidence role/,
  'the public projection comparison must reject fields other than evidence_role',
);

const aggregateProjection = buildComponentReleaseQualificationProjection(generated);
assert.doesNotThrow(
  () => assertNoRepoLocalReferences(aggregateProjection, 'aggregate release audit'),
  'the aggregate release audit must not expose repository-local paths',
);
const retainedCurrent = source.records.find(
  record => record.id === source.current_qualification_id,
);
const aggregateCurrent = aggregateProjection.qualifications.find(
  record => record.id === source.current_qualification_id,
);
assert.strictEqual(
  aggregateCurrent.source.workflow_run.workflow_source_url,
  `${retainedCurrent.source.repository_url}/blob/${retainedCurrent.source.release_commit}/` +
    retainedCurrent.source.workflow_run.path,
  'the aggregate workflow URL must bind the retained repository, release commit, and path',
);
assert.strictEqual(
  aggregateCurrent.source.artifact.url,
  retainedCurrent.source.artifact.url,
  'the aggregate projection must retain the immutable qualification artifact URL',
);

function withReleasedVersions(versionTransform) {
  const candidate = structuredClone(source);
  const [record] = candidate.records;

  for (const artifact of Object.keys(record.qualification.packages)) {
    record.qualification.packages[artifact] = versionTransform(
      record.qualification.packages[artifact],
    );
  }

  const waterlineVersion = record.qualification.packages.waterline;
  record.id = `waterline-${waterlineVersion}-composer`;
  record.component.version = waterlineVersion;
  record.source.release_tag = waterlineVersion;

  return candidate;
}

const stableSource = withReleasedVersions(version => semver.inc(version, 'release'));
assertExactPublicProjection(
  buildPublicComponentReleaseQualifications(stableSource).qualifications,
  stableSource,
  'stable versions derived from retained prerelease evidence must remain valid',
);

const ordinary2xSource = withReleasedVersions(version =>
  semver.inc(semver.inc(version, 'release'), 'minor'));
assertExactPublicProjection(
  buildPublicComponentReleaseQualifications(ordinary2xSource).qualifications,
  ordinary2xSource,
  'ordinary released 2.x versions derived from retained evidence must remain valid',
);

const staleTuple = structuredClone(source);
staleTuple.records[0].qualification.packages.waterline =
  retainedWaterline.component.version.replace(
    /(\d+)$/,
    sequence => String(Number(sequence) + 1),
  );
assert.throws(
  () => buildPublicComponentReleaseQualifications(staleTuple),
  /one exact Waterline release identity/,
  'a tuple for a different Waterline release must fail closed',
);

const unboundRun = structuredClone(source);
unboundRun.records[0].source.workflow_run.run_url = [
  retainedWaterline.source.repository_url,
  'actions',
  'runs',
  retainedWaterline.source.workflow_run.run_id + 1,
].join('/');
assert.throws(
  () => buildPublicComponentReleaseQualifications(unboundRun),
  /one public protected audit run/,
  'the retained evidence must bind its exact public workflow run',
);

console.log('Component release qualification generation checks passed.');
