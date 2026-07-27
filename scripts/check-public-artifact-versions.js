const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const source = require('./public-artifact-versions.json');
const {
  ARTIFACT_RELEASE_POLICY,
  ARTIFACT_PINS,
  ARTIFACT_DISTRIBUTION_SURFACES,
  buildArtifactPinPatterns,
  buildArtifactPins,
  isAuthorizedProductTrainVersion,
  pypiRegistryVersion,
  readArtifactReleasePolicy,
  readArtifactVersions,
} = require('./public-artifact-versions');
const {
  artifactCompatibilityEvidenceSource,
  buildArtifactCompatibilityEvidence,
  readArtifactCompatibilityEvidence,
  releasePlanEvidenceUrl,
} = require('./public-artifact-compatibility');
const {
  PUBLISHED_ARTIFACT_SOURCES,
  PUBLIC_ARTIFACT_TUPLE_FILES,
  artifactVersionsSource,
  changedPublicArtifactTupleFiles,
  classifyArtifactTrainChange,
  compatibilityContractSource,
  generatedPublicArtifactTupleSources,
  parseRegistryNextLink,
  quickstartExecutionContractSource,
  resolvePackagistVersion,
  resolvePublishedArtifactCompatibilityEvidence,
  resolvePublishedWorkflowAuthority,
  selectLatestQualifiedArtifactTuple,
  selectLatestPublishedArtifactTuple,
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
const compatibilityContractPath = path.join(__dirname, '..', 'static', 'compatibility-contract.json');

function cloneSource() {
  return JSON.parse(JSON.stringify(source));
}

function artifactVersionSourceAt(version) {
  const candidate = cloneSource();
  for (const artifact of Object.keys(candidate.artifacts)) {
    candidate.artifacts[artifact] = version;
  }
  return candidate;
}

function artifactVersionsAt(version) {
  return readArtifactVersions(artifactVersionSourceAt(version));
}

function compatibilityEvidenceAt(versions) {
  const evidence = JSON.parse(JSON.stringify(artifactCompatibilityEvidenceSource));
  evidence.qualified_artifact_versions = {...versions};

  for (const artifact of ['sdk-php', 'sdk-python', 'sdk-rust']) {
    evidence.sdk_server_compatibility[artifact].sdk_version = versions[artifact];
    evidence.sdk_server_compatibility[artifact].server_version = versions.server;
    evidence.sdk_server_compatibility[artifact].supported_server_versions = versions.server;
  }

  return evidence;
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
assert.deepStrictEqual(
  readArtifactCompatibilityEvidence(
    artifactCompatibilityEvidenceSource,
    source.artifacts,
  ).artifactVersions,
  source.artifacts,
  'public compatibility evidence must bind the exact selected artifact tuple',
);
const releasePlanFixture = {
  schema: 'durable-workflow.release-plan/v2',
  plan: 'qualified-artifact-fixture',
  channel: ARTIFACT_RELEASE_POLICY.release_phase,
  beta_authorization: {
    tag: 'beta-authorization/qualified-artifact-fixture',
    commit: 'a'.repeat(40),
  },
  components: Object.fromEntries(Object.entries(source.artifacts).map(
    ([artifact, version]) => [artifact, {version, commit: 'b'.repeat(40)}],
  )),
};
const releasePlanFixtureSource = `${JSON.stringify(releasePlanFixture, null, 2)}\n`;
const sdkServerQualificationUrl =
  'https://example.test/sdk-server-qualification.json';
const conformanceEvidenceTag =
  'beta-conformance/beta-qualified-artifact-fixture/12345.1';
const conformanceSuiteUrl = [
  'https://github.com/durable-workflow/.github/releases/download',
  conformanceEvidenceTag,
  'suite-result.json',
].join('/');
const distributionFixtures = {
  'sdk-php': {
    kind: 'composer',
    locator: `composer:durable-workflow/sdk@${source.artifacts['sdk-php']}`,
    artifacts: [{name: 'durable-workflow/sdk', sha256: 'c'.repeat(64)}],
  },
  'sdk-python': {
    kind: 'pypi',
    locator: `pypi:durable-workflow@${source.artifacts['sdk-python']}`,
    artifacts: [{name: 'sdk-python.whl', sha256: 'd'.repeat(64)}],
  },
  'sdk-rust': {
    kind: 'crates.io',
    locator: `crates.io:durable-workflow@${source.artifacts['sdk-rust']}`,
    artifacts: [{name: 'sdk-rust.crate', sha256: 'e'.repeat(64)}],
  },
  server: {
    kind: 'oci',
    locator: `oci:docker.io/durableworkflow/server@${source.artifacts.server}`,
    artifacts: [{name: 'manifest', sha256: 'f'.repeat(64)}],
  },
};
const conformanceSuiteFixture = {
  schema: 'durable-workflow.beta-conformance.suite-result/v2',
  artifact_tuple: releasePlanFixture.components,
  source_identities: Object.fromEntries(
    Object.entries(releasePlanFixture.components).map(
      ([artifact, identity]) => [artifact, identity.commit],
    ),
  ),
  executed_distribution_identities: distributionFixtures,
  github_run: {
    repository: 'durable-workflow/.github',
    run_id: 12345,
    run_attempt: 1,
    evidence_tag: conformanceEvidenceTag,
  },
  outcome: 'pass',
  experiments: Object.fromEntries(
    ['heartbeats', 'replay', 'signals-queries'].map(experiment => [
      experiment,
      {
        outcome: 'pass',
        classification: 'passed',
        required_clients: ['sdk-php', 'sdk-python', 'sdk-rust'],
        required_distributions: ['server', 'sdk-php', 'sdk-python', 'sdk-rust'],
        result_sha256: 'a'.repeat(64),
      },
    ]),
  ),
};
const conformanceSuiteFixtureSource =
  `${JSON.stringify(conformanceSuiteFixture, null, 2)}\n`;
function sdkServerQualificationAt(options = {}) {
  const server = releasePlanFixture.components.server;
  const qualification = {
    schema: 'durable-workflow.sdk-server-qualification/v1',
    release_plan: {
      tag: `release-plan/${releasePlanFixture.plan}`,
      sha256: sha256(releasePlanFixtureSource),
    },
    outcome: 'pass',
    evidence: {
      schema: 'durable-workflow.beta-conformance.suite-result/v2',
      tag: conformanceEvidenceTag,
      source_url: conformanceSuiteUrl,
      sha256: sha256(conformanceSuiteFixtureSource),
      outcome: 'pass',
      github_run: {...conformanceSuiteFixture.github_run},
    },
    bindings: Object.fromEntries(['sdk-php', 'sdk-python', 'sdk-rust'].map(
      artifact => [
        artifact,
        {
          sdk: {
            source: {...releasePlanFixture.components[artifact]},
            distribution: JSON.parse(JSON.stringify(distributionFixtures[artifact])),
          },
          server: {
            source: {...server},
            distribution: JSON.parse(JSON.stringify(distributionFixtures.server)),
          },
          supported_server_versions: server.version,
          outcome: 'pass',
        },
      ],
    )),
  };
  if (options.outcome) {
    qualification.outcome = options.outcome;
  }
  return qualification;
}
function qualificationFixtureSources(
  qualification = sdkServerQualificationAt(),
  conformanceSuite = conformanceSuiteFixture,
) {
  const qualified = JSON.parse(JSON.stringify(qualification));
  const conformanceSuiteSource = `${JSON.stringify(conformanceSuite, null, 2)}\n`;
  qualified.evidence.sha256 = sha256(conformanceSuiteSource);
  const qualificationSource = `${JSON.stringify(qualified, null, 2)}\n`;
  const productTrain = JSON.parse(JSON.stringify(productTrainFixture));
  productTrain.trains[source.artifacts.server].sdk_server_qualification.sha256 =
    sha256(qualificationSource);
  return {
    productTrainSource: `${JSON.stringify(productTrain, null, 2)}\n`,
    qualificationSource,
    conformanceSuiteSource,
  };
}
const sdkServerQualificationFixture = sdkServerQualificationAt();
const sdkServerQualificationFixtureSource =
  `${JSON.stringify(sdkServerQualificationFixture, null, 2)}\n`;
const productTrainFixture = {
  schema: 'durable-workflow.product-train/v2',
  current: source.artifacts.server,
  trains: {
    [source.artifacts.server]: {
      status: 'supported',
      versions: source.artifacts,
      release_plan: {
        tag: `release-plan/${releasePlanFixture.plan}`,
        sha256: sha256(releasePlanFixtureSource),
      },
      sdk_server_qualification: {
        schema: 'durable-workflow.sdk-server-qualification/v1',
        source_url: sdkServerQualificationUrl,
        sha256: sha256(sdkServerQualificationFixtureSource),
      },
    },
  },
};
const productTrainFixtureSource = `${JSON.stringify(productTrainFixture, null, 2)}\n`;
const builtCompatibilityEvidence = buildArtifactCompatibilityEvidence(
  productTrainFixtureSource,
  releasePlanFixtureSource,
  sdkServerQualificationFixtureSource,
  conformanceSuiteFixtureSource,
);
assert.deepStrictEqual(
  builtCompatibilityEvidence.qualified_artifact_versions,
  source.artifacts,
  'supported product-train and immutable release-plan records must normalize into tuple evidence',
);
assert.strictEqual(
  builtCompatibilityEvidence.authority.release_plan.source_url,
  releasePlanEvidenceUrl(`release-plan/${releasePlanFixture.plan}`),
);
assert.throws(
  () => buildArtifactCompatibilityEvidence(
    productTrainFixtureSource,
    `${JSON.stringify({
      ...releasePlanFixture,
      components: {
        ...releasePlanFixture.components,
        'sdk-python': {
          ...releasePlanFixture.components['sdk-python'],
          version: '2.0.0-beta.17',
        },
      },
    }, null, 2)}\n`,
    sdkServerQualificationFixtureSource,
    conformanceSuiteFixtureSource,
  ),
  /does not match the product-train SHA-256/,
  'modified release-plan bytes must not satisfy exact compatibility evidence',
);
assert.throws(
  () => buildArtifactCompatibilityEvidence(
    `${JSON.stringify({
      ...productTrainFixture,
      trains: {
        [source.artifacts.server]: {
          ...productTrainFixture.trains[source.artifacts.server],
          sdk_server_qualification: undefined,
        },
      },
    })}\n`,
    releasePlanFixtureSource,
    '',
    '',
  ),
  /must bind immutable SDK-to-Server qualification evidence/,
  'missing conformance qualification must fail closed',
);
const failedQualificationSources = qualificationFixtureSources(
  sdkServerQualificationAt({outcome: 'fail'}),
);
assert.throws(
  () => buildArtifactCompatibilityEvidence(
    failedQualificationSources.productTrainSource,
    releasePlanFixtureSource,
    failedQualificationSources.qualificationSource,
    failedQualificationSources.conformanceSuiteSource,
  ),
  /qualification evidence outcome must be pass/,
  'failed conformance qualification must block public compatibility evidence',
);
const failedConformanceSuite = JSON.parse(
  JSON.stringify(conformanceSuiteFixture),
);
failedConformanceSuite.outcome = 'fail';
const failedConformanceSources = qualificationFixtureSources(
  sdkServerQualificationAt(),
  failedConformanceSuite,
);
assert.throws(
  () => buildArtifactCompatibilityEvidence(
    failedConformanceSources.productTrainSource,
    releasePlanFixtureSource,
    failedConformanceSources.qualificationSource,
    failedConformanceSources.conformanceSuiteSource,
  ),
  /conformance suite must be the exact passing retained GitHub run/,
  'a failed retained conformance suite must block public compatibility evidence',
);
const mutableQualification = sdkServerQualificationAt();
mutableQualification.evidence.source_url = sdkServerQualificationUrl;
const mutableQualificationSources = qualificationFixtureSources(
  mutableQualification,
);
assert.throws(
  () => buildArtifactCompatibilityEvidence(
    mutableQualificationSources.productTrainSource,
    releasePlanFixtureSource,
    mutableQualificationSources.qualificationSource,
    mutableQualificationSources.conformanceSuiteSource,
  ),
  /must identify an immutable passing suite/,
  'a mutable qualification evidence URL must not satisfy public compatibility evidence',
);
const failedBindingQualification = sdkServerQualificationAt();
failedBindingQualification.bindings['sdk-python'].outcome = 'fail';
const failedBindingSources = qualificationFixtureSources(
  failedBindingQualification,
);
assert.throws(
  () => buildArtifactCompatibilityEvidence(
    failedBindingSources.productTrainSource,
    releasePlanFixtureSource,
    failedBindingSources.qualificationSource,
    failedBindingSources.conformanceSuiteSource,
  ),
  /sdk-python must be a passing exact binding/,
  'a failed individual SDK binding must block public compatibility evidence',
);
const mismatchedQualification = sdkServerQualificationAt();
mismatchedQualification.bindings['sdk-rust'].server.source.version =
  '2.0.0-beta.17';
const mismatchedQualificationSources = qualificationFixtureSources(
  mismatchedQualification,
);
assert.throws(
  () => buildArtifactCompatibilityEvidence(
    mismatchedQualificationSources.productTrainSource,
    releasePlanFixtureSource,
    mismatchedQualificationSources.qualificationSource,
    mismatchedQualificationSources.conformanceSuiteSource,
  ),
  /sdk-rust must be a passing exact binding/,
  'tuple-mismatched conformance qualification must block public compatibility evidence',
);
const mismatchedDistributionQualification = sdkServerQualificationAt();
mismatchedDistributionQualification.bindings['sdk-rust'].sdk.distribution.locator =
  'crates.io:durable-workflow@2.0.0-beta.17';
const mismatchedDistributionSources = qualificationFixtureSources(
  mismatchedDistributionQualification,
);
assert.throws(
  () => buildArtifactCompatibilityEvidence(
    mismatchedDistributionSources.productTrainSource,
    releasePlanFixtureSource,
    mismatchedDistributionSources.qualificationSource,
    mismatchedDistributionSources.conformanceSuiteSource,
  ),
  /sdk-rust must be a passing exact binding/,
  'distribution-mismatched conformance qualification must block public evidence',
);
const mismatchedConformanceSuite = JSON.parse(
  JSON.stringify(conformanceSuiteFixture),
);
mismatchedConformanceSuite.artifact_tuple['sdk-rust'].version =
  '2.0.0-beta.17';
const mismatchedConformanceSources = qualificationFixtureSources(
  sdkServerQualificationAt(),
  mismatchedConformanceSuite,
);
assert.throws(
  () => buildArtifactCompatibilityEvidence(
    mismatchedConformanceSources.productTrainSource,
    releasePlanFixtureSource,
    mismatchedConformanceSources.qualificationSource,
    mismatchedConformanceSources.conformanceSuiteSource,
  ),
  /conformance suite artifact sdk-rust does not match the selected release plan/,
  'tuple-mismatched retained conformance evidence must block public compatibility evidence',
);
const missingRustCoverageSuite = JSON.parse(
  JSON.stringify(conformanceSuiteFixture),
);
missingRustCoverageSuite.experiments.heartbeats.required_clients =
  ['sdk-php', 'sdk-python'];
const missingRustCoverageSources = qualificationFixtureSources(
  sdkServerQualificationAt(),
  missingRustCoverageSuite,
);
assert.throws(
  () => buildArtifactCompatibilityEvidence(
    missingRustCoverageSources.productTrainSource,
    releasePlanFixtureSource,
    missingRustCoverageSources.qualificationSource,
    missingRustCoverageSources.conformanceSuiteSource,
  ),
  /experiment heartbeats must pass for PHP, Python, Rust, and Server distributions/,
  'suite evidence without claimed Rust client coverage must fail closed',
);
assert.strictEqual(
  artifactVersionsSource(source.artifacts),
  `${JSON.stringify(source, null, 2)}\n`,
  'public artifact refresh output must preserve the canonical JSON shape'
);

const currentArtifactPins = buildArtifactPins(source.artifacts);
assert.strictEqual(ARTIFACT_PINS.productTrainVersion, source.artifacts['sdk-python']);
assert.strictEqual(
  ARTIFACT_PINS.pythonRegistryVersion,
  pypiRegistryVersion(source.artifacts['sdk-python']),
);
assert.strictEqual(pypiRegistryVersion('2.0.0-alpha.17'), '2.0.0a17');
assert.strictEqual(pypiRegistryVersion('2.0.0-beta.17'), '2.0.0b17');
assert.strictEqual(pypiRegistryVersion('2.0.0-rc.4'), '2.0.0rc4');
assert.deepStrictEqual(
  ARTIFACT_RELEASE_POLICY.authorized_channels,
  ['alpha', 'beta'],
  'the reviewed beta policy must admit alpha and beta without admitting later channels',
);
assert.strictEqual(ARTIFACT_RELEASE_POLICY.release_phase, 'beta');
assert.strictEqual(ARTIFACT_PINS.releasePhase, ARTIFACT_RELEASE_POLICY.release_phase);
assert.strictEqual(isAuthorizedProductTrainVersion('2.0.0-alpha.201'), true);
assert.strictEqual(isAuthorizedProductTrainVersion('2.0.0-beta.10'), true);
assert.strictEqual(isAuthorizedProductTrainVersion('2.0.0-rc.4'), false);
assert.strictEqual(isAuthorizedProductTrainVersion('2.0.0'), false);

const releaseCandidatePolicy = readArtifactReleasePolicy({
  schema: ARTIFACT_RELEASE_POLICY.schema,
  schema_version: ARTIFACT_RELEASE_POLICY.schema_version,
  product_train: ARTIFACT_RELEASE_POLICY.product_train,
  release_phase: 'rc',
  authorized_channels: ['alpha', 'beta', 'rc'],
});
assert.strictEqual(
  readArtifactVersions(
    artifactVersionSourceAt('2.0.0-rc.4'),
    releaseCandidatePolicy,
  ).workflow,
  '2.0.0-rc.4',
  'a release candidate becomes canonical only after an explicit release-policy transition',
);
assert.throws(
  () => readArtifactReleasePolicy({
    ...ARTIFACT_RELEASE_POLICY,
    authorized_channels: ['alpha', 'beta', 'rc'],
  }),
  /authorized_channels must contain every channel through beta in release order: alpha, beta/,
  'later channels cannot be admitted without advancing the declared release phase',
);
assert.strictEqual(
  readArtifactVersions(
    artifactVersionSourceAt('2.0.0'),
    readArtifactReleasePolicy({
      schema: ARTIFACT_RELEASE_POLICY.schema,
      schema_version: ARTIFACT_RELEASE_POLICY.schema_version,
      product_train: ARTIFACT_RELEASE_POLICY.product_train,
      release_phase: 'stable',
      authorized_channels: ['alpha', 'beta', 'rc', 'stable'],
    }),
  ).workflow,
  '2.0.0',
  'stable 2.0 requires a separately reviewed stable release-policy cutover',
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
assert.strictEqual(
  currentArtifactPins.rustCargoAddCommand,
  `cargo add durable-workflow@=${source.artifacts['sdk-rust']}`,
  'the Rust install authority must use Cargo exact-requirement syntax',
);
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

const unsupportedRustContract = JSON.parse(currentQuickstartContract);
const unsupportedRustCommand = `cargo add durable-workflow@${source.artifacts['sdk-rust']} --exact`;
unsupportedRustContract.artifacts['sdk-rust'].install_command = unsupportedRustCommand;
const unsupportedRustScenario = unsupportedRustContract.scenarios.find(
  scenario => scenario.id === 'rust_user_local_server_completion',
);
unsupportedRustScenario.command_script_lines[
  unsupportedRustScenario.command_script_lines.indexOf(currentArtifactPins.rustCargoAddCommand)
] = unsupportedRustCommand;

assert.strictEqual(
  quickstartExecutionContractSource(
    `${JSON.stringify(unsupportedRustContract, null, 2)}\n`,
    source.artifacts,
  ),
  currentQuickstartContract,
  'public artifact refresh must repair unsupported Rust install commands',
);

const currentCompatibilityContract = fs.readFileSync(compatibilityContractPath, 'utf8');
assert.strictEqual(
  compatibilityContractSource(currentCompatibilityContract, source.artifacts),
  currentCompatibilityContract,
  'compatibility contract must already match the public artifact authority',
);

const currentTupleSources = Object.fromEntries(PUBLIC_ARTIFACT_TUPLE_FILES.map(file => [
  file,
  fs.readFileSync(path.join(repoRoot, file), 'utf8'),
]));
assert.deepStrictEqual(
  changedPublicArtifactTupleFiles(
    currentTupleSources,
    generatedPublicArtifactTupleSources(
      currentTupleSources,
      source.artifacts,
      '2026-07-23',
      currentTupleSources['static/sdk-neutrality-contract.json'],
    ),
  ),
  [],
  'a current artifact tuple must produce no generated file changes',
);
const successorWorkflowVersion = source.artifacts.workflow.replace(
  /\.(\d+)$/,
  (_, sequence) => `.${Number(sequence) + 1}`,
);
const successorVersions = Object.fromEntries(
  Object.keys(source.artifacts).map(artifact => [artifact, successorWorkflowVersion]),
);
const successorCompatibilityEvidence = compatibilityEvidenceAt(successorVersions);
const currentWorkflowManifest = currentTupleSources['static/sdk-neutrality-contract.json'];
const unchangedManifestTuple = generatedPublicArtifactTupleSources(
  currentTupleSources,
  successorVersions,
  '2026-07-14',
  currentWorkflowManifest,
  successorCompatibilityEvidence,
);
const unchangedManifestFiles = changedPublicArtifactTupleFiles(
  currentTupleSources,
  unchangedManifestTuple,
);

assert.deepStrictEqual(
  unchangedManifestFiles,
  [
    'scripts/public-artifact-versions.json',
    'static/public-artifact-compatibility-evidence.json',
    'static/quickstart-execution-contract.json',
    'static/compatibility-contract.json',
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
  successorCompatibilityEvidence,
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
        {
          version: '2.0.0-rc.4',
          dist: {type: 'zip'},
          source: {type: 'git', reference: 'c'.repeat(40)},
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
              {version: '2.0.0-rc.4', dist: {type: 'zip'}},
              {version: '2.0.0', dist: {type: 'zip'}},
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

async function assertCompatibilityAuthorityResolution() {
  const productTrainUrl = 'https://example.test/product-train.json';
  const releasePlanUrl = releasePlanEvidenceUrl(
    `release-plan/${releasePlanFixture.plan}`,
  );
  const sources = new Map([
    [productTrainUrl, productTrainFixtureSource],
    [releasePlanUrl, releasePlanFixtureSource],
    [sdkServerQualificationUrl, sdkServerQualificationFixtureSource],
    [conformanceSuiteUrl, conformanceSuiteFixtureSource],
  ]);
  const requestedUrls = [];
  const evidence = await resolvePublishedArtifactCompatibilityEvidence(
    {productTrainUrl},
    {
      requestText: async url => {
        requestedUrls.push(url);
        if (!sources.has(url)) {
          throw new Error(`missing fixture for ${url}`);
        }
        return sources.get(url);
      },
    },
  );

  assert.strictEqual(evidence.outcome, 'pass');
  assert.deepStrictEqual(
    requestedUrls,
    [
      productTrainUrl,
      releasePlanUrl,
      sdkServerQualificationUrl,
      conformanceSuiteUrl,
    ],
    'compatibility resolution must fetch the digest-bound qualification and suite records',
  );

  await assert.rejects(
    () => resolvePublishedArtifactCompatibilityEvidence(
      {productTrainUrl},
      {
        requestText: async url => {
          if (url === sdkServerQualificationUrl) {
            throw new Error('qualification unavailable');
          }
          return sources.get(url);
        },
      },
    ),
    /qualification unavailable/,
    'missing qualification bytes must fail the public refresher closed',
  );

  await assert.rejects(
    () => resolvePublishedArtifactCompatibilityEvidence(
      {productTrainUrl},
      {
        requestText: async url => {
          if (url === conformanceSuiteUrl) {
            throw new Error('conformance suite unavailable');
          }
          return sources.get(url);
        },
      },
    ),
    /conformance suite unavailable/,
    'missing immutable conformance suite bytes must fail the public refresher closed',
  );
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

const completeTrainCandidates = Object.fromEntries(
  Object.keys(source.artifacts).map(artifact => [
    artifact,
    artifact === 'sdk-python'
      ? ['2.0.0b5', '2.0.0b6']
      : ['2.0.0-beta.5', '2.0.0-beta.6'],
  ]),
);
assert.deepStrictEqual(
  selectLatestPublishedArtifactTuple(completeTrainCandidates, 'complete train fixture'),
  artifactVersionsAt('2.0.0-beta.6'),
  'tuple selection must use the latest published version from every artifact surface',
);

const partialTrainCandidates = JSON.parse(JSON.stringify(completeTrainCandidates));
partialTrainCandidates['sdk-rust'] = ['2.0.0-beta.5'];
const partialTrainVersions = {
  ...artifactVersionsAt('2.0.0-beta.6'),
  'sdk-rust': '2.0.0-beta.5',
};
assert.deepStrictEqual(
  selectLatestPublishedArtifactTuple(partialTrainCandidates, 'partial train fixture'),
  partialTrainVersions,
  'tuple selection must preserve independently published artifact versions',
);
const qualifiedBetaFive = compatibilityEvidenceAt(artifactVersionsAt('2.0.0-beta.5'));
const unqualifiedSuccessorSelection = selectLatestQualifiedArtifactTuple(
  completeTrainCandidates,
  qualifiedBetaFive,
  'unqualified successor fixture',
);
assert.deepStrictEqual(
  unqualifiedSuccessorSelection.versions,
  artifactVersionsAt('2.0.0-beta.5'),
  'a newer independently published tuple must park at the exact qualified versions',
);
assert.deepStrictEqual(
  unqualifiedSuccessorSelection.parkedArtifacts.map(entry => entry.artifact),
  Object.keys(source.artifacts),
  'every newer artifact without matching evidence must be reported as parked',
);

const newerServerAndSdkCandidates = JSON.parse(JSON.stringify(completeTrainCandidates));
newerServerAndSdkCandidates.server = ['2.0.0-beta.5', '2.0.0-beta.7'];
newerServerAndSdkCandidates['sdk-python'] = ['2.0.0b5', '2.0.0b7'];
const newerServerAndSdkSelection = selectLatestQualifiedArtifactTuple(
  newerServerAndSdkCandidates,
  qualifiedBetaFive,
  'newer Server and SDK without matching evidence',
);
assert.deepStrictEqual(
  newerServerAndSdkSelection.versions,
  artifactVersionsAt('2.0.0-beta.5'),
  'a newer Server and SDK must not become public authority without exact compatibility evidence',
);
assert.deepStrictEqual(
  newerServerAndSdkSelection.parkedArtifacts
    .filter(entry => ['server', 'sdk-python'].includes(entry.artifact))
    .map(entry => [entry.artifact, entry.latestPublishedVersion]),
  [
    ['sdk-python', '2.0.0-beta.7'],
    ['server', '2.0.0-beta.7'],
  ],
  'the adversarial selection must identify the unqualified newer Server and SDK',
);

const independentlyQualifiedVersions = {
  ...artifactVersionsAt('2.0.0-beta.6'),
  'sdk-rust': '2.0.0-beta.5',
};
const independentlyQualifiedSelection = selectLatestQualifiedArtifactTuple(
  partialTrainCandidates,
  compatibilityEvidenceAt(independentlyQualifiedVersions),
  'qualified independent release fixture',
);
assert.deepStrictEqual(
  independentlyQualifiedSelection.versions,
  independentlyQualifiedVersions,
  'an independently versioned tuple must advance once exact compatibility evidence exists',
);
assert.deepStrictEqual(independentlyQualifiedSelection.parkedArtifacts, []);

const unsupportedServerVersions = {
  ...artifactVersionsAt('2.0.0-beta.5'),
  server: '2.0.0-beta.6',
};
assert.throws(
  () => compatibilityContractSource(
    currentCompatibilityContract,
    unsupportedServerVersions,
    qualifiedBetaFive,
  ),
  /qualified_artifact_versions must exactly match the selected public artifact tuple/,
  'compatibility claims must not be inferred from a newer Server tag without matching evidence',
);
assert.throws(
  () => selectLatestPublishedArtifactTuple({
    ...partialTrainCandidates,
    'sdk-rust': [],
  }, 'missing artifact fixture'),
  /Could not find a published sdk-rust version/,
  'selection must fail when an artifact has no published version',
);
assert.strictEqual(
  classifyArtifactTrainChange(
    artifactVersionsAt('2.0.0-beta.5'),
    artifactVersionsAt('2.0.0-beta.5'),
  ),
  'current',
  'a current artifact authority must be a no-op',
);
assert.strictEqual(
  classifyArtifactTrainChange(
    artifactVersionsAt('2.0.0-beta.5'),
    artifactVersionsAt('2.0.0-beta.6'),
  ),
  'advance',
  'a newer artifact authority must be classified as an advance',
);
assert.throws(
  () => classifyArtifactTrainChange(
    artifactVersionsAt('2.0.0-beta.6'),
    artifactVersionsAt('2.0.0-beta.5'),
  ),
  /Refusing to regress the public artifact tuple:[\s\S]*cli: docs=2\.0\.0-beta\.6 published=2\.0\.0-beta\.5/,
  'a registry scan must not regress an already published docs authority',
);

assertComposerPrereleasePins('waterline', '2.0.0-alpha.201', 'alpha');
assertComposerPrereleasePins('workflow', '2.0.0-beta.3', 'beta');
assert.throws(
  () => assertComposerPrereleasePins('workflow', '2.0.0-rc.4', 'rc'),
  /authorized by the beta release phase/,
  'release-candidate Composer pins must wait for an explicit release-policy transition',
);

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
  selectLatestVersion(
    'workflow',
    ['2.0.0-alpha.201', '2.0.0-beta.10', '2.0.0-rc.4', '2.0.0'],
    'test candidates',
  ),
  '2.0.0-beta.10',
  'unauthorized release candidates and stable tags must not supersede the beta registry authority'
);

assert.strictEqual(
  selectLatestVersion('sdk-python', ['2.0.0b3', '2.0.0-beta.1'], 'test candidates'),
  '2.0.0-beta.3',
  'PyPI PEP 440 beta spelling must normalize to the shared product-train identifier'
);

assert.strictEqual(
  selectLatestVersion(
    'sdk-python',
    ['2.0.0a17', '2.0.0b3', '2.0.0rc4', '2.0.0'],
    'test candidates',
  ),
  '2.0.0-beta.3',
  'PyPI registry selection must normalize spellings before applying release-channel admission'
);

for (const artifact of Object.keys(source.artifacts)) {
  const candidates = artifact === 'sdk-python'
    ? ['2.0.0b3', '2.0.0rc4', '2.0.0']
    : ['2.0.0-beta.3', '2.0.0-rc.4', '2.0.0'];
  assert.strictEqual(
    selectLatestVersion(artifact, candidates, 'synchronized later-channel fixture'),
    '2.0.0-beta.3',
    `${artifact} registry selection must remain on the authorized beta train`,
  );
}

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
    cliRelease('2.0.0-rc.4', requiredCliAssets, {prerelease: true}),
    cliRelease(source.artifacts.cli, requiredCliAssets, {prerelease: true}),
  ], PUBLISHED_ARTIFACT_SOURCES.cli),
  source.artifacts.cli,
  'CLI artifact resolution must ignore complete releases from unauthorized later channels'
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

assert.throws(
  () => selectServerRegistryVersion([
    { label: 'Docker Hub', image: 'durableworkflow/server', version: '2.0.0-rc.4' },
    { label: 'GHCR', image: 'ghcr.io/durable-workflow/server', version: '2.0.0-rc.4' },
  ]),
  /not authorized by the beta release phase/,
  'synchronized server registries must not advance the canonical tuple to release candidate',
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
  ['cli', '0.1.95', /artifacts\.cli must use a CLI version authorized by the beta release phase/],
  ['sdk-php', '0.1.16', /artifacts\.sdk-php must use a PHP SDK version authorized by the beta release phase/],
  ['sdk-python', '2.0.0b3', /artifacts\.sdk-python must use a Python SDK version authorized by the beta release phase/],
  ['sdk-rust', 'latest', /artifacts\.sdk-rust must use a Rust SDK version authorized by the beta release phase/],
  ['server', 'latest', /artifacts\.server must use a server version authorized by the beta release phase/],
  ['waterline', '2.0.0-preview.1', /artifacts\.waterline must use a Waterline version authorized by the beta release phase/],
  ['workflow', '2.0.0-rc.4', /artifacts\.workflow must use a Workflow version authorized by the beta release phase/],
  ['workflow', '2.0.0', /artifacts\.workflow must use a Workflow version authorized by the beta release phase/],
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

const mixedArtifactTuple = cloneSource();
mixedArtifactTuple.artifacts.server = '2.0.0-beta.19';
assert.strictEqual(
  readArtifactVersions(mixedArtifactTuple).server,
  '2.0.0-beta.19',
  'the public tuple must preserve an independently verified Server release',
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

Promise.all([
  assertWorkflowRegistryAuthorityResolution(),
  assertCompatibilityAuthorityResolution(),
]).then(
  () => console.log('Public artifact version source validation passed'),
  error => {
    console.error(error);
    process.exitCode = 1;
  },
);
