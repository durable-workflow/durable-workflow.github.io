const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const catalog = require('../static/platform-protocol-specs.json');
const {
  CatalogConformanceError,
  CatalogLifecycleError,
  discoverPublishedServer,
  verifySnapshots,
} = require('./check-public-server-protocol-catalog');

const provenance = {
  source: 'https://github.com/durable-workflow/workflow.git',
  ref: '2.0.0-alpha.279',
  commit: 'f9a00e18fa21196bcb3505710489025ff93cf5e1',
};
const expectedWorkflowRef = provenance.ref;

function discovery(protocolCatalog = catalog, packageProvenance = provenance) {
  return {
    platform_protocol_specs: protocolCatalog,
    package_provenance: packageProvenance,
  };
}

const passing = verifySnapshots(catalog, discovery(), expectedWorkflowRef);
assert.strictEqual(passing.schema, 'durable-workflow.v2.platform-protocol-specs.catalog');
assert.strictEqual(passing.version, 15);
assert.strictEqual(passing.capability_records, 16);
assert.strictEqual(passing.expected_workflow_package_ref, expectedWorkflowRef);
assert.deepStrictEqual(passing.package_provenance, provenance);

const staleCatalog = JSON.parse(JSON.stringify(catalog));
staleCatalog.version = 14;
assert.throws(
  () => verifySnapshots(catalog, discovery(staleCatalog), expectedWorkflowRef),
  error => error instanceof CatalogConformanceError
    && error.findings.some(finding => finding.kind === 'value_mismatch'
      && finding.path === '$.version'
      && finding.public_value === 15
      && finding.server_value === 14),
  'server catalog version drift must identify both observed versions',
);

const unsafeCatalog = JSON.parse(JSON.stringify(catalog));
unsafeCatalog.specs.control_plane_api.spec_path = 'tests/Feature/ControlPlaneTest.php';
assert.throws(
  () => verifySnapshots(catalog, discovery(unsafeCatalog), expectedWorkflowRef),
  error => error instanceof CatalogConformanceError
    && error.findings.some(finding => finding.kind === 'field_set_mismatch'
      && finding.path === '$.specs.control_plane_api'
      && finding.unexpected_server_fields.includes('spec_path'))
    && error.findings.some(finding => finding.kind === 'repository_local_authority'
      && finding.surface === 'server'),
  'repository-local authority must report the mismatched field set and safety failure',
);

assert.throws(
  () => verifySnapshots(catalog, discovery(catalog, {
    ...provenance,
    commit: 'short-sha',
  }), expectedWorkflowRef),
  error => error instanceof CatalogConformanceError
    && error.findings.some(finding => finding.kind === 'workflow_package_commit_invalid'),
  'image provenance must name a full Workflow source revision',
);

const differentValidWorkflowRef = '2.0.0-alpha.278';
assert.throws(
  () => verifySnapshots(catalog, discovery(catalog, {
    ...provenance,
    ref: differentValidWorkflowRef,
  }), expectedWorkflowRef),
  error => error instanceof CatalogConformanceError
    && error.findings.some(finding => finding.kind === 'workflow_package_version_mismatch'
      && finding.path === '$.package_provenance.ref'
      && finding.expected === expectedWorkflowRef
      && finding.actual === differentValidWorkflowRef),
  'image provenance must match the candidate tuple Workflow version exactly',
);

function lifecycleOptions(tmpDir, events, failBootstrap = false) {
  return {
    identifier: failBootstrap ? 'bootstrap-failure-test' : 'ordering-test',
    attempts: 1,
    retryDelayMs: 0,
    bootstrapLogPath: path.join(tmpDir, 'bootstrap.log'),
    serverLogPath: path.join(tmpDir, 'server.log'),
    execFileSync(command, args) {
      events.push({operation: 'exec', command, args});
      const isBootstrap = args[0] === 'run' && args.includes('server-bootstrap');
      if (isBootstrap && failBootstrap) {
        const error = new Error('bootstrap command failed');
        error.status = 17;
        error.stderr = 'database migration failed';
        throw error;
      }
      if (isBootstrap) {
        return 'bootstrap complete\n';
      }
      if (args[0] === 'run' && args.includes('--detach')) {
        return 'container-id\n';
      }
      return '';
    },
    spawnSync(command, args) {
      events.push({operation: 'spawn', command, args});
      if (args[0] === 'logs') {
        return {status: 0, signal: null, stdout: 'server ready\n', stderr: ''};
      }
      return {status: 0, signal: null, stdout: '', stderr: ''};
    },
    async requestJson(url) {
      events.push({operation: 'request', url});
      return discovery();
    },
  };
}

function eventPosition(events, predicate) {
  return events.findIndex(predicate);
}

async function testPublishedImageLifecycle() {
  const image = 'durableworkflow/server:9.9.9-test';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-catalog-lifecycle-'));
  try {
    const events = [];
    const result = await discoverPublishedServer(image, lifecycleOptions(tmpDir, events));
    const volumeCreatePosition = eventPosition(events, event => (
      event.operation === 'exec' && event.args[0] === 'volume' && event.args[1] === 'create'
    ));
    const bootstrapPosition = eventPosition(events, event => (
      event.operation === 'exec' && event.args.includes('server-bootstrap')
    ));
    const serverStartPosition = eventPosition(events, event => (
      event.operation === 'exec' && event.args[0] === 'run' && event.args.includes('--detach')
    ));
    const discoveryPosition = eventPosition(events, event => event.operation === 'request');

    for (const [label, position] of [
      ['isolated volume creation', volumeCreatePosition],
      ['server bootstrap', bootstrapPosition],
      ['server start', serverStartPosition],
      ['server discovery', discoveryPosition],
    ]) {
      assert.notStrictEqual(position, -1, `${label} must be exercised`);
    }
    assert(
      volumeCreatePosition < bootstrapPosition
        && bootstrapPosition < serverStartPosition
        && serverStartPosition < discoveryPosition,
      'the exact image must use isolated storage, bootstrap, start, and discovery in order',
    );

    const bootstrapArgs = events[bootstrapPosition].args;
    const serverStartArgs = events[serverStartPosition].args;
    const bootstrapMount = bootstrapArgs[bootstrapArgs.indexOf('--volume') + 1];
    const serverMount = serverStartArgs[serverStartArgs.indexOf('--volume') + 1];
    assert.strictEqual(bootstrapMount, serverMount, 'bootstrap and discovery must share SQLite storage');
    assert(bootstrapMount.endsWith(':/app/database'), 'shared SQLite storage must mount at /app/database');
    assert.deepStrictEqual(
      bootstrapArgs.slice(-2),
      [image, 'server-bootstrap'],
      'bootstrap must execute server-bootstrap from the exact candidate image',
    );
    assert.strictEqual(serverStartArgs[serverStartArgs.length - 1], image);
    assert.deepStrictEqual(result.discovery, discovery());
    assert.strictEqual(result.lifecycle.storage.kind, 'isolated_docker_volume');
    assert.strictEqual(result.lifecycle.bootstrap, 'pass');
    assert.strictEqual(result.lifecycle.discovery, 'pass');
    assert.strictEqual(result.lifecycle.cleanup.server_container.exit_code, 0);
    assert.strictEqual(result.lifecycle.cleanup.storage_volume.exit_code, 0);

    const failureEvents = [];
    let lifecycleError = null;
    try {
      await discoverPublishedServer(image, lifecycleOptions(tmpDir, failureEvents, true));
    } catch (error) {
      lifecycleError = error;
    }
    assert(lifecycleError instanceof CatalogLifecycleError);
    assert.strictEqual(lifecycleError.kind, 'server_bootstrap_failed');
    assert.strictEqual(lifecycleError.stage, 'server_bootstrap');
    assert(lifecycleError.message.includes('exit code 17'));
    assert(lifecycleError.message.includes('database migration failed'));
    assert.strictEqual(lifecycleError.lifecycle.bootstrap, 'fail');
    assert.strictEqual(lifecycleError.lifecycle.failed_stage, 'server_bootstrap');
    assert.strictEqual(lifecycleError.lifecycle.cleanup.storage_volume.exit_code, 0);
    assert(lifecycleError.diagnostics.bootstrap_log.tail.includes('database migration failed'));
    assert.strictEqual(
      eventPosition(failureEvents, event => (
        event.operation === 'exec' && event.args[0] === 'run' && event.args.includes('--detach')
      )),
      -1,
      'a failed bootstrap must prevent the API container from starting',
    );
    assert.strictEqual(
      eventPosition(failureEvents, event => event.operation === 'request'),
      -1,
      'a failed bootstrap must not be reported as discovery or catalog drift',
    );
    assert(failureEvents.some(event => (
      event.operation === 'spawn'
        && event.args[0] === 'volume'
        && event.args[1] === 'rm'
        && event.args.includes('-f')
    )), 'bootstrap failure must still clean up isolated storage');
  } finally {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
}

testPublishedImageLifecycle()
  .then(() => console.log('Published server protocol catalog drift and lifecycle checks passed.'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
