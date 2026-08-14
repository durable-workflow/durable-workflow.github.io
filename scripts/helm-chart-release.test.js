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
  contractFromServerSource,
  installCommand,
  releaseHistoryEntry,
  releaseProvenance,
  stageRelease,
  synchronizeDocumentedInstallCommands,
  synchronizeReleaseContract,
  validateContract,
  validateRecoveryReleaseSources,
  validateReleaseHistory,
  verifyLiveRelease,
} = require('./helm-chart-release');
const contract = require('../static/charts/release.json');
const recoverySources = require('../static/charts/recovery-sources.json');
const emptyRecoverySources = {
  schema: 'durable-workflow-helm-recovery-sources/v1',
  releases: [],
};

validateContract(contract);
validateRecoveryReleaseSources(recoverySources);
assertDocumentedInstallCommands(
  fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'deployment.md'),
    'utf8',
  ),
  contract,
);

const cleanInstallValues = yaml.load(fs.readFileSync(
  path.join(__dirname, 'helm-chart-clean-client-values.yaml'),
  'utf8',
));
assert.deepStrictEqual(cleanInstallValues, {
  externalDatabase: {
    host: 'mysql.durable-workflow.svc.cluster.local',
    auth: {
      username: 'durable_workflow',
      password: 'durable_workflow',
    },
  },
  externalRedis: {
    host: 'redis.durable-workflow.svc.cluster.local',
  },
  auth: {
    serverKey: 'base64:bm90LWEtc2VjcmV0',
    workerToken: 'not-a-secret',
    operatorToken: 'not-a-secret',
    adminToken: 'not-a-secret',
  },
  server: {
    replicaCount: 1,
    pdb: {enabled: false},
  },
  worker: {replicaCount: 1},
});
const expectedInstallCommand = (releaseName, reference) => ({
  command: 'helm',
  arguments: [
    'install',
    releaseName,
    reference,
    '--version',
    contract.chart.version,
    '--namespace',
    'durable-workflow',
    '--create-namespace',
    '-f',
    'my-values.yaml',
  ],
});
const installCommands = [
  {
    actual: installCommand(
      'durable-workflow',
      contract.channels.oci.repository,
      contract.chart.version,
    ),
    expected: expectedInstallCommand(
      'durable-workflow',
      contract.channels.oci.repository,
    ),
    description: 'live anonymous OCI install',
  },
  {
    actual: installCommand(
      'durable-workflow',
      `durable-workflow/${contract.chart.name}`,
      contract.chart.version,
    ),
    expected: expectedInstallCommand(
      'durable-workflow',
      `durable-workflow/${contract.chart.name}`,
    ),
    description: 'live anonymous HTTPS install',
  },
];
for (const {actual, expected, description} of installCommands) {
  assert.deepStrictEqual(
    actual,
    expected,
    `${description} must use the clean-install fixture contract`,
  );
  assert(
    actual.arguments.includes('install'),
    `${description} must install the chart`,
  );
  assert(
    !actual.arguments.includes('--dry-run=client'),
    `${description} must not use the cluster-discovering install dry-run`,
  );
}

function assertPinnedServerContractSynchronization() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'durable-workflow-helm-contract-test-'),
  );
  const chartDirectory = path.join(
    temporary,
    'server',
    'k8s',
    'helm',
    'durable-workflow',
  );
  fs.mkdirSync(chartDirectory, {recursive: true});
  fs.writeFileSync(
    path.join(chartDirectory, 'Chart.yaml'),
    yaml.dump({
      apiVersion: 'v2',
      name: 'durable-workflow',
      version: contract.chart.version,
      appVersion: contract.chart.app_version,
      annotations: {
        'dev.durable-workflow.image-reference': contract.image.reference,
      },
    }),
  );
  fs.writeFileSync(
    path.join(chartDirectory, 'README.md'),
    `\`\`\`bash
helm install durable-workflow \\
  oci://ghcr.io/durable-workflow/charts/durable-workflow \\
  --version ${contract.chart.version} \\
  --namespace durable-workflow --create-namespace \\
  -f my-values.yaml
\`\`\`\n\n` +
      '```bash\n' +
      'helm repo add durable-workflow https://durable-workflow.github.io/charts/\n' +
      'helm repo update\n' +
      'helm install durable-workflow durable-workflow/durable-workflow \\\n' +
      `  --version ${contract.chart.version} \\\n` +
      '  --namespace durable-workflow --create-namespace \\\n' +
      '  -f my-values.yaml\n' +
      '```\n',
  );
  const contractPath = path.join(temporary, 'release.json');
  const documentationPath = path.join(temporary, 'deployment.md');
  fs.writeFileSync(
    documentationPath,
    '```bash\n' +
      'helm install durable-workflow \\\n' +
      '  oci://ghcr.io/durable-workflow/charts/durable-workflow \\\n' +
      '  --version 0.1.1 \\\n' +
      '  --namespace durable-workflow --create-namespace \\\n' +
      '  -f my-values.yaml\n' +
      '```\n\n' +
      '```bash\n' +
      'helm repo add durable-workflow https://durable-workflow.github.io/charts/\n' +
      'helm repo update\n' +
      'helm install durable-workflow durable-workflow/durable-workflow \\\n' +
      '  --version 0.1.1 \\\n' +
      '  --namespace durable-workflow --create-namespace \\\n' +
      '  -f my-values.yaml\n' +
      '```\n',
  );
  const derived = contractFromServerSource(path.join(temporary, 'server'));
  const synchronized = synchronizeReleaseContract(
    path.join(temporary, 'server'),
    contractPath,
  );
  assert.deepStrictEqual(synchronized, derived);
  synchronizeDocumentedInstallCommands(documentationPath, synchronized);
  assertDocumentedInstallCommands(
    fs.readFileSync(documentationPath, 'utf8'),
    synchronized,
  );
  assert.deepStrictEqual(
    JSON.parse(fs.readFileSync(contractPath, 'utf8')),
    contract,
    'the HTTPS mirror contract must follow the pinned published Server chart',
  );
}

assertPinnedServerContractSynchronization();

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
  const releasesByVersion = new Map(
    [...knownReleases, candidate].map(release => [
      release.contract.chart.version,
      release,
    ]),
  );
  const releasesByImageReference = new Map(
    [...knownReleases, candidate].map(release => [
      release.contract.image.reference,
      release,
    ]),
  );
  const executed = [];
  const pulledMetadata = new Map();
  const execute = (command, arguments) => {
    executed.push({command, arguments});
    if (command === 'helm' && arguments[0] === 'pull') {
      const version = arguments[arguments.indexOf('--version') + 1];
      const release = releasesByVersion.get(version);
      assert(release, `test fixture must identify OCI chart ${version}`);
      const destination = arguments[arguments.indexOf('--destination') + 1];
      const packagePath = path.join(
        destination,
        `${release.contract.chart.name}-${release.contract.chart.version}.tgz`,
      );
      fs.writeFileSync(
        packagePath,
        release.packageBody,
      );
      pulledMetadata.set(packagePath, release.metadata);
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
    if (pulledMetadata.has(packagePath)) {
      return pulledMetadata.get(packagePath);
    }
    const body = fs.readFileSync(packagePath, 'utf8');
    const release = releasesByBody.get(body);
    assert(release, `test fixture must identify package bytes at ${packagePath}`);
    return release.metadata;
  };
  return {
    buildDirectory,
    evidencePath,
    executed,
    options: {
      contract: candidate.contract,
      buildDirectory,
      evidencePath,
      execute,
      fetchResource,
      chartMetadata,
      recoverySources: emptyRecoverySources,
      resolveImageDigest: reference => {
        const release = releasesByImageReference.get(reference);
        assert(release, `test fixture must identify image ${reference}`);
        return release.imageDigest;
      },
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

async function assertDeferredRecoverySurvivesRollingContract() {
  const legacy = fixtureRelease('0.1.1', '2.0.0-rc.11');
  const recoverySource = recoverySources.releases[0];
  const deferred = fixtureRelease('0.1.24', '2.0.0-rc.33', {
    sourceRevision: recoverySource.source_revision,
  });
  assert.deepStrictEqual(
    deferred.contract,
    recoverySource.contract,
    'the retained recovery source must describe the deferred release exactly',
  );
  const current = fixtureRelease('0.1.25', '2.0.0-rc.34');
  const published = fs.mkdtempSync(
    path.join(os.tmpdir(), 'durable-workflow-helm-deferred-test-'),
  );
  writePublishedRepository(published, [legacy], {includeHistory: false});
  const fixture = stagingFixture(
    current,
    [legacy, deferred, current],
    directoryFetcher(published),
  );
  fixture.options.recoverySources = recoverySources;

  await stageRelease(fixture.options);

  const chartsDirectory = path.join(fixture.buildDirectory, 'charts');
  const history = JSON.parse(fs.readFileSync(
    path.join(chartsDirectory, 'release-history.json'),
    'utf8',
  ));
  assert.deepStrictEqual(
    Object.keys(history.versions),
    ['0.1.1', '0.1.24', '0.1.25'],
    'staging the rolling chart must also backfill the retained deferred chart',
  );
  for (const release of [legacy, deferred, current]) {
    assert.deepStrictEqual(
      fs.readFileSync(path.join(
        chartsDirectory,
        `${contract.chart.name}-${release.contract.chart.version}.tgz`,
      )),
      Buffer.from(release.packageBody),
      `staging must retain exact package bytes for ${release.contract.chart.version}`,
    );
  }
  assert.deepStrictEqual(
    fixture.executed
      .filter(({command, arguments}) =>
        command === 'helm' && arguments[0] === 'pull')
      .map(({arguments}) => arguments[arguments.indexOf('--version') + 1]),
    ['0.1.24', '0.1.25'],
    'OCI staging must pull the deferred source independently of the rolling chart',
  );
  const evidence = JSON.parse(fs.readFileSync(fixture.evidencePath, 'utf8'));
  assert.deepStrictEqual(
    evidence.live.historical_versions,
    ['0.1.1', '0.1.24', '0.1.25'],
    'predeploy evidence must retain the complete staged release history',
  );
  assert.deepStrictEqual(
    evidence.recovery_sources,
    [{
      outcome: 'first-publication',
      source_revision: recoverySource.source_revision,
      oci_repository: recoverySource.contract.channels.oci.repository,
      identity: {
        chart: {
          name: deferred.contract.chart.name,
          version: deferred.contract.chart.version,
          app_version: deferred.contract.chart.app_version,
          source_revision: recoverySource.source_revision,
          package_digest: deferred.packageDigest,
        },
        image: {
          reference: deferred.contract.image.reference,
          digest: deferred.imageDigest,
        },
      },
    }],
    'predeploy evidence must bind the deferred OCI source to its immutable identity',
  );
  await assertLiveVerification(
    [legacy, deferred, current],
    publishFixtureBuild(fixture, current),
    recoverySources,
  );

  const changedSource = clone(recoverySources);
  changedSource.releases[0].source_revision = 'f'.repeat(40);
  const mismatchFixture = stagingFixture(
    current,
    [legacy, deferred, current],
    directoryFetcher(published),
  );
  mismatchFixture.options.recoverySources = changedSource;
  await assert.rejects(
    () => stageRelease(mismatchFixture.options),
    /recovery source revision/,
    'a deferred package from a different source revision must fail closed',
  );
  assert(
    !fs.existsSync(path.join(mismatchFixture.buildDirectory, 'charts')),
    'a changed deferred source must fail before Pages staging',
  );
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

async function assertLiveVerification(
  releases,
  published,
  liveRecoverySources = emptyRecoverySources,
) {
  const current = releases.at(-1);
  const retainedRecoveries = liveRecoverySources.releases.filter(
    source => source.contract.chart.version !== current.contract.chart.version,
  );
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
    recoverySources: liveRecoverySources,
    resolveImageDigest: () => current.imageDigest,
  });
  const liveInstallCommands = executed
    .filter(({command, arguments}) => command === 'helm' && arguments[0] === 'install');
  const expectedReleaseContracts = [
    current.contract,
    ...retainedRecoveries.map(source => source.contract),
  ];
  assert.deepStrictEqual(
    liveInstallCommands.map(({command, arguments}) => ({command, arguments})),
    expectedReleaseContracts.flatMap(releaseContract => [
      installCommand(
        'durable-workflow',
        releaseContract.channels.oci.repository,
        releaseContract.chart.version,
      ),
      installCommand(
        'durable-workflow',
        `durable-workflow/${releaseContract.chart.name}`,
        releaseContract.chart.version,
      ),
    ]),
    'live verification must retain exact OCI and HTTPS install commands',
  );
  for (let index = 0; index < liveInstallCommands.length; index += 2) {
    assert.notStrictEqual(
      liveInstallCommands[index].options.env.HELM_REGISTRY_CONFIG,
      liveInstallCommands[index + 1].options.env.HELM_REGISTRY_CONFIG,
      'OCI and HTTPS verification must use independent clean Helm clients',
    );
    assert.notStrictEqual(
      liveInstallCommands[index].options.cwd,
      liveInstallCommands[index + 1].options.cwd,
      'OCI and HTTPS verification must use independent fixture directories',
    );
  }
  for (const {options} of liveInstallCommands) {
    assert.deepStrictEqual(
      yaml.load(fs.readFileSync(path.join(options.cwd, 'my-values.yaml'), 'utf8')),
      cleanInstallValues,
      'each exact README command must resolve its clean-client values file',
    );
  }
  for (const [index, releaseContract] of expectedReleaseContracts.entries()) {
    const httpsEnvironment = liveInstallCommands[(index * 2) + 1].options.env;
    assert.deepStrictEqual(
      executed
        .filter(({command, arguments, options}) =>
          command === 'helm' &&
          options.env === httpsEnvironment &&
          (arguments[0] === 'repo' || arguments[0] === 'install'))
        .map(({command, arguments}) => ({command, arguments})),
      [
        {
          command: 'helm',
          arguments: [
            'repo',
            'add',
            'durable-workflow',
            releaseContract.channels.https.repository,
          ],
        },
        {command: 'helm', arguments: ['repo', 'update']},
        installCommand(
          'durable-workflow',
          `durable-workflow/${releaseContract.chart.name}`,
          releaseContract.chart.version,
        ),
      ],
      'live verification must execute each documented HTTPS command sequence',
    );
  }
  assert.deepStrictEqual(
    JSON.parse(fs.readFileSync(evidencePath, 'utf8')),
    {
      ...current.provenance,
      validation: {
        oci_anonymous_install: 'pass',
        https_anonymous_install: 'pass',
        oci_readme_command:
          'helm install durable-workflow ' +
          `${current.contract.channels.oci.repository} ` +
          `--version ${current.contract.chart.version} ` +
          '--namespace durable-workflow --create-namespace -f my-values.yaml',
        https_readme_commands: [
          `helm repo add durable-workflow ${current.contract.channels.https.repository}`,
          'helm repo update',
          'helm install durable-workflow ' +
            `durable-workflow/${current.contract.chart.name} ` +
            `--version ${current.contract.chart.version} ` +
            '--namespace durable-workflow --create-namespace -f my-values.yaml',
        ],
        channels_identical: true,
        https_history_index: 'pass',
        https_history_packages_anonymous: 'pass',
        https_history_versions: releases.map(
          release => release.contract.chart.version,
        ),
        recovery_readme_commands: retainedRecoveries.map(source => ({
          chart_version: source.contract.chart.version,
          source_revision: source.source_revision,
          oci_readme_command:
            'helm install durable-workflow ' +
            `${source.contract.channels.oci.repository} ` +
            `--version ${source.contract.chart.version} ` +
            '--namespace durable-workflow --create-namespace -f my-values.yaml',
          https_readme_commands: [
            `helm repo add durable-workflow ${source.contract.channels.https.repository}`,
            'helm repo update',
            'helm install durable-workflow ' +
              `durable-workflow/${source.contract.chart.name} ` +
              `--version ${source.contract.chart.version} ` +
              '--namespace durable-workflow --create-namespace -f my-values.yaml',
          ],
        })),
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
  await assertDeferredRecoverySurvivesRollingContract();
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
