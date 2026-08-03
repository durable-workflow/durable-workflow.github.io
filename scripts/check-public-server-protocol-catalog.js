#!/usr/bin/env node

const childProcess = require('child_process');
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
const artifactCompatibilityEvidencePath = path.join(
  repoRoot,
  'static',
  'public-artifact-compatibility-evidence.json',
);
const expectedSchema = 'durable-workflow.v2.platform-protocol-specs.catalog';
const expectedWorkflowSource = 'https://github.com/durable-workflow/workflow.git';
const maxFindings = 100;
const deploymentStates = Object.freeze({
  deployable: 'deployable',
  deferred: 'source-qualified-deployment-deferred',
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

function addFinding(findings, finding) {
  if (findings.length < maxFindings) {
    findings.push(finding);
  }
}

function workflowProvenanceFromComposerLock(composerLock) {
  if (!isRecord(composerLock)) {
    throw new Error('Qualified Server composer.lock must be a JSON object.');
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
      'Qualified Server composer.lock must contain exactly one durable-workflow/workflow package.',
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
      'Qualified Server composer.lock must bind Workflow to an authorized public version ' +
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
      message: 'A forward catalog candidate requires integer docs and qualified Server revisions.',
    });
  } else if (publicVersion === serverVersion) {
    addFinding(findings, {
      kind: 'catalog_same_revision_drift',
      path: '$.version',
      public_version: publicVersion,
      server_version: serverVersion,
      message: `Catalog revision ${publicVersion} differs from the qualified Server at the same revision.`,
    });
  } else if (publicVersion < serverVersion) {
    addFinding(findings, {
      kind: 'catalog_backward_revision',
      path: '$.version',
      public_version: publicVersion,
      server_version: serverVersion,
      message: `Docs catalog revision ${publicVersion} is behind qualified Server revision ${serverVersion}.`,
    });
  } else if (publicVersion !== serverVersion + 1) {
    addFinding(findings, {
      kind: 'catalog_revision_jump',
      path: '$.version',
      public_version: publicVersion,
      server_version: serverVersion,
      message: `Docs catalog revision ${publicVersion} must be exactly one revision ahead of qualified Server revision ${serverVersion}.`,
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
    state: deploymentStates.deferred,
    reason: 'qualified_server_catalog_one_revision_behind_additive_source',
    docs_catalog_version: publicVersion,
    qualified_server_catalog_version: serverVersion,
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
      reason: 'exact_qualified_server_catalog_match',
      docs_catalog_version: publicCatalog.version,
      qualified_server_catalog_version: serverCatalog.version,
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
  if (!summaryPath || deployment?.state !== deploymentStates.deferred) {
    return;
  }
  const additions = deployment.structural_check.added_object_families
    .map(family => `${family.spec}:${family.name}`);
  fs.appendFileSync(summaryPath, [
    '## Source-qualified catalog; deployment deferred',
    '',
    `- State: \`${deployment.state}\``,
    `- Reason: \`${deployment.reason}\``,
    `- Docs catalog revision: \`${deployment.docs_catalog_version}\``,
    `- Qualified Server catalog revision: \`${deployment.qualified_server_catalog_version}\``,
    `- Added protocol specs: ${deployment.structural_check.added_specs.length}`,
    `- Added object families: ${additions.length > 0 ? additions.map(value => `\`${value}\``).join(', ') : 'none'}`,
    `- Evidence artifact file: \`${path.basename(evidencePath)}\``,
    '',
    'The source catalog is exactly one additive revision ahead. Website build, Pages deployment, and Helm publication are deferred until the qualified Server catalog matches exactly.',
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
      `Published image selector ${serverImage} does not name qualified repository `
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

async function discoverPublishedServer(serverImage, options = {}) {
  const docker = options.docker || process.env.DOCKER || 'docker';
  const expectedImageDigest = options.expectedImageDigest;
  const immutableServerImage = options.immutableServerImage;
  if (
    !/^sha256:[0-9a-f]{64}$/.test(expectedImageDigest || '')
    || typeof immutableServerImage !== 'string'
    || !immutableServerImage.endsWith(`@${expectedImageDigest}`)
  ) {
    throw new CatalogLifecycleError(
      'invalid_image_identity_configuration',
      'setup',
      'Published Server discovery requires a qualified OCI digest and immutable image reference.',
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
    image_identity: {
      expected_digest: expectedImageDigest,
      observed_digest: null,
      immutable_reference: immutableServerImage,
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

    stage = 'image_identity';
    let imageInspection;
    try {
      imageInspection = runSync(
        docker,
        ['image', 'inspect', '--format', '{{json .RepoDigests}}', serverImage],
        {encoding: 'utf8'},
      );
      lifecycle.image_identity.observed_digest = observedImageDigest(
        serverImage,
        immutableServerImage,
        imageInspection,
      );
      if (lifecycle.image_identity.observed_digest !== expectedImageDigest) {
        lifecycle.image_identity.verification = 'fail';
        throw new CatalogLifecycleError(
          'server_image_digest_mismatch',
          stage,
          `Published image ${serverImage} resolved to `
            + `${lifecycle.image_identity.observed_digest}, expected ${expectedImageDigest}.`,
        );
      }
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
    if (stage === 'image_pull') {
      lifecycle.image_pull = 'fail';
      failure = new CatalogLifecycleError(
        'published_image_pull_failed',
        stage,
        `Could not pull exact published image ${serverImage}. ${commandFailureDetail(error)}`,
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

function writeEvidence(pathname, evidence) {
  if (pathname) {
    fs.writeFileSync(pathname, `${JSON.stringify(evidence, null, 2)}\n`);
  }
}

async function main() {
  const artifactVersions = JSON.parse(fs.readFileSync(artifactVersionsPath, 'utf8')).artifacts;
  const serverVersion = process.env.PUBLIC_SERVER_VERSION || artifactVersions.server;
  const publicCatalog = JSON.parse(fs.readFileSync(
    process.env.PUBLIC_PROTOCOL_CATALOG_PATH || catalogPath,
    'utf8',
  ));
  const evidencePath = process.env.PUBLIC_SERVER_PROTOCOL_CATALOG_EVIDENCE;
  const serverSourcePath = process.env.PUBLIC_SERVER_SOURCE_PATH
    || path.join(repoRoot, '.server-authority');
  const qualifiedWorkflowArtifactRef = artifactVersions.workflow;
  let serverSourceCommit = null;
  let expectedWorkflowProvenance = null;
  let serverDiscovery;
  let lifecycle = null;
  let diagnostics = null;
  let qualifiedServer = null;
  let serverImage = process.env.PUBLIC_SERVER_IMAGE || null;
  const allowForwardCandidate =
    process.env.PUBLIC_SERVER_PROTOCOL_CATALOG_ALLOW_FORWARD_CANDIDATE === '1';

  try {
    const compatibilityEvidenceSource = JSON.parse(fs.readFileSync(
      artifactCompatibilityEvidencePath,
      'utf8',
    ));
    qualifiedServer = qualifiedServerIdentity(
      artifactVersions,
      compatibilityEvidenceSource,
    );
    serverSourceCommit = qualifiedServer.sourceCommit;
    serverImage = serverImage || `${qualifiedServer.repository}:${serverVersion}`;
    const checkedOutServerCommit = childProcess.execFileSync(
      'git',
      ['-C', serverSourcePath, 'rev-parse', 'HEAD'],
      {encoding: 'utf8'},
    ).trim();
    if (checkedOutServerCommit !== serverSourceCommit) {
      throw new CatalogLifecycleError(
        'server_source_authority_mismatch',
        'setup',
        `Qualified Server source expected ${serverSourceCommit}, got ${checkedOutServerCommit}.`,
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
        expectedImageDigest: qualifiedServer.expectedDigest,
        immutableServerImage: qualifiedServer.immutableReference,
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
      schema_version: 2,
      checked_at: new Date().toISOString(),
      server_version: serverVersion,
      server_image: serverImage,
      expected_server_image_digest: qualifiedServer.expectedDigest,
      observed_server_image_digest: lifecycle.image_identity?.observed_digest || null,
      immutable_server_image: qualifiedServer.immutableReference,
      qualified_server_source_commit: serverSourceCommit,
      qualified_workflow_artifact_ref: qualifiedWorkflowArtifactRef,
      expected_workflow_package_ref: expectedWorkflowProvenance.ref,
      expected_workflow_package_provenance: expectedWorkflowProvenance,
      outcome: 'pass',
      lifecycle,
      diagnostics,
      observation,
      deployment: observation.deployment,
      findings: [],
    };
    writeEvidence(evidencePath, evidence);
    writeOutput('deployment_state', observation.deployment.state);
    writeOutput('deployment_reason', observation.deployment.reason);
    if (observation.deployment.state === deploymentStates.deferred) {
      console.log(
        `Source-qualified catalog ${observation.deployment.docs_catalog_version} is one `
          + `additive revision ahead of qualified Server catalog `
          + `${observation.deployment.qualified_server_catalog_version}; deployment deferred.`,
      );
    } else {
      console.log(
        `Published server protocol catalog matches the public authority: `
          + `server ${serverVersion}, catalog version ${observation.version}, `
          + `${observation.capability_records} capability records, `
          + `OCI manifest ${qualifiedServer.expectedDigest}, `
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
      schema_version: 2,
      checked_at: new Date().toISOString(),
      server_version: serverVersion,
      server_image: serverImage,
      expected_server_image_digest: qualifiedServer?.expectedDigest || null,
      observed_server_image_digest: lifecycle?.image_identity?.observed_digest || null,
      immutable_server_image: qualifiedServer?.immutableReference || null,
      qualified_server_source_commit: serverSourceCommit,
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
  classifyCatalogDeployment,
  compareCatalogs,
  deploymentStates,
  discoverPublishedServer,
  observedImageDigest,
  qualifiedServerIdentity,
  qualifiedServerSourceCommit,
  verifySnapshots,
  workflowProvenanceFromComposerLock,
  writeDeploymentSummary,
};
