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

function assertArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty array`);
  }
}

function assertStringArrayEqual(actual, expected, label) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    fail(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
  assertEqual(artifacts['sdk-php'] && artifacts['sdk-php'].version, ARTIFACT_VERSIONS['sdk-php'], 'PHP SDK artifact version');
  assertEqual(artifacts['sdk-php'] && artifacts['sdk-php'].composer_package, ARTIFACT_PINS.phpSdkComposerPackage, 'PHP SDK Composer package pin');
  assertEqual(artifacts['sdk-php'] && artifacts['sdk-php'].install_command, ARTIFACT_PINS.phpSdkComposerInstallCommand, 'PHP SDK install command');
  assertEqual(artifacts['sdk-python'] && artifacts['sdk-python'].version, ARTIFACT_VERSIONS['sdk-python'], 'Python SDK artifact version');
  assertEqual(artifacts['sdk-python'] && artifacts['sdk-python'].pip_package, ARTIFACT_PINS.pythonPackagePin, 'Python SDK package pin');
  assertEqual(artifacts['sdk-python'] && artifacts['sdk-python'].install_command, ARTIFACT_PINS.pythonPipInstallCommand, 'Python SDK install command');
  assertEqual(artifacts['sdk-rust'] && artifacts['sdk-rust'].version, ARTIFACT_VERSIONS['sdk-rust'], 'Rust SDK artifact version');
  assertEqual(artifacts['sdk-rust'] && artifacts['sdk-rust'].crate, 'durable-workflow', 'Rust SDK crate name');
  assertEqual(artifacts['sdk-rust'] && artifacts['sdk-rust'].install_command, ARTIFACT_PINS.rustCargoAddCommand, 'Rust SDK install command');
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
  for (const branch of contract.hosting_branches || []) {
    if (!Array.isArray(branch.docs_examples) || branch.docs_examples.length === 0) {
      continue;
    }

    assertDeepEqual(
      branch.setup_script_lines,
      concatDocsExamples(renderedQuickstart, branch.docs_examples),
      `${branch.id}.setup_script_lines`,
    );
  }

  for (const scenario of contract.scenarios || []) {
    if (!Array.isArray(scenario.docs_examples) || scenario.docs_examples.length === 0) {
      continue;
    }

    assertDeepEqual(
      scenario.command_script_lines,
      concatDocsExamples(renderedQuickstart, scenario.docs_examples),
      `${scenario.id}.command_script_lines`,
    );
  }
}

function assertPrimaryPaths(contract, personas, hostingBranches, scenarios) {
  assertArray(contract.primary_paths, 'primary_paths');
  const requiredLanguages = new Set(['php', 'python', 'rust']);
  const seenLanguages = new Set();
  const requiredOutcomes = [
    'start_server',
    'install_published_sdk',
    'run_worker',
    'start_workflow',
    'inspect_completed_result',
  ];

  for (const path of contract.primary_paths) {
    if (!requiredLanguages.has(path.language)) {
      fail(`primary_paths contains unsupported language ${JSON.stringify(path.language)}`);
    }
    if (seenLanguages.has(path.language)) {
      fail(`primary_paths contains duplicate language ${JSON.stringify(path.language)}`);
    }
    seenLanguages.add(path.language);

    const scenario = scenarios.get(path.scenario);
    if (!scenario) {
      fail(`primary path ${path.language} references unknown scenario ${JSON.stringify(path.scenario)}`);
    }
    if (!personas.has(path.language) || scenario.persona !== path.language) {
      fail(`primary path ${path.language} must use its matching persona`);
    }
    if (!hostingBranches.has(path.hosting_branch) || scenario.hosting_branch !== path.hosting_branch) {
      fail(`primary path ${path.language} must use its declared hosting branch`);
    }
    if (!contract.artifacts || !contract.artifacts[path.sdk_artifact]) {
      fail(`primary path ${path.language} references unknown SDK artifact ${JSON.stringify(path.sdk_artifact)}`);
    }
    assertStringArrayEqual(
      path.required_outcomes,
      requiredOutcomes,
      `primary path ${path.language} required_outcomes`,
    );
    assertEqual(
      scenario.expected_completion_state && scenario.expected_completion_state.status,
      'completed',
      `primary path ${path.language} expected status`,
    );
  }

  for (const language of requiredLanguages) {
    if (!seenLanguages.has(language)) {
      fail(`primary_paths must declare ${language}`);
    }
  }
}

function assertContractCoverage(contract) {
  const personas = byId(contract.personas, 'personas');
  const hostingBranches = byId(contract.hosting_branches, 'hosting_branches');
  const scenarios = byId(contract.scenarios, 'scenarios');
  const allowedChannels = new Set(contract.public_source_policy?.allowed_channels || []);

  if (allowedChannels.size === 0) {
    fail('public_source_policy.allowed_channels must be a non-empty array');
  }

  for (const branch of hostingBranches.values()) {
    assertArray(branch.used_by_personas, `${branch.id}.used_by_personas`);
    for (const persona of branch.used_by_personas) {
      if (!personas.has(persona)) {
        fail(`${branch.id} references unknown persona ${JSON.stringify(persona)}`);
      }
    }
  }

  for (const scenario of scenarios.values()) {
    assertScenarioShape(scenario, hostingBranches, personas);
    for (const channel of scenario.source_channels) {
      if (!allowedChannels.has(channel)) {
        fail(`${scenario.id} references unknown public source channel ${JSON.stringify(channel)}`);
      }
    }
    for (const dependency of scenario.depends_on || []) {
      if (!hostingBranches.has(dependency) && !scenarios.has(dependency)) {
        fail(`${scenario.id} references unknown dependency ${JSON.stringify(dependency)}`);
      }
    }
  }

  assertPrimaryPaths(contract, personas, hostingBranches, scenarios);
}

function assertEmbeddedLaravelInstallContract(contract) {
  const scenarios = byId(contract.scenarios, 'scenarios');
  const laravel = scenarios.get('laravel_user_embedded_completion');

  if (!laravel) {
    fail('scenarios must include laravel_user_embedded_completion');
  }

  const installStart = laravel.command_script_lines.indexOf('composer require \\');
  assertStringArrayEqual(
    laravel.command_script_lines.slice(installStart, installStart + 4),
    [
      'composer require \\',
      `  ${ARTIFACT_PINS.waterlineComposerPackage} \\`,
      `  ${ARTIFACT_PINS.workflowComposerPackage} \\`,
      `  ${ARTIFACT_PINS.phpSdkComposerPackage}`,
    ],
    'laravel_user_embedded_completion Composer install command',
  );
  assertStringArrayEqual(
    laravel.command_script_lines.slice(installStart + 4, installStart + 7),
    [
      'composer show durable-workflow/sdk',
      'composer show durable-workflow/workflow',
      'composer show durable-workflow/waterline',
    ],
    'laravel_user_embedded_completion Composer version commands',
  );

  const probes = byId(laravel.success_probes, 'laravel_user_embedded_completion.success_probes');
  for (const [id, packageName, version] of [
    ['composer_waterline_version', 'durable-workflow/waterline', ARTIFACT_VERSIONS.waterline],
    ['composer_workflow_version', 'durable-workflow/workflow', ARTIFACT_VERSIONS.workflow],
    ['composer_php_sdk_version', 'durable-workflow/sdk', ARTIFACT_VERSIONS['sdk-php']],
  ]) {
    const probe = probes.get(id);

    if (!probe) {
      fail(`laravel_user_embedded_completion.success_probes must include ${id}`);
    }

    assertStringArrayEqual(
      probe.required_substrings,
      [packageName, version],
      `${id}.required_substrings`,
    );
  }
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
  assertEqual(contract.version, 2, 'quickstart execution contract version');
  assertEqual(contract.release_status, '2.0_prerelease', 'quickstart execution contract release_status');
  assertEqual(contract.authority_doc, 'docs/platform-conformance.md', 'quickstart execution contract authority_doc');
  assertEqual(contract.onboarding_doc, 'docs/quickstart.md', 'quickstart execution contract onboarding_doc');

  assertDocsGuard(contract);
  assertPublicArtifactPins(contract);
  assertContractCoverage(contract);
  assertEmbeddedLaravelInstallContract(contract);
  assertQuickstartScriptLinesMatchDocs(contract, renderedQuickstart);

  console.log('Quickstart execution contract checks passed');
}

main();
