const assert = require('node:assert/strict');
const {validateThemeConfig} = require('@docusaurus/theme-search-algolia');
const {themeConfig} = require('../docusaurus.config');

// Exercise Docusaurus's normalization, which treats string matchers as literals.
const value = validateThemeConfig({
  themeConfig: {algolia: themeConfig.algolia},
  validate(schema, input) {
    const result = schema.validate(input);
    assert.ifError(result.error);
    return result.value;
  },
});
const replacement = value.algolia.replaceSearchResultPathname;
assert.ok(replacement, 'Search must resolve the former 2.0 route prefix');

for (const [input, expected] of [
  ['/docs/2.0/monitoring/', '/docs/monitoring/'],
  ['/docs/2.0/waterline-operator-api/#operator-actions', '/docs/waterline-operator-api/#operator-actions'],
  ['/docs/2.0/features/cancel-and-terminate/?q=test#waterline', '/docs/features/cancel-and-terminate/?q=test#waterline'],
  ['/docs/1.x/monitoring/', '/docs/1.x/monitoring/'],
  ['/docs/monitoring/', '/docs/monitoring/'],
  ['/docs/2x0/monitoring/', '/docs/2x0/monitoring/'],
  ['/search/?q=/docs/2.0/monitoring/', '/search/?q=/docs/2.0/monitoring/'],
]) {
  assert.equal(input.replaceAll(new RegExp(replacement.from, 'g'), replacement.to), expected);
}

console.log('Search navigation preserves canonical, archived, query and anchor routes.');
