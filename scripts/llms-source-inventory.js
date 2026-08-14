const path = require('path');

const DOC_EXTENSIONS = new Set(['.md', '.mdx']);
const EXCLUDED_DOC_BASENAMES = new Set(['sponsors.md', 'support.md']);
const CATEGORY_METADATA_BASENAME = '_category_.json';

function isLlmDocFile(filePath) {
  return DOC_EXTENSIONS.has(path.extname(filePath));
}

function shouldExcludeFromLlm(filePath) {
  return EXCLUDED_DOC_BASENAMES.has(path.basename(filePath));
}

function llmSourceHistoryPathspecs(sourceRoot) {
  const normalizedRoot = sourceRoot.replace(/\\/g, '/').replace(/\/+$/, '');

  return [
    `:(glob)${normalizedRoot}/**/*.md`,
    `:(glob)${normalizedRoot}/**/*.mdx`,
    `:(glob)${normalizedRoot}/**/${CATEGORY_METADATA_BASENAME}`,
    ...[...EXCLUDED_DOC_BASENAMES]
      .sort()
      .map(basename => `:(exclude,glob)${normalizedRoot}/**/${basename}`),
  ];
}

module.exports = {
  isLlmDocFile,
  llmSourceHistoryPathspecs,
  shouldExcludeFromLlm,
};
