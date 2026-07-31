const PLATFORM_CONFORMANCE_MANIFEST_PATH_PATTERN = /^\/platform-conformance\/[^/]+\.json$/;
const PLATFORM_CONFORMANCE_PUBLIC_URL_PREFIX =
  'https://durable-workflow.github.io/platform-conformance/';
const IMMUTABLE_RUNTIME_MANIFEST_PATH_PATTERN =
  /^\/durable-workflow\/workflow\/[0-9a-f]{40}\/resources\/conformance\/suite-v[0-9]+\/platform-conformance\/([^/]+\.json)$/;

function stablePlatformConformanceDiscoveryEntries(contract) {
  const entriesByPath = new Map();

  for (const entry of Object.values(contract.fixture_catalog || {})) {
    if (!entry || entry.status !== 'stable' || !Array.isArray(entry.sources)) {
      continue;
    }

    for (const source of entry.sources) {
      let publicUrl;
      try {
        publicUrl = new URL(source?.resolver_url);
      } catch (error) {
        continue;
      }

      let pathname = publicUrl.pathname;
      if (publicUrl.origin === 'https://raw.githubusercontent.com') {
        const runtimeMatch = pathname.match(IMMUTABLE_RUNTIME_MANIFEST_PATH_PATTERN);
        if (!runtimeMatch) {
          continue;
        }

        pathname = `/platform-conformance/${runtimeMatch[1]}`;
      } else if (
        publicUrl.origin !== 'https://durable-workflow.github.io' ||
        !PLATFORM_CONFORMANCE_MANIFEST_PATH_PATTERN.test(pathname)
      ) {
        continue;
      }

      const buildPath = pathname.replace(/^\//, '');

      entriesByPath.set(buildPath, {
        path: pathname,
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
    if (!PLATFORM_CONFORMANCE_MANIFEST_PATH_PATTERN.test(publicUrl.pathname)) {
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

  return [...entriesByPath.values()]
    .sort((left, right) => left.path.localeCompare(right.path));
}

module.exports = {
  stablePlatformConformanceDiscoveryEntries,
};
