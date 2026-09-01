const stableReleaseSource = require('../static/stable-releases.json');

const STABLE_RELEASE_SCHEMA = 'durable-workflow.docs.stable-releases';
const STABLE_VERSION_PATTERN_SOURCE = '\\d+\\.\\d+\\.\\d+';
const REQUIRED_ARTIFACTS = Object.freeze([
  'cli',
  'sdk-php',
  'sdk-python',
  'sdk-rust',
  'server',
  'waterline',
  'workflow',
]);

function readStableReleases(source = stableReleaseSource) {
  if (source?.schema !== STABLE_RELEASE_SCHEMA || source.schema_version !== 1) {
    throw new Error('stable-releases.json must use the Durable Workflow stable release schema v1');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source.updated_at || '')) {
    throw new Error('stable-releases.json updated_at must use YYYY-MM-DD format');
  }

  const artifacts = source.artifacts || {};
  for (const name of REQUIRED_ARTIFACTS) {
    if (!new RegExp(`^${STABLE_VERSION_PATTERN_SOURCE}$`).test(artifacts[name] || '')) {
      throw new Error(`stable-releases.json artifacts.${name} must use MAJOR.MINOR.PATCH`);
    }
  }

  const unknown = Object.keys(artifacts).filter(name => !REQUIRED_ARTIFACTS.includes(name));
  if (unknown.length > 0) {
    throw new Error(`stable-releases.json contains unknown artifacts: ${unknown.join(', ')}`);
  }

  return Object.freeze({...artifacts});
}

const ARTIFACT_VERSIONS = readStableReleases();
const PUBLISHED_ARTIFACT_VERSIONS = ARTIFACT_VERSIONS;
const ARTIFACT_RELEASE_POLICY = Object.freeze({
  schema: STABLE_RELEASE_SCHEMA,
  schema_version: 1,
  product_train: '2.0.0',
  release_phase: 'stable',
  authorized_channels: Object.freeze(['stable']),
});

function assertStableVersion(artifact, version) {
  if (!new RegExp(`^${STABLE_VERSION_PATTERN_SOURCE}$`).test(version || '')) {
    throw new Error(`${artifact} must use a stable MAJOR.MINOR.PATCH version: ${version}`);
  }
  return version;
}

function productTrainVersionDetails(version) {
  return new RegExp(`^${STABLE_VERSION_PATTERN_SOURCE}$`).test(version || '')
    ? Object.freeze({channel: 'stable', sequence: null})
    : null;
}

function isAuthorizedProductTrainVersion(version) {
  return productTrainVersionDetails(version) !== null;
}

function assertAuthorizedProductTrainVersion(artifact, version) {
  return assertStableVersion(artifact, version);
}

function authorizedProductTrainVersionFormat() {
  return 'MAJOR.MINOR.PATCH';
}

function composerPrereleaseStability(version) {
  assertStableVersion('Composer package', version);
  return null;
}

function composerPackagePin(packageName, version) {
  return `${packageName}:${assertStableVersion(packageName, version)}`;
}

function pypiRegistryVersion(version) {
  return assertStableVersion('Python SDK', version);
}

function buildPythonPackageAuthority(versions = ARTIFACT_VERSIONS) {
  const version = pypiRegistryVersion(versions['sdk-python']);
  const exactReleaseUrl = `https://pypi.org/project/durable-workflow/${version}/`;
  return Object.freeze({
    package: 'durable-workflow',
    version,
    registryVersion: version,
    releasePhase: 'stable',
    exactReleaseUrl,
    exactReleaseJsonUrl: `https://pypi.org/pypi/durable-workflow/${version}/json`,
    canonicalProjectUrl: 'https://pypi.org/project/durable-workflow/',
    authorityUrl: exactReleaseUrl,
  });
}

function buildRustPackageAuthority(versions = ARTIFACT_VERSIONS) {
  const version = assertStableVersion('Rust SDK', versions['sdk-rust']);
  return Object.freeze({
    crate: 'durable-workflow',
    version,
    readerReleaseUrl: `https://docs.rs/crate/durable-workflow/${version}`,
    registryReleaseUrl: `https://crates.io/api/v1/crates/durable-workflow/${version}`,
  });
}

function productTrainVersion(versions = ARTIFACT_VERSIONS) {
  return assertStableVersion('Python SDK', versions['sdk-python']);
}

function buildArtifactPins(versions = ARTIFACT_VERSIONS) {
  const python = buildPythonPackageAuthority(versions);
  const rust = buildRustPackageAuthority(versions);

  return Object.freeze({
    cliPackageUrl: `https://github.com/durable-workflow/cli/releases/tag/${versions.cli}`,
    cliInstallerCommand: `curl -fsSL https://durable-workflow.com/install.sh | VERSION=${versions.cli} sh`,
    cliInstallerEnv: `VERSION=${versions.cli}`,
    cliPowerShellVersion: `$env:VERSION = "${versions.cli}"`,
    cliUpgradeCommand: `dw upgrade --tag=${versions.cli}`,
    cliUpgradeTag: `--tag=${versions.cli}`,
    cliVersion: versions.cli,
    phpSdkVersion: versions['sdk-php'],
    phpSdkPackageUrl: `https://packagist.org/packages/durable-workflow/sdk#${versions['sdk-php']}`,
    phpSdkComposerPackage: composerPackagePin('durable-workflow/sdk', versions['sdk-php']),
    phpSdkComposerInstallCommand: `composer require ${composerPackagePin('durable-workflow/sdk', versions['sdk-php'])}`,
    productTrainVersion: productTrainVersion(versions),
    releasePhase: 'stable',
    pythonSdkVersion: versions['sdk-python'],
    pythonQualifiedPackageUrl: python.exactReleaseUrl,
    pythonRegistryVersion: python.registryVersion,
    pythonPackagePin: `durable-workflow==${versions['sdk-python']}`,
    pythonPipInstallCommand: `pip install durable-workflow==${versions['sdk-python']}`,
    rustSdkVersion: versions['sdk-rust'],
    rustCrate: rust.crate,
    rustPackageUrl: rust.readerReleaseUrl,
    rustRegistryReleaseUrl: rust.registryReleaseUrl,
    rustCargoAddCommand: `cargo add durable-workflow@=${versions['sdk-rust']}`,
    rustCargoRequirement: `durable-workflow = "=${versions['sdk-rust']}"`,
    rustCratesIoUrl: 'https://crates.io/crates/durable-workflow',
    rustRepositoryUrl: 'https://github.com/durable-workflow/sdk-rust',
    rustDocumentationUrl: 'https://rust.durable-workflow.com/',
    serverVersion: versions.server,
    serverPackageUrl: `https://hub.docker.com/r/durableworkflow/server/tags?name=${versions.server}`,
    serverDockerHubImage: `durableworkflow/server:${versions.server}`,
    serverGhcrImage: `ghcr.io/durable-workflow/server:${versions.server}`,
    serverImageEnv: `DW_SERVER_IMAGE=durableworkflow/server:${versions.server}`,
    serverTagEnv: `DW_SERVER_TAG=${versions.server}`,
    waterlineVersion: versions.waterline,
    waterlinePackageUrl: `https://packagist.org/packages/durable-workflow/waterline#${versions.waterline}`,
    waterlineComposerPackage: composerPackagePin('durable-workflow/waterline', versions.waterline),
    workflowVersion: versions.workflow,
    workflowPackageUrl: `https://packagist.org/packages/durable-workflow/workflow#${versions.workflow}`,
    workflowComposerPackage: composerPackagePin('durable-workflow/workflow', versions.workflow),
    cliChannelInstallerCommand: 'curl -fsSL https://durable-workflow.com/install.sh | sh',
    cliChannelPowerShellCommand: 'irm https://durable-workflow.com/install.ps1 | iex',
  });
}

const PUBLISHED_ARTIFACT_PINS = buildArtifactPins();
const PYTHON_PACKAGE_AUTHORITY = buildPythonPackageAuthority();
const QUALIFIED_PYTHON_PACKAGE_AUTHORITY = PYTHON_PACKAGE_AUTHORITY;
const ARTIFACT_PINS = Object.freeze({
  ...PUBLISHED_ARTIFACT_PINS,
  qualificationAuthorityUrl: '/stable-releases.json',
  qualificationDate: stableReleaseSource.updated_at,
  pythonPublishedSdkVersion: PYTHON_PACKAGE_AUTHORITY.version,
  pythonPublishedRegistryVersion: PYTHON_PACKAGE_AUTHORITY.registryVersion,
  pythonPypiExactReleaseUrl: PYTHON_PACKAGE_AUTHORITY.exactReleaseUrl,
  pythonPypiExactReleaseJsonUrl: PYTHON_PACKAGE_AUTHORITY.exactReleaseJsonUrl,
  pythonPypiCanonicalProjectUrl: PYTHON_PACKAGE_AUTHORITY.canonicalProjectUrl,
  pythonPypiAuthorityUrl: PYTHON_PACKAGE_AUTHORITY.authorityUrl,
  publishedCliInstallerCommand: PUBLISHED_ARTIFACT_PINS.cliInstallerCommand,
  publishedCliUpgradeCommand: PUBLISHED_ARTIFACT_PINS.cliUpgradeCommand,
  publishedCliVersion: PUBLISHED_ARTIFACT_PINS.cliVersion,
  publishedPhpSdkComposerInstallCommand: PUBLISHED_ARTIFACT_PINS.phpSdkComposerInstallCommand,
  publishedPhpSdkComposerPackage: PUBLISHED_ARTIFACT_PINS.phpSdkComposerPackage,
  publishedPhpSdkPackageUrl: PUBLISHED_ARTIFACT_PINS.phpSdkPackageUrl,
  publishedPhpSdkVersion: PUBLISHED_ARTIFACT_PINS.phpSdkVersion,
  publishedRustCargoAddCommand: PUBLISHED_ARTIFACT_PINS.rustCargoAddCommand,
  publishedRustCargoRequirement: PUBLISHED_ARTIFACT_PINS.rustCargoRequirement,
  publishedRustSdkVersion: PUBLISHED_ARTIFACT_PINS.rustSdkVersion,
});

const SERVICE_MODE_SDK_ARTIFACTS = Object.freeze(['sdk-php', 'sdk-python', 'sdk-rust']);
const QUALIFIED_ARTIFACT_DEPLOYMENT_PATHS = Object.freeze([
  Object.freeze({id: 'cloud_service', label: 'Cloud', required_artifacts: Object.freeze([]), choose_one_artifacts: SERVICE_MODE_SDK_ARTIFACTS, optional_artifacts: Object.freeze([]), provisioned_components: Object.freeze(['server_runtime_values', 'managed_waterline']), separately_deployed_components: Object.freeze([])}),
  Object.freeze({id: 'self_hosted_service', label: 'Self-hosted service mode', required_artifacts: Object.freeze(['server']), choose_one_artifacts: SERVICE_MODE_SDK_ARTIFACTS, optional_artifacts: Object.freeze(['cli']), provisioned_components: Object.freeze([]), separately_deployed_components: Object.freeze(['waterline_service'])}),
  Object.freeze({id: 'embedded_laravel', label: 'Embedded Laravel', required_artifacts: Object.freeze(['workflow']), choose_one_artifacts: Object.freeze([]), optional_artifacts: Object.freeze(['waterline']), provisioned_components: Object.freeze([]), separately_deployed_components: Object.freeze([])}),
]);

const applicability = (cloud, service, embedded) => Object.freeze({cloud_service: cloud, self_hosted_service: service, embedded_laravel: embedded});
const QUALIFIED_ARTIFACT_MATRIX = Object.freeze([
  Object.freeze({artifact: 'server', label: 'Server', role: 'service_runtime', identity: ARTIFACT_PINS.serverDockerHubImage, packageUrl: ARTIFACT_PINS.serverPackageUrl, applicability: applicability('provisioned_not_installed', 'required', 'not_used')}),
  Object.freeze({artifact: 'cli', label: 'CLI', role: 'service_operator_tool', identity: ARTIFACT_PINS.cliInstallerEnv, packageUrl: ARTIFACT_PINS.cliPackageUrl, applicability: applicability('not_in_first_success', 'optional', 'not_used')}),
  Object.freeze({artifact: 'workflow', label: 'Workflow', role: 'embedded_laravel_engine', identity: ARTIFACT_PINS.workflowComposerPackage, packageUrl: ARTIFACT_PINS.workflowPackageUrl, applicability: applicability('not_used', 'not_used', 'required')}),
  Object.freeze({artifact: 'waterline', label: 'Waterline Composer package', role: 'embedded_laravel_operator_ui', identity: ARTIFACT_PINS.waterlineComposerPackage, packageUrl: ARTIFACT_PINS.waterlinePackageUrl, applicability: applicability('managed_not_installed', 'separate_service_identity', 'optional')}),
  Object.freeze({artifact: 'sdk-php', label: 'PHP SDK', role: 'service_mode_sdk', identity: ARTIFACT_PINS.phpSdkComposerPackage, packageUrl: ARTIFACT_PINS.phpSdkPackageUrl, applicability: applicability('choose_one', 'choose_one', 'not_used')}),
  Object.freeze({artifact: 'sdk-python', label: 'Python SDK', role: 'service_mode_sdk', identity: ARTIFACT_PINS.pythonPackagePin, packageUrl: ARTIFACT_PINS.pythonQualifiedPackageUrl, applicability: applicability('choose_one', 'choose_one', 'not_used')}),
  Object.freeze({artifact: 'sdk-rust', label: 'Rust SDK', role: 'service_mode_sdk', identity: ARTIFACT_PINS.rustCargoRequirement, packageUrl: ARTIFACT_PINS.rustPackageUrl, applicability: applicability('choose_one', 'choose_one', 'not_used')}),
]);

const QUALIFIED_ARTIFACT_TUPLE_AUTHORITY = Object.freeze({
  schema: STABLE_RELEASE_SCHEMA,
  schemaVersion: 1,
  meaning: 'stable_release_line',
  qualifiedOn: stableReleaseSource.updated_at,
  authorityUrl: '/stable-releases.json',
  artifactVersions: ARTIFACT_VERSIONS,
});

function buildArtifactDistributionSurfaces(versions = ARTIFACT_VERSIONS) {
  const python = buildPythonPackageAuthority(versions);
  return Object.freeze({
    'sdk-php': Object.freeze([
      Object.freeze({surface: 'packagist_package', package: 'durable-workflow/sdk', version: versions['sdk-php'], url: 'https://packagist.org/packages/durable-workflow/sdk'}),
      Object.freeze({surface: 'source_repository', repository: 'durable-workflow/sdk-php', url: 'https://github.com/durable-workflow/sdk-php'}),
      Object.freeze({surface: 'api_documentation', url: 'https://php.durable-workflow.com/api/'}),
    ]),
    server: Object.freeze([
      Object.freeze({surface: 'docker_hub_container_image', registry: 'docker_hub', image: 'durableworkflow/server', tag: versions.server, reference: `durableworkflow/server:${versions.server}`}),
      Object.freeze({surface: 'ghcr_container_image', registry: 'ghcr', image: 'ghcr.io/durable-workflow/server', tag: versions.server, reference: `ghcr.io/durable-workflow/server:${versions.server}`}),
    ]),
    'sdk-python': Object.freeze([
      Object.freeze({surface: 'pypi_exact_release', package: python.package, version: python.version, registry_version: python.registryVersion, url: python.exactReleaseUrl, json_url: python.exactReleaseJsonUrl}),
      Object.freeze({surface: 'pypi_canonical_project_identity', package: python.package, url: python.canonicalProjectUrl, authority_role: 'project_identity_only'}),
      Object.freeze({surface: 'source_repository', repository: 'durable-workflow/sdk-python', url: 'https://github.com/durable-workflow/sdk-python'}),
      Object.freeze({surface: 'api_documentation', url: 'https://python.durable-workflow.com/'}),
    ]),
    waterline: Object.freeze([
      Object.freeze({surface: 'github_release', repository: 'durable-workflow/waterline', tag: versions.waterline, url: `https://github.com/durable-workflow/waterline/releases/tag/${versions.waterline}`}),
      Object.freeze({surface: 'packagist_package', package: 'durable-workflow/waterline', version: versions.waterline, url: 'https://packagist.org/packages/durable-workflow/waterline'}),
      Object.freeze({surface: 'docker_hub_container_image', registry: 'docker_hub', image: 'durableworkflow/waterline', tag: versions.waterline, reference: `durableworkflow/waterline:${versions.waterline}`}),
    ]),
    'sdk-rust': Object.freeze([
      Object.freeze({surface: 'crates_io_package', package: 'durable-workflow', version: versions['sdk-rust'], url: 'https://crates.io/crates/durable-workflow'}),
      Object.freeze({surface: 'source_repository', repository: 'durable-workflow/sdk-rust', url: 'https://github.com/durable-workflow/sdk-rust'}),
      Object.freeze({surface: 'api_documentation', url: 'https://rust.durable-workflow.com/'}),
    ]),
  });
}

const ARTIFACT_DISTRIBUTION_SURFACES = buildArtifactDistributionSurfaces();
const PUBLIC_ARTIFACT_SCAN_VERSION_PATTERN_SOURCE = STABLE_VERSION_PATTERN_SOURCE;
const ARTIFACT_PIN_PATTERNS = Object.freeze([]);
const ARTIFACT_TOKEN_PATTERN = /%%artifact\.([A-Za-z0-9]+)%%/g;

function resolveArtifactAlias(alias) {
  if (typeof alias !== 'string' || !alias.startsWith('$artifact.')) return alias;
  const pin = ARTIFACT_PINS[alias.slice('$artifact.'.length)];
  if (!pin) throw new Error(`Unknown artifact alias token: ${alias}`);
  return pin;
}

function replaceArtifactTokens(content, label = 'content', pins = ARTIFACT_PINS) {
  return String(content).replace(ARTIFACT_TOKEN_PATTERN, (token, pinName) => {
    if (!pins[pinName]) throw new Error(`${label} contains unknown artifact token ${token}`);
    return pins[pinName];
  });
}

function replaceArtifactTokensInMarkdownAst(node) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.value === 'string') node.value = replaceArtifactTokens(node.value, `markdown ${node.type || 'node'}`);
  if (typeof node.url === 'string') node.url = replaceArtifactTokens(node.url, `markdown ${node.type || 'node'} URL`);
  if (Array.isArray(node.children)) node.children.forEach(replaceArtifactTokensInMarkdownAst);
}

function artifactVersionRemarkPlugin() {
  return tree => replaceArtifactTokensInMarkdownAst(tree);
}

module.exports = {
  ARTIFACT_DISTRIBUTION_SURFACES,
  ARTIFACT_PIN_PATTERNS,
  ARTIFACT_PINS,
  ARTIFACT_RELEASE_POLICY,
  ARTIFACT_VERSIONS,
  PUBLISHED_ARTIFACT_PINS,
  PUBLISHED_ARTIFACT_VERSIONS,
  PUBLIC_ARTIFACT_SCAN_VERSION_PATTERN_SOURCE,
  PYTHON_PACKAGE_AUTHORITY,
  QUALIFIED_ARTIFACT_DEPLOYMENT_PATHS,
  QUALIFIED_ARTIFACT_MATRIX,
  QUALIFIED_ARTIFACT_TUPLE_AUTHORITY,
  QUALIFIED_PYTHON_PACKAGE_AUTHORITY,
  REQUIRED_ARTIFACTS,
  STABLE_RELEASE_SCHEMA,
  assertAuthorizedProductTrainVersion,
  artifactVersionRemarkPlugin,
  authorizedProductTrainVersionFormat,
  buildArtifactDistributionSurfaces,
  buildArtifactPins,
  buildPythonPackageAuthority,
  buildRustPackageAuthority,
  composerPrereleaseStability,
  isAuthorizedProductTrainVersion,
  productTrainVersion,
  productTrainVersionDetails,
  pypiRegistryVersion,
  readArtifactVersions: readStableReleases,
  readPublishedArtifactVersions: readStableReleases,
  readStableReleases,
  replaceArtifactTokens,
  resolveArtifactAlias,
};
