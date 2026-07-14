#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

const {
  checkScheduleListOpenApiContract,
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

const authority = require('./server-openapi-authority.json');
assert.strictEqual(
  authority.repository,
  'durable-workflow/server',
  'the schedule-list mirror authority must name the server repository',
);
assert.match(
  authority.ref,
  /^[0-9a-f]{40}$/,
  'the schedule-list mirror authority must use an immutable server commit',
);

const workflowPath = path.join(
  __dirname,
  '..',
  '.github',
  'workflows',
  'protocol-specs.yml',
);
const workflow = fs.readFileSync(workflowPath, 'utf8');
for (const required of [
  'name: Resolve Server OpenAPI authority ref',
  "require('./scripts/server-openapi-authority.json').ref",
  'name: Fetch Server OpenAPI authority',
  "GIT_TERMINAL_PROMPT: '0'",
  'SERVER_OPENAPI_AUTHORITY_REF: ${{ steps.server-openapi-authority.outputs.ref }}',
  'git -C "${authority_path}" -c credential.helper= fetch',
  'https://github.com/durable-workflow/server.git',
  '"${SERVER_OPENAPI_AUTHORITY_REF}"',
  'actual_ref="$(git -C "${authority_path}" rev-parse HEAD)"',
  'test "${actual_ref}" = "${SERVER_OPENAPI_AUTHORITY_REF}"',
  'SERVER_REPO_PATH: ${{ github.workspace }}/.server-openapi-authority',
  'node scripts/check-schedule-list-openapi.js --require-server-mirror',
]) {
  assert(
    workflow.includes(required),
    `the protocol-spec workflow must enforce the server OpenAPI authority: ${required}`,
  );
}

const resolveAuthorityPosition = workflow.indexOf(
  '      - name: Resolve Server OpenAPI authority ref\n',
);
const fetchAuthorityPosition = workflow.indexOf(
  '      - name: Fetch Server OpenAPI authority\n',
);
const checkMirrorPosition = workflow.indexOf(
  '      - name: Check schedule-list OpenAPI server mirror\n',
);
assert(
  resolveAuthorityPosition < fetchAuthorityPosition &&
    fetchAuthorityPosition < checkMirrorPosition,
  'the protocol-spec workflow must resolve, fetch, verify, and compare the server authority in order',
);

assert(
  !workflow.includes('repository: durable-workflow/server'),
  'the server authority fetch must not resolve the public repository against the workflow host',
);

assert.throws(
  () => checkScheduleListOpenApiContract({
    serverRepoPath: '',
    requireServerMirror: true,
  }),
  /requires SERVER_REPO_PATH/,
  'the authoritative check must fail without an explicit server checkout',
);

const fixtureRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'schedule-list-openapi-'),
);
const mirrorPath = path.join(
  fixtureRoot,
  'resources',
  'platform-protocol-specs',
  'control-plane-api.openapi.yaml',
);

try {
  assert.throws(
    () => checkScheduleListOpenApiContract({
      serverRepoPath: fixtureRoot,
      requireServerMirror: true,
    }),
    /mirror does not exist/,
    'the authoritative check must fail when the checked-out mirror is absent',
  );

  fs.mkdirSync(path.dirname(mirrorPath), {recursive: true});
  fs.copyFileSync(specPath, mirrorPath);
  assert.doesNotThrow(
    () => checkScheduleListOpenApiContract({
      serverRepoPath: fixtureRoot,
      requireServerMirror: true,
    }),
    'an aligned server mirror must pass the authoritative check',
  );

  const divergentMirror = clone(valid);
  divergentMirror.components.parameters.NamespaceQueryOptional.description =
    'Selects a different namespace-routing contract.';
  fs.writeFileSync(mirrorPath, yaml.dump(divergentMirror));
  assert.throws(
    () => checkScheduleListOpenApiContract({
      serverRepoPath: fixtureRoot,
      requireServerMirror: true,
    }),
    /must remain aligned/,
    'a divergent server mirror must fail the authoritative check',
  );
} finally {
  fs.rmSync(fixtureRoot, {recursive: true, force: true});
}

console.log(
  'Schedule-list OpenAPI namespace routing and server-mirror checks passed.',
);
