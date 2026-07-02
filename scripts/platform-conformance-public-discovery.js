const PLATFORM_CONFORMANCE_MANIFEST_PATH_PATTERN = /^static\/platform-conformance\/[^/]+\.json$/;

function stableRuntimeScenarioDiscoveryEntries(contract) {
  const entriesByPath = new Map();

  for (const entry of Object.values(contract.fixture_catalog || {})) {
    if (!entry || entry.status !== 'stable' || !Array.isArray(entry.sources)) {
      continue;
    }

    for (const source of entry.sources) {
      if (
        !source ||
        source.repository !== 'durable-workflow.github.io' ||
        !PLATFORM_CONFORMANCE_MANIFEST_PATH_PATTERN.test(source.path || '')
      ) {
        continue;
      }

      const buildPath = source.path.slice('static/'.length);

      entriesByPath.set(buildPath, {
        path: `/${buildPath}`,
        buildPath,
      });
    }
  }

  return [...entriesByPath.values()]
    .sort((left, right) => left.path.localeCompare(right.path));
}

module.exports = {
  stableRuntimeScenarioDiscoveryEntries,
};
