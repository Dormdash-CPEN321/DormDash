# Test Scripts

This project uses a dynamic test script system that automatically generates npm scripts based on test files in the `tests/` directory.

## Available Commands

### Directory-based testing
- `npm run test:mock` - Run all tests in `tests/with-mocks/`
- `npm run test:nomock` - Run all tests in `tests/no-mocks/`
- `npm run test:mock:coverage` - Run all mock tests with coverage
- `npm run test:nomock:coverage` - Run all nomock tests with coverage

### File-based testing
- `npm run test:mock:<filename>` - Run specific mock test file
- `npm run test:nomock:<filename>` - Run specific nomock test file
- `npm run test:mock:<filename>:coverage` - Run specific mock test with coverage
- `npm run test:nomock:<filename>:coverage` - Run specific nomock test with coverage

### Examples
```bash
# Run all mock tests
npm run test:mock

# Run all mock tests with coverage
npm run test:mock:coverage

# Run specific test files
npm run test:mock:order
npm run test:nomock:user:coverage
npm run test:mock:payment

# Legacy file-based testing
npm run test:file --file=tests/with-mocks/order.routes.test.ts
```

## Adding New Test Files

When you add new test files to `tests/with-mocks/` or `tests/no-mocks/`, run:

```bash
npm run update-test-scripts
```

This will automatically generate the corresponding npm scripts for your new test files.

## Current Test Files

**Mock tests (`tests/with-mocks/`):**
- order.routes.test.ts
- payment.routes.test.ts

**No-mock tests (`tests/no-mocks/`):**
- order.routes.test.ts
- payment.routes.test.ts
- routePlanner.routes.test.ts
- user.routes.test.ts