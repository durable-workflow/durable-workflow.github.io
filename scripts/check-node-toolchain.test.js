#!/usr/bin/env node

const assert = require('assert');
const {
  REQUIRED_NODE_WORKFLOWS,
  SUPPORTED_NODE_RANGE,
  validateNodeToolchainPolicy,
} = require('./check-node-toolchain');

const validWorkflow = `jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38
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
    new RegExp(
      `${workflowPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} job test step 1 must use Node 24 LTS; found Node 20`,
    ),
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
  /future\.yml job test step 1 must use Node 24 LTS; found Node 20/,
  'new workflows must not bypass the supported Node policy',
);

assert.throws(
  () => validateNodeToolchainPolicy(withOverrides({
    workflows: {
      ...validInputs.workflows,
      '.github/workflows/flow-style.yaml': `jobs:
  test:
    runs-on: ubuntu-latest
    steps: [{uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38, with: {node-version: 20}}]
`,
    },
  })),
  /flow-style\.yaml job test step 1 must use Node 24 LTS; found Node 20/,
  'flow-style setup-node steps must not bypass the supported Node policy',
);

assert.throws(
  () => validateNodeToolchainPolicy(withOverrides({
    workflows: {
      ...validInputs.workflows,
      '.github/workflows/matrix.yml': `jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 24]
    steps:
      - name: Set up matrix Node
        uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38
        with: {node-version: '\${{ matrix.node }}'}
`,
    },
  })),
  /matrix\.yml job test step 1 must configure a static Node major; found \$\{\{ matrix\.node \}\}/,
  'matrix expressions must not hide an EOL Node toolchain major',
);

assert.throws(
  () => validateNodeToolchainPolicy(withOverrides({
    workflows: {
      ...validInputs.workflows,
      '.github/workflows/range.yml': validWorkflow.replace('node-version: 24', 'node-version: 24.x || 20'),
    },
  })),
  /range\.yml job test step 1 must configure a static Node major; found 24\.x \|\| 20/,
  'version ranges must not hide an EOL Node toolchain major',
);

assert.throws(
  () => validateNodeToolchainPolicy(withOverrides({
    workflows: {
      ...validInputs.workflows,
      [REQUIRED_NODE_WORKFLOWS[0]]: validWorkflow.replace(
        '    steps:',
        `    steps:
      - {uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38, with: {node-version: 20}}`,
      ),
    },
  })),
  /job test step 1 must use Node 24 LTS; found Node 20/,
  'a second flow-style setup-node step must not hide beside the required Node 24 step',
);

assert.throws(
  () => validateNodeToolchainPolicy(withOverrides({
    workflows: {
      ...validInputs.workflows,
      '.github/workflows/old-action.yml': validWorkflow.replace(
        'setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38',
        'setup-node@v5',
      ),
    },
  })),
  /old-action\.yml job test step 1 must use actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38; found actions\/setup-node@v5/,
  'every setup-node step must pin the supported action major',
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
