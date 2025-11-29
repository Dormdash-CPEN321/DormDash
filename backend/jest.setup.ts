// This setup file runs before all tests to suppress console output from dotenv and other sources

// Store original console methods
const originalConsole = {
  log: console.log,
  warn: console.warn,
  info: console.info,
  error: console.error,
  debug: console.debug,
};

// Suppress all console output before any module loading happens
console.log = jest.fn();
console.warn = jest.fn();
console.info = jest.fn();
console.error = jest.fn();
console.debug = jest.fn();

// Export originals in case tests need them
export { originalConsole };
