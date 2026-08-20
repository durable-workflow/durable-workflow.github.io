#!/usr/bin/env node

const assert = require('assert');

const {
  assertAvroOnlyDocsIdentity,
  parseHtmlAttributes,
  semanticCodecBlocks,
} = require('./check-avro-only-docs');

const expected = {
  label: 'Movable guide',
  legacyV1ImportDrain: 'internal',
};
const semanticBlock = `
Unrelated editable copy can appear before the contract.

## A movable heading

<div
  data-legacy-v1-import-drain="internal"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-payload-codec="avro"
  data-public-payload-codec-contract="avro-only">
  Rewrite this explanation without synchronizing the test.
  <a href="/docs/2.0/polyglot/avro-value-protocol/">Wire details</a>
  identify <code data-payload-codec-field="codec">avro</code>.
</div>
`;

assert.doesNotThrow(
  () => assertAvroOnlyDocsIdentity(semanticBlock, expected),
  'semantic attributes must remain independent of prose and heading layout',
);
assert.strictEqual(semanticCodecBlocks(semanticBlock).length, 1);
assert.deepStrictEqual(
  parseHtmlAttributes(
    ' data-payload-codec="avro" data-legacy-v1-import-drain="internal"',
  ),
  {
    'data-payload-codec': 'avro',
    'data-legacy-v1-import-drain': 'internal',
  },
);

for (const [label, fixture, error] of [
  [
    'a selectable JSON codec',
    semanticBlock.replace('data-payload-codec="avro"', 'data-payload-codec="json"'),
    /data-payload-codec must be "avro"/,
  ],
  [
    'a public legacy reader',
    semanticBlock.replace(
      'data-legacy-v1-import-drain="internal"',
      'data-legacy-v1-import-drain="public"',
    ),
    /data-legacy-v1-import-drain must be "internal"/,
  ],
  [
    'an unrelated authority',
    semanticBlock.replace(
      'https://durable-workflow.github.io/sdk-neutrality-contract.json',
      'https://example.com/codec-contract.json',
    ),
    /data-authority-manifest must be/,
  ],
  [
    'a hidden or mislabeled visible codec',
    semanticBlock.replace('>avro</code>', '>json</code>'),
    /visibly identify the public payload codec as avro/,
  ],
  [
    'a missing public protocol route',
    semanticBlock.replace(
      '/docs/2.0/polyglot/avro-value-protocol/',
      '/docs/2.0/polyglot/worker-protocol/',
    ),
    /must link its semantic codec identity/,
  ],
]) {
  assert.throws(
    () => assertAvroOnlyDocsIdentity(fixture, expected),
    error,
    `the docs identity must reject ${label}`,
  );
}

assert.throws(
  () => assertAvroOnlyDocsIdentity(`${semanticBlock}\n${semanticBlock}`, expected),
  /exactly one semantic Avro-only payload-codec identity/,
  'duplicated semantic identities must fail',
);

console.log('Avro-only docs semantic identity unit checks passed.');
