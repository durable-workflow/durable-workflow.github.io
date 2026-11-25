const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const {HOSTS, RULES_PATH, expectedHeaders, validateRules, checkLive, hostsIn} = require('./docs-security-headers');

const rules = () => JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
const header = (ruleset, ref, name) => ruleset.rules.find((rule) => rule.ref === ref).action_parameters.headers[name];

test('the committed ruleset sets every required header on all five hostnames', () => {
  assert.deepEqual(validateRules(rules()), []);
  for (const host of HOSTS) {
    const headers = expectedHeaders(rules(), host);
    assert.equal(headers['strict-transport-security'], 'max-age=300');
    assert.equal(headers['content-security-policy'], "frame-ancestors 'none'");
    assert.match(headers['content-security-policy-report-only'], /frame-ancestors 'none'/);
  }
});

test('each hostname gets exactly one Report-Only resource policy', () => {
  for (const host of HOSTS) {
    const matching = rules().rules.filter((rule) => hostsIn(rule.expression).includes(host)
      && rule.action_parameters.headers['content-security-policy-report-only']);
    assert.equal(matching.length, 1, host);
  }
});

test('refuses HSTS beyond max-age, a broad enforced CSP and unscoped expressions', () => {
  const cases = [
    [(r) => { header(r, 'docs-security-headers-v1', 'strict-transport-security').value = 'max-age=300; includeSubDomains'; }, /HSTS must be max-age only/],
    [(r) => { header(r, 'docs-security-headers-v1', 'strict-transport-security').value = 'max-age=300; preload'; }, /HSTS must be max-age only/],
    [(r) => { header(r, 'docs-security-headers-v1', 'content-security-policy').value = "default-src 'self'; frame-ancestors 'none'"; }, /enforced CSP must be frame-ancestors 'none'/],
    [(r) => { r.rules[0].expression = '(http.host eq "durable-workflow.com")'; }, /HTTPS requests to named hosts only/],
    [(r) => { r.rules[0].expression = r.rules[0].expression.replace('(ssl and ', '(http.request.scheme eq "https" and '); }, /HTTPS requests to named hosts only/],
    [(r) => { r.rules[0].expression = r.rules[0].expression.replace('(ssl and ', '(not ssl and '); }, /HTTPS requests to named hosts only/],
    [(r) => { r.rules[0].expression = r.rules[0].expression.replace('"php.durable-workflow.com"', '"example.com"'); }, /example.com is not a documentation hostname/],
    [(r) => { r.rules[0].enabled = false; }, /x-content-type-options is not set/],
    [(r) => { header(r, 'docs-security-headers-v1', 'x-frame-options').operation = 'add'; }, /must use the set operation/],
    [(r) => { header(r, 'docs-security-headers-v1', 'permissions-policy').value = 'camera=()'; }, /must disable microphone/],
    [(r) => { header(r, 'docs-security-headers-v1', 'referrer-policy').value = 'unsafe-url'; }, /unexpected Referrer-Policy/],
  ];
  for (const [mutate, message] of cases) {
    const ruleset = rules();
    mutate(ruleset);
    assert.match(validateRules(ruleset).join('\n'), message);
  }
});

test('refuses Report-Only policies that allow eval, any origin, objects or framing', () => {
  const ref = 'docs-csp-report-only-rust-v1';
  const name = 'content-security-policy-report-only';
  const cases = [
    [(value) => value.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"), /allows eval/],
    [(value) => value.replace("img-src 'self'", "img-src 'self' https:"), /allows any origin/],
    [(value) => value.replace("connect-src 'self'", "connect-src *"), /allows any origin/],
    [(value) => value.replace("object-src 'none'", "object-src 'self'"), /object-src must be 'none'/],
    [(value) => value.replace("frame-ancestors 'none'", "frame-ancestors 'self'"), /frame-ancestors must be 'none'/],
    [(value) => `${value}; img-src ${'https://a.example '.repeat(300)}`, /exceeds 4096 bytes/],
    [(value) => `${value}\r\nx-injected: yes`, /invalid value/],
  ];
  for (const [mutate, message] of cases) {
    const ruleset = rules();
    const target = header(ruleset, ref, name);
    target.value = mutate(target.value);
    assert.match(validateRules(ruleset).join('\n'), message);
  }
});

test('live check passes only when every hostname returns the ruleset headers', async () => {
  const ruleset = rules();
  const serving = (drop) => async (host) => {
    const headers = {...expectedHeaders(ruleset, host), server: 'cloudflare'};
    if (host === drop) delete headers['x-frame-options'];
    return {status: host.startsWith('www.') ? 301 : 200, location: null, server: 'cloudflare', headers};
  };
  let results = await checkLive(ruleset, serving(null));
  assert.equal(results.length, 5);
  assert.ok(results.every((result) => result.headers.every((entry) => entry.matches)));
  results = await checkLive(ruleset, serving('php.durable-workflow.com'));
  const php = results.find((result) => result.host === 'php.durable-workflow.com');
  assert.deepEqual(php.headers.filter((entry) => !entry.matches).map((entry) => entry.name), ['x-frame-options']);
  results = await checkLive(ruleset, async () => ({status: 200, location: null, server: 'GitHub.com', headers: {}}));
  assert.ok(results.every((result) => result.headers.every((entry) => !entry.matches && entry.actual === null)));
});
