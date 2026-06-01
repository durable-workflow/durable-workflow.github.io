#!/usr/bin/env node
//
// Contract check for the published installer scripts.
//
// `static/install.sh` and `static/install.ps1` are served from
// https://durable-workflow.com/install.{sh,ps1} and are what users actually
// run. They must keep parity with the canonical CLI installer contract:
// pinned VERSION support, SHA256SUMS verification, and the optional
// attestation verification opt-in.

const fs = require('fs');
const path = require('path');
const { replaceArtifactTokens } = require('./public-artifact-versions');

const staticDir = path.join(__dirname, '..', 'static');
const docsCli = path.join(__dirname, '..', 'docs', 'polyglot', 'cli.mdx');

function read(filePath) {
  return replaceArtifactTokens(
    fs.readFileSync(filePath, 'utf8'),
    path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/'),
  );
}

function assertContains(content, needle, context) {
  if (!content.includes(needle)) {
    throw new Error(`${context} must include ${JSON.stringify(needle)}`);
  }
}

function assertMatches(content, pattern, context) {
  if (!pattern.test(content)) {
    throw new Error(`${context} must match ${pattern}`);
  }
}

function checkShellInstaller() {
  const installer = read(path.join(staticDir, 'install.sh'));
  const ctx = 'static/install.sh';

  assertContains(installer, 'VERSION="${VERSION:-latest}"', ctx);
  assertContains(installer, 'SHA256SUMS', ctx);
  assertContains(installer, 'checksum verification failed', ctx);
  assertContains(installer, 'DURABLE_WORKFLOW_INSTALL_VERIFY_ATTESTATIONS', ctx);
  assertContains(installer, 'gh attestation verify "$tmp" --repo "$REPO"', ctx);
  assertContains(installer, 'gh attestation verify "$sums" --repo "$REPO"', ctx);
  // Confirms the pinned-tag URL path is wired (not just `latest/download`).
  assertMatches(
    installer,
    /\$\{RELEASE_BASE_URL\}\/download\/\$\{VERSION\}\//,
    ctx,
  );
}

function checkPowerShellInstaller() {
  const installer = read(path.join(staticDir, 'install.ps1'));
  const ctx = 'static/install.ps1';

  assertContains(installer, "if (\$env:VERSION) { \$env:VERSION } else { 'latest' }", ctx);
  assertContains(installer, 'SHA256SUMS', ctx);
  assertContains(installer, 'Checksum verification failed', ctx);
  assertContains(installer, 'DURABLE_WORKFLOW_INSTALL_VERIFY_ATTESTATIONS', ctx);
  assertContains(installer, 'gh attestation verify $tmp --repo $repo', ctx);
  assertContains(installer, 'gh attestation verify $sums --repo $repo', ctx);
  assertMatches(installer, /\$releaseBaseUrl\/download\/\$version\//, ctx);
}

function checkDocsExposeContract() {
  const cli = read(docsCli);
  const ctx = 'docs/polyglot/cli.mdx';

  // Pinned-install heading and a worked example for both installers.
  assertContains(cli, '### Pinned install for CI and quickstarts', ctx);
  assertMatches(cli, /curl[^\n]+install\.sh \| VERSION=\d+\.\d+\.\d+ sh/, ctx);
  assertMatches(cli, /\$env:VERSION\s*=\s*"\d+\.\d+\.\d+"/, ctx);
  assertContains(cli, 'dw --version', ctx);
}

try {
  checkShellInstaller();
  checkPowerShellInstaller();
  checkDocsExposeContract();
  console.log('Installer contract OK');
} catch (error) {
  console.error('Installer contract violation:', error.message);
  process.exit(1);
}
