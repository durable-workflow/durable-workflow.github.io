#!/usr/bin/env node
//
// Release-check gate for the platform conformance-suite manifest.
//
// `static/platform-conformance-contract.json` is the machine-readable
// docs-site mirror of `durable-workflow.v2.platform-conformance.suite`.
// That manifest is also advertised from `GET /api/cluster/info` under
// `platform_conformance_suite`, so every public authority pointer in the
// mirror must resolve to published docs-site content.

const fs = require('fs');
const childProcess = require('child_process');
const crypto = require('crypto');
const net = require('net');
const path = require('path');
const vm = require('vm');

const repoRoot = path.join(__dirname, '..');
const thisScriptPath = path.relative(repoRoot, __filename).split(path.sep).join('/');
const docsDir = path.join(repoRoot, 'docs');
const configPath = path.join(repoRoot, 'docusaurus.config.js');
const contractPath = path.join(repoRoot, 'static', 'platform-conformance-contract.json');
const workflowAuthorityLockPath = path.join(
  repoRoot,
  'scripts',
  'workflow-platform-conformance-authority-lock.json',
);
const protocolCatalogPath = path.join(
  repoRoot,
  'static',
  'platform-protocol-specs.json',
);
const discoveryPagePath = path.join(
  repoRoot,
  'src',
  'pages',
  'docs',
  'platform-conformance.mdx',
);
const sidebarsPath = path.join(repoRoot, 'sidebars.js');

const EXPECTED_SCHEMA = 'durable-workflow.v2.platform-conformance.suite';
const EXPECTED_RUNTIME_SOURCE_REVISION =
  '75dfd5c869823409ef3d6c4b009a7882159ae9a2';
const EXPECTED_RUNTIME_FIXTURE_SUITE_VERSION = 38;
const EXPECTED_PROTOCOL_SOURCE_REVISION =
  'f781ced1ae33c8697835bd527a125bdf3eaf4321';
const EXPECTED_PROTOCOL_SOURCE_SUITE_VERSION = 41;
const EXPECTED_PROTOCOL_SOURCE_CATALOG_VERSION = 16;
const EXPECTED_PROTOCOL_SOURCE_DIGESTS = Object.freeze({
  'cluster-info-envelope.schema.json':
    'sha256:7f761da2eda221a6240d1250b6dd774a36c2077642405f0f036e8124121ea4bc',
  'control-plane-api.openapi.yaml':
    'sha256:b5c720b7553de2598f236d41e488860e2d41e86327d7cd96a47453059278392f',
  'history-event-payloads.schema.json':
    'sha256:e81d1f9176f47a987facd05128a5e14276253b9b62998d58247ada3b5deeeb0f',
  'history-export-bundle.schema.json':
    'sha256:e8d6ef0af49a2570007062215d1332c96910743c1449cd8ca2c702bfac6c181c',
  'local-activity-runtime.schema.json':
    'sha256:de74d7175cda4f761a57263aae2b32046e617783acf0677d4c5aa6c5358619ef',
  'repair-actionability-objects.schema.json':
    'sha256:ca4faf4cd1485c877038c794ff7fc2f92804c6e0be4072bec4f4b7f59da9eb17',
  'replay-bundle.schema.json':
    'sha256:17409f333f8a05fe41a3ca60b2f6a1b7d9a008b07aae6194b7d5f17e3c6387f2',
  'worker-protocol-api.openapi.yaml':
    'sha256:55dfede6a9742f955911786eeb588ceecaa4266cebad57b92684c2a1bacefe7b',
  'worker-protocol-stream.asyncapi.yaml':
    'sha256:15bddb75d0e7183a520e861f87d5315b65e42acdc57a8137f947e00cacbac251',
  'worker-sessions-runtime.schema.json':
    'sha256:36b16340fe9524653baef7de0a32b2f744562bfc57e91853579a2c94dd512581',
});
const RETAINED_CLI_MANIFEST_SHA256 = {
  2: 'sha256:9eaccc507cb9f9affdc9ca6fe56a5ae83f528ba0c7621d31d8908cfec9b6c439',
  3: 'sha256:1b76016fe34266f1366cd09f66ba8a868f7c1faf014802237158f2b8a16a0e38',
};
const VERSIONED_SUITE_AUTHORITY_DIGESTS = {
  29: 'sha256:51eaaf8d034264f0f91bd13d10e3d46ca10dc8d97010719d4727c0336ad66382',
  30: 'sha256:e33ced9ece7d2c32cd939d416cb76c365ba6dd05e0c041949adb7c3267072b48',
  31: 'sha256:ccbd3a067faf685ea7d93f89e7e0721d51d44f7dd493874f00e33d971f633bee',
  32: 'sha256:9fbd647e3ef2d32441c17c1d0fd7d23a2b4bbc2026430dfc3c852288b02b49d1',
  33: 'sha256:dd0f589045ac0628d3fffc6fce5b910d41e94b63301c96cacd7757523cb65f9a',
  37: 'sha256:2e54a3edfb6e37a05a68525397253b6c3d660aef2296654f0bbf895fac0501b4',
  38: 'sha256:71feae0fff1a855afeda242a1ede8ab151d7d106093f2c624e88014a37c58c29',
  40: 'sha256:0642f7d73fffecf0ac673b962756082f03e0c07b7ed3efda70fa26bacc8ebc8f',
  41: 'sha256:dfee9c9b419bab9504a662f22bd5b7866a2a7de50c6d31ee0a0e7b3c7067c1a1',
};
const SUITE_AUTHORITY_DIGEST_TRANSITIONS = Object.freeze({
  40: Object.freeze({
    from: 'sha256:db417d6a87ff0c8069e620a794ae4e82b5089d7be613df3bc934cdfddb7766c7',
    to: 'sha256:0642f7d73fffecf0ac673b962756082f03e0c07b7ed3efda70fa26bacc8ebc8f',
  }),
});
const EXPECTED_RUNTIME_SCENARIO_SCHEMA =
  'durable-workflow.v2.platform-conformance.runtime-scenarios';
const EXPECTED_RUNTIME_SCENARIO_FIXTURE_TYPE =
  'published_artifact_runtime_scenario_manifest';
const PUBLIC_RUNTIME_MANIFEST_FORBIDDEN_NORMATIVE_FIELDS = new Set([
  'runner_path',
  'runner_command',
  'result_files',
  'host_runner_path',
  'scenario_runner_path',
  'scenario_runner_image_path',
  'result_file',
  'lifecycle_sidecar_file',
]);
const PUBLIC_RUNTIME_MANIFEST_FORBIDDEN_ARTIFACT_NAME_PATTERNS = [
  /^published-artifacts\.json$/,
  /^pins\.json$/,
  /^run-metadata\.json$/,
  /^artifact-install-evidence\.json$/,
  /^[a-z0-9-]+-(result|record|evidence|sidecar|metadata|http-captures)\.json$/,
];
const PUBLIC_CONFORMANCE_REPO_LOCAL_PATH_PATTERN =
  /(?:^|[\s"'`(=])((?:\.\.?[\\/])?(?:[A-Za-z0-9_.-]+[\\/])+[A-Za-z0-9_.-]+\.[A-Za-z][A-Za-z0-9_-]*)(?=$|[\s"'`),;:])/i;
const PUBLIC_CONFORMANCE_EXTENSIONLESS_REPO_PATH_PATTERN =
  /(?:^|[\s"'`(=])((?:[A-Za-z0-9_.-]+[\\/]){2,}[A-Za-z0-9_.-]+)(?=$|[\s"'`),;:])/i;
const PUBLIC_CONFORMANCE_EXACT_SLASH_IDENTIFIER_PATTERN =
  /^((?:[A-Za-z0-9_.-]+[\\/])+[A-Za-z0-9_.-]+)$/i;
const PUBLIC_CONFORMANCE_PUBLIC_PACKAGE_OR_REPOSITORY_PATTERN =
  /^(?:apache|durable-workflow)\/[A-Za-z0-9_.-]+$/i;
const PUBLIC_CONFORMANCE_HARNESS_LOCATOR_FIELD_PATTERN =
  /(?:^|_)(?:command|directory|executable|file|location|path|runner|script)(?:_|$)/i;
const PUBLIC_CONFORMANCE_EXPLICIT_RELATIVE_PATH_PATTERN =
  /(?:^|[\s"'`(=])((?:\.\.?[\\/]|[A-Za-z]:\\)[A-Za-z0-9_.\\/-]+)(?=$|[\s"'`),;:])/i;
const PUBLIC_CONFORMANCE_BARE_REPO_FILE_PATTERN =
  /(?:^|[\s"'`(=])((?:Dockerfile|Makefile|Justfile|Procfile)(?:\.[A-Za-z0-9_-]+)?|[A-Za-z0-9_.-]+\.(?:bash|bat|c|cc|cmd|conf|cpp|css|csv|env|fish|go|h|hpp|html|ini|java|js|json|jsx|kt|lock|md|mjs|php|ps1|py|rb|rs|scss|sh|sql|toml|ts|tsx|txt|xml|ya?ml|zsh))(?=$|[\s"'`),;:])/i;
const PUBLIC_CONFORMANCE_ABSOLUTE_FILESYSTEM_PATH_PATTERN =
  /^\/(?!\/)(?:(?:[A-Za-z0-9._~@%+-]+|\{[A-Za-z_][A-Za-z0-9_.|+-]*\})(?:\/(?:[A-Za-z0-9._~@%+-]+|\{[A-Za-z_][A-Za-z0-9_.|+-]*\}))*\/?)?/i;
const PUBLIC_CONFORMANCE_API_ROUTE_PATTERN =
  /^\/(?:api(?:\/|$)|mcp(?:\/|$)|waterline\/api(?:\/|$))/i;
const PUBLIC_CONFORMANCE_URL_TOKEN_PATTERN =
  /\b[a-z][a-z0-9+.-]*:(?:\/\/)?[^\s"'`),;]+/gi;
const PUBLIC_CONFORMANCE_URL_REFERENCE_FIELD_PATTERN =
  /^(?:artifact|evidence|runner)$|(?:^|_)(?:reference|source|url|uri)$/i;
const VERSIONED_RUNTIME_SCENARIO_STATUSES = {
  5: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  6: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  7: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  8: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  9: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  10: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  11: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  12: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  13: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  14: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  15: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  16: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  17: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  18: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  19: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  20: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  21: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  22: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  23: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  24: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  25: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  26: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  27: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  28: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  29: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  30: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  31: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  32: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
  33: [
    'pass',
    'fail',
    'unsupported',
    'not_covered',
    'runner_blocked',
  ],
};
VERSIONED_RUNTIME_SCENARIO_STATUSES[34] = VERSIONED_RUNTIME_SCENARIO_STATUSES[33];
VERSIONED_RUNTIME_SCENARIO_STATUSES[35] = VERSIONED_RUNTIME_SCENARIO_STATUSES[34];
VERSIONED_RUNTIME_SCENARIO_STATUSES[36] = VERSIONED_RUNTIME_SCENARIO_STATUSES[35];
VERSIONED_RUNTIME_SCENARIO_STATUSES[37] = VERSIONED_RUNTIME_SCENARIO_STATUSES[36];
VERSIONED_RUNTIME_SCENARIO_STATUSES[38] = VERSIONED_RUNTIME_SCENARIO_STATUSES[37];
VERSIONED_RUNTIME_SCENARIO_STATUSES[39] = VERSIONED_RUNTIME_SCENARIO_STATUSES[38];
VERSIONED_RUNTIME_SCENARIO_STATUSES[40] = VERSIONED_RUNTIME_SCENARIO_STATUSES[39];
VERSIONED_RUNTIME_SCENARIO_STATUSES[41] = VERSIONED_RUNTIME_SCENARIO_STATUSES[40];
const VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_FIELDS = [
  'artifact_policy',
  'common_result_evidence',
  'required_matrix',
  'scenario_requirements',
  'host_runner_contract',
  'optional_scenarios',
];
// Digests bind each stable scenario id's operations and pass_criteria to the
// suite version so published harness criteria cannot drift invisibly.
const VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS = {
  7: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    namespace_runtime_contract: 'sha256:54a11e95f14ecd088f6f5f8f993b2fd718407c91e3f5ffb4ee4ea88daddca896',
    signal_query_runtime_contract: 'sha256:838cb9bf6c9a175d1f0ef281ab00f3d8d5998214261af535db135fe9b5dfe78b',
  },
  8: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    signal_query_runtime_contract: 'sha256:838cb9bf6c9a175d1f0ef281ab00f3d8d5998214261af535db135fe9b5dfe78b',
  },
  9: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
  },
  10: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
  },
  11: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
    worker_versioning_runtime_contract: 'sha256:ae1bfb02b7062c6c858c81454330ae9348ca0bc06579aef90b7d648726c9415c',
  },
  12: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
    worker_versioning_runtime_contract: 'sha256:ae1bfb02b7062c6c858c81454330ae9348ca0bc06579aef90b7d648726c9415c',
  },
  13: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:530b8141abaa6d2e3b4ca66b7a07b5fa18cf0cb08c0a1348a0a0154af1d7e3c5',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
    worker_versioning_runtime_contract: 'sha256:ae1bfb02b7062c6c858c81454330ae9348ca0bc06579aef90b7d648726c9415c',
  },
  14: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:530b8141abaa6d2e3b4ca66b7a07b5fa18cf0cb08c0a1348a0a0154af1d7e3c5',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:6c76345e366f3523928d71da019cf653e0aaa7194e6becb96fa282dee8cab845',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
    worker_versioning_runtime_contract: 'sha256:ae1bfb02b7062c6c858c81454330ae9348ca0bc06579aef90b7d648726c9415c',
  },
  15: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:530b8141abaa6d2e3b4ca66b7a07b5fa18cf0cb08c0a1348a0a0154af1d7e3c5',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:6c76345e366f3523928d71da019cf653e0aaa7194e6becb96fa282dee8cab845',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
    skew_refusal_matrix_contract: 'sha256:72b63c7df1c002dade9998798d4ca93fc022a2a6c5742c88b5fdef15a40851c2',
    worker_versioning_runtime_contract: 'sha256:ae1bfb02b7062c6c858c81454330ae9348ca0bc06579aef90b7d648726c9415c',
  },
  16: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:530b8141abaa6d2e3b4ca66b7a07b5fa18cf0cb08c0a1348a0a0154af1d7e3c5',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:6c76345e366f3523928d71da019cf653e0aaa7194e6becb96fa282dee8cab845',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
    skew_refusal_matrix_contract: 'sha256:72b63c7df1c002dade9998798d4ca93fc022a2a6c5742c88b5fdef15a40851c2',
    worker_versioning_runtime_contract: 'sha256:a95e9150aa63886842f48bfe255c70deddba2b92238611c5292ca67597efa7bd',
  },
  17: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:530b8141abaa6d2e3b4ca66b7a07b5fa18cf0cb08c0a1348a0a0154af1d7e3c5',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:804043ee65265ccb7682fe30e0f96c72debe822506bd6b49bbf191086a3f45cd',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
    skew_refusal_matrix_contract: 'sha256:72b63c7df1c002dade9998798d4ca93fc022a2a6c5742c88b5fdef15a40851c2',
    worker_versioning_runtime_contract: 'sha256:a95e9150aa63886842f48bfe255c70deddba2b92238611c5292ca67597efa7bd',
  },
  18: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:530b8141abaa6d2e3b4ca66b7a07b5fa18cf0cb08c0a1348a0a0154af1d7e3c5',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:ec09056f015e85053071eff8ddb8b691257ae323215e068ed6ecc498ce495e39',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
    skew_refusal_matrix_contract: 'sha256:72b63c7df1c002dade9998798d4ca93fc022a2a6c5742c88b5fdef15a40851c2',
    worker_versioning_runtime_contract: 'sha256:a95e9150aa63886842f48bfe255c70deddba2b92238611c5292ca67597efa7bd',
  },
  19: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:530b8141abaa6d2e3b4ca66b7a07b5fa18cf0cb08c0a1348a0a0154af1d7e3c5',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:ec09056f015e85053071eff8ddb8b691257ae323215e068ed6ecc498ce495e39',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    schedules_runtime_contract: 'sha256:7485146046a84c752b02081870782a268ead0cdaf6a08910e0e270530e62f43f',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
    skew_refusal_matrix_contract: 'sha256:72b63c7df1c002dade9998798d4ca93fc022a2a6c5742c88b5fdef15a40851c2',
    worker_versioning_runtime_contract: 'sha256:a95e9150aa63886842f48bfe255c70deddba2b92238611c5292ca67597efa7bd',
  },
  20: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:530b8141abaa6d2e3b4ca66b7a07b5fa18cf0cb08c0a1348a0a0154af1d7e3c5',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:ec09056f015e85053071eff8ddb8b691257ae323215e068ed6ecc498ce495e39',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    schedules_runtime_contract: 'sha256:7485146046a84c752b02081870782a268ead0cdaf6a08910e0e270530e62f43f',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
    skew_refusal_matrix_contract: 'sha256:72b63c7df1c002dade9998798d4ca93fc022a2a6c5742c88b5fdef15a40851c2',
    worker_versioning_runtime_contract: 'sha256:a95e9150aa63886842f48bfe255c70deddba2b92238611c5292ca67597efa7bd',
  },
  21: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:530b8141abaa6d2e3b4ca66b7a07b5fa18cf0cb08c0a1348a0a0154af1d7e3c5',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:ec09056f015e85053071eff8ddb8b691257ae323215e068ed6ecc498ce495e39',
    principal_attribution_contract: 'sha256:4c2c315ddffcfd14955169838785ee9d6c7e1c8373aeeea16cc31beec4b54f8d',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    schedules_runtime_contract: 'sha256:7485146046a84c752b02081870782a268ead0cdaf6a08910e0e270530e62f43f',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
    skew_refusal_matrix_contract: 'sha256:72b63c7df1c002dade9998798d4ca93fc022a2a6c5742c88b5fdef15a40851c2',
    worker_versioning_runtime_contract: 'sha256:a95e9150aa63886842f48bfe255c70deddba2b92238611c5292ca67597efa7bd',
  },
  22: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:530b8141abaa6d2e3b4ca66b7a07b5fa18cf0cb08c0a1348a0a0154af1d7e3c5',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:ec09056f015e85053071eff8ddb8b691257ae323215e068ed6ecc498ce495e39',
    principal_attribution_contract: 'sha256:4c2c315ddffcfd14955169838785ee9d6c7e1c8373aeeea16cc31beec4b54f8d',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    schedules_runtime_contract: 'sha256:7485146046a84c752b02081870782a268ead0cdaf6a08910e0e270530e62f43f',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
    skew_refusal_matrix_contract: 'sha256:72b63c7df1c002dade9998798d4ca93fc022a2a6c5742c88b5fdef15a40851c2',
    worker_versioning_runtime_contract: 'sha256:a95e9150aa63886842f48bfe255c70deddba2b92238611c5292ca67597efa7bd',
  },
  23: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:530b8141abaa6d2e3b4ca66b7a07b5fa18cf0cb08c0a1348a0a0154af1d7e3c5',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:ec09056f015e85053071eff8ddb8b691257ae323215e068ed6ecc498ce495e39',
    principal_attribution_contract: 'sha256:4c2c315ddffcfd14955169838785ee9d6c7e1c8373aeeea16cc31beec4b54f8d',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    schedules_runtime_contract: 'sha256:7485146046a84c752b02081870782a268ead0cdaf6a08910e0e270530e62f43f',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
    skew_refusal_matrix_contract: 'sha256:72b63c7df1c002dade9998798d4ca93fc022a2a6c5742c88b5fdef15a40851c2',
    worker_versioning_runtime_contract: 'sha256:a95e9150aa63886842f48bfe255c70deddba2b92238611c5292ca67597efa7bd',
  },
  24: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:530b8141abaa6d2e3b4ca66b7a07b5fa18cf0cb08c0a1348a0a0154af1d7e3c5',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:ec09056f015e85053071eff8ddb8b691257ae323215e068ed6ecc498ce495e39',
    principal_attribution_contract: 'sha256:4c2c315ddffcfd14955169838785ee9d6c7e1c8373aeeea16cc31beec4b54f8d',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    schedules_runtime_contract: 'sha256:7485146046a84c752b02081870782a268ead0cdaf6a08910e0e270530e62f43f',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
    skew_refusal_matrix_contract: 'sha256:72b63c7df1c002dade9998798d4ca93fc022a2a6c5742c88b5fdef15a40851c2',
    worker_versioning_runtime_contract: 'sha256:e96de5ed97bcbdc68eeee9849145c22d52d450da23fba6f49f8ac3be736faca3',
  },
  25: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:f4b92c4f5b3ca7d701f0b354bdf401f72a5d56a0c548a176811e3610df262018',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:ec09056f015e85053071eff8ddb8b691257ae323215e068ed6ecc498ce495e39',
    principal_attribution_contract: 'sha256:4c2c315ddffcfd14955169838785ee9d6c7e1c8373aeeea16cc31beec4b54f8d',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    schedules_runtime_contract: 'sha256:7485146046a84c752b02081870782a268ead0cdaf6a08910e0e270530e62f43f',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:186e9a0a5bba1a094d0b8c7eb3299f0798f15e7aaab83b0d2596f0c91cc75373',
    skew_refusal_matrix_contract: 'sha256:72b63c7df1c002dade9998798d4ca93fc022a2a6c5742c88b5fdef15a40851c2',
    worker_versioning_runtime_contract: 'sha256:e96de5ed97bcbdc68eeee9849145c22d52d450da23fba6f49f8ac3be736faca3',
  },
  26: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:f4b92c4f5b3ca7d701f0b354bdf401f72a5d56a0c548a176811e3610df262018',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:ec09056f015e85053071eff8ddb8b691257ae323215e068ed6ecc498ce495e39',
    principal_attribution_contract: 'sha256:4c2c315ddffcfd14955169838785ee9d6c7e1c8373aeeea16cc31beec4b54f8d',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    schedules_runtime_contract: 'sha256:7485146046a84c752b02081870782a268ead0cdaf6a08910e0e270530e62f43f',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:e39825346be066d9202286f956996640591572aab1455d9d0c20693e4e15c179',
    skew_refusal_matrix_contract: 'sha256:72b63c7df1c002dade9998798d4ca93fc022a2a6c5742c88b5fdef15a40851c2',
    worker_versioning_runtime_contract: 'sha256:e96de5ed97bcbdc68eeee9849145c22d52d450da23fba6f49f8ac3be736faca3',
  },
  27: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:f4b92c4f5b3ca7d701f0b354bdf401f72a5d56a0c548a176811e3610df262018',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:ec09056f015e85053071eff8ddb8b691257ae323215e068ed6ecc498ce495e39',
    principal_attribution_contract: 'sha256:4c2c315ddffcfd14955169838785ee9d6c7e1c8373aeeea16cc31beec4b54f8d',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    schedules_runtime_contract: 'sha256:7485146046a84c752b02081870782a268ead0cdaf6a08910e0e270530e62f43f',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:e39825346be066d9202286f956996640591572aab1455d9d0c20693e4e15c179',
    skew_refusal_matrix_contract: 'sha256:72b63c7df1c002dade9998798d4ca93fc022a2a6c5742c88b5fdef15a40851c2',
    workflow_update_runtime_contract: 'sha256:c7de18cfd6606f72c320408dd8943526cc52d8863bf3a8c9cd9eb689cafb85bd',
    worker_versioning_runtime_contract: 'sha256:e96de5ed97bcbdc68eeee9849145c22d52d450da23fba6f49f8ac3be736faca3',
  },
  28: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:484567df1910ff0b9b0aa1665c79c5dc851b899c48e8f245ed7574f5dc87d82a',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:ec09056f015e85053071eff8ddb8b691257ae323215e068ed6ecc498ce495e39',
    principal_attribution_contract: 'sha256:4c2c315ddffcfd14955169838785ee9d6c7e1c8373aeeea16cc31beec4b54f8d',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    schedules_runtime_contract: 'sha256:7485146046a84c752b02081870782a268ead0cdaf6a08910e0e270530e62f43f',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:e39825346be066d9202286f956996640591572aab1455d9d0c20693e4e15c179',
    skew_refusal_matrix_contract: 'sha256:72b63c7df1c002dade9998798d4ca93fc022a2a6c5742c88b5fdef15a40851c2',
    workflow_update_runtime_contract: 'sha256:c7de18cfd6606f72c320408dd8943526cc52d8863bf3a8c9cd9eb689cafb85bd',
    worker_versioning_runtime_contract: 'sha256:e96de5ed97bcbdc68eeee9849145c22d52d450da23fba6f49f8ac3be736faca3',
  },
  29: {
    child_workflow_runtime_contract: 'sha256:3612fc5ce951c26382d7eb2842c368f9ce7a17ce48a246bd43d327ada2de54e2',
    history_replay_bundles: 'sha256:70658bc21f12e7b0c16306951ba18e2b2ec853487c287e81cfa64a2b40eff013',
    migration_runtime_contract: 'sha256:484567df1910ff0b9b0aa1665c79c5dc851b899c48e8f245ed7574f5dc87d82a',
    namespace_runtime_contract: 'sha256:aba71f98fcad2713a13801ef5430522ffdb6ea4214a160e50fca0cd7794315e5',
    prerelease_readiness_contract: 'sha256:ec09056f015e85053071eff8ddb8b691257ae323215e068ed6ecc498ce495e39',
    principal_attribution_contract: 'sha256:4c2c315ddffcfd14955169838785ee9d6c7e1c8373aeeea16cc31beec4b54f8d',
    saga_runtime_contract: 'sha256:6f6c04ecb67546ff2d307e9f53961f9c19ab347c6486de7fe29e0a5dddef4347',
    schedules_runtime_contract: 'sha256:7485146046a84c752b02081870782a268ead0cdaf6a08910e0e270530e62f43f',
    search_attribute_runtime_contract: 'sha256:ef28842b57295065f2de2cf973ee7c06f0bdd2f390f0ab3dcf78d9c64f72d1c5',
    signal_query_runtime_contract: 'sha256:9621972cfa0b7bd4f3884a3ae31e56bef3ddf8efab83deaeaf78ca2c488093e9',
    skew_refusal_matrix_contract: 'sha256:72b63c7df1c002dade9998798d4ca93fc022a2a6c5742c88b5fdef15a40851c2',
    workflow_update_runtime_contract: 'sha256:c7de18cfd6606f72c320408dd8943526cc52d8863bf3a8c9cd9eb689cafb85bd',
    worker_versioning_runtime_contract: 'sha256:e96de5ed97bcbdc68eeee9849145c22d52d450da23fba6f49f8ac3be736faca3',
  },
};
VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[30] = {
  ...VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[29],
  schedules_runtime_contract: 'sha256:e6366112b3a9a72e140a8930edc6db09d11f475f683fabbeb563c72000e9db88',
  skew_refusal_matrix_contract: 'sha256:cd41618a3375f774c1591d1d5e92ea4a0aba0160a1cfda36cc06ed1e8fce0a50',
  worker_versioning_runtime_contract: 'sha256:8860cce6c1934c4233dd11e091e04d9f67e2cd70992aef67ee97507c13e0110d',
  workflow_update_runtime_contract: 'sha256:3c6a8a18cfdff547eb0963c1620c435b7b52a367f78a2b6cd6ed041ebbd90d1d',
  search_attribute_runtime_contract: 'sha256:014208f3e53a081145c4b0b8eaf84d0a178f6e9aa209101771b08f4727f8688c',
  namespace_runtime_contract: 'sha256:f6079414cb92852d6052e1115e9bc0bd1b3e42dfe8cd108caa1eec4f983656f0',
  principal_attribution_contract: 'sha256:f8e26d6fa05ee3095a4cdd65780e0548acc6c1116aaf18502daedebaa7294329',
};
VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[31] = {
  ...VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[30],
  skew_refusal_matrix_contract: 'sha256:3e8aedf494b4e581db85fa8002251bc2e0b5728006cb2ff7c13789c820655562',
  principal_attribution_contract: 'sha256:57fda46bef7896ef7ce4178c665c3d64bbaa87ba5eea03217ad526b0138a1915',
};
VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[32] = {
  ...VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[31],
  prerelease_readiness_contract: 'sha256:1c5dea4b5dd1421fcb5e3baaba4f9394f1316bb461caeda7cf79e54b016da15e',
};
VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[33] =
  VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[32];
VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[34] =
  VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[33];
VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[35] =
  VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[34];
VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[36] =
  VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[35];
VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[37] = {
  ...VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[36],
  prerelease_readiness_contract:
    'sha256:c84306b3c813066673466c61aab8d010ce2589620df67f860844f8029e34444a',
};
VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[38] =
  VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[37];
VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[39] =
  VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[38];
VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[40] =
  VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[39];
VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[41] =
  VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[40];
// Digests bind public top-level runtime scenario manifest requirements to the
// suite version. These fields define artifact source policy, common evidence,
// runtime matrices, scenario-specific required evidence, and host-runner result
// contracts; changing them requires a new suite version.
const VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS = {
  19: {
    child_workflow_runtime_contract: 'sha256:9d8db2784110771778af0ff0a03de13bf5f0243b2be6d69080e013e602476072',
    history_replay_bundles: 'sha256:0a7b52919c7dd44b80a559324c7cdda563744385729fd67cedafe082f2af36e8',
    migration_runtime_contract: 'sha256:ef15f359dc6bb89e21f667cf7a7812079069228a00bfccb637645dac49739890',
    namespace_runtime_contract: 'sha256:36a4abd574cfa4a920b0838e44fe9d6a991b0b69b064bc4a8ddf8b295714c7e9',
    prerelease_readiness_contract: 'sha256:1846068e84ca06074607d319438a95cbb13d017aec15fa4cbd5895fb1e253c9f',
    saga_runtime_contract: 'sha256:57995ea2061611562391ab2fb625760d541167613f7ac8769b83039ca2b7c6bf',
    schedules_runtime_contract: 'sha256:4c94261b254d49ed59b71478da33b5ed0bc72dee7055c4d3641889839bbc4a38',
    search_attribute_runtime_contract: 'sha256:90c2e5b9fffd0a0be166a354d6d897d0b29b547f60afa00e7925ae1defc626ed',
    signal_query_runtime_contract: 'sha256:12c2395791d1ef5897fba360f5797666bf78eaf4ae270786f294c1b80e0432dd',
    skew_refusal_matrix_contract: 'sha256:05eafce72332f995d9a940db9c2cb45e121ff9fef5336505e7ccb84e4ef7b64f',
    worker_versioning_runtime_contract: 'sha256:3fe961e732c338530e4a2d1b3b4d8f9e66144141eb8796f130ba77f045db5454',
  },
  20: {
    child_workflow_runtime_contract: 'sha256:9d8db2784110771778af0ff0a03de13bf5f0243b2be6d69080e013e602476072',
    history_replay_bundles: 'sha256:0a7b52919c7dd44b80a559324c7cdda563744385729fd67cedafe082f2af36e8',
    migration_runtime_contract: 'sha256:ef15f359dc6bb89e21f667cf7a7812079069228a00bfccb637645dac49739890',
    namespace_runtime_contract: 'sha256:36a4abd574cfa4a920b0838e44fe9d6a991b0b69b064bc4a8ddf8b295714c7e9',
    prerelease_readiness_contract: 'sha256:1846068e84ca06074607d319438a95cbb13d017aec15fa4cbd5895fb1e253c9f',
    saga_runtime_contract: 'sha256:57995ea2061611562391ab2fb625760d541167613f7ac8769b83039ca2b7c6bf',
    schedules_runtime_contract: 'sha256:4c94261b254d49ed59b71478da33b5ed0bc72dee7055c4d3641889839bbc4a38',
    search_attribute_runtime_contract: 'sha256:90c2e5b9fffd0a0be166a354d6d897d0b29b547f60afa00e7925ae1defc626ed',
    signal_query_runtime_contract: 'sha256:12c2395791d1ef5897fba360f5797666bf78eaf4ae270786f294c1b80e0432dd',
    skew_refusal_matrix_contract: 'sha256:05eafce72332f995d9a940db9c2cb45e121ff9fef5336505e7ccb84e4ef7b64f',
    worker_versioning_runtime_contract: 'sha256:1cb69759ed48277d95404aef9701c07f998b688811b1d48ca457b65a8c1e9fdc',
  },
  21: {
    child_workflow_runtime_contract: 'sha256:9d8db2784110771778af0ff0a03de13bf5f0243b2be6d69080e013e602476072',
    history_replay_bundles: 'sha256:0a7b52919c7dd44b80a559324c7cdda563744385729fd67cedafe082f2af36e8',
    migration_runtime_contract: 'sha256:ef15f359dc6bb89e21f667cf7a7812079069228a00bfccb637645dac49739890',
    namespace_runtime_contract: 'sha256:36a4abd574cfa4a920b0838e44fe9d6a991b0b69b064bc4a8ddf8b295714c7e9',
    prerelease_readiness_contract: 'sha256:1846068e84ca06074607d319438a95cbb13d017aec15fa4cbd5895fb1e253c9f',
    principal_attribution_contract: 'sha256:261b1b7918b8fa372f558d63ed0ecc95ee17fd06e3ca9f16a585bc8d40032ed5',
    saga_runtime_contract: 'sha256:57995ea2061611562391ab2fb625760d541167613f7ac8769b83039ca2b7c6bf',
    schedules_runtime_contract: 'sha256:4c94261b254d49ed59b71478da33b5ed0bc72dee7055c4d3641889839bbc4a38',
    search_attribute_runtime_contract: 'sha256:90c2e5b9fffd0a0be166a354d6d897d0b29b547f60afa00e7925ae1defc626ed',
    signal_query_runtime_contract: 'sha256:12c2395791d1ef5897fba360f5797666bf78eaf4ae270786f294c1b80e0432dd',
    skew_refusal_matrix_contract: 'sha256:05eafce72332f995d9a940db9c2cb45e121ff9fef5336505e7ccb84e4ef7b64f',
    worker_versioning_runtime_contract: 'sha256:1cb69759ed48277d95404aef9701c07f998b688811b1d48ca457b65a8c1e9fdc',
  },
  22: {
    child_workflow_runtime_contract: 'sha256:9d8db2784110771778af0ff0a03de13bf5f0243b2be6d69080e013e602476072',
    history_replay_bundles: 'sha256:0a7b52919c7dd44b80a559324c7cdda563744385729fd67cedafe082f2af36e8',
    migration_runtime_contract: 'sha256:ef15f359dc6bb89e21f667cf7a7812079069228a00bfccb637645dac49739890',
    namespace_runtime_contract: 'sha256:36a4abd574cfa4a920b0838e44fe9d6a991b0b69b064bc4a8ddf8b295714c7e9',
    prerelease_readiness_contract: 'sha256:1846068e84ca06074607d319438a95cbb13d017aec15fa4cbd5895fb1e253c9f',
    principal_attribution_contract: 'sha256:868b5750be001b4c0bd8ed6e54b7d2cf41dc6ed830b5f04c0e20b5fa24f366ff',
    saga_runtime_contract: 'sha256:57995ea2061611562391ab2fb625760d541167613f7ac8769b83039ca2b7c6bf',
    schedules_runtime_contract: 'sha256:4c94261b254d49ed59b71478da33b5ed0bc72dee7055c4d3641889839bbc4a38',
    search_attribute_runtime_contract: 'sha256:90c2e5b9fffd0a0be166a354d6d897d0b29b547f60afa00e7925ae1defc626ed',
    signal_query_runtime_contract: 'sha256:12c2395791d1ef5897fba360f5797666bf78eaf4ae270786f294c1b80e0432dd',
    skew_refusal_matrix_contract: 'sha256:05eafce72332f995d9a940db9c2cb45e121ff9fef5336505e7ccb84e4ef7b64f',
    worker_versioning_runtime_contract: 'sha256:1cb69759ed48277d95404aef9701c07f998b688811b1d48ca457b65a8c1e9fdc',
  },
  23: {
    child_workflow_runtime_contract: 'sha256:9d8db2784110771778af0ff0a03de13bf5f0243b2be6d69080e013e602476072',
    history_replay_bundles: 'sha256:0a7b52919c7dd44b80a559324c7cdda563744385729fd67cedafe082f2af36e8',
    migration_runtime_contract: 'sha256:66d72117d43560f4642c07781302f8f848a9967fd07bd5836c81a7a473c1981a',
    namespace_runtime_contract: 'sha256:36a4abd574cfa4a920b0838e44fe9d6a991b0b69b064bc4a8ddf8b295714c7e9',
    prerelease_readiness_contract: 'sha256:1846068e84ca06074607d319438a95cbb13d017aec15fa4cbd5895fb1e253c9f',
    principal_attribution_contract: 'sha256:868b5750be001b4c0bd8ed6e54b7d2cf41dc6ed830b5f04c0e20b5fa24f366ff',
    saga_runtime_contract: 'sha256:57995ea2061611562391ab2fb625760d541167613f7ac8769b83039ca2b7c6bf',
    schedules_runtime_contract: 'sha256:4c94261b254d49ed59b71478da33b5ed0bc72dee7055c4d3641889839bbc4a38',
    search_attribute_runtime_contract: 'sha256:90c2e5b9fffd0a0be166a354d6d897d0b29b547f60afa00e7925ae1defc626ed',
    signal_query_runtime_contract: 'sha256:12c2395791d1ef5897fba360f5797666bf78eaf4ae270786f294c1b80e0432dd',
    skew_refusal_matrix_contract: 'sha256:05eafce72332f995d9a940db9c2cb45e121ff9fef5336505e7ccb84e4ef7b64f',
    worker_versioning_runtime_contract: 'sha256:1cb69759ed48277d95404aef9701c07f998b688811b1d48ca457b65a8c1e9fdc',
  },
  24: {
    child_workflow_runtime_contract: 'sha256:9d8db2784110771778af0ff0a03de13bf5f0243b2be6d69080e013e602476072',
    history_replay_bundles: 'sha256:0a7b52919c7dd44b80a559324c7cdda563744385729fd67cedafe082f2af36e8',
    migration_runtime_contract: 'sha256:66d72117d43560f4642c07781302f8f848a9967fd07bd5836c81a7a473c1981a',
    namespace_runtime_contract: 'sha256:36a4abd574cfa4a920b0838e44fe9d6a991b0b69b064bc4a8ddf8b295714c7e9',
    prerelease_readiness_contract: 'sha256:1846068e84ca06074607d319438a95cbb13d017aec15fa4cbd5895fb1e253c9f',
    principal_attribution_contract: 'sha256:868b5750be001b4c0bd8ed6e54b7d2cf41dc6ed830b5f04c0e20b5fa24f366ff',
    saga_runtime_contract: 'sha256:57995ea2061611562391ab2fb625760d541167613f7ac8769b83039ca2b7c6bf',
    schedules_runtime_contract: 'sha256:4c94261b254d49ed59b71478da33b5ed0bc72dee7055c4d3641889839bbc4a38',
    search_attribute_runtime_contract: 'sha256:90c2e5b9fffd0a0be166a354d6d897d0b29b547f60afa00e7925ae1defc626ed',
    signal_query_runtime_contract: 'sha256:12c2395791d1ef5897fba360f5797666bf78eaf4ae270786f294c1b80e0432dd',
    skew_refusal_matrix_contract: 'sha256:05eafce72332f995d9a940db9c2cb45e121ff9fef5336505e7ccb84e4ef7b64f',
    worker_versioning_runtime_contract: 'sha256:894e20bff8883f96c3b71e9248edc7d9867109a69dba4ec1b585522cf7c15d72',
  },
  25: {
    child_workflow_runtime_contract: 'sha256:9d8db2784110771778af0ff0a03de13bf5f0243b2be6d69080e013e602476072',
    history_replay_bundles: 'sha256:0a7b52919c7dd44b80a559324c7cdda563744385729fd67cedafe082f2af36e8',
    migration_runtime_contract: 'sha256:214fe8b375827989f24209694d8482273764dc9b6a20c65ee046376334de212f',
    namespace_runtime_contract: 'sha256:36a4abd574cfa4a920b0838e44fe9d6a991b0b69b064bc4a8ddf8b295714c7e9',
    prerelease_readiness_contract: 'sha256:1846068e84ca06074607d319438a95cbb13d017aec15fa4cbd5895fb1e253c9f',
    principal_attribution_contract: 'sha256:868b5750be001b4c0bd8ed6e54b7d2cf41dc6ed830b5f04c0e20b5fa24f366ff',
    saga_runtime_contract: 'sha256:57995ea2061611562391ab2fb625760d541167613f7ac8769b83039ca2b7c6bf',
    schedules_runtime_contract: 'sha256:4c94261b254d49ed59b71478da33b5ed0bc72dee7055c4d3641889839bbc4a38',
    search_attribute_runtime_contract: 'sha256:90c2e5b9fffd0a0be166a354d6d897d0b29b547f60afa00e7925ae1defc626ed',
    signal_query_runtime_contract: 'sha256:12c2395791d1ef5897fba360f5797666bf78eaf4ae270786f294c1b80e0432dd',
    skew_refusal_matrix_contract: 'sha256:05eafce72332f995d9a940db9c2cb45e121ff9fef5336505e7ccb84e4ef7b64f',
    worker_versioning_runtime_contract: 'sha256:894e20bff8883f96c3b71e9248edc7d9867109a69dba4ec1b585522cf7c15d72',
  },
  26: {
    child_workflow_runtime_contract: 'sha256:9d8db2784110771778af0ff0a03de13bf5f0243b2be6d69080e013e602476072',
    history_replay_bundles: 'sha256:0a7b52919c7dd44b80a559324c7cdda563744385729fd67cedafe082f2af36e8',
    migration_runtime_contract: 'sha256:214fe8b375827989f24209694d8482273764dc9b6a20c65ee046376334de212f',
    namespace_runtime_contract: 'sha256:36a4abd574cfa4a920b0838e44fe9d6a991b0b69b064bc4a8ddf8b295714c7e9',
    prerelease_readiness_contract: 'sha256:1846068e84ca06074607d319438a95cbb13d017aec15fa4cbd5895fb1e253c9f',
    principal_attribution_contract: 'sha256:868b5750be001b4c0bd8ed6e54b7d2cf41dc6ed830b5f04c0e20b5fa24f366ff',
    saga_runtime_contract: 'sha256:57995ea2061611562391ab2fb625760d541167613f7ac8769b83039ca2b7c6bf',
    schedules_runtime_contract: 'sha256:4c94261b254d49ed59b71478da33b5ed0bc72dee7055c4d3641889839bbc4a38',
    search_attribute_runtime_contract: 'sha256:90c2e5b9fffd0a0be166a354d6d897d0b29b547f60afa00e7925ae1defc626ed',
    signal_query_runtime_contract: 'sha256:12c2395791d1ef5897fba360f5797666bf78eaf4ae270786f294c1b80e0432dd',
    skew_refusal_matrix_contract: 'sha256:05eafce72332f995d9a940db9c2cb45e121ff9fef5336505e7ccb84e4ef7b64f',
    worker_versioning_runtime_contract: 'sha256:894e20bff8883f96c3b71e9248edc7d9867109a69dba4ec1b585522cf7c15d72',
  },
  27: {
    child_workflow_runtime_contract: 'sha256:9d8db2784110771778af0ff0a03de13bf5f0243b2be6d69080e013e602476072',
    history_replay_bundles: 'sha256:0a7b52919c7dd44b80a559324c7cdda563744385729fd67cedafe082f2af36e8',
    migration_runtime_contract: 'sha256:214fe8b375827989f24209694d8482273764dc9b6a20c65ee046376334de212f',
    namespace_runtime_contract: 'sha256:36a4abd574cfa4a920b0838e44fe9d6a991b0b69b064bc4a8ddf8b295714c7e9',
    prerelease_readiness_contract: 'sha256:1846068e84ca06074607d319438a95cbb13d017aec15fa4cbd5895fb1e253c9f',
    principal_attribution_contract: 'sha256:868b5750be001b4c0bd8ed6e54b7d2cf41dc6ed830b5f04c0e20b5fa24f366ff',
    saga_runtime_contract: 'sha256:57995ea2061611562391ab2fb625760d541167613f7ac8769b83039ca2b7c6bf',
    schedules_runtime_contract: 'sha256:4c94261b254d49ed59b71478da33b5ed0bc72dee7055c4d3641889839bbc4a38',
    search_attribute_runtime_contract: 'sha256:90c2e5b9fffd0a0be166a354d6d897d0b29b547f60afa00e7925ae1defc626ed',
    signal_query_runtime_contract: 'sha256:12c2395791d1ef5897fba360f5797666bf78eaf4ae270786f294c1b80e0432dd',
    skew_refusal_matrix_contract: 'sha256:05eafce72332f995d9a940db9c2cb45e121ff9fef5336505e7ccb84e4ef7b64f',
    workflow_update_runtime_contract: 'sha256:63d351edd9b307f75b107d4bf2354523caaa6f1da89570c59e0cb55d4f8d66eb',
    worker_versioning_runtime_contract: 'sha256:894e20bff8883f96c3b71e9248edc7d9867109a69dba4ec1b585522cf7c15d72',
  },
  28: {
    child_workflow_runtime_contract: 'sha256:9d8db2784110771778af0ff0a03de13bf5f0243b2be6d69080e013e602476072',
    history_replay_bundles: 'sha256:0a7b52919c7dd44b80a559324c7cdda563744385729fd67cedafe082f2af36e8',
    migration_runtime_contract: 'sha256:275b32e9f0e6a9690e0dbda6a65a0056fc9f937de21183bb69071949302cfba7',
    namespace_runtime_contract: 'sha256:36a4abd574cfa4a920b0838e44fe9d6a991b0b69b064bc4a8ddf8b295714c7e9',
    prerelease_readiness_contract: 'sha256:1846068e84ca06074607d319438a95cbb13d017aec15fa4cbd5895fb1e253c9f',
    principal_attribution_contract: 'sha256:868b5750be001b4c0bd8ed6e54b7d2cf41dc6ed830b5f04c0e20b5fa24f366ff',
    saga_runtime_contract: 'sha256:57995ea2061611562391ab2fb625760d541167613f7ac8769b83039ca2b7c6bf',
    schedules_runtime_contract: 'sha256:4c94261b254d49ed59b71478da33b5ed0bc72dee7055c4d3641889839bbc4a38',
    search_attribute_runtime_contract: 'sha256:90c2e5b9fffd0a0be166a354d6d897d0b29b547f60afa00e7925ae1defc626ed',
    signal_query_runtime_contract: 'sha256:12c2395791d1ef5897fba360f5797666bf78eaf4ae270786f294c1b80e0432dd',
    skew_refusal_matrix_contract: 'sha256:05eafce72332f995d9a940db9c2cb45e121ff9fef5336505e7ccb84e4ef7b64f',
    workflow_update_runtime_contract: 'sha256:63d351edd9b307f75b107d4bf2354523caaa6f1da89570c59e0cb55d4f8d66eb',
    worker_versioning_runtime_contract: 'sha256:894e20bff8883f96c3b71e9248edc7d9867109a69dba4ec1b585522cf7c15d72',
  },
  29: {
    child_workflow_runtime_contract: 'sha256:9d8db2784110771778af0ff0a03de13bf5f0243b2be6d69080e013e602476072',
    history_replay_bundles: 'sha256:0a7b52919c7dd44b80a559324c7cdda563744385729fd67cedafe082f2af36e8',
    migration_runtime_contract: 'sha256:275b32e9f0e6a9690e0dbda6a65a0056fc9f937de21183bb69071949302cfba7',
    namespace_runtime_contract: 'sha256:36a4abd574cfa4a920b0838e44fe9d6a991b0b69b064bc4a8ddf8b295714c7e9',
    prerelease_readiness_contract: 'sha256:1846068e84ca06074607d319438a95cbb13d017aec15fa4cbd5895fb1e253c9f',
    principal_attribution_contract: 'sha256:868b5750be001b4c0bd8ed6e54b7d2cf41dc6ed830b5f04c0e20b5fa24f366ff',
    saga_runtime_contract: 'sha256:57995ea2061611562391ab2fb625760d541167613f7ac8769b83039ca2b7c6bf',
    schedules_runtime_contract: 'sha256:4c94261b254d49ed59b71478da33b5ed0bc72dee7055c4d3641889839bbc4a38',
    search_attribute_runtime_contract: 'sha256:90c2e5b9fffd0a0be166a354d6d897d0b29b547f60afa00e7925ae1defc626ed',
    signal_query_runtime_contract: 'sha256:12c2395791d1ef5897fba360f5797666bf78eaf4ae270786f294c1b80e0432dd',
    skew_refusal_matrix_contract: 'sha256:05eafce72332f995d9a940db9c2cb45e121ff9fef5336505e7ccb84e4ef7b64f',
    workflow_update_runtime_contract: 'sha256:63d351edd9b307f75b107d4bf2354523caaa6f1da89570c59e0cb55d4f8d66eb',
    worker_versioning_runtime_contract: 'sha256:894e20bff8883f96c3b71e9248edc7d9867109a69dba4ec1b585522cf7c15d72',
  },
};
VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[30] = {
  ...VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[29],
  schedules_runtime_contract: 'sha256:beb40e9a5f5ae29753bd376bf6f41e6bbb36e2f7d4f4efb5c3ed049b2a7535db',
  skew_refusal_matrix_contract: 'sha256:70dd1330c455bbc475d2a3686828df5d9f8485c2fc7a850253615875b506127f',
  worker_versioning_runtime_contract: 'sha256:45c19aa0fb6295fd7908fc31e50760929d60f3dd13fc6a73f8608efacd068448',
  workflow_update_runtime_contract: 'sha256:f9f4caeaa090eb315a0999fb5d259b5f3874235d900a4919278acdf9aa3968c3',
  saga_runtime_contract: 'sha256:180626d80b7c73e13a21f19353262872323cbc9186b07091256a3b5f7361a587',
  migration_runtime_contract: 'sha256:3f6ff4c5576f776a2de1676c1e45bc7dc5b8d320d1126587b075a9331c27ef20',
};
VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[31] = {
  ...VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[30],
  skew_refusal_matrix_contract: 'sha256:4f753e5b742758b67587fb79520b46166ba00283636eb7ab9fbfe5a6ad938b1a',
  principal_attribution_contract: 'sha256:84ae71e4f7b1572ca4f40818119b0620aeb1ae2517130ad84c0a7a8f5d7ee181',
};
VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[32] = {
  ...VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[31],
  prerelease_readiness_contract: 'sha256:08e165a221d3fc3e42c64e8a29519d6ec8932e4383ab624c8460fc74134d814c',
};
VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[33] = {
  ...VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[32],
  workflow_update_runtime_contract: 'sha256:425f5cdd164ff5ea8d3efa5904759d1029e89acdbc0d499b779be244bc3aca02',
};
VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[34] =
  VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[33];
VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[35] =
  VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[34];
VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[36] =
  VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[35];
VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[37] = {
  ...VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[36],
  prerelease_readiness_contract:
    'sha256:7b8e25052de6e3d6a539100b8580ba950e48f973d577f57955d57158d1493480',
};
VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[38] =
  VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[37];
VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[39] =
  VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[38];
VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[40] =
  VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[39];
VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[41] =
  VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[40];
const VERSIONED_PASS_FAIL_RULES = {
  5: {
    guaranteed_field_equality: {
      rule: "Every field marked guaranteed in the fixture's schema must be present, type-correct, and value-equal in the implementation's response. Diagnostic-only fields are ignored.",
      follows: 'durable-workflow.v2.surface-stability.contract#field_visibility_rule',
    },
    unknown_additive_fields_tolerated: {
      rule: 'An implementation that emits extra fields not present in the fixture passes if and only if those fields are documented diagnostic-only or the fixture is on a stability level that allows additive evolution.',
    },
    frozen_shape_exact_match: {
      rule: 'Fixtures backed by a frozen surface family must match exactly. There is no diagnostic-only allowance for frozen shapes; a frozen-shape mismatch is always a fail.',
      applies_to_categories: [
        'history_replay_bundles',
      ],
    },
    required_fixtures_must_pass: {
      rule: 'A release that claims a target must pass every required fixture category for that target. One failed required fixture means the release does not conform for that target.',
    },
    stable_runtime_scenario_coverage: {
      rule: 'A stable runtime fixture category must report every required scenario it declares with one of the statuses published by its runtime scenario manifest: pass, fail, unsupported, not_covered, or runner_blocked. Full conformance requires every required scenario to pass. A smoke-only subset, omitted scenario, unsupported public surface, uncovered cell, or runner-blocked cell is nonconforming and must link the owning finding.',
      applies_to_categories: [
        'signal_query_runtime_contract',
        'history_replay_bundles',
      ],
    },
    provisional_categories_warn_only: {
      rule: 'A failed fixture in a provisional category emits a warning in the harness output and does not block the release. The category becomes load-bearing when promoted to stable in a later suite version.',
    },
    diagnostic_only_mismatches_pass: {
      rule: 'If only diagnostic-only fields differ, the harness records the difference in its diagnostic_diff output and the fixture passes.',
    },
  },
  6: {
    guaranteed_field_equality: {
      rule: "Every field marked guaranteed in the fixture's schema must be present, type-correct, and value-equal in the implementation's response. Diagnostic-only fields are ignored.",
      follows: 'durable-workflow.v2.surface-stability.contract#field_visibility_rule',
    },
    unknown_additive_fields_tolerated: {
      rule: 'An implementation that emits extra fields not present in the fixture passes if and only if those fields are documented diagnostic-only or the fixture is on a stability level that allows additive evolution.',
    },
    frozen_shape_exact_match: {
      rule: 'Fixtures backed by a frozen surface family must match exactly. There is no diagnostic-only allowance for frozen shapes; a frozen-shape mismatch is always a fail.',
      applies_to_categories: [
        'history_replay_bundles',
      ],
    },
    required_fixtures_must_pass: {
      rule: 'A release that claims a target must pass every required fixture category for that target. One failed required fixture means the release does not conform for that target.',
    },
    stable_runtime_scenario_coverage: {
      rule: 'A stable runtime fixture category must report every required scenario it declares with one of the statuses published by its runtime scenario manifest: pass, fail, unsupported, not_covered, or runner_blocked. Full conformance requires every required scenario to pass. A smoke-only subset, omitted scenario, unsupported public surface, uncovered cell, or runner-blocked cell is nonconforming and must link the owning finding.',
      applies_to_categories: [
        'signal_query_runtime_contract',
        'history_replay_bundles',
        'namespace_runtime_contract',
      ],
    },
    provisional_categories_warn_only: {
      rule: 'A failed fixture in a provisional category emits a warning in the harness output and does not block the release. The category becomes load-bearing when promoted to stable in a later suite version.',
    },
    diagnostic_only_mismatches_pass: {
      rule: 'If only diagnostic-only fields differ, the harness records the difference in its diagnostic_diff output and the fixture passes.',
    },
  },
  7: {
    guaranteed_field_equality: {
      rule: "Every field marked guaranteed in the fixture's schema must be present, type-correct, and value-equal in the implementation's response. Diagnostic-only fields are ignored.",
      follows: 'durable-workflow.v2.surface-stability.contract#field_visibility_rule',
    },
    unknown_additive_fields_tolerated: {
      rule: 'An implementation that emits extra fields not present in the fixture passes if and only if those fields are documented diagnostic-only or the fixture is on a stability level that allows additive evolution.',
    },
    frozen_shape_exact_match: {
      rule: 'Fixtures backed by a frozen surface family must match exactly. There is no diagnostic-only allowance for frozen shapes; a frozen-shape mismatch is always a fail.',
      applies_to_categories: [
        'history_replay_bundles',
      ],
    },
    required_fixtures_must_pass: {
      rule: 'A release that claims a target must pass every required fixture category for that target. One failed required fixture means the release does not conform for that target.',
    },
    stable_runtime_scenario_coverage: {
      rule: 'A stable runtime fixture category must report every required scenario it declares with one of the statuses published by its runtime scenario manifest: pass, fail, unsupported, not_covered, or runner_blocked. Full conformance requires every required scenario to pass. A smoke-only subset, omitted scenario, unsupported public surface, uncovered cell, or runner-blocked cell is nonconforming and must link the owning finding.',
      applies_to_categories: [
        'signal_query_runtime_contract',
        'history_replay_bundles',
        'namespace_runtime_contract',
        'child_workflow_runtime_contract',
      ],
    },
    provisional_categories_warn_only: {
      rule: 'A failed fixture in a provisional category emits a warning in the harness output and does not block the release. The category becomes load-bearing when promoted to stable in a later suite version.',
    },
    diagnostic_only_mismatches_pass: {
      rule: 'If only diagnostic-only fields differ, the harness records the difference in its diagnostic_diff output and the fixture passes.',
    },
  },
};
// Suites 8 and 9 change runtime scenario criteria only; pass/fail rules stay
// at suite 7 semantics.
VERSIONED_PASS_FAIL_RULES[8] = VERSIONED_PASS_FAIL_RULES[7];
VERSIONED_PASS_FAIL_RULES[9] = VERSIONED_PASS_FAIL_RULES[8];
VERSIONED_PASS_FAIL_RULES[10] = {
  ...VERSIONED_PASS_FAIL_RULES[9],
  stable_runtime_scenario_coverage: {
    ...VERSIONED_PASS_FAIL_RULES[9].stable_runtime_scenario_coverage,
    applies_to_categories: [
      'signal_query_runtime_contract',
      'search_attribute_runtime_contract',
      'history_replay_bundles',
      'namespace_runtime_contract',
      'child_workflow_runtime_contract',
    ],
  },
};
VERSIONED_PASS_FAIL_RULES[11] = {
  ...VERSIONED_PASS_FAIL_RULES[10],
  stable_runtime_scenario_coverage: {
    ...VERSIONED_PASS_FAIL_RULES[10].stable_runtime_scenario_coverage,
    applies_to_categories: [
      'signal_query_runtime_contract',
      'search_attribute_runtime_contract',
      'history_replay_bundles',
      'namespace_runtime_contract',
      'child_workflow_runtime_contract',
      'worker_versioning_runtime_contract',
    ],
  },
};
VERSIONED_PASS_FAIL_RULES[12] = {
  ...VERSIONED_PASS_FAIL_RULES[11],
  stable_runtime_scenario_coverage: {
    ...VERSIONED_PASS_FAIL_RULES[11].stable_runtime_scenario_coverage,
    applies_to_categories: [
      'signal_query_runtime_contract',
      'search_attribute_runtime_contract',
      'history_replay_bundles',
      'namespace_runtime_contract',
      'child_workflow_runtime_contract',
      'worker_versioning_runtime_contract',
      'saga_runtime_contract',
    ],
  },
};
VERSIONED_PASS_FAIL_RULES[13] = {
  ...VERSIONED_PASS_FAIL_RULES[12],
  stable_runtime_scenario_coverage: {
    ...VERSIONED_PASS_FAIL_RULES[12].stable_runtime_scenario_coverage,
    applies_to_categories: [
      'signal_query_runtime_contract',
      'search_attribute_runtime_contract',
      'history_replay_bundles',
      'namespace_runtime_contract',
      'child_workflow_runtime_contract',
      'worker_versioning_runtime_contract',
      'saga_runtime_contract',
      'migration_runtime_contract',
    ],
  },
};
VERSIONED_PASS_FAIL_RULES[14] = {
  ...VERSIONED_PASS_FAIL_RULES[13],
  stable_runtime_scenario_coverage: {
    ...VERSIONED_PASS_FAIL_RULES[13].stable_runtime_scenario_coverage,
    applies_to_categories: [
      'signal_query_runtime_contract',
      'search_attribute_runtime_contract',
      'history_replay_bundles',
      'namespace_runtime_contract',
      'child_workflow_runtime_contract',
      'worker_versioning_runtime_contract',
      'saga_runtime_contract',
      'migration_runtime_contract',
      'prerelease_readiness_contract',
    ],
  },
};
VERSIONED_PASS_FAIL_RULES[15] = {
  ...VERSIONED_PASS_FAIL_RULES[14],
  stable_runtime_scenario_coverage: {
    ...VERSIONED_PASS_FAIL_RULES[14].stable_runtime_scenario_coverage,
    applies_to_categories: [
      'signal_query_runtime_contract',
      'search_attribute_runtime_contract',
      'history_replay_bundles',
      'namespace_runtime_contract',
      'child_workflow_runtime_contract',
      'worker_versioning_runtime_contract',
      'saga_runtime_contract',
      'migration_runtime_contract',
      'skew_refusal_matrix_contract',
      'prerelease_readiness_contract',
    ],
  },
};
VERSIONED_PASS_FAIL_RULES[16] = VERSIONED_PASS_FAIL_RULES[15];
VERSIONED_PASS_FAIL_RULES[17] = VERSIONED_PASS_FAIL_RULES[16];
VERSIONED_PASS_FAIL_RULES[18] = VERSIONED_PASS_FAIL_RULES[17];
VERSIONED_PASS_FAIL_RULES[19] = {
  ...VERSIONED_PASS_FAIL_RULES[18],
  stable_runtime_scenario_coverage: {
    ...VERSIONED_PASS_FAIL_RULES[18].stable_runtime_scenario_coverage,
    applies_to_categories: [
      'signal_query_runtime_contract',
      'search_attribute_runtime_contract',
      'schedules_runtime_contract',
      'history_replay_bundles',
      'namespace_runtime_contract',
      'child_workflow_runtime_contract',
      'worker_versioning_runtime_contract',
      'saga_runtime_contract',
      'migration_runtime_contract',
      'skew_refusal_matrix_contract',
      'prerelease_readiness_contract',
    ],
  },
};
VERSIONED_PASS_FAIL_RULES[20] = VERSIONED_PASS_FAIL_RULES[19];
VERSIONED_PASS_FAIL_RULES[21] = {
  ...VERSIONED_PASS_FAIL_RULES[20],
  stable_runtime_scenario_coverage: {
    ...VERSIONED_PASS_FAIL_RULES[20].stable_runtime_scenario_coverage,
    applies_to_categories: [
      'signal_query_runtime_contract',
      'search_attribute_runtime_contract',
      'schedules_runtime_contract',
      'history_replay_bundles',
      'namespace_runtime_contract',
      'child_workflow_runtime_contract',
      'worker_versioning_runtime_contract',
      'saga_runtime_contract',
      'migration_runtime_contract',
      'skew_refusal_matrix_contract',
      'principal_attribution_contract',
      'prerelease_readiness_contract',
    ],
  },
};
VERSIONED_PASS_FAIL_RULES[22] = VERSIONED_PASS_FAIL_RULES[21];
VERSIONED_PASS_FAIL_RULES[23] = VERSIONED_PASS_FAIL_RULES[22];
VERSIONED_PASS_FAIL_RULES[24] = VERSIONED_PASS_FAIL_RULES[23];
VERSIONED_PASS_FAIL_RULES[25] = VERSIONED_PASS_FAIL_RULES[24];
VERSIONED_PASS_FAIL_RULES[26] = VERSIONED_PASS_FAIL_RULES[25];
VERSIONED_PASS_FAIL_RULES[27] = {
  ...VERSIONED_PASS_FAIL_RULES[26],
  stable_runtime_scenario_coverage: {
    ...VERSIONED_PASS_FAIL_RULES[26].stable_runtime_scenario_coverage,
    applies_to_categories: [
      'signal_query_runtime_contract',
      'workflow_update_runtime_contract',
      'search_attribute_runtime_contract',
      'schedules_runtime_contract',
      'history_replay_bundles',
      'namespace_runtime_contract',
      'child_workflow_runtime_contract',
      'worker_versioning_runtime_contract',
      'saga_runtime_contract',
      'migration_runtime_contract',
      'skew_refusal_matrix_contract',
      'principal_attribution_contract',
      'prerelease_readiness_contract',
    ],
  },
};
VERSIONED_PASS_FAIL_RULES[28] = VERSIONED_PASS_FAIL_RULES[27];
VERSIONED_PASS_FAIL_RULES[29] = VERSIONED_PASS_FAIL_RULES[28];
VERSIONED_PASS_FAIL_RULES[30] = VERSIONED_PASS_FAIL_RULES[29];
VERSIONED_PASS_FAIL_RULES[31] = VERSIONED_PASS_FAIL_RULES[30];
VERSIONED_PASS_FAIL_RULES[32] = VERSIONED_PASS_FAIL_RULES[31];
VERSIONED_PASS_FAIL_RULES[33] = VERSIONED_PASS_FAIL_RULES[32];
VERSIONED_PASS_FAIL_RULES[34] = VERSIONED_PASS_FAIL_RULES[33];
VERSIONED_PASS_FAIL_RULES[35] = VERSIONED_PASS_FAIL_RULES[34];
VERSIONED_PASS_FAIL_RULES[36] = VERSIONED_PASS_FAIL_RULES[35];
VERSIONED_PASS_FAIL_RULES[37] = VERSIONED_PASS_FAIL_RULES[36];
VERSIONED_PASS_FAIL_RULES[38] = VERSIONED_PASS_FAIL_RULES[37];
VERSIONED_PASS_FAIL_RULES[39] = VERSIONED_PASS_FAIL_RULES[38];
VERSIONED_PASS_FAIL_RULES[40] = VERSIONED_PASS_FAIL_RULES[39];
VERSIONED_PASS_FAIL_RULES[41] = VERSIONED_PASS_FAIL_RULES[40];
const EXPECTED_AUTHORITY_DOC = 'docs/platform-conformance.md';
const EXPECTED_DOC_ID = 'platform-conformance';

const REQUIRED_TOP_LEVEL_KEYS = [
  'schema',
  'version',
  'authority_doc',
  'authority_url',
  'surface_stability_authority',
  'result_schema',
  'result_version',
  'source_dependencies',
  'conformance_levels',
  'conformance_authorities',
  'targets',
  'fixture_catalog',
  'pass_fail_rules',
  'harness_contract',
  'release_gates',
];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function loadJson(file, label) {
  let raw;
  try {
    raw = read(file);
  } catch (err) {
    throw new Error(`${label} is missing at ${file}.`);
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label} is not valid JSON: ${err.message}`);
  }
}

function stripTrailingSlash(value) {
  return value.length > 1 ? value.replace(/\/$/, '') : value;
}

function joinRoute(prefix, docId) {
  const normalizedPrefix = stripTrailingSlash(prefix);
  const normalizedDocId = docId.replace(/^\/+/, '').replace(/\/$/, '');

  if (!normalizedDocId) {
    return normalizedPrefix;
  }

  return `${normalizedPrefix}/${normalizedDocId}`;
}

function getDocsVersionPaths() {
  const configContent = read(configPath);
  const versionBlockMatch = configContent.match(/versions:\s*\{([\s\S]*?)\n\s*\},\n\s*\},/);
  const versionBlock = versionBlockMatch ? versionBlockMatch[1] : configContent;
  const currentPathMatch = versionBlock.match(/current:\s*\{[^}]*path:\s*['"]([^'"]*)['"]/);

  return {
    current: currentPathMatch ? currentPathMatch[1] : '',
  };
}

function currentDocsRoutePrefix() {
  const currentPath = getDocsVersionPaths().current;

  return currentPath ? `/docs/${currentPath}` : '/docs';
}

function expectedAuthorityUrl() {
  return `https://durable-workflow.github.io${routeForDocPath(EXPECTED_AUTHORITY_DOC)}`;
}

function routeForDocPath(
  docPath,
  label = 'static/platform-conformance-contract.json authority_doc',
) {
  if (!docPath.startsWith('docs/')) {
    throw new Error(
      `${label} must point ` +
        `inside docs/ (got "${docPath}").`,
    );
  }

  if (!/\.(md|mdx)$/.test(docPath)) {
    throw new Error(
      `${label} must point ` +
        `at a Markdown docs page (got "${docPath}").`,
    );
  }

  const relative = docPath
    .slice('docs/'.length)
    .replace(/\.(md|mdx)$/, '')
    .replace(/\/index$/, '');

  return joinRoute(currentDocsRoutePrefix(), relative);
}

function resolveRouteToDocPath(
  route,
  label = 'static/platform-conformance-contract.json authority_url',
) {
  if (!route.startsWith('/docs/')) {
    throw new Error(
      `${label} must use a ` +
        `/docs/ route (got "${route}").`,
    );
  }

  const normalizedRoute = stripTrailingSlash(route);
  const currentPrefix = currentDocsRoutePrefix();

  if (
    normalizedRoute !== currentPrefix &&
    !normalizedRoute.startsWith(`${currentPrefix}/`)
  ) {
    throw new Error(
      `${label} must point ` +
        `at the configured current-version docs route ${currentPrefix} ` +
        `(got "${route}").`,
    );
  }

  const docId = normalizedRoute
    .slice(currentPrefix.length)
    .replace(/^\//, '');
  const candidates = [
    path.join(docsDir, `${docId}.md`),
    path.join(docsDir, `${docId}.mdx`),
    path.join(docsDir, docId, 'index.md'),
    path.join(docsDir, docId, 'index.mdx'),
  ];

  const resolved = candidates.find(candidate => fs.existsSync(candidate));
  if (!resolved) {
    throw new Error(
      `${label} route ` +
        `${route} does not resolve to a docs-site page.`,
    );
  }

  return path.relative(repoRoot, resolved).split(path.sep).join('/');
}

function assertCanonicalDocsSiteUrl(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }

  if (value !== value.trim()) {
    throw new Error(`${label} must not include leading or trailing whitespace.`);
  }

  let url;
  try {
    url = new URL(value);
  } catch (err) {
    throw new Error(
      `${label} must be an absolute https://durable-workflow.github.io ` +
        `docs URL (got "${value}").`,
    );
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'durable-workflow.github.io'
  ) {
    throw new Error(
      `${label} must be an https://durable-workflow.github.io docs URL ` +
        `(got "${value}").`,
    );
  }

  if (url.search || url.hash) {
    throw new Error(`${label} must not include query strings or fragments.`);
  }

  const docPath = resolveRouteToDocPath(url.pathname, label);
  const canonical =
    `https://durable-workflow.github.io${routeForDocPath(docPath, label)}`;

  if (value !== canonical) {
    throw new Error(
      `${label} must use canonical docs URL ${canonical} (got "${value}").`,
    );
  }

  return { docPath, url };
}

function collectSidebarDocIds(item, docIds) {
  if (typeof item === 'string') {
    docIds.add(item);
    return;
  }

  if (!item || typeof item !== 'object') {
    return;
  }

  if (item.type === 'doc') {
    docIds.add(item.id);
    return;
  }

  if (item.type === 'category') {
    for (const child of item.items || []) {
      collectSidebarDocIds(child, docIds);
    }
  }
}

function assertDocIsInSidebar() {
  const sidebars = require(sidebarsPath);
  const docIds = new Set();

  for (const item of sidebars.tutorialSidebar || []) {
    collectSidebarDocIds(item, docIds);
  }

  if (!docIds.has(EXPECTED_DOC_ID)) {
    throw new Error(
      `sidebars.js must include "${EXPECTED_DOC_ID}" so the platform ` +
        `conformance authority is published in the docs navigation.`,
    );
  }
}

function assertContractAuthorityResolves(contract) {
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in contract)) {
      throw new Error(
        `static/platform-conformance-contract.json must include top-level key "${key}"`,
      );
    }
  }

  if (contract.schema !== EXPECTED_SCHEMA) {
    throw new Error(
      `static/platform-conformance-contract.json schema must be ` +
        `"${EXPECTED_SCHEMA}" (got "${contract.schema}")`,
    );
  }

  if (typeof contract.version !== 'number' || contract.version < 1) {
    throw new Error(
      `static/platform-conformance-contract.json version must be a positive integer ` +
        `(got ${JSON.stringify(contract.version)})`,
    );
  }

  const expected = expectedAuthorityUrl();
  if (contract.authority_url !== expected) {
    throw new Error(
      `static/platform-conformance-contract.json authority_url must point at ` +
        `${expected} (got "${contract.authority_url}")`,
    );
  }

  if (contract.authority_doc !== EXPECTED_AUTHORITY_DOC) {
    throw new Error(
      `static/platform-conformance-contract.json authority_doc must point at ` +
        `${EXPECTED_AUTHORITY_DOC} (got "${contract.authority_doc}")`,
    );
  }

  const authorityUrl = new URL(contract.authority_url);
  if (
    authorityUrl.protocol !== 'https:' ||
    authorityUrl.hostname !== 'durable-workflow.github.io'
  ) {
    throw new Error(
      `static/platform-conformance-contract.json authority_url must be an ` +
        `https://durable-workflow.github.io docs URL.`,
    );
  }

  const resolvedFromUrl = resolveRouteToDocPath(authorityUrl.pathname);
  if (resolvedFromUrl !== contract.authority_doc) {
    throw new Error(
      `static/platform-conformance-contract.json authority_url resolves to ` +
        `${resolvedFromUrl}, but authority_doc is ${contract.authority_doc}.`,
    );
  }

  const routeFromDoc = routeForDocPath(contract.authority_doc);
  if (routeFromDoc !== authorityUrl.pathname) {
    throw new Error(
      `static/platform-conformance-contract.json authority_doc resolves to ` +
        `${routeFromDoc}, but authority_url is ${authorityUrl.pathname}.`,
    );
  }

  for (const forbidden of [
    'docs/architecture/platform-conformance-suite.md',
    'docs/1.x/platform-conformance',
    'github.com/durable-workflow/workflow/blob/v2/docs/architecture/platform-conformance-suite.md',
  ]) {
    if (
      String(contract.authority_doc).includes(forbidden) ||
      String(contract.authority_url).includes(forbidden)
    ) {
      throw new Error(
        `static/platform-conformance-contract.json must not advertise stale ` +
          `authority pointer ${forbidden}.`,
      );
    }
  }
}

function assertArrayOfStrings(contract, key, expected) {
  const actual = contract[key];
  if (!Array.isArray(actual)) {
    throw new Error(`static/platform-conformance-contract.json ${key} must be an array.`);
  }

  for (const value of expected) {
    if (!actual.includes(value)) {
      throw new Error(
        `static/platform-conformance-contract.json ${key} must include "${value}".`,
      );
    }
  }
}

function assertVersionedSuiteAuthorityDigest(contract) {
  const expected = VERSIONED_SUITE_AUTHORITY_DIGESTS[contract.version];

  if (!expected) {
    throw new Error(
      `scripts/check-platform-conformance-authority.js must declare a complete ` +
        `suite authority digest for version ${contract.version}.`,
    );
  }

  const actual =
    'sha256:' +
    crypto.createHash('sha256').update(stableJson(contract)).digest('hex');

  if (actual !== expected) {
    throw new Error(
      `static/platform-conformance-contract.json semantic digest ${actual} ` +
        `must match suite-versioned expectation ${expected}. Advance the suite ` +
        `version and add a new digest before changing public suite semantics.`,
    );
  }
}

function sha256(source) {
  return 'sha256:' + crypto.createHash('sha256').update(source).digest('hex');
}

function assertWorkflowPackageAuthorityLock(
  contract,
  lock = loadJson(
    workflowAuthorityLockPath,
    'scripts/workflow-platform-conformance-authority-lock.json',
  ),
  publicAuthority = read(contractPath),
) {
  const expected = {
    schema: 'durable-workflow.docs.workflow-platform-conformance-authority-lock',
    schema_version: 1,
    workflow_package: 'durable-workflow/workflow',
    manifest_path: 'resources/platform-conformance-contract.json',
  };

  for (const [key, value] of Object.entries(expected)) {
    if (lock[key] !== value) {
      throw new Error(
        `Workflow platform-conformance authority lock ${key} must be ` +
          `${JSON.stringify(value)} (got ${JSON.stringify(lock[key])}).`,
      );
    }
  }

  if (!/^2\.0\.0-rc\.\d+$/.test(lock.workflow_version || '')) {
    throw new Error(
      'Workflow platform-conformance authority lock must name an exact ' +
        'Workflow 2.0 release-candidate version.',
    );
  }
  if (!/^[a-f0-9]{40}$/.test(lock.workflow_source_commit || '')) {
    throw new Error(
      'Workflow platform-conformance authority lock must bind an immutable ' +
        '40-character source commit.',
    );
  }
  if (lock.manifest_schema !== contract.schema) {
    throw new Error(
      'Workflow platform-conformance authority lock manifest_schema must ' +
        `match ${contract.schema}.`,
    );
  }
  if (lock.manifest_version !== contract.version) {
    throw new Error(
      'Workflow platform-conformance authority lock manifest_version must ' +
        `match suite version ${contract.version}.`,
    );
  }

  const actualDigest = sha256(publicAuthority);
  if (lock.manifest_sha256 !== actualDigest) {
    throw new Error(
      'static/platform-conformance-contract.json digest must match the exact ' +
        `Workflow package authority lock ${lock.manifest_sha256} ` +
        `(got ${actualDigest}).`,
    );
  }
}

function assertWorkflowPackageMirrorMatches(
  workflowMirrorPath = process.env.WORKFLOW_PLATFORM_CONFORMANCE_MANIFEST_PATH,
) {
  const publicAuthority = read(contractPath);
  const contract = JSON.parse(publicAuthority);
  assertWorkflowPackageAuthorityLock(contract, undefined, publicAuthority);

  if (!workflowMirrorPath) {
    return;
  }

  const workflowMirror = read(workflowMirrorPath);

  if (workflowMirror !== publicAuthority) {
    throw new Error(
      'static/platform-conformance-contract.json must exactly match the ' +
        `published Workflow package mirror at ${workflowMirrorPath}.`,
    );
  }
}

function assertRustSignalQueryAuthority(contract) {
  const expectedArtifact = {
    package: 'durable-workflow',
    version: '2.0.0-rc.5',
    source: 'crates.io',
    cargo_requirement: '=2.0.0-rc.5',
  };
  const expectedContracts = {
    rust_worker_rust_php_python_clients: {
      worker_runtime: 'sdk-rust',
      artifact: expectedArtifact,
      query_state_model: 'snapshot_derived_transport_state',
      caller_paths: ['sdk-rust', 'sdk-php', 'sdk-python'],
    },
    python_worker_rust_client: {
      worker_runtime: 'sdk-python',
      artifact: expectedArtifact,
      rust_role: 'client',
      caller_paths: ['sdk-rust'],
    },
    php_worker_rust_client: {
      worker_runtime: 'sdk-php',
      artifact: expectedArtifact,
      rust_role: 'client',
      caller_paths: ['sdk-rust'],
    },
    rust_query_error_and_immutability: {
      worker_runtime: 'sdk-rust',
      artifact: expectedArtifact,
      query_state_model: 'snapshot_derived_transport_state',
      required_assertions: [
        'unknown_query_has_stable_outcome',
        'malformed_query_payload_has_stable_outcome',
        'unavailable_query_worker_has_stable_outcome',
        'protocol_query_failure_has_stable_outcome',
        'missing_workflow_query_has_stable_outcome',
        'terminal_signal_has_stable_outcome',
        'successful_query_emits_no_workflow_commands',
        'failed_query_emits_no_workflow_commands',
        'successful_query_appends_no_history',
        'failed_query_appends_no_history',
        'failed_query_does_not_change_later_answer',
      ],
    },
    rust_replayed_instance_state_query_after_cold_restart: {
      worker_runtime: 'sdk-rust',
      artifact: expectedArtifact,
      query_state_model: 'replayed_workflow_instance_state',
      lifecycle: [
        'start_running_workflow',
        'query_running_state',
        'cold_stop_rust_worker',
        'start_fresh_rust_worker_process',
        'restore_state_from_durable_history',
        'complete_restored_workflow',
        'query_completed_state',
      ],
      caller_paths: ['sdk-rust', 'sdk-php', 'sdk-python'],
      required_assertions: [
        'callers_observe_equivalent_state_at_each_checkpoint',
        'restored_state_matches_committed_pre_restart_state',
        'completed_state_matches_terminal_workflow_state',
        'successful_replayed_query_emits_no_workflow_commands',
        'failed_replayed_query_emits_no_workflow_commands',
        'successful_replayed_query_appends_no_history',
        'failed_replayed_query_appends_no_history',
        'failed_replayed_query_does_not_change_state_returned_by_later_query',
      ],
    },
  };
  const officialSdk = contract.targets?.official_sdk;
  const signalQuery = contract.fixture_catalog?.signal_query_runtime_contract;

  if (!String(officialSdk?.description).includes('Rust SDK')) {
    throw new Error('targets.official_sdk.description must explicitly name the Rust SDK.');
  }

  assertJsonEqual(
    signalQuery?.required_scenario_contracts,
    expectedContracts,
    'fixture_catalog.signal_query_runtime_contract.required_scenario_contracts',
  );
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function assertJsonEqual(actual, expected, label) {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(
      `${label} must match its suite-versioned expectation. ` +
        `If the pass / fail rule or runtime status semantics changed, ` +
        `advance the suite version and add a new versioned expectation.`,
    );
  }
}

function extractConstObjectLiteral(source, constName, label) {
  const marker = `const ${constName} =`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`${label} must declare ${constName}.`);
  }

  const objectStart = source.indexOf('{', markerIndex + marker.length);
  if (objectStart === -1) {
    throw new Error(`${label} ${constName} declaration must be an object.`);
  }

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = objectStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') {
        lineComment = false;
      }
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(objectStart, index + 1);
      }
    }
  }

  throw new Error(
    `${label} ${constName} declaration must close its object literal.`,
  );
}

function parseConstObjectLiteral(source, constName, label) {
  const objectLiteral = extractConstObjectLiteral(source, constName, label);

  try {
    return vm.runInNewContext(`(${objectLiteral})`, Object.create(null), {
      timeout: 1000,
    });
  } catch (err) {
    throw new Error(
      `${label} ${constName} declaration is not parseable: ${err.message}`,
    );
  }
}

function normalizeRuntimeScenarioCriteriaDigestTable(table, label) {
  if (!table || typeof table !== 'object' || Array.isArray(table)) {
    throw new Error(`${label} must be an object keyed by suite version.`);
  }

  const normalized = {};
  for (const [version, categories] of Object.entries(table)) {
    if (!/^[1-9]\d*$/.test(version)) {
      throw new Error(`${label} has invalid suite version key "${version}".`);
    }

    if (
      !categories ||
      typeof categories !== 'object' ||
      Array.isArray(categories)
    ) {
      throw new Error(
        `${label}.${version} must be an object keyed by fixture category.`,
      );
    }

    normalized[version] = {};
    for (const [category, digest] of Object.entries(categories)) {
      if (typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
        throw new Error(
          `${label}.${version}.${category} must be a sha256 digest string.`,
        );
      }

      normalized[version][category] = digest;
    }
  }

  return normalized;
}

function git(args) {
  return childProcess.execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function candidateRuntimeScenarioCriteriaBaselineRefs() {
  const refs = [];

  if (process.env.PLATFORM_CONFORMANCE_DIGEST_BASE_REF) {
    refs.push(process.env.PLATFORM_CONFORMANCE_DIGEST_BASE_REF);
  }

  if (process.env.GITHUB_BASE_REF) {
    refs.push(`origin/${process.env.GITHUB_BASE_REF}`);
    refs.push(`refs/remotes/origin/${process.env.GITHUB_BASE_REF}`);
  }

  refs.push('origin/main');
  refs.push('canonical/main');
  refs.push('refs/remotes/canonical/main');
  refs.push('main');

  return Array.from(new Set(refs.filter(Boolean)));
}

function loadSuiteAuthorityDigestBaseline() {
  const constName = 'VERSIONED_SUITE_AUTHORITY_DIGESTS';

  for (const ref of candidateRuntimeScenarioCriteriaBaselineRefs()) {
    try {
      const source = git(['show', `${ref}:${thisScriptPath}`]);
      const digests = parseConstObjectLiteral(
        source,
        constName,
        `published ${thisScriptPath} at ${ref}`,
      );

      return {ref, digests};
    } catch (err) {
      if (!err.message.includes(`must declare ${constName}`)) {
        continue;
      }
    }
  }

  return null;
}

function assertPublishedSuiteAuthorityDigestsImmutable() {
  const baseline = loadSuiteAuthorityDigestBaseline();

  if (!baseline) {
    return;
  }

  for (const [version, digest] of Object.entries(baseline.digests)) {
    const currentDigest = VERSIONED_SUITE_AUTHORITY_DIGESTS[version];
    const transition = SUITE_AUTHORITY_DIGEST_TRANSITIONS[version];
    const approvedTransition =
      transition?.from === digest && transition?.to === currentDigest;

    if (currentDigest !== digest && !approvedTransition) {
      throw new Error(
        `Published complete suite authority digest for version ${version} ` +
          `from ${baseline.ref} must remain immutable. Advance the suite ` +
          `version and add a new digest instead of changing historical ` +
          `target, category, or pass/fail semantics.`,
      );
    }
  }
}

function loadRuntimeScenarioCriteriaDigestBaseline() {
  const errors = [];
  const constName = 'VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS';

  for (const ref of candidateRuntimeScenarioCriteriaBaselineRefs()) {
    try {
      const source = git(['show', `${ref}:${thisScriptPath}`]);
      const digests = normalizeRuntimeScenarioCriteriaDigestTable(
        parseConstObjectLiteral(
          source,
          constName,
          `published ${thisScriptPath} at ${ref}`,
        ),
        `published ${constName} at ${ref}`,
      );

      return { ref, digests };
    } catch (err) {
      errors.push(`${ref}: ${err.message}`);
    }
  }

  if (
    process.env.PLATFORM_CONFORMANCE_DIGEST_BASE_REF ||
    process.env.GITHUB_BASE_REF
  ) {
    throw new Error(
      `Unable to load published ${constName} baseline. ` +
        `Ensure CI checks out the target branch history. Tried: ${errors.join('; ')}`,
    );
  }

  return null;
}

function assertPublishedRuntimeScenarioCriteriaDigestsImmutable() {
  const baseline = loadRuntimeScenarioCriteriaDigestBaseline();
  if (!baseline) {
    return;
  }

  const current = normalizeRuntimeScenarioCriteriaDigestTable(
    VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS,
    'VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS',
  );

  const baselineVersions = Object.keys(baseline.digests)
    .sort((a, b) => Number(a) - Number(b));

  for (const version of baselineVersions) {
    if (!(version in current)) {
      throw new Error(
        `Published runtime scenario criteria digest entry for suite version ` +
          `${version} from ${baseline.ref} must remain declared. Add a new ` +
          `suite-version entry for changed criteria instead of deleting ` +
          `historical entries.`,
      );
    }

    if (stableJson(current[version]) !== stableJson(baseline.digests[version])) {
      throw new Error(
        `Published runtime scenario criteria digest entry for suite version ` +
          `${version} changed from ${baseline.ref}. Keep historical ` +
          `VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS entries immutable; ` +
          `advance the suite version and add a new current entry for changed ` +
          `stable runtime scenario operations or pass_criteria.`,
      );
    }
  }
}

function loadRuntimeScenarioPublicRequirementDigestBaseline() {
  const errors = [];
  const missingConstRefs = [];
  const constName = 'VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS';

  for (const ref of candidateRuntimeScenarioCriteriaBaselineRefs()) {
    try {
      const source = git(['show', `${ref}:${thisScriptPath}`]);
      const digests = normalizeRuntimeScenarioCriteriaDigestTable(
        parseConstObjectLiteral(
          source,
          constName,
          `published ${thisScriptPath} at ${ref}`,
        ),
        `published ${constName} at ${ref}`,
      );

      return { ref, digests };
    } catch (err) {
      errors.push(`${ref}: ${err.message}`);
      if (err.message.includes(`must declare ${constName}`)) {
        missingConstRefs.push(ref);
      }
    }
  }

  if (missingConstRefs.length > 0) {
    return null;
  }

  if (
    process.env.PLATFORM_CONFORMANCE_DIGEST_BASE_REF ||
    process.env.GITHUB_BASE_REF
  ) {
    throw new Error(
      `Unable to load published ${constName} baseline. ` +
        `Ensure CI checks out the target branch history. Tried: ${errors.join('; ')}`,
    );
  }

  return null;
}

function assertPublishedRuntimeScenarioPublicRequirementDigestsImmutable() {
  const baseline = loadRuntimeScenarioPublicRequirementDigestBaseline();
  if (!baseline) {
    return;
  }

  const current = normalizeRuntimeScenarioCriteriaDigestTable(
    VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS,
    'VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS',
  );

  const baselineVersions = Object.keys(baseline.digests)
    .sort((a, b) => Number(a) - Number(b));

  for (const version of baselineVersions) {
    if (!(version in current)) {
      throw new Error(
        `Published runtime scenario public requirement digest entry for suite ` +
          `version ${version} from ${baseline.ref} must remain declared. Add ` +
          `a new suite-version entry for changed public requirements instead ` +
          `of deleting historical entries.`,
      );
    }

    if (stableJson(current[version]) !== stableJson(baseline.digests[version])) {
      throw new Error(
        `Published runtime scenario public requirement digest entry for suite ` +
          `version ${version} changed from ${baseline.ref}. Keep historical ` +
          `VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS entries ` +
          `immutable; advance the suite version and add a new current entry ` +
          `for changed stable runtime scenario evidence requirements, ` +
          `artifact_policy, required_matrix, scenario_requirements, or ` +
          `host_runner_contract.`,
      );
    }
  }
}

function assertVersionedPassFailRules(contract) {
  const expectedRules = VERSIONED_PASS_FAIL_RULES[contract.version];

  if (!expectedRules) {
    throw new Error(
      `scripts/check-platform-conformance-authority.js must declare ` +
        `pass / fail rule expectations for suite version ${contract.version}. ` +
        `Add a new VERSIONED_PASS_FAIL_RULES entry when suite semantics change.`,
    );
  }

  assertJsonEqual(
    contract.pass_fail_rules || {},
    expectedRules,
    `static/platform-conformance-contract.json pass_fail_rules for suite version ${contract.version}`,
  );
}

function assertVersionedRuntimeScenarioStatuses(contract, manifest, category, source) {
  const expectedStatuses = VERSIONED_RUNTIME_SCENARIO_STATUSES[contract.version];

  if (!expectedStatuses) {
    throw new Error(
      `scripts/check-platform-conformance-authority.js must declare ` +
        `runtime scenario statuses for suite version ${contract.version}. ` +
        `Add a new VERSIONED_RUNTIME_SCENARIO_STATUSES entry when runtime ` +
        `result semantics change.`,
    );
  }

  assertJsonEqual(
    manifest.result_statuses,
    expectedStatuses,
    `stable runtime fixture category "${category}" scenario manifest ` +
      `${sourceReference(source)} result_statuses for suite version ${contract.version}`,
  );

  return expectedStatuses;
}

function assertPublishedArtifactRuntimeScenarioManifestShape(
  manifest,
  category,
  source,
) {
  const label =
    `stable runtime fixture category "${category}" scenario manifest ` +
    `${sourceReference(source)}`;

  if (manifest.fixture_type !== EXPECTED_RUNTIME_SCENARIO_FIXTURE_TYPE) {
    throw new Error(
      `${label} must declare fixture_type ` +
        `"${EXPECTED_RUNTIME_SCENARIO_FIXTURE_TYPE}".`,
    );
  }

  if (
    !manifest.artifact_policy ||
    typeof manifest.artifact_policy !== 'object' ||
    Array.isArray(manifest.artifact_policy)
  ) {
    throw new Error(`${label} must declare artifact_policy.`);
  }

  if (manifest.artifact_policy.published_artifacts_only !== true) {
    throw new Error(
      `${label} artifact_policy must require published_artifacts_only=true.`,
    );
  }

  if (
    !Array.isArray(manifest.common_result_evidence) ||
    manifest.common_result_evidence.length === 0
  ) {
    throw new Error(`${label} must declare common_result_evidence.`);
  }

  if (!manifest.common_result_evidence.includes('published_artifact_versions')) {
    throw new Error(
      `${label} common_result_evidence must include ` +
        `"published_artifact_versions".`,
    );
  }
}

function assertSignalQueryRuntimeArtifactPolicy(manifest, category, source) {
  if (category !== 'signal_query_runtime_contract') {
    return;
  }

  const policy = manifest.artifact_policy || {};

  if (policy.requires_resolved_versions !== true) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${sourceReference(source)} must require resolved artifact versions.`,
    );
  }

  if (policy.rejects_placeholder_versions !== true) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${sourceReference(source)} must advertise placeholder ` +
        `artifact-version rejection so external harnesses can fail ` +
        `unresolved tokens such as latest/current/head.`,
    );
  }
}

function assertSkewRefusalMatrixResultEvidence(manifest, category, source) {
  if (category !== 'skew_refusal_matrix_contract') {
    return;
  }

  const commonEvidence = manifest.common_result_evidence || [];
  const requiredRunRecordFields = [
    'artifact_versions',
    'published_artifact_versions',
    'resolved_artifact_versions',
    'artifact_sources',
    'local_product_source_checkouts_used',
    'started_at',
    'finished_at',
    'outcome',
    'runner_blocked',
    'surface_results',
    'pairing_results',
    'operation_evidence',
    'findings',
    'finding_links',
  ];

  if (!Array.isArray(commonEvidence)) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${sourceReference(source)} must declare common_result_evidence.`,
    );
  }

  for (const requiredField of requiredRunRecordFields) {
    if (!commonEvidence.includes(requiredField)) {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `${sourceReference(source)} common_result_evidence must ` +
          `include required run record field "${requiredField}".`,
      );
    }
  }

  if (commonEvidence.includes('linked_findings')) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${sourceReference(source)} must use finding_links, not ` +
        `linked_findings, for top-level run records.`,
    );
  }

  assertJsonEqual(
    (manifest.artifact_policy || {}).required_run_record_fields || [],
    requiredRunRecordFields,
    `stable runtime fixture category "${category}" scenario manifest ` +
      `${sourceReference(source)} artifact_policy.required_run_record_fields`,
  );
}

function assertPhpSdkSplitRuntimeAuthority(manifest, category, source) {
  if (!['skew_refusal_matrix_contract', 'principal_attribution_contract'].includes(category)) {
    return;
  }

  const label =
    `stable runtime fixture category "${category}" scenario manifest ` +
    `${sourceReference(source)}`;
  const artifactPolicy = manifest.artifact_policy || {};
  const requiredArtifacts = artifactPolicy.required_artifacts || [];

  assertArrayIncludesAll(
    requiredArtifacts,
    ['sdk-php', 'workflow'],
    `${label} artifact_policy.required_artifacts`,
  );

  const installScenario = (manifest.scenarios || []).find(
    scenario => scenario && scenario.id === 'published_artifact_install_only',
  );
  const installContract = JSON.stringify({
    summary: installScenario?.summary,
    operations: installScenario?.operations,
    pass_criteria: installScenario?.pass_criteria,
  });

  assertJsonEqual(
    artifactPolicy.required_artifact_provenance,
    {
      'sdk-php': {
        package: 'durable-workflow/sdk',
        source: 'packagist',
        role:
          category === 'skew_refusal_matrix_contract'
            ? 'standalone_remote_php_worker'
            : 'standalone_remote_php_client_and_worker',
        required_fields: [
          'resolved_version',
          'dist_type',
          'dist_url',
          'dist_reference',
        ],
      },
      workflow: {
        package: 'durable-workflow/workflow',
        source: 'packagist',
        role: 'embedded_laravel_and_waterline_engine',
        required_fields: [
          'resolved_version',
          'dist_type',
          'dist_url',
          'dist_reference',
        ],
      },
    },
    `${label} artifact_policy.required_artifact_provenance`,
  );

  assertArrayIncludesAll(
    artifactPolicy.release_artifact_aliases?.['sdk-php'] || [],
    ['durable-workflow/sdk'],
    `${label} artifact_policy.release_artifact_aliases.sdk-php`,
  );

  for (const requiredPolicy of [
    'requires_published_artifact_versions',
    'requires_resolved_versions',
    'requires_artifact_sources_for_each_required_artifact',
    'requires_local_product_source_checkouts_used_false',
  ]) {
    if (artifactPolicy[requiredPolicy] !== true) {
      throw new Error(`${label} artifact_policy.${requiredPolicy} must be true.`);
    }
  }

  for (const requiredText of [
    'durable-workflow/sdk',
    'durable-workflow/workflow',
    'embedded Laravel and Waterline',
    'Packagist dist type, URL, and reference',
  ]) {
    if (!installContract.includes(requiredText)) {
      throw new Error(
        `${label} published_artifact_install_only must include "${requiredText}".`,
      );
    }
  }

  if (category === 'skew_refusal_matrix_contract') {
    if (!String(manifest.description).includes('PHP SDK worker')) {
      throw new Error(`${label} description must name the standalone PHP SDK worker.`);
    }

    if (!installContract.includes('resolve_published_sdk_php_artifact')) {
      throw new Error(
        `${label} published_artifact_install_only must resolve the standalone PHP SDK artifact.`,
      );
    }

    return;
  }

  const phpClientScenario = (manifest.scenarios || []).find(
    scenario => scenario && scenario.id === 'php_client_visibility',
  );
  if (phpClientScenario?.title !== 'PHP SDK client visibility') {
    throw new Error(`${label} php_client_visibility must name the PHP SDK client.`);
  }
}

function formatJsonPath(segments) {
  return segments.reduce((current, segment) => {
    if (typeof segment === 'number') {
      return `${current}[${segment}]`;
    }

    return `${current}.${segment}`;
  }, '$');
}

function isPublicIpAddress(hostname) {
  const address = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const version = net.isIP(address);

  if (version === 4) {
    const octets = address.split('.').map(Number);
    const [first, second] = octets;

    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && octets[2] === 100) ||
      (first === 203 && second === 0 && octets[2] === 113) ||
      first >= 224
    );
  }

  if (version === 6) {
    return !(
      address === '::' ||
      address === '::1' ||
      address.startsWith('::ffff:') ||
      /^f[cd]/.test(address) ||
      /^fe[89ab]/.test(address) ||
      /^ff/.test(address) ||
      /^2001:db8(?:$|:)/.test(address)
    );
  }

  return null;
}

function isPublicResolvableUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (err) {
    return false;
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    return false;
  }

  const hostname = url.hostname.replace(/\.$/, '').toLowerCase();
  const publicIp = isPublicIpAddress(hostname);
  if (publicIp !== null) {
    return publicIp;
  }

  return (
    hostname.includes('.') &&
    !/(?:^|\.)(?:home|internal|invalid|lan|local|localhost|test)$/.test(hostname)
  );
}

function firstMatchedPath(value, pattern) {
  const match = value.match(pattern);
  return match ? match[1] : null;
}

function firstRepoLocalPath(value, segments) {
  const pathMatch =
    firstMatchedPath(value, PUBLIC_CONFORMANCE_REPO_LOCAL_PATH_PATTERN) ||
    firstMatchedPath(value, PUBLIC_CONFORMANCE_EXTENSIONLESS_REPO_PATH_PATTERN) ||
    firstMatchedPath(value, PUBLIC_CONFORMANCE_EXPLICIT_RELATIVE_PATH_PATTERN) ||
    firstMatchedPath(value, PUBLIC_CONFORMANCE_BARE_REPO_FILE_PATTERN);
  if (pathMatch) {
    return pathMatch;
  }

  const exactSlashIdentifier = firstMatchedPath(
    value.trim(),
    PUBLIC_CONFORMANCE_EXACT_SLASH_IDENTIFIER_PATTERN,
  );
  if (!exactSlashIdentifier) {
    return null;
  }

  const isHarnessLocator = segments.some(segment => (
    typeof segment === 'string' &&
    PUBLIC_CONFORMANCE_HARNESS_LOCATOR_FIELD_PATTERN.test(segment)
  ));
  if (
    PUBLIC_CONFORMANCE_PUBLIC_PACKAGE_OR_REPOSITORY_PATTERN
      .test(exactSlashIdentifier) &&
    !isHarnessLocator
  ) {
    return null;
  }

  return exactSlashIdentifier;
}

function slashClosesRouteTemplateSegment(value, slashIndex) {
  if (value[slashIndex - 1] !== '}') {
    return false;
  }

  const segmentStart = value.lastIndexOf('/', slashIndex - 2) + 1;
  return /^\{[A-Za-z_][A-Za-z0-9_.|+-]*\}$/.test(
    value.slice(segmentStart, slashIndex),
  );
}

function slashBelongsToUrlSchemeSeparator(value, slashIndex) {
  const schemeEnd = slashIndex - 2;
  if (value[schemeEnd] !== ':') {
    return false;
  }

  let schemeStart = schemeEnd;
  while (schemeStart > 0 && /[A-Za-z0-9+.-]/.test(value[schemeStart - 1])) {
    schemeStart -= 1;
  }

  const scheme = value.slice(schemeStart, schemeEnd);
  return (
    /^[A-Za-z][A-Za-z0-9+.-]*$/.test(scheme) &&
    (schemeStart === 0 || !/[A-Za-z0-9_/]/.test(value[schemeStart - 1]))
  );
}

function absoluteFilesystemPaths(value) {
  const candidates = [];

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '/' || value[index + 1] === '/') {
      continue;
    }

    const precedingCharacter = value[index - 1];
    if (
      index > 0 &&
      (/[A-Za-z0-9]/.test(precedingCharacter) ||
        (precedingCharacter === '/' &&
          slashBelongsToUrlSchemeSeparator(value, index)) ||
        slashClosesRouteTemplateSegment(value, index))
    ) {
      continue;
    }

    const pathMatch = value.slice(index).match(
      PUBLIC_CONFORMANCE_ABSOLUTE_FILESYSTEM_PATH_PATTERN,
    );
    if (pathMatch && !PUBLIC_CONFORMANCE_API_ROUTE_PATTERN.test(pathMatch[0])) {
      candidates.push(pathMatch[0]);
    }
  }

  return [...new Set(candidates)];
}

function isUrlShapedToken(value, segments) {
  const schemeEnd = value.indexOf(':');
  const scheme = value.slice(0, schemeEnd).toLowerCase();
  const target = value.slice(schemeEnd + 1);
  const field = [...segments].reverse().find(segment => typeof segment === 'string');

  return (
    ['file', 'http', 'https'].includes(scheme) ||
    /[/?#@]/.test(target) ||
    (field && PUBLIC_CONFORMANCE_URL_REFERENCE_FIELD_PATTERN.test(field))
  );
}

function collectPublicConformanceContractInternalHarnessLeaks(value, segments = []) {
  const leaks = [];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const urlTokens = trimmed.match(PUBLIC_CONFORMANCE_URL_TOKEN_PATTERN) || [];
    let isExactPublicUrl = false;

    for (const urlToken of urlTokens) {
      if (!isUrlShapedToken(urlToken, segments)) {
        continue;
      }

      if (isPublicResolvableUrl(urlToken)) {
        isExactPublicUrl ||= urlToken === trimmed;
        continue;
      }

      leaks.push(
        `${formatJsonPath(segments)} exposes non-public URL "${urlToken}"`,
      );
    }

    if (isExactPublicUrl) {
      return leaks;
    }

    const repoPathMatch = firstRepoLocalPath(value, segments);
    if (repoPathMatch) {
      leaks.push(
        `${formatJsonPath(segments)} exposes repository path "${repoPathMatch}"`,
      );
    }

    for (const absoluteFilesystemPathMatch of absoluteFilesystemPaths(value)) {
      leaks.push(
        `${formatJsonPath(segments)} exposes container path or local filesystem path ` +
          `"${absoluteFilesystemPathMatch}"`,
      );
    }

    const fileName = value.trim().split(/[\\/]/).pop();
    if (
      PUBLIC_RUNTIME_MANIFEST_FORBIDDEN_ARTIFACT_NAME_PATTERNS
        .some(pattern => pattern.test(fileName))
    ) {
      leaks.push(`${formatJsonPath(segments)} exposes internal harness artifact "${fileName}"`);
    }

    return leaks;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      leaks.push(...collectPublicConformanceContractInternalHarnessLeaks(
        entry,
        [...segments, index],
      ));
    });

    return leaks;
  }

  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      const entryPath = [...segments, key];

      if (PUBLIC_RUNTIME_MANIFEST_FORBIDDEN_NORMATIVE_FIELDS.has(key)) {
        leaks.push(`${formatJsonPath(entryPath)} exposes internal harness field "${key}"`);
      }

      leaks.push(...collectPublicConformanceContractInternalHarnessLeaks(entry, entryPath));
    }
  }

  return leaks;
}

function assertPublicConformanceContractHasNoInternalHarnessArtifacts(
  manifest,
  label,
) {
  const leaks = collectPublicConformanceContractInternalHarnessLeaks(manifest);
  if (leaks.length === 0) {
    return;
  }

  throw new Error(
    `${label} must describe public identifiers, schemas, and resolvable URLs, ` +
      `not repository paths, container paths, or internal harness artifacts:\n- ` +
      leaks.join('\n- '),
  );
}

function assertPublicRuntimeManifestHasNoInternalHarnessContract(
  manifest,
  category,
  source,
) {
  if (!isPublicRuntimeScenarioManifest(source)) {
    return;
  }

  assertPublicConformanceContractHasNoInternalHarnessArtifacts(
    manifest,
    `stable runtime fixture category "${category}" scenario manifest ` +
      `${sourceReference(source)}`,
  );
}

function assertArrayIncludesAll(actual, expected, label) {
  if (!Array.isArray(actual)) {
    throw new Error(`${label} must be an array.`);
  }

  for (const value of expected) {
    if (!actual.includes(value)) {
      throw new Error(`${label} must include "${value}".`);
    }
  }
}

function assertWorkerVersioningNoCompatibleEvidence(manifest, category, source) {
  if (category !== 'worker_versioning_runtime_contract') {
    return;
  }

  const label =
    `stable runtime fixture category "${category}" scenario manifest ` +
    `${sourceReference(source)}`;
  const artifactPolicy = manifest.artifact_policy || {};

  if (artifactPolicy.requires_local_product_source_checkouts_used_false !== true) {
    throw new Error(
      `${label} artifact_policy must require ` +
        `local_product_source_checkouts_used=false for published-worker evidence.`,
    );
  }

  assertArrayIncludesAll(
    artifactPolicy.forbidden_sources || [],
    [
      'local_product_source_checkout',
      'workspace_repo_as_artifact_under_test',
      'not_exercised',
    ],
    `${label} artifact_policy.forbidden_sources`,
  );

  assertArrayIncludesAll(
    manifest.common_result_evidence || [],
    [
      'published_artifact_install_evidence',
      'published_worker_execution_evidence',
      'local_product_source_checkouts_used',
    ],
    `${label} common_result_evidence`,
  );

  const noCompatibleFields =
    (((manifest.scenario_requirements || {}).no_compatible_worker_behavior || {})
      .required_fields) || [];

  assertArrayIncludesAll(
    noCompatibleFields,
    [
      'operator_visible_signal',
      'pending_or_typed_error',
      'incompatible_worker_task_count',
      'published_artifact_worker_execution',
      'local_product_source_checkouts_used',
    ],
    `${label} scenario_requirements.no_compatible_worker_behavior.required_fields`,
  );

  const evidenceContract =
    ((manifest.host_runner_contract || {}).published_worker_execution_evidence) || {};

  if (
    evidenceContract.result_schema !==
      'durable-workflow.v2.worker-versioning-runtime.published-worker-execution-evidence'
  ) {
    throw new Error(
      `${label} host_runner_contract.published_worker_execution_evidence ` +
        `must declare the published-worker execution evidence schema.`,
    );
  }

  assertArrayIncludesAll(
    evidenceContract.required_for_passing_scenarios || [],
    [
      'replay_only_by_compatible_workers',
      'replay_across_cache_eviction',
      'no_compatible_worker_behavior',
      'cross_language_php_python_pinning',
    ],
    `${label} host_runner_contract.published_worker_execution_evidence.required_for_passing_scenarios`,
  );

  assertArrayIncludesAll(
    evidenceContract.no_compatible_worker_behavior_required_fields || [],
    [
      'scenario_results.no_compatible_worker_behavior.observed_outputs.published_artifact_worker_execution',
      'scenario_results.no_compatible_worker_behavior.observed_outputs.local_product_source_checkouts_used',
      'local_product_source_checkouts_used',
    ],
    `${label} host_runner_contract.published_worker_execution_evidence.no_compatible_worker_behavior_required_fields`,
  );

  const sourcePolicy = evidenceContract.source_policy || {};
  for (const field of [
    'requires_top_level_local_product_source_checkouts_used_false',
    'requires_scenario_local_product_source_checkouts_used_false',
    'requires_published_worker_execution_local_product_source_checkouts_used_false',
  ]) {
    if (sourcePolicy[field] !== true) {
      throw new Error(
        `${label} host_runner_contract.published_worker_execution_evidence.` +
          `source_policy.${field} must be true.`,
      );
    }
  }
}

function runtimeScenarioCriteriaSnapshot(manifest) {
  const scenarios = {};

  for (const scenario of manifest.scenarios || []) {
    if (
      !scenario ||
      typeof scenario !== 'object' ||
      typeof scenario.id !== 'string'
    ) {
      continue;
    }

    scenarios[scenario.id] = {
      operations: scenario.operations,
      pass_criteria: scenario.pass_criteria,
    };
  }

  return scenarios;
}

function runtimeScenarioCriteriaDigest(manifest) {
  return (
    'sha256:' +
    crypto
      .createHash('sha256')
      .update(stableJson(runtimeScenarioCriteriaSnapshot(manifest)))
      .digest('hex')
  );
}

function runtimeScenarioPublicRequirementSnapshot(manifest) {
  const snapshot = {};

  for (const field of VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(manifest, field)) {
      snapshot[field] = manifest[field];
    }
  }

  return snapshot;
}

function runtimeScenarioPublicRequirementDigest(manifest) {
  return (
    'sha256:' +
    crypto
      .createHash('sha256')
      .update(stableJson(runtimeScenarioPublicRequirementSnapshot(manifest)))
      .digest('hex')
  );
}

function assertVersionedRuntimeScenarioCriteria(contract, manifest, category, source) {
  const expectedByCategory =
    VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS[contract.version];

  if (!expectedByCategory) {
    throw new Error(
      `scripts/check-platform-conformance-authority.js must declare ` +
        `runtime scenario operations/pass_criteria digests for suite version ` +
        `${contract.version}. Add a new ` +
        `VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS entry when stable ` +
        `runtime scenario criteria change.`,
    );
  }

  const expectedDigest = expectedByCategory[category];
  if (!expectedDigest) {
    throw new Error(
      `scripts/check-platform-conformance-authority.js must declare ` +
        `a runtime scenario operations/pass_criteria digest for category ` +
        `"${category}" in suite version ${contract.version}.`,
    );
  }

  const actualDigest = runtimeScenarioCriteriaDigest(manifest);
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${sourceReference(source)} operations/pass_criteria digest ` +
        `${actualDigest} must match suite-versioned expectation ` +
        `${expectedDigest}. Advance the suite version and add a new ` +
        `VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS entry before changing ` +
        `stable runtime scenario operations or pass_criteria.`,
    );
  }
}

function assertVersionedRuntimeScenarioPublicRequirements(
  contract,
  manifest,
  category,
  source,
) {
  const expectedByCategory =
    VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS[contract.version];

  if (!expectedByCategory) {
    throw new Error(
      `scripts/check-platform-conformance-authority.js must declare ` +
        `runtime scenario public requirement digests for suite version ` +
        `${contract.version}. Add a new ` +
        `VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS entry when ` +
        `stable runtime scenario evidence requirements, artifact policy, ` +
        `runtime matrix, scenario required fields, or host-runner contracts ` +
        `change.`,
    );
  }

  const expectedDigest = expectedByCategory[category];
  if (!expectedDigest) {
    throw new Error(
      `scripts/check-platform-conformance-authority.js must declare ` +
        `a runtime scenario public requirement digest for category ` +
        `"${category}" in suite version ${contract.version}.`,
    );
  }

  const actualDigest = runtimeScenarioPublicRequirementDigest(manifest);
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${sourceReference(source)} public requirement digest ` +
        `${actualDigest} must match suite-versioned expectation ` +
        `${expectedDigest}. Advance the suite version and add a new ` +
        `VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS entry before ` +
        `changing stable runtime scenario evidence requirements, ` +
        `artifact_policy, required_matrix, scenario_requirements, or ` +
        `host_runner_contract.`,
    );
  }
}

function isPublicRuntimeScenarioManifest(source) {
  try {
    const resolver = new URL(source.resolver_url);
    return (
      resolver.origin === 'https://raw.githubusercontent.com' &&
      /^\/durable-workflow\/workflow\/[0-9a-f]{40}\/resources\/conformance\/suite-v[0-9]+\/platform-conformance\/[a-z0-9.-]+\.json$/.test(
        resolver.pathname,
      )
    );
  } catch (err) {
    return false;
  }
}

function runtimeScenarioCategories(contract) {
  const categories = new Set();
  const coverageRule =
    (contract.pass_fail_rules || {}).stable_runtime_scenario_coverage || {};

  for (const category of coverageRule.applies_to_categories || []) {
    categories.add(category);
  }

  for (const [category, entry] of Object.entries(contract.fixture_catalog || {})) {
    if (Array.isArray(entry.required_scenarios)) {
      categories.add(category);
    }
  }

  return categories;
}

function stableFixtureCategories(contract) {
  return Object.entries(contract.fixture_catalog || {})
    .filter(([, entry]) => entry && entry.status === 'stable')
    .map(([category]) => category);
}

function sourceReference(source) {
  return source?.resolver_url || `${source?.repository}:${source?.path}`;
}

function immutableResolverDetails(source, category, suiteVersion) {
  const label =
    `stable fixture category "${category}" source ${sourceReference(source)}`;
  let resolver;

  try {
    resolver = new URL(source.resolver_url);
  } catch (err) {
    throw new Error(`${label} must declare an absolute HTTPS resolver_url.`);
  }

  if (
    resolver.protocol !== 'https:' ||
    resolver.username ||
    resolver.password ||
    resolver.port ||
    resolver.search ||
    resolver.hash ||
    resolver.href !== source.resolver_url
  ) {
    throw new Error(
      `${label} must use an immutable HTTPS resolver without credentials, ` +
        `a port, query string, or fragment.`,
    );
  }

  const runtimeMatch = resolver.pathname.match(
    /^\/durable-workflow\/workflow\/([0-9a-f]{40})\/resources\/conformance\/suite-v([0-9]+)\/platform-conformance\/([a-z0-9.-]+\.json)$/,
  );
  const protocolMatch = resolver.pathname.match(
    /^\/durable-workflow\/durable-workflow\.github\.io\/([0-9a-f]{40})\/static\/platform-protocol-specs\/([a-z0-9.-]+\.(?:json|ya?ml))$/,
  );
  const cliMatch = resolver.pathname.match(
    /^\/cli-json-envelopes\/v([0-9]+)\/(manifest\.json|schemas\/[a-z0-9.-]+\.schema\.json)$/,
  );

  let kind;
  let filename;
  let localPath;
  let discoveryUrl;

  if (runtimeMatch) {
    if (runtimeMatch[1] !== EXPECTED_RUNTIME_SOURCE_REVISION) {
      throw new Error(
        `${label} must use published Workflow source revision ` +
          `${EXPECTED_RUNTIME_SOURCE_REVISION}.`,
      );
    }
    if (Number(runtimeMatch[2]) !== EXPECTED_RUNTIME_FIXTURE_SUITE_VERSION) {
      throw new Error(
        `${label} must bind runtime scenario bytes to retained ` +
          `suite-v${EXPECTED_RUNTIME_FIXTURE_SUITE_VERSION}.`,
      );
    }

    kind = 'runtime';
    filename = runtimeMatch[3];
    localPath = path.join(
      repoRoot,
      'static',
      'platform-conformance',
      filename,
    );
    discoveryUrl =
      `https://durable-workflow.github.io/platform-conformance/${filename}`;
  } else if (protocolMatch) {
    if (protocolMatch[1] !== EXPECTED_PROTOCOL_SOURCE_REVISION) {
      throw new Error(
        `${label} must use published docs protocol source revision ` +
          `${EXPECTED_PROTOCOL_SOURCE_REVISION}.`,
      );
    }

    kind = 'protocol';
    filename = protocolMatch[2];
    localPath = path.join(
      repoRoot,
      'static',
      'platform-protocol-specs',
      filename,
    );
    discoveryUrl =
      `https://durable-workflow.github.io/platform-protocol-specs/${filename}`;
  } else if (
    resolver.hostname === 'durable-workflow.github.io' &&
    category === 'cli_json_envelopes' &&
    cliMatch
  ) {
    const revision = Number(cliMatch[1]);
    if (revision !== 3) {
      throw new Error(`${label} must use the current retained CLI schema revision v3.`);
    }

    kind = 'cli';
    filename = cliMatch[2];
    localPath = path.join(
      repoRoot,
      'static',
      'cli-json-envelopes',
      `v${revision}`,
      filename,
    );
    discoveryUrl = source.resolver_url;
  } else {
    throw new Error(
      `${label} must resolve immutable bytes from a full-commit Workflow ` +
        `suite source, docs protocol-spec source, or retained CLI schema route.`,
    );
  }

  if (
    !fs.existsSync(localPath) ||
    !fs.statSync(localPath).isFile()
  ) {
    throw new Error(`${label} does not resolve to a published file.`);
  }

  return {
    discoveryUrl,
    filename,
    kind,
    localPath,
    revision: runtimeMatch?.[1] || protocolMatch?.[1] || `v${cliMatch[1]}`,
  };
}

function localFileForResolver(source, category, suiteVersion) {
  return immutableResolverDetails(source, category, suiteVersion).localPath;
}

function resolverContentDigest(resolverDetails) {
  if (resolverDetails.kind === 'protocol') {
    const retainedDigest = EXPECTED_PROTOCOL_SOURCE_DIGESTS[resolverDetails.filename];
    if (retainedDigest === undefined) {
      throw new Error(
        `published docs protocol source revision ${EXPECTED_PROTOCOL_SOURCE_REVISION} ` +
          `does not pin retained bytes for ${resolverDetails.filename}.`,
      );
    }

    return retainedDigest;
  }

  return 'sha256:' +
    crypto.createHash('sha256').update(read(resolverDetails.localPath)).digest('hex');
}

function protocolSpecById(catalog, specId) {
  return Object.values(catalog.specs || {}).find(spec => spec.spec_id === specId);
}

function assertStableFixtureSourcesResolve(contract) {
  const catalog = contract.fixture_catalog || {};
  const protocolCatalog = loadJson(
    protocolCatalogPath,
    'static/platform-protocol-specs.json',
  );
  const docs = read(path.join(docsDir, 'platform-conformance.md'));
  const discoveryPage = read(discoveryPagePath);

  for (const category of stableFixtureCategories(contract)) {
    const entry = catalog[category];

    if (!Array.isArray(entry.sources) || entry.sources.length === 0) {
      throw new Error(
        `stable fixture category "${category}" must declare at least one source.`,
      );
    }

    for (const source of entry.sources) {
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        throw new Error(
          `stable fixture category "${category}" has an invalid source.`,
        );
      }

      for (const legacyField of ['repository', 'path']) {
        if (legacyField in source) {
          throw new Error(
            `stable fixture category "${category}" source must not use ` +
              `repository-relative ${legacyField} references.`,
          );
        }
      }

      if (
        typeof source.artifact_id !== 'string' ||
        source.artifact_id.trim() === ''
      ) {
        throw new Error(
          `stable fixture category "${category}" source must declare a ` +
            `version-bound artifact_id.`,
        );
      }
      if (
        typeof source.sha256 !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/.test(source.sha256)
      ) {
        throw new Error(
          `stable fixture category "${category}" source ` +
            `${source.artifact_id} must declare a sha256 byte binding.`,
        );
      }

      const resolverDetails = immutableResolverDetails(
        source,
        category,
        contract.version,
      );
      const actualDigest = resolverContentDigest(resolverDetails);

      if (source.sha256 !== actualDigest) {
        throw new Error(
          `stable fixture category "${category}" source ` +
            `${source.artifact_id} digest ${source.sha256} must match ` +
            `${actualDigest} at ${source.resolver_url}.`,
        );
      }

      const runtimeArtifactPrefix =
        `${EXPECTED_RUNTIME_SCENARIO_SCHEMA}/${category}@`;
      if (source.artifact_id.startsWith(runtimeArtifactPrefix)) {
        if (resolverDetails.kind !== 'runtime') {
          throw new Error(
            `stable fixture category "${category}" runtime source must use ` +
              `an immutable Workflow suite resolver.`,
          );
        }

        const expectedArtifactId =
          `${runtimeArtifactPrefix}${EXPECTED_RUNTIME_FIXTURE_SUITE_VERSION}`;
        if (source.artifact_id !== expectedArtifactId) {
          throw new Error(
            `stable fixture category "${category}" runtime source must use ` +
              `suite-bound artifact id ${expectedArtifactId}.`,
          );
        }
      } else if (resolverDetails.kind === 'protocol') {
        const catalogSuffix =
          `@catalog-${EXPECTED_PROTOCOL_SOURCE_CATALOG_VERSION}`;
        if (!source.artifact_id.endsWith(catalogSuffix)) {
          throw new Error(
            `stable fixture category "${category}" protocol source must bind ` +
              `artifact_id to platform protocol catalog version ` +
              `${EXPECTED_PROTOCOL_SOURCE_CATALOG_VERSION}.`,
          );
        }

        const specId = source.artifact_id.slice(0, -catalogSuffix.length);
        const spec = protocolSpecById(protocolCatalog, specId);
        if (!spec || spec.status !== 'published') {
          throw new Error(
            `stable fixture category "${category}" source ${source.artifact_id} ` +
              `must resolve through a published platform protocol catalog entry.`,
          );
        }
        if (spec.spec_url !== resolverDetails.discoveryUrl) {
          throw new Error(
            `stable fixture category "${category}" source ${source.artifact_id} ` +
            `must retain catalog discovery alias ${spec.spec_url}.`,
          );
        }
      } else if (resolverDetails.kind === 'cli') {
        const expectedArtifactId =
          resolverDetails.filename === 'manifest.json'
            ? 'durable-workflow.cli.output-schema-manifest@3'
            : `durable-workflow.cli.output-schema/` +
              `${path.basename(resolverDetails.filename)}@3`;
        if (source.artifact_id !== expectedArtifactId) {
          throw new Error(
            `stable fixture category "${category}" CLI source must use ` +
              `revision-bound artifact id ${expectedArtifactId}.`,
          );
        }
      } else {
        throw new Error(
          `stable fixture category "${category}" source has an unsupported retained carrier.`,
        );
      }

      if (
        resolverDetails.kind === 'cli' &&
        resolverDetails.filename !== 'manifest.json'
      ) {
        continue;
      }

      for (const [surfaceLabel, content] of [
        ['docs/platform-conformance.md', docs],
        ['src/pages/docs/platform-conformance.mdx', discoveryPage],
      ]) {
        if (!content.includes(source.resolver_url)) {
          throw new Error(
            `${surfaceLabel} must link stable fixture source ` +
              `${source.resolver_url}.`,
          );
        }
      }
    }
  }
}

function assertStableSourceDependenciesResolve(contract) {
  const dependencies = contract.source_dependencies;
  const protocolCatalog = loadJson(
    protocolCatalogPath,
    'static/platform-protocol-specs.json',
  );

  if (
    !dependencies ||
    typeof dependencies !== 'object' ||
    Array.isArray(dependencies) ||
    Object.keys(dependencies).length === 0
  ) {
    throw new Error(
      'static/platform-conformance-contract.json must declare stable ' +
        'source_dependencies.',
    );
  }

  for (const [filename, source] of Object.entries(dependencies)) {
    const category = `source_dependencies.${filename}`;
    if (
      !/^[a-z0-9.-]+\.schema\.json$/.test(filename) ||
      !source ||
      typeof source !== 'object' ||
      Array.isArray(source)
    ) {
      throw new Error(`stable source dependency "${filename}" is invalid.`);
    }

    if (
      typeof source.artifact_id !== 'string' ||
      source.artifact_id.trim() === ''
    ) {
      throw new Error(
        `stable source dependency "${filename}" must declare a ` +
          `version-bound artifact_id.`,
      );
    }
    if (
      typeof source.sha256 !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(source.sha256)
    ) {
      throw new Error(
        `stable source dependency "${filename}" must declare a sha256 byte binding.`,
      );
    }

    const expectedSourcePath =
      `resources/conformance/suite-v${EXPECTED_PROTOCOL_SOURCE_SUITE_VERSION}/` +
      `platform-protocol-specs/${filename}`;
    if (source.source_path !== expectedSourcePath) {
      throw new Error(
        `stable source dependency "${filename}" source_path must stay inside ` +
        `the current suite-v${EXPECTED_PROTOCOL_SOURCE_SUITE_VERSION} protocol carrier.`,
      );
    }

    const resolverDetails = immutableResolverDetails(
      source,
      category,
      contract.version,
    );
    if (
      resolverDetails.kind !== 'protocol' ||
      resolverDetails.filename !== filename
    ) {
      throw new Error(
        `stable source dependency "${filename}" must use the matching ` +
          `immutable docs protocol-spec resolver.`,
      );
    }

    const actualDigest = resolverContentDigest(resolverDetails);
    if (source.sha256 !== actualDigest) {
      throw new Error(
        `stable source dependency "${filename}" digest ${source.sha256} ` +
          `must match ${actualDigest} at ${source.resolver_url}.`,
      );
    }

    const catalogSuffix =
      `@catalog-${EXPECTED_PROTOCOL_SOURCE_CATALOG_VERSION}`;
    if (!source.artifact_id.endsWith(catalogSuffix)) {
      throw new Error(
        `stable source dependency "${filename}" artifact_id must bind ` +
          `platform protocol catalog version ` +
          `${EXPECTED_PROTOCOL_SOURCE_CATALOG_VERSION}.`,
      );
    }

    const specId = source.artifact_id.slice(0, -catalogSuffix.length);
    const spec = protocolSpecById(protocolCatalog, specId);
    if (!spec || spec.status !== 'published') {
      throw new Error(
        `stable source dependency "${filename}" must resolve through a ` +
          `published platform protocol catalog entry.`,
      );
    }
    if (spec.spec_url !== resolverDetails.discoveryUrl) {
      throw new Error(
        `stable source dependency "${filename}" must retain catalog ` +
          `discovery alias ${spec.spec_url}.`,
      );
    }
  }
}

function assertWorkerProtocolArtifactHistory(contract) {
  const history = contract.artifact_version_history?.worker_protocol_api;
  const bindings = history?.bindings;

  if (
    history?.history_mode !== 'immutable_lifecycle_bindings' ||
    !Array.isArray(bindings) ||
    bindings.length !== 2
  ) {
    throw new Error(
      'worker protocol artifact history must declare exactly one historical ' +
        'binding and one current binding.',
    );
  }

  const [historical, current] = bindings;
  const expectedHistorical = {
    suite_version: 40,
    status: 'historical',
    lifecycle: 'beta',
    artifact_id:
      'durable-workflow.v2.worker-protocol-api@catalog-16-beta-history',
    resolver_url:
      'https://raw.githubusercontent.com/durable-workflow/' +
      'durable-workflow.github.io/e990bc36731463cc5b2cb2a9175dbccfdea61704/' +
      'static/platform-protocol-specs/worker-protocol-api.openapi.yaml',
    sha256:
      'sha256:3166ce8ecb4c15005f1d98b1669f1ffaf3aeff7e19d0f006454525b2b19e4035',
  };
  const expectedCurrent = {
    suite_version: contract.version,
    status: 'current',
    lifecycle: 'lifecycle_neutral',
    artifact_id: 'durable-workflow.v2.worker-protocol-api@catalog-16',
    resolver_url:
      `https://raw.githubusercontent.com/durable-workflow/` +
      `durable-workflow.github.io/${EXPECTED_PROTOCOL_SOURCE_REVISION}/` +
      'static/platform-protocol-specs/worker-protocol-api.openapi.yaml',
    sha256: EXPECTED_PROTOCOL_SOURCE_DIGESTS['worker-protocol-api.openapi.yaml'],
  };

  assertJsonEqual(
    historical,
    expectedHistorical,
    'artifact_version_history.worker_protocol_api historical binding',
  );
  assertJsonEqual(
    current,
    expectedCurrent,
    'artifact_version_history.worker_protocol_api current binding',
  );

  if (
    historical.artifact_id === current.artifact_id ||
    historical.resolver_url === current.resolver_url ||
    historical.sha256 === current.sha256
  ) {
    throw new Error(
      'historical beta worker protocol evidence must not reuse the current ' +
        'artifact identity, resolver, or byte digest.',
    );
  }

  const activeSources = (
    contract.fixture_catalog?.worker_task_lifecycle?.sources || []
  ).filter(source => source?.artifact_id === expectedCurrent.artifact_id);
  const activeCurrent = {...current};
  delete activeCurrent.suite_version;
  delete activeCurrent.status;
  delete activeCurrent.lifecycle;

  if (activeSources.length !== 1) {
    throw new Error(
      'worker_task_lifecycle must publish exactly one active worker protocol API binding.',
    );
  }
  assertJsonEqual(
    activeSources[0],
    activeCurrent,
    'fixture_catalog.worker_task_lifecycle current worker protocol binding',
  );
}

function assertStableFixtureAuthorityDocsResolve(contract) {
  const catalog = contract.fixture_catalog || {};

  for (const category of stableFixtureCategories(contract)) {
    const entry = catalog[category];

    assertCanonicalDocsSiteUrl(
      entry.authority_doc,
      `static/platform-conformance-contract.json ` +
        `fixture_catalog.${category}.authority_doc`,
    );
  }
}

function assertPublishedConformanceAuthorities(contract) {
  const authorities = contract.conformance_authorities || {};
  const discoverySurfaces = [
    {
      label: 'docs/platform-conformance.md',
      content: fs.readFileSync(path.join(docsDir, 'platform-conformance.md'), 'utf8'),
    },
    {
      label: 'src/pages/docs/platform-conformance.mdx',
      content: fs.readFileSync(discoveryPagePath, 'utf8'),
    },
  ];

  if (!authorities.php_sdk || authorities.php_sdk.status !== 'stable') {
    throw new Error(
      'conformance_authorities.php_sdk must register the stable public ' +
        'PHP SDK conformance contract.',
    );
  }

  for (const [name, authority] of Object.entries(authorities)) {
    const label =
      `static/platform-conformance-contract.json ` +
      `conformance_authorities.${name}`;

    if (!authority || authority.status !== 'stable') {
      continue;
    }
    if (typeof authority.schema !== 'string' || authority.schema.trim() === '') {
      throw new Error(`${label}.schema must be a non-empty public identity.`);
    }
    if (!Number.isInteger(authority.version) || authority.version < 1) {
      throw new Error(`${label}.version must be a positive integer.`);
    }

    let publicUrl;
    try {
      publicUrl = new URL(authority.url);
    } catch (err) {
      throw new Error(`${label}.url must be a consumer-resolvable public URL.`);
    }
    if (
      publicUrl.origin !== 'https://durable-workflow.github.io' ||
      publicUrl.search ||
      publicUrl.hash ||
      !/^\/platform-conformance\/[a-z0-9-]+\.json$/.test(publicUrl.pathname)
    ) {
      throw new Error(
        `${label}.url must name one public JSON contract directly under ` +
          `https://durable-workflow.github.io/platform-conformance/.`,
      );
    }

    assertCanonicalDocsSiteUrl(authority.authority_doc, `${label}.authority_doc`);

    const published = loadJson(
      path.join(repoRoot, 'static', publicUrl.pathname),
      `${name} public conformance contract`,
    );
    for (const field of ['schema', 'version', 'status']) {
      if (published[field] !== authority[field]) {
        throw new Error(
          `${label}.${field} must match ${publicUrl.pathname} ${field}.`,
        );
      }
    }
    if (published.authority_url !== authority.url) {
      throw new Error(
        `${publicUrl.pathname} authority_url must match ${label}.url.`,
      );
    }

    assertPublicConformanceContractHasNoInternalHarnessArtifacts(
      published,
      `${publicUrl.pathname} public conformance contract`,
    );

    for (const surface of discoverySurfaces) {
      if (
        !surface.content.includes(publicUrl.pathname) ||
        !surface.content.includes(authority.schema)
      ) {
        throw new Error(
          `${surface.label} must advertise ${publicUrl.pathname} with schema ` +
            `${authority.schema}.`,
        );
      }
    }

    assertJsonEqual(
      published.conformance_suite,
      {
        schema: contract.schema,
        url: 'https://durable-workflow.github.io/platform-conformance-contract.json',
      },
      `${name} public conformance contract conformance_suite authority`,
    );
  }
}

function assertPublishedConformanceDirectoryBoundary() {
  const directory = path.join(repoRoot, 'static', 'platform-conformance');

  for (const name of fs.readdirSync(directory).filter(entry => entry.endsWith('.json'))) {
    const published = loadJson(
      path.join(directory, name),
      `static/platform-conformance/${name}`,
    );
    assertPublicConformanceContractHasNoInternalHarnessArtifacts(
      published,
      `/platform-conformance/${name} public conformance contract`,
    );
  }
}

function assertRuntimeScenarioManifest(contract, category, entry, source) {
  const manifest = loadJson(
    localFileForResolver(source, category, contract.version),
    sourceReference(source),
  );

  if (manifest.schema !== EXPECTED_RUNTIME_SCENARIO_SCHEMA) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${sourceReference(source)} must use schema ` +
        `"${EXPECTED_RUNTIME_SCENARIO_SCHEMA}".`,
    );
  }

  if (manifest.category !== category) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${sourceReference(source)} declares category ` +
        `"${manifest.category}".`,
    );
  }

  if (manifest.suite_schema !== contract.schema) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `must reference suite schema "${contract.schema}".`,
    );
  }

  assertPublishedArtifactRuntimeScenarioManifestShape(manifest, category, source);

  if (manifest.suite_version !== EXPECTED_RUNTIME_FIXTURE_SUITE_VERSION) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `must reference retained suite version ` +
          `${EXPECTED_RUNTIME_FIXTURE_SUITE_VERSION}.`,
    );
  }

  if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length === 0) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${sourceReference(source)} must declare scenarios.`,
    );
  }

  const expectedStatuses = assertVersionedRuntimeScenarioStatuses(
    contract,
    manifest,
    category,
    source,
  );
  assertSignalQueryRuntimeArtifactPolicy(manifest, category, source);
  assertSkewRefusalMatrixResultEvidence(manifest, category, source);
  assertPhpSdkSplitRuntimeAuthority(manifest, category, source);
  assertPublicRuntimeManifestHasNoInternalHarnessContract(manifest, category, source);
  assertWorkerVersioningNoCompatibleEvidence(manifest, category, source);

  if (
    !Array.isArray(manifest.result_statuses) ||
    manifest.result_statuses.length !== expectedStatuses.length
  ) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `must declare the standard result_statuses set.`,
    );
  }

  for (const status of expectedStatuses) {
    if (!manifest.result_statuses.includes(status)) {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `result_statuses must include "${status}".`,
      );
    }
  }

  const expectedScenarios = new Set(entry.required_scenarios || []);
  const optionalScenarios = new Set(manifest.optional_scenarios || []);
  const seenScenarios = new Set();

  if (
    manifest.optional_scenarios !== undefined &&
    (!Array.isArray(manifest.optional_scenarios) ||
      manifest.optional_scenarios.some(
        scenario => typeof scenario !== 'string' || scenario.trim() === '',
      ))
  ) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        'optional_scenarios must be an array of non-empty scenario ids.',
    );
  }

  for (const optional of optionalScenarios) {
    if (expectedScenarios.has(optional)) {
      throw new Error(
        `stable runtime fixture category "${category}" scenario "${optional}" ` +
          'cannot be both required and optional.',
      );
    }
  }

  for (const [index, scenario] of manifest.scenarios.entries()) {
    if (!scenario || typeof scenario !== 'object') {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `entry ${index + 1} must be an object.`,
      );
    }

    if (typeof scenario.id !== 'string' || scenario.id.trim() === '') {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `entry ${index + 1} must include an id.`,
      );
    }

    if (seenScenarios.has(scenario.id)) {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `repeats scenario "${scenario.id}".`,
      );
    }
    seenScenarios.add(scenario.id);

    for (const requiredField of ['title', 'operations', 'pass_criteria']) {
      if (!(requiredField in scenario)) {
        throw new Error(
          `stable runtime fixture category "${category}" scenario ` +
            `"${scenario.id}" must include ${requiredField}.`,
        );
      }
    }

    for (const arrayField of ['operations', 'pass_criteria']) {
      if (
        !Array.isArray(scenario[arrayField]) ||
        scenario[arrayField].length === 0
      ) {
        throw new Error(
          `stable runtime fixture category "${category}" scenario ` +
            `"${scenario.id}" must include non-empty ${arrayField}.`,
        );
      }
    }
  }

  for (const expected of expectedScenarios) {
    if (!seenScenarios.has(expected)) {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `is missing required scenario "${expected}".`,
      );
    }
  }

  for (const optional of optionalScenarios) {
    if (!seenScenarios.has(optional)) {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `is missing optional scenario "${optional}".`,
      );
    }
  }

  for (const actual of seenScenarios) {
    if (!expectedScenarios.has(actual) && !optionalScenarios.has(actual)) {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `declares scenario "${actual}" that is neither required nor optional.`,
      );
    }
  }

  assertVersionedRuntimeScenarioCriteria(contract, manifest, category, source);
  assertVersionedRuntimeScenarioPublicRequirements(
    contract,
    manifest,
    category,
    source,
  );
}

function assertStableRuntimeSourcesArePublic(contract) {
  const catalog = contract.fixture_catalog || {};

  for (const category of runtimeScenarioCategories(contract)) {
    const entry = catalog[category];
    if (!entry) {
      throw new Error(
        `stable_runtime_scenario_coverage references unknown category "${category}".`,
      );
    }

    if (entry.status !== 'stable') {
      throw new Error(
        `stable runtime fixture category "${category}" must have stable status.`,
      );
    }

    if (
      !Array.isArray(entry.required_scenarios) ||
      entry.required_scenarios.length === 0
    ) {
      throw new Error(
        `stable runtime fixture category "${category}" must list ` +
          `required_scenarios in the suite manifest.`,
      );
    }

    let hasScenarioManifest = false;

    for (const source of entry.sources || []) {
      if (!source || typeof source !== 'object') {
        throw new Error(
          `stable runtime fixture category "${category}" has an invalid source.`,
        );
      }

      if (isPublicRuntimeScenarioManifest(source)) {
        hasScenarioManifest = true;
        assertRuntimeScenarioManifest(contract, category, entry, source);
      }
    }

    if (!hasScenarioManifest) {
      throw new Error(
        `stable runtime fixture category "${category}" must include a ` +
          `consumer-resolvable runtime scenario artifact under ` +
          `https://durable-workflow.github.io/platform-conformance/.`,
      );
    }
  }
}

function assertRetainedCliJsonEnvelopeRevisions(contract) {
  for (const [revisionText, expectedManifestDigest] of Object.entries(
    RETAINED_CLI_MANIFEST_SHA256,
  )) {
    const revision = Number(revisionText);
    const baseUrl =
      `https://durable-workflow.github.io/cli-json-envelopes/v${revision}`;
    const directory = path.join(
      repoRoot,
      'static',
      'cli-json-envelopes',
      `v${revision}`,
    );
    const manifestPath = path.join(directory, 'manifest.json');
    const manifestBytes = fs.readFileSync(manifestPath);
    const manifestDigest =
      'sha256:' +
      crypto.createHash('sha256').update(manifestBytes).digest('hex');

    if (manifestDigest !== expectedManifestDigest) {
      throw new Error(
        `retained CLI manifest v${revision} digest ${manifestDigest} must ` +
          `remain ${expectedManifestDigest}; publish a new revision instead ` +
          `of overwriting retained bytes.`,
      );
    }

    const manifest = loadJson(
      manifestPath,
      `retained CLI output-schema manifest v${revision}`,
    );
    if (
      manifest.schema !== 'durable-workflow.cli.output-schema-manifest' ||
      manifest.version !== revision ||
      manifest.artifact_id !==
        `durable-workflow.cli.output-schema-manifest@${revision}` ||
      manifest.resolver_url !== `${baseUrl}/manifest.json` ||
      !manifest.commands ||
      typeof manifest.commands !== 'object' ||
      Array.isArray(manifest.commands)
    ) {
      throw new Error(
        `retained CLI output-schema manifest v${revision} has an invalid identity.`,
      );
    }

    const jsonlCommands = manifest.jsonl_commands || {};
    if (
      typeof jsonlCommands !== 'object' ||
      Array.isArray(jsonlCommands)
    ) {
      throw new Error(
        `retained CLI output-schema manifest v${revision} has invalid JSONL mappings.`,
      );
    }
    if (
      revision === 3 &&
      (
        Object.keys(manifest.commands).length !== 79 ||
        Object.keys(jsonlCommands).length !== 12
      )
    ) {
      throw new Error(
        'retained CLI output-schema manifest v3 must bind all 79 JSON and ' +
          '12 JSONL command mappings.',
      );
    }

    const referencedSchemaUrls = new Map();
    for (const [group, mappings] of [
      ['commands', manifest.commands],
      ['jsonl_commands', jsonlCommands],
    ]) {
      for (const [command, entry] of Object.entries(mappings)) {
        if (
          !entry ||
          typeof entry !== 'object' ||
          Array.isArray(entry) ||
          !/^schemas\/output\/[a-z0-9.-]+\.schema\.json$/.test(entry.schema)
        ) {
          throw new Error(
            `retained CLI manifest v${revision} ${group}.${command} ` +
              `has an invalid schema mapping.`,
          );
        }
        if (
          group === 'jsonl_commands' &&
          (
            !(command in manifest.commands) ||
            entry.output !== '--output=jsonl' ||
            typeof entry.stream_items_from !== 'string' ||
            entry.stream_items_from.length === 0
          )
        ) {
          throw new Error(
            `retained CLI manifest v${revision} ${group}.${command} ` +
              `has an invalid record-level JSONL mapping.`,
          );
        }

        const filename = path.basename(entry.schema);
        const resolverUrl = `${baseUrl}/schemas/${filename}`;
        if (
          entry.schema_id !== resolverUrl ||
          entry.resolver_url !== resolverUrl ||
          !/^sha256:[a-f0-9]{64}$/.test(entry.sha256)
        ) {
          throw new Error(
            `retained CLI manifest v${revision} ${group}.${command} ` +
              `has an invalid resolver or digest identity.`,
          );
        }

        const schemaPath = path.join(directory, 'schemas', filename);
        const schemaBytes = fs.readFileSync(schemaPath);
        const schemaDigest =
          'sha256:' +
          crypto.createHash('sha256').update(schemaBytes).digest('hex');
        if (schemaDigest !== entry.sha256) {
          throw new Error(
            `retained CLI schema ${resolverUrl} does not match its manifest digest.`,
          );
        }

        const schema = JSON.parse(schemaBytes);
        if (
          schema.$schema !== 'https://json-schema.org/draft/2020-12/schema' ||
          schema.$id !== resolverUrl ||
          schema.type !== 'object'
        ) {
          throw new Error(
            `retained CLI schema ${resolverUrl} has an invalid JSON Schema identity.`,
          );
        }

        if (group === 'jsonl_commands') {
          const reference = String(schema.$ref || '').match(
            /^([a-z0-9.-]+\.schema\.json)#\/properties\/([a-z_]+)\/items$/,
          );
          if (!reference || reference[2] !== entry.stream_items_from) {
            throw new Error(
              `retained CLI JSONL schema ${resolverUrl} must resolve its ` +
                `emitted envelope item definition.`,
            );
          }

          const envelopePath = path.join(directory, 'schemas', reference[1]);
          const envelope = loadJson(
            envelopePath,
            `retained CLI JSONL envelope schema ${reference[1]}`,
          );
          if (
            envelope?.properties?.[reference[2]]?.items?.type !== 'object'
          ) {
            throw new Error(
              `retained CLI JSONL schema ${resolverUrl} references a missing ` +
                `or non-object envelope item definition.`,
            );
          }
        }

        referencedSchemaUrls.set(resolverUrl, entry.sha256);
      }
    }

    const publishedSchemaFiles = fs.readdirSync(path.join(directory, 'schemas'))
      .filter(filename => filename.endsWith('.schema.json'))
      .sort();
    const referencedSchemaFiles = Array.from(referencedSchemaUrls.keys())
      .map(resolverUrl => path.basename(new URL(resolverUrl).pathname))
      .sort();
    if (
      JSON.stringify(publishedSchemaFiles) !==
        JSON.stringify(referencedSchemaFiles)
    ) {
      throw new Error(
        `retained CLI manifest v${revision} must bind its complete published ` +
          `schema directory without missing or unadvertised files.`,
      );
    }

    if (revision === 3) {
      const category = contract.fixture_catalog?.cli_json_envelopes;
      const suiteSources = new Map(
        (category?.sources || []).map(source => [source.resolver_url, source]),
      );
      const expectedUrls = new Set([
        `${baseUrl}/manifest.json`,
        ...referencedSchemaUrls.keys(),
      ]);
      if (
        category?.status !== 'stable' ||
        suiteSources.size !== expectedUrls.size ||
        Array.from(expectedUrls).some(url => !suiteSources.has(url))
      ) {
        throw new Error(
          'the current platform suite must bind the complete retained CLI v3 closure.',
        );
      }

      for (const [url, sha256] of referencedSchemaUrls) {
        const source = suiteSources.get(url);
        const filename = path.basename(new URL(url).pathname);
        if (
          source.artifact_id !==
            `durable-workflow.cli.output-schema/${filename}@3` ||
          source.sha256 !== sha256
        ) {
          throw new Error(
            `the current platform suite binding for ${url} must match the CLI manifest.`,
          );
        }
      }
    }
  }
}

function main() {
  const contract = loadJson(
    contractPath,
    'static/platform-conformance-contract.json',
  );

  assertPublishedRuntimeScenarioCriteriaDigestsImmutable();
  assertPublishedRuntimeScenarioPublicRequirementDigestsImmutable();
  assertPublishedSuiteAuthorityDigestsImmutable();
  assertContractAuthorityResolves(contract);
  assertWorkflowPackageMirrorMatches();
  assertVersionedSuiteAuthorityDigest(contract);
  assertRustSignalQueryAuthority(contract);
  assertArrayOfStrings(contract, 'conformance_levels', [
    'full',
    'partial',
    'provisional',
    'nonconforming',
  ]);
  assertVersionedPassFailRules(contract);
  assertPublishedConformanceDirectoryBoundary();
  assertPublishedConformanceAuthorities(contract);
  assertStableFixtureAuthorityDocsResolve(contract);
  assertStableFixtureSourcesResolve(contract);
  assertStableSourceDependenciesResolve(contract);
  assertWorkerProtocolArtifactHistory(contract);
  assertStableRuntimeSourcesArePublic(contract);
  assertRetainedCliJsonEnvelopeRevisions(contract);
  assertDocIsInSidebar();

  console.log('Platform conformance authority checks passed');
}

if (require.main === module) {
  main();
}

module.exports = {
  assertPublishedConformanceAuthorities,
  assertPublicConformanceContractHasNoInternalHarnessArtifacts,
  assertStableFixtureSourcesResolve,
  assertStableSourceDependenciesResolve,
  assertWorkerProtocolArtifactHistory,
  assertRetainedCliJsonEnvelopeRevisions,
  assertWorkflowPackageAuthorityLock,
  assertWorkflowPackageMirrorMatches,
  collectPublicConformanceContractInternalHarnessLeaks,
};
