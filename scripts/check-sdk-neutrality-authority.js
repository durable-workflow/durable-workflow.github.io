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
//    `requirement`, `rationale`, `how_to_apply`, and structured public
//    `authority` references.
// 3. The audit checklist enumerates every neutrality rule and includes
//    the `future_sdk_thought_experiment` step. Every audit step names a
//    declared rule.
// 4. The audit-scope surface families exist in
//    `static/compatibility-contract.json` (the surface stability
//    contract). The neutrality contract cannot reference families that
//    the stability contract has not declared.
// 5. The SDK breadth policy marks PHP, Python, and Rust first-party SDKs as
//    `priority`, keeps the embedded Laravel engine in its own section, publishes
//    package and conformance authorities for each, and marks TypeScript / Go /
//    Java / .NET as `demand_driven`.
// 6. Every catalog, protocol/schema, and conformance scenario reference
//    resolves to a published file and identifier in this release checkout.
//    Repository-local paths and implementation symbols are rejected.
// 7. The release-gates section enumerates the named gates and the
//    machine + human enforcement summary.
// 8. Release workflows provide the exact tagged Workflow package authority
//    through `WORKFLOW_SDK_NEUTRALITY_MANIFEST_PATH`. Developer checkouts may
//    instead use a sibling Workflow repo. A versioned digest lock pins every
//    validation mode to the public projection of that Workflow ref and the
//    centralized published artifact tuple. Human-readable pages are not parsed
//    by this machine-contract gate. The lock preserves separate byte digests
//    for the packaged Workflow resource and the Python-enriched docs
//    projection so consumers can verify each identity independently.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  ARTIFACT_VERSIONS,
  PUBLISHED_ARTIFACT_VERSIONS,
  PYTHON_PACKAGE_AUTHORITY,
} = require('./public-artifact-versions');
const {sdkNeutralityContractSource} = require('./refresh-public-artifact-versions');

const repoRoot = path.join(__dirname, '..');
const contractPath = path.join(repoRoot, 'static', 'sdk-neutrality-contract.json');
const surfaceContractPath = path.join(repoRoot, 'static', 'compatibility-contract.json');
const protocolCatalogPath = path.join(repoRoot, 'static', 'platform-protocol-specs.json');
const conformanceSuitePath = path.join(repoRoot, 'static', 'platform-conformance-contract.json');
const workflowAuthorityLockPath = path.join(
  repoRoot,
  'scripts',
  'workflow-sdk-neutrality-authority-lock.json',
);

const EXPECTED_SCHEMA = 'durable-workflow.v2.sdk-neutrality.contract';
const EXPECTED_AUTHORITY_DOC =
  'https://github.com/durable-workflow/workflow/blob/v2/docs/architecture/sdk-neutrality.md';
const EXPECTED_AUTHORITY_URL =
  'https://durable-workflow.github.io/sdk-neutrality-contract.json';
const PUBLIC_SITE_ORIGIN = 'https://durable-workflow.github.io';
const RUNTIME_SCENARIO_SCHEMA =
  'durable-workflow.v2.platform-conformance.runtime-scenarios';

const EXPECTED_PACKAGE_URLS = {
  php_sdk: 'https://packagist.org/packages/durable-workflow/sdk',
  python_sdk: PYTHON_PACKAGE_AUTHORITY.authorityUrl,
  rust_sdk: 'https://crates.io/crates/durable-workflow',
};
const EXPECTED_PACKAGES = {
  php_sdk: 'durable-workflow/sdk',
  python_sdk: 'durable_workflow',
  rust_sdk: 'durable-workflow',
};
const EXPECTED_SDK_CONFORMANCE = {
  php_sdk: {
    category: 'signal_query_runtime_contract',
    actorIds: ['sdk_php', 'php_sdk_client', 'php_worker'],
  },
  python_sdk: {
    category: 'history_replay_bundles',
    actorIds: ['python_sdk_runtime'],
  },
  rust_sdk: {
    category: 'signal_query_runtime_contract',
    actorIds: ['rust_sdk', 'rust_worker', 'rust_sdk_client'],
  },
};
const EXPECTED_EMBEDDED_ENGINES = {
  php_workflow_engine: {
    package: 'durable-workflow/workflow',
    packageUrl: 'https://packagist.org/packages/durable-workflow/workflow',
    language: 'php',
    category: 'history_replay_bundles',
    actorIds: ['workflow_php_runtime'],
  },
};

const REQUIRED_RULES = [
  'protocol_neutrality',
  'codec_neutrality',
  'error_shape_neutrality',
  'type_identity_neutrality',
  'replay_fixture_neutrality',
  'discovery_neutrality',
  'documentation_neutrality',
];

const REQUIRED_RULE_FIELDS = ['requirement', 'rationale', 'how_to_apply'];

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

const REQUIRED_FIRST_PARTY_SDKS = ['php_sdk', 'python_sdk', 'rust_sdk'];
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

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertUniqueNonEmptyStrings(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  const seen = new Set();
  for (const value of values) {
    assertNonEmptyString(value, `${label} entry`);
    if (seen.has(value)) {
      throw new Error(`${label} contains duplicate value "${value}"`);
    }
    seen.add(value);
  }
}

function publicStaticPath(publicUrl, label) {
  let parsed;
  try {
    parsed = new URL(publicUrl);
  } catch (err) {
    throw new Error(`${label} must be an absolute public URL (got ${JSON.stringify(publicUrl)})`);
  }
  if (parsed.origin !== PUBLIC_SITE_ORIGIN || parsed.search || parsed.hash) {
    throw new Error(
      `${label} must use an unqualified ${PUBLIC_SITE_ORIGIN}/ URL ` +
        `(got "${publicUrl}")`,
    );
  }
  const relativePath = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  const resolved = path.resolve(repoRoot, 'static', relativePath);
  const staticRoot = path.resolve(repoRoot, 'static');
  if (resolved !== staticRoot && !resolved.startsWith(`${staticRoot}${path.sep}`)) {
    throw new Error(`${label} escapes the published static directory`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${label} does not resolve to a published artifact at ${resolved}`);
  }
  return resolved;
}

function assertNoRepositoryLocalReferences(contract) {
  const encoded = JSON.stringify(contract);
  const forbidden = [
    { pattern: /(^|[\s`("'])((?:\.\.?\/)?(?:tests?|src|resources|docs|static|sdk-[a-z0-9-]+)\/)/i, label: 'repository-relative path' },
    { pattern: /https?:\/\/[^"\s]*\/(?:tests?|src|resources|static|sdk-[a-z0-9-]+)\//i, label: 'public URL with a repository-local path' },
    { pattern: /\.php\b/i, label: 'PHP source filename' },
    { pattern: /::/, label: 'implementation symbol' },
    { pattern: /\\[A-Za-z_]/, label: 'namespaced implementation symbol' },
  ];
  for (const { pattern, label } of forbidden) {
    if (pattern.test(encoded)) {
      throw new Error(
        `static/sdk-neutrality-contract.json contains a ${label}; ` +
          `public contract authorities must use public URLs and catalog identifiers`,
      );
    }
  }
}

function loadAuthorityCatalogs() {
  const protocolCatalog = loadJson(
    protocolCatalogPath,
    'static/platform-protocol-specs.json',
  );
  const conformanceSuite = loadJson(
    conformanceSuitePath,
    'static/platform-conformance-contract.json',
  );
  const protocolSpecsById = new Map();
  for (const [catalogKey, spec] of Object.entries(protocolCatalog.specs || {})) {
    assertNonEmptyString(
      spec.spec_id,
      `static/platform-protocol-specs.json specs.${catalogKey}.spec_id`,
    );
    if (protocolSpecsById.has(spec.spec_id)) {
      throw new Error(
        `static/platform-protocol-specs.json repeats spec id "${spec.spec_id}"`,
      );
    }
    protocolSpecsById.set(spec.spec_id, spec);
  }
  return { protocolCatalog, conformanceSuite, protocolSpecsById };
}

function loadScenarioCatalog(reference, label, conformanceSuite) {
  const scenarioPath = publicStaticPath(reference.url, `${label}.url`);
  const catalog = loadJson(scenarioPath, label);
  if (catalog.schema !== RUNTIME_SCENARIO_SCHEMA || reference.id !== catalog.schema) {
    throw new Error(
      `${label} schema/id must resolve to "${RUNTIME_SCENARIO_SCHEMA}"`,
    );
  }
  if (catalog.category !== reference.category) {
    throw new Error(
      `${label} category "${reference.category}" does not match the published ` +
        `catalog category "${catalog.category}"`,
    );
  }
  if (catalog.suite_schema !== conformanceSuite.schema) {
    throw new Error(
      `${label} suite_schema "${catalog.suite_schema}" does not match ` +
        `static/platform-conformance-contract.json schema "${conformanceSuite.schema}"`,
    );
  }
  if (!Array.isArray(catalog.scenarios) || catalog.scenarios.length === 0) {
    throw new Error(`${label} resolves to a catalog with no scenarios`);
  }
  return catalog;
}

function assertPublicReference(reference, label, catalogs) {
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
    throw new Error(`${label} must be a structured public authority reference`);
  }
  if (!['catalog', 'protocol_spec', 'scenario_catalog'].includes(reference.kind)) {
    throw new Error(`${label}.kind "${reference.kind}" is not supported`);
  }
  assertNonEmptyString(reference.id, `${label}.id`);
  assertNonEmptyString(reference.url, `${label}.url`);
  publicStaticPath(reference.url, `${label}.url`);

  if (reference.kind === 'protocol_spec') {
    const spec = catalogs.protocolSpecsById.get(reference.id);
    if (!spec) {
      throw new Error(
        `${label}.id "${reference.id}" is not published by ` +
          `static/platform-protocol-specs.json`,
      );
    }
    if (spec.status !== 'published') {
      throw new Error(`${label}.id "${reference.id}" is not published (status ${spec.status})`);
    }
    const expectedUrl = spec.spec_url;
    assertNonEmptyString(
      expectedUrl,
      `static/platform-protocol-specs.json entry for "${reference.id}" spec_url`,
    );
    publicStaticPath(expectedUrl, `protocol catalog spec_url for "${reference.id}"`);
    if (reference.url !== expectedUrl) {
      throw new Error(
        `${label}.url must match the protocol catalog URL for "${reference.id}" ` +
          `(expected "${expectedUrl}")`,
      );
    }
    return;
  }

  if (reference.kind === 'catalog') {
    const catalogsById = new Map([
      [catalogs.protocolCatalog.schema, `${PUBLIC_SITE_ORIGIN}/platform-protocol-specs.json`],
      [catalogs.conformanceSuite.schema, `${PUBLIC_SITE_ORIGIN}/platform-conformance-contract.json`],
    ]);
    const expectedUrl = catalogsById.get(reference.id);
    if (!expectedUrl || reference.url !== expectedUrl) {
      throw new Error(`${label} does not resolve to a recognized published catalog`);
    }
    return;
  }

  assertNonEmptyString(reference.category, `${label}.category`);
  loadScenarioCatalog(reference, label, catalogs.conformanceSuite);
}

function loadContract() {
  const contract = loadJson(contractPath, 'static/sdk-neutrality-contract.json');

  const expectedTopLevel = [
    'schema',
    'version',
    'authority_doc',
    'authority_url',
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

  if (contract.authority_url !== EXPECTED_AUTHORITY_URL) {
    throw new Error(
      `static/sdk-neutrality-contract.json authority_url must point at ` +
        `${EXPECTED_AUTHORITY_URL} (got "${contract.authority_url}")`,
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

function assertNeutralityRules(contract, catalogs) {
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
    if (!Array.isArray(rule.authority) || rule.authority.length === 0) {
      throw new Error(
        `static/sdk-neutrality-contract.json neutrality rule "${required}" ` +
          `must include at least one structured public authority reference`,
      );
    }
    rule.authority.forEach((reference, index) => {
      assertPublicReference(
        reference,
        `neutrality_rules.${required}.authority[${index}]`,
        catalogs,
      );
    });
  }

  const codec = rules.codec_neutrality;
  if (!codec.authority.some(
    (reference) => reference.id === 'durable-workflow.v2.worker-protocol-api',
  )) {
    throw new Error(
      `static/sdk-neutrality-contract.json codec_neutrality.authority must ` +
        `point at the published worker protocol authority`,
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
  for (const requiredId of [
    'durable-workflow.v2.history-event-payloads',
    'durable-workflow.v2.replay-bundle',
  ]) {
    if (!replay.authority.some((reference) => reference.id === requiredId)) {
      throw new Error(
        `static/sdk-neutrality-contract.json replay_fixture_neutrality.authority ` +
          `must include published schema "${requiredId}"`,
      );
    }
  }
  if (!replay.authority.some(
    (reference) => reference.kind === 'scenario_catalog' &&
      reference.category === 'history_replay_bundles',
  )) {
    throw new Error(
      `static/sdk-neutrality-contract.json replay_fixture_neutrality.authority ` +
        `must include the published history_replay_bundles scenario catalog`,
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

function assertSdkBreadthPolicy(contract, catalogs) {
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
    const sdkEntry = policy.first_party[sdk];
    if (sdkEntry.package !== EXPECTED_PACKAGES[sdk]) {
      throw new Error(
        `static/sdk-neutrality-contract.json sdk_breadth_policy.first_party.${sdk}.` +
          `package must be "${EXPECTED_PACKAGES[sdk]}"`,
      );
    }
    if (sdkEntry.package_url !== EXPECTED_PACKAGE_URLS[sdk]) {
      throw new Error(
        `static/sdk-neutrality-contract.json sdk_breadth_policy.first_party.${sdk}.` +
          `package_url must be the public package registry URL ` +
          `"${EXPECTED_PACKAGE_URLS[sdk]}"`,
      );
    }
    const conformance = sdkEntry.conformance;
    if (!conformance || typeof conformance !== 'object' || Array.isArray(conformance)) {
      throw new Error(
        `static/sdk-neutrality-contract.json sdk_breadth_policy.first_party.${sdk} ` +
          `must include a public conformance authority`,
      );
    }
    const scenarioReference = {
      kind: 'scenario_catalog',
      id: conformance.scenario_catalog_schema,
      category: conformance.category,
      url: conformance.scenario_catalog_url,
    };
    const label = `sdk_breadth_policy.first_party.${sdk}.conformance`;
    assertPublicReference(scenarioReference, label, catalogs);
    assertUniqueNonEmptyStrings(conformance.actor_ids, `${label}.actor_ids`);
    assertUniqueNonEmptyStrings(conformance.scenario_ids, `${label}.scenario_ids`);
    const expectedConformance = EXPECTED_SDK_CONFORMANCE[sdk];
    if (conformance.category !== expectedConformance.category) {
      throw new Error(
        `${label}.category must be "${expectedConformance.category}" ` +
          `(got "${conformance.category}")`,
      );
    }
    for (const actorId of expectedConformance.actorIds) {
      if (!conformance.actor_ids.includes(actorId)) {
        throw new Error(`${label}.actor_ids must include "${actorId}"`);
      }
    }

    const scenarioCatalog = loadScenarioCatalog(
      scenarioReference,
      label,
      catalogs.conformanceSuite,
    );
    const scenariosById = new Map(scenarioCatalog.scenarios.map((scenario) => [scenario.id, scenario]));
    const observedActors = new Set();
    for (const scenarioId of conformance.scenario_ids) {
      const scenario = scenariosById.get(scenarioId);
      if (!scenario) {
        throw new Error(
          `${label}.scenario_ids references unpublished scenario "${scenarioId}"`,
        );
      }
      for (const actor of scenario.actors || []) {
        observedActors.add(actor);
      }
    }
    for (const actorId of conformance.actor_ids) {
      if (!observedActors.has(actorId)) {
        throw new Error(
          `${label}.actor_ids references actor "${actorId}" that does not appear ` +
            `in the selected published scenarios`,
        );
      }
    }
  }

  const pythonSdk = policy.first_party.python_sdk;
  const expectedPythonFields = {
    package_version: PYTHON_PACKAGE_AUTHORITY.version,
    registry_version: PYTHON_PACKAGE_AUTHORITY.registryVersion,
    exact_release_url: PYTHON_PACKAGE_AUTHORITY.exactReleaseUrl,
    exact_release_json_url: PYTHON_PACKAGE_AUTHORITY.exactReleaseJsonUrl,
    canonical_project_url: PYTHON_PACKAGE_AUTHORITY.canonicalProjectUrl,
    canonical_project_url_role: 'project_identity_only',
  };
  for (const [field, expected] of Object.entries(expectedPythonFields)) {
    if (pythonSdk[field] !== expected) {
      throw new Error(
        `static/sdk-neutrality-contract.json sdk_breadth_policy.first_party.python_sdk.` +
          `${field} must be ${JSON.stringify(expected)} (got ${JSON.stringify(pythonSdk[field])})`,
      );
    }
  }
  if (
    PYTHON_PACKAGE_AUTHORITY.releasePhase !== 'stable'
    && pythonSdk.package_url === pythonSdk.canonical_project_url
  ) {
    throw new Error(
      'The prerelease Python package_url must not use the canonical unversioned PyPI project page',
    );
  }
  for (const [engine, expected] of Object.entries(EXPECTED_EMBEDDED_ENGINES)) {
    const engineEntry = policy.embedded_engines && policy.embedded_engines[engine];
    if (!engineEntry) {
      throw new Error(
        `static/sdk-neutrality-contract.json sdk_breadth_policy.embedded_engines ` +
          `must declare "${engine}"`,
      );
    }
    const label = `sdk_breadth_policy.embedded_engines.${engine}`;
    if (engineEntry.package !== expected.package) {
      throw new Error(`${label}.package must be "${expected.package}"`);
    }
    if (engineEntry.package_url !== expected.packageUrl) {
      throw new Error(
        `${label}.package_url must be the public package registry URL ` +
          `"${expected.packageUrl}"`,
      );
    }
    if (engineEntry.language !== expected.language) {
      throw new Error(`${label}.language must be "${expected.language}"`);
    }
    if (typeof engineEntry.role !== 'string' || !/embedded laravel/i.test(engineEntry.role)) {
      throw new Error(`${label}.role must identify the embedded Laravel engine boundary`);
    }
    const conformance = engineEntry.conformance;
    if (!conformance || typeof conformance !== 'object' || Array.isArray(conformance)) {
      throw new Error(`${label} must include a public conformance authority`);
    }
    const scenarioReference = {
      kind: 'scenario_catalog',
      id: conformance.scenario_catalog_schema,
      category: conformance.category,
      url: conformance.scenario_catalog_url,
    };
    const conformanceLabel = `${label}.conformance`;
    assertPublicReference(scenarioReference, conformanceLabel, catalogs);
    assertUniqueNonEmptyStrings(conformance.actor_ids, `${conformanceLabel}.actor_ids`);
    assertUniqueNonEmptyStrings(conformance.scenario_ids, `${conformanceLabel}.scenario_ids`);
    if (conformance.category !== expected.category) {
      throw new Error(
        `${conformanceLabel}.category must be "${expected.category}" ` +
          `(got "${conformance.category}")`,
      );
    }
    for (const actorId of expected.actorIds) {
      if (!conformance.actor_ids.includes(actorId)) {
        throw new Error(`${conformanceLabel}.actor_ids must include "${actorId}"`);
      }
    }

    const scenarioCatalog = loadScenarioCatalog(
      scenarioReference,
      conformanceLabel,
      catalogs.conformanceSuite,
    );
    const scenariosById = new Map(
      scenarioCatalog.scenarios.map((scenario) => [scenario.id, scenario]),
    );
    const observedActors = new Set();
    for (const scenarioId of conformance.scenario_ids) {
      const scenario = scenariosById.get(scenarioId);
      if (!scenario) {
        throw new Error(
          `${conformanceLabel}.scenario_ids references unpublished scenario ` +
            `"${scenarioId}"`,
        );
      }
      for (const actor of scenario.actors || []) {
        observedActors.add(actor);
      }
    }
    for (const actorId of conformance.actor_ids) {
      if (!observedActors.has(actorId)) {
        throw new Error(
          `${conformanceLabel}.actor_ids references actor "${actorId}" that does not ` +
            `appear in the selected published scenarios`,
        );
      }
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
  if (enforcement.machine_authority !== contract.authority_url) {
    throw new Error(
      `static/sdk-neutrality-contract.json release_gates.enforcement.machine_authority ` +
        `must point at the public SDK-neutrality contract`,
    );
  }
  publicStaticPath(
    enforcement.machine_authority,
    'release_gates.enforcement.machine_authority',
  );
  if (typeof enforcement.machine !== 'string' ||
      !/authority URL/.test(enforcement.machine) ||
      !/protocol\/schema ID/.test(enforcement.machine) ||
      !/conformance scenario ID/.test(enforcement.machine)) {
    throw new Error(
      `static/sdk-neutrality-contract.json release_gates.enforcement.machine ` +
        `must require public authority URL, protocol/schema ID, and ` +
        `conformance scenario ID resolution`,
    );
  }
  if (typeof enforcement.human !== 'string' || !/thought experiment/.test(enforcement.human)) {
    throw new Error(
      `static/sdk-neutrality-contract.json release_gates.enforcement.human ` +
        `must reference the future-SDK thought experiment`,
    );
  }
}

function workflowMirrorPath(environment = process.env, root = repoRoot) {
  const configuredManifest = environment.WORKFLOW_SDK_NEUTRALITY_MANIFEST_PATH;
  if (configuredManifest) {
    return path.resolve(configuredManifest);
  }

  const configuredWorkflowRepo = environment.WORKFLOW_REPO_PATH;
  if (configuredWorkflowRepo) {
    return path.join(configuredWorkflowRepo, 'resources', 'sdk-neutrality-contract.json');
  }
  const sibling = path.join(
    root,
    '..',
    'workflow',
    'resources',
    'sdk-neutrality-contract.json',
  );
  if (fs.existsSync(sibling)) {
    return sibling;
  }

  return null;
}

function sha256(source) {
  return crypto.createHash('sha256').update(source).digest('hex');
}

function assertPinnedWorkflowAuthority(options = {}) {
  const root = options.repoRoot || repoRoot;
  const lockPath = options.workflowAuthorityLockPath || path.join(
    root,
    'scripts',
    'workflow-sdk-neutrality-authority-lock.json',
  );
  const docsPath = options.contractPath || path.join(
    root,
    'static',
    'sdk-neutrality-contract.json',
  );
  const workflowVersion = options.workflowVersion || ARTIFACT_VERSIONS.workflow;

  if (!fs.existsSync(lockPath)) {
    throw new Error(
      `Workflow SDK neutrality authority input is required but unavailable. ` +
        `Set WORKFLOW_SDK_NEUTRALITY_MANIFEST_PATH to the packaged ` +
        `resources/sdk-neutrality-contract.json file, provide a sibling ` +
        `Workflow checkout, or restore the standalone authority lock at ${lockPath}.`,
    );
  }

  const lock = JSON.parse(read(lockPath));
  if (lock.schema !== 'durable-workflow.docs.workflow-sdk-neutrality-authority-lock') {
    throw new Error(`Workflow SDK neutrality authority lock has an invalid schema at ${lockPath}`);
  }
  if (lock.schema_version !== 3) {
    throw new Error(`Workflow SDK neutrality authority lock has an invalid schema version at ${lockPath}`);
  }
  if (lock.workflow_ref !== workflowVersion) {
    throw new Error(
      `Workflow SDK neutrality authority lock targets ${lock.workflow_ref || '<missing>'}, ` +
        `but scripts/public-artifact-versions.json pins ${workflowVersion}`,
    );
  }
  if (lock.workflow_resource_path !== 'resources/sdk-neutrality-contract.json') {
    throw new Error(
      `Workflow SDK neutrality authority lock must identify ` +
        `resources/sdk-neutrality-contract.json`,
    );
  }
  if (lock.docs_projection_path !== 'static/sdk-neutrality-contract.json') {
    throw new Error(
      `Workflow SDK neutrality authority lock must identify ` +
        `static/sdk-neutrality-contract.json as the docs projection`,
    );
  }
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(lock.workflow_source_commit || '')) {
    throw new Error(
      `Workflow SDK neutrality authority lock has an invalid workflow source commit at ${lockPath}`,
    );
  }
  if (!/^[a-f0-9]{64}$/.test(lock.workflow_resource_sha256 || '')) {
    throw new Error(
      `Workflow SDK neutrality authority lock has an invalid ` +
        `workflow_resource_sha256 at ${lockPath}`,
    );
  }
  if (!/^[a-f0-9]{64}$/.test(lock.docs_projection_sha256 || '')) {
    throw new Error(
      `Workflow SDK neutrality authority lock has an invalid ` +
        `docs_projection_sha256 at ${lockPath}`,
    );
  }
  if (
    lock.python_package_version !== PYTHON_PACKAGE_AUTHORITY.version
    || lock.python_registry_version !== PYTHON_PACKAGE_AUTHORITY.registryVersion
  ) {
    throw new Error(
      `Workflow SDK neutrality authority lock Python tuple must match ` +
        `scripts/published-artifact-versions.json: expected ` +
        `${PYTHON_PACKAGE_AUTHORITY.version} (${PYTHON_PACKAGE_AUTHORITY.registryVersion}), ` +
        `got ${lock.python_package_version || '<missing>'} ` +
        `(${lock.python_registry_version || '<missing>'})`,
    );
  }

  const actualDigest = sha256(read(docsPath));
  if (actualDigest !== lock.docs_projection_sha256) {
    throw new Error(
      `static/sdk-neutrality-contract.json must match the exact public projection for ` +
        `Workflow ${workflowVersion} at digest ${lock.docs_projection_sha256}; ` +
        `got ${actualDigest}`,
    );
  }

  return lock;
}

function assertWorkflowMirrorMatches(options = {}) {
  const root = options.repoRoot || repoRoot;
  const lock = assertPinnedWorkflowAuthority({...options, repoRoot: root});
  const workflowPath = workflowMirrorPath(
    options.environment || process.env,
    root,
  );
  if (workflowPath === null) {
    return;
  }
  if (!fs.existsSync(workflowPath)) {
    throw new Error(
      `The Workflow SDK neutrality authority ` +
        `does not exist at ${workflowPath}.`,
    );
  }
  const docsCopy = read(options.contractPath || path.join(
    root,
    'static',
    'sdk-neutrality-contract.json',
  ));
  const workflowCopy = read(workflowPath);
  const workflowDigest = sha256(workflowCopy);
  if (workflowDigest !== lock.workflow_resource_sha256) {
    throw new Error(
      `${workflowPath} must match the exact tagged Workflow resource digest ` +
        `${lock.workflow_resource_sha256}; got ${workflowDigest}`,
    );
  }
  const expectedDocsCopy = sdkNeutralityContractSource(
    workflowCopy,
    PUBLISHED_ARTIFACT_VERSIONS,
  );
  if (docsCopy !== expectedDocsCopy) {
    throw new Error(
      `static/sdk-neutrality-contract.json must be the exact public projection of ` +
        `${workflowPath} and scripts/published-artifact-versions.json.`,
    );
  }
}

function main() {
  const contract = loadContract();
  const catalogs = loadAuthorityCatalogs();
  publicStaticPath(contract.authority_url, 'static/sdk-neutrality-contract.json authority_url');
  assertNoRepositoryLocalReferences(contract);
  if (contract.protocol_specs_authority !== catalogs.protocolCatalog.schema) {
    throw new Error(
      `static/sdk-neutrality-contract.json protocol_specs_authority does not ` +
        `match the published protocol catalog schema`,
    );
  }
  if (contract.conformance_suite_authority !== catalogs.conformanceSuite.schema) {
    throw new Error(
      `static/sdk-neutrality-contract.json conformance_suite_authority does not ` +
        `match the published conformance suite schema`,
    );
  }
  assertScopeNamesPriorityAndFuturePosture(contract);
  assertNeutralityRules(contract, catalogs);
  assertAuditChecklist(contract);
  assertAuditScopeReferencesDeclaredSurfaceFamilies(contract);
  assertSdkBreadthPolicy(contract, catalogs);
  assertReleaseGates(contract);
  assertWorkflowMirrorMatches();

  console.log(
    `SDK-neutrality-authority check passed: ${REQUIRED_RULES.length} rules ` +
      `at schema ${contract.schema} version ${contract.version}.`,
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  assertNoRepositoryLocalReferences,
  assertNeutralityRules,
  assertPinnedWorkflowAuthority,
  assertReleaseGates,
  assertSdkBreadthPolicy,
  assertWorkflowMirrorMatches,
  loadAuthorityCatalogs,
  loadContract,
  workflowAuthorityLockPath,
  workflowMirrorPath,
};
