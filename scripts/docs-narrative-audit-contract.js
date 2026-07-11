const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const DIMENSIONS = Object.freeze([
  'progressive_disclosure',
  'prerequisites',
  'internal_consistency',
  'contract_accuracy',
  'user_facing_completeness',
]);

const SCHEMA = 'durable-workflow.docs.narrative-audit';
const SCHEMA_VERSION = 1;

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function routeForSource(sourceFile) {
  if (!/^docs\/.+\.mdx?$/.test(sourceFile)) {
    throw new Error(`Narrative review source is not a docs Markdown file: ${sourceFile}`);
  }

  return `/docs/2.0/${sourceFile.slice('docs/'.length).replace(/\.mdx?$/, '')}/`;
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
  return markdownSourceFiles(repoRoot).map(sourceFile => ({
    source_file: sourceFile,
    route: routeForSource(sourceFile),
    source_sha256: sha256(fs.readFileSync(path.join(repoRoot, sourceFile))),
  }));
}

function docsRevision(repoRoot) {
  const environmentRevision = process.env.DOCS_REVISION || process.env.GITHUB_SHA;
  const revision = environmentRevision || execFileSync(
    'git',
    ['rev-parse', 'HEAD'],
    {cwd: repoRoot, encoding: 'utf8'}
  ).trim();

  if (!/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error(`Docs revision must be a 40-character Git SHA, got ${JSON.stringify(revision)}`);
  }

  return revision;
}

function fail(message) {
  throw new Error(message);
}

function validateReviewContract(reviews, inventory) {
  if (!Array.isArray(reviews)) {
    fail('Narrative review contract must contain a reviews array');
  }

  const sources = new Map(inventory.map(source => [source.source_file, source]));
  const seenSources = new Set();
  const seenRoutes = new Set();
  const evidencePhrases = new Set();

  for (const review of reviews) {
    if (!review || typeof review !== 'object') {
      fail('Narrative review rows must be objects');
    }

    if (seenSources.has(review.source_file)) {
      fail(`Duplicate narrative review source: ${review.source_file}`);
    }
    seenSources.add(review.source_file);

    if (seenRoutes.has(review.route)) {
      fail(`Duplicate narrative review route: ${review.route}`);
    }
    seenRoutes.add(review.route);

    const source = sources.get(review.source_file);
    if (!source) {
      fail(`Narrative review references a source outside the canonical 2.0 Markdown set: ${review.source_file}`);
    }
    if (review.route !== source.route) {
      fail(`${review.source_file} review route must be ${source.route}, got ${review.route}`);
    }
    if (review.source_sha256 !== source.source_sha256) {
      fail(
        `${review.source_file} changed after editorial review: ` +
        `reviewed=${review.source_sha256} current=${source.source_sha256}`
      );
    }
    if (review.verdict !== 'pass') {
      fail(`${review.source_file} narrative verdict must be pass, got ${JSON.stringify(review.verdict)}`);
    }

    const dimensionKeys = Object.keys(review.dimensions || {}).sort();
    const expectedKeys = [...DIMENSIONS].sort();
    if (JSON.stringify(dimensionKeys) !== JSON.stringify(expectedKeys)) {
      fail(`${review.source_file} must review exactly these dimensions: ${DIMENSIONS.join(', ')}`);
    }

    for (const dimension of DIMENSIONS) {
      const result = review.dimensions[dimension];
      if (!result || result.status !== 'pass') {
        fail(`${review.source_file} has an unreviewed or failing ${dimension} dimension`);
      }
      if (typeof result.evidence !== 'string' || result.evidence.trim().length < 24) {
        fail(`${review.source_file} ${dimension} evidence must be a concise, source-specific statement`);
      }

      const normalized = result.evidence.trim().toLowerCase();
      if (evidencePhrases.has(normalized)) {
        fail(`Narrative evidence must be source-specific; duplicate phrase: ${result.evidence}`);
      }
      evidencePhrases.add(normalized);
    }
  }

  const missing = [...sources.keys()].filter(sourceFile => !seenSources.has(sourceFile));
  if (missing.length > 0) {
    fail(`Narrative review is missing canonical 2.0 Markdown sources: ${missing.join(', ')}`);
  }
  if (reviews.length !== inventory.length) {
    fail(`Narrative review row count must be ${inventory.length}, got ${reviews.length}`);
  }
}

module.exports = {
  DIMENSIONS,
  SCHEMA,
  SCHEMA_VERSION,
  docsRevision,
  routeForSource,
  sha256,
  sourceInventory,
  validateReviewContract,
};
