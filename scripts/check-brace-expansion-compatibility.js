#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const braceExpansion = require('brace-expansion');
const braceExpansionPackage = require('brace-expansion/package.json');
const {minimatch} = require('minimatch');
const serveHandler = require('serve-handler');

const repositoryRoot = path.join(__dirname, '..');
const packageManifest = require(path.join(repositoryRoot, 'package.json'));
const lockfileManifest = require(path.join(repositoryRoot, 'package-lock.json'));

const REQUIRED_BRACE_EXPANSION_VERSION = '5.0.8';
const REQUIRED_MINIMATCH_VERSION = '10.2.5';

function lockedVersions(packageName) {
  const packagePath = new RegExp(`(^|/)node_modules/${packageName.replace('/', '\\/')}$`);

  return Object.entries(lockfileManifest.packages)
    .filter(([lockedPath]) => packagePath.test(lockedPath))
    .map(([, entry]) => entry.version);
}

function request(server, requestPath) {
  const {port} = server.address();

  return new Promise((resolve, reject) => {
    const outgoing = http.get(
      {
        hostname: '127.0.0.1',
        port,
        path: requestPath,
      },
      response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          body += chunk;
        });
        response.on('end', () => resolve({body, headers: response.headers, response}));
      },
    );

    outgoing.on('error', reject);
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}

async function close(server) {
  if (!server.listening) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}

function checkDependencyGraph() {
  assert.equal(
    packageManifest.overrides['brace-expansion'],
    REQUIRED_BRACE_EXPANSION_VERSION,
  );
  assert.equal(packageManifest.overrides.minimatch, REQUIRED_MINIMATCH_VERSION);
  assert.deepEqual(lockedVersions('brace-expansion'), [REQUIRED_BRACE_EXPANSION_VERSION]);
  assert.deepEqual(lockedVersions('minimatch'), [REQUIRED_MINIMATCH_VERSION]);
  assert.equal(braceExpansionPackage.version, REQUIRED_BRACE_EXPANSION_VERSION);
}

function checkBoundedBraceExpansion() {
  assert.equal(typeof braceExpansion.expand, 'function');
  assert.ok(Number.isSafeInteger(braceExpansion.EXPANSION_MAX_LENGTH));
  assert.ok(braceExpansion.EXPANSION_MAX_LENGTH > 0);
  assert.deepEqual(braceExpansion.expand('{docs,guide}/**'), ['docs/**', 'guide/**']);

  const expanded = braceExpansion.expand('{alpha,beta}'.repeat(12), {
    max: 32,
    maxLength: 512,
  });
  const expandedLength = expanded.reduce((total, value) => total + value.length, 0);

  assert.ok(expanded.length <= 32);
  assert.ok(expandedLength <= 512);
}

async function checkServeHandlerGlob() {
  const previewRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-preview-'));
  const docsRoot = path.join(previewRoot, 'docs');
  const previewBody = 'secure preview compatibility';
  fs.mkdirSync(docsRoot);
  fs.writeFileSync(path.join(docsRoot, 'index.html'), previewBody);

  const server = http.createServer((incoming, response) =>
    serveHandler(incoming, response, {
      public: previewRoot,
      cleanUrls: false,
      headers: [
        {
          source: '/{docs,guide}/**',
          headers: [{key: 'X-Brace-Expansion-Compatibility', value: 'passed'}],
        },
      ],
    }),
  );

  try {
    await listen(server);
    const result = await request(server, '/docs/index.html');

    assert.equal(result.response.statusCode, 200);
    assert.equal(result.headers['x-brace-expansion-compatibility'], 'passed');
    assert.equal(result.body, previewBody);
    assert.equal(minimatch('/guide/index.html', '/{docs,guide}/**'), true);
    assert.equal(minimatch('/api/index.html', '/{docs,guide}/**'), false);
  } finally {
    await close(server);
    fs.rmSync(previewRoot, {recursive: true, force: true});
  }
}

async function main() {
  checkDependencyGraph();
  checkBoundedBraceExpansion();
  await checkServeHandlerGlob();
  console.log('Secure brace expansion is compatible with the documentation preview server.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
