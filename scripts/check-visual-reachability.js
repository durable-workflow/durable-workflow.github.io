const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');
const {collectReachabilityGeometry} = require('./visual-reachability');

const BUILD_DIRECTORY = path.resolve('build');
const FIXTURE_PATH = path.resolve('scripts/fixtures/occluded-control.css');
const FIXTURE_OVERLAY_ID = 'visual-reachability-fixture-overlay';
const NAVIGATION_CONFIGURATIONS = [
  {id: 'stable-default', route: '/docs/platform-conformance/'},
  {id: 'current-v2', route: '/docs/2.0/platform-conformance/'},
];
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

async function openPage(browser, baseUrl, viewport, navigationConfiguration) {
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

  const response = await page.goto(`${baseUrl}${navigationConfiguration.route}`, {waitUntil: 'networkidle'});
  assert.equal(
    response?.status(),
    200,
    `${navigationConfiguration.id} documentation route must render`,
  );
  await settle(page);

  return {context, page, browserErrors};
}

async function exerciseNavigationDrawer(page) {
  const drawerItems = page.locator('.navbar-sidebar__items');
  const secondaryPanelIsActive = await drawerItems.evaluate(element =>
    element.classList.contains('navbar-sidebar__items--show-secondary'),
  );
  const drawerPanel = drawerItems
    .locator(':scope > .navbar-sidebar__item')
    .nth(secondaryPanelIsActive ? 1 : 0);
  const lastControlReachable = () => drawerPanel.locator('a[href], button').last().evaluate(control => {
    const box = control.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return Boolean(hit && (hit === control || control.contains(hit)));
  });
  const initial = await drawerPanel.evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  if (initial.scrollHeight <= initial.clientHeight) {
    const lastControlIsReachable = await lastControlReachable();
    assert.equal(lastControlIsReachable, true, 'last navigation control must be reachable');
    return {
      scrollable: false,
      initial_scroll_top: initial.scrollTop,
      maximum_scroll_top: initial.scrollTop,
      last_control_reachable: lastControlIsReachable,
    };
  }

  await drawerPanel.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await settle(page);

  const bottom = await drawerPanel.evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  assert.ok(bottom.scrollTop > initial.scrollTop, 'navigation drawer must scroll');
  assert.ok(
    Math.abs(bottom.scrollTop - (bottom.scrollHeight - bottom.clientHeight)) <= 1,
    'navigation drawer must reach the end of its navigation tree',
  );

  const lastControlIsReachable = await lastControlReachable();
  assert.equal(lastControlIsReachable, true, 'last navigation control must be reachable after scrolling');

  return {
    scrollable: true,
    initial_scroll_top: initial.scrollTop,
    maximum_scroll_top: bottom.scrollTop,
    last_control_reachable: lastControlIsReachable,
  };
}

async function captureState({
  browser,
  baseUrl,
  navigationConfiguration,
  viewport,
  state,
  openNavigation = false,
}) {
  const {context, page, browserErrors} = await openPage(
    browser,
    baseUrl,
    viewport,
    navigationConfiguration,
  );
  const fileStem = `${navigationConfiguration.id}-${state}-${viewport.name}`;
  try {
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
      navigation_configuration: navigationConfiguration.id,
      route: navigationConfiguration.route,
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
      report.navigation_drawer = await exerciseNavigationDrawer(page);
      if (
        navigationConfiguration.id === 'current-v2' &&
        viewport.name === 'compact-height'
      ) {
        assert.equal(report.navigation_drawer.scrollable, true, 'short-height drawer must scroll');
      }
      assert.deepEqual(browserErrors, [], `${fileStem} emitted browser errors`);
      writeJson(reportPath, report);
      await page.locator('.navbar-sidebar__close').click();
      await page.locator('.navbar-sidebar').waitFor({state: 'hidden'});
    }

    return {
      state,
      navigation_configuration: navigationConfiguration.id,
      route: navigationConfiguration.route,
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

async function exerciseOccludedControlFixture(browser, baseUrl) {
  const navigationConfiguration = NAVIGATION_CONFIGURATIONS[0];
  const viewport = VIEWPORTS[0];
  const {context, page, browserErrors} = await openPage(
    browser,
    baseUrl,
    viewport,
    navigationConfiguration,
  );
  const state = 'fixture-occluded-control';
  const screenshot = path.join(outputDirectory, `${state}.png`);
  const reportPath = path.join(outputDirectory, `${state}.json`);

  try {
    const routeIsLong = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight);
    assert.equal(routeIsLong, true, 'representative documentation route must extend beyond one viewport');

    const fixturePrepared = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return false;

      const fixture = document.createElement('div');
      fixture.setAttribute('data-visual-reachability-fixture', '');
      fixture.style.cssText = [
        'align-items:center',
        'display:flex',
        'justify-content:center',
        'min-height:12rem',
      ].join(';');

      const target = document.createElement('button');
      target.type = 'button';
      target.textContent = 'Reachability fixture target';
      target.setAttribute('data-visual-reachability-fixture-target', '');
      target.style.cssText = 'font:inherit;min-height:3rem;padding:0.75rem 1rem';
      fixture.append(target);
      main.append(fixture);
      target.scrollIntoView({block: 'center'});
      return true;
    });
    assert.equal(fixturePrepared, true, 'representative documentation route must render a main surface');
    await settle(page);
    await page.addStyleTag({path: FIXTURE_PATH});
    await page.evaluate(overlayId => {
      const target = document.querySelector('[data-visual-reachability-fixture-target]');
      const box = target.getBoundingClientRect();
      const root = document.documentElement.style;
      root.setProperty('--visual-reachability-fixture-left', `${box.left}px`);
      root.setProperty('--visual-reachability-fixture-top', `${box.top}px`);
      root.setProperty('--visual-reachability-fixture-width', `${box.width}px`);
      root.setProperty('--visual-reachability-fixture-height', `${box.height}px`);

      const overlay = document.createElement('div');
      overlay.id = overlayId;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.setAttribute('data-visual-reachability-fixture-overlay', '');
      overlay.textContent = 'Intentional occlusion';
      document.body.append(overlay);
    }, FIXTURE_OVERLAY_ID);
    await settle(page);

    const overlayPresentation = await page.evaluate(overlayId => {
      const overlay = document.getElementById(overlayId);
      const style = getComputedStyle(overlay);
      const box = overlay.getBoundingClientRect();

      return {
        visible: style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number.parseFloat(style.opacity) > 0 &&
          box.width > 0 &&
          box.height > 0,
        pointer_events: style.pointerEvents,
      };
    }, FIXTURE_OVERLAY_ID);
    const geometry = await page.evaluate(collectReachabilityGeometry);
    const fixtureTargets = geometry.unreachable_controls.filter(control => control.fixture_target);
    const fixtureTarget = fixtureTargets[0];
    const fixtureRejected = fixtureTargets.length === 1 &&
      fixtureTarget.blockers.some(blocker => blocker.id === FIXTURE_OVERLAY_ID);
    const report = {
      schema: 'durable-workflow.visual-reachability-report/v1',
      navigation_configuration: navigationConfiguration.id,
      route: navigationConfiguration.route,
      state,
      viewport,
      expected_rejection: true,
      rejected: fixtureRejected,
      overlay_presentation: overlayPresentation,
      geometry,
      browser_errors: browserErrors,
    };
    await page.screenshot({path: screenshot, animations: 'disabled'});
    writeJson(reportPath, report);

    assert.deepEqual(browserErrors, [], `${state} emitted browser errors`);
    assert.equal(geometry.horizontal_overflow, false, `${state} has horizontal overflow`);
    assert.equal(overlayPresentation.visible, true, 'fixture overlay must remain visible');
    assert.notEqual(overlayPresentation.pointer_events, 'none', 'fixture overlay must intercept pointer input');
    assert.equal(fixtureTargets.length, 1, 'reachability collector must report the covered fixture control');
    assert.equal(fixtureTarget.center_reachable, false, 'covered fixture control center must be unreachable');
    assert.equal(
      fixtureRejected,
      true,
      'reachability gate must attribute the fixture control occlusion to its visible overlay',
    );

    return {
      state,
      navigation_configuration: navigationConfiguration.id,
      route: navigationConfiguration.route,
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
  for (const navigationConfiguration of NAVIGATION_CONFIGURATIONS) {
    assert.ok(
      fs.existsSync(path.join(BUILD_DIRECTORY, navigationConfiguration.route, 'index.html')),
      `${navigationConfiguration.id} documentation route is missing from the Docusaurus build`,
    );
  }
  assert.ok(fs.existsSync(FIXTURE_PATH), 'occluded-control fixture stylesheet is missing');
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
    checks.push(await exerciseOccludedControlFixture(browser, baseUrl));
    for (const navigationConfiguration of NAVIGATION_CONFIGURATIONS) {
      for (const viewport of VIEWPORTS) {
        checks.push(await captureState({
          browser,
          baseUrl,
          navigationConfiguration,
          viewport,
          state: 'default',
        }));
      }
      for (const viewport of VIEWPORTS.slice(1)) {
        checks.push(await captureState({
          browser,
          baseUrl,
          navigationConfiguration,
          viewport,
          state: 'navigation-drawer',
          openNavigation: true,
        }));
      }
    }
    writeJson(path.join(outputDirectory, 'manifest.json'), {
      schema: 'durable-workflow.visual-reachability-manifest/v1',
      navigation_configurations: NAVIGATION_CONFIGURATIONS,
      generated_at: new Date().toISOString(),
      checks,
    });
    process.stdout.write(
      `Validated ${checks.length - 1} rendered states across ` +
        `${NAVIGATION_CONFIGURATIONS.length} documentation navigation configurations; ` +
        `the occluded-control fixture was rejected.\n`,
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
