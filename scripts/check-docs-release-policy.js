const fs = require('fs');
const path = require('path');

const config = require('../docusaurus.config.js');

const STABLE_DOCS_VERSION = '1.x';
const PRERELEASE_DOCS_VERSION = '2.0';
const STABLE_DOCS_ROOT = '/docs/introduction/';
const PUBLIC_DISCOVERY_URLS = [
  '/docs/',
  '/docs/platform-conformance/',
  '/platform-conformance-contract.json',
  '/platform-conformance/signal-query-runtime-scenarios.json',
  '/platform-conformance/search-attribute-runtime-scenarios.json',
  '/platform-conformance/replay-runtime-scenarios.json',
  '/platform-conformance/namespace-runtime-scenarios.json',
  '/platform-conformance/child-workflow-runtime-scenarios.json',
  '/platform-conformance/worker-versioning-runtime-scenarios.json',
  '/platform-conformance/saga-runtime-scenarios.json',
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

function readBuildFile(relativePath) {
  const filePath = path.join(__dirname, '..', 'build', relativePath);

  if (!fs.existsSync(filePath)) {
    fail(`Missing generated public docs artifact: build/${relativePath}`);
  }

  return fs.readFileSync(filePath, 'utf8');
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
  const matchingRedirect = redirects.find(redirect => (
    redirect &&
    redirect.to === STABLE_DOCS_ROOT &&
    fromList(redirect.from).includes('/docs')
  ));

  if (!matchingRedirect) {
    fail(`/docs must redirect to the stable ${STABLE_DOCS_VERSION} entrypoint ${STABLE_DOCS_ROOT}`);
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
  const stableIntro = readBuildFile('docs/introduction/index.html');
  const stableInstall = readBuildFile('docs/installation/index.html');
  const prereleaseIntro = readBuildFile('docs/2.0/introduction/index.html');
  const canonicalIndex = readBuildFile('llms.txt');
  const canonicalFull = readBuildFile('llms-full.txt');
  const prereleaseIndex = readBuildFile('llms-2.0.txt');
  const prereleaseFull = readBuildFile('llms-full-2.0.txt');

  assertIncludes(docsRoot, STABLE_DOCS_ROOT, 'build/docs/index.html');
  assertExcludes(docsRoot, '/docs/2.0/', 'build/docs/index.html');

  assertIncludes(stableIntro, 'name="docusaurus_version" content="1.x"', 'stable introduction page');
  assertIncludes(stableInstall, 'name="docusaurus_version" content="1.x"', 'stable installation page');
  assertIncludes(stableIntro, 'href="/docs/introduction/"', 'stable introduction navbar');
  assertExcludes(stableIntro, 'llms-full-2.0.txt', 'stable introduction page');

  assertIncludes(prereleaseIntro, 'name="docusaurus_version" content="current"', '2.0 introduction page');
  assertIncludes(prereleaseIntro.toLowerCase(), 'unreleased', '2.0 introduction page');

  assertIncludes(canonicalIndex, 'versioned_docs/version-1.x', 'canonical llms.txt');
  assertIncludes(canonicalFull, '<!-- Source: versioned_docs/version-1.x', 'canonical llms-full.txt');
  assertExcludes(canonicalIndex, 'docs/ai-assisted-development.md', 'canonical llms.txt');
  assertExcludes(canonicalIndex, 'llms-full-2.0.txt', 'canonical llms.txt');

  assertIncludes(prereleaseIndex, 'prerelease guidance', 'llms-2.0.txt');
  assertIncludes(prereleaseIndex, 'not the default public docs line', 'llms-2.0.txt');
  assertIncludes(prereleaseFull, '2.0 Prerelease Documentation', 'llms-full-2.0.txt');
  assertIncludes(prereleaseFull, 'not the default public docs line', 'llms-full-2.0.txt');
}

function assertPublicDiscoverySurface() {
  const sitemap = readBuildFile('sitemap.xml');
  const siteUrl = String(config.url || '').replace(/\/+$/, '');

  for (const route of PUBLIC_DISCOVERY_URLS) {
    assertIncludes(sitemap, `<loc>${siteUrl}${route}</loc>`, 'build/sitemap.xml');
  }

  const platformConformance = readBuildFile('docs/platform-conformance/index.html');

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
