#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const protocolCatalog = require('../static/platform-protocol-specs.json');
const compatibilityContract = require('../static/compatibility-contract.json');
const conformanceContract = require('../static/platform-conformance-contract.json');
const {
  CURRENT_CONFORMANCE_ROLE,
  CURRENT_SERVER_ROLE,
  HISTORICAL_CONFORMANCE_ROLE,
  deriveWorkerProtocolAuthorityRoles,
} = require('../src/components/WorkerProtocolAuthorityRoles/roles');

const repoRoot = path.join(__dirname, '..');
const publicProtocolPrefix =
  'https://durable-workflow.github.io/platform-protocol-specs/';
const pageContracts = Object.freeze([
  Object.freeze({
    source: 'docs/compatibility.md',
    rendered: 'build/docs/2.0/compatibility/index.html',
  }),
  Object.freeze({
    source: 'docs/platform-protocol-specs.md',
    rendered: 'build/docs/2.0/platform-protocol-specs/index.html',
  }),
  Object.freeze({
    source: 'docs/platform-conformance.md',
    rendered: 'build/docs/2.0/platform-conformance/index.html',
  }),
]);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function localSpecPath(specUrl, label) {
  if (!specUrl.startsWith(publicProtocolPrefix)) {
    throw new Error(`${label} is outside the public protocol namespace`);
  }
  const relativePath = specUrl.slice(publicProtocolPrefix.length);
  if (
    relativePath.length === 0
    || relativePath.includes('..')
    || path.posix.isAbsolute(relativePath)
  ) {
    throw new Error(`${label} does not map to a safe public protocol path`);
  }
  return `static/platform-protocol-specs/${relativePath}`;
}

function negotiationVersion(specSource, label) {
  let document;
  try {
    document = yaml.load(specSource);
  } catch (error) {
    throw new Error(`${label} is not valid YAML: ${error.message}`);
  }
  const version = document?.['x-durable-workflow-worker-protocol-negotiation']
    ?.default_advertised_version;
  if (typeof version !== 'string' || !/^\d+\.\d+$/.test(version)) {
    throw new Error(`${label} must declare a worker protocol negotiation version`);
  }
  return version;
}

function assertAuthorityContracts({
  catalog = protocolCatalog,
  compatibility = compatibilityContract,
  conformance = conformanceContract,
  readSource = read,
} = {}) {
  const roles = deriveWorkerProtocolAuthorityRoles({
    catalog,
    compatibilityContract: compatibility,
    conformanceContract: conformance,
  });

  for (const [surface, specUrl] of [
    ['API', roles.currentServer.apiUrl],
    ['stream', roles.currentServer.streamUrl],
  ]) {
    const specPath = localSpecPath(specUrl, `current Server ${surface} resolver`);
    const actualVersion = negotiationVersion(
      readSource(specPath),
      `current Server ${surface} specification`,
    );
    if (actualVersion !== roles.currentServer.protocolVersion) {
      throw new Error(
        `current Server ${surface} specification advertises protocol ${actualVersion}, `
        + `but the compatibility marker advertises ${roles.currentServer.protocolVersion}`,
      );
    }
  }

  for (const [surface, specUrl] of [
    ['API', roles.currentConformance.apiUrl],
    ['stream', roles.currentConformance.streamUrl],
  ]) {
    const specPath = localSpecPath(specUrl, `current conformance ${surface} resolver`);
    const actualVersion = negotiationVersion(
      readSource(specPath),
      `current conformance ${surface} specification`,
    );
    if (actualVersion !== roles.currentConformance.protocolVersion) {
      throw new Error(
        `current conformance ${surface} specification advertises protocol ${actualVersion}, `
        + `but its current binding targets ${roles.currentConformance.protocolVersion}`,
      );
    }
  }

  return roles;
}

function assertPageDeclaration(source, label) {
  const imports = source.match(
    /import\s+WorkerProtocolAuthorityRoles\s+from\s+['"]@site\/src\/components\/WorkerProtocolAuthorityRoles['"];?/g,
  ) || [];
  const elements = source.match(/<WorkerProtocolAuthorityRoles\s*\/>/g) || [];
  if (imports.length !== 1 || elements.length !== 1) {
    throw new Error(
      `${label} must import and render exactly one WorkerProtocolAuthorityRoles block`,
    );
  }
}

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseAttributes(source) {
  return Object.fromEntries(
    [...source.matchAll(/([:\w-]+)="([^"]*)"/g)]
      .map(match => [match[1], decodeHtml(match[2])]),
  );
}

function assertAttribute(attributes, field, expected, label) {
  if (attributes[field] !== String(expected)) {
    throw new Error(
      `${label} ${field} must be ${JSON.stringify(String(expected))}, `
      + `got ${JSON.stringify(attributes[field])}`,
    );
  }
}

function assertRenderedAuthorityRoles(html, roles, label) {
  const roots = [...html.matchAll(/<section\b([^>]*)>/g)]
    .map(match => parseAttributes(match[1]))
    .filter(attributes => attributes['data-worker-protocol-authority-roles'] === 'true');
  if (roots.length !== 1) {
    throw new Error(`${label} must render exactly one worker protocol authority-role block`);
  }
  const root = roots[0];
  assertAttribute(
    root,
    'data-current-server-protocol-version',
    roles.currentServer.protocolVersion,
    label,
  );
  assertAttribute(
    root,
    'data-current-conformance-protocol-version',
    roles.currentConformance.protocolVersion,
    label,
  );
  assertAttribute(
    root,
    'data-current-conformance-suite-version',
    roles.currentConformance.suiteVersion,
    label,
  );

  const rows = new Map();
  for (const match of html.matchAll(/<tr\b([^>]*)>/g)) {
    const attributes = parseAttributes(match[1]);
    const role = attributes['data-worker-protocol-role'];
    if (!role) continue;
    if (rows.has(role)) throw new Error(`${label} repeats protocol role ${role}`);
    rows.set(role, attributes);
  }
  const expectedRoles = [
    CURRENT_SERVER_ROLE,
    CURRENT_CONFORMANCE_ROLE,
    HISTORICAL_CONFORMANCE_ROLE,
  ];
  if (
    JSON.stringify([...rows.keys()].sort())
    !== JSON.stringify([...expectedRoles].sort())
  ) {
    throw new Error(`${label} rendered protocol roles do not match the semantic authority model`);
  }

  const server = rows.get(CURRENT_SERVER_ROLE);
  assertAttribute(server, 'data-protocol-version', roles.currentServer.protocolVersion, label);
  assertAttribute(server, 'data-resolver-role', roles.currentServer.resolverRole, label);
  assertAttribute(server, 'data-api-url', roles.currentServer.apiUrl, label);
  assertAttribute(server, 'data-stream-url', roles.currentServer.streamUrl, label);

  const current = rows.get(CURRENT_CONFORMANCE_ROLE);
  assertAttribute(
    current,
    'data-protocol-version',
    roles.currentConformance.protocolVersion,
    label,
  );
  assertAttribute(
    current,
    'data-suite-version',
    roles.currentConformance.suiteVersion,
    label,
  );
  assertAttribute(current, 'data-resolver-role', roles.currentConformance.resolverRole, label);
  assertAttribute(current, 'data-api-url', roles.currentConformance.apiUrl, label);
  assertAttribute(current, 'data-stream-url', roles.currentConformance.streamUrl, label);

  const historical = rows.get(HISTORICAL_CONFORMANCE_ROLE);
  assertAttribute(
    historical,
    'data-history-protocol-versions',
    roles.historicalConformance.protocolVersions.join(', '),
    label,
  );
  assertAttribute(
    historical,
    'data-history-binding-count',
    roles.historicalConformance.bindingCount,
    label,
  );
  assertAttribute(
    historical,
    'data-resolver-role',
    roles.historicalConformance.resolverRole,
    label,
  );
}

function assertExplanatoryPages(roles, {rendered = false, readSource = read} = {}) {
  for (const page of pageContracts) {
    assertPageDeclaration(readSource(page.source), page.source);
    if (rendered) {
      assertRenderedAuthorityRoles(readSource(page.rendered), roles, page.rendered);
    }
  }
}

function main() {
  const rendered = process.argv.includes('--rendered');
  const roles = assertAuthorityContracts();
  assertExplanatoryPages(roles, {rendered});
  console.log(
    `Worker protocol authority roles are aligned: Server ${roles.currentServer.protocolVersion}; `
    + `conformance suite ${roles.currentConformance.suiteVersion} targets `
    + `${roles.currentConformance.protocolVersion}.`,
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  assertAuthorityContracts,
  assertExplanatoryPages,
  assertPageDeclaration,
  assertRenderedAuthorityRoles,
  negotiationVersion,
};
