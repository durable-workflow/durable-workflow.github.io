const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'static/install-sdk.sh'), 'utf8');
const {artifacts} = JSON.parse(fs.readFileSync(path.join(root, 'static/stable-releases.json'), 'utf8'));

const major = version => Number.parseInt(String(version).split('.')[0], 10);

// Each installer line must resolve inside the selected stable major, so a new
// major release cannot leave the published installer on an old line.
const constraints = [
  ['sdk-php', /'durable-workflow\/sdk:\^(\d+)(?:\.\d+)*'/],
  ['workflow', /'durable-workflow\/workflow:\^(\d+)(?:\.\d+)*'/],
  ['waterline', /'durable-workflow\/waterline:\^(\d+)(?:\.\d+)*'/],
  ['sdk-python', /'durable-workflow>=(\d+)(?:\.\d+)*,<\d+'/],
  ['sdk-rust', /'durable-workflow@(\d+)(?:\.\d+)*'/],
];

for (const [artifact, pattern] of constraints) {
  test(`install-sdk.sh ${artifact} constraint matches the stable major`, () => {
    const match = pattern.exec(script);
    assert.ok(match, `install-sdk.sh has no ${artifact} constraint matching ${pattern}`);
    assert.equal(Number.parseInt(match[1], 10), major(artifacts[artifact]),
      `install-sdk.sh installs ${artifact} major ${match[1]}, but the stable release is ${artifacts[artifact]}`);
  });
}

test('the python upper bound is the next major', () => {
  const match = /'durable-workflow>=(\d+),<(\d+)'/.exec(script);
  assert.ok(match);
  assert.equal(Number.parseInt(match[2], 10), Number.parseInt(match[1], 10) + 1);
});
