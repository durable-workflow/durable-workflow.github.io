#!/usr/bin/env node

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
const releaseAuditPath = path.join(buildDir, 'docs-page-release-audit.json');
const sitemapPath = path.join(buildDir, 'sitemap.xml');
const outputPath = path.join(buildDir, 'docs-narrative-audit.json');

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${path.relative(repoRoot, filePath)}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const inventory = sourceInventory(repoRoot);
  validateReviewContract(reviewContract.reviews, inventory);

  const releaseAuditBytes = fs.readFileSync(releaseAuditPath);
  const releaseAudit = readJson(releaseAuditPath, 'built page release audit');
  fs.accessSync(sitemapPath, fs.constants.R_OK);
  const revision = docsRevision(repoRoot);

  if (releaseAudit.docs_revision !== revision) {
    throw new Error(
      `Narrative docs revision ${revision} does not match built release audit revision ${releaseAudit.docs_revision}`
    );
  }

  const canonicalV2Rows = releaseAudit.page_inventory.filter(entry => (
    entry.route_kind === 'explicit_prerelease_2_0_docs' &&
    /^docs\/.+\.mdx?$/.test(entry.source_file)
  ));
  const releaseRowsBySource = new Map(canonicalV2Rows.map(entry => [entry.source_file, entry]));

  for (const source of inventory) {
    const releaseRow = releaseRowsBySource.get(source.source_file);
    if (!releaseRow || releaseRow.path !== source.route) {
      throw new Error(`${source.source_file} is not bound to ${source.route} in the built release audit`);
    }
    if (releaseRow.evidence.source_sha256 !== source.source_sha256) {
      throw new Error(`${source.source_file} hash does not match the built release audit`);
    }
  }
  if (releaseRowsBySource.size !== inventory.length) {
    throw new Error(
      `Built release audit has ${releaseRowsBySource.size} canonical 2.0 Markdown rows; expected ${inventory.length}`
    );
  }

  const generatedAt = new Date().toISOString();
  const manifest = {
    schema: SCHEMA,
    schema_version: SCHEMA_VERSION,
    generated_at: generatedAt,
    docs_revision: revision,
    artifact_versions: releaseAudit.artifact_versions,
    release_status_guardrail: releaseAudit.release_status_guardrail,
    review: {
      completed_at: reviewContract.completed_at,
      method: reviewContract.method,
      reviewer_scope: 'Every unique Markdown source behind the canonical explicit 2.0 docs routes.',
      dimensions: DIMENSIONS,
      baseline_conformance_run_id: reviewContract.baseline_conformance_run_id,
    },
    deploy_evidence: {
      release_audit: {
        path: '/docs-page-release-audit.json',
        schema: releaseAudit.schema,
        classifier: releaseAudit.classifier,
        content_sha256: sha256(releaseAuditBytes),
      },
      sitemap: {
        path: '/sitemap.xml',
        discovery_path: '/docs-narrative-audit.json',
      },
      canonical_explicit_2_0_routes: inventory.length,
    },
    summary: {
      unique_markdown_sources: inventory.length,
      passed_sources: reviewContract.reviews.length,
      failed_sources: 0,
      missing_sources: 0,
      resolved_findings: reviewContract.resolved_findings,
    },
    source_reviews: reviewContract.reviews,
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Docs narrative audit generated for ${inventory.length} canonical 2.0 Markdown sources`);
}

main();
