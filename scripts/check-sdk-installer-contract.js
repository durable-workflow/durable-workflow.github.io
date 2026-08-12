#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const repoRoot = path.join(__dirname, '..');
const installerPath = path.join(repoRoot, 'static', 'install-sdk.sh');
const contractPath = path.join(repoRoot, 'static', 'quickstart-execution-contract.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

function executable(filePath, body) {
  fs.writeFileSync(filePath, body, {mode: 0o755});
}

function runInstaller(target, options = {}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-sdk-installer-'));
  const callsPath = path.join(fixtureRoot, 'calls');
  const fakeCurl = path.join(fixtureRoot, 'curl');
  const fakePackageManager = path.join(fixtureRoot, 'package-manager');

  executable(fakeCurl, '#!/bin/sh\ncat "$DW_CONTRACT_FIXTURE"\n');
  executable(
    fakePackageManager,
    '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$DW_CALLS_FILE"\n',
  );

  const result = spawnSync('sh', [installerPath, target], {
    cwd: fixtureRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      CURL_BIN: fakeCurl,
      COMPOSER_BIN: fakePackageManager,
      PIP_BIN: fakePackageManager,
      CARGO_BIN: fakePackageManager,
      DW_CONTRACT_FIXTURE: options.contractPath || contractPath,
      DW_CALLS_FILE: callsPath,
      DURABLE_WORKFLOW_PYTHON_EXTRAS: options.pythonExtras || '',
    },
  });
  const calls = fs.existsSync(callsPath)
    ? fs.readFileSync(callsPath, 'utf8').trim().split('\n')
    : [];
  fs.rmSync(fixtureRoot, {recursive: true, force: true});

  return {result, calls};
}

const cases = [
  ['php', ['require', contract.artifacts['sdk-php'].composer_package]],
  ['python', ['install', contract.artifacts['sdk-python'].pip_package]],
  ['rust', ['add', `durable-workflow@=${contract.artifacts['sdk-rust'].version}`]],
  ['workflow', ['require', contract.artifacts.workflow.composer_constraint]],
  ['waterline', ['require', contract.artifacts.waterline.composer_constraint]],
];

for (const [target, expectedCalls] of cases) {
  const {result, calls} = runInstaller(target);
  assert.strictEqual(result.status, 0, `${target}: ${result.stderr}`);
  assert.deepStrictEqual(calls, expectedCalls, `${target} must execute the qualified contract command`);
}

const pythonWithExtras = runInstaller('python', {pythonExtras: 'prometheus'});
assert.strictEqual(pythonWithExtras.result.status, 0, pythonWithExtras.result.stderr);
assert.deepStrictEqual(
  pythonWithExtras.calls,
  ['install', `durable-workflow[prometheus]==${contract.artifacts['sdk-python'].version}`],
  'Python extras must preserve the qualified SDK identity',
);

const invalidContractRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-sdk-contract-'));
const invalidContractPath = path.join(invalidContractRoot, 'contract.json');
fs.writeFileSync(invalidContractPath, JSON.stringify({...contract, schema: 'unsupported'}));
const invalidContract = runInstaller('php', {contractPath: invalidContractPath});
fs.rmSync(invalidContractRoot, {recursive: true, force: true});
assert.notStrictEqual(invalidContract.result.status, 0, 'an unsupported contract must fail closed');
assert.deepStrictEqual(invalidContract.calls, [], 'an unsupported contract must not invoke Composer');

const invalidVersionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-sdk-version-'));
const invalidVersionPath = path.join(invalidVersionRoot, 'contract.json');
const invalidVersionContract = structuredClone(contract);
invalidVersionContract.artifacts['sdk-rust'].version = '2.0.0-rc.7-unqualified';
fs.writeFileSync(invalidVersionPath, JSON.stringify(invalidVersionContract, null, 2));
const invalidVersion = runInstaller('rust', {contractPath: invalidVersionPath});
fs.rmSync(invalidVersionRoot, {recursive: true, force: true});
assert.notStrictEqual(invalidVersion.result.status, 0, 'a malformed qualified version must fail closed');
assert.deepStrictEqual(invalidVersion.calls, [], 'a malformed version must not invoke Cargo');

console.log('Qualified SDK installer contract checks passed');
