const crypto = require('crypto');

const artifactCompatibilityEvidenceSource =
  require('../static/public-artifact-compatibility-evidence.json');
const {
  ARTIFACT_VERSION_SCHEMA,
  REQUIRED_ARTIFACTS,
  pypiRegistryVersion,
  productTrainVersionDetails,
  readArtifactVersions,
} = require('./public-artifact-versions');

const ARTIFACT_COMPATIBILITY_EVIDENCE_SCHEMA =
  'durable-workflow.docs.public-artifact-compatibility-evidence';
const PRODUCT_TRAIN_SCHEMA = 'durable-workflow.product-train/v2';
const RELEASE_PLAN_SCHEMA = 'durable-workflow.release-plan/v2';
const SDK_SERVER_QUALIFICATION_SCHEMA =
  'durable-workflow.sdk-server-qualification/v1';
const CONFORMANCE_SUITE_SCHEMA =
  'durable-workflow.beta-conformance.suite-result/v2';
const REQUIRED_SDK_ARTIFACTS = Object.freeze(['sdk-php', 'sdk-python', 'sdk-rust']);
const REQUIRED_SDK_SERVER_EXPERIMENTS = Object.freeze([
  'heartbeats',
  'replay',
  'signals-queries',
]);
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

function matchesArtifactIdentity(actual, expected) {
  return Boolean(
    actual
    && expected
    && actual.version === expected.version
    && actual.commit === expected.commit
    && Object.keys(actual).length === 2,
  );
}

function matchesDistributionIdentity(actual, expected) {
  if (
    !actual
    || !expected
    || Object.keys(actual).length !== 3
    || actual.kind !== expected.kind
    || actual.locator !== expected.locator
    || !Array.isArray(actual.artifacts)
    || !Array.isArray(expected.artifacts)
    || actual.artifacts.length !== expected.artifacts.length
  ) {
    return false;
  }

  return actual.artifacts.every((artifact, index) => (
    artifact
    && Object.keys(artifact).length === 2
    && artifact.name === expected.artifacts[index]?.name
    && artifact.sha256 === expected.artifacts[index]?.sha256
    && /^[0-9a-f]{64}$/.test(artifact.sha256)
  ));
}

function frozenDistributionIdentity(identity) {
  return Object.freeze({
    ...identity,
    artifacts: Object.freeze(identity.artifacts.map(
      artifact => Object.freeze({...artifact}),
    )),
  });
}

function authorizedDistributionIdentity(artifact, versions) {
  const identities = {
    'sdk-php': {
      kind: 'composer',
      locator: `composer:durable-workflow/sdk@${versions['sdk-php']}`,
    },
    'sdk-python': {
      kind: 'pypi',
      locator: `pypi:durable-workflow@${pypiRegistryVersion(versions['sdk-python'])}`,
    },
    'sdk-rust': {
      kind: 'crates.io',
      locator: `crates.io:durable-workflow@${versions['sdk-rust']}`,
    },
    server: {
      kind: 'oci',
      locator: `oci:docker.io/durableworkflow/server@${versions.server}`,
    },
  };

  return identities[artifact];
}

function matchesAuthorizedDistributionIdentity(actual, expected) {
  return Boolean(
    actual
    && expected
    && Object.keys(actual).length === 2
    && actual.kind === expected.kind
    && actual.locator === expected.locator,
  );
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
  const sdkServerQualification = train.sdk_server_qualification;

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
  if (
    !sdkServerQualification
    || sdkServerQualification.schema !== SDK_SERVER_QUALIFICATION_SCHEMA
    || typeof sdkServerQualification.source_url !== 'string'
    || !sdkServerQualification.source_url.startsWith('https://')
    || typeof sdkServerQualification.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(sdkServerQualification.sha256)
  ) {
    throw new Error(
      `product-train compatibility authority current train ${productTrain.current} ` +
        'must bind immutable SDK-to-Server qualification evidence',
    );
  }

  return Object.freeze({
    current: productTrain.current,
    releasePlan: Object.freeze({...releasePlan}),
    sdkServerQualification: Object.freeze({...sdkServerQualification}),
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
  sdkServerQualificationSource,
  conformanceSuiteSource,
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
  const sdkServerQualificationUrl = options.sdkServerQualificationUrl
    || productTrain.sdkServerQualification.source_url;

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
  const qualifiedArtifactChannels = new Set(
    REQUIRED_ARTIFACTS.map(
      artifact => productTrainVersionDetails(productTrain.versions[artifact]).channel,
    ),
  );
  if (
    qualifiedArtifactChannels.size !== 1
    || !qualifiedArtifactChannels.has(releasePlan.channel)
  ) {
    throw new Error(
      'release-plan compatibility evidence channel must match the qualified ' +
        `artifact tuple channel ${[...qualifiedArtifactChannels].join(', ')}`,
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

  if (sha256(sdkServerQualificationSource) !== productTrain.sdkServerQualification.sha256) {
    throw new Error(
      'SDK-to-Server qualification evidence does not match the product-train SHA-256',
    );
  }
  const sdkServerQualification = parseJsonSource(
    sdkServerQualificationSource,
    'SDK-to-Server qualification evidence',
  );
  if (sdkServerQualification.schema !== SDK_SERVER_QUALIFICATION_SCHEMA) {
    throw new Error(
      `SDK-to-Server qualification evidence schema must be ` +
        `${SDK_SERVER_QUALIFICATION_SCHEMA}`,
    );
  }
  if (
    !sdkServerQualification.release_plan
    || !Object.keys(sdkServerQualification.release_plan).every(
      key => ['tag', 'sha256'].includes(key),
    )
    || Object.keys(sdkServerQualification.release_plan).length !== 2
    || sdkServerQualification.release_plan.tag !== productTrain.releasePlan.tag
    || sdkServerQualification.release_plan.sha256 !== productTrain.releasePlan.sha256
  ) {
    throw new Error(
      'SDK-to-Server qualification evidence is stale against the selected release plan',
    );
  }
  if (sdkServerQualification.outcome !== 'pass') {
    throw new Error('SDK-to-Server qualification evidence outcome must be pass');
  }

  const conformanceEvidence = sdkServerQualification.evidence;
  const evidenceTagPattern =
    /^beta-conformance\/beta-[a-z0-9._-]+\/[1-9][0-9]*\.[1-9][0-9]*$/;
  const evidenceTag = conformanceEvidence?.tag;
  const evidenceUrl = [
    'https://github.com/durable-workflow/.github/releases/download',
    evidenceTag,
    'suite-result.json',
  ].join('/');
  const githubRun = conformanceEvidence?.github_run;
  if (
    !conformanceEvidence
    || conformanceEvidence.schema !== CONFORMANCE_SUITE_SCHEMA
    || typeof evidenceTag !== 'string'
    || !evidenceTagPattern.test(evidenceTag)
    || conformanceEvidence.source_url !== evidenceUrl
    || typeof conformanceEvidence.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(conformanceEvidence.sha256)
    || conformanceEvidence.outcome !== 'pass'
    || !githubRun
    || githubRun.repository !== 'durable-workflow/.github'
    || !Number.isInteger(githubRun.run_id)
    || githubRun.run_id < 1
    || !Number.isInteger(githubRun.run_attempt)
    || githubRun.run_attempt < 1
    || githubRun.evidence_tag !== evidenceTag
    || !evidenceTag.endsWith(`/${githubRun.run_id}.${githubRun.run_attempt}`)
  ) {
    throw new Error(
      'SDK-to-Server qualification evidence must identify an immutable passing suite',
    );
  }
  assertExactKeys(
    conformanceEvidence,
    ['schema', 'tag', 'source_url', 'sha256', 'outcome', 'github_run'],
    'SDK-to-Server qualification conformance evidence',
  );
  assertExactKeys(
    githubRun,
    ['repository', 'run_id', 'run_attempt', 'evidence_tag'],
    'SDK-to-Server qualification GitHub run',
  );

  if (sha256(conformanceSuiteSource) !== conformanceEvidence.sha256) {
    throw new Error(
      'SDK-to-Server conformance suite does not match the qualification SHA-256',
    );
  }
  const conformanceSuite = parseJsonSource(
    conformanceSuiteSource,
    'SDK-to-Server conformance suite',
  );
  const suiteRun = conformanceSuite.github_run;
  if (
    conformanceSuite.schema !== CONFORMANCE_SUITE_SCHEMA
    || conformanceSuite.outcome !== 'pass'
    || !suiteRun
    || suiteRun.repository !== githubRun.repository
    || suiteRun.run_id !== githubRun.run_id
    || suiteRun.run_attempt !== githubRun.run_attempt
    || suiteRun.evidence_tag !== githubRun.evidence_tag
  ) {
    throw new Error(
      'SDK-to-Server conformance suite must be the exact passing retained GitHub run',
    );
  }
  assertExactKeys(
    suiteRun,
    ['repository', 'run_id', 'run_attempt', 'evidence_tag'],
    'SDK-to-Server conformance suite GitHub run',
  );
  assertExactKeys(
    conformanceSuite.artifact_tuple,
    REQUIRED_ARTIFACTS,
    'SDK-to-Server conformance suite artifact tuple',
  );
  assertExactKeys(
    conformanceSuite.source_identities,
    REQUIRED_ARTIFACTS,
    'SDK-to-Server conformance suite source identities',
  );
  for (const artifact of REQUIRED_ARTIFACTS) {
    if (!matchesArtifactIdentity(
      conformanceSuite.artifact_tuple[artifact],
      releasePlan.components[artifact],
    )) {
      throw new Error(
        `SDK-to-Server conformance suite artifact ${artifact} does not match ` +
          'the selected release plan',
      );
    }
    if (
      conformanceSuite.source_identities[artifact]
      !== releasePlan.components[artifact].commit
    ) {
      throw new Error(
        `SDK-to-Server conformance suite source ${artifact} does not match ` +
          'the selected release plan',
      );
    }
  }
  for (const experimentName of REQUIRED_SDK_SERVER_EXPERIMENTS) {
    const experiment = conformanceSuite.experiments?.[experimentName];
    if (
      !experiment
      || experiment.outcome !== 'pass'
      || experiment.classification !== 'passed'
      || !REQUIRED_SDK_ARTIFACTS.every(
        artifact => experiment.required_clients?.includes(artifact),
      )
      || !['server', ...REQUIRED_SDK_ARTIFACTS].every(
        artifact => experiment.required_distributions?.includes(artifact),
      )
      || typeof experiment.result_sha256 !== 'string'
      || !/^[0-9a-f]{64}$/.test(experiment.result_sha256)
    ) {
      throw new Error(
        `SDK-to-Server conformance suite experiment ${experimentName} ` +
          'must pass for PHP, Python, Rust, and Server distributions',
      );
    }
  }
  assertExactKeys(
    sdkServerQualification.bindings,
    REQUIRED_SDK_ARTIFACTS,
    'SDK-to-Server qualification evidence bindings',
  );

  const sdkServerCompatibility = {};
  const serverIdentity = releasePlan.components.server;
  for (const artifact of REQUIRED_SDK_ARTIFACTS) {
    const binding = sdkServerQualification.bindings[artifact];
    const sdkDistribution = conformanceSuite.executed_distribution_identities?.[artifact];
    const serverDistribution =
      conformanceSuite.executed_distribution_identities?.server;
    if (
      !binding
      || !matchesArtifactIdentity(
        binding.sdk?.source,
        releasePlan.components[artifact],
      )
      || !matchesDistributionIdentity(binding.sdk?.distribution, sdkDistribution)
      || !matchesArtifactIdentity(binding.server?.source, serverIdentity)
      || !matchesDistributionIdentity(binding.server?.distribution, serverDistribution)
      || binding.supported_server_versions !== serverIdentity.version
      || binding.outcome !== 'pass'
    ) {
      throw new Error(
        `SDK-to-Server qualification evidence ${artifact} must be a passing exact ` +
          `binding to Server ${serverIdentity.version}`,
      );
    }
    sdkServerCompatibility[artifact] = Object.freeze({
      sdk_version: binding.sdk.source.version,
      sdk_source_commit: binding.sdk.source.commit,
      sdk_distribution: frozenDistributionIdentity(binding.sdk.distribution),
      server_version: binding.server.source.version,
      server_source_commit: binding.server.source.commit,
      server_distribution: frozenDistributionIdentity(binding.server.distribution),
      supported_server_versions: binding.supported_server_versions,
      outcome: binding.outcome,
      evidence_source: conformanceEvidence.source_url,
    });
  }

  return Object.freeze({
    schema: ARTIFACT_COMPATIBILITY_EVIDENCE_SCHEMA,
    schema_version: 2,
    outcome: sdkServerQualification.outcome,
    qualified_artifact_versions: Object.freeze({...productTrain.versions}),
    sdk_server_compatibility: Object.freeze(sdkServerCompatibility),
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
      sdk_server_qualification: Object.freeze({
        schema: sdkServerQualification.schema,
        source_url: sdkServerQualificationUrl,
        sha256: productTrain.sdkServerQualification.sha256,
        evidence: Object.freeze({...conformanceEvidence}),
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
  if (![2, 3].includes(source.schema_version)) {
    throw new Error('public-artifact-compatibility-evidence.json schema_version must be 2 or 3');
  }
  const expectedOutcome = source.schema_version === 3 ? 'authorized' : 'pass';
  if (source.outcome !== expectedOutcome) {
    throw new Error(
      `public-artifact-compatibility-evidence.json outcome must be ${expectedOutcome}`,
    );
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
  const productTrain = source.authority?.product_train;
  const releasePlan = source.authority?.release_plan;

  if (
    !releasePlan
    || releasePlan.schema !== RELEASE_PLAN_SCHEMA
    || typeof releasePlan.tag !== 'string'
    || !/^release-plan\/[a-z0-9][a-z0-9-]{2,79}$/.test(releasePlan.tag)
    || releasePlan.source_url !== releasePlanEvidenceUrl(releasePlan.tag)
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

  if (source.schema_version === 3) {
    const channels = new Set(
      REQUIRED_ARTIFACTS.map(artifact => productTrainVersionDetails(versions[artifact]).channel),
    );
    if (
      channels.size !== 1
      || releasePlan.channel !== [...channels][0]
    ) {
      throw new Error(
        'release-plan-authorized compatibility evidence must select one matching prerelease channel',
      );
    }
    assertExactKeys(
      releasePlan.components,
      REQUIRED_ARTIFACTS,
      'public-artifact-compatibility-evidence.json release-plan components',
    );
    for (const artifact of REQUIRED_ARTIFACTS) {
      const component = releasePlan.components[artifact];
      if (
        !matchesArtifactIdentity(component, {
          version: versions[artifact],
          commit: component?.commit,
        })
        || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(component?.commit)
      ) {
        throw new Error(
          `public-artifact-compatibility-evidence.json release-plan component ${artifact} ` +
            `must bind ${versions[artifact]} to a full source commit`,
        );
      }
    }
    const releasePlanPayload = {
      beta_authorization: {
        commit: releasePlan.beta_authorization.commit,
        tag: releasePlan.beta_authorization.tag,
      },
      channel: releasePlan.channel,
      components: Object.fromEntries(REQUIRED_ARTIFACTS.map(artifact => [
        artifact,
        {
          commit: releasePlan.components[artifact].commit,
          version: releasePlan.components[artifact].version,
        },
      ])),
      foundation: {
        commit: releasePlan.foundation?.commit,
        tag: releasePlan.foundation?.tag,
      },
      plan: releasePlan.plan,
      schema: releasePlan.schema,
    };
    if (
      releasePlan.tag !== `release-plan/${releasePlan.plan}`
      || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(releasePlan.foundation?.commit)
      || typeof releasePlan.foundation?.tag !== 'string'
      || sha256(`${JSON.stringify(releasePlanPayload, null, 2)}\n`) !== releasePlan.sha256
    ) {
      throw new Error(
        'release-plan-authorized compatibility evidence must embed the exact immutable plan',
      );
    }

    for (const artifact of REQUIRED_SDK_ARTIFACTS) {
      const qualification = source.sdk_server_compatibility[artifact];
      if (
        !qualification
        || qualification.sdk_version !== versions[artifact]
        || qualification.sdk_source_commit !== releasePlan.components[artifact].commit
        || !matchesAuthorizedDistributionIdentity(
          qualification.sdk_distribution,
          authorizedDistributionIdentity(artifact, versions),
        )
        || qualification.server_version !== versions.server
        || qualification.server_source_commit !== releasePlan.components.server.commit
        || !matchesAuthorizedDistributionIdentity(
          qualification.server_distribution,
          authorizedDistributionIdentity('server', versions),
        )
        || qualification.supported_server_versions !== versions.server
        || qualification.outcome !== 'authorized'
        || qualification.evidence_source !== releasePlan.source_url
      ) {
        throw new Error(
          `public-artifact-compatibility-evidence.json ${artifact} must bind SDK ` +
            `${versions[artifact]} to release-plan-authorized Server ${versions.server}`,
        );
      }
      sdkServerCompatibility[artifact] = Object.freeze({...qualification});
    }

    return Object.freeze({
      artifactVersions: versions,
      authority: Object.freeze({
        releasePlan: Object.freeze({
          ...releasePlan,
          beta_authorization: Object.freeze({...releasePlan.beta_authorization}),
          components: Object.freeze(Object.fromEntries(
            Object.entries(releasePlan.components).map(
              ([artifact, identity]) => [artifact, Object.freeze({...identity})],
            ),
          )),
        }),
      }),
      sdkServerCompatibility: Object.freeze(sdkServerCompatibility),
    });
  }

  const qualificationAuthority = source.authority?.sdk_server_qualification;
  const conformanceEvidence = qualificationAuthority?.evidence;
  const expectedEvidenceUrl = [
    'https://github.com/durable-workflow/.github/releases/download',
    conformanceEvidence?.tag,
    'suite-result.json',
  ].join('/');
  const githubRun = conformanceEvidence?.github_run;
  if (
    !qualificationAuthority
    || qualificationAuthority.schema !== SDK_SERVER_QUALIFICATION_SCHEMA
    || typeof qualificationAuthority.source_url !== 'string'
    || !qualificationAuthority.source_url.startsWith('https://')
    || typeof qualificationAuthority.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(qualificationAuthority.sha256)
    || !conformanceEvidence
    || conformanceEvidence.schema !== CONFORMANCE_SUITE_SCHEMA
    || typeof conformanceEvidence.tag !== 'string'
    || !/^beta-conformance\/beta-[a-z0-9._-]+\/[1-9][0-9]*\.[1-9][0-9]*$/.test(
      conformanceEvidence.tag,
    )
    || conformanceEvidence.source_url !== expectedEvidenceUrl
    || typeof conformanceEvidence.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(conformanceEvidence.sha256)
    || conformanceEvidence.outcome !== 'pass'
    || !githubRun
    || githubRun.repository !== 'durable-workflow/.github'
    || !Number.isInteger(githubRun.run_id)
    || githubRun.run_id < 1
    || !Number.isInteger(githubRun.run_attempt)
    || githubRun.run_attempt < 1
    || githubRun.evidence_tag !== conformanceEvidence.tag
    || !conformanceEvidence.tag.endsWith(
      `/${githubRun.run_id}.${githubRun.run_attempt}`,
    )
  ) {
    throw new Error(
      'public-artifact-compatibility-evidence.json must bind immutable ' +
        'SDK-to-Server qualification evidence',
    );
  }
  for (const artifact of REQUIRED_SDK_ARTIFACTS) {
    const qualification = source.sdk_server_compatibility[artifact];
    if (
      !qualification
      || qualification.sdk_version !== versions[artifact]
      || typeof qualification.sdk_source_commit !== 'string'
      || !/^[0-9a-f]{40}$/.test(qualification.sdk_source_commit)
      || !matchesDistributionIdentity(
        qualification.sdk_distribution,
        qualification.sdk_distribution,
      )
      || qualification.server_version !== versions.server
      || typeof qualification.server_source_commit !== 'string'
      || !/^[0-9a-f]{40}$/.test(qualification.server_source_commit)
      || !matchesDistributionIdentity(
        qualification.server_distribution,
        qualification.server_distribution,
      )
      || qualification.supported_server_versions !== versions.server
      || qualification.outcome !== 'pass'
      || qualification.evidence_source !== conformanceEvidence.source_url
    ) {
      throw new Error(
        `public-artifact-compatibility-evidence.json ${artifact} must bind SDK ` +
          `${versions[artifact]} to selected Server ${versions.server}`,
      );
    }
    sdkServerCompatibility[artifact] = Object.freeze({...qualification});
  }

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
  return Object.freeze({
    artifactVersions: versions,
    authority: Object.freeze({
      productTrain: Object.freeze({...productTrain}),
      releasePlan: Object.freeze({
        ...releasePlan,
        beta_authorization: Object.freeze({...releasePlan.beta_authorization}),
      }),
      sdkServerQualification: Object.freeze({
        ...qualificationAuthority,
        evidence: Object.freeze({...qualificationAuthority.evidence}),
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
  SDK_SERVER_QUALIFICATION_SCHEMA,
  artifactCompatibilityEvidenceJsonSource,
  artifactCompatibilityEvidenceSource,
  buildArtifactCompatibilityEvidence,
  readArtifactCompatibilityEvidence,
  readQualifiedProductTrain,
  releasePlanEvidenceUrl,
  sha256,
};
