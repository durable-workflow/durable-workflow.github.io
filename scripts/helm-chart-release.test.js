const assert = require('assert');
const {
  assertDocumentedInstallCommands,
  assertPackageMetadata,
  assertProvenance,
  releaseProvenance,
  stagingRenderCommand,
  validateContract,
} = require('./helm-chart-release');
const contract = require('../static/charts/release.json');

validateContract(contract);
assertDocumentedInstallCommands(
  require('fs').readFileSync(
    require('path').join(__dirname, '..', 'docs', 'deployment.md'),
    'utf8',
  ),
  contract,
);

const stageCommand = stagingRenderCommand(
  contract.channels.oci.repository,
  contract.chart.version,
);
assert.deepStrictEqual(
  stageCommand,
  {
    command: 'helm',
    arguments: [
      'template',
      'docs-stage-oci-check',
      contract.channels.oci.repository,
      '--version',
      contract.chart.version,
      '--namespace',
      'durable-workflow',
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
    ],
  },
  'staging must render the anonymous OCI chart without Kubernetes discovery',
);
assert.notStrictEqual(
  stageCommand.arguments[0],
  'install',
  'staging must not install the chart',
);
assert(
  !stageCommand.arguments.includes('--dry-run=client'),
  'staging must not use the cluster-discovering install dry-run',
);

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

console.log('Helm chart release contract rejects version and channel drift.');
