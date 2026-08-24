const assert = require('assert');

const {
  ARTIFACT_RELEASE_POLICY,
  PUBLISHED_ARTIFACT_VERSIONS,
  PYTHON_PACKAGE_AUTHORITY,
  QUALIFIED_PYTHON_PACKAGE_AUTHORITY,
  buildPythonPackageAuthority,
} = require('./public-artifact-versions');
const {
  assertCurrentDocSource,
  assertPipReport,
  assertPypiReleaseMetadata,
  assertPythonDistributionSurfaces,
  assertSdkNeutralityPackageAuthority,
  fetchJson,
  pipPackageRequirement,
  pipSelectionArguments,
} = require('./check-python-package-release');

const currentMetadata = {
  info: {
    name: 'durable-workflow',
    version: PYTHON_PACKAGE_AUTHORITY.registryVersion,
  },
  urls: [{
    filename: `durable_workflow-${PYTHON_PACKAGE_AUTHORITY.registryVersion}-py3-none-any.whl`,
    url: `https://files.pythonhosted.org/${PYTHON_PACKAGE_AUTHORITY.registryVersion}.whl`,
    yanked: false,
  }],
};

assert.doesNotThrow(() => assertPypiReleaseMetadata(currentMetadata));
assert.doesNotThrow(() => assertPythonDistributionSurfaces());
assert.doesNotThrow(() => assertPipReport({
  install: [{metadata: {name: 'durable_workflow', version: PYTHON_PACKAGE_AUTHORITY.registryVersion}}],
}));

assert.throws(
  () => assertPypiReleaseMetadata({
    ...currentMetadata,
    info: {...currentMetadata.info, version: '0.4.106'},
  }),
  /must be .*got 0\.4\.106/,
  'unversioned PyPI 0.x metadata must not satisfy the prerelease authority',
);
assert.throws(
  () => assertPypiReleaseMetadata({...currentMetadata, urls: []}),
  /no non-yanked installable distribution/,
  'a release without installable files must fail the package audit',
);
assert.throws(
  () => assertPipReport({install: [{metadata: {name: 'durable-workflow', version: '0.4.106'}}]}),
  /pip selected 0\.4\.106/,
  'pip selection must match the centralized published tuple',
);

assert.doesNotThrow(() => assertCurrentDocSource(
  'docs/example.md',
  '<PythonPackageReleaseLink authority="qualified">Qualified Python %%artifact.pythonSdkVersion%% release</PythonPackageReleaseLink>',
  QUALIFIED_PYTHON_PACKAGE_AUTHORITY,
  'qualified',
));
assert.doesNotThrow(() => assertCurrentDocSource(
  'docs/quickstart.md',
  '<PythonPackageReleaseLink authority="qualified">Qualified Python %%artifact.pythonSdkVersion%% release</PythonPackageReleaseLink>',
  QUALIFIED_PYTHON_PACKAGE_AUTHORITY,
  'qualified',
));
assert.throws(
  () => assertCurrentDocSource(
    'docs/quickstart.md',
    '<PythonPackageReleaseLink>Current Python %%artifact.pythonPublishedSdkVersion%% release</PythonPackageReleaseLink>',
    QUALIFIED_PYTHON_PACKAGE_AUTHORITY,
    'qualified',
  ),
  /centralized Python package authority component/,
  'the quickstart must opt into the qualified release link explicitly',
);
assert.throws(
  () => assertCurrentDocSource(
    'docs/example.md',
    '[Python package](https://pypi.org/project/durable-workflow/)',
  ),
  /centralized Python package authority component/,
  'docs must not hand-maintain the canonical PyPI project page',
);

const stablePolicy = {
  ...ARTIFACT_RELEASE_POLICY,
  release_phase: 'stable',
  authorized_channels: ['alpha', 'beta', 'rc', 'stable'],
};
const stableVersions = {...PUBLISHED_ARTIFACT_VERSIONS, 'sdk-python': '2.0.0'};
const stableAuthority = buildPythonPackageAuthority(stableVersions, stablePolicy);
assert.strictEqual(stableAuthority.authorityUrl, stableAuthority.canonicalProjectUrl);
assert.strictEqual(stableAuthority.registryVersion, '2.0.0');
const stablePipArguments = pipSelectionArguments(stableAuthority, 'pip-report.json');
assert.strictEqual(pipPackageRequirement(stableAuthority), 'durable-workflow');
assert.strictEqual(stablePipArguments.at(-1), 'durable-workflow');
assert(!stablePipArguments.includes('--pre'), 'stable launch must exercise normal unpinned pip selection');
const prereleasePipArguments = pipSelectionArguments(
  PYTHON_PACKAGE_AUTHORITY,
  'pip-report.json',
);
assert.strictEqual(
  pipPackageRequirement(PYTHON_PACKAGE_AUTHORITY),
  `durable-workflow==${PYTHON_PACKAGE_AUTHORITY.registryVersion}`,
);
assert.strictEqual(
  prereleasePipArguments.at(-1),
  `durable-workflow==${PYTHON_PACKAGE_AUTHORITY.registryVersion}`,
);
assert(prereleasePipArguments.includes('--pre'));
assert.doesNotThrow(() => assertPypiReleaseMetadata({
  info: {name: 'durable-workflow', version: '2.0.0'},
  urls: [{filename: 'durable_workflow-2.0.0-py3-none-any.whl', url: 'https://files.pythonhosted.org/2.0.0.whl'}],
}, stableAuthority));

const projectedContract = {
  sdk_breadth_policy: {
    first_party: {
      python_sdk: {
        package_url: PYTHON_PACKAGE_AUTHORITY.authorityUrl,
        package_version: PYTHON_PACKAGE_AUTHORITY.version,
        registry_version: PYTHON_PACKAGE_AUTHORITY.registryVersion,
        exact_release_url: PYTHON_PACKAGE_AUTHORITY.exactReleaseUrl,
        exact_release_json_url: PYTHON_PACKAGE_AUTHORITY.exactReleaseJsonUrl,
        canonical_project_url: PYTHON_PACKAGE_AUTHORITY.canonicalProjectUrl,
        canonical_project_url_role: 'project_identity_only',
      },
    },
  },
};
assert.doesNotThrow(() => assertSdkNeutralityPackageAuthority(projectedContract));
const staleContract = JSON.parse(JSON.stringify(projectedContract));
staleContract.sdk_breadth_policy.first_party.python_sdk.package_url =
  PYTHON_PACKAGE_AUTHORITY.canonicalProjectUrl;
assert.throws(
  () => assertSdkNeutralityPackageAuthority(staleContract),
  /package_url must be/,
  'the prerelease machine contract must reject the unversioned package authority',
);

async function assertTransientRegistryRetries() {
  const url = 'https://pypi.example.test/pypi/durable-workflow/2.0.0rc35/json';
  const success = {
    body: JSON.stringify(currentMetadata),
    status: 200,
  };
  const retryOptions = {
    maxAttempts: 3,
    retryDelayMs: 0,
    onRetry: () => {},
  };

  let timeoutAttempts = 0;
  assert.deepStrictEqual(
    await fetchJson(url, {
      requestOnce: async () => {
        timeoutAttempts += 1;
        if (timeoutAttempts === 1) {
          const error = new Error('metadata request timed out');
          error.code = 'ETIMEDOUT';
          throw error;
        }
        return success;
      },
      retryOptions,
    }),
    currentMetadata,
    'a transient PyPI timeout must recover without a workflow rerun',
  );
  assert.strictEqual(timeoutAttempts, 2);

  let httpAttempts = 0;
  assert.deepStrictEqual(
    await fetchJson(url, {
      requestOnce: async () => {
        httpAttempts += 1;
        return httpAttempts === 1
          ? {body: 'temporarily unavailable', status: 503}
          : success;
      },
      retryOptions,
    }),
    currentMetadata,
    'a transient PyPI HTTP response must recover within the bounded budget',
  );
  assert.strictEqual(httpAttempts, 2);

  let deterministicAttempts = 0;
  await assert.rejects(
    () => fetchJson(url, {
      requestOnce: async () => {
        deterministicAttempts += 1;
        return {body: 'not found', status: 404};
      },
      retryOptions,
    }),
    /returned HTTP 404/,
    'a deterministic PyPI response must fail without retrying',
  );
  assert.strictEqual(deterministicAttempts, 1);

  let schemaAttempts = 0;
  await assert.rejects(
    () => fetchJson(url, {
      requestOnce: async () => {
        schemaAttempts += 1;
        return {body: 'not-json', status: 200};
      },
      retryOptions,
    }),
    /did not return JSON/,
    'invalid registry metadata must not be classified as transient',
  );
  assert.strictEqual(schemaAttempts, 1);

  let exhaustedAttempts = 0;
  await assert.rejects(
    () => fetchJson(url, {
      requestOnce: async () => {
        exhaustedAttempts += 1;
        return {body: 'still unavailable', status: 503};
      },
      retryOptions,
    }),
    error => {
      assert.match(error.message, /after 3 attempts/);
      assert(
        error.message.includes(url),
        'the exhausted registry error must identify the final URL',
      );
      assert.match(error.message, /final failure: HTTP 503/);
      return true;
    },
    'exhausted PyPI retries must report the attempt count, URL, and final status',
  );
  assert.strictEqual(exhaustedAttempts, 3);
}

assertTransientRegistryRetries().then(() => {
  console.log('Python package release authority tests passed.');
}).catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
