#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const config = require('../docusaurus.config.js');

const repoRoot = path.join(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const sitemapPath = path.join(buildDir, 'sitemap.xml');
const siteUrl = String(config.url || '').replace(/\/+$/, '');

const REQUIRED_DISCOVERY_ENTRIES = [
  {
    path: '/docs/',
    buildPath: 'docs/index.html',
  },
  {
    path: '/docs/2.0/quickstart/',
    buildPath: 'docs/2.0/quickstart/index.html',
  },
  {
    path: '/quickstart-execution-contract.json',
    buildPath: 'quickstart-execution-contract.json',
  },
  {
    path: '/docs/2.0/polyglot/python/',
    buildPath: 'docs/2.0/polyglot/python/index.html',
  },
  {
    path: '/docs/2.0/polyglot/server/',
    buildPath: 'docs/2.0/polyglot/server/index.html',
  },
  {
    path: '/docs/2.0/polyglot/cli/',
    buildPath: 'docs/2.0/polyglot/cli/index.html',
  },
  {
    path: '/docs/platform-conformance/',
    buildPath: 'docs/platform-conformance/index.html',
  },
  {
    path: '/platform-conformance-contract.json',
    buildPath: 'platform-conformance-contract.json',
  },
  {
    path: '/docs-page-release-audit.json',
    buildPath: 'docs-page-release-audit.json',
  },
  {
    path: '/platform-conformance/signal-query-runtime-scenarios.json',
    buildPath: 'platform-conformance/signal-query-runtime-scenarios.json',
  },
  {
    path: '/platform-conformance/workflow-update-runtime-scenarios.json',
    buildPath: 'platform-conformance/workflow-update-runtime-scenarios.json',
  },
  {
    path: '/platform-conformance/search-attribute-runtime-scenarios.json',
    buildPath: 'platform-conformance/search-attribute-runtime-scenarios.json',
  },
  {
    path: '/platform-conformance/replay-runtime-scenarios.json',
    buildPath: 'platform-conformance/replay-runtime-scenarios.json',
  },
  {
    path: '/platform-conformance/namespace-runtime-scenarios.json',
    buildPath: 'platform-conformance/namespace-runtime-scenarios.json',
  },
  {
    path: '/platform-conformance/schedules-runtime-scenarios.json',
    buildPath: 'platform-conformance/schedules-runtime-scenarios.json',
  },
  {
    path: '/platform-conformance/child-workflow-runtime-scenarios.json',
    buildPath: 'platform-conformance/child-workflow-runtime-scenarios.json',
  },
  {
    path: '/platform-conformance/worker-versioning-runtime-scenarios.json',
    buildPath: 'platform-conformance/worker-versioning-runtime-scenarios.json',
  },
  {
    path: '/platform-conformance/saga-runtime-scenarios.json',
    buildPath: 'platform-conformance/saga-runtime-scenarios.json',
  },
  {
    path: '/platform-conformance/migration-runtime-scenarios.json',
    buildPath: 'platform-conformance/migration-runtime-scenarios.json',
  },
  {
    path: '/platform-conformance/skew-refusal-matrix-scenarios.json',
    buildPath: 'platform-conformance/skew-refusal-matrix-scenarios.json',
  },
  {
    path: '/platform-conformance/prerelease-readiness-scenarios.json',
    buildPath: 'platform-conformance/prerelease-readiness-scenarios.json',
  },
];

function fail(message) {
  throw new Error(message);
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function publicUrl(routePath) {
  if (!siteUrl) {
    fail('docusaurus.config.js must define url before patching sitemap.xml');
  }

  return `${siteUrl}${routePath}`;
}

function assertBuiltArtifact(entry) {
  const artifactPath = path.join(buildDir, entry.buildPath);

  if (!fs.existsSync(artifactPath)) {
    fail(`Missing public discovery artifact: build/${entry.buildPath}`);
  }
}

function sitemapEntry(url) {
  return `<url><loc>${escapeXml(url)}</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>`;
}

function main() {
  if (!fs.existsSync(sitemapPath)) {
    fail('Missing generated sitemap: build/sitemap.xml');
  }

  for (const entry of REQUIRED_DISCOVERY_ENTRIES) {
    assertBuiltArtifact(entry);
  }

  let sitemap = fs.readFileSync(sitemapPath, 'utf8');

  if (!sitemap.includes('</urlset>')) {
    fail('Generated sitemap.xml is missing a closing </urlset>');
  }

  const inserted = [];

  for (const entry of REQUIRED_DISCOVERY_ENTRIES) {
    const url = publicUrl(entry.path);
    const loc = `<loc>${escapeXml(url)}</loc>`;

    if (sitemap.includes(loc)) {
      continue;
    }

    inserted.push(url);
    sitemap = sitemap.replace('</urlset>', `${sitemapEntry(url)}</urlset>`);
  }

  if (inserted.length > 0) {
    fs.writeFileSync(sitemapPath, sitemap);
  }

  console.log(
    `Public discovery sitemap includes ${REQUIRED_DISCOVERY_ENTRIES.length} required conformance entries`
  );
}

main();
