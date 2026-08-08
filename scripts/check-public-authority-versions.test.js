#!/usr/bin/env node

const assert = require('assert');

const {
  assertRenderedAuthorityIdentity,
  assertSourceAuthorityIdentity,
  parseComponentAttributes,
} = require('./check-public-authority-versions');

const expected = {
  manifestBinding: 'exampleManifest',
  manifestImport: '@site/static/example-authority.json',
  manifestPath: 'static/example-authority.json',
  manifestUrl: 'https://durable-workflow.github.io/example-authority.json',
};
const manifest = {
  schema: 'durable-workflow.v2.example.authority',
  version: 7,
};
const identity = `
Unrelated prose can appear before the identity.

import exampleManifest from '@site/static/example-authority.json';

<PublicAuthorityIdentity
  manifestUrl="https://durable-workflow.github.io/example-authority.json"
  manifest={exampleManifest}
/>

## A movable heading
`;

assert.deepStrictEqual(
  parseComponentAttributes(identity, 'Example authority'),
  {
    manifestUrl: expected.manifestUrl,
    manifest: {binding: expected.manifestBinding},
  },
  'identity parsing must use semantic attributes rather than prose layout',
);

const resolvableExpected = {
  ...expected,
  manifestBinding: 'protocolCatalog',
  manifestImport: '@site/static/platform-protocol-specs.json',
  manifestPath: 'static/platform-protocol-specs.json',
  manifestUrl: 'https://durable-workflow.github.io/platform-protocol-specs.json',
};
const resolvableIdentity = identity
  .replaceAll('exampleManifest', 'protocolCatalog')
  .replaceAll(
    '@site/static/example-authority.json',
    '@site/static/platform-protocol-specs.json',
  )
  .replaceAll(
    'https://durable-workflow.github.io/example-authority.json',
    resolvableExpected.manifestUrl,
  );

assert.doesNotThrow(
  () => assertSourceAuthorityIdentity(
    resolvableIdentity,
    resolvableExpected,
    'Example authority',
  ),
  'matching semantic manifest binding must pass',
);

assert.throws(
  () => assertSourceAuthorityIdentity(
    resolvableIdentity.replace(
      'manifest={protocolCatalog}',
      'manifest={otherCatalog}',
    ),
    resolvableExpected,
    'Example authority',
  ),
  /must use the protocolCatalog manifest binding/,
  'identity cannot drift to an unrelated manifest binding',
);

assert.throws(
  () => assertSourceAuthorityIdentity(
    resolvableIdentity.replace(
      resolvableExpected.manifestUrl,
      'https://example.com/authority.json',
    ),
    resolvableExpected,
    'Example authority',
  ),
  /public discovery URL/,
  'authority identity must retain its consumer-resolvable discovery URL',
);

assert.throws(
  () => parseComponentAttributes(
    `${identity}\n${identity}`,
    'Duplicate authority',
  ),
  /exactly one PublicAuthorityIdentity/,
  'duplicated identity blocks must fail',
);

const renderedIdentity = `
<p
  data-authority-version="7"
  data-public-authority-identity="true"
  data-authority-manifest="https://durable-workflow.github.io/example-authority.json"
  data-authority-schema="durable-workflow.v2.example.authority">
  The manifest is
  <a href="https://durable-workflow.github.io/example-authority.json">available</a>.
  Its version is <code data-authority-field="version">7</code> and its schema is
  <code data-authority-field="schema">durable-workflow.v2.example.authority</code>.
</p>
`;

assert.doesNotThrow(
  () => assertRenderedAuthorityIdentity(
    renderedIdentity,
    manifest,
    expected,
    'Example authority',
  ),
  'rendered semantic identity may reorder fields without weakening validation',
);

assert.throws(
  () => assertRenderedAuthorityIdentity(
    renderedIdentity.replace(
      'data-authority-field="version">7',
      'data-authority-field="version">6',
    ),
    manifest,
    expected,
    'Example authority',
  ),
  /rendered version must visibly display "7"/,
  'rendered metadata cannot conceal a visibly drifted version',
);

assert.throws(
  () => assertRenderedAuthorityIdentity(
    renderedIdentity.replace(
      'href="https://durable-workflow.github.io/example-authority.json"',
      'href="https://example.com/unresolvable.json"',
    ),
    manifest,
    expected,
    'Example authority',
  ),
  /must link to/,
  'rendered discovery links must remain consumer-resolvable',
);

console.log('Public authority version semantic checks passed.');
