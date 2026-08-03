#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  assertCatalogDoesNotExposeRepositoryLocalAuthority,
  assertPublishedSpecFileMatchesEntry,
} = require('./check-platform-protocol-specs');

const entry = {
  format: 'openapi',
  spec_id: 'durable-workflow.v2.control-plane-api',
  evolution_rule: 'additive_minor_breaking_major',
  object_families: [
    {
      name: 'control_plane_request_contract',
      owner_repo: 'durable-workflow/server',
    },
  ],
};
const catalogVersion = 16;
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-protocol-specs-'));
const fixturePath = path.join(fixtureRoot, 'control-plane-api.openapi.yaml');
const publicSpec = {
  absolutePath: fixturePath,
  repoRelativePath: 'static/platform-protocol-specs/control-plane-api.openapi.yaml',
};
const realCatalog = require('../static/platform-protocol-specs.json');
const realWorkerEntry = realCatalog.specs.worker_protocol_api;
const realWorkerSpec = {
  absolutePath: path.join(
    __dirname,
    '..',
    'static',
    'platform-protocol-specs',
    'worker-protocol-api.openapi.yaml',
  ),
  repoRelativePath:
    'static/platform-protocol-specs/worker-protocol-api.openapi.yaml',
};

function validateFixture(source) {
  fs.writeFileSync(fixturePath, source);
  assertPublishedSpecFileMatchesEntry(
    'control_plane_api',
    entry,
    publicSpec,
    catalogVersion,
  );
}

const validFixture = `openapi: 3.1.0
info:
  title: durable-workflow.v2.control-plane-api
x-durable-workflow-catalog-entry: control_plane_api
x-durable-workflow-catalog-version: 16
x-durable-workflow-evolution-rule: additive_minor_breaking_major
x-durable-workflow-object-families:
  - name: control_plane_request_contract
    owner_repo: durable-workflow/server
paths: {}
`;

const safeCatalogEntry = {
  description: 'Public control-plane protocol authority.',
  format: 'openapi',
  spec_id: entry.spec_id,
  surface_family: 'server_api',
  authority_manifest: 'control_plane',
  owner_repo: 'durable-workflow/server',
  object_families: entry.object_families,
  evolution_rule: entry.evolution_rule,
  breaking_change_release: 'major',
  status: 'published',
  spec_url:
    'https://durable-workflow.github.io/platform-protocol-specs/control-plane-api.openapi.yaml',
};

try {
  assert.doesNotThrow(
    () => assertPublishedSpecFileMatchesEntry(
      'worker_protocol_api',
      realWorkerEntry,
      realWorkerSpec,
      realCatalog.version,
    ),
    'the real worker OpenAPI metadata must match its public catalog entry',
  );

  const mismatchedWorkerEntry = {
    ...realWorkerEntry,
    object_families: realWorkerEntry.object_families.map(family => (
      family.name === 'worker_deregistration_result'
        ? {...family, name: 'wrong_worker_object_family'}
        : family
    )),
  };
  assert.throws(
    () => assertPublishedSpecFileMatchesEntry(
      'worker_protocol_api',
      mismatchedWorkerEntry,
      realWorkerSpec,
      realCatalog.version,
    ),
    /x-durable-workflow-object-families equal to the catalog entry's object_families/,
    'the real worker OpenAPI must reject catalog object-family metadata drift',
  );

  assert.doesNotThrow(
    () => validateFixture(validFixture),
    'a structurally valid OpenAPI fixture with matching metadata must pass',
  );

  assert.throws(
    () => validateFixture(`${validFixture}\nbroken: [\n`),
    /is not valid YAML/,
    'an unmatched flow-sequence bracket must fail structural YAML parsing',
  );

  const decoyIdentity = validFixture.replace(
    '  title: durable-workflow.v2.control-plane-api',
    `  title: wrong.identity
  description: |
    title: durable-workflow.v2.control-plane-api`,
  );
  assert.throws(
    () => validateFixture(decoyIdentity),
    /must declare info\.title: durable-workflow\.v2\.control-plane-api/,
    'identity-like text outside info.title must not satisfy OpenAPI identity validation',
  );

  const decoyFamilies = validFixture.replace(
    `x-durable-workflow-object-families:
  - name: control_plane_request_contract
    owner_repo: durable-workflow/server`,
    `x-durable-workflow-object-families:
  - name: wrong_family
    owner_repo: durable-workflow/server
x-decoy-object-families:
  - name: control_plane_request_contract
    owner_repo: durable-workflow/server`,
  );
  assert.throws(
    () => validateFixture(decoyFamilies),
    /x-durable-workflow-object-families equal to the catalog entry's object_families/,
    'object-family-like text outside the root metadata must not satisfy validation',
  );

  const catalogWithConformanceScript = {
    specs: {
      control_plane_api: {
        ...safeCatalogEntry,
        conformance_script: 'scripts/fake-conformance-check.js',
      },
    },
  };
  assert.throws(
    () => assertCatalogDoesNotExposeRepositoryLocalAuthority(catalogWithConformanceScript),
    /non-consumer field "conformance_script"/,
    'a repository-local conformance script must not become public catalog authority',
  );

  const catalogWithScriptPath = {
    specs: {
      control_plane_api: {
        ...safeCatalogEntry,
        description: 'Validated by scripts/fake-conformance-check.js.',
      },
    },
  };
  assert.throws(
    () => assertCatalogDoesNotExposeRepositoryLocalAuthority(catalogWithScriptPath),
    /repository-relative path/,
    'scripts paths must be rejected even when smuggled through a consumer-safe field',
  );

} finally {
  fs.rmSync(fixtureRoot, {recursive: true, force: true});
}

console.log('Platform-protocol-spec structural parsing adversarial checks passed.');
