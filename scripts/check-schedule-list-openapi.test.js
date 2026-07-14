#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const {
  scheduleListNamespaceRoutingSnapshot,
} = require('./check-schedule-list-openapi');

const specPath = path.join(
  __dirname,
  '..',
  'static',
  'platform-protocol-specs',
  'control-plane-api.openapi.yaml',
);
const valid = yaml.load(fs.readFileSync(specPath, 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

assert.doesNotThrow(
  () => scheduleListNamespaceRoutingSnapshot(valid, 'fixture'),
  'the published schedule-list namespace contract must pass',
);

const withoutQueryCarrier = clone(valid);
withoutQueryCarrier.paths['/schedules'].get.parameters =
  withoutQueryCarrier.paths['/schedules'].get.parameters.filter(
    (parameter) =>
      parameter.$ref !== '#/components/parameters/NamespaceQueryOptional',
  );
assert.throws(
  () => scheduleListNamespaceRoutingSnapshot(withoutQueryCarrier, 'fixture'),
  /NamespaceQueryOptional/,
  'removing the namespace query carrier must fail',
);

const reversedPrecedence = clone(valid);
reversedPrecedence.paths['/schedules'].get[
  'x-durable-workflow-namespace-routing'
].precedence = ['query', 'header', 'server_default'];
assert.throws(
  () => scheduleListNamespaceRoutingSnapshot(reversedPrecedence, 'fixture'),
  /header-over-query namespace routing/,
  'query-over-header precedence must fail',
);

const unscopedToken = clone(valid);
unscopedToken.paths['/schedules'].get[
  'x-durable-workflow-namespace-routing'
].continuation_token_scope = 'filters_only';
assert.throws(
  () => scheduleListNamespaceRoutingSnapshot(unscopedToken, 'fixture'),
  /resolved-namespace token scope/,
  'continuation tokens without resolved-namespace scope must fail',
);

console.log('Schedule-list OpenAPI namespace routing adversarial checks passed.');
