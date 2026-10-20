const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');

const locales = ['de', 'es', 'fr', 'pt-BR', 'uk', 'ja', 'zh-Hans'];

function translationFailures(root, locale, relative, source, hash) {
  const localeRoot = path.join(root, 'i18n', locale);
  const translated = path.join(localeRoot, 'docusaurus-plugin-content-docs/current', relative);
  if (!fs.existsSync(translated)) {
    return [`${locale}: missing translation for ${relative}`];
  }

  const failures = [];
  if (fs.readFileSync(translated, 'utf8').trim() === source.trim()) {
    failures.push(`${locale}: ${relative} is an unchanged English copy`);
  }
  const reviewFile = path.join(localeRoot, 'source-hashes.json');
  const reviewed = fs.existsSync(reviewFile)
    ? JSON.parse(fs.readFileSync(reviewFile, 'utf8')) : {};
  if (reviewed[relative] !== hash) {
    failures.push(`${locale}: review and update ${relative} before recording its current source hash`);
  }
  return failures;
}

function checkTranslationUpdates(root, changedPaths, languages = locales) {
  const guides = changedPaths.filter(file => /^docs\/.+\.mdx?$/.test(file));
  const failures = [];

  for (const file of guides) {
    const relative = file.slice('docs/'.length);
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const hash = createHash('sha256').update(source).digest('hex');

    for (const locale of languages) {
      failures.push(...translationFailures(root, locale, relative, source, hash));
    }
  }

  if (failures.length) {
    throw new Error(`Guides require all offered languages:\n${failures.join('\n')}`);
  }
  return guides.length;
}

function checkCurrentTranslations(root, languages = locales) {
  // A review hash records the reviewed English revision, not translation fluency.
  const docsRoot = path.join(root, 'docs');
  const guides = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(file);
      } else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
        guides.push(`docs/${path.relative(docsRoot, file).split(path.sep).join('/')}`);
      }
    }
  }

  visit(docsRoot);
  return checkTranslationUpdates(root, guides.toSorted((left, right) => left.localeCompare(right)), languages);
}

function checkTranslationUpdatesFromGit(root) {
  const base = process.env.DOCS_TRANSLATION_BASE;
  if (!base) {
    console.log('Translation update comparison needs DOCS_TRANSLATION_BASE; full current-guide checks still run.');
    return;
  }
  if (!/^[a-f0-9]{40}$/.test(base) || /^0+$/.test(base)) {
    throw new Error('DOCS_TRANSLATION_BASE must be an existing Git commit SHA.');
  }

  // Use the runner's system Git rather than a repository-controlled PATH entry.
  const changed = execFileSync('/usr/bin/git', [
    'diff', '--name-only', '--diff-filter=ACMR', '-z', base, 'HEAD', '--', 'docs/',
  ], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
  const count = checkTranslationUpdates(root, changed);
  console.log(`Translation updates match reviewed English sources for ${count} changed guides in all seven other locales.`);
}

module.exports = {checkTranslationUpdates, checkCurrentTranslations, checkTranslationUpdatesFromGit};
