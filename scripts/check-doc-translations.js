const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

const root = path.resolve(__dirname, '..');
const locales = {es: 'Spanish', 'pt-BR': 'Brazilian Portuguese', 'zh-Hans': 'Simplified Chinese', ja: 'Japanese'};

function codeBlocks(file) {
  const text = fs.readFileSync(file, 'utf8');
  return [...text.matchAll(/^```[^\n]*\n[\s\S]*?^```\s*$/gm)].map(match => match[0].trimEnd());
}

for (const [locale, label] of Object.entries(locales)) {
  const translatedRoot = path.join(root, `i18n/${locale}/docusaurus-plugin-content-docs/current`);
  const reviewFile = path.join(root, `i18n/${locale}/source-hashes.json`);
  const currentHashes = {};
  let checked = 0;
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(file);
      } else if (/\.mdx?$/.test(entry.name)) {
        const relative = path.relative(translatedRoot, file);
        const source = path.join(root, 'docs', relative);
        assert.deepEqual(codeBlocks(file), codeBlocks(source),
          `${label} executable examples differ from English: ${relative}`);
        currentHashes[relative] = createHash('sha256')
          .update(fs.readFileSync(source)).digest('hex');
        checked += 1;
      }
    }
  }

  visit(translatedRoot);
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
  console.log(`${label} code blocks match English in ${checked} guides.`);
}
