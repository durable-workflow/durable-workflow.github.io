#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const repoRoot = path.join(__dirname, '..');
const catalog = require('../static/platform-protocol-specs.json');
const workerSpec = yaml.load(fs.readFileSync(
  path.join(
    repoRoot,
    'static',
    'platform-protocol-specs',
    'worker-protocol-api.openapi.yaml',
  ),
  'utf8',
));
const controlPlaneSpec = yaml.load(fs.readFileSync(
  path.join(
    repoRoot,
    'static',
    'platform-protocol-specs',
    'control-plane-api.openapi.yaml',
  ),
  'utf8',
));

assert.strictEqual(catalog.version, 16);
assert.strictEqual(workerSpec.info.version, '9');
assert.strictEqual(workerSpec['x-durable-workflow-catalog-version'], 16);

const route = workerSpec.paths['/worker/registrations/{workerId}'];
assert.deepStrictEqual(Object.keys(route), ['delete']);

const operation = route.delete;
assert.strictEqual(operation.operationId, 'deregisterWorker');
assert.deepStrictEqual(operation.tags, ['worker-lifecycle']);
assert.strictEqual(operation['x-durable-workflow-required-role'], 'worker');
assert.deepStrictEqual(
  operation.parameters.map(parameter => parameter.$ref),
  [
    '#/components/parameters/WorkerProtocolVersionHeader',
    '#/components/parameters/WorkerIdPath',
  ],
);
assert.strictEqual(operation.requestBody, undefined);

assert.deepStrictEqual(Object.keys(operation.responses), [
  '200',
  '400',
  '401',
  '403',
  '404',
  '409',
]);
assert.strictEqual(
  operation.responses['200'].$ref,
  '#/components/responses/WorkerDeregistrationEnvelope',
);
for (const status of ['400', '401', '403', '404', '409']) {
  assert.strictEqual(
    operation.responses[status].$ref,
    '#/components/responses/WorkerError',
    `${status} must retain the WorkerProtocol error envelope`,
  );
}

assert.deepStrictEqual(workerSpec.components.parameters.WorkerIdPath, {
  name: 'workerId',
  in: 'path',
  required: true,
  description: 'Worker registration identity in the resolved namespace.',
  schema: {type: 'string', minLength: 1, maxLength: 255},
});

const successSchema = workerSpec.components.responses
  .WorkerDeregistrationEnvelope.content['application/json'].schema;
assert.deepStrictEqual(successSchema.allOf, [
  {$ref: '#/components/schemas/WorkerEnvelope'},
  {$ref: '#/components/schemas/WorkerDeregistrationResult'},
]);
assert.deepStrictEqual(
  workerSpec.components.schemas.WorkerDeregistrationResult.required,
  ['worker_id', 'outcome', 'recovered_workflow_task_count'],
);
assert.strictEqual(
  workerSpec.components.schemas.WorkerDeregistrationResult
    .properties.outcome.const,
  'deregistered',
);

const catalogFamilies = catalog.specs.worker_protocol_api
  .object_families.map(family => family.name);
const documentFamilies = workerSpec['x-durable-workflow-object-families']
  .map(family => family.name);
assert(catalogFamilies.includes('worker_deregistration_result'));
assert.deepStrictEqual(documentFamilies, catalogFamilies);

assert.strictEqual(
  controlPlaneSpec.paths['/workers/{workerId}'].delete.operationId,
  'deleteWorker',
  'the administrator worker-management operation must remain unchanged',
);
assert.strictEqual(
  workerSpec.paths['/workers/{workerId}'],
  undefined,
  'the admin operation must not be copied into the worker-plane specification',
);

process.stdout.write(
  'Worker deregistration OpenAPI route, envelopes, role, and catalog metadata verified.\n',
);
