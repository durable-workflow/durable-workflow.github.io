#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  ARTIFACT_PINS,
  ARTIFACT_VERSIONS,
  replaceArtifactTokens,
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

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson === expectedJson) {
    return;
  }

  if (Array.isArray(actual) && Array.isArray(expected)) {
    const maxLength = Math.max(actual.length, expected.length);
    for (let index = 0; index < maxLength; index += 1) {
      if (actual[index] !== expected[index]) {
        fail(
          `${label} must match docs/quickstart.md line ${index + 1}; ` +
            `expected ${JSON.stringify(expected[index])}, got ${JSON.stringify(actual[index])}`,
        );
      }
    }
  }

  fail(`${label} must match docs/quickstart.md`);
}

function assertIncludes(haystack, needle, label) {
  if (!String(haystack).includes(needle)) {
    fail(`${label} must include ${JSON.stringify(needle)}`);
  }
}

function assertIncludesNormalizedWhitespace(haystack, needle, label) {
  const normalizedHaystack = String(haystack).replace(/\s+/g, ' ');
  const normalizedNeedle = String(needle).replace(/\s+/g, ' ');

  assertIncludes(normalizedHaystack, normalizedNeedle, label);
}

function assertArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty array`);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function docsExamplePattern(id) {
  return new RegExp(
    `<!--\\s*docs-example\\s+id=["']${escapeRegExp(id)}["']\\s*-->\\s*\\n\\s*\`\`\`([A-Za-z0-9_-]+)?\\n([\\s\\S]*?)\\n\\s*\`\`\``,
    'm',
  );
}

function docsExampleLines(renderedQuickstart, id) {
  const match = renderedQuickstart.match(docsExamplePattern(id));

  if (!match) {
    fail(`docs/quickstart.md must include docs-example ${JSON.stringify(id)} followed by a fenced block`);
  }

  const language = match[1] || '';
  if (language !== 'bash') {
    fail(`docs/quickstart.md docs-example ${id} must be a bash fenced block; found ${language || 'untyped'}`);
  }

  return match[2].replace(/\r\n/g, '\n').split('\n');
}

function concatDocsExamples(renderedQuickstart, ids) {
  return ids.flatMap(id => docsExampleLines(renderedQuickstart, id));
}

function extractSection(content, startHeading, endHeading) {
  const startIndex = content.indexOf(startHeading);
  if (startIndex === -1) {
    fail(`docs/quickstart.md must include ${JSON.stringify(startHeading)}`);
  }

  const endIndex = content.indexOf(endHeading, startIndex + startHeading.length);
  if (endIndex === -1) {
    fail(`docs/quickstart.md must include ${JSON.stringify(endHeading)} after ${JSON.stringify(startHeading)}`);
  }

  return content.slice(startIndex, endIndex);
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

function assertQuickstartScriptLinesMatchDocs(contract, renderedQuickstart) {
  const hostingBranches = byId(contract.hosting_branches, 'hosting_branches');
  const scenarios = byId(contract.scenarios, 'scenarios');
  const standalone = hostingBranches.get('standalone_server_sqlite');
  const embeddedLaravel = hostingBranches.get('embedded_laravel_database_queue');
  const python = scenarios.get('python_user_local_server_completion');
  const operator = scenarios.get('operator_local_server_observation');
  const laravel = scenarios.get('laravel_user_embedded_completion');

  assertDeepEqual(
    standalone.setup_script_lines,
    docsExampleLines(renderedQuickstart, 'quickstart.server.setup'),
    'standalone_server_sqlite.setup_script_lines',
  );
  assertDeepEqual(
    standalone.teardown_script_lines,
    docsExampleLines(renderedQuickstart, 'quickstart.server.cleanup'),
    'standalone_server_sqlite.teardown_script_lines',
  );
  assertDeepEqual(
    embeddedLaravel.teardown_script_lines,
    docsExampleLines(renderedQuickstart, 'quickstart.laravel.app-cleanup'),
    'embedded_laravel_database_queue.teardown_script_lines',
  );
  assertDeepEqual(
    python.command_script_lines,
    concatDocsExamples(renderedQuickstart, [
      'quickstart.python.install',
      'quickstart.python.greeter',
    ]),
    'python_user_local_server_completion.command_script_lines',
  );
  assertDeepEqual(
    python.teardown_script_lines,
    docsExampleLines(renderedQuickstart, 'quickstart.python.cleanup'),
    'python_user_local_server_completion.teardown_script_lines',
  );
  assertDeepEqual(
    operator.command_script_lines,
    concatDocsExamples(renderedQuickstart, [
      'quickstart.operator.setup',
      'quickstart.operator.observe',
    ]),
    'operator_local_server_observation.command_script_lines',
  );
  assertDeepEqual(
    operator.teardown_script_lines,
    docsExampleLines(renderedQuickstart, 'quickstart.operator.cleanup'),
    'operator_local_server_observation.teardown_script_lines',
  );
  assertDeepEqual(
    laravel.command_script_lines,
    concatDocsExamples(renderedQuickstart, [
      'quickstart.laravel.install',
      'quickstart.laravel.workflow-files',
      'quickstart.laravel.command',
      'quickstart.laravel.run',
    ]),
    'laravel_user_embedded_completion.command_script_lines',
  );
  assertDeepEqual(
    laravel.teardown_script_lines,
    docsExampleLines(renderedQuickstart, 'quickstart.laravel.cleanup'),
    'laravel_user_embedded_completion.teardown_script_lines',
  );
}

function documentedWorkflowIdPattern(pattern, label) {
  if (pattern === '^quickstart-python-greeter-[0-9]+$') {
    return 'quickstart-python-greeter-*';
  }

  if (pattern === '^quickstart-laravel-[0-9]{14}$') {
    return 'quickstart-laravel-*';
  }

  fail(`${label}.workflow_id_pattern has no docs wildcard mapping: ${pattern}`);
}

function assertExpectedStateDocumented(state, completionCriteria, fullQuickstart, label) {
  if (!state) {
    fail(`${label}.expected_completion_state must be declared`);
  }

  if (state.workflow_id_pattern) {
    assertIncludes(
      completionCriteria,
      documentedWorkflowIdPattern(state.workflow_id_pattern, label),
      `${label} completion criteria`,
    );
  }

  if (state.status) {
    assertIncludes(completionCriteria, state.status, `${label} completion criteria status`);
  }

  if (state.result_contains) {
    assertIncludes(completionCriteria, state.result_contains, `${label} completion criteria result`);
  }

  if (typeof state.timeout_seconds === 'number') {
    assertIncludes(
      completionCriteria,
      `${state.timeout_seconds} seconds`,
      `${label} completion criteria timeout`,
    );
  }

  if (state.observes_workflow_from) {
    assertIncludes(completionCriteria, 'Python workflow', `${label} completion criteria observed workflow`);
  }

  if (state.operator_only_creates_workflow === false) {
    assertIncludesNormalizedWhitespace(
      fullQuickstart,
      'does not create or complete a user workflow by itself',
      `${label} operator-only behavior`,
    );
  }
}

function assertSuccessProbeDocumented(probe, completionCriteria, scriptCorpus, label) {
  if (probe.command) {
    assertIncludes(
      `${completionCriteria}\n${scriptCorpus}`,
      probe.command,
      `${label}.${probe.id} command`,
    );
  }

  if (probe.expect_json_key) {
    assertIncludes(completionCriteria, probe.expect_json_key, `${label}.${probe.id} expected JSON key`);
  }

  for (const substring of probe.required_substrings || []) {
    assertIncludes(completionCriteria, substring, `${label}.${probe.id} required substring`);
  }
}

function assertQuickstartObservablesMatchDocs(contract, renderedQuickstart) {
  const completionCriteria = extractSection(renderedQuickstart, '## Completion Criteria', '## Clean Up');
  const scriptCorpus = [
    ...contract.hosting_branches.flatMap(branch => branch.setup_script_lines || []),
    ...contract.hosting_branches.flatMap(branch => branch.teardown_script_lines || []),
    ...contract.scenarios.flatMap(scenario => scenario.command_script_lines || []),
    ...contract.scenarios.flatMap(scenario => scenario.teardown_script_lines || []),
  ].join('\n');

  for (const branch of contract.hosting_branches || []) {
    for (const probe of branch.success_probes || []) {
      assertSuccessProbeDocumented(probe, completionCriteria, scriptCorpus, branch.id);
    }
  }

  for (const scenario of contract.scenarios || []) {
    for (const probe of scenario.success_probes || []) {
      assertSuccessProbeDocumented(probe, completionCriteria, scriptCorpus, scenario.id);
    }

    assertExpectedStateDocumented(
      scenario.expected_completion_state,
      completionCriteria,
      renderedQuickstart,
      scenario.id,
    );
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
  const renderedQuickstart = replaceArtifactTokens(quickstart, 'docs/quickstart.md');

  assertEqual(contract.schema, EXPECTED_SCHEMA, 'quickstart execution contract schema');
  assertEqual(contract.version, 1, 'quickstart execution contract version');
  assertEqual(contract.release_status, '2.0_prerelease', 'quickstart execution contract release_status');
  assertEqual(contract.authority_doc, 'docs/quickstart.md', 'quickstart execution contract authority_doc');
  assertIncludes(quickstart, '/quickstart-execution-contract.json', 'docs/quickstart.md');

  assertDocsGuard(contract);
  assertPublicArtifactPins(contract);
  assertContractCoverage(contract);
  assertQuickstartScriptLinesMatchDocs(contract, renderedQuickstart);
  assertQuickstartObservablesMatchDocs(contract, renderedQuickstart);

  console.log('Quickstart execution contract checks passed');
}

main();
