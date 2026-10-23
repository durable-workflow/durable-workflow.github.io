const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const snapshot = require('../tests/fixtures/server-env-contract-2.11.0.json');
const locales = ['en', 'uk', 'es', 'pt-BR', 'zh-Hans', 'ja', 'fr', 'de'];

// The versioned input is the qualified published PHP contract. Updating this
// reference requires reviewing that artifact, not following unreleased main.
function validateSnapshot(contract) {
  if (contract.schema_version !== 1 || contract.runtime !== 'php'
      || !/^\d+\.\d+\.\d+$/.test(contract.server_version)
      || !/^[a-f0-9]{40}$/.test(contract.source_revision)
      || !/^[a-f0-9]{64}$/.test(contract.contract_file_sha256)
      || !/^durableworkflow\/server@sha256:[a-f0-9]{64}$/.test(contract.image)
      || contract.source_url !== `https://github.com/durable-workflow/server/blob/${contract.source_revision}/config/dw-contract.php`
      || !contract.vars || Object.keys(contract.vars).length === 0) {
    throw new Error('Server configuration snapshot needs a published PHP artifact and exact source identity');
  }
  for (const [name, entry] of Object.entries(contract.vars)) {
    if (!/^DW_[A-Z0-9_]+$/.test(name) || !entry.description
        || !Object.hasOwn(entry, 'default') || !entry.since
        || (entry.legacy !== undefined && !/^[A-Z][A-Z0-9_]+$/.test(entry.legacy))) {
      throw new Error(`Invalid Server configuration contract entry: ${name}`);
    }
  }
}

function referenceRows(markdown, locale) {
  const rows = new Map();
  for (const line of markdown.split('\n')) {
    const match = /^\|\s*`(DW_[A-Z0-9_]+)`\s*\|/.exec(line);
    if (!match) continue;
    const name = match[1];
    if (rows.has(name)) throw new Error(`${locale}: duplicate configuration row ${name}`);
    rows.set(name, line.split(/(?<!\\)\|/).slice(1, -1).map(cell => cell.trim()));
  }
  return rows;
}

function checkRow(name, cells, entry, locale) {
  if (cells.length !== 4 || cells.some(cell => !cell)) {
    throw new Error(`${locale}: ${name} needs variable, default, purpose and legacy-alias columns`);
  }
  if (cells[1] === '-' || cells[2] === '-') {
    throw new Error(`${locale}: ${name} needs a documented default and purpose`);
  }
  const aliases = [...cells[3].matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map(match => match[1]);
  const expected = entry.legacy === undefined ? [] : [entry.legacy];
  if (JSON.stringify(aliases) !== JSON.stringify(expected)) {
    throw new Error(`${locale}: ${name} legacy alias must match the published contract: ${expected.join(', ') || '(none)'}`);
  }
}

function checkReference(markdown, contract = snapshot, locale = 'en') {
  validateSnapshot(contract);
  const rows = referenceRows(markdown, locale);
  const missing = Object.keys(contract.vars).filter(name => !rows.has(name));
  if (missing.length) throw new Error(`${locale}: missing published Server configuration rows: ${missing.join(', ')}`);
  for (const [name, entry] of Object.entries(contract.vars)) {
    checkRow(name, rows.get(name), entry, locale);
  }
  for (const name of rows.keys()) {
    if (!Object.hasOwn(contract.vars, name)) throw new Error(`${locale}: ${name} is outside the published PHP configuration snapshot`);
  }
  return rows.size;
}

function checkAllReferences() {
  for (const locale of locales) {
    const filename = locale === 'en'
      ? path.join(root, 'docs/polyglot/server-config-reference.md')
      : path.join(root, 'i18n', locale, 'docusaurus-plugin-content-docs/current/polyglot/server-config-reference.md');
    const count = checkReference(fs.readFileSync(filename, 'utf8'), snapshot, locale);
    console.log(`${locale}: ${count} published PHP Server ${snapshot.server_version} configuration rows complete`);
  }
}

if (require.main === module) {
  try {
    checkAllReferences();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {checkReference, validateSnapshot};
