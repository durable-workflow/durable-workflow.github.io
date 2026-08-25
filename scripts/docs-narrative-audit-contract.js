const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const yaml = require('js-yaml');
const {
  assertPublicReference,
  repositorySourceUrl,
} = require('./docs-audit-public-references');

const SCHEMA = 'durable-workflow.docs.narrative-audit';
const SCHEMA_VERSION = 4;

function sourceFrontMatter(repoRoot, sourceFile) {
  const source = fs.readFileSync(path.join(repoRoot, sourceFile), 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? yaml.load(match[1]) || {} : {};
}

function routeForSource(sourceFile) {
  if (!/^docs\/.+\.mdx?$/.test(sourceFile)) {
    throw new Error(`Narrative inventory source is not a docs Markdown file: ${sourceFile}`);
  }

  return `/docs/2.0/${sourceFile.slice('docs/'.length).replace(/\.mdx?$/, '')}/`;
}

function buildArtifactForRoute(route) {
  return `build/${route.replace(/^\//, '')}index.html`;
}

function markdownSourceFiles(repoRoot) {
  const docsRoot = path.join(repoRoot, 'docs');
  const files = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (/\.mdx?$/.test(entry.name)) {
        files.push(path.relative(repoRoot, absolutePath).split(path.sep).join('/'));
      }
    }
  }

  visit(docsRoot);
  return files.sort();
}

function sourceInventory(repoRoot) {
  return markdownSourceFiles(repoRoot).map(sourceFile => {
    const route = routeForSource(sourceFile);
    const frontMatter = sourceFrontMatter(repoRoot, sourceFile);
    const canonicalRoute = frontMatter.canonical_path || route;
    return {
      source_file: sourceFile,
      route,
      build_artifact: buildArtifactForRoute(route),
      canonical_route: canonicalRoute,
      sitemap_included: canonicalRoute === route,
    };
  });
}

function docsRevision(repoRoot) {
  const environmentRevision = process.env.DOCS_REVISION || process.env.GITHUB_SHA;
  const revision = environmentRevision || execFileSync(
    'git',
    ['rev-parse', 'HEAD'],
    {cwd: repoRoot, encoding: 'utf8'},
  ).trim();

  if (!/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error(`Docs revision must be a 40-character Git SHA, got ${JSON.stringify(revision)}`);
  }

  return revision;
}

function publicInventory(inventory, revision) {
  return inventory.map(entry => ({
    source_url: repositorySourceUrl(entry.source_file, revision),
    route: entry.route,
    artifact_route: entry.route,
    canonical_route: entry.canonical_route,
    sitemap_included: entry.sitemap_included,
  }));
}

function validatePublicInventory(inventory, validationInventory, revision) {
  if (!Array.isArray(inventory)) {
    throw new Error('Published narrative route inventory must be an array');
  }
  if (!Array.isArray(validationInventory) || inventory.length !== validationInventory.length) {
    throw new Error('Published narrative route inventory must cover every validated source');
  }

  const routes = new Set();
  inventory.forEach((entry, index) => {
    const validationEntry = validationInventory[index];
    if (!entry || typeof entry !== 'object') {
      throw new Error('Published narrative route inventory entries must be objects');
    }
    if (routes.has(entry.route)) {
      throw new Error(`Duplicate published narrative inventory route: ${entry.route}`);
    }
    if (
      entry.route !== validationEntry.route
      || entry.artifact_route !== entry.route
      || entry.canonical_route !== validationEntry.canonical_route
      || entry.sitemap_included !== validationEntry.sitemap_included
    ) {
      throw new Error(`${entry.route} published narrative artifact route is invalid`);
    }
    if (entry.source_url !== repositorySourceUrl(validationEntry.source_file, revision)) {
      throw new Error(`${entry.route} published narrative source URL is invalid`);
    }
    assertPublicReference(entry.source_url, `${entry.route} source_url`);
    assertPublicReference(entry.artifact_route, `${entry.route} artifact_route`);
    assertPublicReference(entry.canonical_route, `${entry.route} canonical_route`);
    routes.add(entry.route);
  });
}

function validateInventory(inventory) {
  if (!Array.isArray(inventory)) {
    throw new Error('Narrative route inventory must be an array');
  }

  const sources = new Set();
  const routes = new Set();
  for (const entry of inventory) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Narrative route inventory entries must be objects');
    }
    if (sources.has(entry.source_file)) {
      throw new Error(`Duplicate narrative inventory source: ${entry.source_file}`);
    }
    if (routes.has(entry.route)) {
      throw new Error(`Duplicate narrative inventory route: ${entry.route}`);
    }
    if (entry.route !== routeForSource(entry.source_file)) {
      throw new Error(`${entry.source_file} inventory route does not match its source path`);
    }
    if (entry.build_artifact !== buildArtifactForRoute(entry.route)) {
      throw new Error(`${entry.source_file} inventory build artifact does not match its route`);
    }
    if (
      typeof entry.canonical_route !== 'string'
      || !entry.canonical_route.startsWith('/docs/')
      || !entry.canonical_route.endsWith('/')
    ) {
      throw new Error(`${entry.source_file} inventory canonical route is invalid`);
    }
    if (entry.sitemap_included !== (entry.canonical_route === entry.route)) {
      throw new Error(`${entry.source_file} inventory sitemap disposition is invalid`);
    }
    sources.add(entry.source_file);
    routes.add(entry.route);
  }
}

module.exports = {
  SCHEMA,
  SCHEMA_VERSION,
  buildArtifactForRoute,
  docsRevision,
  publicInventory,
  routeForSource,
  sourceInventory,
  validateInventory,
  validatePublicInventory,
};
