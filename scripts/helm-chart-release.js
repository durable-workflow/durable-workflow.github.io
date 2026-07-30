#!/usr/bin/env node

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const yaml = require('js-yaml');

const REPO_ROOT = path.join(__dirname, '..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'static', 'charts', 'release.json');
const DEFAULT_BUILD_DIRECTORY = path.join(REPO_ROOT, 'build');
const SOURCE_REVISION_ANNOTATION = 'dev.durable-workflow.source-revision';
const IMAGE_REFERENCE_ANNOTATION = 'dev.durable-workflow.image-reference';
const SEMVER_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

function releaseContract() {
  return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
}

function validateContract(contract) {
  assert.strictEqual(
    contract?.schema,
    'durable-workflow-helm-release-contract/v1',
    'Helm release contract schema',
  );
  assert.strictEqual(contract?.chart?.name, 'durable-workflow', 'Helm chart name');
  assert(
    SEMVER_PATTERN.test(contract?.chart?.version || ''),
    'Helm chart version must be SemVer',
  );
  assert(
    SEMVER_PATTERN.test(contract?.chart?.app_version || ''),
    'Helm app version must be SemVer',
  );
  assert.strictEqual(
    contract?.image?.reference,
    `docker.io/durableworkflow/server:${contract.chart.app_version}`,
    'default Helm image must be the public Server appVersion',
  );
  assert.strictEqual(
    contract?.channels?.oci?.repository,
    'oci://ghcr.io/durable-workflow/charts/durable-workflow',
    'documented OCI repository',
  );
  assert.strictEqual(
    contract?.channels?.https?.repository,
    'https://durable-workflow.github.io/charts/',
    'documented HTTPS repository',
  );
  assert.strictEqual(
    contract?.channels?.https?.package_url,
    `${contract.channels.https.repository}${contract.chart.name}-${contract.chart.version}.tgz`,
    'documented HTTPS package URL',
  );
  return contract;
}

function assertDocumentedInstallCommands(source, contract) {
  const versions = [...source.matchAll(/--version\s+([0-9]+\.[0-9]+\.[0-9]+)\s/g)]
    .map(match => match[1]);
  assert(
    versions.length >= 2 && versions.every(version => version === contract.chart.version),
    `documented Helm install commands must use chart version ${contract.chart.version}`,
  );
  assert(
    source.includes(contract.channels.oci.repository),
    'documentation must use the contracted OCI repository',
  );
  assert(
    source.includes(`helm repo add durable-workflow ${contract.channels.https.repository}`),
    'documentation must add the contracted HTTPS repository',
  );
}

function execute(command, arguments, options = {}) {
  const result = spawnSync(command, arguments, {
    cwd: options.cwd || REPO_ROOT,
    env: options.env || process.env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`${command} ${arguments.join(' ')} failed: ${detail}`);
  }
  return result.stdout;
}

function cleanHelmEnvironment(root) {
  const environment = {
    ...process.env,
    XDG_CACHE_HOME: path.join(root, 'cache'),
    XDG_CONFIG_HOME: path.join(root, 'config'),
    XDG_DATA_HOME: path.join(root, 'data'),
    HELM_REGISTRY_CONFIG: path.join(root, 'config', 'helm', 'registry.json'),
    HELM_REPOSITORY_CACHE: path.join(root, 'cache', 'helm', 'repository'),
    HELM_REPOSITORY_CONFIG: path.join(root, 'config', 'helm', 'repositories.yaml'),
  };
  fs.mkdirSync(path.dirname(environment.HELM_REGISTRY_CONFIG), {recursive: true});
  fs.mkdirSync(environment.HELM_REPOSITORY_CACHE, {recursive: true});
  return environment;
}

function sha256File(file) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
}

function packageFilename(contract) {
  return `${contract.chart.name}-${contract.chart.version}.tgz`;
}

function installArguments(releaseName, reference, version) {
  return [
    'install',
    releaseName,
    reference,
    '--version',
    version,
    '--namespace',
    'durable-workflow',
    '--dry-run=client',
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
}

function chartMetadata(packagePath, environment) {
  return yaml.load(execute('helm', ['show', 'chart', packagePath], {env: environment}));
}

function assertPackageMetadata(metadata, contract) {
  assert.strictEqual(metadata?.name, contract.chart.name, 'packaged chart name');
  assert.strictEqual(metadata?.version, contract.chart.version, 'packaged chart version');
  assert.strictEqual(
    metadata?.appVersion,
    contract.chart.app_version,
    'packaged chart appVersion',
  );
  assert.match(
    metadata?.annotations?.[SOURCE_REVISION_ANNOTATION] || '',
    /^[0-9a-f]{40}$/,
    'packaged chart source revision',
  );
  assert.strictEqual(
    metadata?.annotations?.[IMAGE_REFERENCE_ANNOTATION],
    contract.image.reference,
    'packaged chart default image identity',
  );
}

function resolveImageDigest(reference, environment = process.env) {
  const output = execute(
    'docker',
    ['buildx', 'imagetools', 'inspect', reference],
    {env: environment},
  );
  const match = output.match(/^Digest:\s*(sha256:[0-9a-f]{64})\s*$/m);
  assert(match, `anonymous image inspection must return a digest for ${reference}`);
  return match[1];
}

function releaseProvenance(contract, metadata, packageDigest, imageDigest) {
  return {
    schema: 'durable-workflow-helm-release-provenance/v1',
    chart: {
      name: contract.chart.name,
      version: contract.chart.version,
      app_version: contract.chart.app_version,
      source_revision: metadata.annotations[SOURCE_REVISION_ANNOTATION],
      package_digest: packageDigest,
    },
    image: {
      reference: contract.image.reference,
      digest: imageDigest,
    },
    channels: {
      oci: {
        repository: contract.channels.oci.repository,
        package_digest: packageDigest,
      },
      https: {
        repository: contract.channels.https.repository,
        package_url: contract.channels.https.package_url,
        package_digest: packageDigest,
      },
    },
  };
}

function assertProvenance(provenance, contract, metadata, packageDigest, imageDigest) {
  assert.deepStrictEqual(
    provenance,
    releaseProvenance(contract, metadata, packageDigest, imageDigest),
    'public Helm provenance must bind both channels to one package and image identity',
  );
}

async function fetchJson(url) {
  const request = new URL(url);
  request.searchParams.set('release_check', `${Date.now()}`);
  const response = await fetch(request, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': 'durable-workflow-helm-release-check',
    },
  });
  if (!response.ok) {
    throw new Error(`${request.href} returned HTTP ${response.status}`);
  }
  return response.json();
}

function stageRelease(options = {}) {
  const contract = validateContract(options.contract || releaseContract());
  const buildDirectory = options.buildDirectory || DEFAULT_BUILD_DIRECTORY;
  const chartsDirectory = path.join(buildDirectory, 'charts');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'durable-workflow-helm-stage-'));
  const environment = cleanHelmEnvironment(path.join(temporary, 'helm-home'));
  const pulledDirectory = path.join(temporary, 'oci');
  fs.mkdirSync(pulledDirectory, {recursive: true});
  fs.mkdirSync(chartsDirectory, {recursive: true});

  execute(
    'helm',
    [
      'pull',
      contract.channels.oci.repository,
      '--version',
      contract.chart.version,
      '--destination',
      pulledDirectory,
    ],
    {env: environment},
  );
  const sourcePackage = path.join(pulledDirectory, packageFilename(contract));
  const metadata = chartMetadata(sourcePackage, environment);
  assertPackageMetadata(metadata, contract);
  execute(
    'helm',
    installArguments(
      'docs-stage-oci-check',
      contract.channels.oci.repository,
      contract.chart.version,
    ),
    {env: environment},
  );

  const destinationPackage = path.join(chartsDirectory, packageFilename(contract));
  fs.copyFileSync(sourcePackage, destinationPackage);
  const packageDigest = sha256File(destinationPackage);
  const imageDigest = resolveImageDigest(contract.image.reference);

  execute(
    'helm',
    [
      'repo',
      'index',
      chartsDirectory,
      '--url',
      contract.channels.https.repository.replace(/\/$/, ''),
    ],
    {env: environment},
  );
  fs.writeFileSync(
    path.join(chartsDirectory, 'provenance.json'),
    `${JSON.stringify(
      releaseProvenance(contract, metadata, packageDigest, imageDigest),
      null,
      2,
    )}\n`,
  );
  console.log(
    `Staged Helm chart ${contract.chart.version} from anonymous OCI package ` +
      `${packageDigest} for the HTTPS repository.`,
  );
}

async function verifyLiveRelease(options = {}) {
  const contract = validateContract(options.contract || releaseContract());
  const remoteContract = await fetchJson(
    new URL('release.json', contract.channels.https.repository).href,
  );
  assert.deepStrictEqual(remoteContract, contract, 'live Helm release contract');

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'durable-workflow-helm-live-'));
  const environment = cleanHelmEnvironment(path.join(temporary, 'helm-home'));
  const ociDirectory = path.join(temporary, 'oci');
  const httpsDirectory = path.join(temporary, 'https');
  fs.mkdirSync(ociDirectory, {recursive: true});
  fs.mkdirSync(httpsDirectory, {recursive: true});

  execute(
    'helm',
    [
      'pull',
      contract.channels.oci.repository,
      '--version',
      contract.chart.version,
      '--destination',
      ociDirectory,
    ],
    {env: environment},
  );
  execute(
    'helm',
    ['repo', 'add', 'durable-workflow', contract.channels.https.repository],
    {env: environment},
  );
  execute('helm', ['repo', 'update'], {env: environment});
  execute(
    'helm',
    [
      'pull',
      `durable-workflow/${contract.chart.name}`,
      '--version',
      contract.chart.version,
      '--destination',
      httpsDirectory,
    ],
    {env: environment},
  );
  execute(
    'helm',
    installArguments(
      'public-oci-check',
      contract.channels.oci.repository,
      contract.chart.version,
    ),
    {env: environment},
  );
  execute(
    'helm',
    installArguments(
      'public-https-check',
      `durable-workflow/${contract.chart.name}`,
      contract.chart.version,
    ),
    {env: environment},
  );

  const filename = packageFilename(contract);
  const ociPackage = path.join(ociDirectory, filename);
  const httpsPackage = path.join(httpsDirectory, filename);
  const ociDigest = sha256File(ociPackage);
  const httpsDigest = sha256File(httpsPackage);
  assert.strictEqual(
    httpsDigest,
    ociDigest,
    'OCI and HTTPS channels must return the same packaged chart bytes',
  );

  const metadata = chartMetadata(ociPackage, environment);
  assertPackageMetadata(metadata, contract);
  const imageDockerConfig = path.join(temporary, 'docker-config');
  fs.mkdirSync(imageDockerConfig, {recursive: true});
  const imageDigest = resolveImageDigest(contract.image.reference, {
    ...process.env,
    DOCKER_CONFIG: imageDockerConfig,
  });
  const provenance = await fetchJson(
    new URL('provenance.json', contract.channels.https.repository).href,
  );
  assertProvenance(provenance, contract, metadata, ociDigest, imageDigest);

  const evidence = {
    ...provenance,
    validation: {
      oci_anonymous_install: 'pass',
      https_anonymous_install: 'pass',
      channels_identical: true,
    },
  };
  const evidencePath =
    options.evidencePath ||
    process.env.HELM_PUBLIC_VALIDATION_EVIDENCE ||
    path.join(REPO_ROOT, 'helm-public-validation-evidence.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `Clean Helm installs passed from OCI and HTTPS for ${contract.chart.name} ` +
      `${contract.chart.version}; both returned ${ociDigest}.`,
  );
}

async function main() {
  const command = process.argv[2];
  if (command === 'check') {
    const contract = validateContract(releaseContract());
    assertDocumentedInstallCommands(
      fs.readFileSync(path.join(REPO_ROOT, 'docs', 'deployment.md'), 'utf8'),
      contract,
    );
    console.log('Helm chart release contract is valid.');
  } else if (command === 'stage') {
    stageRelease();
  } else if (command === 'verify-live') {
    await verifyLiveRelease();
  } else {
    throw new Error('usage: helm-chart-release.js <check|stage|verify-live>');
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  assertDocumentedInstallCommands,
  assertPackageMetadata,
  assertProvenance,
  releaseProvenance,
  validateContract,
};
