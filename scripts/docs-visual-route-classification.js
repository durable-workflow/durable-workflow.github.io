const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const yaml = require('js-yaml');
const {
  CURRENT_V2_CONFORMANCE_FIXTURE_CATALOG_SECTION,
  PUBLIC_MANIFESTS_SECTION,
  SERVER_CONFIG_SECTION,
} = require('./section-capture-qualification');

const DOCUMENTATION_SOURCE_PATTERN = /^(?:docs|versioned_docs\/version-1\.x)\/.+\.mdx?$/;
const DIRECT_PAGE_PATTERN = /^src\/pages\/docs\/.+\.mdx?$/;
const VISUAL_SHELL_PATHS = Object.freeze([
  'docusaurus.config.js',
  'sidebars.js',
  'src/css/',
  'src/theme/',
]);
const ROUTE_SPECIFIC_SECTIONS = Object.freeze(new Map([
  ['docs/platform-conformance.md', CURRENT_V2_CONFORMANCE_FIXTURE_CATALOG_SECTION],
  ['docs/polyglot/server-config-reference.md', SERVER_CONFIG_SECTION],
  ['src/pages/docs/platform-conformance.mdx', PUBLIC_MANIFESTS_SECTION],
]));
const COMPONENT_SECTIONS = Object.freeze(new Map([
  ['src/components/ConformanceRunLedger/', PUBLIC_MANIFESTS_SECTION],
]));

function normalizeRoute(route) {
  const normalized = `/${route}`.replace(/\/{2,}/g, '/');
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function documentationRouteForFile(file, source = '') {
  let relativePath;
  let routePrefix;

  if (file.startsWith('docs/')) {
    relativePath = file.slice('docs/'.length);
    routePrefix = '/docs/2.0/';
  } else if (file.startsWith('versioned_docs/version-1.x/')) {
    relativePath = file.slice('versioned_docs/version-1.x/'.length);
    routePrefix = '/docs/';
  } else if (file.startsWith('src/pages/docs/')) {
    relativePath = file.slice('src/pages/docs/'.length);
    routePrefix = '/docs/';
  } else {
    return null;
  }

  if (!file.startsWith('src/pages/docs/')) {
    const frontMatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    const slug = frontMatter ? yaml.load(frontMatter[1])?.slug : null;
    if (typeof slug === 'string' && slug.length > 0) {
      if (slug.startsWith('/')) return normalizeRoute(`${routePrefix}${slug}`);
      const directory = path.posix.dirname(relativePath);
      return normalizeRoute(`${routePrefix}${directory === '.' ? '' : directory}/${slug}`);
    }
  }

  const withoutExtension = relativePath.replace(/\.mdx?$/, '');
  const routePath = withoutExtension.endsWith('/index')
    ? withoutExtension.slice(0, -'/index'.length)
    : withoutExtension;
  return normalizeRoute(`${routePrefix}${routePath}`);
}

function containsMarkdownTable(source) {
  return /^\s*\|(?:[^\n|]*\|)+\s*\n\s*\|(?:\s*:?-{3,}:?\s*\|)+/m.test(source);
}

function genericSectionForFile(file, source = '') {
  const route = documentationRouteForFile(file, source);
  if (!route) return null;
  const id = `changed-route-${file}`
    .replace(/\.mdx?$/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const scrollTarget = '.theme-doc-markdown h1';

  return Object.freeze({
    id,
    navigation_configuration: file.startsWith('docs/') ? 'current-v2' : 'stable-default',
    route,
    state: 'changed-route-heading',
    state_scope: 'section',
    scroll_target: scrollTarget,
    required_visible: Object.freeze([scrollTarget]),
    selection_reason: `changed documentation source: ${file}`,
    interaction: Object.freeze({
      action: 'scroll-to',
      selector: scrollTarget,
      block: 'nearest',
    }),
    viewports: SERVER_CONFIG_SECTION.viewports,
  });
}

function sectionKey(section) {
  return `${section.route}:${section.state}:${section.scroll_target}`;
}

function withSelectionReason(section, reason) {
  return Object.freeze({...section, selection_reason: reason});
}

function classifyChangedDocumentation({
  changedFiles,
  cwd = process.cwd(),
  readSource = file => fs.readFileSync(path.join(cwd, file), 'utf8'),
}) {
  const selected = new Map();
  const add = (section, reason) => {
    const candidate = withSelectionReason(section, reason);
    const key = sectionKey(candidate);
    if (!selected.has(key)) selected.set(key, candidate);
  };

  add(PUBLIC_MANIFESTS_SECTION, 'retained anchored-surface regression contract');
  add(SERVER_CONFIG_SECTION, 'retained table-and-floating-rail regression contract');

  for (const file of changedFiles) {
    const routeSpecific = ROUTE_SPECIFIC_SECTIONS.get(file);
    if (routeSpecific) {
      add(routeSpecific, `route-specific state selected from ${file}`);
      continue;
    }

    const component = [...COMPONENT_SECTIONS.entries()]
      .find(([prefix]) => file.startsWith(prefix));
    if (component) {
      add(component[1], `component surface selected from ${file}`);
      continue;
    }

    if (VISUAL_SHELL_PATHS.some(candidate => (
      candidate.endsWith('/') ? file.startsWith(candidate) : file === candidate
    ))) {
      add(PUBLIC_MANIFESTS_SECTION, `documentation shell representative selected from ${file}`);
      add(SERVER_CONFIG_SECTION, `table-heavy shell representative selected from ${file}`);
      continue;
    }

    if (!DOCUMENTATION_SOURCE_PATTERN.test(file) && !DIRECT_PAGE_PATTERN.test(file)) continue;
    let source;
    try {
      source = readSource(file);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (containsMarkdownTable(source)) {
      throw new Error(
        `${file} contains a table and requires a route-specific section capture mapping`,
      );
    }
    add(genericSectionForFile(file, source), `changed documentation route selected from ${file}`);
  }

  return {
    schema: 'durable-workflow.docs.visual-route-classification/v1',
    changed_files: [...changedFiles].sort(),
    sections: [...selected.values()],
  };
}

function changedFilesFromBase(baseRef, cwd = process.cwd()) {
  const result = spawnSync(
    'git',
    ['diff', '--name-only', '--no-renames', '--diff-filter=ACDMRTUXB', '-z', `${baseRef}...HEAD`],
    {cwd, encoding: 'buffer'},
  );
  if (result.status !== 0) return null;
  return result.stdout.toString('utf8').split('\0').filter(Boolean);
}

function resolveChangedFiles({environment = process.env, cwd = process.cwd()} = {}) {
  const baseRef = environment.VISUAL_QUALIFICATION_BASE_REF;
  if (baseRef) {
    const changedFiles = changedFilesFromBase(baseRef, cwd);
    if (changedFiles !== null) return changedFiles;
  }

  const parent = spawnSync('git', ['rev-parse', '--verify', 'HEAD^'], {
    cwd,
    encoding: 'utf8',
  });
  if (parent.status !== 0) return [];
  return changedFilesFromBase(parent.stdout.trim(), cwd) || [];
}

module.exports = {
  classifyChangedDocumentation,
  containsMarkdownTable,
  documentationRouteForFile,
  genericSectionForFile,
  resolveChangedFiles,
};
