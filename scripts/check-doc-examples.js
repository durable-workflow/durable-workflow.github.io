const fs = require('fs');
const path = require('path');
const {
  ARTIFACT_DISTRIBUTION_SURFACES,
  replaceArtifactTokens,
} = require('./public-artifact-versions');

const docsDir = path.join(__dirname, '..', 'docs');
const contractPath = path.join(__dirname, 'doc-examples-contract.json');
const quickstartContractPath = path.join(
  __dirname,
  '..',
  'static',
  'quickstart-execution-contract.json',
);

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function markerPattern(id) {
  return new RegExp(`<!--\\s*docs-example\\s+id=["']${escapeRegExp(id)}["']\\s*-->\\s*\\n\\s*\`\`\`([A-Za-z0-9_-]+)?\\n([\\s\\S]*?)\\n\\s*\`\`\``, 'm');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertIncludes(content, expected, context) {
  if (!content.includes(expected)) {
    throw new Error(`${context} must include ${JSON.stringify(expected)}`);
  }
}

function assertPrimaryArtifactInstall(block, artifactId, quickstartContract, context) {
  const installCommand = quickstartContract.artifacts?.[artifactId]?.install_command;
  if (typeof installCommand !== 'string' || installCommand === '') {
    throw new Error(`${context} references an artifact without an install command: ${artifactId}`);
  }

  const renderedBlock = replaceArtifactTokens(block, context);
  const firstCommand = renderedBlock
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line !== '' && !line.startsWith('#'));

  if (firstCommand !== installCommand) {
    throw new Error(
      `${context} must begin with the ${artifactId} install command from the quickstart contract; ` +
        `expected ${JSON.stringify(installCommand)}, got ${JSON.stringify(firstCommand)}`,
    );
  }
}

function normalizedShellCommands(block) {
  return block
    .replace(/[ \t]*\\\r?\n[ \t]*/g, ' ')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'));
}

function assertShellEnvironmentName(value, context) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(value || '')) {
    throw new Error(`${context} must declare shell environment variable names`);
  }
}

function assertReleasedRepositorySetup(block, requirement, quickstartContract, context) {
  const artifact = quickstartContract.artifacts?.[requirement.artifact];
  if (!artifact?.version) {
    throw new Error(
      `${context} references an artifact without a released version: ${requirement.artifact}`,
    );
  }

  assertShellEnvironmentName(requirement.versionEnvironment, context);
  assertShellEnvironmentName(requirement.directoryEnvironment, context);

  const repositorySurface = (ARTIFACT_DISTRIBUTION_SURFACES[requirement.artifact] || [])
    .find(surface => surface.surface === 'source_repository');
  const allowedRepositoryUrls = repositorySurface?.url
    ? [repositorySurface.url, `${repositorySurface.url}.git`]
    : [];
  if (!allowedRepositoryUrls.includes(requirement.repositoryUrl)) {
    throw new Error(
      `${context} must clone the source repository published for ${requirement.artifact}`,
    );
  }

  const commands = normalizedShellCommands(replaceArtifactTokens(block, context));
  const versionVariable = requirement.versionEnvironment;
  const directoryVariable = requirement.directoryEnvironment;
  const expectedCommands = [
    `export ${versionVariable}=${artifact.version}`,
    `export ${directoryVariable}="${requirement.directoryTemplate}"`,
    `git clone --depth 1 --single-branch --branch "$${versionVariable}" ` +
      `${requirement.repositoryUrl} "$${directoryVariable}"`,
  ];

  for (const command of expectedCommands) {
    if (!commands.includes(command)) {
      throw new Error(
        `${context} must obtain the exact ${requirement.artifact} release with ${JSON.stringify(command)}`,
      );
    }
  }
}

function assertRepositoryExampleInvocation(
  block,
  requirement,
  currentExample,
  examplesById,
  context,
) {
  const setup = examplesById.get(requirement.setupExample);
  if (!setup?.releasedRepositorySetup) {
    throw new Error(
      `${context} references a missing released repository setup: ${requirement.setupExample}`,
    );
  }

  const setupRequirement = setup.releasedRepositorySetup;
  if (setup.path !== currentExample.path) {
    throw new Error(`${context} must keep its released repository setup in the same guide`);
  }
  if (requirement.workingDirectoryEnvironment !== setupRequirement.directoryEnvironment) {
    throw new Error(`${context} must enter the directory produced by ${requirement.setupExample}`);
  }

  assertShellEnvironmentName(requirement.workingDirectoryEnvironment, context);
  const commands = normalizedShellCommands(block);
  const expectedDirectoryCommand = `cd "$${requirement.workingDirectoryEnvironment}"`;
  if (commands[0] !== expectedDirectoryCommand) {
    throw new Error(
      `${context} must begin by entering its released source directory with ` +
        `${JSON.stringify(expectedDirectoryCommand)}`,
    );
  }
  if (!commands.slice(1).some(command => command.includes(requirement.command))) {
    throw new Error(
      `${context} must run ${JSON.stringify(requirement.command)} from the released source directory`,
    );
  }
}

function quoted(value) {
  return `["']${escapeRegExp(value)}["']`;
}

function shellValue(value) {
  const escaped = escapeRegExp(value);
  return `(?:${escaped}|["']${escaped}["'])`;
}

function localConnectionPattern(shape, connection, context) {
  const baseUrl = quoted(connection.base_url);
  const token = quoted(connection.token);
  const namespace = quoted(connection.namespace);

  switch (shape) {
    case 'php_token_authentication':
      return new RegExp(
        `new\\s+Client\\(\\s*${baseUrl}\\s*,\\s*` +
          `new\\s+TokenAuthentication\\(\\s*${token}\\s*\\)\\s*,\\s*` +
          `namespace:\\s*${namespace}\\s*,?\\s*\\)`,
        's',
      );
    case 'php_named_token':
      return new RegExp(
        `new\\s+Client\\(\\s*${baseUrl}\\s*,\\s*token:\\s*${token}\\s*,\\s*` +
          `namespace:\\s*${namespace}\\s*,?\\s*\\)`,
        's',
      );
    case 'python_client':
      return new RegExp(
        `Client\\(\\s*${baseUrl}\\s*,\\s*token\\s*=\\s*${token}\\s*,\\s*` +
          `namespace\\s*=\\s*${namespace}\\s*,?\\s*\\)`,
        's',
      );
    case 'rust_hello_world_environment': {
      if (connection.namespace !== 'default') {
        throw new Error(
          `${context} relies on the Rust hello_world example's default namespace; ` +
            `the hosting branch declares ${JSON.stringify(connection.namespace)}`,
        );
      }

      const serverUrl = shellValue(connection.base_url);
      const selfHostedToken = shellValue(connection.token);
      return new RegExp(
        `DURABLE_WORKFLOW_SERVER_URL=${serverUrl}\\s*\\\\\\s*\\n` +
          `\\s*DURABLE_WORKFLOW_TOKEN=${selfHostedToken}\\s*\\\\\\s*\\n` +
          `\\s*cargo\\s+run\\s+--example\\s+hello_world(?:\\s|$)`,
      );
    }
    default:
      throw new Error(`${context} uses unknown local connection shape ${JSON.stringify(shape)}`);
  }
}

function assertLocalConnection(block, requirement, quickstartContract, context) {
  const branch = (quickstartContract.hosting_branches || [])
    .find(candidate => candidate.id === requirement.hostingBranch);
  const connection = branch?.local_connection;

  if (!connection) {
    throw new Error(
      `${context} references a hosting branch without local_connection: ` +
        `${requirement.hostingBranch}`,
    );
  }

  if (!localConnectionPattern(requirement.shape, connection, context).test(block)) {
    throw new Error(
      `${context} must use ${connection.base_url}, token ${connection.token}, and namespace ` +
        `${connection.namespace} from hosting branch ${requirement.hostingBranch}`,
    );
  }

  if (
    requirement.shape === 'rust_hello_world_environment' &&
    /DURABLE_WORKFLOW_(?:CLIENT|WORKER)_TOKEN/.test(block)
  ) {
    throw new Error(`${context} must not reuse Cloud split credentials for self-hosted Server`);
  }
}

function parseJsonBlock(block, context) {
  try {
    return JSON.parse(block);
  } catch (error) {
    throw new Error(`${context} must contain valid JSON: ${error.message}`);
  }
}

function parseEmbeddedJson(block, token, context) {
  const pattern = new RegExp(`${escapeRegExp(token)}\\s+'([\\s\\S]*?)'`);
  const match = block.match(pattern);

  if (!match) {
    throw new Error(`${context} must include a single-quoted JSON payload after ${JSON.stringify(token)}`);
  }

  return parseJsonBlock(match[1], context);
}

function assertJsonKeys(payload, keys, context) {
  for (const key of keys || []) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      throw new Error(`${context} JSON must include key ${JSON.stringify(key)}`);
    }
  }
}

function checkExample(example, quickstartContract, examplesById) {
  const docPath = path.join(docsDir, example.path);
  const context = `docs/${example.path}#${example.id}`;

  if (!fs.existsSync(docPath)) {
    throw new Error(`${context} references a missing document`);
  }

  const content = read(docPath);
  const match = content.match(markerPattern(example.id));

  if (!match) {
    throw new Error(`${context} is missing a docs-example marker followed by a fenced block`);
  }

  const language = match[1] || '';
  const block = match[2];

  if (language !== example.language) {
    throw new Error(`${context} must be a ${example.language} fenced block; found ${language || 'untyped'}`);
  }

  for (const expected of example.requiredSubstrings || []) {
    assertIncludes(block, expected, context);
  }

  if (example.primaryArtifactInstall) {
    assertPrimaryArtifactInstall(
      block,
      example.primaryArtifactInstall,
      quickstartContract,
      context,
    );
  }

  if (example.releasedRepositorySetup) {
    assertReleasedRepositorySetup(
      block,
      example.releasedRepositorySetup,
      quickstartContract,
      context,
    );
  }

  if (example.repositoryExampleInvocation) {
    assertRepositoryExampleInvocation(
      block,
      example.repositoryExampleInvocation,
      example,
      examplesById,
      context,
    );
  }

  if (example.localConnection) {
    assertLocalConnection(block, example.localConnection, quickstartContract, context);
  }

  if (example.language === 'json') {
    assertJsonKeys(parseJsonBlock(block, context), example.requiredJsonKeys, context);
  }

  if (example.embeddedJsonAfter) {
    assertJsonKeys(
      parseEmbeddedJson(block, example.embeddedJsonAfter, context),
      example.requiredJsonKeys,
      context
    );
  }
}

function main() {
  const contract = JSON.parse(read(contractPath));
  const quickstartContract = JSON.parse(read(quickstartContractPath));
  const examplesById = new Map(
    (contract.examples || []).map(example => [example.id, example]),
  );

  for (const example of contract.examples || []) {
    checkExample(example, quickstartContract, examplesById);
  }

  console.log(`Doc example checks passed for ${contract.examples.length} examples`);
}

main();
