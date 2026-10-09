const search = require('@easyops-cn/docusaurus-search-local');

module.exports = function localSearch(context, options) {
  return search.default(context, {
    ...options,
    language: context.i18n.currentLocale === 'zh-Hans' ? ['en', 'zh'] : options.language,
  });
};

module.exports.validateOptions = search.validateOptions;
