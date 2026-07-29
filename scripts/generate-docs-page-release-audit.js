#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  ARTIFACT_VERSIONS,
  PUBLISHED_ARTIFACT_VERSIONS,
  PUBLISHED_ARTIFACT_VERSION_SCHEMA,
  buildArtifactDistributionSurfaces,
} = require('./public-artifact-versions');
const {
  artifactCompatibilityEvidenceSource,
  readArtifactCompatibilityEvidence,
} = require('./public-artifact-compatibility');
const {docsRevision} = require('./docs-narrative-audit-contract');
const {
  stablePlatformConformanceDiscoveryEntries,
} = require('./platform-conformance-public-discovery');
const {
  assertNoRepoLocalReferences,
  repositorySourceUrl,
} = require('./docs-audit-public-references');
const platformConformanceContract = require('../static/platform-conformance-contract.json');

const repoRoot = path.join(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const sitemapPath = path.join(buildDir, 'sitemap.xml');
const outputPath = path.join(buildDir, 'docs-page-release-audit.json');

const SCHEMA = 'durable-workflow.docs.page-release-audit';
const SCHEMA_VERSION = 5;
const CLASSIFIER_ID = 'route-and-public-artifact-inventory-v5';
const STABLE_DOCS_VERSION = '1.x';
const PRERELEASE_DOCS_VERSION = '2.0';
const ARTIFACT_VERSION_SOURCE_PATH = 'scripts/published-artifact-versions.json';
const ARTIFACT_COMPATIBILITY_EVIDENCE_PATH =
  '/public-artifact-compatibility-evidence.json';
const ARTIFACT_VERSION_SYNCHRONIZED_FIELDS = Object.freeze([
  'artifact_versions',
  'artifact_distribution_surfaces.sdk-php',
  'artifact_distribution_surfaces.server',
  'artifact_distribution_surfaces.sdk-rust',
  'artifact_distribution_surfaces.waterline',
]);
const GENERATED_TEXT_ARTIFACTS = [
  '/llms.txt',
  '/llms-full.txt',
  '/llms-1.x.txt',
  '/llms-full-1.x.txt',
  '/llms-2.0.txt',
  '/llms-full-2.0.txt',
  '/2.0/llms-full.txt',
];
const GENERATED_AUDIT_ARTIFACTS = [
  '/docs-page-release-audit.json',
  '/docs-narrative-audit.json',
];
const PUBLIC_CONTRACT_ARTIFACTS = [
  '/quickstart-execution-contract.json',
  ARTIFACT_COMPATIBILITY_EVIDENCE_PATH,
  '/platform-conformance-contract.json',
  '/platform-conformance/workflow-lifecycle-scenarios.json',
];
const REQUIRED_ROUTE_ARTIFACTS = [
  '/',
  '/docs/',
  '/docs/platform-conformance/',
  '/docs/2.0/quickstart/',
  '/docs/2.0/polyglot/php/',
  '/docs/2.0/polyglot/python/',
  '/docs/2.0/polyglot/server/',
  '/docs/2.0/polyglot/cli/',
];

function readSitemapPaths() {
  if (!fs.existsSync(sitemapPath)) {
    throw new Error('Missing generated sitemap: build/sitemap.xml');
  }

  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  return [...new Set(
    [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname),
  )].sort();
}

function buildRelativePath(routePath) {
  if (routePath === '/') {
    return 'index.html';
  }
  const cleanPath = routePath.replace(/^\/+/, '');
  return routePath.endsWith('/') ? path.posix.join(cleanPath, 'index.html') : cleanPath;
}

function routeKind(routePath) {
  if (routePath.startsWith('/docs/2.0/')) {
    return 'explicit_prerelease_2_0_docs';
  }
  if (routePath.startsWith('/docs/')) {
    return 'stable_default_docs';
  }
  if (['/llms.txt', '/llms-full.txt', '/llms-1.x.txt', '/llms-full-1.x.txt'].includes(routePath)) {
    return 'stable_default_llm';
  }
  if (['/llms-2.0.txt', '/llms-full-2.0.txt', '/2.0/llms-full.txt'].includes(routePath)) {
    return 'explicit_prerelease_2_0_llm';
  }
  if (routePath === '/') {
    return 'homepage';
  }
  return 'public_artifact';
}

function docusaurusVersion(artifactPath) {
  if (!artifactPath.endsWith('.html') || !fs.existsSync(artifactPath)) {
    return null;
  }
  const html = fs.readFileSync(artifactPath, 'utf8');
  const match = html.match(/<meta[^>]+name="docusaurus_version"[^>]+content="([^"]+)"[^>]*>/);
  return match ? match[1] : null;
}

function inventoryPaths() {
  const scenarioPaths = stablePlatformConformanceDiscoveryEntries(platformConformanceContract)
    .map(entry => entry.path);
  return [...new Set([
    ...readSitemapPaths(),
    ...GENERATED_TEXT_ARTIFACTS,
    ...GENERATED_AUDIT_ARTIFACTS,
    ...PUBLIC_CONTRACT_ARTIFACTS,
    ...REQUIRED_ROUTE_ARTIFACTS,
    ...scenarioPaths,
  ])].sort();
}

function inventoryEntry(routePath) {
  const buildPath = buildRelativePath(routePath);
  const absolutePath = path.join(buildDir, buildPath);
  const generatedLater = GENERATED_AUDIT_ARTIFACTS.includes(routePath);

  if (!generatedLater && !fs.existsSync(absolutePath)) {
    throw new Error(`Missing built artifact for route inventory: build/${buildPath}`);
  }

  return {
    path: routePath,
    route_kind: routeKind(routePath),
    artifact_route: routePath,
    docusaurus_version: docusaurusVersion(absolutePath),
  };
}

function artifactVersionSourceMetadata(versions, distributionSurfaces, revision) {
  return {
    schema: PUBLISHED_ARTIFACT_VERSION_SCHEMA,
    role: 'current_published_component_artifacts',
    source_url: repositorySourceUrl(ARTIFACT_VERSION_SOURCE_PATH, revision),
    synchronized_fields: ARTIFACT_VERSION_SYNCHRONIZED_FIELDS,
    current_server_artifact: {
      version: versions.server,
      references: distributionSurfaces.server.map(surface => surface.reference),
    },
    current_waterline_artifact: {
      version: versions.waterline,
      references: distributionSurfaces.waterline.map(surface => (
        surface.reference || surface.url
      )),
    },
  };
}

function buildArtifactVersionProjection(
  versions = PUBLISHED_ARTIFACT_VERSIONS,
  revision = docsRevision(repoRoot),
) {
  const distributionSurfaces = buildArtifactDistributionSurfaces(versions);

  return {
    artifact_versions: versions,
    artifact_version_source: artifactVersionSourceMetadata(
      versions,
      distributionSurfaces,
      revision,
    ),
    artifact_distribution_surfaces: distributionSurfaces,
  };
}

function buildArtifactCompatibilityProjection(
  evidence = artifactCompatibilityEvidenceSource,
  versions = ARTIFACT_VERSIONS,
) {
  const qualification = readArtifactCompatibilityEvidence(evidence, versions);
  const releasePlan = qualification.authority.releasePlan;
  const sdkServerQualification = qualification.authority.sdkServerQualification;
  const conformanceEvidence = sdkServerQualification.evidence;

  return {
    role: 'qualified_aggregate_recommendation',
    source_url: ARTIFACT_COMPATIBILITY_EVIDENCE_PATH,
    schema: evidence.schema,
    schema_version: evidence.schema_version,
    outcome: evidence.outcome,
    qualified_artifact_versions: qualification.artifactVersions,
    release_plan: {
      tag: releasePlan.tag,
      sha256: releasePlan.sha256,
    },
    sdk_server_qualification: {
      source_url: sdkServerQualification.source_url,
      sha256: sdkServerQualification.sha256,
      evidence_source: conformanceEvidence.source_url,
      evidence_sha256: conformanceEvidence.sha256,
      outcome: conformanceEvidence.outcome,
    },
  };
}

function main() {
  const revision = docsRevision(repoRoot);
  const pageInventory = inventoryPaths().map(inventoryEntry);
  const stableDocsCount = pageInventory
    .filter(entry => entry.route_kind === 'stable_default_docs').length;
  const prereleaseDocsCount = pageInventory
    .filter(entry => entry.route_kind === 'explicit_prerelease_2_0_docs').length;

  const manifest = {
    schema: SCHEMA,
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    generated_from: 'production sitemap and build artifact inventory',
    classifier: CLASSIFIER_ID,
    docs_revision: revision,
    ...buildArtifactVersionProjection(PUBLISHED_ARTIFACT_VERSIONS, revision),
    artifact_compatibility_evidence: buildArtifactCompatibilityProjection(),
    release_status_guardrail: {
      stable_default_docs_version: STABLE_DOCS_VERSION,
      explicit_prerelease_docs_version: PRERELEASE_DOCS_VERSION,
    },
    summary: {
      stable_default_docs_pages: stableDocsCount,
      explicit_prerelease_2_0_pages: prereleaseDocsCount,
      inventoried_routes: pageInventory.length,
    },
    page_inventory: pageInventory,
  };

  assertNoRepoLocalReferences(manifest, 'docs-page-release-audit.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(
    `Docs route inventory generated: ${stableDocsCount} stable docs, ` +
    `${prereleaseDocsCount} explicit 2.0 docs, ${pageInventory.length} total routes`,
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  ARTIFACT_COMPATIBILITY_EVIDENCE_PATH,
  ARTIFACT_VERSION_SOURCE_PATH,
  ARTIFACT_VERSION_SYNCHRONIZED_FIELDS,
  CLASSIFIER_ID,
  SCHEMA,
  SCHEMA_VERSION,
  STABLE_DOCS_VERSION,
  PRERELEASE_DOCS_VERSION,
  buildArtifactCompatibilityProjection,
  buildArtifactVersionProjection,
  buildRelativePath,
  inventoryPaths,
  routeKind,
};
