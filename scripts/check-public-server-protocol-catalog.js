#!/usr/bin/env node

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const {
  ARTIFACT_RELEASE_POLICY,
  isAuthorizedProductTrainVersion,
} = require('./public-artifact-versions');
const {
  readArtifactCompatibilityEvidence,
} = require('./public-artifact-compatibility');

const repoRoot = path.join(__dirname, '..');
const catalogPath = path.join(repoRoot, 'static', 'platform-protocol-specs.json');
const artifactVersionsPath = path.join(__dirname, 'public-artifact-versions.json');
const publishedArtifactVersionsPath = path.join(
  __dirname,
  'published-artifact-versions.json',
);
const expectedSchema = 'durable-workflow.v2.platform-protocol-specs.catalog';
const expectedWorkflowSource = 'https://github.com/durable-workflow/workflow.git';
const maxFindings = 100;
const deploymentStates = Object.freeze({
  deployable: 'deployable',
  forwardCandidate: 'source-qualified-deployable',
});
const allowedPublicEntryFields = new Set([
  'description',
  'format',
  'spec_id',
  'surface_family',
  'authority_manifest',
  'owner_repo',
  'object_families',
  'evolution_rule',
  'breaking_change_release',
  'discovery_endpoint',
  'status',
  'spec_url',
]);
const requiredAddedSpecFields = [
  'description',
  'format',
  'spec_id',
  'surface_family',
  'authority_manifest',
  'owner_repo',
  'object_families',
  'evolution_rule',
  'breaking_change_release',
  'status',
  'spec_url',
];
const forbiddenPublicAuthorityFields = new Set([
  'spec_path',
  'owner_symbol',
  'implementation_symbol',
  'source_path',
  'test_path',
  'test_paths',
  'conformance_test',
  'conformance_path',
  'conformance_script',
  'schema_authority',
  'version_authority',
]);

class CatalogConformanceError extends Error {
  constructor(message, findings) {
    super(message);
    this.findings = findings;
  }
}

class CatalogLifecycleError extends Error {
  constructor(kind, stage, message, cause = null) {
    super(message);
    this.kind = kind;
    this.stage = stage;
    this.cause = cause;
    this.lifecycle = null;
    this.diagnostics = null;
  }

  finding() {
    return {
      kind: this.kind,
      stage: this.stage,
      message: this.message,
    };
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function printable(value) {
  if (value === undefined) {
    return '<missing>';
  }
  const encoded = JSON.stringify(value);
  return encoded.length > 240 ? `${encoded.slice(0, 237)}...` : encoded;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function catalogSha256(catalog) {
  return sha256(stableStringify(catalog));
}

function addFinding(findings, finding) {
  if (findings.length < maxFindings) {
    findings.push(finding);
  }
}

function workflowProvenanceFromComposerLock(composerLock) {
  if (!isRecord(composerLock)) {
    throw new Error('Server authority composer.lock must be a JSON object.');
  }

  const packages = [
    ...(Array.isArray(composerLock.packages) ? composerLock.packages : []),
    ...(Array.isArray(composerLock['packages-dev']) ? composerLock['packages-dev'] : []),
  ];
  const matches = packages.filter(entry => (
    isRecord(entry) && entry.name === 'durable-workflow/workflow'
  ));

  if (matches.length !== 1) {
    throw new Error(
      'Server authority composer.lock must contain exactly one durable-workflow/workflow package.',
    );
  }

  const workflowPackage = matches[0];
  const source = workflowPackage.source;
  if (
    !isAuthorizedProductTrainVersion(workflowPackage.version || '')
    || !isRecord(source)
    || source.type !== 'git'
    || source.url !== expectedWorkflowSource
    || !/^[0-9a-f]{40}$/.test(source.reference || '')
  ) {
    throw new Error(
      'Server authority composer.lock must bind Workflow to an authorized public version ' +
        'and full Git source revision.',
    );
  }

  return Object.freeze({
    source: source.url,
    ref: workflowPackage.version,
    commit: source.reference,
  });
}

function qualifiedServerIdentity(artifactVersions, compatibilityEvidenceSource) {
  const compatibility = readArtifactCompatibilityEvidence(
    compatibilityEvidenceSource,
    artifactVersions,
  );
  const qualifications = Object.values(compatibility.sdkServerCompatibility);
  const commits = new Set(qualifications.map(qualification => (
    qualification.server_source_commit
  )));

  if (commits.size !== 1) {
    throw new Error(
      'Qualified SDK-to-Server evidence must bind one exact Server source commit.',
    );
  }

  const distribution = qualifications[0]?.server_distribution;
  const manifests = (distribution?.artifacts || []).filter(
    artifact => artifact.name === 'manifest' && /^[0-9a-f]{64}$/.test(artifact.sha256 || ''),
  );
  const locatorMatch = /^oci:([^@]+)@([^@]+)$/.exec(distribution?.locator || '');
  if (
    distribution?.kind !== 'oci'
    || manifests.length !== 1
    || !locatorMatch
    || locatorMatch[2] !== artifactVersions.server
  ) {
    throw new Error(
      'Qualified SDK-to-Server evidence must bind one exact Server OCI manifest digest.',
    );
  }

  const digest = `sha256:${manifests[0].sha256}`;
  const repository = locatorMatch[1];
  return Object.freeze({
    sourceCommit: [...commits][0],
    version: locatorMatch[2],
    repository,
    selector: `${repository}:${locatorMatch[2]}`,
    expectedDigest: digest,
    immutableReference: `${repository}@${digest}`,
  });
}

function qualifiedServerSourceCommit(artifactVersions, compatibilityEvidenceSource) {
  return qualifiedServerIdentity(
    artifactVersions,
    compatibilityEvidenceSource,
  ).sourceCommit;
}

function assertConsumerSafeCatalog(catalog, surface) {
  for (const [name, entry] of Object.entries(catalog.specs || {})) {
    if (!isRecord(entry)) {
      continue;
    }
    for (const key of Object.keys(entry)) {
      if (!allowedPublicEntryFields.has(key)) {
        throw new Error(
          `${surface} catalog entry ${name} exposes non-consumer field ${key}.`,
        );
      }
    }
  }

  function visit(value, pointer) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${pointer}/${index}`));
      return;
    }
    if (!isRecord(value)) {
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenPublicAuthorityFields.has(key)) {
        throw new Error(
          `${surface} catalog exposes repository-local authority field ${key} at ${pointer}/${key}.`,
        );
      }
      visit(child, `${pointer}/${key}`);
    }
  }

  visit(catalog, '#');

  const encodedEntries = JSON.stringify(catalog.specs);
  for (const [pattern, label] of [
    [/(^|[\s\x60("'])((?:\.\.?\/)?(?:tests?|scripts?|src|resources|docs|static)\/)/i, 'repository-relative path'],
    [/\.php\b/i, 'source or test filename'],
    [/::/, 'implementation symbol'],
    [/\\[A-Za-z_]/, 'namespaced implementation symbol'],
  ]) {
    if (pattern.test(encodedEntries)) {
      throw new Error(`${surface} catalog specs contain a ${label}.`);
    }
  }
}

function compareCatalogs(publicValue, serverValue, pointer, findings) {
  if (Array.isArray(publicValue) || Array.isArray(serverValue)) {
    if (!Array.isArray(publicValue) || !Array.isArray(serverValue)) {
      addFinding(findings, {
        kind: 'type_mismatch',
        path: pointer,
        public_value: publicValue,
        server_value: serverValue,
        message: `Catalog drift at ${pointer}: public type and server type differ.`,
      });
      return;
    }

    if (publicValue.length !== serverValue.length) {
      addFinding(findings, {
        kind: 'array_length_mismatch',
        path: pointer,
        public_length: publicValue.length,
        server_length: serverValue.length,
        message: `Catalog drift at ${pointer}: public length ${publicValue.length}, server length ${serverValue.length}.`,
      });
    }

    for (let index = 0; index < Math.min(publicValue.length, serverValue.length); index += 1) {
      compareCatalogs(publicValue[index], serverValue[index], `${pointer}[${index}]`, findings);
    }
    return;
  }

  if (isRecord(publicValue) || isRecord(serverValue)) {
    if (!isRecord(publicValue) || !isRecord(serverValue)) {
      addFinding(findings, {
        kind: 'type_mismatch',
        path: pointer,
        public_value: publicValue,
        server_value: serverValue,
        message: `Catalog drift at ${pointer}: public type and server type differ.`,
      });
      return;
    }

    const publicFields = Object.keys(publicValue).sort();
    const serverFields = Object.keys(serverValue).sort();
    const missing = publicFields.filter(field => !(field in serverValue));
    const unexpected = serverFields.filter(field => !(field in publicValue));
    if (missing.length > 0 || unexpected.length > 0) {
      addFinding(findings, {
        kind: 'field_set_mismatch',
        path: pointer,
        missing_server_fields: missing,
        unexpected_server_fields: unexpected,
        message: `Catalog field set drift at ${pointer}: missing on server [${missing.join(', ')}], unexpected on server [${unexpected.join(', ')}].`,
      });
    }

    for (const field of publicFields.filter(field => field in serverValue)) {
      compareCatalogs(publicValue[field], serverValue[field], `${pointer}.${field}`, findings);
    }
    return;
  }

  if (publicValue !== serverValue) {
    addFinding(findings, {
      kind: 'value_mismatch',
      path: pointer,
      public_value: publicValue,
      server_value: serverValue,
      message: `Catalog drift at ${pointer}: public ${printable(publicValue)}, server ${printable(serverValue)}.`,
    });
  }
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareFieldSets(left, right) {
  const leftFields = Object.keys(left).sort();
  const rightFields = Object.keys(right).sort();
  return {
    missing: rightFields.filter(field => !(field in left)),
    added: leftFields.filter(field => !(field in right)),
  };
}

function namedObjectFamilies(families, surface, specName, findings) {
  const byName = new Map();
  if (!Array.isArray(families)) {
    addFinding(findings, {
      kind: 'catalog_object_families_invalid',
      path: `$.specs.${specName}.object_families`,
      surface,
      message: `${surface} catalog entry ${specName} must declare object_families as an array.`,
    });
    return byName;
  }

  for (const [index, family] of families.entries()) {
    const familyPath = `$.specs.${specName}.object_families[${index}]`;
    if (
      !isRecord(family)
      || typeof family.name !== 'string'
      || family.name === ''
      || typeof family.owner_repo !== 'string'
      || family.owner_repo === ''
    ) {
      addFinding(findings, {
        kind: 'catalog_object_family_invalid',
        path: familyPath,
        surface,
        message: `${surface} catalog object family at ${familyPath} must name a family and owner repository.`,
      });
      continue;
    }
    if (byName.has(family.name)) {
      addFinding(findings, {
        kind: 'catalog_object_family_duplicate',
        path: familyPath,
        surface,
        family: family.name,
        message: `${surface} catalog entry ${specName} repeats object family ${family.name}.`,
      });
      continue;
    }
    byName.set(family.name, family);
  }
  return byName;
}

function validateForwardCatalogCandidate(publicCatalog, serverCatalog) {
  const findings = [];
  const publicVersion = publicCatalog.version;
  const serverVersion = serverCatalog.version;
  const addedSpecs = [];
  const addedObjectFamilies = [];
  const descriptionUpdates = [];

  if (!Number.isInteger(publicVersion) || !Number.isInteger(serverVersion)) {
    addFinding(findings, {
      kind: 'catalog_revision_invalid',
      path: '$.version',
      public_version: publicVersion,
      server_version: serverVersion,
      message: 'A forward catalog candidate requires integer docs and published Server revisions.',
    });
  } else if (publicVersion === serverVersion) {
    addFinding(findings, {
      kind: 'catalog_same_revision_drift',
      path: '$.version',
      public_version: publicVersion,
      server_version: serverVersion,
      message: `Catalog revision ${publicVersion} differs from the published Server at the same revision.`,
    });
  } else if (publicVersion < serverVersion) {
    addFinding(findings, {
      kind: 'catalog_backward_revision',
      path: '$.version',
      public_version: publicVersion,
      server_version: serverVersion,
      message: `Docs catalog revision ${publicVersion} is behind published Server revision ${serverVersion}.`,
    });
  } else if (publicVersion !== serverVersion + 1) {
    addFinding(findings, {
      kind: 'catalog_revision_jump',
      path: '$.version',
      public_version: publicVersion,
      server_version: serverVersion,
      message: `Docs catalog revision ${publicVersion} must be exactly one revision ahead of published Server revision ${serverVersion}.`,
    });
  }

  const publicRoot = Object.fromEntries(
    Object.entries(publicCatalog).filter(([field]) => !['version', 'specs'].includes(field)),
  );
  const serverRoot = Object.fromEntries(
    Object.entries(serverCatalog).filter(([field]) => !['version', 'specs'].includes(field)),
  );
  const rootFields = compareFieldSets(publicRoot, serverRoot);
  if (rootFields.missing.length > 0 || rootFields.added.length > 0) {
    addFinding(findings, {
      kind: 'catalog_root_field_drift',
      path: '$',
      removed_fields: rootFields.missing,
      added_fields: rootFields.added,
      message: 'A forward catalog candidate must preserve the bounded catalog root field set.',
    });
  }
  for (const field of Object.keys(serverRoot).filter(field => field in publicRoot)) {
    if (!jsonEqual(publicRoot[field], serverRoot[field])) {
      addFinding(findings, {
        kind: 'catalog_root_value_drift',
        path: `$.${field}`,
        message: `A forward catalog candidate must preserve prior catalog root field $.${field}.`,
      });
    }
  }

  const publicSpecs = isRecord(publicCatalog.specs) ? publicCatalog.specs : {};
  const serverSpecs = isRecord(serverCatalog.specs) ? serverCatalog.specs : {};
  for (const [specName, serverEntry] of Object.entries(serverSpecs)) {
    const publicEntry = publicSpecs[specName];
    if (!isRecord(serverEntry) || !isRecord(publicEntry)) {
      addFinding(findings, {
        kind: 'catalog_spec_removed',
        path: `$.specs.${specName}`,
        message: `A forward catalog candidate must preserve prior spec ${specName}.`,
      });
      continue;
    }

    const ignoredFields = new Set(['description', 'object_families']);
    const publicStable = Object.fromEntries(
      Object.entries(publicEntry).filter(([field]) => !ignoredFields.has(field)),
    );
    const serverStable = Object.fromEntries(
      Object.entries(serverEntry).filter(([field]) => !ignoredFields.has(field)),
    );
    const entryFields = compareFieldSets(publicStable, serverStable);
    if (entryFields.missing.length > 0 || entryFields.added.length > 0) {
      addFinding(findings, {
        kind: 'catalog_entry_field_drift',
        path: `$.specs.${specName}`,
        removed_fields: entryFields.missing,
        added_fields: entryFields.added,
        message: `Forward candidate spec ${specName} must preserve its prior metadata field set.`,
      });
    }
    for (const field of Object.keys(serverStable).filter(field => field in publicStable)) {
      if (!jsonEqual(publicStable[field], serverStable[field])) {
        addFinding(findings, {
          kind: 'catalog_entry_value_drift',
          path: `$.specs.${specName}.${field}`,
          message: `Forward candidate spec ${specName} changed prior metadata field ${field}.`,
        });
      }
    }

    const publicFamilies = namedObjectFamilies(
      publicEntry.object_families,
      'public',
      specName,
      findings,
    );
    const serverFamilies = namedObjectFamilies(
      serverEntry.object_families,
      'server',
      specName,
      findings,
    );
    for (const [familyName, serverFamily] of serverFamilies) {
      const publicFamily = publicFamilies.get(familyName);
      if (!publicFamily || !jsonEqual(publicFamily, serverFamily)) {
        addFinding(findings, {
          kind: 'catalog_object_family_removed_or_changed',
          path: `$.specs.${specName}.object_families`,
          family: familyName,
          message: `Forward candidate spec ${specName} must preserve prior object family ${familyName}.`,
        });
      }
    }

    const retainedPublicOrder = (Array.isArray(publicEntry.object_families)
      ? publicEntry.object_families
      : [])
      .map(family => family?.name)
      .filter(name => serverFamilies.has(name));
    const serverOrder = (Array.isArray(serverEntry.object_families)
      ? serverEntry.object_families
      : []).map(family => family?.name);
    if (!jsonEqual(retainedPublicOrder, serverOrder)) {
      addFinding(findings, {
        kind: 'catalog_object_family_order_drift',
        path: `$.specs.${specName}.object_families`,
        message: `Forward candidate spec ${specName} must preserve prior object-family order.`,
      });
    }

    const specAdditions = [...publicFamilies]
      .filter(([familyName]) => !serverFamilies.has(familyName))
      .map(([familyName, family]) => ({
        spec: specName,
        name: familyName,
        owner_repo: family.owner_repo,
      }));
    addedObjectFamilies.push(...specAdditions);

    if (!jsonEqual(publicEntry.description, serverEntry.description)) {
      if (
        specAdditions.length === 0
        || typeof publicEntry.description !== 'string'
        || publicEntry.description.trim() === ''
      ) {
        addFinding(findings, {
          kind: 'catalog_description_drift_without_surface_addition',
          path: `$.specs.${specName}.description`,
          message: `Forward candidate spec ${specName} changed its description without adding protocol surface.`,
        });
      } else {
        descriptionUpdates.push(specName);
      }
    }
  }

  for (const [specName, entry] of Object.entries(publicSpecs)) {
    if (specName in serverSpecs) {
      continue;
    }
    if (!isRecord(entry)) {
      addFinding(findings, {
        kind: 'catalog_added_spec_invalid',
        path: `$.specs.${specName}`,
        message: `Added protocol spec ${specName} must be a catalog entry object.`,
      });
      continue;
    }
    const missingFields = requiredAddedSpecFields.filter(field => !(field in entry));
    if (missingFields.length > 0) {
      addFinding(findings, {
        kind: 'catalog_added_spec_incomplete',
        path: `$.specs.${specName}`,
        missing_fields: missingFields,
        message: `Added protocol spec ${specName} is missing required catalog metadata.`,
      });
    }
    const families = namedObjectFamilies(entry.object_families, 'public', specName, findings);
    if (families.size === 0) {
      addFinding(findings, {
        kind: 'catalog_added_spec_without_surface',
        path: `$.specs.${specName}.object_families`,
        message: `Added protocol spec ${specName} must declare at least one object family.`,
      });
    }
    addedSpecs.push(specName);
  }

  if (addedSpecs.length === 0 && addedObjectFamilies.length === 0) {
    addFinding(findings, {
      kind: 'catalog_forward_candidate_non_additive',
      path: '$.specs',
      message: 'A forward catalog candidate must add a protocol spec or object family.',
    });
  }

  if (findings.length > 0) {
    throw new CatalogConformanceError(
      `Forward protocol catalog qualification failed with ${findings.length} finding(s).`,
      findings,
    );
  }

  return Object.freeze({
    state: deploymentStates.forwardCandidate,
    reason: 'published_server_catalog_one_revision_behind_additive_source',
    docs_catalog_version: publicVersion,
    published_server_catalog_version: serverVersion,
    structural_check: {
      outcome: 'pass',
      mode: 'one_revision_forward_additive',
      preserved_specs: Object.keys(serverSpecs).length,
      added_specs: addedSpecs,
      added_object_families: addedObjectFamilies,
      description_updates: descriptionUpdates,
    },
  });
}

function classifyCatalogDeployment(publicCatalog, serverCatalog, options = {}) {
  const exactFindings = [];
  compareCatalogs(publicCatalog, serverCatalog, '$', exactFindings);
  if (exactFindings.length === 0) {
    return Object.freeze({
      state: deploymentStates.deployable,
      reason: 'exact_published_server_catalog_match',
      docs_catalog_version: publicCatalog.version,
      published_server_catalog_version: serverCatalog.version,
      structural_check: {
        outcome: 'pass',
        mode: 'exact_equality',
        preserved_specs: Object.keys(publicCatalog.specs || {}).length,
        added_specs: [],
        added_object_families: [],
        description_updates: [],
      },
    });
  }

  if (!options.allowForwardCandidate) {
    throw new CatalogConformanceError(
      `Published server protocol catalog conformance failed with ${exactFindings.length} finding(s).`,
      exactFindings,
    );
  }

  return validateForwardCatalogCandidate(publicCatalog, serverCatalog);
}

function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function writeDeploymentSummary(summaryPath, deployment, evidencePath) {
  if (!summaryPath || deployment?.state !== deploymentStates.forwardCandidate) {
    return;
  }
  const additions = deployment.structural_check.added_object_families
    .map(family => `${family.spec}:${family.name}`);
  fs.appendFileSync(summaryPath, [
    '## Source-qualified additive catalog deployment',
    '',
    `- State: \`${deployment.state}\``,
    `- Reason: \`${deployment.reason}\``,
    `- Docs catalog revision: \`${deployment.docs_catalog_version}\``,
    `- Published Server catalog revision: \`${deployment.published_server_catalog_version}\``,
    `- Added protocol specs: ${deployment.structural_check.added_specs.length}`,
    `- Added object families: ${additions.length > 0 ? additions.map(value => `\`${value}\``).join(', ') : 'none'}`,
    `- Evidence artifact file: \`${path.basename(evidencePath)}\``,
    '',
    'The source catalog is exactly one additive revision ahead, preserves every published Server catalog surface, and adds only structurally validated protocol surface. Website and Pages deployment may proceed without changing the qualified aggregate artifact recommendation.',
    '',
  ].join('\n'));
}

function verifySnapshots(publicCatalog, serverDiscovery, expectedWorkflowProvenance, options = {}) {
  const findings = [];
  const serverCatalog = isRecord(serverDiscovery)
    ? serverDiscovery.platform_protocol_specs
    : undefined;
  const provenance = isRecord(serverDiscovery)
    ? serverDiscovery.package_provenance
    : undefined;

  for (const [surface, catalog] of [
    ['public', publicCatalog],
    ['server', serverCatalog],
  ]) {
    if (!isRecord(catalog)) {
      addFinding(findings, {
        kind: 'invalid_catalog',
        surface,
        path: '$',
        message: `${surface} protocol catalog must be a JSON object.`,
      });
      continue;
    }

    if (catalog.schema !== expectedSchema) {
      addFinding(findings, {
        kind: 'catalog_schema_mismatch',
        surface,
        path: '$.schema',
        expected: expectedSchema,
        actual: catalog.schema,
        message: `${surface} catalog schema expected ${expectedSchema}, got ${printable(catalog.schema)}.`,
      });
    }
    if (!Number.isInteger(catalog.version) || catalog.version < 1) {
      addFinding(findings, {
        kind: 'invalid_catalog_version',
        surface,
        path: '$.version',
        actual: catalog.version,
        message: `${surface} catalog version must be a positive integer, got ${printable(catalog.version)}.`,
      });
    }
    if (!isRecord(catalog.specs) || Object.keys(catalog.specs).length === 0) {
      addFinding(findings, {
        kind: 'missing_capability_records',
        surface,
        path: '$.specs',
        message: `${surface} catalog must contain capability records in $.specs.`,
      });
    }

    try {
      assertConsumerSafeCatalog(catalog, surface);
    } catch (error) {
      addFinding(findings, {
        kind: 'repository_local_authority',
        surface,
        path: '$.specs',
        message: `${surface} catalog is not consumer-safe: ${error.message}`,
      });
    }
  }

  let deployment = null;
  if (isRecord(publicCatalog) && isRecord(serverCatalog)) {
    try {
      deployment = classifyCatalogDeployment(publicCatalog, serverCatalog, options);
    } catch (error) {
      if (error instanceof CatalogConformanceError) {
        for (const finding of error.findings) {
          addFinding(findings, finding);
        }
      } else {
        throw error;
      }
    }
  }

  if (!isRecord(provenance)) {
    addFinding(findings, {
      kind: 'missing_workflow_package_provenance',
      path: '$.package_provenance',
      message: 'Published server discovery must expose Workflow package provenance during catalog conformance.',
    });
  } else {
    if (provenance.source !== expectedWorkflowProvenance.source) {
      addFinding(findings, {
        kind: 'workflow_package_source_mismatch',
        path: '$.package_provenance.source',
        expected: expectedWorkflowProvenance.source,
        actual: provenance.source,
        message: `Workflow package source expected ${expectedWorkflowProvenance.source}, got ${printable(provenance.source)}.`,
      });
    }
    if (!isAuthorizedProductTrainVersion(provenance.ref || '')) {
      addFinding(findings, {
        kind: 'workflow_package_version_invalid',
        path: '$.package_provenance.ref',
        actual: provenance.ref,
        message: `Workflow package provenance must name a version authorized by the ${ARTIFACT_RELEASE_POLICY.release_phase} release phase, got ${printable(provenance.ref)}.`,
      });
    }
    if (provenance.ref !== expectedWorkflowProvenance.ref) {
      addFinding(findings, {
        kind: 'workflow_package_version_mismatch',
        path: '$.package_provenance.ref',
        expected: expectedWorkflowProvenance.ref,
        actual: provenance.ref,
        message: `Workflow package provenance ref expected ${printable(expectedWorkflowProvenance.ref)}, got ${printable(provenance.ref)}.`,
      });
    }
    if (!/^[0-9a-f]{40}$/.test(provenance.commit || '')) {
      addFinding(findings, {
        kind: 'workflow_package_commit_invalid',
        path: '$.package_provenance.commit',
        actual: provenance.commit,
        message: `Workflow package provenance must name a full source revision, got ${printable(provenance.commit)}.`,
      });
    } else if (provenance.commit !== expectedWorkflowProvenance.commit) {
      addFinding(findings, {
        kind: 'workflow_package_commit_mismatch',
        path: '$.package_provenance.commit',
        expected: expectedWorkflowProvenance.commit,
        actual: provenance.commit,
        message: `Workflow package provenance commit expected ${printable(expectedWorkflowProvenance.commit)}, got ${printable(provenance.commit)}.`,
      });
    }
  }

  if (findings.length > 0) {
    throw new CatalogConformanceError(
      `Published server protocol catalog conformance failed with ${findings.length} finding(s).`,
      findings,
    );
  }

  return {
    schema: publicCatalog.schema,
    version: publicCatalog.version,
    capability_records: Object.keys(publicCatalog.specs).length,
    expected_workflow_package_ref: expectedWorkflowProvenance.ref,
    expected_workflow_package_provenance: expectedWorkflowProvenance,
    package_provenance: provenance,
    deployment,
  };
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, {timeout: 10000}, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
          reject(new Error(`${url} returned HTTP ${response.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`${url} did not return valid JSON: ${error.message}`));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error(`${url} timed out`)));
    request.on('error', reject);
  });
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function commandOutput(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
}

function commandFailureDetail(error) {
  const detail = [commandOutput(error && error.stdout), commandOutput(error && error.stderr)]
    .filter(value => value.trim() !== '')
    .join('\n')
    .trim();
  return detail || (error && error.message) || 'no command diagnostics were returned';
}

function tailLines(value, limit = 40) {
  const source = commandOutput(value).trimEnd();
  return source === '' ? [] : source.split('\n').slice(-limit);
}

function configuredInteger(value, fallback, label, minimum) {
  const source = value === undefined ? String(fallback) : String(value);
  if (!/^\d+$/.test(source) || Number(source) < minimum) {
    throw new CatalogLifecycleError(
      'invalid_lifecycle_configuration',
      'setup',
      `${label} must be an integer greater than or equal to ${minimum}, got ${printable(value)}.`,
    );
  }
  return Number(source);
}

function cleanupResult(result) {
  return {
    attempted: true,
    exit_code: Number.isInteger(result && result.status) ? result.status : null,
    signal: result && result.signal ? result.signal : null,
  };
}

function normalizedOciRepository(value) {
  let repository = String(value || '').replace(/^docker\.io\//, '');
  if (!repository.includes('/')) {
    repository = `library/${repository}`;
  }
  return repository;
}

function imageRepository(image) {
  const withoutDigest = String(image || '').split('@', 1)[0];
  const lastSlash = withoutDigest.lastIndexOf('/');
  const lastColon = withoutDigest.lastIndexOf(':');
  return lastColon > lastSlash ? withoutDigest.slice(0, lastColon) : withoutDigest;
}

function observedImageDigest(serverImage, immutableImage, inspectionSource) {
  const expectedRepository = normalizedOciRepository(imageRepository(immutableImage));
  if (normalizedOciRepository(imageRepository(serverImage)) !== expectedRepository) {
    throw new CatalogLifecycleError(
      'server_image_repository_mismatch',
      'image_identity',
      `Published image selector ${serverImage} does not name the authority repository `
        + `${imageRepository(immutableImage)}.`,
    );
  }

  let references;
  try {
    references = JSON.parse(commandOutput(inspectionSource));
  } catch (error) {
    throw new CatalogLifecycleError(
      'server_image_digest_unresolved',
      'image_identity',
      `Published image ${serverImage} returned invalid Docker digest evidence.`,
      error,
    );
  }
  const digests = new Set((Array.isArray(references) ? references : []).flatMap(reference => {
    if (typeof reference !== 'string') {
      return [];
    }
    const separator = reference.lastIndexOf('@');
    if (separator < 1) {
      return [];
    }
    const repository = reference.slice(0, separator);
    const digest = reference.slice(separator + 1);
    return normalizedOciRepository(repository) === expectedRepository
      && /^sha256:[0-9a-f]{64}$/.test(digest)
      ? [digest]
      : [];
  }));
  if (digests.size !== 1) {
    throw new CatalogLifecycleError(
      'server_image_digest_unresolved',
      'image_identity',
      `Published image ${serverImage} did not resolve to one immutable OCI manifest digest `
        + `for ${imageRepository(immutableImage)}.`,
    );
  }
  return [...digests][0];
}

function observedImageSourceCommit(serverImage, inspectionSource) {
  let labels;
  try {
    labels = JSON.parse(commandOutput(inspectionSource));
  } catch (error) {
    throw new CatalogLifecycleError(
      'server_image_source_unresolved',
      'image_identity',
      `Published image ${serverImage} returned invalid OCI label evidence.`,
      error,
    );
  }

  const sourceCommit = isRecord(labels)
    ? labels['org.opencontainers.image.revision']
    : null;
  if (typeof sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(sourceCommit)) {
    throw new CatalogLifecycleError(
      'server_image_source_unresolved',
      'image_identity',
      `Published image ${serverImage} does not expose one full source commit in `
        + 'org.opencontainers.image.revision.',
    );
  }

  return sourceCommit;
}

async function discoverPublishedServer(serverImage, options = {}) {
  const docker = options.docker || process.env.DOCKER || 'docker';
  let expectedImageDigest = options.expectedImageDigest || null;
  let immutableServerImage = options.immutableServerImage || null;
  const mirrorServerImage = options.mirrorServerImage || null;
  const expectedSourceCommit = options.expectedSourceCommit || null;
  if (
    (expectedImageDigest !== null
      && !/^sha256:[0-9a-f]{64}$/.test(expectedImageDigest))
    || (immutableServerImage !== null
      && (
        expectedImageDigest === null
        || typeof immutableServerImage !== 'string'
        || !immutableServerImage.endsWith(`@${expectedImageDigest}`)
      ))
    || (expectedSourceCommit !== null
      && !/^[0-9a-f]{40}$/.test(expectedSourceCommit))
  ) {
    throw new CatalogLifecycleError(
      'invalid_image_identity_configuration',
      'setup',
      'Published Server discovery received an invalid immutable image or source identity.',
    );
  }
  const port = options.port || process.env.PUBLIC_SERVER_PROTOCOL_CATALOG_PORT || '18081';
  const attempts = configuredInteger(
    options.attempts ?? process.env.PUBLIC_SERVER_PROTOCOL_CATALOG_ATTEMPTS,
    30,
    'PUBLIC_SERVER_PROTOCOL_CATALOG_ATTEMPTS',
    1,
  );
  const retryDelayMs = configuredInteger(
    options.retryDelayMs ?? process.env.PUBLIC_SERVER_PROTOCOL_CATALOG_RETRY_DELAY_MS,
    2000,
    'PUBLIC_SERVER_PROTOCOL_CATALOG_RETRY_DELAY_MS',
    0,
  );
  const bootstrapTimeoutMs = configuredInteger(
    options.bootstrapTimeoutMs ?? process.env.PUBLIC_SERVER_PROTOCOL_CATALOG_BOOTSTRAP_TIMEOUT_MS,
    180000,
    'PUBLIC_SERVER_PROTOCOL_CATALOG_BOOTSTRAP_TIMEOUT_MS',
    1,
  );
  const runSync = options.execFileSync || childProcess.execFileSync;
  const spawnSync = options.spawnSync || childProcess.spawnSync;
  const request = options.requestJson || requestJson;
  const wait = options.delay || delay;
  const identifier = options.identifier || `${process.pid}-${Date.now()}`;
  const containerName = `docs-server-protocol-catalog-${identifier}`;
  const bootstrapContainerName = `${containerName}-bootstrap`;
  const volumeName = `${containerName}-database`;
  const bootstrapLogPath = options.bootstrapLogPath
    || process.env.PUBLIC_SERVER_PROTOCOL_CATALOG_BOOTSTRAP_LOG
    || 'public-server-protocol-catalog-bootstrap.log';
  const serverLogPath = options.serverLogPath
    || process.env.PUBLIC_SERVER_PROTOCOL_CATALOG_SERVER_LOG
    || 'public-server-protocol-catalog-server.log';
  const lifecycle = {
    image_pull: 'pending',
    mirror_image_pull: mirrorServerImage ? 'pending' : 'not_requested',
    image_identity: {
      expected_digest: expectedImageDigest,
      observed_digest: null,
      immutable_reference: immutableServerImage,
      mirror_selector: mirrorServerImage,
      mirror_digest: null,
      expected_source_commit: expectedSourceCommit,
      observed_source_commit: null,
      mirror_source_commit: null,
      verification: 'pending',
    },
    storage: {
      kind: 'isolated_docker_volume',
      name: volumeName,
      mount: '/app/database',
      create: 'pending',
    },
    bootstrap: 'pending',
    server_start: 'pending',
    discovery: 'pending',
    cleanup: {
      server_container: {attempted: false, exit_code: null, signal: null},
      bootstrap_container: {attempted: false, exit_code: null, signal: null},
      storage_volume: {attempted: false, exit_code: null, signal: null},
    },
  };
  const diagnostics = {
    bootstrap_log: {artifact: path.basename(bootstrapLogPath), tail: []},
    server_log: {artifact: path.basename(serverLogPath), tail: []},
  };
  let failure = null;
  let discovery = null;
  let stage = 'diagnostics_setup';
  let volumeCreated = false;
  let bootstrapAttempted = false;
  let serverStartAttempted = false;
  let serverStarted = false;
  let bootstrapLog = '';
  let serverLog = '';

  fs.writeFileSync(bootstrapLogPath, '');
  fs.writeFileSync(serverLogPath, '');

  try {
    stage = 'image_pull';
    runSync(docker, ['pull', serverImage], {encoding: 'utf8'});
    lifecycle.image_pull = 'pass';
    if (mirrorServerImage) {
      stage = 'mirror_image_pull';
      runSync(docker, ['pull', mirrorServerImage], {encoding: 'utf8'});
      lifecycle.mirror_image_pull = 'pass';
    }

    stage = 'image_identity';
    try {
      const imageInspection = runSync(
        docker,
        ['image', 'inspect', '--format', '{{json .RepoDigests}}', serverImage],
        {encoding: 'utf8'},
      );
      lifecycle.image_identity.observed_digest = observedImageDigest(
        serverImage,
        immutableServerImage || serverImage,
        imageInspection,
      );
      if (
        expectedImageDigest !== null
        && lifecycle.image_identity.observed_digest !== expectedImageDigest
      ) {
        lifecycle.image_identity.verification = 'fail';
        throw new CatalogLifecycleError(
          'server_image_digest_mismatch',
          stage,
          `Published image ${serverImage} resolved to `
            + `${lifecycle.image_identity.observed_digest}, expected ${expectedImageDigest}.`,
        );
      }

      if (mirrorServerImage) {
        const mirrorInspection = runSync(
          docker,
          ['image', 'inspect', '--format', '{{json .RepoDigests}}', mirrorServerImage],
          {encoding: 'utf8'},
        );
        lifecycle.image_identity.mirror_digest = observedImageDigest(
          mirrorServerImage,
          mirrorServerImage,
          mirrorInspection,
        );
        if (
          lifecycle.image_identity.mirror_digest
            !== lifecycle.image_identity.observed_digest
        ) {
          throw new CatalogLifecycleError(
            'server_image_registry_digest_mismatch',
            stage,
            `Published Server registries disagree for ${serverImage} and `
              + `${mirrorServerImage}: ${lifecycle.image_identity.observed_digest} `
              + `versus ${lifecycle.image_identity.mirror_digest}.`,
          );
        }
      }

      const sourceInspection = runSync(
        docker,
        ['image', 'inspect', '--format', '{{json .Config.Labels}}', serverImage],
        {encoding: 'utf8'},
      );
      lifecycle.image_identity.observed_source_commit = observedImageSourceCommit(
        serverImage,
        sourceInspection,
      );
      if (
        expectedSourceCommit !== null
        && lifecycle.image_identity.observed_source_commit !== expectedSourceCommit
      ) {
        throw new CatalogLifecycleError(
          'server_image_source_mismatch',
          stage,
          `Published image ${serverImage} names source commit `
            + `${lifecycle.image_identity.observed_source_commit}, expected `
            + `${expectedSourceCommit}.`,
        );
      }

      if (mirrorServerImage) {
        const mirrorSourceInspection = runSync(
          docker,
          ['image', 'inspect', '--format', '{{json .Config.Labels}}', mirrorServerImage],
          {encoding: 'utf8'},
        );
        lifecycle.image_identity.mirror_source_commit = observedImageSourceCommit(
          mirrorServerImage,
          mirrorSourceInspection,
        );
        if (
          lifecycle.image_identity.mirror_source_commit
            !== lifecycle.image_identity.observed_source_commit
        ) {
          throw new CatalogLifecycleError(
            'server_image_registry_source_mismatch',
            stage,
            `Published Server registries disagree on source commit for ${serverImage} `
              + `and ${mirrorServerImage}.`,
          );
        }
      }

      expectedImageDigest = expectedImageDigest
        || lifecycle.image_identity.observed_digest;
      immutableServerImage = immutableServerImage
        || `${imageRepository(serverImage)}@${expectedImageDigest}`;
      lifecycle.image_identity.expected_digest = expectedImageDigest;
      lifecycle.image_identity.immutable_reference = immutableServerImage;
      lifecycle.image_identity.verification = 'pass';
    } catch (error) {
      lifecycle.image_identity.verification = 'fail';
      throw error instanceof CatalogLifecycleError
        ? error
        : new CatalogLifecycleError(
          'server_image_digest_unresolved',
          stage,
          `Could not resolve the immutable OCI identity for ${serverImage}. `
            + `${commandFailureDetail(error)}`,
          error,
        );
    }

    stage = 'storage_create';
    runSync(docker, ['volume', 'create', volumeName], {encoding: 'utf8'});
    volumeCreated = true;
    lifecycle.storage.create = 'pass';

    stage = 'server_bootstrap';
    bootstrapAttempted = true;
    try {
      bootstrapLog = commandOutput(runSync(docker, [
        'run',
        '--rm',
        '--name', bootstrapContainerName,
        '--volume', `${volumeName}:/app/database`,
        '--env', 'DW_AUTH_DRIVER=none',
        immutableServerImage,
        'server-bootstrap',
      ], {encoding: 'utf8', timeout: bootstrapTimeoutMs}));
      fs.writeFileSync(bootstrapLogPath, bootstrapLog);
      diagnostics.bootstrap_log.tail = tailLines(bootstrapLog);
      lifecycle.bootstrap = 'pass';
    } catch (error) {
      bootstrapLog = commandFailureDetail(error);
      fs.writeFileSync(bootstrapLogPath, `${bootstrapLog}\n`);
      diagnostics.bootstrap_log.tail = tailLines(bootstrapLog);
      lifecycle.bootstrap = 'fail';
      const timedOut = error && (error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM');
      throw new CatalogLifecycleError(
        timedOut ? 'server_bootstrap_timed_out' : 'server_bootstrap_failed',
        stage,
        timedOut
          ? `Published image ${serverImage} did not complete server-bootstrap within ${bootstrapTimeoutMs}ms. ${bootstrapLog}`
          : `Published image ${serverImage} failed server-bootstrap${Number.isInteger(error && error.status) ? ` with exit code ${error.status}` : ''}. ${bootstrapLog}`,
        error,
      );
    }

    stage = 'server_start';
    serverStartAttempted = true;
    try {
      runSync(docker, [
        'run',
        '--detach',
        '--rm',
        '--name', containerName,
        '--publish', `127.0.0.1:${port}:8080`,
        '--volume', `${volumeName}:/app/database`,
        '--env', 'DW_AUTH_DRIVER=none',
        '--env', 'DW_EXPOSE_PACKAGE_PROVENANCE=1',
        immutableServerImage,
      ], {encoding: 'utf8'});
      serverStarted = true;
      lifecycle.server_start = 'pass';
    } catch (error) {
      serverLog = commandFailureDetail(error);
      fs.writeFileSync(serverLogPath, `${serverLog}\n`);
      diagnostics.server_log.tail = tailLines(serverLog);
      lifecycle.server_start = 'fail';
      throw new CatalogLifecycleError(
        'published_image_start_failed',
        stage,
        `Could not start published image ${serverImage} after successful bootstrap. ${serverLog}`,
        error,
      );
    }

    stage = 'server_discovery';
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        discovery = await request(`http://127.0.0.1:${port}/api/cluster/info`);
        lifecycle.discovery = 'pass';
        break;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await wait(retryDelayMs);
        }
      }
    }

    if (discovery === null) {
      lifecycle.discovery = 'fail';
      throw new CatalogLifecycleError(
        'server_discovery_unavailable',
        stage,
        `Published image ${serverImage} did not return /api/cluster/info after ${attempts} attempt(s). ${lastError && lastError.message}`,
        lastError,
      );
    }
  } catch (error) {
    if (stage === 'image_pull' || stage === 'mirror_image_pull') {
      if (stage === 'mirror_image_pull') {
        lifecycle.mirror_image_pull = 'fail';
      } else {
        lifecycle.image_pull = 'fail';
      }
      failure = new CatalogLifecycleError(
        'published_image_pull_failed',
        stage,
        `Could not pull exact published image `
          + `${stage === 'mirror_image_pull' ? mirrorServerImage : serverImage}. `
          + `${commandFailureDetail(error)}`,
        error,
      );
    } else if (stage === 'storage_create') {
      lifecycle.storage.create = 'fail';
      failure = new CatalogLifecycleError(
        'sqlite_storage_create_failed',
        stage,
        `Could not create isolated SQLite storage for ${serverImage}. ${commandFailureDetail(error)}`,
        error,
      );
    } else {
      failure = error instanceof CatalogLifecycleError
        ? error
        : new CatalogLifecycleError(
          'published_image_lifecycle_failed',
          stage,
          `Published image ${serverImage} failed during ${stage}. ${commandFailureDetail(error)}`,
          error,
        );
    }
  } finally {
    if (serverStarted) {
      const logs = spawnSync(docker, ['logs', containerName], {encoding: 'utf8'});
      serverLog = [commandOutput(logs && logs.stdout), commandOutput(logs && logs.stderr)]
        .filter(value => value.trim() !== '')
        .join('\n');
      fs.writeFileSync(serverLogPath, serverLog);
      diagnostics.server_log.tail = tailLines(serverLog);
    }

    if (serverStartAttempted) {
      const removeServer = spawnSync(docker, ['rm', '-f', containerName], {encoding: 'utf8'});
      lifecycle.cleanup.server_container = cleanupResult(removeServer);
      if (serverStarted && !failure && removeServer.status !== 0) {
        failure = new CatalogLifecycleError(
          'server_cleanup_failed',
          'cleanup',
          `Could not remove verification container ${containerName}. ${commandFailureDetail(removeServer)}`,
        );
      }
    }

    if (bootstrapAttempted) {
      lifecycle.cleanup.bootstrap_container = cleanupResult(
        spawnSync(docker, ['rm', '-f', bootstrapContainerName], {encoding: 'utf8'}),
      );
    }

    if (volumeCreated) {
      const removeVolume = spawnSync(docker, ['volume', 'rm', '-f', volumeName], {encoding: 'utf8'});
      lifecycle.cleanup.storage_volume = cleanupResult(removeVolume);
      if (!failure && removeVolume.status !== 0) {
        failure = new CatalogLifecycleError(
          'storage_cleanup_failed',
          'cleanup',
          `Could not remove verification volume ${volumeName}. ${commandFailureDetail(removeVolume)}`,
        );
      }
    }
  }

  if (failure) {
    lifecycle.failed_stage = failure.stage;
    failure.lifecycle = lifecycle;
    failure.diagnostics = diagnostics;
    throw failure;
  }

  return {discovery, lifecycle, diagnostics};
}

function buildPublishedServerProtocolAuthority(
  evidence,
  publishedServerVersion,
  publicCatalog,
) {
  if (!isRecord(evidence)) {
    throw new Error('Published Server protocol authority evidence must be an object.');
  }
  if (
    evidence.schema !== 'durable-workflow.docs.public-server-protocol-catalog-conformance'
    || evidence.schema_version !== 3
    || evidence.outcome !== 'pass'
  ) {
    throw new Error(
      'Published Server protocol authority requires passing version 3 conformance evidence.',
    );
  }
  if (
    evidence.server_version !== publishedServerVersion
    || evidence.server_source_ref !== publishedServerVersion
  ) {
    throw new Error(
      'Published Server protocol authority evidence must match the published-component version.',
    );
  }
  if (!/^[0-9a-f]{40}$/.test(evidence.published_server_source_commit || '')) {
    throw new Error('Published Server protocol authority requires a full source commit.');
  }
  const imageIdentity = evidence.lifecycle?.image_identity;
  if (
    !/^sha256:[0-9a-f]{64}$/.test(evidence.expected_server_image_digest || '')
    || evidence.observed_server_image_digest !== evidence.expected_server_image_digest
    || typeof evidence.immutable_server_image !== 'string'
    || !evidence.immutable_server_image.endsWith(
      `@${evidence.expected_server_image_digest}`,
    )
    || !isRecord(imageIdentity)
    || imageIdentity.verification !== 'pass'
    || imageIdentity.expected_digest !== evidence.expected_server_image_digest
    || imageIdentity.observed_digest !== evidence.expected_server_image_digest
    || imageIdentity.mirror_digest !== evidence.expected_server_image_digest
  ) {
    throw new Error(
      'Published Server protocol authority requires one matching immutable OCI digest.',
    );
  }
  if (
    imageIdentity.expected_source_commit !== evidence.published_server_source_commit
    || imageIdentity.observed_source_commit !== evidence.published_server_source_commit
    || imageIdentity.mirror_source_commit !== evidence.published_server_source_commit
  ) {
    throw new Error(
      'Published Server protocol authority source checkout and image labels must agree.',
    );
  }
  if (
    !isRecord(evidence.expected_workflow_package_provenance)
    || !isRecord(evidence.observation?.package_provenance)
    || stableStringify(evidence.expected_workflow_package_provenance)
      !== stableStringify(evidence.observation.package_provenance)
  ) {
    throw new Error(
      'Published Server protocol authority package provenance must match its source lock.',
    );
  }
  const observedCatalog = evidence.observed_server_catalog;
  const expectedCatalogSha256 = catalogSha256(publicCatalog);
  if (
    !isRecord(observedCatalog)
    || observedCatalog.schema !== publicCatalog.schema
    || observedCatalog.version !== publicCatalog.version
    || observedCatalog.sha256 !== expectedCatalogSha256
  ) {
    throw new Error(
      'Published Server protocol authority observed catalog must match the public catalog.',
    );
  }

  return {
    schema: 'durable-workflow.docs.published-server-protocol-authority',
    schema_version: 1,
    server_version: publishedServerVersion,
    server_source_ref: evidence.server_source_ref,
    server_source_commit: evidence.published_server_source_commit,
    server_image: evidence.server_image,
    server_image_digest: evidence.expected_server_image_digest,
    immutable_server_image: evidence.immutable_server_image,
    workflow_package_provenance: evidence.expected_workflow_package_provenance,
    catalog: observedCatalog,
  };
}

function writeEvidence(pathname, evidence) {
  if (pathname) {
    fs.writeFileSync(pathname, `${JSON.stringify(evidence, null, 2)}\n`);
  }
}

async function main() {
  const artifactVersions = JSON.parse(fs.readFileSync(artifactVersionsPath, 'utf8')).artifacts;
  const publishedArtifactVersions = JSON.parse(fs.readFileSync(
    publishedArtifactVersionsPath,
    'utf8',
  )).artifacts;
  const serverVersion = process.env.PUBLIC_SERVER_VERSION
    || publishedArtifactVersions.server;
  const publicCatalog = JSON.parse(fs.readFileSync(
    process.env.PUBLIC_PROTOCOL_CATALOG_PATH || catalogPath,
    'utf8',
  ));
  const evidencePath = process.env.PUBLIC_SERVER_PROTOCOL_CATALOG_EVIDENCE;
  const serverSourcePath = process.env.PUBLIC_SERVER_SOURCE_PATH
    || path.join(repoRoot, '.published-server-protocol-authority');
  const qualifiedWorkflowArtifactRef = artifactVersions.workflow;
  let serverSourceCommit = null;
  let expectedWorkflowProvenance = null;
  let serverDiscovery;
  let lifecycle = null;
  let diagnostics = null;
  const serverImage = process.env.PUBLIC_SERVER_IMAGE
    || `durableworkflow/server:${serverVersion}`;
  const mirrorServerImage = process.env.PUBLIC_SERVER_MIRROR_IMAGE
    || `ghcr.io/durable-workflow/server:${serverVersion}`;
  const allowForwardCandidate =
    process.env.PUBLIC_SERVER_PROTOCOL_CATALOG_ALLOW_FORWARD_CANDIDATE === '1';

  try {
    serverSourceCommit = childProcess.execFileSync(
      'git',
      ['-C', serverSourcePath, 'rev-parse', 'HEAD'],
      {encoding: 'utf8'},
    ).trim();
    if (!/^[0-9a-f]{40}$/.test(serverSourceCommit)) {
      throw new CatalogLifecycleError(
        'server_source_authority_invalid',
        'setup',
        `Published Server source ref ${serverVersion} did not resolve to a full commit.`,
      );
    }
    expectedWorkflowProvenance = workflowProvenanceFromComposerLock(JSON.parse(
      fs.readFileSync(path.join(serverSourcePath, 'composer.lock'), 'utf8'),
    ));

    if (process.env.SERVER_DISCOVERY_PATH) {
      serverDiscovery = JSON.parse(fs.readFileSync(process.env.SERVER_DISCOVERY_PATH, 'utf8'));
      lifecycle = {mode: 'provided_snapshot'};
    } else {
      const publishedServer = await discoverPublishedServer(serverImage, {
        mirrorServerImage,
        expectedSourceCommit: serverSourceCommit,
      });
      serverDiscovery = publishedServer.discovery;
      lifecycle = publishedServer.lifecycle;
      diagnostics = publishedServer.diagnostics;
    }
    const observation = verifySnapshots(
      publicCatalog,
      serverDiscovery,
      expectedWorkflowProvenance,
      {allowForwardCandidate},
    );
    const evidence = {
      schema: 'durable-workflow.docs.public-server-protocol-catalog-conformance',
      schema_version: 3,
      checked_at: new Date().toISOString(),
      server_version: serverVersion,
      server_source_ref: serverVersion,
      server_image: serverImage,
      server_mirror_image: mirrorServerImage,
      expected_server_image_digest: lifecycle.image_identity?.expected_digest || null,
      observed_server_image_digest: lifecycle.image_identity?.observed_digest || null,
      immutable_server_image: lifecycle.image_identity?.immutable_reference || null,
      published_server_source_commit: serverSourceCommit,
      qualified_workflow_artifact_ref: qualifiedWorkflowArtifactRef,
      expected_workflow_package_ref: expectedWorkflowProvenance.ref,
      expected_workflow_package_provenance: expectedWorkflowProvenance,
      outcome: 'pass',
      lifecycle,
      diagnostics,
      observation,
      observed_server_catalog: {
        schema: serverDiscovery.platform_protocol_specs.schema,
        version: serverDiscovery.platform_protocol_specs.version,
        sha256: catalogSha256(serverDiscovery.platform_protocol_specs),
      },
      deployment: observation.deployment,
      findings: [],
    };
    writeEvidence(evidencePath, evidence);
    writeOutput('deployment_state', observation.deployment.state);
    writeOutput('deployment_reason', observation.deployment.reason);
    if (observation.deployment.state === deploymentStates.forwardCandidate) {
      console.log(
        `Source-qualified catalog ${observation.deployment.docs_catalog_version} is one `
          + `additive revision ahead of published Server catalog `
          + `${observation.deployment.published_server_catalog_version}; deployment permitted `
          + `without advancing the qualified aggregate artifact recommendation.`,
      );
    } else {
      console.log(
        `Published server protocol catalog matches the public authority: `
          + `server ${serverVersion}, catalog version ${observation.version}, `
          + `${observation.capability_records} capability records, `
          + `OCI manifest ${lifecycle.image_identity.expected_digest}, `
          + `embedded Workflow ${observation.package_provenance.ref} at `
          + `${observation.package_provenance.commit}; qualified standalone Workflow `
          + `${qualifiedWorkflowArtifactRef}.`,
      );
    }
  } catch (error) {
    const findings = error instanceof CatalogConformanceError
      ? error.findings
      : error instanceof CatalogLifecycleError
        ? [error.finding()]
        : [{kind: 'runner_failure', message: error.message}];
    if (error instanceof CatalogLifecycleError) {
      lifecycle = error.lifecycle;
      diagnostics = error.diagnostics;
    }
    writeEvidence(evidencePath, {
      schema: 'durable-workflow.docs.public-server-protocol-catalog-conformance',
      schema_version: 3,
      checked_at: new Date().toISOString(),
      server_version: serverVersion,
      server_source_ref: serverVersion,
      server_image: serverImage,
      server_mirror_image: mirrorServerImage,
      expected_server_image_digest: lifecycle?.image_identity?.expected_digest || null,
      observed_server_image_digest: lifecycle?.image_identity?.observed_digest || null,
      immutable_server_image: lifecycle?.image_identity?.immutable_reference || null,
      published_server_source_commit: serverSourceCommit,
      qualified_workflow_artifact_ref: qualifiedWorkflowArtifactRef,
      expected_workflow_package_ref: expectedWorkflowProvenance
        ? expectedWorkflowProvenance.ref
        : null,
      expected_workflow_package_provenance: expectedWorkflowProvenance,
      outcome: 'fail',
      lifecycle,
      diagnostics,
      deployment: null,
      observation: isRecord(serverDiscovery) ? {
        observed_workflow_package_ref: isRecord(serverDiscovery.package_provenance)
          ? serverDiscovery.package_provenance.ref || null
          : null,
        package_provenance: serverDiscovery.package_provenance || null,
        server_catalog_schema: serverDiscovery.platform_protocol_specs
          ? serverDiscovery.platform_protocol_specs.schema
          : null,
        server_catalog_version: serverDiscovery.platform_protocol_specs
          ? serverDiscovery.platform_protocol_specs.version
          : null,
      } : null,
      observed_server_catalog: isRecord(serverDiscovery?.platform_protocol_specs) ? {
        schema: serverDiscovery.platform_protocol_specs.schema || null,
        version: serverDiscovery.platform_protocol_specs.version || null,
        sha256: catalogSha256(serverDiscovery.platform_protocol_specs),
      } : null,
      findings,
    });
    console.error(error.message);
    for (const finding of findings.slice(0, 20)) {
      console.error(`- ${finding.message}`);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  CatalogConformanceError,
  CatalogLifecycleError,
  buildPublishedServerProtocolAuthority,
  catalogSha256,
  classifyCatalogDeployment,
  compareCatalogs,
  deploymentStates,
  discoverPublishedServer,
  observedImageDigest,
  observedImageSourceCommit,
  qualifiedServerIdentity,
  qualifiedServerSourceCommit,
  verifySnapshots,
  workflowProvenanceFromComposerLock,
  writeDeploymentSummary,
};
