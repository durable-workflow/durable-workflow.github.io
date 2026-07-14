#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const repoRoot = path.join(__dirname, '..');
const docsSpecPath = path.join(
  repoRoot,
  'static',
  'platform-protocol-specs',
  'control-plane-api.openapi.yaml',
);

const EXPECTED_PARAMETER_REFS = [
  '#/components/parameters/NamespaceHeaderOptional',
  '#/components/parameters/NamespaceQueryOptional',
];
const EXPECTED_ROUTING = {
  carriers: [
    {in: 'header', name: 'X-Namespace'},
    {in: 'query', name: 'namespace'},
  ],
  precedence: ['header', 'query', 'server_default'],
  continuation_token_scope: 'resolved_namespace',
};

function loadOpenApiFile(specPath, label) {
  let document;

  try {
    document = yaml.load(fs.readFileSync(specPath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid YAML: ${error.message}`);
  }

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error(`${label} must parse as an OpenAPI object.`);
  }

  return document;
}

function scheduleListNamespaceRoutingSnapshot(document, label) {
  const operation = document.paths?.['/schedules']?.get;
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
    throw new Error(`${label} must declare GET /schedules.`);
  }

  if (operation.operationId !== 'listSchedules') {
    throw new Error(`${label} GET /schedules must use operationId listSchedules.`);
  }

  const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
  const parameterRefs = parameters
    .map((parameter) => parameter?.$ref)
    .filter((ref) => typeof ref === 'string');

  for (const expectedRef of EXPECTED_PARAMETER_REFS) {
    if (!parameterRefs.includes(expectedRef)) {
      throw new Error(
        `${label} listSchedules must reference ${expectedRef}.`,
      );
    }
  }

  const carriers = EXPECTED_PARAMETER_REFS.map((ref) => {
    const componentName = ref.slice('#/components/parameters/'.length);
    const parameter = document.components?.parameters?.[componentName];
    if (!parameter || typeof parameter !== 'object' || Array.isArray(parameter)) {
      throw new Error(`${label} must define parameter component ${componentName}.`);
    }

    const expected = EXPECTED_ROUTING.carriers.find(
      (carrier) => carrier.in === parameter.in && carrier.name === parameter.name,
    );
    if (!expected) {
      throw new Error(
        `${label} ${componentName} must describe a supported namespace carrier.`,
      );
    }
    if (parameter.required !== false) {
      throw new Error(`${label} ${componentName} must be optional.`);
    }
    if (parameter.schema?.type !== 'string' || parameter.schema?.minLength !== 1) {
      throw new Error(`${label} ${componentName} must require a non-empty string.`);
    }
    if (typeof parameter.description !== 'string' || parameter.description.trim() === '') {
      throw new Error(`${label} ${componentName} must document its routing behavior.`);
    }

    return {
      component: componentName,
      in: parameter.in,
      name: parameter.name,
      required: parameter.required,
      schema: parameter.schema,
      description: parameter.description.trim(),
    };
  });

  const routing = operation['x-durable-workflow-namespace-routing'];
  assert.deepStrictEqual(
    routing,
    EXPECTED_ROUTING,
    `${label} listSchedules must declare header-over-query namespace routing and resolved-namespace token scope.`,
  );

  const token = document.components?.parameters?.ScheduleNextPageTokenQuery;
  if (!token || typeof token !== 'object' || Array.isArray(token)) {
    throw new Error(`${label} must define ScheduleNextPageTokenQuery.`);
  }
  if (!/bound to namespace/i.test(token.description ?? '')) {
    throw new Error(
      `${label} ScheduleNextPageTokenQuery must document namespace binding.`,
    );
  }

  return {
    operationId: operation.operationId,
    carriers,
    routing,
    tokenDescription: token.description.trim(),
  };
}

function serverMirrorPath(serverRepoPath = process.env.SERVER_REPO_PATH) {
  if (serverRepoPath) {
    return path.join(
      serverRepoPath,
      'resources',
      'platform-protocol-specs',
      'control-plane-api.openapi.yaml',
    );
  }

  const sibling = path.join(
    repoRoot,
    '..',
    'server',
    'resources',
    'platform-protocol-specs',
    'control-plane-api.openapi.yaml',
  );

  return fs.existsSync(sibling) ? sibling : null;
}

function checkScheduleListOpenApiContract(options = {}) {
  const serverRepoPath = Object.prototype.hasOwnProperty.call(options, 'serverRepoPath')
    ? options.serverRepoPath
    : process.env.SERVER_REPO_PATH;
  const requireServerMirror = options.requireServerMirror === true;

  const docsDocument = loadOpenApiFile(
    docsSpecPath,
    'published control-plane OpenAPI',
  );
  const docsSnapshot = scheduleListNamespaceRoutingSnapshot(
    docsDocument,
    'published control-plane OpenAPI',
  );

  if (requireServerMirror && !serverRepoPath) {
    throw new Error(
      'The authoritative schedule-list OpenAPI check requires SERVER_REPO_PATH.',
    );
  }

  const mirrorPath = serverMirrorPath(serverRepoPath);
  if (mirrorPath !== null) {
    if (!fs.existsSync(mirrorPath)) {
      throw new Error(
        `SERVER_REPO_PATH was set, but the control-plane OpenAPI mirror does not exist at ${mirrorPath}.`,
      );
    }

    const mirrorSnapshot = scheduleListNamespaceRoutingSnapshot(
      loadOpenApiFile(mirrorPath, 'server control-plane OpenAPI mirror'),
      'server control-plane OpenAPI mirror',
    );
    assert.deepStrictEqual(
      mirrorSnapshot,
      docsSnapshot,
      'Published and server-mirrored listSchedules namespace parameters must remain aligned.',
    );
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const unknownArgs = args.filter((arg) => arg !== '--require-server-mirror');
  if (unknownArgs.length > 0) {
    throw new Error(`Unknown argument: ${unknownArgs[0]}`);
  }

  checkScheduleListOpenApiContract({
    requireServerMirror: args.includes('--require-server-mirror'),
  });
  console.log('Schedule-list OpenAPI namespace routing contract passed.');
}

module.exports = {
  EXPECTED_ROUTING,
  checkScheduleListOpenApiContract,
  loadOpenApiFile,
  scheduleListNamespaceRoutingSnapshot,
  serverMirrorPath,
};
