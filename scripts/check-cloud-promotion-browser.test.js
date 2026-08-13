const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  emittedEventsForMode,
  installPromotionTransport,
  observeCandidate,
  scriptAssetPaths,
  transportEvidenceForMode,
} = require('./check-cloud-promotion-browser');
const {
  PROMOTION_EVENTS,
  PROMOTION_EVENT_URL,
  PROMOTION_QUALIFICATION_EVENT,
} = require('./cloud-promotion-contract');

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

  assert.deepEqual(emittedEventsForMode(false), ['impression', 'click']);
  assert.deepEqual(emittedEventsForMode(true), ['qualification', 'qualification']);
  assert.deepEqual(transportEvidenceForMode('docs-homepage', false), [
    {
      application_event: 'impression',
      credentials: 'omit',
      emitted_event: 'impression',
      keepalive: true,
      mode: 'cors',
      referrer_policy: 'no-referrer',
      source: 'docs-homepage',
    },
    {
      application_event: 'click',
      credentials: 'omit',
      emitted_event: 'click',
      keepalive: true,
      mode: 'cors',
      referrer_policy: 'no-referrer',
      source: 'docs-homepage',
    },
  ]);

  for (const liveMode of [false, true]) {
    const requests = [];
    global.window = {
      fetch: async (input, init) => {
        requests.push({input, init});
        return {status: 204};
      },
    };
    installPromotionTransport({
      customerEvents: PROMOTION_EVENTS,
      eventUrl: PROMOTION_EVENT_URL,
      liveMode,
      qualificationEvent: PROMOTION_QUALIFICATION_EVENT,
    });
    for (const event of PROMOTION_EVENTS) {
      await global.window.fetch(PROMOTION_EVENT_URL, {
        body: JSON.stringify({source: 'docs-homepage', event}),
        credentials: 'omit',
        keepalive: true,
        method: 'POST',
        mode: 'cors',
        referrerPolicy: 'no-referrer',
      });
    }

    assert.deepEqual(
      requests.map(request => JSON.parse(request.init.body).event),
      emittedEventsForMode(liveMode),
      liveMode
        ? 'live mode must emit only non-aggregating qualification events'
        : 'local and staged modes must emit real impression and click events',
    );
    assert.deepEqual(
      global.window.__cloudPromotionTransport,
      transportEvidenceForMode('docs-homepage', liveMode),
    );
  }
  delete global.window;
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
