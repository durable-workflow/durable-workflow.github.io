const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const {
  DIAGRAMS,
  assertSourceContract,
  validateScenarioObservation,
} = require('./check-job-chaining-diagrams');

function validObservation() {
  return {
    theme: 'dark',
    viewport: 'mobile',
    failed_image_requests: [],
    failed_image_responses: [],
    browser_errors: [],
    diagrams: Object.entries(DIAGRAMS).map(([id, assets]) => ({
      id,
      image_count: 2,
      visible_image_count: 1,
      all_sources: Object.values(assets),
      selected_source: assets.dark,
      same_origin: true,
      complete: true,
      natural_width: 1040,
      natural_height: 260,
      rendered_width: 350,
      rendered_height: 90,
      alt_present: true,
    })),
  };
}

function workflowSteps(file, job) {
  const workflow = yaml.load(fs.readFileSync(path.resolve(file), 'utf8'));
  return workflow.jobs[job].steps;
}

function assertWorkflowCoverage() {
  const qualification = workflowSteps('.github/workflows/qualification.yml', 'executable-contracts');
  assert.ok(
    qualification.some(step => step.run ===
      'npm run check:job-chaining-diagrams -- --output job-chaining-diagram-browser-evidence'),
    'qualification must render the diagrams in a production Chromium build',
  );

  const deploy = workflowSteps('.github/workflows/deploy.yml', 'deploy');
  const deployIndex = deploy.findIndex(step => step.name === 'Deploy to GitHub Pages');
  const liveCheckIndex = deploy.findIndex(step => step.run ===
    'npm run check:job-chaining-diagrams -- --live --wait-for-candidate ' +
      '--output live-job-chaining-diagram-browser-evidence');
  assert.ok(
    deployIndex >= 0 && liveCheckIndex > deployIndex,
    'deployment must verify the live candidate diagrams after publishing',
  );
}

assertSourceContract();
assertWorkflowCoverage();
assert.doesNotThrow(() => validateScenarioObservation(validObservation()));

const missingDiagram = validObservation();
missingDiagram.diagrams.pop();
assert.throws(
  () => validateScenarioObservation(missingDiagram),
  /must render every selected diagram/,
  'browser evidence must reject a missing selected diagram',
);

const failedResponse = validObservation();
failedResponse.failed_image_responses.push({
  url: 'https://durable-workflow.com/img/job-chaining/job-chaining-dark.svg',
  status: 503,
});
assert.throws(
  () => validateScenarioObservation(failedResponse),
  /diagram image HTTP errors/,
  'browser evidence must reject a failed image subresource response',
);

const failedDecode = validObservation();
failedDecode.diagrams[0].natural_width = 0;
assert.throws(
  () => validateScenarioObservation(failedDecode),
  /decode to a non-zero width/,
  'browser evidence must reject an image that did not decode',
);

const thirdPartySource = validObservation();
thirdPartySource.diagrams[0].same_origin = false;
assert.throws(
  () => validateScenarioObservation(thirdPartySource),
  /Durable Workflow delivery/,
  'browser evidence must reject a third-party selected diagram',
);

console.log('Job-chaining diagram browser regression checks passed');
