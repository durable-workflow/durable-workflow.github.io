const assert = require('node:assert/strict');
const {
  classifyChangedDocumentation,
  containsMarkdownTable,
  documentationRouteForFile,
} = require('./docs-visual-route-classification');

assert.equal(
  documentationRouteForFile('docs/polyglot/python.md'),
  '/docs/2.0/polyglot/python/',
);
assert.equal(
  documentationRouteForFile('versioned_docs/version-1.x/configuration/options.md'),
  '/docs/configuration/options/',
);
assert.equal(
  documentationRouteForFile('src/pages/docs/platform-conformance.mdx'),
  '/docs/platform-conformance/',
);
assert.equal(
  documentationRouteForFile('docs/introduction.md', '---\nslug: /\n---\n# Introduction'),
  '/docs/2.0/',
  'front-matter slugs must resolve to their exact versioned routes',
);
assert.equal(containsMarkdownTable('| A | B |\n| --- | --- |\n| one | two |'), true);

const platformConformance = classifyChangedDocumentation({
  changedFiles: ['docs/platform-conformance.md'],
  readSource: () => '| Category | Authority |\n| --- | --- |\n| worker | protocol |',
});
const authorityRoles = platformConformance.sections.find(section => (
  section.id === 'conformance-worker-protocol-authority-roles'
));
assert.equal(
  authorityRoles.route,
  '/docs/2.0/platform-conformance/',
  'the current conformance source must select its exact versioned route',
);
assert.equal(
  authorityRoles.navigation_configuration,
  'current-v2',
  'the current conformance source must retain the explicit 2.0 navigation configuration',
);
assert.equal(
  authorityRoles.scroll_target,
  '[data-worker-protocol-authority-roles="true"] > p',
  'the current conformance source must select its affected authority-role table',
);
assert.equal(
  authorityRoles.geometry_scope,
  '[data-worker-protocol-authority-roles="true"]',
  'authority-role reachability must exclude controls outside the selected component',
);

const protocolAuthorityComponent = classifyChangedDocumentation({
  changedFiles: ['src/components/WorkerProtocolAuthorityRoles/index.js'],
});
assert.deepEqual(
  new Set(protocolAuthorityComponent.sections
    .filter(section => section.state === 'worker-protocol-authority-roles')
    .map(section => section.route)),
  new Set([
    '/docs/2.0/compatibility/',
    '/docs/2.0/platform-protocol-specs/',
    '/docs/2.0/platform-conformance/',
  ]),
  'the shared authority component must select all three explanatory surfaces',
);

const serverConfig = classifyChangedDocumentation({
  changedFiles: ['docs/polyglot/server-config-reference.md'],
  readSource: () => '| Variable | Default |\n| --- | --- |',
});
assert.equal(
  serverConfig.sections.some(section => (
    section.route === '/docs/2.0/polyglot/server-config-reference/'
      && section.scroll_target.includes('tbody tr:nth-child(8)')
  )),
  true,
  'the Server Config source must select its affected external-payload rows',
);

const capabilities = classifyChangedDocumentation({
  changedFiles: ['docs/capabilities.md'],
  readSource: () => '| Capability | Evidence |\n| --- | --- |\n| Selection | durable |',
});
const selectionCapability = capabilities.sections.find(section => (
  section.id === 'capability-durable-first-completion-selection'
));
assert.equal(
  selectionCapability.route,
  '/docs/2.0/capabilities/',
  'the capability index must select its exact versioned route',
);
assert.equal(
  selectionCapability.scroll_target,
  '#durable-first-completion-selection-capability',
  'the capability index must select the durable first-completion row',
);
assert.deepEqual(
  selectionCapability.viewports.map(viewport => viewport.name),
  ['desktop', 'intermediate', 'mobile', 'short-height'],
  'the capability selection capture must include every required viewport class',
);

for (const [source, sectionId, route] of [
  [
    'docs/defining-workflows/workflow-api.md',
    'workflow-api-durable-selection',
    '/docs/2.0/defining-workflows/workflow-api/',
  ],
  ['docs/polyglot/php.md', 'php-durable-first-completion-selection', '/docs/2.0/polyglot/php/'],
  [
    'docs/polyglot/python.md',
    'python-durable-first-completion-selection',
    '/docs/2.0/polyglot/python/',
  ],
]) {
  const classified = classifyChangedDocumentation({
    changedFiles: [source],
    readSource: () => '| API | Result |\n| --- | --- |\n| select | winner |',
  });
  const section = classified.sections.find(candidate => candidate.id === sectionId);
  assert.equal(section.route, route, `${source} must select its exact changed API section`);
  assert.equal(section.state_scope, 'section', `${source} must use a bounded section capture`);
  assert.deepEqual(
    section.viewports.map(viewport => viewport.name),
    ['desktop', 'intermediate', 'mobile', 'short-height'],
    `${source} must include every required viewport class`,
  );
  if (source === 'docs/defining-workflows/workflow-api.md') {
    assert.equal(
      section.click_target,
      '#workflow-api-details > summary',
      'the collapsed Workflow API table must be opened before capture',
    );
    assert.deepEqual(
      section.required_visible,
      [
        '#durable-command-surface + table tbody tr:nth-child(10) td:nth-child(1)',
        '#durable-command-surface + table tbody tr:nth-child(10) td:nth-child(3)',
        '#durable-command-surface + table tbody tr:nth-child(10) td:nth-child(4)',
      ],
      'the Workflow API capture must show the select facade, signature, and durable effect',
    );
    assert.equal(
      section.scroll_target,
      '#durable-command-surface + table tbody tr:nth-child(10)',
      'the Workflow API capture must focus the select row',
    );
    assert.equal(
      section.viewports.find(viewport => viewport.name === 'short-height').fullPage,
      undefined,
      'the Workflow API short-height evidence must remain a 640x360 viewport capture',
    );
  }
}

const portableWorkerAffinity = classifyChangedDocumentation({
  changedFiles: ['docs/features/portable-worker-affinity.md'],
  readSource: () => '| SDK worker | Local activities |\n| --- | --- |',
});
const sdkSupport = portableWorkerAffinity.sections.find(section => (
  section.id === 'portable-worker-affinity-sdk-support'
));
assert.equal(
  sdkSupport.route,
  '/docs/2.0/features/portable-worker-affinity/',
  'the portable worker affinity source must select its exact versioned route',
);
assert.equal(
  sdkSupport.scroll_target,
  '#sdk-support',
  'the portable worker affinity source must select its SDK support table section',
);
assert.deepEqual(
  sdkSupport.interaction,
  {
    action: 'scroll-to',
    selector: '#sdk-support',
    block: 'start',
  },
  'the SDK support anchor must align below sticky navigation',
);

const genericPage = classifyChangedDocumentation({
  changedFiles: ['docs/polyglot/deployment-modes.md'],
  readSource: () => '# Deployment modes\n\nReference copy.',
});
assert.equal(
  genericPage.sections.some(section => section.route === '/docs/2.0/polyglot/deployment-modes/'),
  true,
  'a changed documentation source must select its exact rendered route',
);
const genericRouteSection = genericPage.sections.find(
  section => section.route === '/docs/2.0/polyglot/deployment-modes/',
);
assert.deepEqual(
  genericRouteSection.interaction,
  {
    action: 'scroll-to',
    selector: '.theme-doc-markdown h1',
    block: 'nearest',
  },
  'a generic top-level heading must remain in place when it is already visible',
);

assert.throws(
  () => classifyChangedDocumentation({
    changedFiles: ['docs/polyglot/unmapped-table.md'],
    readSource: () => '| A | B |\n| --- | --- |\n| one | two |',
  }),
  /requires a route-specific section capture mapping/,
  'an unmapped table-heavy documentation change must fail safe',
);

const globalCss = classifyChangedDocumentation({
  changedFiles: ['src/css/custom.css'],
});
assert.deepEqual(
  new Set(globalCss.sections.map(section => section.route)),
  new Set([
    '/docs/platform-conformance/',
    '/docs/2.0/polyglot/server-config-reference/',
  ]),
  'global visual changes must exercise anchored and table-heavy representative routes',
);

process.stdout.write('Documentation visual route classification tests passed.\n');
