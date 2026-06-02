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
const path = require('path');
const vm = require('vm');

const repoRoot = path.join(__dirname, '..');
const thisScriptPath = path.relative(repoRoot, __filename).split(path.sep).join('/');
const docsDir = path.join(repoRoot, 'docs');
const configPath = path.join(repoRoot, 'docusaurus.config.js');
const contractPath = path.join(repoRoot, 'static', 'platform-conformance-contract.json');
const authorityDocPath = path.join(repoRoot, 'docs', 'platform-conformance.md');
const protocolSpecsDocPath = path.join(repoRoot, 'docs', 'platform-protocol-specs.md');
const sidebarsPath = path.join(repoRoot, 'sidebars.js');

const EXPECTED_SCHEMA = 'durable-workflow.v2.platform-conformance.suite';
const EXPECTED_RUNTIME_SCENARIO_SCHEMA =
  'durable-workflow.v2.platform-conformance.runtime-scenarios';
const PUBLIC_RUNTIME_MANIFEST_FORBIDDEN_NORMATIVE_FIELDS = new Set([
  'runner_path',
  'runner_command',
  'result_files',
]);
const PUBLIC_RUNTIME_MANIFEST_FORBIDDEN_ARTIFACT_NAME_PATTERNS = [
  /^published-artifacts\.json$/,
  /^pins\.json$/,
  /^run-metadata\.json$/,
  /^artifact-install-evidence\.json$/,
  /^[a-z0-9-]+-(result|record|http-captures)\.json$/,
];
const PUBLIC_RUNTIME_MANIFEST_REPO_LOCAL_SCRIPT_PATTERN =
  /\bscripts\/[A-Za-z0-9_./-]+/;
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
};
const VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_FIELDS = [
  'artifact_policy',
  'common_result_evidence',
  'required_matrix',
  'scenario_requirements',
  'host_runner_contract',
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
};
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
};
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
  'conformance_levels',
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
      `${source.repository}:${source.path} result_statuses for suite version ${contract.version}`,
  );

  return expectedStatuses;
}

function assertSignalQueryRuntimeArtifactPolicy(manifest, category, source) {
  if (category !== 'signal_query_runtime_contract') {
    return;
  }

  const policy = manifest.artifact_policy || {};

  if (policy.requires_resolved_versions !== true) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${source.repository}:${source.path} must require resolved artifact versions.`,
    );
  }

  if (policy.rejects_placeholder_versions !== true) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${source.repository}:${source.path} must advertise placeholder ` +
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
        `${source.repository}:${source.path} must declare common_result_evidence.`,
    );
  }

  for (const requiredField of requiredRunRecordFields) {
    if (!commonEvidence.includes(requiredField)) {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `${source.repository}:${source.path} common_result_evidence must ` +
          `include required run record field "${requiredField}".`,
      );
    }
  }

  if (commonEvidence.includes('linked_findings')) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${source.repository}:${source.path} must use finding_links, not ` +
        `linked_findings, for top-level run records.`,
    );
  }

  assertJsonEqual(
    (manifest.artifact_policy || {}).required_run_record_fields || [],
    requiredRunRecordFields,
    `stable runtime fixture category "${category}" scenario manifest ` +
      `${source.repository}:${source.path} artifact_policy.required_run_record_fields`,
  );
}

function formatJsonPath(segments) {
  return segments.reduce((current, segment) => {
    if (typeof segment === 'number') {
      return `${current}[${segment}]`;
    }

    return `${current}.${segment}`;
  }, '$');
}

function collectPublicRuntimeManifestInternalHarnessLeaks(value, segments = []) {
  const leaks = [];

  if (typeof value === 'string') {
    const scriptMatch = value.match(PUBLIC_RUNTIME_MANIFEST_REPO_LOCAL_SCRIPT_PATTERN);
    if (scriptMatch) {
      leaks.push(`${formatJsonPath(segments)} exposes repo-local path "${scriptMatch[0]}"`);
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
      leaks.push(...collectPublicRuntimeManifestInternalHarnessLeaks(
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

      leaks.push(...collectPublicRuntimeManifestInternalHarnessLeaks(entry, entryPath));
    }
  }

  return leaks;
}

function assertPublicRuntimeManifestHasNoInternalHarnessContract(
  manifest,
  category,
  source,
) {
  if (!isPublicRuntimeScenarioManifest(source)) {
    return;
  }

  const leaks = collectPublicRuntimeManifestInternalHarnessLeaks(manifest);
  if (leaks.length === 0) {
    return;
  }

  throw new Error(
    `stable runtime fixture category "${category}" scenario manifest ` +
      `${source.repository}:${source.path} must describe public evidence ` +
      `requirements, not repo-local runner scripts or internal harness ` +
      `artifact files:\n- ${leaks.join('\n- ')}`,
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
    `${source.repository}:${source.path}`;
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
        `${source.repository}:${source.path} operations/pass_criteria digest ` +
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
        `${source.repository}:${source.path} public requirement digest ` +
        `${actualDigest} must match suite-versioned expectation ` +
        `${expectedDigest}. Advance the suite version and add a new ` +
        `VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS entry before ` +
        `changing stable runtime scenario evidence requirements, ` +
        `artifact_policy, required_matrix, scenario_requirements, or ` +
        `host_runner_contract.`,
    );
  }
}

function splitMarkdownTableRow(line) {
  const trimmed = line.trim();
  return trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function normalizeTableCell(cell) {
  const withoutInlineCode = cell.replace(/`([^`]*)`/g, '$1');
  return withoutInlineCode.replace(/\s+/g, ' ').trim();
}

function extractMarkdownTable(doc, heading) {
  const start = doc.indexOf(heading);
  if (start === -1) {
    throw new Error(`docs/platform-conformance.md must include ${heading}.`);
  }

  const remaining = doc.slice(start);
  const nextHeading = remaining.slice(1).search(/\n## /);
  const section = nextHeading === -1
    ? remaining
    : remaining.slice(0, nextHeading + 1);
  const tableLines = section
    .split(/\r?\n/)
    .filter(line => line.trim().startsWith('|'));

  if (tableLines.length < 3) {
    throw new Error(
      `docs/platform-conformance.md ${heading} section must include a Markdown table.`,
    );
  }

  const headers = splitMarkdownTableRow(tableLines[0]).map(normalizeTableCell);
  const rows = tableLines.slice(2).map((line, index) => ({
    line,
    lineNumberInTable: index + 3,
    cells: splitMarkdownTableRow(line).map(normalizeTableCell),
  }));

  return { headers, rows };
}

function sourceKey(source) {
  return JSON.stringify([source.repository, source.path]);
}

function formatSourceKey(key) {
  const [repository, sourcePath] = JSON.parse(key);
  return `${repository}:${sourcePath}`;
}

function isPublicRuntimeScenarioManifest(source) {
  return (
    source.repository === 'durable-workflow.github.io' &&
    /^static\/platform-conformance\/[^/]+\.json$/.test(source.path || '')
  );
}

function isApprovedPublicRuntimeSource(source) {
  const sourcePath = source.path || '';

  return (
    isPublicRuntimeScenarioManifest(source) ||
    sourcePath.startsWith('tests/fixtures/') ||
    sourcePath.startsWith('tests/Fixtures/') ||
    sourcePath.startsWith('fixtures/')
  );
}

function assertLocalSourcePath(source, category) {
  const sourcePath = source.path || '';
  const fullPath = path.join(repoRoot, sourcePath);
  const relative = path.relative(repoRoot, fullPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `stable runtime fixture category "${category}" source ` +
        `${source.repository}:${sourcePath} must stay inside the docs repo.`,
    );
  }

  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `stable runtime fixture category "${category}" source ` +
        `${source.repository}:${sourcePath} does not exist.`,
    );
  }

  return fullPath;
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

function assertRuntimeScenarioManifest(contract, category, entry, source) {
  const manifest = loadJson(
    assertLocalSourcePath(source, category),
    `${source.repository}:${source.path}`,
  );

  if (manifest.schema !== EXPECTED_RUNTIME_SCENARIO_SCHEMA) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${source.repository}:${source.path} must use schema ` +
        `"${EXPECTED_RUNTIME_SCENARIO_SCHEMA}".`,
    );
  }

  if (manifest.category !== category) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${source.repository}:${source.path} declares category ` +
        `"${manifest.category}".`,
    );
  }

  if (manifest.suite_schema !== contract.schema) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `must reference suite schema "${contract.schema}".`,
    );
  }

  if (manifest.suite_version !== contract.version) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `must reference suite version ${contract.version}.`,
    );
  }

  if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length === 0) {
    throw new Error(
      `stable runtime fixture category "${category}" scenario manifest ` +
        `${source.repository}:${source.path} must declare scenarios.`,
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
  const seenScenarios = new Set();

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

  for (const actual of seenScenarios) {
    if (!expectedScenarios.has(actual)) {
      throw new Error(
        `stable runtime fixture category "${category}" scenario manifest ` +
          `declares scenario "${actual}" that is not listed in the suite manifest.`,
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

function staticSourcePathToServedPath(sourcePath) {
  if (!sourcePath.startsWith('static/')) {
    throw new Error(
      `docs-site scenario manifest path "${sourcePath}" must live under static/.`,
    );
  }

  return `pathname:///${sourcePath.slice('static/'.length)}`;
}

function assertAuthorityDocLinksRuntimeScenarioManifests(contract, doc) {
  for (const category of runtimeScenarioCategories(contract)) {
    const entry = (contract.fixture_catalog || {})[category] || {};

    for (const source of entry.sources || []) {
      if (!isPublicRuntimeScenarioManifest(source)) {
        continue;
      }

      const servedPath = staticSourcePathToServedPath(source.path);

      if (!doc.includes(servedPath)) {
        throw new Error(
          `docs/platform-conformance.md must link ${source.path} using ` +
            `${servedPath} so the published scenario manifest is resolvable ` +
            `from the public site.`,
        );
      }
    }
  }
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

      if (!source.repository || !source.path) {
        throw new Error(
          `stable runtime fixture category "${category}" sources must include ` +
            `repository and path.`,
        );
      }

      if (!isApprovedPublicRuntimeSource(source)) {
        throw new Error(
          `stable runtime fixture category "${category}" source ` +
            `${source.repository}:${source.path} must point at an approved ` +
            `public fixture path or docs-site scenario manifest, not an ` +
            `implementation test or raw test command directory.`,
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
          `docs-site JSON scenario manifest under static/platform-conformance/.`,
      );
    }
  }
}

function assertFixtureCatalogTableMirrorsManifest(contract, doc) {
  const expectedHeaders = ['Category', 'Status', 'Source repository', 'Path', 'Purpose'];
  const { headers, rows } = extractMarkdownTable(doc, '## Fixture Catalog');

  if (headers.length !== expectedHeaders.length) {
    throw new Error(
      `docs/platform-conformance.md fixture catalog table must have columns ` +
        expectedHeaders.join(', '),
    );
  }

  for (const [index, expected] of expectedHeaders.entries()) {
    if (headers[index] !== expected) {
      throw new Error(
        `docs/platform-conformance.md fixture catalog table column ${index + 1} ` +
          `must be "${expected}" (got "${headers[index]}").`,
      );
    }
  }

  const catalog = contract.fixture_catalog || {};
  const docEntriesByCategory = new Map();
  const seenRows = new Set();

  for (const row of rows) {
    if (row.cells.length !== expectedHeaders.length) {
      throw new Error(
        `docs/platform-conformance.md fixture catalog row ${row.lineNumberInTable} ` +
          `must have ${expectedHeaders.length} columns: ${row.line}`,
      );
    }

    const [category, status, repository, sourcePath] = row.cells;
    if (!category || !status || !repository || !sourcePath) {
      throw new Error(
        `docs/platform-conformance.md fixture catalog row ${row.lineNumberInTable} ` +
          `must include category, status, repository, and path.`,
      );
    }

    if (!(category in catalog)) {
      throw new Error(
        `docs/platform-conformance.md fixture catalog lists unknown category "${category}".`,
      );
    }

    const key = `${category}\0${status}\0${repository}\0${sourcePath}`;
    if (seenRows.has(key)) {
      throw new Error(
        `docs/platform-conformance.md fixture catalog repeats ` +
          `${category} ${repository}:${sourcePath}.`,
      );
    }
    seenRows.add(key);

    if (!docEntriesByCategory.has(category)) {
      docEntriesByCategory.set(category, []);
    }
    docEntriesByCategory.get(category).push({ status, repository, path: sourcePath });
  }

  for (const [category, manifestEntry] of Object.entries(catalog)) {
    const docEntries = docEntriesByCategory.get(category) || [];
    if (docEntries.length === 0) {
      throw new Error(
        `docs/platform-conformance.md fixture catalog must list category "${category}".`,
      );
    }

    const statuses = new Set(docEntries.map(entry => entry.status));
    if (statuses.size !== 1 || !statuses.has(manifestEntry.status)) {
      throw new Error(
        `docs/platform-conformance.md fixture catalog status for "${category}" ` +
          `must be "${manifestEntry.status}" (got ${Array.from(statuses).join(', ')}).`,
      );
    }

    const expectedSources = new Set((manifestEntry.sources || []).map(sourceKey));
    const actualSources = new Set(docEntries.map(sourceKey));

    for (const expectedSource of expectedSources) {
      if (!actualSources.has(expectedSource)) {
        throw new Error(
          `docs/platform-conformance.md fixture catalog category "${category}" ` +
            `is missing manifest source ${formatSourceKey(expectedSource)}.`,
        );
      }
    }

    for (const actualSource of actualSources) {
      if (!expectedSources.has(actualSource)) {
        throw new Error(
          `docs/platform-conformance.md fixture catalog category "${category}" ` +
            `lists source not present in the manifest: ${formatSourceKey(actualSource)}.`,
        );
      }
    }
  }
}

function assertAuthorityDocMirrorsManifest(contract) {
  const doc = read(authorityDocPath);

  for (const required of [
    '# Platform Conformance Suite',
    EXPECTED_SCHEMA,
    'static/platform-conformance-contract.json',
    `version\n\`${contract.version}\``,
    'platform_conformance_suite_manifest',
    '## Target Matrix',
    '## Fixture Catalog',
    '## Pass / Fail Rules',
    '## Harness Contract',
    '## Release Gates',
    '## Release Check',
    'Placeholder or unresolved',
  ]) {
    if (!doc.includes(required)) {
      throw new Error(
        `docs/platform-conformance.md must include ${JSON.stringify(required)}.`,
      );
    }
  }

  assertFixtureCatalogTableMirrorsManifest(contract, doc);
  assertAuthorityDocLinksRuntimeScenarioManifests(contract, doc);

  for (const target of Object.keys(contract.targets || {})) {
    if (!doc.includes(`\`${target}\``)) {
      throw new Error(
        `docs/platform-conformance.md must list conformance target "${target}".`,
      );
    }
  }

  for (const category of Object.keys(contract.fixture_catalog || {})) {
    if (!doc.includes(`\`${category}\``)) {
      throw new Error(
        `docs/platform-conformance.md must list fixture category "${category}".`,
      );
    }
  }

  for (const rule of Object.keys(contract.pass_fail_rules || {})) {
    if (!doc.includes(rule)) {
      throw new Error(
        `docs/platform-conformance.md must list pass / fail rule "${rule}".`,
      );
    }
  }

  for (const level of contract.conformance_levels || []) {
    if (!doc.includes(`\`${level}\``)) {
      throw new Error(
        `docs/platform-conformance.md must list conformance level "${level}".`,
      );
    }
  }

  for (const release of Object.keys((contract.release_gates || {}).gates || {})) {
    if (!doc.includes(`\`${release}\``)) {
      throw new Error(
        `docs/platform-conformance.md must list release gate "${release}".`,
      );
    }
  }
}

function assertProtocolCatalogLinksAuthority() {
  const doc = read(protocolSpecsDocPath);

  for (const required of [
    routeForDocPath(EXPECTED_AUTHORITY_DOC),
    'static/platform-conformance-contract.json',
    'platform_conformance_suite',
    'platform_conformance_suite_manifest',
  ]) {
    if (!doc.includes(required)) {
      throw new Error(
        `docs/platform-protocol-specs.md must reference the platform ` +
          `conformance authority with ${JSON.stringify(required)}.`,
      );
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
  assertContractAuthorityResolves(contract);
  assertArrayOfStrings(contract, 'conformance_levels', [
    'full',
    'partial',
    'provisional',
    'nonconforming',
  ]);
  assertVersionedPassFailRules(contract);
  assertStableFixtureAuthorityDocsResolve(contract);
  assertStableRuntimeSourcesArePublic(contract);
  assertAuthorityDocMirrorsManifest(contract);
  assertProtocolCatalogLinksAuthority();
  assertDocIsInSidebar();

  console.log('Platform conformance authority checks passed');
}

main();
