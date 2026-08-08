#!/usr/bin/env node

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const semver = require("semver");

const repositoryRoot = path.join(__dirname, "..");
const packageManifest = require(path.join(repositoryRoot, "package.json"));
const lockfileManifest = require(
  path.join(repositoryRoot, "package-lock.json"),
);
const securityPolicy = require("./dependency-security-policy.json");

const EXPECTED_IMAGE_SIZE_VERSION = "2.0.2";
const EXPECTED_IMAGE_SIZE_PARENT = "node_modules/@docusaurus/mdx-loader";
const EXPECTED_ADVISORIES = ["GHSA-5p2g-fcmc-qvqq", "GHSA-w3rx-r6r6-pgpr"];
const VULNERABLE_IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".heic",
  ".heif",
  ".icns",
  ".j2c",
  ".jp2",
  ".jxl",
]);
const HEIF_BRANDS = new Set([
  "avif",
  "heic",
  "heix",
  "hevc",
  "hevx",
  "mif1",
  "msf1",
]);

function lockedEntries(packageName, lockfile = lockfileManifest) {
  const suffix = `/node_modules/${packageName}`;

  return Object.entries(lockfile.packages ?? {})
    .filter(
      ([lockedPath]) =>
        lockedPath === `node_modules/${packageName}` ||
        lockedPath.endsWith(suffix),
    )
    .map(([lockedPath, entry]) => ({ lockedPath, entry }));
}

function dependencyParents(packageName, lockfile = lockfileManifest) {
  return Object.entries(lockfile.packages ?? {})
    .filter(([, entry]) => entry.dependencies?.[packageName] !== undefined)
    .map(([lockedPath]) => lockedPath)
    .sort();
}

function assertMinimumLockedVersion(packageName, minimumVersion) {
  const entries = lockedEntries(packageName);
  assert.ok(
    entries.length > 0,
    `${packageName} must be present in package-lock.json`,
  );

  for (const { lockedPath, entry } of entries) {
    assert.ok(
      semver.gte(entry.version, minimumVersion),
      `${lockedPath} must be at least ${minimumVersion}; found ${entry.version}`,
    );
  }
}

function ascii(input, start, end) {
  return input.subarray(start, end).toString("ascii");
}

function vulnerableImageParser(input) {
  if (input.length >= 4 && ascii(input, 0, 4) === "icns") {
    return "ICNS";
  }

  if (input.length >= 2 && input[0] === 0xff && input[1] === 0x0a) {
    return "JXL";
  }

  if (input.length >= 12) {
    const boxType = ascii(input, 4, 8);
    const brand = ascii(input, 8, 12);

    if (boxType === "JXL ") {
      return "JXL";
    }
    if (boxType === "jP  ") {
      return "JP2";
    }
    if (boxType === "ftyp" && HEIF_BRANDS.has(brand)) {
      return "HEIF";
    }
  }

  return null;
}

function trackedFiles(root = repositoryRoot) {
  const output = childProcess.execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean);
}

function checkTrackedBuildAssets(root = repositoryRoot) {
  const failures = [];

  for (const relativePath of trackedFiles(root)) {
    const extension = path.extname(relativePath).toLowerCase();
    if (VULNERABLE_IMAGE_EXTENSIONS.has(extension)) {
      failures.push(
        `${relativePath} uses the blocked ${extension} image extension`,
      );
      continue;
    }

    const absolutePath = path.join(root, relativePath);
    const stat = fs.lstatSync(absolutePath);
    if (!stat.isFile() || stat.size === 0) {
      continue;
    }

    const descriptor = fs.openSync(absolutePath, "r");
    const header = Buffer.alloc(Math.min(stat.size, 512 * 1024));
    try {
      fs.readSync(descriptor, header, 0, header.length, 0);
    } finally {
      fs.closeSync(descriptor);
    }

    const parser = vulnerableImageParser(header);
    if (parser !== null) {
      failures.push(`${relativePath} has a blocked ${parser} image signature`);
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Unsupported build assets:\n- ${failures.join("\n- ")}`,
  );
}

function checkDependencyGraph() {
  assertMinimumLockedVersion(
    "js-yaml",
    securityPolicy.minimum_versions["js-yaml"],
  );
  assertMinimumLockedVersion("nanoid", securityPolicy.minimum_versions.nanoid);
  assert.deepEqual(
    lockedEntries("image-size").map(({ entry }) => entry.version),
    [EXPECTED_IMAGE_SIZE_VERSION],
    "the unpatched image-size disposition must be reviewed when its locked version changes",
  );
  assert.deepEqual(dependencyParents("image-size"), [
    EXPECTED_IMAGE_SIZE_PARENT,
  ]);
  assert.equal(packageManifest.dependencies?.["image-size"], undefined);
}

function checkRecordedDispositions() {
  const dispositions = securityPolicy.advisory_dispositions;
  assert.deepEqual(
    dispositions.map(({ advisory }) => advisory).sort(),
    EXPECTED_ADVISORIES,
  );

  for (const disposition of dispositions) {
    assert.equal(disposition.dependency, "image-size");
    assert.equal(disposition.locked_version, EXPECTED_IMAGE_SIZE_VERSION);
    assert.equal(disposition.disposition, "not_affected");
    assert.equal(disposition.github_dismissal_reason, "not_used");
    assert.ok(disposition.justification.includes("static build"));
    assert.ok(
      disposition.justification.includes("no request-time image parsing"),
    );
    assert.ok(disposition.review_when.length > 0);
  }
}

function checkBuildEntryPoints() {
  const command = "node scripts/check-dependency-security.js";
  assert.equal(
    packageManifest.scripts["check:dependency-security"],
    `${command} && node scripts/check-dependency-security.test.js`,
  );
  assert.equal(packageManifest.scripts.predocusaurus, command);
  assert.equal(packageManifest.scripts.prestart, command);
  assert.equal(packageManifest.scripts.predeploy, command);

  const checkPosition = packageManifest.scripts.build.indexOf(
    "npm run check:dependency-security",
  );
  const buildPosition =
    packageManifest.scripts.build.indexOf("docusaurus build");
  assert.ok(checkPosition >= 0 && checkPosition < buildPosition);
}

function main() {
  checkDependencyGraph();
  checkRecordedDispositions();
  checkBuildEntryPoints();
  checkTrackedBuildAssets();
  console.log(
    "The docs dependency graph and build-only image parser boundary are secure.",
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  HEIF_BRANDS,
  VULNERABLE_IMAGE_EXTENSIONS,
  vulnerableImageParser,
};
