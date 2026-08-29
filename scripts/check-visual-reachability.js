const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');
const {collectReachabilityGeometry} = require('./visual-reachability');
const {
  classifyChangedDocumentation,
  resolveChangedFiles,
} = require('./docs-visual-route-classification');
const {ARTIFACT_PINS} = require('./public-artifact-versions');
const {
  MANIFEST_SCHEMA: SECTION_MANIFEST_SCHEMA,
  PUBLIC_MANIFESTS_SECTION,
  failedSectionCaptureDiagnostics,
  requiredSectionCaptures,
  resolveCandidateCommit,
  validateSectionCaptureEvidence,
} = require('./section-capture-qualification');

const BUILD_DIRECTORY = path.resolve('build');
const CLI_INSTALL_ROUTE = '/docs/2.0/polyglot/cli/';
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
  const consoleErrors = [];
  const pageErrors = [];
  await page.route('https://api.github.com/repos/durable-workflow/workflow', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({stargazers_count: 1171}),
  }));
  page.on('console', message => {
    if (message.type() === 'error') {
      const error = {type: 'console', message: message.text().slice(0, 500)};
      consoleErrors.push(error);
      browserErrors.push(error);
    }
  });
  page.on('pageerror', error => {
    const browserError = {
      type: 'page',
      message: String(error.message || error).slice(0, 500),
    };
    pageErrors.push(browserError);
    browserErrors.push(browserError);
  });

  const response = await page.goto(`${baseUrl}${navigationConfiguration.route}`, {waitUntil: 'networkidle'});
  assert.equal(
    response?.status(),
    200,
    `${navigationConfiguration.id} documentation route must render`,
  );
  await settle(page);

  return {context, page, browserErrors, consoleErrors, pageErrors};
}

function captureFailures({geometry, consoleErrors, pageErrors}) {
  const failures = [];
  if (geometry.horizontal_overflow) failures.push('horizontal overflow');
  if (geometry.unreachable_controls.length > 0) failures.push('unreachable controls');
  if (geometry.sticky_navigation_intersections.length > 0) {
    failures.push('sticky navigation intersections');
  }
  if (geometry.overlapping_floating_elements.length > 0) {
    failures.push('floating element overlap');
  }
  if (geometry.clipped_control_text.length > 0) failures.push('clipped control text');
  if (geometry.clipped_text.length > 0) failures.push('clipped text');
  if (consoleErrors.length > 0) failures.push('browser console errors');
  if (pageErrors.length > 0) failures.push('browser page errors');
  return failures;
}

async function captureSectionState({
  browser,
  baseUrl,
  section,
  viewport,
  candidateCommit,
  fileStemPrefix = '',
  prepareBeforeScroll,
  prepareAfterScroll,
}) {
  const navigationConfiguration = {
    id: section.navigation_configuration,
    route: section.route,
  };
  const {
    context,
    page,
    browserErrors,
    consoleErrors,
    pageErrors,
  } = await openPage(browser, baseUrl, viewport, navigationConfiguration);
  const fileStem = [fileStemPrefix, section.id, viewport.name].filter(Boolean).join('-');

  try {
    if (prepareBeforeScroll) await prepareBeforeScroll(page);
    await page.locator(section.scroll_target).waitFor({state: 'visible'});
    if (section.geometry_scope) {
      await page.locator(section.geometry_scope).waitFor({state: 'visible'});
    }
    await page.evaluate(interaction => {
      window.scrollTo(0, 0);
      document.querySelector(interaction.selector)?.scrollIntoView({
        block: interaction.block,
      });
    }, section.interaction);
    await settle(page);
    if (prepareAfterScroll) {
      await prepareAfterScroll(page);
      await settle(page);
    }

    for (const selector of section.required_visible || []) {
      const targetIsInsideViewport = await page.locator(selector).first().evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.right > 0
          && bounds.left < document.documentElement.clientWidth
          && bounds.bottom > 0
          && bounds.top < document.documentElement.clientHeight;
      });
      assert.equal(
        targetIsInsideViewport,
        true,
        `${section.id} must keep ${selector} in the section-focused viewport`,
      );
    }

    const geometry = await page.evaluate(collectReachabilityGeometry, {
      scopeSelector: section.geometry_scope || null,
    });
    const qualificationFailures = captureFailures({
      geometry,
      consoleErrors,
      pageErrors,
    });
    const captureExitStatus = qualificationFailures.length === 0 ? 0 : 1;
    const screenshot = path.join(outputDirectory, `${fileStem}.png`);
    const reportPath = path.join(outputDirectory, `${fileStem}.json`);
    const report = {
      schema: 'durable-workflow.visual-reachability-report/v1',
      candidate_commit: candidateCommit,
      section_id: section.id,
      navigation_configuration: section.navigation_configuration,
      route: section.route,
      state: section.state,
      state_scope: section.state_scope,
      scroll_target: section.scroll_target,
      geometry_scope: section.geometry_scope,
      required_visible: section.required_visible,
      selection_reason: section.selection_reason,
      interaction: section.interaction,
      viewport,
      capture_exit_status: captureExitStatus,
      qualification_failures: qualificationFailures,
      geometry,
      console_errors: consoleErrors,
      page_errors: pageErrors,
      browser_errors: browserErrors,
    };

    await page.screenshot({path: screenshot, animations: 'disabled'});
    writeJson(reportPath, report);

    return {
      section_id: section.id,
      navigation_configuration: section.navigation_configuration,
      route: section.route,
      state: section.state,
      state_scope: section.state_scope,
      scroll_target: section.scroll_target,
      geometry_scope: section.geometry_scope,
      required_visible: section.required_visible,
      selection_reason: section.selection_reason,
      interaction: section.interaction,
      viewport,
      candidate_commit: candidateCommit,
      capture_exit_status: captureExitStatus,
      qualification_failures: qualificationFailures,
      screenshot: path.basename(screenshot),
      report: path.basename(reportPath),
      unreachable_control_count: geometry.unreachable_controls.length,
      sticky_navigation_intersection_count:
        geometry.sticky_navigation_intersections.length,
      floating_overlap_count: geometry.overlapping_floating_elements.length,
    };
  } finally {
    await context.close();
  }
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

async function exerciseOccludedSectionFixture(browser, baseUrl, candidateCommit) {
  const viewport = VIEWPORTS[0];
  const fixtureSection = {
    ...PUBLIC_MANIFESTS_SECTION,
    id: 'fixture-sticky-navigation-disclosure',
    state: 'fixture-sticky-navigation-disclosure',
    scroll_target: '[data-visual-reachability-fixture-target]',
    interaction: {
      action: 'scroll-to',
      selector: '[data-visual-reachability-fixture-target]',
      block: 'center',
    },
  };
  const check = await captureSectionState({
    browser,
    baseUrl,
    section: fixtureSection,
    viewport,
    candidateCommit,
    fileStemPrefix: 'negative',
    prepareBeforeScroll: async page => {
      const fixturePrepared = await page.evaluate(() => {
        const heading = document.querySelector('#public-manifests');
        if (!heading?.parentElement) return false;

        const disclosure = document.createElement('details');
        disclosure.setAttribute('data-visual-reachability-fixture', '');
        disclosure.style.cssText = 'margin:2rem 0;min-height:8rem';
        const target = document.createElement('summary');
        target.id = 'fixture-sticky-navigation-disclosure';
        target.textContent = 'Sticky navigation reachability fixture';
        target.setAttribute('data-visual-reachability-fixture-target', '');
        target.style.cssText = 'min-height:3rem;padding:0.75rem 1rem';
        disclosure.append(target, document.createTextNode('Fixture disclosure content'));
        heading.parentElement.insertBefore(disclosure, heading);
        return true;
      });
      assert.equal(
        fixturePrepared,
        true,
        'the platform conformance page must accept the disclosure fixture',
      );
    },
    prepareAfterScroll: async page => {
      await page.evaluate(() => {
        const navbar = document.querySelector('.navbar');
        const target = document.querySelector('[data-visual-reachability-fixture-target]');
        const navbarBottom = navbar?.getBoundingClientRect().bottom || 0;
        const targetBox = target.getBoundingClientRect();
        const desiredTop = navbarBottom - (targetBox.height * 0.15);
        window.scrollBy(0, targetBox.top - desiredTop);
      });
    },
  });
  const report = JSON.parse(
    fs.readFileSync(path.join(outputDirectory, check.report), 'utf8'),
  );
  const fixtureTargets = report.geometry.unreachable_controls.filter(
    control => control.fixture_target,
  );
  const intersectingFixtureTargets = report.geometry.sticky_navigation_intersections.filter(
    control => control.fixture_target,
  );

  assert.equal(
    fixtureTargets.length,
    0,
    'the partial-intersection fixture must remain mostly reachable',
  );
  assert.equal(
    intersectingFixtureTargets.length,
    1,
    'geometry collection must report the partially intersecting disclosure',
  );
  assert.equal(
    intersectingFixtureTargets[0].tag,
    'summary',
    'the negative section fixture must exercise an interactive disclosure',
  );
  assert.equal(
    intersectingFixtureTargets[0].rect.y
      < intersectingFixtureTargets[0].navbar_bottom,
    true,
    'the fixture disclosure must intersect sticky navigation',
  );
  assert.equal(
    check.capture_exit_status,
    1,
    'the partially occluded disclosure capture must exit unsuccessfully',
  );
  assert.throws(
    () => validateSectionCaptureEvidence({
      manifest: {
        schema: SECTION_MANIFEST_SCHEMA,
        candidate_commit: candidateCommit,
        capture_exit_status: check.capture_exit_status,
        checks: [check],
      },
      evidenceDirectory: outputDirectory,
      candidateCommit,
      requiredCaptures: [{...fixtureSection, viewport}],
    }),
    /unsuccessful capture exit status/,
    'section capture qualification must reject the sticky-navigation fixture evidence',
  );

  return {
    ...check,
    expected_rejection: true,
    rejected: true,
  };
}

async function exerciseWrappedInlineBoundaryFixture(browser, baseUrl) {
  const viewport = VIEWPORTS.find(candidate => candidate.name === 'mobile');
  const navigationConfiguration = NAVIGATION_CONFIGURATIONS.find(
    candidate => candidate.id === 'current-v2',
  );
  const {context, page, browserErrors} = await openPage(
    browser,
    baseUrl,
    viewport,
    navigationConfiguration,
  );
  const state = 'fixture-wrapped-inline-boundary';
  const screenshot = path.join(outputDirectory, `${state}.png`);
  const reportPath = path.join(outputDirectory, `${state}.json`);

  try {
    await page.evaluate(() => {
      const fixture = document.createElement('div');
      fixture.style.cssText = [
        'bottom:-8px',
        'font:16px/20px sans-serif',
        'left:16px',
        'position:fixed',
        'width:112px',
      ].join(';');
      const target = document.createElement('a');
      target.href = '#wrapped-inline-boundary-fixture';
      target.textContent = 'Wrapped inline control at the viewport boundary';
      target.setAttribute('data-visual-reachability-fixture-target', '');
      target.style.cssText = 'overflow-wrap:anywhere';
      fixture.append(target);
      document.body.replaceChildren(fixture);
    });
    await settle(page);

    const fixture = await page.evaluate(() => {
      const target = document.querySelector('[data-visual-reachability-fixture-target]');
      const viewport = {
        left: 0,
        top: 0,
        right: document.documentElement.clientWidth,
        bottom: document.documentElement.clientHeight,
      };
      const fragments = [...target.getClientRects()];
      const visibleFragments = fragments
        .map(fragment => ({
          left: Math.max(fragment.left, viewport.left),
          top: Math.max(fragment.top, viewport.top),
          right: Math.min(fragment.right, viewport.right),
          bottom: Math.min(fragment.bottom, viewport.bottom),
        }))
        .filter(fragment => fragment.right > fragment.left && fragment.bottom > fragment.top);
      const boundaryFragment = visibleFragments.at(-1);
      const missedCenter = {
        x: boundaryFragment.left + ((boundaryFragment.right - boundaryFragment.left) / 2),
        y: boundaryFragment.top + ((boundaryFragment.bottom - boundaryFragment.top) / 2),
      };
      const originalElementFromPoint = document.elementFromPoint.bind(document);
      const originalElementsFromPoint = document.elementsFromPoint.bind(document);
      const nativeCenterHit = originalElementFromPoint(missedCenter.x, missedCenter.y);
      const isMissedCenter = (x, y) => (
        Math.abs(x - missedCenter.x) < 0.01 && Math.abs(y - missedCenter.y) < 0.01
      );
      const sampledArea = visibleFragments.reduce(
        (total, fragment) => total
          + ((fragment.right - fragment.left) * (fragment.bottom - fragment.top)),
        0,
      );
      const boundaryArea = (boundaryFragment.right - boundaryFragment.left)
        * (boundaryFragment.bottom - boundaryFragment.top);

      window.__wrappedInlineBoundaryMisses = 0;
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: (x, y) => {
          if (isMissedCenter(x, y)) {
            window.__wrappedInlineBoundaryMisses += 1;
            return null;
          }
          return originalElementFromPoint(x, y);
        },
      });
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: (x, y) => (isMissedCenter(x, y) ? [] : originalElementsFromPoint(x, y)),
      });

      return {
        fragment_count: fragments.length,
        visible_fragment_count: visibleFragments.length,
        extends_beyond_viewport: fragments.some(fragment => fragment.bottom > viewport.bottom),
        native_center_hit_is_target:
          nativeCenterHit === target || Boolean(target.contains(nativeCenterHit)),
        expected_reachable_area_ratio: 1 - ((boundaryArea / 25) / sampledArea),
      };
    });
    const geometry = await page.evaluate(collectReachabilityGeometry);
    fixture.emulated_blank_center_hits = await page.evaluate(
      () => window.__wrappedInlineBoundaryMisses,
    );
    const fixtureTargets = geometry.unreachable_controls.filter(
      control => control.fixture_target,
    );
    const report = {
      schema: 'durable-workflow.visual-reachability-report/v1',
      route: navigationConfiguration.route,
      state,
      viewport,
      fixture,
      geometry,
      browser_errors: browserErrors,
    };

    await page.screenshot({path: screenshot, animations: 'disabled'});
    writeJson(reportPath, report);

    assert.deepEqual(browserErrors, [], `${state} emitted browser errors`);
    assert.ok(fixture.fragment_count > 1, 'fixture target must be a wrapped inline control');
    assert.ok(
      fixture.visible_fragment_count > 1,
      'fixture target must expose multiple visible inline fragments',
    );
    assert.equal(
      fixture.extends_beyond_viewport,
      true,
      'fixture target must cross the mobile viewport boundary',
    );
    assert.equal(
      fixture.native_center_hit_is_target,
      true,
      'fixture must emulate a browser miss at an otherwise clickable fragment center',
    );
    assert.ok(
      fixture.expected_reachable_area_ratio >= 0.5,
      'fixture target must retain at least half of its sampled reachable area',
    );
    assert.ok(
      fixture.emulated_blank_center_hits > 0,
      'reachability collection must sample the emulated blank fragment center',
    );
    assert.equal(
      fixtureTargets.length,
      0,
      'an unblocked wrapped inline control must pass by reachable visible area',
    );

    return {
      state,
      navigation_configuration: navigationConfiguration.id,
      route: navigationConfiguration.route,
      viewport,
      screenshot: path.basename(screenshot),
      report: path.basename(reportPath),
      wrapped_fragment_count: fixture.fragment_count,
      emulated_blank_center_hits: fixture.emulated_blank_center_hits,
      unreachable_control_count: geometry.unreachable_controls.length,
    };
  } finally {
    await context.close();
  }
}

async function checkCliInstallLinks(browser, baseUrl) {
  const navigationConfiguration = {
    id: 'current-v2-cli-install',
    route: CLI_INSTALL_ROUTE,
  };
  const viewport = VIEWPORTS[0];
  const {context, page, browserErrors} = await openPage(
    browser,
    baseUrl,
    viewport,
    navigationConfiguration,
  );

  try {
    const platformButtons = page.locator('button[data-cli-platform]');
    const platformCount = await platformButtons.count();
    assert.ok(platformCount > 0, 'CLI install component must render platform choices');

    const details = page.locator('details[data-cli-direct-download]');
    await details.waitFor({state: 'visible'});
    await details.evaluate(element => {
      element.open = true;
    });

    const checkedPlatforms = [];
    for (let index = 0; index < platformCount; index += 1) {
      const button = platformButtons.nth(index);
      const platform = await button.getAttribute('data-cli-platform');
      assert.ok(platform, 'every CLI platform button must declare its machine identifier');
      await button.click();

      const assetLink = details.locator('a[data-cli-asset-download]');
      const releaseLink = details.locator('a[data-cli-qualified-release]');
      const asset = (await assetLink.textContent()).trim();
      const assetUrl = new URL(await assetLink.getAttribute('href'));
      const releaseUrl = await releaseLink.getAttribute('href');

      assert.equal(assetUrl.origin, 'https://github.com');
      assert.equal(
        assetUrl.pathname,
        `/durable-workflow/cli/releases/download/${ARTIFACT_PINS.cliVersion}/${asset}`,
        `${platform} must download the CLI artifact selected by the qualified authority`,
      );
      assert.equal(
        releaseUrl,
        ARTIFACT_PINS.cliPackageUrl,
        `${platform} must link to the qualified CLI release`,
      );
      assert.doesNotMatch(assetUrl.pathname, /\/releases\/latest(?:\/|$)/);
      assert.doesNotMatch(releaseUrl, /\/releases\/latest(?:\/|$)/);
      checkedPlatforms.push(platform);
    }

    assert.equal(
      new Set(checkedPlatforms).size,
      platformCount,
      'CLI platform machine identifiers must be unique',
    );
    assert.deepEqual(browserErrors, [], 'CLI install component emitted browser errors');

    return {
      state: 'qualified-direct-download-links',
      navigation_configuration: navigationConfiguration.id,
      route: navigationConfiguration.route,
      viewport,
      qualified_cli_version: ARTIFACT_PINS.cliVersion,
      checked_platforms: checkedPlatforms,
      browser_errors: browserErrors,
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
  assert.ok(
    fs.existsSync(path.join(BUILD_DIRECTORY, CLI_INSTALL_ROUTE, 'index.html')),
    'current CLI install route is missing from the Docusaurus build',
  );
  fs.mkdirSync(outputDirectory, {recursive: true});
  const candidateCommit = resolveCandidateCommit();
  const routeClassification = classifyChangedDocumentation({
    changedFiles: resolveChangedFiles(),
  });
  for (const section of routeClassification.sections) {
    assert.ok(
      fs.existsSync(path.join(BUILD_DIRECTORY, section.route, 'index.html')),
      `${section.id} route is missing from the Docusaurus build: ${section.route}`,
    );
  }
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
    checks.push(await exerciseOccludedSectionFixture(browser, baseUrl, candidateCommit));
    checks.push(await exerciseWrappedInlineBoundaryFixture(browser, baseUrl));
    checks.push(await checkCliInstallLinks(browser, baseUrl));
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
    const sectionChecks = [];
    for (const section of routeClassification.sections) {
      for (const viewport of section.viewports) {
        const check = await captureSectionState({
          browser,
          baseUrl,
          section,
          viewport,
          candidateCommit,
        });
        sectionChecks.push(check);
        checks.push(check);
      }
    }
    const sectionManifest = {
      schema: SECTION_MANIFEST_SCHEMA,
      candidate_commit: candidateCommit,
      capture_exit_status: sectionChecks.some(check => check.capture_exit_status !== 0) ? 1 : 0,
      checks: sectionChecks,
      route_classification: {
        schema: routeClassification.schema,
        changed_files: routeClassification.changed_files,
        selected_sections: routeClassification.sections.map(section => ({
          section_id: section.id,
          route: section.route,
          state: section.state,
          scroll_target: section.scroll_target,
          geometry_scope: section.geometry_scope,
          selection_reason: section.selection_reason,
        })),
      },
    };
    const sectionManifestPath = path.join(
      outputDirectory,
      'section-capture-manifest.json',
    );
    writeJson(sectionManifestPath, sectionManifest);
    writeJson(path.join(outputDirectory, 'manifest.json'), {
      schema: 'durable-workflow.visual-reachability-manifest/v1',
      candidate_commit: candidateCommit,
      navigation_configurations: NAVIGATION_CONFIGURATIONS,
      generated_at: new Date().toISOString(),
      checks,
    });
    for (const diagnostic of failedSectionCaptureDiagnostics(sectionChecks)) {
      process.stderr.write(`Section capture failed: ${diagnostic}\n`);
    }
    const consumedSectionCaptures = validateSectionCaptureEvidence({
      manifest: sectionManifest,
      evidenceDirectory: outputDirectory,
      candidateCommit,
      requiredCaptures: requiredSectionCaptures(routeClassification.sections),
    });
    process.stdout.write(
      `Validated ${checks.length - 1} rendered states across ` +
        `${NAVIGATION_CONFIGURATIONS.length} documentation navigation configurations; ` +
        `${consumedSectionCaptures.length} exact-revision section reports were consumed, ` +
        `and the sticky-navigation disclosure fixture was rejected.\n`,
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
