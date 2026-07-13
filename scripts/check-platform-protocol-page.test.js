#!/usr/bin/env node

const assert = require('assert');

const {
  assertModelRetrievalSurface,
  parseModelProtocolCatalog,
} = require('./check-platform-protocol-page');
const {
  renderPlatformProtocolCatalog,
} = require('./render-platform-protocol-catalog');

const ownerRepo = 'durable-workflow/durable-workflow.github.io';
const catalog = {
  schema: 'durable-workflow.v2.platform-protocol-specs.catalog',
  version: 15,
  specs: {
    mcp_discovery: {
      format: 'json_schema',
      spec_id: 'durable-workflow.v2.mcp-discovery',
      owner_repo: ownerRepo,
      status: 'published',
      spec_url:
        'https://durable-workflow.github.io/platform-protocol-specs/mcp-discovery.schema.json',
      object_families: [
        {name: 'mcp_tool_discovery', owner_repo: ownerRepo},
        {name: 'llms_txt_discovery', owner_repo: ownerRepo},
      ],
    },
    mcp_tool_results: {
      format: 'json_schema',
      spec_id: 'durable-workflow.v2.mcp-tool-results',
      owner_repo: ownerRepo,
      status: 'published',
      spec_url:
        'https://durable-workflow.github.io/platform-protocol-specs/mcp-tool-results.schema.json',
      object_families: [
        {name: 'mcp_tool_result_envelope', owner_repo: ownerRepo},
        {name: 'agent_root_cause', owner_repo: ownerRepo},
        {name: 'agent_remediation', owner_repo: ownerRepo},
        {name: 'safe_mutation', owner_repo: ownerRepo},
      ],
    },
    future_protocol: {
      format: 'json_schema',
      spec_id: 'durable-workflow.v2.future-protocol',
      owner_repo: ownerRepo,
      status: 'planned',
      object_families: [
        {name: 'future_protocol_object', owner_repo: ownerRepo},
      ],
    },
  },
};

function replaceProjection(content, original, replacement) {
  return content.replace(
    JSON.stringify(original, null, 2),
    JSON.stringify(replacement, null, 2),
  );
}

const rendered = renderPlatformProtocolCatalog(catalog);
assert.doesNotThrow(
  () => assertModelRetrievalSurface(
    `Unstable prose before the generated data.\n${rendered}\nUnstable prose after it.`,
    catalog,
    'generated model fixture',
  ),
  'catalog association validation must not depend on prose or headings',
);

const swappedProjection = parseModelProtocolCatalog(rendered, 'generated model fixture');
const originalProjection = JSON.parse(JSON.stringify(swappedProjection));
const discovery = swappedProjection.entries.find(
  entry => entry.catalog_entry === 'mcp_discovery',
);
const toolResults = swappedProjection.entries.find(
  entry => entry.catalog_entry === 'mcp_tool_results',
);
[discovery.object_families, toolResults.object_families] = [
  toolResults.object_families,
  discovery.object_families,
];

assert.throws(
  () => assertModelRetrievalSurface(
    replaceProjection(rendered, originalProjection, swappedProjection),
    catalog,
    'family-swapped model fixture',
  ),
  /mcp_discovery object_families do not match the public catalog/,
  'object-family blocks from different entries must not be interchangeable',
);

const unavailableProjection = JSON.parse(JSON.stringify(originalProjection));
unavailableProjection.entries.push({
  catalog_entry: 'future_protocol',
  availability: 'available',
  spec_id: catalog.specs.future_protocol.spec_id,
  spec_url: 'https://durable-workflow.github.io/platform-protocol-specs/future.schema.json',
  owner_repo: ownerRepo,
  format: 'json_schema',
  status: 'planned',
  object_families: catalog.specs.future_protocol.object_families,
});
assert.throws(
  () => assertModelRetrievalSurface(
    replaceProjection(rendered, originalProjection, unavailableProjection),
    catalog,
    'availability-drifted model fixture',
  ),
  /rendered protocol availability does not match the public catalog/,
  'planned entries must not be rendered as available',
);

console.log('Rendered protocol catalog association adversarial checks passed.');
