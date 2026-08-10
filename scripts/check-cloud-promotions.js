const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const buildDirectory = path.resolve(process.argv[2] || 'build');
const earlyAccessUrl = 'https://cloud.durable-workflow.com/early-access';
const placements = new Map([
  ['index.html', 'docs-homepage'],
  ['docs/2.0/polyglot/deployment-modes/index.html', 'docs-v2-deployment-modes'],
  ['docs/2.0/polyglot/cloud-control-plane/index.html', 'docs-v2-cloud-runtime'],
  ['docs/2.0/polyglot/php/index.html', 'docs-v2-php-sdk'],
  ['docs/2.0/polyglot/python/index.html', 'docs-v2-python-sdk'],
  ['docs/2.0/polyglot/rust/index.html', 'docs-v2-rust-sdk'],
]);

for (const [relativePath, source] of placements) {
  const html = fs.readFileSync(path.join(buildDirectory, relativePath), 'utf8');
  assert.equal(
    (html.match(new RegExp(`data-promotion-source="${source}"`, 'g')) || []).length,
    1,
    `${relativePath} must render one bounded ${source} placement`,
  );
  assert.match(
    html,
    new RegExp(`href="${earlyAccessUrl.replaceAll('/', '\\/')}#source=${source}"`),
    `${relativePath} promotion must resolve to the public early-access form`,
  );
}

const stableIntroduction = fs.readFileSync(
  path.join(buildDirectory, 'docs/introduction/index.html'),
  'utf8',
);
assert.doesNotMatch(stableIntroduction, /data-promotion-source=/);

const runtime = fs.readFileSync(
  path.resolve('src/components/ProductPromotion/index.js'),
  'utf8',
);
const styles = fs.readFileSync(
  path.resolve('src/components/ProductPromotion/styles.module.css'),
  'utf8',
);
assert.match(runtime, /credentials: 'omit'/);
assert.match(runtime, /referrerPolicy: 'no-referrer'/);
assert.match(runtime, /JSON\.stringify\(\{source, event\}\)/);
assert.doesNotMatch(runtime, /document\.cookie|localStorage|sessionStorage|user[_-]?id|location\.search/i);
assert.match(styles, /\.eyebrow\s*\{[^}]*letter-spacing:\s*0;/s);

console.log(`Validated ${placements.size} bounded Cloud promotion placements without changing the stable docs default.`);
