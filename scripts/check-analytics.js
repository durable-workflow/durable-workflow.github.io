const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {runInNewContext} = require('node:vm');

const config = require('../docusaurus.config');
const buildDirectory = path.resolve(process.argv[2] || 'build');
const runtimePath = path.resolve('static/analytics/analytics.js');
const runtime = fs.readFileSync(runtimePath, 'utf8');
const analytics = config.customFields?.analytics;

assert.equal(analytics?.measurementId, 'G-HD1YHT442Y');
assert.equal(analytics?.anonymizeIP, true);
assert.equal(analytics?.consentRequired, true);
assert.equal(config.presets[0][1].docs.lastVersion, '1.x');
assert.match(runtime, new RegExp(analytics.measurementId));
assert.match(runtime, /send_page_view: true/);
assert.doesNotMatch(runtime, /gtag\('event', 'page_view'/);
assert.match(runtime, /analytics_storage: 'granted'/);
assert.match(runtime, /page_referrer: ''/);
assert.match(runtime, /cookie_domain: SITE_HOSTNAME/);
assert.match(runtime, /PARENT_COOKIE_DOMAIN = 'durable-workflow\.com'/);
assert.match(runtime, /new Set\(\[SITE_HOSTNAME, PARENT_COOKIE_DOMAIN\]\)/);
assert.match(runtime, /window\.history\[method\]/);
assert.equal(fs.readFileSync(path.join(buildDirectory, 'analytics/analytics.js'), 'utf8'), runtime);
assert.equal(
  fs.readFileSync(path.join(buildDirectory, 'analytics/analytics.css'), 'utf8'),
  fs.readFileSync(path.resolve('static/analytics/analytics.css'), 'utf8'),
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

for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  if (/<meta[^>]+http-equiv="refresh"/i.test(html)) {
    assert.doesNotMatch(html, /analytics\/analytics\.js/, `${htmlFile} redirect must not create a duplicate page view`);
    continue;
  }
  assert.equal((html.match(/src="\/analytics\/analytics\.js"/g) || []).length, 1, `${htmlFile} must load one local analytics runtime`);
  assert.equal((html.match(/href="\/analytics\/analytics\.css"/g) || []).length, 1, `${htmlFile} must load one local analytics stylesheet`);
  assert.doesNotMatch(html, /googletagmanager\.com/, `${htmlFile} must not load Google before consent`);
}

const elements = new Map();
const timers = new Map();
const listeners = new Map();
const appendedScripts = [];
let nextTimer = 1;

const makeElement = tagName => {
  const elementListeners = new Map();

  return {
    id: '',
    tagName,
    addEventListener(type, listener) {
      elementListeners.set(type, listener);
    },
    removeAttribute() {},
    setAttribute() {},
  };
};

const document = {
  body: {
    appendChild(element) {
      if (element.id) elements.set(element.id, element);
    },
  },
  cookie: '',
  createElement: makeElement,
  currentScript: {dataset: {}},
  getElementById(id) {
    return elements.get(id) || null;
  },
  head: {
    appendChild(element) {
      appendedScripts.push(element);
      if (element.id) elements.set(element.id, element);
    },
  },
  readyState: 'complete',
  title: 'Introduction',
};
const location = {
  hostname: 'durable-workflow.com',
  pathname: '/docs/introduction/',
  reload() {},
};
const history = {
  pushState(_state, _unused, url) {
    location.pathname = new URL(url, 'https://durable-workflow.com').pathname;
  },
  replaceState(_state, _unused, url) {
    location.pathname = new URL(url, 'https://durable-workflow.com').pathname;
  },
};
const window = {
  addEventListener(type, listener) {
    listeners.set(type, listener);
  },
  clearTimeout(id) {
    timers.delete(id);
  },
  history,
  localStorage: {
    getItem() {
      return 'granted';
    },
    setItem() {},
  },
  location,
  setTimeout(callback) {
    const id = nextTimer++;
    timers.set(id, callback);
    return id;
  },
};

const flushTimers = () => {
  while (timers.size > 0) {
    const pending = [...timers.entries()];
    timers.clear();
    for (const [, callback] of pending) callback();
  }
};
const configCalls = () => window.dataLayer
  .map(entry => Array.from(entry))
  .filter(entry => entry[0] === 'config');

runInNewContext(runtime, {document, URL, window});
assert.equal(configCalls().length, 1, 'initial load must emit one page view');
assert.equal(appendedScripts.length, 1, 'initial load must inject one Google loader');

document.title = 'Installation';
window.history.pushState({}, '', '/docs/installation/?campaign=private');
window.history.replaceState({}, '', '/docs/installation/?campaign=changed');
flushTimers();
assert.equal(configCalls().length, 2, 'one client-side route must emit one page view');
assert.equal(configCalls()[1][2].page_location, 'https://durable-workflow.com/docs/installation/');
assert.equal(configCalls()[1][2].page_title, 'Installation');
assert.equal(appendedScripts.length, 1, 'client-side navigation must not inject another Google loader');

location.pathname = '/blog/';
listeners.get('popstate')();
flushTimers();
assert.equal(configCalls().length, 3, 'history navigation must emit one page view');
assert.equal(configCalls()[2][2].page_location, 'https://durable-workflow.com/blog/');

console.log(`Validated consent-gated analytics in ${htmlFiles.length} rendered pages.`);
