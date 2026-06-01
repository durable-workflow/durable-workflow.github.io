const fs = require('fs');
const path = require('path');

const {
  ARTIFACT_PIN_PATTERNS,
  ARTIFACT_PINS,
  ARTIFACT_VERSIONS,
  replaceArtifactTokens,
} = require('./public-artifact-versions');

const repoRoot = path.join(__dirname, '..');

const PUBLIC_DOC_PIN_SURFACES = [
  {
    path: 'docs/installation.md',
    requiredPins: [
      'workflowComposerPackage',
    ],
  },
  {
    path: 'docs/migration.md',
    requiredPins: [
      'workflowComposerPackage',
    ],
  },
  {
    path: 'docs/introduction.md',
    requiredPins: [
      'pythonPipInstallCommand',
      'serverDockerHubImage',
      'cliInstallerEnv',
    ],
  },
  {
    path: 'docs/quickstart.md',
    requiredPins: [
      'serverDockerHubImage',
      'cliVersion',
      'pythonPackagePin',
      'workflowComposerPackage',
      'waterlineComposerPackage',
      'serverImageEnv',
      'pythonPipInstallCommand',
      'cliInstallerCommand',
    ],
  },
  {
    path: 'docs/polyglot/server.md',
    requiredPins: [
      'serverDockerHubImage',
      'serverGhcrImage',
      'pythonPipInstallCommand',
      'workflowComposerPackage',
    ],
  },
  {
    path: 'docs/waterline-operator-api.md',
    requiredPins: [
      'workflowComposerPackage',
      'waterlineComposerPackage',
    ],
  },
  {
    path: 'docs/polyglot/cli.mdx',
    requiredPins: [
      'cliInstallerCommand',
      'cliPowerShellVersion',
      'cliInstallerEnv',
      'cliUpgradeTag',
      'serverImageEnv',
    ],
  },
  {
    path: 'docs/polyglot/python.md',
    requiredPins: [
      'pythonPipInstallCommand',
      'serverImageEnv',
    ],
  },
  {
    path: 'docs/deployment.md',
    requiredPins: [
      'serverTagEnv',
      'serverImageEnv',
      'serverDockerHubImage',
      'serverGhcrImage',
    ],
  },
];

const SOURCE_PIN_PATTERNS = [
  ...ARTIFACT_PIN_PATTERNS,
  {
    category: 'cli_artifact_pin',
    label: 'CLI table version pin',
    pattern: /`dw`\s+`(0\.1\.\d+)`/g,
    expected: ARTIFACT_VERSIONS.cli,
  },
];

function fail(message) {
  throw new Error(message);
}

function readSurface(surface) {
  const filePath = path.join(repoRoot, surface.path);

  if (!fs.existsSync(filePath)) {
    fail(`Public artifact pin surface is missing: ${surface.path}`);
  }

  const rawContent = fs.readFileSync(filePath, 'utf8');

  return {
    rawContent,
    renderedContent: replaceArtifactTokens(rawContent, surface.path),
  };
}

function assertRequiredPins(surface, content) {
  for (const pinName of surface.requiredPins) {
    const pin = ARTIFACT_PINS[pinName];

    if (!pin) {
      fail(`Unknown required public artifact pin ${pinName} for ${surface.path}`);
    }

    if (!content.includes(pin)) {
      fail(`${surface.path} must include current public artifact pin ${pinName}: ${pin}`);
    }
  }
}

function assertObservedPinsCurrent(surface, content) {
  for (const definition of SOURCE_PIN_PATTERNS) {
    const pattern = new RegExp(definition.pattern.source, definition.pattern.flags);
    const versions = [...content.matchAll(pattern)]
      .map(match => match.slice(1).find(Boolean))
      .filter(Boolean);
    const staleVersions = [...new Set(versions)]
      .filter(version => version !== definition.expected)
      .sort();

    if (staleVersions.length > 0) {
      fail(
        `${surface.path} contains stale ${definition.label}: ` +
        `observed=${staleVersions.join(', ')} expected=${definition.expected}`
      );
    }
  }
}

function assertNoLiteralPins(surface, content) {
  for (const definition of SOURCE_PIN_PATTERNS) {
    const pattern = new RegExp(definition.pattern.source, definition.pattern.flags);
    const versions = [...content.matchAll(pattern)]
      .map(match => match.slice(1).find(Boolean))
      .filter(Boolean);

    if (versions.length > 0) {
      fail(
        `${surface.path} must use public artifact tokens instead of literal ${definition.label}: ` +
        `${[...new Set(versions)].sort().join(', ')}`
      );
    }
  }
}

function main() {
  for (const surface of PUBLIC_DOC_PIN_SURFACES) {
    const { rawContent, renderedContent } = readSurface(surface);

    assertNoLiteralPins(surface, rawContent);
    assertRequiredPins(surface, renderedContent);
    assertObservedPinsCurrent(surface, renderedContent);
  }

  console.log(`Public artifact pin checks passed for ${PUBLIC_DOC_PIN_SURFACES.length} source docs`);
}

main();
