const protocolCatalog = require('../static/platform-protocol-specs.json');
const {
  availableProtocolEntries,
} = require('../src/components/ProtocolCatalog/catalog');

const MODEL_CATALOG_START = '<!-- durable-workflow-platform-protocol-catalog:start -->';
const MODEL_CATALOG_END = '<!-- durable-workflow-platform-protocol-catalog:end -->';

function modelProtocolCatalog(catalog = protocolCatalog) {
  return {
    catalog_schema: catalog.schema,
    catalog_version: catalog.version,
    entries: availableProtocolEntries(catalog).map(([name, entry]) => ({
      catalog_entry: name,
      availability: 'available',
      spec_id: entry.spec_id,
      spec_url: entry.spec_url,
      owner_repo: entry.owner_repo,
      format: entry.format,
      status: entry.status,
      object_families: entry.object_families.map(family => ({
        name: family.name,
        owner_repo: family.owner_repo,
      })),
    })),
  };
}

function renderPlatformProtocolCatalog(catalog = protocolCatalog) {
  return [
    MODEL_CATALOG_START,
    '```json',
    JSON.stringify(modelProtocolCatalog(catalog), null, 2),
    '```',
    MODEL_CATALOG_END,
  ].join('\n');
}

function expandPlatformProtocolCatalog(content, catalog = protocolCatalog) {
  return content.replace(
    /<ProtocolCatalog\s*\/>/g,
    renderPlatformProtocolCatalog(catalog),
  );
}

module.exports = {
  MODEL_CATALOG_END,
  MODEL_CATALOG_START,
  expandPlatformProtocolCatalog,
  modelProtocolCatalog,
  renderPlatformProtocolCatalog,
};
