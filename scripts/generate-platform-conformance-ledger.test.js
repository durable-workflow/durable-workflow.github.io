#!/usr/bin/env node

const assert = require('assert');

const source = require('./platform-conformance-retained-evidence.json');
const {
  buildLedger,
  publicRunRecord,
  validateSource,
} = require('./generate-platform-conformance-ledger');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function incrementPrereleaseVersion(version) {
  return version.replace(
    /(\d+)$/,
    sequence => String(Number(sequence) + 1),
  );
}

function experiment(ledger, id) {
  return ledger.experiments.find(entry => entry.id === id);
}

function quickstartQualification(artifactTuple) {
  return {
    contract_identity: {
      schema: 'durable-workflow.docs.v2.quickstart-execution-contract',
      version: 5,
      url: 'https://durable-workflow.com/quickstart-execution-contract.json',
      sha256: 'a'.repeat(64),
    },
    scenario_results: [
      'php_user_local_server_completion',
      'python_user_local_server_completion',
      'rust_user_local_server_completion',
      'rust_user_cloud_completion',
      'operator_local_server_observation',
      'laravel_user_embedded_completion',
    ].map(id => ({id, outcome: 'pass'})),
    exact_composer_graph: {
      outcome: 'pass',
      artifact_tuple: {
        'sdk-php': artifactTuple['sdk-php'],
        waterline: artifactTuple.waterline,
        workflow: artifactTuple.workflow,
      },
      manifest_sha256: 'b'.repeat(64),
      install_output_sha256: 'c'.repeat(64),
      package_discovery: 'pass',
      package_discovery_output_sha256: 'd'.repeat(64),
      laravel_boot: 'pass',
    },
  };
}

function addRegressionTrail(fixture) {
  fixture.runs.push(
    {
      id: 'docs-20260729t140000z',
      experiment: 'docs',
      artifact_tuple: 'current',
      outcome: 'fail',
      runner_blocked: false,
      finished_at: '2026-07-29T14:00:00.000Z',
    },
    {
      id: 'docs-20260729t141000z',
      experiment: 'docs',
      artifact_tuple: 'current',
      outcome: 'pass',
      runner_blocked: false,
      finished_at: '2026-07-29T14:10:00.000Z',
    },
  );
  fixture.regression_trails.push({
    id: 'docs-route-regression',
    experiment: 'docs',
    failing_run: 'docs-20260729t140000z',
    fix_url:
      'https://github.com/durable-workflow/durable-workflow.github.io/commit/0123456789abcdef0123456789abcdef01234567',
    regression_fixture_url:
      'https://github.com/durable-workflow/durable-workflow.github.io/blob/0123456789abcdef0123456789abcdef01234567/scripts/docs-route.test.js',
    first_confirming_run: 'docs-20260729t141000z',
  });
}

assert.doesNotThrow(
  () => validateSource(source),
  'the retained public evidence source must satisfy the strict schema',
);

const divergentCurrentTuple = clone(source);
const divergentServerVersion = incrementPrereleaseVersion(
  source.current_artifact_tuple.server,
);
divergentCurrentTuple.current_artifact_tuple.server = divergentServerVersion;
assert.throws(
  () => buildLedger(divergentCurrentTuple),
  error => (
    error.message.includes('current_artifact_tuple must exactly match')
    && error.message.includes(
      `server: ledger=${divergentServerVersion} published=${source.current_artifact_tuple.server}`,
    )
  ),
  'ledger generation must reject drift from the published-artifact registry',
);

const baselineSource = clone(source);
baselineSource.current_artifact_tuple = clone(source.artifact_tuples.current);
const baselinePublishedTuple = baselineSource.current_artifact_tuple;
const ledger = buildLedger(baselineSource, baselinePublishedTuple);
assert.strictEqual(ledger.schema_version, 2);
assert.strictEqual(ledger.snapshot_refreshed_at, baselineSource.captured_at);
assert.strictEqual(ledger.retained_evidence_captured_at, baselineSource.captured_at);
assert.strictEqual(ledger.experiments.length, 29);
assert.strictEqual(ledger.retention_policy.retained_run_count, 29);
assert.strictEqual(
  ledger.experiments.filter(
    entry => entry.executed_evidence.status === 'current',
  ).length,
  1,
  'only exact tuple matches may be labeled current',
);
assert.strictEqual(experiment(ledger, 'cloud').executed_evidence.status, 'current');
assert.strictEqual(experiment(ledger, 'cloud').executed_evidence.product_failure, false);
assert.strictEqual(experiment(ledger, 'activities').executed_evidence.status, 'stale');
assert.deepStrictEqual(
  experiment(ledger, 'activities').executed_evidence.stale_artifacts,
  [
    {
      artifact: 'sdk-python',
      expected: '2.0.0-rc.7',
      actual: '2.0.0-rc.6',
    },
  ],
);

const historicalArtifactTuples = clone(baselineSource.artifact_tuples);
const historicalRuns = clone(baselineSource.runs);
const refreshedPublishedTuple = {
  ...baselinePublishedTuple,
  server: incrementPrereleaseVersion(baselinePublishedTuple.server),
};
const refreshedSource = clone(baselineSource);
refreshedSource.current_artifact_tuple = refreshedPublishedTuple;
const refreshedLedger = buildLedger(
  refreshedSource,
  refreshedPublishedTuple,
  {snapshotRefreshedAt: '2026-07-29T16:00:00.000Z'},
);
assert.strictEqual(
  refreshedLedger.snapshot_refreshed_at,
  '2026-07-29T16:00:00.000Z',
  'a release refresh must identify when the ledger freshness projection changed',
);
assert.strictEqual(
  refreshedLedger.retained_evidence_captured_at,
  baselineSource.captured_at,
  'a release refresh must preserve the retained-evidence capture time',
);
assert.deepStrictEqual(
  refreshedSource.artifact_tuples,
  historicalArtifactTuples,
  'a release refresh must not rewrite retained artifact tuples',
);
assert.deepStrictEqual(
  refreshedSource.runs,
  historicalRuns,
  'a release refresh must not reattach historical runs to newer artifacts',
);
assert.deepStrictEqual(
  experiment(refreshedLedger, 'cloud').executed_evidence.artifact_tuple,
  baselineSource.artifact_tuples.current,
  'historical executed evidence must retain its original exact artifact tuple',
);
assert.deepStrictEqual(
  experiment(refreshedLedger, 'cloud').executed_evidence.stale_artifacts,
  [
    {
      artifact: 'server',
      expected: refreshedPublishedTuple.server,
      actual: baselineSource.artifact_tuples.current.server,
    },
  ],
  'a release refresh must make old evidence stale without rewriting it',
);
assert.strictEqual(
  experiment(ledger, 'docs').executed_evidence.product_failure,
  false,
  'a stale historical failure must not be presented as a current product failure',
);
assert.strictEqual(
  experiment(ledger, 'agent-operability').executed_evidence.gap_reason,
  'runner_blocked',
);
assert.strictEqual(
  experiment(ledger, 'agent-operability').executed_evidence.product_failure,
  false,
  'runner-blocked evidence must not be presented as a product failure',
);
assert.strictEqual(
  experiment(ledger, 'signals-queries').static_contract.evidence_kind,
  'static_contract',
);
assert.strictEqual(
  experiment(ledger, 'signals-queries').executed_evidence.evidence_kind,
  'executed_run',
);
assert.doesNotMatch(
  JSON.stringify(ledger),
  /pass[_-]?rate/i,
  'the ledger must not publish an aggregate historical pass-rate field',
);

const missingEvidence = clone(baselineSource);
missingEvidence.runs = missingEvidence.runs.filter(run => run.experiment !== 'replay');
const missingLedger = buildLedger(missingEvidence, baselinePublishedTuple);
assert.deepStrictEqual(
  experiment(missingLedger, 'replay').executed_evidence,
  {
    evidence_kind: 'executed_run',
    status: 'missing',
    outcome: null,
    runner_blocked: false,
    finished_at: null,
    artifact_tuple: null,
    stale_artifacts: [],
    evidence_url: null,
    evidence_gap: true,
    gap_reason: 'missing',
    product_failure: false,
  },
  'missing release-critical evidence must be visible and product-neutral',
);

const currentFailure = clone(baselineSource);
currentFailure.runs.find(run => run.experiment === 'cloud').outcome = 'fail';
const currentFailureLedger = buildLedger(currentFailure, baselinePublishedTuple);
assert.strictEqual(
  experiment(currentFailureLedger, 'cloud').executed_evidence.product_failure,
  true,
);
assert.strictEqual(
  currentFailureLedger.tiers.find(tier => tier.id === 'ecosystem').state,
  'product-failure',
  'a current product failure must remain visible even when its tier also has stale evidence',
);

const regressionFixture = clone(baselineSource);
addRegressionTrail(regressionFixture);
const regressionLedger = buildLedger(regressionFixture, baselinePublishedTuple);
assert.deepStrictEqual(regressionLedger.regression_trails, [
  {
    id: 'docs-route-regression',
    experiment: 'docs',
    failing_run_url:
      'https://durable-workflow.github.io/platform-conformance/evidence/docs-20260729t140000z.json',
    fix_url:
      'https://github.com/durable-workflow/durable-workflow.github.io/commit/0123456789abcdef0123456789abcdef01234567',
    regression_fixture_url:
      'https://github.com/durable-workflow/durable-workflow.github.io/blob/0123456789abcdef0123456789abcdef01234567/scripts/docs-route.test.js',
    first_confirming_run_url:
      'https://durable-workflow.github.io/platform-conformance/evidence/docs-20260729t141000z.json',
  },
]);

const publicRecord = publicRunRecord(
  regressionFixture,
  regressionFixture.runs.at(-1),
  validateSource(regressionFixture, baselinePublishedTuple).experimentsById,
);
assert.deepStrictEqual(Object.keys(publicRecord), [
  'schema',
  'schema_version',
  'id',
  'experiment',
  'tier',
  'release_critical',
  'evidence_kind',
  'artifact_tuple',
  'outcome',
  'runner_blocked',
  'finished_at',
]);

const tupleOnlyQuickstartPass = clone(baselineSource);
const tupleOnlyQuickstartRun = tupleOnlyQuickstartPass.runs.find(
  run => run.experiment === 'quickstart',
);
tupleOnlyQuickstartRun.outcome = 'pass';
assert.throws(
  () => validateSource(tupleOnlyQuickstartPass, baselinePublishedTuple),
  /requires exact contract and Laravel qualification/,
  'a matching tuple alone must never produce public passing quickstart evidence',
);

const qualifiedQuickstartPass = clone(tupleOnlyQuickstartPass);
const qualifiedQuickstartRun = qualifiedQuickstartPass.runs.find(
  run => run.experiment === 'quickstart',
);
const qualifiedQuickstartTuple =
  qualifiedQuickstartPass.artifact_tuples[qualifiedQuickstartRun.artifact_tuple];
qualifiedQuickstartRun.qualification = quickstartQualification(qualifiedQuickstartTuple);
const qualifiedExperiments = validateSource(
  qualifiedQuickstartPass,
  baselinePublishedTuple,
).experimentsById;
const qualifiedPublicRecord = publicRunRecord(
  qualifiedQuickstartPass,
  qualifiedQuickstartRun,
  qualifiedExperiments,
);
assert.deepStrictEqual(
  qualifiedPublicRecord.qualification,
  qualifiedQuickstartRun.qualification,
  'public quickstart evidence must retain contract, scenario, and Laravel boot proof',
);

const staleComposerQuickstartPass = clone(qualifiedQuickstartPass);
staleComposerQuickstartPass.runs.find(
  run => run.experiment === 'quickstart',
).qualification.exact_composer_graph.artifact_tuple['sdk-php'] = '2.0.0-rc.99';
assert.throws(
  () => validateSource(staleComposerQuickstartPass, baselinePublishedTuple),
  /must use the run's exact sdk-php version/,
  'Laravel package discovery proof must come from the executed Composer tuple',
);

const discoveryFailedQuickstartPass = clone(qualifiedQuickstartPass);
discoveryFailedQuickstartPass.runs.find(
  run => run.experiment === 'quickstart',
).qualification.exact_composer_graph.package_discovery = 'fail';
assert.throws(
  () => validateSource(discoveryFailedQuickstartPass, baselinePublishedTuple),
  /must prove install, package discovery, and Laravel boot/,
  'failed Laravel package discovery must never produce public pass evidence',
);

const overRetention = clone(baselineSource);
overRetention.retention.max_runs_per_experiment = 1;
overRetention.runs.push({
  id: 'docs-20260729t140000z',
  experiment: 'docs',
  artifact_tuple: 'current',
  outcome: 'fail',
  runner_blocked: false,
  finished_at: '2026-07-29T14:00:00.000Z',
});
assert.throws(
  () => validateSource(overRetention, baselinePublishedTuple),
  /exceeds max_runs_per_experiment/,
  'retained evidence must remain bounded per experiment',
);

const sensitiveField = clone(baselineSource);
sensitiveField.current_artifact_tuple.customer_identifier = 'customer-42';
assert.throws(
  () => validateSource(sensitiveField, baselinePublishedTuple),
  /forbidden sensitive field customer_identifier/,
  'customer identifiers must be rejected before public generation',
);

const unknownRunField = clone(baselineSource);
unknownRunField.runs[0].observed_output = 'private runner output';
assert.throws(
  () => validateSource(unknownRunField, baselinePublishedTuple),
  /fields must be exactly/,
  'free-form diagnostics must not fit the retained run schema',
);

const credentialUrl = clone(regressionFixture);
credentialUrl.regression_trails[0].fix_url =
  'https://oauth-token@github.com/durable-workflow/durable-workflow.github.io/commit/0123456789abcdef0123456789abcdef01234567';
assert.throws(
  () => validateSource(credentialUrl, baselinePublishedTuple),
  /must be a public durable-workflow GitHub/,
  'credential-bearing URLs must never reach the public regression trail',
);

console.log('Platform conformance ledger generation checks passed');
