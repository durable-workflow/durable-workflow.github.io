const assert = require('assert');

const {
  ARTIFACT_PINS,
  ARTIFACT_VERSIONS,
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

assert.doesNotThrow(
  () => checkPublicArtifactSource(
    'docs/guides/install-anywhere.md',
    'Install with `pip install %%artifact.pythonPackagePin%%` when an example is useful.',
  ),
  'artifact tokens may move to any documentation source',
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
