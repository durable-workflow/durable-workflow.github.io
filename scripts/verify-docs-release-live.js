#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const {ARTIFACT_VERSIONS} = require('./public-artifact-versions');

const DEFAULT_BASE_URL = 'https://durable-workflow.com';
const DEFAULT_ATTEMPTS = 30;
const DEFAULT_RETRY_DELAY_MS = 10000;
const REQUEST_TIMEOUT_MS = 15000;
const LIVE_ARTIFACTS = Object.freeze([
  '/docs-page-release-audit.json',
  '/docs-narrative-audit.json',
  '/quickstart-execution-contract.json',
  '/compatibility-contract.json',
]);

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

  if (JSON.stringify(audit.artifact_versions) !== JSON.stringify(ARTIFACT_VERSIONS)) {
    throw new Error('live release audit artifact tuple does not match the public authority');
  }
  if (audit.release_status_guardrail?.stable_default_docs_version !== '1.x') {
    throw new Error('live release audit changed the stable default docs line');
  }
  if (audit.release_status_guardrail?.explicit_prerelease_docs_version !== '2.0') {
    throw new Error('live release audit does not identify 2.0 as explicit prerelease docs');
  }
}

async function verifyLiveArtifacts(options = {}) {
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const attempts = Number(options.attempts || DEFAULT_ATTEMPTS);
  const retryDelay = Number(options.retryDelay || DEFAULT_RETRY_DELAY_MS);
  const fetcher = options.fetcher || fetchBody;
  const expected = Object.fromEntries(LIVE_ARTIFACTS.map(route => [
    route,
    fs.readFileSync(path.join(__dirname, '..', 'build', route.slice(1))),
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
      console.log(
        `Live docs release artifacts match the deployed build at ${baseUrl}: ` +
          LIVE_ARTIFACTS.join(', '),
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
  assertReleaseAuditAuthority,
  verifyLiveArtifacts,
};
