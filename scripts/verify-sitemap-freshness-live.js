#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  QUALIFIED_PYTHON_PACKAGE_AUTHORITY,
} = require('./public-artifact-versions');
const {
  REQUIRED_DISCOVERY_ENTRIES,
  blockLastmod,
  blockLocation,
  isW3cDate,
  sitemapBlocks,
} = require('./patch-public-discovery-sitemap');
const {
  assertLiveQuickstartPage,
  fetchBody,
  wait,
} = require('./verify-docs-release-live');
const quickstartContract = require('../static/quickstart-execution-contract.json');

const DEFAULT_BASE_URL = 'https://durable-workflow.com';
const DEFAULT_ATTEMPTS = 30;
const DEFAULT_RETRY_DELAY_MS = 10000;
const INTRODUCTION_ROUTE = '/docs/2.0/introduction/';
const QUICKSTART_ROUTE = '/docs/2.0/quickstart/';
const FOCUSED_CONTENT_ROUTES = [INTRODUCTION_ROUTE, QUICKSTART_ROUTE];

function sitemapFreshnessByPath(sitemap) {
  return new Map(sitemapBlocks(String(sitemap)).map(({block}) => {
    const location = blockLocation(block);
    return [location ? new URL(location).pathname : '', blockLastmod(block)];
  }));
}

function assertLiveSitemapFreshness(liveSitemap, expectedSitemap) {
  const live = sitemapFreshnessByPath(liveSitemap);
  const expected = sitemapFreshnessByPath(expectedSitemap);
  const requiredRoutes = [
    ...FOCUSED_CONTENT_ROUTES,
    ...REQUIRED_DISCOVERY_ENTRIES.map(entry => entry.path),
  ];

  for (const route of new Set(requiredRoutes)) {
    const liveLastmod = live.get(route);
    const expectedLastmod = expected.get(route);

    if (!liveLastmod || !isW3cDate(liveLastmod)) {
      throw new Error(`live sitemap route ${route} has no valid W3C lastmod`);
    }
    if (!expectedLastmod || liveLastmod !== expectedLastmod) {
      throw new Error(
        `live sitemap route ${route} lastmod ${liveLastmod} does not match ` +
          `the deployed source date ${expectedLastmod || 'missing'}`,
      );
    }
  }
}

function assertPythonPackageAuthorityLink(html, authority) {
  const source = String(html);

  if (!source.includes(`href="${authority.authorityUrl}"`)) {
    throw new Error(
      `live 2.0 introduction does not link compatibility-qualified Python SDK authority ` +
        authority.authorityUrl,
    );
  }
}

function assertLiveIntroductionPage(html) {
  assertPythonPackageAuthorityLink(html, QUALIFIED_PYTHON_PACKAGE_AUTHORITY);
}

async function fetchUncached(fetcher, baseUrl, route, cacheKey) {
  const url = new URL(route, `${baseUrl}/`);
  url.searchParams.set('deploy_check', cacheKey);
  return fetcher(url);
}

async function verifyLiveSitemapFreshness(options = {}) {
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const attempts = Number(options.attempts || DEFAULT_ATTEMPTS);
  const retryDelay = Number(options.retryDelay || DEFAULT_RETRY_DELAY_MS);
  const fetcher = options.fetcher || fetchBody;
  const expectedSitemap = options.expectedSitemap || fs.readFileSync(
    path.join(__dirname, '..', 'build', 'sitemap.xml'),
    'utf8',
  );
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const cacheKey = `${Date.now()}-${attempt}`;
      const [liveSitemap, introduction, quickstart] = await Promise.all([
        fetchUncached(fetcher, baseUrl, '/sitemap.xml', cacheKey),
        fetchUncached(fetcher, baseUrl, INTRODUCTION_ROUTE, cacheKey),
        fetchUncached(fetcher, baseUrl, QUICKSTART_ROUTE, cacheKey),
      ]);

      assertLiveSitemapFreshness(liveSitemap.toString('utf8'), expectedSitemap);
      assertLiveIntroductionPage(introduction.toString('utf8'));
      assertLiveQuickstartPage(quickstart.toString('utf8'), quickstartContract);
      console.log(
        `Live sitemap freshness, qualified Python authority, and published artifact ` +
          `identities match the deployed 2.0 introduction, quickstart, and generated ` +
          `discovery routes at ${baseUrl}`,
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.warn(
          `Sitemap freshness is not live yet (${attempt}/${attempts}): ${error.message}`,
        );
        await wait(retryDelay);
      }
    }
  }

  throw lastError;
}

if (require.main === module) {
  verifyLiveSitemapFreshness().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  FOCUSED_CONTENT_ROUTES,
  INTRODUCTION_ROUTE,
  QUICKSTART_ROUTE,
  assertLiveIntroductionPage,
  assertLiveSitemapFreshness,
  assertPythonPackageAuthorityLink,
  sitemapFreshnessByPath,
  verifyLiveSitemapFreshness,
};
