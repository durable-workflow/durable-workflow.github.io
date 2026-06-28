const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = require('./public-artifact-versions.json');
const {
  buildArtifactPinPatterns,
  buildArtifactPins,
  readArtifactVersions,
} = require('./public-artifact-versions');
const {
  artifactVersionsSource,
  compatibilityHistoryRow,
  parseRegistryNextLink,
  parseCompatibilityHistoryRow,
  quickstartExecutionContractSource,
  replaceCompatibilityHistoryTopRow,
  selectServerRegistryVersion,
  selectLatestVersion,
} = require('./refresh-public-artifact-versions');

const quickstartContractPath = path.join(__dirname, '..', 'static', 'quickstart-execution-contract.json');

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
assert.strictEqual(
  artifactVersionsSource(source.artifacts),
  `${JSON.stringify(source, null, 2)}\n`,
  'public artifact refresh output must preserve the canonical JSON shape'
);

const currentArtifactPins = buildArtifactPins(source.artifacts);
assert.strictEqual(currentArtifactPins.cliVersion, source.artifacts.cli);
assert.strictEqual(currentArtifactPins.pythonSdkVersion, source.artifacts['sdk-python']);
assert.strictEqual(currentArtifactPins.serverVersion, source.artifacts.server);
assert.strictEqual(currentArtifactPins.workflowVersion, source.artifacts.workflow);
assert.strictEqual(currentArtifactPins.waterlineVersion, source.artifacts.waterline);

const currentQuickstartContract = fs.readFileSync(quickstartContractPath, 'utf8');
assert.strictEqual(
  quickstartExecutionContractSource(currentQuickstartContract, source.artifacts),
  currentQuickstartContract,
  'quickstart execution contract must already match current public artifact pins'
);

let staleQuickstartContract = currentQuickstartContract;
for (const [currentVersion, staleVersion] of [
  [source.artifacts.cli, '0.1.81'],
  [source.artifacts['sdk-python'], '0.4.90'],
  [source.artifacts.server, '0.2.512'],
  [source.artifacts.workflow, '2.0.0-alpha.223'],
  [source.artifacts.waterline, '2.0.0-alpha.110'],
]) {
  staleQuickstartContract = staleQuickstartContract.replaceAll(currentVersion, staleVersion);
}

assert.strictEqual(
  quickstartExecutionContractSource(staleQuickstartContract, source.artifacts),
  currentQuickstartContract,
  'public artifact refresh must regenerate static/quickstart-execution-contract.json pins'
);

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
assertComposerPrereleasePins('workflow', '2.0.0-alpha.200', 'alpha');
assertComposerPrereleasePins('waterline', '2.0.0-beta.1', 'beta');
assertComposerPrereleasePins('workflow', '2.0.0-beta.2', 'beta');

assert.strictEqual(
  selectLatestVersion('server', ['0.2.9', '0.2.10', 'latest', '0.2.8'], 'test candidates'),
  '0.2.10',
  'published server versions must sort numerically'
);

assert.strictEqual(
  selectLatestVersion('workflow', ['2.0.0-alpha.199', '2.0.0-beta.1', '2.0.0-alpha.201'], 'test candidates'),
  '2.0.0-beta.1',
  'Composer beta prereleases must rank after alpha prereleases'
);

assert.strictEqual(
  parseRegistryNextLink(
    '</v2/durable-workflow/server/tags/list?last=0.2.99&n=100>; rel="next"',
    'https://ghcr.io/v2/durable-workflow/server/tags/list?n=100'
  ),
  'https://ghcr.io/v2/durable-workflow/server/tags/list?last=0.2.99&n=100',
  'GHCR pagination links must resolve against the registry origin'
);

assert.strictEqual(
  selectServerRegistryVersion([
    { label: 'Docker Hub', image: 'durableworkflow/server', version: source.artifacts.server },
    { label: 'GHCR', image: 'ghcr.io/durable-workflow/server', version: source.artifacts.server },
  ]),
  source.artifacts.server,
  'server registry agreement must select the shared version'
);

assert.throws(
  () => selectServerRegistryVersion([
    { label: 'Docker Hub', image: 'durableworkflow/server', version: '0.2.10' },
    { label: 'GHCR', image: 'ghcr.io/durable-workflow/server', version: '0.2.9' },
  ]),
  /Published server container registries disagree:[\s\S]*Docker Hub durableworkflow\/server:0\.2\.10[\s\S]*GHCR ghcr\.io\/durable-workflow\/server:0\.2\.9/,
  'server registry disagreement must fail before selecting a docs tuple'
);

const currentHistoryRow = compatibilityHistoryRow(source.artifacts, '2026-06-11');
const parsedHistoryRow = parseCompatibilityHistoryRow(currentHistoryRow);
assert.strictEqual(parsedHistoryRow.server, source.artifacts.server);
assert.strictEqual(parsedHistoryRow.cli, source.artifacts.cli);
assert.strictEqual(parsedHistoryRow['sdk-python'], source.artifacts['sdk-python']);
assert.strictEqual(parsedHistoryRow.workflow, source.artifacts.workflow);
assert.strictEqual(parsedHistoryRow.waterline, source.artifacts.waterline);

const staleHistoryDoc = [
  '## Version History',
  '',
  '| Date | Server | CLI | Python SDK | Workflow | Waterline | Notes |',
  '|------|--------|-----|------------|--------------|-----------|-------|',
  '| 2026-06-10 | 0.2.364 | 0.1.77 | 0.4.85 | 2.0.0-alpha.200 | 2.0.0-alpha.84 | Previous release-audit tuple. |',
  '| 2026-06-05 | 0.2.341 | 0.1.77 | 0.4.85 | 2.0.0-alpha.199 | 2.0.0-alpha.83 | Older release-audit tuple. |',
  '',
].join('\n');
const refreshedHistoryDoc = replaceCompatibilityHistoryTopRow(staleHistoryDoc, source.artifacts, '2026-06-11');
assert.strictEqual(refreshedHistoryDoc.changed, true);
assert(refreshedHistoryDoc.content.includes(currentHistoryRow));
assert(refreshedHistoryDoc.content.includes('| 2026-06-05 | 0.2.341 |'));

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
