#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const {
  PUBLISHED_ARTIFACT_VERSIONS,
} = require('./public-artifact-versions');
const {
  buildArtifactCompatibilityProjection,
  buildComponentReleaseQualificationProjection,
} = require('./generate-docs-page-release-audit');
const {
  REQUIRED_LIVE_ARTIFACT_PATHS,
  REQUIRED_LIVE_ARTIFACTS,
  buildArtifactPath,
} = require('./docs-release-live-artifacts');

const DEFAULT_BASE_URL = 'https://durable-workflow.com';
const DEFAULT_ATTEMPTS = 30;
const DEFAULT_RETRY_DELAY_MS = 10000;
const REQUEST_TIMEOUT_MS = 15000;
const LIVE_ARTIFACTS = REQUIRED_LIVE_ARTIFACT_PATHS;
const QUICKSTART_ROUTE = '/docs/2.0/quickstart/';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fetchBody(url, redirectsRemaining = 5) {
  const client = url.protocol === 'http:' ? http : https;

  return new Promise((resolve, reject) => {
    const request = client.get(
      url,
      {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'User-Agent': 'durable-workflow-docs-release-audit-check',
        },
      },
      response => {
        const location = response.headers.location;

        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          location &&
          redirectsRemaining > 0
        ) {
          response.resume();
          resolve(fetchBody(new URL(location, url), redirectsRemaining - 1));
          return;
        }

        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error(`${url.href} returned HTTP ${response.statusCode}`));
            return;
          }
          resolve(Buffer.concat(chunks));
        });
      },
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`${url.href} timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });
    request.on('error', reject);
  });
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function assertReleaseAuditAuthority(source) {
  const audit = JSON.parse(source);

  if (
    JSON.stringify(audit.artifact_versions)
    !== JSON.stringify(PUBLISHED_ARTIFACT_VERSIONS)
  ) {
    throw new Error(
      'live release audit artifacts do not match the current published-component authority',
    );
  }
  if (audit.release_status_guardrail?.stable_default_docs_version !== '1.x') {
    throw new Error('live release audit changed the stable default docs line');
  }
  if (audit.release_status_guardrail?.explicit_prerelease_docs_version !== '2.0') {
    throw new Error('live release audit does not identify 2.0 as explicit prerelease docs');
  }
  if (
    JSON.stringify(audit.artifact_compatibility_evidence)
    !== JSON.stringify(buildArtifactCompatibilityProjection())
  ) {
    throw new Error(
      'live release audit does not bind the exact passing SDK-to-Server qualification',
    );
  }
  if (
    JSON.stringify(audit.component_release_qualifications)
    !== JSON.stringify(buildComponentReleaseQualificationProjection())
  ) {
    throw new Error(
      'live release audit does not bind the tracked component release qualifications',
    );
  }
}

function htmlHrefs(html) {
  return new Set(
    [...String(html).matchAll(/<a\b[^>]*\shref="([^"]+)"/gi)]
      .map(match => match[1].replaceAll('&amp;', '&')),
  );
}

function qualifiedPackageUrls(contract) {
  return Object.entries(contract.artifacts || {}).map(([artifact, identity]) => {
    if (typeof identity?.package_url !== 'string' || !/^https:\/\//.test(identity.package_url)) {
      throw new Error(`quickstart contract artifacts.${artifact}.package_url is missing`);
    }

    return [artifact, identity.package_url];
  });
}

function cratesIoExactVersionUrl(identity) {
  const crateName = identity?.crate;
  const version = identity?.version;

  if (typeof crateName !== 'string' || crateName.length === 0) {
    throw new Error('quickstart contract artifacts.sdk-rust.crate is missing');
  }
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('quickstart contract artifacts.sdk-rust.version is missing');
  }

  return new URL(
    `https://crates.io/api/v1/crates/${encodeURIComponent(crateName)}/` +
      encodeURIComponent(version),
  );
}

function assertCratesIoExactVersion(source, identity) {
  let response;

  try {
    response = JSON.parse(Buffer.isBuffer(source) ? source.toString('utf8') : String(source));
  } catch (error) {
    throw new Error(`crates.io returned invalid JSON: ${error.message}`);
  }

  const crateName = identity.crate;
  const version = identity.version;
  const release = response?.version;

  if (release?.crate !== crateName || release?.num !== version) {
    throw new Error(`crates.io did not return exact ${crateName}@${version}`);
  }
  if (release.yanked !== false) {
    throw new Error(`crates.io reports ${crateName}@${version} as yanked`);
  }
}

async function verifyQualifiedPackagePublication(artifact, identity, options = {}) {
  if (artifact === 'sdk-rust') {
    const registryUrl = cratesIoExactVersionUrl(identity);
    const registryFetcher = options.registryFetcher || fetchBody;

    try {
      const source = await registryFetcher(registryUrl);
      assertCratesIoExactVersion(source, identity);
      return;
    } catch (error) {
      throw new Error(
        `qualified ${artifact} registry release ${identity.crate}@${identity.version} ` +
          `is unavailable: ${error.message}`,
      );
    }
  }

  const packageFetcher = options.packageFetcher || fetchBody;
  try {
    await packageFetcher(new URL(identity.package_url));
  } catch (error) {
    throw new Error(
      `qualified ${artifact} package link ${identity.package_url} is unavailable: ${error.message}`,
    );
  }
}

async function verifyQualifiedPackageLinkReachability(artifact, identity, options = {}) {
  const packageFetcher = options.packageFetcher || fetchBody;

  try {
    await packageFetcher(new URL(identity.package_url));
  } catch (error) {
    throw new Error(
      `qualified ${artifact} reader link ${identity.package_url} is unavailable: ${error.message}`,
    );
  }
}

function assertLiveQuickstartPage(html, contract) {
  const hrefs = htmlHrefs(html);
  const qualificationDate = contract.qualified_tuple?.qualified_on;

  if (typeof qualificationDate !== 'string' || !String(html).includes(qualificationDate)) {
    throw new Error('live 2.0 quickstart does not expose its qualified tuple date');
  }

  for (const [artifact, identity] of Object.entries(contract.artifacts || {})) {
    if (!String(html).includes(identity.version)) {
      throw new Error(`live 2.0 quickstart does not expose qualified ${artifact} ${identity.version}`);
    }
    if (!hrefs.has(identity.package_url)) {
      throw new Error(
        `live 2.0 quickstart does not link qualified ${artifact} package ${identity.package_url}`,
      );
    }
  }
}

async function verifyLiveQuickstart(baseUrl, contract, options = {}) {
  const fetcher = options.fetcher || fetchBody;
  const packageFetcher = options.packageFetcher || fetchBody;
  const registryFetcher = options.registryFetcher || fetchBody;
  const quickstartUrl = new URL(QUICKSTART_ROUTE, `${baseUrl}/`);
  quickstartUrl.searchParams.set('deploy_check', String(options.cacheKey || Date.now()));
  const html = (await fetcher(quickstartUrl)).toString('utf8');
  assertLiveQuickstartPage(html, contract);

  const publicationAssertions = Object.entries(contract.artifacts || {}).map(
    ([artifact, identity]) => verifyQualifiedPackagePublication(artifact, identity, {
      packageFetcher,
      registryFetcher,
    }),
  );
  const rustIdentity = contract.artifacts?.['sdk-rust'];

  if (rustIdentity) {
    publicationAssertions.push(
      verifyQualifiedPackageLinkReachability('sdk-rust', rustIdentity, {packageFetcher}),
    );
  }

  await Promise.all(publicationAssertions);
}

async function verifyLiveArtifacts(options = {}) {
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const attempts = Number(options.attempts || DEFAULT_ATTEMPTS);
  const retryDelay = Number(options.retryDelay || DEFAULT_RETRY_DELAY_MS);
  const fetcher = options.fetcher || fetchBody;
  const packageFetcher = options.packageFetcher || (options.fetcher ? null : fetchBody);
  const registryFetcher = options.registryFetcher || (options.fetcher ? null : fetchBody);
  const repoRoot = path.join(__dirname, '..');
  const expected = Object.fromEntries(REQUIRED_LIVE_ARTIFACTS.map(artifact => [
    artifact.route,
    fs.readFileSync(buildArtifactPath(repoRoot, artifact)),
  ]));
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const live = Object.fromEntries(await Promise.all(LIVE_ARTIFACTS.map(async route => {
        const url = new URL(route, `${baseUrl}/`);
        url.searchParams.set('deploy_check', `${Date.now()}-${attempt}`);
        return [route, await fetcher(url)];
      })));

      for (const route of LIVE_ARTIFACTS) {
        const liveDigest = sha256(live[route]);
        const expectedDigest = sha256(expected[route]);

        if (liveDigest !== expectedDigest) {
          throw new Error(
            `${route} returned sha256:${liveDigest}; expected sha256:${expectedDigest}`,
          );
        }

        JSON.parse(live[route].toString('utf8'));
      }

      assertReleaseAuditAuthority(live['/docs-page-release-audit.json'].toString('utf8'));
      const liveQuickstartContract = JSON.parse(
        live['/quickstart-execution-contract.json'].toString('utf8'),
      );
      const rustIdentity = liveQuickstartContract.artifacts?.['sdk-rust'];
      await verifyLiveQuickstart(baseUrl, liveQuickstartContract, {
        cacheKey: `${Date.now()}-${attempt}`,
        fetcher,
        packageFetcher: packageFetcher || (async () => Buffer.from('fixture package link')),
        registryFetcher: registryFetcher || (async () => Buffer.from(JSON.stringify({
          version: {
            crate: rustIdentity?.crate,
            num: rustIdentity?.version,
            yanked: false,
          },
        }))),
      });
      console.log(
        `Live docs release artifacts and qualified quickstart package links match ` +
          `the deployed build at ${baseUrl}: ${LIVE_ARTIFACTS.join(', ')}, ${QUICKSTART_ROUTE}`,
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.warn(
          `Docs release artifacts are not live yet (${attempt}/${attempts}): ${error.message}`,
        );
        await wait(retryDelay);
      }
    }
  }

  throw lastError;
}

if (require.main === module) {
  verifyLiveArtifacts().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  LIVE_ARTIFACTS,
  QUICKSTART_ROUTE,
  assertCratesIoExactVersion,
  assertLiveQuickstartPage,
  assertReleaseAuditAuthority,
  cratesIoExactVersionUrl,
  qualifiedPackageUrls,
  verifyQualifiedPackageLinkReachability,
  verifyQualifiedPackagePublication,
  verifyLiveQuickstart,
  verifyLiveArtifacts,
};
