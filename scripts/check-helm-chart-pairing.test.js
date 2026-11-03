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

test('derive the Server Git tag that exists for the selected release', () => {
  const {serverGitTag} = require('./public-artifact-versions');
  assert.equal(serverGitTag('2.11.8'), '2.11.8');
  assert.equal(serverGitTag('3.0.1'), 'native-3.0.1');
  assert.equal(serverGitTag('3.0.2'), 'native-3.0.2');
  assert.equal(serverGitTag('3.0.4'), '3.0.4');
  const pins = buildArtifactPins();
  const tag = serverGitTag(source.artifacts.server);
  assert.equal(pins.serverGitTag, tag);
  assert.equal(pins.serverComposeUrl, `https://raw.githubusercontent.com/durable-workflow/server/${tag}/docker-compose.published.yml`);
  assert.equal(pins.helmChartUpgradeUrl, `https://github.com/durable-workflow/server/blob/${source.helm_chart.source_commit}/k8s/helm/durable-workflow/docs/UPGRADING.md`);
  assert.equal(pins.serverTagEnv, undefined);
});
