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
  '<PythonPackageReleaseLink>Current Python %%artifact.pythonPublishedSdkVersion%% release</PythonPackageReleaseLink>',
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
  'current docs must not link directly to the canonical PyPI project page',
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

console.log('Python package release authority tests passed.');
