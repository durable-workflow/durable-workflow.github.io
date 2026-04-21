#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const serverRepoCandidates = [
  process.env.SERVER_REPO_PATH,
  path.resolve(repoRoot, '..', 'server'),
].filter(Boolean);
const serverRepo = serverRepoCandidates.find((candidate) => (
  fs.existsSync(path.join(candidate, 'config', 'dw-contract.php'))
));
const docsPath = path.join(repoRoot, 'docs', 'polyglot', 'server.md');

if (!serverRepo) {
  console.error('Server env contract not found.');
  console.error('Set SERVER_REPO_PATH to the Durable Workflow server repository.');
  process.exit(1);
}

const contractPath = path.join(serverRepo, 'config', 'dw-contract.php');
const contract = fs.readFileSync(contractPath, 'utf8');
const docs = fs.readFileSync(docsPath, 'utf8');

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

const contractVars = new Set([
  ...keysFromPhpArraySection(contract, 'vars'),
  ...valuesFromPhpArraySection(contract, 'framework'),
]);

const legacyVars = new Set(
  [...contract.matchAll(/'legacy'\s*=>\s*'([A-Z][A-Z0-9_]+)'/g)].map((match) => match[1]),
);

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

const unsupported = [...documentedVars]
  .filter((name) => !contractVars.has(name))
  .filter((name) => !allowedNonServerVars.has(name))
  .sort();

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

console.log(`Checked ${documentedVars.size} documented env names against ${contractPath}`);
