const assert = require('node:assert/strict');
const test = require('node:test');
const source = require('../static/stable-releases.json');
const {readStableReleases, buildArtifactPins, replaceArtifactTokens, artifactVersionRemarkPlugin} = require('./public-artifact-versions');

test('reject a Server selected without its matching Helm appVersion', () => {
  const versions = readStableReleases(source);
  assert.equal(versions.server, source.helm_chart.app_version);
  const mismatch = structuredClone(source);
  mismatch.artifacts.server = '999.0.0';
  assert.throws(() => readStableReleases(mismatch), /Helm app_version must match/);
  assert.throws(() => buildArtifactPins({...versions, server: '999.0.0'}), /paired with the selected Server/);
});

test('reject missing published Helm qualification metadata', () => {
  const unqualified = structuredClone(source);
  delete unqualified.helm_chart.package_digest;
  assert.throws(() => readStableReleases(unqualified), /package_digest must be a SHA256 digest/);
  delete unqualified.helm_chart;
  assert.throws(() => readStableReleases(unqualified), /Helm app_version must match/);
});

test('render the paired chart identity and resolve URLs before MDX URI decoding', () => {
  const versions = readStableReleases(source);
  const rendered = replaceArtifactTokens('| Helm | %%artifact.helmChartVersion%% | %%artifact.helmChartInstallIdentity%% | Server %%artifact.helmChartAppVersion%% |');
  assert.equal(rendered, `| Helm | ${versions['helm-chart']} | ${source.helm_chart.repository} --version ${versions['helm-chart']} | Server ${versions.server} |`);
  const link = {type: 'link', url: '%%artifact.helmChartSourceUrl%%', children: []};
  assert.throws(() => decodeURIComponent(link.url), URIError);
  artifactVersionRemarkPlugin()({type: 'root', children: [link]});
  assert.doesNotThrow(() => decodeURIComponent(link.url));
  assert.equal(link.url, buildArtifactPins().helmChartSourceUrl);
});
