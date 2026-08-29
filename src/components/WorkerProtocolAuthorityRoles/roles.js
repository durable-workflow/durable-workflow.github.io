const CURRENT_SERVER_ROLE = 'current_server_protocol';
const CURRENT_CONFORMANCE_ROLE = 'current_conformance_target';
const HISTORICAL_CONFORMANCE_ROLE = 'historical_conformance_binding';

const PUBLIC_CONFORMANCE_MANIFEST_URL =
  'https://durable-workflow.github.io/platform-conformance-contract.json';
const PUBLIC_PROTOCOL_PREFIX =
  'https://durable-workflow.github.io/platform-protocol-specs/';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function protocolVersionFromResolver(resolverUrl, label) {
  const match = /^https:\/\/durable-workflow\.github\.io\/platform-protocol-specs\/v(\d+\.\d+)\//
    .exec(requireString(resolverUrl, label));
  if (!match) {
    throw new Error(`${label} must use a versioned public protocol resolver`);
  }
  return match[1];
}

function protocolVersionFromHistoricalBinding(binding) {
  const resolverMatch = /\/platform-protocol-specs\/v(\d+\.\d+)\//
    .exec(binding.resolver_url || '');
  if (resolverMatch) return resolverMatch[1];

  const artifactMatch = /-protocol-(\d+\.\d+)-history$/
    .exec(binding.artifact_id || '');
  return artifactMatch ? artifactMatch[1] : null;
}

function currentBinding(contract, historyKey) {
  const history = requireRecord(
    contract.artifact_version_history?.[historyKey],
    `artifact_version_history.${historyKey}`,
  );
  const bindings = history.bindings;
  if (!Array.isArray(bindings)) {
    throw new Error(`artifact_version_history.${historyKey}.bindings must be an array`);
  }
  const current = bindings.filter(binding => binding?.status === 'current');
  if (current.length !== 1) {
    throw new Error(
      `artifact_version_history.${historyKey} must declare exactly one current binding`,
    );
  }
  return current[0];
}

function assertFixtureSourceMatches(binding, sources, label) {
  const matches = sources.filter(source => (
    source?.artifact_id === binding.artifact_id
    && source?.resolver_url === binding.resolver_url
    && source?.sha256 === binding.sha256
  ));
  if (matches.length !== 1) {
    throw new Error(`${label} must exactly match its current artifact-history binding`);
  }
}

function compareProtocolVersions(left, right) {
  const [leftMajor, leftMinor] = left.split('.').map(Number);
  const [rightMajor, rightMinor] = right.split('.').map(Number);
  return leftMajor - rightMajor || leftMinor - rightMinor;
}

function deriveWorkerProtocolAuthorityRoles({
  catalog,
  compatibilityContract,
  conformanceContract,
}) {
  requireRecord(catalog, 'platform protocol catalog');
  requireRecord(compatibilityContract, 'compatibility contract');
  requireRecord(conformanceContract, 'conformance contract');

  const apiEntry = requireRecord(
    catalog.specs?.worker_protocol_api,
    'catalog.specs.worker_protocol_api',
  );
  const streamEntry = requireRecord(
    catalog.specs?.worker_protocol_stream,
    'catalog.specs.worker_protocol_stream',
  );
  const serverProtocolVersion = requireString(
    compatibilityContract.surface_families?.worker_protocol?.negotiation
      ?.default_advertised_version,
    'worker_protocol.negotiation.default_advertised_version',
  );
  const serverApiUrl = requireString(
    apiEntry.spec_url,
    'catalog.specs.worker_protocol_api.spec_url',
  );
  const serverStreamUrl = requireString(
    streamEntry.spec_url,
    'catalog.specs.worker_protocol_stream.spec_url',
  );

  for (const [label, resolverUrl] of [
    ['current Server API resolver', serverApiUrl],
    ['current Server stream resolver', serverStreamUrl],
  ]) {
    if (
      !resolverUrl.startsWith(PUBLIC_PROTOCOL_PREFIX)
      || /\/platform-protocol-specs\/v\d+\.\d+\//.test(resolverUrl)
    ) {
      throw new Error(`${label} must use the unversioned public catalog target`);
    }
  }

  const currentApi = currentBinding(conformanceContract, 'worker_protocol_api');
  const currentStream = currentBinding(conformanceContract, 'worker_protocol_stream');
  const conformanceApiVersion = protocolVersionFromResolver(
    currentApi.resolver_url,
    'current conformance API resolver',
  );
  const conformanceStreamVersion = protocolVersionFromResolver(
    currentStream.resolver_url,
    'current conformance stream resolver',
  );
  if (conformanceApiVersion !== conformanceStreamVersion) {
    throw new Error('current conformance API and stream bindings must target one protocol version');
  }
  if (
    currentApi.suite_version !== conformanceContract.version
    || currentStream.suite_version !== conformanceContract.version
  ) {
    throw new Error('current conformance protocol bindings must target the current suite version');
  }

  const fixtureSources = conformanceContract.fixture_catalog
    ?.worker_task_lifecycle?.sources;
  if (!Array.isArray(fixtureSources)) {
    throw new Error('fixture_catalog.worker_task_lifecycle.sources must be an array');
  }
  assertFixtureSourceMatches(currentApi, fixtureSources, 'worker protocol API fixture source');
  assertFixtureSourceMatches(
    currentStream,
    fixtureSources,
    'worker protocol stream fixture source',
  );

  const apiBindings = conformanceContract.artifact_version_history
    .worker_protocol_api.bindings;
  const streamBindings = conformanceContract.artifact_version_history
    .worker_protocol_stream.bindings;
  const historicalBindings = [...apiBindings, ...streamBindings]
    .filter(binding => binding?.status === 'historical');
  const historicalProtocolVersions = [...new Set(
    historicalBindings
      .map(protocolVersionFromHistoricalBinding)
      .filter(Boolean),
  )].sort(compareProtocolVersions);

  return Object.freeze({
    currentServer: Object.freeze({
      role: CURRENT_SERVER_ROLE,
      protocolVersion: serverProtocolVersion,
      marker: 'worker_protocol.version',
      resolverRole: 'unversioned_server_mirror',
      apiUrl: serverApiUrl,
      streamUrl: serverStreamUrl,
    }),
    currentConformance: Object.freeze({
      role: CURRENT_CONFORMANCE_ROLE,
      protocolVersion: conformanceApiVersion,
      suiteVersion: conformanceContract.version,
      marker: 'artifact_version_history.*.status=current',
      resolverRole: 'versioned_conformance_fixture',
      apiUrl: currentApi.resolver_url,
      streamUrl: currentStream.resolver_url,
    }),
    historicalConformance: Object.freeze({
      role: HISTORICAL_CONFORMANCE_ROLE,
      marker: 'artifact_version_history.*.status=historical',
      resolverRole: 'immutable_digest_bound_fixture',
      manifestUrl: PUBLIC_CONFORMANCE_MANIFEST_URL,
      protocolVersions: Object.freeze(historicalProtocolVersions),
      bindingCount: historicalBindings.length,
    }),
  });
}

module.exports = {
  CURRENT_CONFORMANCE_ROLE,
  CURRENT_SERVER_ROLE,
  HISTORICAL_CONFORMANCE_ROLE,
  deriveWorkerProtocolAuthorityRoles,
};
