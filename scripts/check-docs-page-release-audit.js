#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const config = require('../docusaurus.config.js');

const repoRoot = path.join(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const auditPath = path.join(buildDir, 'docs-page-release-audit.json');
const sitemapPath = path.join(buildDir, 'sitemap.xml');

const SCHEMA = 'durable-workflow.docs.page-release-audit';
const VERDICTS = new Set(['CLEAN', 'LEAK', 'MIXED']);
const REQUIRED_EDGE_PATHS = [
  '/',
  '/docs/',
  '/docs/platform-conformance/',
  '/docs/2.0/platform-conformance/',
  '/docs/2.0/docs-page-release-audit/',
  '/llms.txt',
  '/llms-full.txt',
  '/llms-1.x.txt',
  '/llms-full-1.x.txt',
  '/llms-2.0.txt',
  '/llms-full-2.0.txt',
  '/2.0/llms-full.txt',
  '/docs-page-release-audit.json',
  '/platform-conformance-contract.json',
  '/platform-conformance/signal-query-runtime-scenarios.json',
  '/platform-conformance/search-attribute-runtime-scenarios.json',
  '/platform-conformance/replay-runtime-scenarios.json',
  '/platform-conformance/namespace-runtime-scenarios.json',
  '/platform-conformance/child-workflow-runtime-scenarios.json',
  '/platform-conformance/worker-versioning-runtime-scenarios.json',
  '/platform-conformance/saga-runtime-scenarios.json',
];

function fail(message) {
  throw new Error(message);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing generated audit manifest: ${path.relative(repoRoot, filePath)}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readSitemapPaths() {
  if (!fs.existsSync(sitemapPath)) {
    fail('Missing generated sitemap: build/sitemap.xml');
  }

  const sitemap = fs.readFileSync(sitemapPath, 'utf8');

  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(match => new URL(match[1]).pathname)
    .sort();
}

function assertIncludesPath(entriesByPath, routePath, label) {
  if (!entriesByPath.has(routePath)) {
    fail(`Docs page release audit is missing ${label}: ${routePath}`);
  }
}

function assertBuildArtifact(routePath) {
  const cleanPath = routePath.replace(/^\/+/, '');
  const candidates = [];

  if (routePath === '/') {
    candidates.push(path.join(buildDir, 'index.html'));
  } else if (routePath.endsWith('/')) {
    candidates.push(path.join(buildDir, cleanPath, 'index.html'));
  } else {
    candidates.push(path.join(buildDir, cleanPath));
  }

  if (!candidates.some(candidate => fs.existsSync(candidate))) {
    fail(`Missing built public artifact for audited edge path ${routePath}`);
  }
}

function getDocsLastVersion() {
  const preset = Array.isArray(config.presets)
    ? config.presets.find(entry => Array.isArray(entry) && entry[0] === 'classic')
    : null;

  return preset && preset[1] && preset[1].docs
    ? preset[1].docs.lastVersion
    : null;
}

function main() {
  const audit = readJson(auditPath);
  const sitemapPaths = readSitemapPaths();
  const entries = Array.isArray(audit.page_inventory) ? audit.page_inventory : [];
  const entriesByPath = new Map(entries.map(entry => [entry.path, entry]));

  if (audit.schema !== SCHEMA) {
    fail(`docs-page-release-audit.json schema must be ${SCHEMA}`);
  }

  if (getDocsLastVersion() !== '1.x') {
    fail('docusaurus.config.js lastVersion must remain 1.x until an authorized release-status cutover');
  }

  if (audit.release_status_guardrail?.stable_default_docs_version !== '1.x') {
    fail('audit manifest must declare stable_default_docs_version=1.x');
  }

  if (audit.release_status_guardrail?.explicit_prerelease_docs_version !== '2.0') {
    fail('audit manifest must declare explicit_prerelease_docs_version=2.0');
  }

  for (const entry of entries) {
    if (!entry.path || !entry.url || !entry.source_file) {
      fail(`Audit entry is missing path, url, or source_file: ${JSON.stringify(entry)}`);
    }

    if (!VERDICTS.has(entry.verdict)) {
      fail(`${entry.path} has invalid verdict ${JSON.stringify(entry.verdict)}`);
    }

    if (entry.verdict === 'CLEAN' && entry.leak_count !== 0) {
      fail(`${entry.path} is CLEAN but leak_count is ${entry.leak_count}`);
    }

    if (entry.verdict !== 'CLEAN' && (!Array.isArray(entry.findings) || entry.findings.length === 0)) {
      fail(`${entry.path} is ${entry.verdict} but has no focused finding record`);
    }
  }

  const docsPaths = sitemapPaths.filter(routePath => routePath.startsWith('/docs/'));
  const stableDocsPaths = docsPaths.filter(routePath => !routePath.startsWith('/docs/2.0/'));
  const prereleaseDocsPaths = docsPaths.filter(routePath => routePath.startsWith('/docs/2.0/'));

  for (const routePath of stableDocsPaths) {
    assertIncludesPath(entriesByPath, routePath, 'stable default docs route');
  }

  for (const routePath of prereleaseDocsPaths) {
    assertIncludesPath(entriesByPath, routePath, 'explicit 2.0 docs route');
  }

  for (const routePath of REQUIRED_EDGE_PATHS) {
    assertBuildArtifact(routePath);
    assertIncludesPath(entriesByPath, routePath, 'edge surface');
  }

  for (const routePath of ['/', '/docs/', '/llms.txt', '/llms-full.txt']) {
    const entry = entriesByPath.get(routePath);
    if (!entry.intended_release_status.includes('1_x')) {
      fail(`${routePath} must remain classified as a stable 1.x default surface`);
    }
  }

  for (const routePath of ['/docs/2.0/platform-conformance/', '/llms-2.0.txt', '/llms-full-2.0.txt']) {
    const entry = entriesByPath.get(routePath);
    if (!entry.intended_release_status.includes('2_0')) {
      fail(`${routePath} must remain classified as an explicit 2.0 prerelease surface`);
    }
  }

  const summary = audit.summary || {};
  if (summary.stable_default_docs_pages !== stableDocsPaths.length) {
    fail(
      `audit stable_default_docs_pages must be ${stableDocsPaths.length}, ` +
      `got ${summary.stable_default_docs_pages}`
    );
  }

  if (summary.explicit_prerelease_2_0_pages !== prereleaseDocsPaths.length) {
    fail(
      `audit explicit_prerelease_2_0_pages must be ${prereleaseDocsPaths.length}, ` +
      `got ${summary.explicit_prerelease_2_0_pages}`
    );
  }

  if (!Array.isArray(summary.missing_classifications) || summary.missing_classifications.length !== 0) {
    fail('audit summary must have no missing_classifications');
  }

  console.log(
    `Docs page release audit checks passed for ${stableDocsPaths.length} stable docs routes, ` +
    `${prereleaseDocsPaths.length} explicit 2.0 routes, and ${REQUIRED_EDGE_PATHS.length} edge paths`
  );
}

main();
