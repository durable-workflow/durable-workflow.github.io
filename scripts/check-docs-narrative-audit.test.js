#!/usr/bin/env node

const assert = require('assert');
const {
  buildArtifactForRoute,
  routeForSource,
  validateInventory,
} = require('./docs-narrative-audit-contract');

const inventory = [
  {
    source_file: 'docs/alpha.md',
    route: '/docs/2.0/alpha/',
    build_artifact: 'build/docs/2.0/alpha/index.html',
  },
  {
    source_file: 'docs/nested/beta.mdx',
    route: '/docs/2.0/nested/beta/',
    build_artifact: 'build/docs/2.0/nested/beta/index.html',
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

console.log('Docs narrative route inventory unit checks passed');
