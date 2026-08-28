#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const spec = yaml.load(fs.readFileSync(path.join(
  __dirname,
  '..',
  'static',
  'platform-protocol-specs',
  'worker-protocol-api.openapi.yaml',
), 'utf8'));
const advertisedProtocolVersion = spec[
  'x-durable-workflow-worker-protocol-negotiation'
].default_advertised_version;

const serverRepo = process.env.SERVER_REPO_PATH || path.join(__dirname, '..', '..', 'server');
const serverMirror = path.join(
  serverRepo,
  'resources',
  'platform-protocol-specs',
  'worker-protocol-api.openapi.yaml',
);

if (fs.existsSync(serverMirror)) {
  assert.deepStrictEqual(
    yaml.load(fs.readFileSync(serverMirror, 'utf8')),
    spec,
    'The Server-owned OpenAPI contract and public catalog mirror must remain byte-equivalent in meaning.',
  );
} else if (process.env.SERVER_REPO_PATH) {
  throw new Error(`SERVER_REPO_PATH does not contain the worker protocol mirror at ${serverMirror}`);
}

function localRef(ref) {
  assert.match(ref, /^#\//, `Only local OpenAPI references are expected, got ${ref}`);
  return ref.slice(2).split('/').reduce((value, part) => value[part], spec);
}

function typeMatches(type, value) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function validate(schema, value, pointer = '$') {
  if (schema === true || schema === undefined) return;
  if (schema === false) throw new Error(`${pointer} is forbidden by the schema`);
  if (schema.$ref) return validate(localRef(schema.$ref), value, pointer);
  if (schema.allOf) schema.allOf.forEach((part) => validate(part, value, pointer));
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((part) => {
      try {
        validate(part, value, pointer);
        return true;
      } catch {
        return false;
      }
    });
    if (matches.length !== 1) {
      throw new Error(`${pointer} must match exactly one union branch; matched ${matches.length}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    assert.deepStrictEqual(value, schema.const, `${pointer} must match const`);
  }
  if (schema.enum) assert(schema.enum.includes(value), `${pointer} must match enum`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    assert(types.some((type) => typeMatches(type, value)), `${pointer} must be ${types.join(' or ')}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined) assert(value.length >= schema.minLength, `${pointer} is too short`);
    if (schema.maxLength !== undefined) assert(value.length <= schema.maxLength, `${pointer} is too long`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined) assert(value >= schema.minimum, `${pointer} is below minimum`);
    if (schema.maximum !== undefined) assert(value <= schema.maximum, `${pointer} exceeds maximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) assert(value.length >= schema.minItems, `${pointer} has too few items`);
    if (schema.maxItems !== undefined) assert(value.length <= schema.maxItems, `${pointer} has too many items`);
    if (schema.uniqueItems) assert.strictEqual(new Set(value.map(JSON.stringify)).size, value.length, `${pointer} must contain unique items`);
    if (schema.items) value.forEach((item, index) => validate(schema.items, item, `${pointer}/${index}`));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required || []) {
      assert(Object.prototype.hasOwnProperty.call(value, required), `${pointer}/${required} is required`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties?.[key]) {
        validate(schema.properties[key], child, `${pointer}/${key}`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validate(schema.additionalProperties, child, `${pointer}/${key}`);
      } else if (schema.additionalProperties === false) {
        throw new Error(`${pointer}/${key} is not allowed`);
      }
    }
  }
}

function operationSchema(route, status, request = false) {
  const operation = spec.paths[route].post;
  const carrier = request ? operation.requestBody : operation.responses[status];
  const resolved = carrier.$ref ? localRef(carrier.$ref) : carrier;
  return resolved.content['application/json'].schema;
}

const capability = {
  supported: true,
  minimum_protocol_version: '1.13',
  acceptance_boundary: 'validator_approved',
  worker_capability: 'update_validation_tasks',
  workflow_contract_field: 'update_validators',
  task_poll: {
    strategy: 'multiplexed',
    endpoint: '/worker/workflow-tasks/poll',
    request_field: 'task_kinds',
    task_kinds: ['workflow', 'update_validation'],
    default_task_kinds: ['workflow'],
    response_discriminator: 'task.task_kind',
    poll_request_id_binding: 'normalized_task_kind_set',
    poll_request_id_conflict_reason: 'poll_request_task_kinds_conflict',
  },
  completion: {
    approve_endpoint: '/worker/update-validation-tasks/{taskId}/approve',
    reject_endpoint: '/worker/update-validation-tasks/{taskId}/reject',
    fence_fields: ['lease_owner', 'update_validation_attempt'],
    typed_failure_reasons: [
      'update_validation_task_not_found',
      'duplicate_update_validation_completion',
      'update_validation_task_not_leased',
      'update_validation_lease_owner_mismatch',
      'stale_update_validation_completion',
      'update_validation_lease_expired',
      'update_validator_worker_lost',
    ],
  },
};
const server_capabilities = {
  supported_workflow_task_commands: [
    'complete_workflow',
    'schedule_activity',
    'upsert_memo',
    'upsert_search_attributes',
  ],
  workflow_task_poll_request_idempotency: true,
  workflow_memo_updates: {
    supported: true,
    type: 'upsert_memo',
    minimum_protocol_version: '1.14',
    worker_capability: 'memo_upserts',
    required_fields: ['type', 'entries'],
    entries: {},
    merge: {},
    history: {},
    idempotency: {},
    continue_as_new: 'merged memo is inherited before commands on the continued run',
    external_payloads: {},
  },
  message_streams: {
    schema: 'durable-workflow.v2.message-streams.contract',
    version: 1,
    capability_flag: 'message_streams',
    minimum_worker_protocol_version: '1.15',
    supported: true,
  },
  typed_search_attributes: {
    supported: true,
    minimum_worker_protocol_version: '1.16',
    worker_capability: 'typed_search_attributes',
    canonical_types: ['string', 'keyword', 'keyword_list', 'int', 'float', 'bool', 'datetime'],
    command_field: 'attribute_types',
    history_field: 'attribute_types',
    legacy_history_rule: 'absent_metadata_is_unknown_type_identity',
  },
  condition_wait_occurrence_identity: {
    supported: true,
    minimum_worker_protocol_version: '1.17',
    command_type: 'open_condition_wait',
    command_field: 'condition_wait_occurrence_id',
    history_field: 'condition_wait_occurrence_id',
    history_events: [
      'ConditionWaitOpened',
      'ConditionWaitSatisfied',
      'ConditionWaitTimedOut',
      'TimerScheduled',
      'TimerFired',
      'TimerCancelled',
    ],
    history_routing: 'requires_minimum_worker_protocol_version',
  },
  local_activities: {
    schema: 'durable-workflow.v2.local-activity.contract',
    version: 1,
    supported: true,
    worker_capability: 'local_activities',
    minimum_worker_protocol_version: '1.18',
    execution: {},
    retry: {},
    timeouts: {},
    visibility: {},
  },
  sticky_execution: {
    feature: 'sticky_execution',
    supported: true,
    worker_capability: 'sticky_execution',
    minimum_worker_protocol_version: '1.18',
    cache_key_fields: ['workflow_id', 'run_id', 'build_id'],
    correctness_fallback: 'cold_replay',
    metrics: ['hit', 'miss', 'eviction', 'forced_cold_replay'],
  },
  update_validation_tasks: true,
  synchronous_update_validation: capability,
};
const envelope = (body) => ({
  ...body,
  protocol_version: advertisedProtocolVersion,
  server_capabilities,
});

const multiplexRoute = '/worker/workflow-tasks/poll';
const multiplexRequest = operationSchema(multiplexRoute, null, true);
validate(multiplexRequest, {
  worker_id: 'worker-1',
  task_queue: 'payments',
  poll_request_id: 'poll-1',
  task_kinds: ['workflow', 'update_validation'],
  timeout_seconds: 30,
});
validate(multiplexRequest, {worker_id: 'worker-1', task_queue: 'payments'});

const multiplexResponse = operationSchema(multiplexRoute, '200');
const workflowClaim = envelope({
  poll_status: 'leased',
  task: {
    task_kind: 'workflow',
    task_id: 'task-1',
    workflow_id: 'workflow-1',
    run_id: 'run-1',
    workflow_task_attempt: 1,
    lease_owner: 'worker-1',
    lease_expires_at: '2026-08-10T08:00:00Z',
    history_events: [],
  },
});
const validationTask = {
  task_kind: 'update_validation',
  update_validation_task_id: 'validation-1',
  update_id: 'validation-1',
  update_validation_attempt: 1,
  workflow_id: 'workflow-1',
  run_id: 'run-1',
  workflow_type: 'InvoiceWorkflow',
  compatibility: null,
  update_name: 'approve',
  update_arguments: {codec: 'avro', blob: 'AA=='},
  payload_codec: 'avro',
  task_queue: 'payments',
  lease_owner: 'worker-1',
  lease_expires_at: '2026-08-10T08:00:00Z',
};
const validationClaim = envelope({poll_status: 'leased', task: validationTask});
validate(multiplexResponse, workflowClaim);
validate(multiplexResponse, validationClaim);
validate(multiplexResponse, envelope({task: null, poll_status: 'empty'}));

assert.throws(
  () => validate(multiplexResponse, envelope({
    poll_status: 'leased',
    task: {...validationTask, task_kind: 'workflow'},
  })),
  /exactly one union branch|required/,
  'the task.task_kind discriminator must reject a payload using the wrong branch',
);

const samePollRequestConflict = envelope({
  task: null,
  poll_status: 'conflict',
  reason: 'poll_request_task_kinds_conflict',
  error: 'Poll request ID is already bound to a different task-kind set.',
  poll_request_id: 'poll-1',
  requested_task_kinds: ['workflow'],
  bound_task_kinds: ['update_validation', 'workflow'],
});
const pollConflictResponse = operationSchema(multiplexRoute, '409');
validate(pollConflictResponse, samePollRequestConflict);

const legacyCachedTaskConflict = envelope({
  task: null,
  poll_status: 'conflict',
  reason: 'poll_cached_task_kind_conflict',
  error: 'Cached poll result has no task-kind discriminator and cannot be replayed safely.',
  poll_request_id: 'poll-legacy-1',
  requested_task_kinds: ['workflow'],
  cached_task_kind: null,
  cached_task_kind_state: 'legacy_missing_discriminator',
});
validate(pollConflictResponse, legacyCachedTaskConflict);

validate(pollConflictResponse, {
  ...legacyCachedTaskConflict,
  error: 'Cached poll result has an unrequested task-kind discriminator and cannot be replayed safely.',
  requested_task_kinds: ['update_validation'],
  cached_task_kind: 'workflow',
  cached_task_kind_state: 'unrequested_discriminator',
});

assert.throws(
  () => validate(pollConflictResponse, {
    ...legacyCachedTaskConflict,
    cached_task_kind: 'workflow',
  }),
  /exactly one union branch/,
  'a legacy cached-task conflict must not pair a known task kind with the missing-discriminator state',
);

assert.throws(
  () => validate(pollConflictResponse, {
    ...samePollRequestConflict,
    requested_task_kinds: 'workflow',
  }),
  /exactly one union branch/,
  'a same-ID conflict must reject a non-array requested task-kind set',
);
assert.throws(
  () => validate(pollConflictResponse, {
    ...samePollRequestConflict,
    bound_task_kinds: 'update_validation',
  }),
  /exactly one union branch/,
  'a same-ID conflict must reject a non-array bound task-kind set',
);

const validatorPollRoute = '/worker/update-validation-tasks/poll';
validate(operationSchema(validatorPollRoute, null, true), {
  worker_id: 'worker-1',
  task_queue: 'payments',
  timeout_seconds: 10,
});
validate(operationSchema(validatorPollRoute, '200'), validationClaim);

const approveRoute = '/worker/update-validation-tasks/{taskId}/approve';
const rejectRoute = '/worker/update-validation-tasks/{taskId}/reject';
validate(operationSchema(approveRoute, null, true), {
  lease_owner: 'worker-1',
  update_validation_attempt: 1,
});
validate(operationSchema(rejectRoute, null, true), {
  lease_owner: 'worker-1',
  update_validation_attempt: 1,
  failure: {
    message: 'amount must be positive',
    reason: 'update_validator_rejected',
    validation_errors: {amount: ['must be positive']},
  },
});
validate(operationSchema(approveRoute, '200'), envelope({
  update_validation_task_id: 'validation-1',
  update_id: 'validation-1',
  update_validation_attempt: 1,
  outcome: 'approved',
  status: 200,
}));
validate(operationSchema(rejectRoute, '200'), envelope({
  update_validation_task_id: 'validation-1',
  update_id: 'validation-1',
  update_validation_attempt: 1,
  outcome: 'rejected',
  reason: 'update_validator_rejected',
  status: 200,
}));
validate(operationSchema(approveRoute, '409'), envelope({
  update_validation_task_id: 'validation-1',
  update_id: 'validation-1',
  update_validation_attempt: 2,
  outcome: 'rejected',
  reason: 'stale_update_validation_completion',
  error: 'Update validation completion belongs to a stale delivery attempt.',
  status: 409,
}));

assert.strictEqual(spec['x-durable-workflow-catalog-version'], 16);
assert.strictEqual(
  spec.components.schemas.MultiplexedWorkflowTask.discriminator.propertyName,
  'task_kind',
);
assert.strictEqual(
  spec.components.schemas.WorkflowTaskPollResponse['x-durable-workflow-discriminator'],
  'task.task_kind',
);

process.stdout.write('Multiplexed update-validation OpenAPI requests, responses, discriminator, cache replay fences, completion fences, and typed conflicts validated.\n');
