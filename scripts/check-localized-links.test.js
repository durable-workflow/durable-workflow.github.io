const assert = require('node:assert/strict');
const {resolveMarkdownLinkPathname} = require('@docusaurus/utils');

const siteDir = '/site';
const localizedRoot = '/site/i18n/es/docusaurus-plugin-content-docs/current';
const context = {
  siteDir,
  contentPaths: {contentPath: '/site/docs', contentPathLocalized: localizedRoot},
  sourceToPermalink: new Map([
    ['@site/docs/defining-workflows/workflow-api.md', '/es/docs/defining-workflows/workflow-api/'],
    ['@site/i18n/es/docusaurus-plugin-content-docs/current/defining-workflows/workflows.md', '/es/docs/defining-workflows/workflows/'],
    ['@site/docs/features/versioning.md', '/es/docs/features/versioning/'],
    ['@site/docs/custom.md', '/es/docs/a-custom-slug/'],
  ]),
};

function resolve(sourceFilePath, linkPathname, overrides = {}) {
  return resolveMarkdownLinkPathname(linkPathname, {...context, ...overrides, sourceFilePath});
}

assert.equal(resolve(`${localizedRoot}/defining-workflows/workflows.md`, './workflow-api.md'),
  '/es/docs/defining-workflows/workflow-api/');
assert.equal(resolve('/site/docs/defining-workflows/workflow-api.md', './workflows.md'),
  '/es/docs/defining-workflows/workflows/');
assert.equal(resolve(`${localizedRoot}/constraints/workflow-constraints.md`, '../features/versioning.md'),
  '/es/docs/features/versioning/');
assert.equal(resolve(`${localizedRoot}/introduction.md`, './custom.md'), '/es/docs/a-custom-slug/');
assert.equal(resolve(`${localizedRoot}/introduction.md`, './missing.md'), null);
assert.equal(resolve('/site/docs/introduction.md', './custom.md', {
  contentPaths: {contentPath: '/site/docs', contentPathLocalized: undefined},
  sourceToPermalink: new Map([['@site/docs/custom.md', '/docs/a-custom-slug/']]),
}), '/docs/a-custom-slug/');
assert.equal(resolve('/site/versioned_docs/version-1.x/introduction.md', './custom.md', {
  contentPaths: {contentPath: '/site/versioned_docs/version-1.x', contentPathLocalized: undefined},
  sourceToPermalink: new Map([['@site/versioned_docs/version-1.x/custom.md', '/es/docs/1.x/custom/']]),
}), '/es/docs/1.x/custom/');

console.log('PASS seven relative-link cases, including both fallback directions, custom slugs, missing targets and version isolation.');
