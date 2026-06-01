const assert = require('assert');

const source = require('./public-artifact-versions.json');
const { readArtifactVersions } = require('./public-artifact-versions');

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
  ['waterline', '2.0.0-beta.69', /artifacts\.waterline must use Waterline version format 2\.0\.0-alpha\.N/],
  ['workflow', '2.0.0-alpha', /artifacts\.workflow must use Workflow version format 2\.0\.0-alpha\.N/],
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
