#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const repoRoot = path.join(__dirname, '..');
const catalog = require('../static/platform-protocol-specs.json');
const workerEntry = catalog.specs.worker_protocol_api;
const specUrl = new URL(workerEntry.spec_url);

assert.strictEqual(specUrl.origin, 'https://durable-workflow.github.io');
assert.strictEqual(
  specUrl.pathname,
  '/platform-protocol-specs/worker-protocol-api.openapi.yaml',
);

const specPath = path.join(repoRoot, 'static', specUrl.pathname.replace(/^\/+/, ''));
assert(fs.existsSync(specPath), 'the worker protocol catalog URL must resolve to a published file');

const spec = yaml.load(fs.readFileSync(specPath, 'utf8'));
assert.strictEqual(spec.info.title, workerEntry.spec_id);
assert.strictEqual(spec.info.version, '11');
assert(
  spec.components.responses.WorkflowTaskPollConflict.content['application/json']
    .schema.oneOf.some(
      branch => branch.$ref === '#/components/schemas/CachedPollTaskKindConflict',
    ),
  'worker OpenAPI version 11 must include the cached-poll conflict union branch',
);

const negotiation = spec['x-durable-workflow-worker-protocol-negotiation'];
assert.strictEqual(negotiation.default_advertised_version, '1.15');
assert.deepStrictEqual(
  negotiation.fail_closed_on,
  ['missing_header', 'malformed_version', 'different_major', 'minor_greater_than_advertised'],
);

console.log('Worker OpenAPI catalog resolution and document version passed.');
