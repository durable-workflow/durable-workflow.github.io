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
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, 'm');
  const match = frontmatter.match(pattern);

  if (!match) {
    return null;
  }

  return match[1].trim().replace(/^['"]|['"]$/g, '');
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

function main() {
  const docsDir = path.join(__dirname, '..', 'docs');
  const buildDir = path.join(__dirname, '..', 'build');
  const outputFile = path.join(buildDir, 'llms.txt');
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
        url: new URL('llms-full.txt', siteBaseUrl).toString(),
        note: 'Single-file bundle of the complete documentation set.',
      },
    ],
  };
  const renderedSections = [...sections, optionalSection].map(renderSection).join('\n\n');

  ensureDir(buildDir);

  const content = [
    `# ${siteTitle}`,
    '',
    `> ${siteTagline}`,
    '',
    'This file is a curated markdown index for LLMs. Use the sections below for targeted source documents, or use the optional full bundle when you want the entire documentation set in one file.',
    '',
    renderedSections,
    '',
  ].join('\n');

  fs.writeFileSync(outputFile, content, 'utf8');

  console.log('llms.txt generated successfully:', outputFile);
}

main();
