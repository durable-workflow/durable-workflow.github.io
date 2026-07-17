#!/usr/bin/env node

const assert = require('assert');
const {
  REQUIRED_NODE_WORKFLOWS,
  SUPPORTED_NODE_RANGE,
  validateNodeToolchainPolicy,
} = require('./check-node-toolchain');

const validWorkflow = `steps:
  - uses: actions/setup-node@v6
    with:
      node-version: 24
`;
const validInputs = {
  workflows: Object.fromEntries(
    REQUIRED_NODE_WORKFLOWS.map(workflowPath => [workflowPath, validWorkflow]),
  ),
  packageManifest: {engines: {node: SUPPORTED_NODE_RANGE}},
  lockfileManifest: {packages: {'': {engines: {node: SUPPORTED_NODE_RANGE}}}},
};

function withOverrides(overrides) {
  return {
    ...validInputs,
    ...overrides,
  };
}

assert.doesNotThrow(() => validateNodeToolchainPolicy(validInputs));

for (const workflowPath of REQUIRED_NODE_WORKFLOWS) {
  assert.throws(
    () => validateNodeToolchainPolicy(withOverrides({
      workflows: {
        ...validInputs.workflows,
        [workflowPath]: validWorkflow.replace('node-version: 24', 'node-version: 20'),
      },
    })),
    new RegExp(`${workflowPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} must use Node 24 LTS; found Node 20`),
    `${workflowPath} must reject an EOL Node toolchain major`,
  );
}

assert.throws(
  () => validateNodeToolchainPolicy(withOverrides({
    workflows: {
      ...validInputs.workflows,
      '.github/workflows/future.yml': validWorkflow.replace('node-version: 24', 'node-version: 20'),
    },
  })),
  /future\.yml must use Node 24 LTS; found Node 20/,
  'new workflows must not bypass the supported Node policy',
);

assert.throws(
  () => validateNodeToolchainPolicy(withOverrides({
    workflows: {
      ...validInputs.workflows,
      '.github/workflows/matrix.yml': `strategy:
  matrix:
    node: [20, 24]
steps:
  - uses: actions/setup-node@v6
    with:
      node-version: \${{ matrix.node }}
`,
    },
  })),
  /matrix\.yml must configure a static node-version for every setup-node action/,
  'matrix expressions must not hide an EOL Node toolchain major',
);

assert.throws(
  () => validateNodeToolchainPolicy(withOverrides({
    packageManifest: {engines: {node: '>=16.14'}},
  })),
  /package\.json engines\.node must be >=24 <25/,
);

assert.throws(
  () => validateNodeToolchainPolicy(withOverrides({
    lockfileManifest: {packages: {'': {engines: {node: '>=16.14'}}}},
  })),
  /package-lock\.json root engines\.node must be >=24 <25/,
);

console.log('Node toolchain policy rejects EOL workflow and package metadata regressions.');
