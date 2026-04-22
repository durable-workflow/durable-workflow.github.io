const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..', 'docs');
const contractPath = path.join(__dirname, 'discoverability-contract.json');
const topicsPath = path.join(docsDir, 'topics.md');
const searchPath = path.join(docsDir, 'search-and-navigation.md');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function normalize(value) {
  return value.toLowerCase().replace(/[`*_#[\]().,:/|-]+/g, ' ');
}

function assertIncludes(haystack, needle, context) {
  if (!haystack.includes(needle)) {
    throw new Error(`${context} must include ${JSON.stringify(needle)}`);
  }
}

function assertDocExists(relativePath) {
  const fullPath = path.join(docsDir, relativePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Discoverability target does not exist: docs/${relativePath}`);
  }

  return fullPath;
}

function assertQueryCovered(query) {
  const fullPath = assertDocExists(query.target);
  const content = normalize(read(fullPath));
  const aliases = [...query.query.split(/\s+/), ...(query.aliases || [])]
    .map(normalize)
    .map(alias => alias.trim())
    .filter(alias => alias.length >= 3);

  const covered = aliases.some(alias => content.includes(alias));

  if (!covered) {
    throw new Error(
      `docs/${query.target} does not contain query language for ${JSON.stringify(query.query)}`
    );
  }
}

function main() {
  const contract = JSON.parse(read(contractPath));
  const topics = read(topicsPath);
  const search = read(searchPath);

  assertIncludes(topics, './search-and-navigation.md', 'docs/topics.md');

  for (const link of contract.requiredTopicLinks || []) {
    assertDocExists(link);
    assertIncludes(search, link, 'docs/search-and-navigation.md');
  }

  for (const query of contract.queries || []) {
    assertQueryCovered(query);
  }

  console.log(`Discoverability checks passed for ${contract.queries.length} tracked queries`);
}

main();
