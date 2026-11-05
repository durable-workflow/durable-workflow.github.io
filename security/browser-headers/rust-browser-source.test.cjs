const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {ORIGIN, BEACON, RUM, PROMOTION, digest, loadInputs, localResponse, installLocalRoutes} = require('./rust-browser-inputs.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rust-browser-source-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const build = {version: 'fixture'};
  const files = {'__build.json': JSON.stringify(build), 'index.html': '<h1>Fixture</h1>'};
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(root, name), value);
  const inventory = {origin: ORIGIN, input_artifact: {artifact_id: 'fixture'}, source_preparation: null, build_identity: build, files: Object.entries(files).map(([name, content]) => ({path: name, bytes: Buffer.byteLength(content), sha256: digest(content)}))};
  const packet = {rule: {enabled: false, action_parameters: {headers: {'content-security-policy': {value: "default-src 'none'"}}}}, rollout_approved: false, compatibility_accepted: false, source_preparation: null, input_artifact: inventory.input_artifact, inventory_sha256: digest(JSON.stringify(inventory, null, 2) + '\n')};
  return {root, inventory, packet};
}

function request(url, options = {}) {
  return {url, method: 'GET', headers: {}, body: null, resourceType: 'script', ...options};
}

test('verifies every input file and refuses drift before a browser is needed', (t) => {
  const value = fixture(t);
  assert.equal(loadInputs(value.root, value.packet, value.inventory).files.size, 2);
  fs.writeFileSync(path.join(value.root, 'index.html'), '<h1>Changed</h1>');
  assert.throws(() => loadInputs(value.root, value.packet, value.inventory), /Artifact file/);
});

test('refuses extra files, symlinks, duplicate inventory and changed approval flags', (t) => {
  const value = fixture(t);
  fs.writeFileSync(path.join(value.root, 'extra'), 'extra');
  assert.throws(() => loadInputs(value.root, value.packet, value.inventory), /file count/);
  fs.unlinkSync(path.join(value.root, 'extra'));
  fs.symlinkSync(path.join(value.root, 'index.html'), path.join(value.root, 'link'));
  assert.throws(() => loadInputs(value.root, value.packet, value.inventory), /symlinks/);
  fs.unlinkSync(path.join(value.root, 'link'));
  for (const mutate of [(p) => { p.rule.enabled = true; }, (p) => { p.rollout_approved = true; }, (p) => { p.compatibility_accepted = true; }]) {
    const packet = structuredClone(value.packet); mutate(packet);
    assert.throws(() => loadInputs(value.root, packet, value.inventory));
  }
  value.inventory.files[1] = value.inventory.files[0];
  value.packet.inventory_sha256 = digest(JSON.stringify(value.inventory, null, 2) + '\n');
  assert.throws(() => loadInputs(value.root, value.packet, value.inventory), /Duplicate inventory/);
});

test('serves only verified buffers and finite external fixtures', (t) => {
  const value = fixture(t);
  const input = loadInputs(value.root, value.packet, value.inventory);
  assert.equal(localResponse(input, request(ORIGIN + '/')).body.toString(), '<h1>Fixture</h1>');
  assert.equal(localResponse(input, request(ORIGIN + '/%2e%2e/private')).status, 404);
  assert.equal(localResponse(input, request(BEACON)).kind, 'beacon-fixture');
  assert.equal(localResponse(input, request(RUM, {method: 'POST', body: 'local-csp-probe'})).kind, 'rum-fixture');
  for (const url of ['https://unreviewed.invalid/x', 'file:///private', BEACON + '?extra=1', RUM + '/extra']) assert.throws(() => localResponse(input, request(url)));
  assert.throws(() => localResponse(input, request(BEACON, {headers: {Cookie: 'fixture'}})), /cookies/);
  assert.throws(() => localResponse(input, request(BEACON, {headers: {Authorization: 'fixture'}})), /authorization/);
});

test('promotion fixtures require exact method, event shape and credential absence', (t) => {
  const value = fixture(t);
  const input = loadInputs(value.root, value.packet, value.inventory);
  const valid = request(PROMOTION, {method: 'POST', headers: {'content-type': 'text/plain'}, body: JSON.stringify({source: 'sdk-rust-reference', event: 'impression'})});
  assert.equal(localResponse(input, valid).kind, 'promotion-impression');
  for (const change of [
    {method: 'GET'}, {body: '{invalid'}, {body: JSON.stringify({source: 'other', event: 'click'})},
    {body: JSON.stringify({source: 'sdk-rust-reference', event: 'other'})},
    {body: JSON.stringify({source: 'sdk-rust-reference', event: 'click', extra: true})},
  ]) assert.throws(() => localResponse(input, {...valid, ...change}));
});

test('local-origin selection refuses deceptive hosts and added URL components', (t) => {
  const value = fixture(t);
  const input = loadInputs(value.root, value.packet, value.inventory);
  for (const origin of [ORIGIN + '.invalid', ORIGIN + '@unreviewed.invalid', 'https://unreviewed.invalid/' + ORIGIN, ORIGIN + ':444', ORIGIN + '/path', 'http://rust.durable-workflow.com']) {
    assert.throws(() => localResponse(input, request(ORIGIN + '/'), origin), /Unexpected local origin/);
  }
});

test('fake routing fulfills or aborts without a network continuation', async (t) => {
  const value = fixture(t);
  const input = loadInputs(value.root, value.packet, value.inventory);
  let httpHandler; let websocketHandler;
  const context = {route: async (_pattern, handler) => { httpHandler = handler; }, routeWebSocket: async (_pattern, handler) => { websocketHandler = handler; }};
  const audit = await installLocalRoutes(context, input);
  async function dispatch(url) {
    const req = request(url);
    const route = {request: () => ({url: () => req.url, method: () => req.method, headers: () => req.headers, postData: () => req.body, resourceType: () => req.resourceType}), fulfill: async () => 'fulfilled', abort: async () => 'aborted'};
    await httpHandler(route);
  }
  await dispatch(ORIGIN + '/');
  await dispatch('https://unreviewed.invalid/x');
  let closed = false;
  websocketHandler({close: () => { closed = true; }});
  assert.equal(closed, true);
  assert.equal(audit.kinds.artifact, 1);
  assert.deepEqual(audit.refused, ['http', 'websocket']);
});

test('review packet identifies the exact executable and data closure', () => {
  const packet = JSON.parse(fs.readFileSync(path.join(__dirname, 'rust-local-browser-packet.json')));
  assert.equal(packet.run_status, 'not-run');
  for (const [name, hash] of Object.entries(packet.files)) assert.equal(digest(fs.readFileSync(path.join(__dirname, name))), hash, name);
  const candidate = JSON.parse(fs.readFileSync(path.join(__dirname, 'rust-rule.candidate.json')));
  assert.deepEqual(packet.input_artifact, candidate.input_artifact);
  assert.equal(packet.container.network, 'none');
});
