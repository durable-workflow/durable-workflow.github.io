#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  SCHEMA,
  SCHEMA_VERSION,
  docsRevision,
  sourceInventory,
  validateInventory,
} = require('./docs-narrative-audit-contract');

const repoRoot = path.join(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const releaseAuditPath = path.join(buildDir, 'docs-page-release-audit.json');
const sitemapPath = path.join(buildDir, 'sitemap.xml');
const outputPath = path.join(buildDir, 'docs-narrative-audit.json');

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${path.relative(repoRoot, filePath)}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sitemapRoutes() {
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  return new Set(
    [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname),
  );
}

function main() {
  const inventory = sourceInventory(repoRoot);
  validateInventory(inventory);

  const releaseAudit = readJson(releaseAuditPath, 'built page release audit');
  const routes = sitemapRoutes();
  const revision = docsRevision(repoRoot);

  if (releaseAudit.docs_revision !== revision) {
    throw new Error(
      `Narrative docs revision ${revision} does not match built release audit revision ${releaseAudit.docs_revision}`,
    );
  }

  for (const entry of inventory) {
    if (!fs.existsSync(path.join(repoRoot, entry.build_artifact))) {
      throw new Error(`Missing built route for ${entry.source_file}: ${entry.build_artifact}`);
    }
    if (!routes.has(entry.route)) {
      throw new Error(`Sitemap is missing ${entry.route} for ${entry.source_file}`);
    }
  }

  const manifest = {
    schema: SCHEMA,
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    docs_revision: revision,
    artifact_versions: releaseAudit.artifact_versions,
    release_status_guardrail: releaseAudit.release_status_guardrail,
    deploy_inventory: {
      release_audit_path: '/docs-page-release-audit.json',
      sitemap_path: '/sitemap.xml',
      canonical_explicit_2_0_routes: inventory.length,
    },
    summary: {
      markdown_sources: inventory.length,
      built_routes: inventory.length,
    },
    route_inventory: inventory,
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Docs narrative route inventory generated for ${inventory.length} Markdown sources`);
}

main();
