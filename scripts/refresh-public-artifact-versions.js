#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');

const {
  ARTIFACT_RELEASE_POLICY,
  ARTIFACT_VERSION_REQUIREMENTS,
  ARTIFACT_VERSION_SCHEMA,
  REQUIRED_ARTIFACTS,
  buildArtifactPins,
  isAuthorizedProductTrainVersion,
  readArtifactVersions,
} = require('./public-artifact-versions');

const repoRoot = path.join(__dirname, '..');
const artifactVersionsPath = path.join(__dirname, 'public-artifact-versions.json');
const quickstartContractPath = path.join(repoRoot, 'static', 'quickstart-execution-contract.json');
const compatibilityContractPath = path.join(repoRoot, 'static', 'compatibility-contract.json');
const workflowAuthorityLockPath = path.join(
  __dirname,
  'workflow-sdk-neutrality-authority-lock.json',
);
const sdkNeutralityContractPath = path.join(repoRoot, 'static', 'sdk-neutrality-contract.json');
const WORKFLOW_SDK_NEUTRALITY_RESOURCE_PATH = 'resources/sdk-neutrality-contract.json';
const PUBLIC_ARTIFACT_TUPLE_FILES = Object.freeze([
  'scripts/public-artifact-versions.json',
  'static/quickstart-execution-contract.json',
  'static/compatibility-contract.json',
  'static/sdk-neutrality-contract.json',
  'scripts/workflow-sdk-neutrality-authority-lock.json',
]);
const PUBLIC_ARTIFACT_TUPLE_PATHS = Object.freeze({
  'scripts/public-artifact-versions.json': artifactVersionsPath,
  'static/quickstart-execution-contract.json': quickstartContractPath,
  'static/compatibility-contract.json': compatibilityContractPath,
  'static/sdk-neutrality-contract.json': sdkNeutralityContractPath,
  'scripts/workflow-sdk-neutrality-authority-lock.json': workflowAuthorityLockPath,
});

const DEFAULT_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;
const MAX_GITHUB_RELEASE_PAGES = 10;
const MAX_DOCKER_HUB_PAGES = 20;
const MAX_GHCR_PAGES = 20;
const CONTAINER_MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

const PUBLISHED_ARTIFACT_SOURCES = Object.freeze({
  cli: {
    label: 'CLI',
    kind: 'github-release',
    url: 'https://api.github.com/repos/durable-workflow/cli/releases?per_page=100',
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
  'sdk-php': {
    label: 'PHP SDK',
    kind: 'packagist-p2',
    artifact: 'sdk-php',
    packageName: 'durable-workflow/sdk',
    url: 'https://repo.packagist.org/p2/durable-workflow/sdk.json',
  },
  'sdk-python': {
    label: 'Python SDK',
    kind: 'pypi',
    url: 'https://pypi.org/pypi/durable-workflow/json',
  },
  'sdk-rust': {
    label: 'Rust SDK',
    kind: 'crates-io',
    packageName: 'durable-workflow',
    url: 'https://crates.io/api/v1/crates/durable-workflow',
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
    artifact: 'waterline',
    packageName: 'durable-workflow/waterline',
    url: 'https://repo.packagist.org/p2/durable-workflow/waterline.json',
  },
  workflow: {
    label: 'Workflow',
    kind: 'packagist-p2',
    artifact: 'workflow',
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

function requestBufferResponse(url, options = {}, redirects = MAX_REDIRECTS) {
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
          requestBufferResponse(nextUrl, options, redirects - 1).then(resolve, reject);
          return;
        }

        const chunks = [];
        res.on('data', chunk => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          if (status < 200 || status >= 300) {
            reject(new Error(
              `Request failed for ${url}: HTTP ${status} ${body.toString('utf8', 0, 200)}`,
            ));
            return;
          }

          resolve({body, headers: res.headers, status});
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

async function requestJsonResponse(url, options = {}) {
  const response = await requestBufferResponse(url, options);

  try {
    return {
      ...response,
      body: JSON.parse(response.body.toString('utf8')),
    };
  } catch (err) {
    throw new Error(`Response from ${url} is not valid JSON: ${err.message}`);
  }
}

async function requestJson(url, options = {}) {
  const response = await requestJsonResponse(url, options);
  return response.body;
}

async function requestText(url, options = {}) {
  const response = await requestBufferResponse(url, options);
  const source = response.body.toString('utf8');

  if (!Buffer.from(source, 'utf8').equals(response.body)) {
    throw new Error(`Response from ${url} is not valid UTF-8 text`);
  }

  return source;
}

function normalizeVersion(artifact, value) {
  let version = String(value || '').replace(/^v/, '');
  const requirement = ARTIFACT_VERSION_REQUIREMENTS[artifact];

  if (!requirement) {
    throw new Error(`Unknown artifact ${artifact}`);
  }

  if (artifact === 'sdk-python') {
    version = version.replace(
      /^(\d+\.\d+\.\d+)(a|b|rc)(\d+)$/,
      (_, train, prerelease, sequence) => {
        const stability = {a: 'alpha', b: 'beta', rc: 'rc'}[prerelease];
        return `${train}-${stability}.${sequence}`;
      },
    );
  }

  return isAuthorizedProductTrainVersion(version) ? version : null;
}

function versionRank(version) {
  const stable = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (stable) {
    return stable.slice(1).map(Number).concat([3, 0]);
  }

  const prerelease = /^(\d+)\.(\d+)\.(\d+)-(alpha|beta|rc)\.(\d+)$/.exec(version);
  if (prerelease) {
    const stabilityRank = {alpha: 0, beta: 1, rc: 2}[prerelease[4]];
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
  const versions = publishedVersions(artifact, candidates, context);

  return versions.at(-1);
}

function publishedVersions(artifact, candidates, context) {
  const versions = [...new Set(
    candidates
      .map(candidate => normalizeVersion(artifact, candidate))
      .filter(Boolean)
  )].sort(compareVersions);

  if (versions.length === 0) {
    throw new Error(`Could not find a published ${artifact} version in ${context}`);
  }

  return versions;
}

function selectLatestCompleteArtifactTrain(candidateVersions, context = 'public registries') {
  const unknown = Object.keys(candidateVersions || {})
    .filter(name => !REQUIRED_ARTIFACTS.includes(name))
    .sort();
  if (unknown.length > 0) {
    throw new Error(`Published artifact candidates contain unknown artifacts: ${unknown.join(', ')}`);
  }

  const normalized = Object.fromEntries(REQUIRED_ARTIFACTS.map(name => {
    if (!Array.isArray(candidateVersions && candidateVersions[name])) {
      throw new Error(`Published artifact candidates must define an array for ${name}`);
    }

    return [name, publishedVersions(name, candidateVersions[name], context)];
  }));
  const completeVersions = normalized[REQUIRED_ARTIFACTS[0]].filter(version => (
    REQUIRED_ARTIFACTS.every(name => normalized[name].includes(version))
  ));

  if (completeVersions.length === 0) {
    throw new Error([
      `No fully published coherent artifact train exists in ${context}.`,
      ...REQUIRED_ARTIFACTS.map(name => `- ${name}: ${normalized[name].join(', ')}`),
    ].join('\n'));
  }

  const selected = completeVersions.sort(compareVersions).at(-1);
  return Object.freeze(Object.fromEntries(REQUIRED_ARTIFACTS.map(name => [name, selected])));
}

function classifyArtifactTrainChange(currentVersions, publishedVersions) {
  const current = readArtifactVersions({
    schema: ARTIFACT_VERSION_SCHEMA,
    schemaVersion: 1,
    artifacts: currentVersions,
  });
  const published = readArtifactVersions({
    schema: ARTIFACT_VERSION_SCHEMA,
    schemaVersion: 1,
    artifacts: publishedVersions,
  });
  const comparison = compareVersions(published.server, current.server);

  if (comparison < 0) {
    throw new Error(
      `Refusing to regress the public artifact train from ${current.server} to ${published.server}`,
    );
  }

  return comparison === 0 ? 'current' : 'advance';
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

function missingCliReleaseAssets(release, requiredAssets) {
  const assets = new Set(((release && release.assets) || []).map(asset => asset.name));
  return requiredAssets.filter(asset => !assets.has(asset));
}

function completeCliReleaseVersions(releases, source) {
  const candidates = [];
  const incomplete = [];

  for (const release of releases || []) {
    const version = normalizeVersion('cli', release && release.tag_name);

    if (!version || release.draft) {
      continue;
    }

    const missingAssets = missingCliReleaseAssets(release, source.requiredAssets);

    if (missingAssets.length > 0) {
      incomplete.push({
        version,
        missingAssets,
      });
      continue;
    }

    candidates.push(version);
  }

  if (candidates.length > 0) {
    return publishedVersions('cli', candidates, source.url);
  }

  if (incomplete.length > 0) {
    throw new Error([
      'No complete CLI release contains all required public assets.',
      ...incomplete.map(release => `- ${release.version}: missing ${release.missingAssets.join(', ')}`),
    ].join('\n'));
  }

  throw new Error(`Could not find a published cli version in ${source.url}`);
}

function selectLatestCompleteCliRelease(releases, source) {
  return completeCliReleaseVersions(releases, source).at(-1);
}

async function listGitHubReleases(source) {
  let url = source.url;
  let pageCount = 0;
  const releases = [];

  while (url) {
    pageCount += 1;
    if (pageCount > MAX_GITHUB_RELEASE_PAGES) {
      throw new Error(`GitHub release scan exceeded ${MAX_GITHUB_RELEASE_PAGES} pages for ${source.url}`);
    }

    const response = await requestJsonResponse(url);
    const pageReleases = Array.isArray(response.body) ? response.body : [response.body];
    releases.push(...pageReleases);
    url = Array.isArray(response.body) ? parseRegistryNextLink(response.headers.link, url) : null;
  }

  return releases;
}

async function resolveCliVersion(source) {
  return selectLatestCompleteCliRelease(await listGitHubReleases(source), source);
}

async function resolveCliVersions(source) {
  return completeCliReleaseVersions(await listGitHubReleases(source), source);
}

function dockerHubTagIsPublished(tag) {
  const images = Array.isArray(tag.images) ? tag.images : [];

  return images.some(image => !image.status || image.status === 'active');
}

async function resolveDockerHubVersions(source) {
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

  return publishedVersions('server', candidates, source.url);
}

async function resolveDockerHubVersion(source) {
  return (await resolveDockerHubVersions(source)).at(-1);
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

async function resolveGhcrVersions(source) {
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

  return {
    token,
    versions: publishedVersions('server', candidates, source.tagsUrl),
  };
}

async function verifyGhcrVersion(source, token, version) {
  await requestJson(`${source.manifestsUrl}/${encodeURIComponent(version)}`, {
    headers: {
      Accept: CONTAINER_MANIFEST_ACCEPT,
      Authorization: `Bearer ${token}`,
    },
  });

  return version;
}

async function resolveGhcrVersion(source) {
  const {token, versions} = await resolveGhcrVersions(source);
  const version = versions.at(-1);
  await verifyGhcrVersion(source, token, version);

  return version;
}

function selectServerRegistryVersion(results) {
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('At least one server container registry result is required');
  }

  const normalizedResults = results.map(result => ({
    ...result,
    observedVersion: result.version,
    version: normalizeVersion('server', result.version),
  }));
  const unauthorized = normalizedResults.filter(result => result.version === null);

  if (unauthorized.length > 0) {
    throw new Error([
      `Published server container versions are not authorized by the ${ARTIFACT_RELEASE_POLICY.release_phase} release phase:`,
      ...unauthorized.map(result => (
        `- ${result.label} ${result.image}:${result.observedVersion}`
      )),
    ].join('\n'));
  }

  const expected = normalizedResults[0].version;
  const mismatches = normalizedResults.filter(result => result.version !== expected);

  if (mismatches.length > 0) {
    throw new Error([
      'Published server container registries disagree:',
      ...normalizedResults.map(result => `- ${result.label} ${result.image}:${result.version}`),
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

async function resolveServerVersions(source) {
  const [dockerHubVersions, ghcr] = await Promise.all([
    resolveDockerHubVersions(source.dockerHub),
    resolveGhcrVersions(source.ghcr),
  ]);
  const versions = dockerHubVersions.filter(version => ghcr.versions.includes(version));

  if (versions.length === 0) {
    throw new Error([
      'Published server container registries have no shared authorized version:',
      `- ${source.dockerHub.label} ${source.dockerHub.image}: ${dockerHubVersions.join(', ')}`,
      `- ${source.ghcr.label} ${source.ghcr.image}: ${ghcr.versions.join(', ')}`,
    ].join('\n'));
  }

  return {
    ghcrToken: ghcr.token,
    versions: versions.sort(compareVersions),
  };
}

async function resolvePypiVersions(source) {
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

  return publishedVersions('sdk-python', candidates, source.url);
}

async function resolvePypiVersion(source) {
  return (await resolvePypiVersions(source)).at(-1);
}

function selectLatestCratesIoVersion(response, source) {
  return cratesIoVersions(response, source).at(-1);
}

function cratesIoVersions(response, source) {
  const candidates = (response.versions || [])
    .filter(version => version && !version.yanked)
    .map(version => version.num);

  if (candidates.length === 0 && response.crate && response.crate.max_version) {
    candidates.push(response.crate.max_version);
  }

  return publishedVersions('sdk-rust', candidates, source.url);
}

async function resolveCratesIoVersion(source) {
  return selectLatestCratesIoVersion(await requestJson(source.url), source);
}

async function resolveCratesIoVersions(source) {
  return cratesIoVersions(await requestJson(source.url), source);
}

async function resolvePackagistReleases(source, clients = {}) {
  const getJson = clients.requestJson || requestJson;
  const response = await getJson(source.url);
  const packages = response.packages || {};
  const entries = packages[source.packageName];

  if (!Array.isArray(entries)) {
    throw new Error(`Packagist response for ${source.packageName} did not include a package version list`);
  }

  const artifact = source.artifact;
  if (!artifact || !ARTIFACT_VERSION_REQUIREMENTS[artifact]) {
    throw new Error(`Packagist source ${source.packageName} must declare a known artifact key`);
  }
  const releases = entries
    .filter(entry => entry && (entry.dist || entry.source))
    .map(entry => ({
      source: entry.source,
      version: normalizeVersion(artifact, entry.version),
    }))
    .filter(entry => entry.version !== null);

  publishedVersions(artifact, releases.map(entry => entry.version), source.url);
  return releases;
}

function selectPackagistRelease(releases, artifact, version) {
  const selectedEntry = releases.find(entry => entry.version === version);

  if (!selectedEntry) {
    throw new Error(`Could not find published ${artifact} release ${version}`);
  }

  return {
    version: selectedEntry.version,
    source: selectedEntry.source,
  };
}

async function resolvePackagistVersion(source, clients = {}) {
  const releases = await resolvePackagistReleases(source, clients);
  const version = selectLatestVersion(
    source.artifact,
    releases.map(entry => entry.version),
    source.url,
  );

  return selectPackagistRelease(releases, source.artifact, version);
}

async function resolvePublishedArtifactTupleState(sources = PUBLISHED_ARTIFACT_SOURCES) {
  const [
    cliVersions,
    sdkPhpReleases,
    sdkPythonVersions,
    sdkRustVersions,
    serverState,
    waterlineReleases,
    workflowReleases,
  ] = await Promise.all([
    resolveCliVersions(sources.cli),
    resolvePackagistReleases(sources['sdk-php']),
    resolvePypiVersions(sources['sdk-python']),
    resolveCratesIoVersions(sources['sdk-rust']),
    resolveServerVersions(sources.server),
    resolvePackagistReleases(sources.waterline),
    resolvePackagistReleases(sources.workflow),
  ]);

  const versions = selectLatestCompleteArtifactTrain({
    cli: cliVersions,
    'sdk-php': sdkPhpReleases.map(release => release.version),
    'sdk-python': sdkPythonVersions,
    'sdk-rust': sdkRustVersions,
    server: serverState.versions,
    waterline: waterlineReleases.map(release => release.version),
    workflow: workflowReleases.map(release => release.version),
  }, 'the seven public distribution surfaces');
  await verifyGhcrVersion(
    sources.server.ghcr,
    serverState.ghcrToken,
    versions.server,
  );
  const workflowRelease = selectPackagistRelease(
    workflowReleases,
    'workflow',
    versions.workflow,
  );
  const workflowAuthority = await resolveWorkflowAuthorityForRelease(workflowRelease);

  return {
    versions,
    workflowManifestSource: workflowAuthority.manifestSource,
    workflowSourceReference: workflowAuthority.sourceReference,
  };
}

async function resolvePublishedArtifactTuple(sources = PUBLISHED_ARTIFACT_SOURCES) {
  return (await resolvePublishedArtifactTupleState(sources)).versions;
}

function artifactVersionsSource(versions) {
  const source = {
    schema: ARTIFACT_VERSION_SCHEMA,
    schemaVersion: 1,
    artifacts: Object.fromEntries(REQUIRED_ARTIFACTS.map(name => [name, versions[name]])),
  };

  readArtifactVersions(source);

  return `${JSON.stringify(source, null, 2)}\n`;
}

function sha256(source) {
  return crypto.createHash('sha256').update(source).digest('hex');
}

function workflowAuthorityManifestUrl(sourceReference) {
  return [
    'https://raw.githubusercontent.com/durable-workflow/workflow',
    encodeURIComponent(sourceReference),
    WORKFLOW_SDK_NEUTRALITY_RESOURCE_PATH,
  ].join('/');
}

function workflowSourceReference(release) {
  const source = release && release.source;
  const reference = source && source.reference;
  const version = release && release.version ? release.version : 'selected version';

  if (!source || source.type !== 'git') {
    throw new Error(`Packagist Workflow ${version} must include git source metadata`);
  }

  if (typeof reference !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(reference)) {
    throw new Error(
      `Packagist Workflow ${version} must include a full source.reference commit SHA`,
    );
  }

  return reference;
}

function assertWorkflowAuthorityManifestSource(source, workflowRef) {
  let manifest;

  try {
    manifest = JSON.parse(source);
  } catch (err) {
    throw new Error(
      `Workflow ${workflowRef} ${WORKFLOW_SDK_NEUTRALITY_RESOURCE_PATH} is not valid JSON: ${err.message}`,
    );
  }

  if (!manifest || manifest.schema !== 'durable-workflow.v2.sdk-neutrality.contract') {
    throw new Error(
      `Workflow ${workflowRef} ${WORKFLOW_SDK_NEUTRALITY_RESOURCE_PATH} has an invalid SDK-neutrality schema`,
    );
  }
}

async function resolveWorkflowAuthorityManifest(release, clients = {}) {
  const getText = clients.requestText || requestText;
  const sourceReference = workflowSourceReference(release);
  const url = workflowAuthorityManifestUrl(sourceReference);
  const source = await getText(url);
  assertWorkflowAuthorityManifestSource(source, release.version);
  return source;
}

async function resolveWorkflowAuthorityForRelease(release, clients = {}) {
  const sourceReference = workflowSourceReference(release);
  const manifestSource = await resolveWorkflowAuthorityManifest(release, clients);

  return {
    version: release.version,
    sourceReference,
    manifestSource,
  };
}

async function resolvePublishedWorkflowAuthority(source, clients = {}) {
  const release = await resolvePackagistVersion(source, clients);
  return resolveWorkflowAuthorityForRelease(release, clients);
}

function workflowAuthorityLockSource(workflowRef, manifestSource) {
  assertWorkflowAuthorityManifestSource(manifestSource, workflowRef);

  return `${JSON.stringify({
    schema: 'durable-workflow.docs.workflow-sdk-neutrality-authority-lock',
    schema_version: 1,
    workflow_ref: workflowRef,
    resource_path: WORKFLOW_SDK_NEUTRALITY_RESOURCE_PATH,
    sha256: sha256(manifestSource),
  }, null, 2)}\n`;
}

function readPublicArtifactTupleSources() {
  return Object.fromEntries(PUBLIC_ARTIFACT_TUPLE_FILES.map(file => [
    file,
    fs.readFileSync(PUBLIC_ARTIFACT_TUPLE_PATHS[file], 'utf8'),
  ]));
}

function generatedPublicArtifactTupleSources(currentSources, versions, date, workflowManifestSource) {
  const quickstartSource = currentSources['static/quickstart-execution-contract.json'];
  const compatibilitySource = currentSources['static/compatibility-contract.json'];

  return {
    'scripts/public-artifact-versions.json': artifactVersionsSource(versions),
    'static/quickstart-execution-contract.json': quickstartExecutionContractSource(
      quickstartSource,
      versions,
    ),
    'static/compatibility-contract.json': compatibilityContractSource(
      compatibilitySource,
      versions,
    ),
    'static/sdk-neutrality-contract.json': workflowManifestSource,
    'scripts/workflow-sdk-neutrality-authority-lock.json': workflowAuthorityLockSource(
      versions.workflow,
      workflowManifestSource,
    ),
  };
}

function changedPublicArtifactTupleFiles(currentSources, desiredSources) {
  return PUBLIC_ARTIFACT_TUPLE_FILES.filter(
    file => currentSources[file] !== desiredSources[file],
  );
}

function writePublicArtifactTupleSources(desiredSources, changedFiles, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const tuplePaths = options.tuplePaths || PUBLIC_ARTIFACT_TUPLE_PATHS;
  const operationId = `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const uniqueFiles = new Set(changedFiles);

  if (uniqueFiles.size !== changedFiles.length) {
    throw new Error('Public artifact tuple changed-file list must not contain duplicates');
  }

  const entries = changedFiles.map((file, index) => {
    const targetPath = tuplePaths[file];
    if (!targetPath || typeof desiredSources[file] !== 'string') {
      throw new Error(`Cannot write unknown public artifact tuple source ${file}`);
    }

    return {
      backupPath: `${targetPath}.tuple-backup-${operationId}-${index}`,
      backupReady: false,
      hadTarget: false,
      promoted: false,
      stagedPath: `${targetPath}.tuple-staged-${operationId}-${index}`,
      stagedReady: false,
      targetPath,
      rollbackFailed: false,
    };
  });

  function removeIfPresent(file) {
    if (fileSystem.existsSync(file)) {
      fileSystem.rmSync(file, {force: true});
    }
  }

  try {
    for (const [index, file] of changedFiles.entries()) {
      const entry = entries[index];
      fileSystem.writeFileSync(entry.stagedPath, desiredSources[file], {flag: 'wx'});
      entry.stagedReady = true;
    }

    for (const entry of entries) {
      entry.hadTarget = fileSystem.existsSync(entry.targetPath);
      if (entry.hadTarget) {
        fileSystem.copyFileSync(entry.targetPath, entry.backupPath, fs.constants.COPYFILE_EXCL);
        entry.backupReady = true;
      }
    }

    for (const entry of entries) {
      fileSystem.renameSync(entry.stagedPath, entry.targetPath);
      entry.stagedReady = false;
      entry.promoted = true;
    }
  } catch (writeError) {
    const rollbackErrors = [];

    for (const entry of [...entries].reverse()) {
      const replacementMayBeInstalled = entry.promoted
        || (entry.stagedReady && !fileSystem.existsSync(entry.stagedPath));
      if (!replacementMayBeInstalled) {
        continue;
      }

      try {
        if (entry.hadTarget && entry.backupReady) {
          fileSystem.renameSync(entry.backupPath, entry.targetPath);
          entry.backupReady = false;
        } else if (!entry.hadTarget) {
          removeIfPresent(entry.targetPath);
        }
      } catch (rollbackError) {
        entry.rollbackFailed = true;
        rollbackErrors.push(
          `${entry.targetPath}: ${rollbackError.message} (backup: ${entry.backupPath})`,
        );
      }
    }

    if (rollbackErrors.length > 0) {
      throw new Error([
        `Public artifact tuple write failed: ${writeError.message}`,
        'Rollback also failed; preserved backup files must be restored:',
        ...rollbackErrors.map(message => `- ${message}`),
      ].join('\n'));
    }

    throw writeError;
  } finally {
    for (const entry of entries) {
      removeIfPresent(entry.stagedPath);
      if (entry.backupReady && !entry.rollbackFailed) {
        removeIfPresent(entry.backupPath);
      }
    }
  }
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

function mismatchMessage(title, mismatches) {
  return [
    title,
    ...mismatches.map(mismatch => `- ${mismatch.name}: docs=${mismatch.actual || '<missing>'} published=${mismatch.expected}`),
    `Run \`npm run refresh:public-artifact-versions\` to update ${PUBLIC_ARTIFACT_TUPLE_FILES.join(', ')}.`,
  ].join('\n');
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
  update('artifacts.sdk-php', artifacts['sdk-php'], 'version', versions['sdk-php']);
  update('artifacts.sdk-php', artifacts['sdk-php'], 'composer_package', pins.phpSdkComposerPackage);
  update('artifacts.sdk-php', artifacts['sdk-php'], 'install_command', pins.phpSdkComposerInstallCommand);
  update('artifacts.sdk-python', artifacts['sdk-python'], 'version', versions['sdk-python']);
  update('artifacts.sdk-python', artifacts['sdk-python'], 'pip_package', pins.pythonPackagePin);
  update('artifacts.sdk-python', artifacts['sdk-python'], 'install_command', pins.pythonPipInstallCommand);
  update('artifacts.sdk-rust', artifacts['sdk-rust'], 'version', versions['sdk-rust']);
  update('artifacts.sdk-rust', artifacts['sdk-rust'], 'crate', 'durable-workflow');
  update('artifacts.sdk-rust', artifacts['sdk-rust'], 'install_command', pins.rustCargoAddCommand);
  update('artifacts.workflow', artifacts.workflow, 'version', versions.workflow);
  update('artifacts.workflow', artifacts.workflow, 'composer_constraint', pins.workflowComposerPackage);
  update('artifacts.waterline', artifacts.waterline, 'version', versions.waterline);
  update('artifacts.waterline', artifacts.waterline, 'composer_constraint', pins.waterlineComposerPackage);

  const hostingBranch = byId(contract.hosting_branches, 'hosting branch');
  const scenario = byId(contract.scenarios, 'scenario');
  const standalone = hostingBranch('standalone_server_sqlite');
  const php = scenario('php_user_local_server_completion');
  const python = scenario('python_user_local_server_completion');
  const rust = scenario('rust_user_local_server_completion');
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
    php.command_script_lines,
    'composer require durable-workflow/sdk:',
    pins.phpSdkComposerInstallCommand,
    'PHP SDK install line'
  ) || changed;

  changed = replaceLineContaining(
    python.command_script_lines,
    'pip install durable-workflow==',
    pins.pythonPipInstallCommand,
    'Python SDK install line'
  ) || changed;

  changed = replaceLineContaining(
    rust.command_script_lines,
    'cargo add durable-workflow@',
    pins.rustCargoAddCommand,
    'Rust SDK install line'
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
    `  ${pins.waterlineComposerPackage} \\`,
    'Waterline Composer install line'
  ) || changed;

  changed = replaceLineContaining(
    laravel.command_script_lines,
    'durable-workflow/sdk:',
    `  ${pins.phpSdkComposerPackage}`,
    'PHP SDK Composer install line'
  ) || changed;

  const phpSdkProbe = (laravel.success_probes || []).find(probe => probe && probe.id === 'composer_php_sdk_version');
  const workflowProbe = (laravel.success_probes || []).find(probe => probe && probe.id === 'composer_workflow_version');
  const waterlineProbe = (laravel.success_probes || []).find(probe => probe && probe.id === 'composer_waterline_version');

  if (!phpSdkProbe || !Array.isArray(phpSdkProbe.required_substrings)) {
    throw new Error('static/quickstart-execution-contract.json is missing composer_php_sdk_version required substrings');
  }

  if (!workflowProbe || !Array.isArray(workflowProbe.required_substrings)) {
    throw new Error('static/quickstart-execution-contract.json is missing composer_workflow_version required substrings');
  }

  if (!waterlineProbe || !Array.isArray(waterlineProbe.required_substrings)) {
    throw new Error('static/quickstart-execution-contract.json is missing composer_waterline_version required substrings');
  }

  changed = replaceLineContaining(
    phpSdkProbe.required_substrings,
    '2.0.0-',
    versions['sdk-php'],
    'PHP SDK Composer success-probe version'
  ) || changed;

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

function compatibilityContractSource(currentSource, versions) {
  const contract = JSON.parse(currentSource);
  const pins = buildArtifactPins(versions);
  const packages = contract.surface_families?.official_sdks?.package_compatibility;

  if (!packages || !packages.php_sdk || !packages.python_sdk || !packages.rust_sdk) {
    throw new Error(
      'static/compatibility-contract.json must define all official SDK package compatibility entries',
    );
  }

  const expectedPackages = {
    php_sdk: {
      release_line: versions['sdk-php'],
      product_train: versions['sdk-php'],
      supported_server_versions: versions.server,
    },
    python_sdk: {
      release_line: versions['sdk-python'],
      registry_version: pins.pythonRegistryVersion,
      product_train: versions['sdk-python'],
      supported_server_versions: versions.server,
    },
    rust_sdk: {
      release_line: versions['sdk-rust'],
      product_train: versions['sdk-rust'],
      supported_server_versions: versions.server,
    },
  };
  let changed = false;

  for (const [packageName, fields] of Object.entries(expectedPackages)) {
    for (const [field, value] of Object.entries(fields)) {
      if (packages[packageName][field] !== value) {
        packages[packageName][field] = value;
        changed = true;
      }
    }
  }

  if (!changed) {
    return currentSource;
  }

  return `${JSON.stringify(contract, null, 2)}\n`;
}

async function check() {
  const published = await resolvePublishedArtifactTupleState();
  const expected = published.versions;
  const workflowManifestSource = published.workflowManifestSource;
  const currentSources = readPublicArtifactTupleSources();
  const desiredSources = generatedPublicArtifactTupleSources(
    currentSources,
    expected,
    new Date().toISOString().slice(0, 10),
    workflowManifestSource,
  );
  const actual = readArtifactVersions(JSON.parse(
    currentSources['scripts/public-artifact-versions.json'],
  ));
  classifyArtifactTrainChange(actual, expected);
  const sourceMismatches = artifactMismatches(actual, expected);

  if (sourceMismatches.length > 0) {
    throw new Error(mismatchMessage('scripts/public-artifact-versions.json is stale against the current published artifact tuple:', sourceMismatches));
  }

  const quickstartContract = currentSources['static/quickstart-execution-contract.json'];
  const expectedQuickstartContract = desiredSources['static/quickstart-execution-contract.json'];
  if (quickstartContract !== expectedQuickstartContract) {
    throw new Error(
      mismatchMessage(
        'static/quickstart-execution-contract.json is stale against the current published artifact tuple:',
        [{name: 'quickstart execution contract', actual: 'stale', expected: 'current pins'}]
      )
    );
  }

  const compatibilityContract = currentSources['static/compatibility-contract.json'];
  const expectedCompatibilityContract = desiredSources['static/compatibility-contract.json'];
  if (compatibilityContract !== expectedCompatibilityContract) {
    throw new Error(
      mismatchMessage(
        'static/compatibility-contract.json is stale against the current published artifact tuple:',
        [{name: 'compatibility contract', actual: 'stale', expected: 'current pins'}],
      ),
    );
  }

  if (
    currentSources['static/sdk-neutrality-contract.json']
    !== desiredSources['static/sdk-neutrality-contract.json']
  ) {
    throw new Error(
      mismatchMessage(
        'static/sdk-neutrality-contract.json is stale against the exact published Workflow authority:',
        [{
          name: 'Workflow SDK-neutrality manifest',
          actual: sha256(currentSources['static/sdk-neutrality-contract.json']),
          expected: sha256(desiredSources['static/sdk-neutrality-contract.json']),
        }],
      ),
    );
  }

  if (
    currentSources['scripts/workflow-sdk-neutrality-authority-lock.json']
    !== desiredSources['scripts/workflow-sdk-neutrality-authority-lock.json']
  ) {
    throw new Error(
      mismatchMessage(
        'scripts/workflow-sdk-neutrality-authority-lock.json is stale against the exact published Workflow authority:',
        [{
          name: 'Workflow SDK-neutrality authority lock',
          actual: 'stale ref or digest',
          expected: `${expected.workflow} ${sha256(workflowManifestSource)}`,
        }],
      ),
    );
  }

  console.log(
    `Public artifact tuple is current: ${REQUIRED_ARTIFACTS.map(name => `${name} ${expected[name]}`).join(', ')}`
  );
}

async function refresh(date) {
  const published = await resolvePublishedArtifactTupleState();
  const expected = published.versions;
  const workflowManifestSource = published.workflowManifestSource;
  const currentSources = readPublicArtifactTupleSources();
  const currentVersions = readArtifactVersions(JSON.parse(
    currentSources['scripts/public-artifact-versions.json'],
  ));
  classifyArtifactTrainChange(currentVersions, expected);
  const desiredSources = generatedPublicArtifactTupleSources(
    currentSources,
    expected,
    date,
    workflowManifestSource,
  );
  const updated = changedPublicArtifactTupleFiles(currentSources, desiredSources);

  if (updated.length === 0) {
    console.log(
      `Public artifact tuple already current: ${REQUIRED_ARTIFACTS.map(name => `${name} ${expected[name]}`).join(', ')}`
    );
    return;
  }

  writePublicArtifactTupleSources(desiredSources, updated);
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
  PUBLISHED_ARTIFACT_SOURCES,
  PUBLIC_ARTIFACT_TUPLE_FILES,
  artifactMismatches,
  artifactVersionsSource,
  changedPublicArtifactTupleFiles,
  classifyArtifactTrainChange,
  compareVersions,
  compatibilityContractSource,
  generatedPublicArtifactTupleSources,
  normalizeVersion,
  parseRegistryNextLink,
  quickstartExecutionContractSource,
  resolvePackagistVersion,
  resolvePublishedArtifactTuple,
  resolvePublishedWorkflowAuthority,
  selectLatestCompleteArtifactTrain,
  selectLatestCompleteCliRelease,
  selectLatestCratesIoVersion,
  selectServerRegistryVersion,
  selectLatestVersion,
  sha256,
  versionRank,
  workflowAuthorityLockSource,
  workflowAuthorityManifestUrl,
  writePublicArtifactTupleSources,
};
