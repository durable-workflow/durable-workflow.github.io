#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const config = require('../docusaurus.config.js');
const { ARTIFACT_VERSIONS } = require('./public-artifact-versions');

const repoRoot = path.join(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const auditPath = path.join(buildDir, 'docs-page-release-audit.json');
const sitemapPath = path.join(buildDir, 'sitemap.xml');

const SCHEMA = 'durable-workflow.docs.page-release-audit';
const VERDICTS = new Set(['CLEAN', 'LEAK', 'MIXED']);
const CLASSIFIER_ID = 'content-derived-release-status-v2';
const SELF_HASH_EXCEPTION = {
  path: '/docs-page-release-audit.json',
  status: 'self_referential_manifest',
  code: 'SELF_REFERENTIAL_MANIFEST',
  applies_to: 'evidence.content_sha256',
  algorithm: 'sha256',
};
const STATIC_REQUIRED_EDGE_PATHS = [
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
  '/platform-conformance/migration-runtime-scenarios.json',
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

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function buildRelativePath(routePath) {
  const cleanPath = routePath.replace(/^\/+/, '');

  if (routePath === '/') {
    return 'index.html';
  }

  if (routePath.endsWith('/')) {
    return path.posix.join(cleanPath, 'index.html');
  }

  return cleanPath;
}

function buildArtifactPath(routePath) {
  return path.join(buildDir, buildRelativePath(routePath));
}

function publicConformanceManifestPaths() {
  const manifestDir = path.join(repoRoot, 'static', 'platform-conformance');

  if (!fs.existsSync(manifestDir)) {
    return [];
  }

  return fs.readdirSync(manifestDir)
    .filter(fileName => fileName.endsWith('.json'))
    .sort()
    .map(fileName => `/platform-conformance/${fileName}`);
}

function requiredEdgePaths() {
  return [...new Set([...STATIC_REQUIRED_EDGE_PATHS, ...publicConformanceManifestPaths()])].sort();
}

function assertIncludesPath(entriesByPath, routePath, label) {
  if (!entriesByPath.has(routePath)) {
    fail(`Docs page release audit is missing ${label}: ${routePath}`);
  }
}

function assertBuildArtifact(routePath) {
  if (!fs.existsSync(buildArtifactPath(routePath))) {
    fail(`Missing built public artifact for audited edge path ${routePath}`);
  }
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function assertSelfHashException(entry) {
  const exception = entry.evidence.content_sha256_exception;

  if (entry.evidence.content_sha256 !== null) {
    fail(`${entry.path} self-entry content_sha256 must be null`);
  }

  if (entry.evidence.content_sha256_status !== SELF_HASH_EXCEPTION.status) {
    fail(`${entry.path} self-entry must declare content_sha256_status=${SELF_HASH_EXCEPTION.status}`);
  }

  if (!exception || typeof exception !== 'object') {
    fail(`${entry.path} self-entry must include a machine-readable content_sha256_exception`);
  }

  if (exception.code !== SELF_HASH_EXCEPTION.code) {
    fail(`${entry.path} self-entry exception must use code=${SELF_HASH_EXCEPTION.code}`);
  }

  if (exception.applies_to !== SELF_HASH_EXCEPTION.applies_to) {
    fail(`${entry.path} self-entry exception must apply to ${SELF_HASH_EXCEPTION.applies_to}`);
  }

  if (exception.algorithm !== SELF_HASH_EXCEPTION.algorithm) {
    fail(`${entry.path} self-entry exception must name algorithm=${SELF_HASH_EXCEPTION.algorithm}`);
  }

  if (exception.artifact_path !== entry.evidence.artifact_path) {
    fail(`${entry.path} self-entry exception artifact_path must match evidence.artifact_path`);
  }

  if (!exception.reason) {
    fail(`${entry.path} self-entry exception must explain why the final artifact hash is unavailable`);
  }
}

function assertEvidence(entry) {
  if (!Array.isArray(entry.categories_observed) || entry.categories_observed.length === 0) {
    fail(`${entry.path} must record observed release-status evidence categories`);
  }

  if (!entry.evidence || entry.evidence.classifier !== CLASSIFIER_ID) {
    fail(`${entry.path} must carry ${CLASSIFIER_ID} evidence`);
  }

  if (!entry.evidence.artifact_path || !entry.evidence.artifact_path.startsWith('build/')) {
    fail(`${entry.path} evidence must name the built artifact path`);
  }

  if (!Array.isArray(entry.evidence.checks) || entry.evidence.checks.length === 0) {
    fail(`${entry.path} evidence must include page-level checks`);
  }

  for (const check of entry.evidence.checks) {
    if (!check.category || !['pass', 'fail'].includes(check.status) || !check.evidence) {
      fail(`${entry.path} has malformed evidence check: ${JSON.stringify(check)}`);
    }
  }

  if (entry.path === SELF_HASH_EXCEPTION.path) {
    assertSelfHashException(entry);
  } else {
    if (entry.evidence.content_sha256_status !== 'verified') {
      fail(`${entry.path} evidence must declare content_sha256_status=verified`);
    }

    if (!isSha256(entry.evidence.content_sha256)) {
      fail(`${entry.path} evidence must include a SHA-256 artifact hash`);
    }

    if (entry.evidence.content_sha256_exception !== null) {
      fail(`${entry.path} evidence content_sha256_exception must be null`);
    }

    const content = fs.readFileSync(buildArtifactPath(entry.path), 'utf8');
    const contentHash = sha256(content);

    if (entry.evidence.content_sha256 !== contentHash) {
      fail(`${entry.path} evidence hash does not match current built artifact`);
    }
  }

  if (entry.leak_count !== entry.findings.length) {
    fail(`${entry.path} leak_count must equal findings.length`);
  }

  if (entry.verdict === 'CLEAN' && entry.evidence.checks.some(check => check.status === 'fail')) {
    fail(`${entry.path} is CLEAN but has failed page-level evidence checks`);
  }
}

function assertArtifactVersions(audit) {
  const actual = audit.artifact_versions || {};
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(ARTIFACT_VERSIONS).sort();

  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    fail(
      `docs-page-release-audit.json artifact_versions keys must be ${expectedKeys.join(', ')}, ` +
      `got ${actualKeys.join(', ')}`
    );
  }

  for (const [name, expected] of Object.entries(ARTIFACT_VERSIONS)) {
    if (actual[name] !== expected) {
      fail(`docs-page-release-audit.json artifact_versions.${name} must be ${expected}, got ${actual[name]}`);
    }
  }
}

function assertEntryCategory(entry, category, label) {
  if (!entry.categories_observed.includes(category)) {
    fail(`${entry.path} must include ${label} evidence category ${category}`);
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

  if (audit.classifier !== CLASSIFIER_ID) {
    fail(`docs-page-release-audit.json classifier must be ${CLASSIFIER_ID}`);
  }

  assertArtifactVersions(audit);

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

    if (!Array.isArray(entry.findings)) {
      fail(`${entry.path} findings must be an array`);
    }

    assertEvidence(entry);

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
  const edgePaths = requiredEdgePaths();

  for (const routePath of stableDocsPaths) {
    assertIncludesPath(entriesByPath, routePath, 'stable default docs route');
    const entry = entriesByPath.get(routePath);

    if (routePath === '/docs/') {
      assertEntryCategory(entry, 'stable_docs_redirect', 'stable redirect');
    } else if (entry.source_file === 'src/pages/docs/platform-conformance.mdx') {
      assertEntryCategory(entry, 'stable_conformance_guardrail', 'stable conformance guardrail');
    } else {
      assertEntryCategory(entry, 'stable_docusaurus_version_meta', 'stable Docusaurus metadata');
    }
  }

  for (const routePath of prereleaseDocsPaths) {
    assertIncludesPath(entriesByPath, routePath, 'explicit 2.0 docs route');
    const entry = entriesByPath.get(routePath);

    if (entry.source_file.startsWith('generated:docs/2.0/tags')) {
      assertEntryCategory(entry, 'prerelease_generated_tag_route', 'prerelease generated tag route');
      assertEntryCategory(entry, 'prerelease_tag_navigation_label', 'prerelease generated tag navigation');
    } else {
      assertEntryCategory(entry, 'prerelease_docusaurus_version_meta', 'prerelease Docusaurus metadata');
      assertEntryCategory(entry, 'prerelease_unreleased_banner', 'prerelease banner');
    }
  }

  for (const routePath of edgePaths) {
    assertBuildArtifact(routePath);
    assertIncludesPath(entriesByPath, routePath, 'edge surface');
  }

  for (const routePath of ['/', '/docs/', '/llms.txt', '/llms-full.txt']) {
    const entry = entriesByPath.get(routePath);
    if (!entry.intended_release_status.includes('1_x')) {
      fail(`${routePath} must remain classified as a stable 1.x default surface`);
    }
  }

  for (const routePath of ['/llms.txt', '/llms-full.txt', '/llms-1.x.txt', '/llms-full-1.x.txt']) {
    assertEntryCategory(entriesByPath.get(routePath), 'canonical_llm_stable_source', 'stable LLM source');
  }

  for (const routePath of ['/llms-2.0.txt', '/llms-full-2.0.txt', '/2.0/llms-full.txt']) {
    assertEntryCategory(entriesByPath.get(routePath), 'prerelease_llm_manifest_label', 'prerelease LLM label');
  }

  for (const routePath of edgePaths.filter(routePath => routePath.startsWith('/platform-conformance/'))) {
    assertEntryCategory(entriesByPath.get(routePath), 'v2_public_conformance_schema', 'v2 conformance schema');
  }

  assertEntryCategory(
    entriesByPath.get('/platform-conformance-contract.json'),
    'v2_public_conformance_schema',
    'v2 conformance schema'
  );
  assertEntryCategory(
    entriesByPath.get('/docs-page-release-audit.json'),
    'audit_manifest_generated_schema',
    'audit manifest schema'
  );
  assertEntryCategory(
    entriesByPath.get('/docs-page-release-audit.json'),
    'audit_manifest_self_hash_exception',
    'audit manifest self-hash exception'
  );

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
    `${prereleaseDocsPaths.length} explicit 2.0 routes, and ${edgePaths.length} edge paths`
  );
}

main();
