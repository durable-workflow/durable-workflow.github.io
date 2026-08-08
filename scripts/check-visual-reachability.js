const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');
const {collectReachabilityGeometry} = require('./visual-reachability');

const BUILD_DIRECTORY = path.resolve('build');
const REPRESENTATIVE_ROUTE = '/docs/platform-conformance/';
const VIEWPORTS = [
  {name: 'desktop', width: 1440, height: 900},
  {name: 'intermediate', width: 768, height: 1024},
  {name: 'mobile', width: 390, height: 844},
  {name: 'compact-height', width: 640, height: 360, fullPage: true},
];
const outputArgumentIndex = process.argv.indexOf('--output');
assert.ok(outputArgumentIndex < 0 || process.argv[outputArgumentIndex + 1], '--output requires a directory');
const outputDirectory = path.resolve(
  outputArgumentIndex >= 0 ? process.argv[outputArgumentIndex + 1] : 'visual-reachability',
);
const mimeTypes = new Map([
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
  if (candidate !== BUILD_DIRECTORY && !candidate.startsWith(`${BUILD_DIRECTORY}${path.sep}`)) return null;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) candidate = path.join(candidate, 'index.html');
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
      'content-type': mimeTypes.get(path.extname(file)) || 'application/octet-stream',
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
  assert.ok(address && typeof address === 'object', 'visual server did not bind a port');
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function settle(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(150);
}

async function captureState({browser, baseUrl, viewport, state, openNavigation = false}) {
  const context = await browser.newContext({
    viewport: {width: viewport.width, height: viewport.height},
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const browserErrors = [];
  await page.route('https://api.github.com/repos/durable-workflow/workflow', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({stargazers_count: 1171}),
  }));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push({type: 'console', message: message.text().slice(0, 500)});
  });
  page.on('pageerror', error => browserErrors.push({type: 'page', message: String(error.message || error).slice(0, 500)}));

  const fileStem = `${state}-${viewport.name}`;
  try {
    const response = await page.goto(`${baseUrl}${REPRESENTATIVE_ROUTE}`, {waitUntil: 'networkidle'});
    assert.equal(response?.status(), 200, 'representative documentation route must render');
    if (openNavigation) {
      await page.locator('.navbar__toggle').click();
      await page.locator('.navbar-sidebar').waitFor({state: 'visible'});
    }
    await settle(page);

    const analytics = await page.evaluate(() => ({
      retiredControls: document.querySelectorAll([
        '#durable-workflow-analytics-consent',
        '#durable-workflow-analytics-preferences',
        '.dw-analytics-consent',
        '.dw-analytics-preferences',
      ].join(',')).length,
      retiredStorage: localStorage.getItem('durable-workflow.analytics-consent.v1'),
      googleScripts: [...document.scripts].filter(script => /googletagmanager|google-analytics/.test(script.src)).length,
      localRuntimes: [...document.scripts]
        .filter(script => script.src.endsWith('/analytics/cloudflare-web-analytics.js')).length,
    }));
    assert.equal(analytics.retiredControls, 0, `${fileStem} rendered retired analytics controls`);
    assert.equal(analytics.retiredStorage, null, `${fileStem} persisted retired analytics consent`);
    assert.equal(analytics.googleScripts, 0, `${fileStem} rendered a Google analytics script`);
    assert.equal(analytics.localRuntimes, 1, `${fileStem} must render one cookie-free analytics runtime`);

    const geometry = await page.evaluate(collectReachabilityGeometry);
    const report = {
      schema: 'durable-workflow.visual-reachability-report/v1',
      route: REPRESENTATIVE_ROUTE,
      state,
      viewport,
      analytics_ui_absent: true,
      geometry,
      browser_errors: browserErrors,
    };
    const screenshot = path.join(outputDirectory, `${fileStem}.png`);
    const reportPath = path.join(outputDirectory, `${fileStem}.json`);
    await page.screenshot({path: screenshot, animations: 'disabled', fullPage: viewport.fullPage || false});
    writeJson(reportPath, report);

    assert.deepEqual(browserErrors, [], `${fileStem} emitted browser errors`);
    assert.equal(geometry.horizontal_overflow, false, `${fileStem} has horizontal overflow`);
    assert.deepEqual(geometry.unreachable_controls, [], `${fileStem} has unreachable visible controls`);

    if (openNavigation) {
      const activeBackgrounds = await page.locator('.navbar__inner:not([inert]), main:not([inert]), footer:not([inert])').count();
      assert.equal(activeBackgrounds, 0, 'navigation drawer must isolate background controls');
      await page.locator('.navbar-sidebar__close').click();
      await page.locator('.navbar-sidebar').waitFor({state: 'hidden'});
    }

    return {
      state,
      viewport,
      screenshot: path.basename(screenshot),
      report: path.basename(reportPath),
      analytics_ui_absent: true,
      unreachable_control_count: geometry.unreachable_controls.length,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  assert.ok(fs.existsSync(path.join(BUILD_DIRECTORY, 'index.html')), 'run the Docusaurus build first');
  fs.mkdirSync(outputDirectory, {recursive: true});
  const server = createStaticServer();
  const baseUrl = await listen(server);
  const browser = await chromium.launch({
    executablePath: process.env.VISUAL_REACHABILITY_CHROMIUM_PATH || undefined,
    headless: true,
    chromiumSandbox: false,
    args: ['--disable-dev-shm-usage'],
  });
  const checks = [];

  try {
    for (const viewport of VIEWPORTS) {
      checks.push(await captureState({browser, baseUrl, viewport, state: 'analytics-ui-removed'}));
    }
    for (const viewport of VIEWPORTS.slice(1)) {
      checks.push(await captureState({
        browser,
        baseUrl,
        viewport,
        state: 'analytics-ui-removed-navigation-drawer',
        openNavigation: true,
      }));
    }
    writeJson(path.join(outputDirectory, 'manifest.json'), {
      schema: 'durable-workflow.visual-reachability-manifest/v1',
      route: REPRESENTATIVE_ROUTE,
      generated_at: new Date().toISOString(),
      checks,
    });
    process.stdout.write(`Validated ${checks.length} rendered analytics-free states.\n`);
  } finally {
    await browser.close();
    await closeServer(server);
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
