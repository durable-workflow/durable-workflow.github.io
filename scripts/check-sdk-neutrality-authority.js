#!/usr/bin/env node
//
// Release-check gate for the SDK neutrality contract mirror.
//
// `static/sdk-neutrality-contract.json` is the machine-readable mirror of
// the platform-wide SDK neutrality contract that
// `Workflow\V2\Support\SdkNeutralityContract` emits and the standalone
// server re-exports under `sdk_neutrality_contract` in
// `GET /api/cluster/info`. The contract is the standing rule that public
// Durable contracts stay neutral enough that a future TypeScript, Go,
// Java, or .NET SDK could be written against the published wire
// protocol and the published spec catalog without a protocol redesign.
//
// Specifically the script verifies that:
//
// 1. `static/sdk-neutrality-contract.json` is well-formed and advertises
//    the expected schema id, version, authority_doc, and upstream
//    contract authorities (surface stability, protocol-spec catalog,
//    conformance suite).
// 2. The seven required neutrality rules are present and each rule has a
//    `requirement`, `rationale`, `authority`, and `how_to_apply` line.
// 3. The audit checklist enumerates every neutrality rule and includes
//    the `future_sdk_thought_experiment` step. Every audit step names a
//    declared rule.
// 4. The audit-scope surface families exist in
//    `static/compatibility-contract.json` (the surface stability
//    contract). The neutrality contract cannot reference families that
//    the stability contract has not declared.
// 5. The SDK breadth policy marks PHP, Python, and Rust first-party SDKs as
//    `priority` and TypeScript / Go / Java / .NET as `demand_driven`.
//    The expansion criteria advertise an adoption-signal, a
//    maintenance-commitment, and a no-protocol-redesign rule.
// 6. The release-gates section enumerates the named gates and the
//    machine + human enforcement summary.
// 7. The companion docs site page (`docs/sdk-neutrality.md`) advertises
//    itself as the public mirror, references the schema id, and lists
//    every rule from the contract.
// 8. When the workflow repo is available beside this docs checkout (or
//    via `WORKFLOW_REPO_PATH`), the static mirror must be
//    byte-equivalent to `workflow/resources/sdk-neutrality-contract.json`
//    when that file exists. Drift between the PHP manifest and the JSON
//    mirror means a release shipped a class change without bumping the
//    mirror (or vice versa). Either fix the doc or bump the contract;
//    do not silence the check.

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const contractPath = path.join(repoRoot, 'static', 'sdk-neutrality-contract.json');
const surfaceContractPath = path.join(repoRoot, 'static', 'compatibility-contract.json');
const neutralityDocPath = path.join(repoRoot, 'docs', 'sdk-neutrality.md');

const EXPECTED_SCHEMA = 'durable-workflow.v2.sdk-neutrality.contract';
const EXPECTED_AUTHORITY_DOC =
  'https://github.com/durable-workflow/workflow/blob/v2/docs/architecture/sdk-neutrality.md';

const REQUIRED_RULES = [
  'protocol_neutrality',
  'codec_neutrality',
  'error_shape_neutrality',
  'type_identity_neutrality',
  'replay_fixture_neutrality',
  'discovery_neutrality',
  'documentation_neutrality',
];

const REQUIRED_RULE_FIELDS = ['requirement', 'rationale', 'authority', 'how_to_apply'];

const REQUIRED_AUDIT_STEPS = [
  'protocol_review',
  'codec_review',
  'error_shape_review',
  'type_identity_review',
  'replay_fixture_review',
  'discovery_review',
  'documentation_review',
  'future_sdk_thought_experiment',
];

const REQUIRED_FIRST_PARTY_SDKS = ['php_workflow_package', 'python_sdk', 'rust_sdk'];
const REQUIRED_DEMAND_DRIVEN_SDKS = ['typescript_sdk', 'go_sdk', 'java_sdk', 'dotnet_sdk'];

const REQUIRED_RELEASE_GATES = [
  'audit_recorded',
  'no_php_or_python_only_required_fields',
  'universal_codec_advertised',
  'fixture_schema_validated',
  'discovery_entry_present',
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

function loadContract() {
  const contract = loadJson(contractPath, 'static/sdk-neutrality-contract.json');

  const expectedTopLevel = [
    'schema',
    'version',
    'authority_doc',
    'surface_stability_authority',
    'protocol_specs_authority',
    'conformance_suite_authority',
    'scope',
    'sdk_breadth_policy',
    'neutrality_rules',
    'audit_checklist',
    'audit_scope_surface_families',
    'release_gates',
  ];
  for (const key of expectedTopLevel) {
    if (!(key in contract)) {
      throw new Error(
        `static/sdk-neutrality-contract.json must include top-level key "${key}"`,
      );
    }
  }

  if (contract.schema !== EXPECTED_SCHEMA) {
    throw new Error(
      `static/sdk-neutrality-contract.json schema must be ` +
        `"${EXPECTED_SCHEMA}" (got "${contract.schema}")`,
    );
  }

  if (typeof contract.version !== 'number' || contract.version < 1) {
    throw new Error(
      `static/sdk-neutrality-contract.json version must be a positive integer ` +
        `(got ${JSON.stringify(contract.version)})`,
    );
  }

  if (contract.authority_doc !== EXPECTED_AUTHORITY_DOC) {
    throw new Error(
      `static/sdk-neutrality-contract.json authority_doc must point at ` +
        `${EXPECTED_AUTHORITY_DOC} (got "${contract.authority_doc}")`,
    );
  }

  if (contract.surface_stability_authority !== 'durable-workflow.v2.surface-stability.contract') {
    throw new Error(
      `static/sdk-neutrality-contract.json must point at the surface-stability ` +
        `contract schema as its surface_stability_authority`,
    );
  }
  if (contract.protocol_specs_authority !== 'durable-workflow.v2.platform-protocol-specs.catalog') {
    throw new Error(
      `static/sdk-neutrality-contract.json must point at the platform ` +
        `protocol-spec catalog schema as its protocol_specs_authority`,
    );
  }
  if (contract.conformance_suite_authority !== 'durable-workflow.v2.platform-conformance.suite') {
    throw new Error(
      `static/sdk-neutrality-contract.json must point at the platform ` +
        `conformance-suite schema as its conformance_suite_authority`,
    );
  }

  return contract;
}

function assertScopeNamesPriorityAndFuturePosture(contract) {
  const scope = contract.scope;
  for (const key of ['goal', 'non_goal', 'present_priority', 'future_posture']) {
    if (!(key in scope)) {
      throw new Error(
        `static/sdk-neutrality-contract.json scope must include "${key}"`,
      );
    }
  }
  if (!/TypeScript, Go, Java, or \.NET/.test(scope.goal)) {
    throw new Error(
      `static/sdk-neutrality-contract.json scope.goal must explicitly name ` +
        `TypeScript, Go, Java, and .NET so the contract describes which ` +
        `languages it protects against being locked out`,
    );
  }
  if (!/Python/.test(scope.present_priority)) {
    throw new Error(
      `static/sdk-neutrality-contract.json scope.present_priority must name ` +
        `Python as the highest-value non-PHP SDK`,
    );
  }
  if (!/demand-driven/.test(scope.future_posture)) {
    throw new Error(
      `static/sdk-neutrality-contract.json scope.future_posture must describe ` +
        `future SDK breadth as demand-driven`,
    );
  }
}

function assertNeutralityRules(contract) {
  const rules = contract.neutrality_rules;
  const declared = Object.keys(rules);
  if (declared.length !== REQUIRED_RULES.length) {
    throw new Error(
      `static/sdk-neutrality-contract.json neutrality_rules must declare ` +
        `${REQUIRED_RULES.length} rules (got ${declared.length})`,
    );
  }
  for (const required of REQUIRED_RULES) {
    if (!(required in rules)) {
      throw new Error(
        `static/sdk-neutrality-contract.json neutrality_rules is missing ` +
          `required rule "${required}"`,
      );
    }
    const rule = rules[required];
    for (const field of REQUIRED_RULE_FIELDS) {
      if (!(field in rule) || typeof rule[field] !== 'string' || rule[field].length === 0) {
        throw new Error(
          `static/sdk-neutrality-contract.json neutrality rule "${required}" ` +
            `must include a non-empty "${field}" line`,
        );
      }
    }
  }

  const codec = rules.codec_neutrality;
  if (!/CodecRegistry::universal\(\)/.test(codec.authority)) {
    throw new Error(
      `static/sdk-neutrality-contract.json codec_neutrality.authority must ` +
        `point at the universal codec authority (CodecRegistry::universal())`,
    );
  }
  if (!/universal codec/.test(codec.requirement)) {
    throw new Error(
      `static/sdk-neutrality-contract.json codec_neutrality.requirement must ` +
        `require advertising at least one universal codec`,
    );
  }

  const replay = rules.replay_fixture_neutrality;
  if (!/history_event_payloads/.test(replay.requirement) || !/replay_bundle/.test(replay.requirement)) {
    throw new Error(
      `static/sdk-neutrality-contract.json replay_fixture_neutrality.requirement ` +
        `must reference both the history_event_payloads and replay_bundle ` +
        `published JSON Schemas`,
    );
  }
}

function assertAuditChecklist(contract) {
  const checklist = contract.audit_checklist;
  if (!checklist || typeof checklist !== 'object' || !checklist.steps) {
    throw new Error(
      `static/sdk-neutrality-contract.json audit_checklist must include a steps map`,
    );
  }
  const steps = checklist.steps;
  for (const required of REQUIRED_AUDIT_STEPS) {
    if (!(required in steps)) {
      throw new Error(
        `static/sdk-neutrality-contract.json audit_checklist.steps is missing ` +
          `required step "${required}"`,
      );
    }
  }
  const declaredRules = new Set(Object.keys(contract.neutrality_rules));
  const coveredRules = new Set();
  for (const [name, step] of Object.entries(steps)) {
    if (typeof step.rule !== 'string' || !declaredRules.has(step.rule)) {
      throw new Error(
        `static/sdk-neutrality-contract.json audit step "${name}" references ` +
          `unknown rule "${step.rule}"`,
      );
    }
    if (typeof step.check !== 'string' || step.check.length === 0) {
      throw new Error(
        `static/sdk-neutrality-contract.json audit step "${name}" must include ` +
          `a non-empty check`,
      );
    }
    coveredRules.add(step.rule);
  }
  for (const rule of REQUIRED_RULES) {
    if (!coveredRules.has(rule)) {
      throw new Error(
        `static/sdk-neutrality-contract.json neutrality rule "${rule}" has no ` +
          `matching audit step`,
      );
    }
  }
}

function assertAuditScopeReferencesDeclaredSurfaceFamilies(contract) {
  const surfaceContract = loadJson(
    surfaceContractPath,
    'static/compatibility-contract.json',
  );
  const declaredFamilies = new Set(Object.keys(surfaceContract.surface_families || {}));
  for (const family of contract.audit_scope_surface_families) {
    if (!declaredFamilies.has(family)) {
      throw new Error(
        `static/sdk-neutrality-contract.json audit scope references surface ` +
          `family "${family}" which is not declared by ` +
          `static/compatibility-contract.json. Either add the family to the ` +
          `surface stability contract or drop it from the audit scope.`,
      );
    }
  }
}

function assertSdkBreadthPolicy(contract) {
  const policy = contract.sdk_breadth_policy;
  if (!policy || typeof policy !== 'object') {
    throw new Error(
      `static/sdk-neutrality-contract.json sdk_breadth_policy must be an object`,
    );
  }
  for (const sdk of REQUIRED_FIRST_PARTY_SDKS) {
    if (!policy.first_party || !policy.first_party[sdk]) {
      throw new Error(
        `static/sdk-neutrality-contract.json sdk_breadth_policy.first_party ` +
          `must declare "${sdk}"`,
      );
    }
    if (policy.first_party[sdk].posture !== 'priority') {
      throw new Error(
        `static/sdk-neutrality-contract.json sdk_breadth_policy.first_party.` +
          `${sdk} must have posture "priority" (got ` +
          `"${policy.first_party[sdk].posture}")`,
      );
    }
  }
  for (const sdk of REQUIRED_DEMAND_DRIVEN_SDKS) {
    if (!policy.demand_driven || !policy.demand_driven[sdk]) {
      throw new Error(
        `static/sdk-neutrality-contract.json sdk_breadth_policy.demand_driven ` +
          `must declare "${sdk}" so the contract is explicit that the language ` +
          `has no first-party SDK but must remain reachable`,
      );
    }
    if (policy.demand_driven[sdk].posture !== 'demand_driven') {
      throw new Error(
        `static/sdk-neutrality-contract.json sdk_breadth_policy.demand_driven.` +
          `${sdk} must have posture "demand_driven" (got ` +
          `"${policy.demand_driven[sdk].posture}")`,
      );
    }
  }
  const criteria = policy.expansion_criteria || {};
  for (const key of ['adoption_signal', 'maintenance_commitment', 'no_protocol_redesign']) {
    if (typeof criteria[key] !== 'string' || criteria[key].length === 0) {
      throw new Error(
        `static/sdk-neutrality-contract.json sdk_breadth_policy.expansion_criteria ` +
          `must include "${key}"`,
      );
    }
  }
}

function assertReleaseGates(contract) {
  const releaseGates = contract.release_gates;
  if (!releaseGates || typeof releaseGates !== 'object') {
    throw new Error(
      `static/sdk-neutrality-contract.json release_gates must be an object`,
    );
  }
  const gates = releaseGates.gates || {};
  for (const required of REQUIRED_RELEASE_GATES) {
    if (typeof gates[required] !== 'string' || gates[required].length === 0) {
      throw new Error(
        `static/sdk-neutrality-contract.json release_gates.gates is missing ` +
          `"${required}"`,
      );
    }
  }
  const enforcement = releaseGates.enforcement || {};
  if (typeof enforcement.machine !== 'string' || !/SdkNeutralityContractTest\.php/.test(enforcement.machine)) {
    throw new Error(
      `static/sdk-neutrality-contract.json release_gates.enforcement.machine ` +
        `must name the pinning test (SdkNeutralityContractTest.php)`,
    );
  }
  if (typeof enforcement.human !== 'string' || !/thought experiment/.test(enforcement.human)) {
    throw new Error(
      `static/sdk-neutrality-contract.json release_gates.enforcement.human ` +
        `must reference the future-SDK thought experiment`,
    );
  }
}

function assertNeutralityDocAlignsWithContract(contract) {
  let doc;
  try {
    doc = read(neutralityDocPath);
  } catch (err) {
    throw new Error(
      `docs/sdk-neutrality.md is missing. The neutrality contract is the ` +
        `standing rule for which surfaces stay neutral; the public docs ` +
        `mirror must exist alongside the JSON catalog so SDK authors can ` +
        `read it without cloning the workflow repo.`,
    );
  }

  if (!doc.includes(contract.schema)) {
    throw new Error(
      `docs/sdk-neutrality.md must reference the SDK neutrality schema ` +
        `"${contract.schema}" so callers can match the doc to the JSON mirror.`,
    );
  }

  if (!doc.includes('/sdk-neutrality-contract.json')) {
    throw new Error(
      `docs/sdk-neutrality.md must link to the static JSON mirror at ` +
        `/sdk-neutrality-contract.json`,
    );
  }

  for (const rule of REQUIRED_RULES) {
    if (!new RegExp(`\`${rule}\``).test(doc)) {
      throw new Error(
        `docs/sdk-neutrality.md must reference neutrality rule \`${rule}\` ` +
          `from the contract`,
      );
    }
  }

  for (const sdk of REQUIRED_DEMAND_DRIVEN_SDKS) {
    const language = sdk.replace(/_sdk$/, '');
    const expected = language === 'dotnet' ? '\\.NET' : language[0].toUpperCase() + language.slice(1);
    if (!new RegExp(expected, 'i').test(doc)) {
      throw new Error(
        `docs/sdk-neutrality.md must mention ${expected} so the demand-driven ` +
          `posture is visible to readers`,
      );
    }
  }
}

function workflowMirrorPath() {
  const configuredWorkflowRepo = process.env.WORKFLOW_REPO_PATH;
  if (configuredWorkflowRepo) {
    return path.join(configuredWorkflowRepo, 'resources', 'sdk-neutrality-contract.json');
  }
  const sibling = path.join(
    repoRoot,
    '..',
    'workflow',
    'resources',
    'sdk-neutrality-contract.json',
  );
  return fs.existsSync(sibling) ? sibling : null;
}

function assertWorkflowMirrorMatchesWhenAvailable() {
  const workflowPath = workflowMirrorPath();
  if (workflowPath === null) {
    return;
  }
  if (!fs.existsSync(workflowPath)) {
    throw new Error(
      `WORKFLOW_REPO_PATH was set, but the workflow SDK neutrality mirror ` +
        `does not exist at ${workflowPath}.`,
    );
  }
  const docsCopy = read(contractPath);
  const workflowCopy = read(workflowPath);
  if (docsCopy !== workflowCopy) {
    throw new Error(
      `static/sdk-neutrality-contract.json must be byte-equivalent to ` +
        `${workflowPath}. Update the docs-site mirror and the workflow ` +
        `package mirror in the same release change.`,
    );
  }
}

function main() {
  const contract = loadContract();
  assertScopeNamesPriorityAndFuturePosture(contract);
  assertNeutralityRules(contract);
  assertAuditChecklist(contract);
  assertAuditScopeReferencesDeclaredSurfaceFamilies(contract);
  assertSdkBreadthPolicy(contract);
  assertReleaseGates(contract);
  assertNeutralityDocAlignsWithContract(contract);
  assertWorkflowMirrorMatchesWhenAvailable();

  console.log(
    `SDK-neutrality-authority check passed: ${REQUIRED_RULES.length} rules ` +
      `at schema ${contract.schema} version ${contract.version}.`,
  );
}

main();
