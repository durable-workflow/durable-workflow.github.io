#!/usr/bin/env node

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const {createSlugger, normalizeTags} = require('@docusaurus/utils');

const config = require('../docusaurus.config.js');
const {
  stablePlatformConformanceDiscoveryEntries,
} = require('./platform-conformance-public-discovery');
const {llmSourceHistoryPathspecs} = require('./llms-source-inventory');
const platformConformanceContract = require('../static/platform-conformance-contract.json');

const repoRoot = path.join(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const sitemapPath = path.join(buildDir, 'sitemap.xml');
const siteUrl = String(config.url || '').replace(/\/+$/, '');
const W3C_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ARTIFACT_RENDERING_SOURCE = 'scripts/public-artifact-versions.js';
const GENERATED_LLM_SHARED_SOURCES = [
  'docusaurus.config.js',
  ARTIFACT_RENDERING_SOURCE,
];
const GENERATED_LLM_COMPACT_SOURCES = [
  ...GENERATED_LLM_SHARED_SOURCES,
  'scripts/generate-llms.js',
];
const GENERATED_LLM_FULL_SOURCES = [
  ...GENERATED_LLM_SHARED_SOURCES,
  'scripts/generate-llms-full.js',
];
const GENERATED_LLM_V1_HISTORY_PATHSPECS = llmSourceHistoryPathspecs(
  'versioned_docs/version-1.x',
);
const GENERATED_LLM_V2_HISTORY_PATHSPECS = llmSourceHistoryPathspecs('docs');

const CORE_DISCOVERY_ENTRIES = [
  {
    path: '/docs/',
    buildPath: 'docs/index.html',
    sourcePaths: ['versioned_docs/version-1.x/introduction.md'],
  },
  {
    path: '/docs/2.0/quickstart/',
    buildPath: 'docs/2.0/quickstart/index.html',
    sourcePaths: ['docs/quickstart.md'],
  },
  {
    path: '/quickstart-execution-contract.json',
    buildPath: 'quickstart-execution-contract.json',
    sourcePaths: ['static/quickstart-execution-contract.json'],
  },
  {
    path: '/public-artifact-compatibility-evidence.json',
    buildPath: 'public-artifact-compatibility-evidence.json',
    sourcePaths: ['static/public-artifact-compatibility-evidence.json'],
  },
  {
    path: '/public-component-release-qualifications.json',
    buildPath: 'public-component-release-qualifications.json',
    sourcePaths: ['static/public-component-release-qualifications.json'],
  },
  {
    path: '/docs/2.0/polyglot/python/',
    buildPath: 'docs/2.0/polyglot/python/index.html',
    sourcePaths: ['docs/polyglot/python.md'],
  },
  {
    path: '/docs/2.0/polyglot/server/',
    buildPath: 'docs/2.0/polyglot/server/index.html',
    sourcePaths: ['docs/polyglot/server.md'],
  },
  {
    path: '/docs/2.0/polyglot/cli/',
    buildPath: 'docs/2.0/polyglot/cli/index.html',
    sourcePaths: ['docs/polyglot/cli.mdx'],
  },
  {
    path: '/docs/platform-conformance/',
    buildPath: 'docs/platform-conformance/index.html',
    sourcePaths: [
      'src/pages/docs/platform-conformance.mdx',
      'static/platform-conformance-contract.json',
    ],
  },
  {
    path: '/platform-conformance-contract.json',
    buildPath: 'platform-conformance-contract.json',
    sourcePaths: ['static/platform-conformance-contract.json'],
  },
  {
    path: '/platform-conformance/run-ledger.json',
    buildPath: 'platform-conformance/run-ledger.json',
    sourcePaths: ['static/platform-conformance/run-ledger.json'],
  },
  {
    path: '/docs-page-release-audit.json',
    buildPath: 'docs-page-release-audit.json',
    sourcePaths: ['scripts/generate-docs-page-release-audit.js'],
    revisionSensitive: true,
  },
  {
    path: '/docs-narrative-audit.json',
    buildPath: 'docs-narrative-audit.json',
    sourcePaths: ['scripts/generate-docs-narrative-audit.js'],
    revisionSensitive: true,
  },
  {
    path: '/llms.txt',
    buildPath: 'llms.txt',
    sourcePaths: GENERATED_LLM_COMPACT_SOURCES,
    sourceHistoryPathspecs: GENERATED_LLM_V1_HISTORY_PATHSPECS,
  },
  {
    path: '/llms-full.txt',
    buildPath: 'llms-full.txt',
    sourcePaths: GENERATED_LLM_FULL_SOURCES,
    sourceHistoryPathspecs: GENERATED_LLM_V1_HISTORY_PATHSPECS,
  },
  {
    path: '/llms-1.x.txt',
    buildPath: 'llms-1.x.txt',
    sourcePaths: GENERATED_LLM_COMPACT_SOURCES,
    sourceHistoryPathspecs: GENERATED_LLM_V1_HISTORY_PATHSPECS,
  },
  {
    path: '/llms-full-1.x.txt',
    buildPath: 'llms-full-1.x.txt',
    sourcePaths: GENERATED_LLM_FULL_SOURCES,
    sourceHistoryPathspecs: GENERATED_LLM_V1_HISTORY_PATHSPECS,
  },
  {
    path: '/llms-2.0.txt',
    buildPath: 'llms-2.0.txt',
    sourcePaths: GENERATED_LLM_COMPACT_SOURCES,
    sourceHistoryPathspecs: GENERATED_LLM_V2_HISTORY_PATHSPECS,
  },
  {
    path: '/llms-full-2.0.txt',
    buildPath: 'llms-full-2.0.txt',
    sourcePaths: GENERATED_LLM_FULL_SOURCES,
    sourceHistoryPathspecs: GENERATED_LLM_V2_HISTORY_PATHSPECS,
  },
  {
    path: '/2.0/llms-full.txt',
    buildPath: '2.0/llms-full.txt',
    sourcePaths: GENERATED_LLM_FULL_SOURCES,
    sourceHistoryPathspecs: GENERATED_LLM_V2_HISTORY_PATHSPECS,
  },
];

function buildRequiredDiscoveryEntries(contract = platformConformanceContract) {
  const entries = new Map(CORE_DISCOVERY_ENTRIES.map(entry => [entry.path, entry]));

  for (const entry of stablePlatformConformanceDiscoveryEntries(contract)) {
    if (!entries.has(entry.path)) {
      entries.set(entry.path, {
        ...entry,
        sourcePaths: [`static/${entry.buildPath}`],
      });
    }
  }

  return [...entries.values()];
}

const REQUIRED_DISCOVERY_ENTRIES = buildRequiredDiscoveryEntries();

function fail(message) {
  throw new Error(message);
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(value) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function publicUrl(routePath) {
  if (!siteUrl) {
    fail('docusaurus.config.js must define url before patching sitemap.xml');
  }

  return `${siteUrl}${routePath}`;
}

function normalizeRoutePath(routePath) {
  if (routePath === '/') {
    return routePath;
  }

  return routePath.replace(/\/+$/, '');
}

function normalizeW3cDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    fail(`Invalid source modification date: ${value}`);
  }

  return date.toISOString().slice(0, 10);
}

function isW3cDate(value) {
  if (!W3C_DATE.test(value)) {
    return false;
  }

  return normalizeW3cDate(`${value}T00:00:00.000Z`) === value;
}

function runGit(args, options = {}) {
  return childProcess.execFileSync('git', args, {
    cwd: options.repoRoot || repoRoot,
    encoding: 'utf8',
  }).trim();
}

function assertCompleteGitHistory(options = {}) {
  const git = options.git || ((args) => runGit(args, options));

  if (git(['rev-parse', '--is-shallow-repository']) === 'true') {
    fail(
      'Accurate sitemap modification dates require complete Git history; ' +
        'check out the repository with fetch-depth: 0',
    );
  }
}

function gitModificationDate(sourcePaths, options = {}) {
  const git = options.git || ((args) => runGit(args, options));
  const args = options.revisionSensitive
    ? ['log', '-1', '--format=%cI', 'HEAD']
    : ['log', '-1', '--format=%cI', '--', ...sourcePaths];
  const timestamp = git(args);

  if (!timestamp) {
    fail(`No Git modification history for sitemap sources: ${sourcePaths.join(', ')}`);
  }

  return normalizeW3cDate(timestamp);
}

function sourcePathCandidates(requestPath) {
  return [
    requestPath,
    `${requestPath}.js`,
    `${requestPath}.json`,
    `${requestPath}.md`,
    `${requestPath}.mdx`,
    path.join(requestPath, 'index.js'),
    path.join(requestPath, 'index.json'),
  ];
}

function resolveLocalImport(importerPath, request, options = {}) {
  const root = options.repoRoot || repoRoot;
  let unresolved;

  if (request.startsWith('@site/')) {
    unresolved = path.join(root, request.slice('@site/'.length));
  } else if (request.startsWith('.')) {
    unresolved = path.resolve(root, path.dirname(importerPath), request);
  } else {
    return null;
  }

  for (const candidate of sourcePathCandidates(unresolved)) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return path.relative(root, candidate).replace(/\\/g, '/');
    }
  }

  return null;
}

function collectRenderingDependencies(sourcePath, options = {}, visited = new Set()) {
  const root = options.repoRoot || repoRoot;
  const normalized = sourcePath.replace(/\\/g, '/');
  const absolutePath = path.join(root, normalized);

  if (visited.has(normalized) || !fs.existsSync(absolutePath)) {
    return visited;
  }

  visited.add(normalized);

  if (!fs.statSync(absolutePath).isFile()) {
    return visited;
  }

  const source = fs.readFileSync(absolutePath, 'utf8');
  const requests = [
    ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map(match => match[1]);

  if (/%%artifact\.[A-Za-z0-9]+%%/.test(source)) {
    requests.push(`@site/${ARTIFACT_RENDERING_SOURCE}`);
  }

  for (const request of requests) {
    const dependency = resolveLocalImport(normalized, request, options);
    if (dependency) {
      collectRenderingDependencies(dependency, options, visited);
    }
  }

  return visited;
}

function extractFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? match[1] : '';
}

function frontmatterValue(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*['"]?([^'"\\r\\n]+)['"]?\\s*$`, 'm'));
  return match ? match[1].trim() : null;
}

function parseStructuredSource(source, sourcePath) {
  const parsed = yaml.load(source);

  if (parsed === null || parsed === undefined) {
    return {};
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(`Expected structured sitemap source ${sourcePath} to contain an object`);
  }

  return parsed;
}

function structuredFrontmatter(source, sourcePath) {
  const frontmatter = extractFrontmatter(source);
  return frontmatter ? parseStructuredSource(frontmatter, sourcePath) : {};
}

function walkSourceFiles(directory, extensions, options = {}) {
  const root = options.repoRoot || repoRoot;
  const absoluteDirectory = path.join(root, directory);

  if (!fs.existsSync(absoluteDirectory)) {
    return [];
  }

  const files = [];
  for (const entry of fs.readdirSync(absoluteDirectory, {withFileTypes: true})) {
    const relativePath = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(relativePath, extensions, options));
    } else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(relativePath);
    }
  }
  return files;
}

function docRoute(sourcePath, routeBase, options = {}) {
  const root = options.repoRoot || repoRoot;
  const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  const slug = frontmatterValue(extractFrontmatter(source), 'slug');
  const sourceRoot = routeBase === '/docs/2.0' ? 'docs' : 'versioned_docs/version-1.x';
  const relativeSource = path.posix.relative(sourceRoot, sourcePath).replace(/\.(md|mdx)$/, '');
  const defaultSlug = relativeSource.endsWith('/index')
    ? relativeSource.slice(0, -'/index'.length)
    : relativeSource;
  const routeSlug = slug
    ? (slug.startsWith('/') ? slug.slice(1) : path.posix.join(path.dirname(defaultSlug), slug))
    : defaultSlug;
  return normalizeRoutePath(`${routeBase}/${routeSlug}`);
}

function blogRoute(sourcePath, options = {}) {
  const root = options.repoRoot || repoRoot;
  const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  const slug = frontmatterValue(extractFrontmatter(source), 'slug');
  const basename = path.basename(sourcePath).replace(/\.(md|mdx)$/, '');
  const defaultSlug = basename.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  return normalizeRoutePath(`/blog/${slug || defaultSlug}`);
}

function buildDocSourceIndex(sourceRoot, options = {}) {
  const root = options.repoRoot || repoRoot;
  const sources = new Map();

  for (
    const sourcePath of walkSourceFiles(sourceRoot, new Set(['.md', '.mdx']), options)
  ) {
    const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
    const relativeSource = path.posix
      .relative(sourceRoot, sourcePath)
      .replace(/\.(md|mdx)$/, '');
    const configuredId = frontmatterValue(extractFrontmatter(source), 'id');
    const docId = configuredId
      ? path.posix.join(path.posix.dirname(relativeSource), configuredId)
      : relativeSource;
    sources.set(docId, sourcePath);
  }

  return sources;
}

function collectSidebarDocSources(item, docSources, sources = new Set()) {
  if (typeof item === 'string') {
    const sourcePath = docSources.get(item);
    if (sourcePath) {
      sources.add(sourcePath);
    }
    return sources;
  }

  if (!item || typeof item !== 'object') {
    return sources;
  }

  if (item.type === 'doc' || item.type === 'ref') {
    const sourcePath = docSources.get(item.id);
    if (sourcePath) {
      sources.add(sourcePath);
    }
  }

  if (item.type === 'category' && item.link?.type === 'doc') {
    const sourcePath = docSources.get(item.link.id);
    if (sourcePath) {
      sources.add(sourcePath);
    }
  }

  for (const child of item.items || []) {
    collectSidebarDocSources(child, docSources, sources);
  }

  return sources;
}

function generatedIndexRoute(routeBase, link, label, categoryLabelSlugger) {
  const slug = link.slug ?? `/category/${categoryLabelSlugger.slug(label)}`;
  return normalizeRoutePath(path.posix.join(routeBase, slug));
}

function addSidebarGeneratedIndexRoutes(routes, options = {}) {
  const root = options.repoRoot || repoRoot;
  const sourceRoot = options.sourceRoot || 'docs';
  const sidebarPath = options.sidebarPath || 'sidebars.js';
  const routeBase = options.routeBase || '/docs/2.0';
  const absoluteSidebarPath = path.join(root, sidebarPath);

  if (!fs.existsSync(absoluteSidebarPath)) {
    return routes;
  }

  delete require.cache[require.resolve(absoluteSidebarPath)];
  const sidebars = options.sidebars || require(absoluteSidebarPath);
  const docSources = buildDocSourceIndex(sourceRoot, options);
  const categoryLabelSlugger = createSlugger();

  function visit(items) {
    for (const item of items || []) {
      if (!item || typeof item !== 'object' || item.type !== 'category') {
        continue;
      }

      if (item.link?.type === 'generated-index') {
        const routePath = generatedIndexRoute(
          routeBase,
          item.link,
          item.label,
          categoryLabelSlugger,
        );
        const sourcePaths = collectSidebarDocSources(
          item,
          docSources,
          new Set([sidebarPath]),
        );
        routes.set(routePath, [...sourcePaths].sort());
      }

      visit(item.items);
    }
  }

  for (const sidebar of Object.values(sidebars)) {
    visit(sidebar);
  }

  return routes;
}

function categoryMetadataPaths(sourceRoot, options = {}) {
  return walkSourceFiles(
    sourceRoot,
    new Set(['.json', '.yml', '.yaml']),
    options,
  ).filter(sourcePath => /^_category_\.(json|ya?ml)$/.test(path.basename(sourcePath)));
}

function addAutogeneratedCategoryRoutes(routes, options = {}) {
  const root = options.repoRoot || repoRoot;
  const sourceRoot = options.sourceRoot || 'versioned_docs/version-1.x';
  const sidebarPath =
    options.sidebarPath || 'versioned_sidebars/version-1.x-sidebars.json';
  const routeBase = options.routeBase || '/docs';
  const categoryLabelSlugger = createSlugger();

  for (const metadataPath of categoryMetadataPaths(sourceRoot, options).sort()) {
    const metadata = parseStructuredSource(
      fs.readFileSync(path.join(root, metadataPath), 'utf8'),
      metadataPath,
    );
    if (metadata.link?.type !== 'generated-index') {
      continue;
    }

    const categoryDirectory = path.posix.dirname(metadataPath);
    const label = metadata.label || path.posix.basename(categoryDirectory);
    const routePath = generatedIndexRoute(
      routeBase,
      metadata.link,
      label,
      categoryLabelSlugger,
    );
    const sourcePaths = new Set([sidebarPath, metadataPath]);

    for (const sourcePath of walkSourceFiles(
      categoryDirectory,
      new Set(['.md', '.mdx']),
      options,
    )) {
      sourcePaths.add(sourcePath);
    }
    for (const nestedMetadataPath of categoryMetadataPaths(categoryDirectory, options)) {
      sourcePaths.add(nestedMetadataPath);
    }

    routes.set(routePath, [...sourcePaths].sort());
  }

  return routes;
}

function findBlogTagsFile(options = {}) {
  const root = options.repoRoot || repoRoot;
  const candidates = options.blogTagsPath
    ? [options.blogTagsPath]
    : ['blog/tags.yml', 'blog/tags.yaml', 'blog/tags.json'];
  return candidates.find(sourcePath => fs.existsSync(path.join(root, sourcePath))) || null;
}

function addBlogTagRoutes(routes, options = {}) {
  const root = options.repoRoot || repoRoot;
  const tagsFilePath = findBlogTagsFile(options);
  const tagsFile = tagsFilePath
    ? parseStructuredSource(
        fs.readFileSync(path.join(root, tagsFilePath), 'utf8'),
        tagsFilePath,
      )
    : null;
  const tagSources = new Map();
  const blogSources = walkSourceFiles('blog', new Set(['.md', '.mdx']), options);

  for (const sourcePath of blogSources) {
    const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
    const frontmatter = structuredFrontmatter(source, sourcePath);
    const tags = normalizeTags({
      options: {onInlineTags: 'ignore'},
      source: sourcePath,
      frontMatterTags: frontmatter.tags,
      tagsBaseRoutePath: '/blog/tags',
      tagsFile,
    });

    for (const tag of tags) {
      const sources = tagSources.get(tag.permalink) || new Set();
      sources.add(sourcePath);
      if (tagsFilePath) {
        sources.add(tagsFilePath);
      }
      tagSources.set(tag.permalink, sources);
    }
  }

  const tagListSources = new Set(blogSources);
  if (tagsFilePath) {
    tagListSources.add(tagsFilePath);
  }
  routes.set('/blog/tags', [...tagListSources].sort());

  for (const [routePath, sourcePaths] of tagSources) {
    routes.set(normalizeRoutePath(routePath), [...sourcePaths].sort());
  }

  return routes;
}

function buildSourceRouteMap(options = {}) {
  const routes = new Map();

  for (const sourcePath of walkSourceFiles('docs', new Set(['.md', '.mdx']), options)) {
    routes.set(docRoute(sourcePath, '/docs/2.0', options), sourcePath);
  }
  for (
    const sourcePath of walkSourceFiles(
      'versioned_docs/version-1.x',
      new Set(['.md', '.mdx']),
      options,
    )
  ) {
    routes.set(docRoute(sourcePath, '/docs', options), sourcePath);
  }
  for (const sourcePath of walkSourceFiles('blog', new Set(['.md', '.mdx']), options)) {
    routes.set(blogRoute(sourcePath, options), sourcePath);
  }

  routes.set('/docs', 'versioned_docs/version-1.x/introduction.md');
  addSidebarGeneratedIndexRoutes(routes, options);
  addAutogeneratedCategoryRoutes(routes, options);
  addBlogTagRoutes(routes, options);
  return routes;
}

function configuredSourcesForRoute(routeSources, routePath) {
  const exact = routeSources.get(routePath);
  if (exact) {
    return exact;
  }

  const tagPaginationMatch = routePath.match(/^(\/blog\/tags\/[^/]+)\/page\/\d+$/);
  return tagPaginationMatch ? routeSources.get(tagPaginationMatch[1]) : undefined;
}

function sitemapBlocks(sitemap) {
  return [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match => ({
    block: match[0],
    body: match[1],
  }));
}

function blockLocation(block) {
  const match = block.match(/<loc>([^<]+)<\/loc>/);
  return match ? unescapeXml(match[1]) : null;
}

function blockLastmod(block) {
  const match = block.match(/<lastmod>([^<]+)<\/lastmod>/);
  return match ? match[1] : null;
}

function upsertLastmod(block, lastmod) {
  if (!isW3cDate(lastmod)) {
    fail(`Sitemap lastmod must be a valid W3C date, got ${lastmod}`);
  }

  if (/<lastmod>[^<]*<\/lastmod>/.test(block)) {
    return block.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${lastmod}</lastmod>`);
  }

  return block.replace(/<\/loc>/, `</loc><lastmod>${lastmod}</lastmod>`);
}

function replaceSitemapBlock(sitemap, location, replacement) {
  for (const {block} of sitemapBlocks(sitemap)) {
    if (blockLocation(block) === location) {
      return sitemap.replace(block, replacement);
    }
  }

  return null;
}

function sitemapEntry(url, lastmod) {
  return (
    `<url><loc>${escapeXml(url)}</loc><lastmod>${lastmod}</lastmod>` +
      '<changefreq>weekly</changefreq><priority>0.5</priority></url>'
  );
}

function fallbackSourcesForRoute(routePath) {
  if (routePath === '/docs' || routePath.startsWith('/docs/')) {
    return routePath === '/docs/2.0' || routePath.startsWith('/docs/2.0/')
      ? ['docs']
      : ['versioned_docs/version-1.x'];
  }
  if (routePath === '/blog' || routePath.startsWith('/blog/')) {
    return ['blog'];
  }
  return [];
}

function entrySourcePaths(entry, options = {}) {
  const dependencies = new Set(entry.sourceHistoryPathspecs || []);

  for (const sourcePath of entry.sourcePaths || []) {
    collectRenderingDependencies(sourcePath, options, dependencies);
  }

  return [...dependencies].sort();
}

function patchContentRouteFreshness(sitemap, options = {}) {
  const routeSources = options.routeSources || buildSourceRouteMap(options);
  const modificationDate = options.modificationDate || gitModificationDate;
  let result = sitemap;

  for (const {block} of sitemapBlocks(sitemap)) {
    const location = blockLocation(block);
    if (!location) {
      continue;
    }

    const routePath = normalizeRoutePath(new URL(location).pathname);
    const configuredSourcePaths = configuredSourcesForRoute(routeSources, routePath);
    let sourcePaths = [];

    if (configuredSourcePaths) {
      const dependencies = new Set();
      const routeSourcePaths = Array.isArray(configuredSourcePaths)
        ? configuredSourcePaths
        : [configuredSourcePaths];
      for (const sourcePath of routeSourcePaths) {
        collectRenderingDependencies(sourcePath, options, dependencies);
      }
      sourcePaths = [...dependencies].sort();
    } else if (!blockLastmod(block)) {
      sourcePaths = fallbackSourcesForRoute(routePath);
    }

    if (sourcePaths.length === 0) {
      continue;
    }

    const computed = modificationDate(sourcePaths, {
      ...options,
      revisionSensitive: false,
    });
    const current = blockLastmod(block);
    const lastmod = current && current > computed ? current : computed;
    result = replaceSitemapBlock(result, location, upsertLastmod(block, lastmod));
  }

  return result;
}

function patchDiscoveryEntries(sitemap, entries = REQUIRED_DISCOVERY_ENTRIES, options = {}) {
  const modificationDate = options.modificationDate || gitModificationDate;
  let result = sitemap;

  for (const entry of entries) {
    const url = publicUrl(entry.path);
    const sourcePaths = entrySourcePaths(entry, options);
    const lastmod = modificationDate(sourcePaths, {
      ...options,
      revisionSensitive: entry.revisionSensitive === true,
    });
    const currentBlock = sitemapBlocks(result)
      .map(({block}) => block)
      .find(block => blockLocation(block) === url);

    if (currentBlock) {
      result = replaceSitemapBlock(result, url, upsertLastmod(currentBlock, lastmod));
    } else {
      result = result.replace('</urlset>', `${sitemapEntry(url, lastmod)}</urlset>`);
    }
  }

  return result;
}

function assertSitemapFreshness(sitemap, entries = REQUIRED_DISCOVERY_ENTRIES) {
  const blocks = sitemapBlocks(sitemap);
  const byPath = new Map(blocks.map(({block}) => {
    const location = blockLocation(block);
    return [location ? new URL(location).pathname : '', block];
  }));

  for (const [routePath, block] of byPath) {
    if (
      routePath === '/docs/' ||
      routePath.startsWith('/docs/') ||
      routePath === '/blog/' ||
      routePath.startsWith('/blog/')
    ) {
      const lastmod = blockLastmod(block);
      if (!lastmod || !isW3cDate(lastmod)) {
        fail(`Documentation and blog sitemap route ${routePath} requires a valid lastmod`);
      }
    }
  }

  for (const entry of entries) {
    const block = byPath.get(entry.path);
    const lastmod = block && blockLastmod(block);
    if (!block || !lastmod || !isW3cDate(lastmod)) {
      fail(`Public discovery sitemap entry ${entry.path} requires a valid lastmod`);
    }
  }
}

function assertBuiltArtifact(entry, options = {}) {
  const outputDirectory = options.buildDir || buildDir;
  const artifactPath = path.join(outputDirectory, entry.buildPath);

  if (!fs.existsSync(artifactPath)) {
    fail(`Missing public discovery artifact: build/${entry.buildPath}`);
  }
}

function main() {
  if (!fs.existsSync(sitemapPath)) {
    fail('Missing generated sitemap: build/sitemap.xml');
  }

  assertCompleteGitHistory();

  for (const entry of REQUIRED_DISCOVERY_ENTRIES) {
    assertBuiltArtifact(entry);
  }

  const original = fs.readFileSync(sitemapPath, 'utf8');
  if (!original.includes('</urlset>')) {
    fail('Generated sitemap.xml is missing a closing </urlset>');
  }

  const withContentFreshness = patchContentRouteFreshness(original);
  const patched = patchDiscoveryEntries(withContentFreshness);
  assertSitemapFreshness(patched);

  if (patched !== original) {
    fs.writeFileSync(sitemapPath, patched);
  }

  console.log(
    `Public sitemap publishes source-derived freshness for content routes and ` +
      `${REQUIRED_DISCOVERY_ENTRIES.length} required discovery entries`,
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  REQUIRED_DISCOVERY_ENTRIES,
  assertCompleteGitHistory,
  assertSitemapFreshness,
  addAutogeneratedCategoryRoutes,
  addBlogTagRoutes,
  addSidebarGeneratedIndexRoutes,
  blockLastmod,
  blockLocation,
  buildRequiredDiscoveryEntries,
  buildSourceRouteMap,
  collectRenderingDependencies,
  gitModificationDate,
  isW3cDate,
  normalizeW3cDate,
  patchContentRouteFreshness,
  patchDiscoveryEntries,
  sitemapBlocks,
};
