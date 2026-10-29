#!/usr/bin/env node

const assert = require("node:assert/strict");
const {test} = require("node:test");
const CachePolicy = require("http-cache-semantics");
const lockfile = require("../package-lock.json");
const policy = require("./dependency-security-policy.json");
const {
  assertMinimumLockedVersion,
  checkDependencyGraph,
  checkRecordedDispositions,
  checkReviewedDeepmergeSource,
  vulnerableImageParser,
} = require("./check-dependency-security");

function container(boxType, brand) {
  const input = Buffer.alloc(24);
  input.writeUInt32BE(24, 0);
  input.write(boxType, 4, 4, "ascii");
  input.write(brand, 8, 4, "ascii");
  return input;
}

assert.equal(
  vulnerableImageParser(Buffer.from("icns00000000", "ascii")),
  "ICNS",
);
assert.equal(
  vulnerableImageParser(Buffer.from([0xff, 0x0a, 0x00, 0x00])),
  "JXL",
);
assert.equal(vulnerableImageParser(container("JXL ", "jxl ")), "JXL");
assert.equal(vulnerableImageParser(container("jP  ", "jp2 ")), "JP2");

for (const brand of ["avif", "heic", "heix", "hevc", "hevx", "mif1", "msf1"]) {
  assert.equal(vulnerableImageParser(container("ftyp", brand)), "HEIF");
}

assert.equal(vulnerableImageParser(container("ftyp", "mp42")), null);
assert.equal(
  vulnerableImageParser(Buffer.from("\x89PNG\r\n\x1a\n", "binary")),
  null,
);
assert.equal(
  vulnerableImageParser(Buffer.from('<svg viewBox="0 0 10 10">', "utf8")),
  null,
);

function cacheLock(rootVersion, nestedVersion) {
  return {
    packages: {
      "node_modules/http-cache-semantics": { version: rootVersion },
      ...(nestedVersion ? {
        "node_modules/nested/node_modules/http-cache-semantics": { version: nestedVersion },
      } : {}),
    },
  };
}

assert.throws(
  () => assertMinimumLockedVersion("http-cache-semantics", "4.3.0", cacheLock("4.2.0")),
  /must be at least 4\.3\.0/,
);
assert.throws(
  () => assertMinimumLockedVersion("http-cache-semantics", "4.3.0", cacheLock("4.3.0", "4.2.0")),
  /must be at least 4\.3\.0/,
);
assert.doesNotThrow(
  () => assertMinimumLockedVersion("http-cache-semantics", "4.3.0", cacheLock("4.3.0")),
);

for (const vulnerableVersion of ["7.4.2", "8.4.2", "10.2.0"]) {
  assert.throws(
    () => assertMinimumLockedVersion("open", "11.0.0", {
      packages: {"node_modules/open": {version: vulnerableVersion}},
    }),
    /node_modules\/open must be at least 11\.0\.0/,
  );
  assert.throws(
    () => assertMinimumLockedVersion("open", "11.0.0", {
      packages: {
        "node_modules/open": {version: "11.0.2"},
        "node_modules/patch-package/node_modules/open": {version: vulnerableVersion},
      },
    }),
    /patch-package\/node_modules\/open must be at least 11\.0\.0/,
  );
}
assert.doesNotThrow(
  () => assertMinimumLockedVersion("open", "11.0.0", {
    packages: {
      "node_modules/open": {version: "11.0.2"},
      "node_modules/nested/node_modules/open": {version: "11.0.0"},
    },
  }),
);

function staleCacheReuse(vary) {
  const originalNow = Date.now;
  let clock = Date.parse("2026-10-19T12:00:00Z");
  Date.now = () => clock;
  try {
    const request = {
      url: "https://cache.invalid/public",
      method: "GET",
      headers: { host: "cache.invalid", accept: "text/plain" },
    };
    const policy = new CachePolicy(request, {
      status: 200,
      headers: {
        date: new Date(clock).toUTCString(),
        "cache-control": "public, max-age=1",
        vary,
      },
    });
    clock += 2000;
    assert.equal(policy.stale(), true);
    return policy.satisfiesWithoutRevalidation({
      ...request,
      headers: { ...request.headers, "cache-control": "max-stale=60" },
    });
  } finally {
    Date.now = originalNow;
  }
}

for (const [vary, expectedReuse] of [
  ["*", false],
  ["accept, *", false],
  ["*, accept", false],
  ["accept", true],
]) {
  assert.equal(staleCacheReuse(vary), expectedReuse, `stale cache reuse with Vary: ${vary}`);
}

console.log("Dependency floors, blocked image formats and stale wildcard cache controls pass.");

for (const [name, oldVersion] of [
  ["undici", "7.29.1"], ["body-parser", "1.20.6"], ["fast-uri", "3.1.8"],
  ["qs", "6.16.0"], ["serialize-javascript", "7.0.7"],
]) {
  test(`the dependency preflight rejects old root ${name}`, () => {
    const fixture = structuredClone(lockfile);
    fixture.packages[`node_modules/${name}`].version = oldVersion;
    assert.throws(() => checkDependencyGraph(fixture), new RegExp(`${name} must be at least`));
  });
  test(`the dependency preflight rejects old nested ${name}`, () => {
    const fixture = structuredClone(lockfile);
    fixture.packages[`node_modules/review-fixture/node_modules/${name}`] = {version: oldVersion};
    assert.throws(() => checkDependencyGraph(fixture), new RegExp(`${name} must be at least`));
  });
}
test("the deepmerge version requires renewed review", () => {
  const fixture = structuredClone(lockfile);
  fixture.packages["node_modules/deepmerge"].version = "4.3.2";
  assert.throws(() => checkDependencyGraph(fixture), /deepmerge disposition requires review/);
});
test("an additional deepmerge consumer requires renewed review", () => {
  const fixture = structuredClone(lockfile);
  fixture.packages["node_modules/review-fixture"] = {dependencies: {deepmerge: "^4.3.1"}};
  assert.throws(() => checkDependencyGraph(fixture), /deepmerge disposition requires review/);
});
test("the unpatched disposition cannot disappear silently", () => {
  const fixture = structuredClone(policy);
  fixture.advisory_dispositions = fixture.advisory_dispositions.filter(
    ({dependency}) => dependency !== "deepmerge",
  );
  assert.throws(() => checkRecordedDispositions(fixture));
});
test("changed installed SVG plugin code requires renewed review", () => {
  assert.throws(
    () => checkReviewedDeepmergeSource(Buffer.from('require("deepmerge")')),
    /deepmerge disposition requires review/,
  );
});
