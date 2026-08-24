#!/usr/bin/env node

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const yaml = require('js-yaml');

const {retryTransientResourceRead} = require('./live-resource-retry');

const REPO_ROOT = path.join(__dirname, '..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'static', 'charts', 'release.json');
const RECOVERY_SOURCES_PATH = path.join(
  REPO_ROOT,
  'static',
  'charts',
  'recovery-sources.json',
);
const DEFAULT_BUILD_DIRECTORY = path.join(REPO_ROOT, 'build');
const DEFAULT_PREDEPLOY_EVIDENCE_PATH = path.join(
  REPO_ROOT,
  'helm-predeploy-immutability-evidence.json',
);
const CLEAN_INSTALL_VALUES_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'helm-chart-clean-client-values.yaml',
);
const RELEASE_HISTORY_FILENAME = 'release-history.json';
const RELEASE_HISTORY_SCHEMA =
  'durable-workflow-helm-release-history/v1';
const SOURCE_REVISION_ANNOTATION = 'dev.durable-workflow.source-revision';
const IMAGE_REFERENCE_ANNOTATION = 'dev.durable-workflow.image-reference';
const SEMVER_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

function releaseContract() {
  return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
}

function recoveryReleaseSources() {
  return validateRecoveryReleaseSources(
    JSON.parse(fs.readFileSync(RECOVERY_SOURCES_PATH, 'utf8')),
  );
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

function validateRecoveryReleaseSources(sourceSet) {
  assert.strictEqual(
    sourceSet?.schema,
    'durable-workflow-helm-recovery-sources/v1',
    'Helm recovery source schema',
  );
  assert(
    Array.isArray(sourceSet?.releases),
    'Helm recovery sources must contain a releases array',
  );
  const versions = new Set();
  for (const release of sourceSet.releases) {
    assert.match(
      release?.source_revision || '',
      /^[0-9a-f]{40}$/,
      'Helm recovery source revision',
    );
    const contract = validateContract(release?.contract);
    assert(
      !versions.has(contract.chart.version),
      `Helm recovery source ${contract.chart.version} must be unique`,
    );
    versions.add(contract.chart.version);
  }
  return sourceSet;
}

function contractFromServerSource(serverSource) {
  const chartDirectory = path.join(
    serverSource,
    'k8s',
    'helm',
    'durable-workflow',
  );
  const chart = yaml.load(
    fs.readFileSync(path.join(chartDirectory, 'Chart.yaml'), 'utf8'),
  );
  const imageReference =
    chart?.annotations?.[IMAGE_REFERENCE_ANNOTATION];
  const contract = validateContract({
    schema: 'durable-workflow-helm-release-contract/v1',
    chart: {
      name: chart?.name,
      version: chart?.version,
      app_version: chart?.appVersion,
    },
    image: {
      reference: imageReference,
    },
    channels: {
      oci: {
        repository: 'oci://ghcr.io/durable-workflow/charts/durable-workflow',
      },
      https: {
        repository: 'https://durable-workflow.github.io/charts/',
        package_url:
          `https://durable-workflow.github.io/charts/` +
          `durable-workflow-${chart?.version}.tgz`,
      },
    },
  });
  assertDocumentedInstallCommands(
    fs.readFileSync(path.join(chartDirectory, 'README.md'), 'utf8'),
    contract,
  );
  return contract;
}

function synchronizeReleaseContract(
  serverSource,
  contractPath = CONTRACT_PATH,
) {
  const contract = contractFromServerSource(serverSource);
  fs.mkdirSync(path.dirname(contractPath), {recursive: true});
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  console.log(
    `Synchronized Helm chart ${contract.chart.version} for Server ` +
      `${contract.chart.app_version} from the pinned published Server source.`,
  );
  return contract;
}

function synchronizeDocumentedInstallCommands(documentPath, contract) {
  const source = fs.readFileSync(documentPath, 'utf8');
  let replacements = 0;
  const synchronized = source.replace(
    /(--version\s+)[0-9]+\.[0-9]+\.[0-9]+(?=\s)/g,
    (match, prefix) => {
      replacements += 1;
      return `${prefix}${contract.chart.version}`;
    },
  );
  assert(
    replacements >= 2,
    'documentation must contain both Helm channel install versions',
  );
  assertDocumentedInstallCommands(synchronized, contract);
  fs.writeFileSync(documentPath, synchronized);
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
  const shellCommands = [...source.matchAll(/```(?:bash|sh)\r?\n([\s\S]*?)```/g)]
    .flatMap(([, block]) => block
      .replace(/\\\r?\n[ \t]*/g, ' ')
      .split(/\r?\n/)
      .map(command => command.trim().replace(/[ \t]+/g, ' '))
      .filter(Boolean));
  const requiredCommands = [
    installCommand(
      'durable-workflow',
      contract.channels.oci.repository,
      contract.chart.version,
    ),
    {
      command: 'helm',
      arguments: [
        'repo',
        'add',
        'durable-workflow',
        contract.channels.https.repository,
      ],
    },
    {command: 'helm', arguments: ['repo', 'update']},
    installCommand(
      'durable-workflow',
      `durable-workflow/${contract.chart.name}`,
      contract.chart.version,
    ),
  ];
  for (const command of requiredCommands) {
    const commandLine = [command.command, ...command.arguments].join(' ');
    assert(
      shellCommands.includes(commandLine),
      `documentation must contain the executable Helm command: ${commandLine}`,
    );
  }
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

function cleanHelmClient(root) {
  fs.mkdirSync(root, {recursive: true});
  fs.copyFileSync(
    CLEAN_INSTALL_VALUES_PATH,
    path.join(root, 'my-values.yaml'),
  );
  return {
    cwd: root,
    environment: cleanHelmEnvironment(path.join(root, 'helm-home')),
  };
}

function sha256File(file) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
}

function sha256Buffer(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function packageFilename(contract) {
  return packageFilenameForVersion(contract.chart.name, contract.chart.version);
}

function packageFilenameForVersion(chartName, version) {
  return `${chartName}-${version}.tgz`;
}

function packageUrlForVersion(contract, version) {
  return new URL(
    packageFilenameForVersion(contract.chart.name, version),
    contract.channels.https.repository,
  ).href;
}

function installCommand(releaseName, reference, version) {
  return {
    command: 'helm',
    arguments: [
      'install',
      releaseName,
      reference,
      '--version',
      version,
      '--namespace',
      'durable-workflow',
      '--create-namespace',
      '-f',
      'my-values.yaml',
    ],
  };
}

function uninstallRelease(run, environment) {
  run(
    'helm',
    [
      'uninstall',
      'durable-workflow',
      '--namespace',
      'durable-workflow',
      '--wait',
      '--timeout',
      '5m',
    ],
    {env: environment},
  );
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

async function fetchResourceOnce(url) {
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

function fetchResource(url, options = {}) {
  const requestOnce = options.requestOnce || fetchResourceOnce;
  return retryTransientResourceRead(
    () => requestOnce(url),
    {url, ...options.retryOptions},
  );
}

function liveResourceFetcher(options) {
  if (options.fetchResource) {
    return options.fetchResource;
  }
  return url => fetchResource(url, {
    requestOnce: options.fetchResourceOnce,
    retryOptions: options.liveResourceRetryOptions,
  });
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

function parseLiveYaml(resource, url) {
  const body = requireLiveResource(resource, url);
  try {
    return yaml.load(body.toString('utf8'));
  } catch (error) {
    throw new Error(`${url} did not return valid YAML: ${error.message}`);
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

function releaseHistoryEntry(contract, metadata, packageDigest, imageDigest) {
  return {
    package_url: packageUrlForVersion(contract, contract.chart.version),
    package_digest: packageDigest,
    source_revision: metadata.annotations[SOURCE_REVISION_ANNOTATION],
    app_version: contract.chart.app_version,
    image_reference: contract.image.reference,
    image_digest: imageDigest,
  };
}

function emptyReleaseHistory(contract) {
  return {
    schema: RELEASE_HISTORY_SCHEMA,
    chart: {
      name: contract.chart.name,
    },
    versions: {},
  };
}

function validateReleaseHistory(history, contract) {
  assert.strictEqual(
    history?.schema,
    RELEASE_HISTORY_SCHEMA,
    'Helm release history schema',
  );
  assert.strictEqual(
    history?.chart?.name,
    contract.chart.name,
    'Helm release history chart name',
  );
  assert(
    history?.versions &&
      typeof history.versions === 'object' &&
      !Array.isArray(history.versions),
    'Helm release history versions must be an object',
  );

  const requiredFields = [
    'app_version',
    'image_digest',
    'image_reference',
    'package_digest',
    'package_url',
    'source_revision',
  ];
  for (const [version, entry] of Object.entries(history.versions)) {
    assert(
      SEMVER_PATTERN.test(version),
      `Helm release history version ${version} must be SemVer`,
    );
    assert(
      entry && typeof entry === 'object' && !Array.isArray(entry),
      `Helm release history version ${version} must have an identity object`,
    );
    assert.deepStrictEqual(
      Object.keys(entry).sort(),
      requiredFields,
      `Helm release history version ${version} identity fields`,
    );
    assert.strictEqual(
      entry.package_url,
      packageUrlForVersion(contract, version),
      `Helm release history version ${version} package URL`,
    );
    assert(
      DIGEST_PATTERN.test(entry.package_digest || ''),
      `Helm release history version ${version} package digest`,
    );
    assert.match(
      entry.source_revision || '',
      /^[0-9a-f]{40}$/,
      `Helm release history version ${version} source revision`,
    );
    assert(
      SEMVER_PATTERN.test(entry.app_version || ''),
      `Helm release history version ${version} app version`,
    );
    assert.strictEqual(
      entry.image_reference,
      `docker.io/durableworkflow/server:${entry.app_version}`,
      `Helm release history version ${version} image reference`,
    );
    assert(
      DIGEST_PATTERN.test(entry.image_digest || ''),
      `Helm release history version ${version} image digest`,
    );
  }
  return history;
}

function sortedReleaseHistory(history) {
  return {
    ...history,
    versions: Object.fromEntries(
      Object.entries(history.versions).sort(([left], [right]) =>
        left.localeCompare(right, undefined, {numeric: true}),
      ),
    ),
  };
}

function historyIdentityMismatches(expected, actual) {
  const fieldNames = {
    package_url: 'package_url',
    package_digest: 'package_bytes',
    source_revision: 'source_revision',
    app_version: 'app_version',
    image_reference: 'image_reference',
    image_digest: 'image_digest',
  };
  return Object.entries(fieldNames)
    .filter(([key]) => expected?.[key] !== actual?.[key])
    .map(([key, field]) => ({
      field,
      expected: expected?.[key],
      actual: actual?.[key],
    }));
}

function assertHistoryIndex(index, history) {
  const entries = index?.entries?.[history.chart.name];
  assert(
    Array.isArray(entries),
    `live Helm index must contain chart ${history.chart.name}`,
  );
  assert.deepStrictEqual(
    entries.map(entry => entry?.version).sort(),
    Object.keys(history.versions).sort(),
    `live Helm index versions for ${history.chart.name} must exactly match durable history`,
  );

  for (const [version, identity] of Object.entries(history.versions)) {
    const matches = entries.filter(entry => entry?.version === version);
    assert.strictEqual(
      matches.length,
      1,
      `live Helm index must contain exactly one entry for ${history.chart.name} ${version}`,
    );
    assert.strictEqual(
      matches[0].digest,
      identity.package_digest.replace(/^sha256:/, ''),
      `live Helm index package digest for ${history.chart.name} ${version}`,
    );
    assert.strictEqual(
      Array.isArray(matches[0].urls) ? matches[0].urls[0] : undefined,
      identity.package_url,
      `live Helm index primary package URL for ${history.chart.name} ${version}`,
    );
  }
}

async function verifyLiveHttpsReleaseHistory(options = {}) {
  const contract = validateContract(options.contract || releaseContract());
  const getResource = liveResourceFetcher(options);
  const getChartMetadata = options.chartMetadata || chartMetadata;
  const ownsTemporaryDirectory = !options.temporaryDirectory;
  const temporaryDirectory =
    options.temporaryDirectory ||
    fs.mkdtempSync(path.join(os.tmpdir(), 'durable-workflow-helm-history-'));
  const environment =
    options.environment ||
    cleanHelmEnvironment(path.join(temporaryDirectory, 'helm-home'));
  const historyUrl = new URL(
    RELEASE_HISTORY_FILENAME,
    contract.channels.https.repository,
  ).href;
  const indexUrl = new URL(
    'index.yaml',
    contract.channels.https.repository,
  ).href;

  try {
    const [historyResource, indexResource] = await Promise.all([
      getResource(historyUrl),
      getResource(indexUrl),
    ]);
    const history = validateReleaseHistory(
      parseLiveJson(historyResource, historyUrl),
      contract,
    );
    assertHistoryIndex(parseLiveYaml(indexResource, indexUrl), history);
    assert(
      history.versions[contract.chart.version],
      `live Helm release history must contain current version ${contract.chart.version}`,
    );

    for (const [version, entry] of Object.entries(history.versions)) {
      const packageResource = await getResource(entry.package_url);
      const packageBody = requireLiveResource(packageResource, entry.package_url);
      assert.strictEqual(
        sha256Buffer(packageBody),
        entry.package_digest,
        `live Helm release history package digest for ${version}`,
      );
      const packagePath = path.join(
        temporaryDirectory,
        'packages',
        packageFilenameForVersion(contract.chart.name, version),
      );
      fs.mkdirSync(path.dirname(packagePath), {recursive: true});
      fs.writeFileSync(packagePath, packageBody);
      const historicalContract = contractForHistoryVersion(
        contract,
        version,
        entry,
      );
      const historicalMetadata = getChartMetadata(packagePath, environment);
      assertPackageMetadata(historicalMetadata, historicalContract);
      assert.deepStrictEqual(
        releaseHistoryEntry(
          historicalContract,
          historicalMetadata,
          entry.package_digest,
          entry.image_digest,
        ),
        entry,
        `live Helm release history identity for ${version}`,
      );
    }

    return history;
  } finally {
    if (ownsTemporaryDirectory) {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    }
  }
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
  if (options.sourceRevision) {
    assert.strictEqual(
      metadata.annotations[SOURCE_REVISION_ANNOTATION],
      options.sourceRevision,
      `packaged chart ${contract.chart.version} recovery source revision`,
    );
  }
  run(
    'helm',
    [
      'template',
      'docs-stage-oci-check',
      contract.channels.oci.repository,
      '--version',
      contract.chart.version,
      '--namespace',
      'durable-workflow',
      '-f',
      CLEAN_INSTALL_VALUES_PATH,
    ],
    {env: environment},
  );
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

function selectedRecoveryReleaseSources(options, contract) {
  const sourceSet = options.recoverySources === undefined
    ? recoveryReleaseSources()
    : validateRecoveryReleaseSources(options.recoverySources);
  const matchingCurrent = sourceSet.releases.find(
    release => release.contract.chart.version === contract.chart.version,
  );
  if (matchingCurrent) {
    assert.deepStrictEqual(
      matchingCurrent.contract,
      contract,
      `current Helm chart ${contract.chart.version} must match its recovery source`,
    );
  }
  return {
    currentSourceRevision: matchingCurrent?.source_revision,
    pending: sourceSet.releases.filter(
      release => release.contract.chart.version !== contract.chart.version,
    ),
  };
}

function mergeGuardedReleaseHistory(guardedReleases, contract) {
  const history = emptyReleaseHistory(contract);
  const packages = new Map();
  for (const guarded of guardedReleases) {
    for (const [version, entry] of Object.entries(guarded.history.versions)) {
      if (history.versions[version]) {
        assert.deepStrictEqual(
          history.versions[version],
          entry,
          `Helm release ${version} must have one immutable history identity`,
        );
      } else {
        history.versions[version] = entry;
      }
    }
    for (const [version, packageBody] of guarded.historicalPackages) {
      if (packages.has(version)) {
        assert(
          packages.get(version).equals(packageBody),
          `Helm release ${version} must have one immutable package`,
        );
      } else {
        packages.set(version, packageBody);
      }
    }
    const version = guarded.candidate.contract.chart.version;
    const packageBody = fs.readFileSync(guarded.candidate.sourcePackage);
    if (packages.has(version)) {
      assert(
        packages.get(version).equals(packageBody),
        `Helm release ${version} candidate must match its historical package`,
      );
    } else {
      packages.set(version, packageBody);
    }
  }
  const sortedHistory = sortedReleaseHistory(
    validateReleaseHistory(history, contract),
  );
  assert.deepStrictEqual(
    [...packages.keys()].sort(),
    Object.keys(sortedHistory.versions).sort(),
    'every Helm release history identity must have staged package bytes',
  );
  return {history: sortedHistory, packages};
}

function captureContractMismatch(mismatches, field, assertion) {
  try {
    assertion();
  } catch (error) {
    mismatches.push({field, detail: error.message});
  }
}

function contractForHistoryVersion(contract, version, entry) {
  return validateContract({
    ...contract,
    chart: {
      ...contract.chart,
      version,
      app_version: entry.app_version,
    },
    image: {
      reference: entry.image_reference,
    },
    channels: {
      ...contract.channels,
      https: {
        ...contract.channels.https,
        package_url: entry.package_url,
      },
    },
  });
}

function writeTemporaryPackage(candidate, version, body) {
  const packagePath = path.join(
    candidate.temporary,
    'live',
    packageFilenameForVersion(candidate.contract.chart.name, version),
  );
  fs.mkdirSync(path.dirname(packagePath), {recursive: true});
  fs.writeFileSync(packagePath, body);
  return packagePath;
}

function rejectedEvidence(baseEvidence, mismatches) {
  return {
    ...baseEvidence,
    outcome: 'rejected',
    mismatches,
  };
}

async function guardChartVersionImmutability(options = {}) {
  const candidate = options.candidate || prepareCandidateRelease(options);
  const {contract, metadata, packageDigest, imageDigest} = candidate;
  const getResource = liveResourceFetcher(options);
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
  const historyUrl = new URL(
    RELEASE_HISTORY_FILENAME,
    contract.channels.https.repository,
  ).href;
  const indexUrl = new URL(
    'index.yaml',
    contract.channels.https.repository,
  ).href;
  const candidatePackageUrl = contract.channels.https.package_url;
  const [
    remoteContractResource,
    remoteHistoryResource,
    remoteIndexResource,
    candidatePackageResource,
  ] = await Promise.all([
    getResource(releaseUrl),
    getResource(historyUrl),
    getResource(indexUrl),
    getResource(candidatePackageUrl),
  ]);
  let remoteContract = null;

  const baseEvidence = {
    schema: 'durable-workflow-helm-predeploy-immutability/v2',
    candidate: identityEvidence(
      contract,
      metadata,
      packageDigest,
      imageDigest,
    ),
    live: {
      contract_url: releaseUrl,
      contract_status: remoteContractResource.status,
      history_url: historyUrl,
      history_status: remoteHistoryResource.status,
      index_url: indexUrl,
      index_status: remoteIndexResource.status,
      candidate_package_url: candidatePackageUrl,
      candidate_package_status: candidatePackageResource.status,
      provenance_url: provenanceUrl,
    },
  };
  const mismatches = [];
  const historicalPackages = new Map();
  let history;
  let migratedLegacyRelease = false;

  try {
    if (remoteContractResource.status !== 404) {
      remoteContract = parseLiveJson(remoteContractResource, releaseUrl);
      validateContract(remoteContract);
    }

    if (remoteHistoryResource.status === 404) {
      history = emptyReleaseHistory(contract);
      if (remoteContract) {
        migratedLegacyRelease = true;
        const version = remoteContract.chart.version;
        const packageUrl = remoteContract.channels.https.package_url;
        const packageResource =
          packageUrl === candidatePackageUrl
            ? candidatePackageResource
            : await getResource(packageUrl);
        if (packageResource.status < 200 || packageResource.status >= 300) {
          mismatches.push({
            field: 'package_bytes',
            version,
            expected: 'an anonymously downloadable historical package',
            actual: `HTTP ${packageResource.status}`,
          });
        } else {
          const packageBody = requireLiveResource(packageResource, packageUrl);
          const packagePath = writeTemporaryPackage(
            candidate,
            version,
            packageBody,
          );
          const packageMetadata = getChartMetadata(
            packagePath,
            candidate.environment,
          );
          const remoteProvenanceResource = await getResource(provenanceUrl);
          const remoteProvenance = parseLiveJson(
            remoteProvenanceResource,
            provenanceUrl,
          );
          const remotePackageDigest = sha256Buffer(packageBody);

          captureContractMismatch(mismatches, 'package_metadata', () => {
            assertPackageMetadata(packageMetadata, remoteContract);
          });
          captureContractMismatch(mismatches, 'provenance_contract', () => {
            assertProvenance(
              remoteProvenance,
              remoteContract,
              packageMetadata,
              remotePackageDigest,
              remoteProvenance?.image?.digest,
            );
          });
          history.versions[version] = releaseHistoryEntry(
            remoteContract,
            packageMetadata,
            remotePackageDigest,
            remoteProvenance?.image?.digest,
          );
          historicalPackages.set(version, packageBody);
        }
      } else {
        if (remoteIndexResource.status !== 404) {
          mismatches.push({
            field: 'index_entry',
            expected: 'no index before the first publication',
            actual: `HTTP ${remoteIndexResource.status}`,
          });
        }
        if (candidatePackageResource.status !== 404) {
          mismatches.push({
            field: 'package_bytes',
            version: contract.chart.version,
            expected: 'no package outside the durable release history',
            actual: `HTTP ${candidatePackageResource.status}`,
          });
        }
      }
    } else {
      history = parseLiveJson(remoteHistoryResource, historyUrl);
      validateReleaseHistory(history, contract);
      if (!remoteContract) {
        mismatches.push({
          field: 'release_contract',
          expected: 'a current release contract for the durable history',
          actual: `HTTP ${remoteContractResource.status}`,
        });
      }
    }

    if (remoteContract && !history.versions[remoteContract.chart.version]) {
      mismatches.push({
        field: 'release_history',
        version: remoteContract.chart.version,
        expected: 'the current release identity in durable history',
        actual: 'missing',
      });
    }

    if (
      Object.keys(history.versions).length > 0 &&
      remoteIndexResource.status !== 404
    ) {
      captureContractMismatch(mismatches, 'index_entry', () => {
        assertHistoryIndex(
          parseLiveYaml(remoteIndexResource, indexUrl),
          history,
        );
      });
    } else if (
      Object.keys(history.versions).length > 0 &&
      remoteIndexResource.status === 404
    ) {
      mismatches.push({
        field: 'index_entry',
        expected: 'an index containing every historical release',
        actual: 'missing from the live HTTPS repository',
      });
    }

    if (!migratedLegacyRelease) {
      const packageResources = await Promise.all(
        Object.entries(history.versions).map(async ([version, entry]) => {
          const resource =
            entry.package_url === candidatePackageUrl
              ? candidatePackageResource
              : await getResource(entry.package_url);
          return [version, entry, resource];
        }),
      );

      for (const [version, entry, resource] of packageResources) {
        if (resource.status < 200 || resource.status >= 300) {
          mismatches.push({
            field: 'package_bytes',
            version,
            expected: entry.package_digest,
            actual: `HTTP ${resource.status}`,
          });
          continue;
        }
        const packageBody = requireLiveResource(resource, entry.package_url);
        const packagePath = writeTemporaryPackage(
          candidate,
          version,
          packageBody,
        );
        const actualPackageDigest = sha256Buffer(packageBody);
        if (actualPackageDigest !== entry.package_digest) {
          mismatches.push({
            field: 'package_bytes',
            version,
            expected: entry.package_digest,
            actual: actualPackageDigest,
          });
        }
        let packageMetadata;
        try {
          packageMetadata = getChartMetadata(
            packagePath,
            candidate.environment,
          );
        } catch (error) {
          mismatches.push({
            field: 'package_metadata',
            version,
            detail: error.message,
          });
          continue;
        }
        const historicalContract = contractForHistoryVersion(
          contract,
          version,
          entry,
        );
        captureContractMismatch(mismatches, 'package_metadata', () => {
          assertPackageMetadata(packageMetadata, historicalContract);
        });
        mismatches.push(
          ...historyIdentityMismatches(
            entry,
            releaseHistoryEntry(
              historicalContract,
              packageMetadata,
              actualPackageDigest,
              entry.image_digest,
            ),
          ).map(mismatch => ({...mismatch, version})),
        );
        historicalPackages.set(version, packageBody);
      }
    }

    if (remoteContract && history.versions[remoteContract.chart.version]) {
      const version = remoteContract.chart.version;
      const entry = history.versions[version];
      const packageBody = historicalPackages.get(version);
      if (packageBody) {
        const packagePath = writeTemporaryPackage(
          candidate,
          version,
          packageBody,
        );
        const packageMetadata = getChartMetadata(
          packagePath,
          candidate.environment,
        );
        const remoteProvenanceResource = await getResource(provenanceUrl);
        const remoteProvenance = parseLiveJson(
          remoteProvenanceResource,
          provenanceUrl,
        );
        captureContractMismatch(mismatches, 'release_contract', () => {
          assert.deepStrictEqual(
            releaseHistoryEntry(
              remoteContract,
              packageMetadata,
              sha256Buffer(packageBody),
              remoteProvenance?.image?.digest,
            ),
            entry,
            'current release contract and provenance must match durable history',
          );
        });
        captureContractMismatch(mismatches, 'provenance_contract', () => {
          assertProvenance(
            remoteProvenance,
            remoteContract,
            packageMetadata,
            entry.package_digest,
            entry.image_digest,
          );
        });
      }
    }
  } catch (error) {
    mismatches.push({
      field: 'release_history',
      detail: error.message,
    });
  }

  const candidateEntry = releaseHistoryEntry(
    contract,
    metadata,
    packageDigest,
    imageDigest,
  );
  const historicalCandidate = history?.versions?.[contract.chart.version];
  if (historicalCandidate) {
    mismatches.push(
      ...historyIdentityMismatches(
        historicalCandidate,
        candidateEntry,
      ).map(mismatch => ({
        ...mismatch,
        version: contract.chart.version,
      })),
    );
  } else if (candidatePackageResource.status !== 404) {
    mismatches.push({
      field: 'package_bytes',
      version: contract.chart.version,
      expected: 'no package outside the durable release history',
      actual: `HTTP ${candidatePackageResource.status}`,
    });
  }

  if (mismatches.length > 0) {
    const evidence = rejectedEvidence(
      {
        ...baseEvidence,
        live: {
          ...baseEvidence.live,
          historical_versions: Object.keys(history?.versions || {}).sort(),
          migrated_legacy_release: migratedLegacyRelease,
        },
      },
      mismatches,
    );
    writePredeployEvidence(evidence, evidencePath);
    const liveResourceDetails = mismatches
      .map(mismatch => mismatch.detail)
      .filter(detail => detail?.includes('Live resource read failed'));
    throw new Error(
      `Helm chart ${contract.chart.version} durable release history rejected: ` +
        [...new Set(mismatches.map(({field}) => field))].join(', ') +
        (liveResourceDetails.length > 0
          ? `; ${[...new Set(liveResourceDetails)].join('; ')}`
          : ''),
    );
  }

  if (!history) {
    const evidence = rejectedEvidence(baseEvidence, [{
      field: 'release_history',
      detail: 'live release history could not be loaded',
    }]);
    writePredeployEvidence(evidence, evidencePath);
    throw new Error('Helm durable release history could not be loaded');
  }

  history.versions[contract.chart.version] = candidateEntry;
  history = sortedReleaseHistory(validateReleaseHistory(history, contract));
  const outcome = historicalCandidate
    ? 'byte-identical-reuse'
    : 'first-publication';
  const evidence = {
    ...baseEvidence,
    outcome,
    live: {
      ...baseEvidence.live,
      chart_version_exists: Boolean(historicalCandidate),
      current_chart_version: remoteContract?.chart?.version || null,
      historical_versions: Object.keys(history.versions),
      migrated_legacy_release: migratedLegacyRelease,
    },
    mismatches: [],
  };
  writePredeployEvidence(evidence, evidencePath);

  if (historicalCandidate) {
    console.log(
      `Helm chart ${contract.chart.version} already exists with byte-identical ` +
        `package and release identity ${packageDigest}; reuse may proceed.`,
    );
  } else {
    console.log(
      `Helm chart ${contract.chart.version} is not present in the durable ` +
        'release history; first publication may proceed.',
    );
  }
  return {
    candidate,
    evidence,
    historicalPackages,
    history,
  };
}

async function stageRelease(options = {}) {
  const contract = validateContract(options.contract || releaseContract());
  const recovery = selectedRecoveryReleaseSources(options, contract);
  const evidencePath =
    options.evidencePath ||
    process.env.HELM_PREDEPLOY_IMMUTABILITY_EVIDENCE ||
    DEFAULT_PREDEPLOY_EVIDENCE_PATH;
  const recovered = [];
  for (const source of recovery.pending) {
    const candidate = prepareCandidateRelease({
      ...options,
      candidate: undefined,
      contract: source.contract,
      sourceRevision: source.source_revision,
    });
    const guarded = await guardChartVersionImmutability({
      ...options,
      candidate,
      contract: source.contract,
      evidencePath,
    });
    recovered.push({guarded, source});
  }
  const currentCandidate = options.candidate || prepareCandidateRelease({
    ...options,
    contract,
    sourceRevision: recovery.currentSourceRevision,
  });
  if (recovery.currentSourceRevision) {
    assert.strictEqual(
      currentCandidate.metadata.annotations[SOURCE_REVISION_ANNOTATION],
      recovery.currentSourceRevision,
      `packaged chart ${contract.chart.version} recovery source revision`,
    );
  }
  const guarded = await guardChartVersionImmutability({
    ...options,
    candidate: currentCandidate,
    contract,
    evidencePath,
  });
  const combined = mergeGuardedReleaseHistory(
    [...recovered.map(({guarded: recoveryGuard}) => recoveryGuard), guarded],
    contract,
  );
  const {
    environment,
    imageDigest,
    metadata,
    packageDigest,
    run,
  } = guarded.candidate;
  const buildDirectory = options.buildDirectory || DEFAULT_BUILD_DIRECTORY;
  const chartsDirectory = path.join(buildDirectory, 'charts');
  fs.mkdirSync(chartsDirectory, {recursive: true});
  for (const [version, packageBody] of combined.packages) {
    fs.writeFileSync(
      path.join(
        chartsDirectory,
        packageFilenameForVersion(contract.chart.name, version),
      ),
      packageBody,
    );
  }

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
  assertHistoryIndex(
    yaml.load(fs.readFileSync(path.join(chartsDirectory, 'index.yaml'), 'utf8')),
    combined.history,
  );
  fs.writeFileSync(
    path.join(chartsDirectory, 'provenance.json'),
    `${JSON.stringify(
      releaseProvenance(contract, metadata, packageDigest, imageDigest),
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(chartsDirectory, RELEASE_HISTORY_FILENAME),
    `${JSON.stringify(combined.history, null, 2)}\n`,
  );
  const evidence = {
    ...guarded.evidence,
    live: {
      ...guarded.evidence.live,
      historical_versions: Object.keys(combined.history.versions),
    },
    recovery_sources: recovered.map(({guarded: recoveryGuard, source}) => ({
      outcome: recoveryGuard.evidence.outcome,
      source_revision: source.source_revision,
      oci_repository: source.contract.channels.oci.repository,
      identity: recoveryGuard.evidence.candidate,
    })),
  };
  writePredeployEvidence(evidence, evidencePath);
  console.log(
    `Staged ${Object.keys(combined.history.versions).length} immutable Helm ` +
      `release(s), including current ${contract.chart.version} from anonymous OCI ` +
      `package ${packageDigest}, for the HTTPS repository.`,
  );
  return evidence;
}

async function verifyLiveRelease(options = {}) {
  const contract = validateContract(options.contract || releaseContract());
  const recovery = selectedRecoveryReleaseSources(options, contract);
  const run = options.execute || execute;
  const getResource = liveResourceFetcher(options);
  const getChartMetadata = options.chartMetadata || chartMetadata;
  const getImageDigest = options.resolveImageDigest || resolveImageDigest;
  const releaseUrl = new URL(
    'release.json',
    contract.channels.https.repository,
  ).href;
  const remoteContract = parseLiveJson(
    await getResource(releaseUrl),
    releaseUrl,
  );
  assert.deepStrictEqual(remoteContract, contract, 'live Helm release contract');

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'durable-workflow-helm-live-'));
  const ociClient = cleanHelmClient(path.join(temporary, 'oci-client'));
  const httpsClient = cleanHelmClient(path.join(temporary, 'https-client'));
  const ociEnvironment = ociClient.environment;
  const httpsEnvironment = httpsClient.environment;
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
    {env: ociEnvironment},
  );
  run(
    'helm',
    ['repo', 'add', 'durable-workflow', contract.channels.https.repository],
    {env: httpsEnvironment},
  );
  run('helm', ['repo', 'update'], {env: httpsEnvironment});
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
    {env: httpsEnvironment},
  );
  const ociInstallCommand = installCommand(
    'durable-workflow',
    contract.channels.oci.repository,
    contract.chart.version,
  );
  run(ociInstallCommand.command, ociInstallCommand.arguments, {
    cwd: ociClient.cwd,
    env: ociEnvironment,
  });
  uninstallRelease(run, ociEnvironment);
  const httpsInstallCommand = installCommand(
    'durable-workflow',
    `durable-workflow/${contract.chart.name}`,
    contract.chart.version,
  );
  run(httpsInstallCommand.command, httpsInstallCommand.arguments, {
    cwd: httpsClient.cwd,
    env: httpsEnvironment,
  });

  const recoveryInstallEvidence = [];
  if (recovery.pending.length > 0) {
    uninstallRelease(run, httpsEnvironment);
  }
  for (const source of recovery.pending) {
    const version = source.contract.chart.version;
    const clientName = version.replace(/[^0-9A-Za-z]+/g, '-');
    const recoveryOciClient = cleanHelmClient(
      path.join(temporary, `recovery-${clientName}-oci-client`),
    );
    const recoveryHttpsClient = cleanHelmClient(
      path.join(temporary, `recovery-${clientName}-https-client`),
    );
    const recoveryOciInstall = installCommand(
      'durable-workflow',
      source.contract.channels.oci.repository,
      version,
    );
    run(recoveryOciInstall.command, recoveryOciInstall.arguments, {
      cwd: recoveryOciClient.cwd,
      env: recoveryOciClient.environment,
    });
    uninstallRelease(run, recoveryOciClient.environment);
    run(
      'helm',
      [
        'repo',
        'add',
        'durable-workflow',
        source.contract.channels.https.repository,
      ],
      {env: recoveryHttpsClient.environment},
    );
    run('helm', ['repo', 'update'], {env: recoveryHttpsClient.environment});
    const recoveryHttpsInstall = installCommand(
      'durable-workflow',
      `durable-workflow/${source.contract.chart.name}`,
      version,
    );
    run(recoveryHttpsInstall.command, recoveryHttpsInstall.arguments, {
      cwd: recoveryHttpsClient.cwd,
      env: recoveryHttpsClient.environment,
    });
    uninstallRelease(run, recoveryHttpsClient.environment);
    recoveryInstallEvidence.push({
      chart_version: version,
      source_revision: source.source_revision,
      oci_readme_command: [
        recoveryOciInstall.command,
        ...recoveryOciInstall.arguments,
      ].join(' '),
      https_readme_commands: [
        `helm repo add durable-workflow ${source.contract.channels.https.repository}`,
        'helm repo update',
        [
          recoveryHttpsInstall.command,
          ...recoveryHttpsInstall.arguments,
        ].join(' '),
      ],
    });
  }

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

  const metadata = getChartMetadata(ociPackage, ociEnvironment);
  assertPackageMetadata(metadata, contract);
  if (recovery.currentSourceRevision) {
    assert.strictEqual(
      metadata.annotations[SOURCE_REVISION_ANNOTATION],
      recovery.currentSourceRevision,
      `live Helm recovery source revision for ${contract.chart.version}`,
    );
  }
  const imageDockerConfig = path.join(temporary, 'docker-config');
  fs.mkdirSync(imageDockerConfig, {recursive: true});
  const imageDigest = getImageDigest(contract.image.reference, {
    ...process.env,
    DOCKER_CONFIG: imageDockerConfig,
  });
  const provenanceUrl = new URL(
    'provenance.json',
    contract.channels.https.repository,
  ).href;
  const provenance = parseLiveJson(
    await getResource(provenanceUrl),
    provenanceUrl,
  );
  assertProvenance(provenance, contract, metadata, ociDigest, imageDigest);
  const history = await verifyLiveHttpsReleaseHistory({
    contract,
    fetchResource: getResource,
    chartMetadata: getChartMetadata,
    temporaryDirectory: path.join(temporary, 'history'),
    environment: httpsEnvironment,
  });

  assert.deepStrictEqual(
    history.versions[contract.chart.version],
    releaseHistoryEntry(
      contract,
      metadata,
      ociDigest,
      imageDigest,
    ),
    'current OCI, HTTPS, provenance, and durable history identities',
  );
  for (const source of recovery.pending) {
    const version = source.contract.chart.version;
    const entry = history.versions[version];
    assert(entry, `live Helm history must contain recovery source ${version}`);
    assert.strictEqual(
      entry.source_revision,
      source.source_revision,
      `live Helm recovery source revision for ${version}`,
    );
    assert.strictEqual(
      entry.app_version,
      source.contract.chart.app_version,
      `live Helm recovery appVersion for ${version}`,
    );
    assert.strictEqual(
      entry.image_reference,
      source.contract.image.reference,
      `live Helm recovery image reference for ${version}`,
    );
  }

  const evidence = {
    ...provenance,
    validation: {
      oci_anonymous_install: 'pass',
      https_anonymous_install: 'pass',
      oci_readme_command: [
        ociInstallCommand.command,
        ...ociInstallCommand.arguments,
      ].join(' '),
      https_readme_commands: [
        `helm repo add durable-workflow ${contract.channels.https.repository}`,
        'helm repo update',
        [
          httpsInstallCommand.command,
          ...httpsInstallCommand.arguments,
        ].join(' '),
      ],
      channels_identical: true,
      https_history_index: 'pass',
      https_history_packages_anonymous: 'pass',
      https_history_versions: Object.keys(history.versions),
      recovery_readme_commands: recoveryInstallEvidence,
    },
  };
  const evidencePath =
    options.evidencePath ||
    process.env.HELM_PUBLIC_VALIDATION_EVIDENCE ||
    path.join(REPO_ROOT, 'helm-public-validation-evidence.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `Anonymous Helm installs passed from OCI and HTTPS for ${contract.chart.name} ` +
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
  } else if (command === 'sync-contract') {
    assert(process.argv[3], 'sync-contract requires a pinned Server source path');
    const contract = synchronizeReleaseContract(path.resolve(process.argv[3]));
    synchronizeDocumentedInstallCommands(
      path.join(REPO_ROOT, 'docs', 'deployment.md'),
      contract,
    );
  } else if (command === 'stage') {
    await stageRelease();
  } else if (command === 'pre-deploy') {
    await stageRelease();
  } else if (command === 'verify-live') {
    await verifyLiveRelease();
  } else {
    throw new Error(
      'usage: helm-chart-release.js ' +
        '<check|sync-contract SERVER_SOURCE|pre-deploy|stage|verify-live>',
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
  contractFromServerSource,
  fetchResource,
  guardChartVersionImmutability,
  releaseHistoryEntry,
  releaseProvenance,
  installCommand,
  stageRelease,
  synchronizeDocumentedInstallCommands,
  synchronizeReleaseContract,
  validateContract,
  validateRecoveryReleaseSources,
  validateReleaseHistory,
  verifyLiveHttpsReleaseHistory,
  verifyLiveRelease,
};
