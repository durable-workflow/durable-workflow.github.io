#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const config = require('../docusaurus.config.js');
const {
  stablePlatformConformanceDiscoveryEntries,
} = require('./platform-conformance-public-discovery');
const platformConformanceContract = require('../static/platform-conformance-contract.json');

const buildDir = path.join(__dirname, '..', 'build');
const STABLE_DOCS_VERSION = '1.x';
const PRERELEASE_DOCS_VERSION = '2.0';
const STABLE_DOCS_ROOT = '/docs/introduction/';
const PRERELEASE_DOCS_ROOT = '/docs/2.0/introduction/';
const SDK_REFERENCE_GUIDES = [
  {
    language: 'PHP',
    path: 'docs/2.0/polyglot/php/index.html',
    url: 'https://php.durable-workflow.com/',
  },
  {
    language: 'Python',
    path: 'docs/2.0/polyglot/python/index.html',
    url: 'https://python.durable-workflow.com/',
  },
  {
    language: 'Rust',
    path: 'docs/2.0/polyglot/rust/index.html',
    url: 'https://rust.durable-workflow.com/',
  },
];
const PUBLIC_DISCOVERY_URLS = [
  '/docs/',
  '/docs/2.0/quickstart/',
  '/quickstart-execution-contract.json',
  '/public-artifact-compatibility-evidence.json',
  '/public-component-release-qualifications.json',
  '/docs/2.0/polyglot/php/',
  '/docs/2.0/polyglot/python/',
  '/docs/2.0/polyglot/rust/',
  '/docs/2.0/polyglot/server/',
  '/docs/2.0/polyglot/cli/',
  '/docs/2.0/docs-page-release-audit/',
  '/docs/platform-conformance/',
  '/docs-page-release-audit.json',
  '/docs-narrative-audit.json',
  '/platform-conformance-contract.json',
];

function fail(message) {
  throw new Error(message);
}

function readBuildFile(relativePath) {
  const filePath = path.join(buildDir, relativePath);
  if (!fs.existsSync(filePath)) {
    fail(`Missing generated public docs artifact: build/${relativePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function readBuildJson(relativePath) {
  return JSON.parse(readBuildFile(relativePath));
}

function assertMissingBuildFile(relativePath, label) {
  if (fs.existsSync(path.join(buildDir, relativePath))) {
    fail(`${label} must not be generated at build/${relativePath}`);
  }
}

function getClassicPresetOptions() {
  const preset = Array.isArray(config.presets)
    ? config.presets.find(entry => Array.isArray(entry) && entry[0] === 'classic')
    : null;
  if (!preset?.[1]) {
    fail('docusaurus.config.js must configure the classic preset');
  }
  return preset[1];
}

function getRedirectsConfig() {
  const plugin = Array.isArray(config.plugins)
    ? config.plugins.find(entry => Array.isArray(entry) && entry[0] === '@docusaurus/plugin-client-redirects')
    : null;
  return Array.isArray(plugin?.[1]?.redirects) ? plugin[1].redirects : [];
}

function fromList(value) {
  return Array.isArray(value) ? value : [value];
}

function flattenNavigation(items) {
  return items.flatMap(item => [
    item,
    ...(Array.isArray(item?.items) ? flattenNavigation(item.items) : []),
  ]);
}

function assertDocsRootRedirects() {
  const redirects = getRedirectsConfig();
  if (!redirects.some(redirect => (
    redirect?.to === STABLE_DOCS_ROOT && fromList(redirect.from).includes('/docs')
  ))) {
    fail(`/docs must redirect to ${STABLE_DOCS_ROOT}`);
  }
  if (!redirects.some(redirect => (
    redirect?.to === PRERELEASE_DOCS_ROOT && fromList(redirect.from).includes('/docs/2.0')
  ))) {
    fail(`/docs/2.0 must redirect to ${PRERELEASE_DOCS_ROOT}`);
  }
}

function assertConfigPolicy() {
  const docs = getClassicPresetOptions().docs;
  const versions = docs?.versions || {};

  if (docs?.lastVersion !== STABLE_DOCS_VERSION) {
    fail(`docs.lastVersion must remain ${STABLE_DOCS_VERSION}`);
  }
  if (versions[STABLE_DOCS_VERSION]?.path !== '') {
    fail(`${STABLE_DOCS_VERSION} docs must remain on the unversioned path`);
  }
  if (versions.current?.path !== PRERELEASE_DOCS_VERSION) {
    fail(`current docs must remain under ${PRERELEASE_DOCS_VERSION}`);
  }
  if (versions.current?.banner !== 'unreleased') {
    fail(`current ${PRERELEASE_DOCS_VERSION} docs must retain the unreleased version banner`);
  }

  const navbarItems = config.themeConfig?.navbar?.items || [];
  if (!navbarItems.some(item => item?.type === 'doc' && item.docId === 'introduction')) {
    fail('Primary navbar must resolve through the stable introduction doc');
  }
  for (const item of flattenNavigation(navbarItems)) {
    if (/\bSDKs?\b/i.test(item?.label || '')) {
      fail(`Global navigation must not include SDK item ${JSON.stringify(item.label)}`);
    }
    if (SDK_REFERENCE_GUIDES.some(guide => guide.url === item?.href)) {
      fail(`SDK reference ${item.href} belongs in its 2.0 language guide, not global navigation`);
    }
  }
  assertDocsRootRedirects();
}

function assertDocusaurusVersion(relativePath, expected) {
  const html = readBuildFile(relativePath);
  if (!html.includes(`name="docusaurus_version" content="${expected}"`)) {
    fail(`build/${relativePath} must carry Docusaurus version ${expected}`);
  }
}

function openingTags(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))]
    .map(match => match[0]);
}

function attributeValue(tag, attribute) {
  const match = tag.match(new RegExp(`\\s${attribute}="([^"]*)"`, 'i'));
  return match?.[1] ?? null;
}

function assertVersionBanner(relativePath, expectedVersion) {
  const html = readBuildFile(relativePath);
  const banners = openingTags(html, 'aside')
    .filter(tag => attributeValue(tag, 'data-docs-release-banner-version') !== null);

  if (expectedVersion === null) {
    if (banners.length !== 0) {
      fail(`build/${relativePath} must not render a prerelease version banner`);
    }
    return;
  }

  if (
    banners.length !== 1 ||
    attributeValue(banners[0], 'data-docs-release-banner-version') !== expectedVersion
  ) {
    fail(`build/${relativePath} must render one ${expectedVersion} version banner`);
  }

  const stableLinks = openingTags(html, 'a')
    .filter(tag => attributeValue(tag, 'data-docs-stable-version') === STABLE_DOCS_VERSION);
  if (
    stableLinks.length !== 1 ||
    attributeValue(stableLinks[0], 'href') !== STABLE_DOCS_ROOT
  ) {
    fail(
      `build/${relativePath} version banner must link ${STABLE_DOCS_VERSION} to ${STABLE_DOCS_ROOT}`,
    );
  }
}

function assertExternalLink(relativePath, expectedUrl, label) {
  const html = readBuildFile(relativePath);
  const hrefs = new Set(
    [...html.matchAll(/<a\b[^>]*\shref="([^"]+)"/gi)].map(match => match[1]),
  );
  if (!hrefs.has(expectedUrl)) {
    fail(`build/${relativePath} must link to the ${label} API reference at ${expectedUrl}`);
  }
}

function assertBuiltDocsPolicy() {
  const docsRoot = readBuildFile('docs/index.html');
  const prereleaseDocsRoot = readBuildFile('docs/2.0/index.html');

  if (!docsRoot.includes(STABLE_DOCS_ROOT) || docsRoot.includes('/docs/2.0/')) {
    fail('build/docs/index.html must redirect only to the stable docs entrypoint');
  }
  if (!prereleaseDocsRoot.includes(PRERELEASE_DOCS_ROOT)) {
    fail('build/docs/2.0/index.html must redirect to the explicit prerelease entrypoint');
  }

  assertDocusaurusVersion('docs/introduction/index.html', STABLE_DOCS_VERSION);
  assertDocusaurusVersion('docs/installation/index.html', STABLE_DOCS_VERSION);
  assertDocusaurusVersion('docs/2.0/introduction/index.html', 'current');
  assertDocusaurusVersion('docs/2.0/quickstart/index.html', 'current');
  assertVersionBanner('docs/introduction/index.html', null);
  assertVersionBanner('docs/installation/index.html', null);
  assertVersionBanner('docs/2.0/introduction/index.html', PRERELEASE_DOCS_VERSION);
  assertVersionBanner('docs/2.0/quickstart/index.html', PRERELEASE_DOCS_VERSION);
  for (const guide of SDK_REFERENCE_GUIDES) {
    assertDocusaurusVersion(guide.path, 'current');
    assertExternalLink(guide.path, guide.url, guide.language);
  }

  const pageAudit = readBuildJson('docs-page-release-audit.json');
  const narrativeAudit = readBuildJson('docs-narrative-audit.json');
  const quickstartContract = readBuildJson('quickstart-execution-contract.json');
  const componentReleaseQualifications = readBuildJson(
    'public-component-release-qualifications.json',
  );

  if (pageAudit.schema !== 'durable-workflow.docs.page-release-audit') {
    fail('docs page release audit schema is invalid');
  }
  if (narrativeAudit.schema !== 'durable-workflow.docs.narrative-audit') {
    fail('docs narrative audit schema is invalid');
  }
  if (quickstartContract.schema !== 'durable-workflow.docs.v2.quickstart-execution-contract') {
    fail('quickstart execution contract schema is invalid');
  }
  if (
    componentReleaseQualifications.schema
    !== 'durable-workflow.docs.public-component-release-qualifications'
  ) {
    fail('component release qualification schema is invalid');
  }

  for (const artifact of [pageAudit, narrativeAudit]) {
    if (artifact.release_status_guardrail?.stable_default_docs_version !== STABLE_DOCS_VERSION) {
      fail('generated docs audit has an invalid stable default version');
    }
    if (artifact.release_status_guardrail?.explicit_prerelease_docs_version !== PRERELEASE_DOCS_VERSION) {
      fail('generated docs audit has an invalid explicit prerelease version');
    }
  }
  if (quickstartContract.default_docs_guard?.stable_default_docs_version !== STABLE_DOCS_VERSION) {
    fail('quickstart contract has an invalid stable default version');
  }
}

function assertPublicDiscoverySurface() {
  const sitemap = readBuildFile('sitemap.xml');
  const siteUrl = String(config.url || '').replace(/\/+$/, '');
  const dynamicRoutes = stablePlatformConformanceDiscoveryEntries(platformConformanceContract)
    .map(entry => entry.path);

  for (const route of [...new Set([...PUBLIC_DISCOVERY_URLS, ...dynamicRoutes])]) {
    if (!sitemap.includes(`<loc>${siteUrl}${route}</loc>`)) {
      fail(`build/sitemap.xml is missing public route ${route}`);
    }
  }

  for (const route of [
    'docs/polyglot/php/index.html',
    'docs/polyglot/python/index.html',
    'docs/polyglot/rust/index.html',
    'docs/polyglot/server/index.html',
  ]) {
    assertMissingBuildFile(route, 'stable-default polyglot route');
  }

  for (const route of [
    `${siteUrl}/docs/polyglot/php/`,
    `${siteUrl}/docs/polyglot/python/`,
    `${siteUrl}/docs/polyglot/rust/`,
    `${siteUrl}/docs/polyglot/server/`,
  ]) {
    if (sitemap.includes(route)) {
      fail(`build/sitemap.xml must not expose prerelease content at ${route}`);
    }
  }
}

function main() {
  assertConfigPolicy();
  assertBuiltDocsPolicy();
  assertPublicDiscoverySurface();
  console.log('Docs release routing policy checks passed');
}

main();
