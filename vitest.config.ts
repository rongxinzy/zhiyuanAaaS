import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(repositoryRoot, 'src/ui'),
    },
  },
  test: {
    root: repositoryRoot,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
