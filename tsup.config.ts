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
  // The packaged extension is loaded from resources/zhiyuan-enterprise and
  // has no access to the AaaS node_modules tree. Keep runtime ZIP parsing
  // self-contained alongside the SDK bundle.
  noExternal: ['@aep/sdk-node', 'yauzl'],
  external: ['electron'],
  splitting: false,
  sourcemap: true,
  minify: false,
  dts: false,
});
