const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = require('../docusaurus.config');
const buildDirectory = path.resolve(process.argv[2] || 'build');
const analytics = config.customFields?.analytics;
const cloudflareScript = config.scripts.find(
  script => script.src === '/analytics/cloudflare-web-analytics.js',
);
const runtimePath = path.resolve('static/analytics/cloudflare-web-analytics.js');
const runtime = fs.readFileSync(runtimePath, 'utf8');

assert.equal(analytics?.provider, 'cloudflare-web-analytics');
assert.equal(analytics?.beaconUrl, 'https://static.cloudflareinsights.com/beacon.min.js');
assert.equal(analytics?.productionHostname, 'durable-workflow.com');
assert.equal(analytics?.cookieFree, true);
assert.equal(config.presets[0][1].docs.lastVersion, '1.x');
assert.ok(cloudflareScript, 'Docusaurus must render the canonical Cloudflare beacon');
assert.equal(cloudflareScript.type, 'module');
assert.equal(cloudflareScript.defer, undefined);
assert.equal((config.stylesheets || []).some(value => value.includes('analytics')), false);
assert.match(runtime, /https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js/);
assert.match(runtime, /document\.querySelector\(BEACON_SELECTOR\)/);
assert.match(runtime, /loader\.type = 'module'/);
assert.match(runtime, /loader\.dataset\.cfBeacon = JSON\.stringify\(\{token: TOKEN\}\)/);
assert.doesNotMatch(runtime, /\bspa\s*:/);
assert.match(runtime, /'cloud\.durable-workflow\.com': new Set\(\['\/', '\/early-access', '\/early-access\/'\]\)/);
assert.match(runtime, /'status\.durable-workflow\.com': new Set\(\['\/'\]\)/);
assert.doesNotMatch(runtime, /localStorage|sessionStorage|document\.cookie|fingerprint|advertis|user[_-]?id/i);
assert.equal(
  fs.readFileSync(path.join(buildDirectory, 'analytics/cloudflare-web-analytics.js'), 'utf8'),
  runtime,
);

const htmlFiles = [];
const visit = directory => {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(entryPath);
    } else if (entry.name.endsWith('.html')) {
      htmlFiles.push(entryPath);
    }
  }
};

visit(buildDirectory);
assert.ok(htmlFiles.length > 0, 'Docusaurus did not render HTML pages');

const forbidden = /(?:googletagmanager\.com|google-analytics\.com|G-HD1YHT442Y|durable-workflow\.analytics-consent|durable-workflow-analytics-(?:consent|preferences)|_ga(?:\b|_))/;
for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  assert.doesNotMatch(html, forbidden, `${htmlFile} contains retired Google analytics or consent state`);

  if (/<meta[^>]+http-equiv="refresh"/i.test(html)) {
    assert.doesNotMatch(
      html,
      /analytics\/cloudflare-web-analytics\.js/,
      `${htmlFile} redirect must not create a duplicate page view`,
    );
    continue;
  }

  assert.equal(
    (html.match(/src="\/analytics\/cloudflare-web-analytics\.js"/g) || []).length,
    1,
    `${htmlFile} must load one cookie-free analytics runtime`,
  );
  assert.match(
    html,
    /<script(?=[^>]*\bsrc="\/analytics\/cloudflare-web-analytics\.js")(?=[^>]*\btype="module")[^>]*>/,
    `${htmlFile} must use module semantics for the analytics runtime`,
  );
}

console.log(`Validated cookie-free Cloudflare Web Analytics in ${htmlFiles.length} rendered pages.`);
