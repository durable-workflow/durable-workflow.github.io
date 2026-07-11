#!/usr/bin/env node

const assert = require('assert');
const {
  DIMENSIONS,
  validateReviewContract,
} = require('./docs-narrative-audit-contract');

function dimensionEvidence(source, suffix) {
  return Object.fromEntries(DIMENSIONS.map(dimension => [dimension, {
    status: 'pass',
    evidence: `${source} has source-specific ${dimension} evidence for ${suffix}.`,
  }]));
}

const inventory = [
  {source_file: 'docs/alpha.md', route: '/docs/2.0/alpha/', source_sha256: 'a'.repeat(64)},
  {source_file: 'docs/beta.md', route: '/docs/2.0/beta/', source_sha256: 'b'.repeat(64)},
];
const reviews = inventory.map((source, index) => ({
  ...source,
  verdict: 'pass',
  dimensions: dimensionEvidence(source.source_file, `fixture-${index}`),
}));

validateReviewContract(reviews, inventory);

assert.throws(
  () => validateReviewContract(reviews.slice(0, 1), inventory),
  /missing canonical 2\.0 Markdown sources/,
  'missing source coverage must fail'
);

const changedContent = JSON.parse(JSON.stringify(inventory));
changedContent[0].source_sha256 = 'c'.repeat(64);
assert.throws(
  () => validateReviewContract(reviews, changedContent),
  /changed after editorial review/,
  'source content changed after review must fail'
);

const failed = JSON.parse(JSON.stringify(reviews));
failed[1].dimensions.contract_accuracy.status = 'fail';
assert.throws(
  () => validateReviewContract(failed, inventory),
  /unreviewed or failing contract_accuracy/,
  'a failed narrative dimension must fail'
);

console.log('Docs narrative audit adversarial tests passed');
