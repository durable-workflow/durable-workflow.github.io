const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {ORIGIN, PROMOTION, verifyPacketFiles, loadInputs, installLocalRoutes} = require('./rust-browser-inputs.cjs');
const reviewedPacket = verifyPacketFiles(__dirname);
assert.equal(require('playwright/package.json').version, reviewedPacket.playwright_version);
const {chromium} = require('playwright');

test('Rust artifact CSP and navigation compatibility', {timeout: 150000}, async () => {
  const root = path.resolve(process.argv[2]);
  const packet = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  const input = loadInputs(root, packet, inventory);
  const headers = input.headers;
  const origin = ORIGIN;
  const browser = await chromium.launch({headless: true});
  try {
    assert.equal(browser.version(), reviewedPacket.expected_chromium_version);
    const context = await browser.newContext({serviceWorkers: 'block'});
    context.setDefaultTimeout(10000);
    const audit = await installLocalRoutes(context, input);
    await context.addInitScript(() => {
      window.__policyViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => window.__policyViolations.push({directive: event.effectiveDirective, blocked: event.blockedURI}));
    });
    const page = await context.newPage();
    async function visit(relative) {
      const response = await page.goto(origin + '/' + relative, {waitUntil: 'networkidle'});
      assert.equal(response.status(), 200, relative);
      assert.deepEqual(await page.evaluate(() => window.__policyViolations), [], relative);
    }
    const representatives = new Map();
    for (const entry of inventory.pages) for (const hash of entry.script_hashes) if (!representatives.has(hash)) representatives.set(hash, entry.path);
    const pages = new Set(['index.html', 'durable_workflow/index.html', 'durable_workflow/struct.Client.html', 'durable_workflow/struct.RawRequest.html', 'help.html', 'settings.html', ...representatives.values()]);
    for (const relative of pages) await visit(relative);

    await visit('durable_workflow/index.html');
    await page.locator('input.search-input').fill('RawRequest');
    await page.locator('input.search-input').press('Enter');
    await page.waitForFunction(() => document.querySelector('#search')?.textContent.includes('RawRequest'));
    assert.deepEqual(await page.evaluate(() => window.__policyViolations), []);

    await visit('durable_workflow/struct.Client.html');
    await visit('help.html');
    await page.locator('[data-rustdoc-history-back]').click();
    await page.waitForURL(origin + '/durable_workflow/struct.Client.html');
    assert.deepEqual(await page.evaluate(() => window.__policyViolations), []);
    const direct = await context.newPage();
    await direct.goto(origin + '/settings.html', {waitUntil: 'networkidle'});
    const historyControl = await context.newCDPSession(direct);
    await historyControl.send('Page.resetNavigationHistory');
    assert.equal(await direct.evaluate(() => history.length), 1);
    await direct.locator('[data-rustdoc-history-back]').click();
    await direct.waitForURL(origin + '/durable_workflow/index.html');
    await direct.close();

    await page.setViewportSize({width: 375, height: 900});
    await visit('durable_workflow/index.html');
    await page.locator('.sidebar-menu-toggle').click();
    assert.equal(await page.locator('.sidebar-menu-toggle').getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.sidebar-menu-toggle').getAttribute('aria-expanded'), 'false');

    await page.evaluate(() => {
      window.__policyViolations = [];
      const script = document.createElement('script');
      script.textContent = 'window.__unapprovedInlineRan = true;';
      document.head.append(script);
    });
    await page.waitForFunction(() => window.__policyViolations.length > 0);
    assert.equal(await page.evaluate(() => window.__unapprovedInlineRan), undefined);
    assert.ok((await page.evaluate(() => window.__policyViolations)).some((event) => event.directive === 'script-src-elem'));

    const frameMessages = [];
    page.on('console', (message) => { if (message.text().includes('frame-ancestors')) frameMessages.push(message.text()); });
    await page.goto(origin + '/__frame_probe');
    await page.evaluate(() => {
      const iframe = document.createElement('iframe'); iframe.src = '/durable_workflow/'; document.body.append(iframe);
    });
    await page.waitForTimeout(500);
    assert.ok(frameMessages.length > 0, 'response frame-ancestors policy must block the framing control');
    assert.deepEqual(audit.refused, []);
    assert.equal(audit.kinds['beacon-fixture'], undefined);
    console.log(JSON.stringify({
      outcome: 'pass', scope: 'Local artifact CSP compatibility only; no TLS/HSTS or public-rollout acceptance',
      browser: browser.version(), pages_checked: pages.size, inline_hash_representatives: representatives.size,
      source_preparation: packet.source_preparation,
      input_artifact: packet.input_artifact,
      inventory_sha256: packet.inventory_sha256,
      csp_sha256: crypto.createHash('sha256').update(headers['content-security-policy']).digest('hex'),
      checks: ['all inventoried inline-script hash representatives', 'search', 'history back', 'direct-entry fallback', 'compact navigation', 'unapproved inline script refused', 'response framing refused'],
      external_requests: 'fulfilled or refused locally; container network must be disabled',
      request_audit: audit,
      vendor_and_production_telemetry: 'not tested',
    }));
  } finally {
    await browser.close();
  }
});

async function instrumentTelemetry(context, nonWebdriver) {
  // Harness-only instrumentation. Native fetch still applies CSP and CORS.
  await context.addInitScript(({nonWebdriver, promotionUrl}) => {
    if (nonWebdriver) Object.defineProperty(Navigator.prototype, 'webdriver', {get: () => false, configurable: true});
    window.__policyViolations = [];
    window.__promotionFetchOptions = [];
    document.addEventListener('securitypolicyviolation', (event) => window.__policyViolations.push(event.effectiveDirective));
    const nativeFetch = window.fetch;
    window.fetch = function (resource, options) {
      if (String(resource) === promotionUrl) {
        window.__promotionFetchOptions.push({method: options.method, mode: options.mode, credentials: options.credentials, referrerPolicy: options.referrerPolicy, body: options.body});
      }
      return nativeFetch.call(this, resource, options);
    };
  }, {nonWebdriver, promotionUrl: PROMOTION});
}

async function checkPromotionFixture(page, audit) {
  await page.locator('[data-promotion-source="sdk-rust-reference"]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => window.__promotionFetchOptions.length === 1 && window.__localBeaconFixture === true);
  const action = page.locator('[data-promotion-action="early-access"]');
  // Exercise the real click listener without navigating to the production application.
  await action.evaluate((element) => element.addEventListener('click', (event) => event.preventDefault()));
  await action.click();
  await page.waitForFunction(() => window.__promotionFetchOptions.length === 2);
  await page.waitForLoadState('networkidle');
  const calls = await page.evaluate(() => window.__promotionFetchOptions);
  assert.deepEqual(calls.map((call) => JSON.parse(call.body).event), ['impression', 'click']);
  for (const call of calls) {
    assert.equal(call.method, 'POST');
    assert.equal(call.mode, 'cors');
    assert.equal(call.credentials, 'omit');
    assert.equal(call.referrerPolicy, 'no-referrer');
  }
  for (const kind of ['promotion-impression', 'promotion-click']) assert.equal(audit.kinds[kind], 1, kind);
}

async function checkTelemetryControl(browser, input, control) {
  const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1280, height: 900}});
  context.setDefaultTimeout(10000);
  const audit = await installLocalRoutes(context, input, control.origin);
  try {
    await instrumentTelemetry(context, control.nonWebdriver);
    const page = await context.newPage();
    const response = await page.goto(control.origin + control.route, {waitUntil: 'networkidle'});
    assert.equal(response.status(), 200);
    assert.equal(await page.evaluate(() => navigator.webdriver), !control.nonWebdriver);
    if (control.name === 'synthetic-promotion-dom') await checkPromotionFixture(page, audit);
    else {
      assert.deepEqual(await page.evaluate(() => window.__promotionFetchOptions), []);
      for (const kind of ['promotion-impression', 'promotion-click']) assert.equal(audit.kinds[kind], undefined, kind);
    }
    for (const kind of ['beacon-fixture', 'rum-fixture']) assert.equal(audit.kinds[kind], control.beaconExpected ? 1 : undefined, kind);
    assert.deepEqual(await page.evaluate(() => window.__policyViolations), []);
    if (control.name === 'current-artifact') {
      assert.equal(await page.locator('[data-promotion-source]').count(), 0);
      await page.evaluate(async () => { try { await fetch('https://unreviewed.invalid/blocked'); } catch { /* Expected CSP refusal. */ } });
      await page.waitForFunction(() => window.__policyViolations.includes('connect-src'));
    }
    assert.deepEqual(audit.refused, []);
    return {control: control.name, audit};
  } finally {
    await context.close();
  }
}

test('Rust analytics branches under local CSP with finite telemetry fixtures', {timeout: 90000}, async () => {
  const root = path.resolve(process.argv[2]);
  const packet = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  const input = loadInputs(root, packet, inventory);
  const browser = await chromium.launch({headless: true});
  const results = [];
  try {
    assert.equal(browser.version(), reviewedPacket.expected_chromium_version);
    for (const control of [
      {name: 'current-artifact', origin: ORIGIN, route: '/durable_workflow/index.html', nonWebdriver: true, beaconExpected: true},
      {name: 'synthetic-promotion-dom', origin: ORIGIN, route: '/__telemetry_fixture', nonWebdriver: true, beaconExpected: true},
      {name: 'webdriver-refusal', origin: ORIGIN, route: '/__telemetry_fixture', nonWebdriver: false, beaconExpected: false},
      {name: 'other-host-refusal', origin: 'https://example.invalid', route: '/__telemetry_fixture', nonWebdriver: true, beaconExpected: false},
    ]) results.push(await checkTelemetryControl(browser, input, control));
    console.log(JSON.stringify({outcome: 'pass', scope: 'Local artifact loader and synthetic promotion/CSP branches only; vendor beacon and production delivery not tested', input_artifact: packet.input_artifact, inventory_sha256: packet.inventory_sha256, controls: results, artifact_bytes_modified: false, network_required: 'none', instrumentation: ['non-webdriver getter in controlled contexts', 'promotion fetch-option observation delegating to native fetch', 'synthetic promotion DOM with real unchanged analytics script', 'prevent default external click navigation', 'synthetic beacon and rum responses']}));
  } finally {
    await browser.close();
  }
});
