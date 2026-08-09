#!/usr/bin/env node

const childProcess = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const {
  ARTIFACT_DISTRIBUTION_SURFACES,
  ARTIFACT_RELEASE_POLICY,
  PUBLISHED_ARTIFACT_VERSIONS,
  PYTHON_PACKAGE_AUTHORITY,
  replaceArtifactTokens,
} = require('./public-artifact-versions');

const repoRoot = path.join(__dirname, '..');
const CURRENT_PYTHON_DOCS = Object.freeze([
  Object.freeze({source: 'docs/introduction.md', route: 'docs/2.0/introduction/index.html'}),
  Object.freeze({source: 'docs/quickstart.md', route: 'docs/2.0/quickstart/index.html'}),
  Object.freeze({source: 'docs/polyglot/python.md', route: 'docs/2.0/polyglot/python/index.html'}),
  Object.freeze({source: 'docs/sdk-neutrality.md', route: 'docs/2.0/sdk-neutrality/index.html'}),
]);
const PYPI_AUTHORITY_COMPONENT = '<PythonPackageReleaseLink>';

function fail(message) {
  throw new Error(message);
}

function normalizedPackageName(value) {
  return String(value || '').trim().toLowerCase().replace(/[_.]+/g, '-');
}

function assertPythonDistributionSurfaces(
  surfaces = ARTIFACT_DISTRIBUTION_SURFACES['sdk-python'],
  authority = PYTHON_PACKAGE_AUTHORITY,
) {
  const exact = (surfaces || []).find(surface => surface?.surface === 'pypi_exact_release');
  const canonical = (surfaces || []).find(
    surface => surface?.surface === 'pypi_canonical_project_identity',
  );

  if (!exact) {
    fail('Python artifact distribution surfaces must include pypi_exact_release');
  }
  const expectedExact = {
    package: authority.package,
    version: authority.version,
    registry_version: authority.registryVersion,
    url: authority.exactReleaseUrl,
    json_url: authority.exactReleaseJsonUrl,
  };
  for (const [field, expected] of Object.entries(expectedExact)) {
    if (exact[field] !== expected) {
      fail(`pypi_exact_release.${field} must be ${expected}; got ${exact[field] || '<missing>'}`);
    }
  }

  if (!canonical) {
    fail('Python artifact distribution surfaces must include a separately named canonical identity');
  }
  if (
    canonical.url !== authority.canonicalProjectUrl
    || canonical.authority_role !== 'project_identity_only'
  ) {
    fail('The canonical PyPI project URL must be marked project_identity_only');
  }
}

function assertSdkNeutralityPackageAuthority(contract, authority = PYTHON_PACKAGE_AUTHORITY) {
  const pythonSdk = contract?.sdk_breadth_policy?.first_party?.python_sdk;
  if (!pythonSdk) {
    fail('SDK-neutrality contract must declare the first-party Python SDK');
  }

  const expected = {
    package_url: authority.authorityUrl,
    package_version: authority.version,
    registry_version: authority.registryVersion,
    exact_release_url: authority.exactReleaseUrl,
    exact_release_json_url: authority.exactReleaseJsonUrl,
    canonical_project_url: authority.canonicalProjectUrl,
    canonical_project_url_role: 'project_identity_only',
  };
  for (const [field, value] of Object.entries(expected)) {
    if (pythonSdk[field] !== value) {
      fail(`SDK-neutrality Python ${field} must be ${value}; got ${pythonSdk[field] || '<missing>'}`);
    }
  }

  if (authority.releasePhase !== 'stable' && pythonSdk.package_url === pythonSdk.canonical_project_url) {
    fail('Prerelease SDK-neutrality metadata must not use the unversioned PyPI project page');
  }
}

function assertCurrentDocSource(sourcePath, raw, authority = PYTHON_PACKAGE_AUTHORITY) {
  if (!raw.includes(PYPI_AUTHORITY_COMPONENT)) {
    fail(`${sourcePath} must use the centralized Python package authority component`);
  }
  if (/https:\/\/pypi\.org\/project\/durable-workflow\//.test(raw)) {
    fail(`${sourcePath} must not hand-maintain a PyPI project or release URL`);
  }

  const rendered = replaceArtifactTokens(raw, sourcePath);
  if (!rendered.includes(authority.version)) {
    fail(`${sourcePath} does not identify Python SDK ${authority.version}`);
  }
}

function assertCurrentDocSources(root = repoRoot, authority = PYTHON_PACKAGE_AUTHORITY) {
  for (const page of CURRENT_PYTHON_DOCS) {
    const raw = fs.readFileSync(path.join(root, page.source), 'utf8');
    assertCurrentDocSource(page.source, raw, authority);
  }
}

function htmlHrefs(html) {
  return new Set(
    [...String(html).matchAll(/<a\b[^>]*\shref="([^"]+)"/gi)].map(match => match[1]),
  );
}

function assertRenderedCurrentDocs(root = repoRoot, authority = PYTHON_PACKAGE_AUTHORITY) {
  for (const page of CURRENT_PYTHON_DOCS) {
    const buildPath = path.join(root, 'build', page.route);
    if (!fs.existsSync(buildPath)) {
      fail(`Missing rendered Python package authority surface: build/${page.route}`);
    }
    const hrefs = htmlHrefs(fs.readFileSync(buildPath, 'utf8'));
    if (!hrefs.has(authority.authorityUrl)) {
      fail(`build/${page.route} must link to ${authority.authorityUrl}`);
    }
    if (
      authority.releasePhase !== 'stable'
      && hrefs.has(authority.canonicalProjectUrl)
    ) {
      fail(`build/${page.route} links prerelease readers to unversioned PyPI metadata`);
    }
  }
}

function assertPypiReleaseMetadata(metadata, authority = PYTHON_PACKAGE_AUTHORITY) {
  if (normalizedPackageName(metadata?.info?.name) !== authority.package) {
    fail(`PyPI release metadata must identify ${authority.package}`);
  }
  if (metadata?.info?.version !== authority.registryVersion) {
    fail(
      `PyPI release metadata version must be ${authority.registryVersion}; ` +
        `got ${metadata?.info?.version || '<missing>'}`,
    );
  }
  if (
    authority.releasePhase !== 'stable'
    && !/^2\.0\.0(?:a|b|rc)\d+$/.test(metadata.info.version)
  ) {
    fail(`PyPI release metadata must report a 2.0 prerelease; got ${metadata.info.version}`);
  }
  const installable = (metadata?.urls || []).some(file => (
    file
    && file.yanked !== true
    && typeof file.filename === 'string'
    && file.filename.length > 0
    && typeof file.url === 'string'
    && /^https:\/\//.test(file.url)
  ));
  if (!installable) {
    fail(`PyPI release ${authority.registryVersion} has no non-yanked installable distribution`);
  }
}

function assertPipReport(report, authority = PYTHON_PACKAGE_AUTHORITY) {
  const selected = (report?.install || []).find(item => (
    normalizedPackageName(item?.metadata?.name) === authority.package
  ));
  if (!selected) {
    fail(`pip did not select ${authority.package}`);
  }
  if (selected.metadata.version !== authority.registryVersion) {
    fail(
      `pip selected ${selected.metadata.version || '<missing>'}; ` +
        `expected ${authority.registryVersion}`,
    );
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {Accept: 'application/json', 'User-Agent': 'durable-workflow-docs-python-release-audit'},
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`${url} returned HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`${url} did not return JSON: ${error.message}`));
        }
      });
    });
    request.setTimeout(20000, () => request.destroy(new Error(`${url} timed out`)));
    request.on('error', reject);
  });
}

function pipPackageRequirement(authority) {
  return authority.releasePhase === 'stable'
    ? authority.package
    : `${authority.package}==${authority.registryVersion}`;
}

function pipSelectionArguments(authority, reportPath) {
  const packageRequirement = pipPackageRequirement(authority);
  const pipArguments = [
    '-m', 'pip', 'install',
    '--disable-pip-version-check',
    '--dry-run',
    '--ignore-installed',
    '--no-deps',
  ];
  if (authority.releasePhase !== 'stable') {
    pipArguments.push('--pre');
  }
  pipArguments.push('--report', reportPath, packageRequirement);
  return pipArguments;
}

function pipSelectionReport(authority = PYTHON_PACKAGE_AUTHORITY) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-python-release-'));
  const reportPath = path.join(temporaryDirectory, 'pip-report.json');
  const python = process.env.PYTHON || 'python3';
  const packageRequirement = pipPackageRequirement(authority);
  const pipArguments = pipSelectionArguments(authority, reportPath);
  const result = childProcess.spawnSync(python, pipArguments, {encoding: 'utf8'});

  try {
    if (result.status !== 0) {
      fail(
        `pip could not resolve ${packageRequirement}: ` +
          `${(result.stderr || result.stdout || '').trim()}`,
      );
    }
    return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } finally {
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  }
}

async function assertLivePythonPackageAuthority(authority = PYTHON_PACKAGE_AUTHORITY) {
  const exactMetadata = await fetchJson(authority.exactReleaseJsonUrl);
  assertPypiReleaseMetadata(exactMetadata, authority);

  if (authority.releasePhase === 'stable') {
    const canonicalMetadata = await fetchJson(
      `https://pypi.org/pypi/${authority.package}/json`,
    );
    assertPypiReleaseMetadata(canonicalMetadata, authority);
  }

  assertPipReport(pipSelectionReport(authority), authority);
}

function assertLocalPythonPackageAuthority(root = repoRoot) {
  if (PUBLISHED_ARTIFACT_VERSIONS['sdk-python'] !== PYTHON_PACKAGE_AUTHORITY.version) {
    fail('Python package URLs must derive from published-artifact-versions.json');
  }
  if (!['alpha', 'beta', 'rc', 'stable'].includes(ARTIFACT_RELEASE_POLICY.release_phase)) {
    fail('Python package authority requires a recognized release phase');
  }
  assertPythonDistributionSurfaces();
  assertSdkNeutralityPackageAuthority(JSON.parse(fs.readFileSync(
    path.join(root, 'static', 'sdk-neutrality-contract.json'),
    'utf8',
  )));
  assertCurrentDocSources(root);
}

async function main(argv = process.argv.slice(2)) {
  const unknown = argv.filter(arg => !['--live', '--rendered'].includes(arg));
  if (unknown.length > 0) {
    fail(`Unknown arguments: ${unknown.join(', ')}`);
  }

  assertLocalPythonPackageAuthority();
  if (argv.includes('--rendered')) {
    assertRenderedCurrentDocs();
  }
  if (argv.includes('--live')) {
    await assertLivePythonPackageAuthority();
  }

  console.log(
    `Python package authority passed for ${PYTHON_PACKAGE_AUTHORITY.version} ` +
      `(${PYTHON_PACKAGE_AUTHORITY.authorityUrl}).`,
  );
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  CURRENT_PYTHON_DOCS,
  assertCurrentDocSource,
  assertCurrentDocSources,
  assertLivePythonPackageAuthority,
  assertPipReport,
  assertPypiReleaseMetadata,
  assertPythonDistributionSurfaces,
  assertRenderedCurrentDocs,
  assertSdkNeutralityPackageAuthority,
  pipPackageRequirement,
  pipSelectionArguments,
};
