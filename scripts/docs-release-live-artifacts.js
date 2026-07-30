const path = require('path');
const helmRelease = require('../static/charts/release.json');

const GENERATED_RELEASE_INVARIANTS = Object.freeze([
  Object.freeze({
    path: Object.freeze(['docs_revision']),
    authority: 'docs_revision',
  }),
  Object.freeze({
    path: Object.freeze(['release_status_guardrail', 'stable_default_docs_version']),
    value: '1.x',
  }),
  Object.freeze({
    path: Object.freeze(['release_status_guardrail', 'explicit_prerelease_docs_version']),
    value: '2.0',
  }),
]);

const REQUIRED_LIVE_ARTIFACTS = Object.freeze([
  Object.freeze({
    route: '/docs-page-release-audit.json',
    scheduledInvariants: GENERATED_RELEASE_INVARIANTS,
  }),
  Object.freeze({
    route: '/docs-narrative-audit.json',
    scheduledInvariants: Object.freeze([
      ...GENERATED_RELEASE_INVARIANTS,
      Object.freeze({
        path: Object.freeze(['artifact_versions']),
        authority: 'published_artifact_versions',
      }),
    ]),
  }),
  Object.freeze({
    route: '/quickstart-execution-contract.json',
    repositorySource: 'static/quickstart-execution-contract.json',
  }),
  Object.freeze({
    route: '/compatibility-contract.json',
    repositorySource: 'static/compatibility-contract.json',
  }),
  Object.freeze({
    route: '/public-artifact-compatibility-evidence.json',
    repositorySource: 'static/public-artifact-compatibility-evidence.json',
  }),
  Object.freeze({
    route: '/charts/release.json',
    repositorySource: 'static/charts/release.json',
  }),
  Object.freeze({
    route: '/charts/provenance.json',
    scheduledInvariants: Object.freeze([
      Object.freeze({
        path: Object.freeze(['chart', 'version']),
        value: helmRelease.chart.version,
      }),
      Object.freeze({
        path: Object.freeze(['chart', 'app_version']),
        value: helmRelease.chart.app_version,
      }),
      Object.freeze({
        path: Object.freeze(['image', 'reference']),
        value: helmRelease.image.reference,
      }),
      Object.freeze({
        path: Object.freeze(['channels', 'oci', 'repository']),
        value: helmRelease.channels.oci.repository,
      }),
      Object.freeze({
        path: Object.freeze(['channels', 'https', 'repository']),
        value: helmRelease.channels.https.repository,
      }),
    ]),
  }),
]);

const REQUIRED_LIVE_ARTIFACT_PATHS = Object.freeze(
  REQUIRED_LIVE_ARTIFACTS.map(artifact => artifact.route),
);

function buildArtifactPath(repoRoot, artifact) {
  return path.join(repoRoot, 'build', artifact.route.slice(1));
}

function repositoryArtifactPath(repoRoot, artifact) {
  if (!artifact.repositorySource) {
    throw new Error(`${artifact.route} does not have a repository source`);
  }

  return path.join(repoRoot, artifact.repositorySource);
}

module.exports = {
  REQUIRED_LIVE_ARTIFACTS,
  REQUIRED_LIVE_ARTIFACT_PATHS,
  buildArtifactPath,
  repositoryArtifactPath,
};
