#!/usr/bin/env node

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const STATIC_ROOT = path.join(REPO_ROOT, 'static');
const BUILD_ROOT = path.join(REPO_ROOT, 'build');
const MANIFEST_ROUTE = '/schemas/capacity-benchmark/v1/manifest.json';
const MANIFEST_URL = `https://durable-workflow.github.io${MANIFEST_ROUTE}`;
const MANIFEST_SCHEMA = 'durable-workflow.capacity-benchmark-schema-publication/v1';
const SCHEMA_ORIGIN = 'https://durable-workflow.github.io';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson(file, label) {
  let source;
  try {
    source = fs.readFileSync(file);
  } catch (error) {
    throw new Error(`${label} is unavailable at ${file}: ${error.message}`);
  }

  try {
    return {source, value: JSON.parse(source.toString('utf8'))};
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function routeFromSchemaId(schemaId, name) {
  let url;
  try {
    url = new URL(schemaId);
  } catch (error) {
    throw new Error(`capacity schema ${name} has an invalid $id: ${error.message}`);
  }

  const expectedPath = `/schemas/capacity-benchmark-${name}/v1.json`;
  if (
    url.origin !== SCHEMA_ORIGIN
    || url.pathname !== expectedPath
    || url.search !== ''
    || url.hash !== ''
  ) {
    throw new Error(
      `capacity schema ${name} must use canonical identifier ${SCHEMA_ORIGIN}${expectedPath}`,
    );
  }
  return expectedPath;
}

function validateManifest(manifest) {
  assert.deepStrictEqual(
    Object.keys(manifest).sort(),
    ['canonical_url', 'schema', 'schemas', 'suite_version'],
    'capacity schema manifest fields',
  );
  assert.strictEqual(manifest.schema, MANIFEST_SCHEMA, 'capacity schema manifest contract');
  assert.strictEqual(manifest.canonical_url, MANIFEST_URL, 'capacity schema manifest URL');
  assert.match(manifest.suite_version, /^\d+\.\d+\.\d+$/, 'capacity suite version');
  assert(
    manifest.schemas
      && typeof manifest.schemas === 'object'
      && !Array.isArray(manifest.schemas)
      && Object.keys(manifest.schemas).length > 0,
    'capacity schema manifest must contain schemas',
  );
}

function publicSchemaNames(publicRoot) {
  const schemasRoot = path.join(publicRoot, 'schemas');
  return fs.readdirSync(schemasRoot, {withFileTypes: true})
    .filter(entry => entry.isDirectory() && entry.name.startsWith('capacity-benchmark-'))
    .map(entry => entry.name.slice('capacity-benchmark-'.length))
    .sort();
}

function validatePublicationTree(publicRoot) {
  const manifestPath = path.join(publicRoot, MANIFEST_ROUTE.slice(1));
  const {source: manifestSource, value: manifest} = readJson(
    manifestPath,
    'capacity schema manifest',
  );
  validateManifest(manifest);

  const names = Object.keys(manifest.schemas).sort();
  assert.deepStrictEqual(
    publicSchemaNames(publicRoot),
    names,
    'published capacity schema routes must match the manifest inventory',
  );

  const documents = {};
  for (const name of names) {
    assert.match(name, /^[a-z][a-z0-9-]*$/, `capacity schema name ${name}`);
    const entry = manifest.schemas[name];
    assert.deepStrictEqual(
      Object.keys(entry || {}).sort(),
      ['$id', 'sha256'],
      `capacity schema manifest entry ${name}`,
    );
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, `capacity schema ${name} sha256`);

    const route = routeFromSchemaId(entry.$id, name);
    const schemaPath = path.join(publicRoot, route.slice(1));
    const {source, value: document} = readJson(schemaPath, `capacity schema ${name}`);
    assert.strictEqual(document.$id, entry.$id, `capacity schema ${name} $id`);
    assert.strictEqual(
      document.$schema,
      'https://json-schema.org/draft/2020-12/schema',
      `capacity schema ${name} dialect`,
    );
    assert.strictEqual(document.type, 'object', `capacity schema ${name} root type`);
    assert.strictEqual(sha256(source), entry.sha256, `capacity schema ${name} digest`);
    documents[name] = {document, route, source};
  }

  return {documents, manifest, manifestSource};
}

function validateServerSource(publication, serverRoot) {
  const suiteRoot = path.join(serverRoot, 'benchmarks', 'capacity', 'v1');
  const serverManifestPath = path.join(suiteRoot, 'schema-publication.json');
  if (!fs.existsSync(serverManifestPath)) {
    throw new Error(`Server capacity schema publication is unavailable at ${serverManifestPath}`);
  }
  const {value: serverManifest} = readJson(
    serverManifestPath,
    'Server capacity schema publication',
  );
  assert.deepStrictEqual(
    publication.manifest,
    serverManifest,
    'public capacity schema manifest must match Server source',
  );

  const schemaRoot = path.join(suiteRoot, 'schemas');
  const sourceNames = fs.readdirSync(schemaRoot)
    .filter(file => file.endsWith('.schema.json'))
    .map(file => file.slice(0, -'.schema.json'.length))
    .sort();
  assert.deepStrictEqual(
    sourceNames,
    Object.keys(publication.manifest.schemas).sort(),
    'Server capacity schema sources must match the public inventory',
  );

  for (const name of sourceNames) {
    const serverSource = fs.readFileSync(path.join(schemaRoot, `${name}.schema.json`));
    assert(
      serverSource.equals(publication.documents[name].source),
      `public capacity schema ${name} must be byte-identical to Server source`,
    );
  }
}

function discoverServerRoot() {
  const candidates = [
    process.env.SERVER_REPO_PATH,
    path.join(REPO_ROOT, '..', 'server'),
  ].filter(Boolean);
  return candidates.find(candidate => (
    fs.existsSync(path.join(candidate, 'benchmarks', 'capacity', 'v1', 'suite.json'))
  ));
}

function checkCapacitySchemaPublication(options = {}) {
  const publicRoot = options.publicRoot || STATIC_ROOT;
  const publication = validatePublicationTree(publicRoot);
  const serverRoot = options.serverRoot === undefined
    ? discoverServerRoot()
    : options.serverRoot;
  if (serverRoot) {
    validateServerSource(publication, serverRoot);
  }
  return publication;
}

if (require.main === module) {
  const publicRoot = process.argv.includes('--rendered') ? BUILD_ROOT : STATIC_ROOT;
  const publication = checkCapacitySchemaPublication({publicRoot});
  console.log(
    `Capacity schema publication is synchronized ` +
      `(${Object.keys(publication.manifest.schemas).length} schemas).`,
  );
}

module.exports = {
  BUILD_ROOT,
  MANIFEST_ROUTE,
  MANIFEST_SCHEMA,
  MANIFEST_URL,
  SCHEMA_ORIGIN,
  STATIC_ROOT,
  checkCapacitySchemaPublication,
  routeFromSchemaId,
  sha256,
  validateManifest,
  validatePublicationTree,
  validateServerSource,
};
