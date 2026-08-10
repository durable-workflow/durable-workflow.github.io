const PUBLIC_DOCS_ORIGIN = 'https://durable-workflow.com';
const CLOUD_EARLY_ACCESS_URL = 'https://cloud.durable-workflow.com/early-access';
const PROMOTION_EVENT_URL = `${CLOUD_EARLY_ACCESS_URL}/promotion-events`;
const PROMOTION_EVENTS = Object.freeze(['impression', 'click']);
const PROMOTION_PAYLOAD_FIELDS = Object.freeze(['event', 'source']);
const PROMOTION_PLACEMENTS = Object.freeze([
  Object.freeze({
    buildPath: 'index.html',
    route: '/',
    source: 'docs-homepage',
  }),
  Object.freeze({
    buildPath: 'docs/2.0/polyglot/deployment-modes/index.html',
    route: '/docs/2.0/polyglot/deployment-modes/',
    source: 'docs-v2-deployment-modes',
  }),
  Object.freeze({
    buildPath: 'docs/2.0/polyglot/cloud-control-plane/index.html',
    route: '/docs/2.0/polyglot/cloud-control-plane/',
    source: 'docs-v2-cloud-runtime',
  }),
  Object.freeze({
    buildPath: 'docs/2.0/polyglot/php/index.html',
    route: '/docs/2.0/polyglot/php/',
    source: 'docs-v2-php-sdk',
  }),
  Object.freeze({
    buildPath: 'docs/2.0/polyglot/python/index.html',
    route: '/docs/2.0/polyglot/python/',
    source: 'docs-v2-python-sdk',
  }),
  Object.freeze({
    buildPath: 'docs/2.0/polyglot/rust/index.html',
    route: '/docs/2.0/polyglot/rust/',
    source: 'docs-v2-rust-sdk',
  }),
]);

module.exports = {
  CLOUD_EARLY_ACCESS_URL,
  PROMOTION_EVENTS,
  PROMOTION_EVENT_URL,
  PROMOTION_PAYLOAD_FIELDS,
  PROMOTION_PLACEMENTS,
  PUBLIC_DOCS_ORIGIN,
};
