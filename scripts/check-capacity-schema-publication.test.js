#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  STATIC_ROOT,
  checkCapacitySchemaPublication,
} = require('./check-capacity-schema-publication');
const {
  assertLiveCapacitySchemaResponse,
} = require('./verify-docs-release-live');

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'capacity-schema-publication-'));
const fixtureStatic = path.join(fixtureRoot, 'static');
fs.cpSync(path.join(STATIC_ROOT, 'schemas'), path.join(fixtureStatic, 'schemas'), {
  recursive: true,
});

try {
  const passing = checkCapacitySchemaPublication({publicRoot: fixtureStatic, serverRoot: null});
  assert.strictEqual(Object.keys(passing.manifest.schemas).length, 6);

  const suite = passing.documents.suite;
  const redirectedResponse = {
    body: suite.source,
    contentType: 'application/json; charset=utf-8',
    finalUrl: suite.document.$id.replace(
      'https://durable-workflow.github.io',
      'https://durable-workflow.com',
    ),
    status: 200,
  };
  assert.doesNotThrow(() => (
    assertLiveCapacitySchemaResponse(suite.document.$id, suite.source, redirectedResponse)
  ));
  assert.throws(
    () => assertLiveCapacitySchemaResponse(
      suite.document.$id,
      suite.source,
      {...redirectedResponse, contentType: 'text/html; charset=utf-8'},
    ),
    /non-JSON content type/,
    'live qualification must reject an HTML response even when its route succeeds',
  );

  const suiteRoute = path.join(
    fixtureStatic,
    'schemas',
    'capacity-benchmark-suite',
    'v1.json',
  );
  fs.appendFileSync(suiteRoute, '\n');
  assert.throws(
    () => checkCapacitySchemaPublication({publicRoot: fixtureStatic, serverRoot: null}),
    /capacity schema suite digest/,
    'qualification must reject content that diverges from the manifest digest',
  );

  fs.copyFileSync(
    path.join(STATIC_ROOT, 'schemas', 'capacity-benchmark-suite', 'v1.json'),
    suiteRoute,
  );
  const futureRoute = path.join(
    fixtureStatic,
    'schemas',
    'capacity-benchmark-future',
  );
  fs.mkdirSync(futureRoute);
  fs.writeFileSync(path.join(futureRoute, 'v1.json'), '{}\n');
  assert.throws(
    () => checkCapacitySchemaPublication({publicRoot: fixtureStatic, serverRoot: null}),
    /routes must match the manifest inventory/,
    'qualification must reject an untracked capacity schema route',
  );
} finally {
  fs.rmSync(fixtureRoot, {recursive: true, force: true});
}

console.log('Capacity schema publication regression checks passed.');
