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
const repoRoot = path.join(__dirname, '..');
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

  assertContains(installer, 'VERSION="${VERSION:-supported}"', ctx);
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
  assertContains(installer, 'dash|sh|ash|ksh|ksh93|mksh|pdksh)', ctx);
  assertContains(installer, 'remediation_shell_name=${parent_shell_name:-$shell_name}', ctx);
  assertContains(installer, 'parent_cache_command="hash ${quoted_bin_name}"', ctx);
  assertContains(installer, 'gh attestation verify "$tmp" --repo "$REPO"', ctx);
  assertContains(installer, 'gh attestation verify "$sums" --repo "$REPO"', ctx);
  // Confirms the pinned-tag URL path is wired (not just `latest/download`).
  assertMatches(
    installer,
    /\$\{RELEASE_BASE_URL\}\/download\/\$\{release_version\}\//,
    ctx,
  );
}

function checkPowerShellInstaller() {
  const installer = read(path.join(staticDir, 'install.ps1'));
  const ctx = 'static/install.ps1';

  assertContains(installer, "if (\$env:VERSION) { \$env:VERSION } else { 'supported' }", ctx);
  assertContains(installer, "if (\$version -eq 'supported' -or \$version -eq 'prerelease')", ctx);
  assertContains(installer, 'public-artifact-compatibility-evidence.json', ctx);
  assertContains(installer, "$authority.schema -ne 'durable-workflow.docs.public-artifact-compatibility-evidence'", ctx);
  assertContains(installer, '$authority.schema_version -ne 2', ctx);
  assertContains(installer, "$authority.outcome -ne 'pass'", ctx);
  assertContains(installer, '$authority.qualified_artifact_versions.cli', ctx);
  assertContains(installer, "$resolvedVersion -notmatch '^\\d+\\.\\d+\\.\\d+(-(alpha|beta|rc)\\.\\d+)?$'", ctx);
  assertContains(installer, "$requestedChannel -eq 'prerelease'", ctx);
  assertContains(installer, "is not a prerelease", ctx);
  if (installer.includes('api.github.com/repos/$repo/releases')) {
    throw new Error(`${ctx} must not equate the newest published prerelease with the qualified channel`);
  }
  assertContains(installer, 'SHA256SUMS', ctx);
  assertContains(installer, 'Checksum verification failed', ctx);
  assertContains(installer, 'DURABLE_WORKFLOW_INSTALL_VERIFY_ATTESTATIONS', ctx);
  assertContains(installer, 'gh attestation verify $tmp --repo $repo', ctx);
  assertContains(installer, 'gh attestation verify $sums --repo $repo', ctx);
  assertMatches(installer, /\$releaseBaseUrl\/download\/\$releaseVersion\//, ctx);
}

function checkPowerShellInstallerWorkflow() {
  const workflow = read(path.join(repoRoot, '.github', 'workflows', 'installers.yml'));
  const ctx = '.github/workflows/installers.yml';

  assertContains(workflow, "'supported-prerelease.json'", ctx);
  assertContains(workflow, "'supported-stable.json'", ctx);
  assertContains(workflow, "'malformed.json'", ctx);
  assertContains(workflow, "'non-passing.json'", ctx);
  assertContains(workflow, '$env:DURABLE_WORKFLOW_QUALIFIED_AUTHORITY_URL', ctx);
  assertContains(workflow, "Assert-AuthorityRejected -Name 'malformed'", ctx);
  assertContains(workflow, "Assert-AuthorityRejected -Name 'non-passing'", ctx);
  assertContains(workflow, "Assert-AuthorityRejected -Name 'stable-as-prerelease'", ctx);
}

function checkRenderedInstallerComponent() {
  const component = read(path.join(repoRoot, 'src', 'components', 'CliInstall', 'index.js'));
  const ctx = 'src/components/CliInstall/index.js';

  assertContains(component, "require('../../../scripts/public-artifact-versions')", ctx);
  assertContains(component, 'ARTIFACT_PINS.cliVersion', ctx);
  assertContains(component, 'ARTIFACT_PINS.cliPackageUrl', ctx);
  assertContains(component, 'data-cli-platform', ctx);
  assertContains(component, 'data-cli-asset-download', ctx);
  assertContains(component, 'data-cli-qualified-release', ctx);
  if (component.includes('/releases/latest')) {
    throw new Error(`${ctx} must not expose the newest unqualified CLI release`);
  }
  assertMatches(
    component,
    /releases\/download\/[\s\S]*ARTIFACT_PINS\.cliVersion[\s\S]*platform\.asset/,
    ctx,
  );
}

try {
  checkShellInstaller();
  checkPowerShellInstaller();
  checkPowerShellInstallerWorkflow();
  checkRenderedInstallerComponent();
  console.log('Installer contract OK');
} catch (error) {
  console.error('Installer contract violation:', error.message);
  process.exit(1);
}
