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

function experiment(ledger, id) {
  return ledger.experiments.find(entry => entry.id === id);
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
divergentCurrentTuple.current_artifact_tuple.server = '2.0.0-rc.7';
assert.throws(
  () => buildLedger(divergentCurrentTuple),
  /current_artifact_tuple must exactly match[\s\S]*server: ledger=2\.0\.0-rc\.7 published=2\.0\.0-rc\.8/,
  'ledger generation must reject drift from the published-artifact registry',
);

const ledger = buildLedger(source);
assert.strictEqual(ledger.schema_version, 2);
assert.strictEqual(ledger.snapshot_refreshed_at, source.captured_at);
assert.strictEqual(ledger.retained_evidence_captured_at, source.captured_at);
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

const historicalArtifactTuples = clone(source.artifact_tuples);
const historicalRuns = clone(source.runs);
const refreshedPublishedTuple = {
  ...source.current_artifact_tuple,
  server: '2.0.0-rc.9',
};
const refreshedSource = clone(source);
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
  source.captured_at,
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
  source.artifact_tuples.current,
  'historical executed evidence must retain its original exact artifact tuple',
);
assert.deepStrictEqual(
  experiment(refreshedLedger, 'cloud').executed_evidence.stale_artifacts,
  [
    {
      artifact: 'server',
      expected: '2.0.0-rc.9',
      actual: '2.0.0-rc.8',
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

const missingEvidence = clone(source);
missingEvidence.runs = missingEvidence.runs.filter(run => run.experiment !== 'replay');
const missingLedger = buildLedger(missingEvidence);
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

const currentFailure = clone(source);
currentFailure.runs.find(run => run.experiment === 'cloud').outcome = 'fail';
const currentFailureLedger = buildLedger(currentFailure);
assert.strictEqual(
  experiment(currentFailureLedger, 'cloud').executed_evidence.product_failure,
  true,
);
assert.strictEqual(
  currentFailureLedger.tiers.find(tier => tier.id === 'ecosystem').state,
  'product-failure',
  'a current product failure must remain visible even when its tier also has stale evidence',
);

const regressionFixture = clone(source);
addRegressionTrail(regressionFixture);
const regressionLedger = buildLedger(regressionFixture);
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
  validateSource(regressionFixture).experimentsById,
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

const overRetention = clone(source);
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
  () => validateSource(overRetention),
  /exceeds max_runs_per_experiment/,
  'retained evidence must remain bounded per experiment',
);

const sensitiveField = clone(source);
sensitiveField.current_artifact_tuple.customer_identifier = 'customer-42';
assert.throws(
  () => validateSource(sensitiveField),
  /forbidden sensitive field customer_identifier/,
  'customer identifiers must be rejected before public generation',
);

const unknownRunField = clone(source);
unknownRunField.runs[0].observed_output = 'private runner output';
assert.throws(
  () => validateSource(unknownRunField),
  /fields must be exactly/,
  'free-form diagnostics must not fit the retained run schema',
);

const credentialUrl = clone(regressionFixture);
credentialUrl.regression_trails[0].fix_url =
  'https://oauth-token@github.com/durable-workflow/durable-workflow.github.io/commit/0123456789abcdef0123456789abcdef01234567';
assert.throws(
  () => validateSource(credentialUrl),
  /must be a public durable-workflow GitHub/,
  'credential-bearing URLs must never reach the public regression trail',
);

console.log('Platform conformance ledger generation checks passed');
