const artifactVersionSource = require('./public-artifact-versions.json');
const publishedArtifactVersionSource = require('./published-artifact-versions.json');
const artifactReleasePolicySource = require('../static/public-artifact-release-policy.json');

const ARTIFACT_VERSION_SCHEMA = 'durable-workflow.docs.public-artifact-versions';
const PUBLISHED_ARTIFACT_VERSION_SCHEMA =
  'durable-workflow.docs.published-artifact-versions';
const ARTIFACT_RELEASE_POLICY_SCHEMA = 'durable-workflow.docs.public-artifact-release-policy';
const RELEASE_CHANNELS = Object.freeze(['alpha', 'beta', 'rc', 'stable']);
const SEMVER_INSTALL_VERSION_PATTERN_SOURCE = '\\d+\\.\\d+\\.\\d+(?:-(?:alpha|beta|rc)\\.\\d+)?';
const PYPI_REGISTRY_VERSION_PATTERN_SOURCE = '\\d+\\.\\d+\\.\\d+(?:a|b|rc)\\d+';
const PUBLIC_ARTIFACT_SCAN_VERSION_PATTERN_SOURCE =
  `(?:${SEMVER_INSTALL_VERSION_PATTERN_SOURCE}|${PYPI_REGISTRY_VERSION_PATTERN_SOURCE})`;
const PYPI_PRERELEASE_LABELS = Object.freeze({alpha: 'a', beta: 'b', rc: 'rc'});
const PYPI_PACKAGE_NAME = 'durable-workflow';
const PYPI_PROJECT_URL = `https://pypi.org/project/${PYPI_PACKAGE_NAME}/`;

function readArtifactReleasePolicy(source = artifactReleasePolicySource) {
  if (!source || source.schema !== ARTIFACT_RELEASE_POLICY_SCHEMA) {
    throw new Error(
      'public-artifact-release-policy.json must declare the Durable Workflow artifact release-policy schema',
    );
  }

  if (source.schema_version !== 1) {
    throw new Error('public-artifact-release-policy.json schema_version must be 1');
  }

  if (typeof source.product_train !== 'string' || !/^\d+\.\d+\.\d+$/.test(source.product_train)) {
    throw new Error('public-artifact-release-policy.json product_train must use MAJOR.MINOR.PATCH format');
  }

  if (!RELEASE_CHANNELS.includes(source.release_phase)) {
    throw new Error(
      `public-artifact-release-policy.json release_phase must be one of ${RELEASE_CHANNELS.join(', ')}`,
    );
  }

  const phaseIndex = RELEASE_CHANNELS.indexOf(source.release_phase);
  const expectedChannels = RELEASE_CHANNELS.slice(0, phaseIndex + 1);
  if (JSON.stringify(source.authorized_channels) !== JSON.stringify(expectedChannels)) {
    throw new Error(
      'public-artifact-release-policy.json authorized_channels must contain every channel through ' +
      `${source.release_phase} in release order: ${expectedChannels.join(', ')}`,
    );
  }

  return Object.freeze({
    schema: source.schema,
    schema_version: source.schema_version,
    product_train: source.product_train,
    release_phase: source.release_phase,
    authorized_channels: Object.freeze([...source.authorized_channels]),
  });
}

const ARTIFACT_RELEASE_POLICY = readArtifactReleasePolicy();

function productTrainVersionDetails(version, policy = ARTIFACT_RELEASE_POLICY) {
  if (version === policy.product_train) {
    return Object.freeze({channel: 'stable', sequence: null});
  }

  const escapedTrain = policy.product_train.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escapedTrain}-(alpha|beta|rc)\\.(\\d+)$`).exec(version);

  return match
    ? Object.freeze({channel: match[1], sequence: Number(match[2])})
    : null;
}

function isAuthorizedProductTrainVersion(version, policy = ARTIFACT_RELEASE_POLICY) {
  const details = productTrainVersionDetails(version, policy);
  return details !== null && policy.authorized_channels.includes(details.channel);
}

function authorizedProductTrainVersionFormat(policy = ARTIFACT_RELEASE_POLICY) {
  return policy.authorized_channels
    .map(channel => channel === 'stable'
      ? policy.product_train
      : `${policy.product_train}-${channel}.N`)
    .join(', ');
}

function assertAuthorizedProductTrainVersion(artifact, version, policy = ARTIFACT_RELEASE_POLICY) {
  if (!isAuthorizedProductTrainVersion(version, policy)) {
    throw new Error(
      `public artifact ${artifact} version ${version} is not authorized by the ` +
      `${policy.release_phase} release phase; expected ${authorizedProductTrainVersionFormat(policy)}`,
    );
  }

  return version;
}

const ARTIFACT_VERSION_REQUIREMENTS = Object.freeze({
  cli: {
    label: 'CLI',
  },
  'sdk-php': {
    label: 'PHP SDK',
  },
  'sdk-python': {
    label: 'Python SDK',
  },
  'sdk-rust': {
    label: 'Rust SDK',
  },
  server: {
    label: 'server',
  },
  waterline: {
    label: 'Waterline',
  },
  workflow: {
    label: 'Workflow',
  },
});

const REQUIRED_ARTIFACTS = Object.freeze(Object.keys(ARTIFACT_VERSION_REQUIREMENTS));

function readArtifactVersionMap(source, sourceLabel, releasePolicy) {
  const artifacts = source.artifacts || {};
  const versions = {};

  for (const name of REQUIRED_ARTIFACTS) {
    const version = artifacts[name];
    const requirement = ARTIFACT_VERSION_REQUIREMENTS[name];

    if (typeof version !== 'string' || version.trim() === '') {
      throw new Error(`${sourceLabel} must define artifacts.${name}`);
    }

    if (version !== version.trim()) {
      throw new Error(`${sourceLabel} artifacts.${name} must not contain surrounding whitespace`);
    }

    if (!isAuthorizedProductTrainVersion(version, releasePolicy)) {
      throw new Error(
        `${sourceLabel} artifacts.${name} must use a ${requirement.label} version ` +
        `authorized by the ${releasePolicy.release_phase} release phase ` +
        `(${authorizedProductTrainVersionFormat(releasePolicy)}): ${version}`
      );
    }

    versions[name] = version;
  }

  const unknownArtifacts = Object.keys(artifacts)
    .filter(name => !REQUIRED_ARTIFACTS.includes(name))
    .sort();

  if (unknownArtifacts.length > 0) {
    throw new Error(`${sourceLabel} contains unknown artifacts: ${unknownArtifacts.join(', ')}`);
  }

  return Object.freeze(versions);
}

function readArtifactVersions(
  source = artifactVersionSource,
  releasePolicy = ARTIFACT_RELEASE_POLICY,
) {
  if (!source || source.schema !== ARTIFACT_VERSION_SCHEMA) {
    throw new Error('public-artifact-versions.json must declare the durable-workflow docs artifact schema');
  }

  return readArtifactVersionMap(source, 'public-artifact-versions.json', releasePolicy);
}

function readPublishedArtifactVersions(
  source = publishedArtifactVersionSource,
  releasePolicy = ARTIFACT_RELEASE_POLICY,
) {
  if (!source || source.schema !== PUBLISHED_ARTIFACT_VERSION_SCHEMA) {
    throw new Error(
      'published-artifact-versions.json must declare the Durable Workflow ' +
        'published-artifact schema',
    );
  }

  return readArtifactVersionMap(
    source,
    'published-artifact-versions.json',
    releasePolicy,
  );
}

const ARTIFACT_VERSIONS = readArtifactVersions();
const PUBLISHED_ARTIFACT_VERSIONS = readPublishedArtifactVersions();

function composerPrereleaseStability(version) {
  assertAuthorizedProductTrainVersion('Composer', version);
  const details = productTrainVersionDetails(version);

  if (!details || details.channel === 'stable') {
    throw new Error(`Unsupported Composer prerelease version: ${version}`);
  }

  return details.channel;
}

function composerPackagePin(packageName, version) {
  return `${packageName}:${version}@${composerPrereleaseStability(version)}`;
}

function composerPinCheckValue(version) {
  return `${version}@${composerPrereleaseStability(version)}`;
}

function pypiRegistryVersion(version) {
  const match = /^(\d+\.\d+\.\d+)-(alpha|beta|rc)\.(\d+)$/.exec(version);

  if (!match) {
    throw new Error(`Unsupported Python product-train version: ${version}`);
  }

  return `${match[1]}${PYPI_PRERELEASE_LABELS[match[2]]}${match[3]}`;
}

function buildPythonPackageAuthority(versions, policy = ARTIFACT_RELEASE_POLICY) {
  const version = assertAuthorizedProductTrainVersion(
    'Python SDK',
    versions['sdk-python'],
    policy,
  );
  const details = productTrainVersionDetails(version, policy);
  const registryVersion = details.channel === 'stable'
    ? version
    : pypiRegistryVersion(version);
  const exactReleaseUrl = `${PYPI_PROJECT_URL}${registryVersion}/`;

  return Object.freeze({
    package: PYPI_PACKAGE_NAME,
    version,
    registryVersion,
    releasePhase: policy.release_phase,
    exactReleaseUrl,
    exactReleaseJsonUrl:
      `https://pypi.org/pypi/${PYPI_PACKAGE_NAME}/${registryVersion}/json`,
    canonicalProjectUrl: PYPI_PROJECT_URL,
    authorityUrl: policy.release_phase === 'stable'
      ? PYPI_PROJECT_URL
      : exactReleaseUrl,
  });
}

function productTrainVersion(versions) {
  if (
    !versions
    || typeof versions['sdk-python'] !== 'string'
    || versions['sdk-python'] === ''
  ) {
    throw new Error('Artifact versions must define the Python SDK product-train version');
  }

  return versions['sdk-python'];
}

function buildArtifactPins(versions) {
  readArtifactVersions({
    schema: ARTIFACT_VERSION_SCHEMA,
    schemaVersion: 1,
    artifacts: versions,
  });
  const trainVersion = productTrainVersion(versions);

  return Object.freeze({
    cliInstallerCommand: `curl -fsSL https://durable-workflow.com/install.sh | VERSION=${versions.cli} sh`,
    cliInstallerEnv: `VERSION=${versions.cli}`,
    cliPowerShellVersion: `$env:VERSION = "${versions.cli}"`,
    cliUpgradeCommand: `dw upgrade --tag=${versions.cli}`,
    cliUpgradeTag: `--tag=${versions.cli}`,
    cliVersion: versions.cli,
    phpSdkVersion: versions['sdk-php'],
    phpSdkComposerPackage: composerPackagePin('durable-workflow/sdk', versions['sdk-php']),
    phpSdkComposerInstallCommand: `composer require ${composerPackagePin('durable-workflow/sdk', versions['sdk-php'])}`,
    productTrainVersion: trainVersion,
    releasePhase: ARTIFACT_RELEASE_POLICY.release_phase,
    pythonSdkVersion: versions['sdk-python'],
    pythonRegistryVersion: pypiRegistryVersion(versions['sdk-python']),
    pythonPackagePin: `durable-workflow==${versions['sdk-python']}`,
    pythonPipInstallCommand: `pip install durable-workflow==${versions['sdk-python']}`,
    rustSdkVersion: versions['sdk-rust'],
    rustCargoAddCommand: `cargo add durable-workflow@=${versions['sdk-rust']}`,
    rustCargoRequirement: `durable-workflow = "=${versions['sdk-rust']}"`,
    rustCratesIoUrl: 'https://crates.io/crates/durable-workflow',
    rustRepositoryUrl: 'https://github.com/durable-workflow/sdk-rust',
    rustDocumentationUrl: 'https://rust.durable-workflow.com/',
    serverVersion: versions.server,
    serverDockerHubImage: `durableworkflow/server:${versions.server}`,
    serverGhcrImage: `ghcr.io/durable-workflow/server:${versions.server}`,
    serverImageEnv: `DW_SERVER_IMAGE=durableworkflow/server:${versions.server}`,
    serverTagEnv: `DW_SERVER_TAG=${versions.server}`,
    waterlineVersion: versions.waterline,
    waterlineComposerPackage: composerPackagePin('durable-workflow/waterline', versions.waterline),
    workflowVersion: versions.workflow,
    workflowComposerPackage: composerPackagePin('durable-workflow/workflow', versions.workflow),
  });
}

const ARTIFACT_TOKEN_PATTERN = /%%artifact\.([A-Za-z0-9]+)%%/g;

function buildArtifactPinPatterns(versions, publishedVersions = versions) {
  const versionPattern = PUBLIC_ARTIFACT_SCAN_VERSION_PATTERN_SOURCE;
  const versionBoundary = '(?![0-9A-Za-z.-])';
  const pythonVersion = versions['sdk-python'];
  const pythonRegistry = pypiRegistryVersion(pythonVersion);
  const publishedPythonVersion = publishedVersions['sdk-python'];
  const publishedPythonRegistry = productTrainVersionDetails(publishedPythonVersion).channel === 'stable'
    ? publishedPythonVersion
    : pypiRegistryVersion(publishedPythonVersion);

  return Object.freeze([
    {
      category: 'server_artifact_pin',
      label: 'server container image tag',
      pattern: new RegExp(`(?:durableworkflow\\/server|ghcr\\.io\\/durable-workflow\\/server):(${versionPattern})${versionBoundary}`, 'g'),
      expected: versions.server,
    },
    {
      category: 'server_artifact_pin',
      label: 'server compose tag',
      pattern: new RegExp(`\\bDW_SERVER_TAG=(${versionPattern})${versionBoundary}`, 'g'),
      expected: versions.server,
    },
    {
      category: 'php_sdk_artifact_pin',
      label: 'PHP SDK Composer package pin',
      pattern: new RegExp(`durable-workflow\\/sdk:(${versionPattern}(?:@(alpha|beta|rc))?)${versionBoundary}`, 'g'),
      expected: composerPinCheckValue(versions['sdk-php']),
    },
    {
      category: 'python_sdk_artifact_pin',
      label: 'Python SDK package pin',
      pattern: new RegExp(`durable-workflow==(${versionPattern})${versionBoundary}`, 'g'),
      expected: pythonVersion,
      accepted: Object.freeze([pythonVersion, pythonRegistry]),
    },
    {
      category: 'rust_sdk_artifact_pin',
      label: 'Rust SDK crate pin',
      pattern: new RegExp(
        `(?:cargo add durable-workflow@=?(${versionPattern})(?:\\s+--exact)?${versionBoundary}|` +
        `cargo add durable-workflow\\s+--vers(?:ion)?(?:=|\\s+)["']?=?(${versionPattern})["']?${versionBoundary}|` +
        `durable-workflow\\s*=\\s*["']=?(${versionPattern})["']${versionBoundary})`,
        'g',
      ),
      expected: versions['sdk-rust'],
    },
    {
      category: 'cli_artifact_pin',
      label: 'CLI version pin',
      pattern: new RegExp(
        `(?:\\bVERSION\\s*=\\s*["']?(${versionPattern})["']?${versionBoundary}|` +
        `\\$env:VERSION\\s*=\\s*["'](${versionPattern})["']${versionBoundary}|` +
        `--tag=(${versionPattern})${versionBoundary})`,
        'g',
      ),
      expected: versions.cli,
    },
    {
      category: 'workflow_artifact_pin',
      label: 'Workflow Composer prerelease pin',
      pattern: new RegExp(`durable-workflow\\/workflow:(${versionPattern}(?:@(alpha|beta|rc))?)${versionBoundary}`, 'g'),
      expected: composerPinCheckValue(versions.workflow),
    },
    {
      category: 'waterline_artifact_pin',
      label: 'Waterline Composer prerelease pin',
      pattern: new RegExp(`durable-workflow\\/waterline:(${versionPattern}(?:@(alpha|beta|rc))?)${versionBoundary}`, 'g'),
      expected: composerPinCheckValue(versions.waterline),
    },
    {
      category: 'python_sdk_artifact_pin',
      label: 'PyPI registry version',
      pattern: new RegExp(`\\b(${PYPI_REGISTRY_VERSION_PATTERN_SOURCE})${versionBoundary}`, 'g'),
      expected: pythonRegistry,
      accepted: Object.freeze([...new Set([pythonRegistry, publishedPythonRegistry])]),
    },
  ]);
}

const PYTHON_PACKAGE_AUTHORITY = buildPythonPackageAuthority(
  PUBLISHED_ARTIFACT_VERSIONS,
);
const ARTIFACT_PINS = Object.freeze({
  ...buildArtifactPins(ARTIFACT_VERSIONS),
  pythonPublishedSdkVersion: PYTHON_PACKAGE_AUTHORITY.version,
  pythonPublishedRegistryVersion: PYTHON_PACKAGE_AUTHORITY.registryVersion,
  pythonPypiExactReleaseUrl: PYTHON_PACKAGE_AUTHORITY.exactReleaseUrl,
  pythonPypiExactReleaseJsonUrl: PYTHON_PACKAGE_AUTHORITY.exactReleaseJsonUrl,
  pythonPypiCanonicalProjectUrl: PYTHON_PACKAGE_AUTHORITY.canonicalProjectUrl,
  pythonPypiAuthorityUrl: PYTHON_PACKAGE_AUTHORITY.authorityUrl,
});
const ARTIFACT_PIN_PATTERNS = buildArtifactPinPatterns(
  ARTIFACT_VERSIONS,
  PUBLISHED_ARTIFACT_VERSIONS,
);

function buildArtifactDistributionSurfaces(versions) {
  const pythonPackageAuthority = buildPythonPackageAuthority(versions);

  return Object.freeze({
    'sdk-php': Object.freeze([
      Object.freeze({
        surface: 'packagist_package',
        package: 'durable-workflow/sdk',
        version: versions['sdk-php'],
        url: 'https://packagist.org/packages/durable-workflow/sdk',
      }),
      Object.freeze({
        surface: 'source_repository',
        repository: 'durable-workflow/sdk-php',
        url: 'https://github.com/durable-workflow/sdk-php',
      }),
      Object.freeze({
        surface: 'api_documentation',
        url: 'https://php.durable-workflow.com/',
      }),
    ]),
    server: Object.freeze([
      Object.freeze({
        surface: 'docker_hub_container_image',
        registry: 'docker_hub',
        image: 'durableworkflow/server',
        tag: versions.server,
        reference: `durableworkflow/server:${versions.server}`,
      }),
      Object.freeze({
        surface: 'ghcr_container_image',
        registry: 'ghcr',
        image: 'ghcr.io/durable-workflow/server',
        tag: versions.server,
        reference: `ghcr.io/durable-workflow/server:${versions.server}`,
      }),
    ]),
    'sdk-python': Object.freeze([
      Object.freeze({
        surface: 'pypi_exact_release',
        package: pythonPackageAuthority.package,
        version: pythonPackageAuthority.version,
        registry_version: pythonPackageAuthority.registryVersion,
        url: pythonPackageAuthority.exactReleaseUrl,
        json_url: pythonPackageAuthority.exactReleaseJsonUrl,
      }),
      Object.freeze({
        surface: 'pypi_canonical_project_identity',
        package: pythonPackageAuthority.package,
        url: pythonPackageAuthority.canonicalProjectUrl,
        authority_role: 'project_identity_only',
      }),
      Object.freeze({
        surface: 'source_repository',
        repository: 'durable-workflow/sdk-python',
        url: 'https://github.com/durable-workflow/sdk-python',
      }),
      Object.freeze({
        surface: 'api_documentation',
        url: 'https://python.durable-workflow.com/',
      }),
    ]),
    waterline: Object.freeze([
      Object.freeze({
        surface: 'github_release',
        repository: 'durable-workflow/waterline',
        tag: versions.waterline,
        url: `https://github.com/durable-workflow/waterline/releases/tag/${versions.waterline}`,
      }),
      Object.freeze({
        surface: 'packagist_package',
        package: 'durable-workflow/waterline',
        version: versions.waterline,
        url: 'https://packagist.org/packages/durable-workflow/waterline',
      }),
      Object.freeze({
        surface: 'docker_hub_container_image',
        registry: 'docker_hub',
        image: 'durableworkflow/waterline',
        tag: versions.waterline,
        reference: `durableworkflow/waterline:${versions.waterline}`,
      }),
    ]),
    'sdk-rust': Object.freeze([
      Object.freeze({
        surface: 'crates_io_package',
        package: 'durable-workflow',
        version: versions['sdk-rust'],
        url: 'https://crates.io/crates/durable-workflow',
      }),
      Object.freeze({
        surface: 'source_repository',
        repository: 'durable-workflow/sdk-rust',
        url: 'https://github.com/durable-workflow/sdk-rust',
      }),
      Object.freeze({
        surface: 'api_documentation',
        url: 'https://rust.durable-workflow.com/',
      }),
    ]),
  });
}

const ARTIFACT_DISTRIBUTION_SURFACES =
  buildArtifactDistributionSurfaces(PUBLISHED_ARTIFACT_VERSIONS);

function resolveArtifactAlias(alias) {
  if (typeof alias !== 'string') {
    throw new Error(`Artifact aliases must be strings, got ${JSON.stringify(alias)}`);
  }

  if (!alias.startsWith('$artifact.')) {
    return alias;
  }

  const pinName = alias.slice('$artifact.'.length);
  const pin = ARTIFACT_PINS[pinName];

  if (!pin) {
    throw new Error(`Unknown artifact alias token: ${alias}`);
  }

  return pin;
}

function replaceArtifactTokens(content, label = 'content', pins = ARTIFACT_PINS) {
  return String(content).replace(ARTIFACT_TOKEN_PATTERN, (token, pinName) => {
    const pin = pins[pinName];

    if (!pin) {
      throw new Error(`${label} contains unknown artifact token ${token}`);
    }

    return pin;
  });
}

function replaceArtifactTokensInMarkdownAst(node) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (typeof node.value === 'string') {
    node.value = replaceArtifactTokens(node.value, `markdown ${node.type || 'node'}`);
  }

  if (typeof node.url === 'string') {
    node.url = replaceArtifactTokens(node.url, `markdown ${node.type || 'node'} URL`);
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      replaceArtifactTokensInMarkdownAst(child);
    }
  }
}

function artifactVersionRemarkPlugin() {
  return tree => replaceArtifactTokensInMarkdownAst(tree);
}

module.exports = {
  ARTIFACT_RELEASE_POLICY,
  ARTIFACT_RELEASE_POLICY_SCHEMA,
  ARTIFACT_DISTRIBUTION_SURFACES,
  ARTIFACT_PIN_PATTERNS,
  ARTIFACT_PINS,
  ARTIFACT_VERSION_REQUIREMENTS,
  ARTIFACT_VERSION_SCHEMA,
  ARTIFACT_VERSIONS,
  PYTHON_PACKAGE_AUTHORITY,
  PUBLISHED_ARTIFACT_VERSIONS,
  PUBLISHED_ARTIFACT_VERSION_SCHEMA,
  PUBLIC_ARTIFACT_SCAN_VERSION_PATTERN_SOURCE,
  REQUIRED_ARTIFACTS,
  assertAuthorizedProductTrainVersion,
  artifactVersionRemarkPlugin,
  authorizedProductTrainVersionFormat,
  buildArtifactDistributionSurfaces,
  buildArtifactPinPatterns,
  buildArtifactPins,
  buildPythonPackageAuthority,
  composerPrereleaseStability,
  pypiRegistryVersion,
  productTrainVersionDetails,
  productTrainVersion,
  isAuthorizedProductTrainVersion,
  readArtifactReleasePolicy,
  readArtifactVersions,
  readPublishedArtifactVersions,
  replaceArtifactTokens,
  resolveArtifactAlias,
};
