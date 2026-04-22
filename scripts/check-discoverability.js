const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..', 'docs');
const contractPath = path.join(__dirname, 'discoverability-contract.json');
const topicsPath = path.join(docsDir, 'topics.md');
const searchPath = path.join(docsDir, 'search-and-navigation.md');

const DOC_LINK_PATTERN = /\[[^\]]+\]\(([^)]+)\)/g;

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

function normalizeDocLink(href, sourcePath) {
  if (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('mailto:') ||
    href.startsWith('#')
  ) {
    return null;
  }

  const withoutAnchor = href.split('#')[0].split('?')[0];
  if (!withoutAnchor) {
    return null;
  }

  if (withoutAnchor.startsWith('/docs/2.0/')) {
    return withoutAnchor.slice('/docs/2.0/'.length);
  }

  if (withoutAnchor.startsWith('/docs/')) {
    return withoutAnchor.slice('/docs/'.length);
  }

  return path.posix
    .normalize(path.posix.join(path.posix.dirname(sourcePath), withoutAnchor))
    .replace(/^\.\//, '');
}

function extractDocLinks(markdown, sourcePath) {
  const links = new Set();
  let match;

  while ((match = DOC_LINK_PATTERN.exec(markdown)) !== null) {
    const link = normalizeDocLink(match[1], sourcePath);

    if (link) {
      links.add(link);
    }
  }

  return links;
}

function assertDocExists(relativePath) {
  const fullPath = path.join(docsDir, relativePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Discoverability target does not exist: docs/${relativePath}`);
  }

  return fullPath;
}

function assertTargetContentCoversQuery(query, collectionName) {
  const fullPath = assertDocExists(query.target);
  const content = normalize(read(fullPath));
  const aliases = [...query.query.split(/\s+/), ...(query.aliases || [])]
    .map(normalize)
    .map(alias => alias.trim())
    .filter(alias => alias.length >= 3);

  const covered = aliases.some(alias => content.includes(alias));

  if (!covered) {
    throw new Error(
      `${collectionName} target docs/${query.target} does not contain query language for ${JSON.stringify(query.query)}`
    );
  }
}

function assertSearchPageCoversQuery(query, search, links, collectionName) {
  const searchContent = normalize(search);
  const searchTerms = query.searchTerms || query.query.split(/\s+/);

  for (const term of searchTerms) {
    const normalizedTerm = normalize(term).trim();

    if (normalizedTerm.length >= 3 && !searchContent.includes(normalizedTerm)) {
      throw new Error(
        `docs/search-and-navigation.md must include search term ${JSON.stringify(term)} for ${collectionName} query ${JSON.stringify(query.query)}`
      );
    }
  }

  for (const link of [query.target, ...(query.related || [])]) {
    assertDocExists(link);

    if (!links.has(link)) {
      throw new Error(
        `docs/search-and-navigation.md must link to docs/${link} for ${collectionName} query ${JSON.stringify(query.query)}`
      );
    }
  }
}

function assertQueryCovered(query, search, links, collectionName) {
  assertTargetContentCoversQuery(query, collectionName);
  assertSearchPageCoversQuery(query, search, links, collectionName);
}

function main() {
  const contract = JSON.parse(read(contractPath));
  const topics = read(topicsPath);
  const search = read(searchPath);
  const searchLinks = extractDocLinks(search, 'search-and-navigation.md');

  assertIncludes(topics, './search-and-navigation.md', 'docs/topics.md');

  for (const link of contract.requiredTopicLinks || []) {
    assertDocExists(link);
    assertIncludes(search, link, 'docs/search-and-navigation.md');
  }

  for (const query of contract.queries || []) {
    assertQueryCovered(query, search, searchLinks, 'tracked search');
  }

  const zeroResultWatchlist = contract.zeroResultWatchlist || [];
  if (zeroResultWatchlist.length === 0) {
    throw new Error('Discoverability contract must include at least one zero-result watchlist query');
  }

  assertIncludes(search, 'Zero-Result Watchlist', 'docs/search-and-navigation.md');

  for (const query of zeroResultWatchlist) {
    assertQueryCovered(query, search, searchLinks, 'zero-result watchlist');
  }

  console.log(
    `Discoverability checks passed for ${contract.queries.length} tracked queries and ${zeroResultWatchlist.length} zero-result watchlist queries`
  );
}

main();
