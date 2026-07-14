#!/usr/bin/env node
//
// Release-check gate for the canonical compatibility & release-authority
// contract.
//
// `static/compatibility-contract.json` is the machine-readable mirror of the
// platform-wide stability contract that `Workflow\V2\Support\SurfaceStabilityContract`
// emits and the standalone server re-exports under
// `surface_stability_contract` in `GET /api/cluster/info`. The contract is
// the single source of truth. This script validates its schema, the pre-stable
// artifact guard, released Rust package metadata, and the public OpenAPI,
// AsyncAPI, and workflow validation surfaces. Editorial pages are deliberately
// outside this machine-contract gate.

const fs = require('fs');
const path = require('path');

const {
  ARTIFACT_VERSIONS,
} = require('./public-artifact-versions');

const repoRoot = path.join(__dirname, '..');
const contractPath = path.join(repoRoot, 'static', 'compatibility-contract.json');
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
const composerPreStableVersionPattern = /^2\.0\.0-(alpha|beta)\.\d+$/;

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function relativePath(file) {
  return path.relative(repoRoot, file).split(path.sep).join('/');
}

function assertIncludes(content, expected, label) {
  if (!content.includes(expected)) {
    throw new Error(`${label} must include ${JSON.stringify(expected)}`);
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

function assertSdkProtocolAuthorities(contract) {
  const officialSdks = contract.surface_families.official_sdks;
  if (!officialSdks) {
    throw new Error(`static/compatibility-contract.json is missing the official_sdks family`);
  }

  assertIncludes(
    officialSdks.description,
    'PHP `durable-workflow/sdk`',
    'static/compatibility-contract.json official_sdks.description',
  );
  assertIncludes(
    officialSdks.description,
    '`durable-workflow` Rust SDK',
    'static/compatibility-contract.json official_sdks.description',
  );

  const expectedPhpAuthority =
    'README.md and composer metadata in `durable-workflow/sdk-php`';
  if (
    !officialSdks.per_package_contracts ||
    officialSdks.per_package_contracts.php_sdk !== expectedPhpAuthority
  ) {
    throw new Error(
      `static/compatibility-contract.json official_sdks.per_package_contracts.php_sdk ` +
        `must be ${JSON.stringify(expectedPhpAuthority)}`,
    );
  }

  const phpPackage = officialSdks.package_compatibility?.php_sdk;
  const expectedPhpPackage = {
    package: 'durable-workflow/sdk',
    release_line: ARTIFACT_VERSIONS['sdk-php'].replace(/\.\d+$/, '.x'),
    supported_server_versions: '>=0.2,<0.3',
    worker_protocol_version: '1.13',
    control_plane_version: '2',
  };
  if (JSON.stringify(phpPackage) !== JSON.stringify(expectedPhpPackage)) {
    throw new Error(
      `static/compatibility-contract.json official_sdks.package_compatibility.php_sdk ` +
        `must be ${JSON.stringify(expectedPhpPackage)}`,
    );
  }

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

function assertReleaseCheckMetadata(contract) {
  const releaseCheck = contract.release_check;
  const expectedMachineCommands = [
    'node scripts/check-compatibility-authority.js',
    'node scripts/check-compatibility-authority.test.js',
  ];
  const expectedMachineChecks = [
    'contract_shape_and_identity',
    'composer_prerelease_artifact_tuple',
    'rust_sdk_artifact_release_line',
    'rust_sdk_published_crate_metadata_when_available',
    'worker_protocol_negotiation_contract',
    'worker_protocol_openapi',
    'worker_protocol_asyncapi',
    'rust_sdk_published_crate_workflow_contract',
    'public_release_audit_successor_tuple_projection',
  ];
  const expectedMarkdownSources = [];
  const expectedHumanChecks = [
    'docs_authority_aligned',
    'install_docs_aligned',
    'package_metadata_aligned',
    'version_history_aligned',
  ];

  for (const [field, expected] of Object.entries({
    machine_commands: expectedMachineCommands,
    machine_checks: expectedMachineChecks,
    markdown_sources_checked: expectedMarkdownSources,
    human_checks: expectedHumanChecks,
  })) {
    const actual = releaseCheck?.enforcement?.[field];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `static/compatibility-contract.json release_check.enforcement.${field} ` +
          `must describe the checks that docs CI actually runs: expected ` +
          `${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
  }

  if (
    typeof releaseCheck.enforcement.machine !== 'string' ||
    !releaseCheck.enforcement.machine.includes('does not treat editorial Markdown as machine contract data')
  ) {
    throw new Error(
      `static/compatibility-contract.json release_check.enforcement.machine must state ` +
        `that editorial Markdown is not machine contract data`,
    );
  }

  if (
    typeof releaseCheck.enforcement.human !== 'string' ||
    !releaseCheck.enforcement.human.includes('not performed by the compatibility-authority scripts')
  ) {
    throw new Error(
      `static/compatibility-contract.json release_check.enforcement.human must distinguish ` +
        `the editorial checks from the compatibility-authority scripts`,
    );
  }
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

function main() {
  const contract = loadContract();
  assertSdkProtocolAuthorities(contract);
  assertComposerArtifactTupleIsPreStable();
  assertReleaseCheckMetadata(contract);

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
  assertReleaseCheckMetadata,
  expectedAcceptedWorkerVersions,
};
