const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'public-artifact-tuple.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

function fail(message) {
  console.error(message);
  process.exit(1);
}

for (const forbidden of [
  'contents: write',
  'pull-requests: write',
  'git push',
  'git commit',
  'api.github.com',
  '/pulls',
  'GH_TOKEN',
]) {
  if (workflow.includes(forbidden)) {
    fail(`public-artifact-tuple workflow must not use direct GitHub write behavior: ${forbidden}`);
  }
}

for (const required of [
  'contents: read',
  'docs-artifact-tuple-handoff.json',
  'public-artifact-tuple-pipeline-handoff',
  "schema: 'durable-workflow.docs.public-artifact-tuple-handoff'",
  "action: 'pipeline_ready_item'",
  "integration: 'pipeline'",
  'scripts/public-artifact-versions.json',
  'docs/compatibility.md',
  "stable_default_docs_line: '1.x'",
  "prerelease_docs_line: '2.0'",
  "'LEAK=0'",
  "'MIXED=0'",
]) {
  if (!workflow.includes(required)) {
    fail(`public-artifact-tuple workflow is missing required pipeline handoff contract: ${required}`);
  }
}

console.log('Public artifact tuple workflow uses a read-only pipeline handoff.');
