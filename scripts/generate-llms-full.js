const fs = require('fs');
const path = require('path');
const { replaceArtifactTokens } = require('./public-artifact-versions');
const {
  expandPlatformProtocolCatalog,
} = require('./render-platform-protocol-catalog');

const DOC_EXTS = new Set(['.md', '.mdx']);
const V2_PRERELEASE_NOTICE =
  'Durable Workflow 2.0 is prerelease guidance and is not the default public docs line. Use the canonical stable 1.x bundle unless you are intentionally evaluating 2.0.';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isDocFile(p) {
  return DOC_EXTS.has(path.extname(p));
}

function getRepoRelativePath(filePath) {
  return path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');
}

function shouldExclude(filePath) {
  const basename = path.basename(filePath);
  return ['sponsors.md', 'support.md'].includes(basename);
}

function extractFrontmatterAndContent(filePath) {
  const raw = expandPlatformProtocolCatalog(replaceArtifactTokens(
    fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''),
    getRepoRelativePath(filePath),
  )); // strip BOM and render generated public contract data
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: '', content: raw };
  return { frontmatter: match[1], content: match[2] };
}

function getSidebarPosition(frontmatter) {
  const m = frontmatter.match(/sidebar_position:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity;
}

function getCategoryPosition(dirPath) {
  const categoryFile = path.join(dirPath, '_category_.json');
  if (!fs.existsSync(categoryFile)) return Infinity;
  try {
    const category = JSON.parse(fs.readFileSync(categoryFile, 'utf8'));
    return Number.isFinite(category.position) ? category.position : Infinity;
  } catch {
    return Infinity;
  }
}

function getPositionForItem(itemPath) {
  const stat = fs.statSync(itemPath);
  if (stat.isDirectory()) return getCategoryPosition(itemPath);
  if (isDocFile(itemPath)) {
    const { frontmatter } = extractFrontmatterAndContent(itemPath);
    return getSidebarPosition(frontmatter);
  }
  return Infinity;
}

function stripHtmlTags(value) {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function cleanContent(content) {
  let lines = content.split('\n');
  let cleaned = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    
    // Skip MDX import lines
    if (/^\s*import\s+.*\s+from\s+['"]/.test(line)) {
      i++;
      continue;
    }
    
    // Skip markdown image-only lines
    if (/^\s*!\[.*?\]\(.*?\)\s*$/.test(line)) {
      i++;
      continue;
    }
    
    // Skip Mermaid Ink/Live blob lines
    if (/mermaid\.(ink|live)/.test(line)) {
      i++;
      continue;
    }

    if (/^\s*<details\b[^>]*>\s*$/.test(line) || /^\s*<\/details>\s*$/.test(line)) {
      i++;
      continue;
    }

    const summaryMatch = line.match(/^\s*<summary[^>]*>([\s\S]*?)<\/summary>\s*$/);
    if (summaryMatch) {
      const summaryText = stripHtmlTags(summaryMatch[1]);

      if (summaryText) {
        cleaned.push(`## ${summaryText}`);
      }

      i++;
      continue;
    }
    
    // Check for MDX component renders (starts with <CapitalLetter)
    const componentMatch = line.match(/^\s*<([A-Z][a-zA-Z0-9]*)/);
    if (componentMatch) {
      const tagName = componentMatch[1];
      
      // Check if it's a self-closing tag that ends on the same line
      if (/\/>\s*$/.test(line)) {
        i++;
        continue;
      }
      
      // Check if there's a closing tag on the same line
      const closingTag = `</${tagName}>`;
      if (line.includes(closingTag)) {
        i++;
        continue;
      }
      
      // It's a multiline component, skip until we find the closing
      i++;
      while (i < lines.length) {
        if (lines[i].includes('/>') || lines[i].includes(closingTag)) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    
    cleaned.push(line);
    i++;
  }
  
  // Collapse multiple consecutive blank lines into single blank lines
  let result = [];
  let prevWasBlank = false;
  
  for (const line of cleaned) {
    const isBlank = line.trim() === '';
    
    if (isBlank) {
      if (!prevWasBlank) {
        result.push(line);
        prevWasBlank = true;
      }
    } else {
      result.push(line);
      prevWasBlank = false;
    }
  }
  
  return result.join('\n');
}

function collectContent(rootDir, dirPath = rootDir) {
  const items = fs.readdirSync(dirPath).map(name => path.join(dirPath, name));

  const validItems = items.filter(p => {
    const stat = fs.statSync(p);
    return (stat.isDirectory() || isDocFile(p)) && !shouldExclude(p);
  });

  validItems.sort((a, b) => {
    const pa = getPositionForItem(a);
    const pb = getPositionForItem(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });

  let combined = '';

  for (const item of validItems) {
    const stat = fs.statSync(item);

    if (stat.isDirectory()) {
      combined += collectContent(rootDir, item);
      continue;
    }

    if (isDocFile(item)) {
      const { content } = extractFrontmatterAndContent(item);
      const cleaned = cleanContent(content);
      combined += `<!-- Source: ${getRepoRelativePath(item)} -->\n`;
      combined += cleaned.trimEnd() + '\n\n';
    }
  }

  return combined;
}

function getVersionPaths() {
  const configPath = path.join(__dirname, '..', 'docusaurus.config.js');
  const configContent = fs.readFileSync(configPath, 'utf8');

  const versions = {};
  const lastVersionMatch = configContent.match(/lastVersion:\s*['"]([^'"]*)['"]/);
  versions.lastVersion = lastVersionMatch ? lastVersionMatch[1] : null;

  const versionBlockMatch = configContent.match(/versions:\s*\{([^}]+)\}/s);
  if (versionBlockMatch) {
    const versionBlock = versionBlockMatch[1];
    const currentPathMatch = versionBlock.match(/current:\s*\{[^}]*path:\s*['"]([^'"]*)['"]/);
    const currentBannerMatch = versionBlock.match(/current:\s*\{[^}]*banner:\s*['"]([^'"]*)['"]/);
    const v1xPathMatch = versionBlock.match(/['"]1\.x['"]:\s*\{[^}]*path:\s*['"]([^'"]*)['"]/);

    versions.current = currentPathMatch ? currentPathMatch[1] : '';
    versions.currentBanner = currentBannerMatch ? currentBannerMatch[1] : null;
    versions['1.x'] = v1xPathMatch ? v1xPathMatch[1] : '';
  }

  return versions;
}

function withVersionNotice(content, notice) {
  if (!notice) {
    return content;
  }

  return [
    '# Durable Workflow 2.0 Prerelease Documentation',
    '',
    notice,
    '',
    content.trimStart(),
  ].join('\n');
}

function main() {
  const buildDir = path.join(__dirname, '..', 'build');
  ensureDir(buildDir);

  const versions = getVersionPaths();
  const lastVersion = versions.lastVersion;
  const v2Notice = versions.currentBanner === 'unreleased'
    ? V2_PRERELEASE_NOTICE
    : null;

  // Generate manifest for v2.0 (current docs)
  const v2DocsDir = path.join(__dirname, '..', 'docs');
  let v2Content = null;
  if (fs.existsSync(v2DocsDir)) {
    v2Content = collectContent(v2DocsDir).trimStart() + '\n';
    console.log('Generated v2.0 manifest');
  }

  // Generate manifest for v1.x (versioned docs)
  const v1DocsDir = path.join(__dirname, '..', 'versioned_docs', 'version-1.x');
  let v1Content = null;
  if (fs.existsSync(v1DocsDir)) {
    v1Content = collectContent(v1DocsDir).trimStart() + '\n';
    console.log('Generated v1.x manifest');
  }

  // Canonical /llms-full.txt tracks the site's lastVersion cutover gate in
  // docusaurus.config.js. Advancing lastVersion to 'current' in the config
  // automatically promotes v2 to canonical without any change to this script.
  const isV2Canonical = lastVersion === 'current' || !lastVersion;
  const canonicalContent = isV2Canonical ? v2Content : v1Content;
  if (canonicalContent) {
    fs.writeFileSync(path.join(buildDir, 'llms-full.txt'), canonicalContent, 'utf8');
    console.log(`Canonical /llms-full.txt -> ${lastVersion || 'current'} content (matches lastVersion)`);

    if (lastVersion && lastVersion !== 'current') {
      fs.writeFileSync(path.join(buildDir, `llms-full-${lastVersion}.txt`), canonicalContent, 'utf8');
      console.log(`${lastVersion} version-specific manifest -> /llms-full-${lastVersion}.txt`);
    }
  }

  // v1.x remains a version-pinned legacy alias after canonical moves to v2.
  if (v1Content) {
    fs.writeFileSync(path.join(buildDir, 'llms-full-1.x.txt'), v1Content, 'utf8');
    const pinLabel = isV2Canonical ? '(pinned alias only)' : '(matches canonical)';
    console.log(`v1.x version-specific manifest -> /llms-full-1.x.txt ${pinLabel}`);
  }

  // Always emit the v2.0 pinned alias so version-explicit consumers can reach
  // it regardless of what canonical serves.
  if (v2Content) {
    const v2PublishedContent = withVersionNotice(v2Content, v2Notice);
    fs.writeFileSync(path.join(buildDir, 'llms-full-2.0.txt'), v2PublishedContent, 'utf8');
    const pinLabel = isV2Canonical ? '(matches canonical)' : '(pinned alias only)';
    console.log(`v2.0 version-specific manifest -> /llms-full-2.0.txt ${pinLabel}`);

    if (versions.current) {
      const v2Path = path.join(buildDir, versions.current);
      ensureDir(v2Path);
      fs.writeFileSync(path.join(v2Path, 'llms-full.txt'), v2PublishedContent, 'utf8');
      console.log(`v2.0 manifest -> /${versions.current}/llms-full.txt`);
    }
  }
}

main();
