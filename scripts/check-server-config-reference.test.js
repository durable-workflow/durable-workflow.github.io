const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const snapshot = require('../tests/fixtures/server-env-contract-2.11.0.json');
const {checkReference, validateSnapshot} = require('./check-server-config-reference');
const source = fs.readFileSync(path.join(__dirname, '../docs/polyglot/server-config-reference.md'), 'utf8');
const variable = 'DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE';
const row = source.split('\n').find(line => line.startsWith(`| \`${variable}\` |`));

test('qualified published contract has a complete reference', () => {
  assert.equal(checkReference(source), Object.keys(snapshot.vars).length);
});

test('a name mentioned in prose does not replace its configuration row', () => {
  assert.ok(row, 'the reference must have a namespace request-rate row');
  const missing = source.replace(row, `The control is \`${variable}\`.`);
  assert.throws(() => checkReference(missing), /missing published Server configuration rows: DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE/);
});

test('the documented legacy alias must match the published contract', () => {
  const wrongAlias = source.replace(row, row.replace('WORKFLOW_SERVER_NAMESPACE_MAX_REQUESTS_PER_MINUTE', 'WORKFLOW_SERVER_WRONG_RATE'));
  assert.throws(() => checkReference(wrongAlias), /legacy alias must match the published contract/);
});

test('configuration rows retain a populated default and purpose', () => {
  const cells = row.split('|');
  for (const column of [2, 3]) {
    const incomplete = [...cells];
    incomplete[column] = ' ';
    assert.throws(() => checkReference(source.replace(row, incomplete.join('|'))), /needs variable, default, purpose/);
  }
});

test('published snapshot provenance cannot be replaced by a moving source branch', () => {
  const unqualified = structuredClone(snapshot);
  unqualified.source_revision = 'main';
  assert.throws(() => validateSnapshot(unqualified), /published PHP artifact and exact source identity/);
});
