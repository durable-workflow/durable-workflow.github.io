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
const staticDir = path.join(__dirname, '..', 'static');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
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

  assertContains(installer, 'VERSION="${VERSION:-prerelease}"', ctx);
  assertContains(installer, 'public-artifact-compatibility-evidence.json', ctx);
  assertContains(installer, '/"qualified_artifact_versions"', ctx);
  assertContains(installer, '/"cli"', ctx);
  if (installer.includes('api.github.com/repos/${REPO}/releases')) {
    throw new Error(`${ctx} must not equate the newest published prerelease with the qualified channel`);
  }
  assertContains(installer, 'SHA256SUMS', ctx);
  assertContains(installer, 'checksum verification failed', ctx);
  assertContains(installer, 'DURABLE_WORKFLOW_INSTALL_VERIFY_ATTESTATIONS', ctx);
  assertContains(installer, 'DURABLE_WORKFLOW_INSTALL_OUTPUT', ctx);
  assertContains(installer, 'durable-workflow.cli.install.v1', ctx);
  assertContains(installer, 'command -v "$BIN_NAME"', ctx);
  assertContains(installer, 'install_status="path-shadowed"', ctx);
  assertContains(installer, 'install_status="shell-cache-refresh-required"', ctx);
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

  assertContains(installer, "if (\$env:VERSION) { \$env:VERSION } else { 'prerelease' }", ctx);
  assertContains(installer, 'public-artifact-compatibility-evidence.json', ctx);
  assertContains(installer, '$authority.qualified_artifact_versions.cli', ctx);
  if (installer.includes('api.github.com/repos/$repo/releases')) {
    throw new Error(`${ctx} must not equate the newest published prerelease with the qualified channel`);
  }
  assertContains(installer, 'SHA256SUMS', ctx);
  assertContains(installer, 'Checksum verification failed', ctx);
  assertContains(installer, 'DURABLE_WORKFLOW_INSTALL_VERIFY_ATTESTATIONS', ctx);
  assertContains(installer, 'gh attestation verify $tmp --repo $repo', ctx);
  assertContains(installer, 'gh attestation verify $sums --repo $repo', ctx);
  assertMatches(installer, /\$releaseBaseUrl\/download\/\$version\//, ctx);
}

try {
  checkShellInstaller();
  checkPowerShellInstaller();
  console.log('Installer contract OK');
} catch (error) {
  console.error('Installer contract violation:', error.message);
  process.exit(1);
}
