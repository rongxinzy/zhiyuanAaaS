import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(repositoryRoot, 'src/admin'),
  base: './',
  plugins: [tailwindcss(), react()],
  resolve: { alias: { '@': path.resolve(repositoryRoot, 'src/ui') } },
  build: { outDir: path.resolve(repositoryRoot, 'dist/admin'), emptyOutDir: true, sourcemap: true, target: 'chrome130' },
  server: {
    proxy: {
      '/aep': {
        target: process.env.ZHIYUAN_AEP_BASE_URL ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
