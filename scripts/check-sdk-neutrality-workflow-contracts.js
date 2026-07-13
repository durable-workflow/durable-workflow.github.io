#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const workflowPaths = [
  {
    label: 'docs deploy workflow',
    path: path.join(repoRoot, '.github', 'workflows', 'deploy.yml'),
    validationStep: 'Build website',
  },
  {
    label: 'public artifact tuple workflow',
    path: path.join(repoRoot, '.github', 'workflows', 'public-artifact-tuple.yml'),
    versionSourceStep: 'Refresh public artifact tuple',
    validationStep: 'Validate refreshed docs',
  },
];

const PINNED_REF_EXPRESSION = 'ref: ${{ steps.workflow-authority.outputs.ref }}';
const MANIFEST_INPUT =
  'WORKFLOW_SDK_NEUTRALITY_MANIFEST_PATH: ${{ github.workspace }}/.workflow-authority/resources/sdk-neutrality-contract.json';

function workflowStep(source, name, label) {
  const marker = `      - name: ${name}\n`;
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`${label} is missing step: ${name}`);
  }

  const end = source.indexOf('\n      - name:', start + marker.length);
  return source.slice(start, end === -1 ? source.length : end);
}

function assertSdkNeutralityReleaseWorkflow(source, options) {
  if (options.versionSourceStep) {
    workflowStep(source, options.versionSourceStep, options.label);
  }
  const resolveStep = workflowStep(source, 'Resolve Workflow authority ref', options.label);
  const checkoutStep = workflowStep(source, 'Checkout Workflow authority', options.label);
  const validationStep = workflowStep(source, options.validationStep, options.label);

  for (const required of [
    'id: workflow-authority',
    "require('./scripts/public-artifact-versions.json').artifacts.workflow",
    '>> "$GITHUB_OUTPUT"',
  ]) {
    if (!resolveStep.includes(required)) {
      throw new Error(
        `${options.label} must resolve the Workflow authority ref from ` +
          `scripts/public-artifact-versions.json and publish it as a step output: ${required}`,
      );
    }
  }

  if (!checkoutStep.includes('repository: durable-workflow/workflow')) {
    throw new Error(`${options.label} must check out the Workflow authority repository`);
  }
  if (!checkoutStep.includes(PINNED_REF_EXPRESSION)) {
    throw new Error(
      `${options.label} must reject a moving Workflow ref and check out the exact ` +
        `artifacts.workflow step output`,
    );
  }
  if (!checkoutStep.includes('path: .workflow-authority')) {
    throw new Error(`${options.label} must use the dedicated Workflow authority checkout path`);
  }

  if (!validationStep.includes(MANIFEST_INPUT)) {
    throw new Error(
      `${options.label} must require the dedicated SDK-neutrality manifest input ` +
        `for its release build`,
    );
  }
  if (!validationStep.includes('run: npm run build')) {
    throw new Error(`${options.label} must validate the packaged authority through npm run build`);
  }
  if (source.includes('WORKFLOW_REPO_PATH:')) {
    throw new Error(
      `${options.label} must not enable unrelated Workflow repository authority checks`,
    );
  }

  const resolvePosition = source.indexOf('      - name: Resolve Workflow authority ref\n');
  const checkoutPosition = source.indexOf('      - name: Checkout Workflow authority\n');
  const validationPosition = source.indexOf(`      - name: ${options.validationStep}\n`);
  if (options.versionSourceStep) {
    const versionSourcePosition = source.indexOf(`      - name: ${options.versionSourceStep}\n`);
    if (versionSourcePosition >= resolvePosition) {
      throw new Error(
        `${options.label} must refresh the public artifact tuple before resolving its Workflow ref`,
      );
    }
  }
  if (!(resolvePosition < checkoutPosition && checkoutPosition < validationPosition)) {
    throw new Error(
      `${options.label} must resolve, check out, and validate the exact Workflow authority in order`,
    );
  }
}

for (const options of workflowPaths) {
  const source = fs.readFileSync(options.path, 'utf8');
  assert.doesNotThrow(() => assertSdkNeutralityReleaseWorkflow(source, options));

  const movingRefFixture = source.replace(PINNED_REF_EXPRESSION, 'ref: v2');
  assert.notStrictEqual(movingRefFixture, source, `${options.label} moving-ref fixture must mutate`);
  assert.throws(
    () => assertSdkNeutralityReleaseWorkflow(movingRefFixture, options),
    /reject a moving Workflow ref/,
    `${options.label} contract must reject moving Workflow refs`,
  );

  const missingManifestFixture = source.replace(`          ${MANIFEST_INPUT}\n`, '');
  assert.notStrictEqual(
    missingManifestFixture,
    source,
    `${options.label} missing-manifest fixture must mutate`,
  );
  assert.throws(
    () => assertSdkNeutralityReleaseWorkflow(missingManifestFixture, options),
    /require the dedicated SDK-neutrality manifest input/,
    `${options.label} contract must reject a release build without the dedicated manifest input`,
  );
}

console.log(
  'SDK-neutrality release workflow contracts pin the Workflow artifact and require its packaged manifest.',
);

module.exports = {assertSdkNeutralityReleaseWorkflow, workflowStep};
