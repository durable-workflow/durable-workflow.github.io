#!/usr/bin/env node

const assert = require("node:assert/strict");
const CachePolicy = require("http-cache-semantics");
const {
  assertMinimumLockedVersion,
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
