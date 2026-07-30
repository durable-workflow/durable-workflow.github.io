const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  assertDocumentedInstallCommands,
  assertPackageMetadata,
  assertProvenance,
  releaseProvenance,
  renderCommand,
  stageRelease,
  validateContract,
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

const livePackage = 'identical chart package';
const livePackageDigest =
  `sha256:${crypto.createHash('sha256').update(livePackage).digest('hex')}`;
const liveProvenance = releaseProvenance(
  contract,
  metadata,
  livePackageDigest,
  imageDigest,
);
const jsonResource = value => ({
  status: 200,
  body: Buffer.from(JSON.stringify(value)),
});
const missingResource = () => ({status: 404, body: Buffer.alloc(0)});
const clone = value => structuredClone(value);

async function assertLiveVerification() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'durable-workflow-helm-live-test-'),
  );
  const evidencePath = path.join(
    temporary,
    'helm-public-validation-evidence.json',
  );
  const executed = [];
  const execute = (command, arguments, options) => {
    executed.push({command, arguments, options});
    if (command === 'helm' && arguments[0] === 'pull') {
      const destination = arguments[arguments.indexOf('--destination') + 1];
      fs.writeFileSync(
        path.join(
          destination,
          `${contract.chart.name}-${contract.chart.version}.tgz`,
        ),
        livePackage,
      );
    }
    return '';
  };

  await verifyLiveRelease({
    contract,
    evidencePath,
    execute,
    fetchJson: async url => {
      if (url.endsWith('/release.json')) {
        return contract;
      }
      if (url.endsWith('/provenance.json')) {
        return liveProvenance;
      }
      throw new Error(`unexpected live release URL: ${url}`);
    },
    chartMetadata: () => metadata,
    resolveImageDigest: () => imageDigest,
  });
  const liveRenderCommands = executed
    .filter(({command, arguments}) => command === 'helm' && arguments[0] === 'template')
    .map(({command, arguments}) => ({command, arguments}));
  assert.deepStrictEqual(
    liveRenderCommands,
    renderCommands.slice(1).map(({expected}) => expected),
    'live verification must execute the exact OCI and HTTPS template commands',
  );
  assert.deepStrictEqual(
    JSON.parse(fs.readFileSync(evidencePath, 'utf8')),
    {
      ...liveProvenance,
      validation: {
        oci_anonymous_render: 'pass',
        https_anonymous_render: 'pass',
        channels_identical: true,
      },
    },
    'successful live verification must write public Helm validation evidence',
  );
}

function stagingFixture(overrides = {}) {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'durable-workflow-helm-stage-test-'),
  );
  const buildDirectory = path.join(temporary, 'build');
  const evidencePath = path.join(
    temporary,
    'helm-predeploy-immutability-evidence.json',
  );
  const remoteContract = overrides.remoteContract || clone(contract);
  const remotePackage = overrides.remotePackage ?? livePackage;
  const remoteMetadata = overrides.remoteMetadata || clone(metadata);
  const remoteProvenance =
    overrides.remoteProvenance ||
    releaseProvenance(
      remoteContract,
      remoteMetadata,
      `sha256:${crypto
        .createHash('sha256')
        .update(remotePackage)
        .digest('hex')}`,
      imageDigest,
    );
  const execute = (command, arguments) => {
    if (command === 'helm' && arguments[0] === 'pull') {
      const destination = arguments[arguments.indexOf('--destination') + 1];
      fs.writeFileSync(
        path.join(
          destination,
          `${contract.chart.name}-${contract.chart.version}.tgz`,
        ),
        livePackage,
      );
    }
    return '';
  };
  const fetchResource = async url => {
    if (url.endsWith('/release.json')) {
      return overrides.releaseMissing
        ? missingResource()
        : jsonResource(remoteContract);
    }
    if (url.endsWith(`/${contract.chart.name}-${contract.chart.version}.tgz`)) {
      return overrides.packageMissing
        ? missingResource()
        : {status: 200, body: Buffer.from(remotePackage)};
    }
    if (url.endsWith('/provenance.json')) {
      return jsonResource(remoteProvenance);
    }
    throw new Error(`unexpected pre-deploy release URL: ${url}`);
  };

  return {
    buildDirectory,
    evidencePath,
    options: {
      contract,
      buildDirectory,
      evidencePath,
      execute,
      fetchResource,
      chartMetadata: packagePath =>
        packagePath.includes(`${path.sep}live${path.sep}`)
          ? remoteMetadata
          : metadata,
      resolveImageDigest: () => imageDigest,
    },
  };
}

async function assertFirstPublicationStages() {
  const previousContract = clone(contract);
  previousContract.chart.version = '0.1.0';
  previousContract.channels.https.package_url =
    'https://durable-workflow.github.io/charts/durable-workflow-0.1.0.tgz';
  const fixture = stagingFixture({
    remoteContract: previousContract,
    packageMissing: true,
  });
  await stageRelease(fixture.options);
  assert(
    fs.existsSync(
      path.join(
        fixture.buildDirectory,
        'charts',
        `${contract.chart.name}-${contract.chart.version}.tgz`,
      ),
    ),
    'a chart version absent from the live HTTPS repository must stage',
  );
  const evidence = JSON.parse(fs.readFileSync(fixture.evidencePath, 'utf8'));
  assert.strictEqual(
    evidence.outcome,
    'first-publication',
    'the pre-deploy guard must identify a first publication',
  );
  assert.strictEqual(
    evidence.live.current_chart_version,
    previousContract.chart.version,
    'first-publication evidence must retain the current live chart version',
  );
}

async function assertByteIdenticalReuseStages() {
  const fixture = stagingFixture();
  await stageRelease(fixture.options);
  assert.strictEqual(
    fs.readFileSync(
      path.join(
        fixture.buildDirectory,
        'charts',
        `${contract.chart.name}-${contract.chart.version}.tgz`,
      ),
      'utf8',
    ),
    livePackage,
    'byte-identical chart reuse must stage the guarded OCI package',
  );
  assert.strictEqual(
    JSON.parse(fs.readFileSync(fixture.evidencePath, 'utf8')).outcome,
    'byte-identical-reuse',
    'the pre-deploy guard must identify byte-identical reuse',
  );
}

async function assertChangedIdentityDoesNotStage() {
  const differentDigest = `sha256:${'d'.repeat(64)}`;
  const changedSourceMetadata = clone(metadata);
  changedSourceMetadata.annotations[
    'dev.durable-workflow.source-revision'
  ] = 'd'.repeat(40);
  const changedAppVersionProvenance = clone(liveProvenance);
  changedAppVersionProvenance.chart.app_version = '0.1.2';
  const changedImageReferenceMetadata = clone(metadata);
  changedImageReferenceMetadata.annotations[
    'dev.durable-workflow.image-reference'
  ] = 'docker.io/durableworkflow/server:changed';
  const changedImageReferenceProvenance = clone(liveProvenance);
  changedImageReferenceProvenance.image.reference =
    'docker.io/durableworkflow/server:changed';
  const changedImageDigestProvenance = clone(liveProvenance);
  changedImageDigestProvenance.image.digest = differentDigest;
  const scenarios = [
    {
      field: 'package_bytes',
      overrides: {
        remotePackage: 'changed chart package',
      },
    },
    {
      field: 'source_revision',
      overrides: {
        remoteMetadata: changedSourceMetadata,
        remoteProvenance: releaseProvenance(
          contract,
          changedSourceMetadata,
          livePackageDigest,
          imageDigest,
        ),
      },
    },
    {
      field: 'app_version',
      overrides: {
        remoteProvenance: changedAppVersionProvenance,
      },
    },
    {
      field: 'image_reference',
      overrides: {
        remoteMetadata: changedImageReferenceMetadata,
        remoteProvenance: changedImageReferenceProvenance,
      },
    },
    {
      field: 'image_digest',
      overrides: {
        remoteProvenance: changedImageDigestProvenance,
      },
    },
  ];

  for (const {field, overrides} of scenarios) {
    const fixture = stagingFixture(overrides);
    await assert.rejects(
      () => stageRelease(fixture.options),
      new RegExp(field),
      `changed ${field} must fail the pre-deploy guard`,
    );
    assert(
      !fs.existsSync(path.join(fixture.buildDirectory, 'charts')),
      `changed ${field} must fail before build/charts is written`,
    );
    const evidence = JSON.parse(
      fs.readFileSync(fixture.evidencePath, 'utf8'),
    );
    assert.strictEqual(evidence.outcome, 'rejected');
    assert(
      evidence.mismatches.some(mismatch => mismatch.field === field),
      `rejection evidence must identify changed ${field}`,
    );
  }
}

async function main() {
  await assertLiveVerification();
  await assertFirstPublicationStages();
  await assertByteIdenticalReuseStages();
  await assertChangedIdentityDoesNotStage();
  console.log(
    'Helm chart release contract rejects identity drift before staging and preserves live validation evidence.',
  );
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
