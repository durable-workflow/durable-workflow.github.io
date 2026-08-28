#!/usr/bin/env node

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const repoRoot = path.join(__dirname, '..');
const specRoot = path.join(repoRoot, 'static', 'platform-protocol-specs');
const openApiPath = path.join(specRoot, 'worker-protocol-api.openapi.yaml');
const asyncApiPath = path.join(specRoot, 'worker-protocol-stream.asyncapi.yaml');
const compatibility = require('../static/compatibility-contract.json');
const immutableProtocolVersions = Object.freeze({
  '1.15': Object.freeze({
    'worker-protocol-api.openapi.yaml':
      'd21a59e98ef46419b0792e716bd359c424a5759140474b838b1398083a291df6',
    'worker-protocol-stream.asyncapi.yaml':
      '388fd30483c0bb52c6b39cee219be3c9fc933ff815ccf4a06f9063c85902b458',
  }),
  '1.16': Object.freeze({
    'worker-protocol-api.openapi.yaml':
      '2dd330d52b8a36d1de0f364fc5f81311e2146f11ba1f77237e9c948e988c6817',
    'worker-protocol-stream.asyncapi.yaml':
      '05c966ba9e328a8d73e769f1303bd1d456be363e6dbb22cfa592c5177c47b5d0',
  }),
  '1.17': Object.freeze({
    'worker-protocol-api.openapi.yaml':
      'ebf84ff9443860085e503dfabbe0ccf7f313bed95b2261bef1e56abfbaab188e',
    'worker-protocol-stream.asyncapi.yaml':
      '2111f2dbd158468e186bc5acca9ab3467910ff64fd44494cc60dda30d020f6df',
  }),
});

function readYaml(file) {
  return yaml.load(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function supportsFeature(version, minimum) {
  const candidate = /^(\d+)\.(\d+)$/.exec(version);
  const floor = /^(\d+)\.(\d+)$/.exec(minimum);

  return candidate !== null &&
    floor !== null &&
    Number(candidate[1]) === Number(floor[1]) &&
    Number(candidate[2]) >= Number(floor[2]);
}

function assertMessageStreamItemSchemas(spec, completionSchema) {
  const fields = completionSchema.properties;

  assert.strictEqual(
    fields.message_stream_cursors['x-durable-workflow-minimum-protocol-version'],
    '1.15',
  );
  assert.strictEqual(fields.message_stream_cursors.maxItems, 100);
  assert.strictEqual(
    fields.message_stream_cursors.items.$ref,
    '#/components/schemas/MessageStreamCursorAdvance',
  );
  assert.strictEqual(
    fields.message_stream_waits['x-durable-workflow-minimum-protocol-version'],
    '1.15',
  );
  assert.strictEqual(fields.message_stream_waits.maxItems, 100);
  assert.strictEqual(
    fields.message_stream_waits.items.$ref,
    '#/components/schemas/MessageStreamWait',
  );

  assert.deepStrictEqual(
    spec.components.schemas.MessageStreamCursorAdvance.required,
    ['stream_name', 'through_position'],
  );
  assert.strictEqual(
    spec.components.schemas.MessageStreamCursorAdvance.properties.through_position.minimum,
    0,
  );
  assert.deepStrictEqual(
    spec.components.schemas.MessageStreamWait.required,
    ['stream_name', 'after_position'],
  );
  assert.strictEqual(
    spec.components.schemas.MessageStreamWait.properties.after_position.minimum,
    0,
  );
}

const openApi = readYaml(openApiPath);
const asyncApi = readYaml(asyncApiPath);
const advertisedVersion = compatibility.surface_families.worker_protocol.negotiation
  .default_advertised_version;
const acceptedVersions = compatibility.surface_families.worker_protocol.negotiation
  .accepted_request_versions_by_default;

assert.strictEqual(advertisedVersion, '1.17');
assert.strictEqual(
  openApi['x-durable-workflow-worker-protocol-negotiation'].default_advertised_version,
  advertisedVersion,
);
assert.strictEqual(
  asyncApi['x-durable-workflow-worker-protocol-negotiation'].default_advertised_version,
  advertisedVersion,
);
assert.deepStrictEqual(
  openApi['x-durable-workflow-worker-protocol-negotiation'].accepted_request_versions_by_default,
  acceptedVersions,
);
assert.deepStrictEqual(
  asyncApi['x-durable-workflow-worker-protocol-negotiation'].accepted_request_versions_by_default,
  acceptedVersions,
);

const openApiContract = openApi['x-durable-workflow-message-streams-contract'];
const asyncApiContract = asyncApi['x-durable-workflow-message-streams-contract'];
assert.deepStrictEqual(asyncApiContract, openApiContract);
assert.strictEqual(openApiContract.minimum_protocol_version, '1.15');
assert.strictEqual(openApiContract.worker_capability, 'message_streams');
assert.deepStrictEqual(
  openApiContract.completion_fields,
  ['message_stream_cursors', 'message_stream_waits'],
);
assert.deepStrictEqual(openApiContract.version_gate.workers_below_minimum, {
  advertise_capability: 'forbidden',
  submit_completion_fields: 'forbidden',
});
assert.strictEqual(openApiContract.version_gate.rejection_reason, 'message_streams_unavailable');

assert.strictEqual(supportsFeature('1.14', openApiContract.minimum_protocol_version), false);
assert.strictEqual(supportsFeature('1.15', openApiContract.minimum_protocol_version), true);
assert.strictEqual(supportsFeature('1.16', openApiContract.minimum_protocol_version), true);
assert.strictEqual(supportsFeature('2.15', openApiContract.minimum_protocol_version), false);

assert.strictEqual(
  openApi.components.schemas.WorkerRegistrationRequest.properties.capabilities[
    'x-durable-workflow-version-gated-values'
  ].message_streams,
  '1.15',
);
assert.strictEqual(
  openApi.components.schemas.MessageStreamsCapability.properties
    .minimum_worker_protocol_version.const,
  '1.15',
);
assertMessageStreamItemSchemas(
  openApi,
  openApi.components.schemas.WorkflowTaskCompleteRequest,
);

assert.strictEqual(
  asyncApi.components.messages.WorkflowTaskCompleted.payload.$ref,
  '#/components/schemas/WorkflowTaskCompletionEvent',
);
assertMessageStreamItemSchemas(
  asyncApi,
  asyncApi.components.schemas.WorkflowTaskCompletionEvent.allOf[1],
);

for (const [version, files] of Object.entries(immutableProtocolVersions)) {
  for (const [filename, digest] of Object.entries(files)) {
    const retainedPath = path.join(specRoot, `v${version}`, filename);
    const retained = readYaml(retainedPath);

    assert.strictEqual(
      sha256(retainedPath),
      digest,
      `the retained ${version} ${filename} must preserve its published bytes`,
    );
    assert.strictEqual(
      retained['x-durable-workflow-worker-protocol-negotiation'].default_advertised_version,
      version,
      `the retained ${filename} must preserve the ${version} negotiation authority`,
    );
    assert.strictEqual(
      retained['x-durable-workflow-message-streams-contract'].minimum_protocol_version,
      '1.15',
      `the retained ${filename} must preserve the message-stream protocol floor`,
    );
  }
}

console.log('Worker message-stream protocol contract and version gates passed.');
