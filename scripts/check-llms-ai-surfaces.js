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
  const v1Index = readBuildFile('llms-1.x.txt');
  const v1Full = readBuildFile('llms-full-1.x.txt');

  const requiredV2IndexSources = [
    'docs/ai-assisted-development.md',
    'docs/agent-operating-loop.md',
    'docs/mcp-workflows.md',
    'docs/agent-tooling-contract.md',
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
    '# AI-Assisted Development',
    '2.0 prerelease',
    '# Agent Operating Loop',
    '# MCP Workflow Surface',
    '# Agent Tooling Contract',
    '# Workflow API',
    'More Info for AI',
    'https://durable-workflow.com/llms-full-2.0.txt',
    '/mcp/workflows',
    'list_workflows',
    'start_workflow',
    'get_workflow_result',
    'get_workflow_history',
    '## Tool Input Contract',
    '## Tool Result Contract',
    'duplicate_start_policy=return_existing_active',
    'payload_preview_limit_bytes',
    'CLI reference',
    'Five-Minute Operator Quickstart',
    'VERSION=0.1.38',
    'dw env:set local',
    'dw doctor',
    'CLI and Python Parity',
    'workflow-start-parity.json',
    'activity_grade_external_execution',
    'worker_protocol.external_execution_surface_contract',
    'bridge adapters',
    'Python API reference',
    'MCP tools, CLI JSON, server diagnostics, Waterline exports, and SDK fixtures',
    'line up as one machine-operable surface',
    'humans learn the workflow/activity/replay invariant',
    'discover-change-run-diagnose workflow',
    'The `simple` and `elapsed` workflow keys are the preferred smoke surfaces.',
    'dw debug workflow <workflow-id> --output=json',
  ];

  for (const content of requiredV2FullContent) {
    assertIncludes(v2Full, content, 'llms-full-2.0.txt');
  }

  assertIncludes(v2Index, 'Topics: ai, agents, llms', 'llms-2.0.txt');
  assertIncludes(v2Index, 'prerelease guidance', 'llms-2.0.txt');
  assertIncludes(v2Index, 'not the default public docs line', 'llms-2.0.txt');
  assertIncludes(v2Index, 'Topics: ai, agents, mcp, operations', 'llms-2.0.txt');
  assertIncludes(v2Index, 'Topics: authoring, workflows, determinism', 'llms-2.0.txt');
  assertIncludes(v2Index, 'Topics: worker-protocol, external-workers, polyglot', 'llms-2.0.txt');
  assertIncludes(v2Index, 'Define Durable Workflow v2 workflow classes and keep orchestration code deterministic.', 'llms-2.0.txt');
  assertIncludes(v2Index, 'Implement the versioned worker-plane protocol for polling, leasing, history replay, heartbeats, completion, and external task results.', 'llms-2.0.txt');
  assertExcludes(v2Index, 'docs/topics.md', 'llms-2.0.txt');
  assertExcludes(v2Index, 'docs/search-and-navigation.md', 'llms-2.0.txt');
  assertExcludes(v2Full, '<!-- Source: docs/topics.md -->', 'llms-full-2.0.txt');
  assertExcludes(v2Full, '<!-- Source: docs/search-and-navigation.md -->', 'llms-full-2.0.txt');
  assertExcludes(v2Full, '# Topics', 'llms-full-2.0.txt');
  assertExcludes(v2Full, '# Search and Navigation', 'llms-full-2.0.txt');
  assertExcludes(v2Full, '<details>', 'llms-full-2.0.txt');
  assertExcludes(v2Full, '<summary>', 'llms-full-2.0.txt');
  assertIncludes(v2Full, '2.0 Prerelease Documentation', 'llms-full-2.0.txt');
  assertIncludes(v2Full, 'not the default public docs line', 'llms-full-2.0.txt');
  // Structural gate: canonical manifests must originate from whichever version
  // docusaurus.config.js declares as lastVersion. This assertion is the
  // machine-readable form of the cutover gate — changing canonical requires
  // advancing lastVersion in the config, not just editing these scripts.
  const configContent = fs.readFileSync(
    path.join(__dirname, '..', 'docusaurus.config.js'),
    'utf8',
  );
  const lastVersionMatch = configContent.match(/lastVersion:\s*['"]([^'"]*)['"]/);
  const lastVersion = lastVersionMatch ? lastVersionMatch[1] : null;
  if (lastVersion && lastVersion !== 'current') {
    const expectedSourcePrefix = `versioned_docs/version-${lastVersion}`;
    assertIncludes(canonicalIndex, expectedSourcePrefix, 'llms.txt');
    assertIncludes(canonicalFull, `<!-- Source: ${expectedSourcePrefix}`, 'llms-full.txt');
  } else {
    assertExcludes(canonicalIndex, 'versioned_docs/', 'llms.txt');
    assertIncludes(canonicalIndex, 'docs/ai-assisted-development.md', 'llms.txt');
    assertIncludes(canonicalFull, '# AI-Assisted Development', 'llms-full.txt');
  }

  // Canonical index must reference the canonical full file and must not
  // reference the versioned-alias form. The source-version assertion is
  // handled above by the structural gate; no version-specific strings here.
  assertIncludes(canonicalIndex, 'llms-full.txt', 'llms.txt');
  assertExcludes(canonicalIndex, 'llms-full-2.0.txt', 'llms.txt');

  // v1.x is reachable via the canonical default and the explicit pinned alias.
  assertIncludes(v1Index, 'versioned_docs/version-1.x', 'llms-1.x.txt');
  assertIncludes(v1Index, 'llms-full-1.x.txt', 'llms-1.x.txt');
  assertExcludes(v1Index, 'docs/ai-assisted-development.md', 'llms-1.x.txt');
  assertExcludes(v1Full, '# AI-Assisted Development', 'llms-full-1.x.txt');

  console.log('LLM AI surface checks passed');
}

main();
