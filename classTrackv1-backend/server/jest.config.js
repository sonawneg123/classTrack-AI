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
  // This project is pure CommonJS — no Babel transpilation is needed.
  // We use babel-jest with an empty inline config (no presets) so that:
  //   1. jest.mock() calls are hoisted correctly (babel-jest does this)
  //   2. @babel/core does NOT look for a babel.config.js on disk, which
  //      would throw "Cannot find module babel.config.js" on any test file
  //      that loads a module containing a dynamic import() expression
  //      (e.g. LocalEmbeddingProvider.js → @xenova/transformers).
  //
  //  `configFile: false` — do not probe the filesystem for a config file.
  //  `babelrc: false`    — do not probe .babelrc files.
  //  `plugins: [...]`    — hoist jest.mock() calls (the only thing we need).
  transform: {
    '^.+\\.js$': [
      'babel-jest',
      {
        configFile: false,
        babelrc: false,
        plugins: ['babel-plugin-jest-hoist'],
      },
    ],
  },
};
