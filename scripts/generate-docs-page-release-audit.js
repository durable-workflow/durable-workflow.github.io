#!/usr/bin/env node

const crypto = require('crypto');
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
const {
  readTrackedPublicComponentReleaseQualifications,
} = require('./generate-component-release-qualifications');
const {docsRevision} = require('./docs-narrative-audit-contract');
const {
  stablePlatformConformanceDiscoveryEntries,
} = require('./platform-conformance-public-discovery');
const {
  assertNoRepoLocalReferences,
  repositorySourceUrl,
} = require('./docs-audit-public-references');
const platformConformanceContract = require('../static/platform-conformance-contract.json');
const quickstartExecutionContract = require('../static/quickstart-execution-contract.json');

const repoRoot = path.join(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const sitemapPath = path.join(buildDir, 'sitemap.xml');
const outputPath = path.join(buildDir, 'docs-page-release-audit.json');
const quickstartExecutionContractPath = path.join(
  repoRoot,
  'static',
  'quickstart-execution-contract.json',
);
const quickstartExecutionContractBytes = fs.readFileSync(
  quickstartExecutionContractPath,
);

const SCHEMA = 'durable-workflow.docs.page-release-audit';
const SCHEMA_VERSION = 7;
const CLASSIFIER_ID = 'route-and-public-artifact-inventory-v7';
const STABLE_DOCS_VERSION = '1.x';
const PRERELEASE_DOCS_VERSION = '2.0';
const ARTIFACT_VERSION_SOURCE_PATH = 'scripts/published-artifact-versions.json';
const ARTIFACT_COMPATIBILITY_EVIDENCE_PATH =
  '/public-artifact-compatibility-evidence.json';
const COMPONENT_RELEASE_QUALIFICATIONS_PATH =
  '/public-component-release-qualifications.json';
const ARTIFACT_VERSION_SYNCHRONIZED_FIELDS = Object.freeze([
  'artifact_versions',
  'artifact_distribution_surfaces.sdk-php',
  'artifact_distribution_surfaces.sdk-python',
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
  COMPONENT_RELEASE_QUALIFICATIONS_PATH,
  '/platform-conformance-contract.json',
  '/platform-conformance/run-ledger.json',
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
const QUICKSTART_EVIDENCE_DIRECTORY = path.join(
  repoRoot,
  'static',
  'platform-conformance',
  'evidence',
);
const QUICKSTART_CONTRACT_URL =
  'https://durable-workflow.com/quickstart-execution-contract.json';
const QUICKSTART_EVIDENCE_BASE_URL =
  'https://durable-workflow.com/platform-conformance/evidence';
const QUICKSTART_CONTRACT_SCHEMA =
  'durable-workflow.docs.v2.quickstart-execution-contract';
const QUICKSTART_EVIDENCE_SCHEMA =
  'durable-workflow.v2.platform-conformance.run-evidence';
const QUICKSTART_COMPOSER_ARTIFACTS = [
  'sdk-php',
  'waterline',
  'workflow',
];
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

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

function buildComponentReleaseQualificationProjection(
  evidence = readTrackedPublicComponentReleaseQualifications(),
) {
  return {
    role: 'retained_component_release_qualifications',
    source_url: COMPONENT_RELEASE_QUALIFICATIONS_PATH,
    ...evidence,
  };
}

function quickstartContractArtifactTuple(contract, versions) {
  const artifacts = contract?.artifacts;
  const expectedNames = Object.keys(versions).sort();
  if (
    !artifacts
    || typeof artifacts !== 'object'
    || Array.isArray(artifacts)
    || JSON.stringify(Object.keys(artifacts).sort()) !== JSON.stringify(expectedNames)
  ) {
    throw new Error('quickstart execution contract must bind the complete artifact tuple');
  }

  return Object.fromEntries(expectedNames.map(name => {
    const version = artifacts[name]?.version;
    if (typeof version !== 'string' || version.length === 0) {
      throw new Error(`quickstart execution contract has no ${name} version`);
    }
    return [name, version];
  }));
}

function exactObjectKeys(value, expectedKeys) {
  return (
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort())
      === JSON.stringify([...expectedKeys].sort())
  );
}

function exactVersionTuple(tuple, versions) {
  return (
    exactObjectKeys(tuple, Object.keys(versions))
    && Object.entries(versions).every(([name, version]) => tuple[name] === version)
  );
}

function quickstartContractIdentity(contract, contractBytes) {
  if (!Buffer.isBuffer(contractBytes) && typeof contractBytes !== 'string') {
    throw new Error('quickstart execution contract identity requires the exact contract bytes');
  }

  let parsedContract;
  try {
    parsedContract = JSON.parse(contractBytes.toString());
  } catch {
    throw new Error('quickstart execution contract bytes must contain valid JSON');
  }
  if (JSON.stringify(parsedContract) !== JSON.stringify(contract)) {
    throw new Error('quickstart execution contract bytes do not match the parsed contract');
  }
  if (
    contract?.schema !== QUICKSTART_CONTRACT_SCHEMA
    || !Number.isInteger(contract.version)
    || contract.version < 1
    || contract.contract_url !== QUICKSTART_CONTRACT_URL
  ) {
    throw new Error('quickstart execution contract has an invalid public identity');
  }

  return {
    schema: contract.schema,
    version: contract.version,
    url: contract.contract_url,
    sha256: crypto.createHash('sha256').update(contractBytes).digest('hex'),
  };
}

function exactContractIdentity(identity, expectedIdentity) {
  return (
    expectedIdentity
    && exactObjectKeys(identity, ['schema', 'version', 'url', 'sha256'])
    && identity.schema === expectedIdentity.schema
    && identity.version === expectedIdentity.version
    && identity.url === expectedIdentity.url
    && SHA256_PATTERN.test(identity.sha256)
    && identity.sha256 === expectedIdentity.sha256
  );
}

function allQuickstartScenariosPassed(results, requiredScenarios) {
  return (
    Array.isArray(results)
    && results.length === requiredScenarios.length
    && results.every((result, index) => (
      exactObjectKeys(result, ['id', 'outcome'])
      && result.id === requiredScenarios[index]
      && result.outcome === 'pass'
    ))
  );
}

function exactComposerGraphPassed(result, executionTuple) {
  const expectedComposerTuple = Object.fromEntries(
    QUICKSTART_COMPOSER_ARTIFACTS.map(name => [name, executionTuple[name]]),
  );
  return (
    exactObjectKeys(result, [
      'outcome',
      'artifact_tuple',
      'manifest_sha256',
      'install_output_sha256',
      'package_discovery',
      'package_discovery_output_sha256',
      'laravel_boot',
    ])
    && result.outcome === 'pass'
    && exactVersionTuple(result.artifact_tuple, expectedComposerTuple)
    && SHA256_PATTERN.test(result.manifest_sha256)
    && SHA256_PATTERN.test(result.install_output_sha256)
    && result.package_discovery === 'pass'
    && SHA256_PATTERN.test(result.package_discovery_output_sha256)
    && result.laravel_boot === 'pass'
  );
}

function quickstartQualificationFromEvidence(
  contract,
  versions,
  evidenceRecords,
  contractBytes,
) {
  const scenarios = Array.isArray(contract?.scenarios)
    ? contract.scenarios.map(scenario => scenario?.id)
    : [];
  const requiredScenarios = [
    'php_user_local_server_completion',
    'python_user_local_server_completion',
    'rust_user_local_server_completion',
    'operator_local_server_observation',
    'laravel_user_embedded_completion',
  ];
  const contractArtifactVersions = quickstartContractArtifactTuple(contract, versions);
  const contractIdentity = contractBytes === undefined
    ? null
    : quickstartContractIdentity(contract, contractBytes);
  const contractMatchesPublishedTuple = exactVersionTuple(
    contractArtifactVersions,
    versions,
  );
  if (
    contract?.schema !== QUICKSTART_CONTRACT_SCHEMA
    || JSON.stringify(scenarios) !== JSON.stringify(requiredScenarios)
  ) {
    throw new Error('quickstart execution contract must declare the exact five release scenarios');
  }

  const matching = evidenceRecords
    .filter(evidence => (
      evidence?.schema === QUICKSTART_EVIDENCE_SCHEMA
      && evidence.schema_version === 1
      && evidence.experiment === 'quickstart'
      && evidence.evidence_kind === 'executed_run'
      && evidence.outcome === 'pass'
      && evidence.runner_blocked === false
      && contractMatchesPublishedTuple
      && exactVersionTuple(evidence.artifact_tuple, versions)
      && exactVersionTuple(evidence.artifact_tuple, contractArtifactVersions)
      && exactContractIdentity(
        evidence.qualification?.contract_identity,
        contractIdentity,
      )
      && allQuickstartScenariosPassed(
        evidence.qualification?.scenario_results,
        requiredScenarios,
      )
      && exactComposerGraphPassed(
        evidence.qualification?.exact_composer_graph,
        evidence.artifact_tuple,
      )
      && typeof evidence.id === 'string'
      && /^[a-z0-9][a-z0-9._-]+$/.test(evidence.id)
      && typeof evidence.finished_at === 'string'
    ))
    .sort((left, right) => right.finished_at.localeCompare(left.finished_at));
  const selected = matching[0] || null;

  return {
    role: 'five_scenario_exact_current',
    outcome: selected ? 'pass' : 'incomplete',
    contract_url: QUICKSTART_CONTRACT_URL,
    artifact_versions: versions,
    contract_identity: contractIdentity,
    contract_artifact_versions: contractArtifactVersions,
    execution_artifact_versions: selected ? selected.artifact_tuple : null,
    required_scenarios: requiredScenarios,
    evidence: selected ? {
      id: selected.id,
      url: `${QUICKSTART_EVIDENCE_BASE_URL}/${selected.id}.json`,
      outcome: selected.outcome,
      runner_blocked: selected.runner_blocked,
      finished_at: selected.finished_at,
      artifact_tuple: selected.artifact_tuple,
      qualification: selected.qualification,
    } : null,
  };
}

function buildQuickstartQualification() {
  const evidenceRecords = fs.readdirSync(QUICKSTART_EVIDENCE_DIRECTORY)
    .filter(filename => filename.endsWith('.json'))
    .map(filename => JSON.parse(fs.readFileSync(
      path.join(QUICKSTART_EVIDENCE_DIRECTORY, filename),
      'utf8',
    )));
  return quickstartQualificationFromEvidence(
    quickstartExecutionContract,
    PUBLISHED_ARTIFACT_VERSIONS,
    evidenceRecords,
    quickstartExecutionContractBytes,
  );
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
    component_release_qualifications: buildComponentReleaseQualificationProjection(),
    quickstart_qualification: buildQuickstartQualification(),
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
  COMPONENT_RELEASE_QUALIFICATIONS_PATH,
  ARTIFACT_VERSION_SOURCE_PATH,
  ARTIFACT_VERSION_SYNCHRONIZED_FIELDS,
  CLASSIFIER_ID,
  SCHEMA,
  SCHEMA_VERSION,
  STABLE_DOCS_VERSION,
  PRERELEASE_DOCS_VERSION,
  buildArtifactCompatibilityProjection,
  buildArtifactVersionProjection,
  buildComponentReleaseQualificationProjection,
  buildQuickstartQualification,
  buildRelativePath,
  inventoryPaths,
  quickstartContractIdentity,
  quickstartQualificationFromEvidence,
  quickstartContractArtifactTuple,
  routeKind,
};
