#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const publicOrigin = 'https://durable-workflow.github.io';
const authorities = [
  {
    label: 'Version Compatibility protocol catalog',
    pagePath: 'docs/compatibility.md',
    renderedPath: 'build/docs/2.0/compatibility/index.html',
    manifestBinding: 'protocolCatalog',
    manifestImport: '@site/static/platform-protocol-specs.json',
    manifestPath: 'static/platform-protocol-specs.json',
    manifestUrl: `${publicOrigin}/platform-protocol-specs.json`,
  },
  {
    label: 'Platform Conformance Suite',
    pagePath: 'docs/platform-conformance.md',
    renderedPath: 'build/docs/2.0/platform-conformance/index.html',
    manifestBinding: 'platformConformanceContract',
    manifestImport: '@site/static/platform-conformance-contract.json',
    manifestPath: 'static/platform-conformance-contract.json',
    manifestUrl: `${publicOrigin}/platform-conformance-contract.json`,
  },
  {
    label: 'Platform Protocol Specs',
    pagePath: 'docs/platform-protocol-specs.md',
    renderedPath: 'build/docs/2.0/platform-protocol-specs/index.html',
    manifestBinding: 'protocolCatalog',
    manifestImport: '@site/static/platform-protocol-specs.json',
    manifestPath: 'static/platform-protocol-specs.json',
    manifestUrl: `${publicOrigin}/platform-protocol-specs.json`,
  },
];

function parseComponentAttributes(source, label) {
  const elements = [
    ...source.matchAll(/<PublicAuthorityIdentity\b([\s\S]*?)\/>/g),
  ];
  if (elements.length !== 1) {
    throw new Error(
      `${label} must declare exactly one PublicAuthorityIdentity element.`,
    );
  }

  const attributes = {};
  for (const match of elements[0][1].matchAll(
    /([A-Za-z][A-Za-z0-9]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*([A-Za-z_$][\w$]*)\s*\})/g,
  )) {
    attributes[match[1]] = match[2] ?? match[3] ?? {binding: match[4]};
  }

  return attributes;
}

function parseDefaultImports(source) {
  const imports = {};
  for (const match of source.matchAll(
    /\bimport\s+([A-Za-z_$][\w$]*)\s+from\s+(?:"([^"]+)"|'([^']+)')\s*;?/g,
  )) {
    imports[match[1]] = match[2] ?? match[3];
  }
  return imports;
}

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseHtmlAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(/([:\w-]+)="([^"]*)"/g)) {
    attributes[match[1]] = decodeHtml(match[2]);
  }
  return attributes;
}

function visibleText(source) {
  return decodeHtml(source.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function assertPublicManifestUrl(manifestUrl, expected, label) {
  const publicUrl = new URL(manifestUrl);
  const localManifestPath = path.join(repoRoot, 'static', publicUrl.pathname);
  if (
    manifestUrl !== expected.manifestUrl ||
    publicUrl.origin !== publicOrigin ||
    publicUrl.search ||
    publicUrl.hash ||
    path.resolve(localManifestPath) !==
      path.resolve(repoRoot, expected.manifestPath) ||
    !fs.existsSync(localManifestPath)
  ) {
    throw new Error(
      `${label} manifest URL must resolve to the published ${expected.manifestPath}.`,
    );
  }
}

function assertSourceAuthorityIdentity(source, expected, label) {
  const identity = parseComponentAttributes(source, label);
  const imports = parseDefaultImports(source);

  if (identity.manifestUrl !== expected.manifestUrl) {
    throw new Error(
      `${label} manifestUrl must be the public discovery URL ` +
        `${expected.manifestUrl}.`,
    );
  }
  if (identity.manifest?.binding !== expected.manifestBinding) {
    throw new Error(
      `${label} identity must use the ${expected.manifestBinding} manifest binding.`,
    );
  }
  if (imports[expected.manifestBinding] !== expected.manifestImport) {
    throw new Error(
      `${label} ${expected.manifestBinding} must import ${expected.manifestImport}.`,
    );
  }

  assertPublicManifestUrl(identity.manifestUrl, expected, label);
}

function assertRenderedAuthorityIdentity(html, manifest, expected, label) {
  const identities = [
    ...html.matchAll(
      /<([a-z][\w-]*)\b([^>]*\bdata-public-authority-identity="true"[^>]*)>([\s\S]*?)<\/\1>/g,
    ),
  ];
  if (identities.length !== 1) {
    throw new Error(
      `${label} rendered page must contain exactly one semantic authority identity.`,
    );
  }

  const attributes = parseHtmlAttributes(identities[0][2]);
  const body = identities[0][3];
  const expectedAttributes = {
    'data-authority-manifest': expected.manifestUrl,
    'data-authority-schema': manifest.schema,
    'data-authority-version': String(manifest.version),
  };
  for (const [name, value] of Object.entries(expectedAttributes)) {
    if (attributes[name] !== value) {
      throw new Error(
        `${label} rendered ${name} must be "${value}" ` +
          `(got ${JSON.stringify(attributes[name])}).`,
      );
    }
  }

  const links = [...body.matchAll(/<a\b([^>]*)>/g)]
    .map(match => parseHtmlAttributes(match[1]))
    .filter(link => link.href === expected.manifestUrl);
  if (links.length !== 1) {
    throw new Error(
      `${label} rendered identity must link to ${expected.manifestUrl}.`,
    );
  }

  const fields = Object.fromEntries(
    [...body.matchAll(/<code\b([^>]*)>([\s\S]*?)<\/code>/g)]
      .map(match => ({
        attributes: parseHtmlAttributes(match[1]),
        value: visibleText(match[2]),
      }))
      .filter(field => field.attributes['data-authority-field'])
      .map(field => [field.attributes['data-authority-field'], field.value]),
  );
  for (const [name, value] of Object.entries({
    schema: manifest.schema,
    version: String(manifest.version),
  })) {
    if (fields[name] !== value) {
      throw new Error(
        `${label} rendered ${name} must visibly display "${value}" ` +
          `(got ${JSON.stringify(fields[name])}).`,
      );
    }
  }
}

function main() {
  const checkRenderedPages = process.argv.includes('--rendered');

  for (const authority of authorities) {
    const source = fs.readFileSync(
      path.join(repoRoot, authority.pagePath),
      'utf8',
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(repoRoot, authority.manifestPath), 'utf8'),
    );
    assertSourceAuthorityIdentity(source, authority, authority.label);

    if (checkRenderedPages) {
      const html = fs.readFileSync(
        path.join(repoRoot, authority.renderedPath),
        'utf8',
      );
      assertRenderedAuthorityIdentity(
        html,
        manifest,
        authority,
        authority.label,
      );
    }
  }

  console.log(
    checkRenderedPages
      ? 'Rendered public authority page versions match their manifests.'
      : 'Public authority pages use their published manifests.',
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  assertRenderedAuthorityIdentity,
  assertSourceAuthorityIdentity,
  parseComponentAttributes,
  parseDefaultImports,
};
