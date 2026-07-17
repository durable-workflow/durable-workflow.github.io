#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SUPPORTED_NODE_MAJOR = 24;
const SUPPORTED_NODE_RANGE = '>=24 <25';
const REQUIRED_NODE_WORKFLOWS = [
  '.github/workflows/deploy.yml',
  '.github/workflows/protocol-specs.yml',
  '.github/workflows/public-artifact-tuple.yml',
  '.github/workflows/qualification.yml',
];

function declaredNodeVersions(workflow) {
  const versions = [];
  const pattern = /^\s*node-version:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))\s*(?:#.*)?$/gm;
  let match;

  while ((match = pattern.exec(workflow)) !== null) {
    versions.push(match[1] || match[2] || match[3]);
  }

  return versions;
}

function nodeMajor(version) {
  const match = /^(\d+)(?:$|[.x*])/.exec(version);
  return match ? Number.parseInt(match[1], 10) : null;
}

function setupNodeActionCount(workflow) {
  return (workflow.match(/^\s*-\s+uses:\s*actions\/setup-node@[^\s#]+/gm) || []).length;
}

function validateNodeToolchainPolicy({workflows, packageManifest, lockfileManifest}) {
  const failures = [];

  for (const workflowPath of REQUIRED_NODE_WORKFLOWS) {
    const workflow = workflows[workflowPath];
    if (typeof workflow !== 'string') {
      failures.push(`${workflowPath} is missing from the Node toolchain policy`);
      continue;
    }

    if (!workflow.includes('uses: actions/setup-node@v6')) {
      failures.push(`${workflowPath} must preserve actions/setup-node@v6`);
    }

    if (declaredNodeVersions(workflow).length === 0) {
      failures.push(`${workflowPath} must select Node ${SUPPORTED_NODE_MAJOR} LTS`);
    }
  }

  for (const [workflowPath, workflow] of Object.entries(workflows)) {
    const versions = declaredNodeVersions(workflow);
    if (setupNodeActionCount(workflow) !== versions.length) {
      failures.push(
        `${workflowPath} must configure a static node-version for every setup-node action`,
      );
    }

    for (const version of versions) {
      const major = nodeMajor(version);
      if (major === null) {
        failures.push(`${workflowPath} must use a static Node major; found ${version}`);
      } else if (major !== SUPPORTED_NODE_MAJOR) {
        failures.push(
          `${workflowPath} must use Node ${SUPPORTED_NODE_MAJOR} LTS; found Node ${major}`,
        );
      }
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
