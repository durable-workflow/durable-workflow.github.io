const fs = require('fs');
const path = require('path');

const {
  ARTIFACT_PIN_PATTERNS,
  ARTIFACT_VERSIONS,
  replaceArtifactTokens,
} = require('./public-artifact-versions');

const repoRoot = path.join(__dirname, '..');
const DOC_SOURCE_ROOTS = ['docs', 'versioned_docs'];
const DOC_SOURCE_EXTENSIONS = new Set(['.md', '.mdx']);

const SOURCE_PIN_PATTERNS = [
  ...ARTIFACT_PIN_PATTERNS,
  {
    category: 'cli_artifact_pin',
    label: 'CLI table version pin',
    pattern: /`dw`\s+`(2\.0\.0-beta\.\d+)`/g,
    expected: ARTIFACT_VERSIONS.cli,
  },
];

function fail(message) {
  throw new Error(message);
}

function sourceDocs(root = repoRoot) {
  const sources = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const filePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        visit(filePath);
      } else if (entry.isFile() && DOC_SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        sources.push(path.relative(root, filePath).split(path.sep).join('/'));
      }
    }
  }

  for (const sourceRoot of DOC_SOURCE_ROOTS) {
    const directory = path.join(root, sourceRoot);

    if (fs.existsSync(directory)) {
      visit(directory);
    }
  }

  sources.sort();

  if (sources.length === 0) {
    fail('No Markdown documentation sources were found');
  }

  return sources;
}

function assertObservedPinsCurrent(sourcePath, content) {
  for (const definition of SOURCE_PIN_PATTERNS) {
    const pattern = new RegExp(definition.pattern.source, definition.pattern.flags);
    const versions = [...content.matchAll(pattern)]
      .map(match => match.slice(1).find(Boolean))
      .filter(Boolean);
    const staleVersions = [...new Set(versions)]
      .filter(version => version !== definition.expected)
      .sort();

    if (staleVersions.length > 0) {
      fail(
        `${sourcePath} contains stale ${definition.label}: ` +
        `observed=${staleVersions.join(', ')} expected=${definition.expected}`
      );
    }
  }
}

function assertNoLiteralPins(sourcePath, content) {
  for (const definition of SOURCE_PIN_PATTERNS) {
    const pattern = new RegExp(definition.pattern.source, definition.pattern.flags);
    const versions = [...content.matchAll(pattern)]
      .map(match => match.slice(1).find(Boolean))
      .filter(Boolean);

    if (versions.length > 0) {
      fail(
        `${sourcePath} must use public artifact tokens instead of literal ${definition.label}: ` +
        `${[...new Set(versions)].sort().join(', ')}`
      );
    }
  }
}

function assertNoUnresolvedTokens(sourcePath, content) {
  const unresolved = [...content.matchAll(/%%artifact\.[^%\r\n]*%%/g)]
    .map(match => match[0]);

  if (unresolved.length > 0) {
    fail(
      `${sourcePath} contains unresolved public artifact tokens: ` +
      `${[...new Set(unresolved)].sort().join(', ')}`
    );
  }
}

function checkPublicArtifactSource(sourcePath, rawContent) {
  assertObservedPinsCurrent(sourcePath, rawContent);
  assertNoLiteralPins(sourcePath, rawContent);

  const renderedContent = replaceArtifactTokens(rawContent, sourcePath);
  assertNoUnresolvedTokens(sourcePath, renderedContent);
  assertObservedPinsCurrent(sourcePath, renderedContent);
}

function checkPublicArtifactPins(root = repoRoot) {
  const sources = sourceDocs(root);

  for (const sourcePath of sources) {
    const rawContent = fs.readFileSync(path.join(root, sourcePath), 'utf8');
    checkPublicArtifactSource(sourcePath, rawContent);
  }

  return sources.length;
}

function main() {
  const sourceCount = checkPublicArtifactPins();

  console.log(`Public artifact pin checks passed for ${sourceCount} source docs`);
}

if (require.main === module) {
  main();
}

module.exports = {
  checkPublicArtifactPins,
  checkPublicArtifactSource,
  sourceDocs,
};
