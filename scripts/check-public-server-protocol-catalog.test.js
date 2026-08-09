const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const catalog = require('../static/platform-protocol-specs.json');
const {
  CatalogConformanceError,
  CatalogLifecycleError,
  buildPublishedServerProtocolAuthority,
  catalogSha256,
  classifyCatalogDeployment,
  deploymentStates,
  discoverPublishedServer,
  qualifiedServerIdentity,
  qualifiedServerSourceCommit,
  verifySnapshots,
  workflowProvenanceFromComposerLock,
  writeDeploymentSummary,
} = require('./check-public-server-protocol-catalog');

const provenance = {
  source: 'https://github.com/durable-workflow/workflow.git',
  ref: '2.0.0-rc.8',
  commit: 'dc7b98ebf811f30fcf43e1f1c7b66021a10878d0',
};
const qualifiedWorkflowArtifactRef = '2.0.0-rc.12';
const composerLock = {
  packages: [
    {
      name: 'durable-workflow/workflow',
      version: provenance.ref,
      source: {
        type: 'git',
        url: provenance.source,
        reference: provenance.commit,
      },
    },
  ],
  'packages-dev': [],
};
const expectedWorkflowProvenance = workflowProvenanceFromComposerLock(composerLock);

function discovery(protocolCatalog = catalog, packageProvenance = provenance) {
  return {
    platform_protocol_specs: protocolCatalog,
    package_provenance: packageProvenance,
  };
}

assert.notStrictEqual(
  expectedWorkflowProvenance.ref,
  qualifiedWorkflowArtifactRef,
  'the qualified mixed tuple must distinguish Server internals from standalone Workflow',
);
const passing = verifySnapshots(catalog, discovery(), expectedWorkflowProvenance);
assert.strictEqual(passing.schema, 'durable-workflow.v2.platform-protocol-specs.catalog');
assert.strictEqual(passing.version, 16);
assert.strictEqual(passing.capability_records, 16);
assert.strictEqual(passing.expected_workflow_package_ref, provenance.ref);
assert.deepStrictEqual(passing.expected_workflow_package_provenance, provenance);
assert.deepStrictEqual(passing.package_provenance, provenance);
assert.strictEqual(passing.deployment.state, deploymentStates.deployable);
assert.strictEqual(passing.deployment.structural_check.mode, 'exact_equality');

const priorCatalog = JSON.parse(JSON.stringify(catalog));
priorCatalog.version -= 1;
priorCatalog.specs.worker_protocol_api.object_families =
  priorCatalog.specs.worker_protocol_api.object_families.filter(
    family => family.name !== 'worker_deregistration_result',
  );
priorCatalog.specs.worker_protocol_api.description =
  'Qualified worker protocol description before the additive lifecycle surface.';

const forwardDeployment = classifyCatalogDeployment(catalog, priorCatalog, {
  allowForwardCandidate: true,
});
assert.strictEqual(forwardDeployment.state, deploymentStates.forwardCandidate);
assert.strictEqual(forwardDeployment.docs_catalog_version, 16);
assert.strictEqual(forwardDeployment.published_server_catalog_version, 15);
assert.deepStrictEqual(forwardDeployment.structural_check.added_specs, []);
assert.deepStrictEqual(
  forwardDeployment.structural_check.added_object_families,
  [{
    spec: 'worker_protocol_api',
    name: 'worker_deregistration_result',
    owner_repo: 'durable-workflow/server',
  }],
);
assert.deepStrictEqual(
  forwardDeployment.structural_check.description_updates,
  ['worker_protocol_api'],
);

const forwardObservation = verifySnapshots(
  catalog,
  discovery(priorCatalog),
  expectedWorkflowProvenance,
  {allowForwardCandidate: true},
);
assert.strictEqual(forwardObservation.deployment.state, deploymentStates.forwardCandidate);

const summaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-catalog-summary-'));
try {
  const summaryPath = path.join(summaryDirectory, 'summary.md');
  writeDeploymentSummary(
    summaryPath,
    forwardDeployment,
    'public-server-protocol-catalog-conformance.json',
  );
  const summary = fs.readFileSync(summaryPath, 'utf8');
  assert(summary.includes(deploymentStates.forwardCandidate));
  assert(summary.includes('`16`'));
  assert(summary.includes('`15`'));
  assert(summary.includes('`worker_protocol_api:worker_deregistration_result`'));
  assert(summary.includes('public-server-protocol-catalog-conformance.json'));
  assert(summary.includes('without changing the qualified aggregate artifact recommendation'));
} finally {
  fs.rmSync(summaryDirectory, {recursive: true, force: true});
}

function assertForwardCandidateRejected(publicCandidate, serverCandidate, kind, message) {
  assert.throws(
    () => classifyCatalogDeployment(publicCandidate, serverCandidate, {
      allowForwardCandidate: true,
    }),
    error => error instanceof CatalogConformanceError
      && error.findings.some(finding => finding.kind === kind),
    message,
  );
}

const sameRevisionDrift = JSON.parse(JSON.stringify(priorCatalog));
sameRevisionDrift.specs.worker_protocol_api.status = 'in_progress';
assertForwardCandidateRejected(
  sameRevisionDrift,
  priorCatalog,
  'catalog_same_revision_drift',
  'same-revision drift must not qualify as a forward source candidate',
);

const backwardCandidate = JSON.parse(JSON.stringify(priorCatalog));
backwardCandidate.version -= 1;
assertForwardCandidateRejected(
  backwardCandidate,
  priorCatalog,
  'catalog_backward_revision',
  'a docs catalog behind the published Server must fail closed',
);

const jumpedCandidate = JSON.parse(JSON.stringify(catalog));
jumpedCandidate.version += 1;
assertForwardCandidateRejected(
  jumpedCandidate,
  priorCatalog,
  'catalog_revision_jump',
  'a forward candidate may advance exactly one catalog revision only',
);

const removalCandidate = JSON.parse(JSON.stringify(catalog));
delete removalCandidate.specs.control_plane_api;
assertForwardCandidateRejected(
  removalCandidate,
  priorCatalog,
  'catalog_spec_removed',
  'a forward catalog candidate must preserve every prior spec',
);

const mutationCandidate = JSON.parse(JSON.stringify(catalog));
mutationCandidate.specs.worker_protocol_api.format = 'json_schema';
assertForwardCandidateRejected(
  mutationCandidate,
  priorCatalog,
  'catalog_entry_value_drift',
  'an additive family must not mask changed prior spec metadata',
);

const nonAdditiveCandidate = JSON.parse(JSON.stringify(priorCatalog));
nonAdditiveCandidate.version += 1;
nonAdditiveCandidate.specs.worker_protocol_api.description =
  'Changed description without a machine-readable protocol addition.';
assertForwardCandidateRejected(
  nonAdditiveCandidate,
  priorCatalog,
  'catalog_forward_candidate_non_additive',
  'a version increment without added protocol surface must fail closed',
);

assert.throws(
  () => workflowProvenanceFromComposerLock({packages: []}),
  /exactly one durable-workflow\/workflow package/,
  'Server authority source must lock one Workflow package',
);

const artifactVersions = require('./public-artifact-versions.json').artifacts;
const compatibilityEvidence = require('../static/public-artifact-compatibility-evidence.json');
const qualifiedServer = qualifiedServerIdentity(artifactVersions, compatibilityEvidence);
assert.strictEqual(
  qualifiedServerSourceCommit(artifactVersions, compatibilityEvidence),
  compatibilityEvidence.sdk_server_compatibility['sdk-php'].server_source_commit,
  'Server source must come from exact aggregate qualification evidence',
);
assert.strictEqual(
  qualifiedServer.expectedDigest,
  `sha256:${compatibilityEvidence.sdk_server_compatibility['sdk-php']
    .server_distribution.artifacts[0].sha256}`,
  'Server manifest digest must come from exact aggregate qualification evidence',
);
assert.strictEqual(
  qualifiedServer.immutableReference,
  `${qualifiedServer.repository}@${qualifiedServer.expectedDigest}`,
  'qualified Server identity must expose an immutable OCI reference',
);

const publishedServerVersion = '2.0.0-rc.19';
const publishedServerDigest = `sha256:${'9'.repeat(64)}`;
const publishedServerSourceCommit = '8'.repeat(40);
const publishedServerEvidence = {
  schema: 'durable-workflow.docs.public-server-protocol-catalog-conformance',
  schema_version: 3,
  outcome: 'pass',
  server_version: publishedServerVersion,
  server_source_ref: publishedServerVersion,
  published_server_source_commit: publishedServerSourceCommit,
  server_image: `durableworkflow/server:${publishedServerVersion}`,
  expected_server_image_digest: publishedServerDigest,
  observed_server_image_digest: publishedServerDigest,
  immutable_server_image: `durableworkflow/server@${publishedServerDigest}`,
  lifecycle: {
    image_identity: {
      verification: 'pass',
      expected_digest: publishedServerDigest,
      observed_digest: publishedServerDigest,
      mirror_digest: publishedServerDigest,
      expected_source_commit: publishedServerSourceCommit,
      observed_source_commit: publishedServerSourceCommit,
      mirror_source_commit: publishedServerSourceCommit,
    },
  },
  expected_workflow_package_provenance: {...provenance},
  observation: {package_provenance: {...provenance}},
  observed_server_catalog: {
    schema: catalog.schema,
    version: catalog.version,
    sha256: catalogSha256(catalog),
  },
};
const publishedServerAuthority = buildPublishedServerProtocolAuthority(
  publishedServerEvidence,
  publishedServerVersion,
  catalog,
);
assert.notStrictEqual(
  publishedServerAuthority.server_version,
  qualifiedServer.version,
  'public catalog authority may advance independently of the recommended aggregate Server',
);
assert.strictEqual(publishedServerAuthority.catalog.version, 16);
assert.strictEqual(
  publishedServerAuthority.server_image_digest,
  publishedServerDigest,
);
for (const [label, mutate, expected] of [
  [
    'retargeted image',
    evidence => {
      evidence.observed_server_image_digest = `sha256:${'7'.repeat(64)}`;
    },
    /matching immutable OCI digest/,
  ],
  [
    'different embedded package',
    evidence => {
      evidence.observation.package_provenance.commit = '6'.repeat(40);
    },
    /package provenance must match/,
  ],
  [
    'different image source label',
    evidence => {
      evidence.lifecycle.image_identity.mirror_source_commit = '5'.repeat(40);
    },
    /source checkout and image labels must agree/,
  ],
  [
    'different observed catalog',
    evidence => {
      evidence.observed_server_catalog.version -= 1;
    },
    /observed catalog must match/,
  ],
]) {
  const fixture = structuredClone(publishedServerEvidence);
  mutate(fixture);
  assert.throws(
    () => buildPublishedServerProtocolAuthority(
      fixture,
      publishedServerVersion,
      catalog,
    ),
    expected,
    `${label} must fail published Server protocol authority qualification`,
  );
}

const stableProvenance = {
  ...provenance,
  ref: '2.0.0',
};
assert.throws(
  () => verifySnapshots(
    catalog,
    discovery(catalog, stableProvenance),
    stableProvenance,
  ),
  error => error instanceof CatalogConformanceError
    && error.findings.some(finding => (
      finding.kind === 'workflow_package_version_invalid'
        && finding.actual === stableProvenance.ref
    )),
  'stable Workflow provenance must wait for release-phase authorization',
);

const staleCatalog = JSON.parse(JSON.stringify(catalog));
staleCatalog.version = 14;
assert.throws(
  () => verifySnapshots(catalog, discovery(staleCatalog), expectedWorkflowProvenance),
  error => error instanceof CatalogConformanceError
    && error.findings.some(finding => finding.kind === 'value_mismatch'
      && finding.path === '$.version'
      && finding.public_value === 16
      && finding.server_value === 14),
  'server catalog version drift must identify both observed versions',
);

const unsafeCatalog = JSON.parse(JSON.stringify(catalog));
unsafeCatalog.specs.control_plane_api.spec_path = 'tests/Feature/ControlPlaneTest.php';
assert.throws(
  () => verifySnapshots(catalog, discovery(unsafeCatalog), expectedWorkflowProvenance),
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
  }), expectedWorkflowProvenance),
  error => error instanceof CatalogConformanceError
    && error.findings.some(finding => finding.kind === 'workflow_package_commit_invalid'),
  'image provenance must name a full Workflow source revision',
);

const differentValidWorkflowRef = '2.0.0-rc.7';
assert.throws(
  () => verifySnapshots(catalog, discovery(catalog, {
    ...provenance,
    ref: differentValidWorkflowRef,
  }), expectedWorkflowProvenance),
  error => error instanceof CatalogConformanceError
    && error.findings.some(finding => finding.kind === 'workflow_package_version_mismatch'
      && finding.path === '$.package_provenance.ref'
      && finding.expected === expectedWorkflowProvenance.ref
      && finding.actual === differentValidWorkflowRef),
  'image provenance must match the Workflow version locked by Server',
);

assert.throws(
  () => verifySnapshots(catalog, discovery(catalog, {
    ...provenance,
    commit: 'e'.repeat(40),
  }), expectedWorkflowProvenance),
  error => error instanceof CatalogConformanceError
    && error.findings.some(finding => finding.kind === 'workflow_package_commit_mismatch'
      && finding.path === '$.package_provenance.commit'
      && finding.expected === provenance.commit
      && finding.actual === 'e'.repeat(40)),
  'image provenance must match the Workflow source revision locked by Server',
);

function lifecycleOptions(
  tmpDir,
  events,
  failBootstrap = false,
  observedDigest = qualifiedServer.expectedDigest,
) {
  return {
    identifier: failBootstrap ? 'bootstrap-failure-test' : 'ordering-test',
    attempts: 1,
    retryDelayMs: 0,
    expectedImageDigest: qualifiedServer.expectedDigest,
    expectedSourceCommit: qualifiedServer.sourceCommit,
    immutableServerImage: qualifiedServer.immutableReference,
    bootstrapLogPath: path.join(tmpDir, 'bootstrap.log'),
    serverLogPath: path.join(tmpDir, 'server.log'),
    execFileSync(command, args) {
      events.push({operation: 'exec', command, args});
      if (args[0] === 'image' && args[1] === 'inspect') {
        if (args.includes('{{json .Config.Labels}}')) {
          return JSON.stringify({
            'org.opencontainers.image.revision': qualifiedServer.sourceCommit,
          });
        }
        return JSON.stringify([`durableworkflow/server@${observedDigest}`]);
      }
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
  const image = `${qualifiedServer.repository}:retargetable-test`;
  const mirrorImage = 'ghcr.io/durable-workflow/server:retargetable-test';
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
    const imageIdentityPosition = eventPosition(events, event => (
      event.operation === 'exec' && event.args[0] === 'image' && event.args[1] === 'inspect'
    ));
    const serverStartPosition = eventPosition(events, event => (
      event.operation === 'exec' && event.args[0] === 'run' && event.args.includes('--detach')
    ));
    const discoveryPosition = eventPosition(events, event => event.operation === 'request');

    for (const [label, position] of [
      ['isolated volume creation', volumeCreatePosition],
      ['image identity verification', imageIdentityPosition],
      ['server bootstrap', bootstrapPosition],
      ['server start', serverStartPosition],
      ['server discovery', discoveryPosition],
    ]) {
      assert.notStrictEqual(position, -1, `${label} must be exercised`);
    }
    assert(
      imageIdentityPosition < volumeCreatePosition
        && volumeCreatePosition < bootstrapPosition
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
      [qualifiedServer.immutableReference, 'server-bootstrap'],
      'bootstrap must execute server-bootstrap from the qualified immutable image',
    );
    assert.strictEqual(
      serverStartArgs[serverStartArgs.length - 1],
      qualifiedServer.immutableReference,
    );
    assert.deepStrictEqual(result.discovery, discovery());
    assert.strictEqual(
      result.lifecycle.image_identity.expected_digest,
      qualifiedServer.expectedDigest,
    );
    assert.strictEqual(
      result.lifecycle.image_identity.observed_digest,
      qualifiedServer.expectedDigest,
    );
    assert.strictEqual(
      result.lifecycle.image_identity.immutable_reference,
      qualifiedServer.immutableReference,
    );
    assert.strictEqual(result.lifecycle.image_identity.verification, 'pass');
    assert.strictEqual(result.lifecycle.storage.kind, 'isolated_docker_volume');
    assert.strictEqual(result.lifecycle.bootstrap, 'pass');
    assert.strictEqual(result.lifecycle.discovery, 'pass');
    assert.strictEqual(result.lifecycle.cleanup.server_container.exit_code, 0);
    assert.strictEqual(result.lifecycle.cleanup.storage_volume.exit_code, 0);

    function publishedAuthorityLifecycleOptions(
      authorityEvents,
      mirrorDigest = qualifiedServer.expectedDigest,
      mirrorSourceCommit = qualifiedServer.sourceCommit,
    ) {
      const options = lifecycleOptions(tmpDir, authorityEvents);
      delete options.expectedImageDigest;
      delete options.immutableServerImage;
      options.mirrorServerImage = mirrorImage;
      options.expectedSourceCommit = qualifiedServer.sourceCommit;
      const baseExec = options.execFileSync;
      options.execFileSync = (command, args) => {
        if (args[0] === 'image' && args[1] === 'inspect') {
          authorityEvents.push({operation: 'exec', command, args});
          const selector = args.at(-1);
          if (args.includes('{{json .Config.Labels}}')) {
            return JSON.stringify({
              'org.opencontainers.image.revision': selector === mirrorImage
                ? mirrorSourceCommit
                : qualifiedServer.sourceCommit,
            });
          }
          const repository = selector === mirrorImage
            ? 'ghcr.io/durable-workflow/server'
            : qualifiedServer.repository;
          const digest = selector === mirrorImage
            ? mirrorDigest
            : qualifiedServer.expectedDigest;
          return JSON.stringify([`${repository}@${digest}`]);
        }
        return baseExec(command, args);
      };
      return options;
    }

    const publishedAuthorityEvents = [];
    const publishedAuthorityResult = await discoverPublishedServer(
      image,
      publishedAuthorityLifecycleOptions(publishedAuthorityEvents),
    );
    assert.strictEqual(
      publishedAuthorityResult.lifecycle.image_identity.expected_digest,
      qualifiedServer.expectedDigest,
      'matching public registries must bind the observed digest for immutable execution',
    );
    assert.strictEqual(
      publishedAuthorityResult.lifecycle.image_identity.mirror_digest,
      qualifiedServer.expectedDigest,
    );
    assert.strictEqual(
      publishedAuthorityResult.lifecycle.image_identity.observed_source_commit,
      qualifiedServer.sourceCommit,
    );
    assert.strictEqual(
      publishedAuthorityResult.lifecycle.image_identity.mirror_source_commit,
      qualifiedServer.sourceCommit,
    );

    for (const [label, options, expectedKind] of [
      [
        'registry digest disagreement',
        publishedAuthorityLifecycleOptions(
          [],
          `sha256:${'5'.repeat(64)}`,
        ),
        'server_image_registry_digest_mismatch',
      ],
      [
        'registry source disagreement',
        publishedAuthorityLifecycleOptions(
          [],
          qualifiedServer.expectedDigest,
          '4'.repeat(40),
        ),
        'server_image_registry_source_mismatch',
      ],
    ]) {
      await assert.rejects(
        () => discoverPublishedServer(image, options),
        error => error instanceof CatalogLifecycleError
          && error.kind === expectedKind,
        `${label} must fail closed before starting the Server`,
      );
    }

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

    const movedDigest = `sha256:${'f'.repeat(64)}`;
    const retargetedEvents = [];
    let identityError = null;
    try {
      await discoverPublishedServer(
        image,
        lifecycleOptions(tmpDir, retargetedEvents, false, movedDigest),
      );
    } catch (error) {
      identityError = error;
    }
    assert(identityError instanceof CatalogLifecycleError);
    assert.strictEqual(identityError.kind, 'server_image_digest_mismatch');
    assert.strictEqual(identityError.stage, 'image_identity');
    assert.strictEqual(
      identityError.lifecycle.image_identity.expected_digest,
      qualifiedServer.expectedDigest,
    );
    assert.strictEqual(identityError.lifecycle.image_identity.observed_digest, movedDigest);
    assert.strictEqual(
      identityError.lifecycle.image_identity.immutable_reference,
      qualifiedServer.immutableReference,
    );
    assert.strictEqual(identityError.lifecycle.image_identity.verification, 'fail');
    assert.strictEqual(
      eventPosition(retargetedEvents, event => (
        event.operation === 'exec' && event.args[0] === 'volume'
      )),
      -1,
      'a retargeted version tag must fail before storage or bootstrap begins',
    );
    assert.strictEqual(
      eventPosition(retargetedEvents, event => event.operation === 'request'),
      -1,
      'matching catalog and package provenance must not mask a retargeted image tag',
    );
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
