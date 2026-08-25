#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const config = require('../docusaurus.config.js');
const searchConsoleBaselines = require('./search-console-baselines.json');

const buildDir = path.join(__dirname, '..', 'build');
const stableRoute = '/docs/constraints/idempotent-vs-deterministic/';
const prereleaseRoute = '/docs/2.0/constraints/idempotent-vs-deterministic/';
const canonicalUrl = new URL(stableRoute, config.url).toString();

function readRoute(route) {
  const relativePath = `${route.replace(/^\/+|\/+$/g, '')}/index.html`;
  const filePath = path.join(buildDir, relativePath);
  assert(fs.existsSync(filePath), `missing rendered route build/${relativePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function decodeHtml(value) {
  return value
    ?.replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(?:x27|39);/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>') ?? null;
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'i'));
  return match ? decodeHtml(match[1]) : null;
}

function openingTags(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))]
    .map(match => match[0]);
}

function metadataContent(html, tagName, keyName, keyValue, contentName) {
  const tag = openingTags(html, tagName)
    .find(candidate => attribute(candidate, keyName) === keyValue);
  return tag ? attribute(tag, contentName) : null;
}

function canonicalLinks(html) {
  return openingTags(html, 'link')
    .filter(tag => attribute(tag, 'rel') === 'canonical')
    .map(tag => attribute(tag, 'href'));
}

function titleContent(html) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1].trim()) : null;
}

function assertRouteMetadata(html, route) {
  assert.deepStrictEqual(
    canonicalLinks(html),
    [canonicalUrl],
    `${route} must expose exactly one stable canonical URL`,
  );
  assert.strictEqual(
    metadataContent(html, 'meta', 'property', 'og:url', 'content'),
    canonicalUrl,
    `${route} Open Graph URL must match the stable canonical URL`,
  );
  assert(
    !/http-equiv="refresh"|window\.location\.(?:href|replace)/i.test(html),
    `${route} must remain a rendered document instead of a redirect`,
  );
}

const stableHtml = readRoute(stableRoute);
const prereleaseHtml = readRoute(prereleaseRoute);
assertRouteMetadata(stableHtml, stableRoute);
assertRouteMetadata(prereleaseHtml, prereleaseRoute);

const renderedMetadata = [stableHtml, prereleaseHtml].map(html => ({
  title: titleContent(html),
  description: metadataContent(html, 'meta', 'name', 'description', 'content'),
}));
for (const [index, metadata] of renderedMetadata.entries()) {
  assert(metadata.title, `route ${index + 1} must render a title`);
  assert(metadata.description, `route ${index + 1} must render a description`);
}
assert.notStrictEqual(
  renderedMetadata[0].title,
  renderedMetadata[1].title,
  'stable and prerelease routes must not render indistinguishable titles',
);
assert.notStrictEqual(
  renderedMetadata[0].description,
  renderedMetadata[1].description,
  'stable and prerelease routes must not render indistinguishable descriptions',
);

for (const [route, html] of [
  [stableRoute, stableHtml],
  [prereleaseRoute, prereleaseHtml],
]) {
  const versionMenu = html.match(/<ul class="dropdown__menu">([\s\S]*?)<\/ul>/i)?.[1];
  assert(versionMenu, `${route} must render the documentation version menu`);
  assert(
    versionMenu.includes(`href="${stableRoute}"`),
    `${route} version menu must retain the stable authority route`,
  );
  assert(
    versionMenu.includes(`href="${prereleaseRoute}"`),
    `${route} version menu must retain the prerelease route`,
  );
}

for (const route of [
  '/docs/2.0/constraints/overview/',
  '/docs/2.0/constraints/constraints-summary/',
]) {
  assert(
    readRoute(route).includes(`href="${stableRoute}"`),
    `${route} must link generic comparison intent to the stable authority`,
  );
}

const sitemap = fs.readFileSync(path.join(buildDir, 'sitemap.xml'), 'utf8');
const sitemapLocations = new Set(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]),
);
assert(sitemapLocations.has(canonicalUrl), 'sitemap must include the stable authority');
assert(
  !sitemapLocations.has(new URL(prereleaseRoute, config.url).toString()),
  'sitemap must exclude the prerelease duplicate',
);

const baseline = searchConsoleBaselines.baselines.find(
  entry => entry.id === 'idempotency-determinism-single-authority-2026-08-24',
);
assert(baseline, 'missing the pre-landing Search Console baseline');
assert.strictEqual(
  baseline.authority_landing?.canonical_route,
  stableRoute,
  'Search Console follow-up must remain bound to the stable authority',
);

console.log('Idempotency search authority route checks passed');
