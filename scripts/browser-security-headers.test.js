const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {inspectHtml, inventoryTree, candidateRule, sourceHash} = require('./browser-security-headers');

function fixture(html = '<script>window.ready = true;</script>') {
  const policy = JSON.parse(fs.readFileSync(path.join(__dirname, '../security/browser-headers/rust-policy.json'), 'utf8'));
  const inventory = {
    origin: policy.origin, input_artifact: policy.input_artifact,
    source_preparation: policy.source_preparation || null,
    build_identity: policy.expected_build,
    pages: [{path: 'index.html', ...inspectHtml(html, policy.origin + '/')}],
  };
  return {policy, inventory};
}

test('hashes parsed inline code, normalizes HTML newlines and excludes inert data blocks', () => {
  const page = inspectHtml('<script> a\r\nb </script><script type="application/json">{"x":1}</script>' +
    '<script type="text/json">{"x":2}</script><script type="module">import "./app.js";</script>', 'https://rust.durable-workflow.com/');
  assert.deepEqual(page.script_hashes, [sourceHash(' a\nb '), sourceHash('import "./app.js";')].sort());
  assert.equal(page.script_hashes.length, 2);
});

test('does not authorize inline handlers through matching script-element hashes', () => {
  const {policy, inventory} = fixture('<a onclick="history.back();">Back</a>');
  inventory.pages[0].script_hashes.push(sourceHash('history.back();'));
  assert.throws(() => candidateRule(inventory, policy), /Inline event handlers require a source correction/);
});

test('refuses javascript URLs and unreviewed inline-style attributes', () => {
  let {policy, inventory} = fixture('<a href="javascript:alert(1)">Bad</a>');
  assert.throws(() => candidateRule(inventory, policy), /Unsafe URL scheme/);
  ({policy, inventory} = fixture('<div style="display:none">Hidden</div>'));
  assert.throws(() => candidateRule(inventory, policy), /Unreviewed inline styles/);
});

test('allows only reviewed URL schemes, including normalized control-character cases', () => {
  for (const url of ['javascript:alert(1)', 'vbscript:msgbox(1)', ' \tJaVaScRiPt:alert(1)', ' \r\nVbScRiPt:msgbox(1)', 'java&#x09;script:alert(1)']) {
    for (const [tag, attribute] of [['a', 'href'], ['script', 'src'], ['form', 'action'], ['img', 'src']]) {
      const {policy, inventory} = fixture(`<${tag} ${attribute}="${url}"></${tag}>`);
      assert.equal(inventory.pages[0].unsafe_urls.length, 1, `${tag} ${attribute}`);
      assert.throws(() => candidateRule(inventory, policy), /Unsafe URL scheme/);
    }
  }
  for (const url of ['vbscript:msgbox(1)', 'java&#x09;script:alert(1)', 'data:text/html,test', 'file:///tmp/test', 'unknown:payload', 'crate::Span(alert(1))']) {
    const {policy, inventory} = fixture(`<a href="${url}">Link</a>`);
    assert.throws(() => candidateRule(inventory, policy), /Unsafe URL scheme/);
  }
  const {policy, inventory} = fixture('<a href="mailto:help@example.com">Email</a><img src="data:image/png;base64,AA=="><a href="crate::Span">Unresolved Rust reference</a>');
  assert.doesNotThrow(() => candidateRule(inventory, policy));
});

test('does not authorize observed external origins or dangerous schemes automatically', () => {
  const {policy, inventory} = fixture('<script src="https://unreviewed.example/x.js"></script>');
  assert.throws(() => candidateRule(inventory, policy), /Unreviewed script origin/);
  policy.sources.script.push('https://unreviewed.example');
  assert.doesNotThrow(() => candidateRule(inventory, policy));
  for (const source of ['data:', 'blob:', 'https://*.example', 'https://example.com/\r\nX-Evil: yes']) {
    const other = structuredClone(policy);
    other.sources.script.push(source);
    assert.throws(() => candidateRule(inventory, other));
  }
});

test('emits only a disabled Rust rule with conservative HSTS and response-only frame policy', () => {
  const {policy, inventory} = fixture();
  const result = candidateRule(inventory, policy);
  assert.equal(result.rollout_approved, false);
  assert.equal(result.rule.enabled, false);
  assert.equal(result.phase, 'http_response_headers_transform');
  assert.equal(result.rule.expression, '(http.host eq "rust.durable-workflow.com" and http.request.scheme eq "https")');
  const headers = result.rule.action_parameters.headers;
  assert.equal(headers['strict-transport-security'].value, 'max-age=300');
  assert.match(headers['content-security-policy'].value, /frame-ancestors 'none'/);
  assert.ok(!headers['content-security-policy'].value.includes("'unsafe-inline'"));
  assert.ok(!headers['content-security-policy'].value.includes("'unsafe-eval'"));
  const expected = crypto.createHash('sha256').update(JSON.stringify(inventory, null, 2) + '\n').digest('hex');
  assert.equal(result.inventory_sha256, expected);
});

test('refuses a changed build, artifact provenance or staging hostname', () => {
  for (const change of [
    (value) => { value.inventory.build_identity = {...value.inventory.build_identity, version: '4.12.1'}; },
    (value) => { value.inventory.build_identity = {...value.inventory.build_identity, tooling_revision: 'unreviewed'}; },
    (value) => { value.inventory.input_artifact = {...value.inventory.input_artifact, artifact_id: 1}; },
    (value) => { value.policy.origin = value.inventory.origin = 'https://durable-workflow.com'; },
  ]) {
    const value = fixture(); change(value);
    assert.throws(() => candidateRule(value.inventory, value.policy));
  }
});

test('refuses a CSP that cannot fit the response-transform header limit', () => {
  const {policy, inventory} = fixture();
  inventory.pages[0].script_hashes = Array.from({length: 100}, (_, index) => sourceHash(`script${index}`));
  assert.throws(() => candidateRule(inventory, policy), /4 KB transform limit/);
});

test('committed disabled candidate is reproducible from its reviewed policy and inventory', () => {
  const directory = path.join(__dirname, '../security/browser-headers');
  const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  assert.deepEqual(candidateRule(read('rust-inventory.json'), read('rust-policy.json')), read('rust-rule.candidate.json'));
});

test('inventories every file deterministically and refuses symlink traversal', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-security-header-test-'));
  context.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'index.html'), '<script>ready()</script>');
  fs.writeFileSync(path.join(root, 'nested', 'page.html'), '<img src="/x.svg">');
  fs.writeFileSync(path.join(root, 'x.svg'), '<svg/>');
  const {policy} = fixture();
  const first = inventoryTree(root, policy);
  assert.deepEqual(first, inventoryTree(root, policy));
  assert.deepEqual(first.files.map((file) => file.path), ['index.html', 'nested/page.html', 'x.svg']);
  assert.equal(first.pages.length, 2);
  fs.symlinkSync(path.join(root, 'index.html'), path.join(root, 'link.html'));
  assert.throws(() => inventoryTree(root, policy), /Symlinks/);
});
