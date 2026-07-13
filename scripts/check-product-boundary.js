#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertIncludes(content, needle, label) {
  if (!content.includes(needle)) {
    throw new Error(`${label} must include ${JSON.stringify(needle)}`);
  }
}

function assertExcludes(content, needle, label) {
  if (content.toLowerCase().includes(needle.toLowerCase())) {
    throw new Error(`${label} must not include ${JSON.stringify(needle)}`);
  }
}

function assertOrdered(content, headings, label) {
  let previous = -1;
  for (const heading of headings) {
    const position = content.indexOf(heading);
    if (position < 0) {
      throw new Error(`${label} is missing ordered heading ${JSON.stringify(heading)}`);
    }
    if (position <= previous) {
      throw new Error(`${label} must place ${JSON.stringify(heading)} after the previous product-boundary section`);
    }
    previous = position;
  }
}

function assertOnlyExplicitV2Links(content, label) {
  const markdownLink = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of content.matchAll(markdownLink)) {
    const href = match[1].split('#')[0].split('?')[0];
    if (href === '' || href.startsWith('/docs/2.0/')) {
      continue;
    }
    throw new Error(
      `${label} evidence link ${JSON.stringify(match[1])} is not an explicit 2.0 docs link`,
    );
  }
}

function main() {
  const introduction = read('docs/introduction.md');
  assertOrdered(
    introduction,
    [
      '# Introduction',
      '## Agent-operable by contract',
      '## Three deployment and control-plane choices',
      '## First-party SDKs',
      '## Laravel-native embedded mode',
    ],
    'docs/introduction.md',
  );
  for (const phrase of [
    'polyglot durable-execution platform',
    'Standalone server:',
    'Embedded:',
    'Durable Workflow Cloud:',
    '/docs/2.0/polyglot/cloud-control-plane/',
    'PHP, Python, and Rust are first-party SDK surfaces',
    '**Rust** authors deterministic workflows',
    'worker services',
    'MCP is one interface',
  ]) {
    assertIncludes(introduction, phrase, 'docs/introduction.md');
  }
  assertExcludes(introduction, 'Choose either deployment boundary', 'docs/introduction.md');

  const server = read('docs/polyglot/server.md');
  for (const phrase of [
    '## Is this only for PHP teams?',
    'implemented in PHP',
    'Python- or Rust-only',
    'does not embed Laravel',
    'Standalone adoption:',
    'Embedded adoption:',
    'Hosted control-plane adoption:',
    '/docs/2.0/polyglot/cloud-control-plane/',
  ]) {
    assertIncludes(server, phrase, 'docs/polyglot/server.md');
  }

  const capabilities = read('docs/capabilities.md');
  assertOnlyExplicitV2Links(capabilities, 'docs/capabilities.md');
  for (const phrase of [
    'PHP SDK and embedded engine',
    'Python SDK',
    'Rust SDK',
    '%%artifact.workflowVersion%%',
    '%%artifact.pythonSdkVersion%%',
    '%%artifact.rustSdkVersion%%',
    '%%artifact.serverVersion%%',
    '%%artifact.cliVersion%%',
    '%%artifact.waterlineVersion%%',
    'Workflows',
    'Activities and services',
    'Signals',
    'Queries',
    'Updates',
    'Timers',
    'Retries',
    'Timeouts',
    'Child workflows',
    'Cancellation',
    'Termination',
    'Side effects',
    'Version markers',
    'Deterministic replay',
    'Schedules',
    'Namespaces',
    'Search attributes',
    'Worker compatibility',
    'Codec interoperability',
    'Diagnostics',
    'Agent tooling',
    'Rust `%%artifact.rustSdkVersion%%` expose durable version markers',
    'Temporal is substantially more mature operationally',
  ]) {
    assertIncludes(capabilities, phrase, 'docs/capabilities.md');
  }
  for (const forbidden of ['/docs/1.', '/docs/introduction', 'versioned_docs/version-1']) {
    assertExcludes(capabilities, forbidden, 'docs/capabilities.md');
  }

  const agent = read('docs/ai-agent-workflow-engine.md');
  for (const stage of ['Discover', 'Change', 'Run', 'Diagnose', 'Repair']) {
    assertIncludes(agent, `| **${stage}** |`, 'docs/ai-agent-workflow-engine.md');
  }
  for (const surface of [
    'GET /api/cluster/info',
    'dw schema:list --output=json',
    'start/signal/update routes',
    'Workflow describe/result/history endpoints',
    '`dw doctor`',
    'task-queue and worker JSON',
    'repair, retry, cancel, terminate',
    'post-change verification',
    'MCP is one interface',
    'PHP `%%artifact.workflowVersion%%`, Python `%%artifact.pythonSdkVersion%%`, and',
    'Rust `%%artifact.rustSdkVersion%%` are first-party SDK surfaces',
    'does not embed Laravel',
    'Temporal is substantially more mature operationally',
    'beyond the exact',
    '/docs/2.0/polyglot/cloud-control-plane/',
  ]) {
    assertIncludes(agent, surface, 'docs/ai-agent-workflow-engine.md');
  }
  assertExcludes(agent, 'managed hosting being mandatory', 'docs/ai-agent-workflow-engine.md');
  assertExcludes(agent, 'managed hosting is mandatory', 'docs/ai-agent-workflow-engine.md');
  assertExcludes(agent, 'require managed hosting', 'docs/ai-agent-workflow-engine.md');

  const taxonomy = read('docs/workflow-engine-categories.md');
  for (const category of [
    'Replay-based durable-execution engine',
    'Job queue',
    'DAG scheduler',
    'Checkpoint/resume library',
    'Agent framework',
    'Serverless orchestration product',
    'Hosted workflow platform',
  ]) {
    assertIncludes(taxonomy, category, 'docs/workflow-engine-categories.md');
  }

  const sidebar = read('sidebars.js');
  const discovery = read('scripts/discoverability-contract.json');
  const llmCheck = read('scripts/check-llms-ai-surfaces.js');
  for (const page of ['capabilities', 'ai-agent-workflow-engine', 'workflow-engine-categories']) {
    assertIncludes(sidebar, `'${page}'`, 'sidebars.js');
    assertIncludes(discovery, `${page}.md`, 'scripts/discoverability-contract.json');
    assertIncludes(llmCheck, `docs/${page}.md`, 'scripts/check-llms-ai-surfaces.js');
  }

  const neutralityDoc = read('docs/sdk-neutrality.md');
  const neutralityContract = JSON.parse(read('static/sdk-neutrality-contract.json'));
  assertIncludes(neutralityDoc, 'first_party.rust_sdk', 'docs/sdk-neutrality.md');
  if (!neutralityContract.sdk_breadth_policy?.first_party?.rust_sdk) {
    throw new Error('static/sdk-neutrality-contract.json must declare rust_sdk as first-party');
  }

  console.log('2.0 product-boundary checks passed');
}

main();
