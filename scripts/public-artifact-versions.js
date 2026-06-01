const artifactVersionSource = require('./public-artifact-versions.json');

const ARTIFACT_VERSION_REQUIREMENTS = Object.freeze({
  cli: {
    label: 'CLI',
    pattern: /^0\.1\.\d+$/,
    expected: '0.1.N',
  },
  'sdk-python': {
    label: 'Python SDK',
    pattern: /^0\.4\.\d+$/,
    expected: '0.4.N',
  },
  server: {
    label: 'server',
    pattern: /^0\.2\.\d+$/,
    expected: '0.2.N',
  },
  waterline: {
    label: 'Waterline',
    pattern: /^2\.0\.0-alpha\.\d+$/,
    expected: '2.0.0-alpha.N',
  },
  workflow: {
    label: 'Workflow',
    pattern: /^2\.0\.0-alpha\.\d+$/,
    expected: '2.0.0-alpha.N',
  },
});

const REQUIRED_ARTIFACTS = Object.freeze(Object.keys(ARTIFACT_VERSION_REQUIREMENTS));

function readArtifactVersions(source = artifactVersionSource) {
  if (!source || source.schema !== 'durable-workflow.docs.public-artifact-versions') {
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

  return Object.freeze(versions);
}

const ARTIFACT_VERSIONS = readArtifactVersions();

const ARTIFACT_PINS = Object.freeze({
  cliInstallerCommand: `curl -fsSL https://durable-workflow.com/install.sh | VERSION=${ARTIFACT_VERSIONS.cli} sh`,
  cliInstallerEnv: `VERSION=${ARTIFACT_VERSIONS.cli}`,
  cliPowerShellVersion: `$env:VERSION = "${ARTIFACT_VERSIONS.cli}"`,
  cliUpgradeCommand: `dw upgrade --tag=${ARTIFACT_VERSIONS.cli}`,
  cliUpgradeTag: `--tag=${ARTIFACT_VERSIONS.cli}`,
  cliVersion: ARTIFACT_VERSIONS.cli,
  pythonPackagePin: `durable-workflow==${ARTIFACT_VERSIONS['sdk-python']}`,
  pythonPipInstallCommand: `pip install durable-workflow==${ARTIFACT_VERSIONS['sdk-python']}`,
  serverDockerHubImage: `durableworkflow/server:${ARTIFACT_VERSIONS.server}`,
  serverGhcrImage: `ghcr.io/durable-workflow/server:${ARTIFACT_VERSIONS.server}`,
  serverImageEnv: `DW_SERVER_IMAGE=durableworkflow/server:${ARTIFACT_VERSIONS.server}`,
  serverTagEnv: `DW_SERVER_TAG=${ARTIFACT_VERSIONS.server}`,
  waterlineComposerPackage: `durable-workflow/waterline:${ARTIFACT_VERSIONS.waterline}@alpha`,
  workflowComposerPackage: `durable-workflow/workflow:${ARTIFACT_VERSIONS.workflow}@alpha`,
});

const ARTIFACT_TOKEN_PATTERN = /%%artifact\.([A-Za-z0-9]+)%%/g;

const ARTIFACT_PIN_PATTERNS = Object.freeze([
  {
    category: 'server_artifact_pin',
    label: 'server container image tag',
    pattern: /(?:durableworkflow\/server|ghcr\.io\/durable-workflow\/server):(0\.2\.\d+)/g,
    expected: ARTIFACT_VERSIONS.server,
  },
  {
    category: 'server_artifact_pin',
    label: 'server compose tag',
    pattern: /\bDW_SERVER_TAG=(0\.2\.\d+)\b/g,
    expected: ARTIFACT_VERSIONS.server,
  },
  {
    category: 'python_sdk_artifact_pin',
    label: 'Python SDK package pin',
    pattern: /durable-workflow==(0\.4\.\d+)/g,
    expected: ARTIFACT_VERSIONS['sdk-python'],
  },
  {
    category: 'cli_artifact_pin',
    label: 'CLI version pin',
    pattern: /(?:\bVERSION\s*=\s*["']?(0\.1\.\d+)["']?|\$env:VERSION\s*=\s*["'](0\.1\.\d+)["']|--tag=(0\.1\.\d+))/g,
    expected: ARTIFACT_VERSIONS.cli,
  },
  {
    category: 'workflow_artifact_pin',
    label: 'Workflow Composer prerelease pin',
    pattern: /durable-workflow\/workflow:(2\.0\.0-alpha\.\d+)@alpha/g,
    expected: ARTIFACT_VERSIONS.workflow,
  },
  {
    category: 'waterline_artifact_pin',
    label: 'Waterline Composer prerelease pin',
    pattern: /durable-workflow\/waterline:(2\.0\.0-alpha\.\d+)@alpha/g,
    expected: ARTIFACT_VERSIONS.waterline,
  },
]);

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
  ARTIFACT_PIN_PATTERNS,
  ARTIFACT_PINS,
  ARTIFACT_VERSIONS,
  artifactVersionRemarkPlugin,
  readArtifactVersions,
  replaceArtifactTokens,
  resolveArtifactAlias,
};
