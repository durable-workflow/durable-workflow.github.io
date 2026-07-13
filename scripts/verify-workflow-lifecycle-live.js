#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const DEFAULT_URL =
  'https://durable-workflow.github.io/platform-conformance/workflow-lifecycle-scenarios.json';
const DEFAULT_ATTEMPTS = 30;
const DEFAULT_RETRY_DELAY_MS = 10000;
const REQUEST_TIMEOUT_MS = 15000;
const localPath = path.join(
  __dirname,
  '..',
  'static',
  'platform-conformance',
  'workflow-lifecycle-scenarios.json'
);

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
          'User-Agent': 'durable-workflow-lifecycle-authority-check',
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
      }
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

async function main() {
  const expected = fs.readFileSync(localPath);
  const expectedDigest = sha256(expected);
  const attempts = Number(process.env.WORKFLOW_LIFECYCLE_LIVE_ATTEMPTS || DEFAULT_ATTEMPTS);
  const retryDelay = Number(
    process.env.WORKFLOW_LIFECYCLE_LIVE_RETRY_DELAY_MS || DEFAULT_RETRY_DELAY_MS
  );
  const target = process.env.WORKFLOW_LIFECYCLE_LIVE_URL || DEFAULT_URL;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const url = new URL(target);
      url.searchParams.set('deploy_check', `${Date.now()}-${attempt}`);
      const live = await fetchBody(url);
      const liveDigest = sha256(live);

      if (liveDigest !== expectedDigest) {
        throw new Error(
          `${target} returned sha256:${liveDigest}; expected sha256:${expectedDigest}`
        );
      }

      JSON.parse(live.toString('utf8'));
      console.log(
        `Live workflow lifecycle authority is byte-equivalent at ${target} ` +
          `(sha256:${liveDigest}).`
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.warn(
          `Workflow lifecycle authority is not live yet (${attempt}/${attempts}): ${error.message}`
        );
        await wait(retryDelay);
      }
    }
  }

  throw lastError;
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
