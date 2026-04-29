const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..', 'docs');
const contractPath = path.join(__dirname, 'reference-docs-contract.json');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function normalize(value) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function assertIncludes(content, expected, context) {
  if (!normalize(content).includes(normalize(expected))) {
    throw new Error(`${context} must include ${JSON.stringify(expected)}`);
  }
}

function assertHeading(content, heading, context) {
  const pattern = new RegExp(`^#{2,4}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');

  if (!pattern.test(content)) {
    throw new Error(`${context} must include heading ${JSON.stringify(heading)}`);
  }
}

function assertCodeFenceCount(content, minimum, context) {
  const count = (content.match(/```/g) || []).length / 2;

  if (count < minimum) {
    throw new Error(`${context} must include at least ${minimum} fenced examples; found ${count}`);
  }
}

function assertCliCommand(content, command, context) {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\`${escaped}(?:\\s|<|\\[|--|\`|$)`);

  if (!pattern.test(content)) {
    throw new Error(`${context} must document command ${JSON.stringify(command)}`);
  }
}

function assertPythonMethod(content, method, context) {
  if (!content.includes(method)) {
    throw new Error(`${context} must document Python API ${JSON.stringify(method)}`);
  }
}

function assertEndpoint(content, endpoint, context) {
  if (!content.includes(endpoint)) {
    throw new Error(`${context} must document endpoint ${JSON.stringify(endpoint)}`);
  }
}

function extractSection(content, heading, context) {
  const lines = content.split('\n');
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingPattern = new RegExp(`^(#{2,4})\\s+${escaped}\\s*$`);

  let start = -1;
  let level = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const match = headingPattern.exec(lines[index]);

    if (!match) {
      continue;
    }

    start = index + 1;
    level = match[1].length;
    break;
  }

  if (start === -1) {
    throw new Error(`${context} must include heading ${JSON.stringify(heading)}`);
  }

  const nextHeadingPattern = new RegExp(`^#{1,${level}}\\s+`);
  let end = lines.length;

  for (let index = start; index < lines.length; index += 1) {
    if (nextHeadingPattern.test(lines[index])) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

function assertSectionTerms(content, requirement, context) {
  const sectionContext = `${context} section ${JSON.stringify(requirement.heading)}`;
  const sectionContent = extractSection(content, requirement.heading, context);

  for (const term of requirement.terms || []) {
    assertIncludes(sectionContent, term, sectionContext);
  }
}

function checkDocument(document) {
  const docPath = path.join(docsDir, document.path);

  if (!fs.existsSync(docPath)) {
    throw new Error(`Reference document is missing: docs/${document.path}`);
  }

  const content = read(docPath);
  const context = `docs/${document.path}`;

  assertIncludes(content, `# ${document.title}`, context);
  assertCodeFenceCount(content, document.minimumCodeFences ?? 1, context);

  for (const heading of document.requiredHeadings || []) {
    assertHeading(content, heading, context);
  }

  for (const requirement of document.requiredSectionTerms || []) {
    assertSectionTerms(content, requirement, context);
  }

  for (const term of document.requiredTerms || []) {
    assertIncludes(content, term, context);
  }

  for (const command of document.requiredCommands || []) {
    assertCliCommand(content, command, context);
  }

  for (const method of document.requiredMethods || []) {
    assertPythonMethod(content, method, context);
  }

  for (const endpoint of document.requiredEndpoints || []) {
    assertEndpoint(content, endpoint, context);
  }
}

function main() {
  const contract = JSON.parse(read(contractPath));

  for (const document of contract.documents || []) {
    checkDocument(document);
  }

  console.log(`Reference docs checks passed for ${contract.documents.length} documents`);
}

main();
