const fs = require('fs');
const path = require('path');

const config = require('../docusaurus.config.js');
const {
  ARTIFACT_PIN_PATTERNS,
  ARTIFACT_PINS,
} = require('./public-artifact-versions');

const STABLE_DOCS_VERSION = '1.x';
const PRERELEASE_DOCS_VERSION = '2.0';
const STABLE_DOCS_ROOT = '/docs/introduction/';
const PRERELEASE_DOCS_ROOT = '/docs/2.0/introduction/';
const PUBLIC_DISCOVERY_URLS = [
  '/docs/',
  '/docs/2.0/quickstart/',
  '/docs/2.0/polyglot/python/',
  '/docs/2.0/polyglot/server/',
  '/docs/2.0/polyglot/cli/',
  '/docs/2.0/docs-page-release-audit/',
  '/docs/platform-conformance/',
  '/docs-page-release-audit.json',
  '/platform-conformance-contract.json',
  '/platform-conformance/signal-query-runtime-scenarios.json',
  '/platform-conformance/search-attribute-runtime-scenarios.json',
  '/platform-conformance/replay-runtime-scenarios.json',
  '/platform-conformance/namespace-runtime-scenarios.json',
  '/platform-conformance/schedules-runtime-scenarios.json',
  '/platform-conformance/child-workflow-runtime-scenarios.json',
  '/platform-conformance/worker-versioning-runtime-scenarios.json',
  '/platform-conformance/saga-runtime-scenarios.json',
  '/platform-conformance/migration-runtime-scenarios.json',
  '/platform-conformance/skew-refusal-matrix-scenarios.json',
  '/platform-conformance/prerelease-readiness-scenarios.json',
];

function fail(message) {
  throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    fail(`${label} must include ${JSON.stringify(needle)}`);
  }
}

function assertExcludes(haystack, needle, label) {
  if (haystack.includes(needle)) {
    fail(`${label} must not include ${JSON.stringify(needle)}`);
  }
}

function assertOnlyWaterlineArtifact(haystack, label) {
  const waterlinePattern = ARTIFACT_PIN_PATTERNS
    .find(definition => definition.category === 'waterline_artifact_pin');

  if (!waterlinePattern) {
    fail('Public artifact pin checks must define a Waterline Composer pin pattern');
  }

  const pattern = new RegExp(waterlinePattern.pattern.source, waterlinePattern.pattern.flags);
  const pins = new Set([...haystack.matchAll(pattern)].map(match => match[0]));

  if (!pins.has(ARTIFACT_PINS.waterlineComposerPackage)) {
    fail(`${label} must include ${JSON.stringify(ARTIFACT_PINS.waterlineComposerPackage)}`);
  }

  for (const pin of pins) {
    if (pin !== ARTIFACT_PINS.waterlineComposerPackage) {
      fail(`${label} must not include stale Waterline artifact ${JSON.stringify(pin)}`);
    }
  }
}

function readBuildFile(relativePath) {
  const filePath = path.join(__dirname, '..', 'build', relativePath);

  if (!fs.existsSync(filePath)) {
    fail(`Missing generated public docs artifact: build/${relativePath}`);
  }

  return fs.readFileSync(filePath, 'utf8');
}

function assertMissingBuildFile(relativePath, label) {
  const filePath = path.join(__dirname, '..', 'build', relativePath);

  if (fs.existsSync(filePath)) {
    fail(`${label} must not be generated at build/${relativePath}`);
  }
}

function getClassicPresetOptions() {
  const preset = Array.isArray(config.presets)
    ? config.presets.find(entry => Array.isArray(entry) && entry[0] === 'classic')
    : null;

  if (!preset || !preset[1]) {
    fail('docusaurus.config.js must configure the classic preset');
  }

  return preset[1];
}

function getDocsConfig() {
  const docs = getClassicPresetOptions().docs;

  if (!docs) {
    fail('docusaurus.config.js classic preset must configure docs');
  }

  return docs;
}

function getRedirectsConfig() {
  const plugin = Array.isArray(config.plugins)
    ? config.plugins.find(entry => Array.isArray(entry) && entry[0] === '@docusaurus/plugin-client-redirects')
    : null;

  return plugin && plugin[1] && Array.isArray(plugin[1].redirects)
    ? plugin[1].redirects
    : [];
}

function fromList(value) {
  return Array.isArray(value) ? value : [value];
}

function assertDocsRootRedirect() {
  const redirects = getRedirectsConfig();
  const stableRedirect = redirects.find(redirect => (
    redirect &&
    redirect.to === STABLE_DOCS_ROOT &&
    fromList(redirect.from).includes('/docs')
  ));

  if (!stableRedirect) {
    fail(`/docs must redirect to the stable ${STABLE_DOCS_VERSION} entrypoint ${STABLE_DOCS_ROOT}`);
  }

  const prereleaseRedirect = redirects.find(redirect => (
    redirect &&
    redirect.to === PRERELEASE_DOCS_ROOT &&
    fromList(redirect.from).includes('/docs/2.0')
  ));

  if (!prereleaseRedirect) {
    fail(`/docs/2.0 must redirect to the ${PRERELEASE_DOCS_VERSION} prerelease entrypoint ${PRERELEASE_DOCS_ROOT}`);
  }
}

function assertConfigPolicy() {
  const docsConfig = getDocsConfig();
  const versions = docsConfig.versions || {};
  const stableVersion = versions[STABLE_DOCS_VERSION] || {};
  const prereleaseVersion = versions.current || {};

  assertEqual(docsConfig.lastVersion, STABLE_DOCS_VERSION, 'docs.lastVersion');
  assertEqual(stableVersion.path, '', `${STABLE_DOCS_VERSION} docs path`);
  assertEqual(prereleaseVersion.path, PRERELEASE_DOCS_VERSION, 'current docs path');
  assertEqual(prereleaseVersion.banner, 'unreleased', `${PRERELEASE_DOCS_VERSION} docs banner`);

  if (!String(prereleaseVersion.label || '').toLowerCase().includes('prerelease')) {
    fail(`${PRERELEASE_DOCS_VERSION} docs label must make the prerelease status explicit`);
  }

  const navbarItems = (((config.themeConfig || {}).navbar || {}).items) || [];
  const docsItem = navbarItems.find(item => item && item.label === 'Docs');

  if (!docsItem) {
    fail('Primary navbar must include a Docs link');
  }

  assertEqual(docsItem.type, 'doc', 'Primary navbar Docs link type');
  assertEqual(docsItem.docId, 'introduction', 'Primary navbar Docs docId');

  assertDocsRootRedirect();
}

function assertBuiltDocsPolicy() {
  const docsRoot = readBuildFile('docs/index.html');
  const prereleaseDocsRoot = readBuildFile('docs/2.0/index.html');
  const stableIntro = readBuildFile('docs/introduction/index.html');
  const stableInstall = readBuildFile('docs/installation/index.html');
  const prereleaseIntro = readBuildFile('docs/2.0/introduction/index.html');
  const home = readBuildFile('index.html');
  const prereleaseQuickstart = readBuildFile('docs/2.0/quickstart/index.html');
  const prereleasePageReleaseAudit = readBuildFile('docs/2.0/docs-page-release-audit/index.html');
  const pageReleaseAudit = readBuildFile('docs-page-release-audit.json');
  const canonicalIndex = readBuildFile('llms.txt');
  const canonicalFull = readBuildFile('llms-full.txt');
  const prereleaseIndex = readBuildFile('llms-2.0.txt');
  const prereleaseFull = readBuildFile('llms-full-2.0.txt');

  assertIncludes(docsRoot, STABLE_DOCS_ROOT, 'build/docs/index.html');
  assertExcludes(docsRoot, '/docs/2.0/', 'build/docs/index.html');

  assertIncludes(prereleaseDocsRoot, PRERELEASE_DOCS_ROOT, 'build/docs/2.0/index.html');
  assertExcludes(prereleaseDocsRoot, STABLE_DOCS_ROOT, 'build/docs/2.0/index.html');

  assertIncludes(stableIntro, 'name="docusaurus_version" content="1.x"', 'stable introduction page');
  assertIncludes(stableInstall, 'name="docusaurus_version" content="1.x"', 'stable installation page');
  assertIncludes(stableIntro, 'href="/docs/introduction/"', 'stable introduction navbar');
  assertExcludes(stableIntro, 'llms-full-2.0.txt', 'stable introduction page');

  assertIncludes(home, '/docs/introduction', 'homepage');
  assertIncludes(home, '/docs/2.0/quickstart/', 'homepage');
  assertIncludes(home, '2.0 Prerelease Quickstart', 'homepage');

  assertIncludes(prereleaseIntro, 'name="docusaurus_version" content="current"', '2.0 introduction page');
  assertIncludes(prereleaseIntro.toLowerCase(), 'unreleased', '2.0 introduction page');
  assertIncludes(prereleaseIntro, '/docs/2.0/quickstart/', '2.0 introduction page');
  assertIncludes(prereleaseIntro, ARTIFACT_PINS.serverDockerHubImage, '2.0 introduction page');
  assertIncludes(prereleaseIntro, ARTIFACT_PINS.pythonPackagePin, '2.0 introduction page');
  assertIncludes(prereleaseIntro, ARTIFACT_PINS.cliInstallerEnv, '2.0 introduction page');
  assertIncludes(prereleaseQuickstart, 'name="docusaurus_version" content="current"', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart.toLowerCase(), '2.0 prerelease', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, ARTIFACT_PINS.serverDockerHubImage, '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, ARTIFACT_PINS.pythonPackagePin, '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, ARTIFACT_PINS.workflowComposerPackage, '2.0 quickstart page');
  assertOnlyWaterlineArtifact(prereleaseQuickstart, '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'Start A Local Server', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'Python User', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'Operator User', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'Laravel User', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'Completion Criteria', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'await worker.run_until', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'status=completed', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'dw workflow:history &quot;$QUICKSTART_WORKFLOW_ID&quot; &quot;$QUICKSTART_RUN_ID&quot; --output=json', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'dw workflow:list --status=completed --output=json', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'create-project laravel/laravel durable-workflow-laravel-quickstart', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'composer show durable-workflow/workflow', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'composer show durable-workflow/waterline', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'php artisan waterline:install', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, '$deadline = now()-&gt;addMinutes(10);', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'php artisan queue:work --tries', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, '--timeout', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'php artisan app:quickstart-workflow', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'quickstart-laravel-output.log', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'elapsed_seconds=', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'output=Hello, Laravel!', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'href="/docs/2.0/polyglot/python/', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'href="/docs/2.0/polyglot/server/', '2.0 quickstart page');
  assertIncludes(prereleaseQuickstart, 'href="/docs/2.0/polyglot/cli/', '2.0 quickstart page');
  assertExcludes(prereleaseQuickstart, 'href="/docs/polyglot/python/', '2.0 quickstart page');
  assertExcludes(prereleaseQuickstart, 'href="/docs/polyglot/server/', '2.0 quickstart page');
  assertExcludes(prereleaseQuickstart, 'href="/docs/polyglot/cli/', '2.0 quickstart page');
  assertIncludes(prereleasePageReleaseAudit, 'Page-level release-status verdicts', '2.0 docs page release audit');
  assertIncludes(prereleasePageReleaseAudit, '/docs-page-release-audit.json', '2.0 docs page release audit');
  assertIncludes(pageReleaseAudit, '"schema": "durable-workflow.docs.page-release-audit"', 'docs page release audit manifest');
  assertIncludes(pageReleaseAudit, '"stable_default_docs_version": "1.x"', 'docs page release audit manifest');
  assertIncludes(pageReleaseAudit, '"explicit_prerelease_docs_version": "2.0"', 'docs page release audit manifest');

  assertIncludes(canonicalIndex, 'versioned_docs/version-1.x', 'canonical llms.txt');
  assertIncludes(canonicalFull, '<!-- Source: versioned_docs/version-1.x', 'canonical llms-full.txt');
  assertExcludes(canonicalIndex, 'docs/ai-assisted-development.md', 'canonical llms.txt');
  assertExcludes(canonicalIndex, 'docs/quickstart.md', 'canonical llms.txt');
  assertExcludes(canonicalIndex, 'llms-full-2.0.txt', 'canonical llms.txt');

  assertIncludes(prereleaseIndex, 'docs/quickstart.md', 'llms-2.0.txt');
  assertIncludes(prereleaseIndex, 'prerelease guidance', 'llms-2.0.txt');
  assertIncludes(prereleaseIndex, 'not the default public docs line', 'llms-2.0.txt');
  assertIncludes(prereleaseFull, '2.0 Prerelease Documentation', 'llms-full-2.0.txt');
  assertIncludes(prereleaseFull, 'not the default public docs line', 'llms-full-2.0.txt');
  assertIncludes(prereleaseFull, '# 2.0 Prerelease Quickstart', 'llms-full-2.0.txt');
  assertIncludes(prereleaseFull, ARTIFACT_PINS.pythonPipInstallCommand, 'llms-full-2.0.txt');
  assertOnlyWaterlineArtifact(prereleaseFull, 'llms-full-2.0.txt');
}

function assertPublicDiscoverySurface() {
  const sitemap = readBuildFile('sitemap.xml');
  const siteUrl = String(config.url || '').replace(/\/+$/, '');

  for (const route of PUBLIC_DISCOVERY_URLS) {
    assertIncludes(sitemap, `<loc>${siteUrl}${route}</loc>`, 'build/sitemap.xml');
  }

  const platformConformance = readBuildFile('docs/platform-conformance/index.html');

  assertMissingBuildFile('docs/polyglot/python/index.html', 'stable-default Python polyglot route');
  assertMissingBuildFile('docs/polyglot/server/index.html', 'stable-default server polyglot route');
  assertExcludes(sitemap, `${siteUrl}/docs/polyglot/python/`, 'build/sitemap.xml');
  assertExcludes(sitemap, `${siteUrl}/docs/polyglot/server/`, 'build/sitemap.xml');

  assertIncludes(
    platformConformance,
    'Platform Conformance',
    'build/docs/platform-conformance/index.html'
  );
  assertIncludes(
    platformConformance,
    '/docs/2.0/platform-conformance/',
    'build/docs/platform-conformance/index.html'
  );
  assertIncludes(
    platformConformance,
    'href="/platform-conformance/schedules-runtime-scenarios.json"',
    'build/docs/platform-conformance/index.html'
  );
  assertIncludes(
    platformConformance,
    'href="/platform-conformance/worker-versioning-runtime-scenarios.json"',
    'build/docs/platform-conformance/index.html'
  );
  assertIncludes(
    platformConformance,
    'href="/platform-conformance/saga-runtime-scenarios.json"',
    'build/docs/platform-conformance/index.html'
  );
  assertIncludes(
    platformConformance,
    'href="/platform-conformance/migration-runtime-scenarios.json"',
    'build/docs/platform-conformance/index.html'
  );
  assertIncludes(
    platformConformance,
    'href="/platform-conformance-contract.json"',
    'build/docs/platform-conformance/index.html'
  );
  assertExcludes(
    platformConformance,
    'name="docusaurus_version" content="current"',
    'build/docs/platform-conformance/index.html'
  );
}

function main() {
  assertConfigPolicy();
  assertBuiltDocsPolicy();
  assertPublicDiscoverySurface();

  console.log('Docs release policy checks passed');
}

main();
