const path = require('path');

const PUBLIC_REPOSITORY_URL =
  'https://github.com/durable-workflow/durable-workflow.github.io';

const REPO_LOCAL_REFERENCE_PATTERN = new RegExp([
  String.raw`^\.{1,2}[\\/]`,
  String.raw`^[A-Za-z]:[\\/]`,
  String.raw`^(?:\.github|blog|build|docs|generated|scripts|src|static)[\\/]`,
  String.raw`^(?:[^:\\/]+[\\/])+[^\\/]+\.(?:cjs|js|json|jsx|md|mdx|mjs|ps1|sh|ts|tsx|ya?ml)(?:$|[?#])`,
  String.raw`^[^\\/]+\.(?:cjs|js|json|jsx|md|mdx|mjs|ps1|sh|ts|tsx|ya?ml)(?:$|[?#])`,
].join('|'), 'i');

function isPublicRoute(value) {
  return /^\/(?!\/)/.test(value) && !value.includes('\\');
}

function isPublicUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch (err) {
    return false;
  }
}

function assertPublicReference(value, label) {
  if (typeof value !== 'string' || (!isPublicRoute(value) && !isPublicUrl(value))) {
    throw new Error(`${label} must be a root-relative public route or HTTPS URL`);
  }
}

function assertNoRepoLocalReferences(value, label) {
  if (typeof value === 'string') {
    if (
      !isPublicRoute(value) &&
      !isPublicUrl(value) &&
      REPO_LOCAL_REFERENCE_PATTERN.test(value)
    ) {
      throw new Error(`${label} exposes repo-local path ${JSON.stringify(value)}`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRepoLocalReferences(item, `${label}[${index}]`));
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      assertNoRepoLocalReferences(nested, `${label}.${key}`);
    }
  }
}

function repositorySourceUrl(repoRelativePath, revision) {
  if (
    typeof repoRelativePath !== 'string' ||
    repoRelativePath === '' ||
    path.posix.isAbsolute(repoRelativePath) ||
    repoRelativePath.split('/').includes('..') ||
    repoRelativePath.includes('\\')
  ) {
    throw new Error(`Repository source path must be a normalized relative path: ${repoRelativePath}`);
  }
  if (typeof revision !== 'string' || !/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error(`Repository source revision must be a 40-character Git SHA: ${revision}`);
  }

  return `${PUBLIC_REPOSITORY_URL}/blob/${revision}/${repoRelativePath}`;
}

module.exports = {
  PUBLIC_REPOSITORY_URL,
  assertNoRepoLocalReferences,
  assertPublicReference,
  isPublicRoute,
  isPublicUrl,
  repositorySourceUrl,
};
