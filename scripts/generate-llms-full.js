const fs = require('fs');
const path = require('path');

const DOC_EXTS = new Set(['.md', '.mdx']);

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
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''); // strip BOM
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

function getVersionConfig() {
  const configPath = path.join(__dirname, '..', 'docusaurus.config.js');
  const configContent = fs.readFileSync(configPath, 'utf8');

  const lastVersionMatch = configContent.match(/lastVersion:\s*['"]([^'"]+)['"]/);
  const lastVersion = lastVersionMatch ? lastVersionMatch[1] : 'current';

  // Extract version paths from config
  const versions = {};
  const versionBlockMatch = configContent.match(/versions:\s*\{([^}]+)\}/s);
  if (versionBlockMatch) {
    const versionBlock = versionBlockMatch[1];
    const currentPathMatch = versionBlock.match(/current:\s*\{[^}]*path:\s*['"]([^'"]*)['"]/);
    const v1xPathMatch = versionBlock.match(/['"]1\.x['"]:\s*\{[^}]*path:\s*['"]([^'"]*)['"]/);

    versions.current = currentPathMatch ? currentPathMatch[1] : '';
    versions['1.x'] = v1xPathMatch ? v1xPathMatch[1] : '';
  }

  return { lastVersion, versions };
}

function main() {
  const buildDir = path.join(__dirname, '..', 'build');
  ensureDir(buildDir);

  const { lastVersion, versions } = getVersionConfig();

  // Generate manifest for v1.x (versioned docs)
  const v1DocsDir = path.join(__dirname, '..', 'versioned_docs', 'version-1.x');
  let v1Content = null;
  if (fs.existsSync(v1DocsDir)) {
    v1Content = collectContent(v1DocsDir).trimStart() + '\n';
    console.log('Generated v1.x manifest');
  }

  // Generate manifest for v2.0 (current docs)
  const v2DocsDir = path.join(__dirname, '..', 'docs');
  let v2Content = null;
  if (fs.existsSync(v2DocsDir)) {
    v2Content = collectContent(v2DocsDir).trimStart() + '\n';
    console.log('Generated v2.0 manifest');
  }

  // Write manifests to version-specific paths
  if (v1Content && versions['1.x']) {
    const v1Path = versions['1.x'] ? path.join(buildDir, versions['1.x']) : buildDir;
    ensureDir(v1Path);
    fs.writeFileSync(path.join(v1Path, 'llms-full.txt'), v1Content, 'utf8');
    console.log(`v1.x manifest -> /${versions['1.x']}/llms-full.txt`);
  }

  if (v2Content && versions.current) {
    const v2Path = versions.current ? path.join(buildDir, versions.current) : buildDir;
    ensureDir(v2Path);
    fs.writeFileSync(path.join(v2Path, 'llms-full.txt'), v2Content, 'utf8');
    console.log(`v2.0 manifest -> /${versions.current}/llms-full.txt`);

    // Also write v2.0 version-specific manifest at root
    fs.writeFileSync(path.join(buildDir, 'llms-full-2.0.txt'), v2Content, 'utf8');
    console.log(`v2.0 version-specific manifest -> /llms-full-2.0.txt`);
  }

  // Write canonical manifest at root (based on lastVersion)
  const canonicalContent = lastVersion === '1.x' ? v1Content : v2Content;
  if (canonicalContent) {
    fs.writeFileSync(path.join(buildDir, 'llms-full.txt'), canonicalContent, 'utf8');
    console.log(`Canonical /llms-full.txt -> ${lastVersion} content`);
  }
}

main();
