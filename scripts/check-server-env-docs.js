#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const snapshotPath = path.join(__dirname, 'server-env-contract.json');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const explicitServerRepo = Boolean(process.env.SERVER_REPO_PATH);
const serverRepoCandidates = explicitServerRepo
  ? [process.env.SERVER_REPO_PATH]
  : [path.resolve(repoRoot, '..', 'server')];
const serverRepo = serverRepoCandidates.filter(Boolean).find((candidate) => (
  fs.existsSync(path.join(candidate, 'config', 'dw-contract.php'))
));
const docsPath = path.join(repoRoot, 'docs', 'polyglot', 'server.md');

if (explicitServerRepo && !serverRepo) {
  console.error(`Server env contract not found at ${process.env.SERVER_REPO_PATH}.`);
  process.exit(1);
}

const contractPath = serverRepo ? path.join(serverRepo, 'config', 'dw-contract.php') : null;
const contract = contractPath ? fs.readFileSync(contractPath, 'utf8') : null;
const docs = fs.readFileSync(docsPath, 'utf8');
const referencePath = path.join(repoRoot, 'docs', 'polyglot', 'server-config-reference.md');
const reference = fs.readFileSync(referencePath, 'utf8');

function phpArraySection(source, sectionName) {
  const start = source.indexOf(`'${sectionName}' => [`);
  if (start === -1) {
    throw new Error(`Could not find ${sectionName} section in ${contractPath}`);
  }

  let depth = 0;
  let end = -1;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '[') {
      depth += 1;
    } else if (source[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) {
    throw new Error(`Could not parse ${sectionName} section in ${contractPath}`);
  }

  return source.slice(start, end);
}

function keysFromPhpArraySection(source, sectionName) {
  return [...phpArraySection(source, sectionName).matchAll(/'([A-Z][A-Z0-9_]+)'\s*=>/g)]
    .map((match) => match[1]);
}

function valuesFromPhpArraySection(source, sectionName) {
  return [...phpArraySection(source, sectionName).matchAll(/'([A-Z][A-Z0-9_]+)'\s*,/g)]
    .map((match) => match[1]);
}

const livePublicVars = contract ? keysFromPhpArraySection(contract, 'vars') : null;
const liveLegacyVars = contract
  ? [...contract.matchAll(/'legacy'\s*=>\s*'([A-Z][A-Z0-9_]+)'/g)].map((match) => match[1])
  : null;
const frameworkVars = contract ? valuesFromPhpArraySection(contract, 'framework') : [];
const publicVars = livePublicVars || snapshot.vars;
const contractVars = new Set([
  ...publicVars,
  ...frameworkVars,
]);

const legacyVars = new Set(liveLegacyVars || snapshot.legacy);

const allowedNonServerVars = new Set([
  'DURABLE_WORKFLOW_AUTH_TOKEN',
  'DURABLE_WORKFLOW_NAMESPACE',
  'DURABLE_WORKFLOW_SERVER_URL',
  'WORKFLOW_PACKAGE_REF',
  'WORKFLOW_PACKAGE_SOURCE',
]);

const documentedVars = new Set();
const patterns = [
  /^\s*(?:export\s+)?([A-Z][A-Z0-9_]+)=/gm,
  /^\s*-\s*e\s+([A-Z][A-Z0-9_]+)=/gm,
  /^\s*-\s*name:\s*([A-Z][A-Z0-9_]+)\s*$/gm,
  /env\('([A-Z][A-Z0-9_]+)'/g,
];

for (const pattern of patterns) {
  for (const match of docs.matchAll(pattern)) {
    documentedVars.add(match[1]);
  }
}

const unsupported = contract
  ? [...documentedVars]
    .filter((name) => !contractVars.has(name))
    .filter((name) => !allowedNonServerVars.has(name))
    .sort()
  : [];

const legacyDocumented = [...documentedVars]
  .filter((name) => legacyVars.has(name))
  .sort();

if (unsupported.length > 0 || legacyDocumented.length > 0) {
  if (unsupported.length > 0) {
    console.error('Unsupported server env names documented in docs/polyglot/server.md:');
    for (const name of unsupported) {
      console.error(`- ${name}`);
    }
  }

  if (legacyDocumented.length > 0) {
    console.error('Legacy server env names documented in docs/polyglot/server.md:');
    for (const name of legacyDocumented) {
      console.error(`- ${name}`);
    }
  }

  process.exit(1);
}

const missingFromReference = publicVars
  .filter((name) => !reference.includes(`\`${name}\``))
  .sort();

if (missingFromReference.length > 0) {
  console.error(`Missing DW_* env reference entries in ${path.relative(repoRoot, referencePath)}:`);
  for (const name of missingFromReference) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

if (livePublicVars) {
  const snapshotVars = new Set(snapshot.vars);
  const added = livePublicVars.filter((name) => !snapshotVars.has(name)).sort();
  const removed = snapshot.vars.filter((name) => !livePublicVars.includes(name)).sort();

  if (added.length > 0 || removed.length > 0) {
    if (added.length > 0) {
      console.error(`Server env snapshot is missing ${added.length} live DW_* vars from ${contractPath}:`);
      for (const name of added) {
        console.error(`- ${name}`);
      }
    }

    if (removed.length > 0) {
      console.error(`Server env snapshot contains ${removed.length} removed DW_* vars not present in ${contractPath}:`);
      for (const name of removed) {
        console.error(`- ${name}`);
      }
    }

    process.exit(1);
  }
}

const source = contractPath || snapshotPath;
console.log(`Checked ${documentedVars.size} documented env names and ${publicVars.length} DW_* reference entries against ${source}`);
