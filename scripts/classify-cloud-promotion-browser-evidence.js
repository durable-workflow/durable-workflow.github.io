const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const BROWSER_EVIDENCE_PATHS = Object.freeze([
  '.github/workflows/deploy.yml',
  '.github/workflows/qualification.yml',
  'scripts/check-cloud-promotion-browser.js',
  'scripts/check-cloud-promotions.js',
  'scripts/classify-cloud-promotion-browser-evidence.js',
  'scripts/cloud-promotion-contract.js',
  'src/components/ProductPromotion/',
]);

function requiresBrowserEvidence(changedFiles) {
  return changedFiles.some(file => BROWSER_EVIDENCE_PATHS.some(candidate => (
    candidate.endsWith('/') ? file.startsWith(candidate) : file === candidate
  )));
}

function readOptionValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

function changedFilesFromBase(baseRef) {
  const result = spawnSync(
    'git',
    ['diff', '--name-only', '--no-renames', '--diff-filter=ACDMRTUXB', '-z', `${baseRef}...HEAD`],
    {encoding: 'buffer'},
  );
  if (result.status !== 0) return null;
  return result.stdout.toString('utf8').split('\0').filter(Boolean);
}

function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, 'utf8');
}

function main() {
  const explicitFiles = readOptionValues('--changed-file');
  const baseRef = readOptionValues('--base-ref')[0];
  const outputPath = path.resolve(
    readOptionValues('--output')[0] || 'cloud-promotion-browser-classification.json',
  );
  let changedFiles = explicitFiles;
  let failSafe = false;

  if (changedFiles.length === 0) {
    changedFiles = baseRef ? changedFilesFromBase(baseRef) : null;
    if (changedFiles === null) {
      changedFiles = [];
      failSafe = true;
    }
  }

  const matchedFiles = changedFiles.filter(file => requiresBrowserEvidence([file]));
  const required = failSafe || matchedFiles.length > 0;
  const classification = {
    schema: 'durable-workflow.docs.cloud-promotion-browser-classification/v1',
    required,
    fail_safe: failSafe,
    matched_files: matchedFiles.sort(),
  };
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, `${JSON.stringify(classification, null, 2)}\n`, 'utf8');
  writeOutput('required', String(required));
  writeOutput('classification', outputPath);
  process.stdout.write(`${JSON.stringify(classification)}\n`);
}

if (require.main === module) main();

module.exports = {
  BROWSER_EVIDENCE_PATHS,
  requiresBrowserEvidence,
};
