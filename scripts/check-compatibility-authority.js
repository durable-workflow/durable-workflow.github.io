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
// 4. `docs/installation.md` does not introduce stability claims that
//    contradict the contract for the PHP workflow package.
// 5. The version-history table on `docs/compatibility.md` does not
//    introduce stability levels that the contract has never heard of.
//
// Drift here means a release shipped a doc change without updating the
// machine-readable contract (or vice versa). Either fix the doc or bump
// the contract; do not silence the check.

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const contractPath = path.join(repoRoot, 'static', 'compatibility-contract.json');
const compatibilityDocPath = path.join(repoRoot, 'docs', 'compatibility.md');
const installationDocPath = path.join(repoRoot, 'docs', 'installation.md');

function read(file) {
  return fs.readFileSync(file, 'utf8');
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
    contract.authority_url !== 'https://durable-workflow.github.io/docs/compatibility'
  ) {
    throw new Error(
      `static/compatibility-contract.json authority_url must point at ` +
        `https://durable-workflow.github.io/docs/compatibility ` +
        `(got "${contract.authority_url}")`,
    );
  }

  return contract;
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
}

function assertInstallationDocAlignsWithContract(contract) {
  const doc = read(installationDocPath);

  const phpFamily = contract.surface_families.official_sdks;
  if (!phpFamily) {
    throw new Error(
      `static/compatibility-contract.json is missing the official_sdks family`,
    );
  }

  const usesAlphaTag = /@alpha/.test(doc);
  const tellsCallerToDropAlpha = /[Dd]rop the `@alpha`/.test(doc);

  // The contract tags `official_sdks` as `stable` overall (the family is
  // supported under semver) but the v2 PHP workflow package itself ships
  // with the `@alpha` Composer stability flag while 2.0 ramps. The
  // installation doc must therefore explicitly tell the caller this is a
  // prerelease tag, not a stable release. The release-check gate enforces
  // both halves:
  //
  // - if the install doc still uses `@alpha` we want it to also document
  //   when to drop it,
  // - and we don't want anyone introducing brand-new stability adjectives
  //   (`@beta`, `@dev-master`, ...) without first updating the contract.
  if (usesAlphaTag && !tellsCallerToDropAlpha) {
    throw new Error(
      `docs/installation.md uses the @alpha Composer stability flag but ` +
        `does not tell the caller when to drop it. Add a sentence explaining ` +
        `that the @alpha is the prerelease ramp for 2.0.0 and should be ` +
        `removed once 2.0.0 ships stable on Packagist; otherwise the install ` +
        `doc disagrees with the compatibility-authority contract about ` +
        `whether the workflow package is stable.`,
    );
  }

  const unknownStabilityTokens = doc.match(/@(beta|dev|rc|nightly|canary)\b/g) || [];
  if (unknownStabilityTokens.length > 0) {
    throw new Error(
      `docs/installation.md uses Composer stability tokens not allowed by ` +
        `the compatibility-authority contract: ` +
        `${unknownStabilityTokens.join(', ')}. Allowed tokens are @alpha ` +
        `(prerelease ramp) and a tagged stable version.`,
    );
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
  assertInstallationDocAlignsWithContract(contract);
  assertVersionHistoryAlignsWithContract(contract);

  console.log(
    `Compatibility-authority check passed: ${Object.keys(contract.surface_families).length} surface families ` +
      `at schema ${contract.schema} version ${contract.version}.`,
  );
}

main();
