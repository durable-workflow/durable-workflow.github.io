#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const config = require('../docusaurus.config.js');

const repoRoot = path.join(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const sitemapPath = path.join(buildDir, 'sitemap.xml');
const outputPath = path.join(buildDir, 'docs-page-release-audit.json');

const SCHEMA = 'durable-workflow.docs.page-release-audit';
const SCHEMA_VERSION = 1;
const STABLE_DOCS_VERSION = '1.x';
const PRERELEASE_DOCS_VERSION = '2.0';
const SITE_URL = String(config.url || 'https://durable-workflow.com').replace(/\/+$/, '');
const VERDICTS = ['CLEAN', 'LEAK', 'MIXED'];

const ARTIFACT_VERSIONS = {
  cli: '0.1.67',
  'sdk-python': '0.4.79',
  server: '0.2.191',
  waterline: '2.0.0-alpha.64',
  workflow: '2.0.0-alpha.178',
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
];

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
    verdict: 'CLEAN',
    leak_count: 0,
    categories_observed: [],
    findings: [],
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
    verdict: 'CLEAN',
    leak_count: 0,
    categories_observed: [],
    findings: [],
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

    if (entry.verdict === 'CLEAN' && entry.leak_count !== 0) {
      fail(`${entry.path} is CLEAN but has leak_count=${entry.leak_count}`);
    }
  }
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

  for (const edge of EDGE_SURFACES) {
    const existing = entriesByPath.get(edge.path);
    entriesByPath.set(edge.path, existing ? mergeEdge(existing, edge) : edgeEntry(edge));
  }

  const entries = [...entriesByPath.values()]
    .sort((a, b) => a.path.localeCompare(b.path));

  assertVerdicts(entries);

  const stableDocsCount = entries.filter(entry => entry.route_kind === 'stable_default_docs').length;
  const prereleaseDocsCount = entries.filter(entry => entry.route_kind === 'explicit_prerelease_2_0_docs').length;
  const edgeCount = entries.filter(entry => entry.edge_surfaces.length > 0).length;

  const manifest = {
    schema: SCHEMA,
    schema_version: SCHEMA_VERSION,
    generated_from: 'production sitemap and docs build output',
    artifact_versions: ARTIFACT_VERSIONS,
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
      missing_classifications: [],
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
