#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SUPPORTED_NODE_MAJOR = 24;
const SUPPORTED_NODE_RANGE = '>=24 <25';
const REQUIRED_NODE_WORKFLOWS = [
  '.github/workflows/deploy.yml',
  '.github/workflows/protocol-specs.yml',
  '.github/workflows/qualification.yml',
];

function nodeMajor(version) {
  if (typeof version !== 'string' && typeof version !== 'number') {
    return null;
  }

  const match = /^(\d+)(?:\.(?:\d+|x|\*))*$/.exec(String(version));
  return match ? Number.parseInt(match[1], 10) : null;
}

function isSetupNodeReference(uses) {
  return typeof uses === 'string' && /^actions\/setup-node(?:[/@]|$)/i.test(uses);
}

function setupNodeSteps(workflowPath, source, failures) {
  let workflow;

  try {
    workflow = yaml.load(source);
  } catch (error) {
    failures.push(`${workflowPath} must contain valid YAML; ${error.reason || error.message}`);
    return null;
  }

  const matches = [];
  const jobs = workflow?.jobs;
  if (jobs === undefined) {
    return matches;
  }

  if (jobs === null || typeof jobs !== 'object' || Array.isArray(jobs)) {
    failures.push(`${workflowPath} jobs must be a mapping`);
    return null;
  }

  for (const [jobName, job] of Object.entries(jobs)) {
    if (job === null || typeof job !== 'object' || Array.isArray(job) || job.steps === undefined) {
      continue;
    }

    if (!Array.isArray(job.steps)) {
      failures.push(`${workflowPath} job ${jobName} steps must be a sequence`);
      continue;
    }

    job.steps.forEach((step, index) => {
      if (
        step !== null &&
        typeof step === 'object' &&
        !Array.isArray(step) &&
        isSetupNodeReference(step.uses)
      ) {
        matches.push({jobName, position: index + 1, step});
      }
    });
  }

  return matches;
}

function validateNodeToolchainPolicy({workflows, packageManifest, lockfileManifest}) {
  const failures = [];
  const setupStepsByWorkflow = new Map();

  for (const [workflowPath, workflow] of Object.entries(workflows)) {
    const setupSteps = setupNodeSteps(workflowPath, workflow, failures);
    setupStepsByWorkflow.set(workflowPath, setupSteps);

    if (setupSteps === null) {
      continue;
    }

    for (const {jobName, position, step} of setupSteps) {
      const stepLocation = `${workflowPath} job ${jobName} step ${position}`;

      if (step.uses !== 'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38') {
        failures.push(
          `${stepLocation} must use actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38; found ${String(step.uses)}`,
        );
      }

      const version = step.with?.['node-version'];
      const major = nodeMajor(version);
      if (major === null) {
        const found = version === undefined ? 'no node-version' : String(version);
        failures.push(`${stepLocation} must configure a static Node major; found ${found}`);
      } else if (major !== SUPPORTED_NODE_MAJOR) {
        failures.push(
          `${stepLocation} must use Node ${SUPPORTED_NODE_MAJOR} LTS; found Node ${major}`,
        );
      }
    }
  }

  for (const workflowPath of REQUIRED_NODE_WORKFLOWS) {
    const workflow = workflows[workflowPath];
    if (typeof workflow !== 'string') {
      failures.push(`${workflowPath} is missing from the Node toolchain policy`);
      continue;
    }

    const setupSteps = setupStepsByWorkflow.get(workflowPath);
    if (setupSteps !== null && setupSteps.length === 0) {
      failures.push(
        `${workflowPath} must include actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 with Node ${SUPPORTED_NODE_MAJOR} LTS`,
      );
    }
  }

  if (packageManifest.engines?.node !== SUPPORTED_NODE_RANGE) {
    failures.push(
      `package.json engines.node must be ${SUPPORTED_NODE_RANGE}; found ${packageManifest.engines?.node}`,
    );
  }

  const lockedNodeRange = lockfileManifest.packages?.['']?.engines?.node;
  if (lockedNodeRange !== SUPPORTED_NODE_RANGE) {
    failures.push(
      `package-lock.json root engines.node must be ${SUPPORTED_NODE_RANGE}; found ${lockedNodeRange}`,
    );
  }

  if (failures.length > 0) {
    throw new Error(`Node toolchain policy violations:\n- ${failures.join('\n- ')}`);
  }
}

function repositoryInputs(repositoryRoot) {
  const workflowsRoot = path.join(repositoryRoot, '.github', 'workflows');
  const workflows = {};

  for (const entry of fs.readdirSync(workflowsRoot, {withFileTypes: true})) {
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) {
      continue;
    }

    const relativePath = path.posix.join('.github', 'workflows', entry.name);
    workflows[relativePath] = fs.readFileSync(path.join(workflowsRoot, entry.name), 'utf8');
  }

  return {
    workflows,
    packageManifest: JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')),
    lockfileManifest: JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, 'package-lock.json'), 'utf8'),
    ),
  };
}

if (require.main === module) {
  try {
    validateNodeToolchainPolicy(repositoryInputs(path.join(__dirname, '..')));
    console.log(`Docs workflows and package metadata require Node ${SUPPORTED_NODE_MAJOR} LTS.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  REQUIRED_NODE_WORKFLOWS,
  SUPPORTED_NODE_MAJOR,
  SUPPORTED_NODE_RANGE,
  validateNodeToolchainPolicy,
};
