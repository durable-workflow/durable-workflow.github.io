const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {checkTranslationUpdates} = require('./check-doc-translation-updates');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-translation-updates-'));
const relative = 'features/timers.md';
const source = '# Timers\n\nWait durably.\n';
const translation = '# Zeitgeber {#timers}\n\nDauerhaft warten.\n';
const localeRoot = path.join(root, 'i18n/de');
const translated = path.join(localeRoot, 'docusaurus-plugin-content-docs/current', relative);
const review = path.join(localeRoot, 'source-hashes.json');

function write(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, value);
}
function record(value) {
  write(review, JSON.stringify({[relative]: createHash('sha256').update(value).digest('hex')}));
}
function check() {
  return checkTranslationUpdates(root, [`docs/${relative}`], ['de']);
}

try {
  write(path.join(root, 'docs', relative), source);
  assert.throws(check, /missing translation/);
  write(translated, source);
  record(source);
  assert.throws(check, /unchanged English copy/);

  write(translated, translation);
  assert.equal(check(), 1);
  record('an older English source');
  assert.throws(check, /review and update/);
  fs.unlinkSync(review);
  assert.throws(check, /review and update/);

  record(source);
  assert.throws(() => checkTranslationUpdates(root, [`docs/${relative}`], ['de', 'fr']),
    /fr: missing translation/);
  assert.equal(checkTranslationUpdates(root, ['README.md'], ['de', 'fr']), 0);
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}

console.log('PASS translation presence, English-copy refusal, current review, stale/missing review and additional-locale refusal.');
