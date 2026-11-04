const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// The site serves durable-workflow.com/install.sh and /install.ps1. They must
// stay byte-identical to the CLI repository's installers at the recorded
// source commit, so a site copy cannot silently drift from the reviewed CLI
// installer (for example, losing its attestation signer pin).
const root = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'installer-source.json'), 'utf8'));

test('the installer source names a CLI commit', () => {
  assert.equal(source.source_repository, 'durable-workflow/cli');
  assert.match(source.source_commit, /^[0-9a-f]{40}$/);
});

for (const [file, entry] of Object.entries(source.files)) {
  test(`${file} matches ${source.source_repository}@${source.source_commit.slice(0, 8)}:${entry.source_path}`, () => {
    const bytes = fs.readFileSync(path.join(root, file));
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(actual, entry.sha256,
      `${file} differs from the recorded CLI installer. Copy ${entry.source_path} from ` +
      `${source.source_repository} byte for byte and update scripts/installer-source.json.`);
  });
}

test('both public installers are pinned', () => {
  assert.deepEqual(Object.keys(source.files).sort(), ['static/install.ps1', 'static/install.sh']);
});
