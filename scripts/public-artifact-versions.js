const artifactVersionSource = require('./public-artifact-versions.json');

const ARTIFACT_VERSION_SCHEMA = 'durable-workflow.docs.public-artifact-versions';
const PRODUCT_TRAIN_VERSION_PATTERN = /^2\.0\.0-beta\.\d+$/;
const PRODUCT_TRAIN_VERSION_PATTERN_SOURCE = '2\\.0\\.0-beta\\.\\d+';

const ARTIFACT_VERSION_REQUIREMENTS = Object.freeze({
  cli: {
    label: 'CLI',
    pattern: PRODUCT_TRAIN_VERSION_PATTERN,
    expected: '2.0.0-beta.N',
  },
  'sdk-php': {
    label: 'PHP SDK',
    pattern: PRODUCT_TRAIN_VERSION_PATTERN,
    expected: '2.0.0-beta.N',
  },
  'sdk-python': {
    label: 'Python SDK',
    pattern: PRODUCT_TRAIN_VERSION_PATTERN,
    expected: '2.0.0-beta.N',
  },
  'sdk-rust': {
    label: 'Rust SDK',
    pattern: PRODUCT_TRAIN_VERSION_PATTERN,
    expected: '2.0.0-beta.N',
  },
  server: {
    label: 'server',
    pattern: PRODUCT_TRAIN_VERSION_PATTERN,
    expected: '2.0.0-beta.N',
  },
  waterline: {
    label: 'Waterline',
    pattern: PRODUCT_TRAIN_VERSION_PATTERN,
    expected: '2.0.0-beta.N',
  },
  workflow: {
    label: 'Workflow',
    pattern: PRODUCT_TRAIN_VERSION_PATTERN,
    expected: '2.0.0-beta.N',
  },
});

const REQUIRED_ARTIFACTS = Object.freeze(Object.keys(ARTIFACT_VERSION_REQUIREMENTS));

function readArtifactVersions(source = artifactVersionSource) {
  if (!source || source.schema !== ARTIFACT_VERSION_SCHEMA) {
    throw new Error('public-artifact-versions.json must declare the durable-workflow docs artifact schema');
  }

  const artifacts = source.artifacts || {};
  const versions = {};

  for (const name of REQUIRED_ARTIFACTS) {
    const version = artifacts[name];
    const requirement = ARTIFACT_VERSION_REQUIREMENTS[name];

    if (typeof version !== 'string' || version.trim() === '') {
      throw new Error(`public-artifact-versions.json must define artifacts.${name}`);
    }

    if (version !== version.trim()) {
      throw new Error(`public-artifact-versions.json artifacts.${name} must not contain surrounding whitespace`);
    }

    if (!requirement.pattern.test(version)) {
      throw new Error(
        `public-artifact-versions.json artifacts.${name} must use ${requirement.label} version format ` +
        `${requirement.expected}: ${version}`
      );
    }

    versions[name] = version;
  }

  const unknownArtifacts = Object.keys(artifacts)
    .filter(name => !REQUIRED_ARTIFACTS.includes(name))
    .sort();

  if (unknownArtifacts.length > 0) {
    throw new Error(`public-artifact-versions.json contains unknown artifacts: ${unknownArtifacts.join(', ')}`);
  }

  const trains = [...new Set(Object.values(versions))];
  if (trains.length !== 1) {
    throw new Error(
      `public-artifact-versions.json must define one synchronized 2.0 product train; got ${trains.join(', ')}`
    );
  }

  return Object.freeze(versions);
}

const ARTIFACT_VERSIONS = readArtifactVersions();

function composerPrereleaseStability(version) {
  const match = /^2\.0\.0-(alpha|beta)\.\d+$/.exec(version);

  if (!match) {
    throw new Error(`Unsupported Composer prerelease version: ${version}`);
  }

  return match[1];
}

function composerPackagePin(packageName, version) {
  return `${packageName}:${version}@${composerPrereleaseStability(version)}`;
}

function composerPinCheckValue(version) {
  return `${version}@${composerPrereleaseStability(version)}`;
}

function buildArtifactPins(versions) {
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
    pythonSdkVersion: versions['sdk-python'],
    pythonPackagePin: `durable-workflow==${versions['sdk-python']}`,
    pythonPipInstallCommand: `pip install durable-workflow==${versions['sdk-python']}`,
    rustSdkVersion: versions['sdk-rust'],
    rustCargoAddCommand: `cargo add durable-workflow@${versions['sdk-rust']} --exact`,
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

function buildArtifactPinPatterns(versions) {
  return Object.freeze([
    {
      category: 'server_artifact_pin',
      label: 'server container image tag',
      pattern: new RegExp(`(?:durableworkflow\\/server|ghcr\\.io\\/durable-workflow\\/server):(${PRODUCT_TRAIN_VERSION_PATTERN_SOURCE})`, 'g'),
      expected: versions.server,
    },
    {
      category: 'server_artifact_pin',
      label: 'server compose tag',
      pattern: new RegExp(`\\bDW_SERVER_TAG=(${PRODUCT_TRAIN_VERSION_PATTERN_SOURCE})\\b`, 'g'),
      expected: versions.server,
    },
    {
      category: 'php_sdk_artifact_pin',
      label: 'PHP SDK Composer package pin',
      pattern: new RegExp(`durable-workflow\\/sdk:(${PRODUCT_TRAIN_VERSION_PATTERN_SOURCE}@beta)`, 'g'),
      expected: composerPinCheckValue(versions['sdk-php']),
    },
    {
      category: 'python_sdk_artifact_pin',
      label: 'Python SDK package pin',
      pattern: new RegExp(`durable-workflow==(${PRODUCT_TRAIN_VERSION_PATTERN_SOURCE})`, 'g'),
      expected: versions['sdk-python'],
    },
    {
      category: 'rust_sdk_artifact_pin',
      label: 'Rust SDK crate pin',
      pattern: new RegExp(`(?:cargo add durable-workflow@(${PRODUCT_TRAIN_VERSION_PATTERN_SOURCE}) --exact|durable-workflow\\s*=\\s*["']=(${PRODUCT_TRAIN_VERSION_PATTERN_SOURCE})["'])`, 'g'),
      expected: versions['sdk-rust'],
    },
    {
      category: 'cli_artifact_pin',
      label: 'CLI version pin',
      pattern: new RegExp(`(?:\\bVERSION\\s*=\\s*["']?(${PRODUCT_TRAIN_VERSION_PATTERN_SOURCE})["']?|\\$env:VERSION\\s*=\\s*["'](${PRODUCT_TRAIN_VERSION_PATTERN_SOURCE})["']|--tag=(${PRODUCT_TRAIN_VERSION_PATTERN_SOURCE}))`, 'g'),
      expected: versions.cli,
    },
    {
      category: 'workflow_artifact_pin',
      label: 'Workflow Composer prerelease pin',
      pattern: new RegExp(`durable-workflow\\/workflow:(${PRODUCT_TRAIN_VERSION_PATTERN_SOURCE}@beta)`, 'g'),
      expected: composerPinCheckValue(versions.workflow),
    },
    {
      category: 'waterline_artifact_pin',
      label: 'Waterline Composer prerelease pin',
      pattern: new RegExp(`durable-workflow\\/waterline:(${PRODUCT_TRAIN_VERSION_PATTERN_SOURCE}@beta)`, 'g'),
      expected: composerPinCheckValue(versions.waterline),
    },
  ]);
}

const ARTIFACT_PINS = buildArtifactPins(ARTIFACT_VERSIONS);
const ARTIFACT_PIN_PATTERNS = buildArtifactPinPatterns(ARTIFACT_VERSIONS);

function buildArtifactDistributionSurfaces(versions) {
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

const ARTIFACT_DISTRIBUTION_SURFACES = buildArtifactDistributionSurfaces(ARTIFACT_VERSIONS);

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

function replaceArtifactTokens(content, label = 'content') {
  return String(content).replace(ARTIFACT_TOKEN_PATTERN, (token, pinName) => {
    const pin = ARTIFACT_PINS[pinName];

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
  ARTIFACT_DISTRIBUTION_SURFACES,
  ARTIFACT_PIN_PATTERNS,
  ARTIFACT_PINS,
  ARTIFACT_VERSION_REQUIREMENTS,
  ARTIFACT_VERSION_SCHEMA,
  ARTIFACT_VERSIONS,
  REQUIRED_ARTIFACTS,
  artifactVersionRemarkPlugin,
  buildArtifactDistributionSurfaces,
  buildArtifactPinPatterns,
  buildArtifactPins,
  readArtifactVersions,
  replaceArtifactTokens,
  resolveArtifactAlias,
};
