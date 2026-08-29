const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const {
  COMPATIBILITY_WORKER_PROTOCOL_AUTHORITY_SECTION,
  MANIFEST_SCHEMA,
  REPORT_SCHEMA,
  captureKey,
  failedSectionCaptureDiagnostics,
  requiredSectionCaptures,
  resolveCandidateCommit,
  validateSectionCaptureEvidence,
} = require('./section-capture-qualification');

const CANDIDATE_COMMIT = 'a'.repeat(40);

function writeEvidence(directory, required, overrides = {}) {
  const fileStem = `${required.section_id}-${required.viewport.name}`;
  const screenshot = `${fileStem}.png`;
  const report = `${fileStem}.json`;
  const source = {
    schema: REPORT_SCHEMA,
    candidate_commit: CANDIDATE_COMMIT,
    ...required,
    capture_exit_status: 0,
    qualification_failures: [],
    console_errors: [],
    page_errors: [],
    geometry: {
      scope_selector: required.geometry_scope || null,
      horizontal_overflow: false,
      unreachable_controls: [],
      sticky_navigation_intersections: [],
      overlapping_floating_elements: [],
      clipped_control_text: [],
      clipped_text: [],
    },
    ...overrides,
  };
  fs.writeFileSync(path.join(directory, screenshot), 'image evidence');
  fs.writeFileSync(path.join(directory, report), `${JSON.stringify(source, null, 2)}\n`);
  return {
    ...required,
    candidate_commit: source.candidate_commit,
    capture_exit_status: source.capture_exit_status,
    screenshot,
    report,
  };
}

function writeMatrix(directory, reportOverrides = new Map()) {
  return requiredSectionCaptures().map(required => writeEvidence(
    directory,
    required,
    reportOverrides.get(captureKey(required)),
  ));
}

function manifest(checks, overrides = {}) {
  return {
    schema: MANIFEST_SCHEMA,
    candidate_commit: CANDIDATE_COMMIT,
    capture_exit_status: 0,
    checks,
    ...overrides,
  };
}

function withEvidence(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'section-capture-qualification-'));
  try {
    run(directory);
  } finally {
    fs.rmSync(directory, {force: true, recursive: true});
  }
}

function assertQualificationWorkflowConsumesEvidence() {
  const workflow = yaml.load(
    fs.readFileSync(path.resolve('.github/workflows/qualification.yml'), 'utf8'),
  );
  const steps = workflow.jobs['executable-contracts'].steps;
  const reachabilityIndex = steps.findIndex(
    step => step.run === 'npm run check:visual-reachability',
  );
  const uploadIndex = steps.findIndex(
    step => step.uses?.startsWith('actions/upload-artifact@')
      && step.with?.path === 'visual-reachability/',
  );

  assert.ok(reachabilityIndex >= 0, 'qualification must execute the reachability consumer');
  assert.equal(
    steps[reachabilityIndex].env.VISUAL_QUALIFICATION_CANDIDATE_COMMIT,
    '${{ github.sha }}',
    'qualification must bind reports to the exact candidate commit',
  );
  assert.equal(
    steps[reachabilityIndex].env.VISUAL_QUALIFICATION_BASE_REF,
    '${{ github.event.pull_request.base.sha || github.event.before }}',
    'qualification must classify routes from the candidate change base',
  );
  assert.ok(uploadIndex > reachabilityIndex, 'qualification must upload evidence after consuming it');
  assert.equal(
    steps[uploadIndex].with.name,
    'visual-reachability-${{ github.sha }}',
    'the uploaded evidence identity must include the candidate commit',
  );
  assert.equal(
    steps[uploadIndex].with['if-no-files-found'],
    'error',
    'screenshots without the required report artifact must not satisfy qualification',
  );
}

assertQualificationWorkflowConsumesEvidence();
assert.equal(
  requiredSectionCaptures(COMPATIBILITY_WORKER_PROTOCOL_AUTHORITY_SECTION)
    .every(capture => (
      capture.geometry_scope === '[data-worker-protocol-authority-roles="true"]'
    )),
  true,
  'authority-role captures must scope geometry to the selected component',
);
assert.deepEqual(
  failedSectionCaptureDiagnostics([{
    section_id: 'authority-roles',
    state: 'selected',
    viewport: {name: 'mobile', width: 390, height: 844},
    capture_exit_status: 1,
    qualification_failures: ['unreachable controls', 'sticky navigation intersections'],
  }]),
  [
    'authority-roles:selected:mobile:390:844: unreachable controls, sticky navigation intersections',
  ],
  'aggregate diagnostics must name each failed capture and its qualification failures',
);
assert.throws(
  () => resolveCandidateCommit({
    cwd: process.cwd(),
    environment: {VISUAL_QUALIFICATION_CANDIDATE_COMMIT: 'b'.repeat(40)},
  }),
  /must match the checked out revision/,
  'a report must not claim a revision other than the rendered checkout',
);

withEvidence(directory => {
  const checks = writeMatrix(directory);
  assert.equal(
    validateSectionCaptureEvidence({
      manifest: manifest(checks),
      evidenceDirectory: directory,
      candidateCommit: CANDIDATE_COMMIT,
    }).length,
    8,
    'the complete exact-revision section matrix must pass',
  );
});

withEvidence(directory => {
  const required = requiredSectionCaptures(
    COMPATIBILITY_WORKER_PROTOCOL_AUTHORITY_SECTION,
  )[0];
  const check = writeEvidence(directory, required);
  const reportPath = path.join(directory, check.report);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  report.geometry_scope = null;
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  assert.throws(
    () => validateSectionCaptureEvidence({
      manifest: manifest([check]),
      evidenceDirectory: directory,
      candidateCommit: CANDIDATE_COMMIT,
      requiredCaptures: [required],
    }),
    /wrong geometry_scope/,
    'an unscoped report must not satisfy a section-scoped capture',
  );
});

withEvidence(directory => {
  const checks = writeMatrix(directory);
  assert.throws(
    () => validateSectionCaptureEvidence({
      manifest: manifest(checks, {candidate_commit: 'b'.repeat(40)}),
      evidenceDirectory: directory,
      candidateCommit: CANDIDATE_COMMIT,
    }),
    /not bound to the candidate commit/,
    'evidence from an earlier revision must be rejected',
  );
});

withEvidence(directory => {
  const required = requiredSectionCaptures();
  const checks = writeMatrix(directory);
  const target = checks.find(check => check.viewport.name === 'mobile');
  const reportPath = path.join(directory, target.report);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  report.state = 'default';
  report.state_scope = 'viewport';
  report.scroll_target = null;
  report.interaction = null;
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  assert.throws(
    () => validateSectionCaptureEvidence({
      manifest: manifest(checks),
      evidenceDirectory: directory,
      candidateCommit: CANDIDATE_COMMIT,
      requiredCaptures: required,
    }),
    /wrong state/,
    'a default first-viewport report must not satisfy a section state',
  );
});

for (const failingCapture of requiredSectionCaptures()) {
  withEvidence(directory => {
    const unreachableReport = new Map([[
      captureKey(failingCapture),
      {
        geometry: {
          horizontal_overflow: false,
          unreachable_controls: [{
            tag: 'summary',
            id: `unreachable-${failingCapture.viewport.name}`,
            center_reachable: false,
            blockers: [{tag: 'nav', position: 'sticky'}],
          }],
        },
      },
    ]]);
    const checks = writeMatrix(directory, unreachableReport);

    assert.throws(
      () => validateSectionCaptureEvidence({
        manifest: manifest(checks),
        evidenceDirectory: directory,
        candidateCommit: CANDIDATE_COMMIT,
      }),
      /records unreachable controls/,
      `${failingCapture.viewport.name} reachability failures must be rejected from the report`,
    );
  });
}

withEvidence(directory => {
  const required = requiredSectionCaptures();
  const desktop = required.find(capture => capture.viewport.name === 'desktop');
  const stickyDisclosureFailure = new Map([[
    captureKey(desktop),
    {
      capture_exit_status: 1,
      qualification_failures: ['sticky navigation intersections'],
      geometry: {
        horizontal_overflow: false,
        unreachable_controls: [],
        sticky_navigation_intersections: [{
          tag: 'summary',
          id: 'fixture-sticky-nav-disclosure',
          rect: {x: 100, y: 48, width: 600, height: 120},
          navbar_bottom: 60,
        }],
        overlapping_floating_elements: [],
        clipped_control_text: [],
        clipped_text: [],
      },
    },
  ]]);
  const checks = writeMatrix(directory, stickyDisclosureFailure);
  const target = checks.find(check => check.viewport.name === 'desktop');
  target.capture_exit_status = 1;

  assert.throws(
    () => validateSectionCaptureEvidence({
      manifest: manifest(checks),
      evidenceDirectory: directory,
      candidateCommit: CANDIDATE_COMMIT,
      requiredCaptures: required,
    }),
    /unsuccessful capture exit status/,
    'a still-reachable disclosure intersecting sticky navigation must be rejected',
  );
});

withEvidence(directory => {
  const required = requiredSectionCaptures();
  const desktop = required.find(capture => capture.viewport.name === 'desktop');
  const floatingOverlapFailure = new Map([[
    captureKey(desktop),
    {
      geometry: {
        horizontal_overflow: false,
        unreachable_controls: [],
        sticky_navigation_intersections: [],
        overlapping_floating_elements: [{
          tag: 'div',
          position: 'sticky',
          overlaps: [{tag: 'td', overlap_width: 80, overlap_height: 24}],
        }],
        clipped_control_text: [],
        clipped_text: [],
      },
    },
  ]]);
  const checks = writeMatrix(directory, floatingOverlapFailure);

  assert.throws(
    () => validateSectionCaptureEvidence({
      manifest: manifest(checks),
      evidenceDirectory: directory,
      candidateCommit: CANDIDATE_COMMIT,
      requiredCaptures: required,
    }),
    /records floating element overlap/,
    'a sticky page-navigation rail covering table cells must be rejected',
  );
});

withEvidence(directory => {
  const checks = writeMatrix(directory).filter(check => check.viewport.name !== 'short-height');
  assert.throws(
    () => validateSectionCaptureEvidence({
      manifest: manifest(checks),
      evidenceDirectory: directory,
      candidateCommit: CANDIDATE_COMMIT,
    }),
    /short-height/,
    'desktop, intermediate, mobile, and short-height reports must all be present',
  );
});

withEvidence(directory => {
  const checks = writeMatrix(directory);
  const target = checks.find(check => check.viewport.name === 'intermediate');
  fs.rmSync(path.join(directory, target.report));
  assert.throws(
    () => validateSectionCaptureEvidence({
      manifest: manifest(checks),
      evidenceDirectory: directory,
      candidateCommit: CANDIDATE_COMMIT,
    }),
    /report is missing/,
    'screenshots alone must not satisfy a required section capture',
  );
});

process.stdout.write('Section capture qualification evidence tests passed.\n');
