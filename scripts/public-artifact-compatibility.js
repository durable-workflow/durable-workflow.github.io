const crypto = require('crypto');

const artifactCompatibilityEvidenceSource =
  require('../static/public-artifact-compatibility-evidence.json');
const {
  ARTIFACT_RELEASE_POLICY,
  ARTIFACT_VERSION_SCHEMA,
  REQUIRED_ARTIFACTS,
  readArtifactVersions,
} = require('./public-artifact-versions');

const ARTIFACT_COMPATIBILITY_EVIDENCE_SCHEMA =
  'durable-workflow.docs.public-artifact-compatibility-evidence';
const PRODUCT_TRAIN_SCHEMA = 'durable-workflow.product-train/v2';
const RELEASE_PLAN_SCHEMA = 'durable-workflow.release-plan/v2';
const REQUIRED_SDK_ARTIFACTS = Object.freeze(['sdk-php', 'sdk-python', 'sdk-rust']);
const PRODUCT_TRAIN_AUTHORITY_URL =
  'https://raw.githubusercontent.com/durable-workflow/.github/main/product-train/current.json';

function sha256(source) {
  return crypto.createHash('sha256').update(source).digest('hex');
}

function parseJsonSource(source, label) {
  if (typeof source !== 'string' || source === '') {
    throw new Error(`${label} must be non-empty JSON text`);
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value || {}).sort();
  const sortedExpected = [...expected].sort();

  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
    throw new Error(
      `${label} keys must be exactly ${sortedExpected.join(', ')}; got ${actual.join(', ')}`,
    );
  }
}

function readQualifiedProductTrain(source, sourceUrl = PRODUCT_TRAIN_AUTHORITY_URL) {
  const productTrain = parseJsonSource(source, 'product-train compatibility authority');

  if (productTrain.schema !== PRODUCT_TRAIN_SCHEMA) {
    throw new Error(
      `product-train compatibility authority schema must be ${PRODUCT_TRAIN_SCHEMA}`,
    );
  }
  if (typeof productTrain.current !== 'string' || productTrain.current === '') {
    throw new Error('product-train compatibility authority must identify its current train');
  }

  const train = productTrain.trains?.[productTrain.current];
  if (!train || train.status !== 'supported') {
    throw new Error(
      `product-train compatibility authority current train ${productTrain.current} must be supported`,
    );
  }

  const versions = readArtifactVersions({
    schema: ARTIFACT_VERSION_SCHEMA,
    schemaVersion: 1,
    artifacts: train.versions,
  });
  const releasePlan = train.release_plan;

  if (
    !releasePlan
    || typeof releasePlan.tag !== 'string'
    || !/^release-plan\/[a-z0-9][a-z0-9-]{2,79}$/.test(releasePlan.tag)
    || typeof releasePlan.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(releasePlan.sha256)
  ) {
    throw new Error(
      `product-train compatibility authority current train ${productTrain.current} ` +
        'must bind an immutable release-plan tag and SHA-256',
    );
  }

  return Object.freeze({
    current: productTrain.current,
    releasePlan: Object.freeze({...releasePlan}),
    schema: productTrain.schema,
    sha256: sha256(source),
    sourceUrl,
    versions,
  });
}

function releasePlanEvidenceUrl(tag) {
  if (typeof tag !== 'string' || !/^release-plan\/[a-z0-9][a-z0-9-]{2,79}$/.test(tag)) {
    throw new Error(`Cannot build a release-plan evidence URL for invalid tag ${tag}`);
  }

  return [
    'https://github.com/durable-workflow/.github/releases/download',
    encodeURIComponent(tag),
    'release-plan.json',
  ].join('/');
}

function buildArtifactCompatibilityEvidence(
  productTrainSource,
  releasePlanSource,
  options = {},
) {
  const productTrain = readQualifiedProductTrain(
    productTrainSource,
    options.productTrainUrl || PRODUCT_TRAIN_AUTHORITY_URL,
  );
  const releasePlan = parseJsonSource(
    releasePlanSource,
    `release-plan compatibility evidence ${productTrain.releasePlan.tag}`,
  );
  const releasePlanUrl = options.releasePlanUrl
    || releasePlanEvidenceUrl(productTrain.releasePlan.tag);

  if (sha256(releasePlanSource) !== productTrain.releasePlan.sha256) {
    throw new Error(
      `release-plan compatibility evidence ${productTrain.releasePlan.tag} ` +
        'does not match the product-train SHA-256',
    );
  }
  if (releasePlan.schema !== RELEASE_PLAN_SCHEMA) {
    throw new Error(
      `release-plan compatibility evidence schema must be ${RELEASE_PLAN_SCHEMA}`,
    );
  }
  if (releasePlan.channel !== ARTIFACT_RELEASE_POLICY.release_phase) {
    throw new Error(
      `release-plan compatibility evidence channel must be ` +
        `${ARTIFACT_RELEASE_POLICY.release_phase}`,
    );
  }
  if (`release-plan/${releasePlan.plan}` !== productTrain.releasePlan.tag) {
    throw new Error(
      'release-plan compatibility evidence identity does not match the product-train tag',
    );
  }

  assertExactKeys(
    releasePlan.components,
    REQUIRED_ARTIFACTS,
    'release-plan compatibility evidence components',
  );
  for (const artifact of REQUIRED_ARTIFACTS) {
    const component = releasePlan.components[artifact];
    if (
      !component
      || component.version !== productTrain.versions[artifact]
      || typeof component.commit !== 'string'
      || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(component.commit)
    ) {
      throw new Error(
        `release-plan compatibility evidence component ${artifact} must bind ` +
          `${productTrain.versions[artifact]} to a full source commit`,
      );
    }
  }

  const authorization = releasePlan.beta_authorization;
  if (
    !authorization
    || typeof authorization.tag !== 'string'
    || !/^beta-authorization\/[a-z0-9][a-z0-9-]{2,79}$/.test(authorization.tag)
    || typeof authorization.commit !== 'string'
    || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(authorization.commit)
  ) {
    throw new Error(
      'release-plan compatibility evidence must bind an immutable beta authorization',
    );
  }

  const serverVersion = productTrain.versions.server;

  return Object.freeze({
    schema: ARTIFACT_COMPATIBILITY_EVIDENCE_SCHEMA,
    schema_version: 1,
    outcome: 'pass',
    qualified_artifact_versions: Object.freeze({...productTrain.versions}),
    sdk_server_compatibility: Object.freeze(Object.fromEntries(
      REQUIRED_SDK_ARTIFACTS.map(artifact => [
        artifact,
        Object.freeze({
          sdk_version: productTrain.versions[artifact],
          supported_server_versions: serverVersion,
        }),
      ]),
    )),
    authority: Object.freeze({
      product_train: Object.freeze({
        schema: productTrain.schema,
        current: productTrain.current,
        source_url: productTrain.sourceUrl,
        sha256: productTrain.sha256,
      }),
      release_plan: Object.freeze({
        schema: releasePlan.schema,
        tag: productTrain.releasePlan.tag,
        source_url: releasePlanUrl,
        sha256: productTrain.releasePlan.sha256,
        beta_authorization: Object.freeze({...authorization}),
      }),
    }),
  });
}

function readArtifactCompatibilityEvidence(
  source = artifactCompatibilityEvidenceSource,
  expectedVersions = null,
) {
  if (!source || source.schema !== ARTIFACT_COMPATIBILITY_EVIDENCE_SCHEMA) {
    throw new Error(
      'public-artifact-compatibility-evidence.json must declare the Durable Workflow ' +
        'artifact compatibility-evidence schema',
    );
  }
  if (source.schema_version !== 1) {
    throw new Error('public-artifact-compatibility-evidence.json schema_version must be 1');
  }
  if (source.outcome !== 'pass') {
    throw new Error('public-artifact-compatibility-evidence.json outcome must be pass');
  }

  const versions = readArtifactVersions({
    schema: ARTIFACT_VERSION_SCHEMA,
    schemaVersion: 1,
    artifacts: source.qualified_artifact_versions,
  });
  if (expectedVersions !== null) {
    const expected = readArtifactVersions({
      schema: ARTIFACT_VERSION_SCHEMA,
      schemaVersion: 1,
      artifacts: expectedVersions,
    });
    if (JSON.stringify(versions) !== JSON.stringify(expected)) {
      throw new Error(
        'public-artifact-compatibility-evidence.json qualified_artifact_versions ' +
          'must exactly match the selected public artifact tuple',
      );
    }
  }

  assertExactKeys(
    source.sdk_server_compatibility,
    REQUIRED_SDK_ARTIFACTS,
    'public-artifact-compatibility-evidence.json sdk_server_compatibility',
  );
  const sdkServerCompatibility = {};
  for (const artifact of REQUIRED_SDK_ARTIFACTS) {
    const qualification = source.sdk_server_compatibility[artifact];
    if (
      !qualification
      || qualification.sdk_version !== versions[artifact]
      || qualification.supported_server_versions !== versions.server
    ) {
      throw new Error(
        `public-artifact-compatibility-evidence.json ${artifact} must bind SDK ` +
          `${versions[artifact]} to selected Server ${versions.server}`,
      );
    }
    sdkServerCompatibility[artifact] = Object.freeze({...qualification});
  }

  const productTrain = source.authority?.product_train;
  const releasePlan = source.authority?.release_plan;
  if (
    !productTrain
    || productTrain.schema !== PRODUCT_TRAIN_SCHEMA
    || typeof productTrain.current !== 'string'
    || typeof productTrain.source_url !== 'string'
    || typeof productTrain.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(productTrain.sha256)
  ) {
    throw new Error(
      'public-artifact-compatibility-evidence.json must bind the product-train authority',
    );
  }
  if (
    !releasePlan
    || releasePlan.schema !== RELEASE_PLAN_SCHEMA
    || typeof releasePlan.tag !== 'string'
    || !/^release-plan\/[a-z0-9][a-z0-9-]{2,79}$/.test(releasePlan.tag)
    || typeof releasePlan.source_url !== 'string'
    || typeof releasePlan.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(releasePlan.sha256)
    || !releasePlan.beta_authorization
    || typeof releasePlan.beta_authorization.tag !== 'string'
    || typeof releasePlan.beta_authorization.commit !== 'string'
    || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(releasePlan.beta_authorization.commit)
  ) {
    throw new Error(
      'public-artifact-compatibility-evidence.json must bind the immutable release plan ' +
        'and beta authorization',
    );
  }

  return Object.freeze({
    artifactVersions: versions,
    authority: Object.freeze({
      productTrain: Object.freeze({...productTrain}),
      releasePlan: Object.freeze({
        ...releasePlan,
        beta_authorization: Object.freeze({...releasePlan.beta_authorization}),
      }),
    }),
    sdkServerCompatibility: Object.freeze(sdkServerCompatibility),
  });
}

function artifactCompatibilityEvidenceJsonSource(evidence) {
  readArtifactCompatibilityEvidence(evidence, evidence?.qualified_artifact_versions);
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

module.exports = {
  ARTIFACT_COMPATIBILITY_EVIDENCE_SCHEMA,
  PRODUCT_TRAIN_AUTHORITY_URL,
  PRODUCT_TRAIN_SCHEMA,
  RELEASE_PLAN_SCHEMA,
  REQUIRED_SDK_ARTIFACTS,
  artifactCompatibilityEvidenceJsonSource,
  artifactCompatibilityEvidenceSource,
  buildArtifactCompatibilityEvidence,
  readArtifactCompatibilityEvidence,
  readQualifiedProductTrain,
  releasePlanEvidenceUrl,
  sha256,
};
