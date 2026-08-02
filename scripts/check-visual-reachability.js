const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');
const {collectReachabilityGeometry} = require('./visual-reachability');

const BUILD_DIRECTORY = path.resolve('build');
const FIXTURE_PATH = path.resolve('scripts/fixtures/consent-over-link.css');
const CONSENT_KEY = 'durable-workflow.analytics-consent.v1';
const REPRESENTATIVE_ROUTE = '/docs/platform-conformance/';
const VIEWPORTS = [
  {name: 'desktop', width: 1440, height: 900},
  {name: 'intermediate', width: 768, height: 1024},
  {name: 'mobile', width: 390, height: 844},
];
const outputArgumentIndex = process.argv.indexOf('--output');
assert.ok(
  outputArgumentIndex < 0 || process.argv[outputArgumentIndex + 1],
  '--output requires a directory',
);
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
  await new Promise((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function settle(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(250);
}

async function openPage(browser, baseUrl, viewport, consent) {
  const context = await browser.newContext({
    viewport: {width: viewport.width, height: viewport.height},
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });

  if (consent) {
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [CONSENT_KEY, consent],
    );
  }

  const page = await context.newPage();
  const browserErrors = [];
  await page.route('https://api.github.com/repos/durable-workflow/workflow', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({stargazers_count: 1171}),
    }));
  page.on('console', message => {
    if (message.type() === 'error') {
      browserErrors.push({type: 'console', message: message.text().slice(0, 500)});
    }
  });
  page.on('pageerror', error => {
    browserErrors.push({type: 'page', message: String(error.message || error).slice(0, 500)});
  });

  const response = await page.goto(`${baseUrl}${REPRESENTATIVE_ROUTE}`, {
    waitUntil: 'networkidle',
  });
  assert.equal(response?.status(), 200, 'representative documentation route must render');
  await settle(page);

  return {context, page, browserErrors};
}

async function captureState({browser, baseUrl, viewport, state, prepare}) {
  const {context, page, browserErrors} = await openPage(browser, baseUrl, viewport);
  const fileStem = `${state}-${viewport.name}`;

  try {
    if (prepare) {
      await prepare(page);
    }
    await settle(page);

    const geometry = await page.evaluate(collectReachabilityGeometry);
    const report = {
      schema: 'durable-workflow.visual-reachability-report/v1',
      route: REPRESENTATIVE_ROUTE,
      state,
      viewport,
      geometry,
      browser_errors: browserErrors,
    };
    const screenshot = path.join(outputDirectory, `${fileStem}.png`);
    const reportPath = path.join(outputDirectory, `${fileStem}.json`);

    await page.screenshot({path: screenshot, animations: 'disabled'});
    writeJson(reportPath, report);

    assert.deepEqual(browserErrors, [], `${fileStem} emitted browser errors`);
    assert.equal(
      geometry.horizontal_overflow,
      false,
      `${fileStem} has horizontal overflow`,
    );
    assert.deepEqual(
      geometry.unreachable_controls,
      [],
      `${fileStem} has visible controls that cannot be reached`,
    );
    if (state.endsWith('navigation-drawer')) {
      await page.locator('.navbar-sidebar__close').click();
      await page.locator('.navbar-sidebar').waitFor({state: 'hidden'});
      assert.equal(
        await page.locator('[data-dw-navigation-drawer-inert]').count(),
        0,
        'closing the navigation drawer must restore every background surface',
      );
    }

    return {
      state,
      viewport,
      screenshot: path.basename(screenshot),
      report: path.basename(reportPath),
      unreachable_control_count: geometry.unreachable_controls.length,
    };
  } finally {
    await context.close();
  }
}

async function chooseNecessary(page) {
  await page.locator('#durable-workflow-analytics-consent [data-consent="denied"]').click();
  await page.locator('#durable-workflow-analytics-preferences').scrollIntoViewIfNeeded();
}

async function assertBackgroundIsolated(page) {
  const activeBackgrounds = await page.locator([
    '.navbar__inner:not([inert])',
    'main:not([inert])',
    'footer:not([inert])',
    '#durable-workflow-analytics-consent:not([inert]):not([hidden])',
    '#durable-workflow-analytics-preferences:not([inert]):not([hidden])',
  ].join(', ')).count();
  assert.equal(
    activeBackgrounds,
    0,
    'navigation drawer must isolate controls on every visible background surface',
  );
}

async function openNavigationWithInitialConsent(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.navbar__toggle').click();
  await page.locator('.navbar-sidebar').waitFor({state: 'visible'});
  await assertBackgroundIsolated(page);
}

async function openNavigationAfterConsent(page) {
  await page.locator('#durable-workflow-analytics-consent [data-consent="denied"]').click();
  await openNavigationWithInitialConsent(page);
}

async function exerciseConsentOverLinkFixture(browser, baseUrl) {
  const viewport = VIEWPORTS[0];
  const {context, page, browserErrors} = await openPage(browser, baseUrl, viewport);
  const screenshot = path.join(outputDirectory, 'fixture-consent-over-link.png');
  const reportPath = path.join(outputDirectory, 'fixture-consent-over-link.json');

  try {
    const fixturePrepared = await page.evaluate(() => {
      const target = [...document.querySelectorAll('main a[href]')].find(anchor => {
        const box = anchor.getBoundingClientRect();
        const style = getComputedStyle(anchor);
        return box.width > 8 && box.height > 8 && style.display !== 'none';
      });

      if (!target) {
        return false;
      }

      target.setAttribute('data-visual-reachability-fixture-target', '');
      target.scrollIntoView({block: 'center'});
      return true;
    });
    assert.equal(fixturePrepared, true, 'representative documentation route needs an interactive link');
    await settle(page);
    await page.evaluate(() => {
      const target = document.querySelector('[data-visual-reachability-fixture-target]');
      const box = target.getBoundingClientRect();
      const root = document.documentElement.style;

      root.setProperty('--visual-reachability-fixture-left', `${box.left}px`);
      root.setProperty('--visual-reachability-fixture-top', `${box.top}px`);
      root.setProperty('--visual-reachability-fixture-width', `${box.width}px`);
      root.setProperty('--visual-reachability-fixture-height', `${box.height}px`);
    });
    await page.addStyleTag({path: FIXTURE_PATH});
    await settle(page);
    await page.evaluate(() => {
      const target = document.querySelector('[data-visual-reachability-fixture-target]');
      const box = target.getBoundingClientRect();
      const root = document.documentElement.style;

      root.setProperty('--visual-reachability-fixture-left', `${box.left}px`);
      root.setProperty('--visual-reachability-fixture-top', `${box.top}px`);
      root.setProperty('--visual-reachability-fixture-width', `${box.width}px`);
      root.setProperty('--visual-reachability-fixture-height', `${box.height}px`);
    });
    await settle(page);

    const geometry = await page.evaluate(collectReachabilityGeometry);
    const fixtureTarget = geometry.unreachable_controls.find(control => control.fixture_target);
    const report = {
      schema: 'durable-workflow.visual-reachability-report/v1',
      route: REPRESENTATIVE_ROUTE,
      state: 'fixture-consent-over-link',
      viewport,
      expected_rejection: true,
      geometry,
      browser_errors: browserErrors,
    };

    await page.screenshot({path: screenshot, animations: 'disabled'});
    writeJson(reportPath, report);

    assert.deepEqual(browserErrors, [], 'consent-over-link fixture emitted browser errors');
    assert.ok(
      fixtureTarget,
      'reachability gate must reject a documentation link covered by the consent surface',
    );

    return {
      state: 'fixture-consent-over-link',
      viewport,
      expected_rejection: true,
      rejected: true,
      screenshot: path.basename(screenshot),
      report: path.basename(reportPath),
      unreachable_control_count: geometry.unreachable_controls.length,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  assert.ok(fs.existsSync(path.join(BUILD_DIRECTORY, 'index.html')), 'run the Docusaurus build first');
  assert.ok(
    fs.existsSync(path.join(BUILD_DIRECTORY, REPRESENTATIVE_ROUTE, 'index.html')),
    'representative documentation route is missing from the Docusaurus build',
  );
  fs.mkdirSync(outputDirectory, {recursive: true});

  const server = createStaticServer();
  const baseUrl = await listen(server);
  const executablePath = process.env.VISUAL_REACHABILITY_CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    chromiumSandbox: false,
    args: ['--disable-dev-shm-usage'],
  });
  const checks = [];

  try {
    checks.push(await exerciseConsentOverLinkFixture(browser, baseUrl));

    for (const viewport of VIEWPORTS) {
      checks.push(await captureState({
        browser,
        baseUrl,
        viewport,
        state: 'initial-consent',
      }));
      checks.push(await captureState({
        browser,
        baseUrl,
        viewport,
        state: 'completed-consent',
        prepare: chooseNecessary,
      }));
    }

    for (const viewport of VIEWPORTS.slice(1)) {
      checks.push(await captureState({
        browser,
        baseUrl,
        viewport,
        state: 'initial-consent-navigation-drawer',
        prepare: openNavigationWithInitialConsent,
      }));
      checks.push(await captureState({
        browser,
        baseUrl,
        viewport,
        state: 'completed-consent-navigation-drawer',
        prepare: openNavigationAfterConsent,
      }));
    }

    const manifest = {
      schema: 'durable-workflow.visual-reachability-manifest/v1',
      route: REPRESENTATIVE_ROUTE,
      generated_at: new Date().toISOString(),
      checks,
    };
    writeJson(path.join(outputDirectory, 'manifest.json'), manifest);
    process.stdout.write(
      `Validated ${checks.length - 1} rendered states; the consent-over-link fixture was rejected.\n`,
    );
  } finally {
    await browser.close();
    await closeServer(server);
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
