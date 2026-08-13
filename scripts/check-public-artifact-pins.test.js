const assert = require('assert');

const {
  ARTIFACT_RELEASE_POLICY,
  ARTIFACT_PINS,
  ARTIFACT_VERSIONS,
  PUBLISHED_ARTIFACT_VERSIONS,
  artifactVersionRemarkPlugin,
  readArtifactReleasePolicy,
  pypiRegistryVersion,
  replaceArtifactTokens,
} = require('./public-artifact-versions');
const {
  checkPublicArtifactSource,
  sourceDocs,
} = require('./check-public-artifact-pins');

const representativeRewrite = `---
sidebar_position: 1
---

# Start here

This page can be rewritten without carrying an installation example.

Continue to the [versioned guide](/docs/2.0/quickstart/).
`;

assert.doesNotThrow(
  () => checkPublicArtifactSource('docs/introduction.md', representativeRewrite),
  'a rewrite may remove pins that a page used to contain',
);

const artifactLinkTree = {
  type: 'root',
  children: [
    {
      type: 'link',
      url: 'https://github.com/durable-workflow/sdk-rust/blob/%%artifact.rustSdkVersion%%/examples/hello_world.rs',
      children: [{type: 'text', value: 'released Rust example'}],
    },
  ],
};
artifactVersionRemarkPlugin()(artifactLinkTree);
assert.strictEqual(
  artifactLinkTree.children[0].url,
  `https://github.com/durable-workflow/sdk-rust/blob/${ARTIFACT_PINS.rustSdkVersion}/examples/hello_world.rs`,
  'artifact tokens in Markdown links must resolve to the selected release',
);

assert.doesNotThrow(
  () => checkPublicArtifactSource(
    'docs/polyglot/php.md',
    '`composer require %%artifact.publishedPhpSdkComposerPackage%%`',
  ),
  'the PHP guide may use its dedicated published-version token',
);

assert.throws(
  () => checkPublicArtifactSource(
    'docs/guides/install-anywhere.md',
    '`composer require %%artifact.publishedPhpSdkComposerPackage%%`',
  ),
  /stale PHP SDK Composer package pin/,
  'published PHP tokens must not weaken the qualified pin outside the PHP guide',
);

assert.strictEqual(
  ARTIFACT_PINS.publishedPhpSdkVersion,
  PUBLISHED_ARTIFACT_VERSIONS['sdk-php'],
  'the PHP guide install token must derive from the published registry authority',
);

assert.doesNotThrow(
  () => checkPublicArtifactSource(
    'docs/guides/install-anywhere.md',
    [
      '`%%artifact.serverDockerHubImage%%`',
      '`%%artifact.cliChannelInstallerCommand%%`',
      '`%%artifact.workflowComposerPackage%%`',
      '`%%artifact.waterlineComposerPackage%%`',
      '`%%artifact.phpSdkComposerPackage%%`',
      '`pip install %%artifact.pythonPackagePin%%`',
      '`%%artifact.rustCargoAddCommand%%`',
      '`%%artifact.releasePhase%%`',
    ].join('\n'),
  ),
  'authority tokens for every install surface must render as current pins',
);

assert.doesNotThrow(
  () => checkPublicArtifactSource(
    'docs/guides/generated-qualified-install.md',
    '`composer require %%artifact.phpSdkComposerPackage%%`',
  ),
  'onboarding may project exact qualified requirements from the machine-owned tuple',
);

assert.doesNotThrow(
  () => checkPublicArtifactSource(
    'docs/polyglot/rust-cloud-quickstart.md',
    [
      '`%%artifact.publishedRustCargoAddCommand%%`',
      '`%%artifact.publishedCliInstallerCommand%%`',
    ].join('\n'),
  ),
  'the Rust Cloud registry journey may use its dedicated published-version tokens',
);

assert.throws(
  () => checkPublicArtifactSource(
    'docs/guides/install-anywhere.md',
    '`%%artifact.publishedRustCargoAddCommand%%`',
  ),
  /stale Rust SDK crate pin/,
  'published-version tokens must not weaken the exact qualified pin outside the Rust Cloud journey',
);

assert.strictEqual(
  ARTIFACT_PINS.productTrainVersion,
  ARTIFACT_VERSIONS['sdk-python'],
  'the normalized Python install token must derive from the Python artifact authority',
);
assert.strictEqual(
  ARTIFACT_PINS.pythonRegistryVersion,
  pypiRegistryVersion(ARTIFACT_VERSIONS['sdk-python']),
  'the PyPI prose token must derive from the Python artifact authority',
);
assert.strictEqual(
  ARTIFACT_PINS.releasePhase,
  'rc',
  'channel-specific documentation tokens must derive from the release-phase authority',
);
assert.doesNotMatch(
  ARTIFACT_PINS.cliChannelInstallerCommand,
  /\b\d+\.\d+\.\d+-(?:alpha|beta|rc)\.\d+\b/i,
  'the CLI channel installer must not contain an exact prerelease sequence',
);

const releaseCandidatePolicy = readArtifactReleasePolicy({
  schema: ARTIFACT_RELEASE_POLICY.schema,
  schema_version: ARTIFACT_RELEASE_POLICY.schema_version,
  product_train: ARTIFACT_RELEASE_POLICY.product_train,
  release_phase: 'rc',
  authorized_channels: ['alpha', 'beta', 'rc'],
});
const releaseCandidatePins = Object.freeze({
  ...ARTIFACT_PINS,
  releasePhase: releaseCandidatePolicy.release_phase,
});
const releasePhaseToken = '%%artifact.releasePhase%%';
const releaseCandidateToken = replaceArtifactTokens(
  releasePhaseToken,
  'release-candidate release-phase fixture',
  releaseCandidatePins,
);

assert.strictEqual(
  releaseCandidateToken,
  releaseCandidatePolicy.release_phase,
  'an authorized policy transition must resolve the release-phase token to the new channel',
);
assert.doesNotMatch(
  releaseCandidateToken,
  /%%artifact\.[A-Za-z0-9]+%%/,
  'the policy-transition render must resolve every artifact token',
);

assert.throws(
  () => checkPublicArtifactSource(
    'docs/guides/literal.md',
    `Run ${ARTIFACT_PINS.serverDockerHubImage}`,
  ),
  /must use public artifact tokens instead of literal server container image tag/,
  'current literal pins must use the version authority token',
);

const staleServerVersion = ARTIFACT_VERSIONS.server === '2.0.0-beta.1'
  ? '2.0.0-beta.3'
  : '2.0.0-beta.1';
assert.throws(
  () => checkPublicArtifactSource(
    'docs/guides/stale.md',
    `Run durableworkflow/server:${staleServerVersion}`,
  ),
  /contains stale server container image tag/,
  'stale observed pins must be rejected',
);

const legacyPins = [
  ['server', 'Run durableworkflow/server:0.2.689', /stale server container image tag/],
  ['CLI environment', 'Run VERSION=0.1.93', /stale CLI version pin/],
  ['CLI table', '`dw` `0.1.93`', /stale CLI table version pin/],
  ['PHP SDK', 'composer require durable-workflow/sdk:0.1.1', /stale PHP SDK Composer package pin/],
  ['Python SDK', 'pip install durable-workflow==0.4.102', /stale Python SDK package pin/],
  ['Rust SDK shorthand', 'cargo add durable-workflow@=0.1.17', /stale Rust SDK crate pin/],
  ['Rust SDK exact flag', 'cargo add durable-workflow@0.1.17 --exact', /stale Rust SDK crate pin/],
  ['Rust SDK version flag', 'cargo add durable-workflow --version "=0.1.17"', /stale Rust SDK crate pin/],
  ['Rust SDK manifest', 'durable-workflow = "=0.1.17"', /stale Rust SDK crate pin/],
  [
    'Workflow alpha',
    'composer require durable-workflow/workflow:2.0.0-alpha.291@alpha',
    /stale Workflow Composer prerelease pin/,
  ],
  [
    'Waterline alpha',
    'composer require durable-workflow/waterline:2.0.0-alpha.137@alpha',
    /stale Waterline Composer prerelease pin/,
  ],
  [
    'PHP SDK alpha',
    'composer require durable-workflow/sdk:2.0.0-alpha.12@alpha',
    /stale PHP SDK Composer package pin/,
  ],
  [
    'Server release candidate',
    'Run durableworkflow/server:2.0.0-rc.4',
    /stale server container image tag/,
  ],
  [
    'Server stable',
    'Run durableworkflow/server:2.0.0',
    /stale server container image tag/,
  ],
  [
    'Python PEP 440 alpha',
    'pip install durable-workflow==2.0.0a17',
    /stale Python SDK package pin/,
  ],
  [
    'Python PEP 440 release candidate',
    'pip install durable-workflow==2.0.0rc4',
    /stale Python SDK package pin/,
  ],
];

for (const [label, content, expectedError] of legacyPins) {
  assert.throws(
    () => checkPublicArtifactSource(`docs/guides/legacy-${label}.md`, content),
    expectedError,
    `${label} legacy pins must remain visible to the scanner`,
  );
}

const stalePypiVersion = ARTIFACT_PINS.pythonRegistryVersion.replace(
  /(\d+)$/,
  sequence => String(Number(sequence) + 1),
);
assert.throws(
  () => checkPublicArtifactSource(
    'docs/guides/stale-pypi.md',
    `PyPI renders this release as \`${stalePypiVersion}\`.`,
  ),
  /contains stale PyPI registry version/,
  'stale PyPI-normalized versions in prose must be rejected',
);

assert.throws(
  () => checkPublicArtifactSource(
    'docs/guides/current-pypi-literal.md',
    `PyPI renders this release as \`${ARTIFACT_PINS.pythonRegistryVersion}\`.`,
  ),
  /must use public artifact tokens instead of literal PyPI registry version/,
  'the current PyPI registry spelling must also use its authority token in raw docs',
);

assert.throws(
  () => checkPublicArtifactSource(
    'docs/guides/unsupported-server-version.md',
    `Run durableworkflow/server:${ARTIFACT_PINS.pythonRegistryVersion}`,
  ),
  /contains stale server container image tag/,
  'registry-normalized spellings must be rejected on unsupported install surfaces',
);

assert.throws(
  () => checkPublicArtifactSource(
    'docs/guides/unknown-token.md',
    'Install %%artifact.unknownPin%%',
  ),
  /contains unknown artifact token/,
  'unknown artifact tokens must be rejected',
);

assert.throws(
  () => checkPublicArtifactSource(
    'docs/guides/unresolved-token.md',
    'Install %%artifact.future-pin%%',
  ),
  /contains unresolved public artifact tokens/,
  'unresolved artifact tokens must be rejected',
);

const discoveredSources = sourceDocs();
assert.ok(discoveredSources.includes('docs/introduction.md'));
assert.ok(discoveredSources.some(source => source.startsWith('versioned_docs/')));

console.log('Public artifact pin regression checks passed');
