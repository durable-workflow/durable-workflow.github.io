const assert = require('assert');

const source = require('./public-artifact-versions.json');
const {
  buildArtifactPinPatterns,
  buildArtifactPins,
  readArtifactVersions,
} = require('./public-artifact-versions');

function cloneSource() {
  return JSON.parse(JSON.stringify(source));
}

function expectFailure(label, mutate, expectedMessage) {
  const candidate = cloneSource();
  mutate(candidate);

  assert.throws(
    () => readArtifactVersions(candidate),
    expectedMessage,
    label
  );
}

assert.deepStrictEqual(readArtifactVersions(source), source.artifacts);

function extractObservedPins(definition, content) {
  const pattern = new RegExp(definition.pattern.source, definition.pattern.flags);

  return [...content.matchAll(pattern)]
    .map(match => match.slice(1).find(Boolean))
    .filter(Boolean);
}

function assertComposerPrereleasePins(artifact, version, stability) {
  const candidate = cloneSource();
  candidate.artifacts[artifact] = version;
  const versions = readArtifactVersions(candidate);
  const pins = buildArtifactPins(versions);
  const pinName = `${artifact}ComposerPackage`;

  assert.strictEqual(
    pins[pinName],
    `durable-workflow/${artifact}:${version}@${stability}`,
    `${artifact} Composer pin must derive stability from ${version}`
  );

  const pattern = buildArtifactPinPatterns(versions)
    .find(definition => definition.category === `${artifact}_artifact_pin`);

  assert(pattern, `${artifact} pin check pattern must exist`);
  assert.strictEqual(pattern.expected, `${version}@${stability}`);
  assert.deepStrictEqual(extractObservedPins(pattern, pins[pinName]), [`${version}@${stability}`]);
  const staleStability = stability === 'alpha' ? 'beta' : 'alpha';
  assert.notStrictEqual(
    extractObservedPins(pattern, `durable-workflow/${artifact}:${version}@${staleStability}`)[0],
    pattern.expected,
    `${artifact} pin checks must reject a stale ${staleStability} stability suffix for ${version}`
  );
}

assertComposerPrereleasePins('waterline', '2.0.0-alpha.70', 'alpha');
assertComposerPrereleasePins('workflow', '2.0.0-alpha.189', 'alpha');
assertComposerPrereleasePins('waterline', '2.0.0-beta.1', 'beta');
assertComposerPrereleasePins('workflow', '2.0.0-beta.2', 'beta');

expectFailure(
  'rejects missing artifacts',
  candidate => {
    delete candidate.artifacts.cli;
  },
  /must define artifacts\.cli/
);

expectFailure(
  'rejects unknown artifacts',
  candidate => {
    candidate.artifacts.example = '1.0.0';
  },
  /contains unknown artifacts: example/
);

const malformedVersions = [
  ['cli', '0.2.72', /artifacts\.cli must use CLI version format 0\.1\.N/],
  ['sdk-python', '0.5.84', /artifacts\.sdk-python must use Python SDK version format 0\.4\.N/],
  ['server', 'latest', /artifacts\.server must use server version format 0\.2\.N/],
  ['waterline', '2.0.0', /artifacts\.waterline must use Waterline version format 2\.0\.0-alpha\.N or 2\.0\.0-beta\.N/],
  ['waterline', '2.0.0-gamma.1', /artifacts\.waterline must use Waterline version format 2\.0\.0-alpha\.N or 2\.0\.0-beta\.N/],
  ['workflow', '2.0.0-alpha', /artifacts\.workflow must use Workflow version format 2\.0\.0-alpha\.N or 2\.0\.0-beta\.N/],
  ['workflow', '2.0.0', /artifacts\.workflow must use Workflow version format 2\.0\.0-alpha\.N or 2\.0\.0-beta\.N/],
];

for (const [artifact, version, expectedMessage] of malformedVersions) {
  expectFailure(
    `rejects malformed ${artifact} version`,
    candidate => {
      candidate.artifacts[artifact] = version;
    },
    expectedMessage
  );
}

for (const artifact of Object.keys(source.artifacts)) {
  expectFailure(
    `rejects surrounding whitespace for ${artifact}`,
    candidate => {
      candidate.artifacts[artifact] = ` ${candidate.artifacts[artifact]} `;
    },
    new RegExp(`artifacts\\.${artifact} must not contain surrounding whitespace`)
  );
}

console.log('Public artifact version source validation passed');
