#!/usr/bin/env node
//
// Release-check gate for the platform conformance-suite manifest.
//
// `static/platform-conformance-contract.json` is the machine-readable
// docs-site mirror of `durable-workflow.v2.platform-conformance.suite`.
// That manifest is also advertised from `GET /api/cluster/info` under
// `platform_conformance_suite`, so every public authority pointer in the
// mirror must resolve to published docs-site content.

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const docsDir = path.join(repoRoot, 'docs');
const configPath = path.join(repoRoot, 'docusaurus.config.js');
const contractPath = path.join(repoRoot, 'static', 'platform-conformance-contract.json');
const authorityDocPath = path.join(repoRoot, 'docs', 'platform-conformance.md');
const protocolSpecsDocPath = path.join(repoRoot, 'docs', 'platform-protocol-specs.md');
const sidebarsPath = path.join(repoRoot, 'sidebars.js');

const EXPECTED_SCHEMA = 'durable-workflow.v2.platform-conformance.suite';
const EXPECTED_RUNTIME_SCENARIO_SCHEMA =
  'durable-workflow.v2.platform-conformance.runtime-scenarios';
const REQUIRED_RUNTIME_SCENARIO_STATUSES = [
  'pass',
  'fail',
  'unsupported',
  'not_covered',
  'runner_blocked',
];
const EXPECTED_AUTHORITY_DOC = 'docs/platform-conformance.md';
const EXPECTED_DOC_ID = 'platform-conformance';

const REQUIRED_TOP_LEVEL_KEYS = [
  'schema',
  'version',
  'authority_doc',
  'authority_url',
  'surface_stability_authority',
  'result_schema',
  'result_version',
  'conformance_levels',
  'targets',
  'fixture_catalog',
  'pass_fail_rules',
  'harness_contract',
  'release_gates',
];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function loadJson(file, label) {
  let raw;
  try {
    raw = read(file);
  } catch (err) {
    throw new Error(`${label} is missing at ${file}.`);
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label} is not valid JSON: ${err.message}`);
  }
}

function stripTrailingSlash(value) {
  return value.length > 1 ? value.replace(/\/$/, '') : value;
}

function joinRoute(prefix, docId) {
  const normalizedPrefix = stripTrailingSlash(prefix);
  const normalizedDocId = docId.replace(/^\/+/, '').replace(/\/$/, '');

  if (!normalizedDocId) {
    return normalizedPrefix;
  }

  return `${normalizedPrefix}/${normalizedDocId}`;
}

function getDocsVersionPaths() {
  const configContent = read(configPath);
  const versionBlockMatch = configContent.match(/versions:\s*\{([\s\S]*?)\n\s*\},\n\s*\},/);
  const versionBlock = versionBlockMatch ? versionBlockMatch[1] : configContent;
  const currentPathMatch = versionBlock.match(/current:\s*\{[^}]*path:\s*['"]([^'"]*)['"]/);

  return {
    current: currentPathMatch ? currentPathMatch[1] : '',
  };
}

function currentDocsRoutePrefix() {
  const currentPath = getDocsVersionPaths().current;

  return currentPath ? `/docs/${currentPath}` : '/docs';
}

function expectedAuthorityUrl() {
  return `https://durable-workflow.github.io${routeForDocPath(EXPECTED_AUTHORITY_DOC)}`;
}

function routeForDocPath(docPath) {
  if (!docPath.startsWith('docs/')) {
    throw new Error(
      `static/platform-conformance-contract.json authority_doc must point ` +
        `inside docs/ (got "${docPath}").`,
    );
  }

  if (!/\.(md|mdx)$/.test(docPath)) {
    throw new Error(
      `static/platform-conformance-contract.json authority_doc must point ` +
        `at a Markdown docs page (got "${docPath}").`,
    );
  }

  const relative = docPath
    .slice('docs/'.length)
    .replace(/\.(md|mdx)$/, '')
    .replace(/\/index$/, '');

  return joinRoute(currentDocsRoutePrefix(), relative);
}

function resolveRouteToDocPath(route) {
  if (!route.startsWith('/docs/')) {
    throw new Error(
      `static/platform-conformance-contract.json authority_url must use a ` +
        `/docs/ route (got "${route}").`,
    );
  }

  const normalizedRoute = stripTrailingSlash(route);
  const currentPrefix = currentDocsRoutePrefix();

  if (
    normalizedRoute !== currentPrefix &&
    !normalizedRoute.startsWith(`${currentPrefix}/`)
  ) {
    throw new Error(
      `static/platform-conformance-contract.json authority_url must point ` +
        `at the configured current-version docs route ${currentPrefix} ` +
        `(got "${route}").`,
    );
  }

  const docId = normalizedRoute
    .slice(currentPrefix.length)
    .replace(/^\//, '');
  const candidates = [
    path.join(docsDir, `${docId}.md`),
    path.join(docsDir, `${docId}.mdx`),
    path.join(docsDir, docId, 'index.md'),
    path.join(docsDir, docId, 'index.mdx'),
  ];

  const resolved = candidates.find(candidate => fs.existsSync(candidate));
  if (!resolved) {
    throw new Error(
      `static/platform-conformance-contract.json authority_url route ` +
        `${route} does not resolve to a docs-site page.`,
    );
  }

  return path.relative(repoRoot, resolved).split(path.sep).join('/');
}

function collectSidebarDocIds(item, docIds) {
  if (typeof item === 'string') {
    docIds.add(item);
    return;
  }

  if (!item || typeof item !== 'object') {
    return;
  }

  if (item.type === 'doc') {
    docIds.add(item.id);
    return;
  }

  if (item.type === 'category') {
    for (const child of item.items || []) {
      collectSidebarDocIds(child, docIds);
    }
  }
}

function assertDocIsInSidebar() {
  const sidebars = require(sidebarsPath);
  const docIds = new Set();

  for (const item of sidebars.tutorialSidebar || []) {
    collectSidebarDocIds(item, docIds);
  }

  if (!docIds.has(EXPECTED_DOC_ID)) {
    throw new Error(
      `sidebars.js must include "${EXPECTED_DOC_ID}" so the platform ` +
        `conformance authority is published in the docs navigation.`,
    );
  }
}

function assertContractAuthorityResolves(contract) {
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in contract)) {
      throw new Error(
        `static/platform-conformance-contract.json must include top-level key "${key}"`,
      );
    }
  }

  if (contract.schema !== EXPECTED_SCHEMA) {
    throw new Error(
      `static/platform-conformance-contract.json schema must be ` +
        `"${EXPECTED_SCHEMA}" (got "${contract.schema}")`,
    );
  }

  if (typeof contract.version !== 'number' || contract.version < 1) {
    throw new Error(
      `static/platform-conformance-contract.json version must be a positive integer ` +
        `(got ${JSON.stringify(contract.version)})`,
    );
  }

  const expected = expectedAuthorityUrl();
  if (contract.authority_url !== expected) {
    throw new Error(
      `static/platform-conformance-contract.json authority_url must point at ` +
        `${expected} (got "${contract.authority_url}")`,
    );
  }

  if (contract.authority_doc !== EXPECTED_AUTHORITY_DOC) {
    throw new Error(
      `static/platform-conformance-contract.json authority_doc must point at ` +
        `${EXPECTED_AUTHORITY_DOC} (got "${contract.authority_doc}")`,
    );
  }

  const authorityUrl = new URL(contract.authority_url);
  if (
    authorityUrl.protocol !== 'https:' ||
    authorityUrl.hostname !== 'durable-workflow.github.io'
  ) {
    throw new Error(
      `static/platform-conformance-contract.json authority_url must be an ` +
        `https://durable-workflow.github.io docs URL.`,
    );
  }

  const resolvedFromUrl = resolveRouteToDocPath(authorityUrl.pathname);
  if (resolvedFromUrl !== contract.authority_doc) {
    throw new Error(
      `static/platform-conformance-contract.json authority_url resolves to ` +
        `${resolvedFromUrl}, but authority_doc is ${contract.authority_doc}.`,
    );
  }

  const routeFromDoc = routeForDocPath(contract.authority_doc);
  if (routeFromDoc !== authorityUrl.pathname) {
    throw new Error(
      `static/platform-conformance-contract.json authority_doc resolves to ` +
        `${routeFromDoc}, but authority_url is ${authorityUrl.pathname}.`,
    );
  }

  for (const forbidden of [
    'docs/architecture/platform-conformance-suite.md',
    'docs/1.x/platform-conformance',
    'github.com/durable-workflow/workflow/blob/v2/docs/architecture/platform-conformance-suite.md',
  ]) {
    if (
      String(contract.authority_doc).includes(forbidden) ||
      String(contract.authority_url).includes(forbidden)
    ) {
      throw new Error(
        `static/platform-conformance-contract.json must not advertise stale ` +
          `authority pointer ${forbidden}.`,
      );
    }
  }
}

function assertArrayOfStrings(contract, key, expected) {
  const actual = contract[key];
  if (!Array.isArray(actual)) {
    throw new Error(`static/platform-conformance-contract.json ${key} must be an array.`);
  }

  for (const value of expected) {
    if (!actual.includes(value)) {
      throw new Error(
        `static/platform-conformance-contract.json ${key} must include "${value}".`,
      );
    }
  }
}

function splitMarkdownTableRow(line) {
  const trimmed = line.trim();
  return trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function normalizeTableCell(cell) {
  const withoutInlineCode = cell.replace(/`([^`]*)`/g, '$1');
  return withoutInlineCode.replace(/\s+/g, ' ').trim();
}

function extractMarkdownTable(doc, heading) {
  const start = doc.indexOf(heading);
  if (start === -1) {
    throw new Error(`docs/platform-conformance.md must include ${heading}.`);
  }

  const remaining = doc.slice(start);
  const nextHeading = remaining.slice(1).search(/\n## /);
  const section = nextHeading === -1
    ? remaining
    : remaining.slice(0, nextHeading + 1);
  const tableLines = section
    .split(/\r?\n/)
    .filter(line => line.trim().startsWith('|'));

  if (tableLines.length < 3) {
    throw new Error(
      `docs/platform-conformance.md ${heading} section must include a Markdown table.`,
    );
  }

  const headers = splitMarkdownTableRow(tableLines[0]).map(normalizeTableCell);
  const rows = tableLines.slice(2).map((line, index) => ({
    line,
    lineNumberInTable: index + 3,
    cells: splitMarkdownTableRow(line).map(normalizeTableCell),
  }));

  return { headers, rows };
}

function sourceKey(source) {
  return JSON.stringify([source.repository, source.path]);
}

function formatSourceKey(key) {
  const [repository, sourcePath] = JSON.parse(key);
  return `${repository}:${sourcePath}`;
}

function isPublicRuntimeScenarioManifest(source) {
  return (
    source.repository === 'durable-workflow.github.io' &&
    /^static\/platform-conformance\/[^/]+\.json$/.test(source.path || '')
  );
}

function isApprovedPublicRuntimeSource(source) {
  const sourcePath = source.path || '';

  return (
    isPublicRuntimeScenarioManifest(source) ||
    sourcePath.startsWith('tests/fixtures/') ||
    sourcePath.startsWith('tests/Fixtures/') ||
    sourcePath.startsWith('fixtures/')
  );
}

function assertLocalSourcePath(source, category) {
  const sourcePath = source.path || '';
  const fullPath = path.join(repoRoot, sourcePath);
  const relative = path.relative(repoRoot, fullPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `stable runtime fixture category "${category}" source ` +
        `${source.repository}:${sourcePath} must stay inside the docs repo.`,
    );
  }

  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `stable runtime fixture category "${category}" source ` +
        `${source.repository}:${sourcePath} does not exist.`,
    );
  }

  return fullPath;
}

function runtimeScenarioCategories(contract) {
  const categories = new Set();
  const coverageRule =
    (contract.pass_fail_rules || {}).stable_runtime_scenario_coverage || {};

  for (const category of coverageRule.applies_to_categories || []) {
    categories.add(category);
  }

  for (const [category, entry] of Object.entries(contract.fixture_catalog || {})) {
    if (Array.isArray(entry.required_scenarios)) {
      categories.add(category);
    }
  }

  return categories;
}

function assertRuntimeScenarioManifest(contract, category, entry, source) {
  const manifest = loadJson(
    assertLocalSourcePath(source, category),
    `${source.repository}:${source.path}`,
  );

  if (manifest.schema !== EXPECTED_RUNTIME_SCENARIO_SCHEMA) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${source.repository}:${source.path} must use schema ` +
        `"${EXPECTED_RUNTIME_SCENARIO_SCHEMA}".`,
    );
  }

  if (manifest.category !== category) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${source.repository}:${source.path} declares category ` +
        `"${manifest.category}".`,
    );
  }

  if (manifest.suite_schema !== contract.schema) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `must reference suite schema "${contract.schema}".`,
    );
  }

  if (manifest.suite_version !== contract.version) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `must reference suite version ${contract.version}.`,
    );
  }

  if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length === 0) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${source.repository}:${source.path} must declare scenarios.`,
    );
  }

  if (
    !Array.isArray(manifest.result_statuses) ||
    manifest.result_statuses.length !== REQUIRED_RUNTIME_SCENARIO_STATUSES.length
  ) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `must declare the standard result_statuses set.`,
    );
  }

  for (const status of REQUIRED_RUNTIME_SCENARIO_STATUSES) {
    if (!manifest.result_statuses.includes(status)) {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `result_statuses must include "${status}".`,
      );
    }
  }

  const expectedScenarios = new Set(entry.required_scenarios || []);
  const seenScenarios = new Set();

  for (const [index, scenario] of manifest.scenarios.entries()) {
    if (!scenario || typeof scenario !== 'object') {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `entry ${index + 1} must be an object.`,
      );
    }

    if (typeof scenario.id !== 'string' || scenario.id.trim() === '') {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `entry ${index + 1} must include an id.`,
      );
    }

    if (seenScenarios.has(scenario.id)) {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `repeats scenario "${scenario.id}".`,
      );
    }
    seenScenarios.add(scenario.id);

    for (const requiredField of ['title', 'operations', 'pass_criteria']) {
      if (!(requiredField in scenario)) {
        throw new Error(
          `stable runtime fixture category "${category}" scenario ` +
            `"${scenario.id}" must include ${requiredField}.`,
        );
      }
    }

    for (const arrayField of ['operations', 'pass_criteria']) {
      if (
        !Array.isArray(scenario[arrayField]) ||
        scenario[arrayField].length === 0
      ) {
        throw new Error(
          `stable runtime fixture category "${category}" scenario ` +
            `"${scenario.id}" must include non-empty ${arrayField}.`,
        );
      }
    }
  }

  for (const expected of expectedScenarios) {
    if (!seenScenarios.has(expected)) {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `is missing required scenario "${expected}".`,
      );
    }
  }

  for (const actual of seenScenarios) {
    if (!expectedScenarios.has(actual)) {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `declares scenario "${actual}" that is not listed in the suite manifest.`,
      );
    }
  }
}

function staticSourcePathToServedPath(sourcePath) {
  if (!sourcePath.startsWith('static/')) {
    throw new Error(
      `docs-site scenario manifest path "${sourcePath}" must live under static/.`,
    );
  }

  return `pathname:///${sourcePath.slice('static/'.length)}`;
}

function assertAuthorityDocLinksRuntimeScenarioManifests(contract, doc) {
  for (const category of runtimeScenarioCategories(contract)) {
    const entry = (contract.fixture_catalog || {})[category] || {};

    for (const source of entry.sources || []) {
      if (!isPublicRuntimeScenarioManifest(source)) {
        continue;
      }

      const servedPath = staticSourcePathToServedPath(source.path);

      if (!doc.includes(servedPath)) {
        throw new Error(
          `docs/platform-conformance.md must link ${source.path} using ` +
            `${servedPath} so the published scenario manifest is resolvable ` +
            `from the public site.`,
        );
      }
    }
  }
}

function assertStableRuntimeSourcesArePublic(contract) {
  const catalog = contract.fixture_catalog || {};

  for (const category of runtimeScenarioCategories(contract)) {
    const entry = catalog[category];
    if (!entry) {
      throw new Error(
        `stable_runtime_scenario_coverage references unknown category "${category}".`,
      );
    }

    if (entry.status !== 'stable') {
      throw new Error(
        `stable runtime fixture category "${category}" must have stable status.`,
      );
    }

    if (
      !Array.isArray(entry.required_scenarios) ||
      entry.required_scenarios.length === 0
    ) {
      throw new Error(
        `stable runtime fixture category "${category}" must list ` +
          `required_scenarios in the suite manifest.`,
      );
    }

    let hasScenarioManifest = false;

    for (const source of entry.sources || []) {
      if (!source || typeof source !== 'object') {
        throw new Error(
          `stable runtime fixture category "${category}" has an invalid source.`,
        );
      }

      if (!source.repository || !source.path) {
        throw new Error(
          `stable runtime fixture category "${category}" sources must include ` +
            `repository and path.`,
        );
      }

      if (!isApprovedPublicRuntimeSource(source)) {
        throw new Error(
          `stable runtime fixture category "${category}" source ` +
            `${source.repository}:${source.path} must point at an approved ` +
            `public fixture path or docs-site scenario manifest, not an ` +
            `implementation test or raw test command directory.`,
        );
      }

      if (isPublicRuntimeScenarioManifest(source)) {
        hasScenarioManifest = true;
        assertRuntimeScenarioManifest(contract, category, entry, source);
      }
    }

    if (!hasScenarioManifest) {
      throw new Error(
        `stable runtime fixture category "${category}" must include a ` +
          `docs-site JSON scenario manifest under static/platform-conformance/.`,
      );
    }
  }
}

function assertFixtureCatalogTableMirrorsManifest(contract, doc) {
  const expectedHeaders = ['Category', 'Status', 'Source repository', 'Path', 'Purpose'];
  const { headers, rows } = extractMarkdownTable(doc, '## Fixture Catalog');

  if (headers.length !== expectedHeaders.length) {
    throw new Error(
      `docs/platform-conformance.md fixture catalog table must have columns ` +
        expectedHeaders.join(', '),
    );
  }

  for (const [index, expected] of expectedHeaders.entries()) {
    if (headers[index] !== expected) {
      throw new Error(
        `docs/platform-conformance.md fixture catalog table column ${index + 1} ` +
          `must be "${expected}" (got "${headers[index]}").`,
      );
    }
  }

  const catalog = contract.fixture_catalog || {};
  const docEntriesByCategory = new Map();
  const seenRows = new Set();

  for (const row of rows) {
    if (row.cells.length !== expectedHeaders.length) {
      throw new Error(
        `docs/platform-conformance.md fixture catalog row ${row.lineNumberInTable} ` +
          `must have ${expectedHeaders.length} columns: ${row.line}`,
      );
    }

    const [category, status, repository, sourcePath] = row.cells;
    if (!category || !status || !repository || !sourcePath) {
      throw new Error(
        `docs/platform-conformance.md fixture catalog row ${row.lineNumberInTable} ` +
          `must include category, status, repository, and path.`,
      );
    }

    if (!(category in catalog)) {
      throw new Error(
        `docs/platform-conformance.md fixture catalog lists unknown category "${category}".`,
      );
    }

    const key = `${category}\0${status}\0${repository}\0${sourcePath}`;
    if (seenRows.has(key)) {
      throw new Error(
        `docs/platform-conformance.md fixture catalog repeats ` +
          `${category} ${repository}:${sourcePath}.`,
      );
    }
    seenRows.add(key);

    if (!docEntriesByCategory.has(category)) {
      docEntriesByCategory.set(category, []);
    }
    docEntriesByCategory.get(category).push({ status, repository, path: sourcePath });
  }

  for (const [category, manifestEntry] of Object.entries(catalog)) {
    const docEntries = docEntriesByCategory.get(category) || [];
    if (docEntries.length === 0) {
      throw new Error(
        `docs/platform-conformance.md fixture catalog must list category "${category}".`,
      );
    }

    const statuses = new Set(docEntries.map(entry => entry.status));
    if (statuses.size !== 1 || !statuses.has(manifestEntry.status)) {
      throw new Error(
        `docs/platform-conformance.md fixture catalog status for "${category}" ` +
          `must be "${manifestEntry.status}" (got ${Array.from(statuses).join(', ')}).`,
      );
    }

    const expectedSources = new Set((manifestEntry.sources || []).map(sourceKey));
    const actualSources = new Set(docEntries.map(sourceKey));

    for (const expectedSource of expectedSources) {
      if (!actualSources.has(expectedSource)) {
        throw new Error(
          `docs/platform-conformance.md fixture catalog category "${category}" ` +
            `is missing manifest source ${formatSourceKey(expectedSource)}.`,
        );
      }
    }

    for (const actualSource of actualSources) {
      if (!expectedSources.has(actualSource)) {
        throw new Error(
          `docs/platform-conformance.md fixture catalog category "${category}" ` +
            `lists source not present in the manifest: ${formatSourceKey(actualSource)}.`,
        );
      }
    }
  }
}

function assertAuthorityDocMirrorsManifest(contract) {
  const doc = read(authorityDocPath);

  for (const required of [
    '# Platform Conformance Suite',
    EXPECTED_SCHEMA,
    'static/platform-conformance-contract.json',
    'platform_conformance_suite_manifest',
    '## Target Matrix',
    '## Fixture Catalog',
    '## Pass / Fail Rules',
    '## Harness Contract',
    '## Release Gates',
    '## Release Check',
  ]) {
    if (!doc.includes(required)) {
      throw new Error(
        `docs/platform-conformance.md must include ${JSON.stringify(required)}.`,
      );
    }
  }

  assertFixtureCatalogTableMirrorsManifest(contract, doc);
  assertAuthorityDocLinksRuntimeScenarioManifests(contract, doc);

  for (const target of Object.keys(contract.targets || {})) {
    if (!doc.includes(`\`${target}\``)) {
      throw new Error(
        `docs/platform-conformance.md must list conformance target "${target}".`,
      );
    }
  }

  for (const category of Object.keys(contract.fixture_catalog || {})) {
    if (!doc.includes(`\`${category}\``)) {
      throw new Error(
        `docs/platform-conformance.md must list fixture category "${category}".`,
      );
    }
  }

  for (const rule of Object.keys(contract.pass_fail_rules || {})) {
    if (!doc.includes(rule)) {
      throw new Error(
        `docs/platform-conformance.md must list pass / fail rule "${rule}".`,
      );
    }
  }

  for (const level of contract.conformance_levels || []) {
    if (!doc.includes(`\`${level}\``)) {
      throw new Error(
        `docs/platform-conformance.md must list conformance level "${level}".`,
      );
    }
  }

  for (const release of Object.keys((contract.release_gates || {}).gates || {})) {
    if (!doc.includes(`\`${release}\``)) {
      throw new Error(
        `docs/platform-conformance.md must list release gate "${release}".`,
      );
    }
  }
}

function assertProtocolCatalogLinksAuthority() {
  const doc = read(protocolSpecsDocPath);

  for (const required of [
    routeForDocPath(EXPECTED_AUTHORITY_DOC),
    'static/platform-conformance-contract.json',
    'platform_conformance_suite',
    'platform_conformance_suite_manifest',
  ]) {
    if (!doc.includes(required)) {
      throw new Error(
        `docs/platform-protocol-specs.md must reference the platform ` +
          `conformance authority with ${JSON.stringify(required)}.`,
      );
    }
  }
}

function main() {
  const contract = loadJson(
    contractPath,
    'static/platform-conformance-contract.json',
  );

  assertContractAuthorityResolves(contract);
  assertArrayOfStrings(contract, 'conformance_levels', [
    'full',
    'partial',
    'provisional',
    'nonconforming',
  ]);
  assertStableRuntimeSourcesArePublic(contract);
  assertAuthorityDocMirrorsManifest(contract);
  assertProtocolCatalogLinksAuthority();
  assertDocIsInSidebar();

  console.log('Platform conformance authority checks passed');
}

main();
