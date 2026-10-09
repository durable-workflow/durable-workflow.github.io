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

// Docusaurus builds several locales in one process. Exercise the actual
// plugin builder across language changes and reload its serialized indexes.
const {buildIndex} = require('@easyops-cn/docusaurus-search-local/dist/server/server/utils/buildIndex');
function build(documents, language) {
  return buildIndex([documents], {
    language,
    removeDefaultStopWordFilter: [],
    removeDefaultStemmer: false,
  })[0].index;
}
const latinDocuments = [
  {i: 0, t: '«Українська» документація: скасування workflow'},
  {i: 1, t: 'Workflow activities and retries'},
];
const chineseDocuments = [
  {i: 2, t: '工作流故障恢复与持久执行'},
  {i: 3, t: 'PHP activity workflow API'},
];
for (const {documents, language, expected} of [
  {documents: latinDocuments, language: ['en'], expected: {'Українська': ['0'], activity: ['1']}},
  {documents: chineseDocuments, language: ['en', 'zh'], expected: {'恢复': ['2'], activity: ['3']}},
  {documents: latinDocuments, language: ['en'], expected: {'Українська': ['0'], activity: ['1']}},
]) {
  const built = build(documents, language);
  for (const candidate of [built, lunr.Index.load(JSON.parse(JSON.stringify(built)))]) {
    for (const [query, references] of Object.entries(expected)) {
      assert.deepEqual(candidate.search(query).map(result => result.ref), references);
    }
  }
}
console.log('Plugin indexes preserve Chinese word search, English API terms and locale switching.');

async function checkJapaneseSearch() {
  // Use the same query tokenizer as the browser worker, including queries
  // without spaces. The multilingual index must also retain English stemming.
  const {tokenize} = await import('@easyops-cn/docusaurus-search-local/dist/client/client/utils/tokenize.js');
  const language = ['en', 'ja'];
  const japanese = build([
    {i: 4, t: '障害復旧ガイドとワークフロー'},
    {i: 5, t: 'PHP activities workflow API'},
  ], language);
  for (const candidate of [japanese, lunr.Index.load(JSON.parse(JSON.stringify(japanese)))]) {
    for (const [query, expected] of [['障害復旧', ['4']], ['復旧', ['4']], ['ワークフロー', ['4']], ['activity', ['5']]]) {
      const tokens = tokenize(query, language);
      const results = candidate.query(queryBuilder => {
        for (const token of tokens) queryBuilder.term(token, {presence: lunr.Query.presence.REQUIRED});
      });
      assert.deepEqual(results.map(result => result.ref), expected, query);
    }
  }
  const english = build(latinDocuments, ['en']);
  for (const candidate of [english, lunr.Index.load(JSON.parse(JSON.stringify(english)))]) {
    assert.deepEqual(candidate.search('Українська').map(result => result.ref), ['0']);
    assert.deepEqual(candidate.search('activity').map(result => result.ref), ['1']);
  }
  console.log('Japanese browser queries and English API terms survive segmentation, index reload and locale switching.');
}

async function checkFrenchSearch() {
  const {tokenize} = await import('@easyops-cn/docusaurus-search-local/dist/client/client/utils/tokenize.js');
  const language = ['en', 'fr'];
  const french = build([
    {i: 6, t: 'Échecs et reprise des activités'},
    {i: 7, t: 'PHP activities workflow API'},
  ], language);
  for (const candidate of [french, lunr.Index.load(JSON.parse(JSON.stringify(french)))]) {
    // Related French/English activity words may share a stem. Require the
    // relevant document without excluding other relevant bilingual matches.
    for (const [query, expected] of [['échec', '6'], ['activité', '6'], ['reprise', '6'], ['activity', '7']]) {
      const results = candidate.query(queryBuilder => {
        for (const token of tokenize(query, language)) queryBuilder.term(token, {presence: lunr.Query.presence.REQUIRED});
      });
      assert.ok(results.some(result => result.ref === expected), query);
    }
  }
  const english = build(latinDocuments, ['en']);
  for (const candidate of [english, lunr.Index.load(JSON.parse(JSON.stringify(english)))]) {
    assert.deepEqual(candidate.search('Українська').map(result => result.ref), ['0']);
    assert.deepEqual(candidate.search('activity').map(result => result.ref), ['1']);
  }
  console.log('French accented inflections and English API terms survive index reload and locale switching.');
}

checkJapaneseSearch().then(checkFrenchSearch).catch(error => {console.error(error); process.exitCode = 1;});
