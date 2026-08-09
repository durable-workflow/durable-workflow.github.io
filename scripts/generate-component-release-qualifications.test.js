#!/usr/bin/env node

const assert = require('assert');
const semver = require('semver');

const source = require('./component-release-qualification-retained-evidence.json');
const {
  PUBLIC_SCHEMA,
  buildPublicComponentReleaseQualifications,
} = require('./generate-component-release-qualifications');

const generated = buildPublicComponentReleaseQualifications(source);
const [retainedWaterline] = source.records;

assert.strictEqual(generated.schema, PUBLIC_SCHEMA);
assert.strictEqual(generated.outcome, 'pass');
assert.deepStrictEqual(
  generated.qualifications,
  source.records,
  'the generated public records must project the full retained identity authority exactly',
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
assert.deepStrictEqual(
  buildPublicComponentReleaseQualifications(stableSource).qualifications,
  stableSource.records,
  'stable versions derived from retained prerelease evidence must remain valid',
);

const ordinary2xSource = withReleasedVersions(version =>
  semver.inc(semver.inc(version, 'release'), 'minor'));
assert.deepStrictEqual(
  buildPublicComponentReleaseQualifications(ordinary2xSource).qualifications,
  ordinary2xSource.records,
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
