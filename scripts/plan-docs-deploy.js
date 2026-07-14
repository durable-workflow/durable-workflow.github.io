#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const https = require('https');

const { ARTIFACT_DISTRIBUTION_SURFACES, ARTIFACT_VERSIONS } = require('./public-artifact-versions');

const DEFAULT_EVENT_NAME = 'push';
const DEFAULT_LIVE_BASE_URL = 'https://durable-workflow.com';
const DEFAULT_TIMEOUT_MS = 15000;
const QUICKSTART_CONTRACT_PATH = '/quickstart-execution-contract.json';
const RELEASE_AUDIT_PATH = '/docs-page-release-audit.json';

function liveBaseUrl() {
  return String(process.env.DOCS_DEPLOY_LIVE_BASE_URL || DEFAULT_LIVE_BASE_URL)
    .replace(/\/+$/, '');
}

function githubEventName() {
  return process.env.DOCS_DEPLOY_EVENT_NAME || process.env.GITHUB_EVENT_NAME || DEFAULT_EVENT_NAME;
}

function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function fetchJson(url, redirectsRemaining = 3) {
  const client = url.protocol === 'http:' ? http : https;

  return new Promise((resolve, reject) => {
    const request = client.get(
      url,
      {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'User-Agent': 'durable-workflow-docs-deploy-check',
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
          resolve(fetchJson(new URL(location, url), redirectsRemaining - 1));
          return;
        }

        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          body += chunk;
        });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error(`${url.href} returned HTTP ${response.statusCode}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`${url.href} did not return JSON: ${err.message}`));
          }
        });
      }
    );

    request.setTimeout(DEFAULT_TIMEOUT_MS, () => {
      request.destroy(new Error(`${url.href} timed out after ${DEFAULT_TIMEOUT_MS}ms`));
    });
    request.on('error', reject);
  });
}

function versionAtPath(source, path) {
  return path.reduce((current, key) => (
    current && Object.prototype.hasOwnProperty.call(current, key)
      ? current[key]
      : undefined
  ), source);
}

function artifactEntries(versions = ARTIFACT_VERSIONS) {
  return Object.entries(versions).sort(([left], [right]) => left.localeCompare(right));
}

function compareLivePublicArtifacts(expected, audit, quickstart) {
  const drift = [];

  for (const [name, version] of artifactEntries(expected)) {
    const auditVersion = versionAtPath(audit, ['artifact_versions', name]);
    const quickstartVersion = versionAtPath(quickstart, ['artifacts', name, 'version']);

    if (auditVersion !== version) {
      drift.push(`${RELEASE_AUDIT_PATH} artifact_versions.${name}: expected ${version}, got ${auditVersion || '<missing>'}`);
    }

    if (quickstartVersion !== version) {
      drift.push(`${QUICKSTART_CONTRACT_PATH} artifacts.${name}.version: expected ${version}, got ${quickstartVersion || '<missing>'}`);
    }
  }

  const expectedPhpSurfaces = ARTIFACT_DISTRIBUTION_SURFACES['sdk-php'] || [];
  const livePhpSurfaces = versionAtPath(audit, ['artifact_distribution_surfaces', 'sdk-php']);

  if (!Array.isArray(livePhpSurfaces)) {
    drift.push(`${RELEASE_AUDIT_PATH} artifact_distribution_surfaces.sdk-php: expected PHP SDK surfaces, got <missing>`);
  } else {
    for (const expectedSurface of expectedPhpSurfaces) {
      const liveSurface = livePhpSurfaces.find(surface => (
        surface && surface.surface === expectedSurface.surface
      ));

      if (!liveSurface) {
        drift.push(`${RELEASE_AUDIT_PATH} PHP SDK surface ${expectedSurface.surface}: missing`);
        continue;
      }

      for (const [field, expectedValue] of Object.entries(expectedSurface)) {
        if (liveSurface[field] !== expectedValue) {
          drift.push(
            `${RELEASE_AUDIT_PATH} PHP SDK surface ${expectedSurface.surface}.${field}: ` +
            `expected ${expectedValue}, got ${liveSurface[field] || '<missing>'}`
          );
        }
      }
    }
  }

  const expectedServerSurfaces = ARTIFACT_DISTRIBUTION_SURFACES.server || [];
  const liveServerSurfaces = versionAtPath(audit, ['artifact_distribution_surfaces', 'server']);

  if (!Array.isArray(liveServerSurfaces)) {
    drift.push(`${RELEASE_AUDIT_PATH} artifact_distribution_surfaces.server: expected server surfaces, got <missing>`);
  } else {
    for (const expectedSurface of expectedServerSurfaces) {
      const liveSurface = liveServerSurfaces.find(surface => (
        surface &&
        surface.surface === expectedSurface.surface &&
        surface.registry === expectedSurface.registry &&
        surface.image === expectedSurface.image
      ));

      if (!liveSurface) {
        drift.push(`${RELEASE_AUDIT_PATH} server surface ${expectedSurface.surface}: missing`);
        continue;
      }

      for (const field of ['tag', 'reference']) {
        if (liveSurface[field] !== expectedSurface[field]) {
          drift.push(
            `${RELEASE_AUDIT_PATH} server surface ${expectedSurface.surface}.${field}: ` +
            `expected ${expectedSurface[field]}, got ${liveSurface[field] || '<missing>'}`
          );
        }
      }
    }
  }

  const expectedRustSurfaces = ARTIFACT_DISTRIBUTION_SURFACES['sdk-rust'] || [];
  const liveRustSurfaces = versionAtPath(audit, ['artifact_distribution_surfaces', 'sdk-rust']);

  if (!Array.isArray(liveRustSurfaces)) {
    drift.push(`${RELEASE_AUDIT_PATH} artifact_distribution_surfaces.sdk-rust: expected Rust SDK surfaces, got <missing>`);
  } else {
    for (const expectedSurface of expectedRustSurfaces) {
      const liveSurface = liveRustSurfaces.find(surface => (
        surface && surface.surface === expectedSurface.surface
      ));

      if (!liveSurface) {
        drift.push(`${RELEASE_AUDIT_PATH} Rust SDK surface ${expectedSurface.surface}: missing`);
        continue;
      }

      for (const [field, expectedValue] of Object.entries(expectedSurface)) {
        if (liveSurface[field] !== expectedValue) {
          drift.push(
            `${RELEASE_AUDIT_PATH} Rust SDK surface ${expectedSurface.surface}.${field}: ` +
            `expected ${expectedValue}, got ${liveSurface[field] || '<missing>'}`
          );
        }
      }
    }
  }

  return drift;
}

function cacheBustedUrl(baseUrl, path) {
  const url = new URL(path, `${baseUrl}/`);
  url.searchParams.set('deploy_check', String(Date.now()));
  return url;
}

async function readLivePublicArtifacts(options = {}) {
  const baseUrl = options.baseUrl || liveBaseUrl();
  const fetcher = options.fetcher || fetchJson;

  const [audit, quickstart] = await Promise.all([
    fetcher(cacheBustedUrl(baseUrl, RELEASE_AUDIT_PATH)),
    fetcher(cacheBustedUrl(baseUrl, QUICKSTART_CONTRACT_PATH)),
  ]);

  return { audit, quickstart };
}

async function planDeployment(options = {}) {
  const eventName = options.eventName || githubEventName();
  const expected = options.expected || ARTIFACT_VERSIONS;

  if (eventName !== 'schedule') {
    return {
      deploy: true,
      reason: `event:${eventName}`,
      drift: [],
    };
  }

  try {
    const { audit, quickstart } = await readLivePublicArtifacts(options);
    const drift = compareLivePublicArtifacts(expected, audit, quickstart);

    return {
      deploy: drift.length > 0,
      reason: drift.length > 0 ? 'scheduled-drift' : 'scheduled-current',
      drift,
    };
  } catch (err) {
    return {
      deploy: true,
      reason: 'scheduled-live-check-error',
      drift: [err.message],
    };
  }
}

async function main() {
  const plan = await planDeployment();

  writeOutput('deploy', plan.deploy ? 'true' : 'false');
  writeOutput('reason', plan.reason);

  if (plan.deploy) {
    console.log(`Docs deploy required: ${plan.reason}`);
  } else {
    console.log(`Docs deploy skipped: ${plan.reason}`);
  }

  for (const item of plan.drift) {
    console.log(`- ${item}`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}

module.exports = {
  QUICKSTART_CONTRACT_PATH,
  RELEASE_AUDIT_PATH,
  compareLivePublicArtifacts,
  planDeployment,
};
