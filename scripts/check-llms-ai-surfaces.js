const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');

function readBuildFile(name) {
  const filePath = path.join(buildDir, name);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing generated manifest: build/${name}`);
  }

  return fs.readFileSync(filePath, 'utf8');
}

function assertIncludes(haystack, needle, fileName) {
  if (!haystack.includes(needle)) {
    throw new Error(`Expected build/${fileName} to include ${JSON.stringify(needle)}`);
  }
}

function assertExcludes(haystack, needle, fileName) {
  if (haystack.includes(needle)) {
    throw new Error(`Expected build/${fileName} not to include ${JSON.stringify(needle)}`);
  }
}

function main() {
  const v2Index = readBuildFile('llms-2.0.txt');
  const v2Full = readBuildFile('llms-full-2.0.txt');
  const canonicalIndex = readBuildFile('llms.txt');
  const canonicalFull = readBuildFile('llms-full.txt');

  const requiredV2IndexSources = [
    'docs/ai-assisted-development.md',
    'docs/topics.md',
    'docs/sample-app.md',
    'docs/polyglot/cli.mdx',
    'docs/polyglot/cli-python-parity.md',
    'docs/polyglot/server.md',
    'docs/polyglot/external-execution.md',
    'llms-full-2.0.txt',
  ];

  for (const source of requiredV2IndexSources) {
    assertIncludes(v2Index, source, 'llms-2.0.txt');
  }

  const requiredV2FullContent = [
    '<!-- Source: docs/ai-assisted-development.md -->',
    '<!-- Source: docs/topics.md -->',
    '# AI-Assisted Development',
    'https://durable-workflow.com/llms-full-2.0.txt',
    '/mcp/workflows',
    'list_workflows',
    'start_workflow',
    'get_workflow_result',
    'get_workflow_history',
    'CLI reference',
    'CLI and Python Parity',
    'workflow-start-parity.json',
    'activity_grade_external_execution',
    'worker_protocol.external_execution_surface_contract',
    'bridge adapters',
    'Python API reference',
    'humans learn the workflow/activity/replay invariant',
  ];

  for (const content of requiredV2FullContent) {
    assertIncludes(v2Full, content, 'llms-full-2.0.txt');
  }

  assertIncludes(v2Index, 'Topics: ai, agents, llms', 'llms-2.0.txt');
  assertIncludes(v2Index, 'Topics: authoring, workflows, determinism', 'llms-2.0.txt');
  assertIncludes(v2Index, 'Topics: worker-protocol, external-workers, polyglot', 'llms-2.0.txt');
  assertIncludes(v2Index, 'Define Durable Workflow v2 workflow classes and keep orchestration code deterministic.', 'llms-2.0.txt');
  assertIncludes(v2Index, 'Implement the versioned worker-plane protocol for polling, leasing, history replay, heartbeats, completion, and external task results.', 'llms-2.0.txt');
  assertIncludes(v2Index, 'Find Durable Workflow v2 docs by task', 'llms-2.0.txt');
  assertIncludes(canonicalIndex, 'versioned_docs/version-1.x', 'llms.txt');
  assertIncludes(canonicalIndex, 'llms-full.txt', 'llms.txt');
  assertExcludes(canonicalIndex, 'docs/ai-assisted-development.md', 'llms.txt');
  assertExcludes(canonicalIndex, 'llms-full-2.0.txt', 'llms.txt');
  assertExcludes(canonicalFull, '# AI-Assisted Development', 'llms-full.txt');

  console.log('LLM AI surface checks passed');
}

main();
