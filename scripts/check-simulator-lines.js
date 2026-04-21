const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const checks = [
  {
    name: 'QuerySimulator',
    file: 'src/components/QuerySimulator/index.js',
    markers: [
      "$this->ready = await('ready') === true",
      '#[QueryMethod]',
      'return $this->ready;',
    ],
    forbidden: [
      /setCurrentLine\(\d+\)/,
      /lineNumber\s*>=\s*\d+/,
    ],
  },
  {
    name: 'SignalSimulator',
    file: 'src/components/SignalSimulator/index.js',
    markers: [
      "await('ready')",
    ],
    forbidden: [
      /\{\s*line:\s*\d+/,
    ],
  },
];

function extractDefaultCode(source, name) {
  const match = source.match(/code = `([\s\S]*?)`,\n\s*(?:steps|title)\s*=/);

  if (!match) {
    throw new Error(`${name}: default code snippet was not found`);
  }

  return match[1];
}

let failed = false;

for (const check of checks) {
  const source = fs.readFileSync(path.join(root, check.file), 'utf8');
  const defaultCode = extractDefaultCode(source, check.name);

  for (const marker of check.markers) {
    if (!defaultCode.includes(marker)) {
      console.error(`${check.name}: default snippet no longer contains marker ${JSON.stringify(marker)}`);
      failed = true;
    }
  }

  for (const pattern of check.forbidden) {
    if (pattern.test(source)) {
      console.error(`${check.name}: found stale hard-coded simulator line reference ${pattern}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
