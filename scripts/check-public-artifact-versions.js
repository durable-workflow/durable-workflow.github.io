const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const source = require('./public-artifact-versions.json');
const {
  ARTIFACT_PINS,
  ARTIFACT_DISTRIBUTION_SURFACES,
  buildArtifactPinPatterns,
  buildArtifactPins,
  pypiRegistryVersion,
  readArtifactVersions,
} = require('./public-artifact-versions');
const {
  PUBLISHED_ARTIFACT_SOURCES,
  PUBLIC_ARTIFACT_TUPLE_FILES,
  artifactVersionsSource,
  changedPublicArtifactTupleFiles,
  generatedPublicArtifactTupleSources,
  parseRegistryNextLink,
  quickstartExecutionContractSource,
  resolvePackagistVersion,
  resolvePublishedWorkflowAuthority,
  selectLatestCompleteCliRelease,
  selectLatestCratesIoVersion,
  selectServerRegistryVersion,
  selectLatestVersion,
  sha256,
  workflowAuthorityLockSource,
  workflowAuthorityManifestUrl,
  writePublicArtifactTupleSources,
} = require('./refresh-public-artifact-versions');

const repoRoot = path.join(__dirname, '..');
const quickstartContractPath = path.join(__dirname, '..', 'static', 'quickstart-execution-contract.json');

function cloneSource() {
  return JSON.parse(JSON.stringify(source));
}

function artifactVersionsAt(version) {
  const candidate = cloneSource();
  for (const artifact of Object.keys(candidate.artifacts)) {
    candidate.artifacts[artifact] = version;
  }
  return readArtifactVersions(candidate);
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
assert.strictEqual(ARTIFACT_PINS.productTrainVersion, source.artifacts.server);
assert.strictEqual(
  ARTIFACT_PINS.pythonRegistryVersion,
  pypiRegistryVersion(source.artifacts['sdk-python']),
);
assert.strictEqual(pypiRegistryVersion('2.0.0-alpha.17'), '2.0.0a17');
assert.strictEqual(pypiRegistryVersion('2.0.0-beta.17'), '2.0.0b17');
assert.strictEqual(pypiRegistryVersion('2.0.0-rc.4'), '2.0.0rc4');

const releaseCandidatePins = buildArtifactPins(artifactVersionsAt('2.0.0-rc.4'));
assert.strictEqual(releaseCandidatePins.productTrainVersion, '2.0.0-rc.4');
assert.strictEqual(releaseCandidatePins.pythonRegistryVersion, '2.0.0rc4');
assert.strictEqual(
  releaseCandidatePins.phpSdkComposerPackage,
  'durable-workflow/sdk:2.0.0-rc.4@rc',
);
assert.strictEqual(currentArtifactPins.cliVersion, source.artifacts.cli);
assert.strictEqual(currentArtifactPins.phpSdkVersion, source.artifacts['sdk-php']);
assert.strictEqual(
  currentArtifactPins.phpSdkComposerPackage,
  `durable-workflow/sdk:${source.artifacts['sdk-php']}@beta`,
);
assert.strictEqual(
  currentArtifactPins.phpSdkComposerInstallCommand,
  `composer require durable-workflow/sdk:${source.artifacts['sdk-php']}@beta`,
);
assert.strictEqual(currentArtifactPins.pythonSdkVersion, source.artifacts['sdk-python']);
assert.strictEqual(currentArtifactPins.rustSdkVersion, source.artifacts['sdk-rust']);
assert.strictEqual(currentArtifactPins.serverVersion, source.artifacts.server);
assert.strictEqual(currentArtifactPins.workflowVersion, source.artifacts.workflow);
assert.strictEqual(currentArtifactPins.waterlineVersion, source.artifacts.waterline);
assert.deepStrictEqual(
  ARTIFACT_DISTRIBUTION_SURFACES['sdk-php'],
  [
    {
      surface: 'packagist_package',
      package: 'durable-workflow/sdk',
      version: source.artifacts['sdk-php'],
      url: 'https://packagist.org/packages/durable-workflow/sdk',
    },
    {
      surface: 'source_repository',
      repository: 'durable-workflow/sdk-php',
      url: 'https://github.com/durable-workflow/sdk-php',
    },
    {
      surface: 'api_documentation',
      url: 'https://php.durable-workflow.com/',
    },
  ],
  'PHP SDK distribution surfaces must expose the package, source repository, and API documentation'
);
assert.deepStrictEqual(
  ARTIFACT_DISTRIBUTION_SURFACES.server.map(surface => surface.reference),
  [
    `durableworkflow/server:${source.artifacts.server}`,
    `ghcr.io/durable-workflow/server:${source.artifacts.server}`,
  ],
  'server distribution surfaces must use the current Docker Hub and GHCR tag'
);
assert.deepStrictEqual(
  ARTIFACT_DISTRIBUTION_SURFACES['sdk-rust'],
  [
    {
      surface: 'crates_io_package',
      package: 'durable-workflow',
      version: source.artifacts['sdk-rust'],
      url: 'https://crates.io/crates/durable-workflow',
    },
    {
      surface: 'source_repository',
      repository: 'durable-workflow/sdk-rust',
      url: 'https://github.com/durable-workflow/sdk-rust',
    },
    {
      surface: 'api_documentation',
      url: 'https://rust.durable-workflow.com/',
    },
  ],
  'Rust SDK distribution surfaces must expose the crate, source repository, and API documentation'
);

const currentQuickstartContract = fs.readFileSync(quickstartContractPath, 'utf8');
assert.strictEqual(
  quickstartExecutionContractSource(currentQuickstartContract, source.artifacts),
  currentQuickstartContract,
  'quickstart execution contract must already match current public artifact pins'
);

let staleQuickstartContract = currentQuickstartContract;
for (const [currentVersion, staleVersion] of [
  [source.artifacts.cli, '2.0.0-beta.1'],
]) {
  staleQuickstartContract = staleQuickstartContract.replaceAll(currentVersion, staleVersion);
}

assert.strictEqual(
  quickstartExecutionContractSource(staleQuickstartContract, source.artifacts),
  currentQuickstartContract,
  'public artifact refresh must regenerate static/quickstart-execution-contract.json pins'
);

const currentTupleSources = Object.fromEntries(PUBLIC_ARTIFACT_TUPLE_FILES.map(file => [
  file,
  fs.readFileSync(path.join(repoRoot, file), 'utf8'),
]));
const successorWorkflowVersion = source.artifacts.workflow.replace(
  /\.(\d+)$/,
  (_, sequence) => `.${Number(sequence) + 1}`,
);
const successorVersions = {
  ...source.artifacts,
  workflow: successorWorkflowVersion,
};
const currentWorkflowManifest = currentTupleSources['static/sdk-neutrality-contract.json'];
const unchangedManifestTuple = generatedPublicArtifactTupleSources(
  currentTupleSources,
  successorVersions,
  '2026-07-14',
  currentWorkflowManifest,
);
const unchangedManifestFiles = changedPublicArtifactTupleFiles(
  currentTupleSources,
  unchangedManifestTuple,
);

assert.deepStrictEqual(
  unchangedManifestFiles,
  [
    'scripts/public-artifact-versions.json',
    'static/quickstart-execution-contract.json',
    'scripts/workflow-sdk-neutrality-authority-lock.json',
  ],
  'a successor Workflow prerelease with unchanged authority bytes must refresh the tuple and versioned lock',
);
assert.strictEqual(
  unchangedManifestTuple['static/sdk-neutrality-contract.json'],
  currentWorkflowManifest,
  'unchanged Workflow authority bytes must remain byte-equivalent in the public mirror',
);
const unchangedManifestLock = JSON.parse(
  unchangedManifestTuple['scripts/workflow-sdk-neutrality-authority-lock.json'],
);
assert.strictEqual(unchangedManifestLock.workflow_ref, successorWorkflowVersion);
assert.strictEqual(unchangedManifestLock.sha256, sha256(currentWorkflowManifest));

const changedWorkflowManifest = `${currentWorkflowManifest}\n`;
const changedManifestTuple = generatedPublicArtifactTupleSources(
  currentTupleSources,
  successorVersions,
  '2026-07-14',
  changedWorkflowManifest,
);
assert.deepStrictEqual(
  changedPublicArtifactTupleFiles(currentTupleSources, changedManifestTuple),
  PUBLIC_ARTIFACT_TUPLE_FILES,
  'a successor Workflow prerelease with changed authority bytes must refresh every generated tuple file',
);
assert.strictEqual(
  changedManifestTuple['static/sdk-neutrality-contract.json'],
  changedWorkflowManifest,
  'the public mirror must preserve the exact published Workflow manifest bytes',
);
const changedManifestLock = JSON.parse(
  changedManifestTuple['scripts/workflow-sdk-neutrality-authority-lock.json'],
);
assert.strictEqual(changedManifestLock.workflow_ref, successorWorkflowVersion);
assert.strictEqual(changedManifestLock.sha256, sha256(changedWorkflowManifest));
assert.notStrictEqual(changedManifestLock.sha256, unchangedManifestLock.sha256);

const tupleWriteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'public-artifact-tuple-write-'));
try {
  const tuplePaths = Object.fromEntries(PUBLIC_ARTIFACT_TUPLE_FILES.map(file => [
    file,
    path.join(tupleWriteRoot, file),
  ]));
  const originalSources = Object.fromEntries(PUBLIC_ARTIFACT_TUPLE_FILES.map(file => [
    file,
    `original ${file}\n`,
  ]));
  const desiredSources = Object.fromEntries(PUBLIC_ARTIFACT_TUPLE_FILES.map(file => [
    file,
    `replacement ${file}\n`,
  ]));

  for (const file of PUBLIC_ARTIFACT_TUPLE_FILES) {
    fs.mkdirSync(path.dirname(tuplePaths[file]), {recursive: true});
    fs.writeFileSync(tuplePaths[file], originalSources[file]);
  }

  const faultingFileSystem = Object.create(fs);
  let renameCalls = 0;
  faultingFileSystem.renameSync = (sourcePath, targetPath) => {
    renameCalls += 1;
    if (renameCalls === 2) {
      throw new Error('injected tuple promotion failure');
    }
    fs.renameSync(sourcePath, targetPath);
  };

  assert.throws(
    () => writePublicArtifactTupleSources(
      desiredSources,
      PUBLIC_ARTIFACT_TUPLE_FILES,
      {fileSystem: faultingFileSystem, tuplePaths},
    ),
    /injected tuple promotion failure/,
    'a mid-promotion failure must be reported to the tuple refresher',
  );
  assert(renameCalls > 2, 'tuple write failure must invoke rollback renames');

  for (const file of PUBLIC_ARTIFACT_TUPLE_FILES) {
    assert.strictEqual(
      fs.readFileSync(tuplePaths[file], 'utf8'),
      originalSources[file],
      `tuple write rollback must restore ${file}`,
    );
    assert.deepStrictEqual(
      fs.readdirSync(path.dirname(tuplePaths[file])).filter(name => name.includes('.tuple-')),
      [],
      `tuple write rollback must clean temporary files beside ${file}`,
    );
  }

  writePublicArtifactTupleSources(
    desiredSources,
    PUBLIC_ARTIFACT_TUPLE_FILES,
    {tuplePaths},
  );
  for (const file of PUBLIC_ARTIFACT_TUPLE_FILES) {
    assert.strictEqual(fs.readFileSync(tuplePaths[file], 'utf8'), desiredSources[file]);
  }
} finally {
  fs.rmSync(tupleWriteRoot, {recursive: true, force: true});
}

async function assertWorkflowRegistryAuthorityResolution() {
  const selectedReference = 'a'.repeat(40);
  const olderReference = 'b'.repeat(40);
  const requestedUrls = [];
  const packagistResponse = {
    packages: {
      [PUBLISHED_ARTIFACT_SOURCES.workflow.packageName]: [
        {
          version: source.artifacts.workflow,
          dist: {type: 'zip'},
          source: {type: 'git', reference: olderReference},
        },
        {
          version: successorWorkflowVersion,
          dist: {type: 'zip'},
          source: {type: 'git', reference: selectedReference},
        },
      ],
    },
  };
  const authority = await resolvePublishedWorkflowAuthority(
    PUBLISHED_ARTIFACT_SOURCES.workflow,
    {
      requestJson: async url => {
        assert.strictEqual(url, PUBLISHED_ARTIFACT_SOURCES.workflow.url);
        return packagistResponse;
      },
      requestText: async url => {
        requestedUrls.push(url);
        return changedWorkflowManifest;
      },
    },
  );

  assert.strictEqual(authority.version, successorWorkflowVersion);
  assert.strictEqual(authority.sourceReference, selectedReference);
  assert.strictEqual(authority.manifestSource, changedWorkflowManifest);
  assert.deepStrictEqual(
    requestedUrls,
    [
      `https://raw.githubusercontent.com/durable-workflow/workflow/${selectedReference}/resources/sdk-neutrality-contract.json`,
    ],
    'Workflow authority refresh must fetch by the selected Packagist source.reference SHA',
  );
  assert.strictEqual(requestedUrls[0], workflowAuthorityManifestUrl(selectedReference));
  assert(!requestedUrls[0].includes(successorWorkflowVersion));
  assert.strictEqual(
    JSON.parse(workflowAuthorityLockSource(authority.version, authority.manifestSource)).workflow_ref,
    successorWorkflowVersion,
    'the authority lock must retain the selected public package version instead of its source SHA',
  );

  const phpSdkRelease = await resolvePackagistVersion(
    PUBLISHED_ARTIFACT_SOURCES['sdk-php'],
    {
      requestJson: async url => {
        assert.strictEqual(url, PUBLISHED_ARTIFACT_SOURCES['sdk-php'].url);
        return {
          packages: {
            [PUBLISHED_ARTIFACT_SOURCES['sdk-php'].packageName]: [
              {version: '2.0.0-beta.1', dist: {type: 'zip'}},
              {version: source.artifacts['sdk-php'], dist: {type: 'zip'}},
            ],
          },
        };
      },
    },
  );
  assert.strictEqual(
    phpSdkRelease.version,
    source.artifacts['sdk-php'],
    'PHP SDK artifact resolution must select the latest published Packagist version',
  );

  let invalidReferenceFetches = 0;
  await assert.rejects(
    () => resolvePublishedWorkflowAuthority(
      PUBLISHED_ARTIFACT_SOURCES.workflow,
      {
        requestJson: async () => ({
          packages: {
            [PUBLISHED_ARTIFACT_SOURCES.workflow.packageName]: [{
              version: successorWorkflowVersion,
              source: {type: 'git', reference: 'not-a-full-commit-sha'},
            }],
          },
        }),
        requestText: async () => {
          invalidReferenceFetches += 1;
          return changedWorkflowManifest;
        },
      },
    ),
    /must include a full source\.reference commit SHA/,
    'Workflow authority refresh must reject invalid selected source metadata',
  );
  assert.strictEqual(invalidReferenceFetches, 0);
}

function extractObservedPins(definition, content) {
  const pattern = new RegExp(definition.pattern.source, definition.pattern.flags);

  return [...content.matchAll(pattern)]
    .map(match => match.slice(1).find(Boolean))
    .filter(Boolean);
}

function assertComposerPrereleasePins(artifact, version, stability) {
  const versions = artifactVersionsAt(version);
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

assertComposerPrereleasePins('waterline', '2.0.0-alpha.201', 'alpha');
assertComposerPrereleasePins('workflow', '2.0.0-beta.3', 'beta');
assertComposerPrereleasePins('workflow', '2.0.0-rc.4', 'rc');

assert.strictEqual(
  selectLatestVersion('server', ['2.0.0-beta.9', '2.0.0-beta.10', 'latest'], 'test candidates'),
  '2.0.0-beta.10',
  'published server versions must sort numerically'
);

assert.strictEqual(
  selectLatestVersion('workflow', ['2.0.0-beta.9', '2.0.0-beta.10', '2.0.0-alpha.201'], 'test candidates'),
  '2.0.0-beta.10',
  'product train beta prereleases must sort numerically and ignore older alpha tags'
);

assert.strictEqual(
  selectLatestVersion('workflow', ['2.0.0-alpha.201', '2.0.0-beta.10', '2.0.0-rc.4'], 'test candidates'),
  '2.0.0-rc.4',
  'release candidates must sort after alpha and beta product trains'
);

assert.strictEqual(
  selectLatestVersion('sdk-python', ['2.0.0b3', '2.0.0-beta.1'], 'test candidates'),
  '2.0.0-beta.3',
  'PyPI PEP 440 beta spelling must normalize to the shared product-train identifier'
);

assert.strictEqual(
  selectLatestVersion('sdk-python', ['2.0.0a17', '2.0.0b3', '2.0.0rc4'], 'test candidates'),
  '2.0.0-rc.4',
  'PyPI alpha, beta, and release-candidate spellings must normalize to one product-train grammar'
);

assert.strictEqual(
  selectLatestCratesIoVersion({
    versions: [
      {num: '2.0.0-beta.3', yanked: true},
      {num: source.artifacts['sdk-rust'], yanked: false},
    ],
  }, PUBLISHED_ARTIFACT_SOURCES['sdk-rust']),
  source.artifacts['sdk-rust'],
  'Rust SDK artifact resolution must ignore yanked crates.io releases'
);

function cliRelease(tagName, assets, options = {}) {
  return {
    tag_name: tagName,
    draft: Boolean(options.draft),
    prerelease: Boolean(options.prerelease),
    assets: assets.map(name => ({name})),
  };
}

const requiredCliAssets = PUBLISHED_ARTIFACT_SOURCES.cli.requiredAssets;

assert.strictEqual(
  selectLatestCompleteCliRelease([
    cliRelease('2.0.0-beta.3', []),
    cliRelease(source.artifacts.cli, requiredCliAssets),
    cliRelease('2.0.0-beta.1', requiredCliAssets),
  ], PUBLISHED_ARTIFACT_SOURCES.cli),
  source.artifacts.cli,
  'CLI artifact resolution must skip newer releases until all public assets are available'
);

assert.strictEqual(
  selectLatestCompleteCliRelease([
    cliRelease('2.0.0-beta.3', requiredCliAssets, {draft: true}),
    cliRelease(source.artifacts.cli, requiredCliAssets),
  ], PUBLISHED_ARTIFACT_SOURCES.cli),
  source.artifacts.cli,
  'CLI artifact resolution must ignore draft beta releases'
);

assert.strictEqual(
  selectLatestCompleteCliRelease([
    cliRelease('2.0.0-beta.3', requiredCliAssets, {prerelease: true}),
    cliRelease(source.artifacts.cli, requiredCliAssets, {prerelease: true}),
  ], PUBLISHED_ARTIFACT_SOURCES.cli),
  '2.0.0-beta.3',
  'CLI artifact resolution must accept published prerelease train tags'
);

assert.throws(
  () => selectLatestCompleteCliRelease([
    cliRelease('2.0.0-beta.3', []),
  ], PUBLISHED_ARTIFACT_SOURCES.cli),
  /No complete CLI release contains all required public assets[\s\S]*2\.0\.0-beta\.3: missing/,
  'CLI artifact resolution must fail clearly when no complete release exists'
);

assert.strictEqual(
  parseRegistryNextLink(
    '</v2/durable-workflow/server/tags/list?last=2.0.0-beta.9&n=100>; rel="next"',
    'https://ghcr.io/v2/durable-workflow/server/tags/list?n=100'
  ),
  'https://ghcr.io/v2/durable-workflow/server/tags/list?last=2.0.0-beta.9&n=100',
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
    { label: 'Docker Hub', image: 'durableworkflow/server', version: '2.0.0-beta.3' },
    { label: 'GHCR', image: 'ghcr.io/durable-workflow/server', version: '2.0.0-beta.2' },
  ]),
  /Published server container registries disagree:[\s\S]*Docker Hub durableworkflow\/server:2\.0\.0-beta\.3[\s\S]*GHCR ghcr\.io\/durable-workflow\/server:2\.0\.0-beta\.2/,
  'server registry disagreement must fail before selecting a docs tuple'
);

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
  ['cli', '0.1.95', /artifacts\.cli must use CLI version format .*2\.0\.0-rc\.N/],
  ['sdk-php', '0.1.16', /artifacts\.sdk-php must use PHP SDK version format .*2\.0\.0-rc\.N/],
  ['sdk-python', '2.0.0b3', /artifacts\.sdk-python must use Python SDK version format .*2\.0\.0-rc\.N/],
  ['sdk-rust', 'latest', /artifacts\.sdk-rust must use Rust SDK version format .*2\.0\.0-rc\.N/],
  ['server', 'latest', /artifacts\.server must use server version format .*2\.0\.0-rc\.N/],
  ['waterline', '2.0.0-preview.1', /artifacts\.waterline must use Waterline version format .*2\.0\.0-rc\.N/],
  ['workflow', '2.0.0', /artifacts\.workflow must use Workflow version format .*2\.0\.0-rc\.N/],
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

expectFailure(
  'rejects a mixed product train',
  candidate => {
    candidate.artifacts.server = '2.0.0-beta.2';
  },
  /must define one synchronized 2\.0 product train/
);

for (const artifact of Object.keys(source.artifacts)) {
  expectFailure(
    `rejects surrounding whitespace for ${artifact}`,
    candidate => {
      candidate.artifacts[artifact] = ` ${candidate.artifacts[artifact]} `;
    },
    new RegExp(`artifacts\\.${artifact} must not contain surrounding whitespace`)
  );
}

assertWorkflowRegistryAuthorityResolution().then(
  () => console.log('Public artifact version source validation passed'),
  error => {
    console.error(error);
    process.exitCode = 1;
  },
);
