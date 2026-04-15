const fs = require('fs');
const path = require('path');

const DOC_EXTS = new Set(['.md', '.mdx']);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isDocFile(p) {
  return DOC_EXTS.has(path.extname(p));
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
      combined += cleaned.trimEnd() + '\n';
    }
  }

  return combined;
}

function getLastVersion() {
  const configPath = path.join(__dirname, '..', 'docusaurus.config.js');
  const configContent = fs.readFileSync(configPath, 'utf8');
  const match = configContent.match(/lastVersion:\s*['"]([^'"]+)['"]/);
  return match ? match[1] : 'current';
}

function main() {
  const buildDir = path.join(__dirname, '..', 'build');
  ensureDir(buildDir);

  const lastVersion = getLastVersion();

  // Generate manifest for v1.x (versioned docs)
  const v1DocsDir = path.join(__dirname, '..', 'versioned_docs', 'version-1.x');
  if (fs.existsSync(v1DocsDir)) {
    const v1Content = collectContent(v1DocsDir).trimStart() + '\n';
    const v1OutputFile = path.join(buildDir, 'llms-full-1.x.txt');
    fs.writeFileSync(v1OutputFile, v1Content, 'utf8');
    console.log('llms-full-1.x.txt generated successfully:', v1OutputFile);
  }

  // Generate manifest for v2.0 (current docs)
  const v2DocsDir = path.join(__dirname, '..', 'docs');
  if (fs.existsSync(v2DocsDir)) {
    const v2Content = collectContent(v2DocsDir).trimStart() + '\n';
    const v2OutputFile = path.join(buildDir, 'llms-full-2.0.txt');
    fs.writeFileSync(v2OutputFile, v2Content, 'utf8');
    console.log('llms-full-2.0.txt generated successfully:', v2OutputFile);
  }

  // Copy the last version's manifest to llms-full.txt (canonical)
  const canonicalSource = lastVersion === '1.x'
    ? path.join(buildDir, 'llms-full-1.x.txt')
    : path.join(buildDir, 'llms-full-2.0.txt');

  const canonicalOutput = path.join(buildDir, 'llms-full.txt');
  if (fs.existsSync(canonicalSource)) {
    fs.copyFileSync(canonicalSource, canonicalOutput);
    console.log(`llms-full.txt (canonical) copied from ${lastVersion} manifest`);
  }
}

main();
