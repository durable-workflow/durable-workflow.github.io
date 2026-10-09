const search = require('@easyops-cn/docusaurus-search-local');

module.exports = function localSearch(context, options) {
  const locale = context.i18n.currentLocale;
  const language = locale === 'zh-Hans' ? ['en', 'zh']
    : locale === 'ja' ? ['en', 'ja'] : options.language;
  return search.default(context, {
    ...options,
    language,
  });
};

module.exports.validateOptions = search.validateOptions;
