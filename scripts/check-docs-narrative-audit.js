#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const reviewContract = require('./docs-narrative-reviews');
const {
  DIMENSIONS,
  SCHEMA,
  SCHEMA_VERSION,
  docsRevision,
  sha256,
  sourceInventory,
  validateReviewContract,
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
  const inventory = sourceInventory(repoRoot);
  validateReviewContract(reviewContract.reviews, inventory);

  const manifest = readJson('docs-narrative-audit.json');
  const releaseAudit = readJson('docs-page-release-audit.json');
  const revision = docsRevision(repoRoot);

  assert.strictEqual(manifest.schema, SCHEMA, 'narrative audit schema');
  assert.strictEqual(manifest.schema_version, SCHEMA_VERSION, 'narrative audit schema version');
  assert.match(manifest.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.strictEqual(manifest.review.completed_at, reviewContract.completed_at, 'editorial review timestamp');
  assert.match(manifest.review.completed_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.ok(
    Date.parse(manifest.review.completed_at) <= Date.parse(manifest.generated_at),
    'editorial review timestamp must not be later than manifest generation'
  );
  assert.strictEqual(manifest.docs_revision, revision, 'narrative docs revision');
  assert.strictEqual(releaseAudit.docs_revision, revision, 'release audit docs revision');
  assert.deepStrictEqual(manifest.artifact_versions, releaseAudit.artifact_versions, 'artifact tuple');
  assert.deepStrictEqual(
    manifest.release_status_guardrail,
    releaseAudit.release_status_guardrail,
    'stable/prerelease release-status guardrail'
  );
  assert.strictEqual(manifest.release_status_guardrail.stable_default_docs_version, '1.x');
  assert.strictEqual(manifest.release_status_guardrail.explicit_prerelease_docs_version, '2.0');
  assert.deepStrictEqual(manifest.review.dimensions, DIMENSIONS, 'review dimensions');
  assert.strictEqual(
    manifest.review.baseline_conformance_run_id,
    reviewContract.baseline_conformance_run_id,
    'baseline conformance run id'
  );

  const releaseAuditBytes = fs.readFileSync(path.join(buildDir, 'docs-page-release-audit.json'));
  assert.strictEqual(
    manifest.deploy_evidence.release_audit.content_sha256,
    sha256(releaseAuditBytes),
    'release audit deploy hash'
  );
  assert.strictEqual(manifest.deploy_evidence.canonical_explicit_2_0_routes, inventory.length);
  assert.strictEqual(manifest.deploy_evidence.sitemap.path, '/sitemap.xml');
  assert.strictEqual(manifest.deploy_evidence.sitemap.discovery_path, '/docs-narrative-audit.json');
  assert.strictEqual(manifest.summary.unique_markdown_sources, inventory.length);
  assert.strictEqual(manifest.summary.passed_sources, inventory.length);
  assert.strictEqual(manifest.summary.failed_sources, 0);
  assert.strictEqual(manifest.summary.missing_sources, 0);
  assert.deepStrictEqual(manifest.source_reviews, reviewContract.reviews, 'published editorial review rows');

  validateReviewContract(manifest.source_reviews, inventory);
  console.log(`Docs narrative audit checks passed for ${inventory.length} canonical 2.0 Markdown sources`);
}

main();
