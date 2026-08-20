#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  assertAvroOnlyCodecContract,
  loadContract,
} = require('./check-sdk-neutrality-authority');

const repoRoot = path.join(__dirname, '..');
const authorityUrl = 'https://durable-workflow.github.io/sdk-neutrality-contract.json';
const avroProtocolRoute = '/docs/2.0/polyglot/avro-value-protocol/';
const pages = [
  {
    label: 'Embedded-to-Server migration',
    sourcePath: 'docs/polyglot/embedded-to-server.md',
    renderedPath: 'build/docs/2.0/polyglot/embedded-to-server/index.html',
    legacyV1ImportDrain: 'internal',
  },
  {
    label: 'Python SDK',
    sourcePath: 'docs/polyglot/python.md',
    renderedPath: 'build/docs/2.0/polyglot/python/index.html',
    legacyV1ImportDrain: 'none',
  },
];

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseHtmlAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/g)) {
    attributes[match[1]] = decodeHtml(match[2]);
  }
  return attributes;
}

function visibleText(source) {
  return decodeHtml(source.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function semanticCodecBlocks(source) {
  return [
    ...source.matchAll(
      /<div\b([^>]*\bdata-public-payload-codec-contract=["']avro-only["'][^>]*)>([\s\S]*?)<\/div>/g,
    ),
  ];
}

function assertAvroOnlyDocsIdentity(source, expected) {
  const blocks = semanticCodecBlocks(source);
  if (blocks.length !== 1) {
    throw new Error(
      `${expected.label} must declare exactly one semantic Avro-only payload-codec identity.`,
    );
  }

  const attributes = parseHtmlAttributes(blocks[0][1]);
  const expectedAttributes = {
    'data-public-payload-codec-contract': 'avro-only',
    'data-payload-codec': 'avro',
    'data-authority-manifest': authorityUrl,
    'data-legacy-v1-import-drain': expected.legacyV1ImportDrain,
  };
  for (const [name, value] of Object.entries(expectedAttributes)) {
    if (attributes[name] !== value) {
      throw new Error(
        `${expected.label} ${name} must be ${JSON.stringify(value)} ` +
          `(got ${JSON.stringify(attributes[name])}).`,
      );
    }
  }

  const body = blocks[0][2];
  const codecFields = [
    ...body.matchAll(/<code\b([^>]*\bdata-payload-codec-field=["']codec["'][^>]*)>([\s\S]*?)<\/code>/g),
  ];
  if (codecFields.length !== 1 || visibleText(codecFields[0][2]) !== 'avro') {
    throw new Error(`${expected.label} must visibly identify the public payload codec as avro.`);
  }

  const protocolLinks = [...body.matchAll(/<a\b([^>]*)>/g)]
    .map(match => parseHtmlAttributes(match[1]))
    .filter(link => link.href === avroProtocolRoute);
  if (protocolLinks.length !== 1) {
    throw new Error(
      `${expected.label} must link its semantic codec identity to ${avroProtocolRoute}.`,
    );
  }
}

function main() {
  const rendered = process.argv.includes('--rendered');
  assertAvroOnlyCodecContract(loadContract());

  for (const page of pages) {
    const relativePath = rendered ? page.renderedPath : page.sourcePath;
    const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    assertAvroOnlyDocsIdentity(source, page);
  }

  console.log(
    rendered
      ? 'Rendered 2.0 guides expose the semantic Avro-only payload-codec identity.'
      : 'Current 2.0 guides bind their payload-codec identity to the Avro-only authority.',
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  assertAvroOnlyDocsIdentity,
  parseHtmlAttributes,
  semanticCodecBlocks,
};
