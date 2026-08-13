#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  ARTIFACT_PINS,
  ARTIFACT_VERSIONS,
  PUBLISHED_ARTIFACT_VERSIONS,
  QUALIFIED_ARTIFACT_DEPLOYMENT_PATHS,
  QUALIFIED_ARTIFACT_MATRIX,
  QUALIFIED_ARTIFACT_TUPLE_AUTHORITY,
  replaceArtifactTokens,
} = require('./public-artifact-versions');

const repoRoot = path.join(__dirname, '..');
const contractPath = path.join(repoRoot, 'static', 'quickstart-execution-contract.json');
const quickstartPath = path.join(repoRoot, 'docs', 'quickstart.md');
const serverGuidePath = path.join(repoRoot, 'docs', 'polyglot', 'server.md');
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

function assertPhpFiberWorkflowContract(source, label) {
  const generatorReturnType = /(?<![A-Za-z0-9_])Generator\b/;
  const yieldedContextOperation = /\byield(?:\s+from)?\s+\$[A-Za-z_][A-Za-z0-9_]*->/;

  if (generatorReturnType.test(source)) {
    fail(`${label} must use ordinary Fiber workflow return values`);
  }
  if (yieldedContextOperation.test(source)) {
    fail(`${label} must call WorkflowContext operations directly`);
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
  assertEqual(artifacts.server && artifacts.server.package_url, ARTIFACT_PINS.serverPackageUrl, 'server package URL');
  assertEqual(artifacts.server && artifacts.server.reference, ARTIFACT_PINS.serverDockerHubImage, 'server image reference');
  assertEqual(artifacts.cli && artifacts.cli.version, ARTIFACT_VERSIONS.cli, 'CLI artifact version');
  assertEqual(artifacts.cli && artifacts.cli.package_url, ARTIFACT_PINS.cliPackageUrl, 'CLI package URL');
  assertEqual(artifacts.cli && artifacts.cli.install_command, ARTIFACT_PINS.cliInstallerCommand, 'CLI install command');
  assertEqual(artifacts['sdk-php'] && artifacts['sdk-php'].version, ARTIFACT_VERSIONS['sdk-php'], 'PHP SDK artifact version');
  assertEqual(artifacts['sdk-php'] && artifacts['sdk-php'].package_url, ARTIFACT_PINS.phpSdkPackageUrl, 'PHP SDK package URL');
  assertEqual(artifacts['sdk-php'] && artifacts['sdk-php'].composer_package, ARTIFACT_PINS.phpSdkComposerPackage, 'PHP SDK Composer package pin');
  assertEqual(artifacts['sdk-php'] && artifacts['sdk-php'].install_command, ARTIFACT_PINS.phpSdkComposerInstallCommand, 'PHP SDK install command');
  assertEqual(artifacts['sdk-python'] && artifacts['sdk-python'].version, ARTIFACT_VERSIONS['sdk-python'], 'Python SDK artifact version');
  assertEqual(artifacts['sdk-python'] && artifacts['sdk-python'].package_url, ARTIFACT_PINS.pythonQualifiedPackageUrl, 'Python SDK package URL');
  assertEqual(artifacts['sdk-python'] && artifacts['sdk-python'].pip_package, ARTIFACT_PINS.pythonPackagePin, 'Python SDK package pin');
  assertEqual(artifacts['sdk-python'] && artifacts['sdk-python'].install_command, ARTIFACT_PINS.pythonPipInstallCommand, 'Python SDK install command');
  assertEqual(artifacts['sdk-rust'] && artifacts['sdk-rust'].version, ARTIFACT_VERSIONS['sdk-rust'], 'Rust SDK artifact version');
  assertEqual(artifacts['sdk-rust'] && artifacts['sdk-rust'].package_url, ARTIFACT_PINS.rustPackageUrl, 'Rust SDK package URL');
  assertEqual(artifacts['sdk-rust'] && artifacts['sdk-rust'].crate, ARTIFACT_PINS.rustCrate, 'Rust SDK crate name');
  assertEqual(artifacts['sdk-rust'] && artifacts['sdk-rust'].install_command, ARTIFACT_PINS.rustCargoAddCommand, 'Rust SDK install command');
  assertEqual(artifacts.workflow && artifacts.workflow.version, ARTIFACT_VERSIONS.workflow, 'Workflow artifact version');
  assertEqual(artifacts.workflow && artifacts.workflow.package_url, ARTIFACT_PINS.workflowPackageUrl, 'Workflow package URL');
  assertEqual(artifacts.workflow && artifacts.workflow.composer_constraint, ARTIFACT_PINS.workflowComposerPackage, 'Workflow Composer constraint');
  assertEqual(artifacts.waterline && artifacts.waterline.version, ARTIFACT_VERSIONS.waterline, 'Waterline artifact version');
  assertEqual(artifacts.waterline && artifacts.waterline.package_url, ARTIFACT_PINS.waterlinePackageUrl, 'Waterline package URL');
  assertEqual(artifacts.waterline && artifacts.waterline.composer_constraint, ARTIFACT_PINS.waterlineComposerPackage, 'Waterline Composer constraint');
}

function assertQualifiedTupleAuthority(contract) {
  const authority = QUALIFIED_ARTIFACT_TUPLE_AUTHORITY;
  assertDeepEqual(
    contract.qualified_tuple,
    {
      meaning: authority.meaning,
      qualified_on: authority.qualifiedOn,
      authority: {
        schema: authority.schema,
        schema_version: authority.schemaVersion,
        url: authority.authorityUrl,
      },
      release_handoff: {
        release_plan_tag: authority.releasePlan.tag,
        release_plan_url: authority.releasePlan.source_url,
        release_plan_sha256: authority.releasePlan.sha256,
        conformance_evidence_tag: authority.conformanceEvidence.tag,
        conformance_evidence_url: authority.conformanceEvidence.source_url,
        conformance_evidence_sha256: authority.conformanceEvidence.sha256,
      },
    },
    'quickstart qualified tuple authority',
  );
}

function assertQualifiedTupleRenderedSurface(contract, renderedQuickstart) {
  if (!renderedQuickstart.includes(contract.qualified_tuple.qualified_on)) {
    fail('rendered quickstart must expose the qualification date from its authority');
  }
  if (!renderedQuickstart.includes('<QualifiedArtifactTuple />')) {
    fail('quickstart must render the machine-owned qualified artifact tuple');
  }

  assertEqual(
    QUALIFIED_ARTIFACT_MATRIX.length,
    Object.keys(ARTIFACT_VERSIONS).length,
    'qualified artifact matrix size',
  );
  for (const row of QUALIFIED_ARTIFACT_MATRIX) {
    if (row.packageUrl !== contract.artifacts[row.artifact]?.package_url) {
      fail(`qualified ${row.artifact} component package URL must match its contract`);
    }
    if (!row.identity.includes(ARTIFACT_VERSIONS[row.artifact])) {
      fail(`qualified ${row.artifact} component identity must include its exact version`);
    }
  }
}

function assertQualifiedTupleDeploymentRoles(contract) {
  const deploymentPaths = QUALIFIED_ARTIFACT_DEPLOYMENT_PATHS.map(path => ({
    ...path,
    required_artifacts: [...path.required_artifacts],
    choose_one_artifacts: [...path.choose_one_artifacts],
    optional_artifacts: [...path.optional_artifacts],
    provisioned_components: [...path.provisioned_components],
    separately_deployed_components: [...path.separately_deployed_components],
  }));
  assertDeepEqual(
    contract.deployment_paths,
    deploymentPaths,
    'quickstart deployment path selections',
  );

  const artifactRoles = Object.fromEntries(
    QUALIFIED_ARTIFACT_MATRIX.map(row => [
      row.artifact,
      {
        role: row.role,
        applicability: {...row.applicability},
      },
    ]),
  );
  assertDeepEqual(
    contract.artifact_deployment_roles,
    artifactRoles,
    'quickstart artifact deployment roles',
  );

  const paths = byId(contract.deployment_paths, 'deployment_paths');
  const cloud = paths.get('cloud_service');
  const selfHosted = paths.get('self_hosted_service');
  const embedded = paths.get('embedded_laravel');
  const serviceSdks = ['sdk-php', 'sdk-python', 'sdk-rust'];

  assertStringArrayEqual(
    cloud.choose_one_artifacts,
    serviceSdks,
    'cloud_service.choose_one_artifacts',
  );
  assertStringArrayEqual(
    selfHosted.choose_one_artifacts,
    serviceSdks,
    'self_hosted_service.choose_one_artifacts',
  );
  assertStringArrayEqual(
    embedded.required_artifacts,
    ['workflow'],
    'embedded_laravel.required_artifacts',
  );
  assertStringArrayEqual(
    embedded.optional_artifacts,
    ['waterline'],
    'embedded_laravel.optional_artifacts',
  );
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
    laravel.command_script_lines.slice(installStart, installStart + 3),
    [
      'composer require \\',
      `  ${ARTIFACT_PINS.workflowComposerPackage} \\`,
      `  ${ARTIFACT_PINS.waterlineComposerPackage}`,
    ],
    'laravel_user_embedded_completion Composer install command',
  );
  assertStringArrayEqual(
    laravel.command_script_lines.slice(installStart + 3, installStart + 5),
    [
      'composer show durable-workflow/workflow',
      'composer show durable-workflow/waterline',
    ],
    'laravel_user_embedded_completion Composer version commands',
  );

  const probes = byId(laravel.success_probes, 'laravel_user_embedded_completion.success_probes');
  for (const [id, packageName, version] of [
    ['composer_waterline_version', 'durable-workflow/waterline', ARTIFACT_VERSIONS.waterline],
    ['composer_workflow_version', 'durable-workflow/workflow', ARTIFACT_VERSIONS.workflow],
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

function assertRustInstallContract(contract) {
  const scenarios = byId(contract.scenarios, 'scenarios');
  const rust = scenarios.get('rust_user_local_server_completion');

  if (!rust) {
    fail('scenarios must include rust_user_local_server_completion');
  }

  if (!rust.command_script_lines.includes(ARTIFACT_PINS.rustCargoAddCommand)) {
    fail('rust_user_local_server_completion must contain the supported exact Cargo command');
  }

  const probes = byId(rust.success_probes, 'rust_user_local_server_completion.success_probes');
  const avroProbe = probes.get('rust_official_avro_package');

  if (!avroProbe) {
    fail('rust_user_local_server_completion.success_probes must include rust_official_avro_package');
  }

  assertEqual(
    avroProbe.command,
    'cargo tree -i apache-avro',
    'rust_official_avro_package.command',
  );
  assertEqual(avroProbe.expect_exit_code, 0, 'rust_official_avro_package.expect_exit_code');
}

function assertPythonInstallContract(contract) {
  const pythonArtifact = contract.artifacts && contract.artifacts['sdk-python'];
  const avroPackage =
    pythonArtifact &&
    pythonArtifact.runtime_dependencies &&
    pythonArtifact.runtime_dependencies.apache_avro_payload_codec;

  if (typeof avroPackage !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(avroPackage)) {
    fail('sdk-python must declare its Apache Avro payload-codec runtime dependency package');
  }

  const scenarios = byId(contract.scenarios, 'scenarios');
  const python = scenarios.get('python_user_local_server_completion');

  if (!python) {
    fail('scenarios must include python_user_local_server_completion');
  }

  const probes = byId(python.success_probes, 'python_user_local_server_completion.success_probes');
  const avroProbe = probes.get('python_official_avro_package');

  if (!avroProbe) {
    fail('python_user_local_server_completion.success_probes must include python_official_avro_package');
  }

  assertEqual(
    avroProbe.command,
    `pip show ${avroPackage}`,
    'python_official_avro_package.command',
  );
  assertEqual(avroProbe.expect_exit_code, 0, 'python_official_avro_package.expect_exit_code');
}

function assertLocalServerConnectionContract(contract) {
  const hostingBranches = byId(contract.hosting_branches, 'hosting_branches');
  const standalone = hostingBranches.get('standalone_server_sqlite');
  const connection = standalone && standalone.local_connection;

  if (!connection) {
    fail('standalone_server_sqlite must declare local_connection');
  }

  assertEqual(connection.base_url, 'http://localhost:8080', 'local Server base URL');
  assertEqual(connection.token_environment, 'DW_AUTH_TOKEN', 'local Server token environment');
  assertEqual(connection.namespace, 'default', 'local Server namespace');

  const tokenEnvironment = (standalone.required_environment || [])
    .find(entry => entry.name === connection.token_environment);
  if (!tokenEnvironment) {
    fail('standalone_server_sqlite must declare its local connection token environment');
  }
  assertEqual(connection.token, tokenEnvironment.value, 'local Server token');
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

function assertSdkOnboarding(contract) {
  const php = contract.sdk_onboarding && contract.sdk_onboarding['sdk-php'];
  if (!php) {
    fail('quickstart contract must point agents to the tested PHP SDK onboarding path');
  }
  assertStringArrayEqual(
    php.deployment_paths,
    ['cloud_service', 'self_hosted_service'],
    'PHP SDK onboarding deployment paths',
  );
  assertEqual(php.guide_url, 'https://php.durable-workflow.com/', 'PHP SDK onboarding guide URL');
  assertEqual(
    php.executable_contract_url,
    'https://php.durable-workflow.com/quickstart-contract.json',
    'PHP SDK executable contract URL',
  );
  assertEqual(
    php.source_root_url,
    'https://github.com/durable-workflow/sdk-php/tree/main/examples',
    'PHP SDK quickstart source URL',
  );
  assertEqual(
    php.published_smoke_url,
    'https://github.com/durable-workflow/sdk-php/actions/workflows/service-mode-published-smoke.yml',
    'PHP SDK published smoke URL',
  );

  const rust = contract.sdk_onboarding && contract.sdk_onboarding['sdk-rust'];
  if (!rust) {
    fail('quickstart contract must point agents to the Rust Cloud onboarding path');
  }
  assertStringArrayEqual(
    rust.deployment_paths,
    ['cloud_service', 'self_hosted_service'],
    'Rust SDK onboarding deployment paths',
  );
  assertEqual(
    rust.cloud_quickstart_url,
    'https://durable-workflow.com/docs/2.0/polyglot/rust-cloud-quickstart/',
    'Rust Cloud quickstart URL',
  );
  assertEqual(
    rust.api_reference_url,
    'https://rust.durable-workflow.com/',
    'Rust API reference URL',
  );
}

function assertRustCloudContract(contract) {
  const hostingBranches = byId(contract.hosting_branches, 'hosting_branches');
  const cloud = hostingBranches.get('cloud_managed_namespace');
  if (!cloud) {
    fail('hosting_branches must include cloud_managed_namespace');
  }
  assertEqual(
    cloud.runtime_url_contract?.terminal_api_suffix_allowed,
    false,
    'Cloud namespace runtime terminal /api policy',
  );

  const scenarios = byId(contract.scenarios, 'scenarios');
  const rustCloud = scenarios.get('rust_user_cloud_completion');
  if (!rustCloud) {
    fail('scenarios must include rust_user_cloud_completion');
  }
  assertEqual(
    rustCloud.hosting_branch,
    'cloud_managed_namespace',
    'Rust Cloud hosting branch',
  );
  assertEqual(rustCloud.task_queue, 'rust-cloud-quickstart', 'Rust Cloud task queue');
  assertEqual(
    rustCloud.workflow_type,
    'sample.rust-cloud.greeter',
    'Rust Cloud workflow type',
  );
  assertEqual(
    rustCloud.activity_type,
    'sample.rust-cloud.greet',
    'Rust Cloud activity type',
  );
  assertEqual(
    rustCloud.required_control_plane_header?.name,
    'X-Durable-Workflow-Control-Plane-Version',
    'Rust Cloud control-plane header',
  );
  assertEqual(
    rustCloud.required_control_plane_header?.value,
    '2',
    'Rust Cloud control-plane header value',
  );
  assertEqual(
    rustCloud.required_control_plane_header?.injected_by_cli,
    true,
    'Rust Cloud CLI header ownership',
  );
  assertEqual(
    rustCloud.runtime_url?.terminal_api_suffix_allowed,
    false,
    'Rust Cloud runtime URL terminal /api policy',
  );
  assertEqual(
    rustCloud.credential_roles?.client?.environment,
    'DURABLE_WORKFLOW_CLIENT_TOKEN',
    'Rust Cloud client credential environment',
  );
  assertEqual(
    rustCloud.credential_roles?.worker?.environment,
    'DURABLE_WORKFLOW_WORKER_TOKEN',
    'Rust Cloud worker credential environment',
  );
  assertEqual(
    rustCloud.exact_artifact_versions?.['sdk-rust'],
    PUBLISHED_ARTIFACT_VERSIONS['sdk-rust'],
    'Rust Cloud SDK version',
  );
  assertEqual(
    rustCloud.exact_artifact_versions?.cli,
    PUBLISHED_ARTIFACT_VERSIONS.cli,
    'Rust Cloud CLI version',
  );
  const commandScript = JSON.stringify(rustCloud.command_script_lines || []);
  if (commandScript.includes('server:info') || commandScript.includes('worker:list')) {
    fail('Rust Cloud first-run commands must not require Server discovery or worker listing');
  }

  const probes = byId(
    rustCloud.success_probes,
    'rust_user_cloud_completion.success_probes',
  );
  for (const id of [
    'rust_cloud_sdk_version',
    'rust_cloud_cli_version',
    'rust_cloud_completion',
    'rust_cloud_clean_shutdown',
    'rust_cloud_managed_visibility',
  ]) {
    if (!probes.has(id)) {
      fail(`rust_user_cloud_completion.success_probes must include ${id}`);
    }
  }
}

function main() {
  const contract = loadJson(contractPath, 'static/quickstart-execution-contract.json');
  const quickstart = read(quickstartPath);
  const serverGuide = read(serverGuidePath);
  const renderedQuickstart = replaceArtifactTokens(quickstart, 'docs/quickstart.md');

  assertPhpFiberWorkflowContract(quickstart, 'docs/quickstart.md PHP service-mode example');
  assertPhpFiberWorkflowContract(serverGuide, 'docs/polyglot/server.md PHP service-mode example');
  assertPhpFiberWorkflowContract(
    JSON.stringify(contract),
    'static/quickstart-execution-contract.json PHP service-mode commands',
  );

  assertEqual(contract.schema, EXPECTED_SCHEMA, 'quickstart execution contract schema');
  assertEqual(contract.version, 5, 'quickstart execution contract version');
  assertEqual(contract.release_status, '2.0_prerelease', 'quickstart execution contract release_status');
  assertEqual(contract.authority_doc, 'docs/platform-conformance.md', 'quickstart execution contract authority_doc');
  assertEqual(contract.onboarding_doc, 'docs/quickstart.md', 'quickstart execution contract onboarding_doc');

  assertDocsGuard(contract);
  assertSdkOnboarding(contract);
  assertRustCloudContract(contract);
  assertQualifiedTupleAuthority(contract);
  assertPublicArtifactPins(contract);
  assertQualifiedTupleRenderedSurface(contract, renderedQuickstart);
  assertQualifiedTupleDeploymentRoles(contract);
  assertContractCoverage(contract);
  assertPythonInstallContract(contract);
  assertRustInstallContract(contract);
  assertEmbeddedLaravelInstallContract(contract);
  assertLocalServerConnectionContract(contract);
  assertQuickstartScriptLinesMatchDocs(contract, renderedQuickstart);

  console.log('Quickstart execution contract checks passed');
}

main();
