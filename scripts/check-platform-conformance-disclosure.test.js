const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const {
  openPage,
  withBrowserAndServer,
} = require('./check-platform-conformance-disclosure');

const DISCLOSURE_COMMAND = 'npm run check:platform-conformance-disclosure';

function assertQualificationOrder() {
  const workflow = yaml.load(
    fs.readFileSync(path.resolve('.github/workflows/qualification.yml'), 'utf8'),
  );
  const steps = workflow.jobs['executable-contracts'].steps;
  const buildIndex = steps.findIndex(step => step.run === 'npm run docusaurus -- build');
  const browserInstallIndex = steps.findIndex(
    step => step.run === 'npx --no-install playwright install --with-deps chromium',
  );
  const disclosureIndex = steps.findIndex(step => step.run === DISCLOSURE_COMMAND);

  assert.ok(buildIndex >= 0, 'qualification must build the rendered routes');
  assert.ok(browserInstallIndex > buildIndex, 'qualification must install Chromium after building');
  assert.ok(
    disclosureIndex > browserInstallIndex,
    'qualification must run the disclosure check after installing Chromium',
  );

  const packageSource = require('../package.json');
  assert.equal(
    packageSource.scripts.build.includes('check-platform-conformance-disclosure.js'),
    false,
    'ordinary static builds must not launch the disclosure browser check',
  );
  assert.equal(
    packageSource.scripts['check:platform-conformance-disclosure'],
    'node scripts/check-platform-conformance-disclosure.js',
  );
}

async function assertBrowserLaunchFailureDoesNotStartServer() {
  const launchError = new Error('browser unavailable');
  let serverCreated = false;

  await assert.rejects(
    withBrowserAndServer(
      async () => {},
      {
        launchBrowser: async () => { throw launchError; },
        createServer: () => {
          serverCreated = true;
          return {};
        },
      },
    ),
    error => error === launchError,
  );
  assert.equal(serverCreated, false, 'the HTTP server must not start before Chromium launches');
}

async function assertValidationFailureClosesResources() {
  const validationError = new Error('navigation failed');
  let browserClosed = false;
  let serverClosed = false;
  const browser = {
    close: async () => { browserClosed = true; },
  };
  const server = {};

  await assert.rejects(
    withBrowserAndServer(
      async () => { throw validationError; },
      {
        launchBrowser: async () => browser,
        createServer: () => server,
        listen: async () => 'http://127.0.0.1:43210',
        closeServer: async value => {
          assert.equal(value, server);
          serverClosed = true;
        },
      },
    ),
    error => error === validationError,
  );
  assert.equal(serverClosed, true, 'validation failure must close the HTTP server');
  assert.equal(browserClosed, true, 'validation failure must close Chromium');
}

async function assertServerCleanupFailureStillClosesBrowser() {
  const serverCleanupError = new Error('server cleanup failed');
  let browserClosed = false;

  await assert.rejects(
    withBrowserAndServer(
      async () => {},
      {
        launchBrowser: async () => ({
          close: async () => { browserClosed = true; },
        }),
        createServer: () => ({}),
        listen: async () => 'http://127.0.0.1:43210',
        closeServer: async () => { throw serverCleanupError; },
      },
    ),
    error => error instanceof AggregateError && error.errors[0] === serverCleanupError,
  );
  assert.equal(browserClosed, true, 'server cleanup failure must not skip closing Chromium');
}

async function assertNavigationFailureClosesContext() {
  const navigationError = new Error('page navigation failed');
  let contextClosed = false;
  const page = {
    goto: async () => { throw navigationError; },
    on: () => {},
    route: async () => {},
  };
  const context = {
    close: async () => { contextClosed = true; },
    newPage: async () => page,
  };
  const browser = {
    newContext: async () => context,
  };

  await assert.rejects(
    openPage(browser, 'http://127.0.0.1:43210', {width: 390, height: 844}),
    error => error === navigationError,
  );
  assert.equal(contextClosed, true, 'navigation failure must close its browser context');
}

async function main() {
  assertQualificationOrder();
  await assertBrowserLaunchFailureDoesNotStartServer();
  await assertValidationFailureClosesResources();
  await assertServerCleanupFailureStillClosesBrowser();
  await assertNavigationFailureClosesContext();
  process.stdout.write('Platform conformance disclosure lifecycle tests passed.\n');
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
