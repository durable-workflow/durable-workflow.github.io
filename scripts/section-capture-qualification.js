const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const MANIFEST_SCHEMA = 'durable-workflow.docs.section-capture-qualification/v1';
const REPORT_SCHEMA = 'durable-workflow.visual-reachability-report/v1';
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const PUBLIC_MANIFESTS_SECTION = Object.freeze({
  id: 'platform-conformance-public-manifests',
  navigation_configuration: 'stable-default',
  route: '/docs/platform-conformance/',
  state: 'public-manifests',
  state_scope: 'section',
  scroll_target: '#public-manifests',
  required_visible: Object.freeze([
    '#public-manifests',
    'a[href="/schemas/capacity-benchmark/v1/manifest.json"]',
  ]),
  interaction: Object.freeze({
    action: 'scroll-to',
    selector: '#public-manifests',
    block: 'center',
  }),
  viewports: Object.freeze([
    Object.freeze({name: 'desktop', width: 1440, height: 900}),
    Object.freeze({name: 'intermediate', width: 900, height: 900}),
    Object.freeze({name: 'mobile', width: 390, height: 844}),
    Object.freeze({name: 'short-height', width: 1440, height: 500}),
  ]),
});
const CURRENT_V2_CONFORMANCE_FIXTURE_CATALOG_SECTION = Object.freeze({
  id: 'current-v2-conformance-fixture-catalog',
  navigation_configuration: 'current-v2',
  route: '/docs/2.0/platform-conformance/',
  state: 'fixture-catalog',
  state_scope: 'section',
  scroll_target: '#fixture-catalog',
  required_visible: Object.freeze(['#fixture-catalog']),
  interaction: Object.freeze({
    action: 'scroll-to',
    selector: '#fixture-catalog',
    block: 'center',
  }),
  viewports: Object.freeze([
    Object.freeze({name: 'desktop', width: 1440, height: 900}),
    Object.freeze({name: 'intermediate', width: 768, height: 1024}),
    Object.freeze({name: 'mobile', width: 390, height: 844}),
    Object.freeze({name: 'short-height', width: 1280, height: 500}),
  ]),
});
const CAPABILITY_SELECTION_SECTION = Object.freeze({
  id: 'capability-durable-first-completion-selection',
  navigation_configuration: 'current-v2',
  route: '/docs/2.0/capabilities/',
  state: 'durable-first-completion-selection',
  state_scope: 'section',
  scroll_target: '#durable-first-completion-selection-capability',
  required_visible: Object.freeze([
    '#durable-first-completion-selection-capability',
  ]),
  interaction: Object.freeze({
    action: 'scroll-to',
    selector: '#durable-first-completion-selection-capability',
    block: 'center',
  }),
  viewports: Object.freeze([
    Object.freeze({name: 'desktop', width: 1440, height: 900}),
    Object.freeze({name: 'intermediate', width: 768, height: 1024}),
    Object.freeze({name: 'mobile', width: 390, height: 844}),
    Object.freeze({name: 'short-height', width: 640, height: 360, fullPage: true}),
  ]),
});
const WORKFLOW_API_SELECTION_SECTION = Object.freeze({
  id: 'workflow-api-durable-selection',
  navigation_configuration: 'current-v2',
  route: '/docs/2.0/defining-workflows/workflow-api/',
  state: 'durable-selection-api',
  state_scope: 'section',
  click_target: '#workflow-api-details > summary',
  scroll_target: '#durable-command-surface + table tbody tr:nth-child(10)',
  required_visible: Object.freeze([
    '#durable-command-surface + table tbody tr:nth-child(10) td:nth-child(1)',
    '#durable-command-surface + table tbody tr:nth-child(10) td:nth-child(3)',
    '#durable-command-surface + table tbody tr:nth-child(10) td:nth-child(4)',
  ]),
  interaction: Object.freeze({
    action: 'scroll-to',
    selector: '#durable-command-surface + table tbody tr:nth-child(10)',
    block: 'center',
  }),
  viewports: Object.freeze([
    Object.freeze({name: 'desktop', width: 1440, height: 900}),
    Object.freeze({name: 'intermediate', width: 768, height: 1024}),
    Object.freeze({name: 'mobile', width: 390, height: 844}),
    Object.freeze({name: 'short-height', width: 640, height: 360}),
  ]),
});
const PHP_SELECTION_SECTION = Object.freeze({
  id: 'php-durable-first-completion-selection',
  navigation_configuration: 'current-v2',
  route: '/docs/2.0/polyglot/php/',
  state: 'durable-first-completion-selection',
  state_scope: 'section',
  scroll_target: '#first-completion-selection',
  required_visible: Object.freeze(['#first-completion-selection']),
  interaction: Object.freeze({
    action: 'scroll-to',
    selector: '#first-completion-selection',
    block: 'center',
  }),
  viewports: Object.freeze([
    Object.freeze({name: 'desktop', width: 1440, height: 900}),
    Object.freeze({name: 'intermediate', width: 768, height: 1024}),
    Object.freeze({name: 'mobile', width: 390, height: 844}),
    Object.freeze({name: 'short-height', width: 640, height: 360, fullPage: true}),
  ]),
});
const PYTHON_SELECTION_SECTION = Object.freeze({
  id: 'python-durable-first-completion-selection',
  navigation_configuration: 'current-v2',
  route: '/docs/2.0/polyglot/python/',
  state: 'durable-first-completion-selection',
  state_scope: 'section',
  scroll_target: '#workflow-context + p + table tbody tr:nth-child(5) td:first-child',
  required_visible: Object.freeze([
    '#workflow-context + p + table tbody tr:nth-child(5) td:first-child',
  ]),
  interaction: Object.freeze({
    action: 'scroll-to',
    selector: '#workflow-context + p + table tbody tr:nth-child(5) td:first-child',
    block: 'center',
  }),
  viewports: Object.freeze([
    Object.freeze({name: 'desktop', width: 1440, height: 900}),
    Object.freeze({name: 'intermediate', width: 768, height: 1024}),
    Object.freeze({name: 'mobile', width: 390, height: 844}),
    Object.freeze({name: 'short-height', width: 640, height: 360, fullPage: true}),
  ]),
});
const PORTABLE_WORKER_AFFINITY_SDK_SUPPORT_SECTION = Object.freeze({
  id: 'portable-worker-affinity-sdk-support',
  navigation_configuration: 'current-v2',
  route: '/docs/2.0/features/portable-worker-affinity/',
  state: 'sdk-support',
  state_scope: 'section',
  scroll_target: '#sdk-support',
  required_visible: Object.freeze(['#sdk-support']),
  interaction: Object.freeze({
    action: 'scroll-to',
    selector: '#sdk-support',
    block: 'start',
  }),
  viewports: Object.freeze([
    Object.freeze({name: 'desktop', width: 1440, height: 900}),
    Object.freeze({name: 'intermediate', width: 768, height: 1024}),
    Object.freeze({name: 'mobile', width: 390, height: 844}),
    Object.freeze({name: 'short-height', width: 1280, height: 360}),
  ]),
});
const SERVER_CONFIG_SECTION = Object.freeze({
  id: 'server-config-external-payload-settings',
  navigation_configuration: 'current-v2',
  route: '/docs/2.0/polyglot/server-config-reference/',
  state: 'external-payload-settings',
  state_scope: 'section',
  scroll_target:
    '#limits-retention-and-metrics + p + table tbody tr:nth-child(8) td:first-child',
  required_visible: Object.freeze([
    '#limits-retention-and-metrics + p + table tbody tr:nth-child(8) td:first-child',
  ]),
  interaction: Object.freeze({
    action: 'scroll-to',
    selector:
      '#limits-retention-and-metrics + p + table tbody tr:nth-child(8) td:first-child',
    block: 'center',
  }),
  viewports: Object.freeze([
    Object.freeze({name: 'desktop', width: 1440, height: 900}),
    Object.freeze({name: 'intermediate', width: 768, height: 1024}),
    Object.freeze({name: 'mobile', width: 390, height: 844}),
    Object.freeze({name: 'short-height', width: 1280, height: 360}),
  ]),
});
function workerProtocolAuthoritySection(id, route, scrollTarget) {
  return Object.freeze({
    id,
    navigation_configuration: 'current-v2',
    route,
    state: 'worker-protocol-authority-roles',
    state_scope: 'section',
    scroll_target: scrollTarget,
    geometry_scope: '[data-worker-protocol-authority-roles="true"]',
    required_visible: Object.freeze([
      '#worker-protocol-authority-roles',
      '[data-worker-protocol-authority-roles="true"]',
    ]),
    interaction: Object.freeze({
      action: 'scroll-to',
      selector: scrollTarget,
      block: 'center',
    }),
    viewports: Object.freeze([
      Object.freeze({name: 'desktop', width: 1440, height: 900}),
      Object.freeze({name: 'intermediate', width: 768, height: 1024}),
      Object.freeze({name: 'mobile', width: 390, height: 844}),
    ]),
  });
}
const COMPATIBILITY_WORKER_PROTOCOL_AUTHORITY_SECTION = workerProtocolAuthoritySection(
  'compatibility-worker-protocol-authority-roles',
  '/docs/2.0/compatibility/',
  '#worker-protocol-authority-roles',
);
const PROTOCOL_SPECS_WORKER_PROTOCOL_AUTHORITY_SECTION = workerProtocolAuthoritySection(
  'protocol-specs-worker-protocol-authority-roles',
  '/docs/2.0/platform-protocol-specs/',
  '#worker-protocol-authority-roles',
);
const CONFORMANCE_WORKER_PROTOCOL_AUTHORITY_SECTION = workerProtocolAuthoritySection(
  'conformance-worker-protocol-authority-roles',
  '/docs/2.0/platform-conformance/',
  '[data-worker-protocol-authority-roles="true"] > p',
);
const SECTION_QUALIFICATIONS = Object.freeze([
  PUBLIC_MANIFESTS_SECTION,
  SERVER_CONFIG_SECTION,
]);

function resolveCandidateCommit(options = {}) {
  const environment = options.environment || process.env;
  const checkoutCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
  }).trim();
  const candidateCommit = environment.VISUAL_QUALIFICATION_CANDIDATE_COMMIT
    || checkoutCommit;

  assert.match(checkoutCommit, COMMIT_PATTERN, 'checked out commit must be a full Git commit ID');
  assert.match(
    candidateCommit,
    COMMIT_PATTERN,
    'visual qualification candidate commit must be a full lowercase Git commit ID',
  );
  assert.equal(
    candidateCommit,
    checkoutCommit,
    'visual qualification candidate commit must match the checked out revision',
  );
  return candidateCommit;
}

function requiredSectionCaptures(sections = SECTION_QUALIFICATIONS) {
  const sectionList = Array.isArray(sections) ? sections : [sections];
  return sectionList.flatMap(section => section.viewports.map(viewport => ({
    section_id: section.id,
    navigation_configuration: section.navigation_configuration,
    route: section.route,
    state: section.state,
    state_scope: section.state_scope,
    click_target: section.click_target,
    scroll_target: section.scroll_target,
    geometry_scope: section.geometry_scope,
    required_visible: section.required_visible,
    selection_reason: section.selection_reason,
    interaction: section.interaction,
    scroll_offset_y: section.scroll_offsets_by_viewport?.[viewport.name] || 0,
    viewport,
  })));
}

function captureKey(capture) {
  return [
    capture.section_id,
    capture.state,
    capture.viewport?.name,
    capture.viewport?.width,
    capture.viewport?.height,
  ].join(':');
}

function failedSectionCaptureDiagnostics(checks) {
  return checks
    .filter(check => check.capture_exit_status !== 0)
    .map(check => {
      const failures = Array.isArray(check.qualification_failures)
        && check.qualification_failures.length > 0
        ? check.qualification_failures.join(', ')
        : `capture exit status ${check.capture_exit_status}`;
      return `${captureKey(check)}: ${failures}`;
    });
}

function assertEvidenceFile(evidenceDirectory, relativePath, label) {
  assert.equal(
    typeof relativePath,
    'string',
    `${label} must name an evidence file`,
  );
  assert.equal(
    path.basename(relativePath),
    relativePath,
    `${label} must stay inside the evidence directory`,
  );
  const evidencePath = path.join(evidenceDirectory, relativePath);
  assert.ok(fs.existsSync(evidencePath), `${label} is missing: ${relativePath}`);
  assert.ok(fs.statSync(evidencePath).size > 0, `${label} is empty: ${relativePath}`);
  return evidencePath;
}

function assertExactCaptureBinding(report, required, candidateCommit, label) {
  assert.equal(report.schema, REPORT_SCHEMA, `${label} uses an unsupported report schema`);
  assert.equal(
    report.candidate_commit,
    candidateCommit,
    `${label} is not bound to the candidate commit`,
  );
  for (const field of [
    'section_id',
    'navigation_configuration',
    'route',
    'state',
    'state_scope',
    'click_target',
    'scroll_target',
    'scroll_offset_y',
    'geometry_scope',
    'selection_reason',
  ]) {
    assert.equal(report[field], required[field], `${label} has the wrong ${field}`);
  }
  assert.deepEqual(
    report.required_visible,
    required.required_visible,
    `${label} does not prove the required visible content`,
  );
  assert.deepEqual(
    report.interaction,
    required.interaction,
    `${label} does not prove the required scroll interaction`,
  );
  assert.deepEqual(report.viewport, required.viewport, `${label} has the wrong viewport`);
  assert.equal(
    report.geometry?.scope_selector || null,
    required.geometry_scope || null,
    `${label} did not scope geometry to the selected section`,
  );
}

function assertPassingCaptureReport(report, label) {
  assert.equal(
    report.capture_exit_status,
    0,
    `${label} records an unsuccessful capture exit status`,
  );
  assert.deepEqual(report.qualification_failures, [], `${label} records qualification failures`);
  assert.deepEqual(report.console_errors, [], `${label} records browser console errors`);
  assert.deepEqual(report.page_errors, [], `${label} records browser page errors`);
  assert.equal(
    report.geometry?.horizontal_overflow,
    false,
    `${label} records horizontal overflow`,
  );
  assert.deepEqual(
    report.geometry?.unreachable_controls,
    [],
    `${label} records unreachable controls`,
  );
  assert.deepEqual(
    report.geometry?.sticky_navigation_intersections,
    [],
    `${label} records controls intersecting sticky navigation`,
  );
  assert.deepEqual(
    report.geometry?.overlapping_floating_elements,
    [],
    `${label} records floating element overlap`,
  );
  assert.deepEqual(
    report.geometry?.clipped_control_text,
    [],
    `${label} records clipped control text`,
  );
  assert.deepEqual(
    report.geometry?.clipped_text,
    [],
    `${label} records clipped text`,
  );
}

function validateSectionCaptureEvidence({
  manifest,
  evidenceDirectory,
  candidateCommit,
  requiredCaptures = requiredSectionCaptures(),
}) {
  assert.match(candidateCommit, COMMIT_PATTERN, 'candidate commit must be a full Git commit ID');
  assert.equal(manifest.schema, MANIFEST_SCHEMA, 'section capture manifest schema is unsupported');
  assert.equal(
    manifest.candidate_commit,
    candidateCommit,
    'section capture manifest is not bound to the candidate commit',
  );
  assert.equal(
    manifest.capture_exit_status,
    0,
    'section capture manifest records an unsuccessful capture exit status',
  );
  assert.ok(Array.isArray(manifest.checks), 'section capture manifest checks must be an array');

  const checksByKey = new Map(manifest.checks.map(check => [captureKey(check), check]));
  assert.equal(
    checksByKey.size,
    manifest.checks.length,
    'section capture manifest contains duplicate evidence bindings',
  );

  const consumed = [];
  for (const required of requiredCaptures) {
    const key = captureKey(required);
    const check = checksByKey.get(key);
    assert.ok(check, `section capture manifest is missing ${key}`);
    assert.equal(
      check.candidate_commit,
      candidateCommit,
      `${key} manifest entry is not bound to the candidate commit`,
    );
    assert.equal(
      check.capture_exit_status,
      0,
      `${key} manifest entry records an unsuccessful capture exit status`,
    );

    const reportPath = assertEvidenceFile(evidenceDirectory, check.report, `${key} report`);
    assertEvidenceFile(evidenceDirectory, check.screenshot, `${key} screenshot`);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assertExactCaptureBinding(report, required, candidateCommit, `${key} report`);
    assertPassingCaptureReport(report, `${key} report`);
    consumed.push(key);
  }

  return consumed;
}

module.exports = {
  CAPABILITY_SELECTION_SECTION,
  COMPATIBILITY_WORKER_PROTOCOL_AUTHORITY_SECTION,
  CONFORMANCE_WORKER_PROTOCOL_AUTHORITY_SECTION,
  CURRENT_V2_CONFORMANCE_FIXTURE_CATALOG_SECTION,
  MANIFEST_SCHEMA,
  PORTABLE_WORKER_AFFINITY_SDK_SUPPORT_SECTION,
  PUBLIC_MANIFESTS_SECTION,
  PHP_SELECTION_SECTION,
  PYTHON_SELECTION_SECTION,
  PROTOCOL_SPECS_WORKER_PROTOCOL_AUTHORITY_SECTION,
  REPORT_SCHEMA,
  SECTION_QUALIFICATIONS,
  SERVER_CONFIG_SECTION,
  WORKFLOW_API_SELECTION_SECTION,
  captureKey,
  failedSectionCaptureDiagnostics,
  requiredSectionCaptures,
  resolveCandidateCommit,
  validateSectionCaptureEvidence,
};
