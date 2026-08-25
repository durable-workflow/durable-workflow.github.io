#!/usr/bin/env node

const assert = require('assert');
const {
  buildArtifactForRoute,
  publicInventory,
  routeForSource,
  validateInventory,
  validatePublicInventory,
} = require('./docs-narrative-audit-contract');
const {
  assertNoRepoLocalReferences,
  assertPublicReference,
} = require('./docs-audit-public-references');

const revision = '0123456789abcdef0123456789abcdef01234567';

const inventory = [
  {
    source_file: 'docs/alpha.md',
    route: '/docs/2.0/alpha/',
    build_artifact: 'build/docs/2.0/alpha/index.html',
    canonical_route: '/docs/2.0/alpha/',
    sitemap_included: true,
  },
  {
    source_file: 'docs/nested/beta.mdx',
    route: '/docs/2.0/nested/beta/',
    build_artifact: 'build/docs/2.0/nested/beta/index.html',
    canonical_route: '/docs/beta/',
    sitemap_included: false,
  },
];

assert.doesNotThrow(() => validateInventory(inventory));
assert.strictEqual(routeForSource('docs/nested/beta.mdx'), '/docs/2.0/nested/beta/');
assert.strictEqual(
  buildArtifactForRoute('/docs/2.0/nested/beta/'),
  'build/docs/2.0/nested/beta/index.html',
);
assert.throws(
  () => validateInventory([...inventory, {...inventory[0]}]),
  /Duplicate narrative inventory source/,
);
assert.throws(
  () => routeForSource('versioned_docs/version-1.x/alpha.md'),
  /not a docs Markdown file/,
);

const publishedInventory = publicInventory(inventory, revision);
assert.doesNotThrow(() => validatePublicInventory(publishedInventory, inventory, revision));
assert.deepStrictEqual(publishedInventory[0], {
  source_url:
    `https://github.com/durable-workflow/durable-workflow.github.io/blob/${revision}/docs/alpha.md`,
  route: '/docs/2.0/alpha/',
  artifact_route: '/docs/2.0/alpha/',
  canonical_route: '/docs/2.0/alpha/',
  sitemap_included: true,
});

for (const route of ['/docs/alpha/', '/scripts/example.json', '/build/example.json']) {
  assert.doesNotThrow(() => assertPublicReference(route, 'test public route'));
  assert.doesNotThrow(() => assertNoRepoLocalReferences({route}, 'test payload'));
}
for (const repoLocalReference of [
  'docs/alpha.md',
  'scripts/example.json',
  'build/docs/2.0/alpha/index.html',
]) {
  assert.throws(
    () => assertNoRepoLocalReferences({reference: repoLocalReference}, 'test payload'),
    /exposes repo-local path/,
  );
}
assert.throws(
  () => validatePublicInventory(
    [{...publishedInventory[0], artifact_route: 'build/docs/2.0/alpha/index.html'}],
    [inventory[0]],
    revision,
  ),
  /published narrative artifact route is invalid/,
);

console.log('Docs narrative route inventory unit checks passed');
