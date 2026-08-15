const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');

const ARTICLE_ROUTE = '/blog/job-chaining-vs-fan-out-fan-in/';
const ARTICLE_SOURCE = path.resolve('blog/2022-12-06-job-chaining-vs-fan-out-fan-in.md');
const BUILD_DIRECTORY = path.resolve('build');
const PUBLIC_DOCS_ORIGIN = 'https://durable-workflow.com';
const DIAGRAM_ASSET_PREFIX = '/img/job-chaining/';
const DIAGRAMS = Object.freeze({
  'job-chaining': Object.freeze({
    light: '/img/job-chaining/job-chaining-light.svg',
    dark: '/img/job-chaining/job-chaining-dark.svg',
  }),
  'fan-out-fan-in': Object.freeze({
    light: '/img/job-chaining/fan-out-fan-in-light.svg',
    dark: '/img/job-chaining/fan-out-fan-in-dark.svg',
  }),
});
const THEMES = ['light', 'dark'];
const VIEWPORTS = [
  {name: 'desktop', width: 1440, height: 900},
  {name: 'mobile', width: 390, height: 844},
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

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isDiagramUrl(value) {
  try {
    return new URL(value, PUBLIC_DOCS_ORIGIN).pathname.startsWith(DIAGRAM_ASSET_PREFIX);
  } catch {
    return false;
  }
}

function assertSourceContract() {
  const article = fs.readFileSync(ARTICLE_SOURCE, 'utf8');
  assert.equal(
    article.includes('mermaid.ink'),
    false,
    'job-chaining article must not load diagrams from the Mermaid rendering service',
  );

  for (const [diagramId, assets] of Object.entries(DIAGRAMS)) {
    assert.match(
      article,
      new RegExp(`diagramId=["']${diagramId}["']`),
      `${diagramId} must expose a stable browser-check identifier`,
    );
    for (const [theme, asset] of Object.entries(assets)) {
      assert.ok(article.includes(asset), `${diagramId} must reference its ${theme} asset`);
      const assetPath = path.join('static', asset);
      assert.ok(fs.existsSync(assetPath), `${asset} must be deployment-owned`);
      const svg = fs.readFileSync(assetPath, 'utf8');
      assert.match(svg, /^<svg\b/, `${asset} must be an SVG image`);
      assert.match(svg, /<title\b/, `${asset} must retain an accessible title`);
      assert.match(svg, /<desc\b/, `${asset} must retain an accessible description`);
    }
  }
}

function validateScenarioObservation(observation) {
  assert.ok(THEMES.includes(observation.theme), 'diagram observation theme must be supported');
  assert.deepEqual(
    observation.diagrams.map(diagram => diagram.id).sort(),
    Object.keys(DIAGRAMS).sort(),
    `${observation.theme} ${observation.viewport} must render every selected diagram`,
  );
  assert.deepEqual(
    observation.failed_image_requests,
    [],
    `${observation.theme} ${observation.viewport} emitted diagram image request failures`,
  );
  assert.deepEqual(
    observation.failed_image_responses,
    [],
    `${observation.theme} ${observation.viewport} emitted diagram image HTTP errors`,
  );
  assert.deepEqual(
    observation.browser_errors,
    [],
    `${observation.theme} ${observation.viewport} emitted diagram-related browser errors`,
  );

  for (const diagram of observation.diagrams) {
    const expectedAssets = DIAGRAMS[diagram.id];
    assert.ok(expectedAssets, `${diagram.id} is not a selected diagram`);
    assert.equal(diagram.image_count, 2, `${diagram.id} must provide light and dark images`);
    assert.equal(diagram.visible_image_count, 1, `${diagram.id} must select exactly one theme image`);
    assert.deepEqual(
      [...diagram.all_sources].sort(),
      Object.values(expectedAssets).sort(),
      `${diagram.id} must only use deployment-owned theme assets`,
    );
    assert.equal(
      diagram.selected_source,
      expectedAssets[observation.theme],
      `${diagram.id} must select its ${observation.theme} asset`,
    );
    assert.equal(diagram.same_origin, true, `${diagram.id} must use Durable Workflow delivery`);
    assert.equal(diagram.complete, true, `${diagram.id} image must finish loading`);
    assert.ok(diagram.natural_width > 0, `${diagram.id} image must decode to a non-zero width`);
    assert.ok(diagram.natural_height > 0, `${diagram.id} image must decode to a non-zero height`);
    assert.ok(diagram.rendered_width > 0, `${diagram.id} image must render at a non-zero width`);
    assert.ok(diagram.rendered_height > 0, `${diagram.id} image must render at a non-zero height`);
    assert.equal(diagram.alt_present, true, `${diagram.id} image must retain meaningful alt text`);
  }
}

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
  assert.ok(address && typeof address === 'object', 'diagram preview server did not bind');
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}

async function fetchArticle(baseUrl) {
  const response = await fetch(new URL(ARTICLE_ROUTE, baseUrl), {
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': 'durable-workflow-job-chaining-diagram-check',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${ARTICLE_ROUTE} returned HTTP ${response.status}`);
  return response.text();
}

function articleHasCandidateAssets(html) {
  return Object.values(DIAGRAMS)
    .flatMap(assets => Object.values(assets))
    .every(asset => html.includes(asset)) && !html.includes('mermaid.ink');
}

async function waitForCandidate(baseUrl) {
  const attempts = Number(optionValue('--candidate-attempts') || 30);
  const retryDelay = Number(optionValue('--candidate-retry-delay-ms') || 10_000);
  const failures = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const html = await fetchArticle(baseUrl);
      if (articleHasCandidateAssets(html)) {
        return {ready: true, attempts: attempt, mode: 'live-candidate'};
      }
      failures.push(`attempt ${attempt}: article did not reference the deployment-owned assets`);
    } catch (error) {
      failures.push(`attempt ${attempt}: ${error.message}`);
    }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, retryDelay));
  }
  throw new Error(`live article did not expose the candidate diagrams: ${failures.at(-1)}`);
}

async function settle(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function exerciseScenario(browser, baseUrl, outputDirectory, theme, viewport) {
  const context = await browser.newContext({
    viewport: {width: viewport.width, height: viewport.height},
    colorScheme: theme,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  const observation = {
    theme,
    viewport: viewport.name,
    width: viewport.width,
    height: viewport.height,
    diagrams: [],
    failed_image_requests: [],
    failed_image_responses: [],
    browser_errors: [],
    screenshot: `${theme}-${viewport.name}.png`,
  };

  try {
    await context.addInitScript(selectedTheme => {
      window.localStorage.setItem('theme', selectedTheme);
    }, theme);
    const page = await context.newPage();
    await page.route('https://api.github.com/repos/durable-workflow/workflow', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({stargazers_count: 1171}),
    }));
    page.on('requestfailed', request => {
      if (request.resourceType() === 'image' && isDiagramUrl(request.url())) {
        observation.failed_image_requests.push({
          url: request.url(),
          error: request.failure()?.errorText || 'unknown request failure',
        });
      }
    });
    page.on('response', response => {
      if (
        response.request().resourceType() === 'image'
        && isDiagramUrl(response.url())
        && !response.ok()
      ) {
        observation.failed_image_responses.push({url: response.url(), status: response.status()});
      }
    });
    page.on('console', message => {
      const location = message.location().url || '';
      if (
        message.type() === 'error'
        && (isDiagramUrl(location) || message.text().includes(DIAGRAM_ASSET_PREFIX))
      ) {
        observation.browser_errors.push({type: 'console', message: message.text().slice(0, 500)});
      }
    });
    page.on('pageerror', error => {
      observation.browser_errors.push({
        type: 'page',
        message: String(error.message || error).slice(0, 500),
      });
    });

    const response = await page.goto(new URL(ARTICLE_ROUTE, baseUrl).toString(), {
      waitUntil: 'domcontentloaded',
    });
    assert.equal(response?.status(), 200, `${ARTICLE_ROUTE} must render`);
    await page.locator(`html[data-theme="${theme}"]`).waitFor();

    for (const diagramId of Object.keys(DIAGRAMS)) {
      const wrapper = page.locator(`[data-diagram-id="${diagramId}"]`);
      await wrapper.waitFor();
      assert.equal(await wrapper.count(), 1, `${diagramId} must render exactly once`);
      const images = wrapper.locator('img');
      const visibleImages = wrapper.locator('img:visible');
      await visibleImages.waitFor();
      await visibleImages.scrollIntoViewIfNeeded();
      await visibleImages.evaluate(image => image.decode());
      await settle(page);

      const selected = await visibleImages.evaluate((image, origin) => {
        const bounds = image.getBoundingClientRect();
        const selectedUrl = new URL(image.currentSrc || image.src, window.location.href);
        return {
          selected_source: selectedUrl.pathname,
          same_origin: selectedUrl.origin === origin,
          complete: image.complete,
          natural_width: image.naturalWidth,
          natural_height: image.naturalHeight,
          rendered_width: bounds.width,
          rendered_height: bounds.height,
          alt_present: image.alt.trim().length > 0,
        };
      }, new URL(baseUrl).origin);
      observation.diagrams.push({
        id: diagramId,
        image_count: await images.count(),
        visible_image_count: await visibleImages.count(),
        all_sources: await images.evaluateAll(elements => elements.map(image => (
          new URL(image.currentSrc || image.src, window.location.href).pathname
        ))),
        ...selected,
      });
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page);
    await page.screenshot({
      path: path.join(outputDirectory, observation.screenshot),
      fullPage: true,
    });
    validateScenarioObservation(observation);
    return observation;
  } finally {
    await context.close();
  }
}

async function main() {
  const liveMode = process.argv.includes('--live');
  const waitForLiveCandidate = process.argv.includes('--wait-for-candidate');
  const outputDirectory = path.resolve(
    optionValue('--output') || 'job-chaining-diagram-browser-evidence',
  );
  fs.mkdirSync(outputDirectory, {recursive: true});
  const report = {
    schema: 'durable-workflow.docs.job-chaining-diagram-browser-evidence/v1',
    mode: liveMode ? 'live' : 'local-build',
    article_route: ARTICLE_ROUTE,
    started_at: new Date().toISOString(),
    completed_at: null,
    candidate_readiness: null,
    scenarios: [],
    outcome: 'failure',
    failure: null,
  };
  let browser;
  let server;
  let failure;

  try {
    assertSourceContract();
    assert.ok(!liveMode || waitForLiveCandidate, 'live diagram check must wait for the candidate');
    assert.ok(
      fs.existsSync(path.join(BUILD_DIRECTORY, ARTICLE_ROUTE, 'index.html')),
      'run the Docusaurus build before the diagram browser check',
    );
    server = liveMode ? null : createStaticServer();
    const baseUrl = liveMode ? PUBLIC_DOCS_ORIGIN : await listen(server);
    report.candidate_readiness = liveMode
      ? await waitForCandidate(baseUrl)
      : {ready: true, attempts: 1, mode: 'local-build'};
    browser = await chromium.launch({
      executablePath: process.env.JOB_CHAINING_DIAGRAM_CHROMIUM_PATH || undefined,
      headless: true,
      chromiumSandbox: false,
      args: ['--disable-dev-shm-usage'],
    });

    for (const theme of THEMES) {
      for (const viewport of VIEWPORTS) {
        report.scenarios.push(
          await exerciseScenario(browser, baseUrl, outputDirectory, theme, viewport),
        );
      }
    }
    report.outcome = 'pass';
  } catch (error) {
    failure = error;
    report.failure = {name: error.name, message: error.message};
  } finally {
    const cleanupErrors = [];
    for (const [label, cleanup] of [
      ['browser', () => browser?.close()],
      ['preview server', () => closeServer(server)],
    ]) {
      try {
        await cleanup();
      } catch (error) {
        cleanupErrors.push(new Error(`failed to close ${label}: ${error.message}`));
      }
    }
    report.completed_at = new Date().toISOString();
    fs.writeFileSync(
      path.join(outputDirectory, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    if (!failure && cleanupErrors.length > 0) failure = new AggregateError(cleanupErrors);
  }

  if (failure) throw failure;
  process.stdout.write(
    `Validated ${Object.keys(DIAGRAMS).length} deployment-owned diagrams in `
      + `${report.scenarios.length} theme and viewport scenarios.\n`,
  );
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  ARTICLE_ROUTE,
  DIAGRAMS,
  THEMES,
  VIEWPORTS,
  articleHasCandidateAssets,
  assertSourceContract,
  isDiagramUrl,
  validateScenarioObservation,
};
