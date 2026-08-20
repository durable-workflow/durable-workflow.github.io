#!/usr/bin/env node

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');

const {fetchBody, wait} = require('./verify-docs-release-live');

const DEFAULT_URL = 'https://durable-workflow.com/install.sh';
const DEFAULT_ATTEMPTS = 30;
const DEFAULT_RETRY_DELAY_MS = 10000;
const EVIDENCE_SCHEMA = 'durable-workflow.docs.live-cli-installer.v1';
const INSTALLER_PATH = path.join(__dirname, '..', 'static', 'install.sh');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function waitForLiveInstaller(options = {}) {
  const expected = options.expected || fs.readFileSync(INSTALLER_PATH);
  const expectedDigest = sha256(expected);
  const fetcher = options.fetcher || fetchBody;
  const target = options.url || DEFAULT_URL;
  const attempts = Number(options.attempts || DEFAULT_ATTEMPTS);
  const retryDelay = Number(options.retryDelay || DEFAULT_RETRY_DELAY_MS);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const url = new URL(target);
      url.searchParams.set('deploy_check', `${Date.now()}-${attempt}`);
      const live = await fetcher(url);
      const liveDigest = sha256(live);

      if (liveDigest !== expectedDigest) {
        throw new Error(
          `${target} returned sha256:${liveDigest}; expected sha256:${expectedDigest}`,
        );
      }

      return {body: live, digest: liveDigest, url: target};
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.warn(
          `CLI installer is not live yet (${attempt}/${attempts}): ${error.message}`,
        );
        await wait(retryDelay);
      }
    }
  }

  throw lastError;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', code => {
      const output = {
        code,
        stderr: Buffer.concat(stderr).toString('utf8'),
        stdout: Buffer.concat(stdout).toString('utf8'),
      };

      if (code !== 0) {
        reject(
          new Error(
            `${command} exited ${code}\n${output.stdout}${output.stderr}`.trim(),
          ),
        );
        return;
      }

      resolve(output);
    });
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address());
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}

async function runDashCacheRegression(installer, options = {}) {
  if (process.platform !== 'linux' || !fs.existsSync('/bin/dash')) {
    throw new Error('the live CLI installer regression requires /bin/dash on Linux');
  }

  const fixtureBinary = Buffer.from(
    '#!/usr/bin/env sh\nprintf \'%s\\n\' \'dw fixture current\'\n',
  );
  const asset = 'dw-linux-x86_64';
  const checksum = Buffer.from(`${sha256(fixtureBinary)}  ${asset}\n`);
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const body = pathname === `/latest/download/${asset}`
      ? fixtureBinary
      : pathname === '/latest/download/SHA256SUMS'
        ? checksum
        : null;

    if (!body) {
      response.writeHead(404);
      response.end('not found\n');
      return;
    }

    response.writeHead(200, {'Content-Type': 'application/octet-stream'});
    response.end(body);
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-live-installer-'));
  const installerPath = path.join(root, 'install.sh');
  const systemBin = path.join(root, 'system-bin');
  const userBin = path.join(root, 'user-bin');
  const resultPath = path.join(root, 'install-result.json');
  const exitPath = path.join(root, 'installer-exit.txt');
  const activeBeforePath = path.join(root, 'active-before.txt');
  const activeAfterPath = path.join(root, 'active-after.txt');
  const activeRemediatedPath = path.join(root, 'active-remediated.txt');

  fs.mkdirSync(systemBin);
  fs.mkdirSync(userBin);
  fs.writeFileSync(installerPath, installer, {mode: 0o755});
  fs.writeFileSync(
    path.join(systemBin, 'dw'),
    '#!/usr/bin/env sh\nprintf \'%s\\n\' \'dw fixture old\'\n',
    {mode: 0o555},
  );
  fs.chmodSync(systemBin, 0o555);

  try {
    const address = await listen(server);
    const harness = [
      'set -eu',
      'dw --version > "$ACTIVE_BEFORE"',
      'set +e',
      'SHELL=/bin/bash sh "$LIVE_INSTALLER" > "$INSTALL_RESULT"',
      'installer_exit=$?',
      'set -e',
      'printf \'%s\\n\' "$installer_exit" > "$INSTALLER_EXIT"',
      'test "$installer_exit" -ne 0',
      'command -v dw > "$ACTIVE_AFTER"',
      'dw --version >> "$ACTIVE_AFTER"',
      'current_shell=$(node -e \'const fs=require("fs");' +
        'const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));' +
        'process.stdout.write(value.remediation.current_shell)\' "$INSTALL_RESULT")',
      'eval "$current_shell"',
      'command -v dw > "$ACTIVE_REMEDIATED"',
      'dw --version >> "$ACTIVE_REMEDIATED"',
    ].join('\n');

    await run('/bin/dash', ['-c', harness], {
      env: {
        ...process.env,
        ACTIVE_AFTER: activeAfterPath,
        ACTIVE_BEFORE: activeBeforePath,
        ACTIVE_REMEDIATED: activeRemediatedPath,
        DURABLE_WORKFLOW_INSTALL_DIR: userBin,
        DURABLE_WORKFLOW_INSTALL_OUTPUT: 'json',
        DURABLE_WORKFLOW_RELEASE_BASE_URL:
          `http://127.0.0.1:${address.port}`,
        INSTALLER_EXIT: exitPath,
        INSTALL_RESULT: resultPath,
        LIVE_INSTALLER: installerPath,
        PATH: `${userBin}:${systemBin}:${process.env.PATH}`,
        VERSION: 'stable',
      },
    });

    const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    const activeBefore = fs.readFileSync(activeBeforePath, 'utf8').trim();
    const activeAfter = fs.readFileSync(activeAfterPath, 'utf8').trim().split('\n');
    const activeRemediated = fs
      .readFileSync(activeRemediatedPath, 'utf8')
      .trim()
      .split('\n');
    const installerExit = Number(fs.readFileSync(exitPath, 'utf8').trim());

    assert.strictEqual(installerExit, 1);
    assert.strictEqual(result.schema, 'durable-workflow.cli.install.v1');
    assert.strictEqual(result.status, 'shell-cache-refresh-required');
    assert.strictEqual(result.installed_path, path.join(userBin, 'dw'));
    assert.strictEqual(result.active_path, path.join(systemBin, 'dw'));
    assert.strictEqual(result.installed_version, 'dw fixture current');
    assert.strictEqual(result.active_version, 'dw fixture old');
    assert.deepStrictEqual(result.remediation, {
      current_shell: "hash 'dw'",
      shell_profile: null,
      persistent_line: null,
    });
    assert.strictEqual(activeBefore, 'dw fixture old');
    assert.deepStrictEqual(activeAfter, [path.join(systemBin, 'dw'), 'dw fixture old']);
    assert.deepStrictEqual(
      activeRemediated,
      [path.join(userBin, 'dw'), 'dw fixture current'],
    );

    return {
      schema: EVIDENCE_SCHEMA,
      outcome: 'pass',
      installer: {
        url: options.url || DEFAULT_URL,
        sha256: options.digest || sha256(installer),
      },
      shell: 'dash',
      observed: {
        active_version_before_remediation: result.active_version,
        current_shell_remediation: result.remediation.current_shell,
        install_status: result.status,
        installed_version: result.installed_version,
        installer_exit_code: installerExit,
        installed_binary_selected_after_remediation: true,
        stale_binary_selected_before_remediation: true,
      },
    };
  } finally {
    if (server.listening) {
      await close(server);
    }
    fs.chmodSync(systemBin, 0o755);
    fs.rmSync(root, {force: true, recursive: true});
  }
}

async function verifyLiveCliInstaller(options = {}) {
  const live = await waitForLiveInstaller(options);
  const evidence = await runDashCacheRegression(live.body, live);
  const evidencePath = options.evidencePath ||
    process.env.CLI_INSTALLER_LIVE_EVIDENCE ||
    path.join(process.cwd(), 'live-cli-installer-evidence.json');

  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `Live CLI installer matches sha256:${live.digest} and rejects dash's stale ` +
      `command cache until ${evidence.observed.current_shell_remediation} is applied.`,
  );
  return evidence;
}

if (require.main === module) {
  verifyLiveCliInstaller().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  EVIDENCE_SCHEMA,
  runDashCacheRegression,
  sha256,
  verifyLiveCliInstaller,
  waitForLiveInstaller,
};
