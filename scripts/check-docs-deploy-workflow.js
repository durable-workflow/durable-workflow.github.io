const assert = require('assert');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'deploy.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const {
  compareLivePublicArtifacts,
  planDeployment,
} = require('./plan-docs-deploy');
const {
  REQUIRED_LIVE_ARTIFACT_PATHS,
} = require('./docs-release-live-artifacts');
const {
  LIVE_ARTIFACTS,
  assertReleaseAuditAuthority,
} = require('./verify-docs-release-live');
const {
  buildArtifactCompatibilityProjection,
} = require('./generate-docs-page-release-audit');
const { ARTIFACT_DISTRIBUTION_SURFACES, ARTIFACT_VERSIONS } = require('./public-artifact-versions');

const PROTECTED_DEPLOY_SOURCE_GUARD =
  "github.repository == 'durable-workflow/durable-workflow.github.io' && " +
  "github.ref == 'refs/heads/main'";
const CURRENT_DOCS_REVISION = 'a'.repeat(40);
const quickstartContract = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'static', 'quickstart-execution-contract.json'), 'utf8'),
);
const compatibilityContract = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'static', 'compatibility-contract.json'), 'utf8'),
);
const artifactCompatibilityEvidence = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'static', 'public-artifact-compatibility-evidence.json'),
    'utf8',
  ),
);

function fail(message) {
  throw new Error(message);
}

function assertProtectedDeploySource(source) {
  const parsed = yaml.load(source);
  const deployJob = parsed?.jobs?.deploy;

  if (!deployJob || deployJob.if !== PROTECTED_DEPLOY_SOURCE_GUARD) {
    fail(
      'docs deploy workflow must guard the privileged deploy job with the exact ' +
        'repository identity and protected main ref',
    );
  }

  if (parsed.permissions?.contents !== 'read' || deployJob.permissions?.contents !== 'write') {
    fail('docs deploy workflow must grant contents write only to the protected deploy job');
  }
}

assertProtectedDeploySource(workflow);

for (const [label, fixture] of [
  [
    'non-main ref',
    workflow.replace("github.ref == 'refs/heads/main'", "github.ref == 'refs/tags/latest'"),
  ],
  [
    'different repository',
    workflow.replace(
      "github.repository == 'durable-workflow/durable-workflow.github.io'",
      "github.repository == 'contributor/durable-workflow.github.io'",
    ),
  ],
]) {
  assert.notStrictEqual(fixture, workflow, `${label} fixture must mutate the workflow`);
  assert.throws(
    () => assertProtectedDeploySource(fixture),
    /exact repository identity and protected main ref/,
    `docs deploy contract must reject a ${label}`,
  );
}

for (const required of [
  'workflow_dispatch:',
  "cron: '17 * * * *'",
  'group: public-docs-deploy',
  'cancel-in-progress: true',
  'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
  'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38',
  'node-version: 24',
  'id: deploy-plan',
  'DOCS_DEPLOY_EVENT_NAME: ${{ github.event_name }}',
  'run: node scripts/plan-docs-deploy.js',
  'name: Verify live docs release audit',
  'run: node scripts/verify-docs-release-live.js',
  'name: Verify live workflow lifecycle authority',
  'run: node scripts/verify-workflow-lifecycle-live.js',
  "if: steps.deploy-plan.outputs.deploy == 'true'",
  "if: steps.deploy-plan.outputs.deploy != 'true'",
]) {
  if (!workflow.includes(required)) {
    fail(`deploy workflow is missing required public docs deployment guard: ${required}`);
  }
}

function currentAudit() {
  return {
    docs_revision: CURRENT_DOCS_REVISION,
    artifact_versions: {...ARTIFACT_VERSIONS},
    artifact_compatibility_evidence: buildArtifactCompatibilityProjection(),
    release_status_guardrail: {
      stable_default_docs_version: '1.x',
      explicit_prerelease_docs_version: '2.0',
    },
    artifact_distribution_surfaces: {
      'sdk-php': ARTIFACT_DISTRIBUTION_SURFACES['sdk-php'].map(surface => ({...surface})),
      server: ARTIFACT_DISTRIBUTION_SURFACES.server.map(surface => ({...surface})),
      'sdk-rust': ARTIFACT_DISTRIBUTION_SURFACES['sdk-rust'].map(surface => ({...surface})),
    },
  };
}

function currentNarrativeAudit() {
  return {
    docs_revision: CURRENT_DOCS_REVISION,
    artifact_versions: {...ARTIFACT_VERSIONS},
    release_status_guardrail: {
      stable_default_docs_version: '1.x',
      explicit_prerelease_docs_version: '2.0',
    },
  };
}

function currentLiveArtifacts() {
  return {
    '/docs-page-release-audit.json': currentAudit(),
    '/docs-narrative-audit.json': currentNarrativeAudit(),
    '/quickstart-execution-contract.json': structuredClone(quickstartContract),
    '/compatibility-contract.json': structuredClone(compatibilityContract),
    '/public-artifact-compatibility-evidence.json':
      structuredClone(artifactCompatibilityEvidence),
  };
}

assert.strictEqual(
  LIVE_ARTIFACTS,
  REQUIRED_LIVE_ARTIFACT_PATHS,
  'the planner and post-deploy verifier must consume one required live-artifact inventory',
);
assert.deepStrictEqual(
  REQUIRED_LIVE_ARTIFACT_PATHS,
  [
    '/docs-page-release-audit.json',
    '/docs-narrative-audit.json',
    '/quickstart-execution-contract.json',
    '/compatibility-contract.json',
    '/public-artifact-compatibility-evidence.json',
  ],
  'the required live-artifact inventory must cover every release-authority artifact',
);

assert.doesNotThrow(
  () => assertReleaseAuditAuthority(JSON.stringify(currentAudit())),
  'live release-audit verification must accept the current artifact and docs-line authority',
);
assert.throws(
  () => assertReleaseAuditAuthority(JSON.stringify({
    ...currentAudit(),
    artifact_versions: {
      ...ARTIFACT_VERSIONS,
      server: '2.0.0-beta.999',
    },
  })),
  /artifact tuple does not match/,
  'live release-audit verification must reject artifact drift',
);

function currentQuickstart() {
  return {
    artifacts: Object.fromEntries(
      Object.entries(ARTIFACT_VERSIONS).map(([name, version]) => [name, {version}])
    ),
  };
}

async function assertPushDeploysWithoutFetchingLive() {
  let fetched = false;
  const plan = await planDeployment({
    eventName: 'push',
    fetcher: async () => {
      fetched = true;
      throw new Error('push deploy should not fetch live docs');
    },
  });

  assert.strictEqual(plan.deploy, true);
  assert.strictEqual(plan.reason, 'event:push');
  assert.strictEqual(fetched, false);
}

async function assertScheduledDeploySkipsCurrentLiveTuple() {
  const artifacts = currentLiveArtifacts();
  const fetched = [];
  const plan = await planDeployment({
    eventName: 'schedule',
    expectedRevision: CURRENT_DOCS_REVISION,
    fetcher: async url => {
      fetched.push(url.pathname);
      return artifacts[url.pathname];
    },
  });

  assert.strictEqual(plan.deploy, false);
  assert.strictEqual(plan.reason, 'scheduled-current');
  assert.deepStrictEqual(plan.drift, []);
  assert.deepStrictEqual(
    fetched.sort(),
    [...REQUIRED_LIVE_ARTIFACT_PATHS].sort(),
    'scheduled planning must fetch every post-deploy release artifact',
  );
}

async function assertScheduledDeployRepairsStaleLiveTuple() {
  const audit = currentAudit();
  const quickstart = currentQuickstart();

  audit.artifact_versions.server = '0.2.543';
  audit.artifact_distribution_surfaces['sdk-php'][0].url = 'https://packagist.org/packages/stale/php-sdk';
  audit.artifact_distribution_surfaces.server[0].tag = '0.2.543';
  audit.artifact_distribution_surfaces.server[0].reference = 'durableworkflow/server:0.2.543';
  audit.artifact_distribution_surfaces['sdk-rust'][0].url = 'https://crates.io/crates/stale-package';
  quickstart.artifacts.cli.version = '0.1.84';

  const drift = compareLivePublicArtifacts(ARTIFACT_VERSIONS, audit, quickstart);

  assert(
    drift.some(item => item.includes('/docs-page-release-audit.json artifact_versions.server')),
    'release-audit server artifact drift must be reported'
  );
  assert(
    drift.some(item => item.includes('/quickstart-execution-contract.json artifacts.cli.version')),
    'quickstart CLI artifact drift must be reported'
  );
  assert(
    drift.some(item => item.includes('PHP SDK surface packagist_package.url')),
    'PHP SDK distribution surface drift must be reported'
  );
  assert(
    drift.some(item => item.includes('server surface docker_hub_container_image.tag')),
    'server distribution surface drift must be reported'
  );
  assert(
    drift.some(item => item.includes('Rust SDK surface crates_io_package.url')),
    'Rust SDK distribution surface drift must be reported'
  );

  const plan = await planDeployment({
    eventName: 'schedule',
    expectedRevision: CURRENT_DOCS_REVISION,
    fetcher: async url => {
      const artifacts = currentLiveArtifacts();
      artifacts['/docs-page-release-audit.json'] = audit;
      artifacts['/quickstart-execution-contract.json'] = quickstart;
      return artifacts[url.pathname];
    },
  });

  assert.strictEqual(plan.deploy, true);
  assert.strictEqual(plan.reason, 'scheduled-drift');
  assert(plan.drift.length >= 3);
}

async function assertScheduledDeployRepairsStaleNarrativeAudit() {
  const artifacts = currentLiveArtifacts();
  artifacts['/docs-narrative-audit.json'].docs_revision = 'b'.repeat(40);

  const plan = await planDeployment({
    eventName: 'schedule',
    expectedRevision: CURRENT_DOCS_REVISION,
    fetcher: async url => artifacts[url.pathname],
  });

  assert.strictEqual(plan.deploy, true);
  assert.strictEqual(plan.reason, 'scheduled-drift');
  assert(
    plan.drift.some(item => item.includes('/docs-narrative-audit.json docs_revision')),
    'narrative-audit-only drift must request deployment',
  );
}

async function assertScheduledDeployRepairsStaleCompatibilityContract() {
  const artifacts = currentLiveArtifacts();
  artifacts['/compatibility-contract.json'].version += 1;

  const plan = await planDeployment({
    eventName: 'schedule',
    expectedRevision: CURRENT_DOCS_REVISION,
    fetcher: async url => artifacts[url.pathname],
  });

  assert.strictEqual(plan.deploy, true);
  assert.strictEqual(plan.reason, 'scheduled-drift');
  assert(
    plan.drift.some(item => item.includes('/compatibility-contract.json')),
    'compatibility-contract-only drift must request deployment',
  );
}

async function assertScheduledDeployRepairsLiveArtifactFailure(route, message) {
  const artifacts = currentLiveArtifacts();
  const plan = await planDeployment({
    eventName: 'schedule',
    expectedRevision: CURRENT_DOCS_REVISION,
    fetcher: async url => {
      if (url.pathname === route) {
        throw new Error(message);
      }
      return artifacts[url.pathname];
    },
  });

  assert.strictEqual(plan.deploy, true);
  assert.strictEqual(plan.reason, 'scheduled-live-check-error');
  assert.deepStrictEqual(plan.drift, [message]);
}

async function main() {
  await assertPushDeploysWithoutFetchingLive();
  await assertScheduledDeploySkipsCurrentLiveTuple();
  await assertScheduledDeployRepairsStaleLiveTuple();
  await assertScheduledDeployRepairsStaleNarrativeAudit();
  await assertScheduledDeployRepairsStaleCompatibilityContract();
  for (const route of REQUIRED_LIVE_ARTIFACT_PATHS) {
    await assertScheduledDeployRepairsLiveArtifactFailure(
      route,
      `${route} returned HTTP 404`,
    );
    await assertScheduledDeployRepairsLiveArtifactFailure(
      route,
      `${route} did not return JSON`,
    );
  }

  console.log('Docs deploy workflow repairs drift across every verified release artifact.');
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
