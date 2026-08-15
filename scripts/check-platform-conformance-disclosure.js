const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');
const {collectReachabilityGeometry} = require('./visual-reachability');

const BUILD_DIRECTORY = path.resolve('build');
const LEDGER = require('../static/platform-conformance/run-ledger.json');
const ROUTE = '/docs/platform-conformance/';
const VIEWPORTS = [
  {name: 'desktop', width: 1440, height: 900},
  {name: 'intermediate', width: 768, height: 1024},
  {name: 'mobile', width: 390, height: 844},
  {name: 'short-height', width: 640, height: 360},
];
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
]);

function fileForRequest(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  let candidate = path.resolve(BUILD_DIRECTORY, `.${pathname}`);
  if (candidate !== BUILD_DIRECTORY && !candidate.startsWith(`${BUILD_DIRECTORY}${path.sep}`)) {
    return null;
  }
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    candidate = path.join(candidate, 'index.html');
  }
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;
}

function createStaticServer() {
  return http.createServer((request, response) => {
    const file = fileForRequest(request.url || '/');
    if (!file) {
      response.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME_TYPES.get(path.extname(file)) || 'application/octet-stream',
    });
    fs.createReadStream(file).pipe(response);
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'disclosure test server did not bind');
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}

async function launchBrowser() {
  return chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      || process.env.VISUAL_REACHABILITY_CHROMIUM_PATH
      || undefined,
    headless: true,
    chromiumSandbox: false,
    args: ['--disable-dev-shm-usage'],
  });
}

async function withBrowserAndServer(run, dependencies = {}) {
  const launch = dependencies.launchBrowser || launchBrowser;
  const createServer = dependencies.createServer || createStaticServer;
  const startServer = dependencies.listen || listen;
  const stopServer = dependencies.closeServer || closeServer;
  let browser;
  let server;
  let result;
  let primaryError;

  try {
    browser = await launch();
    server = createServer();
    const baseUrl = await startServer(server);
    result = await run(browser, baseUrl);
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors = [];
  for (const cleanup of [
    server && (() => stopServer(server)),
    browser && (() => browser.close()),
  ]) {
    if (!cleanup) continue;
    try {
      await cleanup();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (primaryError) {
    if (cleanupErrors.length > 0 && primaryError.cause === undefined) {
      primaryError.cause = new AggregateError(cleanupErrors, 'disclosure check cleanup failed');
    }
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'disclosure check cleanup failed');
  }
  return result;
}

async function settle(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function openPage(browser, baseUrl, viewport, hash = '') {
  const context = await browser.newContext({
    viewport: {width: viewport.width, height: viewport.height},
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    const browserErrors = [];
    await page.route('https://api.github.com/repos/durable-workflow/workflow', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({stargazers_count: 1171}),
    }));
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', error => browserErrors.push(`page: ${error.message || error}`));

    const response = await page.goto(`${baseUrl}${ROUTE}${hash}`, {waitUntil: 'networkidle'});
    assert.equal(response?.status(), 200, `${ROUTE}${hash} must render`);
    await page.locator('[data-conformance-run-ledger]').waitFor();
    await settle(page);
    return {context, page, browserErrors};
  } catch (error) {
    try {
      await context.close();
    } catch (cleanupError) {
      if (error.cause === undefined) error.cause = cleanupError;
    }
    throw error;
  }
}

async function assertDefaultInformation(page) {
  const metadata = [
    ['snapshot_refreshed_at', LEDGER.snapshot_refreshed_at],
    ['retained_evidence_captured_at', LEDGER.retained_evidence_captured_at],
  ];
  for (const [field, value] of metadata) {
    const item = page.locator(`[data-ledger-metadata="${field}"] time`);
    await assertVisible(item, `${field} must be immediately visible`);
    assert.equal(await item.getAttribute('datetime'), value);
  }

  for (const [artifact, version] of Object.entries(LEDGER.current_artifact_tuple)) {
    const item = page.locator(`[data-ledger-current-tuple] [data-artifact="${artifact}"] code`);
    await assertVisible(item, `${artifact} must be visible in the current tuple`);
    assert.equal(await item.textContent(), version);
  }

  const disclosures = page.locator('[data-conformance-tier]');
  assert.equal(await disclosures.count(), LEDGER.tiers.length);
  for (const tier of LEDGER.tiers) {
    const disclosure = page.locator(`[data-conformance-tier="${tier.id}"]`);
    const summary = disclosure.locator(':scope > summary');
    await assertVisible(summary, `${tier.id} summary must be visible`);
    assert.equal(await disclosure.getAttribute('open'), null, `${tier.id} must start collapsed`);
    assert.equal(await summary.locator('[data-tier-state]').textContent(), tier.state);

    const metrics = {
      experiment_count: tier.experiment_count,
      current: tier.evidence_state.current,
      stale: tier.evidence_state.stale,
      missing: tier.evidence_state.missing,
      runner_blocked: tier.runner_blocked,
      current_product_failures: tier.current_product_failures,
    };
    for (const [metric, value] of Object.entries(metrics)) {
      const metricValue = summary.locator(
        `[data-tier-metric="${metric}"] > :first-child`,
      );
      await assertVisible(metricValue, `${tier.id} ${metric} must be visible`);
      assert.equal(Number(await metricValue.textContent()), value);
    }
  }

  const experiments = page.locator('[data-conformance-experiment]');
  assert.equal(await experiments.count(), LEDGER.experiments.length);
  for (const experiment of LEDGER.experiments) {
    const detail = page.locator(`[data-conformance-experiment="${experiment.id}"]`);
    assert.equal(await detail.isVisible(), false, `${experiment.id} detail must start hidden`);
    assert.equal(
      await detail.locator(`a[href="${experiment.static_contract.url}"]`).count(),
      1,
      `${experiment.id} must retain its static contract link`,
    );
    if (experiment.executed_evidence.evidence_url) {
      assert.equal(
        await detail.locator(`a[href="${experiment.executed_evidence.evidence_url}"]`).count(),
        1,
        `${experiment.id} must retain its executed evidence link`,
      );
    }
  }
}

async function assertVisible(locator, message) {
  assert.equal(await locator.isVisible(), true, message);
}

async function assertGeometry(page, label) {
  const geometry = await page.evaluate(collectReachabilityGeometry);
  assert.equal(geometry.horizontal_overflow, false, `${label} has horizontal overflow`);
  assert.deepEqual(geometry.unreachable_controls, [], `${label} has unreachable controls`);
}

async function assertExperimentDetailsAreFlat(disclosure, label) {
  const nestedCardTreatments = await disclosure
    .locator('[data-conformance-experiment]:visible')
    .evaluateAll(details => details.filter(detail => {
      const style = getComputedStyle(detail);
      const hasFrame = [
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
      ].every(width => Number.parseFloat(width) > 0);
      const hasRoundedCorners = [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ].some(radius => Number.parseFloat(radius) > 0);
      return hasFrame && hasRoundedCorners;
    }).map(detail => detail.getAttribute('data-conformance-experiment')));

  assert.deepEqual(
    nestedCardTreatments,
    [],
    `${label} must render experiment detail as flat rows inside the tier disclosure`,
  );
}

async function validateViewport(browser, baseUrl, viewport) {
  const {context, page, browserErrors} = await openPage(browser, baseUrl, viewport);
  try {
    await assertDefaultInformation(page);
    await assertGeometry(page, `${viewport.name} collapsed state`);

    const largestTier = [...LEDGER.tiers].sort(
      (left, right) => right.experiment_count - left.experiment_count,
    )[0];
    const disclosure = page.locator(`[data-conformance-tier="${largestTier.id}"]`);
    const summary = disclosure.locator(':scope > summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    assert.notEqual(await disclosure.getAttribute('open'), null, 'Enter must expand tier detail');
    assert.equal(
      await disclosure.locator('[data-conformance-experiment]:visible').count(),
      largestTier.experiment_count,
      'expanded tier must reveal every experiment',
    );
    await assertExperimentDetailsAreFlat(disclosure, `${viewport.name} expanded state`);
    await assertGeometry(page, `${viewport.name} expanded state`);

    await page.keyboard.press('Space');
    assert.equal(await disclosure.getAttribute('open'), null, 'Space must collapse tier detail');
    assert.deepEqual(browserErrors, [], `${viewport.name} states emitted browser errors`);
  } finally {
    await context.close();
  }
}

async function validateExperimentDeepLink(browser, baseUrl) {
  const experiment = LEDGER.experiments.at(-1);
  const targetId = `conformance-experiment-${experiment.id}`;
  const {context, page, browserErrors} = await openPage(
    browser,
    baseUrl,
    VIEWPORTS[0],
    `#${targetId}`,
  );
  try {
    const target = page.locator(`#${targetId}`);
    await assertVisible(target, 'an experiment deep link must reveal its tier');
    assert.equal(
      await target.evaluate(element => element.closest('details')?.open),
      true,
      'an experiment deep link must expand its containing disclosure',
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      targetId,
      'an experiment deep link must move focus to its detail row',
    );
    assert.deepEqual(browserErrors, [], 'experiment deep link emitted browser errors');
  } finally {
    await context.close();
  }
}

async function main() {
  assert.ok(
    fs.existsSync(path.join(BUILD_DIRECTORY, ROUTE, 'index.html')),
    'run the Docusaurus build before the disclosure check',
  );
  await withBrowserAndServer(async (browser, baseUrl) => {
    for (const viewport of VIEWPORTS) {
      await validateViewport(browser, baseUrl, viewport);
    }
    await validateExperimentDeepLink(browser, baseUrl);
    process.stdout.write(
      `Validated collapsed and expanded conformance ledger states across ` +
        `${VIEWPORTS.length} viewports, plus experiment deep linking.\n`,
    );
  });
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  openPage,
  withBrowserAndServer,
};
