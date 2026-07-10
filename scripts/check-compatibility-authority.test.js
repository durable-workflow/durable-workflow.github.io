#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  assertOpenApiAcceptedWorkerProtocolVersions,
  expectedAcceptedWorkerVersions,
} = require('./check-compatibility-authority');

const openApiPath = path.join(
  __dirname,
  '..',
  'static',
  'platform-protocol-specs',
  'worker-protocol-api.openapi.yaml',
);
const contractPath = path.join(__dirname, '..', 'static', 'compatibility-contract.json');
const openApi = fs.readFileSync(openApiPath, 'utf8');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const advertisedVersion =
  contract.surface_families.worker_protocol.negotiation.default_advertised_version;
const expectedVersions = expectedAcceptedWorkerVersions(advertisedVersion);
const expectedEnum = `enum: [${expectedVersions.map(version => `"${version}"`).join(', ')}]`;

assert.doesNotThrow(
  () => assertOpenApiAcceptedWorkerProtocolVersions(openApi, expectedVersions),
  'the published request-header enum must match the complete negotiation window',
);

const narrowedOpenApi = openApi.replace(expectedEnum, 'enum: ["1.0", "1.1"]');
assert.notStrictEqual(
  narrowedOpenApi,
  openApi,
  'the adversarial fixture must narrow the actual OpenAPI request-header enum',
);
assert.throws(
  () => assertOpenApiAcceptedWorkerProtocolVersions(narrowedOpenApi, expectedVersions),
  /AcceptedWorkerProtocolRequestVersion\.enum must exactly match the computed negotiation window/,
  'narrowing the OpenAPI enum must fail compatibility-authority validation',
);

console.log('Compatibility-authority adversarial drift checks passed.');
