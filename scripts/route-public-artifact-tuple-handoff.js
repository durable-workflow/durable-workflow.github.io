#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const HANDOFF_SCHEMA = 'durable-workflow.docs.public-artifact-tuple-handoff';
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
  'manifest_sha256',
  'authority_lock_sha256',
];
const EXPECTED_REPOSITORY = 'durable-workflow.github.io';
const EXPECTED_TARGET_BRANCH = 'main';
const EXPECTED_REFRESH_COMMAND = 'npm run refresh:public-artifact-versions';
const EXPECTED_REFRESH_FILES = [
  'scripts/public-artifact-versions.json',
  'scripts/published-artifact-versions.json',
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
    'Routes a validated public artifact tuple handoff into a pipeline ready item',
    'through PIPELINE_GATE_URL. Dry-run mode prints the ready-item payload without',
    'calling the gate.',
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

  return {
    contractSource: fs.readFileSync(
      path.join(repoRoot, SDK_NEUTRALITY_CONTRACT_PATH),
      'utf8',
    ),
    lockSource: fs.readFileSync(
      path.join(repoRoot, SDK_NEUTRALITY_LOCK_PATH),
      'utf8',
    ),
  };
}

function buildSdkNeutralityAuthorityIdentity(
  workflowVersion,
  contractSource,
  lockSource,
) {
  if (typeof workflowVersion !== 'string' || workflowVersion.trim() === '') {
    throw new Error(
      'SDK-neutrality authority identity requires a qualified Workflow version',
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

  const contract = parseJsonSource(
    contractSource,
    `generated ${SDK_NEUTRALITY_CONTRACT_PATH}`,
  );
  const lock = parseJsonSource(
    lockSource,
    `generated ${SDK_NEUTRALITY_LOCK_PATH}`,
  );
  const manifestSha256 = sha256(contractSource);

  if (contract?.schema !== SDK_NEUTRALITY_CONTRACT_SCHEMA) {
    throw new Error(
      `generated ${SDK_NEUTRALITY_CONTRACT_PATH} has an invalid SDK-neutrality schema`,
    );
  }
  if (
    lock?.schema !== SDK_NEUTRALITY_LOCK_SCHEMA
    || lock.schema_version !== 2
  ) {
    throw new Error(
      `generated ${SDK_NEUTRALITY_LOCK_PATH} must be a version 2 authority lock`,
    );
  }
  if (lock.workflow_ref !== workflowVersion) {
    throw new Error(
      'generated SDK-neutrality authority lock must match the qualified Workflow version',
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
  if (lock.resource_path !== 'resources/sdk-neutrality-contract.json') {
    throw new Error(
      'generated SDK-neutrality authority lock must identify the Workflow manifest resource',
    );
  }
  if (
    typeof lock.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(lock.sha256)
    || lock.sha256 !== manifestSha256
  ) {
    throw new Error(
      'generated SDK-neutrality authority lock must match the generated manifest SHA-256',
    );
  }

  return {
    schema: SDK_NEUTRALITY_AUTHORITY_SCHEMA,
    schema_version: 1,
    workflow_version: workflowVersion,
    workflow_source_commit: lock.workflow_source_commit,
    manifest_sha256: manifestSha256,
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
    1,
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
  for (const field of ['manifest_sha256', 'authority_lock_sha256']) {
    if (
      typeof authority[field] !== 'string'
      || !/^[0-9a-f]{64}$/.test(authority[field])
    ) {
      throw new Error(
        `handoff SDK-neutrality authority ${field} must be a SHA-256`,
      );
    }
  }
}

function validateSdkNeutralityAuthorityIdentity(
  authority,
  workflowVersion,
  sources = defaultSdkNeutralityAuthoritySources(),
) {
  validateSdkNeutralityAuthorityIdentityShape(authority, workflowVersion);

  const expected = buildSdkNeutralityAuthorityIdentity(
    workflowVersion,
    sources.contractSource,
    sources.lockSource,
  );
  for (const field of SDK_NEUTRALITY_AUTHORITY_KEYS) {
    if (authority[field] !== expected[field]) {
      throw new Error(
        `handoff SDK-neutrality authority ${field} must match the generated contract and lock`,
      );
    }
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

function validateHandoff(handoff, options = {}) {
  assertEqual(handoff.schema, HANDOFF_SCHEMA, 'handoff schema mismatch');
  assertEqual(handoff.schema_version, 3, 'handoff schema version mismatch');
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
  validateSdkNeutralityAuthorityIdentity(
    handoff.sdk_neutrality_authority,
    handoff.artifact_versions.workflow,
    options.sdkNeutralityAuthoritySources
      || defaultSdkNeutralityAuthoritySources(),
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

function handoffKey(handoff) {
  const versionDigest = artifactVersionDigest({
    artifact_versions: handoff.artifact_versions,
    published_artifact_versions: handoff.published_artifact_versions,
  });
  const evidenceDigest = compatibilityEvidenceDigest(
    handoff.compatibility_evidence,
    handoff.artifact_versions,
  ).slice(0, 12);
  const authorityDigest = sdkNeutralityAuthorityDigest(
    handoff.sdk_neutrality_authority,
    handoff.artifact_versions.workflow,
  ).slice(0, 12);

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
    `- SDK-neutrality manifest SHA-256 ${handoff.sdk_neutrality_authority.manifest_sha256}`,
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
    `- SDK-neutrality manifest SHA-256: ${handoff.sdk_neutrality_authority.manifest_sha256}`,
    '',
    '## Acceptance',
    '- The published-component source reports the newest independently published releases.',
    '- The qualified aggregate source remains the compatibility-backed recommendation.',
    '- Every SDK in the qualified recommendation is bound to its qualified Server by passing immutable compatibility evidence.',
    '- The SDK-neutrality contract and authority lock match the qualified Workflow source commit and manifest digest.',
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

function gateEndpoint() {
  if (!process.env.PIPELINE_GATE_URL) {
    throw new Error('PIPELINE_GATE_URL is required to route the public artifact tuple handoff');
  }

  return new URL('/api/worker/actions/execute', process.env.PIPELINE_GATE_URL);
}

function gateAction(action, input) {
  const endpoint = gateEndpoint();
  const client = endpoint.protocol === 'https:' ? https : http;
  const body = JSON.stringify({ action, input });

  return new Promise((resolve, reject) => {
    const req = client.request(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          responseBody += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = responseBody ? JSON.parse(responseBody) : null;
          } catch (err) {
            reject(new Error(`Pipeline gate response is not valid JSON: ${err.message}`));
            return;
          }

          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
            reject(new Error(`Pipeline gate ${action} failed with HTTP ${res.statusCode}: ${responseBody}`));
            return;
          }

          if (!parsed || parsed.status !== 'completed') {
            reject(new Error(`Pipeline gate ${action} did not complete: ${responseBody}`));
            return;
          }

          resolve(parsed.result);
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
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

async function routeReadyItem(payload) {
  let limit = READY_ITEM_LOOKUP_INITIAL_LIMIT;
  let previousIdentities = null;

  while (true) {
    const existingReadyItems = await gateAction(GATE_ACTION_LIST_READY_ITEMS, {
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

  const created = await gateAction(GATE_ACTION_CREATE_READY_ITEM, {
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

  await routeReadyItem(payload);
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
  changedArtifacts,
  compatibilityEvidenceDigest,
  findExistingReadyItem,
  handoffDuplicateKeys,
  handoffKey,
  routeReadyItem,
  sdkNeutralityAuthorityDigest,
  validateHandoff,
  validateSdkNeutralityAuthorityIdentity,
};
