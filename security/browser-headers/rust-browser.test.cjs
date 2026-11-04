const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');

async function main() {
  const root = path.resolve(process.argv[2]);
  const packet = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  assert.equal(packet.rule.enabled, false);
  assert.equal(packet.rollout_approved, false);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(inventory, null, 2) + '\n').digest('hex'), packet.inventory_sha256);
  const headers = Object.fromEntries(Object.entries(packet.rule.action_parameters.headers).map(([name, record]) => [name, record.value]));
  const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf'};
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/__frame_probe') {
      response.writeHead(200, {'content-type': 'text/html'});
      response.end('<!doctype html><title>Framing control</title>');
      return;
    }
    let file = path.resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, {...headers, 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store'});
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless: true});
  try {
    const context = await browser.newContext();
    const unexpected = [];
    const allowed = new Set(['https://github.com', 'https://img.shields.io', 'https://sonarcloud.io', 'https://static.cloudflareinsights.com', 'https://cloudflareinsights.com', 'https://cloud.durable-workflow.com']);
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (!allowed.has(url.origin)) { unexpected.push(url.origin + url.pathname); return route.abort(); }
      // Public badges/telemetry are intercepted: this local check sends no production request.
      if (route.request().resourceType() === 'image') return route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'});
      return route.fulfill({status: 200, contentType: 'text/javascript', body: ''});
    });
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
    assert.deepEqual(unexpected, []);
    console.log(JSON.stringify({
      outcome: 'pass', scope: 'Local source-prototype CSP compatibility only; no TLS/HSTS or public-rollout acceptance',
      browser: browser.version(), pages_checked: pages.size, inline_hash_representatives: representatives.size,
      source_preparation: packet.source_preparation,
      checks: ['all inventoried inline-script hash representatives', 'search', 'history back', 'direct-entry fallback', 'compact navigation', 'unapproved inline script refused', 'response framing refused'],
      external_requests: 'intercepted locally; none sent to production',
    }, null, 2));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
