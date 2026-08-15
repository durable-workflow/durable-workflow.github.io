#!/usr/bin/env node

const assert = require('assert');

const {
  PYTHON_PACKAGE_AUTHORITY,
  QUALIFIED_PYTHON_PACKAGE_AUTHORITY,
} = require('./public-artifact-versions');
const {
  REQUIRED_DISCOVERY_ENTRIES,
} = require('./patch-public-discovery-sitemap');
const {
  FOCUSED_CONTENT_ROUTES,
  assertLiveIntroductionPage,
  assertLiveSitemapFreshness,
  assertPythonPackageAuthorityLink,
} = require('./verify-sitemap-freshness-live');

const routes = [...new Set([
  ...FOCUSED_CONTENT_ROUTES,
  ...REQUIRED_DISCOVERY_ENTRIES.map(entry => entry.path),
])];
const sitemap = lastmod => (
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
  routes.map(route => (
    `<url><loc>https://durable-workflow.com${route}</loc>` +
      `<lastmod>${lastmod}</lastmod></url>`
  )).join('') +
  '</urlset>'
);

const expected = sitemap('2026-08-09');
assert.doesNotThrow(
  () => assertLiveSitemapFreshness(expected, expected),
  'a deployed sitemap matching focused source dates must pass',
);
assert.throws(
  () => assertLiveSitemapFreshness(
    expected.replace('<lastmod>2026-08-09</lastmod>', '<lastmod>2026-08-08</lastmod>'),
    expected,
  ),
  /does not match the deployed source date/,
  'a stale deployed route date must fail focused validation',
);
assert.throws(
  () => assertLiveSitemapFreshness(
    expected.replace('<lastmod>2026-08-09</lastmod>', '<lastmod>2026-02-30</lastmod>'),
    expected,
  ),
  /has no valid W3C lastmod/,
  'an invalid deployed calendar date must fail focused validation',
);

const publishedPythonAuthority = {
  version: '2.0.0-rc.31',
  authorityUrl: 'https://pypi.org/project/durable-workflow/2.0.0rc31/',
};
const qualifiedPythonAuthority = {
  version: '2.0.0-rc.8',
  authorityUrl: 'https://pypi.org/project/durable-workflow/2.0.0rc8/',
};
const introduction = (
  `<a href="${qualifiedPythonAuthority.authorityUrl}">` +
    'compatibility-qualified Python release</a>'
);

assert.notStrictEqual(
  publishedPythonAuthority.version,
  qualifiedPythonAuthority.version,
  'the regression fixtures must keep published and qualified versions distinct',
);
assert.doesNotThrow(
  () => assertPythonPackageAuthorityLink(introduction, qualifiedPythonAuthority),
  'the exact qualified package link must satisfy introduction validation',
);
assert.throws(
  () => assertPythonPackageAuthorityLink(
    introduction.replace(
      qualifiedPythonAuthority.authorityUrl,
      publishedPythonAuthority.authorityUrl,
    ),
    qualifiedPythonAuthority,
  ),
  /does not link compatibility-qualified Python SDK authority/,
  'a stale published package link must fail qualified introduction validation',
);
assert.throws(
  () => assertPythonPackageAuthorityLink(
    '<p>Choose a compatibility-qualified Python release.</p>',
    qualifiedPythonAuthority,
  ),
  /does not link compatibility-qualified Python SDK authority/,
  'a missing qualified package link must fail introduction validation',
);

const liveIntroduction = (
  `<a href="${QUALIFIED_PYTHON_PACKAGE_AUTHORITY.authorityUrl}">` +
    'compatibility-qualified Python release</a>'
);
assert.doesNotThrow(
  () => assertLiveIntroductionPage(liveIntroduction),
  'live introduction validation must select the qualified package authority',
);
assert.throws(
  () => assertLiveIntroductionPage(
    liveIntroduction.replace(
      QUALIFIED_PYTHON_PACKAGE_AUTHORITY.authorityUrl,
      PYTHON_PACKAGE_AUTHORITY.authorityUrl,
    ),
  ),
  /does not link compatibility-qualified Python SDK authority/,
  'live introduction validation must reject the independently published package authority',
);

console.log('Live sitemap freshness validation tests passed');
