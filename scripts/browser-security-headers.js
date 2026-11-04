const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');

const INERT_SCRIPT_TYPES = new Set(['application/json', 'application/ld+json', 'text/json']);
const RESOURCE_KINDS = ['script', 'style', 'img', 'font', 'connect', 'worker', 'media'];
// Rustdoc can retain unresolved intra-doc paths as inert custom-scheme links.
// Keep their restricted Rust syntax distinct from executable URL schemes.
const RUSTDOC_REFERENCE = /^(?:crate|super|TryFuture)::[A-Za-z][A-Za-z0-9_:]*(?:\(\))?$/;
function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
const sorted = (values) => [...new Set(values)].sort(compareText);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sourceHash = (value) => `sha256-${crypto.createHash('sha256').update(value).digest('base64')}`;

function resourceOrigin(value, pageUrl) {
  const url = new URL(value, pageUrl);
  if (url.origin === new URL(pageUrl).origin) return "'self'";
  if (['data:', 'blob:'].includes(url.protocol)) return url.protocol;
  return url.origin;
}

function safeAttributeUrl(element, name, value, pageUrl) {
  const protocol = new URL(value, pageUrl).protocol;
  if (['http:', 'https:'].includes(protocol)) return true;
  if (element.name === 'a' && name === 'href') {
    return ['mailto:', 'tel:'].includes(protocol) || RUSTDOC_REFERENCE.test(value);
  }
  return element.name === 'img' && name === 'src' && protocol === 'data:';
}

function inspectAttributes(element, pageUrl, handlers, unsafeUrls) {
  const attributes = element.attribs || {};
  for (const [name, value] of Object.entries(attributes)) {
    if (/^on[a-z]/i.test(name)) handlers.push({attribute: name, hash: sourceHash(value)});
    if (!['src', 'href', 'action'].includes(name)) continue;
    if (!safeAttributeUrl(element, name, value, pageUrl)) unsafeUrls.push(value);
  }
  return Object.hasOwn(attributes, 'style') ? 1 : 0;
}

function inspectHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const scripts = [];
  const styles = [];
  const handlers = [];
  const resources = Object.fromEntries(RESOURCE_KINDS.map((kind) => [kind, []]));
  const unsafeUrls = [];
  let styleAttributes = 0;

  function resource(kind, value) {
    if (!value || value.startsWith('#')) return;
    resources[kind].push(resourceOrigin(value, pageUrl));
  }

  $('*').each((_, element) => {
    styleAttributes += inspectAttributes(element, pageUrl, handlers, unsafeUrls);
  });
  $('script').each((_, element) => {
    const attributes = element.attribs || {};
    if (attributes.src) resource('script', attributes.src);
    else if (!INERT_SCRIPT_TYPES.has((attributes.type || '').toLowerCase().trim())) {
      const text = $(element).text();
      if (text.trim()) scripts.push(sourceHash(text));
    }
  });
  $('style').each((_, element) => {
    const text = $(element).text();
    if (text.trim()) styles.push(sourceHash(text));
  });
  $('link').each((_, element) => {
    const attributes = element.attribs || {};
    const rel = (attributes.rel || '').split(/\s+/);
    if (rel.includes('stylesheet')) resource('style', attributes.href);
    if (rel.includes('preload') && attributes.as === 'font') resource('font', attributes.href);
    if (rel.some((value) => ['icon', 'apple-touch-icon'].includes(value))) resource('img', attributes.href);
  });
  $('img').each((_, element) => resource('img', element.attribs.src));
  $('audio, video, source').each((_, element) => resource('media', element.attribs.src));
  return {
    script_hashes: sorted(scripts), style_hashes: sorted(styles),
    handlers: handlers.toSorted((a, b) => compareText(`${a.attribute}:${a.hash}`, `${b.attribute}:${b.hash}`)),
    style_attributes: styleAttributes,
    resource_origins: Object.fromEntries(RESOURCE_KINDS.map((kind) => [kind, sorted(resources[kind])])),
    unsafe_urls: sorted(unsafeUrls),
  };
}

function inventoryTree(root, policy) {
  if (!fs.lstatSync(root).isDirectory()) throw new Error('Inventory root must be a regular directory');
  const files = [];
  const pages = [];
  function visit(directory) {
    const entries = fs.readdirSync(directory, {withFileTypes: true});
    for (const entry of entries.toSorted((a, b) => compareText(a.name, b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are not inventory inputs: ${entry.name}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const relative = path.relative(root, absolute).split(path.sep).join('/');
        const bytes = fs.readFileSync(absolute);
        files.push({path: relative, bytes: bytes.length, sha256: sha256(bytes)});
        if (relative.endsWith('.html')) pages.push({
          path: relative,
          ...inspectHtml(bytes.toString('utf8'), new URL(relative, policy.origin + '/').href),
        });
      } else throw new Error(`Non-regular inventory input: ${entry.name}`);
    }
  }
  visit(root);
  if (!pages.length) throw new Error('No HTML pages were inventoried');
  const buildPath = path.join(root, '__build.json');
  return {
    schema: 'durable-workflow.browser-security-inventory/v1',
    origin: policy.origin,
    input_artifact: policy.input_artifact,
    source_preparation: policy.source_preparation || null,
    build_identity: fs.existsSync(buildPath) ? JSON.parse(fs.readFileSync(buildPath, 'utf8')) : null,
    files, pages,
  };
}

function allowedSources(values, kind) {
  return sorted(values.map((value) => {
    if (value === "'self'") return value;
    if (value === 'data:' && kind === 'img') return value;
    if (value === 'blob:' && kind === 'worker') return value;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password || /[\r\n*]/.test(value)) {
      throw new Error(`Expected an exact HTTPS origin: ${value}`);
    }
    return value;
  }));
}

function verifyIdentity(inventory, policy) {
  if (policy.origin !== 'https://rust.durable-workflow.com' || inventory.origin !== policy.origin) {
    throw new Error('Only the Rust staging hostname is admitted by this design');
  }
  if (inventory.build_identity?.version !== policy.expected_build.version ||
      inventory.build_identity?.source_revision !== policy.expected_build.source_revision ||
      inventory.build_identity?.crate_sha256 !== policy.expected_build.crate_sha256 ||
      inventory.build_identity?.tooling_revision !== policy.expected_build.tooling_revision) {
    throw new Error('Inventory does not match the reviewed public build identity');
  }
  if (JSON.stringify(inventory.input_artifact) !== JSON.stringify(policy.input_artifact) ||
      JSON.stringify(inventory.source_preparation) !== JSON.stringify(policy.source_preparation || null)) {
    throw new Error('Artifact provenance changed');
  }
}

function verifyPages(inventory, sources) {
  const handlers = sorted(inventory.pages.flatMap((page) => page.handlers.map((handler) => handler.hash)));
  if (handlers.length) throw new Error('Inline event handlers require a source correction');
  for (const page of inventory.pages) {
    if (page.unsafe_urls.length) throw new Error(`Unsafe URL scheme on ${page.path}`);
    if (page.style_attributes) throw new Error(`Unreviewed inline styles on ${page.path}`);
    for (const kind of RESOURCE_KINDS) {
      for (const origin of page.resource_origins[kind]) {
        if (!sources[kind].includes(origin)) throw new Error(`Unreviewed ${kind} origin ${origin} on ${page.path}`);
      }
    }
  }
}

function policyHeaders(inventory, sources) {
  const scripts = sorted(inventory.pages.flatMap((page) => page.script_hashes));
  const styles = sorted(inventory.pages.flatMap((page) => page.style_hashes));
  const tokens = (kind, hashes = []) => [...sources[kind], ...hashes.map((hash) => `'${hash}'`)].join(' ') || "'none'";
  const csp = [
    "default-src 'none'",
    `script-src ${tokens('script', scripts)}`,
    "script-src-attr 'none'",
    `style-src ${tokens('style', styles)}`,
    "style-src-attr 'none'",
    `img-src ${tokens('img')}`, `font-src ${tokens('font')}`, `connect-src ${tokens('connect')}`,
    `worker-src ${tokens('worker')}`, `media-src ${tokens('media')}`,
    "frame-src 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
  return {
    'content-security-policy': csp,
    'strict-transport-security': 'max-age=300',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'x-frame-options': 'DENY',
  };
}

function candidateRule(inventory, policy) {
  verifyIdentity(inventory, policy);
  const sources = Object.fromEntries(RESOURCE_KINDS.map((kind) => [kind, allowedSources(policy.sources[kind] || [], kind)]));
  verifyPages(inventory, sources);
  const headers = policyHeaders(inventory, sources);
  for (const [name, value] of Object.entries(headers)) {
    if (Buffer.byteLength(`${name}: ${value}`, 'utf8') > 4096 || /[\r\n]/.test(value)) {
      throw new Error(`Header exceeds the reviewed 4 KB transform limit: ${name}`);
    }
  }
  return {
    schema: 'durable-workflow.browser-security-rule-candidate/v1',
    rollout_approved: false,
    phase: 'http_response_headers_transform',
    inventory_sha256: sha256(JSON.stringify(inventory, null, 2) + '\n'),
    compatibility_accepted: false,
    input_artifact: inventory.input_artifact,
    source_preparation: inventory.source_preparation,
    rule: {
      ref: 'docs-security-headers-rust-v1',
      description: 'Rust documentation security headers; disabled pending reviewed rollout',
      enabled: false,
      expression: '(http.host eq "rust.durable-workflow.com" and http.request.scheme eq "https")',
      action: 'rewrite',
      action_parameters: {headers: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, {operation: 'set', value}]))},
    },
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--root' || !args[1]) {
    throw new Error('Usage: node scripts/browser-security-headers.js --root PUBLIC_SITE_DIRECTORY');
  }
  const packetDirectory = path.join(__dirname, '../security/browser-headers');
  const policy = JSON.parse(fs.readFileSync(path.join(packetDirectory, 'rust-policy.json'), 'utf8'));
  const inventory = inventoryTree(path.resolve(args[1]), policy);
  const rule = candidateRule(inventory, policy);
  fs.writeFileSync(path.join(packetDirectory, 'rust-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
  fs.writeFileSync(path.join(packetDirectory, 'rust-rule.candidate.json'), JSON.stringify(rule, null, 2) + '\n');
  process.stdout.write(`Inventoried ${inventory.pages.length} HTML pages; wrote disabled Rust rule. No provider request was made.\n`);
}

module.exports = {inspectHtml, inventoryTree, candidateRule, sourceHash};
