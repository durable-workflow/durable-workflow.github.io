#!/usr/bin/env node

const assert = require('assert');

const {
  PYTHON_PACKAGE_AUTHORITY,
} = require('./public-artifact-versions');
const {
  REQUIRED_DISCOVERY_ENTRIES,
} = require('./patch-public-discovery-sitemap');
const {
  FOCUSED_CONTENT_ROUTES,
  assertLiveIntroductionPage,
  assertLiveSitemapFreshness,
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

const introduction = (
  `<a href="${PYTHON_PACKAGE_AUTHORITY.authorityUrl}">` +
    `${PYTHON_PACKAGE_AUTHORITY.version}</a>`
);
assert.doesNotThrow(
  () => assertLiveIntroductionPage(introduction),
  'the current published package identity must satisfy introduction validation',
);
assert.throws(
  () => assertLiveIntroductionPage(introduction.replace(PYTHON_PACKAGE_AUTHORITY.version, '0.0.0')),
  /does not expose published Python SDK/,
  'stale published package identity must fail introduction validation',
);

console.log('Live sitemap freshness validation tests passed');
