const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ORIGIN = 'https://rust.durable-workflow.com';
const BEACON = 'https://static.cloudflareinsights.com/beacon.min.js';
const RUM = 'https://cloudflareinsights.com/cdn-cgi/rum';
const PROMOTION = 'https://cloud.durable-workflow.com/early-access/promotion-events';
const IMAGE_ORIGINS = new Set(['https://github.com', 'https://img.shields.io', 'https://sonarcloud.io']);
const MIME = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf'};
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function verifyPacketFiles(directory) {
  const packet = JSON.parse(fs.readFileSync(path.join(directory, 'rust-local-browser-packet.json')));
  assert.equal(packet.run_status, 'not-run');
  for (const [name, hash] of Object.entries(packet.files)) {
    assert.ok(!path.isAbsolute(name) && !name.split('/').includes('..'), 'Unsafe packet path');
    assert.equal(digest(fs.readFileSync(path.join(directory, name))), hash, 'Packet member changed');
  }
  return packet;
}

function loadInputs(root, packet, inventory) {
  assert.equal(packet.rule.enabled, false);
  assert.equal(packet.rollout_approved, false);
  assert.equal(packet.compatibility_accepted, false);
  assert.equal(inventory.origin, ORIGIN);
  assert.equal(packet.inventory_sha256, digest(JSON.stringify(inventory, null, 2) + '\n'));
  assert.deepEqual(packet.input_artifact, inventory.input_artifact);
  assert.equal(packet.source_preparation, null);
  assert.equal(inventory.source_preparation, null);
  assert.ok(fs.lstatSync(root).isDirectory(), 'Artifact root must be a regular directory');
  const files = new Map();
  let bytes = 0;
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const absolute = path.join(directory, entry.name);
      assert.ok(!entry.isSymbolicLink(), 'Artifact symlinks are refused');
      if (entry.isDirectory()) visit(absolute);
      else {
        assert.ok(entry.isFile(), 'Artifact special files are refused');
        const relative = path.relative(root, absolute).split(path.sep).join('/');
        const size = fs.statSync(absolute).size;
        bytes += size;
        assert.ok(bytes <= 64 * 1024 * 1024 && files.size < 1000, 'Artifact exceeds the local input bound');
        files.set(relative, fs.readFileSync(absolute));
      }
    }
  }
  visit(root);
  assert.equal(files.size, inventory.files.length, 'Artifact file count changed');
  const seen = new Set();
  for (const record of inventory.files) {
    assert.ok(!seen.has(record.path), 'Duplicate inventory path');
    seen.add(record.path);
    const content = files.get(record.path);
    assert.ok(content, 'Inventoried artifact file is missing');
    assert.equal(content.length, record.bytes, 'Artifact file size changed');
    assert.equal(digest(content), record.sha256, 'Artifact file digest changed');
  }
  assert.deepEqual(JSON.parse(files.get('__build.json')), inventory.build_identity);
  return {files, packet, inventory, headers: Object.fromEntries(Object.entries(packet.rule.action_parameters.headers).map(([name, record]) => [name, record.value]))};
}

function promotionEvent(request) {
  assert.equal(request.method, 'POST', 'Promotion request method changed');
  const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]));
  assert.ok(!Object.hasOwn(headers, 'authorization'), 'Local telemetry cannot carry authorization');
  assert.ok(!Object.hasOwn(headers, 'cookie'), 'Local telemetry cannot carry cookies');
  assert.match(headers['content-type'] || '', /^text\/plain(?:;|$)/);
  assert.ok(typeof request.body === 'string' && request.body.length < 256, 'Promotion body exceeds its bound');
  const event = JSON.parse(request.body);
  assert.deepEqual(Object.keys(event).sort(), ['event', 'source']);
  assert.equal(event.source, 'sdk-rust-reference');
  assert.ok(['impression', 'click'].includes(event.event), 'Unknown promotion event');
  return event.event;
}

function localResponse(input, request, origin = ORIGIN) {
  assert.ok([ORIGIN, 'https://example.invalid'].includes(origin), 'Unexpected local origin');
  const requestHeaders = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]));
  assert.ok(!Object.hasOwn(requestHeaders, 'authorization'), 'Local requests cannot carry authorization');
  assert.ok(!Object.hasOwn(requestHeaders, 'cookie'), 'Local requests cannot carry cookies');
  const url = new URL(request.url);
  if (url.origin === origin) {
    assert.equal(request.method, 'GET', 'Artifact requests must be GET');
    const relative = decodeURIComponent(url.pathname).replace(/^\//, '');
    if (relative === '__frame_probe') return {kind: 'frame-probe', status: 200, headers: {'content-type': 'text/html'}, body: '<!doctype html><title>Framing control</title>'};
    if (relative === '__telemetry_fixture') return {kind: 'promotion-dom-fixture', status: 200, headers: {...input.headers, 'content-type': 'text/html'}, body: '<!doctype html><title>Synthetic promotion control</title><aside data-promotion-source="sdk-rust-reference"><a data-promotion-action="early-access" href="https://cloud.durable-workflow.com/early-access">Synthetic action</a></aside><script type="module" src="/analytics/analytics.js"></script>'};
    const file = [relative, relative.replace(/\/$/, '') + '/index.html', relative ? null : 'index.html'].find((name) => name && input.files.has(name));
    if (!file) return {kind: 'missing', status: 404, body: ''};
    return {kind: 'artifact', status: 200, headers: {...input.headers, 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store'}, body: input.files.get(file)};
  }
  const cors = {'access-control-allow-origin': origin};
  if (request.url === BEACON && request.method === 'GET') {
    // This finite fixture exercises CSP loader/connect paths, never vendor code or delivery.
    return {kind: 'beacon-fixture', status: 200, headers: {...cors, 'content-type': 'text/javascript'}, body: `globalThis.__localBeaconFixture = true; fetch('${RUM}', {method: 'POST', credentials: 'omit', headers: {'Content-Type': 'text/plain'}, body: 'local-csp-probe'});`};
  }
  if (request.url === RUM && request.method === 'POST' && request.body === 'local-csp-probe') {
    return {kind: 'rum-fixture', status: 204, headers: cors, body: ''};
  }
  if (request.url === PROMOTION) return {kind: 'promotion-' + promotionEvent(request), status: 204, headers: cors, body: ''};
  if (IMAGE_ORIGINS.has(url.origin) && request.method === 'GET' && request.resourceType === 'image') {
    return {kind: 'image-fixture', status: 200, headers: {'content-type': 'image/svg+xml'}, body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'};
  }
  throw new Error('Request is outside the finite local response set');
}

async function installLocalRoutes(context, input, origin = ORIGIN) {
  const audit = {requests: 0, kinds: {}, refused: []};
  await context.routeWebSocket('**/*', (socket) => { audit.refused.push('websocket'); socket.close(); });
  await context.route('**/*', async (route) => {
    try {
      audit.requests += 1;
      assert.ok(audit.requests <= 4000, 'Local request budget exceeded');
      const request = route.request();
      const response = localResponse(input, {url: request.url(), method: request.method(), headers: request.headers(), body: request.postData(), resourceType: request.resourceType()}, origin);
      audit.kinds[response.kind] = (audit.kinds[response.kind] || 0) + 1;
      await route.fulfill({status: response.status, headers: response.headers, body: response.body});
    } catch {
      audit.refused.push('http');
      await route.abort();
    }
  });
  return audit;
}

module.exports = {ORIGIN, BEACON, RUM, PROMOTION, digest, verifyPacketFiles, loadInputs, localResponse, installLocalRoutes};
