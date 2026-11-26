const fs = require('node:fs');
const path = require('node:path');
const {
  locales,
  localeLabels,
  checkCodeBlocks,
  checkCurrentTranslations,
  checkTranslationUpdatesFromGit,
} = require('./check-doc-translation-updates');

const root = path.resolve(__dirname, '..');
const currentCount = checkCurrentTranslations(root);
console.log(`All seven other locales contain ${currentCount} current guides with current reviewed-source hashes.`);
checkTranslationUpdatesFromGit(root);

const hashes = checkCodeBlocks(root);
for (const locale of locales) {
  const label = localeLabels[locale];
  const currentHashes = hashes[locale];
  const reviewFile = path.join(root, `i18n/${locale}/source-hashes.json`);
  if (process.argv.includes('--record-review')) {
    fs.writeFileSync(reviewFile, `${JSON.stringify(currentHashes, null, 2)}\n`);
  } else {
    const reviewedHashes = JSON.parse(fs.readFileSync(reviewFile, 'utf8'));
    const changedSources = Object.keys(currentHashes)
      .filter(file => currentHashes[file] !== reviewedHashes[file]);
    if (changedSources.length) {
      console.warn(`${label} translation review needed: ${changedSources.join(', ')}. See README.md.`);
    }
  }
  console.log(`${label} code blocks match English in ${Object.keys(currentHashes).length} guides.`);
}
