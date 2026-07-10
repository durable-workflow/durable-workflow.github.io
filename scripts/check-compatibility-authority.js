#!/usr/bin/env node
//
// Release-check gate for the canonical compatibility & release-authority
// contract.
//
// `static/compatibility-contract.json` is the machine-readable mirror of the
// platform-wide stability contract that `Workflow\V2\Support\SurfaceStabilityContract`
// emits and the standalone server re-exports under
// `surface_stability_contract` in `GET /api/cluster/info`. The contract is
// the single source of truth: this script fails the docs build when the
// documentation drifts away from it.
//
// Specifically the script verifies that:
//
// 1. `docs/compatibility.md` advertises itself as the canonical authority
//    and lists every surface family from the contract with the same
//    stability level.
// 2. The schema and version named in the doc page match the contract.
// 3. `docs/compatibility.md` documents the same set of stability levels
//    (`frozen`, `stable`, `prerelease`, `experimental`).
// 4. Composer install snippets do not introduce stability claims that
//    contradict the pre-stable 2.0 artifact tuple or the PHP workflow package.
// 5. The version-history table on `docs/compatibility.md` does not
//    introduce stability levels that the contract has never heard of.
// 6. Rust crate metadata (from the sibling checkout when available), the
//    frozen package contract, Rust guide, compatibility matrix, and public
//    worker OpenAPI all describe the same fail-closed negotiation window.
//
// Drift here means a release shipped a doc change without updating the
// machine-readable contract (or vice versa). Either fix the doc or bump
// the contract; do not silence the check.

const fs = require('fs');
const path = require('path');

const {
  ARTIFACT_PINS,
  ARTIFACT_VERSIONS,
  replaceArtifactTokens,
} = require('./public-artifact-versions');

const repoRoot = path.join(__dirname, '..');
const contractPath = path.join(repoRoot, 'static', 'compatibility-contract.json');
const compatibilityDocPath = path.join(repoRoot, 'docs', 'compatibility.md');
const installationDocPath = path.join(repoRoot, 'docs', 'installation.md');
const rustGuidePath = path.join(repoRoot, 'docs', 'polyglot', 'rust.md');
const workerProtocolGuidePath = path.join(
  repoRoot,
  'docs',
  'polyglot',
  'worker-protocol.md',
);
const workerOpenApiPath = path.join(
  repoRoot,
  'static',
  'platform-protocol-specs',
  'worker-protocol-api.openapi.yaml',
);
const workerAsyncApiPath = path.join(
  repoRoot,
  'static',
  'platform-protocol-specs',
  'worker-protocol-stream.asyncapi.yaml',
);
const protocolSpecsWorkflowPath = path.join(
  repoRoot,
  '.github',
  'workflows',
  'protocol-specs.yml',
);
const composerInstallDocSurfaces = [
  {
    path: installationDocPath,
    requiredPins: ['workflowComposerPackage'],
    requiresStableCutoverGuidance: true,
  },
  {
    path: path.join(repoRoot, 'docs', 'migration.md'),
    requiredPins: ['workflowComposerPackage'],
  },
  {
    path: path.join(repoRoot, 'docs', 'polyglot', 'server.md'),
    requiredPins: ['workflowComposerPackage'],
  },
  {
    path: path.join(repoRoot, 'docs', 'waterline-operator-api.md'),
    requiredPins: ['workflowComposerPackage', 'waterlineComposerPackage'],
  },
];
const composerPreStableVersionPattern = /^2\.0\.0-(alpha|beta)\.\d+$/;

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function relativePath(file) {
  return path.relative(repoRoot, file).split(path.sep).join('/');
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function assertIncludes(content, expected, label) {
  if (!content.includes(expected)) {
    throw new Error(`${label} must include ${JSON.stringify(expected)}`);
  }
}

function assertNormalizedIncludes(content, expected, label) {
  if (!normalizeWhitespace(content).includes(normalizeWhitespace(expected))) {
    throw new Error(`${label} must include ${JSON.stringify(normalizeWhitespace(expected))}`);
  }
}

function tomlSection(content, name, label) {
  const header = `[${name}]`;
  const start = content.indexOf(header);
  if (start === -1) {
    throw new Error(`${label} is missing TOML section ${header}`);
  }

  const bodyStart = start + header.length;
  const remainder = content.slice(bodyStart);
  const nextSection = remainder.search(/^\s*\[/m);

  return nextSection === -1 ? remainder : remainder.slice(0, nextSection);
}

function tomlString(section, key, label) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = section.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*"([^"]+)"\\s*$`, 'm'));
  if (!match) {
    throw new Error(`${label} is missing string field ${key}`);
  }

  return match[1];
}

function rustCargoTomlPath() {
  if (process.env.SDK_RUST_REPO_PATH) {
    const configured = path.join(process.env.SDK_RUST_REPO_PATH, 'Cargo.toml');
    if (!fs.existsSync(configured)) {
      throw new Error(
        `SDK_RUST_REPO_PATH was set, but Rust package metadata is missing at ${configured}`,
      );
    }
    return configured;
  }

  const sibling = path.join(repoRoot, '..', 'sdk-rust', 'Cargo.toml');
  return fs.existsSync(sibling) ? sibling : null;
}

function loadRustCargoMetadataWhenAvailable() {
  const cargoTomlPath = rustCargoTomlPath();
  if (cargoTomlPath === null) {
    return null;
  }

  const cargoToml = read(cargoTomlPath);
  const label = relativePath(cargoTomlPath);
  const packageSection = tomlSection(cargoToml, 'package', label);
  const metadataSection = tomlSection(
    cargoToml,
    'package.metadata.durable-workflow',
    label,
  );

  return {
    source: label,
    package: tomlString(packageSection, 'name', label),
    version: tomlString(packageSection, 'version', label),
    supported_server_versions: tomlString(
      metadataSection,
      'supported-server-versions',
      label,
    ),
    worker_protocol_version: tomlString(
      metadataSection,
      'worker-protocol-version',
      label,
    ),
    control_plane_version: tomlString(
      metadataSection,
      'control-plane-version',
      label,
    ),
  };
}

function expectedAcceptedWorkerVersions(advertisedVersion) {
  const match = /^(\d+)\.(\d+)$/.exec(advertisedVersion);
  if (!match) {
    throw new Error(
      `worker_protocol.negotiation.default_advertised_version must use MAJOR.MINOR format ` +
        `(got ${JSON.stringify(advertisedVersion)})`,
    );
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  return Array.from({length: minor + 1}, (_, candidateMinor) => `${major}.${candidateMinor}`);
}

function yamlComponentSchema(document, schemaName, label) {
  const schemasMarker = '\n  schemas:\n';
  const schemasStart = document.indexOf(schemasMarker);
  if (schemasStart === -1) {
    throw new Error(`${label} is missing components.schemas`);
  }

  const schemas = document.slice(schemasStart + schemasMarker.length);
  const escapedName = schemaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const schemaMatch = new RegExp(`^    ${escapedName}:\\s*$`, 'm').exec(schemas);
  if (!schemaMatch) {
    throw new Error(`${label} is missing components.schemas.${schemaName}`);
  }

  const schemaBodyStart = schemaMatch.index + schemaMatch[0].length;
  const remainder = schemas.slice(schemaBodyStart);
  const nextSchema = /^    [A-Za-z0-9_]+:\s*$/m.exec(remainder);

  return nextSchema ? remainder.slice(0, nextSchema.index) : remainder;
}

function inlineYamlStringArray(section, key, label) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^      ${escapedKey}:\\s*(\\[[^\\n]+\\])\\s*$`, 'm').exec(section);
  if (!match) {
    throw new Error(`${label} must define ${key} as an inline JSON-compatible string array`);
  }

  let value;
  try {
    value = JSON.parse(match[1]);
  } catch (err) {
    throw new Error(`${label}.${key} is not a valid string array: ${err.message}`);
  }

  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${label}.${key} must contain only strings`);
  }

  return value;
}

function assertOpenApiAcceptedWorkerProtocolVersions(workerOpenApi, expectedVersions) {
  const schemaLabel =
    'worker-protocol-api.openapi.yaml components.schemas.AcceptedWorkerProtocolRequestVersion';
  const requestVersionSchema = yamlComponentSchema(
    workerOpenApi,
    'AcceptedWorkerProtocolRequestVersion',
    'worker-protocol-api.openapi.yaml',
  );
  const actualVersions = inlineYamlStringArray(requestVersionSchema, 'enum', schemaLabel);

  if (JSON.stringify(actualVersions) !== JSON.stringify(expectedVersions)) {
    throw new Error(
      `${schemaLabel}.enum must exactly match the computed negotiation window: ` +
        `expected ${JSON.stringify(expectedVersions)}, got ${JSON.stringify(actualVersions)}`,
    );
  }
}

function serverReleaseLineFromRange(serverRange) {
  const match = /^>=(\d+)\.(\d+),<(\d+)\.(\d+)$/.exec(serverRange);
  if (!match) {
    throw new Error(
      `Rust supported_server_versions must use >=MAJOR.MINOR,<MAJOR.NEXT_MINOR ` +
        `format (got ${JSON.stringify(serverRange)})`,
    );
  }

  const lowerMajor = Number(match[1]);
  const lowerMinor = Number(match[2]);
  const upperMajor = Number(match[3]);
  const upperMinor = Number(match[4]);
  if (upperMajor !== lowerMajor || upperMinor !== lowerMinor + 1) {
    throw new Error(
      `Rust supported_server_versions must describe one server minor release line ` +
        `(got ${JSON.stringify(serverRange)})`,
    );
  }

  return `${lowerMajor}.${lowerMinor}.x`;
}

function assertRustSdkProtocolAuthority(contract) {
  const officialSdks = contract.surface_families.official_sdks;
  if (!officialSdks) {
    throw new Error(`static/compatibility-contract.json is missing the official_sdks family`);
  }

  assertIncludes(
    officialSdks.description,
    '`durable-workflow` Rust SDK',
    'static/compatibility-contract.json official_sdks.description',
  );

  const expectedPerPackageAuthority =
    'README.md and `[package.metadata.durable-workflow]` in `durable-workflow/sdk-rust`';
  if (
    !officialSdks.per_package_contracts ||
    officialSdks.per_package_contracts.rust_sdk !== expectedPerPackageAuthority
  ) {
    throw new Error(
      `static/compatibility-contract.json official_sdks.per_package_contracts.rust_sdk ` +
        `must be ${JSON.stringify(expectedPerPackageAuthority)}`,
    );
  }

  const rustPackage = officialSdks.package_compatibility?.rust_sdk;
  const requiredRustPackageFields = [
    'package',
    'release_line',
    'supported_server_versions',
    'worker_protocol_version',
    'control_plane_version',
  ];
  for (const field of requiredRustPackageFields) {
    if (!rustPackage || typeof rustPackage[field] !== 'string' || rustPackage[field] === '') {
      throw new Error(
        `static/compatibility-contract.json official_sdks.package_compatibility.rust_sdk ` +
          `must include non-empty ${field}`,
      );
    }
  }

  if (rustPackage.package !== 'durable-workflow') {
    throw new Error(
      `Rust package compatibility authority must name package "durable-workflow" ` +
        `(got ${JSON.stringify(rustPackage.package)})`,
    );
  }

  const artifactVersion = ARTIFACT_VERSIONS['sdk-rust'];
  const artifactReleaseLine = artifactVersion.replace(/\.\d+$/, '.x');
  const serverReleaseLine = serverReleaseLineFromRange(
    rustPackage.supported_server_versions,
  );
  if (rustPackage.release_line !== artifactReleaseLine) {
    throw new Error(
      `Rust package compatibility release_line must match current artifact ` +
        `${artifactVersion}: expected ${artifactReleaseLine}, got ${rustPackage.release_line}`,
    );
  }

  const cargoMetadata = loadRustCargoMetadataWhenAvailable();
  if (cargoMetadata !== null) {
    const expectedCargoValues = {
      package: rustPackage.package,
      version: artifactVersion,
      supported_server_versions: rustPackage.supported_server_versions,
      worker_protocol_version: rustPackage.worker_protocol_version,
      control_plane_version: rustPackage.control_plane_version,
    };

    for (const [field, expected] of Object.entries(expectedCargoValues)) {
      if (cargoMetadata[field] !== expected) {
        throw new Error(
          `${cargoMetadata.source} ${field} must match the released Rust authority: ` +
            `expected ${JSON.stringify(expected)}, got ${JSON.stringify(cargoMetadata[field])}`,
        );
      }
    }
  }

  const protocolSpecsWorkflow = read(protocolSpecsWorkflowPath);
  for (const required of [
    "artifacts['sdk-rust']",
    'SDK_RUST_VERSION: ${{ steps.rust-sdk-release.outputs.version }}',
    'https://crates.io/api/v1/crates/durable-workflow/${SDK_RUST_VERSION}',
    'https://crates.io/api/v1/crates/durable-workflow/${SDK_RUST_VERSION}/download',
    'metadata.version?.num !== expected',
    'metadata.version?.checksum',
    'sha256sum --check --strict',
    'tar -xzf "${crate_archive}" --strip-components=1 -C "${crate_root}"',
    'SDK_RUST_REPO_PATH: ${{ github.workspace }}/released-sdk-rust',
  ]) {
    assertIncludes(
      protocolSpecsWorkflow,
      required,
      '.github/workflows/protocol-specs.yml',
    );
  }
  if (protocolSpecsWorkflow.includes('repository: durable-workflow/sdk-rust')) {
    throw new Error(
      `.github/workflows/protocol-specs.yml must validate the published crates.io archive ` +
        `without depending on a peer repository checkout`,
    );
  }

  const workerProtocol = contract.surface_families.worker_protocol;
  const negotiation = workerProtocol?.negotiation;
  if (!negotiation) {
    throw new Error(
      `static/compatibility-contract.json worker_protocol must publish a negotiation contract`,
    );
  }

  if (negotiation.advertised_version_path !== 'worker_protocol.version') {
    throw new Error(
      `worker_protocol.negotiation.advertised_version_path must be "worker_protocol.version"`,
    );
  }
  if (
    negotiation.request_header_rule !==
    'same_major_and_minor_less_than_or_equal_to_advertised'
  ) {
    throw new Error(
      `worker_protocol.negotiation.request_header_rule must preserve the server's ` +
        `same-major, worker-minor-less-than-or-equal rule`,
    );
  }
  if (negotiation.response_version !== 'advertised_version') {
    throw new Error(
      `worker_protocol.negotiation.response_version must be "advertised_version"`,
    );
  }

  const expectedVersions = expectedAcceptedWorkerVersions(
    negotiation.default_advertised_version,
  );
  if (
    JSON.stringify(negotiation.accepted_request_versions_by_default) !==
    JSON.stringify(expectedVersions)
  ) {
    throw new Error(
      `worker_protocol.negotiation.accepted_request_versions_by_default must enumerate ` +
        `every version from ${expectedVersions[0]} through ${expectedVersions.at(-1)}`,
    );
  }
  if (!expectedVersions.includes(rustPackage.worker_protocol_version)) {
    throw new Error(
      `Rust worker protocol ${rustPackage.worker_protocol_version} is outside the default ` +
        `server request window ${expectedVersions[0]} through ${expectedVersions.at(-1)}`,
    );
  }

  const failClosedOn = [
    'missing_header',
    'malformed_version',
    'different_major',
    'minor_greater_than_advertised',
  ];
  if (JSON.stringify(negotiation.fail_closed_on) !== JSON.stringify(failClosedOn)) {
    throw new Error(
      `worker_protocol.negotiation.fail_closed_on must preserve missing, malformed, ` +
        `different-major, and ahead-of-server rejection`,
    );
  }

  const rustGuide = replaceArtifactTokens(read(rustGuidePath), 'docs/polyglot/rust.md');
  assertNormalizedIncludes(
    rustGuide,
    `The \`${artifactVersion}\` release requires Rust 1.86 or newer. Its package metadata ` +
      `declares compatibility with Durable Workflow server ${serverReleaseLine}, worker protocol ` +
      `${rustPackage.worker_protocol_version}, and control plane ${rustPackage.control_plane_version}.`,
    'docs/polyglot/rust.md',
  );
  assertIncludes(
    rustGuide,
    `\`${rustPackage.supported_server_versions}\``,
    'docs/polyglot/rust.md',
  );
  assertNormalizedIncludes(
    rustGuide,
    `Rust SDK \`${artifactReleaseLine}\` sends \`X-Durable-Workflow-Protocol-Version: ` +
      `${rustPackage.worker_protocol_version}\``,
    'docs/polyglot/rust.md',
  );
  assertIncludes(
    rustGuide,
    `\`${negotiation.default_advertised_version}\``,
    'docs/polyglot/rust.md',
  );
  assertNormalizedIncludes(
    rustGuide,
    'A missing or malformed header, a different major, or a worker minor newer than the server',
    'docs/polyglot/rust.md',
  );

  const compatibilityDoc = read(compatibilityDocPath);
  const matrixMatch = compatibilityDoc.match(
    /### Server ↔ SDK \/ CLI\n\n([\s\S]*?)(?=\n\n### |\n\n## |$)/,
  );
  if (!matrixMatch) {
    throw new Error(`docs/compatibility.md must include a "### Server ↔ SDK / CLI" section`);
  }
  const matrix = matrixMatch[1];
  for (const required of [
    `Rust SDK ${artifactReleaseLine} (\`${rustPackage.worker_protocol_version}\`)`,
    `control_plane.version: "${rustPackage.control_plane_version}"`,
    `worker_protocol.version: "${negotiation.default_advertised_version}"`,
    `headers \`${expectedVersions[0]}\` through \`${expectedVersions.at(-1)}\` accepted`,
    'Missing or malformed required protocol manifest/header',
    'worker minor newer than the advertised server minor',
  ]) {
    assertIncludes(matrix, required, 'docs/compatibility.md Server ↔ SDK / CLI matrix');
  }
  assertNormalizedIncludes(
    matrix,
    `The Rust package's \`${rustPackage.supported_server_versions}\` server range selects ` +
      `the server release family`,
    'docs/compatibility.md Server ↔ SDK / CLI section',
  );

  const acceptedVersionsYaml = `[${expectedVersions.map(version => `"${version}"`).join(', ')}]`;
  const failClosedYaml = `[${failClosedOn.join(', ')}]`;
  const workerOpenApi = read(workerOpenApiPath);
  for (const required of [
    'x-durable-workflow-worker-protocol-negotiation:',
    `default_advertised_version: "${negotiation.default_advertised_version}"`,
    `request_header_rule: ${negotiation.request_header_rule}`,
    `accepted_request_versions_by_default: ${acceptedVersionsYaml}`,
    `response_version: ${negotiation.response_version}`,
    `fail_closed_on: ${failClosedYaml}`,
    'schema: { $ref: "#/components/schemas/AcceptedWorkerProtocolRequestVersion" }',
    `const: "${negotiation.default_advertised_version}"`,
  ]) {
    assertIncludes(workerOpenApi, required, 'worker-protocol-api.openapi.yaml');
  }
  assertOpenApiAcceptedWorkerProtocolVersions(workerOpenApi, expectedVersions);
  if (workerOpenApi.includes('const: "1.0"')) {
    throw new Error(
      `worker-protocol-api.openapi.yaml must not fix response authority to stale version 1.0`,
    );
  }

  const workerAsyncApi = read(workerAsyncApiPath);
  for (const required of [
    `default_advertised_version: "${negotiation.default_advertised_version}"`,
    `accepted_request_versions_by_default: ${acceptedVersionsYaml}`,
    `fail_closed_on: ${failClosedYaml}`,
    `const: "${negotiation.default_advertised_version}"`,
  ]) {
    assertIncludes(workerAsyncApi, required, 'worker-protocol-stream.asyncapi.yaml');
  }

  const workerProtocolGuide = read(workerProtocolGuidePath);
  assertIncludes(
    workerProtocolGuide,
    `current server-advertised protocol version is **${negotiation.default_advertised_version}**`,
    'docs/polyglot/worker-protocol.md',
  );
  assertIncludes(
    workerProtocolGuide,
    `request versions \`${expectedVersions[0]}\` through \`${expectedVersions.at(-1)}\``,
    'docs/polyglot/worker-protocol.md',
  );

  if (!contract.release_check?.gates?.rust_sdk_protocol_authority_aligned) {
    throw new Error(
      `static/compatibility-contract.json release_check.gates must include ` +
        `rust_sdk_protocol_authority_aligned`,
    );
  }
}

function composerPrereleaseStability(artifact, version) {
  const match = composerPreStableVersionPattern.exec(version);

  if (match) {
    return match[1];
  }

  if (version === '2.0.0') {
    throw new Error(
      `public artifact ${artifact} is pinned to stable 2.0.0, but the docs ` +
        `site is still in the pre-v2-stable ramp. Stable Composer pins require ` +
        `an explicit release-status cutover before this authority can accept them.`,
    );
  }

  throw new Error(
    `public artifact ${artifact} must stay on a Workflow/Waterline Composer ` +
      `pre-stable 2.0.0-alpha.N or 2.0.0-beta.N version until the release-status ` +
      `cutover is authorized (got ${version})`,
  );
}

function assertComposerArtifactTupleIsPreStable() {
  for (const artifact of ['workflow', 'waterline']) {
    composerPrereleaseStability(artifact, ARTIFACT_VERSIONS[artifact]);
  }
}

function stripExpectedComposerPins(content) {
  let stripped = content;

  for (const pinName of ['workflowComposerPackage', 'waterlineComposerPackage']) {
    stripped = stripped.split(ARTIFACT_PINS[pinName]).join('');
  }

  return stripped;
}

function loadContract() {
  let raw;
  try {
    raw = read(contractPath);
  } catch (err) {
    throw new Error(
      `static/compatibility-contract.json is missing. The compatibility ` +
        `authority cannot be verified without its machine-readable mirror.`,
    );
  }

  let contract;
  try {
    contract = JSON.parse(raw);
  } catch (err) {
    throw new Error(`static/compatibility-contract.json is not valid JSON: ${err.message}`);
  }

  const expectedTopLevel = [
    'schema',
    'version',
    'authority_url',
    'stability_levels',
    'release_rules',
    'field_visibility_rule',
    'surface_families',
    'release_check',
  ];
  for (const key of expectedTopLevel) {
    if (!(key in contract)) {
      throw new Error(`static/compatibility-contract.json must include top-level key "${key}"`);
    }
  }

  if (contract.schema !== 'durable-workflow.v2.surface-stability.contract') {
    throw new Error(
      `static/compatibility-contract.json schema must be ` +
        `"durable-workflow.v2.surface-stability.contract" (got "${contract.schema}")`,
    );
  }

  if (typeof contract.version !== 'number' || contract.version < 1) {
    throw new Error(
      `static/compatibility-contract.json version must be a positive integer (got ${JSON.stringify(contract.version)})`,
    );
  }

  if (
    contract.authority_url !== 'https://durable-workflow.github.io/docs/2.0/compatibility'
  ) {
    throw new Error(
      `static/compatibility-contract.json authority_url must point at ` +
        `https://durable-workflow.github.io/docs/2.0/compatibility ` +
        `(got "${contract.authority_url}")`,
    );
  }

  return contract;
}

function componentVersionRows(section) {
  return section
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('|') && !/^\|\s*-/.test(line));
}

function assertComponentVersionTableUsesCurrentArtifactTuple(doc) {
  const sectionMatch = doc.match(/### Component versions\n\n([\s\S]*?)(?=\n\n### |\n\n## |$)/);

  if (!sectionMatch) {
    throw new Error(`docs/compatibility.md must include a "### Component versions" section`);
  }

  const sourceSection = sectionMatch[1];
  const renderedSection = replaceArtifactTokens(
    sourceSection,
    'docs/compatibility.md component versions',
  );

  if (
    !renderedSection.includes('Current installable public artifact') ||
    !renderedSection.includes('Contract authority and stability')
  ) {
    throw new Error(
      `docs/compatibility.md component versions table must distinguish ` +
        `installable artifact versions from contract authority and stability.`,
    );
  }

  const expectations = [
    {
      component: 'Workflow Package (PHP)',
      artifact: 'workflow',
      token: '%%artifact.workflowVersion%%',
    },
    {
      component: 'Standalone Server',
      artifact: 'server',
      token: '%%artifact.serverVersion%%',
    },
    {
      component: 'CLI (`dw`)',
      artifact: 'cli',
      token: '%%artifact.cliVersion%%',
    },
    {
      component: 'Python SDK (`durable_workflow`)',
      artifact: 'sdk-python',
      token: '%%artifact.pythonSdkVersion%%',
    },
    {
      component: 'Rust SDK (`durable-workflow`)',
      artifact: 'sdk-rust',
      token: '%%artifact.rustSdkVersion%%',
    },
    {
      component: 'Waterline',
      artifact: 'waterline',
      token: '%%artifact.waterlineVersion%%',
    },
  ];
  const rows = componentVersionRows(renderedSection);

  for (const expectation of expectations) {
    if (!sourceSection.includes(expectation.token)) {
      throw new Error(
        `docs/compatibility.md component versions table must use ` +
          `${expectation.token} for ${expectation.component} so it follows ` +
          `scripts/public-artifact-versions.json.`,
      );
    }

    const row = rows.find(candidate => candidate.includes(`| ${expectation.component} |`));
    if (!row) {
      throw new Error(
        `docs/compatibility.md component versions table is missing row for ` +
          `${expectation.component}`,
      );
    }

    const expectedVersion = ARTIFACT_VERSIONS[expectation.artifact];
    if (!row.includes(expectedVersion)) {
      throw new Error(
        `docs/compatibility.md component versions table must render ` +
          `${expectation.component} with current public artifact version ` +
          `${expectedVersion}`,
      );
    }
  }
}

function assertCompatibilityDocAlignsWithContract(contract) {
  const doc = read(compatibilityDocPath);

  // 1. Authority self-identification.
  if (!doc.includes('canonical compatibility and release-authority contract')) {
    throw new Error(
      `docs/compatibility.md must call itself the "canonical compatibility ` +
        `and release-authority contract"; the JSON contract names it as the ` +
        `authority, so the doc must say so explicitly.`,
    );
  }

  // 2. Schema + version match.
  if (!doc.includes(contract.schema)) {
    throw new Error(
      `docs/compatibility.md must reference the surface-stability schema ` +
        `"${contract.schema}" so callers can match the doc to the JSON mirror.`,
    );
  }

  // 3. Stability levels match.
  const docLevels = new Set();
  const levelTableMatch = doc.match(/\| Level \| Meaning \|[\s\S]*?\n(?=\n)/);
  if (!levelTableMatch) {
    throw new Error(
      `docs/compatibility.md must include a "| Level | Meaning |" stability-level table`,
    );
  }
  const levelTable = levelTableMatch[0];
  for (const expected of Object.keys(contract.stability_levels)) {
    if (!new RegExp(`\\|\\s*\`${expected}\``).test(levelTable)) {
      throw new Error(
        `docs/compatibility.md stability-level table must include row for ` +
          `\`${expected}\``,
      );
    }
    docLevels.add(expected);
  }

  // 4. Surface families row-by-row.
  const familyTableMatch = doc.match(/\| Family \| Stability \|[\s\S]*?(?=\n\n## )/);
  if (!familyTableMatch) {
    throw new Error(
      `docs/compatibility.md must include a "| Family | Stability |" surface-family table`,
    );
  }
  const familyTable = familyTableMatch[0];

  for (const [family, definition] of Object.entries(contract.surface_families)) {
    const rowPattern = new RegExp(
      `\\|\\s*\`${family}\`\\s*\\|\\s*\`${definition.stability_level}\`\\s*\\|`,
    );
    if (!rowPattern.test(familyTable)) {
      throw new Error(
        `docs/compatibility.md surface-family table must include row for ` +
          `\`${family}\` with stability level \`${definition.stability_level}\` ` +
          `to match static/compatibility-contract.json`,
      );
    }
  }

  // 5. No surprise stability levels in the doc page that the contract has
  // never heard of (caught by scanning every backtick-quoted level token in
  // the doc and confirming it is one of the four documented levels).
  const knownLevels = new Set(Object.keys(contract.stability_levels));
  const possibleLevels = doc.match(/`(frozen|stable|prerelease|experimental|alpha|beta|rc|deprecated|removed)`/g) || [];
  for (const match of possibleLevels) {
    const level = match.slice(1, -1);
    if (!knownLevels.has(level) && level !== 'rc') {
      // `rc` only appears in version strings (`-rc.1`), filter that out.
      // Anything else is a stability claim that is not in the contract.
      throw new Error(
        `docs/compatibility.md uses stability token \`${level}\` which is ` +
          `not declared in static/compatibility-contract.json. Either ` +
          `remove the token from the doc or add the level to the contract ` +
          `(and bump the contract version).`,
      );
    }
  }

  assertComponentVersionTableUsesCurrentArtifactTuple(doc);
}

function assertInstallationDocAlignsWithContract(contract) {
  const phpFamily = contract.surface_families.official_sdks;
  if (!phpFamily) {
    throw new Error(
      `static/compatibility-contract.json is missing the official_sdks family`,
    );
  }

  assertComposerArtifactTupleIsPreStable();

  for (const surface of composerInstallDocSurfaces) {
    const rawDoc = read(surface.path);
    const surfacePath = relativePath(surface.path);

    for (const pinName of surface.requiredPins) {
      const token = `%%artifact.${pinName}%%`;

      if (!rawDoc.includes(token)) {
        throw new Error(
          `${surfacePath} must use ${token} so the rendered Composer ` +
            `stability suffix follows scripts/public-artifact-versions.json.`,
        );
      }
    }

    const literalStabilityTokens = rawDoc.match(/@(alpha|beta|dev|rc|nightly|canary)\b/g) || [];
    if (literalStabilityTokens.length > 0) {
      throw new Error(
        `${surfacePath} hardcodes Composer stability token(s) ` +
          `${[...new Set(literalStabilityTokens)].sort().join(', ')}. ` +
          `Use public artifact tokens for exact pins and channel-neutral prose ` +
          `for the pre-stable Composer ramp.`,
      );
    }

    const renderedDoc = replaceArtifactTokens(rawDoc, surfacePath);
    const renderedWithoutExpectedPins = stripExpectedComposerPins(renderedDoc);
    const strayStabilityTokens =
      renderedWithoutExpectedPins.match(/@(alpha|beta|dev|rc|nightly|canary)\b/g) || [];

    if (strayStabilityTokens.length > 0) {
      throw new Error(
        `${surfacePath} renders Composer stability token(s) outside the ` +
          `current public artifact pins: ` +
          `${[...new Set(strayStabilityTokens)].sort().join(', ')}. ` +
          `Alpha and beta Composer suffixes are allowed only as the exact ` +
          `pre-stable pins generated from scripts/public-artifact-versions.json.`,
      );
    }

    if (
      surface.requiresStableCutoverGuidance &&
      (!/2\.0\.0`?\s+is tagged stable on Packagist/.test(rawDoc) ||
        !/cutover is authorized/.test(rawDoc))
    ) {
      throw new Error(
        `${surfacePath} must explain that stable Composer constraints are ` +
          `allowed only after 2.0.0 is tagged stable on Packagist and the ` +
          `2.0 cutover is authorized.`,
      );
    }
  }
}

function assertVersionHistoryAlignsWithContract(contract) {
  const doc = read(compatibilityDocPath);

  const versionHistoryMatch = doc.match(/## Version History\n[\s\S]*$/);
  if (!versionHistoryMatch) {
    throw new Error(
      `docs/compatibility.md must include a "## Version History" section ` +
        `so release reviewers can see the per-release stability call-outs`,
    );
  }

  const versionHistory = versionHistoryMatch[0];
  const claims = versionHistory.match(/`(frozen|stable|prerelease|experimental|alpha|beta|deprecated|removed)`/g) || [];
  const allowed = new Set(Object.keys(contract.stability_levels));
  for (const match of claims) {
    const level = match.slice(1, -1);
    if (!allowed.has(level)) {
      throw new Error(
        `docs/compatibility.md version-history table mentions stability ` +
          `level \`${level}\` which is not declared in ` +
          `static/compatibility-contract.json`,
      );
    }
  }
}

function main() {
  const contract = loadContract();
  assertCompatibilityDocAlignsWithContract(contract);
  assertRustSdkProtocolAuthority(contract);
  assertInstallationDocAlignsWithContract(contract);
  assertVersionHistoryAlignsWithContract(contract);

  console.log(
    `Compatibility-authority check passed: ${Object.keys(contract.surface_families).length} surface families ` +
      `at schema ${contract.schema} version ${contract.version}.`,
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  assertOpenApiAcceptedWorkerProtocolVersions,
  expectedAcceptedWorkerVersions,
};
