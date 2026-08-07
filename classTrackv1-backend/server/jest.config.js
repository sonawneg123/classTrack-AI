/**
 * server/jest.config.js
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverage: false,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/logs/', '/uploads/'],
  // Give each test file its own env variables so they don't need a real DB
  setupFiles: ['./tests/setup.js'],
  testTimeout: 15000,
  verbose: true,
};
