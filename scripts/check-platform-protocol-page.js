#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const catalog = require('../static/platform-protocol-specs.json');
const {
  availableProtocolEntries,
} = require('../src/components/ProtocolCatalog/catalog');
const {
  MODEL_CATALOG_END,
  MODEL_CATALOG_START,
  modelProtocolCatalog,
} = require('./render-platform-protocol-catalog');

const repoRoot = path.join(__dirname, '..');
const pagePath = path.join(
  repoRoot,
  'build',
  'docs',
  '2.0',
  'platform-protocol-specs',
  'index.html',
);
const llmPaths = [
  path.join(repoRoot, 'build', 'llms-full-2.0.txt'),
  path.join(repoRoot, 'build', '2.0', 'llms-full.txt'),
];

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing rendered protocol retrieval surface: ${path.relative(repoRoot, filePath)}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(/([:\w-]+)="([^"]*)"/g)) {
    attributes[match[1]] = decodeHtml(match[2]);
  }
  return attributes;
}

function visibleText(source) {
  return decodeHtml(source.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function renderedEntries(html) {
  const entries = new Map();
  for (const match of html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)) {
    const attributes = parseAttributes(match[1]);
    const name = attributes['data-protocol-entry'];
    if (!name) {
      continue;
    }
    if (entries.has(name)) {
      throw new Error(`Rendered protocol page repeats catalog entry "${name}"`);
    }
    entries.set(name, {attributes, body: match[2]});
  }
  return entries;
}

function renderedFamilies(body) {
  const families = [];
  for (const match of body.matchAll(/<li\b([^>]*)>/g)) {
    const attributes = parseAttributes(match[1]);
    if (attributes['data-object-family']) {
      families.push({
        name: attributes['data-object-family'],
        owner_repo: attributes['data-owner-repo'],
      });
    }
  }
  return families;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} must be "${expected}", got "${actual}"`);
  }
}

function assertExactKeys(actual, expected, label) {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`${label} fields do not match the generated catalog projection`);
  }
}

function parseModelProtocolCatalog(content, label) {
  const start = content.indexOf(MODEL_CATALOG_START);
  const end = content.indexOf(MODEL_CATALOG_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${label} is missing its generated protocol catalog block`);
  }
  if (
    start !== content.lastIndexOf(MODEL_CATALOG_START) ||
    end !== content.lastIndexOf(MODEL_CATALOG_END)
  ) {
    throw new Error(`${label} must contain exactly one generated protocol catalog block`);
  }

  const block = content
    .slice(start + MODEL_CATALOG_START.length, end)
    .trim();
  const jsonBlock = block.match(/^```json\s*\r?\n([\s\S]*?)\r?\n```$/);
  if (!jsonBlock) {
    throw new Error(`${label} protocol catalog block must be a JSON code block`);
  }

  try {
    return JSON.parse(jsonBlock[1]);
  } catch (error) {
    throw new Error(`${label} protocol catalog block is not valid JSON: ${error.message}`);
  }
}

function assertModelRetrievalSurface(content, expectedCatalog, label) {
  const actual = parseModelProtocolCatalog(content, label);
  const expected = modelProtocolCatalog(expectedCatalog);

  assertExactKeys(actual, expected, `${label} protocol catalog`);
  assertEqual(actual.catalog_schema, expected.catalog_schema, `${label} catalog_schema`);
  assertEqual(
    actual.catalog_version,
    expected.catalog_version,
    `${label} catalog_version`,
  );
  if (!Array.isArray(actual.entries)) {
    throw new Error(`${label} protocol catalog entries must be an array`);
  }

  const actualNames = actual.entries
    .map(entry => entry?.catalog_entry)
    .sort();
  const expectedNames = expected.entries
    .map(entry => entry.catalog_entry)
    .sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`${label} rendered protocol availability does not match the public catalog`);
  }

  const actualByName = new Map();
  for (const entry of actual.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${label} protocol catalog contains a non-object entry`);
    }
    if (actualByName.has(entry.catalog_entry)) {
      throw new Error(`${label} repeats protocol entry "${entry.catalog_entry}"`);
    }
    actualByName.set(entry.catalog_entry, entry);
  }

  for (const expectedEntry of expected.entries) {
    const name = expectedEntry.catalog_entry;
    const actualEntry = actualByName.get(name);
    assertExactKeys(actualEntry, expectedEntry, `${label} ${name}`);
    for (const field of [
      'availability',
      'spec_id',
      'spec_url',
      'owner_repo',
      'format',
      'status',
    ]) {
      assertEqual(
        actualEntry[field],
        expectedEntry[field],
        `${label} ${name} ${field}`,
      );
    }
    if (
      JSON.stringify(actualEntry.object_families) !==
      JSON.stringify(expectedEntry.object_families)
    ) {
      throw new Error(
        `${label} ${name} object_families do not match the public catalog`,
      );
    }
  }
}

function assertRenderedPage() {
  const html = read(pagePath);
  const root = [...html.matchAll(/<div\b([^>]*)>/g)]
    .map(match => parseAttributes(match[1]))
    .find(attributes => attributes['data-platform-protocol-catalog']);
  if (!root) {
    throw new Error('Rendered 2.0 protocol page is missing its catalog root');
  }
  assertEqual(
    root['data-platform-protocol-catalog'],
    catalog.schema,
    'Rendered protocol catalog schema',
  );
  assertEqual(
    root['data-catalog-version'],
    String(catalog.version),
    'Rendered protocol catalog version',
  );

  const actualEntries = renderedEntries(html);
  const expectedEntries = availableProtocolEntries(catalog);
  const expectedNames = expectedEntries.map(([name]) => name).sort();
  const actualNames = [...actualEntries.keys()].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error('Rendered 2.0 protocol availability does not match the public catalog');
  }

  for (const [name, entry] of expectedEntries) {
    const rendered = actualEntries.get(name);
    assertEqual(rendered.attributes['data-spec-id'], entry.spec_id, `${name} spec_id`);
    assertEqual(rendered.attributes['data-spec-url'], entry.spec_url, `${name} spec_url`);
    assertEqual(rendered.attributes['data-owner-repo'], entry.owner_repo, `${name} owner_repo`);
    assertEqual(rendered.attributes['data-format'], entry.format, `${name} format`);
    assertEqual(rendered.attributes['data-status'], entry.status, `${name} status`);
    assertEqual(rendered.attributes['data-availability'], 'available', `${name} availability`);

    const text = visibleText(rendered.body);
    for (const expected of [
      entry.spec_id,
      entry.spec_url,
      entry.owner_repo,
      entry.format,
      entry.status,
      ...entry.object_families.flatMap(family => [family.name, family.owner_repo]),
    ]) {
      if (!text.includes(expected)) {
        throw new Error(`${name} does not visibly render catalog value "${expected}"`);
      }
    }

    const publicLinks = [...rendered.body.matchAll(/<a\b([^>]*)>/g)]
      .map(match => parseAttributes(match[1]).href);
    if (!publicLinks.includes(entry.spec_url)) {
      throw new Error(`${name} does not render its public spec_url as a link`);
    }

    const actualFamilies = renderedFamilies(rendered.body);
    if (JSON.stringify(actualFamilies) !== JSON.stringify(entry.object_families)) {
      throw new Error(`${name} rendered object-family ownership does not match the public catalog`);
    }
  }
}

function assertModelRetrievalSurfaces() {
  for (const llmPath of llmPaths) {
    const content = read(llmPath);
    const label = path.relative(repoRoot, llmPath);
    assertModelRetrievalSurface(content, catalog, label);
  }
}

function main() {
  assertRenderedPage();
  assertModelRetrievalSurfaces();
  console.log('Rendered 2.0 protocol page and model-retrieval catalog data are aligned.');
}

if (require.main === module) {
  main();
}

module.exports = {
  assertModelRetrievalSurface,
  assertRenderedPage,
  parseModelProtocolCatalog,
};
