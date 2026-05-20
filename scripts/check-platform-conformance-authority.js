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
const crypto = require('crypto');
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
const VERSIONED_RUNTIME_SCENARIO_STATUSES = {
  5: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  6: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  7: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  8: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  9: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
};
// Digests bind each stable scenario id's operations and pass_criteria to the
// suite version so published harness criteria cannot drift invisibly.
const VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS = {
  7: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    namespace_runtime_contract: 'sha256:54a11e95f14ecd088f6f5f8f993b2fd718407c91e3f5ffb4ee4ea88daddca896',
    signal_query_runtime_contract: 'sha256:838cb9bf6c9a175d1f0ef281ab00f3d8d5998214261af535db135fe9b5dfe78b',
  },
  8: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    signal_query_runtime_contract: 'sha256:838cb9bf6c9a175d1f0ef281ab00f3d8d5998214261af535db135fe9b5dfe78b',
  },
  9: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
  },
};
const VERSIONED_PASS_FAIL_RULES = {
  5: {
    guaranteed_field_equality: {
      rule: "Every field marked guaranteed in the fixture's schema must be present, type-correct, and value-equal in the implementation's response. Diagnostic-only fields are ignored.",
      follows: 'durable-workflow.v2.surface-stability.contract#field_visibility_rule',
    },
    unknown_additive_fields_tolerated: {
      rule: 'An implementation that emits extra fields not present in the fixture passes if and only if those fields are documented diagnostic-only or the fixture is on a stability level that allows additive evolution.',
    },
    frozen_shape_exact_match: {
      rule: 'Fixtures backed by a frozen surface family must match exactly. There is no diagnostic-only allowance for frozen shapes; a frozen-shape mismatch is always a fail.',
      applies_to_categories: [
        'history_replay_bundles',
      ],
    },
    required_fixtures_must_pass: {
      rule: 'A release that claims a target must pass every required fixture category for that target. One failed required fixture means the release does not conform for that target.',
    },
    stable_runtime_scenario_coverage: {
      rule: 'A stable runtime fixture category must report every required scenario it declares with one of the statuses published by its runtime scenario manifest: pass, fail, unsupported, not_covered, or runner_blocked. Full conformance requires every required scenario to pass. A smoke-only subset, omitted scenario, unsupported public surface, uncovered cell, or runner-blocked cell is nonconforming and must link the owning finding.',
      applies_to_categories: [
        'signal_query_runtime_contract',
        'history_replay_bundles',
      ],
    },
    provisional_categories_warn_only: {
      rule: 'A failed fixture in a provisional category emits a warning in the harness output and does not block the release. The category becomes load-bearing when promoted to stable in a later suite version.',
    },
    diagnostic_only_mismatches_pass: {
      rule: 'If only diagnostic-only fields differ, the harness records the difference in its diagnostic_diff output and the fixture passes.',
    },
  },
  6: {
    guaranteed_field_equality: {
      rule: "Every field marked guaranteed in the fixture's schema must be present, type-correct, and value-equal in the implementation's response. Diagnostic-only fields are ignored.",
      follows: 'durable-workflow.v2.surface-stability.contract#field_visibility_rule',
    },
    unknown_additive_fields_tolerated: {
      rule: 'An implementation that emits extra fields not present in the fixture passes if and only if those fields are documented diagnostic-only or the fixture is on a stability level that allows additive evolution.',
    },
    frozen_shape_exact_match: {
      rule: 'Fixtures backed by a frozen surface family must match exactly. There is no diagnostic-only allowance for frozen shapes; a frozen-shape mismatch is always a fail.',
      applies_to_categories: [
        'history_replay_bundles',
      ],
    },
    required_fixtures_must_pass: {
      rule: 'A release that claims a target must pass every required fixture category for that target. One failed required fixture means the release does not conform for that target.',
    },
    stable_runtime_scenario_coverage: {
      rule: 'A stable runtime fixture category must report every required scenario it declares with one of the statuses published by its runtime scenario manifest: pass, fail, unsupported, not_covered, or runner_blocked. Full conformance requires every required scenario to pass. A smoke-only subset, omitted scenario, unsupported public surface, uncovered cell, or runner-blocked cell is nonconforming and must link the owning finding.',
      applies_to_categories: [
        'signal_query_runtime_contract',
        'history_replay_bundles',
        'namespace_runtime_contract',
      ],
    },
    provisional_categories_warn_only: {
      rule: 'A failed fixture in a provisional category emits a warning in the harness output and does not block the release. The category becomes load-bearing when promoted to stable in a later suite version.',
    },
    diagnostic_only_mismatches_pass: {
      rule: 'If only diagnostic-only fields differ, the harness records the difference in its diagnostic_diff output and the fixture passes.',
    },
  },
  7: {
    guaranteed_field_equality: {
      rule: "Every field marked guaranteed in the fixture's schema must be present, type-correct, and value-equal in the implementation's response. Diagnostic-only fields are ignored.",
      follows: 'durable-workflow.v2.surface-stability.contract#field_visibility_rule',
    },
    unknown_additive_fields_tolerated: {
      rule: 'An implementation that emits extra fields not present in the fixture passes if and only if those fields are documented diagnostic-only or the fixture is on a stability level that allows additive evolution.',
    },
    frozen_shape_exact_match: {
      rule: 'Fixtures backed by a frozen surface family must match exactly. There is no diagnostic-only allowance for frozen shapes; a frozen-shape mismatch is always a fail.',
      applies_to_categories: [
        'history_replay_bundles',
      ],
    },
    required_fixtures_must_pass: {
      rule: 'A release that claims a target must pass every required fixture category for that target. One failed required fixture means the release does not conform for that target.',
    },
    stable_runtime_scenario_coverage: {
      rule: 'A stable runtime fixture category must report every required scenario it declares with one of the statuses published by its runtime scenario manifest: pass, fail, unsupported, not_covered, or runner_blocked. Full conformance requires every required scenario to pass. A smoke-only subset, omitted scenario, unsupported public surface, uncovered cell, or runner-blocked cell is nonconforming and must link the owning finding.',
      applies_to_categories: [
        'signal_query_runtime_contract',
        'history_replay_bundles',
        'namespace_runtime_contract',
        'child_workflow_runtime_contract',
      ],
    },
    provisional_categories_warn_only: {
      rule: 'A failed fixture in a provisional category emits a warning in the harness output and does not block the release. The category becomes load-bearing when promoted to stable in a later suite version.',
    },
    diagnostic_only_mismatches_pass: {
      rule: 'If only diagnostic-only fields differ, the harness records the difference in its diagnostic_diff output and the fixture passes.',
    },
  },
};
// Suites 8 and 9 change runtime scenario criteria only; pass/fail rules stay
// at suite 7 semantics.
VERSIONED_PASS_FAIL_RULES[8] = VERSIONED_PASS_FAIL_RULES[7];
VERSIONED_PASS_FAIL_RULES[9] = VERSIONED_PASS_FAIL_RULES[8];
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

function routeForDocPath(
  docPath,
  label = 'static/platform-conformance-contract.json authority_doc',
) {
  if (!docPath.startsWith('docs/')) {
    throw new Error(
      `${label} must point ` +
        `inside docs/ (got "${docPath}").`,
    );
  }

  if (!/\.(md|mdx)$/.test(docPath)) {
    throw new Error(
      `${label} must point ` +
        `at a Markdown docs page (got "${docPath}").`,
    );
  }

  const relative = docPath
    .slice('docs/'.length)
    .replace(/\.(md|mdx)$/, '')
    .replace(/\/index$/, '');

  return joinRoute(currentDocsRoutePrefix(), relative);
}

function resolveRouteToDocPath(
  route,
  label = 'static/platform-conformance-contract.json authority_url',
) {
  if (!route.startsWith('/docs/')) {
    throw new Error(
      `${label} must use a ` +
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
      `${label} must point ` +
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
      `${label} route ` +
        `${route} does not resolve to a docs-site page.`,
    );
  }

  return path.relative(repoRoot, resolved).split(path.sep).join('/');
}

function assertCanonicalDocsSiteUrl(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }

  if (value !== value.trim()) {
    throw new Error(`${label} must not include leading or trailing whitespace.`);
  }

  let url;
  try {
    url = new URL(value);
  } catch (err) {
    throw new Error(
      `${label} must be an absolute https://durable-workflow.github.io ` +
        `docs URL (got "${value}").`,
    );
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'durable-workflow.github.io'
  ) {
    throw new Error(
      `${label} must be an https://durable-workflow.github.io docs URL ` +
        `(got "${value}").`,
    );
  }

  if (url.search || url.hash) {
    throw new Error(`${label} must not include query strings or fragments.`);
  }

  const docPath = resolveRouteToDocPath(url.pathname, label);
  const canonical =
    `https://durable-workflow.github.io${routeForDocPath(docPath, label)}`;

  if (value !== canonical) {
    throw new Error(
      `${label} must use canonical docs URL ${canonical} (got "${value}").`,
    );
  }

  return { docPath, url };
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

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function assertJsonEqual(actual, expected, label) {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(
      `${label} must match its suite-versioned expectation. ` +
        `If the pass / fail rule or runtime status semantics changed, ` +
        `advance the suite version and add a new versioned expectation.`,
    );
  }
}

function assertVersionedPassFailRules(contract) {
  const expectedRules = VERSIONED_PASS_FAIL_RULES[contract.version];

  if (!expectedRules) {
    throw new Error(
      `scripts/check-platform-conformance-authority.js must declare ` +
        `pass / fail rule expectations for suite version ${contract.version}. ` +
        `Add a new VERSIONED_PASS_FAIL_RULES entry when suite semantics change.`,
    );
  }

  assertJsonEqual(
    contract.pass_fail_rules || {},
    expectedRules,
    `static/platform-conformance-contract.json pass_fail_rules for suite version ${contract.version}`,
  );
}

function assertVersionedRuntimeScenarioStatuses(contract, manifest, category, source) {
  const expectedStatuses = VERSIONED_RUNTIME_SCENARIO_STATUSES[contract.version];

  if (!expectedStatuses) {
    throw new Error(
      `scripts/check-platform-conformance-authority.js must declare ` +
        `runtime scenario statuses for suite version ${contract.version}. ` +
        `Add a new VERSIONED_RUNTIME_SCENARIO_STATUSES entry when runtime ` +
        `result semantics change.`,
    );
  }

  assertJsonEqual(
    manifest.result_statuses,
    expectedStatuses,
    `stable runtime fixture category "${category}" scenario manifest ` +
      `${source.repository}:${source.path} result_statuses for suite version ${contract.version}`,
  );

  return expectedStatuses;
}

function assertSignalQueryRuntimeArtifactPolicy(manifest, category, source) {
  if (category !== 'signal_query_runtime_contract') {
    return;
  }

  const policy = manifest.artifact_policy || {};

  if (policy.requires_resolved_versions !== true) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${source.repository}:${source.path} must require resolved artifact versions.`,
    );
  }

  if (policy.rejects_placeholder_versions !== true) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${source.repository}:${source.path} must advertise placeholder ` +
        `artifact-version rejection so external harnesses can fail ` +
        `unresolved tokens such as latest/current/head.`,
    );
  }
}

function runtimeScenarioCriteriaSnapshot(manifest) {
  const scenarios = {};

  for (const scenario of manifest.scenarios || []) {
    if (
      !scenario ||
      typeof scenario !== 'object' ||
      typeof scenario.id !== 'string'
    ) {
      continue;
    }

    scenarios[scenario.id] = {
      operations: scenario.operations,
      pass_criteria: scenario.pass_criteria,
    };
  }

  return scenarios;
}

function runtimeScenarioCriteriaDigest(manifest) {
  return (
    'sha256:' +
    crypto
      .createHash('sha256')
      .update(stableJson(runtimeScenarioCriteriaSnapshot(manifest)))
      .digest('hex')
  );
}

function assertVersionedRuntimeScenarioCriteria(contract, manifest, category, source) {
  const expectedByCategory =
    VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[contract.version];

  if (!expectedByCategory) {
    throw new Error(
      `scripts/check-platform-conformance-authority.js must declare ` +
        `runtime scenario operations/pass_criteria digests for suite version ` +
        `${contract.version}. Add a new ` +
        `VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS entry when stable ` +
        `runtime scenario criteria change.`,
    );
  }

  const expectedDigest = expectedByCategory[category];
  if (!expectedDigest) {
    throw new Error(
      `scripts/check-platform-conformance-authority.js must declare ` +
        `a runtime scenario operations/pass_criteria digest for category ` +
        `"${category}" in suite version ${contract.version}.`,
    );
  }

  const actualDigest = runtimeScenarioCriteriaDigest(manifest);
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${source.repository}:${source.path} operations/pass_criteria digest ` +
        `${actualDigest} must match suite-versioned expectation ` +
        `${expectedDigest}. Advance the suite version and add a new ` +
        `VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS entry before changing ` +
        `stable runtime scenario operations or pass_criteria.`,
    );
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

function stableFixtureCategories(contract) {
  return Object.entries(contract.fixture_catalog || {})
    .filter(([, entry]) => entry && entry.status === 'stable')
    .map(([category]) => category);
}

function assertStableFixtureAuthorityDocsResolve(contract) {
  const catalog = contract.fixture_catalog || {};

  for (const category of stableFixtureCategories(contract)) {
    const entry = catalog[category];

    assertCanonicalDocsSiteUrl(
      entry.authority_doc,
      `static/platform-conformance-contract.json ` +
        `fixture_catalog.${category}.authority_doc`,
    );
  }
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

  const expectedStatuses = assertVersionedRuntimeScenarioStatuses(
    contract,
    manifest,
    category,
    source,
  );
  assertSignalQueryRuntimeArtifactPolicy(manifest, category, source);

  if (
    !Array.isArray(manifest.result_statuses) ||
    manifest.result_statuses.length !== expectedStatuses.length
  ) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `must declare the standard result_statuses set.`,
    );
  }

  for (const status of expectedStatuses) {
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

  assertVersionedRuntimeScenarioCriteria(contract, manifest, category, source);
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
    `version\n\`${contract.version}\``,
    'platform_conformance_suite_manifest',
    '## Target Matrix',
    '## Fixture Catalog',
    '## Pass / Fail Rules',
    '## Harness Contract',
    '## Release Gates',
    '## Release Check',
    'Placeholder or unresolved',
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
  assertVersionedPassFailRules(contract);
  assertStableFixtureAuthorityDocsResolve(contract);
  assertStableRuntimeSourcesArePublic(contract);
  assertAuthorityDocMirrorsManifest(contract);
  assertProtocolCatalogLinksAuthority();
  assertDocIsInSidebar();

  console.log('Platform conformance authority checks passed');
}

main();
