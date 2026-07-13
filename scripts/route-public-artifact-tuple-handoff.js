#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const HANDOFF_SCHEMA = 'durable-workflow.docs.public-artifact-tuple-handoff';
const EXPECTED_REPOSITORY = 'durable-workflow.github.io';
const EXPECTED_TARGET_BRANCH = 'main';
const EXPECTED_REFRESH_COMMAND = 'npm run refresh:public-artifact-versions';
const EXPECTED_REFRESH_FILES = [
  'scripts/public-artifact-versions.json',
  'docs/compatibility.md',
  'static/quickstart-execution-contract.json',
  'static/sdk-neutrality-contract.json',
  'scripts/workflow-sdk-neutrality-authority-lock.json',
];
const ARTIFACT_ORDER = ['cli', 'sdk-python', 'sdk-rust', 'server', 'waterline', 'workflow'];
const GATE_ACTION_LIST_READY_ITEMS = 'gh.issue.list';
const GATE_ACTION_CREATE_READY_ITEM = 'gh.issue.create';
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
  'state:pending',
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

function validateArtifactVersions(versions) {
  if (!versions || typeof versions !== 'object' || Array.isArray(versions)) {
    throw new Error('handoff.artifact_versions must be an object');
  }

  for (const artifact of ARTIFACT_ORDER) {
    if (typeof versions[artifact] !== 'string' || versions[artifact].trim() === '') {
      throw new Error(`handoff.artifact_versions.${artifact} must be a non-empty string`);
    }
  }

  const unknown = Object.keys(versions).filter(artifact => !ARTIFACT_ORDER.includes(artifact));
  if (unknown.length > 0) {
    throw new Error(`handoff.artifact_versions contains unknown artifacts: ${unknown.join(', ')}`);
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

function validateTupleDate(tupleDate) {
  if (tupleDate === undefined || tupleDate === null || tupleDate === '') {
    return;
  }

  if (typeof tupleDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(tupleDate)) {
    throw new Error('handoff.tuple_date must use YYYY-MM-DD format when present');
  }
}

function validateHandoff(handoff) {
  assertEqual(handoff.schema, HANDOFF_SCHEMA, 'handoff schema mismatch');
  assertEqual(handoff.schema_version, 1, 'handoff schema version mismatch');
  assertEqual(handoff.action, 'pipeline_ready_item', 'handoff action mismatch');
  assertEqual(handoff.repository, EXPECTED_REPOSITORY, 'handoff repository mismatch');
  assertEqual(handoff.target_branch, EXPECTED_TARGET_BRANCH, 'handoff target branch mismatch');
  assertEqual(handoff.refresh_command, EXPECTED_REFRESH_COMMAND, 'handoff refresh command mismatch');
  assertArrayEquals(handoff.refresh_files, EXPECTED_REFRESH_FILES, 'handoff refresh files mismatch');
  validateChangedFiles(handoff.changed_files);
  validateArtifactVersions(handoff.artifact_versions);
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
    'sdk-python': 'sdk-python',
    'sdk-rust': 'sdk-rust',
    server: 'server',
    workflow: 'workflow',
    waterline: 'waterline',
  }[name] || name;
}

function changedArtifacts(handoff) {
  const previous = handoff.previous_artifact_versions || {};

  return ARTIFACT_ORDER
    .filter(name => previous[name] && previous[name] !== handoff.artifact_versions[name])
    .map(name => ({
      name,
      previous: previous[name],
      current: handoff.artifact_versions[name],
    }));
}

function artifactVersionDigest(versions) {
  return crypto
    .createHash('sha256')
    .update(stableStringify(versions))
    .digest('hex')
    .slice(0, 12);
}

function handoffKey(handoff) {
  return `versions-${artifactVersionDigest(handoff.artifact_versions)}`;
}

function handoffDuplicateKeys(handoff) {
  const keys = [handoffKey(handoff)];

  if (handoff.tuple_date) {
    keys.push(`${handoff.tuple_date}-${artifactVersionDigest(handoff.artifact_versions)}`);
  }

  return keys;
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
    return `seed/docs-artifact-tuple-${safeBranchSegment(change.name)}-${safeBranchSegment(change.current)}`;
  }

  return `seed/docs-artifact-tuple-${safeBranchSegment(key)}`;
}

function buildRefreshInvocation(handoff) {
  if (handoff.tuple_date) {
    return `${handoff.refresh_command} -- --date ${handoff.tuple_date}`;
  }

  return handoff.refresh_command;
}

function buildRequestText(handoff) {
  const refreshInvocation = buildRefreshInvocation(handoff);

  return [
    'Refresh the public docs artifact tuple for the current published releases.',
    '',
    'Current published tuple:',
    ...ARTIFACT_ORDER.map(name => `- ${artifactLabel(name)} ${handoff.artifact_versions[name]}`),
    '',
    `Run \`${refreshInvocation}\` and commit only the generated public artifact tuple files:`,
    ...handoff.refresh_files.map(file => `- \`${file}\``),
    '',
    'Keep stable 1.x as the default public docs line, and keep 2.0 surfaces explicitly versioned prerelease guidance.',
    '',
    'After the docs site lands and deploys, request only the focused public-surface verification for this tuple: docs, agent-operability, docs.default-version, and leaks. Do not broad-rerun unrelated conformance rows.',
  ].join('\n');
}

function buildIssueBody(handoff, key, workerBranch, requestText) {
  return [
    '## Context',
    'Published package registries now contain a newer public artifact tuple than the docs release-audit surface.',
    '',
    '## Current Published Tuple',
    ...ARTIFACT_ORDER.map(name => `- ${artifactLabel(name)}: ${handoff.artifact_versions[name]}`),
    '',
    '## Acceptance',
    '- The public docs artifact tuple source reports the current published releases.',
    '- The deployed docs release-audit JSON reports the same tuple with LEAK=0 and MIXED=0.',
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

function buildReadyItemPayload(handoff) {
  validateHandoff(handoff);

  const changes = changedArtifacts(handoff);
  const key = handoffKey(handoff);
  const requestText = buildRequestText(handoff);
  const workerBranch = buildWorkerBranch(handoff, key, changes);

  return {
    repo: handoff.repository,
    title: buildTitle(handoff, changes),
    body: buildIssueBody(handoff, key, workerBranch, requestText),
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

async function routeReadyItem(payload) {
  const existingReadyItems = await gateAction(GATE_ACTION_LIST_READY_ITEMS, {
    repo: payload.repo,
    labels: READY_ITEM_LOOKUP_LABELS.join(','),
    state: 'open',
    limit: 50,
  });
  const existing = findExistingReadyItem(existingReadyItems, payload.duplicateKeys);

  if (existing) {
    console.log(`Public artifact tuple handoff already routed to ready item ${existing.number}.`);
    return existing;
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
  changedArtifacts,
  findExistingReadyItem,
  handoffDuplicateKeys,
  handoffKey,
  routeReadyItem,
  validateHandoff,
};
