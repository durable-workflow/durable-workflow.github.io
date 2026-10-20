const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {test} = require('node:test');
const {checkTranslationUpdates, checkCurrentTranslations} = require('./check-doc-translation-updates');

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

test('translation presence, translated content, current review and complete locale coverage', () => {
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
});

function inventoryFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-translation-inventory-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  return directory;
}

function translate(directory, locale, relativePath, english, translatedText) {
  const target = path.join(directory, 'i18n', locale);
  write(path.join(target, 'docusaurus-plugin-content-docs/current', relativePath), translatedText);
  const reviewPath = path.join(target, 'source-hashes.json');
  const hashes = fs.existsSync(reviewPath) ? JSON.parse(fs.readFileSync(reviewPath, 'utf8')) : {};
  hashes[relativePath] = createHash('sha256').update(english).digest('hex');
  write(reviewPath, JSON.stringify(hashes));
}

test('full inventory refuses an unchanged guide whose translation was removed', t => {
  const directory = inventoryFixture(t);
  write(path.join(directory, 'docs', relative), source);
  translate(directory, 'de', relative, source, translation);
  fs.unlinkSync(path.join(directory, 'i18n/de/docusaurus-plugin-content-docs/current', relative));

  // No English path changed: the diff-only check cannot detect this deletion.
  assert.equal(checkTranslationUpdates(directory, ['i18n/de/deleted.md'], ['de']), 0);
  assert.throws(() => checkCurrentTranslations(directory, ['de']), /de: missing translation for features\/timers.md/);
});

test('full inventory refuses a stale review even without an English diff', t => {
  const directory = inventoryFixture(t);
  write(path.join(directory, 'docs', relative), source);
  translate(directory, 'de', relative, 'an older English source', translation);

  assert.throws(() => checkCurrentTranslations(directory, ['de']), /review and update features\/timers.md/);
});

test('full inventory rejects literal English copies with otherwise current review hashes', t => {
  const directory = inventoryFixture(t);
  write(path.join(directory, 'docs', relative), source);
  translate(directory, 'de', relative, source, `\n${source}\n`);

  assert.throws(() => checkCurrentTranslations(directory, ['de']), /unchanged English copy/);
});

test('full inventory discovers nested MDX guides and ignores non-guide assets', t => {
  const directory = inventoryFixture(t);
  write(path.join(directory, 'docs/polyglot/nested/client.mdx'), '# Client\n');
  write(path.join(directory, 'docs/polyglot/example.json'), '{}');

  assert.throws(() => checkCurrentTranslations(directory, ['uk']),
    /uk: missing translation for polyglot\/nested\/client.mdx/);
  translate(directory, 'uk', 'polyglot/nested/client.mdx', '# Client\n', '# Клієнт\n');
  assert.equal(checkCurrentTranslations(directory, ['uk']), 1);
});

test('full inventory requires all seven offered non-English locales', t => {
  const directory = inventoryFixture(t);
  const sources = {'intro.md': '# Introduction\n', 'polyglot/cli.mdx': '# CLI\n\nInstall it.\n'};
  for (const [file, english] of Object.entries(sources)) {
    write(path.join(directory, 'docs', file), english);
    for (const locale of ['de', 'es', 'fr', 'pt-BR', 'ja', 'zh-Hans']) {
      translate(directory, locale, file, english, `# Localized ${locale}\n`);
    }
  }
  // Versioned docs belong to a separate contract and do not expand this gate.
  write(path.join(directory, 'versioned_docs/version-1.x/legacy.md'), '# Legacy\n');
  assert.throws(() => checkCurrentTranslations(directory), /uk: missing translation/);
  for (const [file, english] of Object.entries(sources)) {
    translate(directory, 'uk', file, english, '# Вступ\n');
  }
  assert.equal(checkCurrentTranslations(directory), 2);
});
