#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const introductionPath = path.join(repoRoot, 'docs', 'introduction.md');
const quickstartPath = path.join(repoRoot, 'docs', 'quickstart.md');
const capabilitiesPath = path.join(repoRoot, 'docs', 'capabilities.md');
const phpSdkPath = path.join(repoRoot, 'docs', 'polyglot', 'php.md');
const serverPath = path.join(repoRoot, 'docs', 'polyglot', 'server.md');
const sidebarsPath = path.join(repoRoot, 'sidebars.js');

const REQUIRED_INTRO_ROUTES = Object.freeze([
  '/docs/2.0/polyglot/php/',
  '/docs/2.0/polyglot/python/',
  '/docs/2.0/polyglot/rust/',
  '/docs/2.0/polyglot/server/',
  '/docs/2.0/polyglot/cloud-control-plane/',
  '/docs/2.0/capabilities/',
  '/docs/2.0/polyglot/deployment-modes/',
  '/docs/2.0/polyglot/cli-python-parity/',
  '/docs/2.0/agent-operating-loop/',
  '/docs/2.0/quickstart/',
  '/docs/2.0/sample-app/',
]);

const REQUIRED_QUICKSTART_ROUTES = Object.freeze([
  '/docs/2.0/capabilities/',
  '/docs/2.0/polyglot/php/',
  '/docs/2.0/polyglot/python/',
  '/docs/2.0/polyglot/rust/',
  '/docs/2.0/polyglot/server/',
  '/docs/2.0/polyglot/cloud-control-plane/',
  '/docs/2.0/polyglot/deployment-modes/',
]);

const REQUIRED_CAPABILITY_ROUTES = Object.freeze([
  '/docs/2.0/polyglot/php/',
  '/docs/2.0/polyglot/python/',
  '/docs/2.0/polyglot/rust/',
  '/docs/2.0/polyglot/server/',
  '/docs/2.0/polyglot/cloud-control-plane/',
  '/docs/2.0/polyglot/deployment-modes/',
  '/docs/2.0/monitoring/',
]);

const ONBOARDING_DOC_IDS = Object.freeze([
  'introduction',
  'quickstart',
  'capabilities',
]);

const SERVICE_MODE_DOC_IDS = Object.freeze([
  'polyglot/deployment-modes',
  'polyglot/cloud-control-plane',
  'polyglot/server',
  'polyglot/php',
  'polyglot/python',
  'polyglot/rust',
]);

const MONITORING_DOC_ID = 'monitoring';
const MONITORING_ROUTE = '/docs/2.0/monitoring/';

function fail(message) {
  throw new Error(message);
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function sourceCandidatesForRoute(route) {
  const docId = route
    .replace(/^\/docs\/2\.0\//, '')
    .replace(/\/$/, '');

  return [
    path.join(repoRoot, 'docs', `${docId}.md`),
    path.join(repoRoot, 'docs', `${docId}.mdx`),
  ];
}

function assertRouteExists(route, sourceLabel) {
  if (!sourceCandidatesForRoute(route).some(candidate => fs.existsSync(candidate))) {
    fail(`${sourceLabel} route ${route} does not map to a 2.0 documentation source`);
  }
}

function firstPosition(source, value, label) {
  const position = source.indexOf(value);
  if (position === -1) {
    fail(`${label} is missing ${JSON.stringify(value)}`);
  }
  return position;
}

function assertDocumentLinks(source, sourceLabel, routes) {
  for (const route of routes) {
    assertRouteExists(route, sourceLabel);
    firstPosition(source, route, sourceLabel);
  }
}

function assertIntroductionPackageBoundary(introduction) {
  firstPosition(
    introduction,
    'durable-workflow/sdk',
    'docs/introduction.md service-mode PHP package boundary',
  );
  firstPosition(
    introduction,
    'durable-workflow/workflow',
    'docs/introduction.md embedded Laravel package boundary',
  );
}

function sidebarDocId(item) {
  if (typeof item === 'string') {
    return item;
  }

  if (item?.type === 'doc') {
    return item.id;
  }

  return null;
}

function collectSidebarDocIds(item, docIds = []) {
  const docId = sidebarDocId(item);
  if (docId) {
    docIds.push(docId);
  }

  for (const child of item?.items || []) {
    collectSidebarDocIds(child, docIds);
  }

  return docIds;
}

function collectSidebarHrefs(item, hrefs = []) {
  if (item?.type === 'link') {
    hrefs.push(item.href);
  }

  for (const child of item?.items || []) {
    collectSidebarHrefs(child, hrefs);
  }

  return hrefs;
}

function assertSidebarTopology(sidebars) {
  const tutorialSidebar = sidebars.tutorialSidebar;
  if (!Array.isArray(tutorialSidebar)) {
    fail('sidebars.js must export tutorialSidebar as an array');
  }

  const onboardingDocIds = tutorialSidebar
    .slice(0, ONBOARDING_DOC_IDS.length)
    .map(sidebarDocId);
  if (JSON.stringify(onboardingDocIds) !== JSON.stringify(ONBOARDING_DOC_IDS)) {
    fail(`sidebars.js must begin with ${ONBOARDING_DOC_IDS.join(' -> ')}`);
  }

  const serviceMode = tutorialSidebar.find(
    item => item?.type === 'category' && item.label === 'Service Mode',
  );
  if (!serviceMode || serviceMode.link?.type !== 'generated-index') {
    fail('sidebars.js must expose Service Mode through a generated index');
  }

  const serviceModeDocIds = new Set(collectSidebarDocIds(serviceMode));
  for (const docId of SERVICE_MODE_DOC_IDS) {
    if (!serviceModeDocIds.has(docId)) {
      fail(`Service Mode navigation is missing ${docId}`);
    }
  }

  const serviceModeMonitoringEntries = [
    ...collectSidebarDocIds(serviceMode).filter(docId => docId === MONITORING_DOC_ID),
    ...collectSidebarHrefs(serviceMode).filter(href => href === MONITORING_ROUTE),
  ];
  if (serviceModeMonitoringEntries.length !== 0) {
    fail(`Service Mode navigation must not expose ${MONITORING_ROUTE}`);
  }

  const runAndOperate = tutorialSidebar.find(
    item => item?.type === 'category' && item.label === 'Run And Operate',
  );
  if (!runAndOperate || runAndOperate.link?.type !== 'generated-index') {
    fail('sidebars.js must expose Run And Operate through a generated index');
  }

  const monitoringDocIds = collectSidebarDocIds(runAndOperate)
    .filter(docId => docId === MONITORING_DOC_ID);
  if (monitoringDocIds.length !== 1) {
    fail(`Run And Operate navigation must expose ${MONITORING_ROUTE} exactly once`);
  }

  const allMonitoringEntries = [
    ...collectSidebarDocIds({items: tutorialSidebar})
      .filter(docId => docId === MONITORING_DOC_ID),
    ...collectSidebarHrefs({items: tutorialSidebar})
      .filter(href => href === MONITORING_ROUTE),
  ];
  if (allMonitoringEntries.length !== 1) {
    fail(`2.0 navigation must expose ${MONITORING_ROUTE} exactly once`);
  }
}

function assertPhpPackageBoundary(phpSdk, server) {
  if (!phpSdk.includes('composer require %%artifact.publishedPhpSdkComposerPackage%%')) {
    fail('docs/polyglot/php.md must install the exact published PHP SDK artifact token');
  }
  if (/composer\s+require[^\n]*durable-workflow\/workflow/.test(phpSdk)) {
    fail('docs/polyglot/php.md must not install the embedded Laravel package');
  }
  for (const packageName of ['durable-workflow/sdk', 'durable-workflow/workflow']) {
    if (!phpSdk.includes(packageName)) {
      fail(`docs/polyglot/php.md must distinguish ${packageName}`);
    }
  }

  const marker = '<!-- docs-example id="server.php-sdk.install" -->';
  const markerPosition = firstPosition(server, marker, 'docs/polyglot/server.md PHP SDK install example');
  const installContext = server.slice(markerPosition, markerPosition + 1800);
  if (!installContext.includes('composer require %%artifact.phpSdkComposerPackage%%')) {
    fail('The standalone server PHP worker path must install the PHP SDK artifact token');
  }
  if (/composer\s+require[^\n]*workflowComposerPackage/.test(installContext)) {
    fail('The standalone server PHP worker path must not install the embedded Laravel package');
  }
}

function main() {
  const introduction = read(introductionPath);
  const quickstart = read(quickstartPath);
  const capabilities = read(capabilitiesPath);
  const phpSdk = read(phpSdkPath);
  const server = read(serverPath);
  delete require.cache[require.resolve(sidebarsPath)];
  const sidebars = require(sidebarsPath);

  assertDocumentLinks(introduction, 'docs/introduction.md', REQUIRED_INTRO_ROUTES);
  assertDocumentLinks(quickstart, 'docs/quickstart.md', REQUIRED_QUICKSTART_ROUTES);
  assertDocumentLinks(capabilities, 'docs/capabilities.md', REQUIRED_CAPABILITY_ROUTES);
  assertIntroductionPackageBoundary(introduction);
  assertSidebarTopology(sidebars);
  assertPhpPackageBoundary(phpSdk, server);

  const routeCount =
    REQUIRED_INTRO_ROUTES.length +
    REQUIRED_QUICKSTART_ROUTES.length +
    REQUIRED_CAPABILITY_ROUTES.length;
  console.log(`Onboarding product-boundary checks passed for ${routeCount} public route references`);
}

main();
