#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const config = require('../docusaurus.config.js');
const {
  ARTIFACT_DISTRIBUTION_SURFACES,
  ARTIFACT_PIN_PATTERNS,
  ARTIFACT_VERSION_SCHEMA,
  ARTIFACT_VERSIONS,
  replaceArtifactTokens,
} = require('./public-artifact-versions');

const repoRoot = path.join(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const sitemapPath = path.join(buildDir, 'sitemap.xml');
const outputPath = path.join(buildDir, 'docs-page-release-audit.json');

const SCHEMA = 'durable-workflow.docs.page-release-audit';
const SCHEMA_VERSION = 1;
const STABLE_DOCS_VERSION = '1.x';
const PRERELEASE_DOCS_VERSION = '2.0';
const STABLE_DOCS_ROOT = '/docs/introduction/';
const SITE_URL = String(config.url || 'https://durable-workflow.com').replace(/\/+$/, '');
const VERDICTS = ['CLEAN', 'LEAK', 'MIXED'];
const CLASSIFIER_ID = 'content-derived-release-status-v2';
const ARTIFACT_VERSION_SOURCE_FILE = 'scripts/public-artifact-versions.json';
const ARTIFACT_VERSION_SYNCHRONIZED_FIELDS = Object.freeze([
  'artifact_versions',
  'artifact_distribution_surfaces.server',
]);
const SELF_HASH_EXCEPTION = {
  code: 'SELF_REFERENTIAL_MANIFEST',
  applies_to: 'evidence.content_sha256',
  algorithm: 'sha256',
  reason: 'The audit manifest cannot embed the SHA-256 of its final bytes because that value would change the bytes being hashed.',
};

const EDGE_SURFACES = [
  {
    path: '/',
    source_file: 'src/pages/index.js',
    intended_release_status: 'stable_1_x_default_with_explicit_2_0_prerelease_pointer',
    edge_surface: 'homepage',
    note: 'Homepage primary action targets stable 1.x docs; the 2.0 quickstart link is explicitly labeled prerelease.',
  },
  {
    path: '/docs/',
    source_file: 'docusaurus.config.js',
    intended_release_status: 'released_1_x',
    edge_surface: 'docs_navigation',
    note: 'Primary Docs navigation and /docs redirect resolve to the stable 1.x introduction.',
  },
  {
    path: '/docs/',
    source_file: 'docusaurus.config.js',
    intended_release_status: 'released_1_x',
    edge_surface: 'version_switcher',
    note: 'The version dropdown labels current docs as 2.0 prerelease while lastVersion keeps 1.x on the default route.',
  },
  {
    path: '/llms.txt',
    source_file: 'scripts/generate-llms.js',
    intended_release_status: 'released_1_x',
    edge_surface: 'llm_manifest',
    note: 'Canonical LLM index follows the stable default docs line.',
  },
  {
    path: '/llms-full.txt',
    source_file: 'scripts/generate-llms-full.js',
    intended_release_status: 'released_1_x',
    edge_surface: 'llm_manifest',
    note: 'Canonical full LLM bundle follows the stable default docs line.',
  },
  {
    path: '/llms-1.x.txt',
    source_file: 'scripts/generate-llms.js',
    intended_release_status: 'released_1_x',
    edge_surface: 'llm_manifest',
    note: 'Version-pinned stable LLM index is equivalent to canonical while 1.x is the active public line.',
  },
  {
    path: '/llms-full-1.x.txt',
    source_file: 'scripts/generate-llms-full.js',
    intended_release_status: 'released_1_x',
    edge_surface: 'llm_manifest',
    note: 'Version-pinned stable full LLM bundle is equivalent to canonical while 1.x is the active public line.',
  },
  {
    path: '/llms-2.0.txt',
    source_file: 'scripts/generate-llms.js',
    intended_release_status: 'prerelease_2_0',
    edge_surface: 'llm_manifest',
    note: 'Version-pinned 2.0 LLM index includes prerelease and non-default release-status language.',
  },
  {
    path: '/llms-full-2.0.txt',
    source_file: 'scripts/generate-llms-full.js',
    intended_release_status: 'prerelease_2_0',
    edge_surface: 'llm_manifest',
    note: 'Version-pinned 2.0 full LLM bundle includes prerelease and non-default release-status language.',
  },
  {
    path: '/2.0/llms-full.txt',
    source_file: 'scripts/generate-llms-full.js',
    intended_release_status: 'prerelease_2_0',
    edge_surface: 'llm_manifest',
    note: 'Version-scoped 2.0 full LLM bundle is an explicit prerelease alias.',
  },
  {
    path: '/docs/platform-conformance/',
    source_file: 'src/pages/docs/platform-conformance.mdx',
    intended_release_status: 'released_1_x_default_with_explicit_2_0_prerelease_pointer',
    edge_surface: 'public_conformance_page',
    note: 'Default conformance discovery page states that /docs remains stable 1.x and links explicit 2.0 prerelease authority.',
  },
  {
    path: '/docs/2.0/platform-conformance/',
    source_file: 'docs/platform-conformance.md',
    intended_release_status: 'prerelease_2_0',
    edge_surface: 'public_conformance_page',
    note: '2.0 conformance authority is served only on the explicit prerelease docs path.',
  },
  {
    path: '/docs/2.0/docs-page-release-audit/',
    source_file: 'docs/docs-page-release-audit.md',
    intended_release_status: 'prerelease_2_0',
    edge_surface: 'public_conformance_page',
    note: 'The audit explanation page is itself versioned under the explicit 2.0 prerelease docs path.',
  },
  {
    path: '/docs-page-release-audit.json',
    source_file: 'scripts/generate-docs-page-release-audit.js',
    intended_release_status: 'stable_1_x_default_and_prerelease_2_0_evidence',
    edge_surface: 'public_conformance_manifest',
    note: 'Machine-readable page-level verdict set for the stable default and explicit prerelease docs surfaces.',
  },
  {
    path: '/platform-conformance-contract.json',
    source_file: 'static/platform-conformance-contract.json',
    intended_release_status: 'prerelease_2_0_contract_manifest',
    edge_surface: 'public_conformance_manifest',
    note: 'Public platform conformance manifest is a versioned v2 contract and does not promote /docs to 2.0.',
  },
  {
    path: '/platform-conformance/signal-query-runtime-scenarios.json',
    source_file: 'static/platform-conformance/signal-query-runtime-scenarios.json',
    intended_release_status: 'prerelease_2_0_contract_manifest',
    edge_surface: 'public_conformance_manifest',
    note: 'Runtime scenario manifest is explicitly tied to the v2 platform conformance contract.',
  },
  {
    path: '/platform-conformance/search-attribute-runtime-scenarios.json',
    source_file: 'static/platform-conformance/search-attribute-runtime-scenarios.json',
    intended_release_status: 'prerelease_2_0_contract_manifest',
    edge_surface: 'public_conformance_manifest',
    note: 'Runtime scenario manifest is explicitly tied to the v2 platform conformance contract.',
  },
  {
    path: '/platform-conformance/replay-runtime-scenarios.json',
    source_file: 'static/platform-conformance/replay-runtime-scenarios.json',
    intended_release_status: 'prerelease_2_0_contract_manifest',
    edge_surface: 'public_conformance_manifest',
    note: 'Runtime scenario manifest is explicitly tied to the v2 platform conformance contract.',
  },
  {
    path: '/platform-conformance/namespace-runtime-scenarios.json',
    source_file: 'static/platform-conformance/namespace-runtime-scenarios.json',
    intended_release_status: 'prerelease_2_0_contract_manifest',
    edge_surface: 'public_conformance_manifest',
    note: 'Runtime scenario manifest is explicitly tied to the v2 platform conformance contract.',
  },
  {
    path: '/platform-conformance/child-workflow-runtime-scenarios.json',
    source_file: 'static/platform-conformance/child-workflow-runtime-scenarios.json',
    intended_release_status: 'prerelease_2_0_contract_manifest',
    edge_surface: 'public_conformance_manifest',
    note: 'Runtime scenario manifest is explicitly tied to the v2 platform conformance contract.',
  },
  {
    path: '/platform-conformance/worker-versioning-runtime-scenarios.json',
    source_file: 'static/platform-conformance/worker-versioning-runtime-scenarios.json',
    intended_release_status: 'prerelease_2_0_contract_manifest',
    edge_surface: 'public_conformance_manifest',
    note: 'Runtime scenario manifest is explicitly tied to the v2 platform conformance contract.',
  },
  {
    path: '/platform-conformance/saga-runtime-scenarios.json',
    source_file: 'static/platform-conformance/saga-runtime-scenarios.json',
    intended_release_status: 'prerelease_2_0_contract_manifest',
    edge_surface: 'public_conformance_manifest',
    note: 'Runtime scenario manifest is explicitly tied to the v2 platform conformance contract.',
  },
  {
    path: '/platform-conformance/migration-runtime-scenarios.json',
    source_file: 'static/platform-conformance/migration-runtime-scenarios.json',
    intended_release_status: 'prerelease_2_0_contract_manifest',
    edge_surface: 'public_conformance_manifest',
    note: 'Runtime scenario manifest is explicitly tied to the v2 platform conformance contract.',
  },
];

function publicConformanceManifestEdges() {
  const manifestDir = path.join(repoRoot, 'static', 'platform-conformance');

  if (!fs.existsSync(manifestDir)) {
    return [];
  }

  return fs.readdirSync(manifestDir)
    .filter(fileName => fileName.endsWith('.json'))
    .sort()
    .map(fileName => ({
      path: `/platform-conformance/${fileName}`,
      source_file: `static/platform-conformance/${fileName}`,
      intended_release_status: 'prerelease_2_0_contract_manifest',
      edge_surface: 'public_conformance_manifest',
      note: 'Runtime scenario manifest is explicitly tied to the v2 platform conformance contract.',
    }));
}

function allEdgeSurfaces() {
  const seen = new Set();
  const edges = [];

  for (const edge of [...EDGE_SURFACES, ...publicConformanceManifestEdges()]) {
    const key = `${edge.path}:${edge.edge_surface}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    edges.push(edge);
  }

  return edges;
}

function fail(message) {
  throw new Error(message);
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

function withoutTrailingSlash(routePath) {
  return routePath.replace(/\/+$/, '') || '/';
}

function routeUrl(routePath) {
  return `${SITE_URL}${routePath}`;
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function docSourceForRoute(routePath) {
  const cleanPath = withoutTrailingSlash(routePath);

  if (cleanPath === '/docs') {
    return 'versioned_docs/version-1.x/introduction.md';
  }

  if (cleanPath === '/docs/platform-conformance') {
    return 'src/pages/docs/platform-conformance.mdx';
  }

  if (cleanPath.startsWith('/docs/category/')) {
    return 'versioned_sidebars/version-1.x-sidebars.json';
  }

  if (cleanPath.startsWith('/docs/2.0/category/')) {
    return 'sidebars.js';
  }

  if (cleanPath === '/docs/2.0/tags' || cleanPath.startsWith('/docs/2.0/tags/')) {
    return 'generated:docs/2.0/tags';
  }

  if (cleanPath.startsWith('/docs/2.0/')) {
    const slug = cleanPath.slice('/docs/2.0/'.length);
    for (const ext of ['.md', '.mdx']) {
      const candidate = path.posix.join('docs', `${slug}${ext}`);
      if (fileExists(candidate)) {
        return candidate;
      }
    }

    return 'generated:docs/2.0';
  }

  if (cleanPath.startsWith('/docs/')) {
    const slug = cleanPath.slice('/docs/'.length);
    for (const ext of ['.md', '.mdx']) {
      const candidate = path.posix.join('versioned_docs/version-1.x', `${slug}${ext}`);
      if (fileExists(candidate)) {
        return candidate;
      }
    }

    return 'generated:docs/1.x';
  }

  return 'generated:public-route';
}

function slugForPath(routePath) {
  return (routePath.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'home')
    .toLowerCase();
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

function readBuildArtifact(routePath) {
  const relativePath = buildRelativePath(routePath);
  const artifactPath = path.join(buildDir, relativePath);

  if (routePath === '/docs-page-release-audit.json') {
    return {
      path: `build/${relativePath}`,
      content: null,
      sha256: null,
      generated_by_this_run: true,
    };
  }

  if (!fs.existsSync(artifactPath)) {
    fail(`Missing built public artifact for audited route ${routePath}: build/${relativePath}`);
  }

  const content = fs.readFileSync(artifactPath, 'utf8');

  return {
    path: `build/${relativePath}`,
    content,
    sha256: sha256(content),
    generated_by_this_run: false,
  };
}

function readSourceEvidence(sourceFile) {
  if (!sourceFile || sourceFile.startsWith('generated:')) {
    return null;
  }

  const sourcePath = path.join(repoRoot, sourceFile);

  if (!fs.existsSync(sourcePath)) {
    return null;
  }

  const rawContent = fs.readFileSync(sourcePath, 'utf8');
  const content = replaceArtifactTokens(rawContent, sourceFile);

  return {
    path: sourceFile,
    content,
    sha256: sha256(rawContent),
  };
}

function createClassificationContext(entry) {
  return {
    entry,
    artifact: readBuildArtifact(entry.path),
    source: readSourceEvidence(entry.source_file),
    categories: new Set(),
    checks: [],
    findings: [],
  };
}

function addCheck(context, category, status, evidence) {
  context.categories.add(category);
  context.checks.push({
    category,
    status,
    evidence,
  });
}

function addFinding(context, category, summary, evidence, remediation) {
  const sequence = context.findings.length + 1;

  context.categories.add(category);
  context.findings.push({
    id: `docs-release-status:${slugForPath(context.entry.path)}:${category}:${sequence}`,
    category,
    severity: 'error',
    summary,
    evidence,
    remediation,
  });
}

function requireCheck(context, category, condition, passEvidence, failure) {
  if (condition) {
    addCheck(context, category, 'pass', passEvidence);
    return;
  }

  addCheck(context, category, 'fail', failure.evidence);
  addFinding(
    context,
    category,
    failure.summary,
    failure.evidence,
    failure.remediation
  );
}

function textIncludes(text, needle) {
  return Boolean(text && text.includes(needle));
}

function lowerIncludes(text, needle) {
  return Boolean(text && text.toLowerCase().includes(needle.toLowerCase()));
}

function observeArtifactPins(context, text) {
  let observedPins = 0;

  for (const definition of ARTIFACT_PIN_PATTERNS) {
    const pattern = new RegExp(definition.pattern.source, definition.pattern.flags);
    const versions = [...text.matchAll(pattern)]
      .map(match => match.slice(1).find(Boolean))
      .filter(Boolean);
    const uniqueVersions = [...new Set(versions)].sort();

    if (uniqueVersions.length === 0) {
      continue;
    }

    observedPins += uniqueVersions.length;
    requireCheck(
      context,
      definition.category,
      uniqueVersions.every(version => version === definition.expected),
      `${definition.label} matches ${definition.expected}`,
      {
        summary: `${definition.label} does not match the current release-candidate tuple`,
        evidence: `observed=${uniqueVersions.join(', ')} expected=${definition.expected}`,
        remediation: `Update the public docs pin to ${definition.expected} or route the stale pin as a product finding.`,
      }
    );
  }

  if (observedPins === 0) {
    addCheck(context, 'artifact_pin_scan', 'pass', 'No current release-candidate artifact pins observed on this surface.');
  }
}

function scanStableSourceForV2Leaks(context) {
  if (
    !context.source ||
    context.entry.source_file === 'src/pages/docs/platform-conformance.mdx' ||
    context.entry.source_file === 'docusaurus.config.js'
  ) {
    return;
  }

  const source = context.source.content;
  const leakPatterns = [
    {
      category: 'stable_source_prerelease_route',
      pattern: /\/docs\/2\.0\//,
      summary: 'Stable default docs content links directly into the 2.0 prerelease docs without an edge-surface exception.',
      remediation: 'Move 2.0 guidance to the explicit prerelease docs or add a stable guardrail page that labels the pointer as prerelease.',
    },
    {
      category: 'stable_source_v2_runtime_api',
      pattern: /Workflow\\V2|workflows\.v2|workflow:v2|DW_V2_|2\.0\.0-alpha|2\.0 prerelease|@alpha/,
      summary: 'Stable default docs content contains Workflow 2.0 runtime or prerelease markers.',
      remediation: 'Keep released 1.x guidance on the default docs route and move v2 runtime guidance under /docs/2.0/.',
    },
  ];
  let clean = true;

  for (const leak of leakPatterns) {
    const match = source.match(leak.pattern);

    if (!match) {
      continue;
    }

    clean = false;
    addCheck(context, leak.category, 'fail', `matched ${JSON.stringify(match[0])} in ${context.entry.source_file}`);
    addFinding(
      context,
      leak.category,
      leak.summary,
      `matched ${JSON.stringify(match[0])} in ${context.entry.source_file}`,
      leak.remediation
    );
  }

  if (clean) {
    addCheck(context, 'stable_source_without_v2_markers', 'pass', `${context.entry.source_file} has no Workflow 2.0 prerelease markers.`);
  }
}

function scanPrereleaseSourceForStableClaims(context) {
  if (!context.source) {
    return;
  }

  const source = context.source.content;
  const claimPatterns = [
    {
      category: 'prerelease_claims_stable_2_0',
      pattern: /2\.0\s+(?:is|now|has been|as)\s+(?:the\s+)?(?:stable|released|default)/i,
      summary: 'Explicit 2.0 prerelease content describes 2.0 as stable, released, or default.',
      remediation: 'Keep 2.0 language framed as prerelease until an authorized release-status cutover.',
    },
    {
      category: 'prerelease_claims_default_docs',
      pattern: /(?:default|canonical)\s+(?:public\s+)?docs(?:\s+line)?\s+(?:is|are|tracks?)\s+2\.0/i,
      summary: 'Explicit 2.0 content claims the default or canonical docs line is 2.0.',
      remediation: 'State that stable 1.x remains the default public docs line and that 2.0 is an explicit prerelease surface.',
    },
  ];
  let clean = true;

  for (const claim of claimPatterns) {
    const match = source.match(claim.pattern);

    if (!match) {
      continue;
    }

    clean = false;
    addCheck(context, claim.category, 'fail', `matched ${JSON.stringify(match[0])} in ${context.entry.source_file}`);
    addFinding(
      context,
      claim.category,
      claim.summary,
      `matched ${JSON.stringify(match[0])} in ${context.entry.source_file}`,
      claim.remediation
    );
  }

  if (clean) {
    addCheck(context, 'prerelease_source_without_stable_claims', 'pass', `${context.entry.source_file} does not claim 2.0 is the stable default.`);
  }
}

function classifyStableDocs(context) {
  const { entry, artifact, source } = context;
  const html = artifact.content || '';

  requireCheck(
    context,
    'stable_default_route',
    entry.path.startsWith('/docs/') && !entry.path.startsWith('/docs/2.0/'),
    `${entry.path} is under the stable default /docs/ route set`,
    {
      summary: 'Stable default docs entry is not served under /docs/.',
      evidence: entry.path,
      remediation: 'Serve stable default docs under /docs/ and keep prerelease 2.0 pages under /docs/2.0/.',
    }
  );

  const stableSource = (
    entry.source_file.startsWith('versioned_docs/version-1.x/') ||
    entry.source_file.startsWith('versioned_sidebars/version-1.x') ||
    entry.source_file === 'src/pages/docs/platform-conformance.mdx' ||
    entry.source_file === 'docusaurus.config.js' ||
    entry.source_file.startsWith('generated:docs/1.x')
  );

  requireCheck(
    context,
    'stable_default_source',
    stableSource,
    `${entry.source_file} is a stable 1.x source or stable edge surface`,
    {
      summary: 'Stable default docs entry is not backed by the 1.x docs source set.',
      evidence: entry.source_file,
      remediation: 'Point the default route at versioned 1.x docs or move prerelease content under /docs/2.0/.',
    }
  );

  if (entry.path === '/docs/') {
    requireCheck(
      context,
      'stable_docs_redirect',
      textIncludes(html, STABLE_DOCS_ROOT) && !textIncludes(html, '/docs/2.0/'),
      `/docs/ redirects to ${STABLE_DOCS_ROOT} without a 2.0 target`,
      {
        summary: '/docs/ does not redirect exclusively to the stable 1.x entrypoint.',
        evidence: `contains ${STABLE_DOCS_ROOT}=${textIncludes(html, STABLE_DOCS_ROOT)} contains /docs/2.0/=${textIncludes(html, '/docs/2.0/')}`,
        remediation: `Keep /docs/ redirected to ${STABLE_DOCS_ROOT} until a release-status cutover is authorized.`,
      }
    );
  } else if (entry.source_file === 'src/pages/docs/platform-conformance.mdx') {
    requireCheck(
      context,
      'stable_conformance_guardrail',
      source && source.content.includes('Stable 1.x remains the default public documentation line') &&
        source.content.includes('/docs/2.0/platform-conformance/'),
      'Default conformance page states stable 1.x remains default and points to explicit 2.0 prerelease authority',
      {
        summary: 'Default platform conformance page lacks the stable-default guardrail or explicit prerelease pointer.',
        evidence: entry.source_file,
        remediation: 'Keep the default conformance page framed as stable 1.x discovery with explicit 2.0 prerelease links.',
      }
    );
    requireCheck(
      context,
      'stable_page_not_current_meta',
      !textIncludes(html, 'name="docusaurus_version" content="current"'),
      'Default conformance edge page is not rendered as the current prerelease docs version',
      {
        summary: 'Default conformance edge page renders as the current prerelease docs version.',
        evidence: entry.path,
        remediation: 'Serve the default conformance discovery page outside the current /docs/2.0 version surface.',
      }
    );
  } else {
    requireCheck(
      context,
      'stable_docusaurus_version_meta',
      textIncludes(html, 'name="docusaurus_version" content="1.x"'),
      'Rendered page declares docusaurus_version=1.x',
      {
        summary: 'Stable default docs page does not declare docusaurus_version=1.x.',
        evidence: artifact.path,
        remediation: 'Keep stable default docs backed by versioned_docs/version-1.x until the docs cutover is authorized.',
      }
    );
    requireCheck(
      context,
      'stable_page_not_current_meta',
      !textIncludes(html, 'name="docusaurus_version" content="current"'),
      'Rendered page is not marked as the current prerelease docs version',
      {
        summary: 'Stable default docs page is marked as the current prerelease docs version.',
        evidence: artifact.path,
        remediation: 'Move current prerelease pages under /docs/2.0/ and keep default routes on 1.x.',
      }
    );
  }

  if (entry.edge_surfaces.includes('version_switcher')) {
    const currentVersion = (((config.presets || [])[0] || [])[1] || {}).docs?.versions?.current || {};
    requireCheck(
      context,
      'version_switcher_prerelease_label',
      String(currentVersion.label || '').toLowerCase().includes('prerelease') &&
        currentVersion.banner === 'unreleased',
      'Version switcher labels current docs as prerelease and uses the unreleased banner',
      {
        summary: 'Version switcher does not clearly label current docs as prerelease.',
        evidence: JSON.stringify(currentVersion),
        remediation: 'Keep the current docs version labeled prerelease with an unreleased banner.',
      }
    );
  }

  scanStableSourceForV2Leaks(context);
  observeArtifactPins(context, source ? source.content : '');
}

function classifyPrereleaseDocs(context) {
  const { entry, artifact, source } = context;
  const html = artifact.content || '';
  const generatedTagPage = entry.source_file.startsWith('generated:docs/2.0/tags');

  requireCheck(
    context,
    'prerelease_2_0_route',
    entry.path.startsWith('/docs/2.0/'),
    `${entry.path} is under the explicit /docs/2.0/ prerelease route set`,
    {
      summary: '2.0 prerelease docs entry is not served under /docs/2.0/.',
      evidence: entry.path,
      remediation: 'Keep prerelease 2.0 pages under /docs/2.0/ until the release-status cutover is authorized.',
    }
  );

  const prereleaseSource = (
    entry.source_file.startsWith('docs/') ||
    entry.source_file === 'sidebars.js' ||
    entry.source_file.startsWith('generated:docs/2.0')
  );

  requireCheck(
    context,
    'prerelease_2_0_source',
    prereleaseSource,
    `${entry.source_file} is a current 2.0 docs source or generated 2.0 surface`,
    {
      summary: '2.0 prerelease docs entry is not backed by the current docs source set.',
      evidence: entry.source_file,
      remediation: 'Serve prerelease docs from the current docs source set under /docs/2.0/.',
    }
  );

  if (generatedTagPage) {
    requireCheck(
      context,
      'prerelease_generated_tag_route',
      entry.path.startsWith('/docs/2.0/tags/'),
      'Generated tag page is served only under /docs/2.0/tags/',
      {
        summary: 'Generated 2.0 tag page is not served under the explicit prerelease tag route.',
        evidence: entry.path,
        remediation: 'Keep generated 2.0 tag pages under /docs/2.0/tags/.',
      }
    );
    requireCheck(
      context,
      'prerelease_tag_navigation_label',
      lowerIncludes(html, '2.0 prerelease') && textIncludes(html, '/docs/2.0/'),
      'Generated tag page navigation labels the route as 2.0 prerelease and links within /docs/2.0/',
      {
        summary: 'Generated 2.0 tag page lacks prerelease navigation evidence.',
        evidence: artifact.path,
        remediation: 'Keep generated tag pages in the explicit 2.0 prerelease navigation surface.',
      }
    );
  } else {
    requireCheck(
      context,
      'prerelease_docusaurus_version_meta',
      textIncludes(html, 'name="docusaurus_version" content="current"'),
      'Rendered page declares docusaurus_version=current',
      {
        summary: '2.0 prerelease docs page does not declare docusaurus_version=current.',
        evidence: artifact.path,
        remediation: 'Keep explicit 2.0 pages on the current Docusaurus docs version with a prerelease banner.',
      }
    );

    requireCheck(
      context,
      'prerelease_unreleased_banner',
      lowerIncludes(html, 'unreleased'),
      'Rendered page contains the Docusaurus unreleased banner text',
      {
        summary: '2.0 prerelease docs page does not show unreleased/prerelease framing.',
        evidence: artifact.path,
        remediation: 'Keep the current docs version banner set to unreleased until 2.0 is promoted.',
      }
    );
  }

  scanPrereleaseSourceForStableClaims(context);
  observeArtifactPins(context, source ? source.content : '');
}

function classifyHomepage(context) {
  const sourceText = context.source ? context.source.content : '';
  const html = context.artifact.content || '';
  const combined = `${sourceText}\n${html}`;

  requireCheck(
    context,
    'homepage_stable_primary_action',
    textIncludes(combined, '/docs/introduction'),
    'Homepage primary docs action targets /docs/introduction',
    {
      summary: 'Homepage no longer exposes stable 1.x docs as the primary get-started path.',
      evidence: context.entry.source_file,
      remediation: 'Keep the primary homepage docs action pointed at stable 1.x until an authorized cutover.',
    }
  );
  requireCheck(
    context,
    'homepage_prerelease_pointer_labeled',
    textIncludes(combined, '/docs/2.0/quickstart/') && textIncludes(combined, '2.0 Prerelease Quickstart'),
    'Homepage 2.0 pointer is explicitly labeled prerelease',
    {
      summary: 'Homepage 2.0 pointer is missing or not labeled as prerelease.',
      evidence: context.entry.source_file,
      remediation: 'Label homepage 2.0 links as prerelease and keep them secondary to stable docs.',
    }
  );
  observeArtifactPins(context, sourceText);
}

function classifyLlmManifest(context) {
  const content = context.artifact.content || '';
  const stableManifest = [
    '/llms.txt',
    '/llms-full.txt',
    '/llms-1.x.txt',
    '/llms-full-1.x.txt',
  ].includes(context.entry.path);

  if (stableManifest) {
    requireCheck(
      context,
      'canonical_llm_stable_source',
      textIncludes(content, 'versioned_docs/version-1.x'),
      'Canonical or 1.x LLM manifest is sourced from versioned_docs/version-1.x',
      {
        summary: 'Stable LLM manifest is not sourced from versioned 1.x docs.',
        evidence: context.artifact.path,
        remediation: 'Keep canonical LLM manifests on the stable 1.x source set until an authorized cutover.',
      }
    );
    requireCheck(
      context,
      'canonical_llm_no_prerelease_source',
      !textIncludes(content, 'docs/quickstart.md') &&
        !textIncludes(content, 'docs/ai-assisted-development.md') &&
        !textIncludes(content, 'llms-full-2.0.txt'),
      'Stable LLM manifest does not reference 2.0-only docs or the 2.0 full bundle',
      {
        summary: 'Stable LLM manifest references prerelease 2.0 docs or aliases.',
        evidence: context.artifact.path,
        remediation: 'Move 2.0 LLM references to the explicit -2.0 manifests.',
      }
    );
  } else {
    requireCheck(
      context,
      'prerelease_llm_manifest_label',
      lowerIncludes(content, 'prerelease') && lowerIncludes(content, 'not the default public docs line'),
      '2.0 LLM manifest states it is prerelease and not the default public docs line',
      {
        summary: '2.0 LLM manifest lacks prerelease/non-default release-status language.',
        evidence: context.artifact.path,
        remediation: 'Keep 2.0 LLM aliases explicitly labeled as prerelease and non-default.',
      }
    );
    requireCheck(
      context,
      'prerelease_llm_source',
      textIncludes(content, 'docs/quickstart.md') ||
        textIncludes(content, '# 2.0 Prerelease Quickstart'),
      '2.0 LLM manifest includes current prerelease docs content',
      {
        summary: '2.0 LLM manifest is not sourced from the current prerelease docs.',
        evidence: context.artifact.path,
        remediation: 'Generate 2.0 LLM aliases from current docs under the prerelease guardrail.',
      }
    );
  }

  observeArtifactPins(context, content);
}

function classifyConformanceManifest(context) {
  if (context.entry.path === '/docs-page-release-audit.json') {
    addCheck(context, 'audit_manifest_generated_schema', 'pass', `${SCHEMA} schema is emitted by this generator.`);
    addCheck(context, 'audit_manifest_guardrail_versions', 'pass', `stable=${STABLE_DOCS_VERSION} prerelease=${PRERELEASE_DOCS_VERSION}`);
    addCheck(
      context,
      'audit_manifest_self_hash_exception',
      'pass',
      'Manifest self-entry records content_sha256_status=self_referential_manifest instead of a stale final-artifact hash.'
    );
    return;
  }

  const content = context.artifact.content || (context.source && context.source.content) || '';
  let parsed = null;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    addCheck(context, 'public_conformance_manifest_json', 'fail', error.message);
    addFinding(
      context,
      'public_conformance_manifest_json',
      'Public conformance manifest is not valid JSON.',
      error.message,
      'Publish valid JSON for public conformance manifests.'
    );
    return;
  }

  addCheck(context, 'public_conformance_manifest_json', 'pass', 'Public conformance manifest parses as JSON.');

  const schema = parsed.schema || parsed.suite_schema || '';
  requireCheck(
    context,
    'v2_public_conformance_schema',
    String(schema).startsWith('durable-workflow.v2.platform-conformance'),
    `schema=${schema}`,
    {
      summary: 'Public conformance manifest is not tied to the v2 platform conformance schema.',
      evidence: `schema=${schema}`,
      remediation: 'Keep conformance manifests explicitly tied to the v2 platform conformance contract.',
    }
  );

  if (context.entry.path === '/platform-conformance-contract.json') {
    requireCheck(
      context,
      'v2_release_candidate_gate',
      Boolean(parsed.targets?.prerelease_release_candidate) &&
        Boolean(parsed.release_gates?.gates?.['durable-workflow/2.0-release-candidate']),
      'Suite manifest declares prerelease_release_candidate fixtures and a 2.0 release-candidate gate',
      {
        summary: 'Suite manifest lacks the 2.0 prerelease release-candidate gate.',
        evidence: context.entry.source_file,
        remediation: 'Keep the public suite manifest explicit about the 2.0 prerelease release-candidate surface.',
      }
    );
  } else {
    requireCheck(
      context,
      'runtime_scenario_manifest',
      parsed.schema === 'durable-workflow.v2.platform-conformance.runtime-scenarios' &&
        parsed.suite_schema === 'durable-workflow.v2.platform-conformance.suite',
      `schema=${parsed.schema} suite_schema=${parsed.suite_schema}`,
      {
        summary: 'Runtime scenario manifest lacks the expected v2 conformance runtime schema.',
        evidence: context.entry.source_file,
        remediation: 'Publish runtime scenario manifests with the v2 platform-conformance runtime schema.',
      }
    );
  }

  observeArtifactPins(context, content);
}

function classifyGenericEdge(context) {
  addCheck(context, 'edge_artifact_reachable', 'pass', `${context.entry.path} is present at ${context.artifact.path}`);
  observeArtifactPins(context, context.artifact.content || '');
}

function contentHashEvidence(artifact) {
  if (artifact.generated_by_this_run) {
    return {
      content_sha256: null,
      content_sha256_status: 'self_referential_manifest',
      content_sha256_exception: {
        ...SELF_HASH_EXCEPTION,
        artifact_path: artifact.path,
      },
    };
  }

  return {
    content_sha256: artifact.sha256,
    content_sha256_status: 'verified',
    content_sha256_exception: null,
  };
}

function classifyEntry(entry) {
  const context = createClassificationContext(entry);

  if (entry.route_kind === 'stable_default_docs') {
    classifyStableDocs(context);
  } else if (entry.route_kind === 'explicit_prerelease_2_0_docs') {
    classifyPrereleaseDocs(context);
  } else if (entry.edge_surfaces.includes('homepage')) {
    classifyHomepage(context);
  } else if (entry.edge_surfaces.includes('llm_manifest')) {
    classifyLlmManifest(context);
  } else if (entry.edge_surfaces.includes('public_conformance_manifest')) {
    classifyConformanceManifest(context);
  } else {
    classifyGenericEdge(context);
  }

  const leakCount = context.findings.length;
  const hasPassingEvidence = context.checks.some(check => check.status === 'pass');

  return {
    ...entry,
    verdict: leakCount === 0 ? 'CLEAN' : (hasPassingEvidence ? 'MIXED' : 'LEAK'),
    leak_count: leakCount,
    categories_observed: [...context.categories].sort(),
    findings: context.findings,
    evidence: {
      classifier: CLASSIFIER_ID,
      artifact_path: context.artifact.path,
      ...contentHashEvidence(context.artifact),
      source_sha256: context.source ? context.source.sha256 : null,
      checks: context.checks,
    },
  };
}

function docsEntry(routePath) {
  const isV2 = routePath.startsWith('/docs/2.0/');
  const isStable = routePath.startsWith('/docs/') && !isV2;

  if (!isStable && !isV2) {
    fail(`Cannot create docs entry for non-docs route ${routePath}`);
  }

  const intendedReleaseStatus = isV2 ? 'prerelease_2_0' : 'released_1_x';

  return {
    path: routePath,
    url: routeUrl(routePath),
    source_file: docSourceForRoute(routePath),
    route_kind: isV2 ? 'explicit_prerelease_2_0_docs' : 'stable_default_docs',
    intended_release_status: intendedReleaseStatus,
    edge_surfaces: [],
    classification_note: isV2
      ? 'Explicit 2.0 route is treated as prerelease guidance and does not promote the default docs line.'
      : 'Default docs route is evaluated against released 1.x behavior.',
  };
}

function edgeEntry(edge) {
  const routeKind = edge.path.startsWith('/docs/2.0/')
    ? 'explicit_prerelease_2_0_docs'
    : edge.path.startsWith('/docs/')
      ? 'stable_default_docs'
      : 'edge_surface';

  return {
    path: edge.path,
    url: routeUrl(edge.path),
    source_file: edge.source_file,
    route_kind: routeKind,
    intended_release_status: edge.intended_release_status,
    edge_surfaces: [edge.edge_surface],
    classification_note: edge.note,
  };
}

function mergeEdge(existing, edge) {
  if (!existing.edge_surfaces.includes(edge.edge_surface)) {
    existing.edge_surfaces.push(edge.edge_surface);
  }

  if (!existing.classification_note.includes(edge.note)) {
    existing.classification_note = `${existing.classification_note} ${edge.note}`;
  }

  if (existing.source_file.startsWith('generated:') && edge.source_file) {
    existing.source_file = edge.source_file;
  }

  if (edge.intended_release_status && edge.intended_release_status !== existing.intended_release_status) {
    existing.intended_release_status = edge.intended_release_status;
  }

  return existing;
}

function verdictCounts(entries) {
  const counts = Object.fromEntries(VERDICTS.map(verdict => [verdict, 0]));

  for (const entry of entries) {
    counts[entry.verdict] += 1;
  }

  return counts;
}

function assertVerdicts(entries) {
  for (const entry of entries) {
    if (!VERDICTS.includes(entry.verdict)) {
      fail(`${entry.path} has invalid verdict ${entry.verdict}`);
    }

    if (!Array.isArray(entry.categories_observed) || entry.categories_observed.length === 0) {
      fail(`${entry.path} has no observed release-status evidence categories`);
    }

    if (!entry.evidence || entry.evidence.classifier !== CLASSIFIER_ID) {
      fail(`${entry.path} is missing content-derived classifier evidence`);
    }

    if (!Array.isArray(entry.evidence.checks) || entry.evidence.checks.length === 0) {
      fail(`${entry.path} has no page-level evidence checks`);
    }

    if (!Array.isArray(entry.findings)) {
      fail(`${entry.path} findings must be an array`);
    }

    if (entry.leak_count !== entry.findings.length) {
      fail(`${entry.path} leak_count must equal findings.length`);
    }

    if (entry.verdict === 'CLEAN' && entry.leak_count !== 0) {
      fail(`${entry.path} is CLEAN but has leak_count=${entry.leak_count}`);
    }

    if (entry.verdict !== 'CLEAN' && entry.findings.length === 0) {
      fail(`${entry.path} is ${entry.verdict} but has no focused finding record`);
    }
  }
}

function missingClassifications(entries) {
  return entries
    .filter(entry => (
      !entry.evidence ||
      !Array.isArray(entry.evidence.checks) ||
      entry.evidence.checks.length === 0 ||
      !Array.isArray(entry.categories_observed) ||
      entry.categories_observed.length === 0
    ))
    .map(entry => entry.path);
}

function artifactVersionSourceMetadata() {
  return {
    schema: ARTIFACT_VERSION_SCHEMA,
    source_file: ARTIFACT_VERSION_SOURCE_FILE,
    synchronized_fields: ARTIFACT_VERSION_SYNCHRONIZED_FIELDS,
    current_server_artifact: {
      version: ARTIFACT_VERSIONS.server,
      references: ARTIFACT_DISTRIBUTION_SURFACES.server.map(surface => surface.reference),
    },
  };
}

function main() {
  const sitemapPaths = readSitemapPaths();
  const docsPaths = sitemapPaths
    .filter(routePath => routePath.startsWith('/docs/'))
    .sort();

  const entriesByPath = new Map();

  for (const routePath of docsPaths) {
    entriesByPath.set(routePath, docsEntry(routePath));
  }

  for (const edge of allEdgeSurfaces()) {
    const existing = entriesByPath.get(edge.path);
    entriesByPath.set(edge.path, existing ? mergeEdge(existing, edge) : edgeEntry(edge));
  }

  const entries = [...entriesByPath.values()]
    .map(entry => classifyEntry(entry))
    .sort((a, b) => a.path.localeCompare(b.path));

  assertVerdicts(entries);

  const stableDocsCount = entries.filter(entry => entry.route_kind === 'stable_default_docs').length;
  const prereleaseDocsCount = entries.filter(entry => entry.route_kind === 'explicit_prerelease_2_0_docs').length;
  const edgeCount = entries.filter(entry => entry.edge_surfaces.length > 0).length;
  const missingClassificationPaths = missingClassifications(entries);

  const manifest = {
    schema: SCHEMA,
    schema_version: SCHEMA_VERSION,
    generated_from: 'production sitemap, docs build output, and content-derived release-status classifier',
    classifier: CLASSIFIER_ID,
    artifact_versions: ARTIFACT_VERSIONS,
    artifact_version_source: artifactVersionSourceMetadata(),
    artifact_distribution_surfaces: ARTIFACT_DISTRIBUTION_SURFACES,
    release_status_guardrail: {
      stable_default_docs_version: STABLE_DOCS_VERSION,
      explicit_prerelease_docs_version: PRERELEASE_DOCS_VERSION,
      rule: 'Stable 1.x remains the default public docs line until an explicit release-status change promotes another line.',
    },
    verdict_vocabulary: {
      CLEAN: 'The page matches its intended release status.',
      LEAK: 'The page presents stale behavior, broken current-release guidance, or release-status confusion.',
      MIXED: 'The page intentionally compares release lines, but current-product framing still points at the wrong line.',
    },
    summary: {
      stable_default_docs_pages: stableDocsCount,
      explicit_prerelease_2_0_pages: prereleaseDocsCount,
      edge_surfaces: edgeCount,
      verdict_counts: verdictCounts(entries),
      missing_classifications: missingClassificationPaths,
    },
    page_inventory: entries,
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(
    `Docs page release audit generated: ${stableDocsCount} stable docs, ` +
    `${prereleaseDocsCount} explicit 2.0 docs, ${edgeCount} edge surfaces`
  );
}

main();
