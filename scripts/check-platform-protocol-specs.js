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
// owns it, and which public URL consumers can resolve.
//
// Specifically the script verifies that:
//
// 1. `static/platform-protocol-specs.json` is well-formed and advertises
//    the expected schema id, version, and authority URL. When the
//    workflow repo is available beside this docs checkout (or via
//    WORKFLOW_REPO_PATH), the static mirror must also be byte-equivalent
//    to `workflow/resources/platform-protocol-specs.json`. When the
//    server repo is available beside this docs checkout (or via
//    SERVER_REPO_PATH), server-owned OpenAPI / AsyncAPI / JSON Schema
//    files must also be byte-equivalent to the server's checked-in
//    `resources/platform-protocol-specs/*` copies.
// 2. Every spec entry has the required fields with valid values:
//    format ∈ {openapi, json_schema, asyncapi}, status ∈ {published,
//    in_progress, planned}, owner_repo ∈ known fleet repos, and a
//    non-empty object_families list that names each governed public object
//    family and its owning repository.
// 3. Every spec entry's `surface_family` exists in
//    `static/compatibility-contract.json`. The catalog cannot reference
//    a surface family that the stability contract has not declared.
// 4. The platform protocol-spec deliverable surface set (control-plane API,
//    worker protocol API + stream, history events + export bundle +
//    replay bundle, worker-session runtime, local activity runtime,
//    Waterline read API +
//    diagnostic objects, repair / actionability objects, CLI JSON
//    envelopes, MCP discovery + tool results, cluster-info envelope) is
//    fully enumerated.
// 5. Every non-planned entry exposes an HTTPS `spec_url` in the public
//    protocol-spec namespace. The URL resolves to a shipped static file,
//    which parses as the format declared by the
//    catalog entry (JSON Schema 2020-12 / OpenAPI 3.1 / AsyncAPI 2.6+),
//    and the document's `$id` (or OpenAPI `info.title` / AsyncAPI `id`)
//    matches the catalog `spec_id` so SDK builds and CI can join the
//    document back to the catalog without parsing prose. The published
//    file must also carry matching x-durable-workflow-object-families
//    metadata so the spec document and catalog cannot disagree about
//    family names and owners.
// 6. Public catalog entries reject repository-local paths, implementation
//    symbols, conformance fixtures, and the legacy authority fields that
//    exposed them. Validation-only provenance retains those diagnostics
//    outside the published static tree and covers every entry/object family.
// 7. Public JSON Schema documents that embed an agent-tooling object schema
//    id must declare matching catalog object-family authority, and duplicate
//    embedded definitions must describe the same machine-readable shape.
//
// Human-readable pages can be reorganized independently; this gate compares
// only machine-readable authorities and published spec artifacts.

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const repoRoot = path.join(__dirname, '..');
const catalogPath = path.join(repoRoot, 'static', 'platform-protocol-specs.json');
const surfaceContractPath = path.join(repoRoot, 'static', 'compatibility-contract.json');
const provenancePath = path.join(
  repoRoot,
  'scripts',
  'validation',
  'platform-protocol-specs.provenance.json',
);

const EXPECTED_SCHEMA = 'durable-workflow.v2.platform-protocol-specs.catalog';
const PUBLIC_SITE_ORIGIN = 'https://durable-workflow.github.io';
const EXPECTED_CATALOG_URL = `${PUBLIC_SITE_ORIGIN}/platform-protocol-specs.json`;
const EXPECTED_AUTHORITY_URL =
  `${PUBLIC_SITE_ORIGIN}/docs/2.0/platform-protocol-specs`;
const PUBLIC_SPEC_PATH_PREFIX = '/platform-protocol-specs/';
const EXPECTED_PROVENANCE_SCHEMA =
  'durable-workflow.validation.platform-protocol-specs.provenance';

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
  'worker_sessions_runtime',
  'local_activity_runtime',
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

const REQUIRED_AGENT_TOOLING_SCHEMA_IDS = [
  'durable-workflow.v2.agent-root-cause',
  'durable-workflow.v2.agent-remediation',
  'durable-workflow.v2.safe-mutation',
];
const AGENT_TOOLING_SCHEMA_SPEC_PATHS = [
  'static/platform-protocol-specs/mcp-tool-results.schema.json',
  'static/platform-protocol-specs/repair-actionability-objects.schema.json',
];
const FORBIDDEN_PUBLIC_ENTRY_FIELDS = new Set([
  'spec_path',
  'owner_symbol',
  'conformance_test',
  'conformance_script',
  'schema_authority',
  'version_authority',
]);
const ALLOWED_PUBLIC_ENTRY_FIELDS = new Set([
  'description',
  'format',
  'spec_id',
  'surface_family',
  'authority_manifest',
  'owner_repo',
  'object_families',
  'evolution_rule',
  'breaking_change_release',
  'discovery_endpoint',
  'status',
  'spec_url',
]);
const REQUIRED_RELEASE_GATES = [
  'catalog_aligned_with_surface_families',
  'owner_repo_known',
  'format_known',
  'public_spec_references_resolve',
  'repository_local_authority_fields_rejected',
  'workflow_package_mirror_aligned',
  'server_owned_spec_mirrors_aligned',
  'diagnostic_provenance_complete',
  'object_family_metadata_declared',
  'breaking_change_release_consistent_with_evolution_rule',
  'deliverable_specs_published',
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

function loadYaml(file, label) {
  let raw;
  try {
    raw = read(file);
  } catch (err) {
    throw new Error(`${label} is missing at ${file}.`);
  }

  let document;
  try {
    document = yaml.load(raw, {filename: file});
  } catch (err) {
    throw new Error(`${label} is not valid YAML: ${err.message}`);
  }

  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error(`${label} must contain a YAML mapping at its document root.`);
  }

  return document;
}

function loadCatalog() {
  const catalog = loadJson(catalogPath, 'static/platform-protocol-specs.json');

  const expectedTopLevel = [
    'schema',
    'version',
    'catalog_url',
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

  if (catalog.catalog_url !== EXPECTED_CATALOG_URL) {
    throw new Error(
      `static/platform-protocol-specs.json catalog_url must point at ` +
        `${EXPECTED_CATALOG_URL} (got "${catalog.catalog_url}")`,
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

function resolvePublicSpecReference(specUrl, label) {
  if (typeof specUrl !== 'string' || specUrl.length === 0) {
    throw new Error(`${label} must be a non-empty HTTPS URL.`);
  }

  let parsed;
  try {
    parsed = new URL(specUrl);
  } catch (err) {
    throw new Error(`${label} must be an absolute HTTPS URL (got ${JSON.stringify(specUrl)}).`);
  }

  if (
    parsed.origin !== PUBLIC_SITE_ORIGIN ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      `${label} must use an unqualified ${PUBLIC_SITE_ORIGIN} URL ` +
        `(got "${specUrl}").`,
    );
  }

  let publicPath;
  try {
    publicPath = decodeURIComponent(parsed.pathname);
  } catch (err) {
    throw new Error(`${label} contains invalid URL encoding.`);
  }

  if (
    !publicPath.startsWith(PUBLIC_SPEC_PATH_PREFIX) ||
    publicPath.slice(PUBLIC_SPEC_PATH_PREFIX.length).includes('/') ||
    !/^\/platform-protocol-specs\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(publicPath)
  ) {
    throw new Error(
      `${label} must resolve directly under ${PUBLIC_SITE_ORIGIN}` +
        `${PUBLIC_SPEC_PATH_PREFIX} (got "${specUrl}").`,
    );
  }

  const absolutePath = path.resolve(repoRoot, 'static', publicPath.slice(1));
  const publicSpecRoot = path.resolve(repoRoot, 'static', 'platform-protocol-specs');
  if (!absolutePath.startsWith(`${publicSpecRoot}${path.sep}`)) {
    throw new Error(`${label} escapes the published protocol-spec directory.`);
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(
      `${label} does not resolve to a shipped public artifact at ${absolutePath}.`,
    );
  }

  return {
    absolutePath,
    fileName: path.basename(absolutePath),
    repoRelativePath: path.relative(repoRoot, absolutePath).split(path.sep).join('/'),
  };
}

function assertCatalogDoesNotExposeRepositoryLocalAuthority(catalog) {
  for (const [name, entry] of Object.entries(catalog.specs || {})) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    for (const key of Object.keys(entry)) {
      if (!ALLOWED_PUBLIC_ENTRY_FIELDS.has(key)) {
        throw new Error(
          `static/platform-protocol-specs.json entry "${name}" exposes ` +
            `non-consumer field "${key}"; published entries may contain ` +
            `only the documented consumer-safe fields.`,
        );
      }
    }
  }

  function visit(value, pointer) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${pointer}/${index}`));
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_PUBLIC_ENTRY_FIELDS.has(key)) {
        throw new Error(
          `static/platform-protocol-specs.json exposes repository-local ` +
            `authority field "${key}" at ${pointer}/${key}.`,
        );
      }
      visit(child, `${pointer}/${escapeJsonPointerSegment(key)}`);
    }
  }

  visit(catalog, '#');

  const encodedEntries = JSON.stringify(catalog.specs);
  const forbiddenReferences = [
    {pattern: /(^|[\s\x60("'])((?:\.\.?\/)?(?:tests?|scripts?|src|resources|docs|static)\/)/i, label: 'repository-relative path'},
    {pattern: /\.php\b/i, label: 'source or test filename'},
    {pattern: /::/, label: 'implementation symbol'},
    {pattern: /\\[A-Za-z_]/, label: 'namespaced implementation symbol'},
  ];
  for (const {pattern, label} of forbiddenReferences) {
    if (pattern.test(encodedEntries)) {
      throw new Error(
        `static/platform-protocol-specs.json specs contain a ${label}; ` +
          `consumer authority must use public URLs and stable identifiers.`,
      );
    }
  }
}

function loadAndValidateProvenance(catalog) {
  const provenance = loadJson(
    provenancePath,
    'scripts/validation/platform-protocol-specs.provenance.json',
  );
  if (provenance.schema !== EXPECTED_PROVENANCE_SCHEMA) {
    throw new Error(
      `platform protocol-spec provenance schema must be ` +
        `"${EXPECTED_PROVENANCE_SCHEMA}".`,
    );
  }
  if (
    provenance.catalog_schema !== catalog.schema ||
    provenance.catalog_version !== catalog.version
  ) {
    throw new Error(
      `platform protocol-spec provenance must target catalog ` +
        `${catalog.schema} version ${catalog.version}.`,
    );
  }

  const catalogNames = Object.keys(catalog.specs);
  const provenanceNames = Object.keys(provenance.specs || {});
  if (JSON.stringify(provenanceNames) !== JSON.stringify(catalogNames)) {
    throw new Error(
      `platform protocol-spec provenance must enumerate the same entries, ` +
        `in the same order, as the public catalog.`,
    );
  }

  for (const [name, entry] of Object.entries(catalog.specs)) {
    const diagnostic = provenance.specs[name];
    for (const field of ['owner_symbol', 'conformance_test']) {
      if (typeof diagnostic[field] !== 'string' || diagnostic[field].length === 0) {
        throw new Error(`provenance for "${name}" must declare non-empty ${field}.`);
      }
    }
    if (!Array.isArray(diagnostic.object_families)) {
      throw new Error(`provenance for "${name}" must declare object_families.`);
    }
    const diagnosticFamilies = diagnostic.object_families.map((family) => ({
      name: family.name,
      owner_repo: family.owner_repo,
    }));
    if (JSON.stringify(diagnosticFamilies) !== JSON.stringify(entry.object_families)) {
      throw new Error(
        `provenance object families for "${name}" must match the public catalog's ` +
          `family names and owners.`,
      );
    }
    for (const family of diagnostic.object_families) {
      for (const field of ['schema_authority', 'version_authority']) {
        if (typeof family[field] !== 'string' || family[field].length === 0) {
          throw new Error(
            `provenance for "${name}" object family "${family.name}" must ` +
              `declare non-empty ${field}.`,
          );
        }
      }
    }
  }

  return provenance;
}

function assertReleaseCheckDescribesMachineValidation(catalog) {
  const releaseCheck = catalog.release_check;
  if (!releaseCheck || typeof releaseCheck !== 'object') {
    throw new Error('static/platform-protocol-specs.json must declare release_check.');
  }
  const gateNames = Object.keys(releaseCheck.gates || {});
  if (JSON.stringify(gateNames) !== JSON.stringify(REQUIRED_RELEASE_GATES)) {
    throw new Error(
      `platform protocol-spec release_check.gates must describe the checks ` +
        `that scripts/check-platform-protocol-specs.js performs.`,
    );
  }
  const machine = releaseCheck.enforcement?.machine;
  if (typeof machine !== 'string' || machine.length === 0) {
    throw new Error('platform protocol-spec release_check.enforcement.machine is required.');
  }
  for (const falseClaim of ['docs/platform-protocol-specs.md', 'walks the Markdown', 'walks docs/']) {
    if (machine.includes(falseClaim)) {
      throw new Error(
        `platform protocol-spec machine enforcement falsely claims to inspect ` +
          `the human-readable catalog page.`,
      );
    }
  }
  for (const requiredClaim of [
    'loads the public JSON catalog',
    'consumer-safe references',
    'parses each shipped specification',
    'checks object-family and embedded-schema metadata',
    'compares package mirrors when their checkouts are available',
  ]) {
    if (!machine.includes(requiredClaim)) {
      throw new Error(
        `platform protocol-spec machine enforcement must describe the ` +
          `surviving check: ${requiredClaim}.`,
      );
    }
  }
}

function workflowCatalogMirrorPath() {
  const configuredWorkflowRepo = process.env.WORKFLOW_REPO_PATH;
  if (configuredWorkflowRepo) {
    return path.join(configuredWorkflowRepo, 'resources', 'platform-protocol-specs.json');
  }

  const siblingWorkflowCatalogPath = path.join(
    repoRoot,
    '..',
    'workflow',
    'resources',
    'platform-protocol-specs.json',
  );

  return fs.existsSync(siblingWorkflowCatalogPath) ? siblingWorkflowCatalogPath : null;
}

function assertWorkflowCatalogMirrorMatchesWhenAvailable() {
  const workflowCatalogPath = workflowCatalogMirrorPath();
  if (workflowCatalogPath === null) {
    return;
  }

  if (!fs.existsSync(workflowCatalogPath)) {
    throw new Error(
      `WORKFLOW_REPO_PATH was set, but the workflow platform protocol-spec ` +
        `catalog mirror does not exist at ${workflowCatalogPath}.`,
    );
  }

  const docsCatalog = read(catalogPath);
  const workflowCatalog = read(workflowCatalogPath);
  if (docsCatalog !== workflowCatalog) {
    throw new Error(
      `static/platform-protocol-specs.json must be byte-equivalent to ` +
        `${workflowCatalogPath}. Update the docs-site mirror and the ` +
        `workflow package mirror in the same release change.`,
    );
  }
}

function serverSpecMirrorDir() {
  const configuredServerRepo = process.env.SERVER_REPO_PATH;
  if (configuredServerRepo) {
    return path.join(configuredServerRepo, 'resources', 'platform-protocol-specs');
  }

  const siblingServerSpecDir = path.join(
    repoRoot,
    '..',
    'server',
    'resources',
    'platform-protocol-specs',
  );

  return fs.existsSync(siblingServerSpecDir) ? siblingServerSpecDir : null;
}

function assertServerOwnedSpecMirrorsMatchWhenAvailable(catalog) {
  const serverSpecDir = serverSpecMirrorDir();
  if (serverSpecDir === null) {
    return;
  }

  if (!fs.existsSync(serverSpecDir)) {
    throw new Error(
      `SERVER_REPO_PATH was set, but the server protocol-spec mirror ` +
        `directory does not exist at ${serverSpecDir}.`,
    );
  }

  for (const [name, entry] of Object.entries(catalog.specs)) {
    if (entry.owner_repo !== 'durable-workflow/server') {
      continue;
    }

    if (entry.status === 'planned') {
      continue;
    }

    const publicSpec = resolvePublicSpecReference(
      entry.spec_url,
      `platform-protocol-specs entry "${name}" spec_url`,
    );
    const fileName = publicSpec.fileName;
    const docsSpecPath = publicSpec.absolutePath;
    const serverSpecPath = path.join(serverSpecDir, fileName);

    if (!fs.existsSync(serverSpecPath)) {
      throw new Error(
        `server-owned platform protocol spec "${name}" must have a ` +
          `server repo mirror at resources/platform-protocol-specs/${fileName}.`,
      );
    }

    const docsSpec = read(docsSpecPath);
    const serverSpec = read(serverSpecPath);
    if (docsSpec !== serverSpec) {
      throw new Error(
        `server-owned platform protocol spec "${name}" differs between ` +
          `${publicSpec.repoRelativePath} and ${serverSpecPath}. Update the owner repo ` +
          `copy and the docs-site published copy in the same release change.`,
      );
    }
  }
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
      'status',
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

    if (entry.status === 'planned') {
      if ('spec_url' in entry) {
        throw new Error(
          `platform-protocol-specs entry "${name}" is planned and must not ` +
            `advertise spec_url before a public artifact exists.`,
        );
      }
    } else {
      const publicSpec = resolvePublicSpecReference(
        entry.spec_url,
        `platform-protocol-specs entry "${name}" spec_url`,
      );
      assertPublishedSpecFileMatchesEntry(
        name,
        entry,
        publicSpec,
        catalog.version,
      );
    }
  }
}

function assertObjectFamiliesAreWellFormed(name, entry) {
  if (!Array.isArray(entry.object_families) || entry.object_families.length === 0) {
    throw new Error(
      `platform-protocol-specs entry "${name}" must declare a non-empty ` +
        `object_families list so every public object family has explicit ` +
        `ownership metadata.`,
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

    const fields = Object.keys(family);
    if (JSON.stringify(fields) !== JSON.stringify(['name', 'owner_repo'])) {
      throw new Error(
        `platform-protocol-specs entry "${name}" object family must expose ` +
          `only consumer-safe name and owner_repo fields.`,
      );
    }

    for (const field of fields) {
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

function assertPublishedSpecFileMatchesEntry(name, entry, publicSpec, catalogVersion) {
  const {absolutePath: absoluteSpecPath, repoRelativePath: specPath} = publicSpec;
  if (entry.format === 'json_schema') {
    if (!specPath.endsWith('.schema.json')) {
      throw new Error(
        `platform-protocol-specs entry "${name}" format is json_schema but ` +
          `spec_url "${entry.spec_url}" does not end with ".schema.json"; ` +
          `JSON Schema documents must use the .schema.json suffix.`,
      );
    }
    const document = loadJson(absoluteSpecPath, `published spec ${specPath}`);
    if (document.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
      throw new Error(
        `published spec ${specPath} for "${name}" must declare ` +
          `$schema = "https://json-schema.org/draft/2020-12/schema" ` +
          `(catalog requires JSON Schema Draft 2020-12).`,
      );
    }
    if (document.$id !== entry.spec_id) {
      throw new Error(
        `published spec ${specPath} for "${name}" must declare ` +
          `$id = "${entry.spec_id}" so consumers can join the document back ` +
          `to the catalog without parsing prose ` +
          `(got "${document.$id}").`,
      );
    }
    if (typeof document.title !== 'string' || document.title.length === 0) {
      throw new Error(
        `published spec ${specPath} for "${name}" must declare a ` +
          `non-empty "title" so docs builds and SDK generators can label it.`,
      );
    }
    if (typeof document.description !== 'string' || document.description.length === 0) {
      throw new Error(
        `published spec ${specPath} for "${name}" must declare a ` +
          `non-empty "description" so consumers reading the file alone ` +
        `understand what surface it pins.`,
      );
    }
    if (document['x-durable-workflow-catalog-entry'] !== name) {
      throw new Error(
        `published spec ${specPath} for "${name}" must declare ` +
          `"x-durable-workflow-catalog-entry": "${name}" so schema files ` +
          `cannot be moved between catalog entries accidentally.`,
      );
    }
    if (document['x-durable-workflow-catalog-version'] !== catalogVersion) {
      throw new Error(
        `published spec ${specPath} for "${name}" declares ` +
          `x-durable-workflow-catalog-version = ` +
          `${document['x-durable-workflow-catalog-version']}, but the catalog ` +
          `version is ${catalogVersion}.`,
      );
    }
    if (document['x-durable-workflow-evolution-rule'] !== entry.evolution_rule) {
      throw new Error(
        `published spec ${specPath} for "${name}" must declare ` +
          `x-durable-workflow-evolution-rule = "${entry.evolution_rule}" ` +
          `(got ${JSON.stringify(document['x-durable-workflow-evolution-rule'])}).`,
      );
    }
    assertObjectFamiliesMatchSpecDocument(
      name,
      entry,
      document['x-durable-workflow-object-families'],
      specPath,
    );
    if (document.type !== 'object') {
      throw new Error(
        `published spec ${specPath} for "${name}" must declare ` +
          `"type": "object" at the top level (envelope, object family, or ` +
          `tool-result envelope shapes are all object-typed).`,
      );
    }
  } else if (entry.format === 'openapi') {
    if (!/\.(ya?ml|json)$/.test(specPath)) {
      throw new Error(
        `platform-protocol-specs entry "${name}" format is openapi but ` +
          `spec_url "${entry.spec_url}" does not end with .yaml/.yml/.json.`,
      );
    }
    const document = loadYaml(absoluteSpecPath, `published OpenAPI spec ${specPath}`);
    if (typeof document.openapi !== 'string' || !/^3\.1\.\d+$/.test(document.openapi)) {
      throw new Error(
        `published OpenAPI spec ${specPath} for "${name}" must ` +
          `declare openapi: 3.1.x.`,
      );
    }
    assertYamlDocumentValue(document.info?.title, entry.spec_id, 'info.title', specPath, name);
    assertYamlDocumentValue(
      document['x-durable-workflow-catalog-entry'],
      name,
      'x-durable-workflow-catalog-entry',
      specPath,
      name,
    );
    assertYamlDocumentValue(
      document['x-durable-workflow-catalog-version'],
      catalogVersion,
      'x-durable-workflow-catalog-version',
      specPath,
      name,
    );
    assertYamlDocumentValue(
      document['x-durable-workflow-evolution-rule'],
      entry.evolution_rule,
      'x-durable-workflow-evolution-rule',
      specPath,
      name,
    );
    assertObjectFamiliesMatchSpecDocument(
      name,
      entry,
      document['x-durable-workflow-object-families'],
      specPath,
    );
  } else if (entry.format === 'asyncapi') {
    if (!/\.(ya?ml|json)$/.test(specPath)) {
      throw new Error(
        `platform-protocol-specs entry "${name}" format is asyncapi but ` +
          `spec_url "${entry.spec_url}" does not end with .yaml/.yml/.json.`,
      );
    }
    const document = loadYaml(absoluteSpecPath, `published AsyncAPI spec ${specPath}`);
    if (!isSupportedAsyncApiVersion(document.asyncapi)) {
      throw new Error(
        `published AsyncAPI spec ${specPath} for "${name}" must ` +
          `declare asyncapi: 2.6.0 or newer.`,
      );
    }
    assertYamlDocumentValue(document.id, entry.spec_id, 'id', specPath, name);
    assertYamlDocumentValue(
      document['x-durable-workflow-catalog-entry'],
      name,
      'x-durable-workflow-catalog-entry',
      specPath,
      name,
    );
    assertYamlDocumentValue(
      document['x-durable-workflow-catalog-version'],
      catalogVersion,
      'x-durable-workflow-catalog-version',
      specPath,
      name,
    );
    assertYamlDocumentValue(
      document['x-durable-workflow-evolution-rule'],
      entry.evolution_rule,
      'x-durable-workflow-evolution-rule',
      specPath,
      name,
    );
    assertObjectFamiliesMatchSpecDocument(
      name,
      entry,
      document['x-durable-workflow-object-families'],
      specPath,
    );
  }
}

function assertAgentToolingSchemaDefinitionsAreAligned(catalog) {
  const recordsBySchemaId = new Map();
  for (const schemaId of REQUIRED_AGENT_TOOLING_SCHEMA_IDS) {
    recordsBySchemaId.set(schemaId, []);
  }
  const records = [];

  for (const [entryName, entry] of Object.entries(catalog.specs)) {
    if (entry.status !== 'published' || entry.format !== 'json_schema') {
      continue;
    }

    const publicSpec = resolvePublicSpecReference(
      entry.spec_url,
      `platform-protocol-specs entry "${entryName}" spec_url`,
    );
    const document = loadJson(
      publicSpec.absolutePath,
      `published spec ${publicSpec.repoRelativePath}`,
    );
    for (const record of collectAgentToolingSchemaDefinitions(
      document,
      publicSpec.repoRelativePath,
    )) {
      record.catalogEntryName = entryName;
      records.push(record);
      if (!recordsBySchemaId.has(record.schemaId)) {
        recordsBySchemaId.set(record.schemaId, []);
      }
      recordsBySchemaId.get(record.schemaId).push(record);
    }
  }

  assertAgentToolingSchemaIdsHaveCatalogFamilies(catalog, records);

  for (const schemaId of REQUIRED_AGENT_TOOLING_SCHEMA_IDS) {
    const records = recordsBySchemaId.get(schemaId);

    for (const specPath of AGENT_TOOLING_SCHEMA_SPEC_PATHS) {
      if (!records.some((record) => record.specPath === specPath)) {
        throw new Error(
          `published spec ${specPath} must embed a definition for ` +
            `${schemaId}. Agent-tooling object schema ids are published by ` +
            `both the MCP tool-result and repair/actionability specs, so ` +
            `both files must expose the same machine-readable shape.`,
        );
      }
    }
  }

  for (const [schemaId, records] of recordsBySchemaId.entries()) {
    if (records.length === 0) {
      continue;
    }
    const [firstRecord, ...remainingRecords] = records;
    const firstNormalized = normalizeSchemaForComparison(
      firstRecord.node,
      firstRecord.document,
    );
    const firstFingerprint = JSON.stringify(firstNormalized);

    for (const record of remainingRecords) {
      const normalized = normalizeSchemaForComparison(record.node, record.document);
      const fingerprint = JSON.stringify(normalized);
      if (fingerprint !== firstFingerprint) {
        throw new Error(
          `embedded definition for ${schemaId} differs between ` +
            `${firstRecord.specPath}${firstRecord.pointer} and ` +
            `${record.specPath}${record.pointer}. Keep duplicate public ` +
            `agent-tooling schema definitions aligned. Property sets: ` +
            `${formatPropertySet(firstNormalized)} vs ${formatPropertySet(normalized)}.`,
        );
      }
    }
  }
}

function collectAgentToolingSchemaDefinitions(document, specPath) {
  const records = [];

  function visit(node, pointer) {
    if (node === null || typeof node !== 'object') {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${pointer}/${index}`));
      return;
    }

    const schemaId = node.properties?.schema?.const;
    if (isAgentToolingSchemaId(schemaId)) {
      records.push({ document, node, pointer, schemaId, specPath });
    }

    for (const [key, value] of Object.entries(node)) {
      visit(value, `${pointer}/${escapeJsonPointerSegment(key)}`);
    }
  }

  visit(document, '#');
  return records;
}

function assertAgentToolingSchemaIdsHaveCatalogFamilies(catalog, records) {
  for (const record of records) {
    const expectedFamilyName = objectFamilyNameForAgentToolingSchemaId(record.schemaId);
    const entry = catalog.specs[record.catalogEntryName];
    const family = entry.object_families.find(
      (candidate) => candidate.name === expectedFamilyName,
    );

    if (family === undefined) {
      throw new Error(
        `platform-protocol-specs entry "${record.catalogEntryName}" embeds ` +
          `public agent-tooling schema id ${record.schemaId} at ` +
          `${record.specPath}${record.pointer}, but object_families does not ` +
          `declare "${expectedFamilyName}".`,
      );
    }
  }
}

function isAgentToolingSchemaId(schemaId) {
  return (
    typeof schemaId === 'string' &&
    (schemaId.startsWith('durable-workflow.v2.agent-') ||
      schemaId.startsWith('durable-workflow.v2.safe-'))
  );
}

function objectFamilyNameForAgentToolingSchemaId(schemaId) {
  return schemaId.replace(/^durable-workflow\.v2\./, '').replace(/-/g, '_');
}

function normalizeSchemaForComparison(node, document, seenRefs = new Set()) {
  if (node === null || typeof node !== 'object') {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((item) => normalizeSchemaForComparison(item, document, seenRefs));
  }

  if (typeof node.$ref === 'string' && node.$ref.startsWith('#/')) {
    const ref = node.$ref;
    if (seenRefs.has(ref)) {
      return { $ref: ref };
    }
    const nextSeenRefs = new Set(seenRefs);
    nextSeenRefs.add(ref);
    const resolved = normalizeSchemaForComparison(
      resolveJsonPointer(document, ref),
      document,
      nextSeenRefs,
    );

    const siblingKeys = Object.keys(node).filter((key) => key !== '$ref');
    if (siblingKeys.length === 0) {
      return resolved;
    }

    const normalizedWithSiblings = { $ref: resolved };
    for (const key of siblingKeys.sort()) {
      normalizedWithSiblings[key] = normalizeSchemaForComparison(
        node[key],
        document,
        seenRefs,
      );
    }
    return normalizedWithSiblings;
  }

  const normalized = {};
  for (const key of Object.keys(node).sort()) {
    normalized[key] = normalizeSchemaForComparison(node[key], document, seenRefs);
  }
  return normalized;
}

function resolveJsonPointer(document, pointer) {
  let current = document;
  for (const part of pointer.slice(2).split('/').map(unescapeJsonPointerSegment)) {
    if (current === null || typeof current !== 'object' || !(part in current)) {
      throw new Error(`cannot resolve local JSON Schema reference ${pointer}.`);
    }
    current = current[part];
  }
  return current;
}

function formatPropertySet(schema) {
  if (!schema.properties || typeof schema.properties !== 'object') {
    return '(no properties)';
  }

  return Object.keys(schema.properties).sort().join(', ');
}

function assertObjectFamiliesMatchSpecDocument(name, entry, documentFamilies, specPath) {
  if (JSON.stringify(documentFamilies) !== JSON.stringify(entry.object_families)) {
    throw new Error(
      `published spec ${specPath} for "${name}" must declare ` +
        `x-durable-workflow-object-families equal to the catalog entry's ` +
        `object_families list so public family ownership cannot drift.`,
    );
  }
}

function assertYamlDocumentValue(actual, expected, key, specPath, name) {
  if (actual !== expected) {
    throw new Error(
      `published spec ${specPath} for "${name}" must declare ${key}: ` +
        `${expected} at the defined document location ` +
        `(got ${JSON.stringify(actual)}).`,
    );
  }
}

function isSupportedAsyncApiVersion(version) {
  if (typeof version !== 'string') {
    return false;
  }
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) {
    return false;
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 2 || (major === 2 && minor >= 6);
}

function escapeJsonPointerSegment(input) {
  return input.replace(/~/g, '~0').replace(/\//g, '~1');
}

function unescapeJsonPointerSegment(input) {
  return input.replace(/~1/g, '/').replace(/~0/g, '~');
}

function main() {
  const surfaceFamilies = loadSurfaceFamilies();
  const catalog = loadCatalog();

  assertCatalogDoesNotExposeRepositoryLocalAuthority(catalog);
  loadAndValidateProvenance(catalog);
  assertReleaseCheckDescribesMachineValidation(catalog);
  assertWorkflowCatalogMirrorMatchesWhenAvailable();
  assertServerOwnedSpecMirrorsMatchWhenAvailable(catalog);
  assertCatalogEntriesAreWellFormed(catalog, surfaceFamilies);
  assertAgentToolingSchemaDefinitionsAreAligned(catalog);
  const specCount = Object.keys(catalog.specs).length;
  console.log(
    `Platform-protocol-specs check passed: ${specCount} spec entries at ` +
      `schema ${catalog.schema} version ${catalog.version}.`,
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  assertCatalogDoesNotExposeRepositoryLocalAuthority,
  assertPublishedSpecFileMatchesEntry,
  loadYaml,
};
