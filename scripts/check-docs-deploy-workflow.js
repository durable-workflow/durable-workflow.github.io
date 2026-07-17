const assert = require('assert');
const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'deploy.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const {
  compareLivePublicArtifacts,
  planDeployment,
} = require('./plan-docs-deploy');
const { ARTIFACT_DISTRIBUTION_SURFACES, ARTIFACT_VERSIONS } = require('./public-artifact-versions');

function fail(message) {
  throw new Error(message);
}

for (const required of [
  'workflow_dispatch:',
  "cron: '17 * * * *'",
  'group: public-docs-deploy',
  'cancel-in-progress: true',
  'actions/checkout@v6',
  'actions/setup-node@v6',
  'node-version: 24',
  'id: deploy-plan',
  'DOCS_DEPLOY_EVENT_NAME: ${{ github.event_name }}',
  'run: node scripts/plan-docs-deploy.js',
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
    artifact_versions: {...ARTIFACT_VERSIONS},
    artifact_distribution_surfaces: {
      'sdk-php': ARTIFACT_DISTRIBUTION_SURFACES['sdk-php'].map(surface => ({...surface})),
      server: ARTIFACT_DISTRIBUTION_SURFACES.server.map(surface => ({...surface})),
      'sdk-rust': ARTIFACT_DISTRIBUTION_SURFACES['sdk-rust'].map(surface => ({...surface})),
    },
  };
}

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
  const plan = await planDeployment({
    eventName: 'schedule',
    fetcher: async url => (
      url.pathname === '/docs-page-release-audit.json'
        ? currentAudit()
        : currentQuickstart()
    ),
  });

  assert.strictEqual(plan.deploy, false);
  assert.strictEqual(plan.reason, 'scheduled-current');
  assert.deepStrictEqual(plan.drift, []);
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
    fetcher: async url => (
      url.pathname === '/docs-page-release-audit.json'
        ? audit
        : quickstart
    ),
  });

  assert.strictEqual(plan.deploy, true);
  assert.strictEqual(plan.reason, 'scheduled-drift');
  assert(plan.drift.length >= 3);
}

async function assertScheduledDeployRepairsLiveCheckFailure() {
  const plan = await planDeployment({
    eventName: 'schedule',
    fetcher: async () => {
      throw new Error('live check failed');
    },
  });

  assert.strictEqual(plan.deploy, true);
  assert.strictEqual(plan.reason, 'scheduled-live-check-error');
  assert.deepStrictEqual(plan.drift, ['live check failed']);
}

async function main() {
  await assertPushDeploysWithoutFetchingLive();
  await assertScheduledDeploySkipsCurrentLiveTuple();
  await assertScheduledDeployRepairsStaleLiveTuple();
  await assertScheduledDeployRepairsLiveCheckFailure();

  console.log('Docs deploy workflow repairs stale public artifact deployment drift.');
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
