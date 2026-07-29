#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const config = require('../docusaurus.config.js');
const {docsRevision} = require('./docs-narrative-audit-contract');
const {
  ARTIFACT_DISTRIBUTION_SURFACES,
  PUBLISHED_ARTIFACT_VERSIONS,
  PUBLISHED_ARTIFACT_VERSION_SCHEMA,
} = require('./public-artifact-versions');
const {
  ARTIFACT_VERSION_SOURCE_PATH,
  ARTIFACT_VERSION_SYNCHRONIZED_FIELDS,
  CLASSIFIER_ID,
  PRERELEASE_DOCS_VERSION,
  SCHEMA,
  SCHEMA_VERSION,
  STABLE_DOCS_VERSION,
  buildArtifactCompatibilityProjection,
  buildRelativePath,
  inventoryPaths,
  routeKind,
} = require('./generate-docs-page-release-audit');
const {
  assertNoRepoLocalReferences,
  assertPublicReference,
  repositorySourceUrl,
} = require('./docs-audit-public-references');

const repoRoot = path.join(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const auditPath = path.join(buildDir, 'docs-page-release-audit.json');

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
  if (
    JSON.stringify(audit.artifact_versions)
    !== JSON.stringify(PUBLISHED_ARTIFACT_VERSIONS)
  ) {
    fail(
      'docs-page-release-audit.json artifact_versions must match the current ' +
        'published-component authority',
    );
  }
  if (JSON.stringify(audit.artifact_distribution_surfaces) !== JSON.stringify(ARTIFACT_DISTRIBUTION_SURFACES)) {
    fail('docs-page-release-audit.json artifact distribution surfaces must match the public artifact authority');
  }

  const source = audit.artifact_version_source || {};
  if (source.schema !== PUBLISHED_ARTIFACT_VERSION_SCHEMA) {
    fail('docs-page-release-audit.json artifact version source schema is invalid');
  }
  if (source.role !== 'current_published_component_artifacts') {
    fail('docs-page-release-audit.json artifact version source role is invalid');
  }
  if (source.source_url !== repositorySourceUrl(ARTIFACT_VERSION_SOURCE_PATH, audit.docs_revision)) {
    fail('docs-page-release-audit.json artifact version source URL is invalid');
  }
  if (JSON.stringify(source.synchronized_fields) !== JSON.stringify(ARTIFACT_VERSION_SYNCHRONIZED_FIELDS)) {
    fail('docs-page-release-audit.json synchronized artifact fields are invalid');
  }
  if (source.current_server_artifact?.version !== PUBLISHED_ARTIFACT_VERSIONS.server) {
    fail('docs-page-release-audit.json current server artifact version is stale');
  }
  if (
    source.current_waterline_artifact?.version
    !== PUBLISHED_ARTIFACT_VERSIONS.waterline
  ) {
    fail('docs-page-release-audit.json current Waterline artifact version is stale');
  }
  if (
    audit.artifact_compatibility_evidence?.role
    !== 'qualified_aggregate_recommendation'
  ) {
    fail('docs-page-release-audit.json compatibility evidence role is invalid');
  }
  if (
    JSON.stringify(audit.artifact_compatibility_evidence)
    !== JSON.stringify(buildArtifactCompatibilityProjection())
  ) {
    fail(
      'docs-page-release-audit.json compatibility qualification must match the ' +
        'exact public evidence authority',
    );
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
  assertNoRepoLocalReferences(audit, 'docs-page-release-audit.json');

  const inventory = Array.isArray(audit.page_inventory) ? audit.page_inventory : [];
  const byPath = new Map();
  for (const entry of inventory) {
    if (!entry?.path || byPath.has(entry.path)) {
      fail(`docs-page-release-audit.json has a missing or duplicate inventory path: ${entry?.path}`);
    }
    if (entry.route_kind !== routeKind(entry.path)) {
      fail(`${entry.path} has an invalid structural route classification`);
    }
    if (entry.artifact_route !== entry.path) {
      fail(`${entry.path} has an invalid public artifact route`);
    }
    assertPublicReference(entry.artifact_route, `${entry.path} artifact_route`);
    const builtArtifact = path.join(buildDir, buildRelativePath(entry.path));
    if (!fs.existsSync(builtArtifact)) {
      fail(`${entry.path} is missing its built artifact`);
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
