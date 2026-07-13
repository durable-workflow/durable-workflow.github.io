#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const config = require('../docusaurus.config.js');
const {docsRevision} = require('./docs-narrative-audit-contract');
const {
  ARTIFACT_DISTRIBUTION_SURFACES,
  ARTIFACT_VERSION_SCHEMA,
  ARTIFACT_VERSIONS,
} = require('./public-artifact-versions');
const {
  ARTIFACT_VERSION_SOURCE_FILE,
  ARTIFACT_VERSION_SYNCHRONIZED_FIELDS,
  CLASSIFIER_ID,
  PRERELEASE_DOCS_VERSION,
  SCHEMA,
  SCHEMA_VERSION,
  STABLE_DOCS_VERSION,
  buildRelativePath,
  inventoryPaths,
  routeKind,
} = require('./generate-docs-page-release-audit');

const repoRoot = path.join(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const auditPath = path.join(buildDir, 'docs-page-release-audit.json');
const REPO_LOCAL_ARTIFACT_METADATA_PATH_PATTERN = new RegExp([
  String.raw`^\.{1,2}[\\/]`,
  String.raw`^[\\/]`,
  String.raw`^[A-Za-z]:[\\/]`,
  String.raw`^(?:\.github|blog|build|docs|generated|scripts|src|static)[\\/]`,
  String.raw`^(?:[^:\\/]+[\\/])+[^\\/]+\.(?:cjs|js|json|jsx|md|mdx|mjs|ps1|sh|ts|tsx|ya?ml)(?:$|[?#])`,
  String.raw`^[^\\/]+\.(?:cjs|js|json|jsx|md|mdx|mjs|ps1|sh|ts|tsx|ya?ml)(?:$|[?#])`,
].join('|'), 'i');

function fail(message) {
  throw new Error(message);
}

function readAudit() {
  if (!fs.existsSync(auditPath)) {
    fail('Missing generated audit manifest: build/docs-page-release-audit.json');
  }
  return JSON.parse(fs.readFileSync(auditPath, 'utf8'));
}

function getDocsConfig() {
  const preset = Array.isArray(config.presets)
    ? config.presets.find(entry => Array.isArray(entry) && entry[0] === 'classic')
    : null;
  return preset?.[1]?.docs || {};
}

function assertArtifactVersions(audit) {
  if (JSON.stringify(audit.artifact_versions) !== JSON.stringify(ARTIFACT_VERSIONS)) {
    fail('docs-page-release-audit.json artifact_versions must match the public artifact authority');
  }
  if (JSON.stringify(audit.artifact_distribution_surfaces) !== JSON.stringify(ARTIFACT_DISTRIBUTION_SURFACES)) {
    fail('docs-page-release-audit.json artifact distribution surfaces must match the public artifact authority');
  }

  const source = audit.artifact_version_source || {};
  if (source.schema !== ARTIFACT_VERSION_SCHEMA) {
    fail('docs-page-release-audit.json artifact version source schema is invalid');
  }
  if (source.source_file !== ARTIFACT_VERSION_SOURCE_FILE) {
    fail('docs-page-release-audit.json artifact version source file is invalid');
  }
  if (JSON.stringify(source.synchronized_fields) !== JSON.stringify(ARTIFACT_VERSION_SYNCHRONIZED_FIELDS)) {
    fail('docs-page-release-audit.json synchronized artifact fields are invalid');
  }
  if (source.current_server_artifact?.version !== ARTIFACT_VERSIONS.server) {
    fail('docs-page-release-audit.json current server artifact version is stale');
  }
}

function isUrlShapedValue(value) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function assertNoRepoLocalArtifactMetadata(value, label) {
  if (typeof value === 'string') {
    if (!isUrlShapedValue(value) && REPO_LOCAL_ARTIFACT_METADATA_PATH_PATTERN.test(value)) {
      fail(`${label} exposes repo-local verifier or implementation path ${JSON.stringify(value)}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRepoLocalArtifactMetadata(item, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      assertNoRepoLocalArtifactMetadata(nested, `${label}.${key}`);
    }
  }
}

function main() {
  const audit = readAudit();
  const docsConfig = getDocsConfig();

  if (audit.schema !== SCHEMA || audit.schema_version !== SCHEMA_VERSION) {
    fail('docs-page-release-audit.json schema is invalid');
  }
  if (audit.classifier !== CLASSIFIER_ID) {
    fail('docs-page-release-audit.json classifier is invalid');
  }
  if (audit.docs_revision !== docsRevision(repoRoot)) {
    fail('docs-page-release-audit.json docs revision does not match the build');
  }
  if (docsConfig.lastVersion !== STABLE_DOCS_VERSION) {
    fail(`docusaurus.config.js lastVersion must remain ${STABLE_DOCS_VERSION}`);
  }
  if (docsConfig.versions?.[STABLE_DOCS_VERSION]?.path !== '') {
    fail(`${STABLE_DOCS_VERSION} must remain the unversioned docs path`);
  }
  if (docsConfig.versions?.current?.path !== PRERELEASE_DOCS_VERSION) {
    fail(`current docs must remain under ${PRERELEASE_DOCS_VERSION}`);
  }
  if (audit.release_status_guardrail?.stable_default_docs_version !== STABLE_DOCS_VERSION) {
    fail('release audit stable default docs version is invalid');
  }
  if (audit.release_status_guardrail?.explicit_prerelease_docs_version !== PRERELEASE_DOCS_VERSION) {
    fail('release audit explicit prerelease docs version is invalid');
  }

  assertArtifactVersions(audit);
  assertNoRepoLocalArtifactMetadata(
    audit.artifact_distribution_surfaces,
    'docs-page-release-audit.json artifact_distribution_surfaces',
  );

  const inventory = Array.isArray(audit.page_inventory) ? audit.page_inventory : [];
  const byPath = new Map();
  for (const entry of inventory) {
    if (!entry?.path || byPath.has(entry.path)) {
      fail(`docs-page-release-audit.json has a missing or duplicate inventory path: ${entry?.path}`);
    }
    if (entry.route_kind !== routeKind(entry.path)) {
      fail(`${entry.path} has an invalid structural route classification`);
    }
    if (entry.build_artifact !== `build/${buildRelativePath(entry.path)}`) {
      fail(`${entry.path} has an invalid build artifact path`);
    }
    if (!fs.existsSync(path.join(repoRoot, entry.build_artifact))) {
      fail(`${entry.path} is missing built artifact ${entry.build_artifact}`);
    }
    if (entry.route_kind === 'stable_default_docs' && entry.docusaurus_version === 'current') {
      fail(`${entry.path} leaks the current prerelease docs version onto the stable route`);
    }
    const generatedTagRoute = entry.path.startsWith('/docs/2.0/tags/');
    if (
      entry.route_kind === 'explicit_prerelease_2_0_docs' &&
      entry.docusaurus_version !== 'current' &&
      !(generatedTagRoute && entry.docusaurus_version === null)
    ) {
      fail(`${entry.path} is not built from the explicit current prerelease docs version`);
    }
    byPath.set(entry.path, entry);
  }

  const expectedPaths = inventoryPaths();
  const actualPaths = [...byPath.keys()].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    fail('docs-page-release-audit.json route inventory does not match the build and sitemap');
  }

  const stableDocsCount = inventory.filter(entry => entry.route_kind === 'stable_default_docs').length;
  const prereleaseDocsCount = inventory
    .filter(entry => entry.route_kind === 'explicit_prerelease_2_0_docs').length;
  if (audit.summary?.stable_default_docs_pages !== stableDocsCount) {
    fail('release audit stable docs count is invalid');
  }
  if (audit.summary?.explicit_prerelease_2_0_pages !== prereleaseDocsCount) {
    fail('release audit explicit prerelease docs count is invalid');
  }
  if (audit.summary?.inventoried_routes !== inventory.length) {
    fail('release audit inventoried route count is invalid');
  }

  const serialized = JSON.stringify(audit.page_inventory);
  for (const forbidden of ['source_sha256', 'content_sha256', 'verdict', 'findings']) {
    if (serialized.includes(forbidden)) {
      fail(`route inventory must not publish self-attested ${forbidden} fields`);
    }
  }

  console.log(
    `Docs page release inventory checks passed for ${stableDocsCount} stable docs routes, ` +
    `${prereleaseDocsCount} explicit 2.0 routes, and ${inventory.length} total routes`,
  );
}

main();
