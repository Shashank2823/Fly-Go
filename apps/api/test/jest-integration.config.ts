import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  roots: ['<rootDir>/test/integration'],
  testRegex: '.*\\.int-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/integration/support/global-setup.ts',
  setupFiles: ['<rootDir>/test/integration/support/setup-env.ts'],
  testTimeout: 30_000,
  maxWorkers: 1,
};

export default config;
