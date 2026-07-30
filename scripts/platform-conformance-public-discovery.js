const PLATFORM_CONFORMANCE_MANIFEST_PATH_PATTERN = /^static\/platform-conformance\/[^/]+\.json$/;
const PLATFORM_CONFORMANCE_PUBLIC_URL_PREFIX =
  'https://durable-workflow.github.io/platform-conformance/';
const STANDALONE_CONFORMANCE_AUTHORITY_PATHS = [
  'platform-conformance/php-sdk-conformance.json',
];

function stablePlatformConformanceDiscoveryEntries(contract) {
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

  for (const [name, authority] of Object.entries(contract.conformance_authorities || {})) {
    if (!authority || authority.status !== 'stable') {
      continue;
    }

    if (
      typeof authority.url !== 'string' ||
      !authority.url.startsWith(PLATFORM_CONFORMANCE_PUBLIC_URL_PREFIX)
    ) {
      throw new Error(
        `Stable conformance authority ${name} must use a public ` +
          `${PLATFORM_CONFORMANCE_PUBLIC_URL_PREFIX} URL`,
      );
    }

    const publicUrl = new URL(authority.url);
    const buildPath = publicUrl.pathname.replace(/^\//, '');
    if (!PLATFORM_CONFORMANCE_MANIFEST_PATH_PATTERN.test(`static/${buildPath}`)) {
      throw new Error(
        `Stable conformance authority ${name} URL must name one JSON contract ` +
          `directly under /platform-conformance/`,
      );
    }

    entriesByPath.set(buildPath, {
      path: publicUrl.pathname,
      buildPath,
    });
  }

  for (const buildPath of STANDALONE_CONFORMANCE_AUTHORITY_PATHS) {
    entriesByPath.set(buildPath, {
      path: `/${buildPath}`,
      buildPath,
    });
  }

  return [...entriesByPath.values()]
    .sort((left, right) => left.path.localeCompare(right.path));
}

module.exports = {
  stablePlatformConformanceDiscoveryEntries,
};
