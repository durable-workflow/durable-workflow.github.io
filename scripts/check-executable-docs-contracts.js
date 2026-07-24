#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const config = require('../docusaurus.config.js');

const root = path.join(__dirname, '..');
const build = path.join(root, 'build');

function fail(message) {
  throw new Error(message);
}

function requireFile(relativePath) {
  const absolutePath = path.join(build, relativePath);
  if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).size === 0) {
    fail(`Missing generated documentation surface: build/${relativePath}`);
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function docsOptions() {
  const preset = (config.presets || [])
    .find(entry => Array.isArray(entry) && entry[0] === 'classic');
  if (!preset?.[1]?.docs) {
    fail('Docusaurus classic docs configuration is missing');
  }
  return preset[1].docs;
}

function assertVersionRouting() {
  const docs = docsOptions();
  const versions = docs.versions || {};

  if (docs.lastVersion !== '1.x' || versions['1.x']?.path !== '') {
    fail('Stable 1.x documentation must remain on the unversioned route');
  }
  if (versions.current?.path !== '2.0' || versions.current?.banner !== 'unreleased') {
    fail('Current documentation must remain on the explicit 2.0 prerelease route');
  }
  if (
    config.onBrokenAnchors !== 'throw'
    || config.onBrokenLinks !== 'throw'
    || config.markdown?.hooks?.onBrokenMarkdownLinks !== 'throw'
  ) {
    fail('Documentation builds must fail on broken links and anchors');
  }

  const stable = requireFile('docs/introduction/index.html');
  const prerelease = requireFile('docs/2.0/introduction/index.html');
  if (!stable.includes('name="docusaurus_version" content="1.x"')) {
    fail('Stable introduction has an invalid generated version route');
  }
  if (!prerelease.includes('name="docusaurus_version" content="current"')) {
    fail('Prerelease introduction has an invalid generated version route');
  }
}

function assertGeneratedSurfaces() {
  for (const relativePath of [
    'index.html',
    'docs/index.html',
    'docs/2.0/index.html',
    'sitemap.xml',
    'llms.txt',
    'llms-full.txt',
    'llms-1.x.txt',
    'llms-full-1.x.txt',
    'llms-2.0.txt',
    'llms-full-2.0.txt',
    '2.0/llms-full.txt',
  ]) {
    requireFile(relativePath);
  }
}

assertVersionRouting();
assertGeneratedSurfaces();
console.log('Executable documentation contracts passed');
