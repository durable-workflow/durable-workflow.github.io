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

const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'durable-workflow-helm-release-test-'),
);
const evidencePath = path.join(temporary, 'helm-public-validation-evidence.json');
const livePackage = 'identical chart package';
const livePackageDigest =
  `sha256:${crypto.createHash('sha256').update(livePackage).digest('hex')}`;
const liveProvenance = releaseProvenance(
  contract,
  metadata,
  livePackageDigest,
  imageDigest,
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

verifyLiveRelease({
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
}).then(() => {
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
  console.log(
    'Helm chart release contract rejects version and channel drift, and writes live validation evidence.',
  );
}).catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
