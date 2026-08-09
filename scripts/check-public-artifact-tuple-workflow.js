const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const yaml = require('js-yaml');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'public-artifact-tuple.yml');
const deployWorkflowPath = path.join(__dirname, '..', '.github', 'workflows', 'deploy.yml');
const qualificationWorkflowPath = path.join(
  __dirname,
  '..',
  '.github',
  'workflows',
  'qualification.yml',
);
const routeScriptPath = path.join(__dirname, 'route-public-artifact-tuple-handoff.js');
const packagePath = path.join(__dirname, '..', 'package.json');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const deployWorkflow = fs.readFileSync(deployWorkflowPath, 'utf8');
const qualificationWorkflow = fs.readFileSync(qualificationWorkflowPath, 'utf8');
const routeScript = fs.readFileSync(routeScriptPath, 'utf8');
const packageSource = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const registryFreshnessCommand = 'node scripts/refresh-public-artifact-versions.js --check';
const PROTECTED_REFRESH_SOURCE_GUARD =
  "github.repository == 'durable-workflow/durable-workflow.github.io' && " +
  "github.ref == 'refs/heads/main'";
const {
  artifactVersionDigest,
  buildReadyItemPayload: buildReadyItemPayloadWithDefaults,
  buildSdkNeutralityAuthorityIdentity,
  compatibilityEvidenceDigest,
  deliverOptionalCallback,
  findExistingReadyItem,
  handoffDuplicateKeys,
  handoffKey,
  routeReadyItem,
  sdkNeutralityAuthorityDigest,
} = require(routeScriptPath);
const {
  sdkNeutralityContractSource,
  workflowAuthorityLockSource,
} = require('./refresh-public-artifact-versions');
const currentArtifactVersions = require('./public-artifact-versions.json');
const currentPublishedArtifactVersions = require('./published-artifact-versions.json');
const currentProtocolCatalog = require('../static/platform-protocol-specs.json');
const {
  catalogSha256,
} = require('./check-public-server-protocol-catalog');

function workflowResourceSourceFromProjection(projectionSource) {
  const resource = JSON.parse(projectionSource);
  const pythonSdk = resource.sdk_breadth_policy.first_party.python_sdk;
  pythonSdk.package_url = pythonSdk.canonical_project_url;
  for (const field of [
    'package_version',
    'registry_version',
    'exact_release_url',
    'exact_release_json_url',
    'canonical_project_url',
    'canonical_project_url_role',
  ]) {
    delete pythonSdk[field];
  }
  return `${JSON.stringify(resource, null, 2)}\n`;
}

const currentSdkNeutralityAuthoritySources = {
  contractSource: fs.readFileSync(
    path.join(__dirname, '..', 'static', 'sdk-neutrality-contract.json'),
    'utf8',
  ),
  lockSource: fs.readFileSync(
    path.join(__dirname, 'workflow-sdk-neutrality-authority-lock.json'),
    'utf8',
  ),
};
currentSdkNeutralityAuthoritySources.workflowResourceSource =
  workflowResourceSourceFromProjection(
    currentSdkNeutralityAuthoritySources.contractSource,
  );
const currentSdkNeutralityAuthority = buildSdkNeutralityAuthorityIdentity(
  currentArtifactVersions.artifacts.workflow,
  currentSdkNeutralityAuthoritySources.contractSource,
  currentSdkNeutralityAuthoritySources.lockSource,
  currentPublishedArtifactVersions.artifacts,
  currentSdkNeutralityAuthoritySources.workflowResourceSource,
);

function buildReadyItemPayload(handoff, options = {}) {
  return buildReadyItemPayloadWithDefaults(handoff, {
    sdkNeutralityAuthoritySources: currentSdkNeutralityAuthoritySources,
    ...options,
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function workerBranch(payload) {
  const match = /<!-- pipeline-worker-branch: ([^ ]+) -->/.exec(payload.body);
  assert.ok(match, 'public artifact tuple ready item must include a worker branch');
  return match[1];
}

function incrementPrereleaseVersion(version) {
  return version.replace(/\.(\d+)$/, (_, sequence) => `.${Number(sequence) + 1}`);
}

function assertProtectedRefreshSource(source) {
  const parsed = yaml.load(source);
  const refreshJob = parsed?.jobs?.refresh;

  if (!refreshJob || refreshJob.if !== PROTECTED_REFRESH_SOURCE_GUARD) {
    throw new Error(
      'public artifact tuple workflow must guard the credential-bearing refresh job with the ' +
        'exact repository identity and protected main ref',
    );
  }
}

assertProtectedRefreshSource(workflow);

function assertPublicWorkflowCheckout(steps, context) {
  const checkout = steps.find(
    step => step.name === 'Checkout published Workflow conformance authority',
  );

  if (
    !checkout ||
    checkout.with?.['github-server-url'] !== undefined ||
    checkout.with?.repository !== '${{ github.repository_owner }}/workflow' ||
    checkout.with?.ref !== '${{ steps.published-workflow.outputs.ref }}' ||
    checkout.with?.path !== '.published-workflow-authority' ||
    checkout.with?.['persist-credentials'] !== false
  ) {
    throw new Error(
      `${context} must check out the pinned Workflow conformance authority ` +
        'from the runner-local repository owner without crossing or persisting credentials',
    );
  }
}

function assertPublishedServerProtocolAuthority(steps, context, condition) {
  const resolveIndex = steps.findIndex(
    step => step.name === 'Resolve published Server protocol authority ref',
  );
  const checkoutIndex = steps.findIndex(
    step => step.name === 'Checkout published Server protocol authority',
  );
  const verifyIndex = steps.findIndex(step => (
    step.run === 'node scripts/check-public-server-protocol-catalog.js'
  ));
  const resolve = steps[resolveIndex];
  const checkout = steps[checkoutIndex];
  const verify = steps[verifyIndex];

  if (
    resolveIndex < 0
    || checkoutIndex < 0
    || verifyIndex < 0
    || !(resolveIndex < checkoutIndex && checkoutIndex < verifyIndex)
    || resolve.id !== 'published-server-authority'
    || !resolve.run.includes("require('./scripts/published-artifact-versions.json').artifacts.server")
    || resolve.if !== condition
    || checkout.if !== condition
    || checkout.with?.repository !== '${{ github.repository_owner }}/server'
    || checkout.with?.ref !== '${{ steps.published-server-authority.outputs.ref }}'
    || checkout.with?.path !== '.published-server-protocol-authority'
    || checkout.with?.['persist-credentials'] !== false
    || verify.if !== condition
    || verify.env?.PUBLIC_SERVER_SOURCE_PATH !==
      '${{ github.workspace }}/.published-server-protocol-authority'
  ) {
    throw new Error(
      `${context} must compare the catalog with the exact published Server source checkout`,
    );
  }
}

function assertQualificationChecksPublishedWorkflowAuthority(source) {
  const parsed = yaml.load(source);
  const steps = parsed?.jobs?.['executable-contracts']?.steps || [];
  const repositoryCheckout = steps.find(
    step => step.uses ===
      'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
  );
  const localVerify = steps.find(
    step => step.name === 'Verify local Workflow conformance authority',
  );
  const resolve = steps.find(
    step => step.name === 'Resolve published Workflow conformance ref',
  );
  const checkout = steps.find(
    step => step.name === 'Checkout published Workflow conformance authority',
  );
  const verify = steps.find(
    step => step.name === 'Verify published Workflow conformance authority',
  );

  assertPublicWorkflowCheckout(steps, 'documentation qualification');

  if (
    !repositoryCheckout ||
    repositoryCheckout.with?.['fetch-depth'] !== 0
  ) {
    throw new Error(
      'documentation qualification must fetch same-repository target-branch ' +
        'history for the immutable conformance digest baseline',
    );
  }

  if (
    !localVerify ||
    localVerify.if !== undefined ||
    localVerify.env !== undefined ||
    localVerify.run !== 'npm run check:platform-conformance-authority'
  ) {
    throw new Error(
      'documentation qualification must validate the checked-in conformance ' +
        'authority without cross-repository access',
    );
  }

  const publicGitHubOnly = "github.server_url == 'https://github.com'";
  if (
    !resolve ||
    resolve.if !== publicGitHubOnly ||
    !resolve.run.includes(
      "require('./scripts/workflow-platform-conformance-authority-lock.json').workflow_source_commit",
    ) ||
    checkout?.if !== publicGitHubOnly ||
    !verify ||
    verify.if !== publicGitHubOnly ||
    verify.run !== 'npm run check:platform-conformance-authority' ||
    verify.env?.WORKFLOW_PLATFORM_CONFORMANCE_MANIFEST_PATH !==
      '${{ github.workspace }}/.published-workflow-authority/resources/platform-conformance-contract.json'
  ) {
    throw new Error(
      'public GitHub documentation qualification must compare the public ' +
        'authority with the pinned published Workflow manifest',
    );
  }
}

assertQualificationChecksPublishedWorkflowAuthority(qualificationWorkflow);
assertPublicWorkflowCheckout(
  yaml.load(workflow)?.jobs?.refresh?.steps || [],
  'public artifact tuple qualification',
);
assertPublishedServerProtocolAuthority(
  yaml.load(workflow)?.jobs?.refresh?.steps || [],
  'public artifact tuple qualification',
  "steps.changes.outputs.changed == 'true'",
);
assertPublishedServerProtocolAuthority(
  yaml.load(deployWorkflow)?.jobs?.deploy?.steps || [],
  'documentation deployment',
  "steps.deploy-plan.outputs.deploy == 'true'",
);
for (const [label, fixture] of [
  [
    'hard-coded GitHub repository',
    qualificationWorkflow.replace(
      'repository: ${{ github.repository_owner }}/workflow',
      'repository: durable-workflow/workflow',
    ),
  ],
  [
    'cross-host server URL',
    qualificationWorkflow.replace(
      'repository: ${{ github.repository_owner }}/workflow',
      'github-server-url: https://github.com\n' +
        '          repository: ${{ github.repository_owner }}/workflow',
    ),
  ],
]) {
  assert.notStrictEqual(
    fixture,
    qualificationWorkflow,
    `${label} fixture must mutate documentation qualification`,
  );
  assert.throws(
    () => assertQualificationChecksPublishedWorkflowAuthority(fixture),
    /without crossing or persisting credentials/,
    `documentation qualification must reject a ${label}`,
  );
}

const qualificationWithUnconditionalWorkflowCheckout = qualificationWorkflow.replace(
  "      - name: Checkout published Workflow conformance authority\n" +
    "        if: github.server_url == 'https://github.com'\n",
  '      - name: Checkout published Workflow conformance authority\n',
);
assert.notStrictEqual(
  qualificationWithUnconditionalWorkflowCheckout,
  qualificationWorkflow,
  'unconditional checkout fixture must mutate documentation qualification',
);
assert.throws(
  () => assertQualificationChecksPublishedWorkflowAuthority(
    qualificationWithUnconditionalWorkflowCheckout,
  ),
  /public GitHub documentation qualification/,
  'documentation qualification must not require cross-repository access on non-GitHub runners',
);

const qualificationWithTupleWorkflowRef = qualificationWorkflow.replace(
  "require('./scripts/workflow-platform-conformance-authority-lock.json').workflow_source_commit",
  "require('./scripts/published-artifact-versions.json').artifacts.workflow",
);
assert.notStrictEqual(
  qualificationWithTupleWorkflowRef,
  qualificationWorkflow,
  'tuple Workflow ref fixture must mutate documentation qualification',
);
assert.throws(
  () => assertQualificationChecksPublishedWorkflowAuthority(
    qualificationWithTupleWorkflowRef,
  ),
  /pinned published Workflow manifest/,
  'documentation qualification must use the exact conformance authority commit',
);

const qualificationWithoutLocalAuthorityCheck = qualificationWorkflow.replace(
  "      - name: Verify local Workflow conformance authority\n" +
    "        run: npm run check:platform-conformance-authority\n\n",
  '',
);
assert.notStrictEqual(
  qualificationWithoutLocalAuthorityCheck,
  qualificationWorkflow,
  'local authority check fixture must mutate documentation qualification',
);
assert.throws(
  () => assertQualificationChecksPublishedWorkflowAuthority(
    qualificationWithoutLocalAuthorityCheck,
  ),
  /without cross-repository access/,
  'documentation qualification must preserve a credential-independent authority check',
);

const qualificationWithoutTargetHistory = qualificationWorkflow.replace(
  '          fetch-depth: 0',
  '          fetch-depth: 1',
);
assert.notStrictEqual(
  qualificationWithoutTargetHistory,
  qualificationWorkflow,
  'shallow checkout fixture must mutate documentation qualification',
);
assert.throws(
  () => assertQualificationChecksPublishedWorkflowAuthority(
    qualificationWithoutTargetHistory,
  ),
  /same-repository target-branch history/,
  'documentation qualification must retain the published digest baseline',
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
    () => assertProtectedRefreshSource(fixture),
    /exact repository identity and protected main ref/,
    `public artifact tuple contract must reject a ${label}`,
  );
}

function workflowStepPosition(name) {
  const position = workflow.indexOf(`      - name: ${name}\n`);
  if (position === -1) {
    fail(`public-artifact-tuple workflow is missing step: ${name}`);
  }
  return position;
}

for (const forbidden of [
  'contents: write',
  'pull-requests: write',
  'git push',
  'git commit',
  'api.github.com',
  '/pulls',
  'GH_TOKEN',
]) {
  if (workflow.includes(forbidden)) {
    fail(`public-artifact-tuple workflow must not use direct GitHub write behavior: ${forbidden}`);
  }
}

for (const required of [
  'contents: read',
  'docs-artifact-tuple-handoff.json',
  'public-artifact-tuple-pipeline-handoff',
  'Attempt optional direct callback',
  'Report optional direct callback state',
  'PIPELINE_GATE_URL',
  '--optional-callback',
  'scripts/route-public-artifact-tuple-handoff.js',
  "schema: 'durable-workflow.docs.public-artifact-tuple-handoff'",
  'schema_version: 4',
  "action: 'pipeline_ready_item'",
  "integration: 'pipeline'",
  'published_artifact_versions: publishedSource.artifacts',
  'published_server_protocol_authority: serverProtocolAuthority',
  'buildPublishedServerProtocolAuthority',
  'sdk_neutrality_authority: sdkNeutralityAuthority',
  'buildSdkNeutralityAuthorityIdentity',
  'workflow_source_commit',
  '.workflow-authority/resources/sdk-neutrality-contract.json',
  'previous_published_artifact_versions: previousPublishedSource.artifacts',
  'HEAD:scripts/published-artifact-versions.json',
  'scripts/public-artifact-versions.json',
  'scripts/published-artifact-versions.json',
  'scripts/platform-conformance-retained-evidence.json',
  'static/platform-conformance/run-ledger.json',
  'static/public-artifact-compatibility-evidence.json',
  'static/quickstart-execution-contract.json',
  'static/compatibility-contract.json',
  'static/sdk-neutrality-contract.json',
  'scripts/workflow-sdk-neutrality-authority-lock.json',
  'Resolve published Workflow conformance ref',
  'Checkout published Workflow conformance authority',
  '.published-workflow-authority/resources/platform-conformance-contract.json',
  'WORKFLOW_PLATFORM_CONFORMANCE_MANIFEST_PATH',
  "stable_default_docs_line: '1.x'",
  "prerelease_docs_line: '2.0'",
  "'LEAK=0'",
  "'MIXED=0'",
]) {
  if (!workflow.includes(required)) {
    fail(`public-artifact-tuple workflow is missing required pipeline handoff contract: ${required}`);
  }
}

if (workflow.includes('previous_artifact_versions:')) {
  fail(
    'public artifact tuple handoff must compare previous published-component state, not the previous qualified aggregate',
  );
}

const detectPosition = workflowStepPosition('Detect tuple changes');
const protocolCatalogPosition = workflowStepPosition('Verify candidate server protocol catalog');
const protocolCatalogEvidencePosition = workflowStepPosition('Upload candidate server protocol catalog evidence');
const workflowAuthorityResolvePosition = workflowStepPosition('Resolve Workflow authority ref');
const workflowAuthorityCheckoutPosition = workflowStepPosition('Checkout Workflow authority');
const writePosition = workflowStepPosition('Write pipeline handoff');
const uploadPosition = workflowStepPosition('Upload pipeline handoff');
const callbackPosition = workflowStepPosition('Attempt optional direct callback');
const validatePosition = workflowStepPosition('Validate refreshed docs');
const callbackReportPosition = workflowStepPosition('Report optional direct callback state');

if (!(
  detectPosition < protocolCatalogPosition
  && protocolCatalogPosition < protocolCatalogEvidencePosition
  && protocolCatalogEvidencePosition < workflowAuthorityResolvePosition
  && workflowAuthorityResolvePosition < workflowAuthorityCheckoutPosition
  && workflowAuthorityCheckoutPosition < writePosition
  && writePosition < uploadPosition
  && uploadPosition < callbackPosition
)) {
  fail('public artifact tuple handoff must verify Server catalog and Workflow resource identities before it is written, uploaded, and routed');
}

if (!(callbackPosition < validatePosition && validatePosition < callbackReportPosition)) {
  fail('public artifact tuple workflow must validate refreshed docs independently before reporting optional callback state');
}

const parsedWorkflowSteps = yaml.load(workflow)?.jobs?.refresh?.steps || [];
const callbackStep = parsedWorkflowSteps.find(
  step => step.name === 'Attempt optional direct callback',
);
const callbackReportStep = parsedWorkflowSteps.find(
  step => step.name === 'Report optional direct callback state',
);
if (
  !callbackStep
  || callbackStep.id !== 'direct-callback'
  || callbackStep.if !== "steps.changes.outputs.changed == 'true'"
  || callbackStep.env?.PIPELINE_GATE_URL !== '${{ secrets.PIPELINE_GATE_URL }}'
  || !callbackStep.run.includes('--optional-callback')
  || !callbackReportStep
  || callbackReportStep.if !== "${{ always() && steps.changes.outputs.changed == 'true' }}"
  || callbackReportStep.env?.DIRECT_CALLBACK_STATE !==
    '${{ steps.direct-callback.outputs.delivery_state }}'
) {
  fail('public artifact tuple workflow must isolate and report optional direct callback delivery');
}

const validateStep = workflow.slice(validatePosition, workflow.indexOf('\n      - name:', validatePosition + 1));
if (!validateStep.includes('run: npm run build')) {
  fail('refreshed public artifact tuple validation must preserve the normal docs build');
}
if (
  !validateStep.includes('WORKFLOW_PLATFORM_CONFORMANCE_MANIFEST_PATH:') ||
  !validateStep.includes(
    '.published-workflow-authority/resources/platform-conformance-contract.json',
  )
) {
  fail(
    'refreshed public artifact tuple validation must compare the docs authority ' +
      'with the newly published Workflow package',
  );
}

if (packageSource.scripts.build.includes(registryFreshnessCommand)) {
  fail('normal docs builds must validate the committed tuple without requiring registry freshness');
}

if (packageSource.scripts['check:public-artifact-tuple'] !== registryFreshnessCommand) {
  fail('registry freshness must remain available through the explicit tuple check command');
}

for (const required of [
  'name: Refresh public artifact tuple',
  'run: node scripts/refresh-public-artifact-versions.js --date',
  'name: Report current tuple',
  `run: ${registryFreshnessCommand}`,
]) {
  if (!workflow.includes(required)) {
    fail(`public artifact tuple workflow must preserve explicit registry freshness enforcement: ${required}`);
  }
}

for (const required of [
  'node scripts/generate-docs-narrative-audit.js',
  'node scripts/check-docs-narrative-audit.js',
]) {
  if (!packageSource.scripts.build.includes(required)) {
    fail(`normal docs build must preserve generated route inventory checks: ${required}`);
  }
}

if (!deployWorkflow.includes('- name: Build website') || !deployWorkflow.includes('run: npm run build')) {
  fail('docs deploy workflow must preserve the complete npm build');
}

for (const required of [
  'Verify candidate server protocol catalog',
  'node scripts/check-public-server-protocol-catalog.js',
  'PUBLIC_SERVER_PROTOCOL_CATALOG_EVIDENCE: public-server-protocol-catalog-conformance.json',
  'public-server-protocol-catalog-conformance',
  'public-server-protocol-catalog-bootstrap.log',
  'public-server-protocol-catalog-server.log',
]) {
  if (!workflow.includes(required)) {
    fail(`public-artifact-tuple workflow is missing published server catalog conformance: ${required}`);
  }
}

for (const required of [
  'Verify pinned server protocol catalog',
  'node scripts/check-public-server-protocol-catalog.js',
  'PUBLIC_SERVER_PROTOCOL_CATALOG_EVIDENCE: public-server-protocol-catalog-conformance.json',
  'public-server-protocol-catalog-conformance',
  'public-server-protocol-catalog-bootstrap.log',
  'public-server-protocol-catalog-server.log',
]) {
  if (!deployWorkflow.includes(required)) {
    fail(`docs deploy workflow is missing published server catalog conformance: ${required}`);
  }
}

const deployCatalogPosition = deployWorkflow.indexOf('      - name: Verify pinned server protocol catalog\n');
const deployBuildPosition = deployWorkflow.indexOf('      - name: Build website\n');
const deployFreshnessPosition = deployWorkflow.indexOf(
  '      - name: Verify current public artifact tuple\n',
);
const deployPlanPosition = deployWorkflow.indexOf('      - name: Plan deployment\n');
const deployFreshnessStep = deployWorkflow.slice(
  deployFreshnessPosition,
  deployPlanPosition,
);
if (
  deployFreshnessPosition === -1
  || !deployFreshnessStep.includes(`run: ${registryFreshnessCommand}`)
  || !deployFreshnessStep.includes('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}')
) {
  fail(
    'docs deployment must compare the committed tuple with current public registries ' +
      'using authenticated release metadata',
  );
}
if (!(
  deployFreshnessPosition < deployPlanPosition
  && deployPlanPosition < deployBuildPosition
)) {
  fail('docs deployment must verify public registry freshness before planning or building a release');
}
if (!(deployCatalogPosition !== -1 && deployCatalogPosition < deployBuildPosition)) {
  fail('docs deployment must verify the pinned published server catalog before building an advertisable site');
}

for (const required of [
  'gh.issue.list',
  'gh.issue.create',
  'source:handoff',
  'pipeline-request-b64',
  'pipeline-files-b64',
  'docs-artifact-tuple-key',
  "writeOutput('delivery_state'",
  'const GATE_REQUEST_TIMEOUT_MS = 10000',
  '}, GATE_REQUEST_TIMEOUT_MS)',
]) {
  if (!routeScript.includes(required)) {
    fail(`public-artifact-tuple router is missing required pipeline routing contract: ${required}`);
  }
}

const stableArtifactVersions = {
  cli: '0.2.0',
  'sdk-php': '0.1.1',
  'sdk-python': '0.2.0',
  'sdk-rust': '0.1.0',
  server: '0.2.426',
  workflow: currentArtifactVersions.artifacts.workflow,
  waterline: '0.2.0',
};
const stableKeyHandoff = {
  tuple_date: '2026-06-18',
  artifact_versions: stableArtifactVersions,
  published_artifact_versions: {
    ...stableArtifactVersions,
    'sdk-python': currentPublishedArtifactVersions.artifacts['sdk-python'],
  },
};
function publishedServerProtocolAuthority(version) {
  const digest = `sha256:${'9'.repeat(64)}`;
  return {
    schema: 'durable-workflow.docs.published-server-protocol-authority',
    schema_version: 1,
    server_version: version,
    server_source_ref: version,
    server_source_commit: '8'.repeat(40),
    server_image: `durableworkflow/server:${version}`,
    server_image_digest: digest,
    immutable_server_image: `durableworkflow/server@${digest}`,
    workflow_package_provenance: {
      source: 'https://github.com/durable-workflow/workflow.git',
      ref: currentArtifactVersions.artifacts.workflow,
      commit: '7'.repeat(40),
    },
    catalog: {
      schema: currentProtocolCatalog.schema,
      version: currentProtocolCatalog.version,
      sha256: catalogSha256(currentProtocolCatalog),
    },
  };
}
function compatibilityEvidence(versions) {
  const qualificationSource =
    'https://example.test/sdk-server-qualification.json';
  const evidenceTag =
    'beta-conformance/beta-qualified-fixture/12345.1';
  const conformanceSuiteSource = [
    'https://github.com/durable-workflow/.github/releases/download',
    evidenceTag,
    'suite-result.json',
  ].join('/');
  const serverDistribution = {
    kind: 'oci',
    locator: `oci:docker.io/durableworkflow/server@${versions.server}`,
    artifacts: [{name: 'manifest', sha256: 'e'.repeat(64)}],
  };
  return {
    schema: 'durable-workflow.docs.public-artifact-compatibility-evidence',
    schema_version: 2,
    outcome: 'pass',
    qualified_artifact_versions: {...versions},
    sdk_server_compatibility: Object.fromEntries(
      ['sdk-php', 'sdk-python', 'sdk-rust'].map(artifact => [
        artifact,
        {
          sdk_version: versions[artifact],
          sdk_source_commit: 'b'.repeat(40),
          sdk_distribution: {
            kind: {
              'sdk-php': 'composer',
              'sdk-python': 'pypi',
              'sdk-rust': 'crates.io',
            }[artifact],
            locator: {
              'sdk-php': `composer:durable-workflow/sdk@${versions[artifact]}`,
              'sdk-python': `pypi:durable-workflow@${versions[artifact]}`,
              'sdk-rust': `crates.io:durable-workflow@${versions[artifact]}`,
            }[artifact],
            artifacts: [{name: artifact, sha256: 'f'.repeat(64)}],
          },
          server_version: versions.server,
          server_source_commit: 'c'.repeat(40),
          server_distribution: structuredClone(serverDistribution),
          supported_server_versions: versions.server,
          outcome: 'pass',
          evidence_source: conformanceSuiteSource,
        },
      ]),
    ),
    authority: {
      release_plan: {
        tag: 'release-plan/qualified-fixture',
        sha256: 'a'.repeat(64),
      },
      sdk_server_qualification: {
        schema: 'durable-workflow.sdk-server-qualification/v1',
        source_url: qualificationSource,
        sha256: 'd'.repeat(64),
        evidence: {
          schema: 'durable-workflow.beta-conformance.suite-result/v2',
          tag: evidenceTag,
          source_url: conformanceSuiteSource,
          sha256: 'e'.repeat(64),
          outcome: 'pass',
          github_run: {
            repository: 'durable-workflow/.github',
            run_id: 12345,
            run_attempt: 1,
            evidence_tag: evidenceTag,
          },
        },
      },
    },
  };
}
stableKeyHandoff.compatibility_evidence = compatibilityEvidence(
  stableKeyHandoff.artifact_versions,
);
stableKeyHandoff.published_server_protocol_authority =
  publishedServerProtocolAuthority(stableKeyHandoff.published_artifact_versions.server);
stableKeyHandoff.sdk_neutrality_authority = currentSdkNeutralityAuthority;
const nextRunSameTuple = {
  ...stableKeyHandoff,
  tuple_date: '2026-06-19',
};
const nextTuple = {
  ...stableKeyHandoff,
  artifact_versions: {
    ...stableKeyHandoff.artifact_versions,
    server: '0.2.427',
  },
  compatibility_evidence: compatibilityEvidence({
    ...stableKeyHandoff.artifact_versions,
    server: '0.2.427',
  }),
};
const nextPublishedTuple = {
  ...stableKeyHandoff,
  published_artifact_versions: {
    ...stableKeyHandoff.published_artifact_versions,
    server: '0.2.427',
  },
  published_server_protocol_authority: publishedServerProtocolAuthority('0.2.427'),
};
const stableKey = handoffKey(stableKeyHandoff);
const sameTupleKey = handoffKey(nextRunSameTuple);
const nextTupleKey = handoffKey(nextTuple);
const nextPublishedTupleKey = handoffKey(nextPublishedTuple);

if (stableKey !== sameTupleKey) {
  fail('public artifact tuple ready-item key must stay stable across tuple_date changes for the same artifact versions');
}

if (stableKey === nextTupleKey) {
  fail('public artifact tuple ready-item key must change when qualified artifact versions change');
}

if (stableKey === nextPublishedTupleKey) {
  fail('public artifact tuple ready-item key must change when published artifact versions change');
}

if (stableKey.includes(stableKeyHandoff.tuple_date)) {
  fail('public artifact tuple ready-item key must not include tuple_date');
}

const legacyKey = `${stableKeyHandoff.tuple_date}-${artifactVersionDigest(stableKeyHandoff.artifact_versions)}`;
const existing = findExistingReadyItem(
  [{number: 42, body: `<!-- docs-artifact-tuple-key: ${legacyKey} -->`}],
  handoffDuplicateKeys(stableKeyHandoff),
);

if (existing) {
  fail('evidence-bound handoffs must not deduplicate against legacy version-only keys');
}

const multiArtifactHandoff = {
  schema: 'durable-workflow.docs.public-artifact-tuple-handoff',
  schema_version: 4,
  action: 'pipeline_ready_item',
  repository: 'durable-workflow.github.io',
  target_branch: 'main',
  refresh_command: 'npm run refresh:public-artifact-versions',
  refresh_files: [
    'scripts/public-artifact-versions.json',
    'scripts/published-artifact-versions.json',
    'scripts/platform-conformance-retained-evidence.json',
    'static/platform-conformance/run-ledger.json',
    'static/public-artifact-compatibility-evidence.json',
    'static/quickstart-execution-contract.json',
    'static/compatibility-contract.json',
    'static/sdk-neutrality-contract.json',
    'scripts/workflow-sdk-neutrality-authority-lock.json',
  ],
  changed_files: [
    'scripts/public-artifact-versions.json',
    'scripts/published-artifact-versions.json',
    'scripts/platform-conformance-retained-evidence.json',
    'static/platform-conformance/run-ledger.json',
    'static/public-artifact-compatibility-evidence.json',
    'static/quickstart-execution-contract.json',
    'static/compatibility-contract.json',
    'static/sdk-neutrality-contract.json',
    'scripts/workflow-sdk-neutrality-authority-lock.json',
  ],
  tuple_date: stableKeyHandoff.tuple_date,
  artifact_versions: stableKeyHandoff.artifact_versions,
  published_artifact_versions: stableKeyHandoff.published_artifact_versions,
  compatibility_evidence: compatibilityEvidence(stableKeyHandoff.artifact_versions),
  published_server_protocol_authority: publishedServerProtocolAuthority(
    stableKeyHandoff.published_artifact_versions.server,
  ),
  sdk_neutrality_authority: currentSdkNeutralityAuthority,
  previous_published_artifact_versions: {
    cli: '0.1.99',
    'sdk-php': '0.1.0',
    'sdk-python': '0.1.99',
    'sdk-rust': '0.1.0',
    server: '0.2.425',
    workflow: '2.0.0-alpha.274',
    waterline: '0.1.99',
  },
  release_status_guard: {
    stable_default_docs_line: '1.x',
    prerelease_docs_line: '2.0',
    no_default_docs_cutover: true,
    live_release_audit_assertions: [
      'LEAK=0',
      'MIXED=0',
      'stable default 1.x',
      'explicit prerelease 2.0',
    ],
  },
};
const multiArtifactPayload = buildReadyItemPayload(multiArtifactHandoff);
const releasePlanReplacementHandoff = structuredClone(multiArtifactHandoff);
releasePlanReplacementHandoff.compatibility_evidence.authority.release_plan.tag =
  'release-plan/qualified-fixture-replacement';
releasePlanReplacementHandoff.compatibility_evidence.authority.release_plan.sha256 =
  '1'.repeat(64);
const releasePlanReplacementPayload = buildReadyItemPayload(
  releasePlanReplacementHandoff,
);
const sdkQualificationReplacementHandoff = structuredClone(multiArtifactHandoff);
const sdkQualificationReplacement =
  sdkQualificationReplacementHandoff.compatibility_evidence.authority
    .sdk_server_qualification;
const replacementEvidenceTag =
  'beta-conformance/beta-qualified-fixture/12346.1';
const replacementEvidenceSource = [
  'https://github.com/durable-workflow/.github/releases/download',
  replacementEvidenceTag,
  'suite-result.json',
].join('/');
sdkQualificationReplacement.sha256 = '2'.repeat(64);
sdkQualificationReplacement.evidence.tag = replacementEvidenceTag;
sdkQualificationReplacement.evidence.source_url = replacementEvidenceSource;
sdkQualificationReplacement.evidence.sha256 = '3'.repeat(64);
sdkQualificationReplacement.evidence.github_run.run_id = 12346;
sdkQualificationReplacement.evidence.github_run.evidence_tag =
  replacementEvidenceTag;
for (const qualification of Object.values(
  sdkQualificationReplacementHandoff.compatibility_evidence
    .sdk_server_compatibility,
)) {
  qualification.evidence_source = replacementEvidenceSource;
}
const sdkQualificationReplacementPayload = buildReadyItemPayload(
  sdkQualificationReplacementHandoff,
);
const sdkNeutralityReplacementContract = {
  ...JSON.parse(currentSdkNeutralityAuthoritySources.contractSource),
  version: JSON.parse(currentSdkNeutralityAuthoritySources.contractSource).version + 1,
};
const sdkNeutralityReplacementResourceSource =
  workflowResourceSourceFromProjection(
    `${JSON.stringify(sdkNeutralityReplacementContract, null, 2)}\n`,
  );
const sdkNeutralityReplacementSources = {
  contractSource: sdkNeutralityContractSource(
    sdkNeutralityReplacementResourceSource,
    stableKeyHandoff.published_artifact_versions,
  ),
  workflowResourceSource: sdkNeutralityReplacementResourceSource,
};
sdkNeutralityReplacementSources.lockSource = workflowAuthorityLockSource(
  stableArtifactVersions.workflow,
  sdkNeutralityReplacementSources.workflowResourceSource,
  '9'.repeat(40),
  stableKeyHandoff.published_artifact_versions,
);
const sdkNeutralityReplacementHandoff = structuredClone(multiArtifactHandoff);
sdkNeutralityReplacementHandoff.sdk_neutrality_authority =
  buildSdkNeutralityAuthorityIdentity(
    stableArtifactVersions.workflow,
    sdkNeutralityReplacementSources.contractSource,
    sdkNeutralityReplacementSources.lockSource,
    stableKeyHandoff.published_artifact_versions,
    sdkNeutralityReplacementSources.workflowResourceSource,
  );
const sdkNeutralityReplacementPayload = buildReadyItemPayload(
  sdkNeutralityReplacementHandoff,
  {sdkNeutralityAuthoritySources: sdkNeutralityReplacementSources},
);
const pythonOnlyPublishedVersions = {
  ...multiArtifactHandoff.published_artifact_versions,
  'sdk-python': incrementPrereleaseVersion(
    multiArtifactHandoff.published_artifact_versions['sdk-python'],
  ),
};
const pythonOnlySources = {
  workflowResourceSource:
    currentSdkNeutralityAuthoritySources.workflowResourceSource,
};
pythonOnlySources.contractSource = sdkNeutralityContractSource(
  pythonOnlySources.workflowResourceSource,
  pythonOnlyPublishedVersions,
);
pythonOnlySources.lockSource = workflowAuthorityLockSource(
  multiArtifactHandoff.artifact_versions.workflow,
  pythonOnlySources.workflowResourceSource,
  multiArtifactHandoff.sdk_neutrality_authority.workflow_source_commit,
  pythonOnlyPublishedVersions,
);
const pythonOnlyHandoff = structuredClone(multiArtifactHandoff);
pythonOnlyHandoff.published_artifact_versions = pythonOnlyPublishedVersions;
pythonOnlyHandoff.sdk_neutrality_authority = buildSdkNeutralityAuthorityIdentity(
  pythonOnlyHandoff.artifact_versions.workflow,
  pythonOnlySources.contractSource,
  pythonOnlySources.lockSource,
  pythonOnlyPublishedVersions,
  pythonOnlySources.workflowResourceSource,
);
const pythonOnlyPayload = buildReadyItemPayload(
  pythonOnlyHandoff,
  {sdkNeutralityAuthoritySources: pythonOnlySources},
);
const requestMatch = /<!-- pipeline-request-b64: ([A-Za-z0-9+/=]+) -->/.exec(multiArtifactPayload.body);
const filesMatch = /<!-- pipeline-files-b64: ([A-Za-z0-9+/=]+) -->/.exec(multiArtifactPayload.body);

assert.strictEqual(
  compatibilityEvidenceDigest(
    structuredClone(multiArtifactHandoff.compatibility_evidence),
    multiArtifactHandoff.artifact_versions,
  ),
  compatibilityEvidenceDigest(
    multiArtifactHandoff.compatibility_evidence,
    multiArtifactHandoff.artifact_versions,
  ),
  'identical validated compatibility evidence must preserve its stable digest',
);
assert.strictEqual(
  sdkNeutralityAuthorityDigest(
    structuredClone(multiArtifactHandoff.sdk_neutrality_authority),
    multiArtifactHandoff.artifact_versions.workflow,
  ),
  sdkNeutralityAuthorityDigest(
    multiArtifactHandoff.sdk_neutrality_authority,
    multiArtifactHandoff.artifact_versions.workflow,
  ),
  'identical validated SDK-neutrality authority must preserve its stable digest',
);
for (const [label, handoff, payload] of [
  [
    'release-plan',
    releasePlanReplacementHandoff,
    releasePlanReplacementPayload,
  ],
  [
    'SDK-to-Server qualification',
    sdkQualificationReplacementHandoff,
    sdkQualificationReplacementPayload,
  ],
]) {
  assert.deepStrictEqual(
    handoff.artifact_versions,
    multiArtifactHandoff.artifact_versions,
    `${label} evidence replacement must keep the qualified aggregate unchanged`,
  );
  assert.deepStrictEqual(
    handoff.published_artifact_versions,
    multiArtifactHandoff.published_artifact_versions,
    `${label} evidence replacement must keep published versions unchanged`,
  );
  assert.notStrictEqual(
    payload.key,
    multiArtifactPayload.key,
    `${label} evidence replacement must receive a distinct handoff key`,
  );
  assert.notStrictEqual(
    workerBranch(payload),
    workerBranch(multiArtifactPayload),
    `${label} evidence replacement must receive a distinct worker branch`,
  );
  assert.deepStrictEqual(
    buildReadyItemPayload(structuredClone(handoff)),
    payload,
    `an exact ${label} evidence replay must preserve its routing identity`,
  );
}

assert.deepStrictEqual(
  sdkNeutralityReplacementHandoff.artifact_versions,
  multiArtifactHandoff.artifact_versions,
  'an SDK-neutrality authority replacement must keep the qualified aggregate unchanged',
);
assert.deepStrictEqual(
  sdkNeutralityReplacementHandoff.published_artifact_versions,
  multiArtifactHandoff.published_artifact_versions,
  'an SDK-neutrality authority replacement must keep published versions unchanged',
);
assert.deepStrictEqual(
  sdkNeutralityReplacementHandoff.compatibility_evidence,
  multiArtifactHandoff.compatibility_evidence,
  'an SDK-neutrality authority replacement must keep compatibility evidence unchanged',
);
assert.notStrictEqual(
  sdkNeutralityReplacementPayload.key,
  multiArtifactPayload.key,
  'a same-version SDK-neutrality authority replacement must receive a distinct handoff key',
);
assert.strictEqual(
  pythonOnlyHandoff.sdk_neutrality_authority.workflow_resource_sha256,
  multiArtifactHandoff.sdk_neutrality_authority.workflow_resource_sha256,
  'a Python-only handoff must preserve the verified Workflow resource identity',
);
assert.notStrictEqual(
  pythonOnlyHandoff.sdk_neutrality_authority.docs_projection_sha256,
  multiArtifactHandoff.sdk_neutrality_authority.docs_projection_sha256,
  'a Python-only handoff must carry a new docs projection identity',
);
assert.notStrictEqual(
  pythonOnlyPayload.key,
  multiArtifactPayload.key,
  'a Python-only release must receive a distinct independently verified handoff key',
);
assert.notStrictEqual(
  workerBranch(sdkNeutralityReplacementPayload),
  workerBranch(multiArtifactPayload),
  'a same-version SDK-neutrality authority replacement must receive a distinct worker branch',
);
assert.deepStrictEqual(
  buildReadyItemPayload(
    structuredClone(sdkNeutralityReplacementHandoff),
    {sdkNeutralityAuthoritySources: sdkNeutralityReplacementSources},
  ),
  sdkNeutralityReplacementPayload,
  'an exact SDK-neutrality authority replay must preserve its routing identity',
);

if (!requestMatch) {
  fail('public artifact tuple ready item must include an encoded refresh request');
}

if (!filesMatch) {
  fail('public artifact tuple ready item must include encoded refresh-file metadata');
}

const decodedRequest = Buffer.from(requestMatch[1], 'base64').toString('utf8');
const decodedFiles = JSON.parse(Buffer.from(filesMatch[1], 'base64').toString('utf8'));

if (!decodedRequest.includes('npm run refresh:public-artifact-versions -- --date 2026-06-18')) {
  fail('public artifact tuple refresh request must preserve tuple_date as the docs row date');
}
for (const authorityValue of [
  multiArtifactHandoff.sdk_neutrality_authority.workflow_source_commit,
  multiArtifactHandoff.sdk_neutrality_authority.workflow_resource_sha256,
  multiArtifactHandoff.sdk_neutrality_authority.docs_projection_sha256,
  multiArtifactHandoff.sdk_neutrality_authority.python_package_version,
  multiArtifactHandoff.sdk_neutrality_authority.python_registry_version,
]) {
  if (!decodedRequest.includes(authorityValue)) {
    fail(
      `public artifact tuple refresh request must preserve SDK-neutrality authority ${authorityValue}`,
    );
  }
}

if (JSON.stringify(decodedFiles) !== JSON.stringify(multiArtifactHandoff.refresh_files)) {
  fail('public artifact tuple refresh-file metadata must preserve the focused refresh files');
}

for (const authorityFile of [
  'static/platform-conformance/run-ledger.json',
  'static/public-artifact-compatibility-evidence.json',
  'static/sdk-neutrality-contract.json',
  'scripts/workflow-sdk-neutrality-authority-lock.json',
]) {
  if (!decodedFiles.includes(authorityFile)) {
    fail(`public artifact tuple ready item must include generated refresh file ${authorityFile}`);
  }
}

const publishedServerAdvanceHandoff = {
  ...multiArtifactHandoff,
  changed_files: [
    'scripts/published-artifact-versions.json',
    'scripts/platform-conformance-retained-evidence.json',
    'static/platform-conformance/run-ledger.json',
  ],
  published_artifact_versions: {
    ...multiArtifactHandoff.published_artifact_versions,
    server: '0.2.427',
  },
  published_server_protocol_authority: publishedServerProtocolAuthority('0.2.427'),
  previous_published_artifact_versions: {
    ...multiArtifactHandoff.published_artifact_versions,
  },
};
const publishedServerAdvancePayload = buildReadyItemPayload(
  publishedServerAdvanceHandoff,
);
const replayedPublishedServerAdvancePayload = buildReadyItemPayload(
  structuredClone(publishedServerAdvanceHandoff),
);
const publishedServerRequestMatch =
  /<!-- pipeline-request-b64: ([A-Za-z0-9+/=]+) -->/.exec(
    publishedServerAdvancePayload.body,
  );
const publishedServerRequest = Buffer.from(
  publishedServerRequestMatch[1],
  'base64',
).toString('utf8');

assert.strictEqual(
  publishedServerAdvancePayload.title,
  'Refresh public docs artifact tuple for server 0.2.427',
  'a published-only Server advance must name the independently published version',
);
assert.notStrictEqual(
  publishedServerAdvancePayload.key,
  stableKey,
  'a published-only Server advance must receive a distinct handoff key',
);
assert.strictEqual(
  workerBranch(publishedServerAdvancePayload),
  `seed/docs-artifact-tuple-server-0.2.427-${publishedServerAdvancePayload.key}`,
  'a published-only Server advance branch must include the full handoff identity',
);
assert.deepStrictEqual(
  replayedPublishedServerAdvancePayload,
  publishedServerAdvancePayload,
  'an exact published-only Server handoff replay must preserve its routing identity',
);
for (const text of [
  '## Changed Independently Published Components\n- server 0.2.426 -> 0.2.427',
  '## Current Independently Published Component Tuple',
  '- server: 0.2.427',
  '## Qualified Aggregate Recommendation',
  '- server: 0.2.426',
  '## Published Server Protocol Authority',
  '- Server: 0.2.427',
]) {
  assert.ok(
    publishedServerAdvancePayload.body.includes(text),
    `a published-only Server advance body must include ${text}`,
  );
}
for (const text of [
  'Changed independently published components:\n- server 0.2.426 -> 0.2.427',
  'Current independently published component tuple:',
  '- server 0.2.427',
  'Qualified aggregate recommendation:',
  '- server 0.2.426',
  'Published Server protocol authority:',
  '- Server 0.2.427 source',
]) {
  assert.ok(
    publishedServerRequest.includes(text),
    `a published-only Server advance request must include ${text}`,
  );
}
const advancedQualifiedVersions = {
  ...publishedServerAdvanceHandoff.artifact_versions,
  server: '0.2.427',
};
const advancedQualifiedServerHandoff = {
  ...publishedServerAdvanceHandoff,
  artifact_versions: advancedQualifiedVersions,
  compatibility_evidence: compatibilityEvidence(advancedQualifiedVersions),
};
const advancedQualifiedServerPayload = buildReadyItemPayload(
  advancedQualifiedServerHandoff,
);
const publishedServerBranch =
  workerBranch(publishedServerAdvancePayload);
const advancedQualifiedServerBranch =
  workerBranch(advancedQualifiedServerPayload);

assert.strictEqual(
  advancedQualifiedServerPayload.title,
  publishedServerAdvancePayload.title,
  'a qualified aggregate advance must keep the single-component title readable',
);
assert.notStrictEqual(
  advancedQualifiedServerPayload.key,
  publishedServerAdvancePayload.key,
  'different qualified aggregate recommendations must have distinct full handoff identities',
);
assert.notStrictEqual(
  advancedQualifiedServerBranch,
  publishedServerBranch,
  'the same published Server transition with a different qualified aggregate must use a distinct branch',
);
assert.ok(
  advancedQualifiedServerBranch.endsWith(advancedQualifiedServerPayload.key),
  'the changed qualified aggregate branch must include its full handoff identity',
);
const legacyQualifiedKeys = [
  `versions-${artifactVersionDigest(stableKeyHandoff.artifact_versions)}`,
  legacyKey,
];
if (
  publishedServerAdvancePayload.duplicateKeys.some(key => (
    legacyQualifiedKeys.includes(key)
  ))
) {
  fail(
    'a published-only advance must not deduplicate against qualified-tuple-only handoffs',
  );
}

for (const [label, mutate, expected] of [
  [
    'missing current published-component state',
    handoff => {
      delete handoff.published_artifact_versions;
    },
    /handoff\.published_artifact_versions must be an object/,
  ],
  [
    'malformed current published-component state',
    handoff => {
      handoff.published_artifact_versions.server = '';
    },
    /handoff\.published_artifact_versions\.server must be a non-empty string/,
  ],
  [
    'missing previous published-component state',
    handoff => {
      delete handoff.previous_published_artifact_versions;
    },
    /handoff\.previous_published_artifact_versions must be an object/,
  ],
  [
    'malformed previous published-component state',
    handoff => {
      handoff.previous_published_artifact_versions.unexpected = '1.0.0';
    },
    /handoff\.previous_published_artifact_versions contains unknown artifacts: unexpected/,
  ],
  [
    'an unrelated changed file',
    handoff => {
      handoff.changed_files.push('README.md');
    },
    /handoff changed files may only include/,
  ],
  [
    'an unrelated refresh file',
    handoff => {
      handoff.refresh_files.push('README.md');
    },
    /handoff refresh files mismatch/,
  ],
  [
    'missing published Server protocol authority',
    handoff => {
      delete handoff.published_server_protocol_authority;
    },
    /published_server_protocol_authority must be an object/,
  ],
  [
    'published Server protocol authority for another release',
    handoff => {
      handoff.published_server_protocol_authority.server_version = '0.2.999';
    },
    /authority version mismatch/,
  ],
  [
    'retargeted published Server protocol image',
    handoff => {
      handoff.published_server_protocol_authority.immutable_server_image =
        `durableworkflow/server@sha256:${'5'.repeat(64)}`;
    },
    /immutable image mismatch/,
  ],
  [
    'published Server protocol authority with another catalog',
    handoff => {
      handoff.published_server_protocol_authority.catalog.version = 15;
    },
    /bind the observed catalog/,
  ],
  [
    'missing SDK-neutrality authority identity',
    handoff => {
      delete handoff.sdk_neutrality_authority;
    },
    /handoff\.sdk_neutrality_authority must be an object/,
  ],
  [
    'malformed SDK-neutrality Workflow source commit',
    handoff => {
      handoff.sdk_neutrality_authority.workflow_source_commit = 'not-a-commit';
    },
    /must include a full Workflow source commit/,
  ],
  [
    'SDK-neutrality authority for another Workflow version',
    handoff => {
      handoff.sdk_neutrality_authority.workflow_version = '2.0.0-rc.999';
    },
    /authority Workflow version mismatch/,
  ],
  [
    'SDK-neutrality authority for another Workflow source commit',
    handoff => {
      handoff.sdk_neutrality_authority.workflow_source_commit = '8'.repeat(40);
    },
    /workflow_source_commit must match the generated contract and lock/,
  ],
  [
    'SDK-neutrality authority for another Workflow resource',
    handoff => {
      handoff.sdk_neutrality_authority.workflow_resource_sha256 = '7'.repeat(64);
    },
    /workflow_resource_sha256 must match the generated contract and lock/,
  ],
  [
    'SDK-neutrality authority for another docs projection',
    handoff => {
      handoff.sdk_neutrality_authority.docs_projection_sha256 = '5'.repeat(64);
    },
    /docs_projection_sha256 must match the generated contract and lock/,
  ],
  [
    'SDK-neutrality authority for another Python tuple',
    handoff => {
      handoff.sdk_neutrality_authority.python_package_version = '2.0.0-rc.999';
    },
    /python_package_version must match the generated contract and lock/,
  ],
  [
    'SDK-neutrality authority for another generated lock',
    handoff => {
      handoff.sdk_neutrality_authority.authority_lock_sha256 = '6'.repeat(64);
    },
    /authority_lock_sha256 must match the generated contract and lock/,
  ],
]) {
  const invalidHandoff = structuredClone(multiArtifactHandoff);
  mutate(invalidHandoff);
  assert.throws(
    () => buildReadyItemPayload(invalidHandoff),
    expected,
    `the tuple router must reject ${label}`,
  );
}

assert.throws(
  () => buildReadyItemPayload({
    ...multiArtifactHandoff,
    compatibility_evidence: compatibilityEvidence({
      ...multiArtifactHandoff.artifact_versions,
      server: '0.2.999',
    }),
  }),
  /must bind the exact selected artifact versions/,
  'the tuple router must reject compatibility evidence for a different Server tuple',
);

const authorizationOnlyEvidence = compatibilityEvidence(
  multiArtifactHandoff.artifact_versions,
);
authorizationOnlyEvidence.schema_version = 3;
authorizationOnlyEvidence.outcome = 'authorized';
delete authorizationOnlyEvidence.authority.sdk_server_qualification;
assert.throws(
  () => buildReadyItemPayload({
    ...multiArtifactHandoff,
    compatibility_evidence: authorizationOnlyEvidence,
  }),
  /must be a passing version 2 record/,
  'the tuple router must reject release-plan authorization without qualification',
);

const failedQualificationEvidence = compatibilityEvidence(
  multiArtifactHandoff.artifact_versions,
);
failedQualificationEvidence.sdk_server_compatibility['sdk-python'].outcome = 'fail';
assert.throws(
  () => buildReadyItemPayload({
    ...multiArtifactHandoff,
    compatibility_evidence: failedQualificationEvidence,
  }),
  /must bind sdk-python/,
  'the tuple router must reject a failed SDK qualification',
);

const mismatchedLocatorEvidence = compatibilityEvidence(
  multiArtifactHandoff.artifact_versions,
);
mismatchedLocatorEvidence.sdk_server_compatibility[
  'sdk-rust'
].sdk_distribution.locator = 'crates.io:durable-workflow@9.9.9';
assert.throws(
  () => buildReadyItemPayload({
    ...multiArtifactHandoff,
    compatibility_evidence: mismatchedLocatorEvidence,
  }),
  /must bind sdk-rust/,
  'the tuple router must reject a mismatched SDK distribution locator',
);

const mismatchedDigestEvidence = compatibilityEvidence(
  multiArtifactHandoff.artifact_versions,
);
mismatchedDigestEvidence.sdk_server_compatibility[
  'sdk-rust'
].server_distribution.artifacts[0].sha256 = '1'.repeat(64);
assert.throws(
  () => buildReadyItemPayload({
    ...multiArtifactHandoff,
    compatibility_evidence: mismatchedDigestEvidence,
  }),
  /same exact Server source and distribution digests/,
  'the tuple router must reject mismatched Server distribution digests',
);

const unchangedAuthorityBytesHandoff = {
  ...multiArtifactHandoff,
  changed_files: multiArtifactHandoff.changed_files.filter(
    file => file !== 'static/sdk-neutrality-contract.json',
  ),
};
const unchangedAuthorityBytesPayload = buildReadyItemPayload(unchangedAuthorityBytesHandoff);
if (!unchangedAuthorityBytesPayload.body.includes('pipeline-files-b64')) {
  fail('a successor Workflow ref with unchanged authority bytes must remain routable');
}
if (
  unchangedAuthorityBytesPayload.key !== multiArtifactPayload.key
  || unchangedAuthorityBytesPayload.body !== multiArtifactPayload.body
) {
  fail('changed and unchanged successor authority bytes must route through one tuple ready-item key');
}

if (multiArtifactPayload.key.includes(stableKeyHandoff.tuple_date)) {
  fail('public artifact tuple payload key must not include tuple_date');
}

if (multiArtifactPayload.title.includes(stableKeyHandoff.tuple_date)) {
  fail('public artifact tuple ready item title must not include tuple_date');
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch (err) {
        reject(err);
      }
    });
    request.on('error', reject);
  });
}

async function withStubGate(
  issues,
  callback,
  {failWith = null, repeatFirstPage = false} = {},
) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method !== 'POST' || request.url !== '/api/worker/actions/execute') {
        response.writeHead(404, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({status: 'failed', error: 'unexpected endpoint'}));
        return;
      }

      const payload = await readRequestBody(request);
      requests.push(payload);

      if (failWith !== null) {
        response.writeHead(503, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({status: 'failed', error: failWith}));
        return;
      }

      if (payload.action === 'gh.issue.list') {
        const requiredLabels = parseLabels(payload.input.labels);
        const resultLimit = repeatFirstPage
          ? Math.min(payload.input.limit, 50)
          : payload.input.limit;
        const listedIssues = issues
          .filter(issue => {
            const issueLabels = Array.isArray(issue.labels)
              ? issue.labels
              : parseLabels(issue.labels || '');

            return (issue.state || 'open') === payload.input.state
              && requiredLabels.every(label => issueLabels.includes(label));
          })
          .slice(0, resultLimit);
        response.writeHead(200, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({status: 'completed', result: listedIssues}));
        return;
      }

      if (payload.action === 'gh.issue.create') {
        const created = {
          number: 730 + issues.length,
          title: payload.input.title,
          body: payload.input.body,
          labels: payload.input.labels.split(','),
          state: 'open',
        };
        issues.push(created);
        response.writeHead(200, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({
          status: 'completed',
          result: created,
        }));
        return;
      }

      response.writeHead(400, {'Content-Type': 'application/json'});
      response.end(JSON.stringify({status: 'failed', error: `unexpected action ${payload.action}`}));
    } catch (err) {
      response.writeHead(500, {'Content-Type': 'application/json'});
      response.end(JSON.stringify({status: 'failed', error: err.message}));
    }
  });

  const address = await listen(server);
  const previousGateUrl = process.env.PIPELINE_GATE_URL;
  process.env.PIPELINE_GATE_URL = `http://127.0.0.1:${address.port}`;

  try {
    return await callback(requests);
  } finally {
    if (previousGateUrl === undefined) {
      delete process.env.PIPELINE_GATE_URL;
    } else {
      process.env.PIPELINE_GATE_URL = previousGateUrl;
    }
    await close(server);
  }
}

function parseLabels(labels) {
  return labels.split(',').filter(Boolean);
}

function assertLabelSet(labels, expectedLabels, message) {
  const actual = parseLabels(labels).sort();
  const expected = [...expectedLabels].sort();

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${message}: expected ${expected.join(', ')}, got ${actual.join(', ')}`);
  }
}

function assertGateListPayload(request, expectedLimit = 50) {
  if (!request || request.action !== 'gh.issue.list') {
    fail('public artifact tuple router must list existing handoff ready items through the gate');
  }

  if (request.input.repo !== 'durable-workflow.github.io') {
    fail('public artifact tuple list payload must target the docs repository');
  }

  assertLabelSet(request.input.labels, [
    'pipeline:ready-item',
    'branch:main',
    'source:handoff',
    'flow:release',
  ], 'public artifact tuple list payload must use lifecycle-stable handoff release labels');

  if (parseLabels(request.input.labels).some(label => label.startsWith('state:'))) {
    fail('public artifact tuple lookup must not narrow active handoffs to one lifecycle state');
  }

  if (
    request.input.state !== 'open'
    || request.input.limit !== expectedLimit
    || Object.hasOwn(request.input, 'page')
  ) {
    fail(
      'public artifact tuple list payload must use the supported open-ready-item ' +
        `limit ${expectedLimit} without an unsupported page parameter`,
    );
  }
}

function assertGateCreatePayload(request) {
  if (!request || request.action !== 'gh.issue.create') {
    fail('public artifact tuple router must create missing handoff ready items through the gate');
  }

  if (request.input.repo !== multiArtifactPayload.repo) {
    fail('public artifact tuple create payload must target the docs repository');
  }

  if (request.input.title !== multiArtifactPayload.title) {
    fail('public artifact tuple create payload must preserve the generated title');
  }

  if (!request.input.body.includes(`<!-- docs-artifact-tuple-key: ${multiArtifactPayload.key} -->`)) {
    fail('public artifact tuple create payload must include the duplicate key marker');
  }

  if (!request.input.body.includes(filesMatch[0])) {
    fail('public artifact tuple create payload must include focused refresh-file metadata');
  }

  assertLabelSet(request.input.labels, [
    'pipeline:ready-item',
    'branch:main',
    'state:pending',
    'source:handoff',
    'flow:release',
    'priority:P0',
  ], 'public artifact tuple create payload must use the full handoff release label set');
}

async function assertStubGateCreatePath() {
  const routed = await withStubGate([], async requests => {
    const readyItem = await routeReadyItem(multiArtifactPayload);

    if (requests.length !== 2) {
      fail(`public artifact tuple create path must make exactly two gate requests, saw ${requests.length}`);
    }

    assertGateListPayload(requests[0]);
    assertGateCreatePayload(requests[1]);

    return readyItem;
  });

  if (!routed || routed.number !== 730) {
    fail('public artifact tuple create path must return the created ready item');
  }
}

async function assertOptionalCallbackAbsentPath() {
  const previousGateUrl = process.env.PIPELINE_GATE_URL;
  delete process.env.PIPELINE_GATE_URL;

  try {
    const delivery = await deliverOptionalCallback(multiArtifactPayload);
    assert.deepStrictEqual(
      delivery,
      {state: 'not_configured'},
      'an absent direct callback must leave artifact recovery authoritative',
    );
  } finally {
    if (previousGateUrl === undefined) {
      delete process.env.PIPELINE_GATE_URL;
    } else {
      process.env.PIPELINE_GATE_URL = previousGateUrl;
    }
  }
}

async function assertOptionalCallbackPresentPath() {
  const delivery = await withStubGate([], async requests => {
    const result = await deliverOptionalCallback(multiArtifactPayload);

    if (requests.length !== 2) {
      fail(
        `a configured direct callback must perform duplicate lookup and creation, saw ${requests.length} requests`,
      );
    }

    assertGateListPayload(requests[0]);
    assertGateCreatePayload(requests[1]);
    return result;
  });

  if (delivery.state !== 'delivered' || delivery.readyItem?.number !== 730) {
    fail('a configured direct callback must report successful bounded delivery');
  }
}

async function assertOptionalCallbackFailurePath() {
  const privateResponse = 'private callback detail must not be printed';
  const logged = [];
  const originalConsoleError = console.error;
  console.error = message => logged.push(String(message));

  try {
    const delivery = await withStubGate(
      [],
      async requests => {
        const result = await deliverOptionalCallback(multiArtifactPayload);

        if (requests.length !== 1) {
          fail(`a rejected optional callback must stop after one request, saw ${requests.length}`);
        }

        return result;
      },
      {failWith: privateResponse},
    );

    if (delivery.state !== 'failed') {
      fail('a rejected optional callback must report failed delivery without failing recovery');
    }
  } finally {
    console.error = originalConsoleError;
  }

  if (
    logged.length !== 1
    || logged[0].includes(privateResponse)
    || logged[0].includes('127.0.0.1')
  ) {
    fail('optional callback failure reporting must not disclose private endpoint details');
  }
}

async function assertStubGateLegacyKeyPath() {
  const routed = await withStubGate(
    [{
      number: 42,
      body: `<!-- docs-artifact-tuple-key: ${legacyKey} -->`,
      labels: [
        'pipeline:ready-item',
        'branch:main',
        'state:integrating',
        'source:handoff',
        'flow:release',
      ],
      state: 'open',
    }],
    async requests => {
      const readyItem = await routeReadyItem(multiArtifactPayload);

      if (requests.length !== 2) {
        fail(`evidence-bound handoffs must not reuse a legacy version-only item, saw ${requests.length} requests`);
      }

      assertGateListPayload(requests[0]);
      assertGateCreatePayload(requests[1]);

      return readyItem;
    }
  );

  if (!routed || routed.number === 42) {
    fail('evidence-bound handoffs must route independently of legacy version-only work');
  }
}

async function assertStubGateIdentityReplacementPath(label, replacementPayload) {
  const issues = [];

  await withStubGate(issues, async requests => {
    const original = await routeReadyItem(multiArtifactPayload);
    const replacement = await routeReadyItem(replacementPayload);
    const replayedReplacement = await routeReadyItem(replacementPayload);

    if (
      original.number === replacement.number
      || replacement.number !== replayedReplacement.number
      || issues.length !== 2
    ) {
      fail(`${label} replacement must route independently and replay idempotently`);
    }

    const routedBranches = new Set(
      issues.map(issue => workerBranch({body: issue.body})),
    );
    if (routedBranches.size !== 2) {
      fail(`${label} replacement must own a distinct worker branch`);
    }

    const createRequests = requests.filter(
      request => request.action === 'gh.issue.create',
    );
    if (createRequests.length !== 2) {
      fail(`${label} replacement must create exactly two ready items`);
    }
  });
}

async function assertStubGateActiveLifecycleReplayPath() {
  const issues = [];

  await withStubGate(issues, async requests => {
    const created = await routeReadyItem(multiArtifactPayload);
    const pendingReplay = await routeReadyItem(multiArtifactPayload);

    if (created.number !== pendingReplay.number || issues.length !== 1) {
      fail('an exact pending handoff replay must reuse the original ready item');
    }

    for (const activeState of [
      'state:claimed',
      'state:ready',
      'state:integrating',
      'state:integrated',
    ]) {
      issues[0].labels = issues[0].labels
        .filter(label => !label.startsWith('state:'))
        .concat(activeState);
      const issueBeforeReplay = JSON.stringify(issues[0]);
      const replayed = await routeReadyItem(multiArtifactPayload);

      if (replayed.number !== created.number) {
        fail(`an exact ${activeState} handoff replay must reuse the original ready item`);
      }

      if (JSON.stringify(issues[0]) !== issueBeforeReplay) {
        fail(`an exact ${activeState} handoff replay must not edit the original ready item`);
      }
    }

    const createRequests = requests.filter(request => request.action === 'gh.issue.create');
    if (createRequests.length !== 1 || issues.length !== 1) {
      fail('active lifecycle handoff replays must create exactly one ready item');
    }

    const routedBranches = new Set(issues.map(issue => workerBranch({body: issue.body})));
    if (routedBranches.size !== 1) {
      fail('active lifecycle handoff replays must use exactly one worker branch');
    }

    for (const request of requests.filter(request => request.action === 'gh.issue.list')) {
      assertGateListPayload(request);
    }
  });
}

async function assertStubGatePaginatedActiveReplayPath() {
  const routingLabels = [
    'pipeline:ready-item',
    'branch:main',
    'state:integrating',
    'source:handoff',
    'flow:release',
  ];
  const issues = Array.from({length: 51}, (_, index) => ({
    number: 1000 + index,
    title: `Unrelated artifact handoff ${index + 1}`,
    body: `<!-- docs-artifact-tuple-key: unrelated-${index + 1} -->`,
    labels: routingLabels,
    state: 'open',
  }));
  const original = {
    number: 1051,
    title: multiArtifactPayload.title,
    body: multiArtifactPayload.body,
    labels: routingLabels,
    state: 'open',
  };
  issues.push(original);
  const issuesBeforeReplay = JSON.stringify(issues);

  const routed = await withStubGate(issues, async requests => {
    const readyItem = await routeReadyItem(multiArtifactPayload);

    if (requests.length !== 2) {
      fail(`a second-page handoff replay must make exactly two list requests, saw ${requests.length}`);
    }

    assertGateListPayload(requests[0], 50);
    assertGateListPayload(requests[1], 100);

    if (requests.some(request => request.action === 'gh.issue.create')) {
      fail('a second-page handoff replay must not create a duplicate ready item');
    }

    return readyItem;
  });

  if (!routed || routed.number !== original.number) {
    fail('an exact active handoff beyond the first page must reuse its original ready item');
  }

  if (JSON.stringify(issues) !== issuesBeforeReplay) {
    fail('a second-page handoff replay must not edit active lifecycle state');
  }

  const matchingBranches = issues
    .filter(issue => issue.body.includes(`<!-- docs-artifact-tuple-key: ${multiArtifactPayload.key} -->`))
    .map(issue => workerBranch({body: issue.body}));
  if (
    matchingBranches.length !== 1
    || matchingBranches[0] !== workerBranch({body: original.body})
  ) {
    fail('a second-page handoff replay must use only the original worker branch');
  }
}

async function assertStubGateNonAdvancingListPath() {
  const routingLabels = [
    'pipeline:ready-item',
    'branch:main',
    'state:integrating',
    'source:handoff',
    'flow:release',
  ];
  const issues = Array.from({length: 50}, (_, index) => ({
    number: 2000 + index,
    title: `Unrelated artifact handoff ${index + 1}`,
    body: `<!-- docs-artifact-tuple-key: unrelated-repeat-${index + 1} -->`,
    labels: routingLabels,
    state: 'open',
  }));
  const original = {
    number: 2050,
    title: multiArtifactPayload.title,
    body: multiArtifactPayload.body,
    labels: routingLabels,
    state: 'open',
  };
  issues.push(original);
  const issuesBeforeReplay = JSON.stringify(issues);

  await withStubGate(
    issues,
    async requests => {
      await assert.rejects(
        routeReadyItem(multiArtifactPayload),
        /did not advance/,
        'a repeated first page must fail closed',
      );

      if (requests.length !== 2) {
        fail(`a repeated first page must stop after two list requests, saw ${requests.length}`);
      }

      assertGateListPayload(requests[0], 50);
      assertGateListPayload(requests[1], 100);

      if (requests.some(request => request.action === 'gh.issue.create')) {
        fail('a repeated first page must not create duplicate work');
      }
    },
    {repeatFirstPage: true},
  );

  if (JSON.stringify(issues) !== issuesBeforeReplay) {
    fail('a repeated first page must not edit existing work');
  }
}

async function assertStubGateCompletedPath() {
  const completedIssue = {
    number: 42,
    title: multiArtifactPayload.title,
    body: multiArtifactPayload.body,
    labels: [
      'pipeline:ready-item',
      'branch:main',
      'state:completed',
      'source:handoff',
      'flow:release',
    ],
    state: 'closed',
  };
  const issues = [completedIssue];
  const completedBeforeReplay = JSON.stringify(completedIssue);

  const routed = await withStubGate(issues, async requests => {
    const readyItem = await routeReadyItem(multiArtifactPayload);

    if (requests.length !== 2) {
      fail('a completed handoff must not be returned by the active ready-item lookup');
    }

    assertGateListPayload(requests[0]);
    assertGateCreatePayload(requests[1]);

    return readyItem;
  });

  if (!routed || routed.number === completedIssue.number) {
    fail('a completed handoff must not be mistaken for the active ready item');
  }

  if (JSON.stringify(completedIssue) !== completedBeforeReplay) {
    fail('routing after completed work must not reopen or edit the completed ready item');
  }
}

async function main() {
  await assertOptionalCallbackAbsentPath();
  await assertOptionalCallbackPresentPath();
  await assertOptionalCallbackFailurePath();
  await assertStubGateCreatePath();
  await assertStubGateLegacyKeyPath();
  await assertStubGateIdentityReplacementPath(
    'release-plan evidence',
    releasePlanReplacementPayload,
  );
  await assertStubGateIdentityReplacementPath(
    'SDK-to-Server qualification evidence',
    sdkQualificationReplacementPayload,
  );
  await assertStubGateIdentityReplacementPath(
    'SDK-neutrality authority',
    sdkNeutralityReplacementPayload,
  );
  await assertStubGateActiveLifecycleReplayPath();
  await assertStubGatePaginatedActiveReplayPath();
  await assertStubGateNonAdvancingListPath();
  await assertStubGateCompletedPath();

  console.log('Public artifact tuple workflow routes a read-only pipeline handoff.');
}

main().catch(err => {
  fail(err.stack || err.message);
});
