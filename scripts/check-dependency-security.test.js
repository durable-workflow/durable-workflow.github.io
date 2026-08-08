#!/usr/bin/env node

const assert = require("node:assert/strict");
const { vulnerableImageParser } = require("./check-dependency-security");

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

console.log(
  "Dependency security preflight recognizes the blocked image parser inputs.",
);
