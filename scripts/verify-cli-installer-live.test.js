#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  EVIDENCE_SCHEMA,
  verifyLiveCliInstaller,
  waitForLiveInstaller,
} = require('./verify-cli-installer-live');

const installer = fs.readFileSync(path.join(__dirname, '..', 'static', 'install.sh'));

async function main() {
  await assert.rejects(
    () => waitForLiveInstaller({
      attempts: 1,
      expected: installer,
      fetcher: async () => Buffer.from('stale installer'),
      url: 'https://docs.example.test/install.sh',
    }),
    /returned sha256:.*expected sha256:/,
    'live verification must reject stale hosted installer bytes',
  );

  if (process.platform !== 'linux' || !fs.existsSync('/bin/dash')) {
    console.log('Skipping the dash cache regression outside Linux with /bin/dash.');
    return;
  }

  const evidencePath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'dw-live-installer-test-')),
    'evidence.json',
  );

  try {
    const evidence = await verifyLiveCliInstaller({
      attempts: 1,
      evidencePath,
      expected: installer,
      fetcher: async () => installer,
      url: 'https://docs.example.test/install.sh',
    });

    assert.strictEqual(evidence.schema, EVIDENCE_SCHEMA);
    assert.strictEqual(evidence.outcome, 'pass');
    assert.strictEqual(evidence.shell, 'dash');
    assert.strictEqual(evidence.observed.installer_exit_code, 1);
    assert.strictEqual(
      evidence.observed.install_status,
      'shell-cache-refresh-required',
    );
    assert.strictEqual(evidence.observed.current_shell_remediation, "hash 'dw'");
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(evidencePath, 'utf8')),
      evidence,
    );
  } finally {
    fs.rmSync(path.dirname(evidencePath), {force: true, recursive: true});
  }

  console.log('Live CLI installer dash cache regression checks passed.');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
