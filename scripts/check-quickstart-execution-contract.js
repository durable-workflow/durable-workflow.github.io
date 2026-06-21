#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  ARTIFACT_PINS,
  ARTIFACT_VERSIONS,
} = require('./public-artifact-versions');

const repoRoot = path.join(__dirname, '..');
const contractPath = path.join(repoRoot, 'static', 'quickstart-execution-contract.json');
const quickstartPath = path.join(repoRoot, 'docs', 'quickstart.md');
const configPath = path.join(repoRoot, 'docusaurus.config.js');
const EXPECTED_SCHEMA = 'durable-workflow.docs.v2.quickstart-execution-contract';

function fail(message) {
  throw new Error(message);
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function loadJson(filePath, label) {
  try {
    return JSON.parse(read(filePath));
  } catch (error) {
    fail(`${label} must be valid JSON: ${error.message}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(haystack, needle, label) {
  if (!String(haystack).includes(needle)) {
    fail(`${label} must include ${JSON.stringify(needle)}`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty array`);
  }
}

function getDocsReleaseConfig() {
  const content = read(configPath);
  const lastVersion = content.match(/lastVersion:\s*['"]([^'"]+)['"]/);
  const currentPath = content.match(/current:\s*\{[^}]*path:\s*['"]([^'"]*)['"]/s);
  const currentBanner = content.match(/current:\s*\{[^}]*banner:\s*['"]([^'"]*)['"]/s);
  const stablePath = content.match(/['"]1\.x['"]:\s*\{[^}]*path:\s*['"]([^'"]*)['"]/s);

  return {
    lastVersion: lastVersion ? lastVersion[1] : null,
    currentPath: currentPath ? currentPath[1] : null,
    currentBanner: currentBanner ? currentBanner[1] : null,
    stablePath: stablePath ? stablePath[1] : null,
  };
}

function joinScriptLines(lines) {
  assertArray(lines, 'script lines');
  return lines.join('\n');
}

function byId(items, label) {
  const map = new Map();

  for (const item of items || []) {
    if (!item || typeof item.id !== 'string' || item.id === '') {
      fail(`${label} entries must have a non-empty id`);
    }

    if (map.has(item.id)) {
      fail(`${label} must not contain duplicate id ${JSON.stringify(item.id)}`);
    }

    map.set(item.id, item);
  }

  return map;
}

function assertPublicArtifactPins(contract) {
  const artifacts = contract.artifacts || {};

  assertEqual(artifacts.server && artifacts.server.version, ARTIFACT_VERSIONS.server, 'server artifact version');
  assertEqual(artifacts.server && artifacts.server.reference, ARTIFACT_PINS.serverDockerHubImage, 'server image reference');
  assertEqual(artifacts.cli && artifacts.cli.version, ARTIFACT_VERSIONS.cli, 'CLI artifact version');
  assertEqual(artifacts.cli && artifacts.cli.install_command, ARTIFACT_PINS.cliInstallerCommand, 'CLI install command');
  assertEqual(artifacts['sdk-python'] && artifacts['sdk-python'].version, ARTIFACT_VERSIONS['sdk-python'], 'Python SDK artifact version');
  assertEqual(artifacts['sdk-python'] && artifacts['sdk-python'].pip_package, ARTIFACT_PINS.pythonPackagePin, 'Python SDK package pin');
  assertEqual(artifacts['sdk-python'] && artifacts['sdk-python'].install_command, ARTIFACT_PINS.pythonPipInstallCommand, 'Python SDK install command');
  assertEqual(artifacts.workflow && artifacts.workflow.version, ARTIFACT_VERSIONS.workflow, 'Workflow artifact version');
  assertEqual(artifacts.workflow && artifacts.workflow.composer_constraint, ARTIFACT_PINS.workflowComposerPackage, 'Workflow Composer constraint');
  assertEqual(artifacts.waterline && artifacts.waterline.version, ARTIFACT_VERSIONS.waterline, 'Waterline artifact version');
  assertEqual(artifacts.waterline && artifacts.waterline.composer_constraint, ARTIFACT_PINS.waterlineComposerPackage, 'Waterline Composer constraint');
}

function assertScenarioShape(scenario, hostingBranches, personas) {
  if (!personas.has(scenario.persona)) {
    fail(`Scenario ${scenario.id} references unknown persona ${JSON.stringify(scenario.persona)}`);
  }

  if (!hostingBranches.has(scenario.hosting_branch)) {
    fail(`Scenario ${scenario.id} references unknown hosting branch ${JSON.stringify(scenario.hosting_branch)}`);
  }

  assertArray(scenario.source_channels, `${scenario.id}.source_channels`);
  assertArray(scenario.command_script_lines, `${scenario.id}.command_script_lines`);
  assertArray(scenario.success_probes, `${scenario.id}.success_probes`);
  assertArray(scenario.teardown_script_lines, `${scenario.id}.teardown_script_lines`);

  if (!scenario.expected_completion_state || typeof scenario.expected_completion_state.status !== 'string') {
    fail(`${scenario.id}.expected_completion_state.status must be declared`);
  }
}

function assertContractCoverage(contract) {
  const personas = byId(contract.personas, 'personas');
  const hostingBranches = byId(contract.hosting_branches, 'hosting_branches');
  const scenarios = byId(contract.scenarios, 'scenarios');

  for (const id of ['python', 'operator', 'laravel']) {
    if (!personas.has(id)) {
      fail(`Contract must declare supported persona ${id}`);
    }
  }

  for (const id of ['standalone_server_sqlite', 'embedded_laravel_database_queue']) {
    if (!hostingBranches.has(id)) {
      fail(`Contract must declare hosting branch ${id}`);
    }
  }

  for (const id of [
    'python_user_local_server_completion',
    'operator_local_server_observation',
    'laravel_user_embedded_completion',
  ]) {
    if (!scenarios.has(id)) {
      fail(`Contract must declare scenario ${id}`);
    }
  }

  for (const scenario of scenarios.values()) {
    assertScenarioShape(scenario, hostingBranches, personas);
  }

  const standalone = hostingBranches.get('standalone_server_sqlite');
  const standaloneScript = joinScriptLines(standalone.setup_script_lines);
  assertIncludes(standaloneScript, ARTIFACT_PINS.serverDockerHubImage, 'standalone hosting setup');
  assertIncludes(standaloneScript, 'http://localhost:8080/api/ready', 'standalone hosting setup');
  assertIncludes(standaloneScript, '/api/cluster/info', 'standalone hosting setup');
  assertIncludes(joinScriptLines(standalone.teardown_script_lines), 'docker volume rm durable-workflow-quickstart', 'standalone hosting teardown');

  const pythonScript = joinScriptLines(scenarios.get('python_user_local_server_completion').command_script_lines);
  assertIncludes(pythonScript, ARTIFACT_PINS.pythonPipInstallCommand, 'Python quickstart script');
  assertIncludes(pythonScript, 'await worker.run_until', 'Python quickstart script');
  assertIncludes(pythonScript, 'python greeter.py', 'Python quickstart script');
  assertEqual(scenarios.get('python_user_local_server_completion').expected_completion_state.status, 'completed', 'Python expected status');

  const operatorScript = joinScriptLines(scenarios.get('operator_local_server_observation').command_script_lines);
  assertIncludes(operatorScript, ARTIFACT_PINS.cliInstallerCommand, 'operator quickstart script');
  assertIncludes(operatorScript, 'dw env:set local', 'operator quickstart script');
  assertIncludes(operatorScript, 'dw workflow:describe', 'operator quickstart script');
  assertIncludes(operatorScript, 'dw workflow:history', 'operator quickstart script');
  assertIncludes(joinScriptLines(scenarios.get('operator_local_server_observation').teardown_script_lines), 'dw env:delete local', 'operator teardown');
  assertEqual(scenarios.get('operator_local_server_observation').expected_completion_state.status, 'completed', 'operator expected status');

  const laravelScript = joinScriptLines(scenarios.get('laravel_user_embedded_completion').command_script_lines);
  assertIncludes(laravelScript, 'composer create-project laravel/laravel durable-workflow-laravel-quickstart', 'Laravel quickstart script');
  assertIncludes(laravelScript, ARTIFACT_PINS.workflowComposerPackage, 'Laravel quickstart script');
  assertIncludes(laravelScript, ARTIFACT_PINS.waterlineComposerPackage, 'Laravel quickstart script');
  assertIncludes(laravelScript, 'php artisan queue:work --tries=1 --timeout=60', 'Laravel quickstart script');
  assertIncludes(laravelScript, 'php artisan app:quickstart-workflow', 'Laravel quickstart script');
  assertEqual(scenarios.get('laravel_user_embedded_completion').expected_completion_state.status, 'completed', 'Laravel expected status');
}

function assertDocsGuard(contract) {
  const releaseConfig = getDocsReleaseConfig();

  assertEqual(releaseConfig.lastVersion, '1.x', 'docs.lastVersion');
  assertEqual(releaseConfig.stablePath, '', 'stable docs path');
  assertEqual(releaseConfig.currentPath, '2.0', 'current prerelease docs path');
  assertEqual(releaseConfig.currentBanner, 'unreleased', 'current prerelease banner');

  assertEqual(contract.default_docs_guard && contract.default_docs_guard.stable_default_docs_version, '1.x', 'contract stable default docs version');
  assertEqual(contract.default_docs_guard && contract.default_docs_guard.explicit_prerelease_docs_version, '2.0', 'contract prerelease docs version');
  assertEqual(contract.default_docs_guard && contract.default_docs_guard.canonical_llms_remain_stable_default, true, 'contract canonical LLM default guard');
}

function main() {
  const contract = loadJson(contractPath, 'static/quickstart-execution-contract.json');
  const quickstart = read(quickstartPath);

  assertEqual(contract.schema, EXPECTED_SCHEMA, 'quickstart execution contract schema');
  assertEqual(contract.version, 1, 'quickstart execution contract version');
  assertEqual(contract.release_status, '2.0_prerelease', 'quickstart execution contract release_status');
  assertEqual(contract.authority_doc, 'docs/quickstart.md', 'quickstart execution contract authority_doc');
  assertIncludes(quickstart, '/quickstart-execution-contract.json', 'docs/quickstart.md');

  assertDocsGuard(contract);
  assertPublicArtifactPins(contract);
  assertContractCoverage(contract);

  console.log('Quickstart execution contract checks passed');
}

main();
