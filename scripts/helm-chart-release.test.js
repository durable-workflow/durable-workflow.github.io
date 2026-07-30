const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const {
  assertDocumentedInstallCommands,
  assertPackageMetadata,
  assertProvenance,
  releaseHistoryEntry,
  releaseProvenance,
  renderCommand,
  stageRelease,
  validateContract,
  validateReleaseHistory,
  verifyLiveRelease,
} = require('./helm-chart-release');
const contract = require('../static/charts/release.json');

validateContract(contract);
assertDocumentedInstallCommands(
  fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'deployment.md'),
    'utf8',
  ),
  contract,
);

const renderValueArguments = [
  '--set-string',
  'externalDatabase.host=database.example.invalid',
  '--set-string',
  'externalDatabase.auth.username=workflow',
  '--set-string',
  'externalDatabase.auth.password=not-a-secret',
  '--set-string',
  'externalRedis.host=redis.example.invalid',
  '--set-string',
  'auth.serverKey=base64:bm90LWEtc2VjcmV0',
  '--set-string',
  'auth.workerToken=not-a-secret',
  '--set-string',
  'auth.operatorToken=not-a-secret',
  '--set-string',
  'auth.adminToken=not-a-secret',
];
const expectedRenderCommand = (releaseName, reference) => ({
  command: 'helm',
  arguments: [
    'template',
    releaseName,
    reference,
    '--version',
    contract.chart.version,
    '--namespace',
    'durable-workflow',
    ...renderValueArguments,
  ],
});
const renderCommands = [
  {
    actual: renderCommand(
      'docs-stage-oci-check',
      contract.channels.oci.repository,
      contract.chart.version,
    ),
    expected: expectedRenderCommand(
      'docs-stage-oci-check',
      contract.channels.oci.repository,
    ),
    description: 'staging anonymous OCI render',
  },
  {
    actual: renderCommand(
      'public-oci-check',
      contract.channels.oci.repository,
      contract.chart.version,
    ),
    expected: expectedRenderCommand(
      'public-oci-check',
      contract.channels.oci.repository,
    ),
    description: 'live anonymous OCI render',
  },
  {
    actual: renderCommand(
      'public-https-check',
      `durable-workflow/${contract.chart.name}`,
      contract.chart.version,
    ),
    expected: expectedRenderCommand(
      'public-https-check',
      `durable-workflow/${contract.chart.name}`,
    ),
    description: 'live anonymous HTTPS render',
  },
];
for (const {actual, expected, description} of renderCommands) {
  assert.deepStrictEqual(
    actual,
    expected,
    `${description} must be cluster-independent`,
  );
  assert(
    !actual.arguments.includes('install'),
    `${description} must not install the chart`,
  );
  assert(
    !actual.arguments.includes('--dry-run=client'),
    `${description} must not use the cluster-discovering install dry-run`,
  );
}

const metadata = {
  name: contract.chart.name,
  version: contract.chart.version,
  appVersion: contract.chart.app_version,
  annotations: {
    'dev.durable-workflow.source-revision': 'a'.repeat(40),
    'dev.durable-workflow.image-reference': contract.image.reference,
  },
};
const packageDigest = `sha256:${'b'.repeat(64)}`;
const imageDigest = `sha256:${'c'.repeat(64)}`;
assertPackageMetadata(metadata, contract);

const provenance = releaseProvenance(
  contract,
  metadata,
  packageDigest,
  imageDigest,
);
assertProvenance(provenance, contract, metadata, packageDigest, imageDigest);

assert.throws(
  () => validateContract({
    ...contract,
    chart: {...contract.chart, version: '0.1.0'},
    channels: {
      ...contract.channels,
      https: {
        ...contract.channels.https,
        package_url: contract.channels.https.package_url,
      },
    },
  }),
  /documented HTTPS package URL/,
  'changing a chart version without the HTTPS package URL must fail',
);
assert.throws(
  () => assertProvenance(
    {
      ...provenance,
      channels: {
        ...provenance.channels,
        https: {
          ...provenance.channels.https,
          package_digest: `sha256:${'d'.repeat(64)}`,
        },
      },
    },
    contract,
    metadata,
    packageDigest,
    imageDigest,
  ),
  /bind both channels to one package/,
  'channel package drift must fail',
);

const missingResource = () => ({status: 404, body: Buffer.alloc(0)});
const clone = value => structuredClone(value);

function digest(body) {
  return `sha256:${crypto.createHash('sha256').update(body).digest('hex')}`;
}

function fixtureContract(version, appVersion) {
  const fixture = clone(contract);
  fixture.chart.version = version;
  fixture.chart.app_version = appVersion;
  fixture.image.reference = `docker.io/durableworkflow/server:${appVersion}`;
  fixture.channels.https.package_url =
    `${fixture.channels.https.repository}${fixture.chart.name}-${version}.tgz`;
  return validateContract(fixture);
}

function fixtureRelease(version, appVersion, options = {}) {
  const releaseContract = fixtureContract(version, appVersion);
  const sourceRevision = options.sourceRevision || version.replace(/\D/g, '').padEnd(40, 'a');
  const packageBody = options.packageBody || `chart-package-${version}`;
  const releaseMetadata = {
    name: releaseContract.chart.name,
    version,
    appVersion,
    annotations: {
      'dev.durable-workflow.source-revision': sourceRevision,
      'dev.durable-workflow.image-reference': releaseContract.image.reference,
    },
  };
  const releaseImageDigest =
    options.imageDigest || digest(`image-${appVersion}`);
  return {
    contract: releaseContract,
    imageDigest: releaseImageDigest,
    metadata: releaseMetadata,
    packageBody,
    packageDigest: digest(packageBody),
    provenance: releaseProvenance(
      releaseContract,
      releaseMetadata,
      digest(packageBody),
      releaseImageDigest,
    ),
  };
}

function historyFor(releases) {
  const history = {
    schema: 'durable-workflow-helm-release-history/v1',
    chart: {name: contract.chart.name},
    versions: Object.fromEntries(releases.map(release => [
      release.contract.chart.version,
      releaseHistoryEntry(
        release.contract,
        release.metadata,
        release.packageDigest,
        release.imageDigest,
      ),
    ])),
  };
  return validateReleaseHistory(history, releases.at(-1).contract);
}

function indexFor(releases) {
  return {
    apiVersion: 'v1',
    entries: {
      [contract.chart.name]: releases.map(release => ({
        name: contract.chart.name,
        version: release.contract.chart.version,
        appVersion: release.contract.chart.app_version,
        digest: release.packageDigest.replace(/^sha256:/, ''),
        urls: [release.contract.channels.https.package_url],
      })),
    },
  };
}

function writePublishedRepository(directory, releases, options = {}) {
  const current = releases.at(-1);
  fs.mkdirSync(directory, {recursive: true});
  fs.writeFileSync(
    path.join(directory, 'release.json'),
    `${JSON.stringify(current.contract, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(directory, 'provenance.json'),
    `${JSON.stringify(current.provenance, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(directory, 'index.yaml'),
    yaml.dump(indexFor(releases)),
  );
  if (options.includeHistory !== false) {
    fs.writeFileSync(
      path.join(directory, 'release-history.json'),
      `${JSON.stringify(historyFor(releases), null, 2)}\n`,
    );
  }
  for (const release of releases) {
    fs.writeFileSync(
      path.join(
        directory,
        `${contract.chart.name}-${release.contract.chart.version}.tgz`,
      ),
      release.packageBody,
    );
  }
}

function directoryFetcher(directory, overrides = {}) {
  return async url => {
    const pathname = new URL(url).pathname;
    if (overrides[pathname]) {
      return overrides[pathname]();
    }
    const resourcePath = path.join(directory, path.basename(pathname));
    if (!fs.existsSync(resourcePath)) {
      return missingResource();
    }
    return {
      status: 200,
      body: fs.readFileSync(resourcePath),
    };
  };
}

function stagingFixture(candidate, knownReleases, fetchResource) {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'durable-workflow-helm-stage-test-'),
  );
  const buildDirectory = path.join(temporary, 'build');
  const evidencePath = path.join(
    temporary,
    'helm-predeploy-immutability-evidence.json',
  );
  const releasesByBody = new Map(
    knownReleases.map(release => [release.packageBody, release]),
  );
  if (!releasesByBody.has(candidate.packageBody)) {
    releasesByBody.set(candidate.packageBody, candidate);
  }
  const execute = (command, arguments) => {
    if (command === 'helm' && arguments[0] === 'pull') {
      const destination = arguments[arguments.indexOf('--destination') + 1];
      fs.writeFileSync(
        path.join(
          destination,
          `${candidate.contract.chart.name}-${candidate.contract.chart.version}.tgz`,
        ),
        candidate.packageBody,
      );
    }
    if (command === 'helm' && arguments[0] === 'repo' && arguments[1] === 'index') {
      const chartsDirectory = arguments[2];
      const indexedReleases = fs.readdirSync(chartsDirectory)
        .filter(filename => filename.endsWith('.tgz'))
        .map(filename => {
          const body = fs.readFileSync(path.join(chartsDirectory, filename), 'utf8');
          const release = releasesByBody.get(body);
          assert(release, `test fixture must identify staged package ${filename}`);
          return release;
        });
      fs.writeFileSync(
        path.join(chartsDirectory, 'index.yaml'),
        yaml.dump(indexFor(indexedReleases)),
      );
    }
    return '';
  };
  const chartMetadata = packagePath => {
    if (packagePath.includes(`${path.sep}oci${path.sep}`)) {
      return candidate.metadata;
    }
    const body = fs.readFileSync(packagePath, 'utf8');
    const release = releasesByBody.get(body);
    assert(release, `test fixture must identify package bytes at ${packagePath}`);
    return release.metadata;
  };
  return {
    buildDirectory,
    evidencePath,
    options: {
      contract: candidate.contract,
      buildDirectory,
      evidencePath,
      execute,
      fetchResource,
      chartMetadata,
      resolveImageDigest: () => candidate.imageDigest,
    },
  };
}

function publishFixtureBuild(fixture, candidate) {
  const chartsDirectory = path.join(fixture.buildDirectory, 'charts');
  fs.writeFileSync(
    path.join(chartsDirectory, 'release.json'),
    `${JSON.stringify(candidate.contract, null, 2)}\n`,
  );
  return chartsDirectory;
}

async function assertLegacyReleaseMigrates() {
  const first = fixtureRelease('0.1.1', '2.0.0-rc.11');
  const published = fs.mkdtempSync(
    path.join(os.tmpdir(), 'durable-workflow-helm-legacy-test-'),
  );
  writePublishedRepository(published, [first], {includeHistory: false});
  const fixture = stagingFixture(
    first,
    [first],
    directoryFetcher(published),
  );
  await stageRelease(fixture.options);
  const stagedHistory = JSON.parse(
    fs.readFileSync(
      path.join(fixture.buildDirectory, 'charts', 'release-history.json'),
      'utf8',
    ),
  );
  assert.deepStrictEqual(
    Object.keys(stagedHistory.versions),
    [first.contract.chart.version],
    'the first history-aware deployment must migrate the current live release',
  );
  const evidence = JSON.parse(fs.readFileSync(fixture.evidencePath, 'utf8'));
  assert.strictEqual(evidence.outcome, 'byte-identical-reuse');
  assert.strictEqual(evidence.live.migrated_legacy_release, true);
}

async function publishTwoSuccessiveVersions() {
  const first = fixtureRelease('0.1.1', '2.0.0-rc.11');
  const second = fixtureRelease('0.1.2', '2.0.0-rc.12');
  const emptyRepository = fs.mkdtempSync(
    path.join(os.tmpdir(), 'durable-workflow-helm-empty-test-'),
  );
  const firstFixture = stagingFixture(
    first,
    [first, second],
    directoryFetcher(emptyRepository),
  );
  await stageRelease(firstFixture.options);
  const firstPublished = publishFixtureBuild(firstFixture, first);

  const secondFixture = stagingFixture(
    second,
    [first, second],
    directoryFetcher(firstPublished),
  );
  await stageRelease(secondFixture.options);
  const secondPublished = publishFixtureBuild(secondFixture, second);
  const stagedHistory = JSON.parse(
    fs.readFileSync(path.join(secondPublished, 'release-history.json'), 'utf8'),
  );
  assert.deepStrictEqual(
    Object.keys(stagedHistory.versions),
    ['0.1.1', '0.1.2'],
    'successive publications must retain both immutable release identities',
  );
  const stagedIndex = yaml.load(
    fs.readFileSync(path.join(secondPublished, 'index.yaml'), 'utf8'),
  );
  assert.deepStrictEqual(
    stagedIndex.entries[contract.chart.name]
      .map(entry => entry.version)
      .sort(),
    ['0.1.1', '0.1.2'],
    'successive publications must retain both index entries',
  );
  const fetchPublished = directoryFetcher(secondPublished);
  for (const release of [first, second]) {
    const downloaded = await fetchPublished(
      release.contract.channels.https.package_url,
    );
    assert.strictEqual(
      downloaded.status,
      200,
      `published chart ${release.contract.chart.version} must be anonymously downloadable`,
    );
    assert.strictEqual(
      digest(downloaded.body),
      release.packageDigest,
      `published chart ${release.contract.chart.version} must retain its bytes`,
    );
  }
  return {
    first,
    second,
    published: secondPublished,
  };
}

async function assertLiveVerification(releases, published) {
  const current = releases.at(-1);
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'durable-workflow-helm-live-test-'),
  );
  const evidencePath = path.join(
    temporary,
    'helm-public-validation-evidence.json',
  );
  const releasesByVersion = new Map(
    releases.map(release => [release.contract.chart.version, release]),
  );
  const releasesByBody = new Map(
    releases.map(release => [release.packageBody, release]),
  );
  const executed = [];
  const execute = (command, arguments, options) => {
    executed.push({command, arguments, options});
    if (command === 'helm' && arguments[0] === 'pull') {
      const version = arguments[arguments.indexOf('--version') + 1];
      const pulled = releasesByVersion.get(version);
      assert(pulled, `live pull fixture must know chart ${version}`);
      const destination = arguments[arguments.indexOf('--destination') + 1];
      fs.writeFileSync(
        path.join(
          destination,
          `${contract.chart.name}-${version}.tgz`,
        ),
        pulled.packageBody,
      );
    }
    return '';
  };
  const chartMetadata = packagePath => {
    const release = releasesByBody.get(fs.readFileSync(packagePath, 'utf8'));
    assert(release, `live metadata fixture must know ${packagePath}`);
    return release.metadata;
  };

  await verifyLiveRelease({
    contract: current.contract,
    evidencePath,
    execute,
    fetchJson: async url => {
      if (url.endsWith('/release.json')) {
        return current.contract;
      }
      if (url.endsWith('/provenance.json')) {
        return current.provenance;
      }
      throw new Error(`unexpected live release URL: ${url}`);
    },
    fetchResource: directoryFetcher(published),
    chartMetadata,
    resolveImageDigest: () => current.imageDigest,
  });
  const liveRenderCommands = executed
    .filter(({command, arguments}) => command === 'helm' && arguments[0] === 'template')
    .map(({command, arguments}) => ({command, arguments}));
  assert.deepStrictEqual(
    liveRenderCommands,
    [
      renderCommand(
        'public-oci-check',
        current.contract.channels.oci.repository,
        current.contract.chart.version,
      ),
      renderCommand(
        'public-https-check',
        `durable-workflow/${current.contract.chart.name}`,
        current.contract.chart.version,
      ),
    ],
    'live verification must retain exact OCI and HTTPS template commands',
  );
  assert.deepStrictEqual(
    JSON.parse(fs.readFileSync(evidencePath, 'utf8')),
    {
      ...current.provenance,
      validation: {
        oci_anonymous_render: 'pass',
        https_anonymous_render: 'pass',
        channels_identical: true,
        https_history_index: 'pass',
        https_history_packages_anonymous: 'pass',
        https_history_versions: releases.map(
          release => release.contract.chart.version,
        ),
      },
    },
    'live verification must cover current channel equality and all HTTPS history',
  );
}

async function assertHistoricalTamperingFails(releases, published) {
  const [first] = releases;
  const firstPackagePath =
    `/charts/${first.contract.chart.name}-${first.contract.chart.version}.tgz`;
  const changedHistory = clone(historyFor(releases));
  changedHistory.versions[first.contract.chart.version].source_revision =
    'f'.repeat(40);
  const historicalTampering = [
    {
      label: 'missing durable history after successive releases',
      field: 'index_entry',
      overrides: {
        '/charts/release-history.json': missingResource,
      },
    },
    {
      label: 'missing historical package',
      field: 'package_bytes',
      overrides: {
        [firstPackagePath]: missingResource,
      },
    },
    {
      label: 'changed historical package bytes',
      field: 'package_bytes',
      overrides: {
        [firstPackagePath]: () => ({
          status: 200,
          body: Buffer.from('tampered historical package'),
        }),
      },
    },
    {
      label: 'changed historical source identity',
      field: 'source_revision',
      overrides: {
        '/charts/release-history.json': () => ({
          status: 200,
          body: Buffer.from(JSON.stringify(changedHistory)),
        }),
      },
    },
  ];

  for (const scenario of historicalTampering) {
    const next = fixtureRelease('0.1.3', '2.0.0-rc.13');
    const fixture = stagingFixture(
      next,
      releases,
      directoryFetcher(published, scenario.overrides),
    );
    await assert.rejects(
      () => stageRelease(fixture.options),
      new RegExp(scenario.field),
      `${scenario.label} must fail closed`,
    );
    assert(
      !fs.existsSync(path.join(fixture.buildDirectory, 'charts')),
      `${scenario.label} must fail before Pages staging`,
    );
  }
}

async function assertByteIdenticalHistoricalReuseStages(releases, published) {
  const [first] = releases;
  const fixture = stagingFixture(
    first,
    releases,
    directoryFetcher(published),
  );
  await stageRelease(fixture.options);
  const evidence = JSON.parse(fs.readFileSync(fixture.evidencePath, 'utf8'));
  assert.strictEqual(
    evidence.outcome,
    'byte-identical-reuse',
    'an older version may be reused only with its exact recorded identity',
  );
  assert.deepStrictEqual(
    fs.readdirSync(path.join(fixture.buildDirectory, 'charts'))
      .filter(filename => filename.endsWith('.tgz'))
      .sort(),
    releases
      .map(release =>
        `${contract.chart.name}-${release.contract.chart.version}.tgz`,
      )
      .sort(),
    'byte-identical historical reuse must retain every published package',
  );
}

async function assertFirstVersionIdentityReuseFails(releases, published) {
  const [first] = releases;
  const scenarios = [
    {
      field: 'package_bytes',
      candidate: fixtureRelease('0.1.1', '2.0.0-rc.11', {
        packageBody: 'changed candidate package',
      }),
    },
    {
      field: 'source_revision',
      candidate: fixtureRelease('0.1.1', '2.0.0-rc.11', {
        packageBody: first.packageBody,
        sourceRevision: 'd'.repeat(40),
      }),
    },
    {
      field: 'app_version',
      candidate: fixtureRelease('0.1.1', '2.0.0-rc.99', {
        packageBody: first.packageBody,
      }),
    },
    {
      field: 'image_digest',
      candidate: fixtureRelease('0.1.1', '2.0.0-rc.11', {
        packageBody: first.packageBody,
        imageDigest: `sha256:${'e'.repeat(64)}`,
      }),
    },
  ];

  for (const {field, candidate} of scenarios) {
    const fixture = stagingFixture(
      candidate,
      releases,
      directoryFetcher(published),
    );
    await assert.rejects(
      () => stageRelease(fixture.options),
      new RegExp(field),
      `changed ${field} under the first version must fail the history guard`,
    );
    assert(
      !fs.existsSync(path.join(fixture.buildDirectory, 'charts')),
      `changed ${field} must fail before Pages staging`,
    );
    const evidence = JSON.parse(fs.readFileSync(fixture.evidencePath, 'utf8'));
    assert.strictEqual(evidence.outcome, 'rejected');
    assert(
      evidence.mismatches.some(mismatch => mismatch.field === field),
      `rejection evidence must identify changed ${field}`,
    );
  }
}

async function main() {
  await assertLegacyReleaseMigrates();
  const successive = await publishTwoSuccessiveVersions();
  await assertLiveVerification(
    [successive.first, successive.second],
    successive.published,
  );
  await assertHistoricalTamperingFails(
    [successive.first, successive.second],
    successive.published,
  );
  await assertByteIdenticalHistoricalReuseStages(
    [successive.first, successive.second],
    successive.published,
  );
  await assertFirstVersionIdentityReuseFails(
    [successive.first, successive.second],
    successive.published,
  );
  console.log(
    'Helm release history preserves successive HTTPS versions and rejects ' +
      'historical package or identity drift before staging.',
  );
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
