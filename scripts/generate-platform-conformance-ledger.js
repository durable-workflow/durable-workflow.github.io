#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  PUBLISHED_ARTIFACT_VERSIONS,
} = require('./public-artifact-versions');

const repoRoot = path.join(__dirname, '..');
const sourcePath = path.join(
  repoRoot,
  'scripts',
  'platform-conformance-retained-evidence.json',
);
const ledgerPath = path.join(
  repoRoot,
  'static',
  'platform-conformance',
  'run-ledger.json',
);
const evidenceDir = path.join(
  repoRoot,
  'static',
  'platform-conformance',
  'evidence',
);

const ARTIFACTS = [
  'cli',
  'sdk-php',
  'sdk-python',
  'sdk-rust',
  'server',
  'waterline',
  'workflow',
];
const OUTCOMES = new Set(['pass', 'fail', 'error']);
const PUBLIC_ORIGIN = 'https://durable-workflow.github.io';
const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const QUICKSTART_CONTRACT_SCHEMA =
  'durable-workflow.docs.v2.quickstart-execution-contract';
const QUICKSTART_CONTRACT_URL =
  'https://durable-workflow.com/quickstart-execution-contract.json';
const QUICKSTART_SCENARIOS = [
  'php_user_local_server_completion',
  'python_user_local_server_completion',
  'rust_user_local_server_completion',
  'rust_user_cloud_completion',
  'operator_local_server_observation',
  'laravel_user_embedded_completion',
];
const QUICKSTART_COMPOSER_ARTIFACTS = [
  'sdk-php',
  'waterline',
  'workflow',
];
const PUBLIC_CONTRACT_PATH_PATTERN =
  /^\/(?:platform-conformance-contract\.json|platform-conformance\/[a-z0-9.-]+\.json)$/;
const PUBLIC_GITHUB_URL_PATTERN =
  /^https:\/\/github\.com\/durable-workflow\/[A-Za-z0-9_.-]+\/(?:commit|pull|blob)\/[^?#]+(?:#[A-Za-z0-9_.:-]+)?$/;
const SENSITIVE_KEY_PATTERN =
  /(?:credential|customer|diagnostic|email|hostname|note|password|prompt|reasoning|secret|token|trace|username)/i;

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, label) {
  if (!isPlainObject(value)) {
    fail(`${label} must be an object`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  assertObject(value, label);

  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      `${label} fields must be exactly ${expected.join(', ')}; got ${actual.join(', ')}`,
    );
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    fail(`${label} must be a lowercase public identifier`);
  }
}

function assertIsoTimestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    fail(`${label} must be an ISO 8601 UTC timestamp`);
  }
}

function assertArtifactTuple(tuple, label) {
  assertExactKeys(tuple, ARTIFACTS, label);

  for (const artifact of ARTIFACTS) {
    if (typeof tuple[artifact] !== 'string' || !VERSION_PATTERN.test(tuple[artifact])) {
      fail(`${label}.${artifact} must be an exact public artifact version`);
    }
  }
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
}

function assertQuickstartQualification(qualification, artifactTuple, label) {
  assertExactKeys(
    qualification,
    ['contract_identity', 'scenario_results', 'exact_composer_graph'],
    label,
  );

  const identity = qualification.contract_identity;
  assertExactKeys(identity, ['schema', 'version', 'url', 'sha256'], `${label}.contract_identity`);
  if (identity.schema !== QUICKSTART_CONTRACT_SCHEMA) {
    fail(`${label}.contract_identity.schema is unsupported`);
  }
  if (!Number.isInteger(identity.version) || identity.version < 1) {
    fail(`${label}.contract_identity.version must be a positive integer`);
  }
  if (identity.url !== QUICKSTART_CONTRACT_URL) {
    fail(`${label}.contract_identity.url must identify the public quickstart contract`);
  }
  assertSha256(identity.sha256, `${label}.contract_identity.sha256`);

  if (
    !Array.isArray(qualification.scenario_results)
    || qualification.scenario_results.length !== QUICKSTART_SCENARIOS.length
  ) {
    fail(`${label}.scenario_results must prove the exact six quickstart scenarios`);
  }
  qualification.scenario_results.forEach((result, index) => {
    assertExactKeys(result, ['id', 'outcome'], `${label}.scenario_results[${index}]`);
    if (
      result.id !== QUICKSTART_SCENARIOS[index]
      || result.outcome !== 'pass'
    ) {
      fail(`${label}.scenario_results must prove every quickstart scenario passed in order`);
    }
  });

  const composer = qualification.exact_composer_graph;
  assertExactKeys(
    composer,
    [
      'outcome',
      'artifact_tuple',
      'manifest_sha256',
      'install_output_sha256',
      'package_discovery',
      'package_discovery_output_sha256',
      'laravel_boot',
    ],
    `${label}.exact_composer_graph`,
  );
  if (
    composer.outcome !== 'pass'
    || composer.package_discovery !== 'pass'
    || composer.laravel_boot !== 'pass'
  ) {
    fail(`${label}.exact_composer_graph must prove install, package discovery, and Laravel boot`);
  }
  assertExactKeys(
    composer.artifact_tuple,
    QUICKSTART_COMPOSER_ARTIFACTS,
    `${label}.exact_composer_graph.artifact_tuple`,
  );
  for (const artifact of QUICKSTART_COMPOSER_ARTIFACTS) {
    if (composer.artifact_tuple[artifact] !== artifactTuple[artifact]) {
      fail(`${label}.exact_composer_graph must use the run's exact ${artifact} version`);
    }
  }
  assertSha256(composer.manifest_sha256, `${label}.exact_composer_graph.manifest_sha256`);
  assertSha256(
    composer.install_output_sha256,
    `${label}.exact_composer_graph.install_output_sha256`,
  );
  assertSha256(
    composer.package_discovery_output_sha256,
    `${label}.exact_composer_graph.package_discovery_output_sha256`,
  );
}

function assertContractUrl(value, label) {
  if (typeof value !== 'string' || !PUBLIC_CONTRACT_PATH_PATTERN.test(value)) {
    fail(`${label} must be a public platform-conformance contract path`);
  }
}

function assertPublicGithubUrl(value, label) {
  if (typeof value !== 'string' || !PUBLIC_GITHUB_URL_PATTERN.test(value)) {
    fail(`${label} must be a public durable-workflow GitHub fix or fixture URL`);
  }

  const url = new URL(value);
  if (url.username || url.password || url.search) {
    fail(`${label} must not contain credentials or query parameters`);
  }
}

function assertNoSensitiveFields(value, label = 'retained evidence') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveFields(entry, `${label}[${index}]`));
    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      fail(`${label} contains forbidden sensitive field ${key}`);
    }
    assertNoSensitiveFields(child, `${label}.${key}`);
  }
}

function validateSource(
  source,
  publishedArtifactTuple = PUBLISHED_ARTIFACT_VERSIONS,
) {
  assertExactKeys(
    source,
    [
      'schema',
      'schema_version',
      'captured_at',
      'current_artifact_tuple',
      'retention',
      'artifact_tuples',
      'tiers',
      'experiments',
      'runs',
      'regression_trails',
    ],
    'retained evidence source',
  );
  assertNoSensitiveFields(source);

  if (source.schema !== 'durable-workflow.v2.platform-conformance.retained-evidence') {
    fail('retained evidence source schema is unsupported');
  }
  if (source.schema_version !== 1) {
    fail('retained evidence source schema_version must be 1');
  }
  assertIsoTimestamp(source.captured_at, 'retained evidence source captured_at');
  assertArtifactTuple(source.current_artifact_tuple, 'current_artifact_tuple');
  assertArtifactTuple(
    publishedArtifactTuple,
    'published artifact registry',
  );
  const currentTupleMismatches = tupleDifferences(
    source.current_artifact_tuple,
    publishedArtifactTuple,
  );
  if (currentTupleMismatches.length > 0) {
    fail([
      'current_artifact_tuple must exactly match scripts/published-artifact-versions.json',
      ...currentTupleMismatches.map(({artifact, actual, expected}) => (
        `${artifact}: ledger=${actual} published=${expected}`
      )),
    ].join('\n'));
  }

  assertExactKeys(
    source.retention,
    ['max_runs_per_experiment', 'max_regression_trails'],
    'retention',
  );
  if (
    !Number.isInteger(source.retention.max_runs_per_experiment) ||
    source.retention.max_runs_per_experiment < 1 ||
    source.retention.max_runs_per_experiment > 10
  ) {
    fail('retention.max_runs_per_experiment must be between 1 and 10');
  }
  if (
    !Number.isInteger(source.retention.max_regression_trails) ||
    source.retention.max_regression_trails < 1 ||
    source.retention.max_regression_trails > 100
  ) {
    fail('retention.max_regression_trails must be between 1 and 100');
  }

  assertObject(source.artifact_tuples, 'artifact_tuples');
  for (const [tupleId, tuple] of Object.entries(source.artifact_tuples)) {
    assertIdentifier(tupleId, `artifact tuple id ${tupleId}`);
    assertArtifactTuple(tuple, `artifact_tuples.${tupleId}`);
  }

  if (!Array.isArray(source.tiers) || source.tiers.length === 0) {
    fail('tiers must be a non-empty array');
  }
  const tierIds = new Set();
  for (const [index, tier] of source.tiers.entries()) {
    assertExactKeys(tier, ['id', 'release_critical'], `tiers[${index}]`);
    assertIdentifier(tier.id, `tiers[${index}].id`);
    if (typeof tier.release_critical !== 'boolean') {
      fail(`tiers[${index}].release_critical must be boolean`);
    }
    if (tierIds.has(tier.id)) {
      fail(`tiers contains duplicate id ${tier.id}`);
    }
    tierIds.add(tier.id);
  }

  if (!Array.isArray(source.experiments) || source.experiments.length === 0) {
    fail('experiments must be a non-empty array');
  }
  const experimentsById = new Map();
  for (const [index, experiment] of source.experiments.entries()) {
    assertExactKeys(
      experiment,
      ['id', 'tier', 'contract_url'],
      `experiments[${index}]`,
    );
    assertIdentifier(experiment.id, `experiments[${index}].id`);
    assertIdentifier(experiment.tier, `experiments[${index}].tier`);
    assertContractUrl(experiment.contract_url, `experiments[${index}].contract_url`);
    if (!tierIds.has(experiment.tier)) {
      fail(`experiment ${experiment.id} references unknown tier ${experiment.tier}`);
    }
    if (experimentsById.has(experiment.id)) {
      fail(`experiments contains duplicate id ${experiment.id}`);
    }
    experimentsById.set(experiment.id, experiment);
  }

  if (!Array.isArray(source.runs)) {
    fail('runs must be an array');
  }
  const runsById = new Map();
  const runCounts = new Map();
  for (const [index, run] of source.runs.entries()) {
    const runFields = [
      'id',
      'experiment',
      'artifact_tuple',
      'outcome',
      'runner_blocked',
      'finished_at',
    ];
    if (run.qualification !== undefined) {
      runFields.push('qualification');
    }
    assertExactKeys(
      run,
      runFields,
      `runs[${index}]`,
    );
    assertIdentifier(run.id, `runs[${index}].id`);
    assertIdentifier(run.experiment, `runs[${index}].experiment`);
    assertIdentifier(run.artifact_tuple, `runs[${index}].artifact_tuple`);
    assertIsoTimestamp(run.finished_at, `runs[${index}].finished_at`);
    if (!experimentsById.has(run.experiment)) {
      fail(`run ${run.id} references unknown experiment ${run.experiment}`);
    }
    if (!source.artifact_tuples[run.artifact_tuple]) {
      fail(`run ${run.id} references unknown artifact tuple ${run.artifact_tuple}`);
    }
    if (!OUTCOMES.has(run.outcome)) {
      fail(`run ${run.id} has unsupported outcome ${run.outcome}`);
    }
    if (typeof run.runner_blocked !== 'boolean') {
      fail(`run ${run.id}.runner_blocked must be boolean`);
    }
    if (run.runner_blocked && run.outcome === 'pass') {
      fail(`runner-blocked run ${run.id} cannot have outcome pass`);
    }
    if (run.qualification !== undefined && run.experiment !== 'quickstart') {
      fail(`only quickstart runs may carry exact contract and Laravel qualification`);
    }
    if (run.experiment === 'quickstart' && run.outcome === 'pass') {
      if (run.runner_blocked || run.qualification === undefined) {
        fail(`passing quickstart run ${run.id} requires exact contract and Laravel qualification`);
      }
      assertQuickstartQualification(
        run.qualification,
        source.artifact_tuples[run.artifact_tuple],
        `runs[${index}].qualification`,
      );
    }
    if (runsById.has(run.id)) {
      fail(`runs contains duplicate id ${run.id}`);
    }

    const count = (runCounts.get(run.experiment) || 0) + 1;
    if (count > source.retention.max_runs_per_experiment) {
      fail(
        `experiment ${run.experiment} exceeds max_runs_per_experiment ` +
          `${source.retention.max_runs_per_experiment}`,
      );
    }
    runCounts.set(run.experiment, count);
    runsById.set(run.id, run);
  }

  if (!Array.isArray(source.regression_trails)) {
    fail('regression_trails must be an array');
  }
  if (source.regression_trails.length > source.retention.max_regression_trails) {
    fail(
      `regression_trails exceeds max_regression_trails ` +
        `${source.retention.max_regression_trails}`,
    );
  }

  const regressionIds = new Set();
  for (const [index, regression] of source.regression_trails.entries()) {
    assertExactKeys(
      regression,
      [
        'id',
        'experiment',
        'failing_run',
        'fix_url',
        'regression_fixture_url',
        'first_confirming_run',
      ],
      `regression_trails[${index}]`,
    );
    assertIdentifier(regression.id, `regression_trails[${index}].id`);
    assertIdentifier(regression.experiment, `regression_trails[${index}].experiment`);
    assertIdentifier(regression.failing_run, `regression_trails[${index}].failing_run`);
    assertIdentifier(
      regression.first_confirming_run,
      `regression_trails[${index}].first_confirming_run`,
    );
    assertPublicGithubUrl(regression.fix_url, `regression_trails[${index}].fix_url`);
    assertPublicGithubUrl(
      regression.regression_fixture_url,
      `regression_trails[${index}].regression_fixture_url`,
    );

    const failingRun = runsById.get(regression.failing_run);
    const confirmingRun = runsById.get(regression.first_confirming_run);
    if (!failingRun || failingRun.experiment !== regression.experiment) {
      fail(`regression ${regression.id} must link a failing run for its experiment`);
    }
    if (failingRun.runner_blocked || failingRun.outcome !== 'fail') {
      fail(`regression ${regression.id} failing run must be a product failure`);
    }
    if (!confirmingRun || confirmingRun.experiment !== regression.experiment) {
      fail(`regression ${regression.id} must link a confirming run for its experiment`);
    }
    if (confirmingRun.runner_blocked || confirmingRun.outcome !== 'pass') {
      fail(`regression ${regression.id} confirming run must be a product pass`);
    }
    if (Date.parse(confirmingRun.finished_at) <= Date.parse(failingRun.finished_at)) {
      fail(`regression ${regression.id} confirming run must follow the failing run`);
    }
    if (regressionIds.has(regression.id)) {
      fail(`regression_trails contains duplicate id ${regression.id}`);
    }
    regressionIds.add(regression.id);
  }

  return {experimentsById, runsById};
}

function tupleDifferences(actual, expected) {
  return ARTIFACTS.filter(artifact => actual[artifact] !== expected[artifact])
    .map(artifact => ({
      artifact,
      expected: expected[artifact],
      actual: actual[artifact],
    }));
}

function evidenceUrl(runId) {
  return `${PUBLIC_ORIGIN}/platform-conformance/evidence/${runId}.json`;
}

function publicSiteUrl(routePath) {
  return `${PUBLIC_ORIGIN}${routePath}`;
}

function publicRunRecord(source, run, experimentsById) {
  const experiment = experimentsById.get(run.experiment);
  const tier = source.tiers.find(candidate => candidate.id === experiment.tier);

  const record = {
    schema: 'durable-workflow.v2.platform-conformance.run-evidence',
    schema_version: 1,
    id: run.id,
    experiment: run.experiment,
    tier: experiment.tier,
    release_critical: tier.release_critical,
    evidence_kind: 'executed_run',
    artifact_tuple: source.artifact_tuples[run.artifact_tuple],
    outcome: run.outcome,
    runner_blocked: run.runner_blocked,
    finished_at: run.finished_at,
  };
  if (run.qualification !== undefined) {
    record.qualification = run.qualification;
  }
  return record;
}

function latestRunByExperiment(source) {
  const latest = new Map();

  for (const run of source.runs) {
    const existing = latest.get(run.experiment);
    if (!existing || Date.parse(run.finished_at) > Date.parse(existing.finished_at)) {
      latest.set(run.experiment, run);
    }
  }

  return latest;
}

function buildLedger(
  source,
  publishedArtifactTuple = PUBLISHED_ARTIFACT_VERSIONS,
  options = {},
) {
  const {experimentsById, runsById} = validateSource(
    source,
    publishedArtifactTuple,
  );
  const snapshotRefreshedAt =
    options.snapshotRefreshedAt || source.captured_at;
  assertIsoTimestamp(
    snapshotRefreshedAt,
    'ledger snapshot_refreshed_at',
  );
  if (Date.parse(snapshotRefreshedAt) < Date.parse(source.captured_at)) {
    fail(
      'ledger snapshot_refreshed_at must not precede retained evidence captured_at',
    );
  }
  const latestRuns = latestRunByExperiment(source);
  const tiersById = new Map(source.tiers.map(tier => [tier.id, tier]));

  const experiments = source.experiments
    .map(experiment => {
      const tier = tiersById.get(experiment.tier);
      const run = latestRuns.get(experiment.id);
      const staticContract = {
        evidence_kind: 'static_contract',
        status: 'published',
        url: publicSiteUrl(experiment.contract_url),
      };

      if (!run) {
        return {
          id: experiment.id,
          tier: experiment.tier,
          release_critical: tier.release_critical,
          static_contract: staticContract,
          executed_evidence: {
            evidence_kind: 'executed_run',
            status: 'missing',
            outcome: null,
            runner_blocked: false,
            finished_at: null,
            artifact_tuple: null,
            stale_artifacts: [],
            evidence_url: null,
            evidence_gap: tier.release_critical,
            gap_reason: tier.release_critical ? 'missing' : null,
            product_failure: false,
          },
        };
      }

      const runTuple = source.artifact_tuples[run.artifact_tuple];
      const staleArtifacts = tupleDifferences(
        runTuple,
        publishedArtifactTuple,
      );
      const status = staleArtifacts.length === 0 ? 'current' : 'stale';
      const evidenceGap =
        tier.release_critical && (status !== 'current' || run.runner_blocked);
      const productFailure =
        status === 'current' && !run.runner_blocked && run.outcome !== 'pass';

      return {
        id: experiment.id,
        tier: experiment.tier,
        release_critical: tier.release_critical,
        static_contract: staticContract,
        executed_evidence: {
          evidence_kind: 'executed_run',
          status,
          outcome: run.outcome,
          runner_blocked: run.runner_blocked,
          finished_at: run.finished_at,
          artifact_tuple: runTuple,
          stale_artifacts: staleArtifacts,
          evidence_url: evidenceUrl(run.id),
          evidence_gap: evidenceGap,
          gap_reason: evidenceGap
            ? run.runner_blocked
              ? 'runner_blocked'
              : status
            : null,
          product_failure: productFailure,
        },
      };
    })
    .sort((left, right) => (
      left.tier.localeCompare(right.tier) || left.id.localeCompare(right.id)
    ));

  const tiers = source.tiers.map(tier => {
    const tierExperiments = experiments.filter(experiment => experiment.tier === tier.id);
    const count = status => tierExperiments.filter(
      experiment => experiment.executed_evidence.status === status,
    ).length;

    return {
      id: tier.id,
      release_critical: tier.release_critical,
      experiment_count: tierExperiments.length,
      evidence_state: {
        current: count('current'),
        stale: count('stale'),
        missing: count('missing'),
      },
      runner_blocked: tierExperiments.filter(
        experiment => experiment.executed_evidence.runner_blocked,
      ).length,
      current_product_failures: tierExperiments.filter(
        experiment => experiment.executed_evidence.product_failure,
      ).length,
      state: tierExperiments.some(
        experiment => experiment.executed_evidence.product_failure,
      )
        ? 'product-failure'
        : tierExperiments.some(
          experiment => experiment.executed_evidence.evidence_gap,
        )
          ? 'evidence-gap'
          : 'current',
    };
  });

  const regressionTrails = source.regression_trails
    .map(regression => ({
      id: regression.id,
      experiment: regression.experiment,
      failing_run_url: evidenceUrl(regression.failing_run),
      fix_url: regression.fix_url,
      regression_fixture_url: regression.regression_fixture_url,
      first_confirming_run_url: evidenceUrl(regression.first_confirming_run),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const regression of regressionTrails) {
    if (!runsById.has(path.basename(regression.failing_run_url, '.json'))) {
      fail(`regression ${regression.id} has an unresolved failing run URL`);
    }
  }

  return {
    schema: 'durable-workflow.v2.platform-conformance.run-ledger',
    schema_version: 2,
    snapshot_refreshed_at: snapshotRefreshedAt,
    retained_evidence_captured_at: source.captured_at,
    current_artifact_tuple: publishedArtifactTuple,
    retention_policy: {
      max_runs_per_experiment: source.retention.max_runs_per_experiment,
      max_regression_trails: source.retention.max_regression_trails,
      retained_run_count: source.runs.length,
    },
    tiers,
    experiments,
    regression_trails: regressionTrails,
  };
}

function jsonSource(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function ledgerSource(
  source,
  publishedArtifactTuple = PUBLISHED_ARTIFACT_VERSIONS,
  options = {},
) {
  return jsonSource(buildLedger(source, publishedArtifactTuple, options));
}

function desiredOutputs(
  source,
  publishedArtifactTuple = PUBLISHED_ARTIFACT_VERSIONS,
  options = {},
) {
  const outputLedgerPath = options.ledgerPath || ledgerPath;
  const outputEvidenceDir = options.evidenceDir || evidenceDir;
  const {experimentsById} = validateSource(source, publishedArtifactTuple);
  const outputs = new Map([[
    outputLedgerPath,
    ledgerSource(source, publishedArtifactTuple, options),
  ]]);

  for (const run of source.runs) {
    outputs.set(
      path.join(outputEvidenceDir, `${run.id}.json`),
      jsonSource(publicRunRecord(source, run, experimentsById)),
    );
  }

  return outputs;
}

function checkOutputs(outputs, outputEvidenceDir = evidenceDir) {
  const failures = [];

  for (const [filePath, expected] of outputs) {
    if (!fs.existsSync(filePath)) {
      failures.push(`missing ${path.relative(repoRoot, filePath)}`);
      continue;
    }
    if (fs.readFileSync(filePath, 'utf8') !== expected) {
      failures.push(`stale ${path.relative(repoRoot, filePath)}`);
    }
  }

  if (fs.existsSync(outputEvidenceDir)) {
    const expectedNames = new Set(
      [...outputs.keys()]
        .filter(filePath => path.dirname(filePath) === outputEvidenceDir)
        .map(filePath => path.basename(filePath)),
    );
    for (const name of fs.readdirSync(outputEvidenceDir)) {
      if (name.endsWith('.json') && !expectedNames.has(name)) {
        failures.push(`unretained static/platform-conformance/evidence/${name}`);
      }
    }
  }

  if (failures.length > 0) {
    fail(
      `Platform conformance ledger generation check failed:\n` +
        failures.map(entry => `- ${entry}`).join('\n'),
    );
  }
}

function writeOutputs(outputs) {
  for (const [filePath, content] of outputs) {
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, content);
  }
}

function main() {
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  let snapshotRefreshedAt = new Date().toISOString();

  if (process.argv.includes('--check') && fs.existsSync(ledgerPath)) {
    const currentLedger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    snapshotRefreshedAt = currentLedger.snapshot_refreshed_at;
  }

  const outputs = desiredOutputs(
    source,
    PUBLISHED_ARTIFACT_VERSIONS,
    {snapshotRefreshedAt},
  );

  if (process.argv.includes('--check')) {
    checkOutputs(outputs);
    console.log(
      `Platform conformance ledger is current with ${source.runs.length} retained runs`,
    );
    return;
  }

  writeOutputs(outputs);
  console.log(
    `Generated platform conformance ledger from ${source.runs.length} retained runs`,
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  ARTIFACTS,
  buildLedger,
  checkOutputs,
  desiredOutputs,
  ledgerSource,
  publicRunRecord,
  validateSource,
};
