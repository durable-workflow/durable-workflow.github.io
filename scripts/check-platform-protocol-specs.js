#!/usr/bin/env node
//
// Release-check gate for the platform protocol-spec catalog.
//
// `static/platform-protocol-specs.json` is the machine-readable mirror of
// the platform-wide normative protocol-spec catalog that
// `Workflow\V2\Support\PlatformProtocolSpecs` emits and the standalone
// server re-exports under `platform_protocol_specs` in
// `GET /api/cluster/info`. The catalog is the single source of truth for
// which surfaces have a published machine-readable spec, what format
// (OpenAPI / JSON Schema / AsyncAPI) the spec uses, which repository
// owns it, and which conformance test pins it.
//
// Specifically the script verifies that:
//
// 1. `static/platform-protocol-specs.json` is well-formed and advertises
//    the expected schema id, version, and authority URL.
// 2. Every spec entry has the required fields with valid values:
//    format ∈ {openapi, json_schema, asyncapi}, status ∈ {published,
//    in_progress, planned}, owner_repo ∈ known fleet repos, and a
//    non-empty object_families list that names the schema/version
//    authority for every governed public object family.
// 3. Every spec entry's `surface_family` exists in
//    `static/compatibility-contract.json`. The catalog cannot reference
//    a surface family that the stability contract has not declared.
// 4. The platform protocol-spec deliverable surface set (control-plane API,
//    worker protocol API + stream, history events + export bundle +
//    replay bundle, Waterline read API + diagnostic objects, repair /
//    actionability objects, CLI JSON envelopes, MCP discovery + tool
//    results, cluster-info envelope) is fully enumerated.
// 5. `docs/platform-protocol-specs.md` advertises itself as the catalog,
//    references the schema id, lists every entry with its format /
//    surface family / owner / status / breaking-change rule.
// 6. When an entry's status is `published`, the file at `spec_path`
//    exists in the docs site repo, parses as the format declared by the
//    catalog entry (JSON Schema 2020-12 / OpenAPI 3.1 / AsyncAPI 2.6+),
//    and the document's `$id` (or OpenAPI `info.title` / AsyncAPI `id`)
//    matches the catalog `spec_id` so SDK builds and CI can join the
//    document back to the catalog without parsing prose. The published
//    file must also carry matching x-durable-workflow-object-families
//    metadata so the spec document and catalog cannot disagree about
//    schema/version authority.
// 7. `docs/compatibility.md` cross-links to the new catalog so callers
//    that land on the older authority page can find the spec set.
//
// Drift here means a release shipped a doc or PHP-manifest change
// without updating the JSON mirror (or vice versa). Either fix the doc
// or bump the catalog; do not silence the check.

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const catalogPath = path.join(repoRoot, 'static', 'platform-protocol-specs.json');
const catalogDocPath = path.join(repoRoot, 'docs', 'platform-protocol-specs.md');
const compatibilityDocPath = path.join(repoRoot, 'docs', 'compatibility.md');
const surfaceContractPath = path.join(repoRoot, 'static', 'compatibility-contract.json');

const EXPECTED_SCHEMA = 'durable-workflow.v2.platform-protocol-specs.catalog';
const EXPECTED_AUTHORITY_URL =
  'https://durable-workflow.github.io/docs/2.0/platform-protocol-specs';

const ALLOWED_FORMATS = new Set(['openapi', 'json_schema', 'asyncapi']);
const ALLOWED_STATUSES = new Set(['published', 'in_progress', 'planned']);
const ALLOWED_OWNERS = new Set([
  'durable-workflow/workflow',
  'durable-workflow/server',
  'durable-workflow/waterline',
  'durable-workflow/durable-workflow.github.io',
  'durable-workflow/cli',
  'durable-workflow/sdk-python',
]);
const ALLOWED_BREAKING_CHANGE_RELEASES = new Set([
  'major',
  'parallel_primitive_only',
  'experimental_any_release',
]);
// Each evolution rule pins exactly one valid breaking_change_release.
// Drift here would let a frozen wire format silently claim a
// major-version break, contradicting its rule.
const REQUIRED_BREAKING_CHANGE_RELEASE_BY_RULE = {
  additive_minor_breaking_major: 'major',
  parallel_primitive_only: 'parallel_primitive_only',
  experimental_any_release: 'experimental_any_release',
};

const DELIVERABLE_SPEC_NAMES = [
  'control_plane_api',
  'worker_protocol_api',
  'worker_protocol_stream',
  'history_event_payloads',
  'history_export_bundle',
  'replay_bundle',
  'waterline_read_api',
  'waterline_diagnostic_objects',
  'repair_actionability_objects',
  'cli_json_envelopes',
  'mcp_discovery',
  'mcp_tool_results',
  'cluster_info_envelope',
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

function loadCatalog() {
  const catalog = loadJson(catalogPath, 'static/platform-protocol-specs.json');

  const expectedTopLevel = [
    'schema',
    'version',
    'authority_url',
    'formats',
    'owner_repos',
    'status_levels',
    'evolution_rules',
    'specs',
    'release_check',
  ];
  for (const key of expectedTopLevel) {
    if (!(key in catalog)) {
      throw new Error(
        `static/platform-protocol-specs.json must include top-level key "${key}"`,
      );
    }
  }

  if (catalog.schema !== EXPECTED_SCHEMA) {
    throw new Error(
      `static/platform-protocol-specs.json schema must be ` +
        `"${EXPECTED_SCHEMA}" (got "${catalog.schema}")`,
    );
  }

  if (typeof catalog.version !== 'number' || catalog.version < 1) {
    throw new Error(
      `static/platform-protocol-specs.json version must be a positive integer ` +
        `(got ${JSON.stringify(catalog.version)})`,
    );
  }

  if (catalog.authority_url !== EXPECTED_AUTHORITY_URL) {
    throw new Error(
      `static/platform-protocol-specs.json authority_url must point at ` +
        `${EXPECTED_AUTHORITY_URL} (got "${catalog.authority_url}")`,
    );
  }

  return catalog;
}

function loadSurfaceFamilies() {
  const surfaceContract = loadJson(
    surfaceContractPath,
    'static/compatibility-contract.json',
  );
  if (!surfaceContract.surface_families) {
    throw new Error(
      `static/compatibility-contract.json is missing surface_families; ` +
        `cannot validate platform-protocol-specs entries against it`,
    );
  }
  return new Set(Object.keys(surfaceContract.surface_families));
}

function assertCatalogEntriesAreWellFormed(catalog, surfaceFamilies) {
  const specs = catalog.specs;
  if (!specs || typeof specs !== 'object') {
    throw new Error(
      `static/platform-protocol-specs.json must include a non-empty "specs" object`,
    );
  }

  for (const name of DELIVERABLE_SPEC_NAMES) {
    if (!(name in specs)) {
      throw new Error(
        `static/platform-protocol-specs.json must enumerate spec "${name}" ` +
          `to cover the platform protocol-spec deliverable surface set`,
      );
    }
    if (specs[name].status !== 'published') {
      throw new Error(
        `platform-protocol-specs entry "${name}" must be marked "published"; ` +
          `every public machine-facing surface must have ` +
          `an authoritative machine-readable spec.`,
      );
    }
  }

  for (const [name, entry] of Object.entries(specs)) {
    const requiredFields = [
      'description',
      'format',
      'spec_id',
      'surface_family',
      'authority_manifest',
      'owner_repo',
      'evolution_rule',
      'breaking_change_release',
      'object_families',
      'conformance_test',
      'status',
      'spec_path',
    ];
    for (const field of requiredFields) {
      if (!(field in entry)) {
        throw new Error(
          `platform-protocol-specs entry "${name}" is missing required field "${field}"`,
        );
      }
    }

    if (!ALLOWED_FORMATS.has(entry.format)) {
      throw new Error(
        `platform-protocol-specs entry "${name}" has format "${entry.format}"; ` +
          `must be one of ${Array.from(ALLOWED_FORMATS).join(', ')}`,
      );
    }

    if (!ALLOWED_STATUSES.has(entry.status)) {
      throw new Error(
        `platform-protocol-specs entry "${name}" has status "${entry.status}"; ` +
          `must be one of ${Array.from(ALLOWED_STATUSES).join(', ')}`,
      );
    }

    if (!ALLOWED_OWNERS.has(entry.owner_repo)) {
      throw new Error(
        `platform-protocol-specs entry "${name}" has owner_repo "${entry.owner_repo}"; ` +
          `must be one of ${Array.from(ALLOWED_OWNERS).join(', ')}`,
      );
    }

    if (!ALLOWED_BREAKING_CHANGE_RELEASES.has(entry.breaking_change_release)) {
      throw new Error(
        `platform-protocol-specs entry "${name}" has breaking_change_release ` +
          `"${entry.breaking_change_release}"; must be one of ` +
          `${Array.from(ALLOWED_BREAKING_CHANGE_RELEASES).join(', ')}`,
      );
    }

    const requiredBreakingChangeRelease =
      REQUIRED_BREAKING_CHANGE_RELEASE_BY_RULE[entry.evolution_rule];
    if (requiredBreakingChangeRelease === undefined) {
      throw new Error(
        `platform-protocol-specs entry "${name}" has evolution_rule ` +
          `"${entry.evolution_rule}" which has no required breaking_change_release ` +
          `mapping. Either fix the rule or extend the catalog vocabulary.`,
      );
    }
    if (entry.breaking_change_release !== requiredBreakingChangeRelease) {
      throw new Error(
        `platform-protocol-specs entry "${name}" evolution_rule ` +
          `"${entry.evolution_rule}" requires breaking_change_release ` +
          `"${requiredBreakingChangeRelease}" but the entry declares ` +
          `"${entry.breaking_change_release}". Letting these diverge would ` +
          `let a frozen wire format claim a major-version break, contradicting ` +
          `its rule.`,
      );
    }

    if (!surfaceFamilies.has(entry.surface_family)) {
      throw new Error(
        `platform-protocol-specs entry "${name}" references surface_family ` +
          `"${entry.surface_family}" which is not declared in ` +
          `static/compatibility-contract.json. Either fix the entry or add ` +
          `the surface family to the stability contract.`,
      );
    }

    assertObjectFamiliesAreWellFormed(name, entry);

    if (!entry.spec_id.startsWith('durable-workflow.v2.')) {
      throw new Error(
        `platform-protocol-specs entry "${name}" spec_id "${entry.spec_id}" ` +
          `must live in the durable-workflow.v2.* namespace`,
      );
    }

    if (!entry.spec_path.startsWith('static/platform-protocol-specs/')) {
      throw new Error(
        `platform-protocol-specs entry "${name}" spec_path "${entry.spec_path}" ` +
          `must live under static/platform-protocol-specs/ in the docs site`,
      );
    }

    if (entry.status === 'published') {
      const absoluteSpecPath = path.join(repoRoot, entry.spec_path);
      if (!fs.existsSync(absoluteSpecPath)) {
        throw new Error(
          `platform-protocol-specs entry "${name}" status is "published" but ` +
            `the spec file at ${entry.spec_path} does not exist. Either ship ` +
            `the spec, demote the status to "in_progress" or "planned", or ` +
            `fix the spec_path.`,
        );
      }

      assertPublishedSpecFileMatchesEntry(name, entry, absoluteSpecPath, catalog.version);
    }
  }
}

function assertObjectFamiliesAreWellFormed(name, entry) {
  if (!Array.isArray(entry.object_families) || entry.object_families.length === 0) {
    throw new Error(
      `platform-protocol-specs entry "${name}" must declare a non-empty ` +
        `object_families list so every public object family has explicit ` +
        `schema/version authority.`,
    );
  }

  const seen = new Set();
  for (const family of entry.object_families) {
    if (!family || typeof family !== 'object' || Array.isArray(family)) {
      throw new Error(
        `platform-protocol-specs entry "${name}" has an object_families ` +
          `entry that is not an object.`,
      );
    }

    for (const field of ['name', 'owner_repo', 'schema_authority', 'version_authority']) {
      if (typeof family[field] !== 'string' || family[field].length === 0) {
        throw new Error(
          `platform-protocol-specs entry "${name}" object family must ` +
            `declare non-empty string field "${field}".`,
        );
      }
    }

    if (seen.has(family.name)) {
      throw new Error(
        `platform-protocol-specs entry "${name}" declares object family ` +
          `"${family.name}" more than once.`,
      );
    }
    seen.add(family.name);

    if (!ALLOWED_OWNERS.has(family.owner_repo)) {
      throw new Error(
        `platform-protocol-specs entry "${name}" object family ` +
          `"${family.name}" has owner_repo "${family.owner_repo}"; must be ` +
          `one of ${Array.from(ALLOWED_OWNERS).join(', ')}`,
      );
    }
  }
}

function assertPublishedSpecFileMatchesEntry(name, entry, absoluteSpecPath, catalogVersion) {
  if (entry.format === 'json_schema') {
    if (!entry.spec_path.endsWith('.schema.json')) {
      throw new Error(
        `platform-protocol-specs entry "${name}" format is json_schema but ` +
          `spec_path "${entry.spec_path}" does not end with ".schema.json"; ` +
          `JSON Schema documents must use the .schema.json suffix.`,
      );
    }
    const document = loadJson(absoluteSpecPath, `published spec ${entry.spec_path}`);
    if (document.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
      throw new Error(
        `published spec ${entry.spec_path} for "${name}" must declare ` +
          `$schema = "https://json-schema.org/draft/2020-12/schema" ` +
          `(catalog requires JSON Schema Draft 2020-12).`,
      );
    }
    if (document.$id !== entry.spec_id) {
      throw new Error(
        `published spec ${entry.spec_path} for "${name}" must declare ` +
          `$id = "${entry.spec_id}" so consumers can join the document back ` +
          `to the catalog without parsing prose ` +
          `(got "${document.$id}").`,
      );
    }
    if (typeof document.title !== 'string' || document.title.length === 0) {
      throw new Error(
        `published spec ${entry.spec_path} for "${name}" must declare a ` +
          `non-empty "title" so docs builds and SDK generators can label it.`,
      );
    }
    if (typeof document.description !== 'string' || document.description.length === 0) {
      throw new Error(
        `published spec ${entry.spec_path} for "${name}" must declare a ` +
          `non-empty "description" so consumers reading the file alone ` +
        `understand what surface it pins.`,
      );
    }
    if (document['x-durable-workflow-catalog-entry'] !== name) {
      throw new Error(
        `published spec ${entry.spec_path} for "${name}" must declare ` +
          `"x-durable-workflow-catalog-entry": "${name}" so schema files ` +
          `cannot be moved between catalog entries accidentally.`,
      );
    }
    if (document['x-durable-workflow-catalog-version'] !== catalogVersion) {
      throw new Error(
        `published spec ${entry.spec_path} for "${name}" declares ` +
          `x-durable-workflow-catalog-version = ` +
          `${document['x-durable-workflow-catalog-version']}, but the catalog ` +
          `version is ${catalogVersion}.`,
      );
    }
    if (document['x-durable-workflow-evolution-rule'] !== entry.evolution_rule) {
      throw new Error(
        `published spec ${entry.spec_path} for "${name}" must declare ` +
          `x-durable-workflow-evolution-rule = "${entry.evolution_rule}" ` +
          `(got ${JSON.stringify(document['x-durable-workflow-evolution-rule'])}).`,
      );
    }
    assertObjectFamiliesMatchSpecDocument(
      name,
      entry,
      document['x-durable-workflow-object-families'],
      entry.spec_path,
    );
    if (document.type !== 'object') {
      throw new Error(
        `published spec ${entry.spec_path} for "${name}" must declare ` +
          `"type": "object" at the top level (envelope, object family, or ` +
          `tool-result envelope shapes are all object-typed).`,
      );
    }
  } else if (entry.format === 'openapi') {
    if (!/\.(ya?ml|json)$/.test(entry.spec_path)) {
      throw new Error(
        `platform-protocol-specs entry "${name}" format is openapi but ` +
          `spec_path "${entry.spec_path}" does not end with .yaml/.yml/.json.`,
      );
    }
    const document = read(absoluteSpecPath);
    if (!/^openapi:\s*["']?3\.1\b/m.test(document)) {
      throw new Error(
        `published OpenAPI spec ${entry.spec_path} for "${name}" must ` +
          `declare openapi: 3.1.x.`,
      );
    }
    assertYamlScalar(document, 'title', entry.spec_id, entry.spec_path, name);
    assertYamlScalar(document, 'x-durable-workflow-catalog-entry', name, entry.spec_path, name);
    assertYamlScalar(
      document,
      'x-durable-workflow-catalog-version',
      String(catalogVersion),
      entry.spec_path,
      name,
    );
    assertYamlScalar(
      document,
      'x-durable-workflow-evolution-rule',
      entry.evolution_rule,
      entry.spec_path,
      name,
    );
    assertYamlObjectFamilies(document, entry, entry.spec_path, name);
  } else if (entry.format === 'asyncapi') {
    if (!/\.(ya?ml|json)$/.test(entry.spec_path)) {
      throw new Error(
        `platform-protocol-specs entry "${name}" format is asyncapi but ` +
          `spec_path "${entry.spec_path}" does not end with .yaml/.yml/.json.`,
      );
    }
    const document = read(absoluteSpecPath);
    if (!/^asyncapi:\s*["']?(2\.(6|[7-9])|[3-9]\.)/m.test(document)) {
      throw new Error(
        `published AsyncAPI spec ${entry.spec_path} for "${name}" must ` +
          `declare asyncapi: 2.6.0 or newer.`,
      );
    }
    assertYamlScalar(document, 'id', entry.spec_id, entry.spec_path, name);
    assertYamlScalar(document, 'x-durable-workflow-catalog-entry', name, entry.spec_path, name);
    assertYamlScalar(
      document,
      'x-durable-workflow-catalog-version',
      String(catalogVersion),
      entry.spec_path,
      name,
    );
    assertYamlScalar(
      document,
      'x-durable-workflow-evolution-rule',
      entry.evolution_rule,
      entry.spec_path,
      name,
    );
    assertYamlObjectFamilies(document, entry, entry.spec_path, name);
  }
}

function assertObjectFamiliesMatchSpecDocument(name, entry, documentFamilies, specPath) {
  if (JSON.stringify(documentFamilies) !== JSON.stringify(entry.object_families)) {
    throw new Error(
      `published spec ${specPath} for "${name}" must declare ` +
        `x-durable-workflow-object-families equal to the catalog entry's ` +
        `object_families list so schema/version authority cannot drift.`,
    );
  }
}

function assertYamlObjectFamilies(document, entry, specPath, name) {
  if (!document.includes('x-durable-workflow-object-families:')) {
    throw new Error(
      `published spec ${specPath} for "${name}" must declare ` +
        `x-durable-workflow-object-families metadata.`,
    );
  }

  for (const family of entry.object_families) {
    for (const [field, value] of Object.entries(family)) {
      const raw = `${field}: ${value}`;
      const quoted = `${field}: ${JSON.stringify(value)}`;
      if (!document.includes(raw) && !document.includes(quoted)) {
        throw new Error(
          `published spec ${specPath} for "${name}" must include object ` +
            `family metadata ${field} = ${value}.`,
        );
      }
    }
  }
}

function assertYamlScalar(document, key, expected, specPath, name) {
  const re = new RegExp(
    `^\\s*${escapeRegExp(key)}:\\s*["']?${escapeRegExp(expected)}["']?\\s*$`,
    'm',
  );
  if (!re.test(document)) {
    throw new Error(
      `published spec ${specPath} for "${name}" must declare ${key}: ` +
        `${expected}. This lightweight CI parser only accepts a simple ` +
        `scalar for this required metadata field.`,
    );
  }
}

function assertCatalogDocAlignsWithCatalog(catalog) {
  const doc = read(catalogDocPath);

  if (!doc.includes('catalog of normative machine-readable protocol\nspecifications')) {
    throw new Error(
      `docs/platform-protocol-specs.md must call itself the ` +
        `"catalog of normative machine-readable protocol specifications"; ` +
        `the JSON catalog names it as the authority, so the doc must say so explicitly.`,
    );
  }

  if (!doc.includes(catalog.schema)) {
    throw new Error(
      `docs/platform-protocol-specs.md must reference the catalog schema ` +
        `"${catalog.schema}" so callers can match the doc to the JSON mirror.`,
    );
  }

  for (const format of Object.keys(catalog.formats)) {
    if (!new RegExp(`\\|\\s*\`${format}\``).test(doc)) {
      throw new Error(
        `docs/platform-protocol-specs.md spec-format table must include row for ` +
          `\`${format}\``,
      );
    }
  }

  for (const status of Object.keys(catalog.status_levels)) {
    if (!new RegExp(`\\|\\s*\`${status}\``).test(doc)) {
      throw new Error(
        `docs/platform-protocol-specs.md status-level table must include row for ` +
          `\`${status}\``,
      );
    }
  }

  for (const [name, entry] of Object.entries(catalog.specs)) {
    if (!new RegExp(`### \`${name}\``).test(doc)) {
      throw new Error(
        `docs/platform-protocol-specs.md must include a "### \`${name}\`" ` +
          `section to describe the catalog entry`,
      );
    }
    if (!doc.includes(entry.spec_id)) {
      throw new Error(
        `docs/platform-protocol-specs.md must reference spec_id ` +
          `"${entry.spec_id}" for entry "${name}"`,
      );
    }
    if (!new RegExp(`\\|\\s*Format\\s*\\|\\s*\`${entry.format}\``).test(doc)) {
      throw new Error(
        `docs/platform-protocol-specs.md entry "${name}" must show Format = ` +
          `\`${entry.format}\``,
      );
    }
    if (!new RegExp(`\\|\\s*Status\\s*\\|\\s*\`${entry.status}\``).test(doc)) {
      throw new Error(
        `docs/platform-protocol-specs.md entry "${name}" must show Status = ` +
          `\`${entry.status}\``,
      );
    }
    if (
      !new RegExp(`\\|\\s*Owner repo\\s*\\|\\s*\`${escapeRegExp(entry.owner_repo)}\``).test(
        doc,
      )
    ) {
      throw new Error(
        `docs/platform-protocol-specs.md entry "${name}" must show Owner repo = ` +
          `\`${entry.owner_repo}\``,
      );
    }
    for (const family of entry.object_families) {
      if (!doc.includes(`\`${family.name}\``)) {
        throw new Error(
          `docs/platform-protocol-specs.md entry "${name}" must list ` +
            `object family \`${family.name}\` so schema/version authority ` +
            `is visible in the human-readable catalog.`,
        );
      }

      assertCatalogDocListsObjectFamilyAuthority(doc, name, family);
    }
  }
}

function assertCatalogDocListsObjectFamilyAuthority(doc, name, family) {
  const row = new RegExp(
    `\\|\\s*\`${escapeRegExp(name)}\`\\s*` +
      `\\|\\s*\`${escapeRegExp(family.name)}\`\\s*` +
      `\\|\\s*\`${escapeRegExp(family.owner_repo)}\`\\s*` +
      `\\|\\s*\`${escapeRegExp(family.schema_authority)}\`\\s*` +
      `\\|\\s*\`${escapeRegExp(family.version_authority)}\`\\s*\\|`,
  );

  if (!row.test(doc)) {
    throw new Error(
      `docs/platform-protocol-specs.md must include an object-family ` +
        `authority row for ${name}/${family.name} with owner_repo, ` +
        `schema_authority, and version_authority from the JSON catalog.`,
    );
  }
}

function assertCompatibilityDocCrossLinksCatalog() {
  const doc = read(compatibilityDocPath);
  if (!doc.includes('platform-protocol-specs')) {
    throw new Error(
      `docs/compatibility.md must cross-link to the platform-protocol-specs ` +
        `catalog so callers that land on the stability authority can find ` +
        `the normative spec set`,
    );
  }
}

function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
  const surfaceFamilies = loadSurfaceFamilies();
  const catalog = loadCatalog();

  assertCatalogEntriesAreWellFormed(catalog, surfaceFamilies);
  assertCatalogDocAlignsWithCatalog(catalog);
  assertCompatibilityDocCrossLinksCatalog();

  const specCount = Object.keys(catalog.specs).length;
  console.log(
    `Platform-protocol-specs check passed: ${specCount} spec entries at ` +
      `schema ${catalog.schema} version ${catalog.version}.`,
  );
}

main();
