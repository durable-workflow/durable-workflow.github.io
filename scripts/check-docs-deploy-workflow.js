const assert = require('assert');
const crypto = require('crypto');
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
  buildComponentReleaseQualificationProjection,
} = require('./generate-docs-page-release-audit');
const {
  ARTIFACT_DISTRIBUTION_SURFACES,
  ARTIFACT_VERSIONS,
  PUBLISHED_ARTIFACT_VERSIONS,
} = require('./public-artifact-versions');

const PROTECTED_DEPLOY_SOURCE_GUARD =
  "github.repository == 'durable-workflow/durable-workflow.github.io' && " +
  "github.ref == 'refs/heads/main'";
const DEPLOY_REQUESTED = "steps.deploy-plan.outputs.deploy == 'true'";
const CATALOG_PUBLISHABLE =
  `${DEPLOY_REQUESTED} && ` +
  `(steps.server_catalog.outputs.deployment_state == 'deployable' || ` +
  `steps.server_catalog.outputs.deployment_state == 'source-qualified-deployable')`;
const CATALOG_FORWARD_CANDIDATE =
  `${DEPLOY_REQUESTED} && steps.server_catalog.outputs.deployment_state == ` +
  "'source-qualified-deployable'";
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
const componentReleaseQualifications = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'static', 'public-component-release-qualifications.json'),
    'utf8',
  ),
);
const platformConformanceContract = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'static', 'platform-conformance-contract.json'),
    'utf8',
  ),
);
const helmRelease = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'static', 'charts', 'release.json'), 'utf8'),
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

  const steps = deployJob.steps || [];
  const installIndex = steps.findIndex(step => step.run === 'npm ci');
  const setupHelmIndex = steps.findIndex(
    step => step.uses ===
      'azure/setup-helm@9bc31f4ebc9c6b171d7bfbaa5d006ae7abdb4310',
  );
  const planIndex = steps.findIndex(
    step => step.run === 'node scripts/plan-docs-deploy.js',
  );
  const publishedWorkflowResolveIndex = steps.findIndex(
    step => step.name === 'Resolve published Workflow conformance ref',
  );
  const publishedWorkflowCheckoutIndex = steps.findIndex(
    step => step.name === 'Checkout published Workflow conformance authority',
  );
  const serverCatalogIndex = steps.findIndex(
    step => step.name === 'Verify pinned server protocol catalog',
  );
  const forwardCandidateReportIndex = steps.findIndex(
    step => step.name === 'Report source-qualified additive catalog deployment',
  );
  const buildIndex = steps.findIndex(step => step.run === 'npm run build');
  if (
    installIndex < 0 ||
    setupHelmIndex < 0 ||
    planIndex < 0 ||
    installIndex >= planIndex ||
    setupHelmIndex >= planIndex ||
    steps[installIndex].if ||
    steps[setupHelmIndex].if
  ) {
    fail(
      'docs deploy workflow must install the Helm history validation tooling ' +
        'before scheduled planning',
    );
  }
  const publishedWorkflowResolve = steps[publishedWorkflowResolveIndex];
  const publishedWorkflowCheckout = steps[publishedWorkflowCheckoutIndex];
  const serverCatalog = steps[serverCatalogIndex];
  const forwardCandidateReport = steps[forwardCandidateReportIndex];
  const buildStep = steps[buildIndex];
  if (
    serverCatalogIndex < 0 ||
    forwardCandidateReportIndex < 0 ||
    publishedWorkflowResolveIndex < 0 ||
    publishedWorkflowCheckoutIndex < 0 ||
    buildIndex < 0 ||
    serverCatalogIndex >= forwardCandidateReportIndex ||
    forwardCandidateReportIndex >= publishedWorkflowResolveIndex ||
    publishedWorkflowResolveIndex >= publishedWorkflowCheckoutIndex ||
    publishedWorkflowCheckoutIndex >= buildIndex ||
    serverCatalog.id !== 'server_catalog' ||
    serverCatalog.if !== DEPLOY_REQUESTED ||
    serverCatalog.env?.PUBLIC_SERVER_PROTOCOL_CATALOG_ALLOW_FORWARD_CANDIDATE !== '1' ||
    forwardCandidateReport.if !== CATALOG_FORWARD_CANDIDATE ||
    !forwardCandidateReport.run.includes('writeDeploymentSummary') ||
    publishedWorkflowResolve.if !== CATALOG_PUBLISHABLE ||
    !publishedWorkflowResolve.run.includes(
      "require('./scripts/workflow-platform-conformance-authority-lock.json').workflow_source_commit",
    ) ||
    publishedWorkflowCheckout.if !== CATALOG_PUBLISHABLE ||
    publishedWorkflowCheckout.with?.['github-server-url'] !== undefined ||
    publishedWorkflowCheckout.with?.repository !==
      '${{ github.repository_owner }}/workflow' ||
    publishedWorkflowCheckout.with?.ref !==
      '${{ steps.published-workflow.outputs.ref }}' ||
    publishedWorkflowCheckout.with?.path !== '.published-workflow-authority' ||
    publishedWorkflowCheckout.with?.['persist-credentials'] !== false ||
    buildStep.if !== CATALOG_PUBLISHABLE ||
    buildStep.env?.WORKFLOW_PLATFORM_CONFORMANCE_MANIFEST_PATH !==
      '${{ github.workspace }}/.published-workflow-authority/resources/platform-conformance-contract.json'
  ) {
    fail(
      'docs deploy workflow must compare the public conformance authority with ' +
        'the pinned published Workflow manifest before building',
    );
  }
  const predeployIndex = steps.findIndex(
    step => step.run === 'node scripts/helm-chart-release.js pre-deploy',
  );
  const deployIndex = steps.findIndex(
    step => step.uses ===
      'peaceiris/actions-gh-pages@84c30a85c19949d7eee79c4ff27748b70285e453',
  );
  if (predeployIndex < 0 || deployIndex < 0 || predeployIndex >= deployIndex) {
    fail(
      'docs deploy workflow must guard Helm chart immutability and stage the ' +
        'guarded package before the Pages deploy action',
    );
  }

  for (const stepName of [
    'Resolve Workflow authority ref',
    'Checkout Workflow authority',
    'Resolve published Workflow conformance ref',
    'Checkout published Workflow conformance authority',
    'Build website',
    'Set up Docker Buildx',
    'Guard Helm chart immutability and stage the HTTPS repository',
    'Verify public artifact tuple',
    'Deploy to GitHub Pages',
    'Verify live docs release audit',
    'Verify live workflow lifecycle authority',
    'Verify both public Helm release channels',
  ]) {
    const step = steps.find(candidate => candidate.name === stepName);
    if (!step || step.if !== CATALOG_PUBLISHABLE) {
      fail(
        `docs deploy workflow must gate ${stepName} on an exact qualified Server catalog ` +
          'match or a structurally validated one-revision additive source catalog',
      );
    }
  }

  const helmEvidence = steps.find(
    step => step.name === 'Upload public Helm validation evidence',
  );
  if (
    !helmEvidence
    || helmEvidence.if !== `\${{ always() && ${CATALOG_PUBLISHABLE} }}`
  ) {
    fail(
      'docs deploy workflow must upload Helm publication evidence for every permitted deployment',
    );
  }
}

assertProtectedDeploySource(workflow);

const deployWithTupleWorkflowRef = workflow.replace(
  "require('./scripts/workflow-platform-conformance-authority-lock.json').workflow_source_commit",
  "require('./scripts/published-artifact-versions.json').artifacts.workflow",
);
assert.notStrictEqual(
  deployWithTupleWorkflowRef,
  workflow,
  'tuple Workflow ref fixture must mutate documentation deployment',
);
assert.throws(
  () => assertProtectedDeploySource(deployWithTupleWorkflowRef),
  /pinned published Workflow manifest/,
  'documentation deployment must use the exact conformance authority commit',
);

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

const workflowWithoutPredeployGuard = workflow.replace(
  'run: node scripts/helm-chart-release.js pre-deploy',
  'run: node scripts/helm-chart-release.js stage-without-guard',
);
assert.notStrictEqual(
  workflowWithoutPredeployGuard,
  workflow,
  'pre-deploy guard fixture must mutate the workflow',
);
assert.throws(
  () => assertProtectedDeploySource(workflowWithoutPredeployGuard),
  /guard Helm chart immutability.*before the Pages deploy action/,
  'docs deploy contract must reject a missing pre-deploy Helm immutability guard',
);

const workflowWithUnqualifiedBuild = workflow.replace(
  "      - name: Build website\n" +
    "        if: >-\n" +
    "          steps.deploy-plan.outputs.deploy == 'true' &&\n" +
    "          (steps.server_catalog.outputs.deployment_state == 'deployable' ||\n" +
    "          steps.server_catalog.outputs.deployment_state == 'source-qualified-deployable')\n",
  "      - name: Build website\n" +
    "        if: steps.deploy-plan.outputs.deploy == 'true'\n",
);
assert.notStrictEqual(
  workflowWithUnqualifiedBuild,
  workflow,
  'unqualified-build fixture must mutate the workflow',
);
assert.throws(
  () => assertProtectedDeploySource(workflowWithUnqualifiedBuild),
  /gate Build website on an exact qualified Server catalog|conformance authority/,
  'unqualified catalog drift must never build or publish the website',
);

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
  'name: Resolve published Workflow conformance ref',
  'name: Checkout published Workflow conformance authority',
  'repository: ${{ github.repository_owner }}/workflow',
  'WORKFLOW_PLATFORM_CONFORMANCE_MANIFEST_PATH: ${{ github.workspace }}/.published-workflow-authority/resources/platform-conformance-contract.json',
  'name: Guard Helm chart immutability and stage the HTTPS repository',
  'run: node scripts/helm-chart-release.js pre-deploy',
  'name: Verify both public Helm release channels',
  'run: node scripts/helm-chart-release.js verify-live',
  'name: Upload public Helm validation evidence',
  'helm-predeploy-immutability-evidence.json',
  'helm-public-validation-evidence.json',
  "PUBLIC_SERVER_PROTOCOL_CATALOG_ALLOW_FORWARD_CANDIDATE: '1'",
  'name: Report source-qualified additive catalog deployment',
  "steps.server_catalog.outputs.deployment_state == 'source-qualified-deployable'",
  "steps.server_catalog.outputs.deployment_state == 'deployable'",
  'writeDeploymentSummary',
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
    artifact_versions: {...PUBLISHED_ARTIFACT_VERSIONS},
    artifact_compatibility_evidence: buildArtifactCompatibilityProjection(),
    component_release_qualifications: buildComponentReleaseQualificationProjection(),
    release_status_guardrail: {
      stable_default_docs_version: '1.x',
      explicit_prerelease_docs_version: '2.0',
    },
    artifact_distribution_surfaces: Object.fromEntries(
      Object.entries(ARTIFACT_DISTRIBUTION_SURFACES).map(([artifact, surfaces]) => [
        artifact,
        surfaces.map(surface => ({...surface})),
      ]),
    ),
  };
}

function currentNarrativeAudit() {
  return {
    docs_revision: CURRENT_DOCS_REVISION,
    artifact_versions: {...PUBLISHED_ARTIFACT_VERSIONS},
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
    '/public-component-release-qualifications.json':
      structuredClone(componentReleaseQualifications),
    '/platform-conformance-contract.json':
      structuredClone(platformConformanceContract),
    '/charts/release.json': structuredClone(helmRelease),
    '/charts/provenance.json': {
      chart: {
        version: helmRelease.chart.version,
        app_version: helmRelease.chart.app_version,
      },
      image: {
        reference: helmRelease.image.reference,
      },
      channels: {
        oci: {
          repository: helmRelease.channels.oci.repository,
        },
        https: {
          repository: helmRelease.channels.https.repository,
        },
      },
    },
  };
}

function currentHelmHistoryFixture(mutate = () => {}) {
  const releases = [
    {
      version: '0.1.0',
      appVersion: '2.0.0-rc.10',
      sourceRevision: 'b'.repeat(40),
      imageDigest: `sha256:${'c'.repeat(64)}`,
      packageBody: Buffer.from('historical-public-chart-package'),
    },
    {
      version: helmRelease.chart.version,
      appVersion: helmRelease.chart.app_version,
      sourceRevision: 'd'.repeat(40),
      imageDigest: `sha256:${'e'.repeat(64)}`,
      packageBody: Buffer.from('current-public-chart-package'),
    },
  ].map(release => {
    const packageUrl = new URL(
      `${helmRelease.chart.name}-${release.version}.tgz`,
      helmRelease.channels.https.repository,
    ).href;
    return {
      ...release,
      imageReference: `docker.io/durableworkflow/server:${release.appVersion}`,
      packageDigest:
        `sha256:${crypto.createHash('sha256').update(release.packageBody).digest('hex')}`,
      packagePath: new URL(packageUrl).pathname,
      packageUrl,
    };
  });
  const history = {
    schema: 'durable-workflow-helm-release-history/v1',
    chart: {
      name: helmRelease.chart.name,
    },
    versions: Object.fromEntries(releases.map(release => [
      release.version,
      {
        package_url: release.packageUrl,
        package_digest: release.packageDigest,
        source_revision: release.sourceRevision,
        app_version: release.appVersion,
        image_reference: release.imageReference,
        image_digest: release.imageDigest,
      },
    ])),
  };
  const index = {
    apiVersion: 'v1',
    entries: {
      [helmRelease.chart.name]: releases.map(release => ({
        name: helmRelease.chart.name,
        version: release.version,
        appVersion: release.appVersion,
        digest: release.packageDigest.replace(/^sha256:/, ''),
        urls: [release.packageUrl],
      })),
    },
  };
  const resources = {
    '/charts/release-history.json': {
      status: 200,
      body: Buffer.from(JSON.stringify(history)),
    },
    '/charts/index.yaml': {
      status: 200,
      body: Buffer.from(yaml.dump(index)),
    },
    ...Object.fromEntries(releases.map(release => [
      release.packagePath,
      {
        status: 200,
        body: release.packageBody,
      },
    ])),
  };
  const fixture = {
    currentPackagePath: releases.at(-1).packagePath,
    historicalPackagePath: releases[0].packagePath,
    history,
    index,
    packagePaths: releases.map(release => release.packagePath),
    releases,
    resources,
  };
  mutate(fixture);

  return {
    ...fixture,
    fetchResource: async url => (
      resources[new URL(url).pathname] || {status: 404, body: Buffer.alloc(0)}
    ),
    chartMetadata: packagePath => {
      const release = releases.find(
        candidate => path.basename(packagePath) === path.basename(candidate.packagePath),
      );
      assert(release, `fixture metadata must identify ${packagePath}`);
      return {
        name: helmRelease.chart.name,
        version: release.version,
        appVersion: release.appVersion,
        annotations: {
          'dev.durable-workflow.source-revision': release.sourceRevision,
          'dev.durable-workflow.image-reference': release.imageReference,
        },
      };
    },
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
    '/public-component-release-qualifications.json',
    '/platform-conformance-contract.json',
    '/charts/release.json',
    '/charts/provenance.json',
  ],
  'the required live-artifact inventory must cover component and Helm release authority',
);

assert.doesNotThrow(
  () => assertReleaseAuditAuthority(JSON.stringify(currentAudit())),
  'live release-audit verification must accept the current artifact and docs-line authority',
);
assert.throws(
  () => assertReleaseAuditAuthority(JSON.stringify({
    ...currentAudit(),
    artifact_versions: {
      ...PUBLISHED_ARTIFACT_VERSIONS,
      server: '2.0.0-beta.999',
    },
  })),
  /current published-component authority/,
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
  const history = currentHelmHistoryFixture();
  const fetched = [];
  const plan = await planDeployment({
    eventName: 'schedule',
    expectedRevision: CURRENT_DOCS_REVISION,
    fetcher: async url => {
      fetched.push(url.pathname);
      return artifacts[url.pathname];
    },
    fetchResource: async url => {
      fetched.push(new URL(url).pathname);
      return history.fetchResource(url);
    },
    chartMetadata: history.chartMetadata,
  });

  assert.strictEqual(plan.deploy, false);
  assert.strictEqual(plan.reason, 'scheduled-current');
  assert.deepStrictEqual(plan.drift, []);
  assert.deepStrictEqual(
    fetched.sort(),
    [
      ...REQUIRED_LIVE_ARTIFACT_PATHS,
      '/charts/release-history.json',
      '/charts/index.yaml',
      ...history.packagePaths,
    ].sort(),
    'scheduled planning must fetch every release artifact and recorded Helm package',
  );
}

async function assertScheduledDeployRepairsStaleLiveTuple() {
  const audit = currentAudit();
  const quickstart = currentQuickstart();
  const history = currentHelmHistoryFixture();

  audit.artifact_versions.server = '0.2.543';
  audit.artifact_distribution_surfaces['sdk-php'][0].url = 'https://packagist.org/packages/stale/php-sdk';
  audit.artifact_distribution_surfaces.server[0].tag = '0.2.543';
  audit.artifact_distribution_surfaces.server[0].reference = 'durableworkflow/server:0.2.543';
  audit.artifact_distribution_surfaces.waterline[0].tag = '2.0.0-rc.5';
  audit.artifact_distribution_surfaces['sdk-rust'][0].url = 'https://crates.io/crates/stale-package';
  quickstart.artifacts.cli.version = '0.1.84';

  const drift = compareLivePublicArtifacts(
    ARTIFACT_VERSIONS,
    audit,
    quickstart,
    PUBLISHED_ARTIFACT_VERSIONS,
  );

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
    drift.some(item => item.includes('Waterline surface github_release.tag')),
    'Waterline distribution surface drift must be reported',
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
    fetchResource: history.fetchResource,
    chartMetadata: history.chartMetadata,
  });

  assert.strictEqual(plan.deploy, true);
  assert.strictEqual(plan.reason, 'scheduled-drift');
  assert(plan.drift.length >= 3);
}

async function assertScheduledDeployRepairsStaleNarrativeAudit() {
  const artifacts = currentLiveArtifacts();
  const history = currentHelmHistoryFixture();
  artifacts['/docs-narrative-audit.json'].docs_revision = 'b'.repeat(40);

  const plan = await planDeployment({
    eventName: 'schedule',
    expectedRevision: CURRENT_DOCS_REVISION,
    fetcher: async url => artifacts[url.pathname],
    fetchResource: history.fetchResource,
    chartMetadata: history.chartMetadata,
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
  const history = currentHelmHistoryFixture();
  artifacts['/compatibility-contract.json'].version += 1;

  const plan = await planDeployment({
    eventName: 'schedule',
    expectedRevision: CURRENT_DOCS_REVISION,
    fetcher: async url => artifacts[url.pathname],
    fetchResource: history.fetchResource,
    chartMetadata: history.chartMetadata,
  });

  assert.strictEqual(plan.deploy, true);
  assert.strictEqual(plan.reason, 'scheduled-drift');
  assert(
    plan.drift.some(item => item.includes('/compatibility-contract.json')),
    'compatibility-contract-only drift must request deployment',
  );
}

async function assertScheduledDeployRepairsStaleConformanceContract() {
  const artifacts = currentLiveArtifacts();
  const history = currentHelmHistoryFixture();
  artifacts['/platform-conformance-contract.json'].source_dependencies[
    'cluster-info-envelope.schema.json'
  ].artifact_id = 'durable-workflow.v2.cluster-info-envelope@catalog-15';

  const plan = await planDeployment({
    eventName: 'schedule',
    expectedRevision: CURRENT_DOCS_REVISION,
    fetcher: async url => artifacts[url.pathname],
    fetchResource: history.fetchResource,
    chartMetadata: history.chartMetadata,
  });

  assert.strictEqual(plan.deploy, true);
  assert.strictEqual(plan.reason, 'scheduled-drift');
  assert(
    plan.drift.some(item => item.includes('/platform-conformance-contract.json')),
    'platform-conformance-only drift must request deployment',
  );
}

async function assertScheduledDeployRepairsLiveArtifactFailure(route, message) {
  const artifacts = currentLiveArtifacts();
  const history = currentHelmHistoryFixture();
  const plan = await planDeployment({
    eventName: 'schedule',
    expectedRevision: CURRENT_DOCS_REVISION,
    fetcher: async url => {
      if (url.pathname === route) {
        throw new Error(message);
      }
      return artifacts[url.pathname];
    },
    fetchResource: history.fetchResource,
    chartMetadata: history.chartMetadata,
  });

  assert.strictEqual(plan.deploy, true);
  assert.strictEqual(plan.reason, 'scheduled-live-check-error');
  assert.deepStrictEqual(plan.drift, [message]);
}

async function assertScheduledHelmHistoryDriftCannotSkip() {
  const scenarios = [
    {
      label: 'missing history file',
      mutate: fixture => {
        fixture.resources['/charts/release-history.json'] = {
          status: 404,
          body: Buffer.alloc(0),
        };
      },
      error: /release-history\.json returned HTTP 404/,
    },
    {
      label: 'missing index entry',
      mutate: fixture => {
        fixture.index.entries[helmRelease.chart.name] =
          fixture.index.entries[helmRelease.chart.name].filter(
            entry => entry.version !== fixture.releases[0].version,
          );
        fixture.resources['/charts/index.yaml'].body =
          Buffer.from(yaml.dump(fixture.index));
      },
      error: /index versions.*must exactly match durable history/,
    },
    {
      label: 'different primary index package URL',
      mutate: fixture => {
        const [historicalEntry] =
          fixture.index.entries[helmRelease.chart.name];
        historicalEntry.urls.unshift(
          'https://example.invalid/divergent-chart-package.tgz',
        );
        fixture.resources['/charts/index.yaml'].body =
          Buffer.from(yaml.dump(fixture.index));
      },
      error: /primary package URL/,
    },
    {
      label: 'missing historical package',
      mutate: fixture => {
        fixture.resources[fixture.historicalPackagePath] = {
          status: 404,
          body: Buffer.alloc(0),
        };
      },
      error: /durable-workflow-.*\.tgz returned HTTP 404/,
    },
    {
      label: 'changed historical package',
      mutate: fixture => {
        fixture.resources[fixture.historicalPackagePath].body =
          Buffer.from('rewritten-public-chart-package');
      },
      error: /release history package digest/,
    },
  ];

  for (const scenario of scenarios) {
    const history = currentHelmHistoryFixture(scenario.mutate);
    const artifacts = currentLiveArtifacts();
    const plan = await planDeployment({
      eventName: 'schedule',
      expectedRevision: CURRENT_DOCS_REVISION,
      fetcher: async url => artifacts[url.pathname],
      fetchResource: history.fetchResource,
      chartMetadata: history.chartMetadata,
    });

    assert.strictEqual(
      plan.deploy,
      true,
      `${scenario.label} must request a protected deployment`,
    );
    assert.strictEqual(
      plan.reason,
      'scheduled-live-check-error',
      `${scenario.label} must not report the repository as current`,
    );
    assert.match(
      plan.drift.join('\n'),
      scenario.error,
      `${scenario.label} must identify the failed Helm history invariant`,
    );
  }
}

async function main() {
  await assertPushDeploysWithoutFetchingLive();
  await assertScheduledDeploySkipsCurrentLiveTuple();
  await assertScheduledDeployRepairsStaleLiveTuple();
  await assertScheduledDeployRepairsStaleNarrativeAudit();
  await assertScheduledDeployRepairsStaleCompatibilityContract();
  await assertScheduledDeployRepairsStaleConformanceContract();
  await assertScheduledHelmHistoryDriftCannotSkip();
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
