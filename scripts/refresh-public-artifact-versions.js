#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

const {
  ARTIFACT_VERSION_REQUIREMENTS,
  ARTIFACT_VERSION_SCHEMA,
  REQUIRED_ARTIFACTS,
  buildArtifactPins,
  readArtifactVersions,
} = require('./public-artifact-versions');

const repoRoot = path.join(__dirname, '..');
const artifactVersionsPath = path.join(__dirname, 'public-artifact-versions.json');
const compatibilityDocPath = path.join(repoRoot, 'docs', 'compatibility.md');
const quickstartContractPath = path.join(repoRoot, 'static', 'quickstart-execution-contract.json');
const PUBLIC_ARTIFACT_TUPLE_FILES = Object.freeze([
  'scripts/public-artifact-versions.json',
  'docs/compatibility.md',
  'static/quickstart-execution-contract.json',
]);

const DEFAULT_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;
const MAX_DOCKER_HUB_PAGES = 20;
const MAX_GHCR_PAGES = 20;
const CONTAINER_MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');
const COMPATIBILITY_HISTORY_HEADER =
  '| Date | Server | CLI | Python SDK | Workflow | Waterline | Notes |';
const COMPATIBILITY_HISTORY_NOTE =
  'Public release-audit evidence is aligned with the current published artifact tuple while stable 1.x remains the default docs line.';

const PUBLISHED_ARTIFACT_SOURCES = Object.freeze({
  cli: {
    label: 'CLI',
    kind: 'github-release',
    url: 'https://api.github.com/repos/durable-workflow/cli/releases/latest',
    requiredAssets: [
      'dw.phar',
      'dw-linux-x86_64',
      'dw-linux-aarch64',
      'dw-macos-aarch64',
      'dw-windows-x86_64.exe',
      'dw.rb',
      'install.sh',
      'install.ps1',
      'verify-release.sh',
      'SHA256SUMS',
    ],
  },
  'sdk-python': {
    label: 'Python SDK',
    kind: 'pypi',
    url: 'https://pypi.org/pypi/durable-workflow/json',
  },
  server: {
    label: 'server',
    kind: 'container-registries',
    dockerHub: {
      label: 'Docker Hub',
      image: 'durableworkflow/server',
      url: 'https://hub.docker.com/v2/repositories/durableworkflow/server/tags?page_size=100',
    },
    ghcr: {
      label: 'GHCR',
      image: 'ghcr.io/durable-workflow/server',
      repository: 'durable-workflow/server',
      tagsUrl: 'https://ghcr.io/v2/durable-workflow/server/tags/list?n=100',
      manifestsUrl: 'https://ghcr.io/v2/durable-workflow/server/manifests',
    },
  },
  waterline: {
    label: 'Waterline',
    kind: 'packagist-p2',
    packageName: 'durable-workflow/waterline',
    url: 'https://repo.packagist.org/p2/durable-workflow/waterline.json',
  },
  workflow: {
    label: 'Workflow',
    kind: 'packagist-p2',
    packageName: 'durable-workflow/workflow',
    url: 'https://repo.packagist.org/p2/durable-workflow/workflow.json',
  },
});

function usage() {
  return [
    'Usage:',
    '  node scripts/refresh-public-artifact-versions.js [--check] [--date YYYY-MM-DD]',
    '',
    'Default mode refreshes the generated public artifact tuple files from',
    'the current published tuple:',
    ...PUBLIC_ARTIFACT_TUPLE_FILES.map(file => `  - ${file}`),
    '--check fails without writing when any tuple file is stale.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    check: false,
    date: process.env.PUBLIC_ARTIFACT_TUPLE_DATE || new Date().toISOString().slice(0, 10),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--check') {
      args.check = true;
      continue;
    }

    if (arg === '--date') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--date requires a YYYY-MM-DD value');
      }
      args.date = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--date=')) {
      args.date = arg.slice('--date='.length);
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      console.log(usage());
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error(`--date must use YYYY-MM-DD format, got ${args.date}`);
  }

  return args;
}

function requestJsonResponse(url, options = {}, redirects = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(url);
    const headers = {
      Accept: 'application/json',
      'User-Agent': 'durable-workflow-docs-public-artifact-tuple',
      ...(options.headers || {}),
    };

    if (requestUrl.hostname === 'api.github.com' && process.env.GITHUB_TOKEN && !headers.Authorization) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const req = https.request(
      requestUrl,
      {
        headers,
        method: options.method || 'GET',
        timeout: DEFAULT_TIMEOUT_MS,
      },
      res => {
        const status = res.statusCode || 0;

        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume();

          if (redirects <= 0) {
            reject(new Error(`Too many redirects while fetching ${url}`));
            return;
          }

          const nextUrl = new URL(res.headers.location, url).toString();
          requestJsonResponse(nextUrl, options, redirects - 1).then(resolve, reject);
          return;
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          body += chunk;
        });
        res.on('end', () => {
          if (status < 200 || status >= 300) {
            reject(new Error(`Request failed for ${url}: HTTP ${status} ${body.slice(0, 200)}`));
            return;
          }

          try {
            resolve({
              body: JSON.parse(body),
              headers: res.headers,
              status,
            });
          } catch (err) {
            reject(new Error(`Response from ${url} is not valid JSON: ${err.message}`));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Timed out after ${DEFAULT_TIMEOUT_MS}ms while fetching ${url}`));
    });
    req.on('error', reject);
    req.end();
  });
}

async function requestJson(url, options = {}) {
  const response = await requestJsonResponse(url, options);
  return response.body;
}

function normalizeVersion(artifact, value) {
  const version = String(value || '').replace(/^v/, '');
  const requirement = ARTIFACT_VERSION_REQUIREMENTS[artifact];

  if (!requirement) {
    throw new Error(`Unknown artifact ${artifact}`);
  }

  return requirement.pattern.test(version) ? version : null;
}

function versionRank(version) {
  const stable = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (stable) {
    return stable.slice(1).map(Number).concat([2, 0]);
  }

  const prerelease = /^(\d+)\.(\d+)\.(\d+)-(alpha|beta)\.(\d+)$/.exec(version);
  if (prerelease) {
    const stabilityRank = prerelease[4] === 'beta' ? 1 : 0;
    return [
      Number(prerelease[1]),
      Number(prerelease[2]),
      Number(prerelease[3]),
      stabilityRank,
      Number(prerelease[5]),
    ];
  }

  throw new Error(`Cannot rank unsupported public artifact version ${version}`);
}

function compareVersions(left, right) {
  const leftRank = versionRank(left);
  const rightRank = versionRank(right);
  const width = Math.max(leftRank.length, rightRank.length);

  for (let i = 0; i < width; i += 1) {
    const diff = (leftRank[i] || 0) - (rightRank[i] || 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function selectLatestVersion(artifact, candidates, context) {
  const versions = [...new Set(
    candidates
      .map(candidate => normalizeVersion(artifact, candidate))
      .filter(Boolean)
  )];

  if (versions.length === 0) {
    throw new Error(`Could not find a published ${artifact} version in ${context}`);
  }

  return versions.sort(compareVersions).at(-1);
}

function parseRegistryNextLink(linkHeader, currentUrl) {
  if (!linkHeader) {
    return null;
  }

  const links = String(linkHeader).split(',');
  for (const link of links) {
    const match = /<([^>]+)>\s*;\s*rel="?next"?/.exec(link.trim());
    if (match) {
      return new URL(match[1], currentUrl).toString();
    }
  }

  return null;
}

async function resolveCliVersion(source) {
  const release = await requestJson(source.url);
  const version = normalizeVersion('cli', release.tag_name);

  if (!version) {
    throw new Error(`Latest CLI release tag does not match ${ARTIFACT_VERSION_REQUIREMENTS.cli.expected}: ${release.tag_name}`);
  }

  if (release.draft || release.prerelease) {
    throw new Error(`Latest CLI release ${version} must not be draft or prerelease`);
  }

  const assets = new Set((release.assets || []).map(asset => asset.name));
  const missingAssets = source.requiredAssets.filter(asset => !assets.has(asset));

  if (missingAssets.length > 0) {
    throw new Error(`Latest CLI release ${version} is missing public assets: ${missingAssets.join(', ')}`);
  }

  return version;
}

function dockerHubTagIsPublished(tag) {
  const images = Array.isArray(tag.images) ? tag.images : [];

  return images.some(image => !image.status || image.status === 'active');
}

async function resolveDockerHubVersion(source) {
  let url = source.url;
  let pageCount = 0;
  const candidates = [];

  while (url) {
    pageCount += 1;
    if (pageCount > MAX_DOCKER_HUB_PAGES) {
      throw new Error(`Docker Hub tag scan exceeded ${MAX_DOCKER_HUB_PAGES} pages for ${source.url}`);
    }

    const page = await requestJson(url);
    const results = Array.isArray(page.results) ? page.results : [];

    for (const tag of results) {
      if (tag && dockerHubTagIsPublished(tag)) {
        candidates.push(tag.name);
      }
    }

    url = page.next || null;
  }

  return selectLatestVersion('server', candidates, source.url);
}

async function requestGhcrToken(source) {
  const params = new URLSearchParams({
    service: 'ghcr.io',
    scope: `repository:${source.repository}:pull`,
  });
  const response = await requestJson(`https://ghcr.io/token?${params.toString()}`);

  if (!response || typeof response.token !== 'string' || response.token.trim() === '') {
    throw new Error(`GHCR did not issue an anonymous pull token for ${source.image}`);
  }

  return response.token;
}

async function resolveGhcrVersion(source) {
  const token = await requestGhcrToken(source);
  const listHeaders = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  let url = source.tagsUrl;
  let pageCount = 0;
  const candidates = [];

  while (url) {
    pageCount += 1;
    if (pageCount > MAX_GHCR_PAGES) {
      throw new Error(`GHCR tag scan exceeded ${MAX_GHCR_PAGES} pages for ${source.image}`);
    }

    const response = await requestJsonResponse(url, { headers: listHeaders });
    const tags = Array.isArray(response.body.tags) ? response.body.tags : [];
    candidates.push(...tags);
    url = parseRegistryNextLink(response.headers.link, url);
  }

  const version = selectLatestVersion('server', candidates, source.tagsUrl);
  await requestJson(`${source.manifestsUrl}/${encodeURIComponent(version)}`, {
    headers: {
      Accept: CONTAINER_MANIFEST_ACCEPT,
      Authorization: `Bearer ${token}`,
    },
  });

  return version;
}

function selectServerRegistryVersion(results) {
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('At least one server container registry result is required');
  }

  const expected = results[0].version;
  const mismatches = results.filter(result => result.version !== expected);

  if (mismatches.length > 0) {
    throw new Error([
      'Published server container registries disagree:',
      ...results.map(result => `- ${result.label} ${result.image}:${result.version}`),
    ].join('\n'));
  }

  return expected;
}

async function resolveServerVersion(source) {
  const [
    dockerHubVersion,
    ghcrVersion,
  ] = await Promise.all([
    resolveDockerHubVersion(source.dockerHub),
    resolveGhcrVersion(source.ghcr),
  ]);

  return selectServerRegistryVersion([
    {
      label: source.dockerHub.label,
      image: source.dockerHub.image,
      version: dockerHubVersion,
    },
    {
      label: source.ghcr.label,
      image: source.ghcr.image,
      version: ghcrVersion,
    },
  ]);
}

async function resolvePypiVersion(source) {
  const response = await requestJson(source.url);
  const releases = response.releases || {};
  const candidates = [];

  for (const [version, files] of Object.entries(releases)) {
    if (Array.isArray(files) && files.some(file => !file.yanked)) {
      candidates.push(version);
    }
  }

  if (candidates.length === 0 && response.info && response.info.version) {
    candidates.push(response.info.version);
  }

  return selectLatestVersion('sdk-python', candidates, source.url);
}

async function resolvePackagistVersion(source) {
  const response = await requestJson(source.url);
  const packages = response.packages || {};
  const entries = packages[source.packageName];

  if (!Array.isArray(entries)) {
    throw new Error(`Packagist response for ${source.packageName} did not include a package version list`);
  }

  const candidates = entries
    .filter(entry => entry && (entry.dist || entry.source))
    .map(entry => entry.version);

  const artifact = source.packageName.endsWith('/workflow') ? 'workflow' : 'waterline';

  return selectLatestVersion(artifact, candidates, source.url);
}

async function resolvePublishedArtifactTuple(sources = PUBLISHED_ARTIFACT_SOURCES) {
  const [
    cli,
    sdkPython,
    server,
    waterline,
    workflow,
  ] = await Promise.all([
    resolveCliVersion(sources.cli),
    resolvePypiVersion(sources['sdk-python']),
    resolveServerVersion(sources.server),
    resolvePackagistVersion(sources.waterline),
    resolvePackagistVersion(sources.workflow),
  ]);

  const versions = {
    cli,
    'sdk-python': sdkPython,
    server,
    waterline,
    workflow,
  };

  readArtifactVersions({
    schema: ARTIFACT_VERSION_SCHEMA,
    schemaVersion: 1,
    artifacts: versions,
  });

  return versions;
}

function artifactVersionsSource(versions) {
  return `${JSON.stringify({
    schema: ARTIFACT_VERSION_SCHEMA,
    schemaVersion: 1,
    artifacts: Object.fromEntries(REQUIRED_ARTIFACTS.map(name => [name, versions[name]])),
  }, null, 2)}\n`;
}

function loadCurrentArtifactVersions() {
  const source = JSON.parse(fs.readFileSync(artifactVersionsPath, 'utf8'));
  return readArtifactVersions(source);
}

function artifactMismatches(actual, expected) {
  return REQUIRED_ARTIFACTS
    .filter(name => actual[name] !== expected[name])
    .map(name => ({
      name,
      actual: actual[name],
      expected: expected[name],
    }));
}

function findCompatibilityHistoryTopRow(content) {
  const lines = content.split(/\r?\n/);
  const headerIndex = lines.findIndex(line => line.trim() === COMPATIBILITY_HISTORY_HEADER);

  if (headerIndex < 0) {
    throw new Error(`docs/compatibility.md must include the version-history header: ${COMPATIBILITY_HISTORY_HEADER}`);
  }

  const separatorIndex = headerIndex + 1;
  if (!/^\|\s*-+/.test(lines[separatorIndex] || '')) {
    throw new Error('docs/compatibility.md version-history table must include a separator row after the header');
  }

  const rowIndex = lines.findIndex((line, index) => index > separatorIndex && /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line));

  if (rowIndex < 0) {
    throw new Error('docs/compatibility.md version-history table must include at least one dated row');
  }

  return {
    lines,
    row: lines[rowIndex],
    rowIndex,
  };
}

function parseCompatibilityHistoryRow(row) {
  const cells = row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());

  if (cells.length < 7) {
    throw new Error(`Malformed docs/compatibility.md version-history row: ${row}`);
  }

  return {
    date: cells[0],
    server: cells[1],
    cli: cells[2],
    'sdk-python': cells[3],
    workflow: cells[4],
    waterline: cells[5],
    notes: cells.slice(6).join(' | '),
  };
}

function compatibilityHistoryRow(versions, date) {
  return `| ${date} | ${versions.server} | ${versions.cli} | ${versions['sdk-python']} | ${versions.workflow} | ${versions.waterline} | ${COMPATIBILITY_HISTORY_NOTE} |`;
}

function compatibilityHistoryMismatches(rowVersions, expected) {
  return ['server', 'cli', 'sdk-python', 'workflow', 'waterline']
    .filter(name => rowVersions[name] !== expected[name])
    .map(name => ({
      name,
      actual: rowVersions[name],
      expected: expected[name],
    }));
}

function replaceCompatibilityHistoryTopRow(content, versions, date) {
  const result = findCompatibilityHistoryTopRow(content);
  const current = parseCompatibilityHistoryRow(result.row);
  const mismatches = compatibilityHistoryMismatches(current, versions);

  if (mismatches.length === 0) {
    return {
      changed: false,
      content,
    };
  }

  result.lines[result.rowIndex] = compatibilityHistoryRow(versions, date);

  return {
    changed: true,
    content: result.lines.join('\n'),
  };
}

function mismatchMessage(title, mismatches) {
  return [
    title,
    ...mismatches.map(mismatch => `- ${mismatch.name}: docs=${mismatch.actual || '<missing>'} published=${mismatch.expected}`),
    `Run \`npm run refresh:public-artifact-versions\` to update ${PUBLIC_ARTIFACT_TUPLE_FILES.join(', ')}.`,
  ].join('\n');
}

function readQuickstartContractSource() {
  return fs.readFileSync(quickstartContractPath, 'utf8');
}

function replaceLineContaining(lines, needle, replacement, label) {
  const index = lines.findIndex(line => line.includes(needle));

  if (index < 0) {
    throw new Error(`static/quickstart-execution-contract.json is missing ${label}`);
  }

  if (lines[index] === replacement) {
    return false;
  }

  lines[index] = replacement;
  return true;
}

function replaceRequiredEnvironmentValue(entries, name, value, label) {
  const entry = (entries || []).find(candidate => candidate && candidate.name === name);

  if (!entry) {
    throw new Error(`static/quickstart-execution-contract.json is missing ${label} environment ${name}`);
  }

  if (entry.value === value) {
    return false;
  }

  entry.value = value;
  return true;
}

function byId(entries, label) {
  const match = {};

  for (const entry of entries || []) {
    if (entry && typeof entry.id === 'string') {
      match[entry.id] = entry;
    }
  }

  return id => {
    if (!match[id]) {
      throw new Error(`static/quickstart-execution-contract.json is missing ${label} ${id}`);
    }

    return match[id];
  };
}

function applyQuickstartArtifactPins(contract, versions) {
  const pins = buildArtifactPins(versions);
  let changed = false;
  const artifacts = contract.artifacts || {};

  function update(pathLabel, object, key, value) {
    if (!object || typeof object !== 'object') {
      throw new Error(`static/quickstart-execution-contract.json is missing ${pathLabel}`);
    }

    if (object[key] === value) {
      return;
    }

    object[key] = value;
    changed = true;
  }

  update('artifacts.server', artifacts.server, 'version', versions.server);
  update('artifacts.server', artifacts.server, 'reference', pins.serverDockerHubImage);
  update('artifacts.cli', artifacts.cli, 'version', versions.cli);
  update('artifacts.cli', artifacts.cli, 'install_command', pins.cliInstallerCommand);
  update('artifacts.sdk-python', artifacts['sdk-python'], 'version', versions['sdk-python']);
  update('artifacts.sdk-python', artifacts['sdk-python'], 'pip_package', pins.pythonPackagePin);
  update('artifacts.sdk-python', artifacts['sdk-python'], 'install_command', pins.pythonPipInstallCommand);
  update('artifacts.workflow', artifacts.workflow, 'version', versions.workflow);
  update('artifacts.workflow', artifacts.workflow, 'composer_constraint', pins.workflowComposerPackage);
  update('artifacts.waterline', artifacts.waterline, 'version', versions.waterline);
  update('artifacts.waterline', artifacts.waterline, 'composer_constraint', pins.waterlineComposerPackage);

  const hostingBranch = byId(contract.hosting_branches, 'hosting branch');
  const scenario = byId(contract.scenarios, 'scenario');
  const standalone = hostingBranch('standalone_server_sqlite');
  const python = scenario('python_user_local_server_completion');
  const operator = scenario('operator_local_server_observation');
  const laravel = scenario('laravel_user_embedded_completion');

  changed = replaceRequiredEnvironmentValue(
    standalone.required_environment,
    'DW_SERVER_IMAGE',
    pins.serverDockerHubImage,
    'standalone_server_sqlite'
  ) || changed;

  changed = replaceLineContaining(
    standalone.setup_script_lines,
    'export DW_SERVER_IMAGE=',
    `export DW_SERVER_IMAGE=${pins.serverDockerHubImage}`,
    'standalone server image setup line'
  ) || changed;

  changed = replaceLineContaining(
    python.command_script_lines,
    'pip install durable-workflow==',
    pins.pythonPipInstallCommand,
    'Python SDK install line'
  ) || changed;

  changed = replaceLineContaining(
    operator.command_script_lines,
    'curl -fsSL https://durable-workflow.com/install.sh | VERSION=',
    pins.cliInstallerCommand,
    'CLI install line'
  ) || changed;

  changed = replaceLineContaining(
    laravel.command_script_lines,
    'durable-workflow/workflow:',
    `  ${pins.workflowComposerPackage} \\`,
    'Workflow Composer install line'
  ) || changed;

  changed = replaceLineContaining(
    laravel.command_script_lines,
    'durable-workflow/waterline:',
    `  ${pins.waterlineComposerPackage}`,
    'Waterline Composer install line'
  ) || changed;

  const workflowProbe = (laravel.success_probes || []).find(probe => probe && probe.id === 'composer_workflow_version');
  const waterlineProbe = (laravel.success_probes || []).find(probe => probe && probe.id === 'composer_waterline_version');

  if (!workflowProbe || !Array.isArray(workflowProbe.required_substrings)) {
    throw new Error('static/quickstart-execution-contract.json is missing composer_workflow_version required substrings');
  }

  if (!waterlineProbe || !Array.isArray(waterlineProbe.required_substrings)) {
    throw new Error('static/quickstart-execution-contract.json is missing composer_waterline_version required substrings');
  }

  changed = replaceLineContaining(
    workflowProbe.required_substrings,
    '2.0.0-',
    versions.workflow,
    'Workflow Composer success-probe version'
  ) || changed;

  changed = replaceLineContaining(
    waterlineProbe.required_substrings,
    '2.0.0-',
    versions.waterline,
    'Waterline Composer success-probe version'
  ) || changed;

  return changed;
}

function quickstartExecutionContractSource(currentSource, versions) {
  const contract = JSON.parse(currentSource);
  applyQuickstartArtifactPins(contract, versions);
  return `${JSON.stringify(contract, null, 2)}\n`;
}

async function check() {
  const expected = await resolvePublishedArtifactTuple();
  const actual = loadCurrentArtifactVersions();
  const sourceMismatches = artifactMismatches(actual, expected);

  if (sourceMismatches.length > 0) {
    throw new Error(mismatchMessage('scripts/public-artifact-versions.json is stale against the current published artifact tuple:', sourceMismatches));
  }

  const compatibilityDoc = fs.readFileSync(compatibilityDocPath, 'utf8');
  const topRow = parseCompatibilityHistoryRow(findCompatibilityHistoryTopRow(compatibilityDoc).row);
  const historyMismatches = compatibilityHistoryMismatches(topRow, expected);

  if (historyMismatches.length > 0) {
    throw new Error(mismatchMessage('docs/compatibility.md top version-history row is stale against the current published artifact tuple:', historyMismatches));
  }

  const quickstartContract = readQuickstartContractSource();
  const expectedQuickstartContract = quickstartExecutionContractSource(quickstartContract, expected);
  if (quickstartContract !== expectedQuickstartContract) {
    throw new Error(
      mismatchMessage(
        'static/quickstart-execution-contract.json is stale against the current published artifact tuple:',
        [{name: 'quickstart execution contract', actual: 'stale', expected: 'current pins'}]
      )
    );
  }

  console.log(
    `Public artifact tuple is current: ${REQUIRED_ARTIFACTS.map(name => `${name} ${expected[name]}`).join(', ')}`
  );
}

async function refresh(date) {
  const expected = await resolvePublishedArtifactTuple();
  const desiredArtifactSource = artifactVersionsSource(expected);
  const currentArtifactSource = fs.readFileSync(artifactVersionsPath, 'utf8');
  const updated = [];

  if (currentArtifactSource !== desiredArtifactSource) {
    fs.writeFileSync(artifactVersionsPath, desiredArtifactSource);
    updated.push('scripts/public-artifact-versions.json');
  }

  const compatibilityDoc = fs.readFileSync(compatibilityDocPath, 'utf8');
  const replacement = replaceCompatibilityHistoryTopRow(compatibilityDoc, expected, date);
  if (replacement.changed) {
    fs.writeFileSync(compatibilityDocPath, replacement.content);
    updated.push('docs/compatibility.md');
  }

  const quickstartContract = readQuickstartContractSource();
  const expectedQuickstartContract = quickstartExecutionContractSource(quickstartContract, expected);
  if (quickstartContract !== expectedQuickstartContract) {
    fs.writeFileSync(quickstartContractPath, expectedQuickstartContract);
    updated.push('static/quickstart-execution-contract.json');
  }

  if (updated.length === 0) {
    console.log(
      `Public artifact tuple already current: ${REQUIRED_ARTIFACTS.map(name => `${name} ${expected[name]}`).join(', ')}`
    );
    return;
  }

  console.log(`Updated ${updated.join(' and ')} from the current published artifact tuple.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.check) {
    await check();
    return;
  }

  await refresh(args.date);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  COMPATIBILITY_HISTORY_NOTE,
  PUBLISHED_ARTIFACT_SOURCES,
  PUBLIC_ARTIFACT_TUPLE_FILES,
  artifactMismatches,
  artifactVersionsSource,
  compareVersions,
  compatibilityHistoryMismatches,
  compatibilityHistoryRow,
  findCompatibilityHistoryTopRow,
  normalizeVersion,
  parseRegistryNextLink,
  parseCompatibilityHistoryRow,
  quickstartExecutionContractSource,
  replaceCompatibilityHistoryTopRow,
  resolvePublishedArtifactTuple,
  selectServerRegistryVersion,
  selectLatestVersion,
  versionRank,
};
