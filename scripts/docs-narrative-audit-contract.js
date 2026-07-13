const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const SCHEMA = 'durable-workflow.docs.narrative-audit';
const SCHEMA_VERSION = 2;

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
    return {
      source_file: sourceFile,
      route,
      build_artifact: buildArtifactForRoute(route),
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
    sources.add(entry.source_file);
    routes.add(entry.route);
  }
}

module.exports = {
  SCHEMA,
  SCHEMA_VERSION,
  buildArtifactForRoute,
  docsRevision,
  routeForSource,
  sourceInventory,
  validateInventory,
};
