#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  ARTIFACT_PINS,
  PUBLISHED_ARTIFACT_PINS,
  replaceArtifactTokens,
} = require('./public-artifact-versions');

const repoRoot = path.join(__dirname, '..');
const journeyPath = path.join(repoRoot, 'docs', 'laravel-adoption.md');
const journeyRoute = '/docs/2.0/laravel-adoption/';
const linkedSources = Object.freeze([
  'versioned_docs/version-1.x/installation.md',
  'versioned_docs/version-1.x/migration.md',
  'docs/introduction.md',
  'docs/migration.md',
  'docs/polyglot/php.md',
]);
const requiredJourneyRoutes = Object.freeze([
  '/docs/installation/',
  '/docs/migration/',
  '/docs/2.0/installation/',
  '/docs/2.0/migration/',
  '/docs/2.0/polyglot/php/',
  '/docs/2.0/polyglot/cloud-control-plane/',
  '/docs/2.0/polyglot/server/',
  '/docs/2.0/polyglot/embedded-to-server/',
]);

function fail(message) {
  throw new Error(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertIncludes(source, value, label) {
  if (!source.includes(value)) {
    fail(`${label} must include ${JSON.stringify(value)}`);
  }
}

function sourceForRoute(route) {
  if (route === '/docs/installation/' || route === '/docs/migration/') {
    return `versioned_docs/version-1.x/${route.split('/').filter(Boolean).at(-1)}.md`;
  }

  const docId = route.replace(/^\/docs\/2\.0\//, '').replace(/\/$/, '');
  return `docs/${docId}.md`;
}

function collectDocIds(item, ids = []) {
  if (Array.isArray(item)) {
    for (const child of item) {
      collectDocIds(child, ids);
    }
    return ids;
  }

  if (typeof item === 'string') {
    ids.push(item);
  } else if (item?.type === 'doc' && typeof item.id === 'string') {
    ids.push(item.id);
  }

  for (const child of item?.items || []) {
    collectDocIds(child, ids);
  }

  return ids;
}

function main() {
  if (!fs.existsSync(journeyPath)) {
    fail('The Laravel adoption route is missing its documentation source');
  }

  const journey = fs.readFileSync(journeyPath, 'utf8');

  for (const sourcePath of linkedSources) {
    assertIncludes(read(sourcePath), journeyRoute, sourcePath);
  }

  for (const route of requiredJourneyRoutes) {
    const sourcePath = sourceForRoute(route);
    if (!fs.existsSync(path.join(repoRoot, sourcePath))) {
      fail(`${journeyRoute} links to missing source ${sourcePath}`);
    }
    assertIncludes(journey, route, 'docs/laravel-adoption.md');
  }

  delete require.cache[require.resolve(path.join(repoRoot, 'sidebars.js'))];
  const sidebars = require(path.join(repoRoot, 'sidebars.js'));
  const sidebarDocIds = new Set(collectDocIds(sidebars.tutorialSidebar || []));
  if (!sidebarDocIds.has('laravel-adoption')) {
    fail('sidebars.js must expose the Laravel adoption route');
  }

  for (const packageName of ['durable-workflow/workflow', 'durable-workflow/sdk']) {
    assertIncludes(journey, packageName, 'docs/laravel-adoption.md package boundary');
  }
  assertIncludes(
    journey,
    'composer require %%artifact.workflowComposerPackage%%',
    'docs/laravel-adoption.md embedded install',
  );
  assertIncludes(
    journey,
    'composer require %%artifact.publishedPhpSdkComposerPackage%%',
    'docs/laravel-adoption.md service install',
  );

  if (!ARTIFACT_PINS.workflowComposerPackage.startsWith('durable-workflow/workflow:')) {
    fail('The qualified artifact data has an invalid embedded Workflow Composer identity');
  }
  if (!PUBLISHED_ARTIFACT_PINS.phpSdkComposerPackage.startsWith('durable-workflow/sdk:')) {
    fail('The published artifact data has an invalid PHP SDK Composer identity');
  }

  const rendered = replaceArtifactTokens(journey, 'docs/laravel-adoption.md');
  assertIncludes(
    rendered,
    `composer require ${ARTIFACT_PINS.workflowComposerPackage}`,
    'rendered embedded install',
  );
  assertIncludes(
    rendered,
    `composer require ${PUBLISHED_ARTIFACT_PINS.phpSdkComposerPackage}`,
    'rendered service install',
  );

  console.log(
    `Laravel adoption checks passed for ${linkedSources.length} entry points and ` +
      `${requiredJourneyRoutes.length} destination routes`,
  );
}

main();
