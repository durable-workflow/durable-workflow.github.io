const assert = require('node:assert/strict');
const source = require('../static/stable-releases.json');
const {readStableReleases, buildArtifactPins, replaceArtifactTokens} = require('./public-artifact-versions');

const versions = readStableReleases(source);
assert.equal(versions.server, source.helm_chart.app_version);
const mismatch = structuredClone(source);
mismatch.artifacts.server = '999.0.0';
assert.throws(() => readStableReleases(mismatch), /Helm app_version must match/);
assert.throws(() => buildArtifactPins({...versions, server: '999.0.0'}), /paired with the selected Server/);

const unqualified = structuredClone(source);
delete unqualified.helm_chart.package_digest;
assert.throws(() => readStableReleases(unqualified), /package_digest must be a SHA256 digest/);
delete unqualified.helm_chart;
assert.throws(() => readStableReleases(unqualified), /Helm app_version must match/);

const rendered = replaceArtifactTokens('| Helm | %%artifact.helmChartVersion%% | %%artifact.helmChartInstallIdentity%% | Server %%artifact.helmChartAppVersion%% |');
assert.equal(rendered, `| Helm | ${versions['helm-chart']} | ${source.helm_chart.repository} --version ${versions['helm-chart']} | Server ${versions.server} |`);
console.log('Helm metadata rejects mismatched/unqualified pairs; generated chart identity agrees with the selected Server.');
