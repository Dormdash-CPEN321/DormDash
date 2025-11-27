const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const event = process.env.npm_lifecycle_event;
const parts = event.split(':');

if (parts.length < 2 || parts[0] !== 'test') {
  console.error('Invalid script name');
  process.exit(1);
}

const type = parts[1]; // 'mock' or 'nomock'
const isCoverage = parts[parts.length - 1] === 'coverage';
const filename = parts.length === (isCoverage ? 4 : 3) ? parts[2] : null;

let dir, jestCommand;

if (type === 'mock') {
  dir = 'tests/with-mocks/';
} else if (type === 'nomock') {
  dir = 'tests/no-mocks/';
} else {
  console.error('Invalid type. Use "mock" or "nomock"');
  process.exit(1);
}

if (filename) {
  // Specific file
  const filePath = path.join(dir, `${filename}.routes.test.ts`);
  if (!fs.existsSync(filePath)) {
    console.error(`Test file not found: ${filePath}`);
    console.error(`Available test files in ${dir}:`);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));
    files.forEach(file => console.error(`  - ${file.replace('.routes.test.ts', '')}`));
    process.exit(1);
  }
  jestCommand = `jest ${filePath}`;
} else {
  // All files in directory
  jestCommand = `jest ${dir}`;
}

if (isCoverage) {
  jestCommand += ' --coverage';
}

console.log(`Running: ${jestCommand}`);
try {
  execSync(jestCommand, { stdio: 'inherit' });
} catch (error) {
  // Jest will have already printed the output, so we just exit with the same code
  process.exit(error.status || 1);
}