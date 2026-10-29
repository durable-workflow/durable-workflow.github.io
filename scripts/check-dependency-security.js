#!/usr/bin/env node

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const semver = require("semver");

const repositoryRoot = path.join(__dirname, "..");
const packageManifest = require(path.join(repositoryRoot, "package.json"));
const lockfileManifest = require(
  path.join(repositoryRoot, "package-lock.json"),
);
const securityPolicy = require("./dependency-security-policy.json");

const EXPECTED_IMAGE_SIZE_VERSION = "2.0.4";
const EXPECTED_IMAGE_SIZE_PARENT = "node_modules/@docusaurus/mdx-loader";
const EXPECTED_DEEPMERGE_VERSION = "4.3.1";
const EXPECTED_DEEPMERGE_PARENT = "node_modules/@svgr/plugin-svgo";
const EXPECTED_ADVISORIES = [
  "GHSA-5p2g-fcmc-qvqq", "GHSA-gcqx-w48m-w2h4", "GHSA-w3rx-r6r6-pgpr",
];
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

function assertMinimumLockedVersion(packageName, minimumVersion, lockfile = lockfileManifest) {
  const entries = lockedEntries(packageName, lockfile);
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

function checkDependencyGraph(lockfile = lockfileManifest) {
  for (const name of [
    "js-yaml", "nanoid", "http-cache-semantics", "open", "undici",
    "body-parser", "fast-uri", "qs", "serialize-javascript",
  ]) {
    assertMinimumLockedVersion(name, securityPolicy.minimum_versions[name], lockfile);
  }
  assert.deepEqual(
    lockedEntries("image-size", lockfile).map(({ entry }) => entry.version),
    [EXPECTED_IMAGE_SIZE_VERSION],
    "the image-size advisory disposition must be reviewed when its locked version changes",
  );
  assert.deepEqual(dependencyParents("image-size", lockfile), [
    EXPECTED_IMAGE_SIZE_PARENT,
  ]);
  assert.equal(packageManifest.dependencies?.["image-size"], undefined);
  assert.deepEqual(
    lockedEntries("deepmerge", lockfile).map(({entry}) => entry.version),
    [EXPECTED_DEEPMERGE_VERSION],
    "the deepmerge disposition requires review when its version or copy count changes",
  );
  assert.deepEqual(
    dependencyParents("deepmerge", lockfile),
    [EXPECTED_DEEPMERGE_PARENT],
    "the deepmerge disposition requires review when its consumers change",
  );
}

function checkRecordedDispositions(policy = securityPolicy) {
  const dispositions = policy.advisory_dispositions;
  assert.deepEqual(
    dispositions.map(({ advisory }) => advisory).sort(),
    EXPECTED_ADVISORIES,
  );

  const imageDispositions = dispositions.filter(({dependency}) => dependency === "image-size");
  assert.equal(imageDispositions.length, 2);
  for (const disposition of imageDispositions) {
    assert.equal(disposition.dependency, "image-size");
    assert.equal(disposition.locked_version, EXPECTED_IMAGE_SIZE_VERSION);
    assert.equal(disposition.disposition, "outside_affected_range");
    assert.equal(disposition.github_dismissal_reason, undefined);
    assert.ok(disposition.justification.includes("static build"));
    assert.ok(
      disposition.justification.includes("no request-time image parsing"),
    );
    assert.ok(disposition.review_when.length > 0);
  }
  const deepmerge = dispositions.find(({dependency}) => dependency === "deepmerge");
  assert.ok(deepmerge, "the unpatched deepmerge disposition must be recorded");
  assert.equal(deepmerge.advisory, "GHSA-gcqx-w48m-w2h4");
  assert.equal(deepmerge.locked_version, EXPECTED_DEEPMERGE_VERSION);
  assert.equal(deepmerge.disposition, "accepted_unused_build_dependency");
  assert.equal(deepmerge.github_dismissal_reason, undefined);
  assert.deepEqual(deepmerge.dependency_parents, [EXPECTED_DEEPMERGE_PARENT]);
  assert.equal(deepmerge.reviewed_source.path, `${EXPECTED_DEEPMERGE_PARENT}/dist/index.js`);
  assert.match(deepmerge.reviewed_source.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(deepmerge.input_sources, [
    "repository_svg_assets", "maintainer_selected_svgo_configuration",
  ]);
  assert.equal(deepmerge.published_site_node_runtime, false);
  assert.ok(deepmerge.justification.length > 0);
  assert.ok(deepmerge.review_when.length > 0);
}

function checkReviewedDeepmergeSource(source) {
  const {reviewed_source: reviewedSource} = securityPolicy.advisory_dispositions.find(
    ({dependency}) => dependency === "deepmerge",
  );
  const content = source ?? fs.readFileSync(path.join(repositoryRoot, reviewedSource.path));
  assert.equal(
    crypto.createHash("sha256").update(content).digest("hex"),
    reviewedSource.sha256,
    "the deepmerge disposition requires review when the installed SVG plugin entrypoint changes",
  );
}

function checkBuildEntryPoints() {
  const command = "node scripts/check-dependency-security.js";
  assert.equal(
    packageManifest.scripts["check:dependency-security"],
    `${command} && node scripts/check-dependency-security.test.js && node scripts/check-open-browser.test.js`,
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
  checkReviewedDeepmergeSource();
  checkBuildEntryPoints();
  checkTrackedBuildAssets();
  console.log(
    "Recorded dependency version floors and build-asset policy checks pass.",
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
  assertMinimumLockedVersion,
  checkDependencyGraph,
  checkRecordedDispositions,
  checkReviewedDeepmergeSource,
  vulnerableImageParser,
};
