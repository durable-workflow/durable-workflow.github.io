#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const publicProtocolCatalog = require('../static/platform-protocol-specs.json');
const {buildPythonPackageAuthority} = require('./public-artifact-versions');
const {
  sdkNeutralityContractSource,
  workflowAuthorityLockSource,
} = require('./refresh-public-artifact-versions');

const HANDOFF_SCHEMA = 'durable-workflow.docs.public-artifact-tuple-handoff';
const CALLBACK_SCHEMA = 'durable-workflow.docs.public-artifact-tuple-callback';
const CALLBACK_ACK_SCHEMA = 'durable-workflow.docs.public-artifact-tuple-callback-ack';
const CALLBACK_ENV = {
  url: 'PUBLIC_ARTIFACT_TUPLE_CALLBACK_URL',
  keyId: 'PUBLIC_ARTIFACT_TUPLE_CALLBACK_KEY_ID',
  hmacKey: 'PUBLIC_ARTIFACT_TUPLE_CALLBACK_HMAC_KEY',
};
const HANDOFF_ARTIFACT_NAME = 'public-artifact-tuple-pipeline-handoff';
const PUBLISHED_SERVER_PROTOCOL_AUTHORITY_SCHEMA =
  'durable-workflow.docs.published-server-protocol-authority';
const PUBLISHED_SERVER_PROTOCOL_AUTHORITY_KEYS = [
  'schema',
  'schema_version',
  'server_version',
  'server_source_ref',
  'server_source_commit',
  'server_image',
  'server_image_digest',
  'immutable_server_image',
  'workflow_package_provenance',
  'catalog',
];
const SDK_NEUTRALITY_AUTHORITY_SCHEMA =
  'durable-workflow.docs.sdk-neutrality-authority-identity';
const SDK_NEUTRALITY_CONTRACT_SCHEMA =
  'durable-workflow.v2.sdk-neutrality.contract';
const SDK_NEUTRALITY_LOCK_SCHEMA =
  'durable-workflow.docs.workflow-sdk-neutrality-authority-lock';
const SDK_NEUTRALITY_CONTRACT_PATH = 'static/sdk-neutrality-contract.json';
const SDK_NEUTRALITY_LOCK_PATH =
  'scripts/workflow-sdk-neutrality-authority-lock.json';
const SDK_NEUTRALITY_AUTHORITY_KEYS = [
  'schema',
  'schema_version',
  'workflow_version',
  'workflow_source_commit',
  'workflow_resource_path',
  'workflow_resource_sha256',
  'docs_projection_path',
  'docs_projection_sha256',
  'python_package_version',
  'python_registry_version',
  'authority_lock_sha256',
];
const EXPECTED_REPOSITORY = 'durable-workflow.github.io';
const EXPECTED_TARGET_BRANCH = 'main';
const EXPECTED_REFRESH_COMMAND = 'npm run refresh:public-artifact-versions';
const EXPECTED_REFRESH_FILES = [
  'scripts/public-artifact-versions.json',
  'scripts/published-artifact-versions.json',
  'scripts/platform-conformance-retained-evidence.json',
  'static/platform-conformance/run-ledger.json',
  'static/public-artifact-compatibility-evidence.json',
  'static/quickstart-execution-contract.json',
  'static/compatibility-contract.json',
  'static/sdk-neutrality-contract.json',
  'scripts/workflow-sdk-neutrality-authority-lock.json',
];
const ARTIFACT_ORDER = ['cli', 'sdk-php', 'sdk-python', 'sdk-rust', 'server', 'waterline', 'workflow'];
const GATE_ACTION_LIST_READY_ITEMS = 'gh.issue.list';
const GATE_ACTION_CREATE_READY_ITEM = 'gh.issue.create';
const READY_ITEM_LOOKUP_INITIAL_LIMIT = 50;
const READY_ITEM_LOOKUP_MAX_LIMIT = 1000;
const ROUTING_LABELS = [
  'pipeline:ready-item',
  'branch:main',
  'state:pending',
  'source:handoff',
  'flow:release',
  'priority:P0',
];
const READY_ITEM_LOOKUP_LABELS = [
  'pipeline:ready-item',
  'branch:main',
  'source:handoff',
  'flow:release',
];

function usage() {
  return [
    'Usage:',
    '  node scripts/route-public-artifact-tuple-handoff.js --handoff docs-artifact-tuple-handoff.json',
    '  node scripts/route-public-artifact-tuple-handoff.js --handoff docs-artifact-tuple-handoff.json --dry-run',
    '',
    'Publishes a validated public artifact tuple handoff notification. With no',
    'callback configuration, the uploaded artifact is left for authenticated pull',
    'intake. Dry-run mode prints the deterministic ready-item payload.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    handoffPath: 'docs-artifact-tuple-handoff.json',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (arg === '--handoff') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--handoff requires a file path');
      }
      args.handoffPath = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--handoff=')) {
      args.handoffPath = arg.slice('--handoff='.length);
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      console.log(usage());
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseJsonSource(source, label) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function sha256(source) {
  return crypto.createHash('sha256').update(source).digest('hex');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual || '<missing>'}`);
  }
}

function assertArrayEquals(actual, expected, message) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    throw new Error(`${message}: expected ${expected.join(', ')}`);
  }

  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) {
      throw new Error(`${message}: expected ${expected.join(', ')}, got ${actual.join(', ')}`);
    }
  }
}

function validateArtifactVersions(versions, fieldName) {
  if (!versions || typeof versions !== 'object' || Array.isArray(versions)) {
    throw new Error(`handoff.${fieldName} must be an object`);
  }

  for (const artifact of ARTIFACT_ORDER) {
    if (typeof versions[artifact] !== 'string' || versions[artifact].trim() === '') {
      throw new Error(`handoff.${fieldName}.${artifact} must be a non-empty string`);
    }
  }

  const unknown = Object.keys(versions).filter(artifact => !ARTIFACT_ORDER.includes(artifact));
  if (unknown.length > 0) {
    throw new Error(`handoff.${fieldName} contains unknown artifacts: ${unknown.join(', ')}`);
  }
}

function validateChangedFiles(changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    throw new Error('handoff changed files must include at least one focused refresh file');
  }

  const unexpected = changedFiles.filter(file => !EXPECTED_REFRESH_FILES.includes(file));
  if (unexpected.length > 0) {
    throw new Error(`handoff changed files may only include ${EXPECTED_REFRESH_FILES.join(', ')}; saw ${unexpected.join(', ')}`);
  }
}

function isDistributionIdentity(identity, expectedKind, expectedLocator) {
  return Boolean(
    identity
    && Object.keys(identity).length === 3
    && identity.kind === expectedKind
    && identity.locator === expectedLocator
    && Array.isArray(identity.artifacts)
    && identity.artifacts.length > 0
    && identity.artifacts.every(artifact => (
      artifact
      && Object.keys(artifact).length === 2
      && typeof artifact.name === 'string'
      && artifact.name !== ''
      && typeof artifact.sha256 === 'string'
      && /^[0-9a-f]{64}$/.test(artifact.sha256)
    )),
  );
}

function pypiRegistryVersion(version) {
  return version.replace(
    /^(\d+\.\d+\.\d+)-(alpha|beta|rc)\.(\d+)$/,
    (_, base, channel, sequence) => (
      `${base}${{alpha: 'a', beta: 'b', rc: 'rc'}[channel]}${sequence}`
    ),
  );
}

function validateCompatibilityEvidence(evidence, versions) {
  if (
    !evidence
    || evidence.schema !== 'durable-workflow.docs.public-artifact-compatibility-evidence'
    || evidence.schema_version !== 2
    || evidence.outcome !== 'pass'
  ) {
    throw new Error('handoff compatibility evidence must be a passing version 2 record');
  }

  const qualifiedVersions = evidence.qualified_artifact_versions;
  if (
    !qualifiedVersions
    || ARTIFACT_ORDER.some(artifact => qualifiedVersions[artifact] !== versions[artifact])
    || Object.keys(qualifiedVersions).some(artifact => !ARTIFACT_ORDER.includes(artifact))
  ) {
    throw new Error(
      'handoff compatibility evidence must bind the exact selected artifact versions',
    );
  }

  let selectedServerSourceCommit = null;
  let selectedServerDistribution = null;
  for (const artifact of ['sdk-php', 'sdk-python', 'sdk-rust']) {
    const qualification = evidence.sdk_server_compatibility?.[artifact];
    const sdkDistribution = {
      'sdk-php': {
        kind: 'composer',
        locator: `composer:durable-workflow/sdk@${versions['sdk-php']}`,
      },
      'sdk-python': {
        kind: 'pypi',
        locator: `pypi:durable-workflow@${pypiRegistryVersion(
          versions['sdk-python'],
        )}`,
      },
      'sdk-rust': {
        kind: 'crates.io',
        locator: `crates.io:durable-workflow@${versions['sdk-rust']}`,
      },
    }[artifact];
    const serverDistribution = {
      kind: 'oci',
      locator: `oci:docker.io/durableworkflow/server@${versions.server}`,
    };
    if (
      !qualification
      || qualification.sdk_version !== versions[artifact]
      || typeof qualification.sdk_source_commit !== 'string'
      || !/^[0-9a-f]{40}$/.test(qualification.sdk_source_commit)
      || !isDistributionIdentity(
        qualification.sdk_distribution,
        sdkDistribution.kind,
        sdkDistribution.locator,
      )
      || qualification.server_version !== versions.server
      || typeof qualification.server_source_commit !== 'string'
      || !/^[0-9a-f]{40}$/.test(qualification.server_source_commit)
      || !isDistributionIdentity(
        qualification.server_distribution,
        serverDistribution.kind,
        serverDistribution.locator,
      )
      || qualification.supported_server_versions !== versions.server
      || qualification.outcome !== 'pass'
    ) {
      throw new Error(
        `handoff compatibility evidence must bind ${artifact} ${versions[artifact]} ` +
        `to Server ${versions.server}`,
      );
    }
    const serializedServerDistribution = stableStringify(
      qualification.server_distribution,
    );
    if (
      selectedServerSourceCommit !== null
      && (
        qualification.server_source_commit !== selectedServerSourceCommit
        || serializedServerDistribution !== selectedServerDistribution
      )
    ) {
      throw new Error(
        'handoff compatibility evidence SDK claims must bind the same exact ' +
          'Server source and distribution digests',
      );
    }
    selectedServerSourceCommit = qualification.server_source_commit;
    selectedServerDistribution = serializedServerDistribution;
  }

  const releasePlan = evidence.authority?.release_plan;
  if (
    !releasePlan
    || typeof releasePlan.tag !== 'string'
    || typeof releasePlan.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(releasePlan.sha256)
  ) {
    throw new Error('handoff compatibility evidence must bind an immutable release plan');
  }

  const sdkServerQualification = evidence.authority?.sdk_server_qualification;
  const conformanceEvidence = sdkServerQualification?.evidence;
  const evidenceUrl = [
    'https://github.com/durable-workflow/.github/releases/download',
    conformanceEvidence?.tag,
    'suite-result.json',
  ].join('/');
  const githubRun = conformanceEvidence?.github_run;
  if (
    !sdkServerQualification
    || sdkServerQualification.schema !== 'durable-workflow.sdk-server-qualification/v1'
    || typeof sdkServerQualification.source_url !== 'string'
    || !sdkServerQualification.source_url.startsWith('https://')
    || typeof sdkServerQualification.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(sdkServerQualification.sha256)
    || !conformanceEvidence
    || conformanceEvidence.schema
      !== 'durable-workflow.beta-conformance.suite-result/v2'
    || typeof conformanceEvidence.tag !== 'string'
    || !/^beta-conformance\/(?:beta|rc)-[a-z0-9._-]+\/[1-9][0-9]*\.[1-9][0-9]*$/.test(
      conformanceEvidence.tag,
    )
    || conformanceEvidence.source_url !== evidenceUrl
    || typeof conformanceEvidence.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(conformanceEvidence.sha256)
    || conformanceEvidence.outcome !== 'pass'
    || !githubRun
    || githubRun.repository !== 'durable-workflow/.github'
    || !Number.isInteger(githubRun.run_id)
    || githubRun.run_id < 1
    || !Number.isInteger(githubRun.run_attempt)
    || githubRun.run_attempt < 1
    || githubRun.evidence_tag !== conformanceEvidence.tag
    || !conformanceEvidence.tag.endsWith(
      `/${githubRun.run_id}.${githubRun.run_attempt}`,
    )
    || ['sdk-php', 'sdk-python', 'sdk-rust'].some(
      artifact => evidence.sdk_server_compatibility[artifact].evidence_source
        !== conformanceEvidence.source_url,
    )
  ) {
    throw new Error(
      'handoff compatibility evidence must bind immutable SDK-to-Server qualification evidence',
    );
  }
}

function defaultSdkNeutralityAuthoritySources() {
  const repoRoot = path.join(__dirname, '..');
  const workflowResourceCandidates = [
    path.join(
      repoRoot,
      '.workflow-authority',
      'resources',
      'sdk-neutrality-contract.json',
    ),
    path.join(
      repoRoot,
      '..',
      'workflow',
      'resources',
      'sdk-neutrality-contract.json',
    ),
  ];
  const workflowResourcePath = workflowResourceCandidates.find(
    candidate => fs.existsSync(candidate),
  );
  if (!workflowResourcePath) {
    throw new Error(
      'SDK-neutrality handoff verification requires the pinned Workflow resource bytes',
    );
  }

  return {
    lockSource: fs.readFileSync(
      path.join(repoRoot, SDK_NEUTRALITY_LOCK_PATH),
      'utf8',
    ),
    workflowResourceSource: fs.readFileSync(workflowResourcePath, 'utf8'),
  };
}

function buildSdkNeutralityAuthorityIdentity(
  workflowVersion,
  contractSource,
  lockSource,
  publishedArtifactVersions,
  workflowResourceSource,
) {
  if (typeof workflowVersion !== 'string' || workflowVersion.trim() === '') {
    throw new Error(
      'SDK-neutrality authority identity requires a published Workflow version',
    );
  }
  if (typeof contractSource !== 'string') {
    throw new Error(
      `generated ${SDK_NEUTRALITY_CONTRACT_PATH} source must be a string`,
    );
  }
  if (typeof lockSource !== 'string') {
    throw new Error(
      `generated ${SDK_NEUTRALITY_LOCK_PATH} source must be a string`,
    );
  }
  if (typeof workflowResourceSource !== 'string') {
    throw new Error(
      'SDK-neutrality authority identity requires the pinned Workflow resource bytes',
    );
  }

  const contract = parseJsonSource(
    contractSource,
    `generated ${SDK_NEUTRALITY_CONTRACT_PATH}`,
  );
  const lock = parseJsonSource(
    lockSource,
    `generated ${SDK_NEUTRALITY_LOCK_PATH}`,
  );
  const docsProjectionSha256 = sha256(contractSource);
  const pythonAuthority = buildPythonPackageAuthority(publishedArtifactVersions);
  const pythonSdk = contract?.sdk_breadth_policy?.first_party?.python_sdk;

  if (contract?.schema !== SDK_NEUTRALITY_CONTRACT_SCHEMA) {
    throw new Error(
      `generated ${SDK_NEUTRALITY_CONTRACT_PATH} has an invalid SDK-neutrality schema`,
    );
  }
  if (
    lock?.schema !== SDK_NEUTRALITY_LOCK_SCHEMA
    || lock.schema_version !== 3
  ) {
    throw new Error(
      `generated ${SDK_NEUTRALITY_LOCK_PATH} must be a version 3 authority lock`,
    );
  }
  if (lock.workflow_ref !== workflowVersion) {
    throw new Error(
      'generated SDK-neutrality authority lock must match the published Workflow version',
    );
  }
  if (
    typeof lock.workflow_source_commit !== 'string'
    || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(
      lock.workflow_source_commit,
    )
  ) {
    throw new Error(
      'generated SDK-neutrality authority lock must include a full Workflow source commit',
    );
  }
  if (lock.workflow_resource_path !== 'resources/sdk-neutrality-contract.json') {
    throw new Error(
      'generated SDK-neutrality authority lock must identify the Workflow resource',
    );
  }
  if (lock.docs_projection_path !== SDK_NEUTRALITY_CONTRACT_PATH) {
    throw new Error(
      'generated SDK-neutrality authority lock must identify the docs projection',
    );
  }
  if (
    typeof lock.workflow_resource_sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(lock.workflow_resource_sha256)
    || lock.workflow_resource_sha256 !== sha256(workflowResourceSource)
  ) {
    throw new Error(
      'generated SDK-neutrality authority lock must match the Workflow resource SHA-256',
    );
  }
  if (
    typeof lock.docs_projection_sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(lock.docs_projection_sha256)
    || lock.docs_projection_sha256 !== docsProjectionSha256
  ) {
    throw new Error(
      'generated SDK-neutrality authority lock must match the generated docs projection SHA-256',
    );
  }
  if (
    sdkNeutralityContractSource(
      workflowResourceSource,
      publishedArtifactVersions,
    ) !== contractSource
  ) {
    throw new Error(
      'generated SDK-neutrality docs projection must derive from the verified Workflow resource and published Python tuple',
    );
  }
  if (
    lock.python_package_version !== pythonAuthority.version
    || lock.python_registry_version !== pythonAuthority.registryVersion
  ) {
    throw new Error(
      'generated SDK-neutrality authority lock must match the published Python tuple',
    );
  }
  const expectedPythonProjection = {
    package_url: pythonAuthority.authorityUrl,
    package_version: pythonAuthority.version,
    registry_version: pythonAuthority.registryVersion,
    exact_release_url: pythonAuthority.exactReleaseUrl,
    exact_release_json_url: pythonAuthority.exactReleaseJsonUrl,
    canonical_project_url: pythonAuthority.canonicalProjectUrl,
    canonical_project_url_role: 'project_identity_only',
  };
  if (
    !pythonSdk
    || Object.entries(expectedPythonProjection).some(
      ([field, expected]) => pythonSdk[field] !== expected,
    )
  ) {
    throw new Error(
      'generated SDK-neutrality docs projection must match the published Python tuple',
    );
  }

  return {
    schema: SDK_NEUTRALITY_AUTHORITY_SCHEMA,
    schema_version: 2,
    workflow_version: workflowVersion,
    workflow_source_commit: lock.workflow_source_commit,
    workflow_resource_path: lock.workflow_resource_path,
    workflow_resource_sha256: lock.workflow_resource_sha256,
    docs_projection_path: lock.docs_projection_path,
    docs_projection_sha256: docsProjectionSha256,
    python_package_version: lock.python_package_version,
    python_registry_version: lock.python_registry_version,
    authority_lock_sha256: sha256(lockSource),
  };
}

function validateSdkNeutralityAuthorityIdentityShape(authority, workflowVersion) {
  if (!authority || typeof authority !== 'object' || Array.isArray(authority)) {
    throw new Error('handoff.sdk_neutrality_authority must be an object');
  }

  const actualKeys = Object.keys(authority).sort();
  const expectedKeys = [...SDK_NEUTRALITY_AUTHORITY_KEYS].sort();
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(
      'handoff.sdk_neutrality_authority must contain exactly ' +
        SDK_NEUTRALITY_AUTHORITY_KEYS.join(', '),
    );
  }
  assertEqual(
    authority.schema,
    SDK_NEUTRALITY_AUTHORITY_SCHEMA,
    'handoff SDK-neutrality authority schema mismatch',
  );
  assertEqual(
    authority.schema_version,
    2,
    'handoff SDK-neutrality authority schema version mismatch',
  );
  assertEqual(
    authority.workflow_version,
    workflowVersion,
    'handoff SDK-neutrality authority Workflow version mismatch',
  );
  if (
    typeof authority.workflow_source_commit !== 'string'
    || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(
      authority.workflow_source_commit,
    )
  ) {
    throw new Error(
      'handoff SDK-neutrality authority must include a full Workflow source commit',
    );
  }
  assertEqual(
    authority.workflow_resource_path,
    'resources/sdk-neutrality-contract.json',
    'handoff SDK-neutrality Workflow resource path mismatch',
  );
  assertEqual(
    authority.docs_projection_path,
    SDK_NEUTRALITY_CONTRACT_PATH,
    'handoff SDK-neutrality docs projection path mismatch',
  );
  for (const field of [
    'workflow_resource_sha256',
    'docs_projection_sha256',
    'authority_lock_sha256',
  ]) {
    if (
      typeof authority[field] !== 'string'
      || !/^[0-9a-f]{64}$/.test(authority[field])
    ) {
      throw new Error(
        `handoff SDK-neutrality authority ${field} must be a SHA-256`,
      );
    }
  }
  for (const field of ['python_package_version', 'python_registry_version']) {
    if (typeof authority[field] !== 'string' || authority[field].length === 0) {
      throw new Error(
        `handoff SDK-neutrality authority ${field} must be a non-empty string`,
      );
    }
  }
}

function trustedSdkNeutralityWorkflowSourceCommit(
  workflowVersion,
  lockSource,
  workflowResourceSource,
) {
  if (typeof lockSource !== 'string') {
    throw new Error(
      `trusted ${SDK_NEUTRALITY_LOCK_PATH} source must be a string`,
    );
  }
  if (typeof workflowResourceSource !== 'string') {
    throw new Error(
      'SDK-neutrality handoff verification requires the pinned Workflow resource bytes',
    );
  }

  const lock = parseJsonSource(
    lockSource,
    `trusted ${SDK_NEUTRALITY_LOCK_PATH}`,
  );
  if (
    lock?.schema !== SDK_NEUTRALITY_LOCK_SCHEMA
    || lock.schema_version !== 3
  ) {
    throw new Error(
      `trusted ${SDK_NEUTRALITY_LOCK_PATH} must be a version 3 authority lock`,
    );
  }
  if (lock.workflow_ref !== workflowVersion) {
    throw new Error(
      'trusted SDK-neutrality authority lock must match the published Workflow version',
    );
  }
  if (
    typeof lock.workflow_source_commit !== 'string'
    || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(
      lock.workflow_source_commit,
    )
  ) {
    throw new Error(
      'trusted SDK-neutrality authority lock must include a full Workflow source commit',
    );
  }
  if (lock.workflow_resource_path !== 'resources/sdk-neutrality-contract.json') {
    throw new Error(
      'trusted SDK-neutrality authority lock must identify the Workflow resource',
    );
  }
  if (lock.docs_projection_path !== SDK_NEUTRALITY_CONTRACT_PATH) {
    throw new Error(
      'trusted SDK-neutrality authority lock must identify the docs projection',
    );
  }
  if (
    typeof lock.workflow_resource_sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(lock.workflow_resource_sha256)
    || lock.workflow_resource_sha256 !== sha256(workflowResourceSource)
  ) {
    throw new Error(
      'trusted SDK-neutrality authority lock must match the Workflow resource SHA-256',
    );
  }

  return lock.workflow_source_commit;
}

function validateSdkNeutralityAuthorityIdentity(
  authority,
  workflowVersion,
  publishedArtifactVersions,
  sources = defaultSdkNeutralityAuthoritySources(),
) {
  validateSdkNeutralityAuthorityIdentityShape(authority, workflowVersion);

  const workflowSourceCommit = trustedSdkNeutralityWorkflowSourceCommit(
    workflowVersion,
    sources.lockSource,
    sources.workflowResourceSource,
  );
  const projectedContractSource = sdkNeutralityContractSource(
    sources.workflowResourceSource,
    publishedArtifactVersions,
  );
  const projectedLockSource = workflowAuthorityLockSource(
    workflowVersion,
    sources.workflowResourceSource,
    workflowSourceCommit,
    publishedArtifactVersions,
  );
  const expected = buildSdkNeutralityAuthorityIdentity(
    workflowVersion,
    projectedContractSource,
    projectedLockSource,
    publishedArtifactVersions,
    sources.workflowResourceSource,
  );
  for (const field of SDK_NEUTRALITY_AUTHORITY_KEYS) {
    if (authority[field] !== expected[field]) {
      throw new Error(
        `handoff SDK-neutrality authority ${field} must match the generated contract and lock`,
      );
    }
  }
}

function validateSdkNeutralityProjectionAdvance(
  authority,
  workflowVersion,
  publishedArtifactVersions,
  previousPublishedArtifactVersions,
  workflowResourceSource,
) {
  const changedPublishedArtifacts = ARTIFACT_ORDER.filter(
    artifact => (
      publishedArtifactVersions[artifact]
      !== previousPublishedArtifactVersions[artifact]
    ),
  );
  if (
    changedPublishedArtifacts.length !== 1
    || changedPublishedArtifacts[0] !== 'sdk-python'
  ) {
    return;
  }

  const previousProjectionSource = sdkNeutralityContractSource(
    workflowResourceSource,
    previousPublishedArtifactVersions,
  );
  const previousLockSource = workflowAuthorityLockSource(
    workflowVersion,
    workflowResourceSource,
    authority.workflow_source_commit,
    previousPublishedArtifactVersions,
  );
  if (
    authority.docs_projection_sha256 === sha256(previousProjectionSource)
    || authority.authority_lock_sha256 === sha256(previousLockSource)
  ) {
    throw new Error(
      'a Python-only handoff must carry a new SDK-neutrality docs projection identity',
    );
  }
}

function validateTupleDate(tupleDate) {
  if (tupleDate === undefined || tupleDate === null || tupleDate === '') {
    return;
  }

  if (typeof tupleDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(tupleDate)) {
    throw new Error('handoff.tuple_date must use YYYY-MM-DD format when present');
  }
}

function validatePublishedServerProtocolAuthority(authority, serverVersion) {
  if (!authority || typeof authority !== 'object' || Array.isArray(authority)) {
    throw new Error('handoff.published_server_protocol_authority must be an object');
  }
  const actualKeys = Object.keys(authority).sort();
  const expectedKeys = [...PUBLISHED_SERVER_PROTOCOL_AUTHORITY_KEYS].sort();
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(
      'handoff.published_server_protocol_authority must contain exactly '
        + PUBLISHED_SERVER_PROTOCOL_AUTHORITY_KEYS.join(', '),
    );
  }
  assertEqual(
    authority.schema,
    PUBLISHED_SERVER_PROTOCOL_AUTHORITY_SCHEMA,
    'handoff published Server protocol authority schema mismatch',
  );
  assertEqual(
    authority.schema_version,
    1,
    'handoff published Server protocol authority schema version mismatch',
  );
  assertEqual(
    authority.server_version,
    serverVersion,
    'handoff published Server protocol authority version mismatch',
  );
  assertEqual(
    authority.server_source_ref,
    serverVersion,
    'handoff published Server protocol authority source ref mismatch',
  );
  if (!/^[0-9a-f]{40}$/.test(authority.server_source_commit || '')) {
    throw new Error(
      'handoff published Server protocol authority must include a full source commit',
    );
  }
  assertEqual(
    authority.server_image,
    `durableworkflow/server:${serverVersion}`,
    'handoff published Server protocol authority image mismatch',
  );
  if (!/^sha256:[0-9a-f]{64}$/.test(authority.server_image_digest || '')) {
    throw new Error(
      'handoff published Server protocol authority must include an OCI digest',
    );
  }
  assertEqual(
    authority.immutable_server_image,
    `durableworkflow/server@${authority.server_image_digest}`,
    'handoff published Server protocol authority immutable image mismatch',
  );
  const provenance = authority.workflow_package_provenance;
  if (
    !provenance
    || Object.keys(provenance).length !== 3
    || provenance.source !== 'https://github.com/durable-workflow/workflow.git'
    || typeof provenance.ref !== 'string'
    || provenance.ref === ''
    || !/^[0-9a-f]{40}$/.test(provenance.commit || '')
  ) {
    throw new Error(
      'handoff published Server protocol authority must bind Workflow package provenance',
    );
  }
  const catalog = authority.catalog;
  if (
    !catalog
    || Object.keys(catalog).length !== 3
    || catalog.schema !== 'durable-workflow.v2.platform-protocol-specs.catalog'
    || catalog.version !== publicProtocolCatalog.version
    || catalog.sha256 !== sha256(stableStringify(publicProtocolCatalog))
  ) {
    throw new Error(
      'handoff published Server protocol authority must bind the observed catalog',
    );
  }
}

function validateHandoff(handoff, options = {}) {
  assertEqual(handoff.schema, HANDOFF_SCHEMA, 'handoff schema mismatch');
  assertEqual(handoff.schema_version, 4, 'handoff schema version mismatch');
  assertEqual(handoff.action, 'pipeline_ready_item', 'handoff action mismatch');
  assertEqual(handoff.repository, EXPECTED_REPOSITORY, 'handoff repository mismatch');
  assertEqual(handoff.target_branch, EXPECTED_TARGET_BRANCH, 'handoff target branch mismatch');
  assertEqual(handoff.refresh_command, EXPECTED_REFRESH_COMMAND, 'handoff refresh command mismatch');
  assertArrayEquals(handoff.refresh_files, EXPECTED_REFRESH_FILES, 'handoff refresh files mismatch');
  validateChangedFiles(handoff.changed_files);
  validateArtifactVersions(handoff.artifact_versions, 'artifact_versions');
  validateArtifactVersions(
    handoff.published_artifact_versions,
    'published_artifact_versions',
  );
  validateArtifactVersions(
    handoff.previous_published_artifact_versions,
    'previous_published_artifact_versions',
  );
  validateCompatibilityEvidence(handoff.compatibility_evidence, handoff.artifact_versions);
  validatePublishedServerProtocolAuthority(
    handoff.published_server_protocol_authority,
    handoff.published_artifact_versions.server,
  );
  const sdkNeutralityAuthoritySources = (
    options.sdkNeutralityAuthoritySources
    || defaultSdkNeutralityAuthoritySources()
  );
  validateSdkNeutralityAuthorityIdentity(
    handoff.sdk_neutrality_authority,
    handoff.published_artifact_versions.workflow,
    handoff.published_artifact_versions,
    sdkNeutralityAuthoritySources,
  );
  validateSdkNeutralityProjectionAdvance(
    handoff.sdk_neutrality_authority,
    handoff.published_artifact_versions.workflow,
    handoff.published_artifact_versions,
    handoff.previous_published_artifact_versions,
    sdkNeutralityAuthoritySources.workflowResourceSource,
  );
  validateTupleDate(handoff.tuple_date);

  const guard = handoff.release_status_guard || {};
  assertEqual(guard.stable_default_docs_line, '1.x', 'stable docs guard mismatch');
  assertEqual(guard.prerelease_docs_line, '2.0', 'prerelease docs guard mismatch');
  if (guard.no_default_docs_cutover !== true) {
    throw new Error('handoff release status guard must keep default docs cutover disabled');
  }

  const assertions = guard.live_release_audit_assertions || [];
  for (const assertion of ['LEAK=0', 'MIXED=0', 'stable default 1.x', 'explicit prerelease 2.0']) {
    if (!assertions.includes(assertion)) {
      throw new Error(`handoff release status guard is missing ${assertion}`);
    }
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function base64(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function safeBranchSegment(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function artifactLabel(name) {
  return {
    cli: 'cli',
    'sdk-php': 'sdk-php',
    'sdk-python': 'sdk-python',
    'sdk-rust': 'sdk-rust',
    server: 'server',
    workflow: 'workflow',
    waterline: 'waterline',
  }[name] || name;
}

function changedArtifacts(handoff) {
  const previous = handoff.previous_published_artifact_versions;

  return ARTIFACT_ORDER
    .filter(name => previous[name] !== handoff.published_artifact_versions[name])
    .map(name => ({
      name,
      previous: previous[name],
      current: handoff.published_artifact_versions[name],
    }));
}

function artifactVersionDigest(versions) {
  return crypto
    .createHash('sha256')
    .update(stableStringify(versions))
    .digest('hex')
    .slice(0, 12);
}

function compatibilityEvidenceDigest(evidence, versions) {
  validateCompatibilityEvidence(evidence, versions);

  return crypto
    .createHash('sha256')
    .update(stableStringify(evidence))
    .digest('hex');
}

function sdkNeutralityAuthorityDigest(authority, workflowVersion) {
  validateSdkNeutralityAuthorityIdentityShape(authority, workflowVersion);

  return sha256(stableStringify(authority));
}

function publishedServerProtocolAuthorityDigest(authority, serverVersion) {
  validatePublishedServerProtocolAuthority(authority, serverVersion);
  return sha256(stableStringify(authority));
}

function handoffKey(handoff) {
  const versionDigest = artifactVersionDigest({
    artifact_versions: handoff.artifact_versions,
    published_artifact_versions: handoff.published_artifact_versions,
  });
  const evidenceDigest = compatibilityEvidenceDigest(
    handoff.compatibility_evidence,
    handoff.artifact_versions,
  ).slice(0, 12);
  const sdkAuthorityDigest = sdkNeutralityAuthorityDigest(
    handoff.sdk_neutrality_authority,
    handoff.published_artifact_versions.workflow,
  );
  const serverAuthorityDigest = publishedServerProtocolAuthorityDigest(
    handoff.published_server_protocol_authority,
    handoff.published_artifact_versions.server,
  );
  const authorityDigest = sha256(stableStringify({
    published_server_protocol_authority: serverAuthorityDigest,
    sdk_neutrality_authority: sdkAuthorityDigest,
  })).slice(0, 12);

  return [
    `versions-${versionDigest}`,
    `evidence-${evidenceDigest}`,
    `authority-${authorityDigest}`,
  ].join('-');
}

function handoffDuplicateKeys(handoff) {
  return [handoffKey(handoff)];
}

function buildTitle(handoff, changes) {
  if (changes.length === 1) {
    const change = changes[0];
    return `Refresh public docs artifact tuple for ${artifactLabel(change.name)} ${change.current}`;
  }

  if (changes.length > 1) {
    return 'Refresh public docs artifact tuple for published releases';
  }

  return 'Refresh public docs artifact tuple';
}

function buildWorkerBranch(handoff, key, changes) {
  if (changes.length === 1) {
    const change = changes[0];
    return [
      'seed/docs-artifact-tuple',
      safeBranchSegment(change.name),
      safeBranchSegment(change.current),
      safeBranchSegment(key),
    ].join('-');
  }

  return `seed/docs-artifact-tuple-${safeBranchSegment(key)}`;
}

function buildRefreshInvocation(handoff) {
  if (handoff.tuple_date) {
    return `${handoff.refresh_command} -- --date ${handoff.tuple_date}`;
  }

  return handoff.refresh_command;
}

function buildChangeLines(changes) {
  if (changes.length === 0) {
    return ['- No independently published component version changed.'];
  }

  return changes.map(change => (
    `- ${artifactLabel(change.name)} ${change.previous} -> ${change.current}`
  ));
}

function buildRequestText(handoff, changes) {
  const refreshInvocation = buildRefreshInvocation(handoff);

  return [
    'Refresh the public docs artifact sources for the current independently published releases and qualified aggregate recommendation.',
    '',
    'Changed independently published components:',
    ...buildChangeLines(changes),
    '',
    'Current independently published component tuple:',
    ...ARTIFACT_ORDER.map(
      name => `- ${artifactLabel(name)} ${handoff.published_artifact_versions[name]}`,
    ),
    '',
    'Qualified aggregate recommendation:',
    ...ARTIFACT_ORDER.map(name => `- ${artifactLabel(name)} ${handoff.artifact_versions[name]}`),
    `- Compatibility evidence ${handoff.compatibility_evidence.authority.release_plan.tag}`,
    `- SDK-neutrality authority Workflow ${handoff.sdk_neutrality_authority.workflow_version} source ${handoff.sdk_neutrality_authority.workflow_source_commit}`,
    `- SDK-neutrality Workflow resource SHA-256 ${handoff.sdk_neutrality_authority.workflow_resource_sha256}`,
    `- SDK-neutrality docs projection SHA-256 ${handoff.sdk_neutrality_authority.docs_projection_sha256}`,
    `- SDK-neutrality Python ${handoff.sdk_neutrality_authority.python_package_version} (${handoff.sdk_neutrality_authority.python_registry_version})`,
    '',
    'Published Server protocol authority:',
    `- Server ${handoff.published_server_protocol_authority.server_version} source ${handoff.published_server_protocol_authority.server_source_commit}`,
    `- OCI image ${handoff.published_server_protocol_authority.immutable_server_image}`,
    `- Embedded Workflow ${handoff.published_server_protocol_authority.workflow_package_provenance.ref} source ${handoff.published_server_protocol_authority.workflow_package_provenance.commit}`,
    `- Protocol catalog ${handoff.published_server_protocol_authority.catalog.version} SHA-256 ${handoff.published_server_protocol_authority.catalog.sha256}`,
    '',
    `Run \`${refreshInvocation}\` and commit only the generated public artifact tuple files:`,
    ...handoff.refresh_files.map(file => `- \`${file}\``),
    '',
    'Keep stable 1.x as the default public docs line, and keep 2.0 surfaces explicitly versioned prerelease guidance.',
    '',
    'After the docs site lands and deploys, request only the focused public-surface verification for this tuple: docs, agent-operability, docs.default-version, and leaks. Do not broad-rerun unrelated conformance rows.',
  ].join('\n');
}

function buildIssueBody(handoff, key, workerBranch, requestText, changes) {
  return [
    '## Context',
    'Published package registries now contain newer component releases than the docs release-audit surface.',
    '',
    '## Changed Independently Published Components',
    ...buildChangeLines(changes),
    '',
    '## Current Independently Published Component Tuple',
    ...ARTIFACT_ORDER.map(
      name => `- ${artifactLabel(name)}: ${handoff.published_artifact_versions[name]}`,
    ),
    '',
    '## Qualified Aggregate Recommendation',
    ...ARTIFACT_ORDER.map(name => `- ${artifactLabel(name)}: ${handoff.artifact_versions[name]}`),
    `- Compatibility evidence: ${handoff.compatibility_evidence.authority.release_plan.tag}`,
    `- SDK-neutrality Workflow source: ${handoff.sdk_neutrality_authority.workflow_source_commit}`,
    `- SDK-neutrality Workflow resource SHA-256: ${handoff.sdk_neutrality_authority.workflow_resource_sha256}`,
    `- SDK-neutrality docs projection SHA-256: ${handoff.sdk_neutrality_authority.docs_projection_sha256}`,
    `- SDK-neutrality Python: ${handoff.sdk_neutrality_authority.python_package_version} (${handoff.sdk_neutrality_authority.python_registry_version})`,
    '',
    '## Published Server Protocol Authority',
    `- Server: ${handoff.published_server_protocol_authority.server_version}`,
    `- Source commit: ${handoff.published_server_protocol_authority.server_source_commit}`,
    `- Immutable image: ${handoff.published_server_protocol_authority.immutable_server_image}`,
    `- Embedded Workflow: ${handoff.published_server_protocol_authority.workflow_package_provenance.ref} at ${handoff.published_server_protocol_authority.workflow_package_provenance.commit}`,
    `- Protocol catalog: ${handoff.published_server_protocol_authority.catalog.version} (${handoff.published_server_protocol_authority.catalog.sha256})`,
    '',
    '## Acceptance',
    '- The published-component source reports the newest independently published releases.',
    '- The qualified aggregate source remains the compatibility-backed recommendation.',
    '- Every SDK in the qualified recommendation is bound to its qualified Server by passing immutable compatibility evidence.',
    '- The SDK-neutrality lock and handoff independently bind the published Workflow resource and Python-enriched docs projection digests.',
    '- Protocol-catalog qualification matches the exact independently published Server source, OCI digest, embedded Workflow provenance, and observed catalog.',
    '- The deployed docs release-audit JSON reports the qualified aggregate recommendation with LEAK=0 and MIXED=0.',
    '- Stable 1.x remains the default public docs line.',
    '- 2.0 remains explicit prerelease/versioned guidance.',
    '- The refresh lands through the normal docs merge and deploy path.',
    '',
    '<!-- pipeline-kind: ready-item -->',
    `<!-- pipeline-repo: ${handoff.repository} -->`,
    `<!-- pipeline-target-branch: ${handoff.target_branch} -->`,
    `<!-- pipeline-worker-branch: ${workerBranch} -->`,
    '<!-- pipeline-github-issue:  -->',
    `<!-- pipeline-request-b64: ${base64(requestText)} -->`,
    `<!-- pipeline-files-b64: ${base64(JSON.stringify(handoff.refresh_files))} -->`,
    '<!-- pipeline-failure-b64:  -->',
    `<!-- docs-artifact-tuple-key: ${key} -->`,
    '',
  ].join('\n');
}

function buildReadyItemPayload(handoff, options = {}) {
  validateHandoff(handoff, options);

  const changes = changedArtifacts(handoff);
  const key = handoffKey(handoff);
  const requestText = buildRequestText(handoff, changes);
  const workerBranch = buildWorkerBranch(handoff, key, changes);

  return {
    repo: handoff.repository,
    title: buildTitle(handoff, changes),
    body: buildIssueBody(handoff, key, workerBranch, requestText, changes),
    labels: ROUTING_LABELS.join(','),
    key,
    duplicateKeys: handoffDuplicateKeys(handoff),
  };
}

function callbackConfiguration(environment = process.env) {
  const configured = Object.fromEntries(
    Object.entries(CALLBACK_ENV).map(([name, environmentName]) => [
      name,
      typeof environment[environmentName] === 'string'
        ? environment[environmentName].trim()
        : '',
    ]),
  );
  const configuredCount = Object.values(configured).filter(Boolean).length;

  if (configuredCount === 0) {
    return null;
  }

  if (configuredCount !== Object.keys(CALLBACK_ENV).length) {
    throw new Error(
      'Authenticated push callback configuration is incomplete; URL, key ID, and HMAC key are all required',
    );
  }

  let url;
  try {
    url = new URL(configured.url);
  } catch (error) {
    throw new Error(`Authenticated push callback URL is invalid: ${error.message}`);
  }

  if (
    url.protocol !== 'https:'
    || url.username !== ''
    || url.password !== ''
    || url.hash !== ''
  ) {
    throw new Error(
      'Authenticated push callback URL must use HTTPS without credentials or a fragment',
    );
  }

  if (!/^[A-Za-z0-9._-]{1,64}$/.test(configured.keyId)) {
    throw new Error(
      'Authenticated push callback key ID must use 1-64 letters, digits, dots, underscores, or hyphens',
    );
  }

  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(configured.hmacKey)) {
    throw new Error('Authenticated push callback HMAC key must be canonical base64');
  }

  const hmacKey = Buffer.from(configured.hmacKey, 'base64');
  if (
    hmacKey.length < 32
    || hmacKey.length > 128
    || hmacKey.toString('base64') !== configured.hmacKey
  ) {
    throw new Error(
      'Authenticated push callback HMAC key must be canonical base64 encoding 32-128 bytes',
    );
  }

  return {
    url,
    keyId: configured.keyId,
    hmacKey,
  };
}

function callbackArtifactIdentity(environment = process.env) {
  const identity = {
    repository: environment.GITHUB_REPOSITORY || '',
    run_id: environment.GITHUB_RUN_ID || '',
    run_attempt: environment.GITHUB_RUN_ATTEMPT || '',
    artifact_name: HANDOFF_ARTIFACT_NAME,
    artifact_id: environment.HANDOFF_ARTIFACT_ID || '',
    artifact_sha256: (environment.HANDOFF_ARTIFACT_SHA256 || '').replace(/^sha256:/, ''),
  };

  if (identity.repository !== 'durable-workflow/durable-workflow.github.io') {
    throw new Error('Authenticated push callback must identify the trusted docs repository');
  }

  for (const field of ['run_id', 'run_attempt', 'artifact_id']) {
    if (!/^[1-9][0-9]*$/.test(identity[field])) {
      throw new Error(`Authenticated push callback artifact ${field} must be a positive integer`);
    }
  }

  if (!/^[0-9a-f]{64}$/.test(identity.artifact_sha256)) {
    throw new Error(
      'Authenticated push callback artifact_sha256 must identify the uploaded artifact bytes',
    );
  }

  return identity;
}

function createSignedCallback(handoff, configuration, artifact, options = {}) {
  validateHandoff(handoff, options);

  const issuedAt = Math.floor((options.now || Date.now()) / 1000);
  const nonceBytes = options.nonceBytes || crypto.randomBytes(32);
  if (!Buffer.isBuffer(nonceBytes) || nonceBytes.length < 16) {
    throw new Error('Authenticated push callback nonce must contain at least 16 random bytes');
  }

  const deliveryId = handoffKey(handoff);
  const handoffSha256 = sha256(stableStringify(handoff));
  const nonce = nonceBytes.toString('base64url');
  const body = JSON.stringify({
    schema: CALLBACK_SCHEMA,
    schema_version: 1,
    delivery_id: deliveryId,
    issued_at: issuedAt,
    nonce,
    handoff_sha256: handoffSha256,
    artifact,
    handoff,
  });
  const contentSha256 = sha256(body);
  const requestTarget = `${configuration.url.pathname}${configuration.url.search}`;
  const signatureInput = [
    'POST',
    requestTarget,
    configuration.keyId,
    String(issuedAt),
    nonce,
    contentSha256,
  ].join('\n');
  const signature = crypto
    .createHmac('sha256', configuration.hmacKey)
    .update(signatureInput)
    .digest('hex');

  return {
    url: configuration.url,
    body,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body)),
      'X-Durable-Workflow-Key-Id': configuration.keyId,
      'X-Durable-Workflow-Issued-At': String(issuedAt),
      'X-Durable-Workflow-Nonce': nonce,
      'X-Durable-Workflow-Content-SHA256': contentSha256,
      'X-Durable-Workflow-Signature': `v1=${signature}`,
    },
    deliveryId,
    handoffSha256,
  };
}

function postSignedCallback(request) {
  return new Promise((resolve, reject) => {
    const callbackRequest = https.request(
      request.url,
      {
        method: 'POST',
        headers: request.headers,
        timeout: 15_000,
      },
      response => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          responseBody += chunk;
          if (Buffer.byteLength(responseBody) > 1024 * 1024) {
            callbackRequest.destroy(new Error('Authenticated push callback response is too large'));
          }
        });
        response.on('end', () => {
          if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
            reject(new Error(
              `Authenticated push callback failed with HTTP ${response.statusCode}`,
            ));
            return;
          }

          try {
            resolve(JSON.parse(responseBody));
          } catch (error) {
            reject(new Error(
              `Authenticated push callback acknowledgement is not valid JSON: ${error.message}`,
            ));
          }
        });
      },
    );

    callbackRequest.on('timeout', () => {
      callbackRequest.destroy(new Error('Authenticated push callback timed out'));
    });
    callbackRequest.on('error', reject);
    callbackRequest.write(request.body);
    callbackRequest.end();
  });
}

function validateCallbackAcknowledgement(acknowledgement, request) {
  if (
    !acknowledgement
    || acknowledgement.schema !== CALLBACK_ACK_SCHEMA
    || acknowledgement.schema_version !== 1
    || acknowledgement.delivery_id !== request.deliveryId
    || acknowledgement.handoff_sha256 !== request.handoffSha256
    || !['accepted', 'duplicate'].includes(acknowledgement.status)
  ) {
    throw new Error(
      'Authenticated push callback acknowledgement must bind the delivery ID, handoff digest, and ingestion status',
    );
  }

  return acknowledgement;
}

function appendWorkflowRecord(environment, lines) {
  if (environment.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(environment.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
}

function appendWorkflowOutputs(environment, mode, deliveryId) {
  if (environment.GITHUB_OUTPUT) {
    fs.appendFileSync(
      environment.GITHUB_OUTPUT,
      `delivery_mode=${mode}\ndelivery_id=${deliveryId}\n`,
    );
  }
}

async function publishHandoff(handoff, options = {}) {
  const environment = options.environment || process.env;
  const log = options.log || console.log;
  const payload = buildReadyItemPayload(handoff, options);
  const configuration = callbackConfiguration(environment);

  if (configuration === null) {
    appendWorkflowOutputs(environment, 'pull', payload.key);
    appendWorkflowRecord(environment, [
      '### Public artifact tuple handoff',
      '',
      `- Immutable artifact: \`${HANDOFF_ARTIFACT_NAME}\``,
      '- Routing: deferred to authenticated GitHub artifact pull intake',
      `- Delivery ID: \`${payload.key}\``,
    ]);
    log(
      `Public artifact tuple routing deferred to authenticated pull intake (${payload.key}).`,
    );
    return {mode: 'pull', deliveryId: payload.key};
  }

  const artifact = callbackArtifactIdentity(environment);
  const request = createSignedCallback(handoff, configuration, artifact, options);
  const acknowledgement = validateCallbackAcknowledgement(
    await (options.postCallback || postSignedCallback)(request),
    request,
  );

  appendWorkflowOutputs(environment, 'push', payload.key);
  appendWorkflowRecord(environment, [
    '### Public artifact tuple handoff',
    '',
    `- Immutable artifact: \`${HANDOFF_ARTIFACT_NAME}\``,
    `- Routing: authenticated push callback acknowledged (\`${acknowledgement.status}\`)`,
    `- Delivery ID: \`${payload.key}\``,
  ]);
  log(`Authenticated public artifact tuple callback acknowledged (${payload.key}).`);

  return {
    mode: 'push',
    deliveryId: payload.key,
    status: acknowledgement.status,
  };
}

function findExistingReadyItem(issues, keys) {
  const lookupKeys = Array.isArray(keys) ? keys : [keys];

  return (Array.isArray(issues) ? issues : []).find(issue => (
    issue
    && typeof issue.body === 'string'
    && lookupKeys.some(key => issue.body.includes(`<!-- docs-artifact-tuple-key: ${key} -->`))
  ));
}

function readyItemListIdentity(issue) {
  if (
    issue
    && (typeof issue.number === 'number' || typeof issue.number === 'string')
  ) {
    return `number:${issue.number}`;
  }

  return `record:${stableStringify(issue)}`;
}

async function routeReadyItem(payload, executeAction) {
  if (typeof executeAction !== 'function') {
    throw new Error('Ready-item routing requires an injected authenticated action client');
  }

  let limit = READY_ITEM_LOOKUP_INITIAL_LIMIT;
  let previousIdentities = null;

  while (true) {
    const existingReadyItems = await executeAction(GATE_ACTION_LIST_READY_ITEMS, {
      repo: payload.repo,
      labels: READY_ITEM_LOOKUP_LABELS.join(','),
      state: 'open',
      limit,
    });

    if (!Array.isArray(existingReadyItems)) {
      throw new Error('Public artifact tuple ready-item lookup returned an invalid result');
    }

    const existing = findExistingReadyItem(existingReadyItems, payload.duplicateKeys);

    if (existing) {
      console.log(`Public artifact tuple handoff already routed to ready item ${existing.number}.`);
      return existing;
    }

    const currentIdentities = new Set(existingReadyItems.map(readyItemListIdentity));
    if (
      previousIdentities !== null
      && (
        currentIdentities.size <= previousIdentities.size
        || [...previousIdentities].some(identity => !currentIdentities.has(identity))
      )
    ) {
      throw new Error(
        'Public artifact tuple ready-item lookup did not advance; refusing to create duplicate work',
      );
    }

    if (existingReadyItems.length < limit) {
      break;
    }

    if (limit >= READY_ITEM_LOOKUP_MAX_LIMIT) {
      throw new Error(
        'Public artifact tuple ready-item lookup reached its safe limit; ' +
          'refusing to create duplicate work',
      );
    }

    previousIdentities = currentIdentities;
    limit = Math.min(limit * 2, READY_ITEM_LOOKUP_MAX_LIMIT);
  }

  const created = await executeAction(GATE_ACTION_CREATE_READY_ITEM, {
    repo: payload.repo,
    title: payload.title,
    body: payload.body,
    labels: payload.labels,
  });

  console.log(`Public artifact tuple handoff routed to ready item ${created.number}.`);
  return created;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const handoff = readJson(path.resolve(args.handoffPath));
  const payload = buildReadyItemPayload(handoff);

  if (args.dryRun) {
    console.log(JSON.stringify({
      action: GATE_ACTION_CREATE_READY_ITEM,
      input: {
        repo: payload.repo,
        title: payload.title,
        body: payload.body,
        labels: payload.labels,
      },
    }, null, 2));
    return;
  }

  await publishHandoff(handoff);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  artifactVersionDigest,
  buildReadyItemPayload,
  buildRefreshInvocation,
  buildSdkNeutralityAuthorityIdentity,
  callbackArtifactIdentity,
  callbackConfiguration,
  changedArtifacts,
  compatibilityEvidenceDigest,
  createSignedCallback,
  findExistingReadyItem,
  handoffDuplicateKeys,
  handoffKey,
  publishedServerProtocolAuthorityDigest,
  publishHandoff,
  routeReadyItem,
  sdkNeutralityAuthorityDigest,
  validateCallbackAcknowledgement,
  validateHandoff,
  validateSdkNeutralityAuthorityIdentity,
};
