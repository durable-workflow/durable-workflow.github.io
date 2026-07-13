#!/usr/bin/env node

const assert = require('assert');
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

function readJson(fileName) {
  const filePath = path.join(buildDir, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing generated public docs artifact: build/${fileName}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const expectedInventory = sourceInventory(repoRoot);
  validateInventory(expectedInventory);

  const manifest = readJson('docs-narrative-audit.json');
  const releaseAudit = readJson('docs-page-release-audit.json');
  const revision = docsRevision(repoRoot);

  assert.strictEqual(manifest.schema, SCHEMA, 'narrative inventory schema');
  assert.strictEqual(manifest.schema_version, SCHEMA_VERSION, 'narrative inventory schema version');
  assert.match(manifest.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.strictEqual(manifest.docs_revision, revision, 'narrative docs revision');
  assert.strictEqual(releaseAudit.docs_revision, revision, 'release audit docs revision');
  assert.deepStrictEqual(manifest.artifact_versions, releaseAudit.artifact_versions, 'artifact tuple');
  assert.deepStrictEqual(
    manifest.release_status_guardrail,
    releaseAudit.release_status_guardrail,
    'stable/prerelease release-status guardrail',
  );
  assert.strictEqual(manifest.release_status_guardrail.stable_default_docs_version, '1.x');
  assert.strictEqual(manifest.release_status_guardrail.explicit_prerelease_docs_version, '2.0');
  assert.strictEqual(manifest.deploy_inventory.release_audit_path, '/docs-page-release-audit.json');
  assert.strictEqual(manifest.deploy_inventory.sitemap_path, '/sitemap.xml');
  assert.strictEqual(manifest.deploy_inventory.canonical_explicit_2_0_routes, expectedInventory.length);
  assert.strictEqual(manifest.summary.markdown_sources, expectedInventory.length);
  assert.strictEqual(manifest.summary.built_routes, expectedInventory.length);
  assert.deepStrictEqual(manifest.route_inventory, expectedInventory, 'published route inventory');
  validateInventory(manifest.route_inventory);

  for (const entry of manifest.route_inventory) {
    assert.ok(fs.existsSync(path.join(repoRoot, entry.build_artifact)), entry.build_artifact);
  }

  console.log(`Docs narrative route inventory checks passed for ${expectedInventory.length} Markdown sources`);
}

main();
