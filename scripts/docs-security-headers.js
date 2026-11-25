#!/usr/bin/env node
// Response security headers for the five public documentation hostnames
// (organization issue 268). GitHub Pages cannot set response headers, so the
// headers come from one Cloudflare response-header ruleset for the zone,
// security/browser-headers/zone-rules.json. This script never calls a
// provider API. It validates that ruleset, checks the live responses against
// it, and inventories a built site so its Report-Only policy can be updated.
//
//   node scripts/docs-security-headers.js validate
//   node scripts/docs-security-headers.js check-live [--json]
//   node scripts/docs-security-headers.js inventory --root DIR --origin https://HOST
const fs = require('node:fs');
const path = require('node:path');

const RULES_PATH = path.join(__dirname, '../security/browser-headers/zone-rules.json');
const HOSTS = [
  'durable-workflow.com',
  'www.durable-workflow.com',
  'python.durable-workflow.com',
  'rust.durable-workflow.com',
  'php.durable-workflow.com',
];
const COMMON_HEADERS = [
  'strict-transport-security',
  'content-security-policy',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'x-frame-options',
];
// Cloudflare limits a set header value to 4 KB.
const HEADER_LIMIT = 4096;

function hostsIn(expression) {
  const set = expression.match(/http\.host in \{([^}]*)\}/);
  if (set) return [...set[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const single = expression.match(/http\.host eq "([^"]+)"/);
  return single ? [single[1]] : [];
}

function directives(policy) {
  return new Map(policy.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const [name, ...values] = part.split(/\s+/);
    return [name.toLowerCase(), values];
  }));
}

// The headers the ruleset sets on one hostname, in rule order (a later
// rule's set replaces an earlier one, as in the provider).
function expectedHeaders(rules, host) {
  const headers = {};
  for (const rule of rules.rules) {
    if (rule.enabled !== true || !hostsIn(rule.expression).includes(host)) continue;
    for (const [name, header] of Object.entries(rule.action_parameters.headers)) {
      headers[name.toLowerCase()] = header.value;
    }
  }
  return headers;
}

function validateRules(rules) {
  const problems = [];
  const problem = (message) => problems.push(message);
  if (!Array.isArray(rules.rules) || rules.rules.length === 0) return ['the ruleset has no rules'];
  for (const rule of rules.rules) {
    if (rule.action !== 'rewrite') problem(`${rule.ref}: action must be rewrite`);
    if (!/^\(http\.request\.scheme eq "https" and http\.host (in \{[^}]+\}|eq "[^"]+")\)$/.test(rule.expression || '')) {
      problem(`${rule.ref}: expression must match HTTPS requests to named hosts only`);
    }
    for (const host of hostsIn(rule.expression || '')) {
      if (!HOSTS.includes(host)) problem(`${rule.ref}: ${host} is not a documentation hostname`);
    }
    for (const [name, header] of Object.entries(rule.action_parameters?.headers || {})) {
      if (header.operation !== 'set') problem(`${rule.ref}: ${name} must use the set operation`);
      if (typeof header.value !== 'string' || /[\r\n]/.test(header.value)) problem(`${rule.ref}: ${name} has an invalid value`);
      else if (Buffer.byteLength(header.value) > HEADER_LIMIT) problem(`${rule.ref}: ${name} exceeds ${HEADER_LIMIT} bytes`);
    }
  }
  for (const host of HOSTS) {
    const headers = expectedHeaders(rules, host);
    for (const name of [...COMMON_HEADERS, 'content-security-policy-report-only']) {
      if (!headers[name]) problem(`${host}: ${name} is not set`);
    }
    const hsts = headers['strict-transport-security'] || '';
    if (!/^max-age=\d+$/.test(hsts)) problem(`${host}: HSTS must be max-age only, without includeSubDomains or preload`);
    if (headers['x-content-type-options'] !== 'nosniff') problem(`${host}: X-Content-Type-Options must be nosniff`);
    if (headers['x-frame-options'] !== 'DENY') problem(`${host}: X-Frame-Options must be DENY`);
    if (headers['content-security-policy'] !== "frame-ancestors 'none'") {
      problem(`${host}: the enforced CSP must be frame-ancestors 'none' until the resource policy is enforced`);
    }
    if (headers['referrer-policy'] !== 'strict-origin-when-cross-origin') problem(`${host}: unexpected Referrer-Policy`);
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) {
      if (!(headers['permissions-policy'] || '').split(',').map((value) => value.trim()).includes(`${feature}=()`)) {
        problem(`${host}: Permissions-Policy must disable ${feature}`);
      }
    }
    const report = directives(headers['content-security-policy-report-only'] || '');
    for (const [name, value] of [['default-src', "'self'"], ['object-src', "'none'"], ['base-uri', "'self'"], ['frame-ancestors', "'none'"]]) {
      if ((report.get(name) || []).join(' ') !== value) problem(`${host}: Report-Only ${name} must be ${value}`);
    }
    for (const [name, values] of report) {
      if (values.includes("'unsafe-eval'")) problem(`${host}: Report-Only ${name} allows eval`);
      if (values.some((value) => value === '*' || value === 'https:' || value === 'http:')) {
        problem(`${host}: Report-Only ${name} allows any origin`);
      }
    }
  }
  return problems;
}

function compareLive(rules, host, actual) {
  const expected = expectedHeaders(rules, host);
  return Object.entries(expected).map(([name, value]) => ({
    name, expected: value, actual: actual[name] ?? null, matches: actual[name] === value,
  }));
}

async function fetchHeaders(host) {
  const response = await fetch(`https://${host}/`, {method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(20000)});
  const headers = Object.fromEntries([...response.headers].map(([name, value]) => [name.toLowerCase(), value]));
  return {status: response.status, location: headers.location || null, server: headers.server || null, headers};
}

async function checkLive(rules, fetcher = fetchHeaders) {
  const results = [];
  for (const host of HOSTS) {
    const response = await fetcher(host);
    results.push({host, status: response.status, location: response.location, server: response.server,
      headers: compareLive(rules, host, response.headers)});
  }
  return results;
}

function inventory(root, origin) {
  const {inspectHtml} = require('./browser-security-headers');
  const totals = {pages: 0, style_attributes: 0, handlers: 0, style_hashes: 0, script_hashes: new Map(), resources: {}};
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && entry.name.endsWith('.html')) {
        const relative = path.relative(root, file).split(path.sep).join('/');
        const page = inspectHtml(fs.readFileSync(file, 'utf8'), new URL(relative, `${origin}/`).href);
        totals.pages += 1;
        totals.style_attributes += page.style_attributes;
        totals.handlers += page.handlers.length;
        totals.style_hashes += page.style_hashes.length;
        for (const hash of page.script_hashes) totals.script_hashes.set(hash, (totals.script_hashes.get(hash) || 0) + 1);
        for (const [kind, origins] of Object.entries(page.resource_origins)) {
          totals.resources[kind] = [...new Set([...(totals.resources[kind] || []), ...origins])].sort();
        }
      }
    }
  };
  walk(root);
  return {...totals, script_hashes: Object.fromEntries([...totals.script_hashes].sort((a, b) => b[1] - a[1]))};
}

async function main(argv) {
  const loadRules = () => JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  const [command, ...rest] = argv;
  if (command === 'validate') {
    const problems = validateRules(loadRules());
    for (const message of problems) console.error(message);
    if (problems.length) return 1;
    console.log(`zone-rules.json sets the expected headers on all ${HOSTS.length} hostnames.`);
    return 0;
  }
  if (command === 'check-live') {
    const results = await checkLive(loadRules());
    if (rest.includes('--json')) console.log(JSON.stringify({checked_at: new Date().toISOString(), results}, null, 2));
    else {
      for (const result of results) {
        console.log(`${result.host}: HTTP ${result.status}${result.location ? ` -> ${result.location}` : ''} (server: ${result.server})`);
        for (const header of result.headers) console.log(`  ${header.matches ? 'ok     ' : 'MISSING'} ${header.name}${header.matches ? '' : `: ${header.actual ?? 'absent'}`}`);
      }
    }
    return results.every((result) => result.headers.every((header) => header.matches)) ? 0 : 1;
  }
  if (command === 'inventory') {
    const option = (name) => rest[rest.indexOf(name) + 1];
    if (!rest.includes('--root') || !rest.includes('--origin')) throw new Error('inventory needs --root DIR --origin https://HOST');
    console.log(JSON.stringify(inventory(option('--root'), option('--origin')), null, 2));
    return 0;
  }
  console.error('usage: docs-security-headers.js validate | check-live [--json] | inventory --root DIR --origin https://HOST');
  return 2;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {HOSTS, RULES_PATH, expectedHeaders, validateRules, compareLive, checkLive, inventory, hostsIn};
