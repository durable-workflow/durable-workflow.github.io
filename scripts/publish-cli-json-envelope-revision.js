#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function fail(message) {
  throw new Error(message);
}

function sha256(source) {
  return `sha256:${crypto.createHash('sha256').update(source).digest('hex')}`;
}

function parseArgs(argv) {
  const args = {};
  for (const value of argv) {
    const match = value.match(/^--(source|revision)=(.+)$/);
    if (!match) {
      fail(`Unknown argument ${value}`);
    }
    args[match[1]] = match[2];
  }

  const revision = Number(args.revision);
  if (!args.source || !Number.isInteger(revision) || revision < 1) {
    fail('Usage: publish-cli-json-envelope-revision.js --source=<cli-root> --revision=<n>');
  }

  return {revision, sourceRoot: path.resolve(args.source)};
}

function publish({revision, sourceRoot}) {
  const sourceManifestPath = path.join(sourceRoot, 'schemas', 'output', 'manifest.json');
  const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));
  const sourceRevision = sourceManifest.version;
  if (
    sourceManifest.schema !== 'durable-workflow.cli.output-schema-manifest' ||
    !Number.isInteger(sourceRevision) ||
    sourceRevision < 1 ||
    revision !== sourceRevision + 1
  ) {
    fail(
      `CLI source manifest revision ${JSON.stringify(sourceRevision)} cannot publish v${revision}`,
    );
  }

  const sourceBaseUrl =
    `https://durable-workflow.github.io/cli-json-envelopes/v${sourceRevision}`;
  const targetBaseUrl =
    `https://durable-workflow.github.io/cli-json-envelopes/v${revision}`;
  if (sourceManifest.resolver_url !== `${sourceBaseUrl}/manifest.json`) {
    fail('CLI source manifest has an unexpected resolver identity');
  }

  const sourceSchemaDirectory = path.join(sourceRoot, 'schemas', 'output');
  const targetDirectory = path.join(
    repoRoot,
    'static',
    'cli-json-envelopes',
    `v${revision}`,
  );
  const targetSchemaDirectory = path.join(targetDirectory, 'schemas');
  if (fs.existsSync(targetDirectory)) {
    fail(`Refusing to overwrite retained CLI schema revision v${revision}`);
  }

  const schemas = new Map();
  for (const filename of fs.readdirSync(sourceSchemaDirectory).sort()) {
    if (!filename.endsWith('.schema.json')) {
      continue;
    }
    const source = fs.readFileSync(path.join(sourceSchemaDirectory, filename), 'utf8');
    const published = source.replaceAll(sourceBaseUrl, targetBaseUrl);
    const schema = JSON.parse(published);
    if (
      schema.$schema !== 'https://json-schema.org/draft/2020-12/schema' ||
      schema.$id !== `${targetBaseUrl}/schemas/${filename}`
    ) {
      fail(`CLI schema ${filename} has an unexpected published identity`);
    }
    schemas.set(filename, published);
  }

  const manifest = JSON.parse(JSON.stringify(sourceManifest));
  manifest.version = revision;
  manifest.artifact_id =
    `durable-workflow.cli.output-schema-manifest@${revision}`;
  manifest.resolver_url = `${targetBaseUrl}/manifest.json`;
  for (const mappings of [manifest.commands, manifest.jsonl_commands || {}]) {
    for (const entry of Object.values(mappings)) {
      const filename = path.basename(entry.schema);
      const schema = schemas.get(filename);
      if (schema === undefined) {
        fail(`CLI manifest references missing schema ${filename}`);
      }
      entry.schema_id = `${targetBaseUrl}/schemas/${filename}`;
      entry.resolver_url = entry.schema_id;
      entry.sha256 = sha256(schema);
    }
  }

  fs.mkdirSync(targetSchemaDirectory, {recursive: true});
  for (const [filename, source] of schemas) {
    fs.writeFileSync(path.join(targetSchemaDirectory, filename), source);
  }
  fs.writeFileSync(
    path.join(targetDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  process.stdout.write(
    `Published CLI JSON envelope revision v${revision} with ${schemas.size} schemas.\n`,
  );
}

if (require.main === module) {
  try {
    publish(parseArgs(process.argv.slice(2)));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {parseArgs, publish};
