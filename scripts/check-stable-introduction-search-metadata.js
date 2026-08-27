#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const config = require('../docusaurus.config.js');
const searchConsoleBaselines = require('./search-console-baselines.json');

const buildDir = path.join(__dirname, '..', 'build');
const baselineId = 'stable-introduction-search-relevance';
const stableRoute = '/docs/introduction/';
const prereleaseRoute = '/docs/2.0/introduction/';
const titleMaximumLength = 60;
const descriptionLength = {minimum: 120, maximum: 160};

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

function metaContent(html, keyName, keyValue) {
  const tag = openingTags(html, 'meta')
    .find(candidate => attribute(candidate, keyName) === keyValue);
  return tag ? attribute(tag, 'content') : null;
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

function readRoute(route) {
  const relativePath = `${route.replace(/^\/+|\/+$/g, '')}/index.html`;
  const filePath = path.join(buildDir, relativePath);
  assert(fs.existsSync(filePath), `missing established route build/${relativePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function renderedMetadata(html) {
  return {
    title: titleContent(html),
    description: metaContent(html, 'name', 'description'),
    openGraphTitle: metaContent(html, 'property', 'og:title'),
    openGraphDescription: metaContent(html, 'property', 'og:description'),
    openGraphUrl: metaContent(html, 'property', 'og:url'),
    openGraphImage: metaContent(html, 'property', 'og:image'),
    twitterCard: metaContent(html, 'name', 'twitter:card'),
    twitterTitle: metaContent(html, 'name', 'twitter:title'),
    twitterDescription: metaContent(html, 'name', 'twitter:description'),
    twitterImage: metaContent(html, 'name', 'twitter:image'),
  };
}

function assertPresent(value, label) {
  assert(value, `missing ${label}`);
  return value;
}

function assertPreviewMetadata(html, route, expectedCanonical) {
  const metadata = renderedMetadata(html);
  const canonical = new URL(expectedCanonical, config.url).toString();

  assert.deepStrictEqual(
    canonicalLinks(html),
    [canonical],
    `${route} must expose exactly one canonical URL`,
  );
  assert.strictEqual(metadata.openGraphUrl, canonical, `${route} Open Graph URL`);

  const title = assertPresent(metadata.title, `${route} search title`);
  const description = assertPresent(metadata.description, `${route} search description`);
  assert.strictEqual(metadata.openGraphTitle, title, `${route} Open Graph title`);
  assert.strictEqual(metadata.twitterTitle, title, `${route} Twitter title`);
  assert.strictEqual(metadata.openGraphDescription, description, `${route} Open Graph description`);
  assert.strictEqual(metadata.twitterDescription, description, `${route} Twitter description`);
  assert.strictEqual(metadata.twitterCard, 'summary_large_image', `${route} Twitter card`);

  const openGraphImage = assertPresent(metadata.openGraphImage, `${route} Open Graph image`);
  const twitterImage = assertPresent(metadata.twitterImage, `${route} Twitter image`);
  assert.strictEqual(twitterImage, openGraphImage, `${route} social preview image`);
  assert.doesNotThrow(() => new URL(openGraphImage), `${route} social image must be absolute`);

  return {title, description};
}

const baseline = searchConsoleBaselines.baselines
  .find(candidate => candidate.id === baselineId);
assert(baseline, `missing Search Console baseline ${baselineId}`);
assert.strictEqual(baseline.window?.status, 'finalized', `${baselineId} window status`);
assert.strictEqual(baseline.window?.days, 28, `${baselineId} window length`);
assert.strictEqual(baseline.landing_page, stableRoute, `${baselineId} landing page`);
assert(Array.isArray(baseline.search_intent?.clusters), `${baselineId} intent clusters`);
assert(baseline.search_intent.clusters.length > 0, `${baselineId} must identify search intents`);

const stableHtml = readRoute(stableRoute);
const prereleaseHtml = readRoute(prereleaseRoute);
const stable = assertPreviewMetadata(stableHtml, stableRoute, stableRoute);
const prerelease = assertPreviewMetadata(prereleaseHtml, prereleaseRoute, prereleaseRoute);

assert(stable.title.length <= titleMaximumLength, `stable title exceeds ${titleMaximumLength} characters`);
assert(
  stable.description.length >= descriptionLength.minimum
    && stable.description.length <= descriptionLength.maximum,
  `stable description must be ${descriptionLength.minimum}-${descriptionLength.maximum} characters`,
);

const stableResult = `${stable.title} ${stable.description}`.toLocaleLowerCase('en');
for (const cluster of baseline.search_intent.clusters) {
  assert(cluster.id, 'every search intent cluster must have an id');
  assert(cluster.reader_question, `${cluster.id} must explain the reader question`);
  assert(Array.isArray(cluster.result_terms), `${cluster.id} must declare result terms`);
  for (const term of cluster.result_terms) {
    assert(
      stableResult.includes(term.toLocaleLowerCase('en')),
      `stable result metadata must address ${cluster.id} with ${JSON.stringify(term)}`,
    );
  }
}

assert.notStrictEqual(stable.title, prerelease.title, 'stable and 2.0 titles must remain distinct');
assert.notStrictEqual(
  stable.description,
  prerelease.description,
  'stable and 2.0 descriptions must remain distinct',
);
assert(
  stableHtml.includes('name="docusaurus_version" content="1.x"'),
  'stable introduction must remain on the 1.x documentation line',
);
assert(
  prereleaseHtml.includes('name="docusaurus_version" content="current"'),
  '2.0 introduction must remain on the explicit prerelease documentation line',
);
assert(
  !/http-equiv="refresh"|window\.location\.(?:href|replace)/i.test(stableHtml),
  'stable introduction must remain a rendered document instead of a redirect',
);

console.log('Stable introduction search and social metadata checks passed');
