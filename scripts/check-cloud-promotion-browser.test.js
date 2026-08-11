const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  observeCandidate,
  scriptAssetPaths,
} = require('./check-cloud-promotion-browser');

const candidateBundle = Buffer.from('candidate promotion bundle');
const candidate = {
  identity: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  placements: [
    {
      route: '/',
      source: 'docs-homepage',
      shell_scripts: ['/assets/js/runtime~main.candidate.js'],
      bundle: {
        path: '/assets/js/homepage.candidate.js',
        sha256: crypto.createHash('sha256').update(candidateBundle).digest('hex'),
      },
    },
  ],
};
const candidateHtml = Buffer.from(
  '<!doctype html><script src="/assets/js/runtime~main.candidate.js"></script>',
);

assert.deepEqual(
  scriptAssetPaths(candidateHtml),
  ['/assets/js/runtime~main.candidate.js'],
);

async function observe({html = candidateHtml, bundle = candidateBundle} = {}) {
  return observeCandidate('https://durable-workflow.com', candidate, 1, async url => (
    url.pathname === '/' ? html : bundle
  ));
}

async function main() {
  const current = await observe();
  assert.deepEqual(current.failures, []);
  assert.equal(current.bundles[0].matches, true);

  const staleShell = await observe({
    html: Buffer.from('<!doctype html><script src="/assets/js/runtime~main.stale.js"></script>'),
  });
  assert.match(staleShell.failures[0], /shell is missing/);

  const staleBundle = await observe({bundle: Buffer.from('stale promotion bundle')});
  assert.match(staleBundle.failures[0], /bundle digest is/);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
