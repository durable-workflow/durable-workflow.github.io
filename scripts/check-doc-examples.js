const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..', 'docs');
const contractPath = path.join(__dirname, 'doc-examples-contract.json');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function markerPattern(id) {
  return new RegExp(`<!--\\s*docs-example\\s+id=["']${escapeRegExp(id)}["']\\s*-->\\s*\\n\\s*\`\`\`([A-Za-z0-9_-]+)?\\n([\\s\\S]*?)\\n\\s*\`\`\``, 'm');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertIncludes(content, expected, context) {
  if (!content.includes(expected)) {
    throw new Error(`${context} must include ${JSON.stringify(expected)}`);
  }
}

function parseJsonBlock(block, context) {
  try {
    return JSON.parse(block);
  } catch (error) {
    throw new Error(`${context} must contain valid JSON: ${error.message}`);
  }
}

function parseEmbeddedJson(block, token, context) {
  const pattern = new RegExp(`${escapeRegExp(token)}\\s+'([\\s\\S]*?)'`);
  const match = block.match(pattern);

  if (!match) {
    throw new Error(`${context} must include a single-quoted JSON payload after ${JSON.stringify(token)}`);
  }

  return parseJsonBlock(match[1], context);
}

function assertJsonKeys(payload, keys, context) {
  for (const key of keys || []) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      throw new Error(`${context} JSON must include key ${JSON.stringify(key)}`);
    }
  }
}

function checkExample(example) {
  const docPath = path.join(docsDir, example.path);
  const context = `docs/${example.path}#${example.id}`;

  if (!fs.existsSync(docPath)) {
    throw new Error(`${context} references a missing document`);
  }

  const content = read(docPath);
  const match = content.match(markerPattern(example.id));

  if (!match) {
    throw new Error(`${context} is missing a docs-example marker followed by a fenced block`);
  }

  const language = match[1] || '';
  const block = match[2];

  if (language !== example.language) {
    throw new Error(`${context} must be a ${example.language} fenced block; found ${language || 'untyped'}`);
  }

  for (const expected of example.requiredSubstrings || []) {
    assertIncludes(block, expected, context);
  }

  if (example.language === 'json') {
    assertJsonKeys(parseJsonBlock(block, context), example.requiredJsonKeys, context);
  }

  if (example.embeddedJsonAfter) {
    assertJsonKeys(
      parseEmbeddedJson(block, example.embeddedJsonAfter, context),
      example.requiredJsonKeys,
      context
    );
  }
}

function main() {
  const contract = JSON.parse(read(contractPath));

  for (const example of contract.examples || []) {
    checkExample(example);
  }

  console.log(`Doc example checks passed for ${contract.examples.length} examples`);
}

main();
