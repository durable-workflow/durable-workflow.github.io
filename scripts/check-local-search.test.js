#!/usr/bin/env node

const assert = require('node:assert/strict');
const lunr = require('lunr');

const index = lunr(function () {
  this.ref('id');
  this.field('title');
  this.add({id: 'uk', title: '«Українська» документація: скасування workflow'});
  this.add({id: 'en', title: 'Workflow activities and retries'});
});

// Reload the serialized index as the browser does.
for (const candidate of [index, lunr.Index.load(JSON.parse(JSON.stringify(index)))]) {
  for (const word of ['Українська', 'документація', 'скасування']) {
    assert.deepEqual(candidate.search(word).map(result => result.ref), ['uk'], word);
  }
  assert.deepEqual(candidate.search('activity').map(result => result.ref), ['en']);
  assert.deepEqual(
    candidate.search('workflow').map(result => result.ref).sort(),
    ['en', 'uk'],
  );
}

console.log('Local search preserves Ukrainian words and English API terms.');
