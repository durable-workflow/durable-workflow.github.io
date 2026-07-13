#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const config = require('../docusaurus.config.js');

const repoRoot = path.join(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const DOC_EXTENSIONS = new Set(['.md', '.mdx']);
const EXCLUDED_FILES = new Set(['sponsors.md', 'support.md']);

function readBuildFile(name) {
  const filePath = path.join(buildDir, name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing generated LLM artifact: build/${name}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function collectSourceFiles(directory) {
  const files = [];

  function visit(current) {
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (
        entry.isFile() &&
        DOC_EXTENSIONS.has(path.extname(entry.name)) &&
        !EXCLUDED_FILES.has(entry.name)
      ) {
        files.push(path.relative(repoRoot, absolutePath).split(path.sep).join('/'));
      }
    }
  }

  visit(directory);
  return files.sort();
}

function sourceMarkers(content) {
  return [...content.matchAll(/^<!-- Source: ([^ ]+\.mdx?) -->$/gm)]
    .map(match => match[1])
    .sort();
}

function assertSameList(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} source inventory does not match its docs directory`);
  }
}

function assertIndexCoversSources(index, expectedSources, label) {
  for (const source of expectedSources) {
    if (!index.includes(source)) {
      throw new Error(`${label} is missing source link ${source}`);
    }
  }
}

function assertNoUnresolvedArtifactTokens(content, label) {
  if (/%%artifact\.[A-Za-z0-9_-]+%%/.test(content)) {
    throw new Error(`${label} contains unresolved public artifact tokens`);
  }
}

function docsConfig() {
  const preset = Array.isArray(config.presets)
    ? config.presets.find(entry => Array.isArray(entry) && entry[0] === 'classic')
    : null;
  return preset?.[1]?.docs || {};
}

function main() {
  const v2Index = readBuildFile('llms-2.0.txt');
  const v2Full = readBuildFile('llms-full-2.0.txt');
  const v2PathAlias = readBuildFile('2.0/llms-full.txt');
  const canonicalIndex = readBuildFile('llms.txt');
  const canonicalFull = readBuildFile('llms-full.txt');
  const v1Index = readBuildFile('llms-1.x.txt');
  const v1Full = readBuildFile('llms-full-1.x.txt');
  const v2Sources = collectSourceFiles(path.join(repoRoot, 'docs'));
  const v1Sources = collectSourceFiles(path.join(repoRoot, 'versioned_docs', 'version-1.x'));
  const lastVersion = docsConfig().lastVersion;

  assertSameList(sourceMarkers(v2Full), v2Sources, 'llms-full-2.0.txt');
  assertSameList(sourceMarkers(v1Full), v1Sources, 'llms-full-1.x.txt');
  assertIndexCoversSources(v2Index, v2Sources, 'llms-2.0.txt');
  assertIndexCoversSources(v1Index, v1Sources, 'llms-1.x.txt');

  if (lastVersion === 'current' || !lastVersion) {
    assertSameList(sourceMarkers(canonicalFull), v2Sources, 'llms-full.txt');
    assertIndexCoversSources(canonicalIndex, v2Sources, 'llms.txt');
  } else {
    const canonicalSources = collectSourceFiles(
      path.join(repoRoot, 'versioned_docs', `version-${lastVersion}`),
    );
    assertSameList(sourceMarkers(canonicalFull), canonicalSources, 'llms-full.txt');
    assertIndexCoversSources(canonicalIndex, canonicalSources, 'llms.txt');
  }

  if (lastVersion === '1.x' && canonicalFull !== v1Full) {
    throw new Error('Canonical full LLM bundle must be byte-equivalent to the stable 1.x bundle');
  }
  if (v2PathAlias !== v2Full) {
    throw new Error('Version-path LLM bundle must be byte-equivalent to llms-full-2.0.txt');
  }

  for (const [label, content] of Object.entries({
    'llms.txt': canonicalIndex,
    'llms-full.txt': canonicalFull,
    'llms-1.x.txt': v1Index,
    'llms-full-1.x.txt': v1Full,
    'llms-2.0.txt': v2Index,
    'llms-full-2.0.txt': v2Full,
  })) {
    assertNoUnresolvedArtifactTokens(content, label);
  }

  if (!canonicalIndex.includes('/llms-full.txt')) {
    throw new Error('Canonical LLM index must link to the canonical full bundle');
  }
  if (!v1Index.includes('/llms-full-1.x.txt')) {
    throw new Error('Stable versioned LLM index must link to its full bundle');
  }
  if (!v2Index.includes('/llms-full-2.0.txt')) {
    throw new Error('2.0 versioned LLM index must link to its full bundle');
  }

  console.log(
    `LLM route inventories match ${v1Sources.length} stable and ${v2Sources.length} prerelease docs`,
  );
}

main();
