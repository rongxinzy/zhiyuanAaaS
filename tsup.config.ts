import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { extension: 'src/extension.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  outExtension: () => ({ js: '.cjs' }),
  clean: true,
  bundle: true,
  noExternal: ['@aep/sdk-node'],
  external: ['electron'],
  splitting: false,
  sourcemap: true,
  minify: false,
  dts: false,
});
