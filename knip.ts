import type { KnipConfig } from 'knip';

/** Tailwind v4 is pulled from CSS @import; Knip does not parse CSS without a compiler. */
function compileCss(source: string): string {
  const specifiers = new Set<string>();
  for (const match of source.matchAll(/@(?:import|plugin)\s+['"]([^'"]+)['"]/g)) {
    specifiers.add(match[1]);
  }
  return [...specifiers].map((specifier) => `import '${specifier}';`).join('\n');
}

const config: KnipConfig = {
  compilers: {
    css: compileCss,
  },
  entry: [
    'src/admin/main.tsx',
    'vite.admin.config.ts',
    'vitest.config.ts',
    // Node gate scripts loaded by CI via require(), not static imports.
    '.github/ci-results.cjs',
    '.github/devops-gate.cjs',
    'scripts/**/*.mjs',
    'scripts/check-large-files.mjs',
    // Manual screenshot harness (docs/screenshots/gateway-user-filters).
    'scripts/verify-gateway-user-filters-browser.mjs',
  ],
  project: [
    'src/admin/**/*.{ts,tsx,css}',
    'scripts/**/*.{mjs,ts}',
    'vite.admin.config.ts',
    'vitest.config.ts',
    '.github/*.{cjs,py}',
  ],
  ignore: [
    // Type-only shim for vite.admin.config.ts; runtime is admin-gateway-proxy.mjs.
    'scripts/admin-gateway-proxy.d.mts',
  ],
  vitest: {
    entry: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'scripts/**/*.{test,spec}.mjs',
      '.github/**/*.test.cjs',
    ],
  },
};

export default config;
