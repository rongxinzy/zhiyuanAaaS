import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));
const securityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self' ws: wss:",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
  ].join('; '),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export default defineConfig({
  root: path.resolve(repositoryRoot, 'src/admin'),
  base: './',
  plugins: [tailwindcss(), react()],
  resolve: { alias: { '@': path.resolve(repositoryRoot, 'src/ui') } },
  build: { outDir: path.resolve(repositoryRoot, 'dist/admin'), emptyOutDir: true, sourcemap: false, target: 'chrome130' },
  server: {
    headers: securityHeaders,
    proxy: {
      '/aep': {
        target: process.env.ZHIYUAN_AEP_BASE_URL ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  preview: { headers: securityHeaders },
});
