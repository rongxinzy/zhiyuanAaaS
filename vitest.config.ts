import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    setupFiles: ['src/admin/test-setup.ts'],
    root: repositoryRoot,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.mjs'],
    // antd-driven integration tests run well past the 5s default once
    // coverage instrumentation slows rendering; the ceiling only bounds
    // hangs, fast suites are unaffected. The split events-page suites add
    // jsdom files that run beside the heaviest chart test, which needs more
    // than 30s under `npm run test:coverage` on a 20-core machine.
    testTimeout: 60_000,
    // Coverage is optional locally (`npm run test:coverage`); PR CI runs `npm test` only.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/admin/test-setup.ts'],
    },
  },
});
