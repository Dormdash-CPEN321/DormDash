const fs = require('fs');
const path = require('path');

function updateTestScripts() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  // Scan test directories
  const mockDir = 'tests/with-mocks';
  const nomockDir = 'tests/no-mocks';

  const mockFiles = fs.existsSync(mockDir) ?
    fs.readdirSync(mockDir)
      .filter(f => f.endsWith('.routes.test.ts'))
      .map(f => f.replace('.routes.test.ts', '')) : [];

  const nomockFiles = fs.existsSync(nomockDir) ?
    fs.readdirSync(nomockDir)
      .filter(f => f.endsWith('.routes.test.ts'))
      .map(f => f.replace('.routes.test.ts', '')) : [];

  // Base scripts
  const scripts = {
    "test": "jest",
    "test:coverage": "jest --coverage",
    "test:coverage:watch": "jest --coverage --watch",
    "test:mock": "node test-runner.js",
    "test:nomock": "node test-runner.js",
    "test:mock:coverage": "node test-runner.js",
    "test:nomock:coverage": "node test-runner.js"
  };

  // Add specific file scripts
  mockFiles.forEach(filename => {
    scripts[`test:mock:${filename}`] = "node test-runner.js";
    scripts[`test:mock:${filename}:coverage`] = "node test-runner.js";
  });

  nomockFiles.forEach(filename => {
    scripts[`test:nomock:${filename}`] = "node test-runner.js";
    scripts[`test:nomock:${filename}:coverage`] = "node test-runner.js";
  });

  // Keep existing non-test scripts
  const existingScripts = packageJson.scripts || {};
  Object.keys(existingScripts).forEach(key => {
    if (!key.startsWith('test:') && !key.startsWith('build') && !key.startsWith('start') && !key.startsWith('dev') && !key.startsWith('seed') && !key.startsWith('format')) {
      scripts[key] = existingScripts[key];
    }
  });

  // Add back the non-test scripts
  scripts["build"] = existingScripts["build"] || "tsc";
  scripts["start"] = existingScripts["start"] || "node dist/index.js";
  scripts["dev"] = existingScripts["dev"] || "nodemon --exec ts-node src/index.ts";
  scripts["seed-jobs"] = existingScripts["seed-jobs"] || "node scripts/seed-test-jobs.js";
  scripts["seed-jobs:ts"] = existingScripts["seed-jobs:ts"] || "ts-node scripts/seed-test-jobs.ts";
  scripts["format"] = existingScripts["format"] || "prettier --check \"src/**/*.{ts,js,json}\"";
  scripts["format:fix"] = existingScripts["format:fix"] || "prettier --write \"src/**/*.{ts,js,json}\"";
  scripts["test:file"] = existingScripts["test:file"] || "jest $npm_config_file";
  scripts["test:file:coverage"] = existingScripts["test:file:coverage"] || "jest $npm_config_file --coverage";

  packageJson.scripts = scripts;

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('Updated test scripts in package.json');
  console.log(`Found ${mockFiles.length} mock test files: ${mockFiles.join(', ')}`);
  console.log(`Found ${nomockFiles.length} nomock test files: ${nomockFiles.join(', ')}`);
}

if (require.main === module) {
  updateTestScripts();
}