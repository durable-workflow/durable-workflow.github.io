const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

const root = path.resolve(__dirname, '..');
const translatedRoot = path.join(root, 'i18n/es/docusaurus-plugin-content-docs/current');
const reviewFile = path.join(root, 'i18n/es/source-hashes.json');
const currentHashes = {};

function codeBlocks(file) {
  const text = fs.readFileSync(file, 'utf8');
  return [...text.matchAll(/^```[^\n]*\n[\s\S]*?^```\s*$/gm)].map(match => match[0].trimEnd());
}

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
        `Spanish executable examples differ from English: ${relative}`);
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
  assert.deepEqual(currentHashes, JSON.parse(fs.readFileSync(reviewFile, 'utf8')),
    'English sources changed. Review Spanish translations, then record the source review as described in README.md.');
}
console.log(`Spanish code blocks match English in ${checked} guides.`);
