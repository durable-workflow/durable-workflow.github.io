const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');
const {
  CLOUD_EARLY_ACCESS_URL,
  PROMOTION_EVENTS,
  PROMOTION_EVENT_URL,
  PROMOTION_PAYLOAD_FIELDS,
  PROMOTION_PLACEMENTS,
  PUBLIC_DOCS_ORIGIN,
} = require('./cloud-promotion-contract');

const BUILD_DIRECTORY = path.resolve('build');
const OUTPUT_DIRECTORY = path.resolve(
  optionValue('--output') || 'cloud-promotion-browser-evidence',
);
const LIVE_MODE = process.argv.includes('--live');
const WAIT_FOR_CANDIDATE = process.argv.includes('--wait-for-candidate');
const EVENT_TIMEOUT_MS = 15_000;
const CANDIDATE_ATTEMPTS = Number(optionValue('--candidate-attempts') || 30);
const CANDIDATE_RETRY_DELAY_MS = Number(optionValue('--candidate-retry-delay-ms') || 10_000);
const CANDIDATE_REQUEST_TIMEOUT_MS = 15_000;
const GITHUB_REPOSITORY_API = 'https://api.github.com/repos/durable-workflow/workflow';
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function scriptAssetPaths(html) {
  return [...String(html).matchAll(/<script\b[^>]*\ssrc="([^"]+)"/gi)]
    .map(match => match[1].replaceAll('&amp;', '&'))
    .filter(source => source.startsWith('/assets/js/'))
    .map(source => new URL(source, PUBLIC_DOCS_ORIGIN).pathname)
    .sort();
}

function promotionCandidate() {
  const javascriptDirectory = path.join(BUILD_DIRECTORY, 'assets/js');
  assert.ok(fs.existsSync(javascriptDirectory), 'candidate build is missing JavaScript assets');
  const javascriptFiles = fs.readdirSync(javascriptDirectory)
    .filter(file => file.endsWith('.js'))
    .sort();
  const placements = PROMOTION_PLACEMENTS.map(placement => {
    const html = fs.readFileSync(path.join(BUILD_DIRECTORY, placement.buildPath), 'utf8');
    const shellScripts = scriptAssetPaths(html);
    const matchingBundles = javascriptFiles.filter(file => {
      const source = fs.readFileSync(path.join(javascriptDirectory, file), 'utf8');
      return source.includes(placement.source) && source.includes('/promotion-events');
    });

    assert.ok(shellScripts.length > 0, `${placement.source} candidate shell has no scripts`);
    assert.equal(
      matchingBundles.length,
      1,
      `${placement.source} must resolve to one generated promotion bundle`,
    );

    const bundleFile = matchingBundles[0];
    const bundle = fs.readFileSync(path.join(javascriptDirectory, bundleFile));
    return {
      route: placement.route,
      source: placement.source,
      shell_scripts: shellScripts,
      bundle: {
        path: `/assets/js/${bundleFile}`,
        sha256: sha256(bundle),
      },
    };
  });
  const identity = sha256(Buffer.from(JSON.stringify(placements)));

  return {
    identity: `sha256:${identity}`,
    placements,
  };
}

async function fetchCandidateBody(url) {
  const response = await fetch(url, {
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': 'durable-workflow-cloud-promotion-candidate-check',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(CANDIDATE_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${url.href} returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function observeCandidate(baseUrl, candidate, attempt, fetcher = fetchCandidateBody) {
  const cacheKey = `${candidate.identity.slice('sha256:'.length, 18)}-${attempt}`;
  const documents = await Promise.all(candidate.placements.map(async placement => {
    const url = new URL(placement.route, `${baseUrl}/`);
    url.searchParams.set('promotion_candidate', cacheKey);
    try {
      const body = await fetcher(url);
      const observedScripts = scriptAssetPaths(body.toString('utf8'));
      const missingScripts = placement.shell_scripts.filter(script => !observedScripts.includes(script));
      return {
        route: placement.route,
        source: placement.source,
        expected_shell_scripts: placement.shell_scripts,
        observed_shell_scripts: observedScripts,
        missing_shell_scripts: missingScripts,
      };
    } catch (error) {
      return {
        route: placement.route,
        source: placement.source,
        error: error.message,
      };
    }
  }));
  const bundles = await Promise.all(candidate.placements.map(async placement => {
    const url = new URL(placement.bundle.path, `${baseUrl}/`);
    url.searchParams.set('promotion_candidate', cacheKey);
    try {
      const body = await fetcher(url);
      const observedDigest = sha256(body);
      return {
        source: placement.source,
        path: placement.bundle.path,
        expected_sha256: placement.bundle.sha256,
        observed_sha256: observedDigest,
        matches: observedDigest === placement.bundle.sha256,
      };
    } catch (error) {
      return {
        source: placement.source,
        path: placement.bundle.path,
        expected_sha256: placement.bundle.sha256,
        error: error.message,
        matches: false,
      };
    }
  }));
  const failures = [
    ...documents.flatMap(document => {
      if (document.error) return [`${document.source} shell: ${document.error}`];
      if (document.missing_shell_scripts.length > 0) {
        return [
          `${document.source} shell is missing ${document.missing_shell_scripts.join(', ')}`,
        ];
      }
      return [];
    }),
    ...bundles
      .filter(bundle => !bundle.matches)
      .map(bundle => (
        bundle.error
          ? `${bundle.source} bundle: ${bundle.error}`
          : `${bundle.source} bundle digest is ${bundle.observed_sha256}`
      )),
  ];

  return {attempt, documents, bundles, failures};
}

async function waitForCandidate(baseUrl, candidate) {
  const attempts = [];
  for (let attempt = 1; attempt <= CANDIDATE_ATTEMPTS; attempt += 1) {
    const observation = await observeCandidate(baseUrl, candidate, attempt);
    if (observation.failures.length === 0) {
      return {
        ready: true,
        ready_at: new Date().toISOString(),
        attempts: attempt,
        observation,
      };
    }
    attempts.push({attempt, failures: observation.failures});
    if (attempt < CANDIDATE_ATTEMPTS) {
      process.stderr.write(
        `Cloud promotion candidate is not live yet (${attempt}/${CANDIDATE_ATTEMPTS}): ` +
          `${observation.failures.join('; ')}\n`,
      );
      await new Promise(resolve => setTimeout(resolve, CANDIDATE_RETRY_DELAY_MS));
    }
  }

  const error = new Error(
    `Cloud promotion candidate did not become live after ${CANDIDATE_ATTEMPTS} attempts`,
  );
  error.candidateReadiness = {
    ready: false,
    attempts,
  };
  throw error;
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
  assert.ok(address && typeof address === 'object', 'promotion preview did not bind a port');
  return `http://durable-workflow.com:${address.port}`;
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}

function payloadForRequest(request) {
  try {
    return JSON.parse(request.postData() || '');
  } catch {
    return null;
  }
}

async function waitForEvent(records, event) {
  const deadline = Date.now() + EVENT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const matches = records.filter(record => record.payload?.event === event);
    if (matches.some(record => record.status !== null || record.failure !== null)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail(`timed out waiting for ${event} promotion event`);
}

async function settle(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(200);
}

async function validateEvent(record, expectedOrigin, source, event) {
  const headers = await record.request.allHeaders();
  const url = new URL(record.request.url());
  const payload = record.payload;

  assert.equal(record.failure, null, `${source} ${event} request failed`);
  assert.equal(record.status, 204, `${source} ${event} must receive HTTP 204`);
  assert.equal(record.request.method(), 'POST', `${source} ${event} must use POST`);
  assert.equal(url.origin + url.pathname, PROMOTION_EVENT_URL);
  assert.equal(url.search, '', `${source} ${event} must not put values in the query`);
  assert.equal(url.hash, '', `${source} ${event} must not put values in the fragment`);
  assert.equal(
    headers['content-type'],
    'text/plain',
    `${source} ${event} must use a simple content type`,
  );
  assert.equal(headers.authorization, undefined, `${source} ${event} must omit authorization`);
  assert.equal(headers.cookie, undefined, `${source} ${event} must omit cookies`);
  assert.equal(headers.referer, undefined, `${source} ${event} must omit Referer`);
  assert.ok(
    headers.origin === undefined || headers.origin === expectedOrigin,
    `${source} ${event} must not send an unrelated Origin`,
  );
  assert.deepEqual(Object.keys(payload || {}).sort(), [...PROMOTION_PAYLOAD_FIELDS]);
  assert.deepEqual(payload, {source, event});

  return {
    event,
    status: record.status,
    content_type: headers['content-type'],
    credentials_omitted: headers.authorization === undefined && headers.cookie === undefined,
    origin_header: headers.origin || null,
    payload,
    query: url.search,
    referrer_omitted: headers.referer === undefined,
  };
}

async function exercisePlacement(browser, baseUrl, placement, candidate) {
  const expectedOrigin = new URL(baseUrl).origin;
  const candidatePlacement = candidate.placements.find(entry => entry.source === placement.source);
  assert.ok(candidatePlacement, `${placement.source} is missing from the candidate build`);
  const context = await browser.newContext({
    viewport: {width: 1440, height: 900},
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const records = [];
  const consoleErrors = [];
  const httpErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const documentResponses = [];
  const scriptResponses = [];
  let pageResponse = null;
  let destinationResponse = null;
  let eventEvidence = null;

  const placementEvidence = () => ({
    route: placement.route,
    source: placement.source,
    page_origin: expectedOrigin,
    page_status: pageResponse?.status() || null,
    destination_status: destinationResponse?.status() || null,
    events: eventEvidence || records.map(record => ({
      event: record.payload?.event || null,
      source: record.payload?.source || null,
      payload_fields: Object.keys(record.payload || {}).sort(),
      status: record.status,
      failure: record.failure,
    })),
    candidate_bundle: {
      expected_path: candidatePlacement.bundle.path,
      expected_sha256: candidatePlacement.bundle.sha256,
      loaded: scriptResponses.some(response => response.path === candidatePlacement.bundle.path),
      script_responses: scriptResponses,
    },
    console_errors: consoleErrors,
    http_errors: httpErrors,
    page_errors: pageErrors,
    request_failures: requestFailures,
    document_responses: documentResponses,
    suppressed_requests: [GITHUB_REPOSITORY_API],
  });

  try {
    await context.route(GITHUB_REPOSITORY_API, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({stargazers_count: 1171}),
    }));
    if (!LIVE_MODE) {
      await context.route(PROMOTION_EVENT_URL, async route => {
        const request = route.request();
        const record = {
          request,
          payload: payloadForRequest(request),
          status: 204,
          failure: null,
        };
        records.push(record);
        const headers = await request.allHeaders();
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': headers.origin || expectedOrigin,
            'Cache-Control': 'no-store',
            'Vary': 'Origin',
          },
        });
      });
      await context.route(CLOUD_EARLY_ACCESS_URL, route => route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html lang="en"><title>Cloud early access</title></html>',
      }));
    }

    const capturePageErrors = candidatePage => {
      candidatePage.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500));
      });
      candidatePage.on('pageerror', error => (
        pageErrors.push(String(error.message || error).slice(0, 500))
      ));
    };
    capturePageErrors(page);
    context.on('page', capturePageErrors);
    context.on('request', request => {
      if (LIVE_MODE && request.url() === PROMOTION_EVENT_URL) {
        records.push({
          request,
          payload: payloadForRequest(request),
          status: null,
          failure: null,
        });
      }
    });
    context.on('response', response => {
      if (response.request().resourceType() === 'document') {
        documentResponses.push({status: response.status(), url: response.url()});
      }
      if (response.request().resourceType() === 'script') {
        scriptResponses.push({
          path: new URL(response.url()).pathname,
          status: response.status(),
        });
      }
      if (response.status() >= 400) {
        httpErrors.push({status: response.status(), url: response.url()});
      }
      const record = records.find(candidate => candidate.request === response.request());
      if (record) record.status = response.status();
    });
    context.on('requestfailed', request => {
      const failure = request.failure()?.errorText || 'unknown request failure';
      const record = records.find(candidate => candidate.request === request);
      if (!LIVE_MODE && record?.status === 204) return;
      requestFailures.push({failure, url: request.url()});
      if (record) record.failure = failure;
    });

    const pageUrl = new URL(placement.route, `${baseUrl}/`);
    if (LIVE_MODE) {
      pageUrl.searchParams.set(
        'promotion_candidate',
        candidate.identity.slice('sha256:'.length, 19),
      );
    }
    pageResponse = await page.goto(pageUrl.href, {waitUntil: 'networkidle'});
    assert.equal(pageResponse?.status(), 200, `${placement.route} must render HTTP 200`);
    assert.equal(new URL(page.url()).hostname, 'durable-workflow.com');
    assert.ok(
      scriptResponses.some(response => response.path === candidatePlacement.bundle.path),
      `${placement.source} did not load candidate bundle ${candidatePlacement.bundle.path}`,
    );

    const promotion = page.locator(`[data-promotion-source="${placement.source}"]`);
    await promotion.waitFor({state: 'visible'});
    assert.equal(await promotion.count(), 1, `${placement.route} must render one promotion`);
    const cta = promotion.locator('[data-promotion-action="early-access"]');
    assert.equal(
      await cta.getAttribute('href'),
      `${CLOUD_EARLY_ACCESS_URL}#source=${placement.source}`,
      `${placement.route} must retain the public early-access destination`,
    );

    await promotion.scrollIntoViewIfNeeded();
    await settle(page);
    await waitForEvent(records, 'impression');
    assert.equal(
      records.filter(record => record.payload?.event === 'impression').length,
      1,
      `${placement.source} must record one impression`,
    );

    const destinationResponsePromise = context.waitForEvent('response', response => (
      response.request().resourceType() === 'document'
      && response.url().startsWith(CLOUD_EARLY_ACCESS_URL)
      && response.url() !== PROMOTION_EVENT_URL
    )).catch(error => ({error}));
    const destinationPagePromise = context.waitForEvent('page');
    await cta.click();
    const destinationPage = await destinationPagePromise;
    const destinationResult = await destinationResponsePromise;
    assert.ok(
      !destinationResult.error,
      `${placement.source} CTA did not reach Cloud early access; ` +
        `page=${page.url()} documents=${JSON.stringify(documentResponses)}`,
    );
    destinationResponse = destinationResult;
    assert.equal(
      destinationResponse.status(),
      200,
      `${placement.source} CTA destination must return HTTP 200`,
    );
    await destinationPage.waitForLoadState('networkidle');
    assert.ok(destinationPage.url().startsWith(CLOUD_EARLY_ACCESS_URL));
    await waitForEvent(records, 'click');
    assert.equal(
      records.filter(record => record.payload?.event === 'click').length,
      1,
      `${placement.source} must record one click`,
    );
    await page.waitForTimeout(200);

    assert.deepEqual(consoleErrors, [], `${placement.source} emitted console errors`);
    assert.deepEqual(httpErrors, [], `${placement.source} received HTTP errors`);
    assert.deepEqual(pageErrors, [], `${placement.source} emitted page errors`);
    assert.deepEqual(requestFailures, [], `${placement.source} had failed requests`);

    eventEvidence = [];
    for (const event of PROMOTION_EVENTS) {
      const record = records.find(candidate => candidate.payload?.event === event);
      eventEvidence.push(await validateEvent(record, expectedOrigin, placement.source, event));
    }

    return placementEvidence();
  } catch (error) {
    error.promotionEvidence = placementEvidence();
    throw error;
  } finally {
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIRECTORY, {recursive: true});
  const reportPath = path.join(OUTPUT_DIRECTORY, 'report.json');
  const report = {
    schema: 'durable-workflow.docs.cloud-promotion-browser-evidence/v1',
    mode: LIVE_MODE ? 'live' : 'local-receiver',
    generated_at: new Date().toISOString(),
    docs_origin: null,
    event_path: PROMOTION_EVENT_URL,
    candidate_build: null,
    candidate_readiness: null,
    placements: [],
    outcome: 'failure',
    failure: null,
  };
  let browser = null;
  let server = null;
  let failure = null;

  try {
    assert.ok(
      !LIVE_MODE || WAIT_FOR_CANDIDATE,
      'live promotion qualification must wait for the exact candidate build',
    );
    assert.ok(fs.existsSync(path.join(BUILD_DIRECTORY, 'index.html')), 'run the Docusaurus build first');
    for (const placement of PROMOTION_PLACEMENTS) {
      assert.ok(
        fs.existsSync(path.join(BUILD_DIRECTORY, placement.buildPath)),
        `${placement.buildPath} is missing from the Docusaurus build`,
      );
    }
    const candidate = promotionCandidate();
    report.candidate_build = candidate;
    server = LIVE_MODE ? null : createStaticServer();
    const baseUrl = LIVE_MODE ? PUBLIC_DOCS_ORIGIN : await listen(server);
    report.docs_origin = new URL(baseUrl).origin;
    report.candidate_readiness = LIVE_MODE
      ? await waitForCandidate(baseUrl, candidate)
      : {ready: true, mode: 'local-build'};
    const launchArguments = ['--disable-dev-shm-usage'];
    if (!LIVE_MODE) {
      launchArguments.push(
        '--host-resolver-rules=MAP durable-workflow.com 127.0.0.1',
        '--no-proxy-server',
      );
    }
    browser = await chromium.launch({
      executablePath: process.env.CLOUD_PROMOTION_CHROMIUM_PATH || undefined,
      headless: true,
      chromiumSandbox: false,
      args: launchArguments,
    });

    for (const placement of PROMOTION_PLACEMENTS) {
      report.placements.push(await exercisePlacement(browser, baseUrl, placement, candidate));
    }
    report.outcome = 'pass';
  } catch (error) {
    failure = error;
    if (error.promotionEvidence) report.placements.push(error.promotionEvidence);
    if (error.candidateReadiness) report.candidate_readiness = error.candidateReadiness;
  } finally {
    for (const [label, cleanup] of [
      ['browser', () => browser?.close()],
      ['preview server', () => closeServer(server)],
    ]) {
      try {
        await cleanup();
      } catch (error) {
        if (!failure) failure = new Error(`failed to close ${label}: ${error.message}`);
      }
    }
    if (failure) {
      report.outcome = 'failure';
      report.failure = {
        name: failure.name,
        message: failure.message,
      };
    }
    report.completed_at = new Date().toISOString();
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (failure) throw failure;
  process.stdout.write(
    `Validated ${report.placements.length} Cloud promotion placements with successful ` +
      `impression and click events.\n`,
  );
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  observeCandidate,
  promotionCandidate,
  scriptAssetPaths,
};
