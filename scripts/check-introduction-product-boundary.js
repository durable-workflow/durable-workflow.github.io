#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const introductionPath = path.join(repoRoot, 'docs', 'introduction.md');
const phpSdkPath = path.join(repoRoot, 'docs', 'polyglot', 'php.md');
const serverPath = path.join(repoRoot, 'docs', 'polyglot', 'server.md');

const REQUIRED_INTRO_ROUTES = Object.freeze([
  '/docs/2.0/polyglot/php/',
  '/docs/2.0/polyglot/python/',
  '/docs/2.0/polyglot/rust/',
  '/docs/2.0/polyglot/server/',
  '/docs/2.0/polyglot/cloud-control-plane/',
  '/docs/2.0/capabilities/',
  '/docs/2.0/polyglot/deployment-modes/',
  '/docs/2.0/polyglot/cli-python-parity/',
  '/docs/2.0/agent-operating-loop/',
  '/docs/2.0/quickstart/',
  '/docs/2.0/sample-app/',
]);

function fail(message) {
  throw new Error(message);
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function sourceCandidatesForRoute(route) {
  const docId = route
    .replace(/^\/docs\/2\.0\//, '')
    .replace(/\/$/, '');

  return [
    path.join(repoRoot, 'docs', `${docId}.md`),
    path.join(repoRoot, 'docs', `${docId}.mdx`),
  ];
}

function assertRouteExists(route) {
  if (!sourceCandidatesForRoute(route).some(candidate => fs.existsSync(candidate))) {
    fail(`Introduction route ${route} does not map to a 2.0 documentation source`);
  }
}

function firstPosition(source, value, label) {
  const position = source.indexOf(value);
  if (position === -1) {
    fail(`${label} is missing ${JSON.stringify(value)}`);
  }
  return position;
}

function assertIntroductionLinks(introduction) {
  for (const route of REQUIRED_INTRO_ROUTES) {
    assertRouteExists(route);
    firstPosition(introduction, route, 'docs/introduction.md');
  }

  firstPosition(
    introduction,
    'durable-workflow/sdk',
    'docs/introduction.md standalone PHP package boundary',
  );
  firstPosition(
    introduction,
    'durable-workflow/workflow',
    'docs/introduction.md embedded Laravel package boundary',
  );
}

function assertPhpPackageBoundary(phpSdk, server) {
  if (!phpSdk.includes('composer require %%artifact.phpSdkComposerPackage%%')) {
    fail('docs/polyglot/php.md must install the exact published PHP SDK artifact token');
  }
  if (/composer\s+require[^\n]*durable-workflow\/workflow/.test(phpSdk)) {
    fail('docs/polyglot/php.md must not install the embedded Laravel package');
  }
  for (const packageName of ['durable-workflow/sdk', 'durable-workflow/workflow']) {
    if (!phpSdk.includes(packageName)) {
      fail(`docs/polyglot/php.md must distinguish ${packageName}`);
    }
  }

  const marker = '<!-- docs-example id="server.php-sdk.install" -->';
  const markerPosition = firstPosition(server, marker, 'docs/polyglot/server.md PHP SDK install example');
  const installContext = server.slice(markerPosition, markerPosition + 1800);
  if (!installContext.includes('composer require %%artifact.phpSdkComposerPackage%%')) {
    fail('The standalone server PHP worker path must install the PHP SDK artifact token');
  }
  if (/composer\s+require[^\n]*workflowComposerPackage/.test(installContext)) {
    fail('The standalone server PHP worker path must not install the embedded Laravel package');
  }
}

function main() {
  const introduction = read(introductionPath);
  const phpSdk = read(phpSdkPath);
  const server = read(serverPath);

  assertIntroductionLinks(introduction);
  assertPhpPackageBoundary(phpSdk, server);

  console.log(`Introduction product-boundary checks passed for ${REQUIRED_INTRO_ROUTES.length} public routes`);
}

main();
