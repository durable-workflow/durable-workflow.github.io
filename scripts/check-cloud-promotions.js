const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  BROWSER_EVIDENCE_PATHS,
  requiresBrowserEvidence,
} = require('./classify-cloud-promotion-browser-evidence');
const {
  CLOUD_EARLY_ACCESS_URL,
  PROMOTION_PLACEMENTS,
} = require('./cloud-promotion-contract');

const buildDirectory = path.resolve(process.argv[2] || 'build');

for (const {buildPath, source} of PROMOTION_PLACEMENTS) {
  const html = fs.readFileSync(path.join(buildDirectory, buildPath), 'utf8');
  assert.equal(
    (html.match(new RegExp(`data-promotion-source="${source}"`, 'g')) || []).length,
    1,
    `${buildPath} must render one bounded ${source} placement`,
  );
  assert.match(
    html,
    new RegExp(`href="${CLOUD_EARLY_ACCESS_URL.replaceAll('/', '\\/')}#source=${source}"`),
    `${buildPath} promotion must resolve to the public early-access form`,
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
assert.doesNotMatch(runtime, /\breferrer\s*:/);
assert.match(runtime, /referrerPolicy: 'no-referrer'/);
assert.match(runtime, /JSON\.stringify\(\{source, event\}\)/);
assert.doesNotMatch(runtime, /document\.cookie|localStorage|sessionStorage|user[_-]?id|location\.search/i);
assert.match(styles, /\.eyebrow\s*\{[^}]*letter-spacing:\s*0;/s);
assert.equal(requiresBrowserEvidence(['src/components/ProductPromotion/index.js']), true);
assert.equal(requiresBrowserEvidence(['scripts/cloud-promotion-contract.js']), true);
assert.equal(requiresBrowserEvidence(['scripts/check-cloud-promotion-browser.test.js']), true);
assert.equal(requiresBrowserEvidence(['docs/introduction.md']), false);
assert.ok(BROWSER_EVIDENCE_PATHS.includes('scripts/check-cloud-promotion-browser.js'));

console.log(`Validated ${PROMOTION_PLACEMENTS.length} bounded Cloud promotion placements without changing the stable docs default.`);
