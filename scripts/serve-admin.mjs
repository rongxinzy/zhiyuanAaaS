import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/admin');
const proxyTargets = Object.freeze([
  Object.freeze({ prefix: '/aep/', target: new URL(process.env.ZHIYUAN_AEP_BASE_URL ?? 'http://localhost:8080') }),
  // Digital-employee portal APIs, same-origin like /aep (no CORS, CSP stays 'self').
  Object.freeze({ prefix: '/api/', target: new URL(process.env.ZHIYUAN_PORTAL_BASE_URL ?? 'http://localhost:30190') }),
]);
const port = Number(process.env.ZHIYUAN_ADMIN_PORT ?? 5173);
const securityHeaders = Object.freeze({
  'content-security-policy': [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
  ].join('; '),
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
});

const server = http.createServer(async (request, response) => {
  for (const [name, value] of Object.entries(securityHeaders)) {
    response.setHeader(name, value);
  }
  try {
    const route = proxyTargets.find((candidate) => request.url?.startsWith(candidate.prefix));
    if (route) {
      await proxy(request, response, route.target);
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const body = await fs.readFile(file).catch(() => fs.readFile(path.join(root, 'index.html')));
    response.writeHead(200, { 'content-type': contentType(file) }).end(body);
  } catch {
    response.writeHead(502).end('Bad gateway');
  }
});

// Default loopback matches the local dev flow; containers set
// ZHIYUAN_ADMIN_HOST=0.0.0.0 so the NodePort service can reach the server.
const host = process.env.ZHIYUAN_ADMIN_HOST ?? '127.0.0.1';
server.listen(port, host, () => {
  console.log(`Zhiyuan Admin Console: http://${host}:${port}`);
});

async function proxy(request, response, target) {
  const upstream = new URL(request.url, target);
  const headers = { ...request.headers, host: upstream.host };
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : request;
  const result = await fetch(upstream, { method: request.method, headers, body, duplex: body ? 'half' : undefined });
  // Multiple Set-Cookie headers (portal session + csrf) collapse into one
  // comma-joined entry through Object.fromEntries — the browser would drop
  // every cookie after the first. Undici exposes them properly via
  // getSetCookie(); re-emit them as a real header array.
  const forwarded = { ...Object.fromEntries(result.headers), ...securityHeaders };
  delete forwarded['set-cookie'];
  const setCookies = result.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    response.setHeader('set-cookie', setCookies);
  }
  response.writeHead(result.status, forwarded);
  response.end(Buffer.from(await result.arrayBuffer()));
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.map')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}
