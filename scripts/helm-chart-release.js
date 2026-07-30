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
const DEFAULT_PREDEPLOY_EVIDENCE_PATH = path.join(
  REPO_ROOT,
  'helm-predeploy-immutability-evidence.json',
);
const SOURCE_REVISION_ANNOTATION = 'dev.durable-workflow.source-revision';
const IMAGE_REFERENCE_ANNOTATION = 'dev.durable-workflow.image-reference';
const SEMVER_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const RENDER_VALUE_ARGUMENTS = Object.freeze([
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
]);

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

function sha256Buffer(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function packageFilename(contract) {
  return `${contract.chart.name}-${contract.chart.version}.tgz`;
}

function renderCommand(releaseName, reference, version) {
  return {
    command: 'helm',
    arguments: [
      'template',
      releaseName,
      reference,
      '--version',
      version,
      '--namespace',
      'durable-workflow',
      ...RENDER_VALUE_ARGUMENTS,
    ],
  };
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

async function fetchResource(url) {
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
  return {
    status: response.status,
    body: Buffer.from(await response.arrayBuffer()),
  };
}

function requireLiveResource(resource, url) {
  if (resource.status < 200 || resource.status >= 300) {
    throw new Error(`${url} returned HTTP ${resource.status}`);
  }
  return resource.body;
}

function parseLiveJson(resource, url) {
  const body = requireLiveResource(resource, url);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch (error) {
    throw new Error(`${url} did not return valid JSON: ${error.message}`);
  }
}

function identityEvidence(contract, metadata, packageDigest, imageDigest) {
  return {
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
  };
}

function writePredeployEvidence(evidence, evidencePath) {
  fs.mkdirSync(path.dirname(evidencePath), {recursive: true});
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function prepareCandidateRelease(options = {}) {
  const contract = validateContract(options.contract || releaseContract());
  const run = options.execute || execute;
  const getChartMetadata = options.chartMetadata || chartMetadata;
  const getImageDigest = options.resolveImageDigest || resolveImageDigest;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'durable-workflow-helm-stage-'));
  const environment = cleanHelmEnvironment(path.join(temporary, 'helm-home'));
  const pulledDirectory = path.join(temporary, 'oci');
  fs.mkdirSync(pulledDirectory, {recursive: true});

  run(
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
  const metadata = getChartMetadata(sourcePackage, environment);
  assertPackageMetadata(metadata, contract);
  const command = renderCommand(
    'docs-stage-oci-check',
    contract.channels.oci.repository,
    contract.chart.version,
  );
  run(command.command, command.arguments, {env: environment});
  const packageDigest = sha256File(sourcePackage);
  const imageDockerConfig = path.join(temporary, 'docker-config');
  fs.mkdirSync(imageDockerConfig, {recursive: true});
  const imageDigest = getImageDigest(contract.image.reference, {
    ...process.env,
    DOCKER_CONFIG: imageDockerConfig,
  });

  return {
    contract,
    environment,
    imageDigest,
    metadata,
    packageDigest,
    run,
    sourcePackage,
    temporary,
  };
}

function addIdentityMismatch(mismatches, field, expected, actual) {
  const actualValues =
    actual && typeof actual === 'object' && !Array.isArray(actual)
      ? Object.values(actual)
      : [actual];
  if (actualValues.some(value => value !== expected)) {
    mismatches.push({field, expected, actual});
  }
}

function captureContractMismatch(mismatches, field, assertion) {
  try {
    assertion();
  } catch (error) {
    mismatches.push({field, detail: error.message});
  }
}

async function guardChartVersionImmutability(options = {}) {
  const candidate = options.candidate || prepareCandidateRelease(options);
  const {contract, metadata, packageDigest, imageDigest} = candidate;
  const getResource = options.fetchResource || fetchResource;
  const getChartMetadata = options.chartMetadata || chartMetadata;
  const evidencePath =
    options.evidencePath ||
    process.env.HELM_PREDEPLOY_IMMUTABILITY_EVIDENCE ||
    DEFAULT_PREDEPLOY_EVIDENCE_PATH;
  const releaseUrl = new URL(
    'release.json',
    contract.channels.https.repository,
  ).href;
  const provenanceUrl = new URL(
    'provenance.json',
    contract.channels.https.repository,
  ).href;
  const packageUrl = contract.channels.https.package_url;
  const [remoteContractResource, remotePackageResource] = await Promise.all([
    getResource(releaseUrl),
    getResource(packageUrl),
  ]);
  let remoteContract = null;

  if (remoteContractResource.status !== 404) {
    remoteContract = parseLiveJson(remoteContractResource, releaseUrl);
    validateContract(remoteContract);
  }

  const baseEvidence = {
    schema: 'durable-workflow-helm-predeploy-immutability/v1',
    candidate: identityEvidence(
      contract,
      metadata,
      packageDigest,
      imageDigest,
    ),
    live: {
      contract_url: releaseUrl,
      contract_status: remoteContractResource.status,
      package_url: packageUrl,
      package_status: remotePackageResource.status,
      provenance_url: provenanceUrl,
    },
  };

  if (remotePackageResource.status === 404) {
    const contractClaimsVersion =
      remoteContract?.chart?.name === contract.chart.name &&
      remoteContract?.chart?.version === contract.chart.version;
    if (contractClaimsVersion) {
      const evidence = {
        ...baseEvidence,
        outcome: 'rejected',
        live: {
          ...baseEvidence.live,
          chart_version_exists: true,
        },
        mismatches: [
          {
            field: 'package_bytes',
            expected: packageDigest,
            actual: 'missing from the live HTTPS repository',
          },
        ],
      };
      writePredeployEvidence(evidence, evidencePath);
      throw new Error(
        `Helm chart ${contract.chart.version} is already declared by the live ` +
          'release contract but its HTTPS package is missing',
      );
    }

    const evidence = {
      ...baseEvidence,
      outcome: 'first-publication',
      live: {
        ...baseEvidence.live,
        chart_version_exists: false,
        current_chart_version: remoteContract?.chart?.version || null,
      },
      mismatches: [],
    };
    writePredeployEvidence(evidence, evidencePath);
    console.log(
      `Helm chart ${contract.chart.version} is not present in the live HTTPS ` +
        'repository; first publication may proceed.',
    );
    return {candidate, evidence};
  }

  const remotePackage = requireLiveResource(remotePackageResource, packageUrl);
  if (!remoteContract) {
    throw new Error(
      `Live HTTPS package ${packageUrl} exists without a readable release contract`,
    );
  }
  const remoteProvenanceResource = await getResource(provenanceUrl);
  const remoteProvenance = parseLiveJson(remoteProvenanceResource, provenanceUrl);
  const livePackagePath = path.join(
    candidate.temporary,
    'live',
    packageFilename(contract),
  );
  fs.mkdirSync(path.dirname(livePackagePath), {recursive: true});
  fs.writeFileSync(livePackagePath, remotePackage);
  const remoteMetadata = getChartMetadata(
    livePackagePath,
    candidate.environment,
  );
  const remotePackageDigest = sha256Buffer(remotePackage);
  const mismatches = [];

  captureContractMismatch(mismatches, 'release_contract', () => {
    validateContract(remoteContract);
    assert.deepStrictEqual(
      remoteContract,
      contract,
      'live Helm release contract must match the staged release contract',
    );
  });
  captureContractMismatch(mismatches, 'package_metadata', () => {
    assertPackageMetadata(remoteMetadata, contract);
  });
  captureContractMismatch(mismatches, 'provenance_contract', () => {
    assertProvenance(
      remoteProvenance,
      contract,
      metadata,
      packageDigest,
      imageDigest,
    );
  });
  addIdentityMismatch(
    mismatches,
    'package_bytes',
    packageDigest,
    {
      https_package: remotePackageDigest,
      provenance_chart: remoteProvenance?.chart?.package_digest,
      provenance_oci: remoteProvenance?.channels?.oci?.package_digest,
      provenance_https: remoteProvenance?.channels?.https?.package_digest,
    },
  );
  addIdentityMismatch(
    mismatches,
    'source_revision',
    metadata.annotations[SOURCE_REVISION_ANNOTATION],
    {
      https_package:
        remoteMetadata?.annotations?.[SOURCE_REVISION_ANNOTATION],
      provenance: remoteProvenance?.chart?.source_revision,
    },
  );
  addIdentityMismatch(
    mismatches,
    'app_version',
    contract.chart.app_version,
    {
      release_contract: remoteContract?.chart?.app_version,
      https_package: remoteMetadata?.appVersion,
      provenance: remoteProvenance?.chart?.app_version,
    },
  );
  addIdentityMismatch(
    mismatches,
    'image_reference',
    contract.image.reference,
    {
      release_contract: remoteContract?.image?.reference,
      https_package:
        remoteMetadata?.annotations?.[IMAGE_REFERENCE_ANNOTATION],
      provenance: remoteProvenance?.image?.reference,
    },
  );
  addIdentityMismatch(
    mismatches,
    'image_digest',
    imageDigest,
    remoteProvenance?.image?.digest,
  );

  const liveIdentity = identityEvidence(
    remoteContract,
    remoteMetadata,
    remotePackageDigest,
    remoteProvenance?.image?.digest,
  );
  const evidence = {
    ...baseEvidence,
    outcome: mismatches.length === 0 ? 'byte-identical-reuse' : 'rejected',
    live: {
      ...baseEvidence.live,
      chart_version_exists: true,
      provenance_status: remoteProvenanceResource.status,
      identity: liveIdentity,
    },
    mismatches,
  };
  writePredeployEvidence(evidence, evidencePath);

  if (mismatches.length > 0) {
    throw new Error(
      `Helm chart ${contract.chart.version} immutable identity mismatch: ` +
        mismatches.map(({field}) => field).join(', '),
    );
  }

  console.log(
    `Helm chart ${contract.chart.version} already exists with byte-identical ` +
      `package and release identity ${packageDigest}; reuse may proceed.`,
  );
  return {candidate, evidence};
}

async function stageRelease(options = {}) {
  const guarded = await guardChartVersionImmutability(options);
  const {
    contract,
    environment,
    imageDigest,
    metadata,
    packageDigest,
    run,
    sourcePackage,
  } = guarded.candidate;
  const buildDirectory = options.buildDirectory || DEFAULT_BUILD_DIRECTORY;
  const chartsDirectory = path.join(buildDirectory, 'charts');
  fs.mkdirSync(chartsDirectory, {recursive: true});
  const destinationPackage = path.join(chartsDirectory, packageFilename(contract));
  fs.copyFileSync(sourcePackage, destinationPackage);

  run(
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
  return guarded.evidence;
}

async function verifyLiveRelease(options = {}) {
  const contract = validateContract(options.contract || releaseContract());
  const run = options.execute || execute;
  const getJson = options.fetchJson || fetchJson;
  const getChartMetadata = options.chartMetadata || chartMetadata;
  const getImageDigest = options.resolveImageDigest || resolveImageDigest;
  const remoteContract = await getJson(
    new URL('release.json', contract.channels.https.repository).href,
  );
  assert.deepStrictEqual(remoteContract, contract, 'live Helm release contract');

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'durable-workflow-helm-live-'));
  const environment = cleanHelmEnvironment(path.join(temporary, 'helm-home'));
  const ociDirectory = path.join(temporary, 'oci');
  const httpsDirectory = path.join(temporary, 'https');
  fs.mkdirSync(ociDirectory, {recursive: true});
  fs.mkdirSync(httpsDirectory, {recursive: true});

  run(
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
  run(
    'helm',
    ['repo', 'add', 'durable-workflow', contract.channels.https.repository],
    {env: environment},
  );
  run('helm', ['repo', 'update'], {env: environment});
  run(
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
  const ociRenderCommand = renderCommand(
    'public-oci-check',
    contract.channels.oci.repository,
    contract.chart.version,
  );
  run(ociRenderCommand.command, ociRenderCommand.arguments, {env: environment});
  const httpsRenderCommand = renderCommand(
    'public-https-check',
    `durable-workflow/${contract.chart.name}`,
    contract.chart.version,
  );
  run(httpsRenderCommand.command, httpsRenderCommand.arguments, {env: environment});

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

  const metadata = getChartMetadata(ociPackage, environment);
  assertPackageMetadata(metadata, contract);
  const imageDockerConfig = path.join(temporary, 'docker-config');
  fs.mkdirSync(imageDockerConfig, {recursive: true});
  const imageDigest = getImageDigest(contract.image.reference, {
    ...process.env,
    DOCKER_CONFIG: imageDockerConfig,
  });
  const provenance = await getJson(
    new URL('provenance.json', contract.channels.https.repository).href,
  );
  assertProvenance(provenance, contract, metadata, ociDigest, imageDigest);

  const evidence = {
    ...provenance,
    validation: {
      oci_anonymous_render: 'pass',
      https_anonymous_render: 'pass',
      channels_identical: true,
    },
  };
  const evidencePath =
    options.evidencePath ||
    process.env.HELM_PUBLIC_VALIDATION_EVIDENCE ||
    path.join(REPO_ROOT, 'helm-public-validation-evidence.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `Anonymous Helm renders passed from OCI and HTTPS for ${contract.chart.name} ` +
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
    await stageRelease();
  } else if (command === 'pre-deploy') {
    await stageRelease();
  } else if (command === 'verify-live') {
    await verifyLiveRelease();
  } else {
    throw new Error(
      'usage: helm-chart-release.js <check|pre-deploy|stage|verify-live>',
    );
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
  guardChartVersionImmutability,
  releaseProvenance,
  renderCommand,
  stageRelease,
  validateContract,
  verifyLiveRelease,
};
