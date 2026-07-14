#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const config = require('../docusaurus.config.js');

const repoRoot = path.join(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const stableVersion = '1.x';
const prereleaseVersion = '2.0';
const prohibitedStableClaims = [
  /\bpolyglot\b/i,
  /\bstandalone server\b/i,
  /\bself-hostable\b/i,
  /\bagent[- ]first\b/i,
  /\bautonomous agents?\b/i,
  /\bPython\b/i,
  /\bRust\b/i,
];

function fail(message) {
  throw new Error(message);
}

function readBuildFile(relativePath) {
  const filePath = path.join(buildDir, relativePath);
  if (!fs.existsSync(filePath)) {
    fail(`Missing generated homepage policy artifact: build/${relativePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'i'));
  return match ? match[1] : null;
}

function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&(?:#x27|#39);/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function taggedElement(html, elementName, attributeName, attributeValue) {
  const openingTags = [...html.matchAll(new RegExp(`<${elementName}\\b[^>]*>`, 'gi'))];
  const opening = openingTags.find(match => (
    attribute(match[0], attributeName) === attributeValue
  ));

  if (!opening) {
    fail(`Homepage is missing ${elementName}[${attributeName}="${attributeValue}"]`);
  }

  const closingIndex = html.indexOf(`</${elementName}>`, opening.index);
  if (closingIndex === -1) {
    fail(`Homepage ${elementName}[${attributeName}="${attributeValue}"] is not closed`);
  }

  return html.slice(opening.index, closingIndex + elementName.length + 3);
}

function taggedAnchor(html, action) {
  const openingTags = [...html.matchAll(/<a\b[^>]*>/gi)];
  const opening = openingTags.find(match => (
    attribute(match[0], 'data-homepage-action') === action
  ));

  if (!opening) {
    fail(`Homepage is missing action ${action}`);
  }

  const closingIndex = html.indexOf('</a>', opening.index);
  if (closingIndex === -1) {
    fail(`Homepage action ${action} is not closed`);
  }

  return {
    tag: opening[0],
    label: visibleText(html.slice(opening.index, closingIndex + 4)),
  };
}

function classNames(tag) {
  return new Set((attribute(tag, 'class') || '').split(/\s+/).filter(Boolean));
}

function metaContent(html, keyName, keyValue) {
  const tag = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map(match => match[0])
    .find(candidate => attribute(candidate, keyName) === keyValue);
  return tag ? attribute(tag, 'content') : null;
}

function titleContent(html) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? visibleText(match[1]) : null;
}

function normalizeRoute(value) {
  if (!value) {
    return null;
  }
  const route = new URL(value, config.url).pathname;
  return route === '/' ? route : route.replace(/\/+$/, '');
}

function assertContains(text, pattern, label) {
  if (!pattern.test(text || '')) {
    fail(`${label} must include ${pattern}`);
  }
}

function assertDoesNotContain(text, pattern, label) {
  if (pattern.test(text || '')) {
    fail(`${label} must not include ${pattern}`);
  }
}

function assertNoProhibitedClaims(text, label) {
  for (const pattern of prohibitedStableClaims) {
    if (pattern.test(text || '')) {
      fail(`${label} contains a prerelease-only claim matching ${pattern}`);
    }
  }
}

function assertStableIdentity(text, label) {
  assertContains(text, /\b(1\.x|stable)\b/i, label);
  assertDoesNotContain(text, /\b2\.0\b/i, label);
  assertDoesNotContain(text, /\bpre[- ]?release\b/i, label);
}

function assertPrereleaseIdentity(text, label) {
  assertContains(text, /\b2\.0\b/i, label);
  assertContains(text, /\bpre[- ]?release\b/i, label);
  assertDoesNotContain(text, /\b(1\.x|stable)\b/i, label);
}

function classicDocsConfig() {
  const preset = (config.presets || [])
    .find(entry => Array.isArray(entry) && entry[0] === 'classic');
  return preset?.[1]?.docs || {};
}

function assertRoutingConfig() {
  const docs = classicDocsConfig();
  const versions = docs.versions || {};

  if (docs.lastVersion !== stableVersion || versions[stableVersion]?.path !== '') {
    fail('Stable 1.x must remain the unversioned default documentation line');
  }
  if (
    versions.current?.path !== prereleaseVersion ||
    versions.current?.banner !== 'unreleased'
  ) {
    fail('Current documentation must remain the explicit 2.0 prerelease line');
  }

  assertNoProhibitedClaims(config.tagline, 'Site tagline');
}

function assertHomepageContent(homepage) {
  const stableHeader = taggedElement(
    homepage,
    'header',
    'data-homepage-release',
    'stable-1.x',
  );
  const stableSection = taggedElement(
    homepage,
    'section',
    'data-homepage-release',
    'stable-1.x',
  );
  const pageText = visibleText(`${stableHeader} ${stableSection}`);

  assertNoProhibitedClaims(pageText, 'Stable homepage content');

  const stableAction = taggedAnchor(homepage, 'stable-get-started');
  const stableClasses = classNames(stableAction.tag);
  if (normalizeRoute(attribute(stableAction.tag, 'href')) !== '/docs/introduction') {
    fail('Primary homepage action must route to the stable unversioned introduction');
  }
  if (attribute(stableAction.tag, 'data-action-priority') !== 'primary') {
    fail('Stable getting-started action must remain primary');
  }
  if (!stableClasses.has('button') || stableClasses.has('button--outline')) {
    fail('Stable getting-started action must be a primary filled button');
  }
  assertStableIdentity(stableAction.label, 'Primary homepage action');

  const prereleaseAction = taggedAnchor(homepage, 'prerelease-2.0');
  const prereleaseClasses = classNames(prereleaseAction.tag);
  const prereleaseRoute = normalizeRoute(attribute(prereleaseAction.tag, 'href'));
  if (prereleaseRoute !== '/docs/2.0/introduction') {
    fail('2.0 homepage action must route to the prerelease introduction');
  }
  if (attribute(prereleaseAction.tag, 'data-action-priority') !== 'secondary') {
    fail('2.0 homepage action must remain secondary');
  }
  if (!prereleaseClasses.has('button') || !prereleaseClasses.has('button--outline')) {
    fail('2.0 homepage action must be a secondary outline button');
  }
  assertPrereleaseIdentity(prereleaseAction.label, '2.0 homepage action');
}

function assertHomepageMetadata(homepage) {
  const values = {
    title: titleContent(homepage),
    description: metaContent(homepage, 'name', 'description'),
    'Open Graph title': metaContent(homepage, 'property', 'og:title'),
    'Open Graph description': metaContent(homepage, 'property', 'og:description'),
    'Twitter title': metaContent(homepage, 'name', 'twitter:title'),
    'Twitter description': metaContent(homepage, 'name', 'twitter:description'),
  };

  for (const [label, value] of Object.entries(values)) {
    if (!value) {
      fail(`Homepage is missing ${label} metadata`);
    }
    assertNoProhibitedClaims(value, `Homepage ${label}`);
  }
}

function assertDiscoverySurfaces() {
  const canonicalHeader = readBuildFile('llms.txt').split(/\r?\n/).slice(0, 8).join('\n');
  const prereleaseHeader = readBuildFile('llms-2.0.txt').split(/\r?\n/).slice(0, 10).join('\n');
  const prereleaseIntroduction = readBuildFile('docs/2.0/introduction/index.html');
  const prereleaseDescription = metaContent(
    prereleaseIntroduction,
    'name',
    'description',
  );

  assertNoProhibitedClaims(canonicalHeader, 'Canonical LLM manifest header');
  assertContains(prereleaseHeader, /\b2\.0\b/i, '2.0 LLM manifest header');
  assertContains(prereleaseHeader, /\bprerelease\b/i, '2.0 LLM manifest header');
  if (metaContent(prereleaseIntroduction, 'name', 'docusaurus_version') !== 'current') {
    fail('2.0 introduction must remain on the explicit current prerelease version');
  }
  assertContains(prereleaseDescription, /\b2\.0\b/i, '2.0 introduction metadata');
}

function main() {
  assertRoutingConfig();
  const homepage = readBuildFile('index.html');
  assertHomepageContent(homepage);
  assertHomepageMetadata(homepage);
  assertDiscoverySurfaces();
  console.log('Homepage stable-versus-prerelease release policy checks passed');
}

main();
