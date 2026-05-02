const fs = require('fs');
const path = require('path');

const config = require('../docusaurus.config.js');

const DOC_EXTS = new Set(['.md', '.mdx']);
const EXCLUDED_FILES = new Set(['sponsors.md', 'support.md']);
const FALLBACK_BRANCH = 'main';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isDocFile(filePath) {
  return DOC_EXTS.has(path.extname(filePath));
}

function shouldExclude(filePath) {
  return EXCLUDED_FILES.has(path.basename(filePath));
}

function extractFrontmatterAndContent(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (!match) {
    return { frontmatter: '', content: raw };
  }

  return { frontmatter: match[1], content: match[2] };
}

function getFrontmatterValue(frontmatter, key) {
  const pattern = new RegExp(`^${key}:[^\\S\\r\\n]*(.+)$`, 'm');
  const match = frontmatter.match(pattern);

  if (!match) {
    return null;
  }

  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function getFrontmatterList(frontmatter, key) {
  const inline = getFrontmatterValue(frontmatter, key);

  if (inline) {
    if (inline.startsWith('[') && inline.endsWith(']')) {
      return inline
        .slice(1, -1)
        .split(',')
        .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    }

    return [inline];
  }

  const blockPattern = new RegExp(`^${key}:\\s*\\r?\\n((?:\\s+-\\s+.+\\r?\\n?)+)`, 'm');
  const block = frontmatter.match(blockPattern);

  if (!block) {
    return [];
  }

  return block[1]
    .split(/\r?\n/)
    .map(line => line.match(/^\s+-\s+(.+)$/))
    .filter(Boolean)
    .map(match => match[1].trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function getSidebarPosition(frontmatter) {
  const value = getFrontmatterValue(frontmatter, 'sidebar_position');
  const position = Number(value);
  return Number.isFinite(position) ? position : Infinity;
}

function getCategoryMetadata(dirPath) {
  const categoryFile = path.join(dirPath, '_category_.json');

  if (!fs.existsSync(categoryFile)) {
    return {
      label: humanize(path.basename(dirPath)),
      position: Infinity,
    };
  }

  try {
    const category = JSON.parse(fs.readFileSync(categoryFile, 'utf8'));

    return {
      label: category.label || humanize(path.basename(dirPath)),
      position: Number.isFinite(category.position) ? category.position : Infinity,
    };
  } catch {
    return {
      label: humanize(path.basename(dirPath)),
      position: Infinity,
    };
  }
}

function getPositionForItem(itemPath) {
  const stat = fs.statSync(itemPath);

  if (stat.isDirectory()) {
    return getCategoryMetadata(itemPath).position;
  }

  if (isDocFile(itemPath)) {
    const { frontmatter } = extractFrontmatterAndContent(itemPath);
    return getSidebarPosition(frontmatter);
  }

  return Infinity;
}

function humanize(value) {
  return value
    .replace(/[-_+]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function escapeMarkdown(text) {
  return text.replace(/([\\[\]])/g, '\\$1');
}

function extractHeadingTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function getDocTitle(filePath) {
  const { frontmatter, content } = extractFrontmatterAndContent(filePath);

  return (
    getFrontmatterValue(frontmatter, 'title') ||
    getFrontmatterValue(frontmatter, 'sidebar_label') ||
    extractHeadingTitle(content) ||
    humanize(path.basename(filePath, path.extname(filePath)))
  );
}

function getDocMetadata(filePath) {
  const { frontmatter } = extractFrontmatterAndContent(filePath);

  return {
    description: getFrontmatterValue(frontmatter, 'description'),
    topics: [
      ...getFrontmatterList(frontmatter, 'tags'),
      ...getFrontmatterList(frontmatter, 'keywords'),
    ],
  };
}

function sortItems(items) {
  return items.sort((a, b) => {
    const positionA = getPositionForItem(a);
    const positionB = getPositionForItem(b);

    if (positionA !== positionB) {
      return positionA - positionB;
    }

    return a.localeCompare(b);
  });
}

function getSiteBaseUrl() {
  const siteUrl = config.url || 'https://example.com/';
  const baseUrl = config.baseUrl || '/';
  return new URL(baseUrl, siteUrl).toString();
}

function getRepoRawBaseUrl() {
  const preset = Array.isArray(config.presets)
    ? config.presets.find(entry => Array.isArray(entry) && entry[0] === 'classic')
    : null;
  const editUrl = preset && preset[1] && preset[1].docs ? preset[1].docs.editUrl : null;

  if (typeof editUrl === 'string') {
    const match = editUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/edit\/([^/]+)\/?$/);

    if (match) {
      const [, owner, repo, branch] = match;
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`;
    }
  }

  const owner = config.organizationName || 'owner';
  const repo = config.projectName || 'repo';

  return `https://raw.githubusercontent.com/${owner}/${repo}/${FALLBACK_BRANCH}/`;
}

function buildDocLink(filePath, repoRawBaseUrl) {
  const repoRelativePath = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');
  return new URL(repoRelativePath, repoRawBaseUrl).toString();
}

function buildDocNote(filePath) {
  const metadata = getDocMetadata(filePath);
  const noteParts = [];

  if (metadata.description) {
    noteParts.push(metadata.description);
  }

  const topics = [...new Set(metadata.topics)].slice(0, 6);
  if (topics.length > 0) {
    noteParts.push(`Topics: ${topics.join(', ')}`);
  }

  return noteParts.join(' ');
}

function collectDocLinks(dirPath, repoRawBaseUrl) {
  const items = sortItems(
    fs.readdirSync(dirPath)
      .map(name => path.join(dirPath, name))
      .filter(itemPath => {
        const stat = fs.statSync(itemPath);
        return (stat.isDirectory() || isDocFile(itemPath)) && !shouldExclude(itemPath);
      })
  );

  const links = [];

  for (const item of items) {
    const stat = fs.statSync(item);

    if (stat.isDirectory()) {
      links.push(...collectDocLinks(item, repoRawBaseUrl));
      continue;
    }

    links.push({
      title: getDocTitle(item),
      url: buildDocLink(item, repoRawBaseUrl),
      note: buildDocNote(item),
    });
  }

  return links;
}

function collectSections(docsDir, repoRawBaseUrl) {
  const topLevelItems = sortItems(
    fs.readdirSync(docsDir)
      .map(name => path.join(docsDir, name))
      .filter(itemPath => {
        const stat = fs.statSync(itemPath);
        return (stat.isDirectory() || isDocFile(itemPath)) && !shouldExclude(itemPath);
      })
  );

  const rootDocs = [];
  const sections = [];

  for (const item of topLevelItems) {
    const stat = fs.statSync(item);

    if (stat.isDirectory()) {
      const category = getCategoryMetadata(item);
      const links = collectDocLinks(item, repoRawBaseUrl);

      if (links.length > 0) {
        sections.push({
          title: category.label,
          links,
        });
      }

      continue;
    }

    rootDocs.push({
      title: getDocTitle(item),
      url: buildDocLink(item, repoRawBaseUrl),
      note: buildDocNote(item),
    });
  }

  if (rootDocs.length > 0) {
    sections.unshift({
      title: 'Core Docs',
      links: rootDocs,
    });
  }

  return sections;
}

function renderSection(section) {
  const lines = [`## ${section.title}`, ''];

  for (const link of section.links) {
    const note = link.note ? `: ${link.note}` : '';
    lines.push(`- [${escapeMarkdown(link.title)}](${link.url})${note}`);
  }

  return lines.join('\n');
}

function generateManifest(docsDir, outputPath, fullManifestUrl) {
  const siteBaseUrl = getSiteBaseUrl();
  const repoRawBaseUrl = getRepoRawBaseUrl();
  const siteTitle = config.title || 'Documentation';
  const siteTagline = config.tagline || 'Documentation index.';
  const sections = collectSections(docsDir, repoRawBaseUrl);
  const optionalSection = {
    title: 'Optional',
    links: [
      {
        title: `${siteTitle} full documentation bundle`,
        url: fullManifestUrl,
        note: 'Single-file bundle of the complete documentation set.',
      },
    ],
  };
  const renderedSections = [...sections, optionalSection].map(renderSection).join('\n\n');

  const content = [
    `# ${siteTitle}`,
    '',
    `> ${siteTagline}`,
    '',
    'This file is a curated markdown index for LLMs. Use the sections below for targeted source documents, or use the optional full bundle when you want the entire documentation set in one file.',
    '',
    'Each link includes frontmatter descriptions and discoverability topics when the source page provides them. Prefer those notes to pick the smallest relevant page before falling back to the full bundle.',
    '',
    renderedSections,
    '',
  ].join('\n');

  fs.writeFileSync(outputPath, content, 'utf8');
}

function main() {
  const buildDir = path.join(__dirname, '..', 'build');
  const siteBaseUrl = getSiteBaseUrl();

  ensureDir(buildDir);

  // The canonical /llms.txt must match the site's `lastVersion` (set to '1.x'
  // in docusaurus.config.js) — that is what /docs/, the navbar default, and
  // human visitors get. v2.0 is alpha and is reachable only via the explicit
  // /docs/2.0/ paths and the /llms-2.0.txt pinned alias. Earlier the canonical
  // was wired to v2 source; that surfaced alpha protocol surfaces to LLM tools
  // hitting the well-known /llms.txt as if they were stable.
  const v1DocsDir = path.join(__dirname, '..', 'versioned_docs', 'version-1.x');
  if (fs.existsSync(v1DocsDir)) {
    const canonicalOutputFile = path.join(buildDir, 'llms.txt');
    const canonicalFullUrl = new URL('llms-full.txt', siteBaseUrl).toString();
    generateManifest(v1DocsDir, canonicalOutputFile, canonicalFullUrl);
    console.log('Canonical llms.txt generated from v1.x docs (matches lastVersion):', canonicalOutputFile);

    const v1OutputFile = path.join(buildDir, 'llms-1.x.txt');
    const v1FullUrl = new URL('llms-full-1.x.txt', siteBaseUrl).toString();
    generateManifest(v1DocsDir, v1OutputFile, v1FullUrl);
    console.log('v1.x llms-1.x.txt generated successfully:', v1OutputFile);
  }

  // v2.0 is the alpha-tracked next version. Only reachable via the explicit
  // version-pinned URL, never canonical.
  const v2DocsDir = path.join(__dirname, '..', 'docs');
  if (fs.existsSync(v2DocsDir)) {
    const v2OutputFile = path.join(buildDir, 'llms-2.0.txt');
    const v2FullUrl = new URL('llms-full-2.0.txt', siteBaseUrl).toString();
    generateManifest(v2DocsDir, v2OutputFile, v2FullUrl);
    console.log('v2.0 llms-2.0.txt generated successfully (pinned alias only):', v2OutputFile);
  }
}

main();
